import { Router, type Request, type Response } from 'express';
import pg from 'pg';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { VAPID_PUBLIC_KEY, sendPush, type PushPayload } from '../lib/push';

// express-session의 SessionData에 userId 필드 추가
declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

const router = Router();

// ─── PostgreSQL connection pool ────────────────────────────────────────────────
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 50,                  // 100명 동시접속 대비 (기본값 10에서 상향)
  idleTimeoutMillis: 30000, // idle 커넥션 30초 후 해제
  connectionTimeoutMillis: 5000, // 5초 안에 커넥션 못 얻으면 에러
});

// ─── In-memory cache (loaded from DB on startup, write-through on every change)
const store: Record<string, Record<string, unknown>[]> = {};
const imageStore: Record<string, string> = {};

// ─── Concurrency limiter — graceful 503 when too many concurrent /op requests ──
// /op는 in-memory 서빙이지만 Node.js 이벤트 루프 포화 방지용 상한선
let _activeOpCount = 0;
const MAX_CONCURRENT_OPS = 80;

// ─── DB persist error tracking ────────────────────────────────────────────────
let _dbPersistErrors = 0;
interface PersistErrorEntry { table: string; time: number; msg: string }
const _dbPersistErrorLog: PersistErrorEntry[] = [];

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
  // Prune stale entries every 10 s to prevent unbounded memory growth
  const cutoff = Date.now() - 10_000;
  for (const [k, t] of _likesLastInsert) if (t < cutoff) _likesLastInsert.delete(k);
}, 10_000);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function genId(): string {
  return crypto.randomUUID();
}

function ts(): string {
  return new Date().toISOString();
}

