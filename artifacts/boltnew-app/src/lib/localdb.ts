/**
 * localdb.ts — Local in-memory + localStorage mock of the Supabase JS client.
 *
 * Replaces the real Supabase client entirely. No network calls are made.
 * Cross-tab realtime is handled via BroadcastChannel.
 * All table data is persisted in localStorage under the `ldb_<table>` key.
 */

import type { Database } from '../types/database';

// ─── Constants ────────────────────────────────────────────────────────────────
const STORE_PREFIX = 'ldb_';
const BC_CHANNEL_NAME = 'localdb-bc';

// ─── Core storage helpers ─────────────────────────────────────────────────────
function readTable(name: string): Record<string, unknown>[] {
  try {
    const raw = localStorage.getItem(STORE_PREFIX + name);
    return raw ? (JSON.parse(raw) as Record<string, unknown>[]) : [];
  } catch {
    return [];
  }
}

function writeTable(name: string, rows: Record<string, unknown>[]): void {
  try {
    localStorage.setItem(STORE_PREFIX + name, JSON.stringify(rows));
  } catch (e) {
    console.warn('[localdb] localStorage write failed:', e);
  }
}

function genId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
}

function ts(): string {
  return new Date().toISOString();
}

// ─── Seed initial data ────────────────────────────────────────────────────────
const DEFAULT_ADMIN_PHONE = '010-3878-6740';
const DEFAULT_ADMIN_PASSWORD = '116606';

function seedIfNeeded(): void {
  // app_settings singleton
  if (!readTable('app_settings').length) {
    writeTable('app_settings', [
      {
        id: 1,
        session_active: false,
        admin_phone: DEFAULT_ADMIN_PHONE,
        admin_password: DEFAULT_ADMIN_PASSWORD,
        updated_at: ts(),
        timer_end_at: null,
        timer_label: null,
        seating_locked: false,
        active_tables: null,
        reset_signal: null,
        table_labels: null,
        game_state: null,
      },
    ]);
  }

  // seats: 12 tables × 8 seats = 96 total
  if (!readTable('seats').length) {
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
    writeTable('seats', rows);
  }
}

seedIfNeeded();

// One-time migration: overwrite phone/password to the current defaults
// regardless of what was previously stored.
(function migrateAdminCredentials() {
  const rows = readTable('app_settings');
  if (rows.length > 0) {
    const updated = rows.map((r) =>
      r.id === 1
        ? { ...r, admin_phone: DEFAULT_ADMIN_PHONE, admin_password: DEFAULT_ADMIN_PASSWORD }
        : r,
    );
    writeTable('app_settings', updated);
  }
})();

// ─── Change event types ───────────────────────────────────────────────────────
interface ChangeEvent {
  type: 'change';
  table: string;
  event: 'INSERT' | 'UPDATE' | 'DELETE';
  newRow: Record<string, unknown> | null;
  oldRow: Record<string, unknown> | null;
}

// ─── In-process emitter (same-tab realtime) ───────────────────────────────────
const localEmitter = {
  handlers: new Set<(e: ChangeEvent) => void>(),
  on(fn: (e: ChangeEvent) => void) {
    this.handlers.add(fn);
  },
  off(fn: (e: ChangeEvent) => void) {
    this.handlers.delete(fn);
  },
  emit(event: ChangeEvent) {
    this.handlers.forEach((fn) => {
      try {
        fn(event);
      } catch (err) {
        console.error('[localdb] emitter handler error:', err);
      }
    });
  },
};

// ─── BroadcastChannel (cross-tab realtime) ────────────────────────────────────
let bc: BroadcastChannel | null = null;
try {
  bc = new BroadcastChannel(BC_CHANNEL_NAME);
  bc.onmessage = (e: MessageEvent) => {
    const msg = e.data as ChangeEvent;
    if (msg?.type === 'change') {
      localEmitter.emit(msg);
    }
  };
} catch {
  // BroadcastChannel not available
}

function emitChange(event: ChangeEvent): void {
  // Emit locally first
  localEmitter.emit(event);
  // Then broadcast to other tabs
  try {
    bc?.postMessage(event);
  } catch {
    // ignore
  }
}

// ─── Filter system ────────────────────────────────────────────────────────────
type FilterFn = (row: Record<string, unknown>) => boolean;

function makeEqFilter(col: string, val: unknown): FilterFn {
  return (r) => r[col] === val || String(r[col]) === String(val);
}

