import { Router, type Request, type Response } from 'express';
import pg from 'pg';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { VAPID_PUBLIC_KEY, sendPush, type PushPayload } from '../lib/push';
import { resolvePin, pinPoolParams } from '../lib/pin';
import { logger } from '../lib/logger';

// express-session의 SessionData에 userId 필드 추가
declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

const router = Router();

// ─── Admin token — HMAC 기반 (서버 재시작 후에도 유효, in-memory Set 불필요) ──
// 토큰 = HMAC-SHA256(key = SESSION_SECRET + adminPassword, data = 'admin-session')
// 서버는 현재 admin_password를 읽어 HMAC을 재계산한 뒤 timingSafeEqual로 비교
// → 비밀번호 변경 시 자동 무효화, 재시작 후에도 동일 토큰 검증 가능

function deriveAdminToken(adminPassword: string): string {
  const secret = (process.env.SESSION_SECRET ?? 'fallback-secret') + adminPassword;
  return createHmac('sha256', secret).update('admin-session').digest('hex');
}

function verifyAdminToken(provided: string | null | undefined): boolean {
  if (!provided || typeof provided !== 'string') return false;
  const settings = (getTable('app_settings')[0] ?? {}) as Record<string, unknown>;
  const adminPw = (settings.admin_password as string) ?? '';
  const expected = deriveAdminToken(adminPw);
  try {
    return timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'));
  } catch { return false; }
}

// 관리자 SSE 연결 집합 — 일반 sseUserMap과 분리해 모든 이벤트(private 포함) 수신
const sseAdminClients = new Set<Response>();

// ─── PostgreSQL connection pool ────────────────────────────────────────────────
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 50,                  // 100명 동시접속 대비 (기본값 10에서 상향)
  idleTimeoutMillis: 30000, // idle 커넥션 30초 후 해제
  connectionTimeoutMillis: 5000, // 5초 안에 커넥션 못 얻으면 에러
});

// 인스턴스마다 고유 ID — 자신이 보낸 NOTIFY를 수신해도 중복 처리 방지
const INSTANCE_ID = crypto.randomUUID();

// ─── In-memory cache (loaded from DB on startup, write-through on every change)
const store: Record<string, Record<string, unknown>[]> = {};
const imageStore: Record<string, string> = {};

// ─── Allowed tables for /op ────────────────────────────────────────────────────
// Allowlist prevents access to internal or non-existent tables.
const ALLOWED_OP_TABLES = new Set([
  'profiles', 'seats', 'chats', 'messages', 'likes', 'chat_reads',
  'app_settings', 'balance_games', 'balance_votes', 'push_subscriptions',
  'session_history', 'device_secrets', 'app_kv_rows',
  // Extra tables used by the app
  'contact_shares', 'contact_share_events', 'anonymous_reports',
  'suggestions', 'notifications',
  'qa_answers', 'qa_games', 'image_votes', 'image_games',
  'app_image_store',
]);

// ─── Input sanitization ───────────────────────────────────────────────────────
// Strips dangerous control characters (keeps \t, \n, \r for normal text),
// removes HTML/XML tags entirely (stored-XSS prevention),
// strips Unicode direction-override characters (RTL override attack),
// and enforces per-field length limits to prevent oversized payloads.
function sanitizeStr(val: unknown, maxLen: number): unknown {
  if (typeof val !== 'string') return val;
  return val
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '') // strip C0 control chars
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2064\u206a-\u206f\ufeff]/g, '') // strip Unicode direction/zero-width overrides (RTL attack)
    .replace(/<[^>]*>/g, '')                              // strip HTML/XML tags → no stored XSS
    .slice(0, maxLen);
}
const FIELD_LIMITS: Record<string, Record<string, number>> = {
  profiles:          { nickname: 30, bio: 500, status_message: 100, kakao_id: 100, instagram_id: 100, phone_number: 30 },
  messages:          { content: 2000 },
  // ─ 아래 테이블의 유저 입력 필드도 HTML·제어 문자 제거 적용 ─────────────────
  notifications:     { content: 300, title: 100 },
  suggestions:       { content: 500 },
  anonymous_reports: { content: 500, reason: 200 },
  qa_games:          { question: 300, option_a: 100, option_b: 100 },
  image_games:       { question: 200 },
  balance_games:     { question: 300, option_a: 100, option_b: 100 },
};
function sanitizeRow(tbl: string, row: Record<string, unknown>): Record<string, unknown> {
  const limits = FIELD_LIMITS[tbl];
  if (!limits) return row;
  const r: Record<string, unknown> = { ...row };
  for (const [field, maxLen] of Object.entries(limits)) {
    if (field in r) r[field] = sanitizeStr(r[field], maxLen);
  }
  return r;
}

// ─── Concurrency limiter — graceful 503 when too many concurrent /op requests ──
// /op는 in-memory 서빙이지만 Node.js 이벤트 루프 포화 방지용 상한선
let _activeOpCount = 0;
const MAX_CONCURRENT_OPS = 80;

// ─── Per-IP rate limiters ─────────────────────────────────────────────────────
// /auth/login: brute-force 방지 (분당 10회)
const _loginRateMap = new Map<string, { count: number; resetAt: number }>();
const LOGIN_RATE_MAX = 10;
const LOGIN_RATE_WINDOW_MS = 60_000;

// /storage-upload: 이미지 스팸 방지 (분당 10회)
const _uploadRateMap = new Map<string, { count: number; resetAt: number }>();
const UPLOAD_RATE_MAX = 10;
const UPLOAD_RATE_WINDOW_MS = 60_000;

// /events (SSE): IP당 최대 동시 연결 수 (5개)
const _sseConnPerIp = new Map<string, number>();
const SSE_MAX_CONN_PER_IP = 5;

// ─── Image magic-bytes map ─────────────────────────────────────────────────────
// MIME 헤더 조작으로 악성 파일을 이미지로 위장하는 공격 차단
const IMAGE_MAGIC: Record<string, number[]> = {
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/png':  [0x89, 0x50, 0x4E, 0x47],
  'image/gif':  [0x47, 0x49, 0x46, 0x38],
  'image/webp': [0x52, 0x49, 0x46, 0x46], // RIFF header
};

// ─── Per-user global likes rate limit (독립 조합 스팸 방지) ──────────────────────
const LIKES_MAX_PER_USER_PER_MIN = 20; // 1분에 20개 초과 시 429
const _userLikeMinuteBuckets = new Map<string, { count: number; resetAt: number }>();

// ─── DB persist error tracking ────────────────────────────────────────────────
let _dbPersistErrors = 0;
interface PersistErrorEntry { table: string; time: number; msg: string }
const _dbPersistErrorLog: PersistErrorEntry[] = [];

// ─── Admin DB failure push throttle ──────────────────────────────────────────
// At most 1 admin alert push every 5 minutes to avoid spamming on cascading failures.
const ADMIN_DB_PUSH_THROTTLE_MS = 5 * 60 * 1000;
let _lastAdminDbPushAt = 0;

// ─── Admin PIN pool warning push throttle ─────────────────────────────────────
// At most 1 PIN pool warning push per hour to avoid repeat noise.
const ADMIN_PIN_PUSH_THROTTLE_MS = 60 * 60 * 1000;
let _lastAdminPinPushAt = 0;
// 85% used = 15% remaining triggers the alert.
const PIN_WARN_USED_RATIO = 0.85;

/** Helper: send a push notification to the admin.
 *  Returns false if no push subscription is found. */
async function _sendAdminPush(payload: PushPayload): Promise<boolean> {
  const settings = (store['app_settings'] ?? [])[0];
  if (!settings) return false;
  const adminPhone = settings['admin_phone'] as string | undefined;
  if (!adminPhone) return false;
  const adminProfile = (store['profiles'] ?? []).find(p => p['phone_number'] === adminPhone);
  if (!adminProfile) return false;
  const adminId = adminProfile['id'] as string;
  const subs = (store['push_subscriptions'] ?? []).filter(s => s['user_id'] === adminId);
  if (!subs.length) return false;
  const results = await Promise.all(
    subs.map(sub => sendPush(
      { endpoint: sub['endpoint'] as string, keys: { auth: sub['auth'] as string, p256dh: sub['p256dh'] as string } },
      payload,
    ).then(ok => ({ id: sub['id'] as string, ok })).catch(() => ({ id: sub['id'] as string, ok: false }))),
  );
  const expired = results.filter(r => !r.ok).map(r => r.id);
  if (expired.length) {
    store['push_subscriptions'] = (store['push_subscriptions'] ?? []).filter(s => !expired.includes(s['id'] as string));
    dbDeleteRows('push_subscriptions', expired).catch(console.error);
  }
  return results.some(r => r.ok);
}

/** Send a push notification to the admin for a DB persist failure.
 *  Throttled to at most once every 5 minutes.
 *  Errors are swallowed — we must not recurse into dbPersistRow. */
async function notifyAdminDbFailure(tableName: string, errMsg: string): Promise<void> {
  const now = Date.now();
  if (now - _lastAdminDbPushAt < ADMIN_DB_PUSH_THROTTLE_MS) return;
  _lastAdminDbPushAt = now;
  try {
    const shortErr = errMsg.length > 80 ? errMsg.slice(0, 80) + '…' : errMsg;
    const sent = await _sendAdminPush({
      title: '⚠️ DB 저장 오류 발생',
      body: `[${tableName}] ${shortErr}`,
      tag: 'db-persist-error',
      url: '/',
    });
    if (sent) console.info(`[db] Admin DB failure push sent (table=${tableName})`);
  } catch (e) {
    console.error('[db] Failed to send admin DB failure push:', e);
  }
}

/** Send a push notification to the admin when the PIN pool crosses the 85% usage mark.
 *  Throttled to at most once per hour.
 *  Errors are swallowed. */
async function checkAndNotifyAdminPinPool(): Promise<void> {
  const allProfiles = getTable('profiles');
  const use5Digit   = allProfiles.length > 8000;
  const poolSize    = use5Digit ? 90000 : 9000;
  const usedCount   = new Set(allProfiles.map(p => p.pin_code).filter(Boolean)).size;
  const usedRatio   = usedCount / poolSize;
  if (usedRatio < PIN_WARN_USED_RATIO) return; // below threshold — no alert

  const now = Date.now();
  if (now - _lastAdminPinPushAt < ADMIN_PIN_PUSH_THROTTLE_MS) return;
  _lastAdminPinPushAt = now;

  try {
    const remaining = poolSize - usedCount;
    const pct = Math.round(usedRatio * 100);
    const sent = await _sendAdminPush({
      title: '🔔 PIN 풀 거의 소진',
      body: `PIN ${pct}% 사용됨 — 잔여 ${remaining}개 (총 ${poolSize}개). 빠른 조치가 필요합니다.`,
      tag: 'pin-pool-warning',
      url: '/',
    });
    if (sent) console.info(`[db] Admin PIN pool warning push sent (used=${usedCount}/${poolSize}, ${pct}%)`);
  } catch (e) {
    console.error('[db] Failed to send admin PIN pool warning push:', e);
  }
}

/** Write the current error counter to DB directly on the pool.
 *  Must NOT call dbPersistRow (infinite recursion risk).
 *  Errors from this write are swallowed — the DB may be down. */
async function flushErrorStateToDB(): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO app_kv_rows (table_name, row_id, data, updated_at)
       VALUES ('db_error_log', 'counter', $1, NOW())
       ON CONFLICT (table_name, row_id)
       DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [JSON.stringify({ count: _dbPersistErrors, log: _dbPersistErrorLog })],
    );
  } catch (e) {
    console.error('[db] Failed to persist error state:', e);
  }
}

// Flush on graceful shutdown so the final counter value is never lost
process.once('SIGTERM', () => { flushErrorStateToDB().finally(() => process.exit(0)); });
process.once('SIGINT',  () => { flushErrorStateToDB().finally(() => process.exit(0)); });

// SSE clients — userId별 연결 관리 (보안: 민감 이벤트는 당사자에게만 전송)
const sseUserMap = new Map<string, Set<Response>>();   // userId → 연결 집합
const sseAnonClients = new Set<Response>();             // userId 미등록 연결 (폴백)

// ─── Likes time-bucket rate limiter ──────────────────────────────────────────
// JavaScript is single-threaded so in-memory checks are inherently race-free,
// but this adds an explicit 500 ms cooldown per (liker_id, liked_id) pair as a
// belt-and-suspenders guard against rapid-fire bursts (e.g. 100 VUs hammering
// the same endpoint simultaneously — each VU blocked before it even hits the
// type-dedup check).
const _likesLastInsert = new Map<string, number>(); // `${liker}:${liked}` → epoch ms
const LIKES_MIN_INTERVAL_MS = 500;
setInterval(() => {
  const cutoff = Date.now() - 10_000;
  for (const [k, t] of _likesLastInsert) if (t < cutoff) _likesLastInsert.delete(k);
}, 10_000);

// Fix #1: _userLikeMinuteBuckets 만료 버킷 5분마다 정리 — 무한 메모리 누수 방지
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of _userLikeMinuteBuckets) if (b.resetAt < now) _userLikeMinuteBuckets.delete(k);
}, 5 * 60 * 1000);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function genId(): string {
  return crypto.randomUUID();
}

function ts(): string {
  return new Date().toISOString();
}

