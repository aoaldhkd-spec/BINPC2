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
const FETCH_TIMEOUT = 15_000; // 모바일·Render 콜드스타트 대비 (기존 4s는 폰에서 로그인 타임아웃)

// ─── Session readiness gate ───────────────────────────────────────────────────
// 문제: setLocalDbUserId(newUUID) → _currentUserId 즉시 갱신 → /op 요청 날림
//       그런데 loginSession(newUUID)는 비동기 → 아직 서버 세션은 구(舊) UUID
//       → 서버가 "session UUID ≠ body requesterId" → 403으로 전면 차단
// 해결: loginSession 완료 전까지 /op 요청을 대기열에 보관, 완료 후 일괄 해제
let _sessionReady = true;
let _sessionReadyResolve: (() => void) | null = null;
let _sessionReadyPromise: Promise<void> = Promise.resolve();

/** loginSession 완료까지 대기. 최대 5초 타임아웃으로 무한 블로킹 방지. */
async function _waitForSession(): Promise<void> {
  if (_sessionReady) return;
  await Promise.race([
    _sessionReadyPromise,
    new Promise<void>(r => setTimeout(r, 5_000)),
  ]);
}

function _markSessionReady() {
  _sessionReady = true;
  if (_sessionReadyResolve) {
    _sessionReadyResolve();
    _sessionReadyResolve = null;
  }
}

function _markSessionPending() {
  if (_sessionReady) {
    _sessionReady = false;
    _sessionReadyPromise = new Promise<void>(r => { _sessionReadyResolve = r; });
  }
}

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
        credentials: 'include',
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
        try {
          const json = JSON.parse(text) as { data?: unknown; error?: { message?: string } };
          return {
            data: json.data ?? null,
            error: json.error ?? { message: `HTTP ${resp.status}` },
          };
        } catch {
          return { data: null, error: { message: `HTTP ${resp.status}: ${text}` } };
        }
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
    // 세션이 수립될 때까지 대기 (loginSession 완료 전 /op 요청 전면 차단 방지)
    await _waitForSession();
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
      requesterId: _currentUserId, // IDOR guard: server verifies ownership for sensitive tables
      adminToken: localStorage.getItem('admin_token_v1') ?? undefined, // admin bypass: included when logged in as admin
      testToken: localStorage.getItem('test_token_v1') ?? undefined,
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
const _disconnectCallbacks = new Set<() => void>();

// ── Ping 감시 (좀비 클라이언트 방어) ─────────────────────────────────────────
// 서버는 5초마다 ping을 보냄. 15초(3번) 이상 ping이 없으면 SSE가 겉만 살아있는
// 좀비 상태 → 강제로 닫고 재연결. (프록시가 SSE를 silent-drop해도 감지 가능)
let _lastPingAt = 0; // 마지막 ping/메시지 수신 시각 (0 = 아직 미연결)
const PING_TIMEOUT_MS = 15_000; // 15초 = 서버 ping 주기(5s) × 3
let _lastEventId = '';

/** SSE 재연결 후 호출될 콜백을 등록합니다. 반환값은 해제 함수입니다. */
export function onSseReconnect(fn: () => void): () => void {
  _reconnectCallbacks.add(fn);
  return () => _reconnectCallbacks.delete(fn);
}

/** SSE 연결 끊김 시 호출될 콜백을 등록합니다. 반환값은 해제 함수입니다. */
export function onSseDisconnect(fn: () => void): () => void {
  _disconnectCallbacks.add(fn);
  return () => _disconnectCallbacks.delete(fn);
}

// SSE 인증 토큰 — 서버에서 발급한 HMAC 토큰으로 자신의 이벤트만 수신 가능
let _sseToken: string | null = null;

let _tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null;
const SSE_TOK_KEY = 'sse_tok';
const SSE_TOK_EXP_KEY = 'sse_tok_exp';

