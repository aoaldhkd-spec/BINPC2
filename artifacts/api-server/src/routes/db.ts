import '../lib/dns-ipv4-first.js';
import { Router, type Request, type Response } from 'express';
import pg from 'pg';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { VAPID_PUBLIC_KEY, sendPush, type PushPayload } from '../lib/push';
import { resolvePin, pinPoolParams } from '../lib/pin';
import { logger } from '../lib/logger';
import { buildPgOptions } from '../lib/pg-options.js';
import { createImageAccessPolicy } from '../lib/image-access';
import {
  sanitizeRow,
  sanitizeProfile,
  sanitizeProfileForViewer,
  sanitizeSettings,
} from '../lib/db-sanitize';
import { chatPairKey, deterministicChatId, deterministicSignalId } from '../lib/db-chat-ids';
import { collectBroadcastTargets as collectBroadcastTargetsImpl } from '../lib/db-broadcast-targets';
import {
  collectIntegrityDiagnostics,
  writeReferencesFor,
  type IntegrityDiagnostics,
} from '../lib/db-integrity';
import {
  RATE_MAP_MAX_SIZE,
  LOGIN_RATE_MAX,
  LOGIN_RATE_MAX_PER_IP,
  LOGIN_RATE_WINDOW_MS,
  UPLOAD_RATE_MAX,
  UPLOAD_RATE_MAX_PER_IP,
  UPLOAD_RATE_WINDOW_MS,
  loginRateMap as _loginRateMap,
  uploadRateMap as _uploadRateMap,
  broadcastRateMap as _broadcastRateMap,
  pruneRateMap,
  consumeRateLimit,
  venueLoginRateKeys,
  venueUploadRateKeys,
  resetRateLimit,
} from '../lib/db-rate-limit';
import { mergeDbRowsIntoMemory, shouldBroadcastBulkResync } from '../lib/db-store-merge';
import {
  recordExpiredSseToken,
  recordMissingSseToken,
  recordSseAccepted,
  recordSseClosed,
  recordUploadAccepted,
  recordUploadRejected,
  snapshotHttpMetrics,
} from '../lib/http-metrics';

// express-session의 SessionData에 userId 필드 추가
declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

const router = Router();

const PANEL_DEFAULT_PASSWORD = '116606';
const LEGACY_PANEL_PASSWORDS = ['166606', PANEL_DEFAULT_PASSWORD] as const;

class RpcAuthError extends Error {
  statusCode = 403;
  constructor(message: string) {
    super(message);
    this.name = 'RpcAuthError';
  }
}

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
  const secrets = panelAdminSecrets(String(settings.admin_password ?? ''));
  if (!secrets.length) return false;
  return secrets.some((s) => {
    const expected = deriveAdminToken(s);
    try {
      return timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'));
    } catch { return false; }
  });
}

function deriveTestToken(testPassword: string): string {
  const secret = (process.env.SESSION_SECRET ?? 'fallback-secret') + testPassword;
  return createHmac('sha256', secret).update('test-session').digest('hex');
}

function verifyTestToken(provided: string | null | undefined): boolean {
  if (!provided || typeof provided !== 'string') return false;
  const settings = (getTable('app_settings')[0] ?? {}) as Record<string, unknown>;
  const secrets = panelTestSecrets(String(settings.test_password ?? ''));
  if (!secrets.length) return false;
  return secrets.some((s) => {
    const expected = deriveTestToken(s);
    try {
      return timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
      return false;
    }
  });
}

// 관리자 SSE 연결 집합 — 일반 sseUserMap과 분리해 모든 이벤트(private 포함) 수신
const sseAdminClients = new Set<Response>();

// ─── PostgreSQL connection pool ────────────────────────────────────────────────
import { pgPool as pool } from '../lib/pg-pool.js';

// 인스턴스마다 고유 ID — 자신이 보낸 NOTIFY를 수신해도 중복 처리 방지
const INSTANCE_ID = crypto.randomUUID();

// ─── In-memory cache (loaded from DB on startup, write-through on every change)
const store: Record<string, Record<string, unknown>[]> = {};
/** RAM 캐시. 넘치면 오래된 항목부터 지우고, 조회 시 Postgres에서 다시 채움. */
const IMAGE_STORE_MAX_ENTRIES = 80;
const IMAGE_STORE_MAX_CHARS = 32 * 1024 * 1024;
const imageStore = new Map<string, string>();

function imageStoreGet(path: string): string | undefined {
  return imageStore.get(path);
}

function pruneImageStore(): void {
  let chars = 0;
  for (const v of imageStore.values()) chars += v.length;
  while (imageStore.size > IMAGE_STORE_MAX_ENTRIES || chars > IMAGE_STORE_MAX_CHARS) {
    const first = imageStore.keys().next().value as string | undefined;
    if (!first) break;
    chars -= imageStore.get(first)?.length ?? 0;
    imageStore.delete(first);
  }
}

function imageStoreSet(path: string, dataUrl: string): void {
  imageStore.delete(path);
  imageStore.set(path, dataUrl);
  pruneImageStore();
}

// ─── Allowed tables for /op ────────────────────────────────────────────────────
// Allowlist prevents access to internal or non-existent tables.
const ALLOWED_OP_TABLES = new Set([
  'profiles', 'chats', 'messages', 'likes', 'chat_reads',
  'app_settings',
  'session_history',
  // Extra tables used by the app
  'contact_shares', 'contact_share_events', 'anonymous_reports',
  'notifications',
  'app_image_store',
  // 옵트인 단체 채팅
  'group_chats', 'group_participants', 'group_messages',
  // 차단·숨기기 / 프로필 방문자
  'blocked_users', 'profile_views',
  // 상태·이상형 신호
  'user_signals',
  // 시그널 보내기/패스 (하트 likes 와 분리)
  'signal_sends',
  // 서버가 계산하고 사용자는 자신의 잔여 수만 조회
  'heart_balances',
]);

// ─── SSE Event Ring Buffer — Last-Event-ID 재전송으로 재연결 시 이벤트 유실 방지 ──
// 브라우저 EventSource는 마지막 수신한 id를 자동으로 Last-Event-ID 헤더로 재연결 시 전송.
// 서버는 해당 seq 이후 이벤트를 링 버퍼에서 찾아 즉시 재전송 → 단절 구간 이벤트 자동 복구.
// TTL(10분) 초과 단절은 onSseReconnect → loadMessages 전체 리로드로 폴백.
let _sseEventSeq = 0;
const SSE_RING_MAX = 1000;           // 최대 보관 이벤트 수 (~1000 × ~1 KB ≈ 1 MB 상한) [Part1-Fix1]
const SSE_RING_TTL_MS = 20 * 60 * 1_000; // 20분 보관 — 중단기 재연결 Last-Event-ID 복구 커버 [Part1-Fix1]

interface RingEntry {
  seq: number;
  ts: number;
  json: string;               // JSON.stringify(event) — SSE data 페이로드
  targets: 'all' | string[]; // 'all' = broadcastAll, string[] = broadcastToUsers userIds
}
const _sseRingBuffer: RingEntry[] = [];

function _ringAdd(json: string, targets: 'all' | string[]): number {
  const seq = ++_sseEventSeq;
  _sseRingBuffer.push({ seq, ts: Date.now(), json, targets });
  // TTL + 상한 초과 항목 제거
  const cutoff = Date.now() - SSE_RING_TTL_MS;
  while (
    _sseRingBuffer.length > SSE_RING_MAX ||
    (_sseRingBuffer.length > 0 && _sseRingBuffer[0].ts < cutoff)
  ) {
    _sseRingBuffer.shift();
  }
  return seq;
}

function _ringGetSince(lastSeq: number, userId: string | null, isAdmin: boolean): RingEntry[] {
  return _sseRingBuffer.filter(e => {
    if (e.seq <= lastSeq) return false;
    if (isAdmin) return true;
    if (e.targets === 'all') return true;
    return userId ? (e.targets as string[]).includes(userId) : false;
  });
}

// sanitize helpers: ../lib/db-sanitize.ts

// ─── Concurrency limiter — graceful 503 when too many concurrent /op requests ──
// /op는 in-memory 서빙이지만 Node.js 이벤트 루프 포화 방지용 상한선
let _activeOpCount = 0;
const MAX_CONCURRENT_OPS = Number(process.env.MAX_CONCURRENT_OPS ?? 300);

// ─── Per-IP rate limiters: ../lib/db-rate-limit.ts ─────────────────────────────
setInterval(() => {
  const now = Date.now();
  pruneRateMap(_loginRateMap, now);
  pruneRateMap(_uploadRateMap, now);
}, 2 * 60 * 1000).unref();

// /events (SSE): IP당 최대 동시 연결. 인증된 재연결은 NAT 공인 IP 한도를 넘어도 per-user cap 적용.
const _sseConnPerIp = new Map<string, number>();
const SSE_MAX_CONN_PER_IP = Number(process.env.SSE_MAX_CONN_PER_IP ?? 200);
const SSE_MAX_TOTAL = Number(process.env.SSE_MAX_TOTAL ?? 4000);
const SSE_MAX_CONN_PER_USER = Number(process.env.SSE_MAX_CONN_PER_USER ?? 4);

function sseLiveCount(): number {
  let n = sseAnonClients.size + sseAdminClients.size;
  for (const s of sseUserMap.values()) n += s.size;
  return n;
}

// ─── Image magic-bytes map ─────────────────────────────────────────────────────
// MIME 헤더 조작으로 악성 파일을 이미지로 위장하는 공격 차단
const IMAGE_MAGIC: Record<string, Array<{ offset: number; bytes: number[] }>> = {
  'image/jpeg': [{ offset: 0, bytes: [0xFF, 0xD8, 0xFF] }],
  'image/png':  [{ offset: 0, bytes: [0x89, 0x50, 0x4E, 0x47] }],
  'image/gif':  [{ offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] }],
  'image/webp': [
    { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF
    { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }, // WEBP
  ],
};

// ─── Per-user global likes rate limit (독립 조합 스팸 방지) ──────────────────────
const LIKES_MAX_PER_USER_PER_MIN = 20; // 1분에 20개 초과 시 429
const _userLikeMinuteBuckets = new Map<string, { count: number; resetAt: number }>();

/**
 * 멀티 인스턴스 공용 rate limit — app_kv_rows 로 직렬화.
 * 테스트/DB 장애 시에는 in-memory 로 폴백.
 */
async function claimDistributedRateSlot(
  rowId: string,
  minIntervalMs: number,
): Promise<boolean> {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) return true;
  try {
    const { rows } = await pool.query(
      `INSERT INTO app_kv_rows (table_name, row_id, data, updated_at)
       VALUES ('rate_limits', $1, '{}'::jsonb, NOW())
       ON CONFLICT (table_name, row_id) DO UPDATE
       SET updated_at = NOW()
       WHERE app_kv_rows.updated_at < NOW() - ($2::double precision * INTERVAL '1 millisecond')
       RETURNING row_id`,
      [rowId, minIntervalMs],
    );
    return rows.length > 0;
  } catch (e) {
    logger.warn({ err: e, rowId }, '[db] distributed rate slot failed — memory fallback');
    return true; // 호출측 memory 가드가 처리
  }
}

async function claimDistributedMinuteQuota(
  rowId: string,
  maxPerMinute: number,
): Promise<boolean> {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) return true;
  try {
    const { rows } = await pool.query(
      `INSERT INTO app_kv_rows (table_name, row_id, data, updated_at)
       VALUES ('rate_limits', $1, jsonb_build_object('count', 1), NOW())
       ON CONFLICT (table_name, row_id) DO UPDATE
       SET data = jsonb_build_object(
             'count',
             LEAST($2::int, COALESCE((app_kv_rows.data->>'count')::int, 0) + 1)
           ),
           updated_at = NOW()
       WHERE COALESCE((app_kv_rows.data->>'count')::int, 0) < $2::int
       RETURNING (data->>'count')::int AS count`,
      [rowId, maxPerMinute],
    );
    return rows.length > 0;
  } catch (e) {
    logger.warn({ err: e, rowId }, '[db] distributed minute quota failed — memory fallback');
    return true;
  }
}

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
    dbDeleteRows('push_subscriptions', expired).catch(e => logger.error({ err: e }, '[db] background task error'));
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
    if (sent) logger.info({ tableName }, '[db] Admin DB failure push sent');
  } catch (e) {
    logger.error({ err: e, tableName }, '[db] Failed to send admin DB failure push');
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
    if (sent) logger.info({ usedCount, poolSize, pct }, '[db] Admin PIN pool warning push sent');
  } catch (e) {
    logger.error({ err: e }, '[db] Failed to send admin PIN pool warning push');
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
    logger.error({ err: e }, '[db] Failed to persist error state');
  }
}

// ─── Shutdown broadcast — 서버 재시작 전 모든 SSE 클라이언트에 즉시 알림 ────────
// 클라이언트가 {"type":"shutdown"} 수신 시 백오프 없이 즉시 재연결하므로
// 서버 재시작이 사용자에게 거의 투명하게 보임 (60s 대기 → <1s 재연결)
//
// retry:100 — 브라우저 내장 EventSource에게도 100ms 후 재시도 지시
// res.end() Promise 집합을 기다렸다가 모두 drain된 후 process.exit() 실행해
// 클라이언트가 shutdown 이벤트를 실제로 수신함을 보장
function broadcastShutdownToAllSseClients(): Promise<void> {
  // retry:100 필드 → 브라우저 내장 EventSource가 100ms 후 재연결 시도
  const payload = 'retry: 100\ndata: {"type":"shutdown"}\n\n';
  const allRes: Response[] = [];
  for (const conns of sseUserMap.values()) for (const r of conns) allRes.push(r);
  for (const r of sseAnonClients) allRes.push(r);
  for (const r of sseAdminClients) allRes.push(r);
  const drainPromises = allRes.map(r => new Promise<void>(resolve => {
    try {
      r.write(payload, () => {
        try { r.end(resolve); } catch { resolve(); }
      });
    } catch {
      try { r.end(resolve); } catch { resolve(); }
    }
  }));
  // 최대 200ms 대기 — 네트워크 버퍼 drain 보장
  return Promise.race([
    Promise.all(drainPromises).then(() => {}),
    new Promise<void>(resolve => setTimeout(resolve, 200)),
  ]);
}

/** index.ts SIGTERM/SIGINT — SSE shutdown 알림 + 에러 카운터 flush */
export async function prepareForShutdown(): Promise<void> {
  await broadcastShutdownToAllSseClients();
  await flushErrorStateToDB();
}

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
}, 10_000).unref();

// Fix #1: _userLikeMinuteBuckets 만료 버킷 5분마다 정리 — 무한 메모리 누수 방지
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of _userLikeMinuteBuckets) if (b.resetAt < now) _userLikeMinuteBuckets.delete(k);
}, 5 * 60 * 1000).unref();

// ─── Helpers ──────────────────────────────────────────────────────────────────
function genId(): string {
  return crypto.randomUUID();
}

function ts(): string {
  return new Date().toISOString();
}

/** chat_reads.write 는 서버 시계 — 폰 시계가 느리면 말풍선 '1'이 안 지워진다. */
function stampChatReadAt(row: Record<string, unknown>): void {
  const now = ts();
  const provided = String(row.read_at ?? '');
  row.read_at = provided > now ? provided : now;
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

type ReferenceCheck = { ok: true } | { ok: false; unavailable: boolean };

function mergeRefreshedRows(table: string, rows: Array<{ data?: unknown }>): void {
  const target = getTable(table);
  for (const result of rows) {
    const row = result.data as Record<string, unknown> | null | undefined;
    const id = String(row?.id ?? '');
    if (!row || !id) continue;
    const idx = target.findIndex(existing => String(existing.id) === id);
    if (idx >= 0) target[idx] = row;
    else target.push(row);
  }
}

/** RAM miss only: make one narrow PG read for the referenced row ids. */
async function refreshReferencedRows(table: string, ids: string[]): Promise<boolean> {
  const wanted = [...new Set(ids.map(String).filter(Boolean))];
  if (!wanted.length) return true;
  try {
    const { rows } = await pool.query(
      `SELECT data FROM app_kv_rows
       WHERE table_name = $1 AND row_id = ANY($2::text[])`,
      [table, wanted],
    );
    mergeRefreshedRows(table, rows);
    return true;
  } catch (e) {
    logger.warn({ err: e, table }, '[integrity] targeted reference refresh failed');
    return false;
  }
}

async function ensureWriteReferences(
  sourceTable: string,
  row: Record<string, unknown>,
): Promise<ReferenceCheck> {
  const refs = writeReferencesFor(sourceTable, row);
  const missingByTable = new Map<string, string[]>();
  for (const ref of refs) {
    if (ref.id && getTable(ref.table).some(candidate => String(candidate.id) === ref.id)) continue;
    const ids = missingByTable.get(ref.table) ?? [];
    ids.push(ref.id);
    missingByTable.set(ref.table, ids);
  }
  for (const [table, ids] of missingByTable) {
    if (!(await refreshReferencedRows(table, ids))) return { ok: false, unavailable: true };
  }
  for (const ref of refs) {
    if (!ref.id || !getTable(ref.table).some(candidate => String(candidate.id) === ref.id)) {
      return { ok: false, unavailable: false };
    }
  }
  return { ok: true };
}

function sendReferenceFailure(res: Response, check: Exclude<ReferenceCheck, { ok: true }>) {
  if (check.unavailable) {
    return res.status(503).json({
      data: null,
      error: { message: '관계 데이터 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.', code: 'REFERENCE_REFRESH_FAILED' },
    });
  }
  return res.status(400).json({
    data: null,
    error: { message: '참조 대상이 존재하지 않습니다.', code: 'INVALID_REFERENCE' },
  });
}

/** Membership can arrive through NOTIFY after the room row, so refresh this pair once on a miss. */
async function refreshGroupParticipant(groupId: string, userId: string): Promise<'found' | 'missing' | 'unavailable'> {
  try {
    const { rows } = await pool.query(
      `SELECT data FROM app_kv_rows
       WHERE table_name = 'group_participants'
         AND data->>'group_id' = $1
         AND data->>'user_id' = $2
       LIMIT 1`,
      [groupId, userId],
    );
    mergeRefreshedRows('group_participants', rows);
    return getTable('group_participants').some(
      row => String(row.group_id) === groupId && String(row.user_id) === userId,
    ) ? 'found' : 'missing';
  } catch (e) {
    logger.warn({ err: e, table: 'group_participants' }, '[integrity] targeted membership refresh failed');
    return 'unavailable';
  }
}

const _integrityScanMaxRaw = Number(process.env.INTEGRITY_SCAN_MAX_ROWS ?? 20_000);
const _integrityScanIntervalRaw = Number(process.env.INTEGRITY_SCAN_INTERVAL_MS ?? 5 * 60 * 1000);
const INTEGRITY_SCAN_MAX_ROWS = Number.isFinite(_integrityScanMaxRaw)
  ? Math.max(1, Math.floor(_integrityScanMaxRaw))
  : 20_000;
const INTEGRITY_SCAN_INTERVAL_MS = Number.isFinite(_integrityScanIntervalRaw)
  ? Math.max(30_000, Math.floor(_integrityScanIntervalRaw))
  : 5 * 60 * 1000;
let _integrityDiagnostics: IntegrityDiagnostics = collectIntegrityDiagnostics(store, INTEGRITY_SCAN_MAX_ROWS);
let _integrityDiagnosticsStarted = false;

function runIntegrityDiagnostics(): void {
  _integrityDiagnostics = collectIntegrityDiagnostics(store, INTEGRITY_SCAN_MAX_ROWS);
  logger.info({ integrity: _integrityDiagnostics }, '[integrity] bounded orphan counts');
}

function startIntegrityDiagnostics(): void {
  if (_integrityDiagnosticsStarted) return;
  _integrityDiagnosticsStarted = true;
  runIntegrityDiagnostics();
  setInterval(runIntegrityDiagnostics, INTEGRITY_SCAN_INTERVAL_MS).unref();
}

// chatPairKey / deterministicChatId: ../lib/db-chat-ids.ts

/** 채팅 쌍 생성 직렬화 — 인스턴스 간 race 를 PG advisory lock 으로 차단 */
async function withChatPairLock<T>(pairKey: string, fn: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ h: number }>('SELECT hashtext($1)::int AS h', [pairKey]);
    const lockId = rows[0]?.h ?? 0;
    await client.query('SELECT pg_advisory_lock($1)', [lockId]);
    try {
      return await fn();
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [lockId]).catch(() => {});
    }
  } finally {
    client.release();
  }
}

/** 내구성이 필수인 테이블 — persist 성공 후에만 SSE/응답 */
const CRITICAL_PERSIST_TABLES = new Set([
  'messages', 'likes', 'chats', 'chat_reads',
  'contact_shares', 'contact_share_events',
  'group_messages', 'group_chats', 'group_participants',
  'signal_sends',
]);

/** SSE 타겟 수집 (테스트·브로드캐스트 공용) — 구현은 db-broadcast-targets.ts */
export function collectBroadcastTargets(
  table: string,
  row: Record<string, unknown> | null,
  findChat: (chatId: string) => Record<string, unknown> | undefined = (id) =>
    getTable('chats').find(c => String(c['id']) === String(id)),
): string[] {
  return collectBroadcastTargetsImpl(
    table,
    row,
    findChat,
    (gid) => getTable('group_participants').filter(p => String(p.group_id) === String(gid)),
  );
}

function isChatParticipant(chatId: unknown, userId: string): boolean {
  if (chatId == null || chatId === '' || !userId) return false;
  const resolved = resolveMergedChatId(String(chatId));
  const chat = getTable('chats').find(c => String(c.id) === resolved)
    ?? getTable('chats').find(c => String(c.id) === String(chatId));
  if (!chat) return false;
  return String(chat.user1_id) === String(userId) || String(chat.user2_id) === String(userId);
}

function countMessagesForChat(chatId: string): number {
  return getTable('messages').filter(m => String(m.chat_id) === String(chatId)).length;
}

/** 동일 user 쌍의 모든 chat id (메시지 조회·병합용) */
function chatIdsForPair(u1: string, u2: string): string[] {
  const key = chatPairKey(u1, u2);
  return getTable('chats')
    .filter(c => chatPairKey(String(c.user1_id), String(c.user2_id)) === key)
    .map(c => String(c.id));
}

/** 병합된 옛 방 id → canonical (프로세스 동안 SELECT 리다이렉트) */
const mergedChatIds = new Map<string, string>();
function rememberMergedChat(fromId: string, toId: string) {
  if (!fromId || fromId === toId) return;
  mergedChatIds.set(fromId, toId);
  if (mergedChatIds.size > 2000) {
    const first = mergedChatIds.keys().next().value;
    if (first) mergedChatIds.delete(first);
  }
}

function resolveMergedChatId(chatId: string): string {
  let cur = chatId;
  for (let i = 0; i < 8; i++) {
    const next = mergedChatIds.get(cur);
    if (!next || next === cur) break;
    cur = next;
  }
  return cur;
}

/** 방 단위로 PG에서 메시지를 메모리에 합침 — 전역 LIMIT 때문에 옛 대화가 비는 것 방지 */
async function mergeMessagesForChatIds(chatIds: string[]): Promise<void> {
  const ids = [...new Set(chatIds.map(String).filter(Boolean))];
  if (!ids.length) return;
  try {
    const { rows } = await pool.query(
      `SELECT data FROM app_kv_rows
       WHERE table_name = 'messages'
         AND data->>'chat_id' = ANY($1::text[])`,
      [ids],
    );
    if (!rows.length) return;
    const memRows = getTable('messages');
    const byId = new Map(memRows.map(r => [String(r['id']), r]));
    for (const row of rows) {
      const data = row.data as Record<string, unknown>;
      const id = String(data['id'] ?? '');
      if (!id) continue;
      const existing = byId.get(id);
      const dbTs = String(data.updated_at ?? data.created_at ?? '');
      const memTs = existing ? String(existing.updated_at ?? existing.created_at ?? '') : '';
      if (!existing) {
        memRows.push(data);
        byId.set(id, data);
      } else if (dbTs >= memTs) {
        const idx = memRows.findIndex(r => String(r['id']) === id);
        if (idx >= 0) memRows[idx] = data;
        byId.set(id, data);
      }
    }
  } catch (e) {
    logger.warn({ err: e }, '[db] mergeMessagesForChatIds failed');
  }
}

function pickCanonicalChatRow(group: Record<string, unknown>[]): Record<string, unknown> {
  return [...group].sort((a, b) => {
    const diff = countMessagesForChat(String(b.id)) - countMessagesForChat(String(a.id));
    if (diff !== 0) return diff;
    return String(a.created_at ?? a.id).localeCompare(String(b.created_at ?? b.id));
  })[0];
}

/** 중복 1:1 채팅방 병합 — 메시지·읽음을 canonical 방으로 이전 */
async function dedupeChatsInStore(): Promise<number> {
  const chats = getTable('chats');
  if (chats.length < 2) return 0;
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const c of chats) {
    const u1 = String(c.user1_id ?? '');
    const u2 = String(c.user2_id ?? '');
    if (!u1 || !u2 || u1 === u2) continue;
    const key = chatPairKey(u1, u2);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }
  let merged = 0;
  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    const canonical = pickCanonicalChatRow(group);
    const canonicalId = String(canonical.id);
    for (const dup of group) {
      const dupId = String(dup.id);
      if (dupId === canonicalId) continue;
      for (const msg of getTable('messages')) {
        if (String(msg.chat_id) === dupId) {
          msg.chat_id = canonicalId;
          void dbPersistRow('messages', msg);
        }
      }
      const reads = getTable('chat_reads');
      for (let i = reads.length - 1; i >= 0; i--) {
        const cr = reads[i];
        if (String(cr.chat_id) !== dupId) continue;
        const readerId = String(cr.reader_id ?? '');
        const existing = reads.find(
          r => String(r.chat_id) === canonicalId && String(r.reader_id) === readerId,
        );
        if (existing) {
          const crTs = String(cr.read_at ?? '');
          const exTs = String(existing.read_at ?? '');
          if (crTs > exTs) existing.read_at = cr.read_at;
          void dbPersistRow('chat_reads', existing);
          reads.splice(i, 1);
          void dbDeleteRow('chat_reads', String(cr.id));
        } else {
          cr.chat_id = canonicalId;
          cr.id = `${canonicalId}__${readerId}`;
          void dbPersistRow('chat_reads', cr);
        }
      }
      const idx = chats.findIndex(c => String(c.id) === dupId);
      if (idx >= 0) chats.splice(idx, 1);
      void dbDeleteRow('chats', dupId);
      rememberMergedChat(dupId, canonicalId);
      merged++;
    }
  }
  if (merged > 0) {
    logger.info({ merged }, '[db] dedupeChatsInStore merged duplicate chat rooms');
  }
  return merged;
}

// ─── PostgreSQL persistence helpers ───────────────────────────────────────────
// [Part1-Fix4] Per-(table, row_id) write serialization — 동시 upsert 순서 역전 방지
// 동일 키의 새 write는 이전 promise 완료 후 실행 → 오래된 스냅샷이 최신 데이터를 덮어쓰지 않음
const _dbWriteLocks = new Map<string, Promise<void>>();
const REALTIME_TRACE_TABLES = new Set([
  'messages',
  'chats',
  'likes',
  'contact_shares',
  'contact_share_events',
]);

function realtimeTraceMeta(table: string, row: Record<string, unknown>) {
  return {
    table,
    rowId: typeof row.id === 'string' ? row.id : null,
    roomId: typeof row.chat_id === 'string' ? row.chat_id : null,
    createdAt: typeof row.created_at === 'string' ? row.created_at : null,
  };
}

async function dbPersistRow(tableName: string, row: Record<string, unknown>): Promise<void> {
  const rowId = String(row.id ?? genId());
  const key = `${tableName}:${rowId}`;

  // 동일 key의 in-flight write가 있으면 chain — 완료 순서를 호출 순서와 일치시킴
  const prev = _dbWriteLocks.get(key) ?? Promise.resolve();
  const next: Promise<void> = prev.then(() => _execDbPersistRow(tableName, rowId, row)).finally(() => {
    // 이 Promise가 여전히 최신이면 Map에서 삭제 (메모리 해제)
    if (_dbWriteLocks.get(key) === next) _dbWriteLocks.delete(key);
  });
  _dbWriteLocks.set(key, next);
  return next;
}