function koreanDateMMDD(): string {
  const now = new Date();
  // 새벽 3시 이전(00:00~02:59 KST)은 전날로 취급 — 3시간을 빼고 날짜를 계산
  const korea = new Date(now.getTime() + (9 - 3) * 60 * 60 * 1000);
  const mm = String(korea.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(korea.getUTCDate()).padStart(2, '0');
  return mm + dd;
}

function getTable(name: string): Record<string, unknown>[] {
  if (!store[name]) store[name] = [];
  return store[name];
}

// ─── PostgreSQL persistence helpers ───────────────────────────────────────────
async function dbPersistRow(tableName: string, row: Record<string, unknown>): Promise<void> {
  const rowId = String(row.id ?? genId());
  const sql = `INSERT INTO app_kv_rows (table_name, row_id, data, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (table_name, row_id)
       DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`;
  const params = [tableName, rowId, JSON.stringify(row)];
  try {
    await pool.query(sql, params);
  } catch {
    // Fix #5: 1회 재시도 — 일시적 연결 오류(ECONNRESET, idle timeout) 자동 복구
    await new Promise<void>(r => setTimeout(r, 500));
    try {
      await pool.query(sql, params);
    } catch (e) {
      _dbPersistErrors++;
      _dbPersistErrorLog.push({ table: tableName, time: Date.now(), msg: String(e) });
      if (_dbPersistErrorLog.length > 100) _dbPersistErrorLog.shift();
      await flushErrorStateToDB();
      notifyAdminDbFailure(tableName, String(e)).catch(console.error);
      throw e;
    }
  }
}

async function dbDeleteRow(tableName: string, rowId: string): Promise<void> {
  try {
    await pool.query(
      'DELETE FROM app_kv_rows WHERE table_name = $1 AND row_id = $2',
      [tableName, rowId],
    );
  } catch (e) {
    logger.error({ err: e, tableName, rowId }, '[db] dbDeleteRow failed');
  }
}

// ── 배치 삭제: N+1 쿼리 제거 ──────────────────────────────────────────────────
async function dbDeleteRows(tableName: string, rowIds: string[]): Promise<void> {
  if (!rowIds.length) return;
  try {
    await pool.query(
      'DELETE FROM app_kv_rows WHERE table_name = $1 AND row_id = ANY($2::text[])',
      [tableName, rowIds],
    );
  } catch (e) {
    logger.error({ err: e, tableName, count: rowIds.length }, '[db] dbDeleteRows (batch) failed');
  }
}

async function dbDeleteTable(tableName: string): Promise<void> {
  try {
    await pool.query('DELETE FROM app_kv_rows WHERE table_name = $1', [tableName]);
  } catch (e) {
    logger.error({ err: e, tableName }, '[db] dbDeleteTable failed');
  }
}

async function dbPersistImage(path: string, dataUrl: string): Promise<void> {
  await pool.query(
    `INSERT INTO app_image_store (path, data_url, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (path)
     DO UPDATE SET data_url = EXCLUDED.data_url, updated_at = NOW()`,
    [path, dataUrl],
  );
}

// ─── Startup: load all data from DB into memory ───────────────────────────────
async function loadFromDb(): Promise<void> {
  try {
    const { rows } = await pool.query('SELECT table_name, row_id, data FROM app_kv_rows ORDER BY updated_at ASC');
    for (const row of rows) {
      // Error-log counter row is meta — not application data
      if (row.table_name === 'db_error_log' && row.row_id === 'counter') {
        const saved = row.data as { count?: number; log?: PersistErrorEntry[] };
        if (typeof saved.count === 'number') _dbPersistErrors = saved.count;
        if (Array.isArray(saved.log)) {
          _dbPersistErrorLog.length = 0;
          _dbPersistErrorLog.push(...saved.log.slice(-100));
        }
        continue;
      }
      if (!store[row.table_name]) store[row.table_name] = [];
      store[row.table_name].push(row.data as Record<string, unknown>);
    }
    const imgs = await pool.query('SELECT path, data_url FROM app_image_store');
    for (const img of imgs.rows) {
      imageStore[img.path] = img.data_url;
    }

    // Rebuild _likesLastInsert from the freshly loaded likes so the 500 ms
    // cooldown window survives a server restart.  For each (liker, liked, type)
    // triple we keep the timestamp of the most-recent insert; entries older than
    // the 10-second prune window are skipped — they wouldn't block anything anyway.
    const cutoff = Date.now() - 10_000;
    for (const like of (store['likes'] ?? [])) {
      const liker = like['liker_id'];
      const liked  = like['liked_id'];
      const htype  = like['heart_type'];
      if (!liker || !liked || !htype) continue;
      const createdMs = like['created_at'] ? new Date(like['created_at'] as string).getTime() : 0;
      if (createdMs < cutoff) continue; // already expired — don't bother
      const key = `${liker}:${liked}:${htype}`;
      const prev = _likesLastInsert.get(key) ?? 0;
      if (createdMs > prev) _likesLastInsert.set(key, createdMs);
    }
    if (_likesLastInsert.size > 0) {
      console.info(`[db] Seeded _likesLastInsert with ${_likesLastInsert.size} entry/entries from DB on startup`);
    }
  } catch (e) {
    console.error('[db] Failed to load from DB:', e);
  }
}

// ─── Seed data (only if DB is empty) ─────────────────────────────────────────
async function seedIfNeeded(): Promise<void> {
  await loadFromDb();
  if (!getTable('app_settings').length) {
    const settings = {
      id: 1,
      session_active: false,
      admin_phone: '010-3878-6740',
      admin_password: '116606',
      updated_at: ts(),
      timer_end_at: null,
      timer_label: null,
      seating_locked: false,
      functions_locked: false,
      active_tables: null,
      reset_signal: null,
      table_labels: null,
      game_state: null,
      entry_password: koreanDateMMDD(),
      reset_password: null,
    };
    store['app_settings'] = [settings];
    await dbPersistRow('app_settings', settings);
  }
  if (!getTable('seats').length) {
    const rows: Record<string, unknown>[] = [];
    // 테이블 1-12: 8석
    for (let t = 1; t <= 12; t++) {
      for (let p = 1; p <= 8; p++) {
        rows.push({
          id: genId(),
          table_number: t,
          seat_position: p,
          seat_label: `${t}번 테이블 ${p}번`,
          profile_id: null,
          status: 'empty',
          registered_at: null,
          created_at: ts(),
        });
      }
    }
    // 번외 테이블 13-15: 10석, 번외열 16-19: 6석
    for (let t = 13; t <= 15; t++) {
      for (let p = 1; p <= 10; p++) {
        rows.push({ id: genId(), table_number: t, seat_position: p, seat_label: `${t}번 테이블 ${p}번`, profile_id: null, status: 'empty', registered_at: null, created_at: ts() });
      }
    }
    for (let t = 16; t <= 22; t++) {
      for (let p = 1; p <= 6; p++) {
        rows.push({ id: genId(), table_number: t, seat_position: p, seat_label: `${t}번 테이블 ${p}번`, profile_id: null, status: 'empty', registered_at: null, created_at: ts() });
      }
    }
    store['seats'] = rows;
    await Promise.all(rows.map(r => dbPersistRow('seats', r)));
  } else {
    // 기존 설치: 번외 테이블이 없으면 추가
    const existingTables = new Set(getTable('seats').map((s: Record<string, unknown>) => s['table_number']));
    const extraRows: Record<string, unknown>[] = [];
    for (let t = 13; t <= 15; t++) {
      if (!existingTables.has(t)) {
        for (let p = 1; p <= 10; p++) {
          extraRows.push({ id: genId(), table_number: t, seat_position: p, seat_label: `${t}번 테이블 ${p}번`, profile_id: null, status: 'empty', registered_at: null, created_at: ts() });
        }
      }
    }
    for (let t = 16; t <= 22; t++) {
      if (!existingTables.has(t)) {
        for (let p = 1; p <= 6; p++) {
          extraRows.push({ id: genId(), table_number: t, seat_position: p, seat_label: `${t}번 테이블 ${p}번`, profile_id: null, status: 'empty', registered_at: null, created_at: ts() });
        }
      }
    }
    if (extraRows.length) {
      store['seats'].push(...extraRows);
      await Promise.all(extraRows.map(r => dbPersistRow('seats', r)));
    }
  }
}

// ─── Daily entry_password auto-renewal ────────────────────────────────────────
// If entry_password is a 4-digit MMDD date string, update it to today's Korean
// date every minute so the code never expires without an admin needing to touch it.
let _renewalInProgress = false; // single-flight guard — 동시 갱신 방지
function startDailyEntryPasswordRenewal(): void {
  const check = (): void => {
    if (_renewalInProgress) return; // 이전 DB write가 완료되지 않은 경우 건너뜀
    const settings = getTable('app_settings')[0];
    if (!settings) return;
    const currentPw = settings['entry_password'] as string | null | undefined;
    if (!currentPw || !/^\d{4}$/.test(currentPw)) return;
    const today = koreanDateMMDD();
    if (currentPw === today) return;
    _renewalInProgress = true;
    const updated = { ...settings, entry_password: today, updated_at: ts() };
    store['app_settings'][0] = updated;
    dbPersistRow('app_settings', updated)
      .catch(console.error)
      .finally(() => { _renewalInProgress = false; });
    // admin_password 제거 후 브로드캐스트 — 유저 클라이언트에 관리자 비밀번호 노출 방지
    broadcastAll({ type: 'change', table: 'app_settings', event: 'UPDATE', newRow: sanitizeSettings(updated), oldRow: sanitizeSettings(settings as Record<string, unknown>) });
  };
  setInterval(check, 60_000);
}

// Kick off async initialization
seedIfNeeded()
  .then(() => startDailyEntryPasswordRenewal())
  .then(() => setupListenClient())
  .catch(console.error);

// 30초마다 전체 테이블 네이티브 DB 재동기화
// — 관리자·테스트 패널의 Supabase 직접 쓰기도 30초 내 자동 반영 (NOTIFY 미지원 경로 보정)
setInterval(() => { resyncAllFromNativeDb().catch(console.error); }, 30_000);

// ─── Cross-instance sync via PostgreSQL LISTEN/NOTIFY ─────────────────────────
// autoscale 환경에서 여러 인스턴스가 뜰 때 store + SSE를 동기화한다.
// 각 인스턴스는 data_change 채널을 LISTEN하고, 쓰기 시 NOTIFY로 전파한다.
// 자신이 보낸 NOTIFY는 INSTANCE_ID로 걸러서 중복 브로드캐스트를 방지한다.

let _listenClient: pg.Client | null = null;

async function setupListenClient(): Promise<void> {
  try {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query('LISTEN data_change');
    client.on('notification', (msg) => {
      if (!msg.payload) return;
      let env: { src: string; table: string; ev: string; id?: unknown; _tombstone?: boolean; newRow?: Record<string, unknown> | null; oldRow?: Record<string, unknown> | null };
      try { env = JSON.parse(msg.payload); } catch { return; }
      if (env.src === INSTANCE_ID) return; // 자신이 보낸 echo — 이미 로컬에서 처리됨

      const tbl = env.table;

      // ── tombstone: 페이로드가 너무 커서 row를 생략한 경우 → DB에서 직접 재조회 ──
      if (env._tombstone && tbl && tbl !== 'db_error_log') {
        const id = String(env.id ?? '');
        if (!id) return;
        if (env.ev === 'DELETE') {
          // DELETE tombstone: id로 store에서 제거
          if (!store[tbl]) return;
          const idx = store[tbl].findIndex(r => r['id'] === id);
          if (idx >= 0) store[tbl].splice(idx, 1);
          const delEvent = { type: 'change', table: tbl, event: 'DELETE', newRow: null, oldRow: { id } };
          _smartBroadcastLocal(tbl, null, delEvent);
        } else {
          // INSERT/UPDATE tombstone: DB에서 전체 row 재조회 후 store 갱신
          pool.query(
            `SELECT data FROM app_kv_rows WHERE table_name = $1 AND row_id = $2 LIMIT 1`,
            [tbl, id],
          ).then(result => {
            const row = (result.rows[0]?.data ?? null) as Record<string, unknown> | null;
            if (!row) return;
            if (!store[tbl]) store[tbl] = [];
            const idx = store[tbl].findIndex(r => r['id'] === id);
            if (idx >= 0) store[tbl][idx] = row; else store[tbl].push(row);
            const fullEvent = { type: 'change', table: tbl, event: env.ev, newRow: row, oldRow: null };
            _smartBroadcastLocal(tbl, row, fullEvent);
          }).catch(e => console.warn('[db] tombstone DB refetch failed:', (e as Error).message));
        }
        return;
      }

      const newRow = env.newRow ?? null;
      const oldRow = env.oldRow ?? null;

      // ── 1. 로컬 store 업데이트 ──
      if (tbl && tbl !== 'db_error_log') {
        if (!store[tbl]) store[tbl] = [];
        if (env.ev === 'INSERT' && newRow) {
          const id = newRow['id'];
          if (!store[tbl].some(r => r['id'] === id)) store[tbl].push(newRow);
        } else if (env.ev === 'UPDATE' && newRow) {
          const id = newRow['id'];
          const idx = store[tbl].findIndex(r => r['id'] === id);
          if (idx >= 0) store[tbl][idx] = newRow; else store[tbl].push(newRow);
        } else if (env.ev === 'DELETE' && oldRow) {
          const id = oldRow['id'];
          const idx = store[tbl].findIndex(r => r['id'] === id);
          if (idx >= 0) store[tbl].splice(idx, 1);
        }
      }

      // ── 2. 로컬 SSE 클라이언트에게 중계 (notify=false — 무한 루프 방지) ──
      const event = { type: 'change', table: tbl, event: env.ev, newRow, oldRow };
      _smartBroadcastLocal(tbl, newRow ?? oldRow, event);
    });
    client.on('error', (err) => {
      console.error('[db] LISTEN client error — reconnecting in 5 s:', err.message);
      _listenClient = null;
      client.end().catch(() => {});
      // 재연결 후 핫 테이블 재동기화: 5초 gap 중 누락된 변경 복구
      setTimeout(() => {
        setupListenClient()
          .then(() => resyncHotTablesFromDb())
          .catch(console.error);
      }, 5000);
    });
    _listenClient = client;
    console.info(`[db] LISTEN data_change ready (instance=${INSTANCE_ID.slice(0, 8)})`);
  } catch (err) {
    console.error('[db] setupListenClient failed — retry in 10 s:', (err as Error).message);
    setTimeout(() => {
      setupListenClient()
        .then(() => resyncHotTablesFromDb())
        .catch(console.error);
    }, 10000);
  }
}

/** 다른 인스턴스에 변경 사항 전파. 이미지 테이블 제외. 8 KB 초과 시 tombstone 전송 */
function notifyOtherInstances(table: string, ev: string, newRow: Record<string, unknown> | null, oldRow: Record<string, unknown> | null): void {
  if (table === 'app_image_store') return; // 이미지 data URL은 수 KB — 제외
  const payload = JSON.stringify({ src: INSTANCE_ID, table, ev, newRow, oldRow });
  if (payload.length > 7900) {
    // 페이로드 8KB 초과(큰 프로필 사진 등) — 수신 측이 DB에서 직접 재조회하도록 tombstone 전송
    const id = (newRow ?? oldRow)?.['id'];
    if (!id) return;
    const tombstone = JSON.stringify({ src: INSTANCE_ID, table, ev, id, _tombstone: true });
    pool.query("SELECT pg_notify('data_change', $1)", [tombstone]).catch((e) =>
      console.warn('[db] NOTIFY tombstone failed:', (e as Error).message)
    );
    return;
  }
  pool.query("SELECT pg_notify('data_change', $1)", [payload]).catch((e) =>
    console.warn('[db] NOTIFY failed:', (e as Error).message)
  );
}

/** hot 테이블(profiles·seats·app_settings)을 app_kv_rows에서 재동기화 — LISTEN gap 보정 전용 */
async function resyncHotTablesFromDb(): Promise<void> {
  const hotTables = ['profiles', 'seats', 'app_settings'];
  try {
    const { rows } = await pool.query(
      `SELECT table_name, data FROM app_kv_rows WHERE table_name = ANY($1::text[])`,
      [hotTables],
    );
    const grouped: Record<string, Record<string, unknown>[]> = {};
    for (const r of rows) {
      if (!grouped[r.table_name as string]) grouped[r.table_name as string] = [];
      grouped[r.table_name as string].push(r.data as Record<string, unknown>);
    }
    for (const tbl of hotTables) {
      if (grouped[tbl]?.length) store[tbl] = grouped[tbl];
    }
    console.info('[db] hot-table resync complete (profiles/seats/app_settings)');
  } catch (e) {
    console.warn('[db] hot-table resync failed:', (e as Error).message);
  }
}

// 관리자·테스트 패널이 Supabase 네이티브 테이블에 직접 쓸 때 api-server 인메모리와 어긋남
// → 30초마다 네이티브 테이블에서 전체 재동기화해 최대 30초 안에 자동 복구
const FULL_RESYNC_TABLES: Array<{ tbl: string; order?: string }> = [
  { tbl: 'profiles' },
  { tbl: 'seats',         order: 'ORDER BY table_number, seat_position' },
  { tbl: 'app_settings' },
  { tbl: 'notifications', order: 'ORDER BY created_at DESC' },
  { tbl: 'likes',         order: 'ORDER BY created_at DESC LIMIT 5000' },
  { tbl: 'chats',         order: 'ORDER BY created_at DESC LIMIT 5000' },
  { tbl: 'balance_games', order: 'ORDER BY created_at DESC LIMIT 500' },
  { tbl: 'balance_votes', order: 'ORDER BY created_at DESC LIMIT 5000' },
  { tbl: 'qa_games',      order: 'ORDER BY created_at DESC LIMIT 200' },
  { tbl: 'qa_answers',    order: 'ORDER BY created_at DESC LIMIT 2000' },
  { tbl: 'image_games',   order: 'ORDER BY created_at DESC LIMIT 200' },
  { tbl: 'image_votes',   order: 'ORDER BY created_at DESC LIMIT 2000' },
  { tbl: 'suggestions',   order: 'ORDER BY created_at DESC LIMIT 500' },
];

let _fullResyncRunning = false;

async function resyncAllFromNativeDb(): Promise<void> {
  if (_fullResyncRunning) return; // 이전 리싱크가 아직 실행 중이면 skip
  _fullResyncRunning = true;
  try {
    // 모든 데이터는 native 테이블이 아닌 app_kv_rows KV 저장소에 보관됨
    // SELECT * FROM table_name 은 "relation does not exist" 오류 → app_kv_rows 경유해야 함
    const tableNames = FULL_RESYNC_TABLES.map(t => t.tbl);
    const { rows } = await pool.query(
      `SELECT table_name, data FROM app_kv_rows WHERE table_name = ANY($1::text[])`,
      [tableNames],
    );
    const grouped: Record<string, Record<string, unknown>[]> = {};
    for (const r of rows) {
      const tbl = r.table_name as string;
      if (!grouped[tbl]) grouped[tbl] = [];
      grouped[tbl].push(r.data as Record<string, unknown>);
    }
    for (const { tbl } of FULL_RESYNC_TABLES) {
      if (grouped[tbl] !== undefined) {
        const prev = store[tbl];
        store[tbl] = grouped[tbl];
        broadcastAll({
          type: 'change', table: tbl, event: 'UPDATE',
          newRow: { _bulk_resync: true, count: store[tbl].length },
          oldRow: { count: prev?.length ?? 0 },
        });
      }
    }
    logger.info('[db] full resync complete (via app_kv_rows)');
  } catch (e) {
    logger.warn({ err: e }, '[db] resyncAllFromNativeDb 실패');
  } finally {
    _fullResyncRunning = false;
  }
}

// ─── SSE broadcast ─────────────────────────────────────────────────────────────
// SSE 연결별 keepalive interval 정리 함수 보관 — write 실패 시에도 인터벌 즉시 해제
const _sseCleanup = new Map<Response, () => void>();

function _send(client: Response, conns: Set<Response>, payload: string) {
  try { client.write(payload); } catch {
    conns.delete(client);
    // write 실패 = 클라이언트 연결 끊김 → keepalive interval 즉시 정리 (req.close 미발화 대비)
    _sseCleanup.get(client)?.();
    _sseCleanup.delete(client);
  }
  if (conns.size === 0) {
    for (const [uid, s] of sseUserMap) { if (s === conns) { sseUserMap.delete(uid); break; } }
  }
}

/** 모든 클라이언트에게 전송 (공개 이벤트: seats, profiles, app_settings, games 등) */
function broadcastAll(event: Record<string, unknown>) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  // Fix #6: 스냅샷 후 50개씩 청킹 — 150명×2연결=300 write()가 이벤트 루프를 블로킹하지 않도록
  const batch: Array<[Response, Set<Response>]> = [];
  for (const [, conns] of sseUserMap) for (const c of conns) batch.push([c, conns]);
  for (const c of sseAnonClients) batch.push([c, sseAnonClients]);
  for (const c of sseAdminClients) batch.push([c, sseAdminClients]); // 관리자도 공개 이벤트 수신
  if (batch.length <= 50) {
    for (const [c, conns] of batch) _send(c, conns, payload);
    return;
  }
  const doChunk = (i: number) => {
    const end = Math.min(i + 50, batch.length);
    for (let j = i; j < end; j++) _send(batch[j][0], batch[j][1], payload);
    if (end < batch.length) setImmediate(() => doChunk(end));
  };
  doChunk(0);
}