// SSE 토큰 재시도 타이머 — userId 변경 시 명시적으로 취소
let _sseTokenRetryTimer: ReturnType<typeof setTimeout> | null = null;

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
    if (cached && Math.floor(Date.now() / 1000) < exp - 120) {
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
  _lastEventId = '';
  try { sessionStorage.removeItem('sse_last_event_id'); } catch { /* ignore */ }
  // userId 변경 → 이전 userId 대상 재시도 타이머 취소 (오래된 userId로 재시도되는 경쟁 방지)
  if (_sseTokenRetryTimer) { clearTimeout(_sseTokenRetryTimer); _sseTokenRetryTimer = null; }
  if (_tokenRefreshTimer) { clearTimeout(_tokenRefreshTimer); _tokenRefreshTimer = null; }
  if (_es) { _es.close(); _es = null; }
  if (!userId) {
    // 로그아웃: 토큰 캐시 삭제, 세션 게이트 즉시 해제
    _markSessionReady();
    try { localStorage.removeItem(SSE_TOK_KEY); localStorage.removeItem(SSE_TOK_EXP_KEY); } catch { /* ignore */ }
    if (_sseListeners.size > 0) ensureSse(); // 익명 SSE 유지
    return;
  }
  // userId가 바뀐 경우: loginSession 완료 전까지 /op 요청을 게이트로 차단
  // → 서버 세션(구 UUID)과 body.requesterId(신 UUID) 불일치로 인한 403 차단 방지
  _markSessionPending();
  // 캐시 토큰이 있으면 즉시 인증 SSE로 연결. 없으면 토큰 발급 후 setSseToken이 연결합니다.
  if (_sseListeners.size > 0) ensureSse();
  void fetchSseToken(userId);
}

// ── SSE 지수 백오프 + 지터 ────────────────────────────────────────────────────
// 연속 실패 시 서버에 재연결 폭풍(thundering herd)을 일으키지 않도록 대기 시간을 점진적으로 늘림.
// 모든 클라이언트에 동일 지연이 아닌 랜덤 지터를 더해 동시 재연결 집중을 방지.
let _sseFailCount = 0;            // 연속 SSE 연결 실패 횟수
let _sseNextAllowedRetry = 0;     // 이 시각(ms) 이전에는 재연결 불가

// ── 서버 재시작 후 능동적 빠른 복구 모드 ──────────────────────────────────────
// shutdown 이벤트 수신 후 SSE_SHUTDOWN_RECOVERY_MS 동안 활성화:
//  - 백오프 건너뜀 (바로 재연결 시도)
//  - CONNECTING 상태 500ms 초과 시 강제 닫기 (평상시 3초 대신)
//  - 오류 발생 시 _sseFailCount 증가 안 함 (서버 재시작 중 실패는 예상된 상황)
const SSE_SHUTDOWN_RECOVERY_MS = 10_000; // 서버 재시작은 보통 <2s, 여유를 두어 10s
let _shutdownRecoveryUntil = 0;          // 이 시각까지 빠른 복구 모드 유지

function inShutdownRecovery(): boolean {
  return Date.now() < _shutdownRecoveryUntil;
}

/** 연속 실패 횟수에 따른 지수 백오프 대기 시간 계산 (최대 15초 + 최대 1.5초 지터)
 *  빠른 재연결: 1s → 2s → 4s → 8s → 15s (jitter 포함) */
function calcSseBackoffMs(): number {
  const base = Math.min(Math.pow(2, _sseFailCount) * 500, 15_000);
  const jitter = Math.random() * 1_500; // 0~1.5초 지터 — thundering herd 방지
  return base + jitter;
}

