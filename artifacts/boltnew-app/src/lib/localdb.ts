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
const FETCH_TIMEOUT = 4_000; // ms

// ─── Fetch helper ─────────────────────────────────────────────────────────────
// 503(서버 과부하) 및 네트워크 오류 시 지수 백오프 재시도 — 100명 동시 진입 고부하 대응
const MAX_BUSY_RETRIES = 3;

async function apiFetch(path: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<{ data: unknown; error: unknown }> {
  for (let attempt = 0; attempt <= MAX_BUSY_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
    try {
      const resp = await fetch(`${API}${path}`, {
        method: body !== undefined ? 'POST' : 'GET',
        headers: body !== undefined
          ? { 'Content-Type': 'application/json', ...extraHeaders }
          : (extraHeaders ?? undefined),
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      // 503 서버 과부하 — Retry-After 헤더 또는 지수 백오프 후 재시도
      if (resp.status === 503 && attempt < MAX_BUSY_RETRIES) {
        const retryAfterSec = parseInt(resp.headers.get('Retry-After') ?? '1', 10);
        await new Promise<void>(r => setTimeout(r, Math.min(retryAfterSec * 1000, 4_000)));
        continue;
      }
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        return { data: null, error: { message: `HTTP ${resp.status}: ${text}` } };
      }
      return await resp.json();
    } catch (e) {
      clearTimeout(timer);
      if (attempt < MAX_BUSY_RETRIES) {
        // 네트워크 오류 — 지수 백오프 후 재시도 (500ms → 1000ms → 2000ms)
        await new Promise<void>(r => setTimeout(r, 500 * Math.pow(2, attempt)));
        continue;
      }
      const msg = e instanceof Error ? e.message : String(e);
      return { data: null, error: { message: msg } };
    }
  }
  return { data: null, error: { message: 'Max retries exceeded' } };
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
let _sseErrorSince: number | null = null;
let _currentUserId: string | null = null;

// SSE 재연결 감지 — 첫 연결이 아닌 재연결일 때 등록된 콜백 호출
let _sseHasConnected = false;     // 최초 연결 완료 여부
let _sseNeedsResync = false;      // 끊겼다가 재연결 대기 중 여부
const _reconnectCallbacks = new Set<() => void>();

/** SSE 재연결 후 호출될 콜백을 등록합니다. 반환값은 해제 함수입니다. */
export function onSseReconnect(fn: () => void): () => void {
  _reconnectCallbacks.add(fn);
  return () => _reconnectCallbacks.delete(fn);
}

// SSE 인증 토큰 — 서버에서 발급한 HMAC 토큰으로 자신의 이벤트만 수신 가능
let _sseToken: string | null = null;

let _tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null;
const SSE_TOK_KEY = 'sse_tok';
const SSE_TOK_EXP_KEY = 'sse_tok_exp';

/**
 * SSE 재연결 시 localStorage 캐시 토큰을 복원합니다.
 * 실제 토큰 발급은 fetchAndSetSseToken(App.tsx에서 호출)이 담당합니다.
 * 이 함수는 캐시 확인 + SSE 재연결만 수행합니다.
 */
function fetchSseToken(userId: string): void {
  // localStorage 캐시 확인 (만료 2분 전까지 재사용)
  try {
    const cached = localStorage.getItem(SSE_TOK_KEY);
    const exp = parseInt(localStorage.getItem(SSE_TOK_EXP_KEY) ?? '0', 10);
    if (cached && Date.now() < exp - 120_000) {
      _sseToken = cached;
    }
  } catch { /* ignore */ }
  // userId가 일치할 때만 SSE 재연결 (userId 변경 경합 방지)
  if (_currentUserId === userId) {
    if (_es) { _es.close(); _es = null; }
    if (_sseListeners.size > 0) ensureSse();
  }
}

/** 사용자 로그인/로그아웃 시 호출 — SSE를 userId 식별 연결로 재연결 */
export function setLocalDbUserId(userId: string | null) {
  if (_currentUserId === userId) return;
  _currentUserId = userId;
  _sseToken = null; // 사용자 변경 시 이전 토큰 폐기
  if (_tokenRefreshTimer) { clearTimeout(_tokenRefreshTimer); _tokenRefreshTimer = null; }
  if (_es) { _es.close(); _es = null; }
  if (!userId) {
    // 로그아웃: 토큰 캐시 삭제
    try { localStorage.removeItem(SSE_TOK_KEY); localStorage.removeItem(SSE_TOK_EXP_KEY); } catch { /* ignore */ }
    if (_sseListeners.size > 0) ensureSse(); // 익명 SSE 유지
    return;
  }
  // 토큰이 없으므로 일단 익명으로 연결하고, 토큰 발급 후 자동 재연결
  if (_sseListeners.size > 0) ensureSse();
  void fetchSseToken(userId);
}

function createSse() {
  const params: string[] = [];
  if (_currentUserId) params.push(`userId=${encodeURIComponent(_currentUserId)}`);
  if (_sseToken) params.push(`token=${encodeURIComponent(_sseToken)}`);
  const url = params.length ? `${API}/events?${params.join('&')}` : `${API}/events`;
  const es = new EventSource(url);
  es.onmessage = (ev) => {
    _sseErrorSince = null; // 메시지 수신 = 연결 정상
    // 재연결 감지: 이전에 한 번 이상 연결됐었고, 끊김 이후 첫 메시지
    if (_sseHasConnected && _sseNeedsResync) {
      _sseNeedsResync = false;
      _reconnectCallbacks.forEach(fn => { try { fn(); } catch {} });
    }
    _sseHasConnected = true;
    try {
      const data = JSON.parse(ev.data) as SseEvent;
      _sseListeners.forEach(fn => { try { fn(data); } catch {} });
    } catch {}
  };
  es.onerror = () => {
    if (!_sseErrorSince) _sseErrorSince = Date.now();
    // 끊겼음을 기록 — 다음 메시지 수신 시 재연결 콜백 실행
    if (_sseHasConnected) _sseNeedsResync = true;
    // CLOSED 상태면 다음 ensureSse() 호출 때 재생성
    if (es.readyState === EventSource.CLOSED) {
      _es = null;
    }
  };
  return es;
}

function ensureSse() {
  // CONNECTING 상태가 3초 이상 지속되면 강제 재연결
  if (_es && _es.readyState === EventSource.CONNECTING && _sseErrorSince && Date.now() - _sseErrorSince > 3_000) {
    _es.close();
    _es = null;
    _sseErrorSince = null;
  }
  if (_es && _es.readyState !== EventSource.CLOSED) return;
  _sseErrorSince = null;
  _es = createSse();
}

// 5초마다 연결 상태 점검 — 끊어진 SSE를 자동 복구
setInterval(() => {
  if (_sseListeners.size > 0) ensureSse();
}, 5_000);

// 탭/앱 포그라운드 복귀 시 즉시 SSE 재연결 확인
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && _sseListeners.size > 0) {
      ensureSse();
    }
  });
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
      // SSE 토큰을 broadcast 인증 헤더로 전달 (SESSION_SECRET 클라이언트 노출 없이 인증)
      const authHeaders: Record<string, string> = {};
      if (_sseToken  && _currentUserId) {
        authHeaders['x-broadcast-token']  = _sseToken;
        authHeaders['x-broadcast-userid'] = _currentUserId;
      }
      return apiFetch('/broadcast', {
        channel: this.name,
        event: msg.event,
        payload: msg.payload,
      }, authHeaders).then(() => undefined);
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