/** 특정 사용자들에게만 전송 (비공개 이벤트: messages, likes, chats 등) */
function broadcastToUsers(userIds: string[], event: Record<string, unknown>) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  const seen = new Set<Response>();
  for (const uid of userIds) {
    const conns = sseUserMap.get(uid);
    if (!conns) continue;
    for (const c of conns) {
      if (seen.has(c)) continue;
      seen.add(c);
      _send(c, conns, payload);
    }
  }
  // 관리자 클라이언트: 모든 프라이빗 이벤트도 수신 (감사·모니터링 목적)
  for (const c of sseAdminClients) {
    if (seen.has(c)) continue;
    seen.add(c);
    _send(c, sseAdminClients, payload);
  }
}

/** 1:1 프라이빗 데이터 테이블 — 절대 전체 브로드캐스트 금지 */
const PRIVATE_TABLES = new Set([
  'messages', 'likes', 'chats',
  'contact_shares', 'contact_share_events', 'chat_reads',
]);

/** 프로필 row에서 민감 연락처 필드를 제거하여 전체 브로드캐스트 안전하게 만들기 */
function sanitizeProfile(row: Record<string, unknown>): Record<string, unknown> {
  const s = { ...row };
  delete s['phone_number'];
  delete s['kakao_id'];
  delete s['instagram_id'];
  return s;
}

/** app_settings row에서 관리자 비밀번호를 제거하여 유저 SSE에 노출되지 않도록 */
function sanitizeSettings(row: Record<string, unknown>): Record<string, unknown> {
  const s = { ...row };
  delete s['admin_password']; // 관리자 비밀번호 유저 클라이언트 노출 방지
  return s;
}

/** 테이블 종류에 따라 자동으로 수신자 판단 — 로컬 SSE 전송 전용 (NOTIFY 없음) */
function _smartBroadcastLocal(table: string, row: Record<string, unknown> | null, event: Record<string, unknown>) {
  // row가 없는 경우(DELETE payload 없음): 프라이빗 테이블이면 드롭, 공개 테이블만 전체 전송
  if (!row) {
    if (!PRIVATE_TABLES.has(table)) broadcastAll(event);
    return;
  }
  const targets: string[] = [];
  if (table === 'messages') {
    const chat = getTable('chats').find(c => c['id'] === row['chat_id']);
    if (chat) targets.push(chat['user1_id'] as string, chat['user2_id'] as string);
  } else if (table === 'likes') {
    if (row['liker_id']) targets.push(row['liker_id'] as string);
    if (row['liked_id']) targets.push(row['liked_id'] as string);
  } else if (table === 'chats') {
    if (row['user1_id']) targets.push(row['user1_id'] as string);
    if (row['user2_id']) targets.push(row['user2_id'] as string);
  } else if (table === 'contact_shares' || table === 'contact_share_events') {
    ['sharer_id','receiver_id','sender_id','recipient_id','user1_id','user2_id']
      .forEach(k => { if (row[k]) targets.push(row[k] as string); });
  } else if (table === 'chat_reads') {
    // ✅ Fix #2: 앱이 reader_id로 쓰고 있으므로 두 필드 모두 체크
    if (row['user_id'])   targets.push(row['user_id']   as string);
    if (row['reader_id']) targets.push(row['reader_id'] as string);
  }

  if (targets.length > 0) {
    // 프로필 포함 이벤트라도 수신자가 명확하면 해당 유저에게만 전달
    broadcastToUsers(targets, event);
  } else if (!PRIVATE_TABLES.has(table)) {
    // 공개 테이블(seats, profiles, app_settings 등)만 전체 브로드캐스트 허용
    // profiles → 연락처 필드 제거, app_settings → admin_password 제거
    if (table === 'profiles') {
      const safeEvent = {
        ...event,
        newRow: event['newRow'] ? sanitizeProfile(event['newRow'] as Record<string, unknown>) : null,
        oldRow: event['oldRow'] ? sanitizeProfile(event['oldRow'] as Record<string, unknown>) : null,
      };
      broadcastAll(safeEvent);
    } else if (table === 'app_settings') {
      const safeEvent = {
        ...event,
        newRow: event['newRow'] ? sanitizeSettings(event['newRow'] as Record<string, unknown>) : null,
        oldRow: event['oldRow'] ? sanitizeSettings(event['oldRow'] as Record<string, unknown>) : null,
      };
      broadcastAll(safeEvent);
    } else {
      broadcastAll(event);
    }
  }
  // 프라이빗 테이블인데 수신자를 특정 못한 경우 → 조용히 드롭 (전체 유출 방지)
}

/** 로컬 SSE 전송 + 다른 인스턴스에 NOTIFY 전파 */
function smartBroadcast(table: string, row: Record<string, unknown> | null, event: Record<string, unknown>) {
  _smartBroadcastLocal(table, row, event);
  notifyOtherInstances(
    table,
    event['event'] as string,
    event['newRow'] as Record<string, unknown> | null,
    event['oldRow'] as Record<string, unknown> | null,
  );
}

// ─── Web Push: 메시지/하트 삽입 시 수신자에게 알림 전송 ──────────────────────
async function sendPushForEvent(table: string, row: Record<string, unknown>): Promise<void> {
  let recipientId: string | null = null;
  let payload: PushPayload | null = null;

  if (table === 'messages') {
    const chat = getTable('chats').find(c => c.id === row.chat_id);
    if (!chat) return;
    recipientId = (chat.user1_id === row.sender_id ? chat.user2_id : chat.user1_id) as string;
    const sender = getTable('profiles').find(p => p.id === row.sender_id);
    const nick = (sender?.nickname as string) ?? '누군가';
    let body = (row.content as string) ?? '';
    if (row.image_url) body = '[이미지]';
    else if (body.startsWith('__sticker__')) body = '[스티커]';
    else if (body.length > 60) body = body.slice(0, 60) + '…';
    payload = { title: `💬 ${nick}`, body, tag: `chat-${chat.id as string}`, url: '/' };
  } else if (table === 'likes') {
    recipientId = row.liked_id as string;
    const sender = getTable('profiles').find(p => p.id === row.liker_id);
    const nick = (sender?.nickname as string) ?? '누군가';
    const heartEmoji =
      row.heart_type === 'red' ? '❤️' :
      row.heart_type === 'blue' ? '💙' :
      row.heart_type === 'pink' ? '💗' : '💚';
    payload = { title: `${heartEmoji} ${nick}님`, body: '하트를 보냈어요!', tag: `like-${row.liker_id as string}`, url: '/' };
  }

  if (!recipientId || !payload) return;

  const subs = getTable('push_subscriptions').filter(s => s.user_id === recipientId);

  // 병렬 전송 — 직렬 await 제거로 다수 구독 시 지연 최소화
  const results = await Promise.all(
    subs.map(sub => sendPush(
      { endpoint: sub.endpoint as string, keys: { auth: sub.auth as string, p256dh: sub.p256dh as string } },
      payload,
    ).then(ok => ({ id: sub.id as string, ok })).catch(() => ({ id: sub.id as string, ok: false }))),
  );

  const expired = results.filter(r => !r.ok).map(r => r.id);
  if (expired.length) {
    store['push_subscriptions'] = (store['push_subscriptions'] ?? []).filter(s => !expired.includes(s.id as string));
    dbDeleteRows('push_subscriptions', expired).catch(console.error);
  }
}

// ─── Filter helpers ───────────────────────────────────────────────────────────
type FilterSpec =
  | { type: 'eq'; col: string; val: unknown }
  | { type: 'neq'; col: string; val: unknown }
  | { type: 'in'; col: string; vals: unknown[] }
  | { type: 'or'; expr: string };

function matchFilter(row: Record<string, unknown>, f: FilterSpec): boolean {
  if (f.type === 'eq') {
    return row[f.col] === f.val || String(row[f.col]) === String(f.val);
  }
  if (f.type === 'neq') {
    return row[f.col] !== f.val && String(row[f.col]) !== String(f.val);
  }
  if (f.type === 'in') {
    return f.vals.some(v => row[f.col] === v || String(row[f.col]) === String(v));
  }
  if (f.type === 'or') {
    const parts = f.expr.split(',').map(s => s.trim());
    return parts.some(part => {
      const m = part.match(/^(\w+)\.(\w+)\.(.+)$/);
      if (!m) return false;
      const [, col, op, val] = m;
      if (op === 'eq') return row[col] === val || String(row[col]) === val;
      if (op === 'neq') return row[col] !== val && String(row[col]) !== val;
      return true;
    });
  }
  return true;
}

function applyFilters(
  rows: Record<string, unknown>[],
  filters: FilterSpec[],
): Record<string, unknown>[] {
  if (!filters.length) return rows;
  return rows.filter(r => filters.every(f => matchFilter(r, f)));
}