function createSse() {
  if (!_lastEventId) {
    try { _lastEventId = sessionStorage.getItem('sse_last_event_id') ?? ''; } catch { /* ignore */ }
  }
  const params: string[] = [];
  // userId와 token은 반드시 함께 제공해야 함 — token 없이 userId만 보내면 서버가 401 반환
  if (_currentUserId && _sseToken) {
    params.push(`userId=${encodeURIComponent(_currentUserId)}`);
    params.push(`token=${encodeURIComponent(_sseToken)}`);
  }
  // 관리자 토큰이 있으면 관리자 SSE 연결로 업그레이드 (모든 이벤트 수신)
  const adminToken = (() => { try { return localStorage.getItem('admin_token_v1'); } catch { return null; } })();
  if (adminToken && !_currentUserId) params.push(`adminToken=${encodeURIComponent(adminToken)}`);
  if (_lastEventId) params.push(`lastEventId=${encodeURIComponent(_lastEventId)}`);
  const url = params.length ? `${API}/events?${params.join('&')}` : `${API}/events`;
  const es = new EventSource(url);
  es.onmessage = (ev) => {
    if (ev.lastEventId) {
      _lastEventId = ev.lastEventId;
      try { sessionStorage.setItem('sse_last_event_id', _lastEventId); } catch { /* ignore */ }
    }
    _lastPingAt = Date.now(); // Ping 감시: 마지막 수신 시각 갱신
    _sseErrorSince = null; // 메시지 수신 = 연결 정상

    // ── 서버 재시작 신호: 백오프 없이 즉시 재연결 ──────────────────────────────
    // 서버가 SIGTERM/SIGINT 수신 시 모든 SSE 클라이언트에 {"type":"shutdown"}을 보냄.
    // 클라이언트는 백오프 카운터를 초기화하고 즉시 재연결하여 60s 대기를 1s 이하로 단축.
    try {
      const peek = JSON.parse(ev.data) as { type?: string };
      if (peek.type === 'shutdown') {
        // 빠른 복구 모드 활성화 — SSE_SHUTDOWN_RECOVERY_MS 동안 onerror 시 백오프 누적 없음
        _shutdownRecoveryUntil = Date.now() + SSE_SHUTDOWN_RECOVERY_MS;
        // 실패 카운터·백오프 초기화
        _sseFailCount = 0;
        _sseNextAllowedRetry = 0;
        // 끊김 콜백 → UI 재연결 오버레이 표시
        if (_sseHasConnected) {
          _sseNeedsResync = true;
          _disconnectCallbacks.forEach(fn => { try { fn(); } catch {} });
        }
        // ★ 핵심: es.close()를 호출하지 않음.
        //   서버가 'retry: 100\n' 필드를 보낸 후 res.end()로 연결을 닫으면,
        //   브라우저 내장 EventSource가 100ms 후 자동 재연결을 시도한다.
        //   여기서 es.close()를 호출하면 retry 지연값이 버려지고
        //   새 EventSource는 브라우저 기본값(~3s)으로 초기화된다.
        //   → 서버가 연결을 닫을 때 onerror가 자연스럽게 발생하도록 위임.
        return;
      }
    } catch { /* JSON 파싱 실패 시 무시하고 정상 흐름 유지 */ }

    // 재연결 성공 → 실패 카운터·백오프 타이머 초기화
    _sseFailCount = 0;
    _sseNextAllowedRetry = 0;
    // 재연결 감지: 이전에 한 번 이상 연결됐었고, 끊김 이후 첫 메시지
    if (_sseHasConnected && _sseNeedsResync) {
      _sseNeedsResync = false;
      _reconnectCallbacks.forEach(fn => { try { fn(); } catch {} });
    }
    _sseHasConnected = true;
    try {
      const data = JSON.parse(ev.data) as SseEvent;
      // api-server 전체 리싱크 신호 (_bulk_resync:true) → 재연결 콜백 실행해 전체 데이터 리로드
      // resyncAllFromNativeDb() 호출 후 브로드캐스트되는 신호; 정상 row 이벤트와 구분
      if (data.type === 'change' && (data.newRow as Record<string, unknown> | null)?._bulk_resync) {
        _reconnectCallbacks.forEach(fn => { try { fn(); } catch {} });
        return; // 개별 리스너에게 전파 불필요
      }
      _sseListeners.forEach(fn => { try { fn(data); } catch {} });
    } catch {}
  };
  es.onerror = () => {
    const wasConnected = _sseHasConnected;
    if (!_sseErrorSince) {
      _sseErrorSince = Date.now();
      // 이전에 한 번이라도 연결된 적 있으면 끊김 콜백 실행
      if (wasConnected) {
        _disconnectCallbacks.forEach(fn => { try { fn(); } catch {} });
      }
    }
    // 끊겼음을 기록 — 다음 메시지 수신 시 재연결 콜백 실행
    if (wasConnected) _sseNeedsResync = true;
    // CLOSED 상태면 실패 카운터 증가 후 백오프 쿨다운 설정
    // 단, 서버 재시작 복구 모드 중에는 카운터 증가·백오프 생략 (예상된 실패이므로)
    if (es.readyState === EventSource.CLOSED) {
      if (!inShutdownRecovery()) {
        _sseFailCount = Math.min(_sseFailCount + 1, 4); // 최대 4 (≈ 8s base 백오프, 지터 포함 최대 ~10s)
        _sseNextAllowedRetry = Date.now() + calcSseBackoffMs();
      }
      _es = null;
    }
  };
  return es;
}