function makeNeqFilter(col: string, val: unknown): FilterFn {
  return (r) => r[col] !== val && String(r[col]) !== String(val);
}

function makeInFilter(col: string, vals: unknown[]): FilterFn {
  return (r) => vals.some((v) => r[col] === v || String(r[col]) === String(v));
}

function applyFilters(
  rows: Record<string, unknown>[],
  filters: FilterFn[],
): Record<string, unknown>[] {
  if (!filters.length) return rows;
  return rows.filter((r) => filters.every((fn) => fn(r)));
}

// ─── Realtime channel ─────────────────────────────────────────────────────────
interface SubConfig {
  event: '*' | 'INSERT' | 'UPDATE' | 'DELETE';
  schema: string;
  table: string;
  filter?: string;
  callback: (payload: {
    new: Record<string, unknown> | object;
    old: Record<string, unknown> | object;
  }) => void;
}

function matchChannelFilter(
  filterExpr: string | undefined,
  row: Record<string, unknown> | null,
): boolean {
  if (!filterExpr || !row) return true;
  // Parses: "col=eq.value" — value may contain UUIDs with hyphens
  const m = filterExpr.match(/^(\w+)=eq\.(.+)$/);
  if (m) {
    const [, col, val] = m;
    return String(row[col]) === val;
  }
  return true;
}

class LocalRealtimeChannel {
  public readonly name: string;
  private subs: SubConfig[] = [];
  private statusCb: ((s: string) => void) | null = null;
  private localHandler: ((e: ChangeEvent) => void) | null = null;

  constructor(name: string) {
    this.name = name;
  }

  on(
    _type: 'postgres_changes',
    config: {
      event: '*' | 'INSERT' | 'UPDATE' | 'DELETE';
      schema: string;
      table: string;
      filter?: string;
    },
    callback: (payload: {
      new: Record<string, unknown> | object;
      old: Record<string, unknown> | object;
    }) => void,
  ): this {
    this.subs.push({ ...config, callback });
    return this;
  }

  subscribe(statusCallback?: (status: string) => void): this {
    if (statusCallback) this.statusCb = statusCallback;
    const handler = (event: ChangeEvent) => {
      this.dispatch(event);
    };
    this.localHandler = handler;
    localEmitter.on(handler);
    // Simulate async SUBSCRIBED
    setTimeout(() => this.statusCb?.('SUBSCRIBED'), 50);
    return this;
  }

  dispatch(event: ChangeEvent): void {
    for (const sub of this.subs) {
      if (sub.table !== event.table) continue;
      if (sub.event !== '*' && sub.event !== event.event) continue;
      const relevantRow = event.newRow ?? event.oldRow;
      if (!matchChannelFilter(sub.filter, relevantRow)) continue;
      try {
        sub.callback({
          new: event.newRow ?? {},
          old: event.oldRow ?? {},
        });
      } catch (err) {
        console.error('[localdb] realtime callback error:', err);
      }
    }
  }

  unsubscribe(): void {
    if (this.localHandler) {
      localEmitter.off(this.localHandler);
      this.localHandler = null;
    }
    this.statusCb?.('CLOSED');
  }
}

// ─── Query Builder ────────────────────────────────────────────────────────────
type DbResult<T> = { data: T | null; error: { message: string; code?: string } | null };

class QueryBuilder {
  private _table: string;
  private _op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private _filters: FilterFn[] = [];
  private _orders: { col: string; asc: boolean }[] = [];
  private _lim: number | null = null;
  private _single = false;
  private _maybeSingle = false;
  private _selectAfterWrite = false;
  private _payload: Record<string, unknown> | Record<string, unknown>[] | null = null;
  private _conflictCols: string[] = [];

  constructor(table: string) {
    this._table = table;
  }

  // ── Select ──────────────────────────────────────────────────────────────────
  select(_cols?: string): this {
    if (this._op === 'insert' || this._op === 'update' || this._op === 'upsert') {
      this._selectAfterWrite = true;
    } else {
      this._op = 'select';
    }
    return this;
  }

  // ── Write operations ────────────────────────────────────────────────────────
  insert(
    rows:
      | Record<string, unknown>
      | Record<string, unknown>[],
  ): this {
    this._op = 'insert';
    this._payload = rows;
    return this;
  }

  update(patch: Record<string, unknown>): this {
    this._op = 'update';
    this._payload = patch;
    return this;
  }