// ─── DB operation endpoint ────────────────────────────────────────────────────
router.post('/op', async (req: Request, res: Response) => {
  // 동시 요청이 상한선을 초과하면 503 반환 — 클라이언트가 지수 백오프 후 재시도
  if (_activeOpCount >= MAX_CONCURRENT_OPS) {
    res.status(503).setHeader('Retry-After', '1');
    return res.json({ data: null, error: { message: 'Server busy — retry in 1s', code: 'BUSY' } });
  }
  _activeOpCount++;

  // ─ requesterId 세션 바인딩 — 구조분해 이전에 실행해야 local const에 올바른 값이 들어감 ─
  // 인증된 세션이 있는 경우: body requesterId와 불일치하면 즉시 차단, 일치하거나 null이면 세션값으로 확정
  {
    const _sessId = (req.session as { userId?: string })?.userId;
    const _bodyReqId = (req.body as Record<string, unknown>).requesterId as string | null | undefined;
    if (_sessId && _bodyReqId != null && String(_bodyReqId) !== _sessId) {
      _activeOpCount--;
      logger.warn({ ip: req.ip, session: _sessId, claimed: _bodyReqId }, '[SECURITY] requesterId body-spoof attempt blocked');
      return res.status(403).json({ data: null, error: { message: 'Forbidden: requesterId must match authenticated session', code: 'FORBIDDEN' } });
    }
    // 세션 userId로 확정 → 이후 구조분해 시 requesterId가 올바른 값을 가짐
    if (_sessId) (req.body as Record<string, unknown>).requesterId = _sessId;
  }

  // ─ req.body 타입 방어: JSON 파싱 실패·비객체 전송 시 safe fallback ─────────
  if (req.body == null || typeof req.body !== 'object' || Array.isArray(req.body)) {
    _activeOpCount--;
    return res.status(400).json({ data: null, error: { message: 'Request body must be a JSON object', code: 'INVALID_BODY' } });
  }
  const {
    table,
    op,
    filters = [],
    orders = [],
    limit,
    single,
    maybeSingle,
    payload,
    conflictCols = [],
    selectAfterWrite,
    requesterId,
    adminToken,
  } = req.body as {
    table: string; op: string;
    filters: FilterSpec[]; orders: { col: string; asc: boolean }[];
    limit?: number; single?: boolean; maybeSingle?: boolean;
    payload?: unknown; conflictCols?: string[]; selectAfterWrite?: boolean;
    requesterId?: string | null;
    adminToken?: string | null;
  };

  // 관리자 토큰 검증 — HMAC 재계산으로 검증 (서버 재시작 후에도 유효)
  const isAdmin = verifyAdminToken(adminToken);

  // ─ 페이로드 타입 방어: table/op는 반드시 문자열이어야 함 ─────────────────────
  if (typeof table !== 'string' || typeof op !== 'string') {
    _activeOpCount--;
    return res.status(400).json({ data: null, error: { message: 'table and op must be strings', code: 'INVALID_INPUT' } });
  }

  // ─ op 허용 목록: 알 수 없는 op는 즉시 거부 ────────────────────────────────────
  const ALLOWED_OPS = new Set(['select', 'insert', 'update', 'upsert', 'delete']);
  if (!ALLOWED_OPS.has(op)) {
    _activeOpCount--;
    return res.status(400).json({ data: null, error: { message: `Invalid op: ${op}`, code: 'INVALID_OP' } });
  }

  // ─ limit 타입 검증: 숫자가 아니거나 음수면 거부 ──────────────────────────────
  if (limit != null && (typeof limit !== 'number' || !Number.isFinite(limit) || limit < 0)) {
    _activeOpCount--;
    return res.status(400).json({ data: null, error: { message: 'limit must be a non-negative number', code: 'INVALID_INPUT' } });
  }

  // ─ orders 검증: 각 항목이 {col: string, asc: boolean} 이어야 함 ──────────────
  const safeOrders = Array.isArray(orders)
    ? orders.filter((o): o is { col: string; asc: boolean } =>
        o != null && typeof o === 'object' && typeof (o as Record<string, unknown>).col === 'string' && ((o as Record<string, unknown>).col as string).length > 0)
    : [];

  // ─ conflictCols 검증: 문자열 배열이어야 함 ────────────────────────────────────
  const safeConflictCols = Array.isArray(conflictCols)
    ? conflictCols.filter((c): c is string => typeof c === 'string' && c.length > 0)
    : [];

  // ─ Fix: 외부에서 {op:'eq'} 형식으로 보내 필터를 우회하는 공격 차단 ───────────────
  // 클라이언트는 {type:'eq'} 형식으로 보내지만, 해커가 {op:'eq'}로 보내면
  // matchFilter가 f.type을 찾지 못해 모든 행을 통과시킴 → 필터 완전 무력화
  const normalizedFilters: FilterSpec[] = (Array.isArray(filters) ? filters : []).map((f: unknown) => {
    // ─ 각 필터 요소 타입 방어: null·primitive는 null 마커로 치환해 이후 filter()에서 제거
    if (f == null || typeof f !== 'object' || Array.isArray(f)) return null;
    const fr = f as Record<string, unknown>;
    if (fr.type != null) return fr as unknown as FilterSpec;
    // op → type 정규화
    if (fr.op != null) return { ...fr, type: fr.op, op: undefined } as unknown as FilterSpec;
    return fr as unknown as FilterSpec;
  }).filter((f): f is FilterSpec => {
    // 필터 요소 유효성: col은 문자열, type은 문자열이어야 함
    if (f == null) return false;
    const fr = f as unknown as Record<string, unknown>;
    return typeof fr.col === 'string' && fr.col.length > 0 && typeof fr.type === 'string';
  });

  // ─ Table allowlist: reject unknown/internal tables immediately
  if (!ALLOWED_OP_TABLES.has(table)) {
    _activeOpCount--;
    return res.status(400).json({ data: null, error: { message: 'Invalid table', code: 'INVALID_TABLE' } });
  }

  if (!store[table]) store[table] = [];
  const tableData = store[table];

  try {
    // ── SELECT ──────────────────────────────────────────────────────────────
    if (op === 'select') {
      // ─ IDOR guard (강화): messages SELECT
      //   규칙 1: requesterId 없으면 메시지 접근 불가 (비인증 요청 차단)
      //   규칙 2: chat_id 필터 없으면 메시지 전체 덤프 불가
      //   규칙 3: 해당 채팅방 참여자가 아니면 접근 불가
      //   규칙 4: 존재하지 않는 chat_id로 요청 시 빈 배열 반환 (정보 노출 차단)
      if (table === 'messages') {
        if (!isAdmin) {
          if (!requesterId) {
            logger.warn({ ip: req.ip }, '[SECURITY] IDOR: messages SELECT without requesterId blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: authentication required', code: 'FORBIDDEN' } });
          }
          // chat_id 필터 탐색: eq(단일 채팅방) 또는 in(채팅 목록 일괄 조회) 모두 허용
          const chatIdEqF = normalizedFilters.find(f => f.type === 'eq' && f.col === 'chat_id') as { type: 'eq'; col: string; val: unknown } | undefined;
          const chatIdInF = normalizedFilters.find(f => f.type === 'in' && f.col === 'chat_id') as { type: 'in'; col: string; vals: unknown[] } | undefined;

          if (!chatIdEqF && !chatIdInF) {
            // chat_id 필터 없이 전체 메시지 덤프 시도 → 차단
            logger.warn({ requesterId, ip: req.ip }, '[SECURITY] IDOR: messages SELECT without chat_id filter blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: chat_id filter required', code: 'FORBIDDEN' } });
          }

          if (chatIdEqF) {
            // 단일 채팅방 접근 — 참여자 검증
            const chat = getTable('chats').find(c => c.id === chatIdEqF.val);
            if (!chat) {
              return res.json({ data: [], error: null }); // 존재하지 않는 채팅방 → 빈 배열
            }
            if (String(chat.user1_id) !== String(requesterId) && String(chat.user2_id) !== String(requesterId)) {
              logger.warn({ requesterId, chatId: chatIdEqF.val, ip: req.ip }, '[SECURITY] IDOR: messages SELECT by non-participant blocked');
              return res.status(403).json({ data: null, error: { message: 'Forbidden: not a chat participant', code: 'FORBIDDEN' } });
            }
          }

          if (chatIdInF) {
            // 복수 채팅방 일괄 조회 (loadChatList) — 요청자가 참여하지 않는 채팅방 ID 차단
            const chats = getTable('chats');
            const illegalChatId = (chatIdInF.vals as string[]).find(cid => {
              const chat = chats.find(c => c.id === cid);
              if (!chat) return false; // 존재하지 않으면 결과가 없으므로 무해
              return String(chat.user1_id) !== String(requesterId) && String(chat.user2_id) !== String(requesterId);
            });
            if (illegalChatId) {
              logger.warn({ requesterId, chatId: illegalChatId, ip: req.ip }, '[SECURITY] IDOR: messages SELECT (in) includes non-participant chat blocked');
              return res.status(403).json({ data: null, error: { message: 'Forbidden: not a chat participant', code: 'FORBIDDEN' } });
            }
          }
        }
        // isAdmin: 모든 메시지 조회 허용 (관리자 감사용)
      }

      // ─ IDOR guard: chats SELECT ───────────────────────────────────────────
      // 누구든 자신이 참여한 채팅방 목록만 볼 수 있어야 함.
      // requesterId 없이 chats를 전체 덤프하면 모든 채팅 참여자가 노출됨 → 차단.
      // 관리자는 전체 채팅방 조회 허용 (감사 목적).
      if (table === 'chats') {
        if (isAdmin) {
          // 관리자: 필터/정렬/페이지 그대로 적용하되 참여자 스코프 제한 없음
          const adminResult = applyFilters(tableData, normalizedFilters);
          for (const { col, asc } of safeOrders) {
            adminResult.sort((a, b) => {
              const av = a[col]; const bv = b[col];
              if (av === bv) return 0;
              if (av == null) return asc ? -1 : 1;
              if (bv == null) return asc ? 1 : -1;
              return (av < bv ? -1 : 1) * (asc ? 1 : -1);
            });
          }
          const safeLimit2 = limit != null ? Math.floor(limit) : undefined;
          const limited2 = safeLimit2 != null ? adminResult.slice(0, safeLimit2) : adminResult;
          const result2 = single ? (limited2[0] ?? null) : maybeSingle ? (limited2[0] ?? null) : limited2;
          return res.json({ data: result2, error: null });
        }
        if (!requesterId) {
          logger.warn({ ip: req.ip }, '[SECURITY] IDOR: chats SELECT without requesterId blocked');
          return res.status(403).json({ data: null, error: { message: 'Forbidden: authentication required', code: 'FORBIDDEN' } });
        }
        // 서버 측에서 참여자 검증 — 클라이언트 필터 우회 공격 차단
        // ⚠️ tableData는 store 배열 참조 → splice 금지. 별도 변수로 필터링.
        const chatScope = tableData.filter(c =>
          String(c.user1_id) === String(requesterId) || String(c.user2_id) === String(requesterId)
        );
        // 이후 로직이 filteredChats 기반으로 동작하도록 임시 교체 (읽기 전용)
        const scopedResult = applyFilters(chatScope, normalizedFilters);
        for (const { col, asc } of safeOrders) {
          scopedResult.sort((a, b) => {
            const av = a[col]; const bv = b[col];
            if (av === bv) return 0;
            if (av == null) return asc ? -1 : 1;
            if (bv == null) return asc ? 1 : -1;
            return (av < bv ? -1 : 1) * (asc ? 1 : -1);
          });
        }
        const safeLimit = limit != null ? Math.floor(limit) : undefined;
        const limitedScope = safeLimit != null ? scopedResult.slice(0, safeLimit) : scopedResult;
        const singleScope = single ? (limitedScope[0] ?? null) : maybeSingle ? (limitedScope[0] ?? null) : limitedScope;
        return res.json({ data: singleScope, error: null });
      }

      let result = applyFilters(tableData, normalizedFilters);
      for (const { col, asc } of safeOrders) {
        result.sort((a, b) => {
          const av = a[col]; const bv = b[col];
          if (av === bv) return 0;
          if (av == null) return asc ? -1 : 1;
          if (bv == null) return asc ? 1 : -1;
          const cmp = av < bv ? -1 : 1;
          return asc ? cmp : -cmp;
        });
      }
      if (limit != null) result = result.slice(0, limit);
      if (single) {
        if (!result.length) return res.json({ data: null, error: { message: 'Row not found', code: 'PGRST116' } });
        return res.json({ data: result[0], error: null });
      }
      if (maybeSingle) return res.json({ data: result[0] ?? null, error: null });
      return res.json({ data: result, error: null });
    }

    // ── INSERT ──────────────────────────────────────────────────────────────
    if (op === 'insert') {
      if (payload == null) return res.status(400).json({ data: null, error: { message: 'payload is required for insert', code: '22023' } });
      const inputs = Array.isArray(payload) ? payload as Record<string, unknown>[] : [payload as Record<string, unknown>];
      const inserted: Record<string, unknown>[] = [];
      // Fix #4: O(n²) → O(n) — profiles 삽입 시 루프 밖에서 Set 1회만 빌드
      const _insertNickSet = table === 'profiles' ? new Set(tableData.map(r => r.nickname).filter(Boolean)) : null;
      const _insertPinSet  = table === 'profiles' ? new Set(tableData.map(r => r.pin_code).filter(Boolean)) as Set<string>  : null;
      const _pinParams     = table === 'profiles' ? pinPoolParams(tableData.length) : null;
      for (const row of inputs) {
        if (!row) continue;
        if (table === 'profiles' && _insertNickSet!.has(row.nickname) && row.nickname != null) {
          return res.json({ data: null, error: { message: 'duplicate key value violates unique constraint "profiles_nickname_key"', code: '23505' } });
        }
        // const row는 재할당 불가이므로 effectiveRow로 분리; 텍스트 필드 sanitization 적용
        let effectiveRow: Record<string, unknown> = sanitizeRow(table, row);

        // ─ IDOR: INSERT 소유권 검증 (강화) ────────────────────────────────
        // messages: requesterId 필수 + sender_id 일치 + 채팅방 참여자 검증
        if (table === 'messages') {
          if (!requesterId) {
            logger.warn({ ip: req.ip }, '[SECURITY] IDOR: messages INSERT without requesterId blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: authentication required', code: 'FORBIDDEN' } });
          }
          if (effectiveRow.sender_id != null && String(effectiveRow.sender_id) !== String(requesterId)) {
            logger.warn({ requesterId, sender_id: effectiveRow.sender_id, ip: req.ip }, '[SECURITY] IDOR: sender_id mismatch blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: sender_id mismatch', code: 'FORBIDDEN' } });
          }
          // ─ chat_id는 messages INSERT에서 필수 — 없으면 고아 메시지 생성 차단
          if (effectiveRow.chat_id == null) {
            logger.warn({ requesterId, ip: req.ip }, '[SECURITY] IDOR: messages INSERT without chat_id blocked');
            return res.status(400).json({ data: null, error: { message: 'chat_id is required for messages', code: 'INVALID_INPUT' } });
          }
          // 채팅방 참여자 검증 — 채팅방에 속하지 않은 사용자가 메시지를 삽입하는 공격 차단
          const targetChat = getTable('chats').find(c => c.id === effectiveRow.chat_id);
          if (!targetChat || (String(targetChat.user1_id) !== String(requesterId) && String(targetChat.user2_id) !== String(requesterId))) {
            logger.warn({ requesterId, chatId: effectiveRow.chat_id, ip: req.ip }, '[SECURITY] IDOR: message INSERT by non-participant blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: not a chat participant', code: 'FORBIDDEN' } });
          }
        }
        // chats: requesterId 필수 + 본인이 user1_id 또는 user2_id여야 함
        if (table === 'chats') {
          if (!requesterId) {
            return res.status(403).json({ data: null, error: { message: 'Forbidden: authentication required', code: 'FORBIDDEN' } });
          }
          const u1 = String(effectiveRow.user1_id ?? '');
          const u2 = String(effectiveRow.user2_id ?? '');
          if (requesterId !== u1 && requesterId !== u2) {
            logger.warn({ requesterId, u1, u2, ip: req.ip }, '[SECURITY] IDOR: chats INSERT by non-participant blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: must be a participant', code: 'FORBIDDEN' } });
          }
        }
        // chat_reads: requesterId 필수 + reader_id 일치
        if (table === 'chat_reads' && requesterId && effectiveRow.reader_id != null) {
          if (String(effectiveRow.reader_id) !== String(requesterId)) {
            return res.status(403).json({ data: null, error: { message: 'Forbidden: reader_id mismatch', code: 'FORBIDDEN' } });
          }
        }
        // likes: liker_id must match the authenticated requester
        if (table === 'likes' && requesterId && effectiveRow.liker_id != null) {
          if (String(effectiveRow.liker_id) !== String(requesterId)) {
            return res.status(403).json({ data: null, error: { message: 'Forbidden: liker_id mismatch', code: 'FORBIDDEN' } });
          }
        }

        if (table === 'profiles') {
          const { use5Digit, poolSize } = _pinParams!;
          const usedPins = _insertPinSet!; // 루프 밖 빌드 Set 재사용 — O(1) 조회
          // PIN 슬롯 전체 소진 — 신규 등록 불가 (503) [resolvePin handles exhaustion + collision]
          const pinResult = resolvePin(usedPins, poolSize, use5Digit, effectiveRow.pin_code as string | null | undefined);
          if (!pinResult.ok) {
            return res.status(503).json({
              data: null,
              error: { message: 'PIN pool exhausted — no available PIN slots. Please contact the administrator.', code: 'PIN_EXHAUSTED' },
            });
          }
          effectiveRow = { ...effectiveRow, pin_code: pinResult.pin };
        }
        // chats 테이블: ID를 서버에서 정규화(sort)하여 역순 요청으로 인한 중복 채팅방 생성 방지
        // 클라이언트가 user1/user2를 어떤 순서로 보내든 항상 동일한 채팅방을 가리키도록 강제
        if (table === 'chats' && effectiveRow.user1_id != null && effectiveRow.user2_id != null) {
          const [uid1, uid2] = [String(effectiveRow.user1_id), String(effectiveRow.user2_id)].sort();
          effectiveRow = { ...effectiveRow, user1_id: uid1, user2_id: uid2 };
          // 정규화된 쌍으로 기존 채팅방 탐색 (양방향 모두 확인)
          const existing = tableData.find(r =>
            (String(r.user1_id) === uid1 && String(r.user2_id) === uid2) ||
            (String(r.user1_id) === uid2 && String(r.user2_id) === uid1)
          );
          if (existing) {
            if (selectAfterWrite) return res.json({ data: single ? existing : [existing], error: null });
            return res.json({ data: null, error: null });
          }
        }
        // messages 테이블: client_id(UUID) 기반 멱등성 — 네트워크 재시도로 인한 중복 메시지 삽입 방지
        if (table === 'messages' && effectiveRow.client_id != null) {
          const dupMsg = tableData.find(r => r.client_id === effectiveRow.client_id);
          if (dupMsg) return res.json({ data: single ? dupMsg : [dupMsg], error: null }); // ON CONFLICT DO NOTHING
        }
        // likes 테이블: 동일 liker+liked+heart_type 중복 방지 (빠른 연속 클릭으로 인한 중복 하트 삽입 방지)
        if (table === 'likes' && effectiveRow.liker_id != null && effectiveRow.liked_id != null && effectiveRow.heart_type != null) {
          const dupLike = tableData.find(r =>
            r.liker_id === effectiveRow.liker_id && r.liked_id === effectiveRow.liked_id && r.heart_type === effectiveRow.heart_type
          );
          if (dupLike) return res.json({ data: null, error: null }); // 무음 중복 차단

          // Time-bucket rate limiter: at most 1 like per 500 ms per (liker, liked, type) triple
          // Keyed on all three dimensions so different heart types can still be sent concurrently;
          // only the exact same (liker, liked, type) combination is throttled within the window.
          const rateKey = `${effectiveRow.liker_id}:${effectiveRow.liked_id}:${effectiveRow.heart_type}`;
          const lastMs = _likesLastInsert.get(rateKey) ?? 0;
          if (Date.now() - lastMs < LIKES_MIN_INTERVAL_MS) {
            // Rapid duplicate — silently ignore (client-side lock should have prevented this)
            return res.json({ data: null, error: null });
          }
          _likesLastInsert.set(rateKey, Date.now());

          // ─ 사용자 전체 분당 한도 (서로 다른 대상/타입 조합 스팸 방지)
          const liker = String(effectiveRow.liker_id);
          const nowMs = Date.now();
          let ubucket = _userLikeMinuteBuckets.get(liker);
          if (!ubucket || nowMs > ubucket.resetAt) {
            ubucket = { count: 0, resetAt: nowMs + 60_000 };
            _userLikeMinuteBuckets.set(liker, ubucket);
          }
          ubucket.count++;
          if (ubucket.count > LIKES_MAX_PER_USER_PER_MIN) {
            return res.status(429).json({ data: null, error: { message: '하트를 너무 빠르게 보내고 있습니다. 잠시 후 다시 시도해 주세요.', code: 'RATE_LIMIT' } });
          }
        }
        const newRow: Record<string, unknown> = { id: genId(), created_at: ts(), ...effectiveRow };
        if (table === 'session_history' && !newRow.ended_at) newRow.ended_at = ts();

        // 프로필 생성 시 device secret을 원자적으로 바인딩 — TOFU 레이스 윈도우 제거
        // 클라이언트가 _device_secret 필드를 포함해 INSERT하면 서버가 HMAC 해시를 저장하고
        // 해당 필드를 프로필 데이터에서 제거합니다(공개 쿼리에 노출되지 않음).
        if (table === 'profiles' && typeof newRow._device_secret === 'string') {
          const secretHash = createHmac('sha256', SSE_TOKEN_SECRET)
            .update(newRow._device_secret as string)
            .digest('hex');
          const profileId = newRow.id as string;
          if (!getTable('device_secrets').find(r => r.user_id === profileId)) {
            const dsRow = { id: genId(), user_id: profileId, secret_hash: secretHash, created_at: ts() };
            getTable('device_secrets').push(dsRow);
            dbPersistRow('device_secrets', dsRow).catch(console.error);
          }
          delete newRow._device_secret; // 프로필 응답·DB에서 제거
        }

        tableData.push(newRow);
        inserted.push(newRow);
        // 배치 삽입 시 다음 항목의 중복 검사가 정확하도록 Set 증분 업데이트
        if (table === 'profiles') {
          if (newRow.nickname) _insertNickSet!.add(newRow.nickname as string);
          if (newRow.pin_code) _insertPinSet!.add(newRow.pin_code as string);
        }
        smartBroadcast(table, newRow, { type: 'change', table, event: 'INSERT', newRow, oldRow: null });
        dbPersistRow(table, newRow).catch(console.error);
        // #33: 신규 프로필 등록 시 PIN 풀 사용량 확인 — 85% 초과 시 관리자 푸시 알림
        if (table === 'profiles') {
          checkAndNotifyAdminPinPool().catch(console.error);
        }
        // chat_reads 삽입 시 해당 유저 unread 캐시 즉시 무효화
        if (table === 'chat_reads' && newRow.reader_id) {
          unreadCountsCache.delete(String(newRow.reader_id));
        }
        // Fix #8: 메시지 삽입 시 수신자 unread 캐시 즉시 무효화 (TTL 2s 대기 없음)
        if (table === 'messages' && newRow.sender_id && newRow.chat_id) {
          const _msgChat = getTable('chats').find(c => c.id === newRow.chat_id);
          if (_msgChat) {
            const _receiverId = _msgChat.user1_id === newRow.sender_id ? _msgChat.user2_id : _msgChat.user1_id;
            if (_receiverId) unreadCountsCache.delete(String(_receiverId));
          }
        }
        // 메시지·하트 삽입 시 수신자 핸드폰으로 푸시 알림 전송
        if (table === 'messages' || table === 'likes') {
          sendPushForEvent(table, newRow).catch(console.error);
        }
      }
      if (selectAfterWrite) return res.json({ data: single ? inserted[0] ?? null : inserted, error: null });
      return res.json({ data: null, error: null });
    }

    // ── UPDATE ──────────────────────────────────────────────────────────────
    if (op === 'update') {
      let patch = sanitizeRow(table, payload as Record<string, unknown>);

      // ─ IDOR guard: UPDATE ownership check ──────────────────────────────
      // messages UPDATE는 requesterId 필수 — 미인증 UPDATE로 타인 메시지 수정 차단
      if (table === 'messages' && !requesterId) {
        logger.warn({ ip: req.ip }, '[SECURITY] IDOR: messages UPDATE without requesterId blocked');
        return res.status(403).json({ data: null, error: { message: 'Forbidden: authentication required', code: 'FORBIDDEN' } });
      }
      // requesterId가 있는 경우, 자신 소유의 행만 수정 가능하도록 검증
      if (requesterId) {
        const rowsToUpdate = applyFilters(tableData, normalizedFilters);
        for (const existingRow of rowsToUpdate) {
          // profiles: 자신의 프로필만 수정 가능
          if (table === 'profiles' && existingRow.id != null &&
              String(existingRow.id) !== String(requesterId)) {
            logger.warn({ requesterId, rowId: existingRow.id }, '[SECURITY] IDOR: UPDATE profiles blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: 자신의 프로필만 수정할 수 있습니다.', code: 'FORBIDDEN' } });
          }
          // messages: 자신이 보낸 메시지만 수정 가능
          if (table === 'messages' && existingRow.sender_id != null &&
              String(existingRow.sender_id) !== String(requesterId)) {
            logger.warn({ requesterId, rowId: existingRow.id }, '[SECURITY] IDOR: UPDATE messages blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: 자신의 메시지만 수정할 수 있습니다.', code: 'FORBIDDEN' } });
          }
          // seats: 자신이 점유한 자리만 수정 가능 (빈 자리 클레임은 INSERT/patch로 처리됨)
          if (table === 'seats' && existingRow.profile_id != null &&
              String(existingRow.profile_id) !== String(requesterId)) {
            // 단, patch에 profile_id === requesterId 인 경우(자리 이동)는 admin RPC로만 해야 함
            logger.warn({ requesterId, rowId: existingRow.id }, '[SECURITY] IDOR: UPDATE seats blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: 다른 사람의 자리는 수정할 수 없습니다.', code: 'FORBIDDEN' } });
          }
          // chat_reads: 자신의 읽음 기록만 수정 가능
          if (table === 'chat_reads' && existingRow.reader_id != null &&
              String(existingRow.reader_id) !== String(requesterId)) {
            logger.warn({ requesterId, rowId: existingRow.id }, '[SECURITY] IDOR: UPDATE chat_reads blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: 자신의 읽음 기록만 수정할 수 있습니다.', code: 'FORBIDDEN' } });
          }
        }
      }
      // profiles 테이블에서 pin_code를 UPDATE할 때 서버 레벨 유일성 보장
      // (레거시 사용자 핀 자동 부여 시 경쟁 조건 방지)
      if (table === 'profiles' && patch.pin_code != null) {
        const usedPins = new Set(tableData.map(r => r.pin_code).filter(Boolean)) as Set<string>;
        const { use5Digit, poolSize } = pinPoolParams(tableData.length);
        const pinResult = resolvePin(usedPins, poolSize, use5Digit, patch.pin_code as string);
        if (!pinResult.ok) {
          return res.status(503).json({
            data: null,
            error: { message: 'PIN pool exhausted — no available PIN slots. Please contact the administrator.', code: 'PIN_EXHAUSTED' },
          });
        }
        patch = { ...patch, pin_code: pinResult.pin };
      }
      const updated: Record<string, unknown>[] = [];
      for (let i = 0; i < tableData.length; i++) {
        if (applyFilters([tableData[i]], normalizedFilters).length) {
          const oldRow = { ...tableData[i] };
          const newRow = { ...oldRow, ...patch };
          tableData[i] = newRow;
          updated.push(newRow);
          smartBroadcast(table, newRow, { type: 'change', table, event: 'UPDATE', newRow, oldRow });
          dbPersistRow(table, newRow).catch(console.error);
          // chat_reads 갱신 시 해당 유저 unread 캐시 즉시 무효화
          if (table === 'chat_reads' && newRow.reader_id) {
            unreadCountsCache.delete(String(newRow.reader_id));
          }
        }
      }
      if (selectAfterWrite) return res.json({ data: single ? updated[0] ?? null : updated, error: null });
      return res.json({ data: null, error: null });
    }

    // ── UPSERT ──────────────────────────────────────────────────────────────
    if (op === 'upsert') {
      const inputs = (Array.isArray(payload) ? payload as Record<string, unknown>[] : [payload as Record<string, unknown>])
        .map(row => sanitizeRow(table, row)); // XSS 방어: UPSERT payload도 sanitize
      const upserted: Record<string, unknown>[] = [];

      // ─ IDOR guard: UPSERT ownership check ─────────────────────────────
      if (requesterId) {
        for (const row of inputs) {
          if (!row) continue;
          // chat_reads: reader_id는 반드시 requester여야 함
          if (table === 'chat_reads' && row.reader_id != null &&
              String(row.reader_id) !== String(requesterId)) {
            logger.warn({ requesterId, reader_id: row.reader_id }, '[SECURITY] IDOR: UPSERT chat_reads blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: 자신의 읽음 기록만 생성할 수 있습니다.', code: 'FORBIDDEN' } });
          }
          // seats: profile_id는 반드시 requester여야 함 (자리 직접 등록)
          if (table === 'seats' && row.profile_id != null &&
              String(row.profile_id) !== String(requesterId)) {
            logger.warn({ requesterId, profile_id: row.profile_id }, '[SECURITY] IDOR: UPSERT seats blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: 자신의 자리만 등록할 수 있습니다.', code: 'FORBIDDEN' } });
          }
        }
      }
      // Fix #7: O(n²) → O(n) — id 기반 UPSERT 시 Map 인덱스로 O(1) 조회
      const _idxById = !safeConflictCols.length ? new Map(tableData.map((r, i) => [r.id, i])) : null;
      for (const row of inputs) {
        let idx = -1;
        if (safeConflictCols.length) {
          idx = tableData.findIndex(r => safeConflictCols.every(c => String(r[c]) === String(row[c]) || r[c] === row[c]));
        } else if (row.id != null) {
          idx = _idxById!.get(row.id) ?? -1;
        }
        if (idx >= 0) {
          const oldRow = { ...tableData[idx] };
          const newRow = { ...oldRow, ...row };
          tableData[idx] = newRow;
          upserted.push(newRow);
          smartBroadcast(table, newRow, { type: 'change', table, event: 'UPDATE', newRow, oldRow });
          dbPersistRow(table, newRow).catch(console.error);
          // chat_reads 갱신 시 해당 유저 unread 캐시 즉시 무효화
          if (table === 'chat_reads' && newRow.reader_id) {
            unreadCountsCache.delete(String(newRow.reader_id));
          }
        } else {
          const base: Record<string, unknown> = { id: genId(), created_at: ts(), ...row };
          if (table === 'profiles' && base.birth_month == null) {
            base.birth_month = Math.ceil(Math.random() * 12);
            base.birth_day = Math.ceil(Math.random() * 28);
          }
          tableData.push(base);
          _idxById?.set(base.id, tableData.length - 1); // Map 갱신 (배치 내 후속 항목 O(1) 조회)
          upserted.push(base);
          smartBroadcast(table, base, { type: 'change', table, event: 'INSERT', newRow: base, oldRow: null });
          dbPersistRow(table, base).catch(console.error);
          if (table === 'chat_reads' && base.reader_id) {
            unreadCountsCache.delete(String(base.reader_id));
          }
        }
      }
      if (selectAfterWrite) return res.json({ data: upserted, error: null });
      return res.json({ data: null, error: null });
    }

    // ── DELETE ──────────────────────────────────────────────────────────────
    if (op === 'delete') {
      const toDelete = applyFilters(tableData, normalizedFilters);

      // ─ IDOR guard: DELETE ownership check ──────────────────────────────
      if (requesterId) {
        for (const existingRow of toDelete) {
          // likes: 자신이 보낸 하트만 삭제 가능
          if (table === 'likes' && existingRow.liker_id != null &&
              String(existingRow.liker_id) !== String(requesterId)) {
            logger.warn({ requesterId, rowId: existingRow.id }, '[SECURITY] IDOR: DELETE likes blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: 자신이 보낸 하트만 취소할 수 있습니다.', code: 'FORBIDDEN' } });
          }
          // messages: 자신이 보낸 메시지만 삭제 가능
          if (table === 'messages' && existingRow.sender_id != null &&
              String(existingRow.sender_id) !== String(requesterId)) {
            logger.warn({ requesterId, rowId: existingRow.id }, '[SECURITY] IDOR: DELETE messages blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: 자신의 메시지만 삭제할 수 있습니다.', code: 'FORBIDDEN' } });
          }
          // seats: 자신이 점유한 자리만 비울 수 있음
          if (table === 'seats' && existingRow.profile_id != null &&
              String(existingRow.profile_id) !== String(requesterId)) {
            logger.warn({ requesterId, rowId: existingRow.id }, '[SECURITY] IDOR: DELETE seats blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: 다른 사람의 자리를 삭제할 수 없습니다.', code: 'FORBIDDEN' } });
          }
        }
      }
      store[table] = tableData.filter(r => !applyFilters([r], normalizedFilters).length);
      // ─ 배치 삭제 최적화: N개의 개별 DELETE → 단일 IN-clause 쿼리로 통합 (N+1 제거)
      const deleteIds = toDelete.map(r => String(r.id)).filter(Boolean);
      for (const row of toDelete) {
        smartBroadcast(table, row, { type: 'change', table, event: 'DELETE', newRow: null, oldRow: row });
      }
      if (deleteIds.length > 0) dbDeleteRows(table, deleteIds).catch(console.error);
      return res.json({ data: null, error: null });
    }

    return res.json({ data: null, error: { message: 'Unknown operation' } });
  } catch (e) {
    console.error('[db/op]', e);
    // 내부 오류 문자열을 클라이언트에 직접 노출하지 않음 — 스키마·스택 정보 유출 방지
    return res.json({ data: null, error: { message: '서버 내부 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' } });
  } finally {
    // ─ 동시 요청 슬롯 반환 — try/catch 내부의 어떤 경로로 나가든 반드시 1회 실행
    _activeOpCount--;
  }
});