/**
 * 세션 수립 후 SSE 토큰을 서버에서 발급받아 저장합니다.
 * 세션 쿠키는 서버가 "이 요청이 진짜 userId 브라우저에서 왔다"는 것을
 * 검증하는 근거이므로, 토큰은 세션이 있는 브라우저에만 발급됩니다.
 * device_not_bound 오류 시에는 SSE가 익명 모드로 폴백됩니다.
 */
export async function fetchAndSetSseToken(userId: string): Promise<void> {
  try {
    // 1단계: 세션 수립 (기기 secret 검증)
    const loggedIn = await loginSession(userId);
    if (!loggedIn) return; // device_not_bound 또는 네트워크 오류
    // 2단계: 세션이 수립된 브라우저에만 SSE 토큰 발급
    const resp = await fetch(`${API}/auth/sse-token`, {
      method: 'POST',
      credentials: 'same-origin',
    });
    if (!resp.ok) return;
    const data = await resp.json() as { token?: string; expiresAt?: number };
    if (data.token && data.expiresAt) setSseToken(data.token, data.expiresAt);
  } catch { /* 네트워크 오류 시 무시 — SSE는 익명으로 폴백 */ }
}

/** 서버에서 발급받은 SSE 토큰 저장 및 SSE 재연결. expiresAt은 Unix 초. */
export function setSseToken(token: string, expiresAt: number) {
  _sseToken = token;
  // 기존 타이머 정리
  if (_tokenRefreshTimer) { clearTimeout(_tokenRefreshTimer); _tokenRefreshTimer = null; }
  // 만료 5분 전에 자동 재발급 스케줄링
  const refreshIn = (expiresAt - Math.floor(Date.now() / 1000) - 300) * 1000;
  if (_currentUserId && refreshIn > 0) {
    _tokenRefreshTimer = setTimeout(() => {
      if (_currentUserId) fetchAndSetSseToken(_currentUserId).catch(() => {});
    }, refreshIn);
  }
  // 새 토큰으로 SSE 재연결
  if (_es) { _es.close(); _es = null; }
  if (_sseListeners.size > 0) ensureSse();
}

const DEVICE_SECRET_PREFIX = 'bolt_device_secret_';
/**
 * userId + deviceSecret으로 서버 세션을 수립합니다.
 * deviceSecret은 localStorage에만 있는 값이므로
 * userId만 아는 공격자는 세션을 얻을 수 없습니다.
 */
async function loginSession(userId: string): Promise<boolean> {
  try {
    const deviceSecret = getDeviceSecret(userId);
    const resp = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, deviceSecret }),
      credentials: 'same-origin',
    });
    if (!resp.ok) {
      if (resp.status === 401) {
        const body = await resp.json().catch(() => ({})) as { code?: string };
        if (body.code === 'NEEDS_MIGRATION') {
          console.warn(
            '[localdb] SSE 인증 실패: 기기 secret 미등록 계정 — ' +
            '비공개 이벤트(채팅·하트)를 수신하려면 재가입이 필요합니다.',
          );
        }
      }
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function getDeviceSecret(userId: string): string {
  const key = DEVICE_SECRET_PREFIX + userId;
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  // 최초 실행 시 새 비밀값 생성 후 저장
  const secret = crypto.randomUUID();
  localStorage.setItem(key, secret);
  return secret;
}