function ensureSse() {
  // 로그인 사용자는 토큰이 생기기 전 익명 SSE에 붙지 않습니다.
  // 익명 연결은 채팅·하트 같은 비공개 이벤트를 받지 못해 메시지 누락의 주원인입니다.
  if (_currentUserId && !_sseToken) return;

  // [백오프 쿨다운] 연속 실패 후 정해진 시간 전에는 재연결 시도 안 함
  // 단, 서버 재시작 복구 모드 중에는 백오프를 무시하고 즉시 재시도
  if (!inShutdownRecovery() && _sseNextAllowedRetry && Date.now() < _sseNextAllowedRetry) return;

  // CONNECTING 상태가 3초 이상 지속되면 강제 재연결 (느린 네트워크 환경 허용)
  // ★ 복구 모드 중에는 강제 닫기 생략 — 브라우저가 retry:100 지연값을 기억한 채로
  //   자체 재시도 중이므로 es.close()를 호출하면 그 지연값이 리셋된다.
  if (!inShutdownRecovery() && _es && _es.readyState === EventSource.CONNECTING && _sseErrorSince && Date.now() - _sseErrorSince > 3_000) {
    _es.close();
    _es = null;
    _sseErrorSince = null;
  }
  if (_es && _es.readyState !== EventSource.CLOSED) return;
  _sseErrorSince = null;
  _es = createSse();
}

// 2초마다 연결 상태 점검 — 끊어진 SSE를 자동 복구 (백오프 중에는 ensureSse가 자체 skip)
setInterval(() => {
  if (_sseListeners.size === 0) return;

  // ── Ping 감시: 15초 이상 서버 ping 미수신 → 좀비 SSE 강제 재연결 ──────────────
  // _lastPingAt > 0: 한 번 이상 연결된 적 있음
  // 현재 OPEN 상태지만 ping이 오지 않는다면 프록시가 연결을 silent-drop한 것
  if (
    _lastPingAt > 0 &&
    _es && _es.readyState === EventSource.OPEN &&
    Date.now() - _lastPingAt > PING_TIMEOUT_MS
  ) {
    console.warn('[SSE] ping timeout — force reconnect');
    _lastPingAt = 0;
    _es.close();
    _es = null;
    _sseNeedsResync = true;
    if (_sseHasConnected) _disconnectCallbacks.forEach(fn => { try { fn(); } catch {} });
    fireReconnectCallbacks();
  }

  ensureSse();
}, 2_000);

// 탭/앱 포그라운드 복귀 시 즉시 SSE 재연결 확인
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && _sseListeners.size > 0) {
      ensureSse();
    }
  });
}

// 네트워크 복구(WiFi→LTE 전환, 공유기 재시작 등) 시 즉시 SSE 재연결
// SSE는 TCP 연결이라 visibilitychange와 독립적으로 끊길 수 있음
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (_sseListeners.size > 0) {
      // 백오프 쿨다운 초기화 — 네트워크가 돌아왔으므로 즉시 재연결 허용
      _sseNextAllowedRetry = 0;
      _sseFailCount = 0;
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
  callback: (payload: { payload: any }) => void;
}

class LocalRealtimeChannel {
  public readonly name: string;
  private subs: SubConfig[] = [];
  private broadcastSubs: BroadcastSub[] = [];
  private statusCb: ((s: string) => void) | null = null;
  private _sseHandler: ((e: SseEvent) => void) | null = null;
  private _statusTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(name: string) {
    this.name = name;
  }