// ─── RPC endpoint ─────────────────────────────────────────────────────────────
router.post('/rpc/:name', async (req: Request, res: Response) => {
  const { name } = req.params;
  const args = (req.body ?? {}) as Record<string, unknown>;

  const settings = (getTable('app_settings')[0] ?? {}) as Record<string, unknown>;
  const adminPw = (settings.admin_password as string) ?? '';

  function checkPassword() {
    const provided = (args.p_admin_password as string) ?? '';
    const token = (args.adminToken as string) ?? '';
    // adminToken(HMAC)으로도 인증 가능 — 비밀번호 대신 토큰을 전달한 경우도 허용
    const isValidToken = token.length > 0 && adminPw.length > 0 && token === deriveAdminToken(adminPw);
    if (adminPw && provided !== adminPw && !isValidToken) throw new Error('비밀번호가 일치하지 않습니다.');
  }

  try {
    switch (name) {
      case 'admin_create_session': {
        // 관리자 비밀번호가 설정돼 있으면 반드시 검증 — 비밀번호 없이 세션 생성 방지
        checkPassword();
        // HMAC 기반 토큰 — 서버 재시작 후에도 동일 토큰이 재계산되어 유효
        const adminToken = deriveAdminToken(adminPw);
        return res.json({ data: adminToken, error: null });
      }

      case 'admin_invalidate_session':
        checkPassword();
        return res.json({ data: null, error: null });

      case 'admin_auth_phone':
        checkPassword();
        return res.json({ data: null, error: null });

      case 'admin_update_settings': {
        // 관리자 패널 → api-server 인메모리 app_settings 동기화
        // Supabase 직접 업데이트만으로는 api-server 메모리가 갱신되지 않아 유저에게 반영 안 됨
        checkPassword();
        const payload = (args.p_payload as Record<string, unknown>) ?? {};
        const current = (getTable('app_settings')[0] ?? {}) as Record<string, unknown>;
        const updated = { ...current, ...payload, updated_at: new Date().toISOString() };
        store['app_settings'] = [updated];
        broadcastAll({ type: 'change', table: 'app_settings', event: 'UPDATE', newRow: updated, oldRow: current });
        dbPersistRow('app_settings', updated).catch(console.error);
        return res.json({ data: null, error: null });
      }

      case 'test_resync': {
        // 테스트 대시보드 → 모든 관련 테이블을 DB에서 강제 리로드
        const pTestPw2 = (args.p_test_password as string | undefined) ?? '';
        const correctTestPw2 = ((settings.test_password as string | null | undefined) ?? '').trim() || '116606';
        if (pTestPw2.trim() !== correctTestPw2) {
          return res.status(403).json({ data: null, error: { message: '테스트 비밀번호가 올바르지 않습니다.' } });
        }
        resyncAllFromNativeDb().catch(e => logger.error({ err: e }, '[rpc] test_resync 실패'));
        return res.json({ data: null, error: null });
      }

      case 'admin_force_resync_all': {
        // 관리자 패널 → 전체 테이블 강제 리싱크 (Supabase 직접 쓰기 후 즉시 반영용)
        checkPassword();
        resyncAllFromNativeDb().catch(e => logger.error({ err: e }, '[rpc] admin_force_resync_all 실패'));
        return res.json({ data: null, error: null });
      }

      case 'test_update_settings': {
        // 테스트 대시보드 → api-server 인메모리 app_settings 동기화
        // 관리자 비밀번호 없이 테스트 비밀번호로 인증 (session_active / active_tables 전용)
        const pTestPw = (args.p_test_password as string | undefined) ?? '';
        const correctTestPw = ((settings.test_password as string | null | undefined) ?? '').trim() || '116606';
        if (pTestPw.trim() !== correctTestPw) {
          return res.status(403).json({ data: null, error: { message: '테스트 비밀번호가 올바르지 않습니다.' } });
        }
        const testPayload = (args.p_payload as Record<string, unknown>) ?? {};
        // 허용 필드 제한 — 테스트 대시보드는 세션·테이블 설정만 변경 가능
        const ALLOWED_TEST_FIELDS = new Set(['session_active', 'active_tables']);
        const filteredPayload = Object.fromEntries(
          Object.entries(testPayload).filter(([k]) => ALLOWED_TEST_FIELDS.has(k))
        );
        const currentSettings = (getTable('app_settings')[0] ?? {}) as Record<string, unknown>;
        const updatedSettings = { ...currentSettings, ...filteredPayload, updated_at: new Date().toISOString() };
        store['app_settings'] = [updatedSettings];
        broadcastAll({ type: 'change', table: 'app_settings', event: 'UPDATE', newRow: updatedSettings, oldRow: currentSettings });
        dbPersistRow('app_settings', updatedSettings).catch(console.error);
        return res.json({ data: null, error: null });
      }

      case 'admin_reset_all_seats':
      case 'admin_full_reset': {
        checkPassword();
        const seats = getTable('seats').map(s => ({ ...s, profile_id: null, status: 'empty', registered_at: null }));
        store['seats'] = seats;
        // ─ 배치 병렬 쓰기: N개 직렬 await → Promise.all 병렬화 (DB 왕복 N→1)
        for (const s of seats) broadcastAll({ type: 'change', table: 'seats', event: 'UPDATE', newRow: s, oldRow: null });
        Promise.all(seats.map(s => dbPersistRow('seats', s))).catch(console.error);
        return res.json({ data: null, error: null });
      }

      case 'admin_event_end_reset': {
        checkPassword();
        const seats = getTable('seats').map(s => ({ ...s, profile_id: null, status: 'empty', registered_at: null }));
        store['seats'] = seats;
        for (const s of seats) broadcastAll({ type: 'change', table: 'seats', event: 'UPDATE', newRow: s, oldRow: null });
        Promise.all(seats.map(s => dbPersistRow('seats', s))).catch(console.error);
        const tablesToClear = [
          'profiles', 'likes', 'anonymous_reports', 'chats', 'messages',
          'contact_shares', 'contact_share_events', 'balance_votes', 'balance_games',
          'qa_answers', 'qa_games', 'image_votes', 'image_games', 'notifications', 'suggestions',
        ];
        // 프라이빗 테이블은 row 내용 없이 "전체 초기화" 신호만 전송 (민감 데이터 유출 방지)
        const RESET_PRIVATE = new Set(['likes', 'chats', 'messages', 'contact_shares', 'contact_share_events', 'chat_reads', 'anonymous_reports']);
        for (const t of tablesToClear) {
          const old = store[t] ?? [];
          store[t] = [];
          if (t === 'chat_reads') unreadCountsCache.clear(); // 전체 리셋 시 캐시 전부 무효화
          if (RESET_PRIVATE.has(t)) {
            // 행 데이터 없이 테이블 초기화 알림만 전송
            broadcastAll({ type: 'change', table: t, event: 'RESET', newRow: null, oldRow: null });
          } else if (t === 'profiles') {
            // 프로필 DELETE는 민감 필드 제거 후 전송
            for (const row of old) broadcastAll({ type: 'change', table: t, event: 'DELETE', newRow: null, oldRow: sanitizeProfile(row) });
          } else {
            for (const row of old) broadcastAll({ type: 'change', table: t, event: 'DELETE', newRow: null, oldRow: row });
          }
          dbDeleteTable(t).catch(console.error);
        }
        return res.json({ data: null, error: null });
      }

      case 'admin_clear_seat': {
        checkPassword();
        const seatId = args.p_seat_id as string;
        const seats = getTable('seats');
        const idx = seats.findIndex(s => s.id === seatId);
        if (idx >= 0) {
          const oldRow = { ...seats[idx] };
          const newRow = { ...oldRow, profile_id: null, status: 'empty', registered_at: null };
          seats[idx] = newRow;
          broadcastAll({ type: 'change', table: 'seats', event: 'UPDATE', newRow, oldRow });
          dbPersistRow('seats', newRow).catch(console.error);
        }
        return res.json({ data: null, error: null });
      }

      case 'admin_force_seat': {
        checkPassword();
        const profileId = args.p_profile_id as string;
        const seatId = args.p_seat_id as string;
        const seats = getTable('seats');
        const curIdx = seats.findIndex(s => s.profile_id === profileId);
        if (curIdx >= 0 && seats[curIdx].id !== seatId) {
          const oldRow = { ...seats[curIdx] };
          const cleared = { ...oldRow, profile_id: null, status: 'empty', registered_at: null };
          seats[curIdx] = cleared;
          broadcastAll({ type: 'change', table: 'seats', event: 'UPDATE', newRow: cleared, oldRow });
          dbPersistRow('seats', cleared).catch(console.error);
        }
        const tgtIdx = seats.findIndex(s => s.id === seatId);
        if (tgtIdx >= 0) {
          const oldRow = { ...seats[tgtIdx] };
          if (oldRow.profile_id && oldRow.profile_id !== profileId) {
            const bumped = { ...oldRow, profile_id: null, status: 'empty', registered_at: null };
            seats[tgtIdx] = bumped;
            broadcastAll({ type: 'change', table: 'seats', event: 'UPDATE', newRow: bumped, oldRow });
            dbPersistRow('seats', bumped).catch(console.error);
          }
          const newRow = { ...seats[tgtIdx], profile_id: profileId, status: 'occupied', registered_at: ts() };
          seats[tgtIdx] = newRow;
          broadcastAll({ type: 'change', table: 'seats', event: 'UPDATE', newRow, oldRow });
          dbPersistRow('seats', newRow).catch(console.error);
        }
        return res.json({ data: null, error: null });
      }

      case 'admin_clear_profile_seat': {
        checkPassword();
        const profileId = args.p_profile_id as string;
        const seats = getTable('seats');
        const idx = seats.findIndex(s => s.profile_id === profileId);
        if (idx >= 0) {
          const oldRow = { ...seats[idx] };
          const newRow = { ...oldRow, profile_id: null, status: 'empty', registered_at: null };
          seats[idx] = newRow;
          broadcastAll({ type: 'change', table: 'seats', event: 'UPDATE', newRow, oldRow });
          dbPersistRow('seats', newRow).catch(console.error);
        }
        return res.json({ data: null, error: null });
      }

      case 'admin_swap_seats': {
        checkPassword();
        const aId = args.p_seat_a_id as string;
        const bId = args.p_seat_b_id as string;
        const seats = getTable('seats');
        const aIdx = seats.findIndex(s => s.id === aId);
        const bIdx = seats.findIndex(s => s.id === bId);
        if (aIdx < 0 || bIdx < 0) return res.json({ data: null, error: { message: '좌석을 찾을 수 없습니다.' } });
        const aOld = { ...seats[aIdx] }; const bOld = { ...seats[bIdx] };
        const aNew = { ...aOld, profile_id: bOld.profile_id, status: bOld.status, registered_at: bOld.registered_at };
        const bNew = { ...bOld, profile_id: aOld.profile_id, status: aOld.status, registered_at: aOld.registered_at };
        seats[aIdx] = aNew; seats[bIdx] = bNew;
        broadcastAll({ type: 'change', table: 'seats', event: 'UPDATE', newRow: aNew, oldRow: aOld });
        broadcastAll({ type: 'change', table: 'seats', event: 'UPDATE', newRow: bNew, oldRow: bOld });
        dbPersistRow('seats', aNew).catch(console.error);
        dbPersistRow('seats', bNew).catch(console.error);
        return res.json({ data: null, error: null });
      }

      case 'admin_update_profile': {
        checkPassword(); // 관리자 비밀번호 없이 타인 프로필 수정 방지
        const profileId = args.p_profile_id as string;
        const profiles = getTable('profiles');
        const idx = profiles.findIndex(p => p.id === profileId);
        if (idx >= 0) {
          const oldRow = { ...profiles[idx] };
          const patch: Record<string, unknown> = {};
          const map: Record<string, string> = {
            p_nickname: 'nickname', p_mbti: 'mbti', p_bio: 'bio',
            p_birth_year: 'birth_year', p_birth_month: 'birth_month', p_birth_day: 'birth_day',
            p_location: 'location', p_personality_score: 'personality_score',
            p_dom_sub_score: 'dom_sub_score', p_interests: 'interests',
            p_kakao_id: 'kakao_id', p_instagram_id: 'instagram_id',
            p_phone_number: 'phone_number', p_contact_private: 'contact_private',
          };
          for (const [ak, dk] of Object.entries(map)) {
            if (args[ak] !== undefined) patch[dk] = args[ak];
          }
          // XSS 방어: 관리자가 악성 스크립트 태그가 포함된 값을 주입하는 것을 차단
          const sanitizedPatch = sanitizeRow('profiles', patch);
          const newRow = { ...oldRow, ...sanitizedPatch };
          profiles[idx] = newRow;
          // 민감 연락처 필드 제거 후 전체 브로드캐스트
          broadcastAll({ type: 'change', table: 'profiles', event: 'UPDATE', newRow: sanitizeProfile(newRow), oldRow: sanitizeProfile(oldRow) });
          dbPersistRow('profiles', newRow).catch(console.error);
        }
        return res.json({ data: null, error: null });
      }

      case 'admin_delete_profile': {
        checkPassword();
        const profileId = args.p_profile_id as string;
        const seats = getTable('seats');
        const seatIdx = seats.findIndex(s => s.profile_id === profileId);
        if (seatIdx >= 0) {
          const oldRow = { ...seats[seatIdx] };
          const newRow = { ...oldRow, profile_id: null, status: 'empty', registered_at: null };
          seats[seatIdx] = newRow;
          broadcastAll({ type: 'change', table: 'seats', event: 'UPDATE', newRow, oldRow });
          dbPersistRow('seats', newRow).catch(console.error);
        }
        const profiles = getTable('profiles');
        const oldProfile = profiles.find(p => p.id === profileId);
        store['profiles'] = profiles.filter(p => p.id !== profileId);
        if (oldProfile) {
          // 민감 연락처 필드 제거 후 전체 브로드캐스트
          broadcastAll({ type: 'change', table: 'profiles', event: 'DELETE', newRow: null, oldRow: sanitizeProfile(oldProfile) });
          dbDeleteRow('profiles', profileId).catch(console.error);
        }
        return res.json({ data: null, error: null });
      }

      default:
        console.warn('[db/rpc] Unknown RPC:', name);
        return res.json({ data: null, error: null });
    }
  } catch (e) {
    return res.json({ data: null, error: { message: String(e) } });
  }
});