function koreanDateMMDD(): string {
  const now = new Date();
  const korea = new Date(now.getTime() + 9 * 60 * 60 * 1000);
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
  try {
    await pool.query(
      `INSERT INTO app_kv_rows (table_name, row_id, data, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (table_name, row_id)
       DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [tableName, rowId, JSON.stringify(row)],
    );
  } catch (e) {
    // Track persist failures for the health monitor
    _dbPersistErrors++;
    _dbPersistErrorLog.push({ table: tableName, time: Date.now(), msg: String(e) });
    if (_dbPersistErrorLog.length > 100) _dbPersistErrorLog.shift();
    throw e;
  }
}

async function dbDeleteRow(tableName: string, rowId: string): Promise<void> {
  await pool.query(
    'DELETE FROM app_kv_rows WHERE table_name = $1 AND row_id = $2',
    [tableName, rowId],
  );
}

async function dbDeleteTable(tableName: string): Promise<void> {
  await pool.query('DELETE FROM app_kv_rows WHERE table_name = $1', [tableName]);
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
    const { rows } = await pool.query('SELECT table_name, data FROM app_kv_rows ORDER BY updated_at ASC');
    for (const row of rows) {
      if (!store[row.table_name]) store[row.table_name] = [];
      store[row.table_name].push(row.data as Record<string, unknown>);
    }
    const imgs = await pool.query('SELECT path, data_url FROM app_image_store');
    for (const img of imgs.rows) {
      imageStore[img.path] = img.data_url;
    }
    console.log('[db] Loaded from PostgreSQL:', Object.entries(store).map(([k, v]) => `${k}(${v.length})`).join(', ') || '(empty)');
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
      console.log(`[db] 번외 테이블 추가: ${extraRows.length}석`);
    }
  }
}

// ─── Daily entry_password auto-renewal ────────────────────────────────────────
// If entry_password is a 4-digit MMDD date string, update it to today's Korean
// date every minute so the code never expires without an admin needing to touch it.
function startDailyEntryPasswordRenewal(): void {
  const check = (): void => {
    const settings = getTable('app_settings')[0];
    if (!settings) return;
    const currentPw = settings['entry_password'] as string | null | undefined;
    if (!currentPw || !/^\d{4}$/.test(currentPw)) return; // not MMDD format — skip
    const today = koreanDateMMDD();
    if (currentPw === today) return; // already up-to-date
    const updated = { ...settings, entry_password: today, updated_at: ts() };
    store['app_settings'][0] = updated;
    dbPersistRow('app_settings', updated).catch(console.error);
    broadcastAll({ type: 'change', table: 'app_settings', event: 'UPDATE', newRow: updated, oldRow: settings });
    console.log(`[db] Auto-renewed entry_password: ${currentPw} → ${today}`);
  };
  setInterval(check, 60_000); // check every minute
}

// Kick off async initialization
seedIfNeeded().then(() => startDailyEntryPasswordRenewal()).catch(console.error);

// ─── SSE broadcast ─────────────────────────────────────────────────────────────
function _send(client: Response, conns: Set<Response>, payload: string) {
  try { client.write(payload); } catch { conns.delete(client); }
  // ✅ Fix #7: 빈 Set은 즉시 삭제해 sseUserMap 키 누수 방지
  if (conns.size === 0) {
    for (const [uid, s] of sseUserMap) { if (s === conns) { sseUserMap.delete(uid); break; } }
  }
}

/** 모든 클라이언트에게 전송 (공개 이벤트: seats, profiles, app_settings, games 등) */
function broadcastAll(event: Record<string, unknown>) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const [, conns] of sseUserMap) for (const c of conns) _send(c, conns, payload);
  for (const c of sseAnonClients) _send(c, sseAnonClients, payload);
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

/** 테이블 종류에 따라 자동으로 수신자 판단 */
function smartBroadcast(table: string, row: Record<string, unknown> | null, event: Record<string, unknown>) {
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
    // 공개 테이블(seats, profiles 등)만 전체 브로드캐스트 허용 — profiles는 민감 필드 제거
    if (table === 'profiles') {
      const safeEvent = {
        ...event,
        newRow: event['newRow'] ? sanitizeProfile(event['newRow'] as Record<string, unknown>) : null,
        oldRow: event['oldRow'] ? sanitizeProfile(event['oldRow'] as Record<string, unknown>) : null,
      };
      broadcastAll(safeEvent);
    } else {
      broadcastAll(event);
    }
  }
  // 프라이빗 테이블인데 수신자를 특정 못한 경우 → 조용히 드롭 (전체 유출 방지)
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
  const expired: string[] = [];

  for (const sub of subs) {
    const ok = await sendPush(
      { endpoint: sub.endpoint as string, keys: { auth: sub.auth as string, p256dh: sub.p256dh as string } },
      payload,
    );
    if (!ok) expired.push(sub.id as string);
  }

  if (expired.length) {
    store['push_subscriptions'] = (store['push_subscriptions'] ?? []).filter(s => !expired.includes(s.id as string));
    for (const id of expired) dbDeleteRow('push_subscriptions', id).catch(console.error);
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
  } = req.body as {
    table: string; op: string;
    filters: FilterSpec[]; orders: { col: string; asc: boolean }[];
    limit?: number; single?: boolean; maybeSingle?: boolean;
    payload?: unknown; conflictCols?: string[]; selectAfterWrite?: boolean;
  };

  if (!store[table]) store[table] = [];
  const tableData = store[table];

  try {
    // ── SELECT ──────────────────────────────────────────────────────────────
    if (op === 'select') {
      let result = applyFilters(tableData, filters);
      for (const { col, asc } of orders) {
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
      for (const row of inputs) {
        if (!row) continue;
        if (table === 'profiles' && tableData.some(r => r.nickname === row.nickname && row.nickname != null)) {
          return res.json({ data: null, error: { message: 'duplicate key value violates unique constraint "profiles_nickname_key"', code: '23505' } });
        }
        // ✅ Fix #3: 서버 레벨 PIN 유일성 보장 — 100명 동시 INSERT 시 충돌 자동 해소
        // const row는 재할당 불가이므로 effectiveRow로 분리
        let effectiveRow: Record<string, unknown> = row;
        if (table === 'profiles' && effectiveRow.pin_code != null) {
          const usedPins = new Set(tableData.map(r => r.pin_code).filter(Boolean));
          if (usedPins.has(effectiveRow.pin_code)) {
            // 충돌 시 서버에서 새 PIN 직접 생성
            let newPin = String(Math.floor(1000 + Math.random() * 9000));
            let tries = 0;
            while (usedPins.has(newPin) && tries++ < 100) {
              newPin = String(Math.floor(1000 + Math.random() * 9000));
            }
            effectiveRow = { ...effectiveRow, pin_code: newPin };
          }
        }
        // chats 테이블: 같은 user1_id+user2_id 조합이 이미 있으면 기존 채팅방 반환 (레이스 컨디션으로 인한 중복 채팅방 생성 방지)
        if (table === 'chats' && effectiveRow.user1_id != null && effectiveRow.user2_id != null) {
          const existing = tableData.find(r =>
            r.user1_id === effectiveRow.user1_id && r.user2_id === effectiveRow.user2_id
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
        smartBroadcast(table, newRow, { type: 'change', table, event: 'INSERT', newRow, oldRow: null });
        dbPersistRow(table, newRow).catch(console.error);
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
      let patch = payload as Record<string, unknown>;
      // profiles 테이블에서 pin_code를 UPDATE할 때 서버 레벨 유일성 보장
      // (레거시 사용자 핀 자동 부여 시 경쟁 조건 방지)
      if (table === 'profiles' && patch.pin_code != null) {
        const usedPins = new Set(tableData.map(r => r.pin_code).filter(Boolean));
        let pin = patch.pin_code as string;
        let tries = 0;
        while (usedPins.has(pin) && tries++ < 100) {
          pin = String(Math.floor(1000 + Math.random() * 9000));
        }
        patch = { ...patch, pin_code: pin };
      }
      const updated: Record<string, unknown>[] = [];
      for (let i = 0; i < tableData.length; i++) {
        if (applyFilters([tableData[i]], filters).length) {
          const oldRow = { ...tableData[i] };
          const newRow = { ...oldRow, ...patch };
          tableData[i] = newRow;
          updated.push(newRow);
          smartBroadcast(table, newRow, { type: 'change', table, event: 'UPDATE', newRow, oldRow });
          dbPersistRow(table, newRow).catch(console.error);
        }
      }
      if (selectAfterWrite) return res.json({ data: single ? updated[0] ?? null : updated, error: null });
      return res.json({ data: null, error: null });
    }

    // ── UPSERT ──────────────────────────────────────────────────────────────
    if (op === 'upsert') {
      const inputs = Array.isArray(payload) ? payload as Record<string, unknown>[] : [payload as Record<string, unknown>];
      const upserted: Record<string, unknown>[] = [];
      for (const row of inputs) {
        let idx = -1;
        if (conflictCols.length) {
          idx = tableData.findIndex(r => conflictCols.every(c => String(r[c]) === String(row[c]) || r[c] === row[c]));
        } else if (row.id != null) {
          idx = tableData.findIndex(r => r.id === row.id);
        }
        if (idx >= 0) {
          const oldRow = { ...tableData[idx] };
          const newRow = { ...oldRow, ...row };
          tableData[idx] = newRow;
          upserted.push(newRow);
          smartBroadcast(table, newRow, { type: 'change', table, event: 'UPDATE', newRow, oldRow });
          dbPersistRow(table, newRow).catch(console.error);
        } else {
          const base: Record<string, unknown> = { id: genId(), created_at: ts(), ...row };
          if (table === 'profiles' && base.birth_month == null) {
            base.birth_month = Math.ceil(Math.random() * 12);
            base.birth_day = Math.ceil(Math.random() * 28);
          }
          tableData.push(base);
          upserted.push(base);
          smartBroadcast(table, base, { type: 'change', table, event: 'INSERT', newRow: base, oldRow: null });
          dbPersistRow(table, base).catch(console.error);
        }
      }
      if (selectAfterWrite) return res.json({ data: upserted, error: null });
      return res.json({ data: null, error: null });
    }

    // ── DELETE ──────────────────────────────────────────────────────────────
    if (op === 'delete') {
      const toDelete = applyFilters(tableData, filters);
      store[table] = tableData.filter(r => !applyFilters([r], filters).length);
      for (const row of toDelete) {
        smartBroadcast(table, row, { type: 'change', table, event: 'DELETE', newRow: null, oldRow: row });
        dbDeleteRow(table, String(row.id)).catch(console.error);
      }
      return res.json({ data: null, error: null });
    }

    return res.json({ data: null, error: { message: 'Unknown operation' } });
  } catch (e) {
    console.error('[db/op]', e);
    return res.json({ data: null, error: { message: String(e) } });
  } finally {
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
    if (adminPw && provided !== adminPw) throw new Error('비밀번호가 일치하지 않습니다.');
  }

  try {
    switch (name) {
      case 'admin_create_session': {
        // 관리자 비밀번호가 설정돼 있으면 반드시 검증 — 비밀번호 없이 세션 생성 방지
        checkPassword();
        return res.json({ data: 'local-' + genId(), error: null });
      }

      case 'admin_invalidate_session':
        return res.json({ data: null, error: null });

      case 'admin_auth_phone':
        return res.json({ data: null, error: null });

      case 'admin_reset_all_seats':
      case 'admin_full_reset': {
        checkPassword();
        const seats = getTable('seats').map(s => ({ ...s, profile_id: null, status: 'empty', registered_at: null }));
        store['seats'] = seats;
        for (const s of seats) {
          broadcastAll({ type: 'change', table: 'seats', event: 'UPDATE', newRow: s, oldRow: null });
          dbPersistRow('seats', s).catch(console.error);
        }
        return res.json({ data: null, error: null });
      }

      case 'admin_event_end_reset': {
        checkPassword();
        const seats = getTable('seats').map(s => ({ ...s, profile_id: null, status: 'empty', registered_at: null }));
        store['seats'] = seats;
        for (const s of seats) {
          broadcastAll({ type: 'change', table: 'seats', event: 'UPDATE', newRow: s, oldRow: null });
          dbPersistRow('seats', s).catch(console.error);
        }
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
          const newRow = { ...oldRow, ...patch };
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
  const { channel, event, payload } = req.body as { channel: string; event: string; payload: unknown };
  broadcastAll({ type: 'broadcast', channel, event, payload });
  res.json({ ok: true });
});

// ─── Image storage ────────────────────────────────────────────────────────────
router.post('/storage-upload', async (req: Request, res: Response) => {
  const { path, dataUrl } = req.body as { path: string; dataUrl: string };
  imageStore[path] = dataUrl;
  dbPersistImage(path, dataUrl).catch(console.error);
  res.json({ data: { path }, error: null });
});

router.get('/storage-image', (req: Request, res: Response): void => {
  const path = req.query.p as string;
  const dataUrl = path ? imageStore[path] : undefined;
  if (!dataUrl) { res.status(404).json({ error: 'Not found' }); return; }
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    const [, mime, b64] = match;
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(b64, 'base64'));
    return;
  }
  res.send(dataUrl);
});

// ─── DB Health endpoint ───────────────────────────────────────────────────────
router.get('/health', async (_req: Request, res: Response) => {
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
  const alarms: string[] = [];
  if (recentPersistErrors > 0) alarms.push(`${recentPersistErrors} DB persist error(s) in last 5 min`);
  if (messageLag !== null && messageLag > LOSS_ALARM_THRESHOLD) alarms.push(`message lag: inMem=${inMemMessages} db=${dbMessages} (>${LOSS_ALARM_THRESHOLD})`);
  if (likeLag    !== null && likeLag    > LOSS_ALARM_THRESHOLD) alarms.push(`like lag: inMem=${inMemLikes} db=${dbLikes} (>${LOSS_ALARM_THRESHOLD})`);

  return res.json({
    persistErrors: _dbPersistErrors,
    recentErrors: _dbPersistErrorLog.slice(-10),
    inMemory: { messages: inMemMessages, likes: inMemLikes },
    db: { messages: dbMessages, likes: dbLikes },
    lag: { messages: messageLag, likes: likeLag },
    alarms,                          // non-empty = action required
    ok: alarms.length === 0,         // quick pass/fail for monitoring
    sseConnections: sseTotal,
    thresholds: { lossAlarm: LOSS_ALARM_THRESHOLD, likesMinIntervalMs: LIKES_MIN_INTERVAL_MS },
    checkedAt: new Date().toISOString(),
  });
});

// ─── Unread counts endpoint ───────────────────────────────────────────────────
// Returns per-chat unread message counts for a user, computed from DB truth.
// Used by client on visibilitychange and SSE reconnect to fix missed increments.
router.get('/unread-counts', (req: Request, res: Response) => {
  const userId = typeof req.query.userId === 'string' && req.query.userId ? req.query.userId : null;
  if (!userId) return res.status(400).json({ data: null, error: { message: 'userId required' } });

  const chats = getTable('chats').filter(c => c.user1_id === userId || c.user2_id === userId);

  // Build a map of chatId → read_at for this user
  const readAtByChat = new Map<string, string>();
  for (const r of getTable('chat_reads')) {
    if (r.reader_id === userId && r.chat_id && r.read_at) {
      readAtByChat.set(r.chat_id as string, r.read_at as string);
    }
  }

  const counts: Record<string, number> = {};
  for (const chat of chats) {
    const chatId = chat.id as string;
    const readAt = readAtByChat.get(chatId);
    const unread = getTable('messages').filter(m => {
      if (m.chat_id !== chatId) return false;
      if (m.sender_id === userId) return false; // own messages never unread
      if (!readAt) return true; // never read this chat — all messages unread
      return (m.created_at as string) > readAt;
    });
    if (unread.length > 0) counts[chatId] = unread.length;
  }

  return res.json({ data: counts, error: null });
});

// ─── PIN lookup ───────────────────────────────────────────────────────────────
router.post('/by-pin', (req: Request, res: Response) => {
  const { pin } = req.body as { pin?: string };
  if (!pin) return res.status(400).json({ data: null, error: { message: 'PIN required' } });
  const profiles = getTable('profiles');
  const found = profiles.find(p => String(p['pin_code']) === String(pin));
  if (found) return res.json({ data: found, error: null });
  return res.json({ data: null, error: { message: '핀 번호를 찾을 수 없습니다' } });
});

// ─── Push subscription endpoints ─────────────────────────────────────────────
router.get('/push/vapid-key', (_req: Request, res: Response) => {
  res.json({ key: VAPID_PUBLIC_KEY });
});

router.post('/push/subscribe', (req: Request, res: Response) => {
  const { userId, subscription } = req.body as {
    userId?: string;
    subscription?: { endpoint?: string; keys?: { auth?: string; p256dh?: string } };
  };
  if (!userId || !subscription?.endpoint || !subscription?.keys?.auth || !subscription?.keys?.p256dh) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  const subs = getTable('push_subscriptions');
  const idx = subs.findIndex(s => s.user_id === userId && s.endpoint === subscription.endpoint);
  if (idx >= 0) {
    const updated = { ...subs[idx], auth: subscription.keys!.auth, p256dh: subscription.keys!.p256dh, updated_at: ts() };
    subs[idx] = updated;
    dbPersistRow('push_subscriptions', updated).catch(console.error);
  } else {
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
});

// ─── Push notify endpoint (서버 내부 또는 인증된 호출만 허용) ────────────────
const PUSH_NOTIFY_SECRET = process.env.SESSION_SECRET ?? 'internal';
router.post('/push/notify', async (req: Request, res: Response) => {
  // 클라이언트 직접 호출 남용 방지 — X-Internal-Secret 헤더 필요
  const secret = req.headers['x-internal-secret'];
  if (secret !== PUSH_NOTIFY_SECRET) return res.status(403).json({ error: 'Forbidden' });
  const { recipientId, title, body, tag, url } = req.body as {
    recipientId?: string; title?: string; body?: string; tag?: string; url?: string;
  };
  if (!recipientId) return res.status(400).json({ error: 'Missing recipientId' });

  const subs = getTable('push_subscriptions').filter(s => s.user_id === recipientId);
  if (!subs.length) return res.json({ ok: true, sent: 0 });

  const payload: PushPayload = {
    title: String(title || '범일NPC 술번개'),
    body:  String(body  || ''),
    tag:   String(tag   || 'notification'),
    url:   String(url   || '/'),
  };

  const expired: string[] = [];
  for (const sub of subs) {
    const ok = await sendPush(
      { endpoint: sub.endpoint as string, keys: { auth: sub.auth as string, p256dh: sub.p256dh as string } },
      payload,
    );
    if (!ok) expired.push(sub.id as string);
  }
  if (expired.length) {
    store['push_subscriptions'] = (store['push_subscriptions'] ?? []).filter(s => !expired.includes(s.id as string));
    for (const id of expired) dbDeleteRow('push_subscriptions', id).catch(console.error);
  }
  return res.json({ ok: true, sent: subs.length - expired.length });
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
    // 기기 secret이 미등록된 계정 — 프로필 생성 시 _device_secret을 포함하지 않은 경우
    // (시스템 도입 이전 기존 사용자). 무단 선점을 방지하기 위해 자동 first-claim을 허용하지 않습니다.
    // 마이그레이션은 계정 소유자가 재가입하거나 관리자가 바인딩을 생성해야 합니다.
    return res.status(401).json({ error: 'device_not_bound', code: 'NEEDS_MIGRATION' });
  }
  // 재인증: 타이밍 안전 비교
  try {
    const match = timingSafeEqual(
      Buffer.from(submittedHash, 'hex'),
      Buffer.from(existing.secret_hash as string, 'hex'),
    );
    if (!match) return res.status(401).json({ error: 'Invalid deviceSecret' });
  } catch {
    return res.status(401).json({ error: 'Invalid deviceSecret' });
  }
  req.session.userId = userId;
  return res.json({ ok: true });
});

// POST /auth/sse-token — 세션으로 인증된 userId에만 단기 SSE 토큰 발급
// 세션이 없거나 userId가 일치하지 않으면 401 반환
router.post('/auth/sse-token', (req: Request, res: Response) => {
  const sessionUserId = req.session?.userId;
  if (!sessionUserId) {
    return res.status(401).json({ error: 'Not authenticated — call /auth/login first' });
  }
  const { token, expiresAt } = issueSseToken(sessionUserId);
  return res.json({ token, expiresAt });
});

// ─── SSE endpoint ─────────────────────────────────────────────────────────────
router.get('/events', (req: Request, res: Response) => {
  const userId = typeof req.query.userId === 'string' && req.query.userId ? req.query.userId : null;
  const token = typeof req.query.token === 'string' ? req.query.token : null;

  // userId가 있으면 반드시 유효한 토큰 필요 — 없거나 만료/위조된 경우 거부
  if (userId && (!token || !verifySseToken(userId, token))) {
    res.status(401).json({ error: 'Invalid or missing SSE token' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Initial ping so the client knows it's connected
  res.write('data: {"type":"ping"}\n\n');

  if (userId) {
    if (!sseUserMap.has(userId)) sseUserMap.set(userId, new Set());
    const userConns = sseUserMap.get(userId)!;
    // 탭 과다 방지: 사용자당 최대 4개 연결. 초과 시 가장 오래된 연결 종료
    if (userConns.size >= 4) {
      const oldest = userConns.values().next().value;
      try { oldest.end(); } catch { /* ignore */ }
      userConns.delete(oldest);
    }
    userConns.add(res);
  } else {
    sseAnonClients.add(res);
  }

  // Keep-alive every 5s — 짧게 유지해 프록시/방화벽 idle 차단 방지
  const keepalive = setInterval(() => {
    try { res.write('data: {"type":"ping"}\n\n'); } catch { clearInterval(keepalive); }
  }, 5000);

  req.on('close', () => {
    clearInterval(keepalive);
    if (userId) {
      const conns = sseUserMap.get(userId);
      if (conns) {
        conns.delete(res);
        if (conns.size === 0) sseUserMap.delete(userId);
      }
    } else {
      sseAnonClients.delete(res);
    }
  });
});

export default router;