  on(
    type: 'postgres_changes' | 'broadcast',
    config: { event: string; schema?: string; table?: string; filter?: string },
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
            try { sub.callback({ payload: data.payload }); } catch (err) {
              console.error('[localdb] broadcast callback error:', err);
            }
          }
        }
      }
    };

    // 이전 핸들러가 남아 있으면 먼저 제거 (subscribe() 재호출 시 중복 리스너 방지)
    if (this._sseHandler) {
      _sseListeners.delete(this._sseHandler);
      this._sseHandler = null;
    }
    this._sseHandler = handler;
    _sseListeners.add(handler);

    // Signal subscribed quickly — 타이머 ref 보관해서 unsubscribe 시 취소 가능하도록
    if (this._statusTimer) { clearTimeout(this._statusTimer); this._statusTimer = null; }
    this._statusTimer = setTimeout(() => { this._statusTimer = null; this.statusCb?.('SUBSCRIBED'); }, 50);
    return this;
  }

  unsubscribe(): void {
    if (this._statusTimer) { clearTimeout(this._statusTimer); this._statusTimer = null; }
    if (this._sseHandler) {
      _sseListeners.delete(this._sseHandler);
      this._sseHandler = null;
      // Fix #11: 마지막 구독자가 떠나면 SSE 연결 즉시 해제
      // — idle 연결이 서버 sseUserMap에 남아 자원(메모리+keep-alive) 낭비하던 문제 해결
      // 다음 subscribe() 호출 시 ensureSse()가 즉시 재연결하므로 기능 영향 없음
      if (_sseListeners.size === 0 && _es) {
        _es.close();
        _es = null;
      }
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
      async remove(paths: string[]): Promise<{ data: null; error: { message: string } | null }> {
        const result = await apiFetch('/storage-remove', { paths });
        return {
          data: null,
          error: result.error as { message: string } | null,
        };
      },
    };
  },
};

// ─── Public mock client ───────────────────────────────────────────────────────
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

  async rpc(name: string, args?: Record<string, unknown>): Promise<{ data: any; error: any }> {
    return apiFetch(`/rpc/${name}`, args ?? {});
  },

  storage: mockStorage,
};

function fireReconnectCallbacks() {
  _sseNeedsResync = false;
  _sseHasConnected = true;
  _reconnectCallbacks.forEach(fn => { try { fn(); } catch {} });
}

/**
 * 세션 수립 후 SSE 토큰을 서버에서 발급받아 저장합니다.
 * 세션 쿠키는 서버가 "이 요청이 진짜 userId 브라우저에서 왔다"는 것을
 * 검증하는 근거이므로, 토큰은 세션이 있는 브라우저에만 발급됩니다.
 * device_not_bound 오류 시에는 SSE가 익명 모드로 폴백됩니다.
 */
/**
 * SSE 토큰 발급. 실패 시 모든 경우(loginSession 실패·HTTP 오류·네트워크 오류)에 지수 백오프로 재시도.
 * 익명 SSE 영구 고착을 방지하는 핵심 함수 — 토큰 없이는 채팅·하트 이벤트를 수신할 수 없음.
 * attempt: 현재 재시도 횟수 (내부용, 외부 호출 시 생략)
 */
export async function fetchAndSetSseToken(userId: string, attempt = 0): Promise<void> {
  // 이전 재시도 타이머 초기화 (중복 재시도 방지)
  if (_sseTokenRetryTimer) { clearTimeout(_sseTokenRetryTimer); _sseTokenRetryTimer = null; }

  /** 모든 실패 경로에서 호출 — 지수 백오프(5s→10s→20s→40s→최대 60s) + 지터로 재시도 예약 */
  const scheduleRetry = (reason: string) => {
    if (_currentUserId !== userId) return; // userId 변경됐으면 재시도 불필요
    const baseDelay = Math.min(Math.pow(2, attempt) * 5_000, 60_000);
    const jitter = Math.random() * 2_000; // thundering herd 방지
    const delayMs = baseDelay + jitter;
    console.warn(`[SSE] 토큰 발급 실패 (${reason}) — ${(delayMs / 1_000).toFixed(1)}s 후 재시도 #${attempt + 1}`);
    _sseTokenRetryTimer = setTimeout(() => {
      _sseTokenRetryTimer = null;
      if (_currentUserId === userId) fetchAndSetSseToken(userId, attempt + 1).catch(() => {});
    }, delayMs);
  };

  try {
    // 1단계: 기기 secret으로 서버 세션 수립
    const loggedIn = await loginSession(userId);
    if (!loggedIn) {
      // device_not_bound·네트워크 오류 모두 재시도 (익명 SSE 영구 고착 방지)
      scheduleRetry('loginSession 실패');
      return;
    }
    // 경합 방지: 비동기 대기 중 계정이 바뀐 경우 토큰을 설치하지 않음
    if (_currentUserId !== userId) return;

    // 2단계: 세션이 수립된 브라우저에만 SSE 토큰 발급
    const resp = await fetch(`${API}/auth/sse-token`, {
      method: 'POST',
      credentials: 'same-origin',
    });
    if (!resp.ok) {
      scheduleRetry(`HTTP ${resp.status}`);
      return;
    }
    // 경합 방지: 네트워크 대기 중 계정이 또 바뀐 경우
    if (_currentUserId !== userId) return;

    const data = await resp.json() as { token?: string; expiresAt?: number };
    if (data.token && data.expiresAt) {
      setSseToken(data.token, data.expiresAt); // 성공 — setSseToken 내부에서 만료 전 자동 재발급 타이머 설정
    } else {
      scheduleRetry('응답에 token/expiresAt 없음');
    }
  } catch (e) {
    // 네트워크 오류 (fetch 자체 실패)
    scheduleRetry(`네트워크 오류: ${(e as Error).message}`);
  }
}