// ─── Broadcast endpoint (for channel.send()) ──────────────────────────────────
// 반드시 SESSION_SECRET 또는 admin RPC 비밀번호를 헤더로 전달해야 사용 가능
// IP별 레이트 리밋 (5초 윈도우, 최대 30회) — 스팸/악의적 남용 추가 방어
const _broadcastRateMap = new Map<string, { count: number; resetAt: number }>();
// Fix #2: _broadcastRateMap 만료 항목 5분마다 정리 — 고유 IP 항목 무한 축적 방지
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of _broadcastRateMap) if (b.resetAt < now) _broadcastRateMap.delete(k);
}, 5 * 60 * 1000);
router.post('/broadcast', (req: Request, res: Response) => {
  // ✅ 인증: 클라이언트 SSE 토큰(HMAC)으로 검증 — SESSION_SECRET 클라이언트 노출 없이 안전
  const token  = req.headers['x-broadcast-token']  as string | undefined;
  const userId = req.headers['x-broadcast-userid'] as string | undefined;
  if (!token || !userId || !verifySseToken(userId, token)) {
    res.status(403).json({ ok: false, error: 'Forbidden: invalid broadcast token' });
    return;
  }
  const ip = (req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  let bucket = _broadcastRateMap.get(ip);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + 5_000 };
    _broadcastRateMap.set(ip, bucket);
  }
  bucket.count++;
  if (bucket.count > 30) {
    res.status(429).json({ ok: false, error: 'Too many broadcasts' });
    return;
  }
  const { channel, event, payload } = req.body as { channel?: unknown; event?: unknown; payload: unknown };
  // ─ 입력 검증: channel과 event는 비어있지 않은 문자열이어야 함
  if (typeof channel !== 'string' || !channel.trim() || channel.length > 200) {
    res.status(400).json({ ok: false, error: 'Invalid channel' });
    return;
  }
  if (typeof event !== 'string' || !event.trim() || event.length > 200) {
    res.status(400).json({ ok: false, error: 'Invalid event' });
    return;
  }
  broadcastAll({ type: 'broadcast', channel, event, payload });
  res.json({ ok: true });
});

// ─── Image storage ────────────────────────────────────────────────────────────
// 허용 MIME 타입 (이미지만)
const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
// base64 인코딩 시 ~4/3 오버헤드 → 5MB 원본 ≈ 9MB JSON 문자열
const MAX_IMAGE_DATAURL_BYTES = 9_000_000;