  upsert(
    rows:
      | Record<string, unknown>
      | Record<string, unknown>[],
    opts?: { onConflict?: string },
  ): this {
    this._op = 'upsert';
    this._payload = rows;
    if (opts?.onConflict) {
      this._conflictCols = opts.onConflict.split(',').map((s) => s.trim());
    }
    return this;
  }

  delete(): this {
    this._op = 'delete';
    return this;
  }

  // ── Filters ─────────────────────────────────────────────────────────────────
  eq(col: string, val: unknown): this {
    this._filters.push(makeEqFilter(col, val));
    return this;
  }

  neq(col: string, val: unknown): this {
    this._filters.push(makeNeqFilter(col, val));
    return this;
  }

  in(col: string, vals: unknown[]): this {
    if (!vals || vals.length === 0) {
      this._filters.push(() => false);
    } else {
      this._filters.push(makeInFilter(col, vals));
    }
    return this;
  }

  or(expr: string): this {
    // e.g. "user1_id.eq.UUID,user2_id.eq.UUID"
    const parts = expr.split(',').map((s) => s.trim());
    const subFilters: FilterFn[] = parts.map((part) => {
      const m = part.match(/^(\w+)\.(\w+)\.(.+)$/);
      if (!m) return () => false;
      const [, col, op, val] = m;
      if (op === 'eq') return makeEqFilter(col, val);
      if (op === 'neq') return makeNeqFilter(col, val);
      return () => true;
    });
    this._filters.push((r) => subFilters.some((fn) => fn(r)));
    return this;
  }

  // ── Ordering / Limiting ──────────────────────────────────────────────────────
  order(col: string, opts?: { ascending?: boolean }): this {
    this._orders.push({ col, asc: opts?.ascending !== false });
    return this;
  }

  limit(n: number): this {
    this._lim = n;
    return this;
  }

  // ── Terminal selectors ───────────────────────────────────────────────────────
  single(): this {
    this._single = true;
    return this;
  }

  maybeSingle(): this {
    this._maybeSingle = true;
    return this;
  }

  // ── Promise interface ────────────────────────────────────────────────────────
  then<T>(
    resolve: (value: DbResult<T>) => void,
    reject?: (reason?: unknown) => void,
  ): void {
    let result: DbResult<unknown>;
    try {
      result = this._run();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result = { data: null, error: { message: msg } };
    }
    try {
      resolve(result as DbResult<T>);
    } catch (err) {
      reject?.(err);
    }
  }