/** 현재 SSE 토큰 반환 — push/subscribe 등 인증이 필요한 요청에서 헤더로 사용 */
export function getSseToken(): string | null {
  return _sseToken;
}

/** 서버에서 발급받은 SSE 토큰 저장 및 SSE 재연결. expiresAt은 Unix 초. */
export function setSseToken(token: string, expiresAt: number) {
  _sseToken = token;
  // #4: localStorage에 토큰 캐시 저장 → 앱 재시작 후에도 재연결 없이 즉시 재사용
  try {
    localStorage.setItem(SSE_TOK_KEY, token);
    localStorage.setItem(SSE_TOK_EXP_KEY, String(expiresAt));
  } catch { /* storage quota 초과 시 무시 — 메모리 캐시로 폴백 */ }
  // 기존 타이머 정리
  if (_tokenRefreshTimer) { clearTimeout(_tokenRefreshTimer); _tokenRefreshTimer = null; }
  // 만료 5분 전에 자동 재발급 스케줄링
  const refreshIn = (expiresAt - Math.floor(Date.now() / 1000) - 300) * 1000;
  if (_currentUserId && refreshIn > 0) {
    _tokenRefreshTimer = setTimeout(() => {
      if (_currentUserId) fetchAndSetSseToken(_currentUserId).catch(() => {});
    }, refreshIn);
  }
  // 새 토큰으로 SSE 재연결. 브라우저가 EventSource를 새로 만들면 Last-Event-ID 헤더가
  // 사라지므로 lastEventId 쿼리와 HTTP 재동기화를 함께 수행합니다.
  _sseNeedsResync = true;
  if (_es) { _es.close(); _es = null; }
  if (_sseListeners.size > 0) ensureSse();
  fireReconnectCallbacks();
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
          // 서버는 first-claim을 허용하므로 이 분기는 도달하지 않아야 함
          // 만약 도달했다면 기기 secret 해시가 불일치한 것 — localStorage 초기화 후 재시도 필요
          console.warn(
            '[localdb] SSE 인증 실패: 기기 secret 해시 불일치 — ' +
            '이 기기에서 재가입하거나 localStorage를 초기화하면 해결됩니다.',
          );
        }
      }
      // 실패해도 게이트 해제 — 앱이 무한 대기하지 않도록 (5초 타임아웃 폴백도 있음)
      if (_currentUserId === userId) _markSessionReady();
      return false;
    }
    // 성공: 서버 세션이 userId로 갱신됨 → /op 요청 차단 해제
    if (_currentUserId === userId) _markSessionReady();
    return true;
  } catch {
    // 네트워크 오류: 게이트 해제 후 익명 폴백
    if (_currentUserId === userId) _markSessionReady();
    return false;
  }
}

export function getDeviceSecret(userId: string): string {
  const key = DEVICE_SECRET_PREFIX + userId;
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    // 최초 실행 시 새 비밀값 생성 후 저장
    const secret = crypto.randomUUID();
    localStorage.setItem(key, secret);
    return secret;
  } catch {
    // 시크릿/프라이빗 모드 등 localStorage 접근 불가 시 메모리 내 UUID 반환
    // (재시작 시 다시 first-claim 처리됨 — 자동 재바인딩 허용)
    return crypto.randomUUID();
  }
}