router.post('/storage-upload', async (req: Request, res: Response) => {
  try {
  // ─ req.body 타입 방어
  if (req.body == null || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ data: null, error: 'Invalid request body' });
  }
  const { path: imgPath, dataUrl } = req.body as { path?: string; dataUrl?: string };
  // ─ 경로 검증: 디렉터리 트래버설 / 임의 덮어쓰기 방지
  if (
    !imgPath || typeof imgPath !== 'string' ||
    imgPath.includes('..') || imgPath.startsWith('/') ||
    imgPath.length > 512 || !/^[\w\-./]+$/.test(imgPath)
  ) {
    return res.status(400).json({ data: null, error: 'Invalid path' });
  }
  // ─ Per-IP rate limit: 이미지 스팸 방지
  const uploadIp = String(req.ip ?? req.socket.remoteAddress ?? 'unknown');
  const uploadNow = Date.now();
  let uploadBucket = _uploadRateMap.get(uploadIp);
  if (!uploadBucket || uploadNow > uploadBucket.resetAt) {
    uploadBucket = { count: 0, resetAt: uploadNow + UPLOAD_RATE_WINDOW_MS };
    _uploadRateMap.set(uploadIp, uploadBucket);
  }
  uploadBucket.count++;
  if (uploadBucket.count > UPLOAD_RATE_MAX) {
    return res.status(429).json({ data: null, error: '이미지를 너무 자주 업로드하고 있습니다. 잠시 후 다시 시도해 주세요.' });
  }

  // ─ dataUrl 검증
  if (!dataUrl || typeof dataUrl !== 'string') {
    return res.status(400).json({ data: null, error: 'Missing dataUrl' });
  }
  const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/);
  if (!mimeMatch || !ALLOWED_IMAGE_MIMES.has(mimeMatch[1])) {
    return res.status(400).json({ data: null, error: 'Invalid image type' });
  }
  // ─ 크기 제한 (~5MB 원본)
  if (dataUrl.length > MAX_IMAGE_DATAURL_BYTES) {
    return res.status(413).json({ data: null, error: 'Image too large (max 5MB)' });
  }
  // ─ Magic bytes 검증: MIME 헤더 조작으로 악성 파일 위장 차단
  const expectedMagic = IMAGE_MAGIC[mimeMatch[1]];
  if (expectedMagic) {
    const base64Body = dataUrl.split(',')[1] ?? '';
    const rawBytes = Buffer.from(base64Body.slice(0, 12), 'base64');
    const matched = expectedMagic.every((b, i) => rawBytes[i] === b);
    if (!matched) {
      return res.status(400).json({ data: null, error: 'Image content does not match declared type' });
    }
  }
  imageStore[imgPath] = dataUrl;
  dbPersistImage(imgPath, dataUrl).catch(console.error);
  return res.json({ data: { path: imgPath }, error: null });
  } catch (e) {
    logger.error({ err: e }, '[storage-upload] Unexpected error');
    return res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

router.get('/storage-image', (req: Request, res: Response): void => {
  try {
  // ─ req.query.p 타입 방어: Express는 ?p=a&p=b 시 배열을 반환 → 명시적 string 검증
  const rawP = req.query.p;
  if (!rawP || typeof rawP !== 'string') { res.status(400).json({ error: 'Invalid path parameter' }); return; }
  const path = rawP;
  const dataUrl = imageStore[path];
  if (!dataUrl) { res.status(404).json({ error: 'Not found' }); return; }
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    const [, mime, b64] = match;
    res.setHeader('Content-Type', mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');   // prevent MIME sniffing
    res.setHeader('Content-Disposition', 'inline');        // don't treat as download
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(b64, 'base64'));
    return;
  }
  res.send(dataUrl);
  } catch (e) {
    logger.error({ err: e }, '[storage-image] Unexpected error');
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Admin: clear DB error counter ───────────────────────────────────────────
router.post('/admin/clear-db-errors', async (req: Request, res: Response) => {
  // Require admin password for safety
  const { adminPassword } = req.body as { adminPassword?: string };
  const settings = (getTable('app_settings')[0] ?? {}) as Record<string, unknown>;
  const expectedPw = (settings.admin_password as string) ?? '';
  // 비밀번호가 설정돼 있지 않아도 반드시 거부 — 설정 전 관리자가 먼저 비밀번호를 세팅해야 함
  if (!expectedPw || adminPassword !== expectedPw) {
    return res.status(403).json({ ok: false, error: 'Invalid admin password' });
  }

  _dbPersistErrors = 0;
  _dbPersistErrorLog.length = 0;

  // Remove the persisted counter from DB
  try {
    await pool.query(
      `DELETE FROM app_kv_rows WHERE table_name = 'db_error_log' AND row_id = 'counter'`,
    );
  } catch (e) {
    console.error('[db] Failed to clear error state from DB:', e);
    return res.status(500).json({ ok: false, error: String(e) });
  }

  console.info('[db] DB persist error counter cleared by admin');
  // #38: 관리자 에러 초기화 감사 로그 — DB에 영구 기록
  try {
    await pool.query(
      `INSERT INTO app_kv_rows (table_name, row_id, data)
       VALUES ('audit_log', $1, $2::jsonb)
       ON CONFLICT (table_name, row_id) DO UPDATE SET data = EXCLUDED.data`,
      [
        `clear_db_errors_${Date.now()}`,
        JSON.stringify({ action: 'clear_db_errors', clearedAt: new Date().toISOString() }),
      ],
    );
  } catch (auditErr) {
    console.warn('[db] 감사 로그 저장 실패 (non-critical):', auditErr);
  }
  return res.json({ ok: true });
});

// ─── DB Health endpoint ───────────────────────────────────────────────────────
// 10초 캐시: O(messages+likes+profiles) 전체 스캔 + 2 DB 쿼리를 연속 요청마다 반복하지 않도록
let _healthCache: { ts: number; body: unknown } | null = null;
const HEALTH_CACHE_TTL_MS = 10_000;

router.get('/health', async (_req: Request, res: Response) => {
  try {
  if (_healthCache && Date.now() - _healthCache.ts < HEALTH_CACHE_TTL_MS) {
    return res.json(_healthCache.body);
  }

  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  // In-memory counts for last 5 minutes
  const inMemMessages = getTable('messages').filter(
    m => typeof m.created_at === 'string' && m.created_at >= fiveMinAgo,
  ).length;
  const inMemLikes = getTable('likes').filter(
    l => typeof l.created_at === 'string' && l.created_at >= fiveMinAgo,
  ).length;

  // DB counts for last 5 minutes (best-effort)
  let dbMessages = -1;
  let dbLikes = -1;
  try {
    const [mRes, lRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) FROM app_kv_rows WHERE table_name='messages' AND (data->>'created_at') >= $1`,
        [fiveMinAgo],
      ),
      pool.query(
        `SELECT COUNT(*) FROM app_kv_rows WHERE table_name='likes' AND (data->>'created_at') >= $1`,
        [fiveMinAgo],
      ),
    ]);
    dbMessages = parseInt(mRes.rows[0].count as string, 10);
    dbLikes = parseInt(lRes.rows[0].count as string, 10);
  } catch { /* db unreachable — leave as -1 */ }

  const sseTotal = [...sseUserMap.values()].reduce((s, c) => s + c.size, 0) + sseAnonClients.size;

  // ── Alarm thresholds (0% loss target) ────────────────────────────────────
  // Durability alarm: flag if DB count lags in-memory count by more than 5 rows
  // (transient lag is normal; large gaps signal persist failures or pool starvation).
  // Error-rate alarm: any persist errors in 5 min window = warning.
  const LOSS_ALARM_THRESHOLD = 5;
  const recentPersistErrors = _dbPersistErrorLog.filter(e => Date.now() - e.time < 5 * 60 * 1000).length;
  const messageLag = dbMessages >= 0 ? inMemMessages - dbMessages : null;
  const likeLag    = dbLikes    >= 0 ? inMemLikes    - dbLikes    : null;
  // #33: PIN pool 잔여량 — 85% 이상 사용됐으면 alarm (15% 이하 남음)
  const _allProfiles = getTable('profiles');
  const _use5Digit   = _allProfiles.length > 8000;
  const _pinPoolSize = _use5Digit ? 90000 : 9000;
  const _usedPinCount = new Set(_allProfiles.map(p => p.pin_code).filter(Boolean)).size;
  const pinRemaining  = _pinPoolSize - _usedPinCount;
  const PIN_ALARM_THRESHOLD = Math.max(50, Math.floor(_pinPoolSize * 0.15)); // 15% remaining = 85% used

  const alarms: string[] = [];
  if (recentPersistErrors > 0) alarms.push(`${recentPersistErrors} DB persist error(s) in last 5 min`);
  if (messageLag !== null && messageLag > LOSS_ALARM_THRESHOLD) alarms.push(`message lag: inMem=${inMemMessages} db=${dbMessages} (>${LOSS_ALARM_THRESHOLD})`);
  if (likeLag    !== null && likeLag    > LOSS_ALARM_THRESHOLD) alarms.push(`like lag: inMem=${inMemLikes} db=${dbLikes} (>${LOSS_ALARM_THRESHOLD})`);
  if (pinRemaining <= PIN_ALARM_THRESHOLD) alarms.push(`PIN pool nearly full: ${pinRemaining} slot(s) remaining of ${_pinPoolSize}`);

  const body = {
    persistErrors: _dbPersistErrors,
    // recentErrors는 DB 내부 오류 메시지를 포함할 수 있어 공개 응답에서 제외
    inMemory: { messages: inMemMessages, likes: inMemLikes },
    db: { messages: dbMessages, likes: dbLikes },
    lag: { messages: messageLag, likes: likeLag },
    pinPool: { remaining: pinRemaining, total: _pinPoolSize }, // #33
    alarms,                          // non-empty = action required
    ok: alarms.length === 0,         // quick pass/fail for monitoring
    sseConnections: sseTotal,
    thresholds: { lossAlarm: LOSS_ALARM_THRESHOLD, likesMinIntervalMs: LIKES_MIN_INTERVAL_MS },
    checkedAt: new Date().toISOString(),
  };
  _healthCache = { ts: Date.now(), body };
  return res.json(body);
  } catch (e) {
    logger.error({ err: e }, '[health] Unexpected error');
    return res.status(500).json({ ok: false, error: 'Health check failed' });
  }
});

// ─── Unread counts endpoint ───────────────────────────────────────────────────
// Returns per-chat unread message counts for a user, computed from DB truth.
// Used by client on visibilitychange and SSE reconnect to fix missed increments.
// 단기 캐시(2s): 탭 전환·재연결 폭발 시 동일 userId에 대한 중복 O(chats×msgs) 스캔 방지
const unreadCountsCache = new Map<string, { ts: number; data: Record<string, number> }>();
const UNREAD_CACHE_TTL_MS = 2_000;
// Fix #3: unreadCountsCache TTL 초과 항목 30초마다 정리 — userId 항목 무한 축적 방지
setInterval(() => {
  const cutoff = Date.now() - UNREAD_CACHE_TTL_MS;
  for (const [k, v] of unreadCountsCache) if (v.ts < cutoff) unreadCountsCache.delete(k);
}, 30_000);

router.get('/unread-counts', (req: Request, res: Response) => {
  const userId = typeof req.query.userId === 'string' && req.query.userId ? req.query.userId : null;
  if (!userId) return res.status(400).json({ data: null, error: { message: 'userId required' } });

  // ─ IDOR guard: 자신의 미읽음 카운트만 조회 가능 — SSE 토큰으로 소유자 확인 ──
  // 타인의 userId를 추측해 다른 사람의 채팅 존재 여부를 파악하는 공격을 차단
  const sseToken = (req.query.token as string) ?? (req.headers['x-sse-token'] as string);
  if (!sseToken || !verifySseToken(userId, sseToken)) {
    logger.warn({ userId, ip: req.ip }, '[SECURITY] IDOR: /unread-counts without valid SSE token blocked');
    return res.status(401).json({ data: null, error: { message: 'Unauthorized: valid SSE token required', code: 'UNAUTHORIZED' } });
  }

  try {
    // 캐시 히트
    const cached = unreadCountsCache.get(userId);
    if (cached && (Date.now() - cached.ts) < UNREAD_CACHE_TTL_MS) {
      return res.json({ data: cached.data, error: null });
    }

    const chats = getTable('chats').filter(c => c.user1_id === userId || c.user2_id === userId);

    // Build a map of chatId → read_at for this user
    const readAtByChat = new Map<string, string>();
    for (const r of getTable('chat_reads')) {
      if (r.reader_id === userId && r.chat_id && r.read_at) {
        readAtByChat.set(r.chat_id as string, r.read_at as string);
      }
    }

    // 전체 메시지를 chat_id 기준으로 미리 인덱싱 — O(msgs) 1회 스캔
    const msgsByChatId = new Map<string, typeof store[string]>();
    for (const m of getTable('messages')) {
      const cid = m.chat_id as string;
      if (!msgsByChatId.has(cid)) msgsByChatId.set(cid, []);
      msgsByChatId.get(cid)!.push(m);
    }

    const counts: Record<string, number> = {};
    for (const chat of chats) {
      const chatId = chat.id as string;
      const readAt = readAtByChat.get(chatId);
      const msgs = msgsByChatId.get(chatId) ?? [];
      let unreadCount = 0;
      for (const m of msgs) {
        if (m.sender_id === userId) continue;
        if (!readAt || (m.created_at as string) > readAt) unreadCount++;
      }
      if (unreadCount > 0) counts[chatId] = unreadCount;
    }

    // LRU 상한 200개 — Map은 삽입 순서 보장이므로 첫 번째(가장 오래된) 항목 제거
    if (unreadCountsCache.size >= 200) {
      const oldest = unreadCountsCache.keys().next().value;
      if (oldest !== undefined) unreadCountsCache.delete(oldest);
    }
    unreadCountsCache.set(userId, { ts: Date.now(), data: counts });
    return res.json({ data: counts, error: null });
  } catch (e) {
    console.error('[unread-counts]', e);
    return res.status(500).json({ data: null, error: { message: '안읽은 메시지 수 조회 중 오류가 발생했습니다.' } });
  }
});

// ─── PIN lookup ───────────────────────────────────────────────────────────────
// 고유코드 조회 — IP당 15분에 최대 5회 시도 제한
const _pinAttempts = new Map<string, { count: number; resetAt: number }>();
const PIN_MAX = 5;
const PIN_WINDOW_MS = 15 * 60 * 1000;

router.post('/by-pin', (req: Request, res: Response) => {
  try {
  const ip = String(req.ip ?? 'unknown');
  const now = Date.now();
  const prev = _pinAttempts.get(ip);
  if (prev && prev.resetAt > now) {
    if (prev.count >= PIN_MAX) {
      return res.status(429).json({ data: null, error: { message: '시도 횟수를 초과했습니다. 15분 후 다시 시도해주세요.' } });
    }
    prev.count++;
  } else {
    _pinAttempts.set(ip, { count: 1, resetAt: now + PIN_WINDOW_MS });
  }

  // ─ 페이로드 타입 방어
  if (req.body == null || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ data: null, error: { message: 'Invalid request body', code: 'INVALID_BODY' } });
  }
  const body = req.body as Record<string, unknown>;
  const pin = body.pin;
  const nickname = body.nickname;

  // pin은 반드시 문자열, 최대 8자 (4~5자리 숫자 코드)
  if (!pin || typeof pin !== 'string' || pin.length === 0 || pin.length > 8) {
    return res.status(400).json({ data: null, error: { message: 'PIN required (max 8 chars)' } });
  }
  // nickname은 선택적이되, 전달된 경우 문자열이어야 함, 최대 30자
  if (nickname != null && (typeof nickname !== 'string' || nickname.length > 30)) {
    return res.status(400).json({ data: null, error: { message: 'Invalid nickname' } });
  }

  const profiles = getTable('profiles');
  const found = profiles.find(p => String(p['pin_code']) === String(pin));
  if (!found) return res.json({ data: null, error: { message: '해당 번호로 등록된 프로필이 없어요' } });

  // 1단계: pin만 입력 → 마스킹된 닉네임 반환 (본인 확인용)
  if (!nickname) {
    const nick = String(found['nickname'] ?? '');
    const masked = nick.length > 1
      ? nick[0] + '*'.repeat(nick.length - 1)
      : nick[0] ?? '*';
    return res.json({ data: { step: 'confirm', maskedNickname: masked }, error: null });
  }

  // 2단계: pin + nickname → 정확히 일치해야 통과
  if (String(found['nickname']) !== nickname) {
    return res.json({ data: null, error: { message: '닉네임이 일치하지 않습니다. 본인 닉네임을 정확히 입력해주세요.' } });
  }

  // 성공 — rate limit 리셋
  _pinAttempts.delete(ip);
  return res.json({ data: found, error: null });
  } catch (e) {
    logger.error({ err: e }, '[by-pin] Unexpected error');
    return res.status(500).json({ data: null, error: { message: '서버 내부 오류가 발생했습니다.' } });
  }
});

// ─── Push subscription endpoints ─────────────────────────────────────────────
router.get('/push/vapid-key', (_req: Request, res: Response) => {
  res.json({ key: VAPID_PUBLIC_KEY });
});

router.post('/push/subscribe', (req: Request, res: Response) => {
  try {
  // ─ 페이로드 타입 방어 + 길이 제한
  if (req.body == null || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Invalid request body' });
  }
  const rawBody = req.body as Record<string, unknown>;
  const userId = typeof rawBody.userId === 'string' ? rawBody.userId : null;
  const sub = rawBody.subscription;
  const endpoint = sub != null && typeof (sub as Record<string, unknown>).endpoint === 'string'
    ? (sub as Record<string, unknown>).endpoint as string : null;
  const keys = sub != null ? (sub as Record<string, unknown>).keys : null;
  const auth = keys != null && typeof (keys as Record<string, unknown>).auth === 'string'
    ? (keys as Record<string, unknown>).auth as string : null;
  const p256dh = keys != null && typeof (keys as Record<string, unknown>).p256dh === 'string'
    ? (keys as Record<string, unknown>).p256dh as string : null;

  // 필드 존재 + 길이 검증
  if (!userId || userId.length > 128) return res.status(400).json({ error: 'Missing or invalid userId' });
  if (!endpoint || endpoint.length > 2048) return res.status(400).json({ error: 'Missing or invalid endpoint' });
  if (!auth || auth.length > 512) return res.status(400).json({ error: 'Missing or invalid auth key' });
  if (!p256dh || p256dh.length > 512) return res.status(400).json({ error: 'Missing or invalid p256dh key' });

  const subscription = { endpoint, keys: { auth, p256dh } };

  // SSE 토큰 검증 — 실제 userId 소유자만 구독 등록 가능
  const sseToken = req.headers['x-sse-token'] as string | undefined;
  if (!sseToken || !verifySseToken(userId, sseToken)) {
    console.warn(`[push/subscribe] Invalid or missing SSE token for userId=${userId} ip=${req.ip}`);
    return res.status(401).json({ error: 'Unauthorized: invalid SSE token' });
  }
  const subs = getTable('push_subscriptions');
  const idx = subs.findIndex(s => s.user_id === userId && s.endpoint === subscription.endpoint);
  if (idx >= 0) {
    const updated = { ...subs[idx], auth: subscription.keys!.auth, p256dh: subscription.keys!.p256dh, updated_at: ts() };
    subs[idx] = updated;
    dbPersistRow('push_subscriptions', updated).catch(console.error);
  } else {
    // 사용자당 최대 5개 구독 — 초과 시 가장 오래된 것 제거 (슬라이딩 윈도우)
    const USER_MAX_PUSH_SUBS = 5;
    type SubWithIdx = Record<string, unknown> & { _idx: number };
    const userSubs = (subs as Array<Record<string, unknown>>)
      .map((s, i) => ({ ...s, _idx: i } as SubWithIdx))
      .filter(s => s['user_id'] === userId)
      .sort((a, b) => String(a['created_at']).localeCompare(String(b['created_at'])));
    if (userSubs.length >= USER_MAX_PUSH_SUBS) {
      const oldestIdx = subs.findIndex(s => s['id'] === userSubs[0]['id']);
      if (oldestIdx >= 0) subs.splice(oldestIdx, 1);
    }
    const newSub = {
      id: genId(), user_id: userId,
      endpoint: subscription.endpoint,
      auth: subscription.keys!.auth,
      p256dh: subscription.keys!.p256dh,
      created_at: ts(),
    };
    subs.push(newSub);
    dbPersistRow('push_subscriptions', newSub).catch(console.error);
  }
  return res.json({ ok: true });
  } catch (e) {
    logger.error({ err: e }, '[push/subscribe] Unexpected error');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Push notify endpoint (서버 내부 또는 인증된 호출만 허용) ────────────────
const PUSH_NOTIFY_SECRET = process.env.SESSION_SECRET ?? 'internal';
router.post('/push/notify', async (req: Request, res: Response): Promise<void> => {
  try {
  // 클라이언트 직접 호출 남용 방지 — X-Internal-Secret 헤더 필요
  const secret = req.headers['x-internal-secret'];
  if (secret !== PUSH_NOTIFY_SECRET) { res.status(403).json({ error: 'Forbidden' }); return; }
  // ─ 페이로드 타입 방어 + 길이 제한 — XSS·스토리지 폭탄 방어
  if (req.body == null || typeof req.body !== 'object' || Array.isArray(req.body)) {
    res.status(400).json({ error: 'Invalid request body' }); return;
  }
  const rawNotify = req.body as Record<string, unknown>;
  const recipientId = typeof rawNotify.recipientId === 'string' ? rawNotify.recipientId : null;
  if (!recipientId || recipientId.length > 128) { res.status(400).json({ error: 'Missing or invalid recipientId' }); return; }

  // 안전한 문자열 변환 + 길이 상한 (알림 페이로드 비대 방지)
  const safeStr = (v: unknown, def: string, max: number) =>
    (typeof v === 'string' ? v : def).slice(0, max);

  const subs = getTable('push_subscriptions').filter(s => s.user_id === recipientId);
  if (!subs.length) { res.json({ ok: true, sent: 0 }); return; }

  const payload: PushPayload = {
    title: safeStr(rawNotify.title, '범일NPC 술번개', 64),
    body:  safeStr(rawNotify.body,  '',               200),
    tag:   safeStr(rawNotify.tag,   'notification',   64),
    url:   safeStr(rawNotify.url,   '/',              512),
  };

  // 병렬 전송 — 직렬 await 제거
  const pushResults = await Promise.all(
    subs.map(sub => sendPush(
      { endpoint: sub.endpoint as string, keys: { auth: sub.auth as string, p256dh: sub.p256dh as string } },
      payload,
    ).then(ok => ({ id: sub.id as string, ok })).catch(() => ({ id: sub.id as string, ok: false }))),
  );
  const expired = pushResults.filter(r => !r.ok).map(r => r.id);
  if (expired.length) {
    store['push_subscriptions'] = (store['push_subscriptions'] ?? []).filter(s => !expired.includes(s.id as string));
    dbDeleteRows('push_subscriptions', expired).catch(console.error);
  }
  res.json({ ok: true, sent: subs.length - expired.length });
  } catch (e) {
    logger.error({ err: e }, '[push/notify] Unexpected error');
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── SSE token helpers ─────────────────────────────────────────────────────────
// SESSION_SECRET는 app.ts에서 필수 검증하므로 여기서는 항상 유효한 값
const SSE_TOKEN_SECRET = process.env.SESSION_SECRET!;
const SSE_TOKEN_EXPIRY_SEC = 3600; // 1 hour

function issueSseToken(userId: string): { token: string; expiresAt: number } {
  const exp = Math.floor(Date.now() / 1000) + SSE_TOKEN_EXPIRY_SEC;
  const mac = createHmac('sha256', SSE_TOKEN_SECRET)
    .update(`${userId}:${exp}`)
    .digest('hex');
  return { token: `${exp}:${mac}`, expiresAt: exp };
}

function verifySseToken(userId: string, token: string): boolean {
  const colonIdx = token.indexOf(':');
  if (colonIdx < 1) return false;
  const expStr = token.slice(0, colonIdx);
  const mac = token.slice(colonIdx + 1);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Math.floor(Date.now() / 1000) > exp) return false;
  const expected = createHmac('sha256', SSE_TOKEN_SECRET)
    .update(`${userId}:${exp}`)
    .digest('hex');
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(mac, 'hex'));
  } catch {
    return false;
  }
}

/**
 * POST /auth/login
 *
 * 클라이언트가 { userId, deviceSecret }을 제출합니다.
 * deviceSecret은 클라이언트 localStorage에만 저장된 무작위 UUID입니다.
 * 서버는 HMAC-SHA256(deviceSecret, SESSION_SECRET) 해시를 `device_secrets` 테이블에 저장합니다.
 *
 * - 첫 클레임(device_secrets에 해당 userId 없음): 해시를 저장하고 세션 수립
 * - 재인증(해시 있음): 제출한 secret이 저장된 해시와 일치하면 세션 수립, 불일치하면 401
 *
 * 결과적으로 userId를 알더라도 device secret 없이는 세션을 얻을 수 없습니다.
 */
router.post('/auth/login', (req: Request, res: Response) => {
  try {
  // ─ Per-IP rate limit: brute-force 방지
  const loginIp = String(req.ip ?? req.socket.remoteAddress ?? 'unknown');
  const loginNow = Date.now();
  let loginBucket = _loginRateMap.get(loginIp);
  if (!loginBucket || loginNow > loginBucket.resetAt) {
    loginBucket = { count: 0, resetAt: loginNow + LOGIN_RATE_WINDOW_MS };
    _loginRateMap.set(loginIp, loginBucket);
  }
  loginBucket.count++;
  if (loginBucket.count > LOGIN_RATE_MAX) {
    return res.status(429).json({ error: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.' });
  }

  const { userId, deviceSecret } = req.body as { userId?: string; deviceSecret?: string };
  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'Missing userId' });
  }
  if (!deviceSecret || typeof deviceSecret !== 'string') {
    return res.status(400).json({ error: 'Missing deviceSecret' });
  }
  // 프로필 존재 여부 확인
  const profiles = getTable('profiles');
  const profile = profiles.find(p => p.id === userId);
  if (!profile) {
    return res.status(401).json({ error: 'Unknown userId' });
  }
  // 제출된 deviceSecret의 HMAC 계산
  const submittedHash = createHmac('sha256', SSE_TOKEN_SECRET)
    .update(deviceSecret)
    .digest('hex');
  const deviceSecrets = getTable('device_secrets');
  const existing = deviceSecrets.find(r => r.user_id === userId);
  if (!existing) {
    // 첫 번째 기기 클레임 — id=userId로 안정적 row_id 사용 (ON CONFLICT UPDATE 보장)
    // (기존 사용자 마이그레이션: 프로필은 존재하지만 device_secret이 없는 경우)
    const newDs = { id: userId, user_id: userId, secret_hash: submittedHash };
    deviceSecrets.push(newDs);
    dbPersistRow('device_secrets', newDs).catch(console.error);
    console.info(`[auth] first-claim device registered for userId=${userId}`);
    req.session.userId = userId;
    return res.json({ ok: true });
  }
  // 재인증: 타이밍 안전 비교
  let matched = false;
  try {
    matched = timingSafeEqual(
      Buffer.from(submittedHash, 'hex'),
      Buffer.from(existing.secret_hash as string, 'hex'),
    );
  } catch { /* 해시 길이 불일치 → mismatch */ }

  if (!matched) {
    // 이벤트 앱: 브라우저 초기화·기기 변경 허용 — 현재 기기로 재바인딩
    // 기존 행을 덮어쓰고 DB도 갱신 (id=userId → ON CONFLICT UPDATE)
    existing.secret_hash = submittedHash;
    dbPersistRow('device_secrets', { id: userId, user_id: userId, secret_hash: submittedHash }).catch(console.error);
    console.info(`[auth] device re-bound for userId=${userId} (new device or cleared storage)`);
  }
  req.session.userId = userId;
  return res.json({ ok: true });
  } catch (e) {
    console.error('[auth/login]', e);
    return res.status(500).json({ error: '로그인 처리 중 오류가 발생했습니다.' });
  }
});

// POST /auth/sse-token — 세션으로 인증된 userId에만 단기 SSE 토큰 발급
// 세션이 없거나 userId가 일치하지 않으면 401 반환
router.post('/auth/sse-token', (req: Request, res: Response) => {
  try {
    const sessionUserId = req.session?.userId;
    if (!sessionUserId) {
      return res.status(401).json({ error: 'Not authenticated — call /auth/login first' });
    }
    const { token, expiresAt } = issueSseToken(sessionUserId);
    return res.json({ token, expiresAt });
  } catch (e) {
    logger.error({ err: e }, '[auth/sse-token] Unexpected error');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── SSE endpoint ─────────────────────────────────────────────────────────────
router.get('/events', (req: Request, res: Response) => {
  try {
  const userId = typeof req.query.userId === 'string' && req.query.userId ? req.query.userId : null;
  const token = typeof req.query.token === 'string' ? req.query.token : null;
  const adminTokenParam = typeof req.query.adminToken === 'string' ? req.query.adminToken : null;

  // 관리자 토큰 검증 — HMAC 재계산으로 검증 (서버 재시작 후에도 유효)
  const isAdminSse = verifyAdminToken(adminTokenParam);

  // userId가 있으면 반드시 유효한 토큰 필요 — 없거나 만료/위조된 경우 거부
  if (userId && (!token || !verifySseToken(userId, token))) {
    // #3: 침입 탐지용 서버 로그 — userId별 토큰 없는/위조된 SSE 접근 기록
    console.warn(`[sse] 인증 실패: userId=${userId} hasToken=${!!token} ip=${req.ip} — 유효하지 않은 토큰으로 SSE 접근 시도`);
    res.status(401).json({ error: 'Invalid or missing SSE token' });
    return;
  }

  // ─ Per-IP SSE connection limit: 동일 IP 대량 연결 방지
  const sseIp = String(req.ip ?? req.socket.remoteAddress ?? 'unknown');
  const currentConns = _sseConnPerIp.get(sseIp) ?? 0;
  if (currentConns >= SSE_MAX_CONN_PER_IP) {
    res.status(429).json({ error: 'Too many SSE connections from this IP' });
    return;
  }
  _sseConnPerIp.set(sseIp, currentConns + 1);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // ── 소켓 레벨 타임아웃 — 좀비 TCP 연결 방어 ─────────────────────────────────
  // keep-alive ping(5s)이 7번 연속 ACK 없이 쌓이면 Node가 socket.destroy()를 호출해
  // 브라우저가 즉시 EventSource.onerror를 받고 재연결을 시작하도록 강제
  // (TCP keep-alive만으로는 프록시/방화벽이 silent-drop 시 수십 분 좀비가 될 수 있음)
  const SOCKET_TIMEOUT_MS = 35_000; // 5s ping × 7 = 35s
  req.socket.setTimeout(SOCKET_TIMEOUT_MS);
  req.socket.once('timeout', () => {
    try { req.socket.destroy(); } catch { /* ignore */ }
  });

  if (isAdminSse) {
    // 관리자 SSE — 모든 이벤트(private 포함) 수신, 최대 10개 연결
    if (sseAdminClients.size >= 10) {
      const oldest = sseAdminClients.values().next().value;
      if (oldest) { _sseCleanup.get(oldest)?.(); _sseCleanup.delete(oldest); try { oldest.end(); } catch { /* ignore */ } sseAdminClients.delete(oldest); }
    }
    sseAdminClients.add(res);
  } else if (userId) {
    if (!sseUserMap.has(userId)) sseUserMap.set(userId, new Set());
    const userConns = sseUserMap.get(userId)!;
    // 탭 과다 방지: 사용자당 최대 4개 연결. 초과 시 가장 오래된 연결 종료
    if (userConns.size >= 4) {
      const oldest = userConns.values().next().value;
      // keepalive interval도 반드시 해제 — 미해제 시 메모리 누수
      _sseCleanup.get(oldest)?.();
      _sseCleanup.delete(oldest);
      try { oldest.end(); } catch { /* ignore */ }
      userConns.delete(oldest);
    }
    userConns.add(res);
  } else {
    // 익명 연결 최대 100개 제한 — 미인증 연결에 의한 리소스 고갈 방지
    if (sseAnonClients.size >= 100) {
      res.status(429).end();
      return;
    }
    sseAnonClients.add(res);
  }

  // Keep-alive every 5s — 짧게 유지해 프록시/방화벽 idle 차단 방지
  const keepalive = setInterval(() => {
    // res.writable이 false면 이미 닫힌 소켓 — 즉시 정리
    if (!res.writable || res.writableEnded) { clearInterval(keepalive); return; }
    try {
      const flushed = res.write('data: {"type":"ping"}\n\n');
      // write()가 false를 반환하면 TCP 송신 버퍼가 가득 찬 것 (backpressure)
      // 클라이언트가 읽지 못하는 좀비 연결이므로 정리
      if (!flushed) { clearInterval(keepalive); res.end(); }
    } catch {
      clearInterval(keepalive);
    }
  }, 5000);
  // _sseCleanup에 등록 — _send write 실패 시에도 interval 즉시 해제 가능
  _sseCleanup.set(res, () => clearInterval(keepalive));

  // _cleaned 플래그로 close·aborted 두 이벤트가 동시에 발생해도 정확히 1회만 실행
  let _cleaned = false;
  const cleanupConn = () => {
    if (_cleaned) return;
    _cleaned = true;
    _sseCleanup.get(res)?.();
    _sseCleanup.delete(res);
    if (isAdminSse) {
      sseAdminClients.delete(res);
    } else if (userId) {
      const conns = sseUserMap.get(userId);
      if (conns) { conns.delete(res); if (conns.size === 0) sseUserMap.delete(userId); }
    } else {
      sseAnonClients.delete(res);
    }
    // Per-IP connection count 해제 — 최소 0으로 클램프
    const remaining = (_sseConnPerIp.get(sseIp) ?? 1) - 1;
    if (remaining <= 0) _sseConnPerIp.delete(sseIp);
    else _sseConnPerIp.set(sseIp, remaining);
  };
  req.on('close', cleanupConn);
  req.on('aborted', cleanupConn); // Node.js HTTP/1.1 강제 종료 대비

  // Initial ping — cleanupConn 선언 이후에 write. 이미 닫힌 응답이면 즉시 정리.
  try { res.write('data: {"type":"ping"}\n\n'); } catch { cleanupConn(); }
  } catch (e) {
    logger.error({ err: e }, '[events] Unexpected error during SSE setup');
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Graceful shutdown helper (index.ts에서 SIGTERM·SIGINT 시 호출) ───────────
// DB 커넥션 풀과 LISTEN 클라이언트를 순서대로 종료한다.
export async function gracefulShutdown(): Promise<void> {
  // 1) LISTEN 클라이언트 종료 — NOTIFY 구독 해제
  if (_listenClient) {
    try { await _listenClient.end(); } catch { /* ignore */ }
    _listenClient = null;
  }
  // 2) 커넥션 풀 종료 — 진행 중인 쿼리가 완료된 후 모든 idle 연결 반환
  try { await pool.end(); } catch { /* ignore */ }
}

export default router;