  // ── Core execution ───────────────────────────────────────────────────────────
  private _run(): DbResult<unknown> {
    const table = this._table;

    if (this._op === 'select') {
      const rows = readTable(table);
      let result = applyFilters(rows, this._filters);
      for (const { col, asc } of this._orders) {
        result.sort((a, b) => {
          const av = a[col];
          const bv = b[col];
          if (av === bv) return 0;
          if (av == null) return asc ? -1 : 1;
          if (bv == null) return asc ? 1 : -1;
          const cmp = av < bv ? -1 : 1;
          return asc ? cmp : -cmp;
        });
      }
      if (this._lim !== null) result = result.slice(0, this._lim);
      if (this._single) {
        if (!result.length)
          return { data: null, error: { message: 'Row not found', code: 'PGRST116' } };
        return { data: result[0], error: null };
      }
      if (this._maybeSingle) {
        return { data: result[0] ?? null, error: null };
      }
      return { data: result, error: null };
    }

    if (this._op === 'insert') {
      const inputs = Array.isArray(this._payload)
        ? this._payload
        : [this._payload as Record<string, unknown>];
      const existing = readTable(table);
      const inserted: Record<string, unknown>[] = [];

      for (const row of inputs) {
        // Unique constraint: nickname in profiles
        if (
          table === 'profiles' &&
          existing.some(
            (r) => r.nickname === row.nickname && row.nickname != null,
          )
        ) {
          return {
            data: null,
            error: {
              message: 'duplicate key value violates unique constraint "profiles_nickname_key"',
              code: '23505',
            },
          };
        }
        const newRow: Record<string, unknown> = {
          id: genId(),
          created_at: ts(),
          ...row,
        };
        // session_history uses ended_at as timestamp field
        if (table === 'session_history' && !newRow.ended_at) {
          newRow.ended_at = ts();
        }
        existing.push(newRow);
        inserted.push(newRow);
        emitChange({ type: 'change', table, event: 'INSERT', newRow, oldRow: null });
      }

      writeTable(table, existing);

      if (this._selectAfterWrite) {
        if (this._single) return { data: inserted[0] ?? null, error: null };
        return { data: inserted, error: null };
      }
      return { data: null, error: null };
    }

    if (this._op === 'update') {
      const patch = this._payload as Record<string, unknown>;
      const rows = readTable(table);
      const updated: Record<string, unknown>[] = [];
      const newRows = rows.map((r) => {
        if (applyFilters([r], this._filters).length) {
          const newRow = { ...r, ...patch };
          updated.push(newRow);
          emitChange({ type: 'change', table, event: 'UPDATE', newRow, oldRow: r });
          return newRow;
        }
        return r;
      });
      writeTable(table, newRows);
      if (this._selectAfterWrite) {
        if (this._single) return { data: updated[0] ?? null, error: null };
        return { data: updated, error: null };
      }
      return { data: null, error: null };
    }

    if (this._op === 'upsert') {
      const inputs = Array.isArray(this._payload)
        ? this._payload
        : [this._payload as Record<string, unknown>];
      const existing = readTable(table);
      const upserted: Record<string, unknown>[] = [];

      for (const row of inputs) {
        let idx = -1;
        if (this._conflictCols.length) {
          idx = existing.findIndex((r) =>
            this._conflictCols.every(
              (c) => r[c] === row[c] || String(r[c]) === String(row[c]),
            ),
          );
        } else if (row.id != null) {
          idx = existing.findIndex((r) => r.id === row.id);
        }

        if (idx >= 0) {
          const oldRow = existing[idx];
          const newRow = { ...oldRow, ...row };
          existing[idx] = newRow;
          upserted.push(newRow);
          emitChange({ type: 'change', table, event: 'UPDATE', newRow, oldRow });
        } else {
          const newRow: Record<string, unknown> = { id: genId(), created_at: ts(), ...row };
          existing.push(newRow);
          upserted.push(newRow);
          emitChange({ type: 'change', table, event: 'INSERT', newRow, oldRow: null });
        }
      }

      writeTable(table, existing);
      if (this._selectAfterWrite) return { data: upserted, error: null };
      return { data: null, error: null };
    }

    if (this._op === 'delete') {
      const rows = readTable(table);
      const toDelete = applyFilters(rows, this._filters);
      const remaining = rows.filter((r) => !applyFilters([r], this._filters).length);
      writeTable(table, remaining);
      for (const row of toDelete) {
        emitChange({ type: 'change', table, event: 'DELETE', newRow: null, oldRow: row });
      }
      return { data: null, error: null };
    }

    return { data: null, error: { message: 'Unknown operation' } };
  }
}

// ─── Storage mock ─────────────────────────────────────────────────────────────
// Images stored as data URLs in an in-memory map (not persisted to localStorage
// to avoid quota issues with large binary data).
const imageStore = new Map<string, string>();

const mockStorage = {
  from(_bucket: string) {
    return {
      async upload(
        path: string,
        file: File,
        _opts?: { contentType?: string },
      ): Promise<{ data: { path: string } | null; error: { message: string } | null }> {
        try {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          });
          imageStore.set(path, dataUrl);
          return { data: { path }, error: null };
        } catch (e) {
          return { data: null, error: { message: String(e) } };
        }
      },
      getPublicUrl(path: string): { data: { publicUrl: string } } {
        const url = imageStore.get(path) ?? '';
        return { data: { publicUrl: url } };
      },
    };
  },
};

