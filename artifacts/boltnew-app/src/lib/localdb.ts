/**
 * localdb.ts — HTTP client that calls the shared API server.
 *
 * Replaces the old localStorage-based mock. All data is now stored on the
 * server so every device accessing the same URL shares the same state.
 *
 * Public API is intentionally identical to the old mock (Supabase-shaped),
 * so no changes are needed in App.tsx / AdminApp.tsx.
 */

import type { Database } from '../types/database';

// ─── Config ───────────────────────────────────────────────────────────────────
const API = '/api/db';
const FETCH_TIMEOUT = 12_000; // ms

// ─── Fetch helper ─────────────────────────────────────────────────────────────
async function apiFetch(path: string, body?: unknown): Promise<{ data: unknown; error: unknown }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const resp = await fetch(`${API}${path}`, {
      method: body !== undefined ? 'POST' : 'GET',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return { data: null, error: { message: `HTTP ${resp.status}: ${text}` } };
    }
    return await resp.json();
  } catch (e) {
    clearTimeout(timer);
    const msg = e instanceof Error ? e.message : String(e);
    return { data: null, error: { message: msg } };
  }
}

// ─── Filter specs (serialisable) ──────────────────────────────────────────────
type FilterSpec =
  | { type: 'eq'; col: string; val: unknown }
  | { type: 'neq'; col: string; val: unknown }
  | { type: 'in'; col: string; vals: unknown[] }
  | { type: 'or'; expr: string };

// ─── Query builder ────────────────────────────────────────────────────────────
type DbResult<T> = { data: T | null; error: { message: string; code?: string } | null };

class QueryBuilder {
  private _table: string;
  private _op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private _filters: FilterSpec[] = [];
  private _orders: { col: string; asc: boolean }[] = [];
  private _lim: number | null = null;
  private _single = false;
  private _maybeSingle = false;
  private _selectAfterWrite = false;
  private _payload: unknown = null;
  private _conflictCols: string[] = [];

  constructor(table: string) {
    this._table = table;
  }

  // ── Select ────────────────────────────────────────────────────────────────
  select(_cols?: string): this {
    if (this._op === 'insert' || this._op === 'update' || this._op === 'upsert') {
      this._selectAfterWrite = true;
    } else {
      this._op = 'select';
    }
    return this;
  }

  // ── Write ops ─────────────────────────────────────────────────────────────
  insert(rows: Record<string, unknown> | Record<string, unknown>[]): this {
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
    rows: Record<string, unknown> | Record<string, unknown>[],
    opts?: { onConflict?: string },
  ): this {
    this._op = 'upsert';
    this._payload = rows;
    if (opts?.onConflict) {
      this._conflictCols = opts.onConflict.split(',').map(s => s.trim());
    }
    return this;
  }

  delete(): this {
    this._op = 'delete';
    return this;
  }

  // ── Filters ───────────────────────────────────────────────────────────────
  eq(col: string, val: unknown): this {
    this._filters.push({ type: 'eq', col, val });
    return this;
  }

  neq(col: string, val: unknown): this {
    this._filters.push({ type: 'neq', col, val });
    return this;
  }

  in(col: string, vals: unknown[]): this {
    this._filters.push(
      !vals || vals.length === 0
        ? { type: 'eq', col: '__never__', val: '__never__' } // always-false sentinel
        : { type: 'in', col, vals },
    );
    return this;
  }

  or(expr: string): this {
    this._filters.push({ type: 'or', expr });
    return this;
  }

  // ── Ordering / Limiting ───────────────────────────────────────────────────
  order(col: string, opts?: { ascending?: boolean }): this {
    this._orders.push({ col, asc: opts?.ascending !== false });
    return this;
  }

  limit(n: number): this {
    this._lim = n;
    return this;
  }

  // ── Terminal selectors ────────────────────────────────────────────────────
  single(): this { this._single = true; return this; }
  maybeSingle(): this { this._maybeSingle = true; return this; }

  // ── Promise interface ─────────────────────────────────────────────────────
  then<T>(
    resolve: (value: DbResult<T>) => void,
    reject?: (reason?: unknown) => void,
  ): Promise<void> {
    return this._runAsync()
      .then(result => resolve(result as DbResult<T>))
      .catch(reject);
  }

  private async _runAsync(): Promise<DbResult<unknown>> {
    return apiFetch('/op', {
      table: this._table,
      op: this._op,
      filters: this._filters,
      orders: this._orders,
      limit: this._lim,
      single: this._single,
      maybeSingle: this._maybeSingle,
      payload: this._payload,
      conflictCols: this._conflictCols,
      selectAfterWrite: this._selectAfterWrite,
    }) as Promise<DbResult<unknown>>;
  }
}

// ─── SSE realtime ─────────────────────────────────────────────────────────────
interface SseEvent {
  type: 'change' | 'broadcast' | 'ping';
  table?: string;
  event?: 'INSERT' | 'UPDATE' | 'DELETE';
  newRow?: Record<string, unknown> | null;
  oldRow?: Record<string, unknown> | null;
  channel?: string;
  payload?: unknown;
}