async function _execDbPersistRow(tableName: string, rowId: string, row: Record<string, unknown>): Promise<void> {
  const sql = `INSERT INTO app_kv_rows (table_name, row_id, data, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (table_name, row_id)
       DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`;
  const params = [tableName, rowId, JSON.stringify(row)];
  try {
    await pool.query(sql, params);
  } catch {
    // 1회 재시도 — 일시적 연결 오류(ECONNRESET, idle timeout) 자동 복구
    await new Promise<void>(r => setTimeout(r, 500));
    try {
      await pool.query(sql, params);
    } catch (e) {
      _dbPersistErrors++;
      _dbPersistErrorLog.push({ table: tableName, time: Date.now(), msg: String(e) });
      if (_dbPersistErrorLog.length > 100) _dbPersistErrorLog.shift();
      await flushErrorStateToDB();
      notifyAdminDbFailure(tableName, String(e)).catch(e2 => logger.error({ err: e2 }, '[db] notifyAdminDbFailure failed'));
      throw e;
    }
  }
  if (REALTIME_TRACE_TABLES.has(tableName)) {
    logger.info(realtimeTraceMeta(tableName, row), '[realtime] db-save');
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
    throw e;
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
  try {
    await pool.query(
      `INSERT INTO app_image_store (path, data_url, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (path)
       DO UPDATE SET data_url = EXCLUDED.data_url, updated_at = NOW()`,
      [path, dataUrl],
    );
  } catch (e) {
    logger.error({ err: e, path }, '[db] dbPersistImage failed');
    throw e; // 호출자(storage-upload)가 catch로 처리할 수 있도록 다시 던짐
  }
}

// ─── Startup: initialize storage schema and load data ────────────────────────
async function ensureStorageSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_kv_rows (
      table_name text NOT NULL,
      row_id text NOT NULL,
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (table_name, row_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_image_store (
      path text PRIMARY KEY,
      data_url text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS app_kv_rows_table_updated_idx
      ON app_kv_rows (table_name, updated_at DESC)
  `);
}

async function loadImagesFromDb(): Promise<void> {
  try {
    const imgs = await pool.query('SELECT path, data_url FROM app_image_store');
    for (const img of imgs.rows) {
      imageStoreSet(img.path, img.data_url);
    }
  } catch (e) {
    logger.warn({ err: e }, '[db] image preload failed');
  }
}

function mergeKvRowsIntoStore(rows: Array<{ table_name: string; row_id: string; data: unknown }>): void {
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
    // 시스템·삭제된 기능 테이블은 앱 store에 올리지 않음 (rate_limits는 PG 전용)
    if (SYSTEM_KV_TABLES.has(row.table_name) || LEGACY_KV_TABLES.has(row.table_name)) continue;
    if (!store[row.table_name]) store[row.table_name] = [];
    let data = row.data as Record<string, unknown>;
    if (row.table_name === 'session_history') {
      data = stripLegacySessionHistoryKeys(data);
    }
    store[row.table_name].push(data);
  }
}

function seedLikesLastInsertFromStore(): void {
  const cutoff = Date.now() - 10_000;
  for (const like of (store['likes'] ?? [])) {
    const liker = like['liker_id'];
    const liked  = like['liked_id'];
    const htype  = like['heart_type'];
    if (!liker || !liked || !htype) continue;
    const createdMs = like['created_at'] ? new Date(like['created_at'] as string).getTime() : 0;
    if (createdMs < cutoff) continue;
    const key = `${liker}:${liked}:${htype}`;
    const prev = _likesLastInsert.get(key) ?? 0;
    if (createdMs > prev) _likesLastInsert.set(key, createdMs);
  }
  if (_likesLastInsert.size > 0) {
    logger.info({ count: _likesLastInsert.size }, '[db] Seeded _likesLastInsert from DB on startup');
  }
}

const HOT_TABLES = ['app_settings', 'profiles'];

async function loadHotTablesFromDb(): Promise<void> {
  try {
    const { rows } = await pool.query(
      'SELECT table_name, row_id, data FROM app_kv_rows WHERE table_name = ANY($1::text[]) ORDER BY updated_at ASC',
      [HOT_TABLES],
    );
    mergeKvRowsIntoStore(rows);
  } catch (e) {
    logger.error({ err: e }, '[db] Failed to load hot tables from DB');
  }
}

async function loadRemainingTablesFromDb(): Promise<void> {
  try {
    const { rows } = await pool.query(
      'SELECT table_name, row_id, data FROM app_kv_rows WHERE table_name <> ALL($1::text[]) ORDER BY updated_at ASC',
      [HOT_TABLES],
    );
    mergeKvRowsIntoStore(rows);
    seedLikesLastInsertFromStore();
  } catch (e) {
    logger.error({ err: e }, '[db] Failed to load remaining tables from DB');
  }
}

// ─── Seed data (only if DB is empty) ─────────────────────────────────────────
function defaultAppSettings(): Record<string, unknown> {
  const bootstrapAdmin = process.env.BOOTSTRAP_ADMIN_PASSWORD?.trim();
  const bootstrapTest = process.env.BOOTSTRAP_TEST_PASSWORD?.trim();
  return {
    id: 1,
    session_active: false,
    admin_phone: '010-3878-6740',
    admin_password: bootstrapAdmin || PANEL_DEFAULT_PASSWORD,
    updated_at: ts(),
    timer_end_at: null,
    timer_label: null,
    functions_locked: false,
    reset_signal: null,
    entry_password: koreanDateMMDD(),
    reset_password: PANEL_DEFAULT_PASSWORD,
    test_password: bootstrapTest || PANEL_DEFAULT_PASSWORD,
    qr_base_url: PRODUCTION_QR_BASE,
    heart_initial_count: 8,
    active_tables: null,
  };
}

const PRODUCTION_QR_BASE = 'https://binpc2.netlify.app';

function isLocalQrUrl(url: unknown): boolean {
  const s = String(url ?? '');
  return !s || /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(s);
}

function collectSecrets(...vals: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  for (const v of vals) {
    const s = (v ?? '').trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

function isDefaultPanelPassword(pw: string): boolean {
  const s = pw.trim();
  return !s || LEGACY_PANEL_PASSWORDS.some(l => l === s);
}

function secretMatches(provided: string, secrets: string[]): boolean {
  const p = provided.trim();
  return p.length > 0 && secrets.some(s => s === p);
}

/**
 * Factory credentials are convenient only for local/test bootstrap. Render runs
 * with NODE_ENV=production, where accepting a password published in this
 * repository would make every panel operation publicly accessible.
 */
function panelSecretsForRuntime(...configured: Array<string | null | undefined>): string[] {
  const secrets = collectSecrets(...configured);
  if (process.env.NODE_ENV !== 'production') {
    return collectSecrets(...secrets, PANEL_DEFAULT_PASSWORD, ...LEGACY_PANEL_PASSWORDS);
  }
  return secrets.filter(secret => !isDefaultPanelPassword(secret));
}

function panelAdminSecrets(dbAdmin?: string | null): string[] {
  return panelSecretsForRuntime(
    dbAdmin ?? '',
    process.env.BOOTSTRAP_ADMIN_PASSWORD,
  );
}

function panelTestSecrets(dbTest?: string | null): string[] {
  return panelSecretsForRuntime(
    dbTest ?? '',
    process.env.BOOTSTRAP_TEST_PASSWORD,
  );
}

const SECRET_SETTING_KEYS = ['admin_password', 'test_password', 'entry_password', 'reset_password'] as const;

/** 삭제된 기능이 app_settings JSON에 남긴 키 — 메모리·Postgres 모두에서 제거 */
const LEGACY_APP_SETTINGS_KEYS = [
  'heart_drain_enabled',
  'heart_drain_minutes',
  'seating_locked',
  'seats_snapshot',
  'seating_map',
  'seats',
  'seat_layout',
] as const;

/** session_history 행에 남은 옛 좌석맵 키 — 행 자체는 유지 */
const LEGACY_SESSION_HISTORY_KEYS = ['seats_snapshot', 'seating_locked', 'seating_map'] as const;

function stripLegacySessionHistoryKeys(row: Record<string, unknown>): Record<string, unknown> {
  if (!LEGACY_SESSION_HISTORY_KEYS.some(k => k in row)) return row;
  const next = { ...row };
  for (const k of LEGACY_SESSION_HISTORY_KEYS) delete next[k];
  return next;
}

/** Postgres leftover 잔량 — 값/PII 없이 개수만. -1 은 아직 클린업 전. */
let _legacyLeftovers = {
  kv_tables: -1,
  settings_rows: -1,
  history_rows: -1,
};

function settingsHaveLegacyKeys(row: Record<string, unknown>): boolean {
  return LEGACY_APP_SETTINGS_KEYS.some(k => k in row);
}

function stripLegacySettingsKeys(row: Record<string, unknown>): Record<string, unknown> {
  const next = { ...row };
  for (const k of LEGACY_APP_SETTINGS_KEYS) delete next[k];
  return next;
}

function mergeAppSettings(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  // 빈/null 패치값으로 DB 비밀번호가 지워지는 것을 방지 (관리자 패널·resync 안전망)
  const safePatch = { ...patch };
  for (const key of SECRET_SETTING_KEYS) {
    if (key in safePatch && (safePatch[key] == null || String(safePatch[key]).trim() === '')) {
      delete safePatch[key];
    }
  }
  const merged: Record<string, unknown> = { ...defaultAppSettings(), ...current, ...safePatch, id: 1, updated_at: ts() };
  for (const k of LEGACY_APP_SETTINGS_KEYS) delete merged[k];
  if (isLocalQrUrl(merged.qr_base_url)) merged.qr_base_url = PRODUCTION_QR_BASE;
  return merged;
}

function explicitSecretKeys(payload: Record<string, unknown>): Set<string> {
  const keys = new Set<string>();
  for (const key of SECRET_SETTING_KEYS) {
    if (key in payload && payload[key] != null && String(payload[key]).trim() !== '') keys.add(key);
  }
  return keys;
}

/** 비비밀번호 설정 저장이 Postgres에 이미 있는 패널 비밀번호를 덮어쓰지 않게 함 */
async function overlayDbSecrets(
  row: Record<string, unknown>,
  explicit: Set<string>,
): Promise<Record<string, unknown>> {
  try {
    const { rows } = await pool.query(
      `SELECT data FROM app_kv_rows WHERE table_name = 'app_settings' ORDER BY updated_at DESC LIMIT 1`,
    );
    const db = rows[0]?.data as Record<string, unknown> | undefined;
    if (!db || typeof db !== 'object') return row;
    const next = { ...row };
    for (const key of SECRET_SETTING_KEYS) {
      if (explicit.has(key)) continue;
      if (db[key] != null && String(db[key]).trim() !== '') next[key] = db[key];
    }
    return next;
  } catch (e) {
    logger.warn({ err: e }, '[db] overlayDbSecrets failed — using in-memory secrets');
    return row;
  }
}

/** 로그인·검증은 Postgres KV를 우선. 인메모리만 보면 다른 인스턴스의 변경이 무시됨 */
async function hydrateAppSettingsFromDb(): Promise<Record<string, unknown>> {
  try {
    const { rows } = await pool.query(
      `SELECT data FROM app_kv_rows WHERE table_name = 'app_settings' ORDER BY updated_at DESC LIMIT 1`,
    );
    const data = rows[0]?.data as Record<string, unknown> | undefined;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const cleaned = stripLegacySettingsKeys(data);
      store['app_settings'] = [cleaned];
      return cleaned;
    }
  } catch (e) {
    logger.warn({ err: e }, '[db] hydrate app_settings from DB failed — using memory');
  }
  return (getTable('app_settings')[0] ?? {}) as Record<string, unknown>;
}

function publicAppSettingsView(row: Record<string, unknown>, forAdmin: boolean): Record<string, unknown> {
  const s = sanitizeSettings(row);
  if (forAdmin) {
    s.admin_password_set = panelAdminSecrets(row.admin_password as string | undefined).length > 0;
    s.test_password_set = panelTestSecrets(row.test_password as string | undefined).length > 0;
    s.reset_password_set = panelSecretsForRuntime(row.reset_password as string | undefined).length > 0;
  }
  return s;
}

function resetPanelLoginLimiter(req: Request): void {
  const ip = String(req.ip ?? req.socket.remoteAddress ?? 'unknown');
  resetRateLimit(_loginRateMap, `panel:${ip}`);
}

/** 행사 중 매칭/소셜 쓰기 — 하트·1:1 방/메시지·연락처 공유·단톡 */
const FUNCTIONS_LOCKED_INSERT_TABLES = new Set([
  'likes',
  'messages',
  'chats',
  'contact_shares',
  'group_messages',
  'group_participants',
  'signal_sends',
]);
const FUNCTIONS_LOCKED_UPDATE_TABLES = new Set([
  'likes',
  'contact_shares',
]);

function isFunctionsLocked(): boolean {
  return (getTable('app_settings')[0] as Record<string, unknown> | undefined)?.functions_locked === true;
}

/** DB에 id/session_active 등 핵심 필드가 빠진 app_settings를 자동 복구 */
async function repairAppSettingsIfNeeded(): Promise<void> {
  const row = getTable('app_settings')[0];
  if (!row) {
    const settings = defaultAppSettings();
    store['app_settings'] = [settings];
    await dbPersistRow('app_settings', settings);
    logger.warn('[db] app_settings missing — seeded defaults');
    return;
  }
  const broken = row.id == null
    || row.session_active === undefined
    || row.admin_password === undefined
    || row.admin_password === null
    || row.admin_password === ''
    || row.entry_password === undefined
    || row.test_password === undefined;
  if (!broken) return;
  const repaired = mergeAppSettings(row, {});
  store['app_settings'] = [repaired];
  await dbPersistRow('app_settings', repaired);
  logger.warn('[db] app_settings repaired (missing core fields)');
}

/** Render BOOTSTRAP_* env — redeploy/resync 후 DB 비밀번호가 어긋나면 자동 복구 */
async function ensureAppSettingsSecrets(): Promise<void> {
  const bootstrapAdmin = process.env.BOOTSTRAP_ADMIN_PASSWORD?.trim();
  const bootstrapTest = process.env.BOOTSTRAP_TEST_PASSWORD?.trim();

  const row = getTable('app_settings')[0];
  if (!row) return;

  const patch: Record<string, unknown> = {};
  const currentAdmin = String(row.admin_password ?? '').trim();
  const currentTest = row.test_password == null ? '' : String(row.test_password);
  const currentReset = row.reset_password == null ? '' : String(row.reset_password);
  const targetAdmin = bootstrapAdmin || PANEL_DEFAULT_PASSWORD;
  const targetTest = bootstrapTest || PANEL_DEFAULT_PASSWORD;
  if ((!currentAdmin || isDefaultPanelPassword(currentAdmin)) && currentAdmin !== targetAdmin) {
    patch.admin_password = targetAdmin;
  }
  if ((!currentTest || isDefaultPanelPassword(currentTest)) && currentTest !== targetTest) {
    patch.test_password = targetTest;
  }
  if ((!currentReset || isDefaultPanelPassword(currentReset)) && currentReset !== PANEL_DEFAULT_PASSWORD) {
    patch.reset_password = PANEL_DEFAULT_PASSWORD;
  }
  if (isLocalQrUrl(row.qr_base_url)) patch.qr_base_url = PRODUCTION_QR_BASE;
  const needsStrip = settingsHaveLegacyKeys(row);
  if (!Object.keys(patch).length && !needsStrip) return;

  const merged = mergeAppSettings(row, patch);
  const updated = await overlayDbSecrets(merged, explicitSecretKeys(patch));
  store['app_settings'] = [updated];
  await dbPersistRow('app_settings', updated);
  logger.warn('[db] app_settings secrets/qr synced from bootstrap env');
}

async function seedIfNeeded(): Promise<void> {
  await ensureStorageSchema();
  await loadHotTablesFromDb();
  await repairAppSettingsIfNeeded();
  await ensureAppSettingsSecrets();
  if (!getTable('app_settings').length) {
    const settings = defaultAppSettings();
    store['app_settings'] = [settings];
    await dbPersistRow('app_settings', settings);
  }
  await ensureOptInGroupRooms();
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
    void overlayDbSecrets(updated, new Set(['entry_password']))
      .then(toStore => {
        store['app_settings'][0] = toStore;
        return dbPersistRow('app_settings', toStore).then(() => {
          smartBroadcast('app_settings', toStore, {
            type: 'change', table: 'app_settings', event: 'UPDATE',
            newRow: toStore, oldRow: settings as Record<string, unknown>,
          });
        });
      })
      .catch(e => logger.error({ err: e }, '[db] background task error'))
      .finally(() => { _renewalInProgress = false; });
  };
  setInterval(check, 60_000).unref();
}

// ─── 기능 삭제 후 남은 레거시 테이블 자동 정리 ──────────────────────────────────
// 이 Set에 없는 table_name을 가진 app_kv_rows 행은 서버 시작 시 자동 삭제된다.
// 새 기능을 추가할 때는 이 Set에도 테이블명을 추가할 것.
// 기능을 삭제할 때는 이 Set에서 제거하기만 하면 다음 재시작 시 데이터도 자동 삭제된다.
const ACTIVE_KV_TABLES = new Set([
  'profiles', 'app_settings', 'notifications', 'likes', 'chats',
  'messages', 'chat_reads', 'device_secrets', 'session_history', 'push_subscriptions',
  'contact_shares', 'contact_share_events', 'anonymous_reports',
  'app_image_store', 'heart_balances',
  // 옵트인 단체 채팅
  'group_chats', 'group_participants', 'group_messages',
  // 명시적 단톡 나가기 — 자동 재입장 방지 (서버 전용)
  'group_opt_outs',
  // 차단·숨기기 / 프로필 방문자
  'blocked_users', 'profile_views',
  // 상태·이상형 신호
  'user_signals',
  'signal_sends',
  // PG 전용 메타 — 앱 데이터가 아님. inversion cleanup에서 지우면 안 됨
  'rate_limits', 'db_error_log',
]);

/** 기능 삭제 후 남은 논리 테이블 — 재시작마다 Postgres 행을 지운다 */
const LEGACY_KV_TABLES = new Set([
  'suggestions',
  'seats', 'seating', 'seating_map', 'seat_assignments', 'seats_snapshot',
]);

/** app_kv_rows 에만 두고 인메모리 store에는 올리지 않는 시스템 행 */
const SYSTEM_KV_TABLES = new Set(['rate_limits', 'db_error_log']);

async function countLegacyLeftovers(): Promise<{ kv_tables: number; settings_rows: number; history_rows: number }> {
  const [kv, settings, hist] = await Promise.all([
    pool.query<{ n: number }>(
      `SELECT COUNT(DISTINCT table_name)::int AS n FROM app_kv_rows
       WHERE table_name IN ('suggestions','seats','seating','seating_map','seat_assignments','seats_snapshot')`,
    ),
    pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM app_kv_rows
       WHERE table_name = 'app_settings'
         AND (data ? 'heart_drain_enabled' OR data ? 'heart_drain_minutes' OR data ? 'seating_locked'
              OR data ? 'seats_snapshot' OR data ? 'seating_map' OR data ? 'seats' OR data ? 'seat_layout')`,
    ),
    pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM app_kv_rows
       WHERE table_name = 'session_history'
         AND (data ? 'seats_snapshot' OR data ? 'seating_locked' OR data ? 'seating_map')`,
    ),
  ]);
  return {
    kv_tables: kv.rows[0]?.n ?? 0,
    settings_rows: settings.rows[0]?.n ?? 0,
    history_rows: hist.rows[0]?.n ?? 0,
  };
}

async function cleanupLegacyTables(): Promise<void> {
  try {
    // 지정 leftover 테이블만 삭제 — 미등록 테이블 전체 삭제(inversion)는 병렬 기능 데이터를 지울 수 있어 하지 않음
    for (const t of LEGACY_KV_TABLES) {
      const res = await pool.query(
        `DELETE FROM app_kv_rows WHERE table_name = $1`, [t],
      );
      delete store[t];
      if ((res.rowCount ?? 0) > 0) {
        logger.info({ table: t, deleted: res.rowCount }, '[db] cleanupLegacyTables: 레거시 테이블 삭제');
      }
    }

    // jsonb - text 체인 — $1::text[] 바인딩 실패 시 키가 PG에 남는 것을 방지
    const settingsStrip = await pool.query(
      `UPDATE app_kv_rows
       SET data = data - 'heart_drain_enabled' - 'heart_drain_minutes' - 'seating_locked'
                      - 'seats_snapshot' - 'seating_map' - 'seats' - 'seat_layout',
           updated_at = NOW()
       WHERE table_name = 'app_settings'
         AND (data ? 'heart_drain_enabled' OR data ? 'heart_drain_minutes' OR data ? 'seating_locked'
              OR data ? 'seats_snapshot' OR data ? 'seating_map' OR data ? 'seats' OR data ? 'seat_layout')`,
    );
    if ((settingsStrip.rowCount ?? 0) > 0) {
      const mem = getTable('app_settings')[0];
      if (mem && settingsHaveLegacyKeys(mem)) {
        store['app_settings'] = [stripLegacySettingsKeys(mem)];
      }
      logger.info({ stripped: settingsStrip.rowCount, keys: [...LEGACY_APP_SETTINGS_KEYS] }, '[db] cleanupLegacyTables: app_settings 레거시 키 삭제');
    }

    const histStrip = await pool.query(
      `UPDATE app_kv_rows
       SET data = data - 'seats_snapshot' - 'seating_locked' - 'seating_map',
           updated_at = NOW()
       WHERE table_name = 'session_history'
         AND (data ? 'seats_snapshot' OR data ? 'seating_locked' OR data ? 'seating_map')`,
    );
    if ((histStrip.rowCount ?? 0) > 0) {
      const histRows = store['session_history'];
      if (Array.isArray(histRows)) {
        store['session_history'] = histRows.map(r => stripLegacySessionHistoryKeys(r));
      }
      logger.info({ stripped: histStrip.rowCount }, '[db] cleanupLegacyTables: session_history 좌석맵 키 삭제');
    }

    _legacyLeftovers = await countLegacyLeftovers();
    logger.info({ ..._legacyLeftovers, activeTables: ACTIVE_KV_TABLES.size }, '[db] cleanupLegacyTables: leftover remaining');
  } catch (e) {
    logger.warn({ err: e }, '[db] cleanupLegacyTables 실패');
  }
}

// 사람당 단톡 입장 수 상한 (방 인원 정원이 아님 — 방 인원은 제한 없음)
const MAX_GROUPS_PER_USER = 4;
// 방 인원 상한 없음. 정원 초과로 방을 나누지 않음.
const UNLIMITED_GROUP_MEMBERS = 999999;
const GROUP_LIMIT_MESSAGE = '단체 채팅은 최대 4개까지 입장할 수 있어요.';

const OPT_IN_GROUP_ROOMS: Array<{
  id: string; name: string; interest_tag: string; room_kind: string;
}> = [
  { id: 'group_afterparty_club', name: '2차 클럽 갈 분', interest_tag: '2차클럽', room_kind: 'afterparty_club' },
  { id: 'group_afterparty_drink', name: '2차 술 갈 분', interest_tag: '2차술', room_kind: 'afterparty_drink' },
];

function compactGroupName(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, '');
}

function matchesAfterpartySpec(g: Record<string, unknown>, spec: { id: string; name: string; interest_tag: string; room_kind: string }): boolean {
  const name = String(g.name ?? '');
  const compact = compactGroupName(name);
  return String(g.id) === spec.id
    || name === spec.name
    || compact === compactGroupName(spec.name)
    || String(g.interest_tag) === spec.interest_tag
    || String(g.room_kind ?? '') === spec.room_kind
    || (spec.room_kind === 'afterparty_club' && (name.includes('2차 클럽') || compact.includes('2차클럽')))
    || (spec.room_kind === 'afterparty_drink' && (name.includes('2차 술') || compact.includes('2차술')));
}

function matchesVisibleAgeBand(g: Record<string, unknown>, band: string): boolean {
  if (String(g.id) === `group_age_${band.replace(/대$/, '')}`) return true;
  const compact = compactGroupName(g.name);
  return compact === compactGroupName(`${band} 모임`);
}

function birthYearOfGroup(g: Record<string, unknown>): number | null {
  const idm = String(g.id ?? '').match(/^group_birth_(\d{4})$/);
  if (idm) return Number(idm[1]);
  const namem = String(g.name ?? '').match(/^(\d{4})년생\s*모임$/);
  if (namem) return Number(namem[1]);
  return null;
}

function collapseDuplicateGroupChatIds(): void {
  const rows = getTable('group_chats');
  const byId = new Map<string, Record<string, unknown>>();
  for (const g of rows) {
    const id = String(g.id ?? '');
    if (!id) continue;
    byId.set(id, g);
  }
  if (byId.size !== rows.length) store['group_chats'] = [...byId.values()];
}

const mergedGroupIds = new Map<string, string>();
function rememberMergedGroup(fromId: string, toId: string) {
  if (!fromId || fromId === toId) return;
  mergedGroupIds.set(fromId, toId);
  if (mergedGroupIds.size > 2000) {
    const first = mergedGroupIds.keys().next().value;
    if (first) mergedGroupIds.delete(first);
  }
}
function resolveMergedGroupId(groupId: string): string {
  let cur = groupId;
  for (let i = 0; i < 8; i++) {
    const mapped = mergedGroupIds.get(cur);
    if (mapped && mapped !== cur) { cur = mapped; continue; }
    const row = getTable('group_chats').find(g => String(g.id) === cur);
    const into = row ? String(row.merged_into ?? '') : '';
    if (into && into !== cur) { cur = into; continue; }
    break;
  }
  return cur;
}

async function mergeGroupInto(dupId: string, canonicalId: string): Promise<void> {
  if (!dupId || dupId === canonicalId) return;
  rememberMergedGroup(dupId, canonicalId);
  const parts = getTable('group_participants');
  for (const p of [...parts]) {
    if (String(p.group_id) !== dupId) continue;
    const uid = String(p.user_id ?? '');
    const oldId = String(p.id);
    const already = parts.some(x => String(x.group_id) === canonicalId && String(x.user_id) === uid);
    if (already) {
      store['group_participants'] = getTable('group_participants').filter(x => String(x.id) !== oldId);
      void dbDeleteRow('group_participants', oldId);
    } else {
      const newId = `${canonicalId}__${uid}`;
      p.group_id = canonicalId;
      p.id = newId;
      void dbPersistRow('group_participants', p);
      if (oldId && oldId !== newId) void dbDeleteRow('group_participants', oldId);
    }
  }
  for (const m of getTable('group_messages')) {
    if (String(m.group_id) === dupId) {
      m.group_id = canonicalId;
      void dbPersistRow('group_messages', m);
    }
  }
  for (const r of getTable('group_opt_outs')) {
    if (String(r.group_id) === dupId) {
      r.group_id = canonicalId;
      void dbPersistRow('group_opt_outs', r);
    }
  }
}

async function deleteDuplicateGroupChat(g: Record<string, unknown>): Promise<void> {
  const groupId = String(g.id ?? '');
  if (!groupId) return;
  const rows = getTable('group_chats');
  for (let i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i].id) === groupId) rows.splice(i, 1);
  }
  try {
    await dbDeleteRow('group_chats', groupId);
  } catch (e) {
    logger.error({ err: e, groupId }, '[ensureOptInGroupRooms] dup delete persist failed');
  }
  smartBroadcast('group_chats', g, {
    type: 'change', table: 'group_chats', event: 'DELETE', newRow: null, oldRow: g,
  });
}

async function mergeMatchesIntoCanonical(
  matches: Record<string, unknown>[],
  canonical: Record<string, unknown>,
): Promise<void> {
  const canonicalId = String(canonical.id);
  const seen = new Set<string>();
  for (const dup of matches) {
    const dupId = String(dup.id ?? '');
    if (!dupId || dupId === canonicalId || seen.has(dupId)) continue;
    seen.add(dupId);
    await mergeGroupInto(dupId, canonicalId);
    await deleteDuplicateGroupChat(dup);
  }
}

async function upsertCanonicalGroupRoom(spec: {
  id: string; name: string; interest_tag: string; room_kind: string; age_group?: string | null;
}): Promise<Record<string, unknown> | null> {
  const groups = getTable('group_chats');
  let room = groups.find(g => String(g.id) === spec.id);
  if (!room) {
    room = {
      id: spec.id,
      name: spec.name,
      interest_tag: spec.interest_tag,
      room_kind: spec.room_kind,
      age_group: spec.age_group === undefined ? null : spec.age_group,
      max_members: UNLIMITED_GROUP_MEMBERS,
      hidden: false,
      merged_into: null,
      created_at: ts(),
    };
    groups.push(room);
    try {
      await dbPersistRow('group_chats', room);
      smartBroadcast('group_chats', room, {
        type: 'change', table: 'group_chats', event: 'INSERT', newRow: room, oldRow: null,
      });
    } catch (e) {
      store['group_chats'] = getTable('group_chats').filter(g => String(g.id) !== spec.id);
      logger.error({ err: e, groupId: spec.id }, '[ensureOptInGroupRooms] seed persist failed');
      return null;
    }
    return room;
  }
  room.name = spec.name;
  room.interest_tag = spec.interest_tag;
  room.room_kind = spec.room_kind;
  room.max_members = UNLIMITED_GROUP_MEMBERS;
  room.hidden = false;
  room.merged_into = null;
  if (spec.age_group !== undefined) room.age_group = spec.age_group;
  else if (room.age_group === undefined) room.age_group = null;
  try {
    await dbPersistRow('group_chats', room);
  } catch (e) {
    logger.error({ err: e, groupId: spec.id }, '[ensureOptInGroupRooms] existing room persist failed');
  }
  return room;
}

/** 카탈로그 방만 보장. 참여자를 자동으로 넣지 않음. 2차·N대 중복은 canonical 으로 이전 후 삭제. */
let ensureOptInGroupRoomsInFlight: Promise<void> | null = null;
async function ensureOptInGroupRooms(): Promise<void> {
  if (ensureOptInGroupRoomsInFlight) return ensureOptInGroupRoomsInFlight;
  ensureOptInGroupRoomsInFlight = ensureOptInGroupRoomsWork().finally(() => {
    ensureOptInGroupRoomsInFlight = null;
  });
  return ensureOptInGroupRoomsInFlight;
}

async function ensureOptInGroupRoomsWork(): Promise<void> {
  try {
    collapseDuplicateGroupChatIds();
    const groups = getTable('group_chats');
    for (const g of groups) {
      const cap = Number(g.max_members);
      if (!Number.isFinite(cap) || cap < UNLIMITED_GROUP_MEMBERS) {
        g.max_members = UNLIMITED_GROUP_MEMBERS;
        try {
          await dbPersistRow('group_chats', g);
        } catch (e) {
          logger.error({ err: e, groupId: g.id }, '[ensureOptInGroupRooms] max_members persist failed');
        }
      }
    }
    for (const spec of OPT_IN_GROUP_ROOMS) {
      const canonical = await upsertCanonicalGroupRoom(spec);
      if (!canonical) continue;
      const matches = getTable('group_chats').filter(g => matchesAfterpartySpec(g, spec));
      await mergeMatchesIntoCanonical(matches, canonical);
    }
    // 보이는 N대 방은 20대·30대만. 같은 이름 중복은 canonical 으로 합친다. 10대/40~70대는 시드하지 않는다.
    for (const band of VISIBLE_AGE_BANDS) {
      const id = `group_age_${band.replace('대', '')}`;
      const name = `${band} 모임`;
      const canonical = await upsertCanonicalGroupRoom({
        id, name, interest_tag: band, room_kind: 'age_decade', age_group: band,
      });
      if (!canonical) continue;
      const matches = getTable('group_chats').filter(g => matchesVisibleAgeBand(g, band));
      await mergeMatchesIntoCanonical(matches, canonical);
    }
    const byYear = new Map<number, Record<string, unknown>[]>();
    for (const g of getTable('group_chats')) {
      const year = birthYearOfGroup(g);
      if (year == null) continue;
      const list = byYear.get(year) ?? [];
      list.push(g);
      byYear.set(year, list);
    }
    for (const [year, rooms] of byYear) {
      if (rooms.length < 2) continue;
      const canonical = await upsertCanonicalGroupRoom({
        id: `group_birth_${year}`,
        name: `${year}년생 모임`,
        interest_tag: `${year}년생`,
        room_kind: 'birth_year',
        age_group: null,
      });
      if (!canonical) continue;
      await mergeMatchesIntoCanonical(
        getTable('group_chats').filter(g => birthYearOfGroup(g) === year),
        canonical,
      );
    }
    await purgeRetiredAgeRooms();
  } catch (e) {
    logger.error({ err: e }, '[ensureOptInGroupRooms] 오류');
  }
}

const AUTO_ROOM_AGE_DECADE = 'age_decade';
const AUTO_ROOM_BIRTH_YEAR = 'birth_year';
const VISIBLE_AGE_BANDS = ['20대', '30대'] as const;
const RETIRED_AGE_ROOM_RE = /^(10|40|50|60|70)대 모임$/;

function isRetiredAgeRoom(g: Record<string, unknown>): boolean {
  const name = String(g.name ?? '');
  const id = String(g.id ?? '');
  const band = String(g.age_group ?? '');
  return RETIRED_AGE_ROOM_RE.test(name)
    || /^group_age_(10|40|50|60|70)$/.test(id)
    || /^(10|40|50|60|70)대$/.test(band);
}

async function purgeRetiredAgeRooms(): Promise<void> {
  const retired = getTable('group_chats').filter(g => isRetiredAgeRoom(g));
  for (const g of retired) {
    await deleteRetiredAgeRoom(g);
  }
}

async function deleteRetiredAgeRoom(g: Record<string, unknown>): Promise<void> {
  const groupId = String(g.id ?? '');
  if (!groupId) return;
  const msgs = getTable('group_messages').filter(m => String(m.group_id) === groupId);
  for (const m of msgs) {
    smartBroadcast('group_messages', m, { type: 'change', table: 'group_messages', event: 'DELETE', newRow: null, oldRow: m });
  }
  if (msgs.length) {
    const msgIds = msgs.map(m => String(m.id)).filter(Boolean);
    store['group_messages'] = getTable('group_messages').filter(m => String(m.group_id) !== groupId);
    await dbDeleteRows('group_messages', msgIds);
  }
  const parts = getTable('group_participants').filter(p => String(p.group_id) === groupId);
  for (const p of parts) {
    const uid = String(p.user_id ?? '');
    if (uid) await removeParticipant(uid, groupId, false);
    smartBroadcast('group_participants', p, { type: 'change', table: 'group_participants', event: 'DELETE', newRow: null, oldRow: p });
  }
  const outs = getTable('group_opt_outs').filter(r => String(r.group_id) === groupId);
  if (outs.length) {
    const outIds = outs.map(r => String(r.id)).filter(Boolean);
    store['group_opt_outs'] = getTable('group_opt_outs').filter(r => String(r.group_id) !== groupId);
    await dbDeleteRows('group_opt_outs', outIds);
  }
  store['group_chats'] = getTable('group_chats').filter(x => String(x.id) !== groupId);
  try {
    await dbDeleteRow('group_chats', groupId);
  } catch (e) {
    logger.error({ err: e, groupId }, '[deleteRetiredAgeRoom] group_chats persist failed');
  }
  smartBroadcast('group_chats', g, { type: 'change', table: 'group_chats', event: 'DELETE', newRow: null, oldRow: g });
}

function ageBandFromYear(year: unknown): string | null {
  const y = Number(year);
  if (!Number.isFinite(y) || y < 1900 || y > 2100) return null;
  const age = new Date().getFullYear() - y;
  if (age < 20) return null;
  if (age < 30) return '20대';
  return '30대';
}

function canonicalAgeRoomId(ageBand: string): string {
  return `group_age_${ageBand.replace(/대$/, '')}`;
}

function canonicalYearRoomId(year: number): string {
  return `group_birth_${year}`;
}

const autoMatchInFlight = new Map<string, Promise<void>>();

function autoRoomOptKey(kind: string, extra: string): string {
  return `${kind}:${extra}`;
}

function hasGroupOptOut(userId: string, optKey: string): boolean {
  return getTable('group_opt_outs').some(
    r => String(r.user_id) === userId && String(r.opt_key) === optKey,
  );
}

function optKeyForGroup(group: Record<string, unknown> | undefined, groupId: string): string {
  const kind = String(group?.room_kind ?? '');
  const name = String(group?.name ?? '');
  const tag = String(group?.interest_tag ?? '');
  const age = String(group?.age_group ?? '');
  if (kind === AUTO_ROOM_AGE_DECADE || /^\d+대 모임$/.test(name)) {
    const band = age || name.match(/^(\d+대)/)?.[1] || tag;
    return autoRoomOptKey(AUTO_ROOM_AGE_DECADE, String(band));
  }
  if (kind === AUTO_ROOM_BIRTH_YEAR || /^\d{4}년생 모임$/.test(name)) {
    const yearTag = /^\d{4}년생$/.test(tag)
      ? tag
      : (name.match(/^(\d{4}년생)/)?.[1] || tag);
    return autoRoomOptKey(AUTO_ROOM_BIRTH_YEAR, String(yearTag));
  }
  if (kind === 'afterparty_club' || tag === '2차클럽' || name.includes('2차 클럽')) return 'afterparty_club';
  if (kind === 'afterparty_drink' || tag === '2차술' || name.includes('2차 술')) return 'afterparty_drink';
  return resolveMergedGroupId(groupId);
}

function groupIdsInSameLeaveSlot(groupId: string): Set<string> {
  const resolved = resolveMergedGroupId(groupId);
  const ids = new Set<string>([groupId, resolved]);
  const target = getTable('group_chats').find(g => String(g.id) === resolved || String(g.id) === groupId);
  if (!target) return ids;
  const ap = afterpartySlotKey(target);
  const name = String(target.name ?? '');
  const yearOrAge = /^\d{4}년생 모임$/.test(name) || /^\d+대 모임$/.test(name);
  for (const g of getTable('group_chats')) {
    const gid = String(g.id);
    if (ap && afterpartySlotKey(g) === ap) ids.add(gid);
    else if (yearOrAge && String(g.name) === name) ids.add(gid);
  }
  return ids;
}

function participantRowsToLeave(userId: string, groupId: string): Record<string, unknown>[] {
  if (!userId || !groupId) return [];
  const ids = groupIdsInSameLeaveSlot(groupId);
  return getTable('group_participants').filter(p => {
    if (String(p.user_id) !== userId) return false;
    const gid = String(p.group_id ?? '');
    return ids.has(gid) || ids.has(resolveMergedGroupId(gid));
  });
}

async function recordGroupOptOut(part: Record<string, unknown>): Promise<void> {
  const userId = String(part.user_id ?? '');
  const groupId = String(part.group_id ?? '');
  if (!userId || !groupId) return;
  const group = getTable('group_chats').find(g => String(g.id) === groupId);
  const optKey = optKeyForGroup(group, groupId);
  const row: Record<string, unknown> = {
    id: `${userId}__${optKey}`,
    user_id: userId,
    group_id: groupId,
    room_kind: String(group?.room_kind ?? ''),
    opt_key: optKey,
    created_at: ts(),
  };
  const outs = getTable('group_opt_outs');
  const idx = outs.findIndex(r => String(r.id) === String(row.id));
  if (idx >= 0) outs[idx] = row;
  else outs.push(row);
  try {
    await dbPersistRow('group_opt_outs', row);
  } catch (e) {
    logger.error({ err: e, userId, groupId }, '[recordGroupOptOut] persist failed');
  }
}

async function clearGroupOptOut(userId: string, groupId: string): Promise<void> {
  const group = getTable('group_chats').find(g => String(g.id) === groupId);
  const optKey = optKeyForGroup(group, groupId);
  const outs = getTable('group_opt_outs');
  const gone = outs.filter(r => String(r.user_id) === userId && (String(r.opt_key) === optKey || String(r.group_id) === groupId));
  if (!gone.length) return;
  store['group_opt_outs'] = outs.filter(r => !gone.includes(r));
  for (const r of gone) {
    void dbDeleteRow('group_opt_outs', String(r.id));
  }
}

function isLeftoverInterestRoom(g: Record<string, unknown>): boolean {
  const kind = String(g.room_kind ?? '');
  const name = String(g.name ?? '');
  if (kind === 'afterparty_club' || kind === 'afterparty_drink') return false;
  if (kind === AUTO_ROOM_BIRTH_YEAR || /^\d{4}년생 모임$/.test(name)) return false;
  if (kind === AUTO_ROOM_AGE_DECADE || /^\d+대 모임$/.test(name)) return false;
  return kind === 'interest_age' || /대\s+.+\s*모임/.test(name) || /모임\s*모임/.test(name);
}

function afterpartySlotKey(g: Record<string, unknown>): 'afterparty_club' | 'afterparty_drink' | null {
  if (matchesAfterpartySpec(g, OPT_IN_GROUP_ROOMS[0])) return 'afterparty_club';
  if (matchesAfterpartySpec(g, OPT_IN_GROUP_ROOMS[1])) return 'afterparty_drink';
  return null;
}

/** 한도 계산용. 숨긴 중복 2차·레거시 관심사/은퇴 N대는 칸을 차지하지 않음. */
function groupLimitSlotKey(g: Record<string, unknown> | undefined, groupId: string): string | null {
  if (!g) return null;
  if (g.hidden === true) return null;
  const into = String(g.merged_into ?? '');
  if (into && into !== String(g.id)) return null;
  if (isLeftoverInterestRoom(g) || isRetiredAgeRoom(g)) return null;
  const ap = afterpartySlotKey(g);
  if (ap) return ap;
  const name = String(g.name ?? '');
  if (/^\d{4}년생 모임$/.test(name)) return `year:${name}`;
  if (/^\d+대 모임$/.test(name)) return `age:${name}`;
  return String(g.id || groupId);
}

function countUserGroupSlots(userId: string): number {
  const keys = new Set<string>();
  for (const p of getTable('group_participants')) {
    if (String(p.user_id) !== userId) continue;
    const gid = String(p.group_id ?? '');
    const g = getTable('group_chats').find(row => String(row.id) === gid);
    const key = groupLimitSlotKey(g, gid);
    if (key) keys.add(key);
  }
  return keys.size;
}

async function pruneNonCatalogMemberships(userId: string): Promise<void> {
  const mine = getTable('group_participants').filter(p => String(p.user_id) === userId);
  for (const p of mine) {
    const gid = String(p.group_id ?? '');
    const g = getTable('group_chats').find(row => String(row.id) === gid);
    if (groupLimitSlotKey(g, gid) == null) {
      await removeParticipant(userId, gid, false);
    }
  }
}

async function removeParticipant(userId: string, groupId: string, recordOptOut: boolean): Promise<void> {
  const parts = getTable('group_participants');
  const part = parts.find(p => String(p.group_id) === groupId && String(p.user_id) === userId);
  if (!part) return;
  store['group_participants'] = parts.filter(p => String(p.id) !== String(part.id));
  try {
    await dbDeleteRow('group_participants', String(part.id));
  } catch (e) {
    logger.error({ err: e, userId, groupId }, '[removeParticipant] persist failed');
  }
  if (recordOptOut) await recordGroupOptOut(part);
}

async function joinOrCreateAutoRoom(userId: string, spec: {
  room_kind: string;
  name: string;
  interest_tag: string;
  age_group: string | null;
  optKey: string;
  canonicalId?: string;
}): Promise<void> {
  const groups = getTable('group_chats');
  let room = groups.find(g => spec.canonicalId && String(g.id) === spec.canonicalId)
    ?? groups.find(g => String(g.name) === spec.name && String(g.hidden ?? '') !== 'true' && g.hidden !== true);
  if (!room) {
    room = {
      id: spec.canonicalId || genId(),
      name: spec.name,
      interest_tag: spec.interest_tag,
      age_group: spec.age_group,
      room_kind: spec.room_kind,
      max_members: UNLIMITED_GROUP_MEMBERS,
      hidden: false,
      created_at: ts(),
    };
    groups.push(room);
    try {
      await dbPersistRow('group_chats', room);
      smartBroadcast('group_chats', room, {
        type: 'change', table: 'group_chats', event: 'INSERT', newRow: room, oldRow: null,
      });
    } catch (e) {
      store['group_chats'] = groups.filter(g => String(g.id) !== String(room!.id));
      logger.error({ err: e, userId }, '[autoMatchGroupChat] room persist failed');
      return;
    }
  } else {
    room.name = spec.name;
    room.interest_tag = spec.interest_tag;
    room.room_kind = spec.room_kind;
    room.age_group = spec.age_group;
    room.max_members = UNLIMITED_GROUP_MEMBERS;
    room.hidden = false;
    room.merged_into = null;
    try {
      await dbPersistRow('group_chats', room);
    } catch (e) {
      logger.error({ err: e, userId, groupId: String(room.id) }, '[autoMatchGroupChat] room update persist failed');
    }
  }
  if (hasGroupOptOut(userId, spec.optKey)) return;
  const kind = String(room.room_kind ?? '');
  if (kind === 'afterparty_club' || kind === 'afterparty_drink') return;
  const parts = getTable('group_participants');
  if (parts.some(p => String(p.group_id) === String(room.id) && String(p.user_id) === userId)) return;
  if (countUserGroupSlots(userId) >= MAX_GROUPS_PER_USER) return;
  if (hasGroupOptOut(userId, spec.optKey)) return;
  const part = {
    id: `${room.id}__${userId}`,
    group_id: String(room.id),
    user_id: userId,
    joined_at: ts(),
  };
  parts.push(part);
  try {
    await dbPersistRow('group_participants', part);
    if (hasGroupOptOut(userId, spec.optKey)) {
      await removeParticipant(userId, String(room.id), false);
      return;
    }
    smartBroadcast('group_participants', part, {
      type: 'change', table: 'group_participants', event: 'INSERT', newRow: part, oldRow: null,
    });
  } catch (e) {
    store['group_participants'] = getTable('group_participants').filter(p => String(p.id) !== part.id);
    logger.error({ err: e, userId }, '[autoMatchGroupChat] join persist failed');
  }
}

/** 년생 + N대 두 방만 자동 입장. 관심사 이름 없음. 2차는 넣지 않음. 명시적 나가기는 재입장하지 않음. */
async function autoMatchGroupChat(userId: string, profile: Record<string, unknown>): Promise<void> {
  if (!userId) return;
  try {
    await ensureOptInGroupRooms();
    const ageBand = ageBandFromYear(profile.birth_year);
    const year = Number(profile.birth_year);
    const parts = getTable('group_participants').filter(p => String(p.user_id) === userId);
    for (const p of parts) {
      const g = getTable('group_chats').find(row => String(row.id) === String(p.group_id));
      if (g && isLeftoverInterestRoom(g)) {
        await removeParticipant(userId, String(p.group_id), false);
      }
    }
    if (ageBand) {
      await joinOrCreateAutoRoom(userId, {
        room_kind: AUTO_ROOM_AGE_DECADE,
        name: `${ageBand} 모임`,
        interest_tag: ageBand,
        age_group: ageBand,
        optKey: autoRoomOptKey(AUTO_ROOM_AGE_DECADE, ageBand),
        canonicalId: canonicalAgeRoomId(ageBand),
      });
    }
    if (Number.isFinite(year) && year >= 1900 && year <= 2100) {
      await joinOrCreateAutoRoom(userId, {
        room_kind: AUTO_ROOM_BIRTH_YEAR,
        name: `${year}년생 모임`,
        interest_tag: `${year}년생`,
        age_group: null,
        optKey: autoRoomOptKey(AUTO_ROOM_BIRTH_YEAR, `${year}년생`),
        canonicalId: canonicalYearRoomId(year),
      });
    }
    const mine = getTable('group_participants').filter(p => String(p.user_id) === userId);
    for (const p of mine) {
      const gid = String(p.group_id ?? '');
      const g = getTable('group_chats').find(row => String(row.id) === gid);
      if (hasGroupOptOut(userId, optKeyForGroup(g, gid))) {
        await removeParticipant(userId, gid, false);
      }
    }
  } catch (e) {
    logger.error({ err: e, userId }, '[autoMatchGroupChat] 오류');
  }
}

async function autoMatchGroupChatGuarded(userId: string, profile: Record<string, unknown>): Promise<void> {
  const running = autoMatchInFlight.get(userId);
  if (running) {
    await running;
    return;
  }
  const pending = autoMatchGroupChat(userId, profile).finally(() => autoMatchInFlight.delete(userId));
  autoMatchInFlight.set(userId, pending);
  await pending;
}

// Seed must finish before /api/db handles traffic. LISTEN/NOTIFY is background-only —
// blocking requests on Postgres LISTEN connect hung chat INSERT + SSE on Render boot.
// cleanupLegacyTables는 부팅 경로에서 제외 — 콜드스타트·재배포 직후 채팅/하트 503 대기 시간 단축.
const dbReadyPromise = seedIfNeeded()
  .then(() => {
    startDailyEntryPasswordRenewal();
  });

dbReadyPromise
  .then(() => cleanupLegacyTables())
  .then(() => loadRemainingTablesFromDb())
  .then(() => ensureOptInGroupRooms())
  .then(() => {
    startIntegrityDiagnostics();
    return setupListenClient();
  })
  .then(() => loadImagesFromDb())
  .catch(e => logger.error({ err: e }, '[db] startup initialization failed'));

// redeploy·resync 후에도 BOOTSTRAP env → DB 비밀번호 자동 동기화
// leftover JSON 키는 부팅 cleanup이 실패해도 이 주기로 재시도 (재배포 없이 PG에서 제거)
setInterval(() => {
  ensureAppSettingsSecrets()
    .then(() => cleanupLegacyTables())
    .catch(e => logger.error({ err: e }, '[db] periodic secret/legacy sync failed'));
}, 5 * 60 * 1000).unref();

router.use(async (_req, res, next) => {
  try {
    await dbReadyPromise;
    next();
  } catch (e) {
    logger.error({ err: e }, '[db] init gate failed');
    if (!res.headersSent) {
      res.status(503).json({ data: null, error: { message: 'Database initializing, retry shortly' } });
    }
  }
});

// 120초마다 DB 재동기화 — merge-by-id, 클라이언트 전체 리로드(_bulk_resync)는 쏘지 않음
// FORBIDDEN: resyncAllFromNativeDb('forced') 로 바꾸지 말 것. forced 는 전원 탭에
// _bulk_resync 를 쏴 2분마다 재연결 폭풍이 된다. longevity-guards 테스트가 이 문자열을 고정한다.
setInterval(() => { resyncAllFromNativeDb('periodic').catch(e => logger.error({ err: e }, '[db] resync failed')); }, 120_000).unref();
// 분산 rate_limits KV 가 행사 내내 쌓여 PG 가 느려지지 않게 만료 행 정리
setInterval(() => { pruneDistributedRateLimits().catch(e => logger.warn({ err: e }, '[db] rate_limits prune failed')); }, 5 * 60 * 1000).unref();
// 25초마다 hot 테이블 재동기화 — 다중 Render 인스턴스 split-brain 완화
setInterval(() => { resyncHotTablesFromDb().catch(e => logger.warn({ err: e }, '[db] hot resync failed')); }, 25_000).unref();

function tableFingerprint(rows: Record<string, unknown>[]): string {
  let maxTs = '';
  for (const r of rows) {
    const ts = String(r.updated_at ?? r.created_at ?? '');
    if (ts > maxTs) maxTs = ts;
  }
  return `${rows.length}:${maxTs}`;
}

// ─── Cross-instance sync via PostgreSQL LISTEN/NOTIFY ─────────────────────────
// autoscale 환경에서 여러 인스턴스가 뜰 때 store + SSE를 동기화한다.
// 각 인스턴스는 data_change 채널을 LISTEN하고, 쓰기 시 NOTIFY로 전파한다.
// 자신이 보낸 NOTIFY는 INSTANCE_ID로 걸러서 중복 브로드캐스트를 방지한다.

let _listenClient: pg.Client | null = null;

async function setupListenClient(): Promise<void> {
  // try 외부에 선언 — catch 블록에서 client.end()로 커넥션 누수 방지
  let client: pg.Client | null = null;
  try {
    client = new pg.Client(buildPgOptions());
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
          }).catch(e => logger.warn({ err: e }, '[db] tombstone DB refetch failed'));
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
          // 비밀번호가 빠진(sanitize된) app_settings는 메모리에 덮어쓰지 않고 DB에서 다시 읽는다.
          if (tbl === 'app_settings' && SECRET_SETTING_KEYS.some(k => !(k in newRow))) {
            const sid = String(newRow['id'] ?? 1);
            pool.query(
              `SELECT data FROM app_kv_rows WHERE table_name = $1 AND row_id = $2 LIMIT 1`,
              [tbl, sid],
            ).then(result => {
              const row = (result.rows[0]?.data ?? null) as Record<string, unknown> | null;
              if (!row) return;
              if (!store[tbl]) store[tbl] = [];
              const sidx = store[tbl].findIndex(r => r['id'] === row['id'] || r['id'] === 1);
              if (sidx >= 0) store[tbl][sidx] = row; else store[tbl].push(row);
            }).catch(e => logger.warn({ err: e }, '[db] app_settings NOTIFY refetch failed'));
            return;
          }
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
      logger.error({ err }, '[db] LISTEN client error — reconnecting in 5 s');
      _listenClient = null;
      // client는 이 시점에 반드시 연결된 상태 (error 이벤트는 connect 이후에만 발생)
      client!.end().catch(() => {});
      // 재연결 후 핫 테이블 재동기화: 5초 gap 중 누락된 변경 복구
      setTimeout(() => {
        setupListenClient()
          .then(() => resyncHotTablesFromDb())
          .catch(e => logger.error({ err: e }, '[db] LISTEN reconnect failed'));
      }, 5000);
    });
    _listenClient = client;
    logger.info({ instance: INSTANCE_ID.slice(0, 8) }, '[db] LISTEN data_change ready');
  } catch (err) {
    logger.error({ err }, '[db] setupListenClient failed — retry in 10 s');
    // connect() 성공 후 LISTEN 실패 시 반드시 종료 — pg.Client 커넥션 누수 방지
    if (client) client.end().catch(() => {});
    setTimeout(() => {
      setupListenClient()
        .then(() => resyncHotTablesFromDb())
        .catch(e => logger.error({ err: e }, '[db] LISTEN retry failed'));
    }, 10000);
  }
}

// NOTIFY 직렬 큐 — 동시 쓰기 시 pool 과부하 방지.
// 같은 row의 대기 이벤트는 최신 상태로 합쳐 유실 가능성과 큐 사용량을 줄입니다.
const _notifyQueue: string[] = [];
const NOTIFY_QUEUE_MAX = 256;
let _notifyBusy = false;
function _drainNotifyQueue() {
  if (_notifyBusy || _notifyQueue.length === 0) return;
  _notifyBusy = true;
  const payload = _notifyQueue.shift()!;
  pool.query("SELECT pg_notify('data_change', $1)", [payload])
    .catch((e) => logger.warn({ err: e }, '[db] NOTIFY failed'))
    .finally(() => { _notifyBusy = false; _drainNotifyQueue(); });
}

function enqueueNotify(msg: string, table: string, rowId: unknown): void {
  if (rowId != null) {
    for (let i = _notifyQueue.length - 1; i >= 0; i--) {
      try {
        const queued = JSON.parse(_notifyQueue[i]) as { table?: string; id?: unknown; newRow?: Record<string, unknown>; oldRow?: Record<string, unknown> };
        const queuedId = queued.id ?? (queued.newRow ?? queued.oldRow)?.['id'];
        if (queued.table === table && String(queuedId) === String(rowId)) {
          _notifyQueue[i] = msg;
          return;
        }
      } catch {
        // 손상된 항목은 drain 단계에서 실패하도록 그대로 두고 다음 항목을 확인합니다.
      }
    }
  }
  if (_notifyQueue.length >= NOTIFY_QUEUE_MAX) _notifyQueue.shift();
  _notifyQueue.push(msg);
  _drainNotifyQueue();
}

/** 다른 인스턴스에 변경 사항 전파. 이미지 테이블 제외. 8 KB 초과 시 tombstone 전송 */
function notifyOtherInstances(table: string, ev: string, newRow: Record<string, unknown> | null, oldRow: Record<string, unknown> | null): void {
  if (table === 'app_image_store') return; // 이미지 data URL은 수 KB — 제외
  const id = (newRow ?? oldRow)?.['id'];
  // app_settings 비밀번호는 NOTIFY 페이로드에 넣지 않고 DB에서 다시 읽는다.
  if (table === 'app_settings') {
    if (id == null) return;
    enqueueNotify(JSON.stringify({ src: INSTANCE_ID, table, ev, id, _tombstone: true }), table, id);
    return;
  }
  const payload = JSON.stringify({ src: INSTANCE_ID, table, ev, newRow, oldRow });
  let msg: string;
  if (payload.length > 7900) {
    if (!id) return;
    msg = JSON.stringify({ src: INSTANCE_ID, table, ev, id, _tombstone: true });
  } else {
    msg = payload;
  }
  enqueueNotify(msg, table, id);
}

function pickLatestAppSettingsRow(rows: Record<string, unknown>[]): Record<string, unknown> | null {
  if (!rows.length) return null;
  let best = rows[0];
  let bestTs = String(best.updated_at ?? '');
  for (let i = 1; i < rows.length; i++) {
    const ts = String(rows[i].updated_at ?? '');
    if (ts >= bestTs) {
      best = rows[i];
      bestTs = ts;
    }
  }
  return best;
}

/** DB resync 시 오래된 session_active가 메모리를 덮어쓰지 않도록 updated_at 기준 병합 */
function applyAppSettingsFromDbRows(dbRows: Record<string, unknown>[]): boolean {
  const dbRow = pickLatestAppSettingsRow(dbRows);
  if (!dbRow) return false;
  const hadLegacy = settingsHaveLegacyKeys(dbRow);
  const cleaned = stripLegacySettingsKeys(dbRow);
  const memRow = (getTable('app_settings')[0] ?? null) as Record<string, unknown> | null;
  if (!memRow) {
    store['app_settings'] = [cleaned];
    if (hadLegacy) {
      dbPersistRow('app_settings', cleaned).catch(e => logger.warn({ err: e }, '[db] persist stripped app_settings'));
    }
    return true;
  }
  const memTs = String(memRow.updated_at ?? '');
  const dbTs = String(dbRow.updated_at ?? '');
  if (dbTs >= memTs) {
    const changed = memTs !== dbTs || memRow.session_active !== dbRow.session_active;
    store['app_settings'] = [cleaned];
    if (hadLegacy) {
      dbPersistRow('app_settings', cleaned).catch(e => logger.warn({ err: e }, '[db] persist stripped app_settings'));
    }
    return changed;
  }
  // 메모리가 더 최신(세션 토글 등)이어도 비밀번호는 항상 DB 값을 쓴다.
  // 예전 "heal" persist는 다른 인스턴스의 옛 비밀번호로 패널 변경을 되돌렸다.
  const merged = { ...memRow };
  for (const key of SECRET_SETTING_KEYS) {
    if (cleaned[key] != null && String(cleaned[key]).trim() !== '') merged[key] = cleaned[key];
  }
  store['app_settings'] = [stripLegacySettingsKeys(merged)];
  return SECRET_SETTING_KEYS.some(k => String(memRow[k] ?? '') !== String(merged[k] ?? ''));
}

/** hot 테이블(profiles·app_settings)을 app_kv_rows에서 재동기화 — LISTEN gap 보정 전용 */
const REALTIME_MERGE_TABLES = new Set(['profiles', 'chats', 'likes', 'messages', 'contact_shares', 'signal_sends']);
const _lastDbMerge = new Map<string, number>();
const DB_MERGE_THROTTLE_MS = 2_500;

/** SELECT 직전 인스턴스 간 split-brain 완화 — PG 최신 행을 in-memory store에 병합 */
async function mergeTableFromDbIfStale(table: string, force = false): Promise<void> {
  const now = Date.now();
  const last = _lastDbMerge.get(table) ?? 0;
  if (!force && now - last < DB_MERGE_THROTTLE_MS) return;
  _lastDbMerge.set(table, now);
  try {
    const limit = RESYNC_TABLE_LIMIT[table] ?? 5000;
    const { rows } = await pool.query(
      `SELECT data FROM app_kv_rows WHERE table_name = $1 ORDER BY updated_at DESC LIMIT $2`,
      [table, limit],
    );
    if (!rows.length) return;
    if (!store[table]) store[table] = [];
    const memRows = store[table];
    const byId = new Map(memRows.map(r => [String(r['id']), r]));
    for (const row of rows) {
      const data = row.data as Record<string, unknown>;
      const id = String(data['id'] ?? '');
      if (!id) continue;
      const existing = byId.get(id);
      const dbTs = String(data.updated_at ?? data.created_at ?? '');
      const memTs = existing ? String(existing.updated_at ?? existing.created_at ?? '') : '';
      if (!existing) {
        memRows.push(data);
        byId.set(id, data);
      } else if (dbTs >= memTs) {
        const idx = memRows.findIndex(r => String(r['id']) === id);
        if (idx >= 0) memRows[idx] = data;
        byId.set(id, data);
      }
    }
    if (table === 'chats') await dedupeChatsInStore();
  } catch (e) {
    logger.warn({ err: e, table }, '[db] mergeTableFromDbIfStale failed');
  }
}

async function resyncHotTablesFromDb(): Promise<void> {
  try {
    // messages/likes/chats 는 절대 wholesale replace 하지 않음 — LIMIT 때문에 오래된 방이 메모리에서 증발함
    const hotTables = ['profiles', 'chats', 'likes', 'messages', 'app_settings'] as const;
    const limits: Record<string, number> = { profiles: 10000, chats: 8000, likes: 8000, messages: 15000, app_settings: 10 };
    await Promise.all(hotTables.map(async (tbl) => {
      const limit = limits[tbl] ?? 5000;
      const { rows } = await pool.query(
        `SELECT data FROM app_kv_rows WHERE table_name = $1 ORDER BY updated_at DESC LIMIT $2`,
        [tbl, limit],
      );
      if (!rows.length) return;
      if (tbl === 'app_settings') {
        applyAppSettingsFromDbRows(rows.map(r => r.data as Record<string, unknown>));
        return;
      }
      if (!store[tbl]) store[tbl] = [];
      const memRows = store[tbl];
      const byId = new Map(memRows.map(r => [String(r['id']), r]));
      for (const row of rows) {
        const data = row.data as Record<string, unknown>;
        const id = String(data['id'] ?? '');
        if (!id) continue;
        const existing = byId.get(id);
        const dbTs = String(data.updated_at ?? data.created_at ?? '');
        const memTs = existing ? String(existing.updated_at ?? existing.created_at ?? '') : '';
        if (!existing) {
          memRows.push(data);
          byId.set(id, data);
        } else if (dbTs >= memTs) {
          const idx = memRows.findIndex(r => String(r['id']) === id);
          if (idx >= 0) memRows[idx] = data;
          byId.set(id, data);
        }
      }
    }));
    await dedupeChatsInStore();
    logger.info({}, '[db] hot-table resync complete (merge-by-id)');
  } catch (e) {
    logger.warn({ err: e }, '[db] hot-table resync failed');
  }
}

// 관리자·테스트 패널이 Supabase 네이티브 테이블에 직접 쓸 때 api-server 인메모리와 어긋남
// → 30초마다 네이티브 테이블에서 전체 재동기화해 최대 30초 안에 자동 복구
const FULL_RESYNC_TABLES: Array<{ tbl: string; order?: string }> = [
  { tbl: 'profiles' },
  { tbl: 'app_settings' },
  { tbl: 'notifications', order: 'ORDER BY created_at DESC' },
  { tbl: 'likes',           order: 'ORDER BY created_at DESC LIMIT 5000' },
  { tbl: 'chats',           order: 'ORDER BY created_at DESC LIMIT 5000' },
  { tbl: 'contact_shares',  order: 'ORDER BY created_at DESC LIMIT 5000' },
  { tbl: 'signal_sends',    order: 'ORDER BY created_at DESC LIMIT 5000' },
];

let _fullResyncRunning = false;

// [Fix] 테이블별 최대 행 수 — 리싱크 시 인메모리 크기 상한 적용
const RESYNC_TABLE_LIMIT: Record<string, number> = {
  notifications: 200,
  likes: 5000,
  chats: 5000,
  contact_shares: 5000,
  signal_sends: 5000,
};

async function pruneDistributedRateLimits(): Promise<void> {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) return;
  try {
    await pool.query(
      `DELETE FROM app_kv_rows
       WHERE table_name = 'rate_limits'
         AND updated_at < NOW() - INTERVAL '10 minutes'`,
    );
  } catch (e) {
    logger.warn({ err: e }, '[db] rate_limits prune failed');
  }
}

async function resyncAllFromNativeDb(reason: 'periodic' | 'forced' = 'periodic'): Promise<void> {
  if (_fullResyncRunning) return; // 이전 리싱크가 아직 실행 중이면 skip
  _fullResyncRunning = true;
  try {
    // [Fix] 테이블별 LIMIT 적용 — 대용량 세션에서 전체 행 적재로 인한 메모리/지연 방지
    // ROW_NUMBER() OVER(PARTITION BY table_name ORDER BY updated_at DESC) 로 최근 N개만 조회
    const tableNames = FULL_RESYNC_TABLES.map(t => t.tbl);
    const defaultLimit = 10000;
    const limitSql = tableNames
      .map(t => `(SELECT table_name, data FROM app_kv_rows WHERE table_name = '${t}' ORDER BY updated_at DESC LIMIT ${RESYNC_TABLE_LIMIT[t] ?? defaultLimit})`)
      .join(' UNION ALL ');
    const { rows } = await pool.query(limitSql);
    const grouped: Record<string, Record<string, unknown>[]> = {};
    for (const r of rows) {
      const tbl = r.table_name as string;
      if (!grouped[tbl]) grouped[tbl] = [];
      grouped[tbl].push(r.data as Record<string, unknown>);
    }
    const notifyClients = shouldBroadcastBulkResync(reason);
    for (const { tbl } of FULL_RESYNC_TABLES) {
      if (grouped[tbl] === undefined) continue;
      const prev = store[tbl];
      const prevFp = tableFingerprint(prev ?? []);
      if (tbl === 'app_settings') {
        const settingsChanged = applyAppSettingsFromDbRows(grouped[tbl]);
        if (settingsChanged) {
          const latest = getTable('app_settings')[0] as Record<string, unknown>;
          broadcastAll({ type: 'change', table: 'app_settings', event: 'UPDATE',
            newRow: sanitizeSettings(latest),
            oldRow: sanitizeSettings((prev?.[0] ?? {}) as Record<string, unknown>),
          });
        }
        continue;
      }
      // wholesale replace(LIMIT)는 오래된 likes/chats 를 메모리에서 지우고
      // fingerprint 가 바뀔 때마다 전원 클라이언트 리로드 폭풍을 만든다.
      if (!store[tbl]) store[tbl] = [];
      mergeDbRowsIntoMemory(store[tbl], grouped[tbl]);
      const nextFp = tableFingerprint(store[tbl]);
      if (notifyClients && prevFp !== nextFp) {
        broadcastAll({
          type: 'change', table: tbl, event: 'UPDATE',
          newRow: { _bulk_resync: true, count: store[tbl].length },
          oldRow: { count: prev?.length ?? 0 },
        });
      }
    }
    logger.info({ reason }, '[db] full resync complete (via app_kv_rows)');
    // resync가 app_settings를 덮어쓴 뒤 비밀번호·QR URL 자동 복구
    await repairAppSettingsIfNeeded();
    await ensureAppSettingsSecrets();
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
    try { client.end(); } catch { /* ignore */ }
  }
  if (conns.size === 0) {
    for (const [uid, s] of sseUserMap) { if (s === conns) { sseUserMap.delete(uid); break; } }
  }
}

const SSE_BROADCAST_SYNC_MAX = Number(process.env.SSE_BROADCAST_SYNC_MAX ?? 400);
const SSE_BROADCAST_CHUNK = Number(process.env.SSE_BROADCAST_CHUNK ?? 100);

/** 모든 클라이언트에게 전송 (공개 이벤트: profiles, app_settings, games 등) */
function broadcastAll(event: Record<string, unknown>) {
  const json = JSON.stringify(event);
  const seq = _ringAdd(json, 'all');
  const payload = `id: ${seq}\ndata: ${json}\n\n`;
  const batch: Array<[Response, Set<Response>]> = [];
  for (const [, conns] of sseUserMap) for (const c of conns) batch.push([c, conns]);
  for (const c of sseAnonClients) batch.push([c, sseAnonClients]);
  for (const c of sseAdminClients) batch.push([c, sseAdminClients]);
  // 행사장 규모(≤400 연결)는 한 틱에 전송 — 관리자 잠금/회의 시작 지연을 청킹이 키우지 않게
  if (batch.length <= SSE_BROADCAST_SYNC_MAX) {
    for (const [c, conns] of batch) _send(c, conns, payload);
    return;
  }
  const doChunk = (i: number) => {
    const end = Math.min(i + SSE_BROADCAST_CHUNK, batch.length);
    for (let j = i; j < end; j++) _send(batch[j][0], batch[j][1], payload);
    if (end < batch.length) setImmediate(() => doChunk(end));
  };
  doChunk(0);
}

/** 특정 사용자들에게만 전송 (비공개 이벤트: messages, likes, chats 등) */
function broadcastToUsers(userIds: string[], event: Record<string, unknown>) {
  const json = JSON.stringify(event);
  const seq = _ringAdd(json, userIds);
  const payload = `id: ${seq}\ndata: ${json}\n\n`;
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
  'heart_balances',
  'group_messages', 'group_participants',
  'blocked_users', 'profile_views',
  'signal_sends',
  // user_signals는 공개 — 전광판/카드에서 모두가 볼 수 있음 (연락처 등 민감정보 없음)
]);

function _stripInternalBroadcastFields(table: string, event: Record<string, unknown>): Record<string, unknown> {
  if (table !== 'messages') return event;
  const strip = (row: unknown) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
    const r = { ...(row as Record<string, unknown>) };
    delete r.chat_user1_id;
    delete r.chat_user2_id;
    return r;
  };
  return { ...event, newRow: strip(event['newRow']), oldRow: strip(event['oldRow']) };
}

/** 테이블 종류에 따라 자동으로 수신자 판단 — 로컬 SSE 전송 전용 (NOTIFY 없음) */
function _smartBroadcastLocal(table: string, row: Record<string, unknown> | null, event: Record<string, unknown>) {
  // row가 없는 경우(DELETE payload 없음): 프라이빗 테이블이면 드롭, 공개 테이블만 전체 전송
  if (!row) {
    if (!PRIVATE_TABLES.has(table)) broadcastAll(event);
    return;
  }
  const targets = collectBroadcastTargets(table, row);
  const safeEvent = _stripInternalBroadcastFields(table, event);

  if (targets.length > 0) {
    // 프로필 포함 이벤트라도 수신자가 명확하면 해당 유저에게만 전달
    broadcastToUsers(targets, safeEvent);
  } else if (!PRIVATE_TABLES.has(table)) {
    // 공개 테이블(profiles, app_settings 등)만 전체 브로드캐스트 허용
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
  } else {
    // 프라이빗 테이블인데 수신자를 특정 못한 경우 → 드롭하되 관측 가능하게 경고
    logger.warn({ table, rowId: row['id'], chatId: row['chat_id'] }, '[sse] private event dropped — no targets');
  }
}

/** 로컬 SSE 전송 + 다른 인스턴스에 NOTIFY 전파 */
function smartBroadcast(table: string, row: Record<string, unknown> | null, event: Record<string, unknown>) {
  if (row && REALTIME_TRACE_TABLES.has(table)) {
    logger.info({
      ...realtimeTraceMeta(table, row),
      event: typeof event.event === 'string' ? event.event : null,
    }, '[realtime] emit');
  }
  _smartBroadcastLocal(table, row, event);
  notifyOtherInstances(
    table,
    event['event'] as string,
    event['newRow'] as Record<string, unknown> | null,
    event['oldRow'] as Record<string, unknown> | null,
  );
}

// ─── Web Push: 메시지/하트 삽입 시 수신자에게 알림 전송 ──────────────────────
async function sendPushForEvent(
  table: string,
  row: Record<string, unknown>,
  actorId?: string | null,
): Promise<void> {
  let recipientId: string | null = null;
  let payload: PushPayload | null = null;

  if (table === 'messages') {
    const chat = getTable('chats').find(c => String(c.id) === String(row.chat_id));
    if (!chat) return;
    recipientId = (String(chat.user1_id) === String(row.sender_id) ? chat.user2_id : chat.user1_id) as string;
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
  } else if (table === 'signal_sends' && row.action === 'send') {
    recipientId = row.receiver_id as string;
    const sender = getTable('profiles').find(p => p.id === row.sender_id);
    const nick = (sender?.nickname as string) ?? '누군가';
    payload = { title: `💕 ${nick}님`, body: '시그널을 보냈어요!', tag: `signal-${row.sender_id as string}`, url: '/' };
  } else if (table === 'chats' && actorId) {
    const u1 = String(row.user1_id ?? '');
    const u2 = String(row.user2_id ?? '');
    recipientId = u1 === String(actorId) ? u2 : u1;
    if (!recipientId || recipientId === String(actorId)) return;
    const opener = getTable('profiles').find(p => p.id === actorId);
    const nick = (opener?.nickname as string) ?? '누군가';
    payload = {
      title: `💬 ${nick}님`,
      body: '채팅방을 열었어요',
      tag: `chat-open-${String(row.id ?? '')}`,
      url: '/',
    };
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
    dbDeleteRows('push_subscriptions', expired).catch(e => logger.error({ err: e }, '[db] background task error'));
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
  const requestId = String(req.headers['x-request-id'] ?? req.id ?? '');
  if (requestId) res.setHeader('x-request-id', requestId);

  // 동시 요청이 상한선을 초과하면 503 반환 — 클라이언트가 지수 백오프 후 재시도
  if (_activeOpCount >= MAX_CONCURRENT_OPS) {
    res.status(503).setHeader('Retry-After', '1');
    logger.warn({ requestId, code: 'BUSY' }, '[op] concurrent cap');
    return res.json({ data: null, error: { message: 'Server busy — retry in 1s', code: 'BUSY' } });
  }
  _activeOpCount++;

  // ─ requesterId 세션 바인딩 — 구조분해 이전에 실행해야 local const에 올바른 값이 들어감 ─
  // 인증된 세션이 있는 경우: body requesterId와 불일치하면 즉시 차단, 일치하거나 null이면 세션값으로 확정
  {
    const bodyRec = req.body as Record<string, unknown>;
    const _authId = resolveAuthUserId(req, bodyRec);
    const _bodyReqId = bodyRec.requesterId as string | null | undefined;
    if (_authId && _bodyReqId != null && String(_bodyReqId) !== _authId) {
      _activeOpCount--;
      logger.warn({ ip: req.ip, session: _authId, claimed: _bodyReqId }, '[SECURITY] requesterId body-spoof attempt blocked');
      return res.status(403).json({ data: null, error: { message: 'Forbidden: requesterId must match authenticated session', code: 'FORBIDDEN' } });
    }
    if (_authId) bodyRec.requesterId = _authId;
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
    testToken,
  } = req.body as {
    table: string; op: string;
    filters: FilterSpec[]; orders: { col: string; asc: boolean }[];
    limit?: number; single?: boolean; maybeSingle?: boolean;
    payload?: unknown; conflictCols?: string[]; selectAfterWrite?: boolean;
    requesterId?: string | null;
    adminToken?: string | null;
    testToken?: string | null;
  };

  // 관리자 토큰 검증 — HMAC 재계산으로 검증 (서버 재시작 후에도 유효)
  const isAdmin = verifyAdminToken(adminToken);
  const isTestSession = verifyTestToken(testToken);
  const canReadPrivateTables = isAdmin || isTestSession;
  const sessionUserId = resolveAuthUserId(req, req.body as Record<string, unknown>);

  // requesterId는 인증 수단이 아니라 세션 사용자와의 일치 검사용입니다.
  // 테스트 환경의 기존 단위 테스트만 메모리 세션 없이 직접 가드를 검증합니다.
  if (process.env.NODE_ENV !== 'test' && requesterId && !sessionUserId && !isAdmin && !isTestSession) {
    _activeOpCount--;
    logger.warn({ requesterId, ip: req.ip }, '[SECURITY] unauthenticated requesterId blocked');
    return res.status(401).json({ data: null, error: { message: 'Authentication required', code: 'UNAUTHORIZED' } });
  }

  // ─ 페이로드 타입 방어: table/op는 반드시 문자열이어야 함 ─────────────────────
  if (typeof table !== 'string' || typeof op !== 'string') {
    _activeOpCount--;
    return res.status(400).json({ data: null, error: { message: 'table and op must be strings', code: 'INVALID_INPUT' } });
  }

  // 핵심 쓰기 작업만 requestId 로깅 (관측용, 본문/비밀 제외)
  if (
    (op === 'insert' || op === 'update' || op === 'upsert' || op === 'delete') &&
    (table === 'messages' || table === 'chats' || table === 'likes' || table === 'contact_shares' || table === 'signal_sends')
  ) {
    logger.info({ requestId, op, table }, '[op] critical-write');
  }

  // ─ op 허용 목록: 알 수 없는 op는 즉시 거부 ────────────────────────────────────
  const ALLOWED_OPS = new Set(['select', 'insert', 'update', 'upsert', 'delete']);
  if (!ALLOWED_OPS.has(op)) {
    _activeOpCount--;
    return res.status(400).json({ data: null, error: { message: `Invalid op: ${op}`, code: 'INVALID_OP' } });
  }

  // ─ table/op 문자열 길이 제한 ────────────────────────────────────────────────
  if (table.length > 100 || op.length > 50) {
    _activeOpCount--;
    return res.status(400).json({ data: null, error: { message: 'Invalid input length', code: 'INVALID_INPUT' } });
  }

  // ─ boolean 필드 타입 검증 ────────────────────────────────────────────────────
  if (single != null && typeof single !== 'boolean') {
    _activeOpCount--;
    return res.status(400).json({ data: null, error: { message: 'single must be a boolean', code: 'INVALID_INPUT' } });
  }
  if (maybeSingle != null && typeof maybeSingle !== 'boolean') {
    _activeOpCount--;
    return res.status(400).json({ data: null, error: { message: 'maybeSingle must be a boolean', code: 'INVALID_INPUT' } });
  }
  if (selectAfterWrite != null && typeof selectAfterWrite !== 'boolean') {
    _activeOpCount--;
    return res.status(400).json({ data: null, error: { message: 'selectAfterWrite must be a boolean', code: 'INVALID_INPUT' } });
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
    // 필터 요소 유효성: eq/neq/in 은 col, or 는 expr
    if (f == null) return false;
    const fr = f as unknown as Record<string, unknown>;
    if (typeof fr.type !== 'string') return false;
    if (fr.type === 'or') return typeof fr.expr === 'string' && fr.expr.length > 0;
    return typeof fr.col === 'string' && fr.col.length > 0;
  });

  // ─ Table allowlist: reject unknown/internal tables immediately
  if (!ALLOWED_OP_TABLES.has(table)) {
    _activeOpCount--;
    return res.status(400).json({ data: null, error: { message: 'Invalid table', code: 'INVALID_TABLE' } });
  }

  if (table === 'heart_balances' && op !== 'select' && !isAdmin) {
    _activeOpCount--;
    return res.status(403).json({ data: null, error: { message: 'Forbidden: server-managed table', code: 'FORBIDDEN' } });
  }

  if (!store[table]) store[table] = [];
  let tableData = store[table];

  try {
    // ── SELECT ──────────────────────────────────────────────────────────────
    if (op === 'select') {
      if (REALTIME_MERGE_TABLES.has(table)) {
        await mergeTableFromDbIfStale(table);
        tableData = store[table];
      }
      // ─ IDOR guard (강화): messages SELECT
      //   규칙 1: requesterId 없으면 메시지 접근 불가 (비인증 요청 차단)
      //   규칙 2: chat_id 필터 없으면 메시지 전체 덤프 불가
      //   규칙 3: 해당 채팅방 참여자가 아니면 접근 불가
      //   규칙 4: 존재하지 않는 chat_id로 요청 시 빈 배열 반환 (정보 노출 차단)
      if (table === 'messages') {
        if (!canReadPrivateTables) {
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
            // 단일 채팅방 접근 — 참여자 검증 (+ 동일 쌍 중복 방 메시지 통합)
            await mergeTableFromDbIfStale('chats');
            const wantId = resolveMergedChatId(String(chatIdEqF.val));
            const chat = getTable('chats').find(c => String(c.id) === wantId);
            if (!chat) {
              return res.json({ data: [], error: null }); // 존재하지 않는 채팅방 → 빈 배열
            }
            if (String(chat.user1_id) !== String(requesterId) && String(chat.user2_id) !== String(requesterId)) {
              logger.warn({ requesterId, chatId: chatIdEqF.val, ip: req.ip }, '[SECURITY] IDOR: messages SELECT by non-participant blocked');
              return res.status(403).json({ data: null, error: { message: 'Forbidden: not a chat participant', code: 'FORBIDDEN' } });
            }
            const siblingIds = chatIdsForPair(String(chat.user1_id), String(chat.user2_id));
            const lookupIds = [...new Set([wantId, ...siblingIds])];
            await mergeMessagesForChatIds(lookupIds);
            const scoped = getTable('messages')
              .filter(m => lookupIds.includes(String(m.chat_id)))
              .map(m => (String(m.chat_id) === wantId ? m : { ...m, chat_id: wantId }));
            const otherFilters = normalizedFilters.filter(f => !(f.type === 'eq' && f.col === 'chat_id'));
            let scopedResult = applyFilters(scoped, otherFilters);
            for (const { col, asc } of safeOrders) {
              scopedResult.sort((a, b) => {
                const av = a[col]; const bv = b[col];
                if (av === bv) return 0;
                if (av == null) return asc ? -1 : 1;
                if (bv == null) return asc ? 1 : -1;
                return (av < bv ? -1 : 1) * (asc ? 1 : -1);
              });
            }
            if (limit != null) scopedResult = scopedResult.slice(0, Math.floor(limit));
            const scopedData = single ? (scopedResult[0] ?? null) : maybeSingle ? (scopedResult[0] ?? null) : scopedResult;
            return res.json({ data: scopedData, error: null });
          }

          if (chatIdInF) {
            // 복수 채팅방 일괄 조회 (loadChatList) — 요청자가 참여하지 않는 채팅방 ID 차단
            const chats = getTable('chats');
            const illegalChatId = (chatIdInF.vals as string[]).find(cid => {
              const chat = chats.find(c => String(c.id) === String(cid));
              if (!chat) return false; // 존재하지 않으면 결과가 없으므로 무해
              return String(chat.user1_id) !== String(requesterId) && String(chat.user2_id) !== String(requesterId);
            });
            if (illegalChatId) {
              logger.warn({ requesterId, chatId: illegalChatId, ip: req.ip }, '[SECURITY] IDOR: messages SELECT (in) includes non-participant chat blocked');
              return res.status(403).json({ data: null, error: { message: 'Forbidden: not a chat participant', code: 'FORBIDDEN' } });
            }
            // sibling 방 메시지까지 포함 — 목록 lastMessage/미읽음이 옛 chat_id 행을 놓치지 않게
            const expanded = new Set((chatIdInF.vals as unknown[]).map(v => String(v)));
            for (const cid of [...expanded]) {
              const chat = chats.find(c => String(c.id) === cid);
              if (!chat) continue;
              for (const id of chatIdsForPair(String(chat.user1_id), String(chat.user2_id))) expanded.add(id);
            }
            chatIdInF.vals = [...expanded];
            await mergeMessagesForChatIds([...expanded]);
          }
        }
        // isAdmin: 모든 메시지 조회 허용 (관리자 감사용)
      }

      // ─ IDOR guard: chats SELECT ───────────────────────────────────────────
      // 누구든 자신이 참여한 채팅방 목록만 볼 수 있어야 함.
      // requesterId 없이 chats를 전체 덤프하면 모든 채팅 참여자가 노출됨 → 차단.
      // 관리자는 전체 채팅방 조회 허용 (감사 목적).
      if (table === 'chats') {
        if (canReadPrivateTables) {
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
        const dedupedScope: Record<string, unknown>[] = [];
        const seenPairs = new Set<string>();
        for (const c of chatScope) {
          const pk = chatPairKey(String(c.user1_id), String(c.user2_id));
          if (seenPairs.has(pk)) continue;
          const siblings = chatScope.filter(x => chatPairKey(String(x.user1_id), String(x.user2_id)) === pk);
          dedupedScope.push(pickCanonicalChatRow(siblings));
          seenPairs.add(pk);
        }
        const scopedResult = applyFilters(dedupedScope, normalizedFilters);
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

      // ─ IDOR guard: likes SELECT ────────────────────────────────────────────
      // 좋아요 조회는 requesterId 필수 — 익명 스크래핑 차단.
      // 인증된 사용자는 전체 좋아요 조회 가능 (랭킹 집계 목적).
      if (table === 'likes' && !canReadPrivateTables) {
        if (!requesterId) {
          logger.warn({ ip: req.ip }, '[SECURITY] IDOR: likes SELECT without requesterId blocked');
          return res.status(403).json({ data: null, error: { message: 'Forbidden: authentication required', code: 'FORBIDDEN' } });
        }
      }

      // ─ IDOR guard: signal_sends SELECT ─────────────────────────────────────
      // 보낸 사람은 자신의 발신(send+pass)만. 받은 사람은 incoming send만 (pass 비공개).
      if (table === 'signal_sends' && !canReadPrivateTables) {
        if (!requesterId) {
          logger.warn({ ip: req.ip }, '[SECURITY] IDOR: signal_sends SELECT without requesterId blocked');
          return res.status(403).json({ data: null, error: { message: 'Forbidden: authentication required', code: 'FORBIDDEN' } });
        }
        tableData = tableData.filter(r => {
          if (String(r.sender_id) === String(requesterId)) return true;
          return String(r.receiver_id) === String(requesterId) && r.action === 'send';
        });
      }

      // ─ IDOR guard: profile_views SELECT ───────────────────────────────────
      // 내 프로필 방문자(viewed_id=me) 또는 내가 본 기록(viewer_id=me)만.
      if (table === 'profile_views' && !canReadPrivateTables) {
        if (!requesterId) {
          logger.warn({ ip: req.ip }, '[SECURITY] IDOR: profile_views SELECT without requesterId blocked');
          return res.status(403).json({ data: null, error: { message: 'Forbidden: authentication required', code: 'FORBIDDEN' } });
        }
        tableData = tableData.filter(r =>
          String(r.viewer_id) === String(requesterId) || String(r.viewed_id) === String(requesterId)
        );
      }

      // ─ IDOR guard: blocked_users / contact_share_events SELECT ───────────
      // 관계 당사자만 읽을 수 있고 관리자·테스트 감사 세션만 전체 조회 가능.
      if ((table === 'blocked_users' || table === 'contact_share_events') && !canReadPrivateTables) {
        if (!requesterId) {
          logger.warn({ table, ip: req.ip }, '[SECURITY] IDOR: relationship SELECT without requesterId blocked');
          return res.status(403).json({ data: null, error: { message: 'Forbidden: authentication required', code: 'FORBIDDEN' } });
        }
        tableData = tableData.filter(r => table === 'blocked_users'
          ? String(r.user_id) === String(requesterId) || String(r.target_id) === String(requesterId)
          : String(r.from_user_id) === String(requesterId) || String(r.to_user_id) === String(requesterId)
        );
      }

      // ─ IDOR guard: contact_shares SELECT ─────────────────────────────────
      // 연락처 공유 내역은 보낸 사람(liker_id) 또는 받은 사람(liked_id)만 조회 가능.
      // requesterId 없이 전체 덤프하면 모든 연락처 공유 기록이 노출됨 → 차단.
      if (table === 'contact_shares' && !canReadPrivateTables) {
        if (!requesterId) {
          logger.warn({ ip: req.ip }, '[SECURITY] IDOR: contact_shares SELECT without requesterId blocked');
          return res.status(403).json({ data: null, error: { message: 'Forbidden: authentication required', code: 'FORBIDDEN' } });
        }
        // 서버 측에서 소유자 스코프 제한 — 클라이언트 필터 우회 공격 차단
        const csScope = tableData.filter(r =>
          String(r.liker_id) === String(requesterId) || String(r.liked_id) === String(requesterId)
        );
        const csResult = applyFilters(csScope, normalizedFilters);
        for (const { col, asc } of safeOrders) {
          csResult.sort((a, b) => {
            const av = a[col]; const bv = b[col];
            if (av === bv) return 0;
            if (av == null) return asc ? -1 : 1;
            if (bv == null) return asc ? 1 : -1;
            return (av < bv ? -1 : 1) * (asc ? 1 : -1);
          });
        }
        const csLimit = limit != null ? Math.floor(limit) : undefined;
        const csLimited = csLimit != null ? csResult.slice(0, csLimit) : csResult;
        const csData = single ? (csLimited[0] ?? null) : maybeSingle ? (csLimited[0] ?? null) : csLimited;
        return res.json({ data: csData, error: null });
      }

      // ─ IDOR guard: chat_reads SELECT ──────────────────────────────────────
      // 자신의 읽음 기록 + 내가 참여한 1:1 방의 상대 읽음 기록만 허용.
      // 타인 방 스크래핑은 차단하되, 상대 read_at 폴링('1' 표시)은 동작해야 함.
      if (table === 'chat_reads' && !isAdmin) {
        if (!requesterId) {
          logger.warn({ ip: req.ip }, '[SECURITY] IDOR: chat_reads SELECT without requesterId blocked');
          return res.status(403).json({ data: null, error: { message: 'Forbidden: authentication required', code: 'FORBIDDEN' } });
        }
        const crScope = tableData.filter(r => {
          if (String(r.reader_id) === String(requesterId)) return true;
          // 같은 1:1 방 상대의 read_at 만 허용 — 프론트 '1' 폴링에 필요.
          // 참여하지 않은 방·제3자 읽음 기록은 절대 노출하지 않음.
          const resolved = resolveMergedChatId(String(r.chat_id ?? ''));
          const chat = getTable('chats').find(c => String(c.id) === resolved || String(c.id) === String(r.chat_id));
          if (!chat) return false;
          return String(chat.user1_id) === String(requesterId) || String(chat.user2_id) === String(requesterId);
        });
        const chatIdEqCr = normalizedFilters.find(f => f.type === 'eq' && f.col === 'chat_id') as { type: 'eq'; col: string; val: unknown } | undefined;
        const siblingIds = new Set<string>();
        if (chatIdEqCr) {
          const want = String(chatIdEqCr.val);
          siblingIds.add(want);
          siblingIds.add(resolveMergedChatId(want));
          const chat = getTable('chats').find(c => siblingIds.has(String(c.id)));
          if (chat) {
            for (const id of chatIdsForPair(String(chat.user1_id), String(chat.user2_id))) siblingIds.add(id);
          }
        }
        const crFilters = chatIdEqCr
          ? normalizedFilters.filter(f => !(f.type === 'eq' && f.col === 'chat_id'))
          : normalizedFilters;
        const crScoped = chatIdEqCr
          ? crScope.filter(r => siblingIds.has(String(r.chat_id)))
          : crScope;
        const crResult = applyFilters(crScoped, crFilters);
        for (const { col, asc } of safeOrders) {
          crResult.sort((a, b) => {
            const av = a[col]; const bv = b[col];
            if (av === bv) return 0;
            if (av == null) return asc ? -1 : 1;
            if (bv == null) return asc ? 1 : -1;
            return (av < bv ? -1 : 1) * (asc ? 1 : -1);
          });
        }
        const crLimit = limit != null ? Math.floor(limit) : undefined;
        const crLimited = crLimit != null ? crResult.slice(0, crLimit) : crResult;
        const crData = single ? (crLimited[0] ?? null) : maybeSingle ? (crLimited[0] ?? null) : crLimited;
        return res.json({ data: crData, error: null });
      }

      // ─ IDOR guard: group_messages / group_participants SELECT ───────────────
      if ((table === 'group_messages' || table === 'group_participants') && !canReadPrivateTables) {
        if (!requesterId) {
          logger.warn({ table, ip: req.ip }, '[SECURITY] IDOR: group SELECT without requesterId blocked');
          return res.status(403).json({ data: null, error: { message: 'Forbidden: authentication required', code: 'FORBIDDEN' } });
        }
        if (table === 'group_participants') {
          const me = getTable('profiles').find(p => String(p.id) === String(requesterId));
          if (me) await autoMatchGroupChatGuarded(String(requesterId), me);
          tableData = store['group_participants'];
        }
        const myGroupIds = new Set(
          getTable('group_participants')
            .filter(p => String(p.user_id) === String(requesterId))
            .flatMap(p => {
              const raw = String(p.group_id);
              const resolved = resolveMergedGroupId(raw);
              return raw === resolved ? [raw] : [raw, resolved];
            }),
        );
        if (table === 'group_participants') {
          const gpScope = tableData.filter(r => myGroupIds.has(String(r.group_id)));
          const gpResult = applyFilters(gpScope, normalizedFilters);
          for (const { col, asc } of safeOrders) {
            gpResult.sort((a, b) => {
              const av = a[col]; const bv = b[col];
              if (av === bv) return 0;
              if (av == null) return asc ? -1 : 1;
              if (bv == null) return asc ? 1 : -1;
              return (av < bv ? -1 : 1) * (asc ? 1 : -1);
            });
          }
          const gpLimit = limit != null ? Math.floor(limit) : undefined;
          const gpLimited = gpLimit != null ? gpResult.slice(0, gpLimit) : gpResult;
          const gpData = single ? (gpLimited[0] ?? null) : maybeSingle ? (gpLimited[0] ?? null) : gpLimited;
          return res.json({ data: gpData, error: null });
        }
        // group_messages: 참여 중인 방만 (병합된 옛 id 포함)
        const gmScope = tableData.filter(r => {
          const gid = String(r.group_id);
          return myGroupIds.has(gid) || myGroupIds.has(resolveMergedGroupId(gid));
        });
        const gmFilters = normalizedFilters.map(f => {
          if (f.type === 'eq' && f.col === 'group_id') {
            return { ...f, val: resolveMergedGroupId(String(f.val)) };
          }
          if (f.type === 'in' && f.col === 'group_id') {
            const vals = [...new Set((f.vals as unknown[]).map(v => resolveMergedGroupId(String(v))))];
            return { ...f, vals };
          }
          return f;
        });
        const gmResult = applyFilters(gmScope, gmFilters);
        for (const { col, asc } of safeOrders) {
          gmResult.sort((a, b) => {
            const av = a[col]; const bv = b[col];
            if (av === bv) return 0;
            if (av == null) return asc ? -1 : 1;
            if (bv == null) return asc ? 1 : -1;
            return (av < bv ? -1 : 1) * (asc ? 1 : -1);
          });
        }
        const gmLimit = limit != null ? Math.floor(limit) : undefined;
        const gmLimited = gmLimit != null ? gmResult.slice(0, gmLimit) : gmResult;
        const gmData = single ? (gmLimited[0] ?? null) : maybeSingle ? (gmLimited[0] ?? null) : gmLimited;
        return res.json({ data: gmData, error: null });
      }

      if (table === 'heart_balances' && !isAdmin) {
        const idFilter = normalizedFilters.find(f => f.type === 'eq' && f.col === 'id');
        if (!requesterId || !idFilter || !('val' in idFilter) || String(idFilter.val) !== String(requesterId)) {
          return res.status(403).json({ data: null, error: { message: 'Forbidden: own balance only', code: 'FORBIDDEN' } });
        }
      }

      if (table === 'group_chats') {
        await ensureOptInGroupRooms();
        if (requesterId) {
          const me = getTable('profiles').find(p => String(p.id) === String(requesterId));
          if (me) await autoMatchGroupChatGuarded(String(requesterId), me);
        }
        tableData = store['group_chats'];
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
      // 카탈로그 목록용 인원 수 — user_id 없이 숫자만 첨부
      if (table === 'group_chats') {
        const counts = new Map<string, number>();
        for (const p of getTable('group_participants')) {
          const gid = String(p.group_id ?? '');
          if (!gid) continue;
          counts.set(gid, (counts.get(gid) ?? 0) + 1);
        }
        result = result.map(r => ({ ...r, memberCount: counts.get(String(r.id)) ?? 0 }));
      }
      // ─ app_settings: 비밀번호 원문은 관리자에게도 내려주지 않음. 관리자는 *_set 플래그만.
      if (table === 'app_settings') {
        result = result.map(r => publicAppSettingsView(r, isAdmin));
      }
      if (table === 'profiles' && !isAdmin) {
        result = result.map(r => sanitizeProfileForViewer(r, requesterId));
      }
      // likes: 랭킹/통계 덤프는 liked_id·heart_type·status만 필요.
      // 보낸 사람(liker_id)은 본인 발신(liker_id=me) 또는 본인 수신함(liked_id=me) 조회 때만 노출.
      if (table === 'likes' && !isAdmin) {
        const ownSentOnly = normalizedFilters.some(
          f => f.type === 'eq' && f.col === 'liker_id' && requesterId && String(f.val) === String(requesterId),
        );
        const ownInboxOnly = normalizedFilters.some(
          f => f.type === 'eq' && f.col === 'liked_id' && requesterId && String(f.val) === String(requesterId),
        );
        if (!ownSentOnly && !ownInboxOnly) {
          result = result.map(r => {
            const s = { ...r };
            delete s['liker_id'];
            return s;
          });
        }
      }
      // profile_views: 방문자(viewer_id)는 본인 방문 기록 또는 내 프로필 방문자 조회 때만 노출.
      // 좋아요 inbox(liker_id)와 동일 — 무필터 덤프에서 viewer_id를 지우면 방문자 목록이 비어 보임.
      if (table === 'profile_views' && !isAdmin) {
        const ownViewedOnly = normalizedFilters.some(
          f => f.type === 'eq' && f.col === 'viewed_id' && requesterId && String(f.val) === String(requesterId),
        );
        const ownViewerOnly = normalizedFilters.some(
          f => f.type === 'eq' && f.col === 'viewer_id' && requesterId && String(f.val) === String(requesterId),
        );
        if (!ownViewedOnly && !ownViewerOnly) {
          result = result.map(r => {
            const s = { ...r };
            delete s['viewer_id'];
            return s;
          });
        }
      }
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
      if (!isAdmin && isFunctionsLocked() && FUNCTIONS_LOCKED_INSERT_TABLES.has(table)) {
        return res.status(403).json({
          data: null,
          error: { message: '행사 중에는 하트·채팅·시그널·단톡을 사용할 수 없습니다.', code: 'FUNCTIONS_LOCKED' },
        });
      }
      if (table === 'chats') {
        // 동일 유저 쌍 생성을 인스턴스 간에 직렬화
        const raw0 = (Array.isArray(payload) ? payload[0] : payload) as Record<string, unknown> | null;
        const lockKey = raw0?.user1_id != null && raw0?.user2_id != null
          ? chatPairKey(String(raw0.user1_id), String(raw0.user2_id))
          : null;
        const prepChats = async () => {
          await mergeTableFromDbIfStale('chats', true);
          await dedupeChatsInStore();
        };
        if (lockKey) await withChatPairLock(lockKey, prepChats);
        else await prepChats();
        tableData = store[table];
      }
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
          // sender_id를 requesterId로 강제 설정 (omit·mismatch 공격 동시 차단)
          // liker_id/reader_id와 동일한 방어 패턴
          if (effectiveRow.sender_id != null && String(effectiveRow.sender_id) !== String(requesterId)) {
            logger.warn({ requesterId, sender_id: effectiveRow.sender_id, ip: req.ip }, '[SECURITY] IDOR: sender_id mismatch blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: sender_id mismatch', code: 'FORBIDDEN' } });
          }
          effectiveRow = { ...effectiveRow, sender_id: requesterId };
          // ─ chat_id는 messages INSERT에서 필수 — 없으면 고아 메시지 생성 차단
          if (effectiveRow.chat_id == null) {
            logger.warn({ requesterId, ip: req.ip }, '[SECURITY] IDOR: messages INSERT without chat_id blocked');
            return res.status(400).json({ data: null, error: { message: 'chat_id is required for messages', code: 'INVALID_INPUT' } });
          }
          effectiveRow = { ...effectiveRow, chat_id: resolveMergedChatId(String(effectiveRow.chat_id)) };
          const referenceCheck = await ensureWriteReferences(table, effectiveRow);
          if (!referenceCheck.ok && referenceCheck.unavailable) return sendReferenceFailure(res, referenceCheck);
          const msgChat = getTable('chats').find(c => String(c.id) === String(effectiveRow.chat_id));
          if (msgChat) {
            const pk = chatPairKey(String(msgChat.user1_id), String(msgChat.user2_id));
            const siblings = getTable('chats').filter(c => chatPairKey(String(c.user1_id), String(c.user2_id)) === pk);
            if (siblings.length > 1) {
              const canonical = pickCanonicalChatRow(siblings);
              effectiveRow = { ...effectiveRow, chat_id: canonical.id };
            }
          }
          // 채팅방 참여자 검증 — 채팅방에 속하지 않은 사용자가 메시지를 삽입하는 공격 차단
          // id 타입(string/uuid) 불일치로 참가자 검증이 실패하면 전송 불가가 되므로 String 비교 강제
          const targetChat = getTable('chats').find(c => String(c.id) === String(effectiveRow.chat_id));
          if (!targetChat || (String(targetChat.user1_id) !== String(requesterId) && String(targetChat.user2_id) !== String(requesterId))) {
            logger.warn({ requesterId, chatId: effectiveRow.chat_id, ip: req.ip }, '[SECURITY] IDOR: message INSERT by non-participant blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: not a chat participant', code: 'FORBIDDEN' } });
          }
          // 멀티 인스턴스에서 chats 테이블이 아직 메모리에 없어도 SSE가 전달되도록 참가자 스탬프
          effectiveRow = {
            ...effectiveRow,
            chat_user1_id: targetChat.user1_id,
            chat_user2_id: targetChat.user2_id,
          };
        }
        // chats: requesterId 필수 + 본인이 user1_id 또는 user2_id여야 함
        if (table === 'chats') {
          if (!requesterId) {
            return res.status(403).json({ data: null, error: { message: 'Forbidden: authentication required', code: 'FORBIDDEN' } });
          }
          const u1 = String(effectiveRow.user1_id ?? '');
          const u2 = String(effectiveRow.user2_id ?? '');
          if (!u1 || !u2) {
            return res.status(400).json({ data: null, error: { message: 'user1_id and user2_id are both required', code: 'INVALID_INPUT' } });
          }
          if (u1 === u2) {
            return res.status(400).json({ data: null, error: { message: 'self-chat not allowed', code: 'INVALID_INPUT' } });
          }
          if (requesterId !== u1 && requesterId !== u2) {
            logger.warn({ requesterId, u1, u2, ip: req.ip }, '[SECURITY] IDOR: chats INSERT by non-participant blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: must be a participant', code: 'FORBIDDEN' } });
          }
        }
        // group_messages: requesterId 필수 + sender_id 강제 + 참여자 검증
        if (table === 'group_messages') {
          if (!requesterId) {
            return res.status(403).json({ data: null, error: { message: 'Forbidden: authentication required', code: 'FORBIDDEN' } });
          }
          effectiveRow = { ...effectiveRow, sender_id: requesterId };
          if (effectiveRow.group_id == null) {
            return res.status(400).json({ data: null, error: { message: 'group_id is required for group_messages', code: 'INVALID_INPUT' } });
          }
          effectiveRow = { ...effectiveRow, group_id: resolveMergedGroupId(String(effectiveRow.group_id)) };
          const groupReference = await ensureWriteReferences(table, effectiveRow);
          if (!groupReference.ok && groupReference.unavailable) return sendReferenceFailure(res, groupReference);
          let isParticipant = getTable('group_participants').some(
            p => String(p.group_id) === String(effectiveRow.group_id) && String(p.user_id) === String(requesterId),
          );
          if (!isParticipant) {
            const refreshed = await refreshGroupParticipant(String(effectiveRow.group_id), String(requesterId));
            if (refreshed === 'unavailable') {
              return sendReferenceFailure(res, { ok: false, unavailable: true });
            }
            isParticipant = refreshed === 'found';
          }
          if (!isParticipant) {
            logger.warn({ requesterId, groupId: effectiveRow.group_id, ip: req.ip }, '[SECURITY] IDOR: group_messages INSERT by non-participant blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: not a group participant', code: 'FORBIDDEN' } });
          }
        }
        // group_participants: 본인만 입장, 방당 인원 제한 없음, 사람당 최대 4개 방
        if (table === 'group_participants') {
          if (!requesterId) {
            logger.warn({ ip: req.ip }, '[SECURITY] IDOR: group_participants INSERT without requesterId blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: authentication required', code: 'FORBIDDEN' } });
          }
          if (effectiveRow.user_id != null && String(effectiveRow.user_id) !== String(requesterId)) {
            logger.warn({ requesterId, user_id: effectiveRow.user_id, ip: req.ip }, '[SECURITY] IDOR: group_participants user_id mismatch blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: 자신의 참여만 추가할 수 있습니다.', code: 'FORBIDDEN' } });
          }
          if (effectiveRow.group_id == null || String(effectiveRow.group_id) === '') {
            return res.status(400).json({ data: null, error: { message: 'group_id is required for group_participants', code: 'INVALID_INPUT' } });
          }
          const groupId = resolveMergedGroupId(String(effectiveRow.group_id));
          effectiveRow = { ...effectiveRow, group_id: groupId, user_id: requesterId };
          const groupReference = await ensureWriteReferences(table, effectiveRow);
          if (!groupReference.ok && groupReference.unavailable) return sendReferenceFailure(res, groupReference);
          const groupExists = getTable('group_chats').some(g => String(g.id) === groupId);
          if (!groupExists) {
            return res.status(400).json({ data: null, error: { message: '존재하지 않는 단톡방입니다.', code: 'INVALID_INPUT' } });
          }
          const already = getTable('group_participants').find(
            p => String(p.group_id) === groupId && String(p.user_id) === String(requesterId),
          );
          if (already) {
            if (selectAfterWrite) return res.json({ data: single ? already : [already], error: null });
            return res.json({ data: null, error: null });
          }
          await pruneNonCatalogMemberships(String(requesterId));
          if (countUserGroupSlots(String(requesterId)) >= MAX_GROUPS_PER_USER) {
            return res.status(400).json({ data: null, error: { message: GROUP_LIMIT_MESSAGE, code: 'GROUP_LIMIT' } });
          }
          effectiveRow = {
            ...effectiveRow,
            id: `${groupId}__${requesterId}`,
            group_id: groupId,
            user_id: requesterId,
            joined_at: effectiveRow.joined_at ?? ts(),
          };
          await clearGroupOptOut(String(requesterId), groupId);
        }
        // group_chats: 카탈로그는 서버 시드. 일반 유저 방 생성 금지 (테스트는 시드용 INSERT 허용)
        if (table === 'group_chats' && !isAdmin && process.env.NODE_ENV !== 'test') {
          logger.warn({ requesterId, ip: req.ip }, '[SECURITY] IDOR: group_chats INSERT blocked');
          return res.status(403).json({ data: null, error: { message: 'Forbidden: 단톡방 생성은 관리자만 가능합니다.', code: 'FORBIDDEN' } });
        }
        // chat_reads: reader_id를 requesterId로 강제 + 해당 채팅 참여자만 기록 가능
        if (table === 'chat_reads') {
          if (!requesterId) {
            return res.status(403).json({ data: null, error: { message: 'Forbidden: authentication required', code: 'FORBIDDEN' } });
          }
          effectiveRow = { ...effectiveRow, reader_id: requesterId };
          if (effectiveRow.chat_id != null) {
            effectiveRow = { ...effectiveRow, chat_id: resolveMergedChatId(String(effectiveRow.chat_id)) };
            effectiveRow.id = `${effectiveRow.chat_id}__${requesterId}`;
          }
          const referenceCheck = await ensureWriteReferences(table, effectiveRow);
          if (!referenceCheck.ok && referenceCheck.unavailable) return sendReferenceFailure(res, referenceCheck);
          if (!isChatParticipant(effectiveRow.chat_id, requesterId)) {
            logger.warn({ requesterId, chatId: effectiveRow.chat_id, ip: req.ip }, '[SECURITY] IDOR: chat_reads INSERT by non-participant blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: not a chat participant', code: 'FORBIDDEN' } });
          }
          stampChatReadAt(effectiveRow);
        }
        // likes: requesterId 필수 + liker_id를 세션 사용자로 강제 (omit·mismatch 차단)
        if (table === 'likes') {
          if (!requesterId) {
            logger.warn({ ip: req.ip }, '[SECURITY] IDOR: likes INSERT without requesterId blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: authentication required', code: 'FORBIDDEN' } });
          }
          effectiveRow = { ...effectiveRow, liker_id: requesterId };
        }
        // signal_sends: requesterId 필수 + sender_id 강제. 하트(likes)와 별도 액션.
        if (table === 'signal_sends') {
          if (!requesterId) {
            logger.warn({ ip: req.ip }, '[SECURITY] IDOR: signal_sends INSERT without requesterId blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: authentication required', code: 'FORBIDDEN' } });
          }
          const receiverId = effectiveRow.receiver_id != null ? String(effectiveRow.receiver_id) : '';
          const action = effectiveRow.action === 'pass' ? 'pass' : effectiveRow.action === 'send' ? 'send' : '';
          if (!receiverId) {
            return res.status(400).json({ data: null, error: { message: 'receiver_id is required', code: 'INVALID_INPUT' } });
          }
          if (!action) {
            return res.status(400).json({ data: null, error: { message: 'action must be send or pass', code: 'INVALID_INPUT' } });
          }
          if (receiverId === String(requesterId)) {
            return res.status(400).json({ data: null, error: { message: 'cannot signal yourself', code: 'INVALID_INPUT' } });
          }
          const detId = deterministicSignalId(String(requesterId), receiverId);
          const existingSig = tableData.find(r => String(r.id) === detId)
            ?? tableData.find(r => String(r.sender_id) === String(requesterId) && String(r.receiver_id) === receiverId);
          if (existingSig) {
            if (selectAfterWrite) return res.json({ data: single ? existingSig : [existingSig], error: null });
            return res.json({ data: null, error: null });
          }
          effectiveRow = { ...effectiveRow, sender_id: requesterId, receiver_id: receiverId, action, id: detId };
          const referenceCheck = await ensureWriteReferences(table, effectiveRow);
          if (!referenceCheck.ok) return sendReferenceFailure(res, referenceCheck);
        }
        // profile_views: viewer_id를 requesterId로 강제 (omit·mismatch 차단). 자기 자신 방문은 기록하지 않음.
        if (table === 'profile_views') {
          if (!requesterId) {
            logger.warn({ ip: req.ip }, '[SECURITY] IDOR: profile_views INSERT without requesterId blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: authentication required', code: 'FORBIDDEN' } });
          }
          if (effectiveRow.viewed_id == null || String(effectiveRow.viewed_id) === '') {
            return res.status(400).json({ data: null, error: { message: 'viewed_id is required', code: 'INVALID_INPUT' } });
          }
          if (String(effectiveRow.viewed_id) === String(requesterId)) {
            if (selectAfterWrite) return res.json({ data: single ? null : [], error: null });
            return res.json({ data: null, error: null });
          }
          effectiveRow = { ...effectiveRow, viewer_id: requesterId };
          const referenceCheck = await ensureWriteReferences(table, effectiveRow);
          if (!referenceCheck.ok) return sendReferenceFailure(res, referenceCheck);
        }
        // blocked_users: 차단을 건 사용자 identity는 세션으로 고정.
        if (table === 'blocked_users' && !isAdmin) {
          if (!requesterId) {
            return res.status(403).json({ data: null, error: { message: 'Forbidden: authentication required', code: 'FORBIDDEN' } });
          }
          const existingById = effectiveRow.id == null
            ? undefined
            : tableData.find(r => String(r.id) === String(effectiveRow.id));
          if (existingById && String(existingById.user_id ?? '') !== String(requesterId)) {
            return res.status(403).json({ data: null, error: { message: 'Forbidden: row owner mismatch', code: 'FORBIDDEN' } });
          }
          const targetId = String(effectiveRow.target_id ?? '');
          if (!targetId) {
            return res.status(400).json({ data: null, error: { message: 'target_id is required', code: 'INVALID_INPUT' } });
          }
          if (targetId === String(requesterId)) {
            return res.status(400).json({ data: null, error: { message: 'cannot block yourself', code: 'INVALID_INPUT' } });
          }
          effectiveRow = { ...effectiveRow, user_id: requesterId, target_id: targetId };
        }
        // contact_shares: 연락처를 실제로 공유하는 사용자는 liked_id(현재 하트 수신자).
        if (table === 'contact_shares' && !isAdmin) {
          if (!requesterId) {
            return res.status(403).json({ data: null, error: { message: 'Forbidden: authentication required', code: 'FORBIDDEN' } });
          }
          const existingById = effectiveRow.id == null
            ? undefined
            : tableData.find(r => String(r.id) === String(effectiveRow.id));
          if (existingById && String(existingById.liked_id ?? '') !== String(requesterId)) {
            return res.status(403).json({ data: null, error: { message: 'Forbidden: row owner mismatch', code: 'FORBIDDEN' } });
          }
          const recipientId = String(effectiveRow.liker_id ?? '');
          if (!recipientId) {
            return res.status(400).json({ data: null, error: { message: 'liker_id is required', code: 'INVALID_INPUT' } });
          }
          if (recipientId === String(requesterId)) {
            return res.status(400).json({ data: null, error: { message: 'cannot share contact with yourself', code: 'INVALID_INPUT' } });
          }
          effectiveRow = { ...effectiveRow, liked_id: requesterId, liker_id: recipientId };
          const referenceCheck = await ensureWriteReferences(table, effectiveRow);
          if (!referenceCheck.ok) return sendReferenceFailure(res, referenceCheck);
        }
        // contact_share_events: 이벤트 발신자는 항상 인증된 세션 사용자.
        if (table === 'contact_share_events' && !isAdmin) {
          if (!requesterId) {
            return res.status(403).json({ data: null, error: { message: 'Forbidden: authentication required', code: 'FORBIDDEN' } });
          }
          const existingById = effectiveRow.id == null
            ? undefined
            : tableData.find(r => String(r.id) === String(effectiveRow.id));
          if (existingById && String(existingById.from_user_id ?? '') !== String(requesterId)) {
            return res.status(403).json({ data: null, error: { message: 'Forbidden: row owner mismatch', code: 'FORBIDDEN' } });
          }
          const toUserId = String(effectiveRow.to_user_id ?? '');
          if (!toUserId) {
            return res.status(400).json({ data: null, error: { message: 'to_user_id is required', code: 'INVALID_INPUT' } });
          }
          if (toUserId === String(requesterId)) {
            return res.status(400).json({ data: null, error: { message: 'cannot send contact event to yourself', code: 'INVALID_INPUT' } });
          }
          effectiveRow = { ...effectiveRow, from_user_id: requesterId, to_user_id: toUserId };
          const referenceCheck = await ensureWriteReferences(table, effectiveRow);
          if (!referenceCheck.ok) return sendReferenceFailure(res, referenceCheck);
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
          // 멀티 인스턴스: 동일 쌍 → 동일 row_id 로 persist 충돌 시 하나로 합쳐짐
          const detId = deterministicChatId(uid1, uid2);
          const byId = tableData.find(r => String(r.id) === detId);
          if (byId) {
            if (selectAfterWrite) return res.json({ data: single ? byId : [byId], error: null });
            return res.json({ data: null, error: null });
          }
          effectiveRow = { ...effectiveRow, id: detId };
        }
        // messages 테이블: client_id(UUID) 기반 멱등성 — 네트워크 재시도로 인한 중복 메시지 삽입 방지
        if (table === 'messages' && effectiveRow.client_id != null) {
          const dupMsg = tableData.find(r => r.client_id === effectiveRow.client_id);
          if (dupMsg) return res.json({ data: single ? dupMsg : [dupMsg], error: null }); // ON CONFLICT DO NOTHING
        }
        // group_messages 테이블: client_id 기반 멱등성 (단톡방 재시도 중복 삽입 방지)
        if (table === 'group_messages' && effectiveRow.client_id != null) {
          const dupGMsg = tableData.find(r => r.client_id === effectiveRow.client_id);
          if (dupGMsg) return res.json({ data: single ? dupGMsg : [dupGMsg], error: null });
        }
        // likes 테이블: 동일 liker+liked+heart_type 중복 방지 (빠른 연속 클릭으로 인한 중복 하트 삽입 방지)
        if (table === 'likes' && effectiveRow.liker_id != null && effectiveRow.liked_id != null && effectiveRow.heart_type != null) {
          const likeLiker = String(effectiveRow.liker_id);
          const likeLiked = String(effectiveRow.liked_id);
          const likeType = String(effectiveRow.heart_type);
          const likeTriple = (r: Record<string, unknown>) =>
            String(r.liker_id) === likeLiker && String(r.liked_id) === likeLiked && String(r.heart_type) === likeType;
          const dupLike = tableData.find(likeTriple);
          if (dupLike) return res.json({ data: single ? dupLike : [dupLike], error: null }); // 멱등: 기존 row 반환
          const referenceCheck = await ensureWriteReferences(table, effectiveRow);
          if (!referenceCheck.ok) return sendReferenceFailure(res, referenceCheck);

          // 타입별 글로벌 한도: 동일 heart_type을 최대 2명에게만 보낼 수 있음 (클라이언트 우회 방지)
          const sameTypeCount = tableData.filter(r =>
            String(r.liker_id) === likeLiker && String(r.heart_type) === likeType
          ).length;
          if (sameTypeCount >= 2) {
            // 400: HEART_LIMIT을 429로 주면 클라이언트가 NAT 429로 재시도해 지연·이중전송처럼 보임
            return res.status(400).json({ data: null, error: { message: '같은 종류의 하트는 최대 2명에게만 보낼 수 있습니다.', code: 'HEART_LIMIT' } });
          }

          // Time-bucket rate limiter: at most 1 like per 500 ms per (liker, liked, type) triple
          // Keyed on all three dimensions so different heart types can still be sent concurrently;
          // only the exact same (liker, liked, type) combination is throttled within the window.
          const rateKey = `${likeLiker}:${likeLiked}:${likeType}`;
          const lastMs = _likesLastInsert.get(rateKey) ?? 0;
          if (Date.now() - lastMs < LIKES_MIN_INTERVAL_MS) {
            // Rapid duplicate — return existing row if any (never silent null success)
            const recent = tableData.find(likeTriple);
            if (recent) return res.json({ data: single ? recent : [recent], error: null });
            return res.status(429).json({ data: null, error: { message: '하트를 너무 빠르게 보내고 있습니다. 잠시 후 다시 시도해 주세요.', code: 'RATE_LIMIT' } });
          }
          // 멀티 인스턴스: PG 공용 슬롯 (로컬 Map 만으로는 인스턴스별 우회 가능)
          const distributedOk = await claimDistributedRateSlot(`like_pair:${rateKey}`, LIKES_MIN_INTERVAL_MS);
          if (!distributedOk) {
            const recent = tableData.find(likeTriple);
            if (recent) return res.json({ data: single ? recent : [recent], error: null });
            return res.status(429).json({ data: null, error: { message: '하트를 너무 빠르게 보내고 있습니다. 잠시 후 다시 시도해 주세요.', code: 'RATE_LIMIT' } });
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
          const minuteBucket = Math.floor(nowMs / 60_000);
          const minuteOk = await claimDistributedMinuteQuota(
            `like_min:${liker}:${minuteBucket}`,
            LIKES_MAX_PER_USER_PER_MIN,
          );
          if (!minuteOk) {
            return res.status(429).json({ data: null, error: { message: '하트를 너무 빠르게 보내고 있습니다. 잠시 후 다시 시도해 주세요.', code: 'RATE_LIMIT' } });
          }
        }
        const referenceCheck = await ensureWriteReferences(table, effectiveRow);
        if (!referenceCheck.ok) return sendReferenceFailure(res, referenceCheck);
        const newRow: Record<string, unknown> = {
          created_at: ts(),
          ...effectiveRow,
          id: (effectiveRow.id as string | undefined) ?? genId(),
        };
        if (table === 'session_history' && !newRow.ended_at) newRow.ended_at = ts();
        // 클라이언트 시계가 created_at을 덮어쓰면 토스트 스킵·정렬이 어긋남 (채팅 read_at과 같은 계열)
        if (table === 'likes' || table === 'contact_shares' || table === 'contact_share_events') {
          newRow.created_at = ts();
        }

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
            dbPersistRow('device_secrets', dsRow).catch(e => logger.error({ err: e }, '[db] background task error'));
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

        // 핵심 테이블: DB 저장 성공 후에만 SSE 전파 — "전달됐는데 저장 안 됨" 방지
        if (CRITICAL_PERSIST_TABLES.has(table)) {
          try {
            await dbPersistRow(table, newRow);
          } catch (e) {
            const idx = tableData.findIndex(r => r.id === newRow.id);
            if (idx >= 0) tableData.splice(idx, 1);
            const iidx = inserted.findIndex(r => r.id === newRow.id);
            if (iidx >= 0) inserted.splice(iidx, 1);
            logger.error({ err: e, table, rowId: newRow.id }, '[db] critical persist failed — rolled back memory');
            return res.status(503).json({
              data: null,
              error: { message: '저장에 실패했습니다. 잠시 후 다시 시도해 주세요.', code: 'PERSIST_FAILED' },
            });
          }
          smartBroadcast(table, newRow, { type: 'change', table, event: 'INSERT', newRow, oldRow: null });
        } else {
          smartBroadcast(table, newRow, { type: 'change', table, event: 'INSERT', newRow, oldRow: null });
          dbPersistRow(table, newRow).catch(e => logger.error({ err: e }, '[db] background task error'));
        }
        // #33: 신규 프로필 등록 시 PIN 풀 사용량 확인 — 85% 초과 시 관리자 푸시 알림
        if (table === 'profiles') {
          checkAndNotifyAdminPinPool().catch(e => logger.error({ err: e }, '[db] background task error'));
          await autoMatchGroupChatGuarded(String(newRow.id), newRow);
        }
        // chat_reads 삽입 시 해당 유저 unread 캐시 즉시 무효화
        if (table === 'chat_reads' && newRow.reader_id) {
          unreadCountsCache.delete(String(newRow.reader_id));
        }
        // Fix #8: 메시지 삽입 시 수신자 unread 캐시 즉시 무효화 (TTL 2s 대기 없음)
        if (table === 'messages' && newRow.sender_id && newRow.chat_id) {
          const _msgChat = getTable('chats').find(c => String(c.id) === String(newRow.chat_id));
          if (_msgChat) {
            const _receiverId = String(_msgChat.user1_id) === String(newRow.sender_id) ? _msgChat.user2_id : _msgChat.user1_id;
            if (_receiverId) unreadCountsCache.delete(String(_receiverId));
          }
        }
        // 메시지·하트·채팅방 생성 시 수신자 핸드폰으로 푸시 알림 전송
        if (table === 'messages' || table === 'likes' || table === 'chats' || (table === 'signal_sends' && newRow.action === 'send')) {
          sendPushForEvent(table, newRow, requesterId).catch(e => logger.error({ err: e }, '[db] background task error'));
        }
      }
      if (selectAfterWrite) return res.json({ data: single ? inserted[0] ?? null : inserted, error: null });
      return res.json({ data: null, error: null });
    }

    // ── UPDATE ──────────────────────────────────────────────────────────────
    if (op === 'update') {
      if (table === 'app_settings' && !isAdmin) {
        return res.status(403).json({ data: null, error: { message: 'Forbidden: admin only', code: 'FORBIDDEN' } });
      }
      if (!isAdmin && isFunctionsLocked() && FUNCTIONS_LOCKED_UPDATE_TABLES.has(table)) {
        return res.status(403).json({
          data: null,
          error: { message: '행사 중에는 하트·채팅·시그널·단톡을 사용할 수 없습니다.', code: 'FUNCTIONS_LOCKED' },
        });
      }
      let patch = sanitizeRow(table, payload as Record<string, unknown>);
      const rowsToUpdate = applyFilters(tableData, normalizedFilters);
      for (const existingRow of rowsToUpdate) {
        const referenceCheck = await ensureWriteReferences(table, { ...existingRow, ...patch });
        if (!referenceCheck.ok) return sendReferenceFailure(res, referenceCheck);
      }

      // ─ IDOR guard: UPDATE ownership check ──────────────────────────────
      // messages UPDATE는 requesterId 필수 — 미인증 UPDATE로 타인 메시지 수정 차단
      if (table === 'messages' && !requesterId) {
        logger.warn({ ip: req.ip }, '[SECURITY] IDOR: messages UPDATE without requesterId blocked');
        return res.status(403).json({ data: null, error: { message: 'Forbidden: authentication required', code: 'FORBIDDEN' } });
      }
      if (table === 'likes' && !isAdmin && !requesterId) {
        logger.warn({ ip: req.ip }, '[SECURITY] IDOR: likes UPDATE without requesterId blocked');
        return res.status(403).json({ data: null, error: { message: 'Forbidden: authentication required', code: 'FORBIDDEN' } });
      }
      if (
        !isAdmin &&
        (table === 'blocked_users' || table === 'contact_shares' || table === 'contact_share_events') &&
        !requesterId
      ) {
        logger.warn({ table, ip: req.ip }, '[SECURITY] IDOR: relationship UPDATE without requesterId blocked');
        return res.status(403).json({ data: null, error: { message: 'Forbidden: authentication required', code: 'FORBIDDEN' } });
      }
      if (!isAdmin && requesterId) {
        if (table === 'blocked_users') {
          delete patch.id;
          patch = { ...patch, user_id: requesterId };
        }
        if (table === 'contact_shares') {
          delete patch.id;
          delete patch.liker_id;
          patch = { ...patch, liked_id: requesterId };
        }
        if (table === 'contact_share_events') {
          delete patch.id;
          delete patch.to_user_id;
          patch = { ...patch, from_user_id: requesterId };
        }
      }
      if (table === 'signal_sends' && !isAdmin) {
        return res.status(403).json({ data: null, error: { message: 'Forbidden: signal actions cannot be updated', code: 'FORBIDDEN' } });
      }
      if (table === 'group_participants') {
        if (!requesterId) {
          logger.warn({ ip: req.ip }, '[SECURITY] IDOR: group_participants UPDATE without requesterId blocked');
          return res.status(403).json({ data: null, error: { message: 'Forbidden: authentication required', code: 'FORBIDDEN' } });
        }
        const readAt = patch.last_read_at;
        if (typeof readAt !== 'string' || !readAt.trim()) {
          return res.status(400).json({ data: null, error: { message: 'last_read_at is required', code: 'INVALID_INPUT' } });
        }
        patch = { last_read_at: readAt };
      }
      // requesterId가 있는 경우, 자신 소유의 행만 수정 가능하도록 검증
      if (requesterId) {
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
          // likes: 하트를 받은 사용자만 수락·거절 상태를 변경할 수 있음
          if (!isAdmin && table === 'likes' && existingRow.liked_id != null &&
              String(existingRow.liked_id) !== String(requesterId)) {
            logger.warn({ requesterId, rowId: existingRow.id }, '[SECURITY] IDOR: UPDATE likes blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: 받은 하트만 변경할 수 있습니다.', code: 'FORBIDDEN' } });
          }
          // chat_reads: 자신의 읽음 기록만 수정 가능
          if (table === 'chat_reads' && existingRow.reader_id != null &&
              String(existingRow.reader_id) !== String(requesterId)) {
            logger.warn({ requesterId, rowId: existingRow.id }, '[SECURITY] IDOR: UPDATE chat_reads blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: 자신의 읽음 기록만 수정할 수 있습니다.', code: 'FORBIDDEN' } });
          }
          if (table === 'group_participants' && existingRow.user_id != null &&
              String(existingRow.user_id) !== String(requesterId)) {
            logger.warn({ requesterId, rowId: existingRow.id }, '[SECURITY] IDOR: UPDATE group_participants blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: 자신의 참여만 수정할 수 있습니다.', code: 'FORBIDDEN' } });
          }
          if (!isAdmin && table === 'blocked_users' && String(existingRow.user_id ?? '') !== String(requesterId)) {
            logger.warn({ requesterId, rowId: existingRow.id }, '[SECURITY] IDOR: UPDATE blocked_users blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: 자신이 만든 차단만 수정할 수 있습니다.', code: 'FORBIDDEN' } });
          }
          if (!isAdmin && table === 'contact_shares' && String(existingRow.liked_id ?? '') !== String(requesterId)) {
            logger.warn({ requesterId, rowId: existingRow.id }, '[SECURITY] IDOR: UPDATE contact_shares blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: 자신이 공유한 연락처만 수정할 수 있습니다.', code: 'FORBIDDEN' } });
          }
          if (!isAdmin && table === 'contact_share_events' && String(existingRow.from_user_id ?? '') !== String(requesterId)) {
            logger.warn({ requesterId, rowId: existingRow.id }, '[SECURITY] IDOR: UPDATE contact_share_events blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: 자신이 보낸 이벤트만 수정할 수 있습니다.', code: 'FORBIDDEN' } });
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
      if (table === 'chat_reads') stampChatReadAt(patch);
      const updated: Record<string, unknown>[] = [];
      for (let i = 0; i < tableData.length; i++) {
        if (applyFilters([tableData[i]], normalizedFilters).length) {
          const oldRow = { ...tableData[i] };
          const newRow = { ...oldRow, ...patch };
          tableData[i] = newRow;
          updated.push(newRow);
          if (CRITICAL_PERSIST_TABLES.has(table)) {
            try {
              await dbPersistRow(table, newRow);
            } catch (e) {
              tableData[i] = oldRow; // rollback
              const uidx = updated.findIndex(r => r.id === newRow.id);
              if (uidx >= 0) updated.splice(uidx, 1);
              logger.error({ err: e, table, rowId: newRow.id }, '[db] critical UPDATE persist failed');
              return res.status(503).json({
                data: null,
                error: { message: '저장에 실패했습니다. 잠시 후 다시 시도해 주세요.', code: 'PERSIST_FAILED' },
              });
            }
            smartBroadcast(table, newRow, { type: 'change', table, event: 'UPDATE', newRow, oldRow });
          } else {
            smartBroadcast(table, newRow, { type: 'change', table, event: 'UPDATE', newRow, oldRow });
            dbPersistRow(table, newRow).catch(e => logger.error({ err: e }, '[db] background task error'));
          }
          // chat_reads 갱신 시 해당 유저 unread 캐시 즉시 무효화
          if (table === 'chat_reads' && newRow.reader_id) {
            unreadCountsCache.delete(String(newRow.reader_id));
          }
        }
      }
      if (table === 'profiles') {
        for (const row of updated) {
          await autoMatchGroupChatGuarded(String(row.id), row);
        }
      }
      if (selectAfterWrite) return res.json({ data: single ? updated[0] ?? null : updated, error: null });
      return res.json({ data: null, error: null });
    }

    // ── UPSERT ──────────────────────────────────────────────────────────────
    if (op === 'upsert') {
      if (table === 'signal_sends' && !isAdmin) {
        return res.status(403).json({ data: null, error: { message: 'Forbidden: use insert for signal actions', code: 'FORBIDDEN' } });
      }
      const inputs = (Array.isArray(payload) ? payload as Record<string, unknown>[] : [payload as Record<string, unknown>])
        .map(row => sanitizeRow(table, row)); // XSS 방어: UPSERT payload도 sanitize
      const upserted: Record<string, unknown>[] = [];

      // ─ IDOR guard: UPSERT ownership check ─────────────────────────────
      if (
        !isAdmin &&
        (table === 'blocked_users' || table === 'contact_shares' || table === 'contact_share_events')
      ) {
        if (!requesterId) {
          return res.status(403).json({ data: null, error: { message: 'Forbidden: authentication required', code: 'FORBIDDEN' } });
        }
        for (const row of inputs) {
          if (!row) continue;
          const existingById = row.id == null ? undefined : tableData.find(r => String(r.id) === String(row.id));
          if (existingById) {
            const owner = table === 'blocked_users'
              ? existingById.user_id
              : table === 'contact_shares'
                ? existingById.liked_id
                : existingById.from_user_id;
            if (String(owner ?? '') !== String(requesterId)) {
              return res.status(403).json({ data: null, error: { message: 'Forbidden: row owner mismatch', code: 'FORBIDDEN' } });
            }
          }
          if (table === 'blocked_users') {
            const targetId = String(row.target_id ?? '');
            if (!targetId || targetId === String(requesterId)) {
              return res.status(400).json({ data: null, error: { message: 'invalid target_id', code: 'INVALID_INPUT' } });
            }
            row.user_id = requesterId;
          } else if (table === 'contact_shares') {
            const recipientId = String(row.liker_id ?? '');
            if (!recipientId || recipientId === String(requesterId)) {
              return res.status(400).json({ data: null, error: { message: 'invalid liker_id', code: 'INVALID_INPUT' } });
            }
            row.liked_id = requesterId;
          } else {
            const toUserId = String(row.to_user_id ?? '');
            if (!toUserId || toUserId === String(requesterId)) {
              return res.status(400).json({ data: null, error: { message: 'invalid to_user_id', code: 'INVALID_INPUT' } });
            }
            row.from_user_id = requesterId;
          }
        }
      }
      if (table === 'chat_reads') {
        if (!requesterId) {
          return res.status(403).json({ data: null, error: { message: 'Forbidden: authentication required', code: 'FORBIDDEN' } });
        }
        for (const row of inputs) {
          if (!row) continue;
          row.reader_id = requesterId;
          if (row.chat_id != null) {
            row.chat_id = resolveMergedChatId(String(row.chat_id));
            row.id = `${row.chat_id}__${requesterId}`;
          }
          const referenceCheck = await ensureWriteReferences(table, row);
          if (!referenceCheck.ok) return sendReferenceFailure(res, referenceCheck);
          if (!isChatParticipant(row.chat_id, requesterId)) {
            logger.warn({ requesterId, chatId: row.chat_id }, '[SECURITY] IDOR: UPSERT chat_reads by non-participant blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: not a chat participant', code: 'FORBIDDEN' } });
          }
          stampChatReadAt(row);
        }
      }
      if (requesterId) {
        for (const row of inputs) {
          if (!row) continue;
          // chat_reads: reader_id는 반드시 requester여야 함
          if (table === 'chat_reads' && row.reader_id != null &&
              String(row.reader_id) !== String(requesterId)) {
            logger.warn({ requesterId, reader_id: row.reader_id }, '[SECURITY] IDOR: UPSERT chat_reads blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: 자신의 읽음 기록만 생성할 수 있습니다.', code: 'FORBIDDEN' } });
          }        }
      }
      for (const row of inputs) {
        if (!row) continue;
        const referenceCheck = await ensureWriteReferences(table, row);
        if (!referenceCheck.ok) return sendReferenceFailure(res, referenceCheck);
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
          if (
            !isAdmin &&
            requesterId &&
            (table === 'blocked_users' || table === 'contact_shares' || table === 'contact_share_events')
          ) {
            const existingOwner = table === 'blocked_users'
              ? tableData[idx].user_id
              : table === 'contact_shares'
                ? tableData[idx].liked_id
                : tableData[idx].from_user_id;
            if (String(existingOwner ?? '') !== String(requesterId)) {
              return res.status(403).json({ data: null, error: { message: 'Forbidden: row owner mismatch', code: 'FORBIDDEN' } });
            }
          }
          const oldRow = { ...tableData[idx] };
          const newRow = { ...oldRow, ...row };
          tableData[idx] = newRow;
          upserted.push(newRow);
          if (CRITICAL_PERSIST_TABLES.has(table)) {
            try {
              await dbPersistRow(table, newRow);
            } catch (e) {
              tableData[idx] = oldRow;
              upserted.pop();
              logger.error({ err: e, table, rowId: newRow.id }, '[db] critical UPSERT persist failed');
              return res.status(503).json({
                data: null,
                error: { message: '저장에 실패했습니다. 잠시 후 다시 시도해 주세요.', code: 'PERSIST_FAILED' },
              });
            }
            smartBroadcast(table, newRow, { type: 'change', table, event: 'UPDATE', newRow, oldRow });
          } else {
            smartBroadcast(table, newRow, { type: 'change', table, event: 'UPDATE', newRow, oldRow });
            dbPersistRow(table, newRow).catch(e => logger.error({ err: e }, '[db] background task error'));
          }
          // chat_reads 갱신 시 해당 유저 unread 캐시 즉시 무효화
          if (table === 'chat_reads' && newRow.reader_id) {
            unreadCountsCache.delete(String(newRow.reader_id));
          }
        } else {
          let base: Record<string, unknown> = { id: genId(), created_at: ts(), ...row };
          if (table === 'profiles') {
            const usedPins = new Set(tableData.map(r => r.pin_code).filter(Boolean)) as Set<string>;
            const { use5Digit, poolSize } = pinPoolParams(tableData.length);
            const pinResult = resolvePin(usedPins, poolSize, use5Digit, base.pin_code as string | null | undefined);
            if (!pinResult.ok) {
              return res.status(503).json({
                data: null,
                error: { message: 'PIN pool exhausted — no available PIN slots. Please contact the administrator.', code: 'PIN_EXHAUSTED' },
              });
            }
            base = { ...base, pin_code: pinResult.pin };
            if (typeof base._device_secret === 'string') {
              const secretHash = createHmac('sha256', SSE_TOKEN_SECRET)
                .update(base._device_secret as string)
                .digest('hex');
              const profileId = String(base.id);
              if (!getTable('device_secrets').find(r => r.user_id === profileId)) {
                const dsRow = { id: genId(), user_id: profileId, secret_hash: secretHash, created_at: ts() };
                getTable('device_secrets').push(dsRow);
                dbPersistRow('device_secrets', dsRow).catch(e => logger.error({ err: e }, '[db] background task error'));
              }
              delete base._device_secret;
            }
          }
          if (table === 'profiles' && base.birth_month == null) {
            base.birth_month = Math.ceil(Math.random() * 12);
            base.birth_day = Math.ceil(Math.random() * 28);
          }
          tableData.push(base);
          _idxById?.set(base.id, tableData.length - 1); // Map 갱신 (배치 내 후속 항목 O(1) 조회)
          upserted.push(base);
          if (CRITICAL_PERSIST_TABLES.has(table)) {
            try {
              await dbPersistRow(table, base);
            } catch (e) {
              const bi = tableData.findIndex(r => r.id === base.id);
              if (bi >= 0) tableData.splice(bi, 1);
              upserted.pop();
              logger.error({ err: e, table, rowId: base.id }, '[db] critical UPSERT insert persist failed');
              return res.status(503).json({
                data: null,
                error: { message: '저장에 실패했습니다. 잠시 후 다시 시도해 주세요.', code: 'PERSIST_FAILED' },
              });
            }
            smartBroadcast(table, base, { type: 'change', table, event: 'INSERT', newRow: base, oldRow: null });
          } else {
            smartBroadcast(table, base, { type: 'change', table, event: 'INSERT', newRow: base, oldRow: null });
            dbPersistRow(table, base).catch(e => logger.error({ err: e }, '[db] background task error'));
          }
          if (table === 'chat_reads' && base.reader_id) {
            unreadCountsCache.delete(String(base.reader_id));
          }
        }
      }
      if (table === 'profiles') {
        for (const row of upserted) {
          await autoMatchGroupChatGuarded(String(row.id), row);
        }
      }
      if (selectAfterWrite) return res.json({ data: upserted, error: null });
      return res.json({ data: null, error: null });
    }

    // ── DELETE ──────────────────────────────────────────────────────────────
    if (op === 'delete') {
      let toDelete = applyFilters(tableData, normalizedFilters);

      // ─ IDOR guard: 민감 테이블 DELETE는 requesterId 필수 ────────────────
      if (!isAdmin && !requesterId) {
        if (
          table === 'messages' || table === 'likes' || table === 'chat_reads' ||
          table === 'chats' || table === 'contact_shares' || table === 'contact_share_events' ||
          table === 'group_messages' || table === 'group_participants' || table === 'group_chats' ||
          table === 'signal_sends' || table === 'blocked_users'
        ) {
          logger.warn({ table, ip: req.ip }, '[SECURITY] IDOR: DELETE without requesterId blocked');
          return res.status(403).json({ data: null, error: { message: 'Forbidden: authentication required', code: 'FORBIDDEN' } });
        }
      }

      // ─ IDOR guard: DELETE ownership check ──────────────────────────────
      if (requesterId && !isAdmin) {
        for (const existingRow of toDelete) {
          if (table === 'likes' && existingRow.liker_id != null &&
              String(existingRow.liker_id) !== String(requesterId)) {
            logger.warn({ requesterId, rowId: existingRow.id }, '[SECURITY] IDOR: DELETE likes blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: 자신이 보낸 하트만 취소할 수 있습니다.', code: 'FORBIDDEN' } });
          }
          if (table === 'signal_sends' && existingRow.sender_id != null &&
              String(existingRow.sender_id) !== String(requesterId)) {
            logger.warn({ requesterId, rowId: existingRow.id }, '[SECURITY] IDOR: DELETE signal_sends blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: 자신이 보낸 시그널만 취소할 수 있습니다.', code: 'FORBIDDEN' } });
          }
          if (table === 'messages' && existingRow.sender_id != null &&
              String(existingRow.sender_id) !== String(requesterId)) {
            logger.warn({ requesterId, rowId: existingRow.id }, '[SECURITY] IDOR: DELETE messages blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: 자신의 메시지만 삭제할 수 있습니다.', code: 'FORBIDDEN' } });
          }
          if (table === 'chats') {
            const u1 = String(existingRow.user1_id ?? '');
            const u2 = String(existingRow.user2_id ?? '');
            if (u1 !== String(requesterId) && u2 !== String(requesterId)) {
              logger.warn({ requesterId, rowId: existingRow.id }, '[SECURITY] IDOR: DELETE chats blocked');
              return res.status(403).json({ data: null, error: { message: 'Forbidden: 참여한 채팅방만 삭제할 수 있습니다.', code: 'FORBIDDEN' } });
            }
          }
          if (table === 'group_participants' && existingRow.user_id != null &&
              String(existingRow.user_id) !== String(requesterId)) {
            logger.warn({ requesterId, rowId: existingRow.id }, '[SECURITY] IDOR: DELETE group_participants blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: 자신의 참여만 나갈 수 있습니다.', code: 'FORBIDDEN' } });
          }
          if (table === 'group_messages' && existingRow.sender_id != null &&
              String(existingRow.sender_id) !== String(requesterId)) {
            logger.warn({ requesterId, rowId: existingRow.id }, '[SECURITY] IDOR: DELETE group_messages blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: 자신의 단톡 메시지만 삭제할 수 있습니다.', code: 'FORBIDDEN' } });
          }
          if (table === 'group_chats') {
            logger.warn({ requesterId, rowId: existingRow.id }, '[SECURITY] IDOR: DELETE group_chats blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: 단톡방 삭제는 관리자만 가능합니다.', code: 'FORBIDDEN' } });
          }
          if (table === 'blocked_users' && String(existingRow.user_id ?? '') !== String(requesterId)) {
            logger.warn({ requesterId, rowId: existingRow.id }, '[SECURITY] IDOR: DELETE blocked_users blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: 자신이 만든 차단만 삭제할 수 있습니다.', code: 'FORBIDDEN' } });
          }
          if (table === 'contact_shares' && String(existingRow.liked_id ?? '') !== String(requesterId)) {
            logger.warn({ requesterId, rowId: existingRow.id }, '[SECURITY] IDOR: DELETE contact_shares blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: 자신이 공유한 연락처만 삭제할 수 있습니다.', code: 'FORBIDDEN' } });
          }
          if (table === 'contact_share_events' && String(existingRow.from_user_id ?? '') !== String(requesterId)) {
            logger.warn({ requesterId, rowId: existingRow.id }, '[SECURITY] IDOR: DELETE contact_share_events blocked');
            return res.status(403).json({ data: null, error: { message: 'Forbidden: 자신이 보낸 이벤트만 삭제할 수 있습니다.', code: 'FORBIDDEN' } });
          }
        }
      }

      if (table === 'group_participants' && requesterId && !isAdmin) {
        const gidF = normalizedFilters.find(f => f.type === 'eq' && f.col === 'group_id');
        const uidF = normalizedFilters.find(f => f.type === 'eq' && f.col === 'user_id');
        const seeds = toDelete.length > 0
          ? toDelete
          : (gidF && uidF && 'val' in gidF && 'val' in uidF
            ? [{ user_id: uidF.val, group_id: gidF.val }]
            : []);
        const byId = new Map<string, Record<string, unknown>>();
        for (const row of seeds) {
          if (String(row.user_id) !== String(requesterId)) continue;
          for (const extra of participantRowsToLeave(String(row.user_id), String(row.group_id ?? ''))) {
            byId.set(String(extra.id), extra);
          }
        }
        if (byId.size > 0) toDelete = [...byId.values()];
      }

      const deleteIds = [...new Set(toDelete.map(r => String(r.id)).filter(Boolean))];
      const previousRows = [...toDelete];
      const deleteIdSet = new Set(deleteIds);
      store[table] = tableData.filter(r => {
        if (r.id != null && deleteIdSet.has(String(r.id))) return false;
        return !applyFilters([r], normalizedFilters).length;
      });

      if (deleteIds.length > 0) {
        if (CRITICAL_PERSIST_TABLES.has(table)) {
          try {
            await dbDeleteRows(table, deleteIds);
          } catch (e) {
            // persist 실패 시 메모리 롤백 — 응답/브로드캐스트 전에 복구
            for (const row of previousRows) {
              if (!store[table].some(r => String(r.id) === String(row.id))) {
                store[table].push(row);
              }
            }
            logger.error({ err: e, table, deleteIds }, '[db] critical DELETE persist failed — rolled back');
            return res.status(503).json({ data: null, error: { message: '일시적 저장 오류입니다. 잠시 후 다시 시도해주세요.', code: 'PERSIST_FAILED' } });
          }
        } else {
          dbDeleteRows(table, deleteIds).catch(e => logger.error({ err: e }, '[db] background task error'));
        }
      }

      for (const row of toDelete) {
        if (table === 'group_participants') {
          await recordGroupOptOut(row);
        }
        smartBroadcast(table, row, { type: 'change', table, event: 'DELETE', newRow: null, oldRow: row });
      }
      return res.json({ data: null, error: null });
    }

    return res.json({ data: null, error: { message: 'Unknown operation' } });
  } catch (e) {
    logger.error({ err: e }, '[db/op] Unexpected error');
    // 내부 오류 문자열을 클라이언트에 직접 노출하지 않음 — 스키마·스택 정보 유출 방지
    return res.json({ data: null, error: { message: '서버 내부 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' } });
  } finally {
    // ─ 동시 요청 슬롯 반환 — try/catch 내부의 어떤 경로로 나가든 반드시 1회 실행
    _activeOpCount--;
  }
});

// ─── RPC allowlist ─────────────────────────────────────────────────────────────
// 알 수 없는 RPC 이름으로의 호출을 즉시 404로 차단 — 내부 구현 노출 및 퍼징 방지
const ALLOWED_RPCS = new Set([
  'admin_create_session', 'admin_invalidate_session', 'admin_auth_phone',
  'admin_update_settings', 'admin_toggle_session', 'test_resync', 'test_clear_hearts', 'admin_force_resync_all',
  'test_verify_password', 'test_update_settings', 'admin_full_reset', 'admin_event_end_reset',
  'verify_panel_password',
  'admin_update_profile',
  'admin_delete_profile',
  'admin_reset_heart_balances',  // 모든 유저 하트 잔여 수 초기화
]);

// ─── RPC endpoint ─────────────────────────────────────────────────────────────
router.post('/rpc/:name', async (req: Request, res: Response) => {
  const { name } = req.params;

  // ─ name 타입·길이 방어 + 허용 목록 검증 ───────────────────────────────────
  if (typeof name !== 'string' || name.length > 100) {
    return res.status(400).json({ data: null, error: { message: 'Invalid RPC name format' } });
  }
  if (!ALLOWED_RPCS.has(name)) {
    logger.warn({ name, ip: req.ip }, '[SECURITY] Unknown RPC call rejected');
    return res.status(404).json({ data: null, error: { message: `Unknown RPC: ${name}` } });
  }

  // ─ req.body 타입 방어 ──────────────────────────────────────────────────────
  if (req.body != null && (typeof req.body !== 'object' || Array.isArray(req.body))) {
    return res.status(400).json({ data: null, error: { message: 'Request body must be a JSON object' } });
  }
  const args = (req.body ?? {}) as Record<string, unknown>;

  await hydrateAppSettingsFromDb();
  const settings = (getTable('app_settings')[0] ?? {}) as Record<string, unknown>;
  const adminSecrets = panelAdminSecrets(settings.admin_password as string | undefined);
  const testSecrets = panelTestSecrets(settings.test_password as string | undefined);

  function checkPassword() {
    const provided = (args.p_admin_password as string) ?? '';
    const token = (args.adminToken as string) ?? '';
    if (!adminSecrets.length) throw new RpcAuthError('관리자 비밀번호가 서버에 설정되지 않았습니다. 잠시 후 다시 시도하세요.');
    const isValidToken = token.length > 0 && adminSecrets.some(s => token === deriveAdminToken(s));
    if (!secretMatches(provided, adminSecrets) && !isValidToken) {
      throw new RpcAuthError('비밀번호가 일치하지 않습니다.');
    }
  }

  function checkTestPassword() {
    const provided = String(args.p_test_password ?? '').trim();
    if (!secretMatches(provided, testSecrets)) {
      throw new RpcAuthError('테스트 비밀번호가 올바르지 않습니다.');
    }
  }

  try {
    switch (name) {
      case 'admin_create_session': {
        // 관리자 비밀번호 서버 사이드 검증
        // (클라이언트가 app_settings.admin_password를 직접 읽는 것을 방지하기 위해 여기서만 검증)
        checkPassword();
        // 전화번호 검증 — 입력한 경우에만 (비밀번호만으로도 로그인 가능)
        const adminPhoneSetting = (settings.admin_phone as string | undefined) ?? '';
        const providedPhone = (args.p_phone as string | undefined) ?? '';
        const normalizeP = (s: string) => s.replace(/[^0-9]/g, '');
        if (adminPhoneSetting && providedPhone.trim() && normalizeP(providedPhone) !== normalizeP(adminPhoneSetting)) {
          return res.status(403).json({ data: null, error: { message: '전화번호 또는 비밀번호가 올바르지 않습니다.' } });
        }
        const providedPw = String(args.p_admin_password ?? '').trim();
        const adminTokenArg = String(args.adminToken ?? '').trim();
        const dbAdmin = String(settings.admin_password ?? '').trim();
        // 실제로 일치한 비밀번호로 토큰 생성 — bootstrap 로그인 시 DB/기본값 불일치 방지
        let tokenKey = dbAdmin || adminSecrets[0];
        if (secretMatches(providedPw, adminSecrets)) {
          tokenKey = providedPw;
        } else if (adminTokenArg) {
          const matched = adminSecrets.find(s => adminTokenArg === deriveAdminToken(s));
          if (matched) tokenKey = matched;
        }
        const adminToken = deriveAdminToken(tokenKey);
        const bootstrapAdmin = process.env.BOOTSTRAP_ADMIN_PASSWORD?.trim();
        if (bootstrapAdmin && providedPw === bootstrapAdmin && (!dbAdmin || isDefaultPanelPassword(dbAdmin))) {
          const current = (getTable('app_settings')[0] ?? {}) as Record<string, unknown>;
          const updated = mergeAppSettings(current, { admin_password: bootstrapAdmin });
          store['app_settings'] = [updated];
          dbPersistRow('app_settings', updated).catch(e => logger.error({ err: e }, '[db] persist bootstrap admin password'));
        }
        return res.json({ data: adminToken, error: null });
      }

      case 'admin_invalidate_session':
        checkPassword();
        return res.json({ data: null, error: null });

      case 'admin_auth_phone':
        checkPassword();
        return res.json({ data: null, error: null });

      case 'admin_toggle_session': {
        checkPassword();
        const active = args.p_active === true;
        const current = (getTable('app_settings')[0] ?? {}) as Record<string, unknown>;
        const merged = mergeAppSettings(current, { session_active: active });
        const updated = await overlayDbSecrets(merged, new Set());
        store['app_settings'] = [updated];
        try {
          await dbPersistRow('app_settings', updated);
        } catch (e) {
          logger.error({ err: e }, '[db] admin_toggle_session persist failed');
          return res.status(503).json({
            data: null,
            error: { message: '회의 상태 저장 실패 — 잠시 후 다시 시도해 주세요.', code: 'PERSIST_FAILED' },
          });
        }
        smartBroadcast('app_settings', updated, {
          type: 'change', table: 'app_settings', event: 'UPDATE',
          newRow: updated, oldRow: current,
        });
        return res.json({ data: { session_active: active }, error: null });
      }

      case 'admin_update_settings': {
        // 관리자 패널 → api-server 인메모리 app_settings 동기화
        // Supabase 직접 업데이트만으로는 api-server 메모리가 갱신되지 않아 유저에게 반영 안 됨
        checkPassword();
        const rawPayload = (args.p_payload as Record<string, unknown>) ?? {};
        // ─ XSS 방어: 관리자가 app_settings에 악성 스크립트를 주입하는 것을 차단 ──────
        // 클라이언트(AdminApp)가 app_settings를 전달할 때 문자열 값 내 HTML 태그 제거
        const sanitizedSettingsPayload = Object.fromEntries(
          Object.entries(rawPayload).map(([k, v]) => [
            k,
            typeof v === 'string'
              ? v.replace(/<[^>]*>/g, '').slice(0, 2000)
              : v,
          ])
        );
        const current = (getTable('app_settings')[0] ?? {}) as Record<string, unknown>;
        const merged = mergeAppSettings(current, sanitizedSettingsPayload);
        const updated = await overlayDbSecrets(merged, explicitSecretKeys(sanitizedSettingsPayload));
        store['app_settings'] = [updated];
        try {
          await dbPersistRow('app_settings', updated);
        } catch (e) {
          store['app_settings'] = [current];
          logger.error({ err: e }, '[db] admin_update_settings persist failed');
          return res.status(503).json({
            data: null,
            error: { message: '설정 저장 실패 — 잠시 후 다시 시도해 주세요.', code: 'PERSIST_FAILED' },
          });
        }
        smartBroadcast('app_settings', updated, {
          type: 'change', table: 'app_settings', event: 'UPDATE',
          newRow: updated, oldRow: current,
        });
        resetPanelLoginLimiter(req);
        return res.json({ data: publicAppSettingsView(updated, true), error: null });
      }

      case 'test_verify_password': {
        checkTestPassword();
        const provided = String(args.p_test_password ?? '').trim();
        const bootstrapTest = process.env.BOOTSTRAP_TEST_PASSWORD?.trim();
        const dbTest = String(settings.test_password ?? '').trim();
        if (bootstrapTest && provided === bootstrapTest && (!dbTest || isDefaultPanelPassword(dbTest))) {
          const current = (getTable('app_settings')[0] ?? {}) as Record<string, unknown>;
          const updated = mergeAppSettings(current, { test_password: bootstrapTest });
          store['app_settings'] = [updated];
          dbPersistRow('app_settings', updated).catch(e => logger.error({ err: e }, '[db] persist bootstrap test password'));
        }
        return res.json({ data: deriveTestToken(provided), error: null });
      }

      case 'test_resync': {
        checkTestPassword();
        resyncAllFromNativeDb('forced').catch(e => logger.error({ err: e }, '[rpc] test_resync 실패'));
        return res.json({ data: null, error: null });
      }

      case 'test_clear_hearts': {
        checkTestPassword();
        const allLikes = getTable('likes');
        store['likes'] = [];
        _likesLastInsert.clear();
        dbDeleteTable('likes').catch(e => logger.error({ err: e }, '[rpc] test_clear_hearts DB 삭제 실패'));
        for (const like of allLikes) {
          smartBroadcast('likes', like, {
            type: 'change',
            table: 'likes',
            event: 'DELETE',
            newRow: null,
            oldRow: like,
          });
        }
        logger.info({ count: allLikes.length }, '[rpc] test_clear_hearts: 하트 전체 삭제');
        return res.json({ data: { cleared: allLikes.length }, error: null });
      }

      case 'admin_force_resync_all': {
        // 관리자 패널 → 전체 테이블 강제 리싱크 (Supabase 직접 쓰기 후 즉시 반영용)
        checkPassword();
        resyncAllFromNativeDb('forced').catch(e => logger.error({ err: e }, '[rpc] admin_force_resync_all 실패'));
        return res.json({ data: null, error: null });
      }

      case 'test_update_settings': {
        checkTestPassword();
        const testPayload = (args.p_payload as Record<string, unknown>) ?? {};
        // 허용 필드 제한 — 테스트 대시보드는 세션·테이블 설정만 변경 가능
        const ALLOWED_TEST_FIELDS = new Set(['session_active', 'active_tables']);
        const filteredPayload = Object.fromEntries(
          Object.entries(testPayload).filter(([k]) => ALLOWED_TEST_FIELDS.has(k))
        );
        const currentSettings = (getTable('app_settings')[0] ?? {}) as Record<string, unknown>;
        const mergedSettings = { ...currentSettings, ...filteredPayload, updated_at: new Date().toISOString() };
        const updatedSettings = await overlayDbSecrets(mergedSettings, new Set());
        store['app_settings'] = [updatedSettings];
        smartBroadcast('app_settings', updatedSettings, {
          type: 'change',
          table: 'app_settings',
          event: 'UPDATE',
          newRow: updatedSettings,
          oldRow: currentSettings,
        });
        dbPersistRow('app_settings', updatedSettings).catch(e => logger.error({ err: e }, '[db] background task error'));
        return res.json({ data: null, error: null });
      }

      case 'admin_full_reset': {
        checkPassword();
        return res.json({ data: null, error: null });
      }

      case 'admin_event_end_reset': {
        checkPassword();
        const tablesToClear = [
          'profiles', 'likes', 'anonymous_reports', 'chats', 'messages',
          'contact_shares', 'contact_share_events',
          'notifications',
          'signal_sends',
          'group_chats', 'group_participants', 'group_messages', 'group_opt_outs',
        ];
        // 프라이빗 테이블은 row 내용 없이 "전체 초기화" 신호만 전송 (민감 데이터 유출 방지)
        const RESET_PRIVATE = new Set([
          'likes', 'chats', 'messages', 'contact_shares', 'contact_share_events',
          'chat_reads', 'anonymous_reports', 'signal_sends',
          'group_chats', 'group_participants', 'group_messages', 'group_opt_outs',
        ]);
        const persistDeletes: Promise<void>[] = [];
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
          persistDeletes.push(dbDeleteTable(t).catch(e => logger.error({ err: e }, '[db] background task error')));
        }
        mergedGroupIds.clear();
        autoMatchInFlight.clear();
        // PG wipe가 끝난 뒤 빈 카탈로그 방을 다시 심는다 (시드가 삭제 레이스에 지워지지 않게)
        await Promise.all(persistDeletes);
        await ensureOptInGroupRooms();
        return res.json({ data: null, error: null });
      }

      case 'verify_panel_password': {
        // 유저 화면 리셋/관리자 진입 — 클라이언트에 비번을 심지 않고 서버에서만 검증
        if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
          const ip = String(req.ip ?? req.socket.remoteAddress ?? 'unknown');
          const panelRate = consumeRateLimit(_loginRateMap, `panel:${ip}`, {
            windowMs: LOGIN_RATE_WINDOW_MS,
            max: LOGIN_RATE_MAX,
            maxMapSize: RATE_MAP_MAX_SIZE,
          });
          if (panelRate === 'map_full') {
            return res.status(429).json({ data: null, error: { message: '요청이 너무 많습니다.', code: 'RATE_LIMITED' } });
          }
          if (panelRate === 'limited') {
            return res.status(429).json({ data: null, error: { message: '시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.', code: 'RATE_LIMITED' } });
          }
        }
        const kind = String(args.p_kind ?? 'reset');
        const provided = String(args.p_password ?? '').trim();
        if (!provided || provided.length > 100) {
          return res.status(400).json({ data: null, error: { message: 'Invalid password', code: 'INVALID_INPUT' } });
        }
        let ok = false;
        if (kind === 'reset') {
          const secrets = panelSecretsForRuntime(settings.reset_password as string | undefined);
          ok = secretMatches(provided, secrets);
        } else if (kind === 'admin') {
          ok = secretMatches(provided, panelAdminSecrets(settings.admin_password as string | undefined));
        } else if (kind === 'test') {
          ok = secretMatches(provided, panelTestSecrets(settings.test_password as string | undefined));
        } else {
          return res.status(400).json({ data: null, error: { message: 'Invalid kind', code: 'INVALID_INPUT' } });
        }
        if (!ok) {
          return res.status(401).json({ data: { ok: false }, error: { message: '비밀번호가 올바르지 않습니다.', code: 'UNAUTHORIZED' } });
        }
        resetPanelLoginLimiter(req);
        return res.json({ data: { ok: true }, error: null });
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
          dbPersistRow('profiles', newRow).catch(e => logger.error({ err: e }, '[db] background task error'));
        }
        return res.json({ data: null, error: null });
      }

      case 'admin_delete_profile': {
        checkPassword();
        const profileId = args.p_profile_id as string;
        const profiles = getTable('profiles');
        const oldProfile = profiles.find(p => p.id === profileId);
        store['profiles'] = profiles.filter(p => p.id !== profileId);
        if (oldProfile) {
          // 민감 연락처 필드 제거 후 전체 브로드캐스트
          broadcastAll({ type: 'change', table: 'profiles', event: 'DELETE', newRow: null, oldRow: sanitizeProfile(oldProfile) });
          dbDeleteRow('profiles', profileId).catch(e => logger.error({ err: e }, '[db] background task error'));
        }
        return res.json({ data: null, error: null });
      }

      case 'admin_reset_heart_balances': {
        // 모든 유저의 하트 잔여 수를 heart_initial_count로 초기화
        checkPassword();
        const initCount = Math.max(1, Number((settings as Record<string, unknown>).heart_initial_count ?? 10));
        const allProfiles = getTable('profiles');
        const nowIso2 = new Date().toISOString();
        if (!store['heart_balances']) store['heart_balances'] = [];
        const resetPersists: Promise<void>[] = [];
        for (const p of allProfiles) {
          const userId = p.id as string;
          if (!userId) continue;
          const newRow: Record<string, unknown> = {
            id: userId, heart_count: initCount, last_drain_at: null, updated_at: nowIso2,
          };
          const idx = (store['heart_balances'] as Record<string, unknown>[]).findIndex(b => b.id === userId);
          if (idx >= 0) (store['heart_balances'] as Record<string, unknown>[])[idx] = newRow;
          else (store['heart_balances'] as Record<string, unknown>[]).push(newRow);
          resetPersists.push(dbPersistRow('heart_balances', newRow).catch(e => logger.error({ err: e }, '[db] background task error')));
          _smartBroadcastLocal('heart_balances', newRow, {
            type: 'change', table: 'heart_balances', event: 'UPDATE', newRow, oldRow: {},
          });
        }
        await Promise.all(resetPersists);
        logger.info({ reset: allProfiles.length }, '[rpc] admin_reset_heart_balances 완료');
        return res.json({ data: { reset: allProfiles.length }, error: null });
      }

      default:
        // ALLOWED_RPCS 허용 목록에서 이미 차단됨 — 이 경로는 도달하지 않아야 함
        return res.status(404).json({ data: null, error: { message: `Unknown RPC: ${name}` } });
    }
  } catch (e) {
    if (e instanceof RpcAuthError) {
      return res.status(403).json({ data: null, error: { message: e.message } });
    }
    logger.error({ err: e, rpc: name }, '[rpc] Unexpected error');
    if (!res.headersSent) res.status(500).json({ data: null, error: { message: String(e) } });
    return;
  }
});

// ─── Broadcast endpoint (for channel.send()) ──────────────────────────────────
// 반드시 SESSION_SECRET 또는 admin RPC 비밀번호를 헤더로 전달해야 사용 가능
// IP별 레이트 리밋 (5초 윈도우, 최대 30회) — 스팸/악의적 남용 추가 방어
setInterval(() => {
  pruneRateMap(_broadcastRateMap);
}, 5 * 60 * 1000).unref();
router.post('/broadcast', (req: Request, res: Response) => {
  try {
  // ✅ 인증: 클라이언트 SSE 토큰(HMAC)으로 검증 — SESSION_SECRET 클라이언트 노출 없이 안전
  const token  = req.headers['x-broadcast-token']  as string | undefined;
  const userId = req.headers['x-broadcast-userid'] as string | undefined;
  if (!token || !userId || !verifySseToken(userId, token)) {
    res.status(403).json({ ok: false, error: 'Forbidden: invalid broadcast token' });
    return;
  }
  // x-forwarded-for는 Express가 배열로 파싱할 수 있음 — typeof 검사 후 안전하게 첫 IP 추출
  const xfwd = req.headers['x-forwarded-for'];
  const ip = (typeof xfwd === 'string' ? xfwd : Array.isArray(xfwd) ? xfwd[0] : req.socket?.remoteAddress ?? 'unknown').split(',')[0].trim();
  const broadcastRate = consumeRateLimit(_broadcastRateMap, ip, { windowMs: 5_000, max: 30 });
  if (broadcastRate !== 'ok') {
    res.status(429).json({ ok: false, error: 'Too many broadcasts' });
    return;
  }
  // ─ req.body 타입 방어: null·원시값·배열 전송 시 400 반환
  if (req.body == null || typeof req.body !== 'object' || Array.isArray(req.body)) {
    res.status(400).json({ ok: false, error: 'Request body must be a JSON object' });
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
  // ─ XSS 방어: broadcast payload 내 문자열 값 HTML 태그 제거 ───────────────────
  // 관리자가 전송한 공지 메시지에 <script> 삽입 시도를 서버 레벨에서 차단
  function sanitizeBroadcastValue(val: unknown, depth = 0): unknown {
    if (depth > 5) return val; // 깊이 제한 (ReDoS / 순환 참조 방지)
    if (typeof val === 'string') return val.replace(/<[^>]*>/g, '').slice(0, 5000);
    if (Array.isArray(val)) return val.map(v => sanitizeBroadcastValue(v, depth + 1));
    if (val !== null && typeof val === 'object') {
      return Object.fromEntries(
        Object.entries(val as Record<string, unknown>).map(([k, v]) => [k, sanitizeBroadcastValue(v, depth + 1)])
      );
    }
    return val;
  }
  const sanitizedPayload = sanitizeBroadcastValue(payload);
  broadcastAll({ type: 'broadcast', channel, event, payload: sanitizedPayload });
  res.json({ ok: true });
  } catch (e) {
    logger.error({ err: e }, '[broadcast] Unexpected error');
    if (!res.headersSent) res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

// ─── Image storage ────────────────────────────────────────────────────────────
// 허용 MIME 타입 (이미지만)
const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
// base64 인코딩 시 ~4/3 오버헤드 → 5MB 원본 ≈ 9MB JSON 문자열
const MAX_IMAGE_DATAURL_BYTES = 9_000_000;
const imageAccess = createImageAccessPolicy(getTable);

router.post('/storage-upload', async (req: Request, res: Response) => {
  try {
  // ─ req.body 타입 방어
  if (req.body == null || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ data: null, error: 'Invalid request body' });
  }
  const userId = req.session.userId;
  if (!userId) {
    recordUploadRejected('unauthenticated');
    return res.status(401).json({ data: null, error: { message: 'Authentication required' } });
  }
  const { path: imgPath, dataUrl } = req.body as { path?: string; dataUrl?: string };
  // ─ 경로 검증: 디렉터리 트래버설 / 임의 덮어쓰기 방지
  if (
    !imgPath || typeof imgPath !== 'string' ||
    imgPath.includes('..') || imgPath.startsWith('/') ||
    imgPath.length > 512 || !/^[\w\-./]+$/.test(imgPath)
  ) {
    recordUploadRejected('path');
    return res.status(400).json({ data: null, error: 'Invalid path' });
  }
  if (!imageAccess.canUpload(imgPath, userId)) {
    recordUploadRejected('forbidden');
    return res.status(403).json({ data: null, error: { message: 'Forbidden image path' } });
  }
  // ─ Per-user + NAT IP burst: 이미지 스팸 방지 (공인 IP 한 줄로 전원 429 금지)
  const uploadIp = String(req.ip ?? req.socket.remoteAddress ?? 'unknown');
  const uploadKeys = venueUploadRateKeys(userId, uploadIp);
  const uploadUserRate = consumeRateLimit(_uploadRateMap, uploadKeys.userKey, {
    windowMs: UPLOAD_RATE_WINDOW_MS,
    max: UPLOAD_RATE_MAX,
    maxMapSize: RATE_MAP_MAX_SIZE,
  });
  const uploadIpBurst = consumeRateLimit(_uploadRateMap, uploadKeys.ipBurstKey, {
    windowMs: UPLOAD_RATE_WINDOW_MS,
    max: UPLOAD_RATE_MAX_PER_IP,
    maxMapSize: RATE_MAP_MAX_SIZE,
  });
  if (uploadUserRate === 'map_full' || uploadIpBurst === 'map_full') {
    recordUploadRejected('rate_limited');
    res.setHeader('Retry-After', '5');
    return res.status(429).json({ data: null, error: '요청이 너무 많습니다.' });
  }
  if (uploadUserRate === 'limited' || uploadIpBurst === 'limited') {
    recordUploadRejected('rate_limited');
    res.setHeader('Retry-After', '5');
    return res.status(429).json({ data: null, error: '이미지를 너무 자주 업로드하고 있습니다. 잠시 후 다시 시도해 주세요.' });
  }

  // ─ dataUrl 검증
  if (!dataUrl || typeof dataUrl !== 'string') {
    return res.status(400).json({ data: null, error: 'Missing dataUrl' });
  }
  const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/);
  if (!mimeMatch || !ALLOWED_IMAGE_MIMES.has(mimeMatch[1])) {
    recordUploadRejected('mime');
    return res.status(400).json({ data: null, error: 'Invalid image type' });
  }
  // ─ 크기 제한 (~5MB 원본). 클라이언트 압축 상한은 8M 문자, 서버는 9M.
  if (dataUrl.length > MAX_IMAGE_DATAURL_BYTES) {
    recordUploadRejected('size_cap');
    return res.status(413).json({ data: null, error: 'Image too large (max 5MB)' });
  }
  // ─ Magic bytes 검증: MIME 헤더 조작으로 악성 파일 위장 차단
  const expectedMagic = IMAGE_MAGIC[mimeMatch[1]];
  if (expectedMagic) {
    const base64Body = dataUrl.split(',')[1] ?? '';
    const rawBytes = Buffer.from(base64Body.slice(0, 24), 'base64');
    const matched = expectedMagic.every(signature =>
      signature.bytes.every((byte, index) => rawBytes[signature.offset + index] === byte)
    );
    if (!matched) {
      recordUploadRejected('magic');
      return res.status(400).json({ data: null, error: 'Image content does not match declared type' });
    }
  }
  // 프로필 row가 이 경로를 저장하기 전에 이미지 자체가 durable해야 한다.
  // DB 저장 실패를 성공으로 응답하면 서버 재시작 후 깨진 프로필 사진이 남는다.
  await dbPersistImage(imgPath, dataUrl);
  imageStoreSet(imgPath, dataUrl);
  recordUploadAccepted();
  return res.json({ data: { path: imgPath }, error: null });
  } catch (e) {
    logger.error({ err: e }, '[storage-upload] Unexpected error');
    return res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// 메시지 저장 실패·채팅방 전환 시 방금 업로드한 고아 이미지를 정리합니다.
router.post('/storage-remove', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    const paths = (req.body as { paths?: unknown })?.paths;
    if (!userId) {
      return res.status(401).json({ data: null, error: { message: 'Authentication required' } });
    }
    if (!Array.isArray(paths) || paths.length === 0 || paths.length > 10 ||
        paths.some(p => typeof p !== 'string' || p.includes('..') || p.startsWith('/') ||
          p.length > 512 || !/^[\w\-./]+$/.test(p))) {
      return res.status(400).json({ data: null, error: { message: 'Invalid paths' } });
    }

    const stringPaths = paths as string[];
    const authorized = stringPaths.every(p => imageAccess.canRemove(p, userId));
    if (!authorized) {
      return res.status(403).json({ data: null, error: { message: 'Forbidden' } });
    }

    for (const p of stringPaths) imageStore.delete(p);
    await pool.query('DELETE FROM app_image_store WHERE path = ANY($1::text[])', [stringPaths]);
    return res.json({ data: null, error: null });
  } catch (e) {
    logger.error({ err: e }, '[storage-remove] Unexpected error');
    return res.status(500).json({ data: null, error: { message: 'Internal server error' } });
  }
});

router.get('/storage-image', async (req: Request, res: Response): Promise<void> => {
  try {
  // ─ req.query.p 타입 방어: Express는 ?p=a&p=b 시 배열을 반환 → 명시적 string 검증
  const rawP = req.query.p;
  if (!rawP || typeof rawP !== 'string') { res.status(400).json({ error: 'Invalid path parameter' }); return; }
  const path = rawP;
  const userId = req.session.userId;
  const adminToken = typeof req.query.adminToken === 'string' ? req.query.adminToken : null;
  if (!verifyAdminToken(adminToken) && (!userId || !imageAccess.canRead(path, userId))) {
    res.status(userId ? 403 : 401).json({ error: 'Authentication required' });
    return;
  }
  let dataUrl: string | undefined = imageStoreGet(path);
  if (!dataUrl) {
    try {
      const { rows } = await pool.query('SELECT data_url FROM app_image_store WHERE path = $1 LIMIT 1', [path]);
      dataUrl = rows[0]?.data_url as string | undefined;
      if (dataUrl) imageStoreSet(path, dataUrl);
    } catch (e) {
      logger.warn({ err: e, path }, '[storage-image] lazy load failed');
    }
  }
  if (!dataUrl) { res.status(404).json({ error: 'Not found' }); return; }
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    const [, mime, b64] = match;
    res.setHeader('Content-Type', mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');   // prevent MIME sniffing
    res.setHeader('Content-Disposition', 'inline');        // don't treat as download
    res.setHeader('Cache-Control', 'private, max-age=86400');
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
  try {
  if (req.body == null || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ ok: false, error: 'Request body must be a JSON object' });
  }
  const adminTokenHeader = typeof req.headers['x-admin-token'] === 'string'
    ? req.headers['x-admin-token']
    : null;
  const { adminPassword } = req.body as { adminPassword?: string };
  const tokenOk = verifyAdminToken(adminTokenHeader);
  const settings = (getTable('app_settings')[0] ?? {}) as Record<string, unknown>;
  const expectedPw = (settings.admin_password as string) ?? '';
  const passwordOk = typeof adminPassword === 'string'
    && !!expectedPw
    && adminPassword === expectedPw;
  if (!tokenOk && !passwordOk) {
    return res.status(403).json({ ok: false, error: 'Admin authentication required' });
  }

  _dbPersistErrors = 0;
  _dbPersistErrorLog.length = 0;

  // Remove the persisted counter from DB
  try {
    await pool.query(
      `DELETE FROM app_kv_rows WHERE table_name = 'db_error_log' AND row_id = 'counter'`,
    );
  } catch (e) {
    logger.error({ err: e }, '[db] Failed to clear error state from DB');
    return res.status(500).json({ ok: false, error: String(e) });
  }

  logger.info({}, '[db] DB persist error counter cleared by admin');
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
    logger.warn({ err: auditErr }, '[db] 감사 로그 저장 실패 (non-critical)');
  }
  return res.json({ ok: true });
  } catch (e) {
    logger.error({ err: e }, '[admin/clear-db-errors] Unexpected error');
    if (!res.headersSent) res.status(500).json({ ok: false, error: 'Internal server error' });
    return;
  }
});

// ─── DB Health endpoint ───────────────────────────────────────────────────────
// 10초 캐시: O(messages+likes+profiles) 전체 스캔 + 2 DB 쿼리를 연속 요청마다 반복하지 않도록
let _healthCache: { ts: number; body: unknown } | null = null;
const HEALTH_CACHE_TTL_MS = 10_000;

/** 공개 readiness — 로그인·채팅 핵심 기능 사전 점검 (인증 불필요) */
router.get('/ready', (_req: Request, res: Response) => {
  try {
    const settings = (getTable('app_settings')[0] ?? {}) as Record<string, unknown>;
    const adminSecrets = panelAdminSecrets(settings.admin_password as string | undefined);
    const testSecrets = panelTestSecrets(settings.test_password as string | undefined);
    res.json({
      ready: true,
      settings: {
        session_active: settings.session_active === true,
        entry_password: String(settings.entry_password ?? ''),
        timer_end_at: (settings.timer_end_at as string | null | undefined) ?? null,
        timer_label: (settings.timer_label as string | null | undefined) ?? null,
        reset_signal: (settings.reset_signal as string | null | undefined) ?? null,
        // reset_password 는 공개 readiness에 노출하지 않음 (관리자 패널/RPC만)
        functions_locked: settings.functions_locked === true,
      },
      login: {
        adminConfigured: adminSecrets.length > 0,
        testConfigured: testSecrets.length > 0,
        resetConfigured: panelSecretsForRuntime(settings.reset_password as string | undefined).length > 0,
      },
      functions_locked: settings.functions_locked === true,
      qr_base_url: settings.qr_base_url ?? null,
      // leftover 잔량만 (키 값·비밀번호·PII 없음). 0 이면 PG에서 제거 완료.
      legacy_leftovers: {
        kv_tables: _legacyLeftovers.kv_tables,
        settings_rows: _legacyLeftovers.settings_rows,
        history_rows: _legacyLeftovers.history_rows,
      },
      checkedAt: new Date().toISOString(),
    });
  } catch (e) {
    logger.error({ err: e }, '[ready] Unexpected error');
    res.status(500).json({ ready: false, error: 'Ready check failed' });
  }
});

router.get('/health', async (req: Request, res: Response) => {
  try {
  const adminToken = typeof req.headers['x-admin-token'] === 'string'
    ? req.headers['x-admin-token']
    : null;
  if (!verifyAdminToken(adminToken)) {
    return res.status(401).json({ ok: false, error: 'Admin authentication required' });
  }
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
  let dbQueryError: string | null = null;
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
  } catch (e) {
    dbQueryError = e instanceof Error ? e.message : String(e);
    logger.warn({ err: e }, '[health] DB count query failed');
  }

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
  if (dbQueryError) alarms.push(`DB query failed: ${dbQueryError.slice(0, 120)}`);
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
    integrity: _integrityDiagnostics,
    httpMetrics: snapshotHttpMetrics(),
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
}, 30_000).unref();

router.get('/unread-counts', (req: Request, res: Response) => {
  const userId = typeof req.query.userId === 'string' && req.query.userId ? req.query.userId : null;
  if (!userId) return res.status(400).json({ data: null, error: { message: 'userId required' } });

  // ─ IDOR guard: 자신의 미읽음 카운트만 조회 가능 — SSE 토큰으로 소유자 확인 ──
  // 타인의 userId를 추측해 다른 사람의 채팅 존재 여부를 파악하는 공격을 차단
  // req.query.token은 동일 파라미터 반복 시 string[] — typeof 검사로 안전 추출
  const tokenQuery = req.query.token;
  const sseToken = (typeof tokenQuery === 'string' ? tokenQuery : null)
    ?? (typeof req.headers['x-sse-token'] === 'string' ? req.headers['x-sse-token'] : null);
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

    const chats = getTable('chats').filter(c =>
      String(c.user1_id) === String(userId) || String(c.user2_id) === String(userId)
    );

    // Build a map of chatId → read_at for this user
    const readAtByChat = new Map<string, string>();
    for (const r of getTable('chat_reads')) {
      if (String(r.reader_id) === String(userId) && r.chat_id && r.read_at) {
        const cid = resolveMergedChatId(String(r.chat_id));
        const prev = readAtByChat.get(cid);
        if (!prev || String(r.read_at) > prev) readAtByChat.set(cid, r.read_at as string);
      }
    }

    // 전체 메시지를 chat_id 기준으로 미리 인덱싱 — O(msgs) 1회 스캔
    const msgsByChatId = new Map<string, typeof store[string]>();
    for (const m of getTable('messages')) {
      const cid = resolveMergedChatId(String(m.chat_id ?? ''));
      if (!msgsByChatId.has(cid)) msgsByChatId.set(cid, []);
      msgsByChatId.get(cid)!.push(m);
    }

    const counts: Record<string, number> = {};
    const seenPairs = new Set<string>();
    for (const chat of chats) {
      const pk = chatPairKey(String(chat.user1_id), String(chat.user2_id));
      if (seenPairs.has(pk)) continue;
      seenPairs.add(pk);
      const siblings = chats.filter(c => chatPairKey(String(c.user1_id), String(c.user2_id)) === pk);
      const canonical = pickCanonicalChatRow(siblings);
      const chatId = String(canonical.id);
      const siblingIds = siblings.map(c => String(c.id));
      let readAt: string | undefined;
      for (const sid of siblingIds) {
        const ra = readAtByChat.get(sid) ?? readAtByChat.get(resolveMergedChatId(sid));
        if (ra && (!readAt || ra > readAt)) readAt = ra;
      }
      let unreadCount = 0;
      const seenMsg = new Set<string>();
      for (const sid of [...new Set([...siblingIds, chatId])]) {
        for (const m of msgsByChatId.get(sid) ?? []) {
          const mid = String(m.id ?? '');
          if (mid && seenMsg.has(mid)) continue;
          if (mid) seenMsg.add(mid);
          if (String(m.sender_id) === String(userId)) continue;
          if (!readAt || (m.created_at as string) > readAt) unreadCount++;
        }
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
    logger.error({ err: e }, '[unread-counts] Unexpected error');
    return res.status(500).json({ data: null, error: { message: '안읽은 메시지 수 조회 중 오류가 발생했습니다.' } });
  }
});

// ─── PIN lookup ───────────────────────────────────────────────────────────────
// 행사장 NAT: IP 공용 한도는 넉넉히, 동일 PIN 무차별 대입은 별도 버킷으로 차단
const _pinAttempts = new Map<string, { count: number; resetAt: number }>();
const PIN_MAX_PER_IP = Number(process.env.PIN_MAX_PER_IP ?? 200);
const PIN_MAX_PER_PIN = Number(process.env.PIN_MAX_PER_PIN ?? 8);
const PIN_WINDOW_MS = 15 * 60 * 1000;

function consumePinBucket(key: string, max: number): boolean {
  const now = Date.now();
  const prev = _pinAttempts.get(key);
  if (prev && prev.resetAt > now) {
    if (prev.count >= max) return false;
    prev.count++;
    return true;
  }
  _pinAttempts.set(key, { count: 1, resetAt: now + PIN_WINDOW_MS });
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of _pinAttempts) {
    if (rec.resetAt <= now) _pinAttempts.delete(ip);
  }
}, 5 * 60 * 1000).unref();

router.post('/by-pin', (req: Request, res: Response) => {
  try {
  const ip = String(req.ip ?? 'unknown');

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
  if (!consumePinBucket(`ip:${ip}`, PIN_MAX_PER_IP) || !consumePinBucket(`pin:${pin}`, PIN_MAX_PER_PIN)) {
    return res.status(429).json({ data: null, error: { message: '시도 횟수를 초과했습니다. 15분 후 다시 시도해주세요.' } });
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

  // 성공 — rate limit 리셋 (버킷 키는 consumePinBucket 과 동일)
  _pinAttempts.delete(`ip:${ip}`);
  _pinAttempts.delete(`pin:${pin}`);
  return res.json({ data: { id: found['id'] }, error: null });
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
    logger.warn({ userId, ip: req.ip }, '[push/subscribe] Invalid or missing SSE token — 침입 탐지');
    return res.status(401).json({ error: 'Unauthorized: invalid SSE token' });
  }
  const subs = getTable('push_subscriptions');
  const idx = subs.findIndex(s => s.user_id === userId && s.endpoint === subscription.endpoint);
  if (idx >= 0) {
    const updated = { ...subs[idx], auth: subscription.keys!.auth, p256dh: subscription.keys!.p256dh, updated_at: ts() };
    subs[idx] = updated;
    dbPersistRow('push_subscriptions', updated).catch(e => logger.error({ err: e }, '[db] background task error'));
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
    dbPersistRow('push_subscriptions', newSub).catch(e => logger.error({ err: e }, '[db] background task error'));
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
    dbDeleteRows('push_subscriptions', expired).catch(e => logger.error({ err: e }, '[db] background task error'));
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
const SESSION_TOKEN_EXPIRY_SEC = 7 * 24 * 60 * 60; // 7 days — cookie 대체·Netlify 프록시 대응

function issueSessionToken(userId: string): { token: string; expiresAt: number } {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TOKEN_EXPIRY_SEC;
  const mac = createHmac('sha256', SSE_TOKEN_SECRET)
    .update(`session:${userId}:${exp}`)
    .digest('hex');
  return { token: `${exp}:${mac}`, expiresAt: exp };
}

function verifySessionToken(userId: string, token: string): boolean {
  const colonIdx = token.indexOf(':');
  if (colonIdx < 1) return false;
  const expStr = token.slice(0, colonIdx);
  const mac = token.slice(colonIdx + 1);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Math.floor(Date.now() / 1000) > exp) return false;
  const expected = createHmac('sha256', SSE_TOKEN_SECRET)
    .update(`session:${userId}:${expStr}`)
    .digest('hex');
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(mac, 'hex'));
  } catch {
    return false;
  }
}

/** 쿠키 세션 또는 Bearer sessionToken 으로 인증된 userId */
function resolveAuthUserId(req: Request, body: Record<string, unknown>): string | null {
  const cookieId = (req.session as { userId?: string })?.userId;
  if (cookieId) return String(cookieId);
  const token = typeof body.sessionToken === 'string' ? body.sessionToken : null;
  const claimed = typeof body.requesterId === 'string' ? body.requesterId : null;
  if (token && claimed && verifySessionToken(claimed, token)) return claimed;
  return null;
}

function finishLogin(res: Response, req: Request, userId: string) {
  req.session.userId = userId;
  const { token: sessionToken, expiresAt: sessionExpiresAt } = issueSessionToken(userId);
  return res.json({ ok: true, sessionToken, sessionExpiresAt });
}

function issueSseToken(userId: string): { token: string; expiresAt: number } {
  const exp = Math.floor(Date.now() / 1000) + SSE_TOKEN_EXPIRY_SEC;
  const mac = createHmac('sha256', SSE_TOKEN_SECRET)
    .update(`${userId}:${exp}`)
    .digest('hex');
  return { token: `${exp}:${mac}`, expiresAt: exp };
}

/**
 * SSE 토큰 상태 구분.
 *
 * `expired` = 서명은 이 서버 비밀키로 정상 검증되지만 exp 가 지난 것 → 정상 사용자의
 * 토큰 갱신 실패다. `invalid` = 서명 불일치·형식 오류 → 위조 시도일 수 있다.
 * 둘을 섞어 warn 으로 남기면 만료 스팸에 묻혀 진짜 침입 신호를 놓친다.
 */
type SseTokenState = 'valid' | 'expired' | 'invalid';

function classifySseToken(userId: string, token: string): SseTokenState {
  const colonIdx = token.indexOf(':');
  if (colonIdx < 1) return 'invalid';
  const expStr = token.slice(0, colonIdx);
  const mac = token.slice(colonIdx + 1);
  const exp = Number(expStr);
  if (!Number.isFinite(exp)) return 'invalid';
  const expected = createHmac('sha256', SSE_TOKEN_SECRET)
    .update(`${userId}:${exp}`)
    .digest('hex');
  let signatureOk = false;
  try {
    signatureOk = timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(mac, 'hex'));
  } catch {
    return 'invalid';
  }
  if (!signatureOk) return 'invalid';
  return Math.floor(Date.now() / 1000) > exp ? 'expired' : 'valid';
}

function verifySseToken(userId: string, token: string): boolean {
  return classifySseToken(userId, token) === 'valid';
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
  // ─ Per-IP rate limit: brute-force 방지 (단위 테스트는 제외)
  if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  const loginIp = String(req.ip ?? req.socket.remoteAddress ?? 'unknown');
  const claimedUser = (req.body != null && typeof req.body === 'object' && !Array.isArray(req.body)
    && typeof (req.body as { userId?: unknown }).userId === 'string')
    ? (req.body as { userId: string }).userId
    : '';
  const keys = venueLoginRateKeys(claimedUser || undefined, loginIp);
  const userRate = consumeRateLimit(_loginRateMap, keys.userKey, {
    windowMs: LOGIN_RATE_WINDOW_MS,
    max: LOGIN_RATE_MAX,
    maxMapSize: RATE_MAP_MAX_SIZE,
  });
  const ipBurst = consumeRateLimit(_loginRateMap, keys.ipBurstKey, {
    windowMs: LOGIN_RATE_WINDOW_MS,
    max: LOGIN_RATE_MAX_PER_IP,
    maxMapSize: RATE_MAP_MAX_SIZE,
  });
  if (userRate === 'map_full' || ipBurst === 'map_full') {
    res.setHeader('Retry-After', '5');
    return res.status(429).json({ error: '요청이 너무 많습니다.' });
  }
  if (userRate === 'limited' || ipBurst === 'limited') {
    res.setHeader('Retry-After', '5');
    return res.status(429).json({ error: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.' });
  }
  }

  // ─ req.body 타입 방어: null·배열·원시값 전송 시 TypeError 방지
  if (req.body == null || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Request body must be a JSON object' });
  }
  const { userId, deviceSecret, pinCode, testToken } = req.body as {
    userId?: string; deviceSecret?: string; pinCode?: string; testToken?: string;
  };
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
    dbPersistRow('device_secrets', newDs).catch(e => logger.error({ err: e }, '[db] background task error'));
    logger.info({ userId }, '[auth] first-claim device registered');
    return finishLogin(res, req, userId);
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
    const profilePin = String(profile.pin_code ?? '').trim();
    const providedPin = String(pinCode ?? '').trim();
    const testOk = verifyTestToken(testToken);
    if (testOk || (profilePin && providedPin && profilePin === providedPin)) {
      const rebound = { id: userId, user_id: userId, secret_hash: submittedHash };
      const idx = deviceSecrets.findIndex(r => r.user_id === userId);
      if (idx >= 0) deviceSecrets[idx] = rebound; else deviceSecrets.push(rebound);
      dbPersistRow('device_secrets', rebound).catch(e => logger.error({ err: e }, '[db] device re-bind persist failed'));
      logger.info({ userId, via: testOk ? 'test-token' : 'pin' }, '[auth] device re-bound');
      return finishLogin(res, req, userId);
    }
    logger.warn({ userId, ip: req.ip }, '[auth] device secret mismatch — access denied (re-bind blocked)');
    return res.status(401).json({
      error: '이미 다른 기기에서 등록된 계정입니다. 고유번호(PIN)로 프로필 복구를 이용해 주세요.',
      code: 'DEVICE_MISMATCH',
    });
  }
  return finishLogin(res, req, userId);
  } catch (e) {
    logger.error({ err: e }, '[auth/login] Unexpected error');
    return res.status(500).json({ error: '로그인 처리 중 오류가 발생했습니다.' });
  }
});

// POST /auth/sse-token — 세션으로 인증된 userId에만 단기 SSE 토큰 발급
// 세션이 없거나 userId가 일치하지 않으면 401 반환
router.post('/auth/sse-token', (req: Request, res: Response) => {
  try {
    const body = (req.body != null && typeof req.body === 'object' && !Array.isArray(req.body))
      ? req.body as { userId?: string; sessionToken?: string }
      : {};
    let sessionUserId = req.session?.userId ?? null;
    if (!sessionUserId && body.userId && body.sessionToken && verifySessionToken(body.userId, body.sessionToken)) {
      sessionUserId = body.userId;
    }
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
  if (userId && (!token || classifySseToken(userId, token) !== 'valid')) {
    const state = !token ? 'missing' : classifySseToken(userId, token);
    if (state === 'expired') {
      // 만료는 정상 수명 종료. 침입 warn 으로 남기면 5시간 로그가 401 스팸이 된다.
      recordExpiredSseToken();
      logger.debug({ userId, ip: req.ip }, '[sse] token expired — client should refresh');
      res.status(401).json({ error: 'Invalid or missing SSE token', code: 'SSE_TOKEN_EXPIRED' });
    } else if (state === 'missing') {
      recordMissingSseToken();
      logger.warn({ userId, hasToken: false, ip: req.ip }, '[sse] 인증 실패: 유효하지 않은 토큰으로 SSE 접근 시도 — 침입 탐지');
      res.status(401).json({ error: 'Invalid or missing SSE token', code: 'SSE_TOKEN_INVALID' });
    } else {
      logger.warn({ userId, hasToken: !!token, ip: req.ip }, '[sse] 인증 실패: 유효하지 않은 토큰으로 SSE 접근 시도 — 침입 탐지');
      res.status(401).json({ error: 'Invalid or missing SSE token', code: 'SSE_TOKEN_INVALID' });
    }
    return;
  }

  // 전역 SSE 상한 — 프로세스 메모리/FD 고갈 방지
  if (sseLiveCount() >= SSE_MAX_TOTAL) {
    res.setHeader('Retry-After', '3');
    res.status(429).json({ error: 'Server at SSE capacity', code: 'SSE_CAPACITY' });
    return;
  }

  // ─ Per-IP SSE connection limit: 동일 IP 대량 연결 방지
  // 인증된 유저(유효 SSE 토큰)는 행사장 NAT에서 IP 한도를 넘겨도 접속 허용.
  // per-user cap + 전역 SSE_MAX_TOTAL 이 서버를 보호한다.
  const sseIp = String(req.ip ?? req.socket.remoteAddress ?? 'unknown');
  const currentConns = _sseConnPerIp.get(sseIp) ?? 0;
  let countedIp = false;
  if (currentConns >= SSE_MAX_CONN_PER_IP) {
    if (!userId) {
      res.setHeader('Retry-After', '5');
      res.status(429).json({ error: 'Too many SSE connections from this IP', code: 'RATE_LIMIT' });
      return;
    }
  } else {
    _sseConnPerIp.set(sseIp, currentConns + 1);
    countedIp = true;
  }
  const _undoSseConnCount = () => {
    if (!countedIp) return;
    countedIp = false;
    const c = _sseConnPerIp.get(sseIp) ?? 1;
    if (c <= 1) _sseConnPerIp.delete(sseIp);
    else _sseConnPerIp.set(sseIp, c - 1);
  };

  // 익명 상한은 헤더 flush 전에 검사해야 429 JSON이 전달됨
  if (!isAdminSse && !userId && sseAnonClients.size >= 100) {
    _undoSseConnCount();
    res.setHeader('Retry-After', '5');
    res.status(429).json({ error: 'Too many anonymous SSE connections', code: 'RATE_LIMIT' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  // CDN/프록시가 gzip으로 묶지 않도록 — SSE 청크 지연 방지
  res.setHeader('Content-Encoding', 'identity');
  res.flushHeaders();
  // Non-private process identifier lets the client detect a cross-instance reconnect.
  // It is deliberately sent before ring replay because event sequence numbers are process-local.
  try {
    res.write(`data: ${JSON.stringify({ type: 'instance', instanceId: INSTANCE_ID })}\n\n`);
  } catch {
    _undoSseConnCount();
    try { res.end(); } catch { /* ignore */ }
    return;
  }

  // ── 소켓 레벨 타임아웃 — 좀비 TCP 연결 방어 ─────────────────────────────────
  // keep-alive ping(15s) 기준으로 여유 있게 설정 (미수신 시 Node가 socket.destroy)
  // 브라우저가 즉시 EventSource.onerror를 받고 재연결을 시작하도록 강제
  // (TCP keep-alive만으로는 프록시/방화벽이 silent-drop 시 수십 분 좀비가 될 수 있음)
  const SOCKET_TIMEOUT_MS = 105_000; // 15s ping × 7
  // Task #153: cleanupConn이 아래에서 선언되므로 forward reference로 호출
  let _cleanupConnRef: () => void = () => {};
  req.socket.setTimeout(SOCKET_TIMEOUT_MS);
  req.socket.once('timeout', () => {
    _cleanupConnRef(); // sseUserMap/카운터/keepalive 정리 — 좀비 엔트리 방지
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
    if (userConns.size >= SSE_MAX_CONN_PER_USER) {
      const oldest = userConns.values().next().value;
      // keepalive interval도 반드시 해제 — 미해제 시 메모리 누수
      _sseCleanup.get(oldest)?.();
      _sseCleanup.delete(oldest);
      try { oldest.end(); } catch { /* ignore */ }
      userConns.delete(oldest);
    }
    userConns.add(res);
  } else {
    logger.debug({ ip: req.ip, anonCount: sseAnonClients.size }, '[sse] 익명 SSE 연결 (userId 없음) — 앱 외부 접근 의심');
    sseAnonClients.add(res);
  }
  recordSseAccepted();

  // ── Last-Event-ID 기반 미수신 이벤트 재전송 ──────────────────────────────────
  // 브라우저 EventSource는 이전 연결에서 수신한 마지막 id 값을 재연결 시
  // Last-Event-ID 헤더로 자동 전송 (RFC 8898 §9.2.4).
  // 서버는 해당 seq 이후의 ring buffer 항목을 필터링해 순서대로 재전송.
  // 클라이언트 측 applySseInsert/applyLoadMessages가 중복을 멱등하게 처리하므로 안전.
  {
    const rawLastId = req.headers['last-event-id']
      ?? (typeof req.query.lastEventId === 'string' ? req.query.lastEventId : null);
    const lastSeq = rawLastId ? parseInt(String(rawLastId), 10) : 0;
    if (lastSeq > 0 && Number.isFinite(lastSeq) && !isNaN(lastSeq)) {
      const missed = _ringGetSince(lastSeq, userId, isAdminSse);
      // 슬립 후 링 전체가 쏟아지면 채팅이 멈춘다. 소량은 재전송, 대량은 HTTP merge-by-id.
      const RING_REPLAY_MAX = 200;
      if (missed.length > RING_REPLAY_MAX) {
        const latest = _sseRingBuffer.length ? _sseRingBuffer[_sseRingBuffer.length - 1].seq : lastSeq;
        try {
          res.write(`id: ${latest}\ndata: ${JSON.stringify({ type: 'catchup', missed: missed.length })}\n\n`);
        } catch { /* ignore */ }
      } else {
        for (const entry of missed) {
          try { res.write(`id: ${entry.seq}\ndata: ${entry.json}\n\n`); } catch { break; }
        }
      }
    }
  }

  // Keep-alive every 15s — 프록시 idle 차단 방지, 5s 대비 서버 부하 감소
  const keepalive = setInterval(() => {
    // res.writable이 false면 이미 닫힌 소켓 — cleanupConn 호출 후 정리
    if (!res.writable || res.writableEnded) { clearInterval(keepalive); cleanupConn(); return; }
    try {
      const flushed = res.write('data: {"type":"ping"}\n\n');
      // write()가 false를 반환하면 TCP 송신 버퍼가 가득 찬 것 (backpressure)
      // 클라이언트가 읽지 못하는 좀비 연결이므로 정리 — sseUserMap에서도 제거
      if (!flushed) { clearInterval(keepalive); cleanupConn(); res.end(); }
    } catch {
      clearInterval(keepalive);
      cleanupConn(); // write 예외 시에도 sseUserMap에서 반드시 제거
    }
  }, 15_000);
  // _sseCleanup에 등록 — _send write 실패 시에도 keepalive 해제 + IP 카운터 감소 보장
  // (cleanupConn에서 _sseConnPerIp 감소를 제거하고 여기서 통합 처리)
  _sseCleanup.set(res, () => { clearInterval(keepalive); _undoSseConnCount(); });

  // _cleaned 플래그로 close·aborted 두 이벤트가 동시에 발생해도 정확히 1회만 실행
  let _cleaned = false;
  const cleanupConn = () => {
    if (_cleaned) return;
    _cleaned = true;
    recordSseClosed();
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
    // Per-IP connection count 해제: _sseCleanup fn으로 통합 — _undoSseConnCount() 중복 호출 방지
  };
  // Task #153: socket timeout forward reference 완성 — timeout 시 cleanupConn 정상 호출
  _cleanupConnRef = cleanupConn;
  req.on('close', cleanupConn);
  req.on('aborted', cleanupConn); // Node.js HTTP/1.1 강제 종료 대비
  req.socket.on('close', cleanupConn); // 프록시가 HTTP close 없이 소켓만 끊는 경우 teardown 지연 방지

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