// ─── RPC implementations ──────────────────────────────────────────────────────
async function executeRpc(
  name: string,
  args: Record<string, unknown>,
): Promise<DbResult<unknown>> {
  const settingsRows = readTable('app_settings');
  const settings = (settingsRows[0] ?? {}) as Record<string, unknown>;
  const adminPw = (settings.admin_password as string | undefined) ?? '';

  function checkPassword(): void {
    const provided = (args.p_admin_password as string | undefined) ?? '';
    if (adminPw && provided !== adminPw) {
      throw new Error('비밀번호가 일치하지 않습니다.');
    }
  }

  try {
    switch (name) {
      // ── Session management ───────────────────────────────────────────────
      case 'admin_create_session': {
        // Validate credentials, return a dummy token
        const token = 'local-' + genId();
        return { data: token, error: null };
      }

      case 'admin_invalidate_session': {
        return { data: null, error: null };
      }

      case 'admin_auth_phone': {
        return { data: null, error: null };
      }

      // ── Seat operations ──────────────────────────────────────────────────
      case 'admin_reset_all_seats': {
        checkPassword();
        const seats = readTable('seats').map((s) => ({
          ...s,
          profile_id: null,
          status: 'empty',
          registered_at: null,
        }));
        writeTable('seats', seats);
        for (const s of seats) {
          emitChange({ type: 'change', table: 'seats', event: 'UPDATE', newRow: s, oldRow: null });
        }
        return { data: null, error: null };
      }

      case 'admin_clear_seat': {
        checkPassword();
        const seatId = args.p_seat_id as string;
        const seats = readTable('seats');
        const idx = seats.findIndex((s) => s.id === seatId);
        if (idx >= 0) {
          const oldRow = seats[idx];
          const newRow = { ...oldRow, profile_id: null, status: 'empty', registered_at: null };
          seats[idx] = newRow;
          writeTable('seats', seats);
          emitChange({ type: 'change', table: 'seats', event: 'UPDATE', newRow, oldRow });
        }
        return { data: null, error: null };
      }

      case 'admin_force_seat': {
        checkPassword();
        const profileId = args.p_profile_id as string;
        const seatId = args.p_seat_id as string;
        const seats = readTable('seats');

        // Clear any existing seat for this profile
        const currentIdx = seats.findIndex((s) => s.profile_id === profileId);
        if (currentIdx >= 0 && seats[currentIdx].id !== seatId) {
          const oldRow = seats[currentIdx];
          const cleared = { ...oldRow, profile_id: null, status: 'empty', registered_at: null };
          seats[currentIdx] = cleared;
          emitChange({ type: 'change', table: 'seats', event: 'UPDATE', newRow: cleared, oldRow });
        }

        // Place in target seat (bump out any occupant first)
        const targetIdx = seats.findIndex((s) => s.id === seatId);
        if (targetIdx >= 0) {
          const oldRow = seats[targetIdx];
          // If occupied by someone else, clear their seat
          if (oldRow.profile_id && oldRow.profile_id !== profileId) {
            const bumped = { ...oldRow, profile_id: null, status: 'empty', registered_at: null };
            seats[targetIdx] = bumped;
            emitChange({ type: 'change', table: 'seats', event: 'UPDATE', newRow: bumped, oldRow });
          }
          const newRow = {
            ...seats[targetIdx],
            profile_id: profileId,
            status: 'occupied',
            registered_at: ts(),
          };
          seats[targetIdx] = newRow;
          emitChange({ type: 'change', table: 'seats', event: 'UPDATE', newRow, oldRow: seats[targetIdx] });
        }

        writeTable('seats', seats);
        return { data: null, error: null };
      }

      case 'admin_clear_profile_seat': {
        checkPassword();
        const profileId = args.p_profile_id as string;
        const seats = readTable('seats');
        const idx = seats.findIndex((s) => s.profile_id === profileId);
        if (idx >= 0) {
          const oldRow = seats[idx];
          const newRow = { ...oldRow, profile_id: null, status: 'empty', registered_at: null };
          seats[idx] = newRow;
          writeTable('seats', seats);
          emitChange({ type: 'change', table: 'seats', event: 'UPDATE', newRow, oldRow });
        }
        return { data: null, error: null };
      }

      case 'admin_swap_seats': {
        checkPassword();
        const seatAId = args.p_seat_a_id as string;
        const seatBId = args.p_seat_b_id as string;
        const seats = readTable('seats');
        const aIdx = seats.findIndex((s) => s.id === seatAId);
        const bIdx = seats.findIndex((s) => s.id === seatBId);
        if (aIdx < 0 || bIdx < 0) {
          return { data: null, error: { message: '좌석을 찾을 수 없습니다.' } };
        }
        const aOld = { ...seats[aIdx] };
        const bOld = { ...seats[bIdx] };
        const aNew = {
          ...aOld,
          profile_id: bOld.profile_id,
          status: bOld.status,
          registered_at: bOld.registered_at,
        };
        const bNew = {
          ...bOld,
          profile_id: aOld.profile_id,
          status: aOld.status,
          registered_at: aOld.registered_at,
        };
        seats[aIdx] = aNew;
        seats[bIdx] = bNew;
        writeTable('seats', seats);
        emitChange({ type: 'change', table: 'seats', event: 'UPDATE', newRow: aNew, oldRow: aOld });
        emitChange({ type: 'change', table: 'seats', event: 'UPDATE', newRow: bNew, oldRow: bOld });
        return { data: null, error: null };
      }

      // ── Profile operations ───────────────────────────────────────────────
      case 'admin_update_profile': {
        const profileId = args.p_profile_id as string;
        const profiles = readTable('profiles');
        const idx = profiles.findIndex((p) => p.id === profileId);
        if (idx >= 0) {
          const oldRow = profiles[idx];
          const patch: Record<string, unknown> = {};
          if (args.p_nickname !== undefined) patch.nickname = args.p_nickname;
          if (args.p_mbti !== undefined) patch.mbti = args.p_mbti;
          if (args.p_bio !== undefined) patch.bio = args.p_bio;
          if (args.p_birth_year !== undefined) patch.birth_year = args.p_birth_year;
          if (args.p_location !== undefined) patch.location = args.p_location;
          if (args.p_personality_score !== undefined) patch.personality_score = args.p_personality_score;
          if (args.p_dom_sub_score !== undefined) patch.dom_sub_score = args.p_dom_sub_score;
          if (args.p_interests !== undefined) patch.interests = args.p_interests;
          if (args.p_kakao_id !== undefined) patch.kakao_id = args.p_kakao_id;
          if (args.p_instagram_id !== undefined) patch.instagram_id = args.p_instagram_id;
          if (args.p_phone_number !== undefined) patch.phone_number = args.p_phone_number;
          if (args.p_contact_private !== undefined) patch.contact_private = args.p_contact_private;
          const newRow = { ...oldRow, ...patch };
          profiles[idx] = newRow;
          writeTable('profiles', profiles);
          emitChange({ type: 'change', table: 'profiles', event: 'UPDATE', newRow, oldRow });
        }
        return { data: null, error: null };
      }

      case 'admin_delete_profile': {
        checkPassword();
        const profileId = args.p_profile_id as string;
        await executeRpc('admin_clear_profile_seat', {
          p_profile_id: profileId,
          p_admin_password: args.p_admin_password,
        });
        const profiles = readTable('profiles');
        const oldProfile = profiles.find((p) => p.id === profileId);
        writeTable('profiles', profiles.filter((p) => p.id !== profileId));
        if (oldProfile) {
          emitChange({
            type: 'change',
            table: 'profiles',
            event: 'DELETE',
            newRow: null,
            oldRow: oldProfile,
          });
        }
        return { data: null, error: null };
      }

      // ── Bulk resets ──────────────────────────────────────────────────────
      case 'admin_full_reset': {
        checkPassword();
        return executeRpc('admin_reset_all_seats', args);
      }

      case 'admin_event_end_reset': {
        checkPassword();
        await executeRpc('admin_reset_all_seats', args);
        // Clear transactional data
        for (const t of ['profiles', 'likes', 'anonymous_reports', 'chats', 'messages',
          'contact_shares', 'contact_share_events', 'balance_votes', 'balance_games',
          'qa_answers', 'qa_games', 'image_votes', 'image_games', 'notifications', 'suggestions']) {
          writeTable(t, []);
        }
        return { data: null, error: null };
      }

      default:
        console.warn('[localdb] Unknown RPC:', name, args);
        return { data: null, error: null };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { data: null, error: { message: msg } };
  }
}

// ─── Active channels registry ─────────────────────────────────────────────────
const _activeChannels = new Set<LocalRealtimeChannel>();

// ─── Public mock client ───────────────────────────────────────────────────────
// Typed as `any` on the outside so the app code sees a compatible Supabase-shaped API.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase: any = {
  from(table: keyof Database['public']['Tables'] | string): QueryBuilder {
    return new QueryBuilder(table as string);
  },

  channel(name: string): LocalRealtimeChannel {
    const ch = new LocalRealtimeChannel(name);
    _activeChannels.add(ch);
    return ch;
  },

  removeChannel(ch: LocalRealtimeChannel): Promise<void> {
    ch.unsubscribe();
    _activeChannels.delete(ch);
    return Promise.resolve();
  },

  rpc(name: string, args?: Record<string, unknown>): Promise<DbResult<unknown>> {
    return executeRpc(name, args ?? {});
  },

  storage: mockStorage,
};

export default supabase;