// One global EventSource, shared by all channels
let _es: EventSource | null = null;
const _sseListeners = new Set<(e: SseEvent) => void>();

function ensureSse() {
  if (_es && _es.readyState !== EventSource.CLOSED) return;
  _es = new EventSource(`${API}/events`);
  _es.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data) as SseEvent;
      _sseListeners.forEach(fn => { try { fn(data); } catch {} });
    } catch {}
  };
  _es.onerror = () => {
    // Browser auto-reconnects EventSource; nothing to do
  };
}

function matchChannelFilter(filterExpr: string | undefined, row: Record<string, unknown> | null): boolean {
  if (!filterExpr || !row) return true;
  const m = filterExpr.match(/^(\w+)=eq\.(.+)$/);
  if (m) return String(row[m[1]]) === m[2];
  return true;
}

interface SubConfig {
  event: '*' | 'INSERT' | 'UPDATE' | 'DELETE';
  schema: string;
  table: string;
  filter?: string;
  callback: (payload: { new: Record<string, unknown> | object; old: Record<string, unknown> | object }) => void;
}
interface BroadcastSub {
  event: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callback: (payload: { payload: any }) => void;
}

class LocalRealtimeChannel {
  public readonly name: string;
  private subs: SubConfig[] = [];
  private broadcastSubs: BroadcastSub[] = [];
  private statusCb: ((s: string) => void) | null = null;
  private _sseHandler: ((e: SseEvent) => void) | null = null;

  constructor(name: string) {
    this.name = name;
  }

  on(
    type: 'postgres_changes' | 'broadcast',
    config: { event: string; schema?: string; table?: string; filter?: string },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callback: (payload: any) => void,
  ): this {
    if (type === 'broadcast') {
      this.broadcastSubs.push({ event: config.event, callback });
    } else {
      this.subs.push({
        event: config.event as '*' | 'INSERT' | 'UPDATE' | 'DELETE',
        schema: config.schema!,
        table: config.table!,
        filter: config.filter,
        callback,
      });
    }
    return this;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  send(msg: { type: string; event: string; payload: any }): Promise<void> {
    if (msg.type === 'broadcast') {
      return apiFetch('/broadcast', {
        channel: this.name,
        event: msg.event,
        payload: msg.payload,
      }).then(() => undefined);
    }
    return Promise.resolve();
  }

  subscribe(statusCallback?: (status: string) => void): this {
    if (statusCallback) this.statusCb = statusCallback;
    ensureSse();

    const handler = (data: SseEvent) => {
      if (data.type === 'change' && data.table) {
        for (const sub of this.subs) {
          if (sub.table !== data.table) continue;
          if (sub.event !== '*' && sub.event !== data.event) continue;
          const relevantRow = (data.newRow ?? data.oldRow) as Record<string, unknown> | null;
          if (!matchChannelFilter(sub.filter, relevantRow)) continue;
          try {
            sub.callback({ new: data.newRow ?? {}, old: data.oldRow ?? {} });
          } catch (err) {
            console.error('[localdb] realtime callback error:', err);
          }
        }
      } else if (data.type === 'broadcast' && data.channel === this.name) {
        for (const sub of this.broadcastSubs) {
          if (sub.event === data.event || sub.event === '*') {
            try { sub.callback({ payload: data.payload }); } catch {}
          }
        }
      }
    };

    this._sseHandler = handler;
    _sseListeners.add(handler);

    // Signal subscribed quickly (same as before)
    setTimeout(() => this.statusCb?.('SUBSCRIBED'), 50);
    return this;
  }

  unsubscribe(): void {
    if (this._sseHandler) {
      _sseListeners.delete(this._sseHandler);
      this._sseHandler = null;
    }
    this.statusCb?.('CLOSED');
  }
}

// ─── Storage mock (backed by API server) ──────────────────────────────────────
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
          const result = await apiFetch('/storage-upload', { path, dataUrl }) as { data: { path: string } | null; error: { message: string } | null };
          return result;
        } catch (e) {
          return { data: null, error: { message: String(e) } };
        }
      },
      getPublicUrl(path: string): { data: { publicUrl: string } } {
        return { data: { publicUrl: `${API}/storage-image?p=${encodeURIComponent(path)}` } };
      },
    };
  },
};

// ─── Public mock client ───────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase: any = {
  from(table: keyof Database['public']['Tables'] | string): QueryBuilder {
    return new QueryBuilder(table as string);
  },

  channel(name: string): LocalRealtimeChannel {
    return new LocalRealtimeChannel(name);
  },

  removeChannel(ch: LocalRealtimeChannel): Promise<void> {
    ch.unsubscribe();
    return Promise.resolve();
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async rpc(name: string, args?: Record<string, unknown>): Promise<{ data: any; error: any }> {
    return apiFetch(`/rpc/${name}`, args ?? {});
  },

  storage: mockStorage,
};

// Start SSE connection early so the first subscription is instant
ensureSse();
