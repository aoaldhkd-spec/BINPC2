import { Router, type Request, type Response } from 'express';
import pg from 'pg';
import { VAPID_PUBLIC_KEY, sendPush, type PushPayload } from '../lib/push';

const router = Router();

// ─── PostgreSQL connection pool ────────────────────────────────────────────────
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// ─── In-memory cache (loaded from DB on startup, write-through on every change)
const store: Record<string, Record<string, unknown>[]> = {};
const imageStore: Record<string, string> = {};

// SSE clients for real-time push
const sseClients = new Set<Response>();

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
  await pool.query(
    `INSERT INTO app_kv_rows (table_name, row_id, data, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (table_name, row_id)
     DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    [tableName, rowId, JSON.stringify(row)],
  );
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
    store['seats'] = rows;
    await Promise.all(rows.map(r => dbPersistRow('seats', r)));
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
    broadcast({ type: 'change', table: 'app_settings', event: 'UPDATE', newRow: updated, oldRow: settings });
    console.log(`[db] Auto-renewed entry_password: ${currentPw} → ${today}`);
  };
  setInterval(check, 60_000); // check every minute
}

// Kick off async initialization
seedIfNeeded().then(() => startDailyEntryPasswordRenewal()).catch(console.error);

// ─── SSE broadcast ─────────────────────────────────────────────────────────────
function broadcast(event: Record<string, unknown>) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    try { client.write(payload); } catch { sseClients.delete(client); }
  }
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
        // chats 테이블: 같은 user1_id+user2_id 조합이 이미 있으면 기존 채팅방 반환 (레이스 컨디션으로 인한 중복 채팅방 생성 방지)
        if (table === 'chats' && row.user1_id != null && row.user2_id != null) {
          const existing = tableData.find(r =>
            r.user1_id === row.user1_id && r.user2_id === row.user2_id
          );
          if (existing) {
            if (selectAfterWrite) return res.json({ data: single ? existing : [existing], error: null });
            return res.json({ data: null, error: null });
          }
        }
        // likes 테이블: 동일 liker+liked+heart_type 중복 방지 (빠른 연속 클릭으로 인한 중복 하트 삽입 방지)
        if (table === 'likes' && row.liker_id != null && row.liked_id != null && row.heart_type != null) {
          const dupLike = tableData.find(r =>
            r.liker_id === row.liker_id && r.liked_id === row.liked_id && r.heart_type === row.heart_type
          );
          if (dupLike) return res.json({ data: null, error: null }); // 무음 중복 차단
        }
        const newRow: Record<string, unknown> = { id: genId(), created_at: ts(), ...row };
        if (table === 'session_history' && !newRow.ended_at) newRow.ended_at = ts();
        tableData.push(newRow);
        inserted.push(newRow);
        broadcast({ type: 'change', table, event: 'INSERT', newRow, oldRow: null });
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
      const patch = payload as Record<string, unknown>;
      const updated: Record<string, unknown>[] = [];
      for (let i = 0; i < tableData.length; i++) {
        if (applyFilters([tableData[i]], filters).length) {
          const oldRow = { ...tableData[i] };
          const newRow = { ...oldRow, ...patch };
          tableData[i] = newRow;
          updated.push(newRow);
          broadcast({ type: 'change', table, event: 'UPDATE', newRow, oldRow });
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
          broadcast({ type: 'change', table, event: 'UPDATE', newRow, oldRow });
          dbPersistRow(table, newRow).catch(console.error);
        } else {
          const base: Record<string, unknown> = { id: genId(), created_at: ts(), ...row };
          if (table === 'profiles' && base.birth_month == null) {
            base.birth_month = Math.ceil(Math.random() * 12);
            base.birth_day = Math.ceil(Math.random() * 28);
          }
          tableData.push(base);
          upserted.push(base);
          broadcast({ type: 'change', table, event: 'INSERT', newRow: base, oldRow: null });
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
        broadcast({ type: 'change', table, event: 'DELETE', newRow: null, oldRow: row });
        dbDeleteRow(table, String(row.id)).catch(console.error);
      }
      return res.json({ data: null, error: null });
    }

    return res.json({ data: null, error: { message: 'Unknown operation' } });
  } catch (e) {
    console.error('[db/op]', e);
    return res.json({ data: null, error: { message: String(e) } });
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
      case 'admin_create_session':
        return res.json({ data: 'local-' + genId(), error: null });

      case 'admin_invalidate_session':
      case 'admin_auth_phone':
        return res.json({ data: null, error: null });

      case 'admin_reset_all_seats':
      case 'admin_full_reset': {
        checkPassword();
        const seats = getTable('seats').map(s => ({ ...s, profile_id: null, status: 'empty', registered_at: null }));
        store['seats'] = seats;
        for (const s of seats) {
          broadcast({ type: 'change', table: 'seats', event: 'UPDATE', newRow: s, oldRow: null });
          dbPersistRow('seats', s).catch(console.error);
        }
        return res.json({ data: null, error: null });
      }

      case 'admin_event_end_reset': {
        checkPassword();
        const seats = getTable('seats').map(s => ({ ...s, profile_id: null, status: 'empty', registered_at: null }));
        store['seats'] = seats;
        for (const s of seats) {
          broadcast({ type: 'change', table: 'seats', event: 'UPDATE', newRow: s, oldRow: null });
          dbPersistRow('seats', s).catch(console.error);
        }
        const tablesToClear = [
          'profiles', 'likes', 'anonymous_reports', 'chats', 'messages',
          'contact_shares', 'contact_share_events', 'balance_votes', 'balance_games',
          'qa_answers', 'qa_games', 'image_votes', 'image_games', 'notifications', 'suggestions',
        ];
        for (const t of tablesToClear) {
          const old = store[t] ?? [];
          store[t] = [];
          for (const row of old) broadcast({ type: 'change', table: t, event: 'DELETE', newRow: null, oldRow: row });
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
          broadcast({ type: 'change', table: 'seats', event: 'UPDATE', newRow, oldRow });
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
          broadcast({ type: 'change', table: 'seats', event: 'UPDATE', newRow: cleared, oldRow });
          dbPersistRow('seats', cleared).catch(console.error);
        }
        const tgtIdx = seats.findIndex(s => s.id === seatId);
        if (tgtIdx >= 0) {
          const oldRow = { ...seats[tgtIdx] };
          if (oldRow.profile_id && oldRow.profile_id !== profileId) {
            const bumped = { ...oldRow, profile_id: null, status: 'empty', registered_at: null };
            seats[tgtIdx] = bumped;
            broadcast({ type: 'change', table: 'seats', event: 'UPDATE', newRow: bumped, oldRow });
            dbPersistRow('seats', bumped).catch(console.error);
          }
          const newRow = { ...seats[tgtIdx], profile_id: profileId, status: 'occupied', registered_at: ts() };
          seats[tgtIdx] = newRow;
          broadcast({ type: 'change', table: 'seats', event: 'UPDATE', newRow, oldRow });
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
          broadcast({ type: 'change', table: 'seats', event: 'UPDATE', newRow, oldRow });
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
        broadcast({ type: 'change', table: 'seats', event: 'UPDATE', newRow: aNew, oldRow: aOld });
        broadcast({ type: 'change', table: 'seats', event: 'UPDATE', newRow: bNew, oldRow: bOld });
        dbPersistRow('seats', aNew).catch(console.error);
        dbPersistRow('seats', bNew).catch(console.error);
        return res.json({ data: null, error: null });
      }

      case 'admin_update_profile': {
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
          broadcast({ type: 'change', table: 'profiles', event: 'UPDATE', newRow, oldRow });
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
          broadcast({ type: 'change', table: 'seats', event: 'UPDATE', newRow, oldRow });
          dbPersistRow('seats', newRow).catch(console.error);
        }
        const profiles = getTable('profiles');
        const oldProfile = profiles.find(p => p.id === profileId);
        store['profiles'] = profiles.filter(p => p.id !== profileId);
        if (oldProfile) {
          broadcast({ type: 'change', table: 'profiles', event: 'DELETE', newRow: null, oldRow: oldProfile });
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
router.post('/broadcast', (req: Request, res: Response) => {
  const { channel, event, payload } = req.body as { channel: string; event: string; payload: unknown };
  broadcast({ type: 'broadcast', channel, event, payload });
  res.json({ ok: true });
});

// ─── Image storage ────────────────────────────────────────────────────────────
router.post('/storage-upload', async (req: Request, res: Response) => {
  const { path, dataUrl } = req.body as { path: string; dataUrl: string };
  imageStore[path] = dataUrl;
  dbPersistImage(path, dataUrl).catch(console.error);
  res.json({ data: { path }, error: null });
});

router.get('/storage-image', (req: Request, res: Response) => {
  const path = req.query.p as string;
  const dataUrl = path ? imageStore[path] : undefined;
  if (!dataUrl) return res.status(404).json({ error: 'Not found' });
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    const [, mime, b64] = match;
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(Buffer.from(b64, 'base64'));
  }
  res.send(dataUrl);
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

// ─── Push notify endpoint (클라이언트가 발송 후 호출) ────────────────────────
router.post('/push/notify', async (req: Request, res: Response) => {
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

// ─── SSE endpoint ─────────────────────────────────────────────────────────────
router.get('/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Initial ping so the client knows it's connected
  res.write('data: {"type":"ping"}\n\n');

  sseClients.add(res);

  // Keep-alive every 20s
  const keepalive = setInterval(() => {
    try { res.write('data: {"type":"ping"}\n\n'); } catch { clearInterval(keepalive); }
  }, 20000);

  req.on('close', () => {
    clearInterval(keepalive);
    sseClients.delete(res);
  });
});

export default router;
