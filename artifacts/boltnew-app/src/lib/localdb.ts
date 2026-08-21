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
import { tableNeedsSession } from './db-auth-tables';
import { diag, newRequestId, installDiagGlobal } from './diag';
import {
  reportLinkDown,
  reportLinkUp,
  reportBrowserOffline,
  reportBrowserOnline,
  sseReadyStateBlocksNetDownUi,
} from './net-health';

installDiagGlobal();

// ─── Config ───────────────────────────────────────────────────────────────────
// HTTP API는 동일 출처(/api/db → Netlify 프록시)를 유지.
// SSE만 Render로 직접 연결 — Netlify 프록시가 event-stream 을 버퍼링해 실시간 유실이 발생함.
const API = '/api/db';
const SSE_ORIGIN = (import.meta.env.VITE_SSE_ORIGIN as string | undefined)?.replace(/\/$/, '') ?? '';
const SSE_API = SSE_ORIGIN ? `${SSE_ORIGIN}/api/db` : API;
const FETCH_TIMEOUT = 15_000; // 모바일·Render 콜드스타트 대비 (기존 4s는 폰에서 로그인 타임아웃)

/** 의도적 SSE 재연결(토큰 갱신 등) 중 disconnect 콜백 억제 */
let _suppressDisconnectUntil = 0;
function suppressDisconnectBriefly(ms = 4_000) {
  _suppressDisconnectUntil = Math.max(_suppressDisconnectUntil, Date.now() + ms);
}

/** disconnect 오탐 방지 — 핸드셰이크·자동재시도가 끝날 때까지 UI 보류 */
let _disconnectNotifyTimer: ReturnType<typeof setTimeout> | null = null;
const DISCONNECT_NOTIFY_MS = 6_000;

function scheduleDisconnectNotify(reason: string) {
  if (Date.now() < _suppressDisconnectUntil) return;
  if (_disconnectNotifyTimer) return;
  _disconnectNotifyTimer = setTimeout(() => {
    _disconnectNotifyTimer = null;
    if (Date.now() < _suppressDisconnectUntil) {
      scheduleDisconnectNotify(reason);
      return;
    }
    const downFor = _sseErrorSince ? Date.now() - _sseErrorSince : DISCONNECT_NOTIFY_MS;
    // OPEN(첫 ping 대기) / 짧은 CONNECTING 은 네트워크 실패가 아님 — 타이머만 연장
    if (sseReadyStateBlocksNetDownUi(_es?.readyState, downFor)) {
      scheduleDisconnectNotify(reason);
      return;
    }
    diag('warn', 'sse', `disconnect:${reason}`);
    reportLinkDown(`sse:${reason}`);
    _disconnectCallbacks.forEach(fn => { try { fn(); } catch {} });
  }, DISCONNECT_NOTIFY_MS);
}

function cancelDisconnectNotify() {
  if (_disconnectNotifyTimer) {
    clearTimeout(_disconnectNotifyTimer);
    _disconnectNotifyTimer = null;
  }
}

// ─── Session readiness gate ───────────────────────────────────────────────────
// 문제: setLocalDbUserId(newUUID) → _currentUserId 즉시 갱신 → /op 요청 날림
//       그런데 loginSession(newUUID)는 비동기 → 아직 서버 세션은 구(舊) UUID
//       → 서버가 "session UUID ≠ body requesterId" → 403으로 전면 차단
// 해결: loginSession 완료 전까지 /op 요청을 대기열에 보관, 완료 후 일괄 해제
let _sessionReady = true;
let _sessionReadyResolve: (() => void) | null = null;
let _sessionReadyPromise: Promise<void> = Promise.resolve();

/** 쓰기·인증 SELECT 전 loginSession 성공까지 대기. 실패 시 false (무한 대기·미인증 요청 방지). */
async function _waitForSession(): Promise<boolean> {
  if (_sessionReady) return true;
  if (_currentUserId) void loginSession(_currentUserId);
  await Promise.race([
    _sessionReadyPromise,
    new Promise<void>(r => setTimeout(r, FETCH_TIMEOUT)),
  ]);
  return _sessionReady;
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
// 503(서버 과부하·콜드스타트) 및 네트워크 오류 시 지수 백오프 재시도
const MAX_BUSY_RETRIES = 5;
/** 401 시 loginSession 재시도 대상 — /op 와 storage API (Netlify 쿠키 단절·만료 Bearer) */
const AUTH_RETRY_PATHS = new Set(['/op', '/storage-upload', '/storage-remove']);

async function apiFetch(
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
  authRetry = false,
): Promise<{ data: unknown; error: unknown }> {
  const requestId = (extraHeaders?.['x-request-id'] ?? newRequestId());
  const started = Date.now();
  const opHint = (() => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return path;
    const b = body as Record<string, unknown>;
    return `${path}:${String(b.op ?? '')}:${String(b.table ?? '')}`;
  })();

  for (let attempt = 0; attempt <= MAX_BUSY_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
    try {
      const headers: Record<string, string> = {
        'x-request-id': requestId,
        ...(extraHeaders ?? {}),
      };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const resp = await fetch(`${API}${path}`, {
        method: body !== undefined ? 'POST' : 'GET',
        credentials: 'include',
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      // 503 콜드스타트·502/504 프록시·429 NAT 버스트는 첫 실패를 에러로 올리지 않고 재시도
      if (
        (resp.status === 503 || resp.status === 502 || resp.status === 504 || resp.status === 429)
        && attempt < MAX_BUSY_RETRIES
      ) {
        diag('warn', 'api', `${resp.status}-retry`, { corr: requestId, data: { op: opHint, attempt } });
        const fallbackSec = resp.status === 429 ? '3' : '2';
        const retryAfterSec = parseInt(resp.headers.get('Retry-After') ?? fallbackSec, 10);
        await new Promise<void>(r => setTimeout(r, Math.min(Math.max(retryAfterSec, 1) * 1000, 8_000)));
        continue;
      }
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        try {
          const json = JSON.parse(text) as { data?: unknown; error?: { message?: string; code?: string } };
          const errCode = json.error?.code;
          const errMsg = json.error?.message ?? '';
          const authMismatch = resp.status === 403 && errCode === 'FORBIDDEN'
            && errMsg.includes('requesterId must match');
          const needsAuthRetry = AUTH_RETRY_PATHS.has(path) && !authRetry && _currentUserId
            && (resp.status === 401 || authMismatch);
          if (needsAuthRetry && errCode !== 'FUNCTIONS_LOCKED') {
            _markSessionPending();
            _clearSessionBearer();
            if (await loginSession(_currentUserId)) {
              const retryBody = body && typeof body === 'object' && !Array.isArray(body)
                ? {
                  ...(body as Record<string, unknown>),
                  requesterId: (body as Record<string, unknown>).requesterId ?? _currentUserId,
                  sessionToken: _sessionBearerToken ?? undefined,
                }
                : body;
              return apiFetch(path, retryBody, { ...extraHeaders, 'x-request-id': requestId }, true);
            }
          }
          if (resp.status >= 500) {
            diag('error', 'api', `http-${resp.status}`, {
              corr: requestId,
              ms: Date.now() - started,
              data: { op: opHint, code: json.error?.code },
            });
          } else if (resp.status !== 429 && resp.status !== 403) {
            diag('warn', 'api', `http-${resp.status}`, {
              corr: requestId,
              ms: Date.now() - started,
              data: { op: opHint, code: json.error?.code },
            });
          }
          return {
            data: json.data ?? null,
            error: json.error ?? { message: `HTTP ${resp.status}` },
          };
        } catch {
          diag('error', 'api', `http-${resp.status}-raw`, { corr: requestId, ms: Date.now() - started, data: { op: opHint } });
          return { data: null, error: { message: `HTTP ${resp.status}` } };
        }
      }
      if (attempt > 0) {
        diag('info', 'api', 'ok-after-retry', { corr: requestId, ms: Date.now() - started, data: { op: opHint, attempt } });
      }
      return await resp.json();
    } catch (e) {
      clearTimeout(timer);
      if (attempt < MAX_BUSY_RETRIES) {
        diag('warn', 'api', 'net-retry', { corr: requestId, data: { op: opHint, attempt } });
        // 네트워크 오류 — 지수 백오프 후 재시도 (500ms → 1000ms → 2000ms)
        await new Promise<void>(r => setTimeout(r, 500 * Math.pow(2, attempt)));
        continue;
      }
      const msg = e instanceof Error ? e.message : String(e);
      diag('error', 'api', 'net-fail', { corr: requestId, ms: Date.now() - started, data: { op: opHint, err: msg.slice(0, 80) } });
      return { data: null, error: { message: msg } };
    }
  }
  diag('error', 'api', 'max-retries', { corr: requestId, ms: Date.now() - started, data: { op: opHint } });
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
    const hasUser = Boolean(_currentUserId);
    const needsAuth = tableNeedsSession(this._table, this._op, hasUser);
    const testTok = typeof localStorage !== 'undefined' ? (localStorage.getItem('test_token_v1') ?? '') : '';
    if (needsAuth && !testTok) {
      const sessionOk = await _waitForSession();
      if (!sessionOk) {
        return {
          data: null,
          error: { message: '로그인 세션이 필요합니다. 잠시 후 다시 시도해 주세요.', code: 'UNAUTHORIZED' },
        };
      }
    }
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
      // 세션 쿠키가 없을 때 requesterId를 보내면 서버가 401 — 프로필 목록 등 SELECT는 null로 공개 조회
      requesterId: (_sessionReady && _currentUserId) ? _currentUserId : null,
      sessionToken: (_sessionReady && _sessionBearerToken) ? _sessionBearerToken : undefined,
      adminToken: localStorage.getItem('admin_token_v1') ?? undefined, // admin bypass: included when logged in as admin
      testToken: localStorage.getItem('test_token_v1') ?? undefined,
    }) as Promise<DbResult<unknown>>;
  }
}

// ─── SSE realtime ─────────────────────────────────────────────────────────────
interface SseEvent {
  type: 'change' | 'broadcast' | 'ping' | 'instance' | 'shutdown' | 'catchup';
  instanceId?: string;
  missed?: number;
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

// Bearer sessionToken — Netlify 프록시에서 connect.sid 쿠키가 끊겨도 /op·SSE 인증 유지
let _sessionBearerToken: string | null = null;
const SESS_BEARER_KEY = 'session_bearer_v1';
const SESS_BEARER_UID_KEY = 'session_bearer_uid_v1';
const SESS_BEARER_EXP_KEY = 'session_bearer_exp_v1';

function _saveSessionBearer(userId: string, token: string, expiresAt: number) {
  _sessionBearerToken = token;
  try {
    sessionStorage.setItem(SESS_BEARER_KEY, token);
    sessionStorage.setItem(SESS_BEARER_UID_KEY, userId);
    sessionStorage.setItem(SESS_BEARER_EXP_KEY, String(expiresAt));
  } catch { /* ignore */ }
}

function _loadSessionBearer(userId: string): boolean {
  try {
    const uid = sessionStorage.getItem(SESS_BEARER_UID_KEY);
    const token = sessionStorage.getItem(SESS_BEARER_KEY);
    const exp = parseInt(sessionStorage.getItem(SESS_BEARER_EXP_KEY) ?? '0', 10);
    if (uid === userId && token && Math.floor(Date.now() / 1000) < exp - 60) {
      _sessionBearerToken = token;
      return true;
    }
  } catch { /* ignore */ }
  _sessionBearerToken = null;
  return false;
}

function _clearSessionBearer() {
  _sessionBearerToken = null;
  try {
    sessionStorage.removeItem(SESS_BEARER_KEY);
    sessionStorage.removeItem(SESS_BEARER_UID_KEY);
    sessionStorage.removeItem(SESS_BEARER_EXP_KEY);
  } catch { /* ignore */ }
}

function hasUsableSessionBearer(): boolean {
  if (!_sessionBearerToken) return false;
  try {
    const exp = parseInt(sessionStorage.getItem(SESS_BEARER_EXP_KEY) ?? '0', 10);
    return Math.floor(Date.now() / 1000) < exp - 60;
  } catch {
    return true;
  }
}

// SSE 재연결 감지 — 첫 연결이 아닌 재연결일 때 등록된 콜백 호출
let _sseHasConnected = false;     // 최초 연결 완료 여부
let _sseNeedsResync = false;      // 끊겼다가 재연결 대기 중 여부
const _reconnectCallbacks = new Set<() => void>();
const _disconnectCallbacks = new Set<() => void>();
const SSE_INSTANCE_KEY = 'sse_server_instance_v1';
let _serverInstanceId: string | null = null;
let _serverInstanceLoaded = false;

function rememberServerInstance(instanceId: unknown): boolean {
  if (typeof instanceId !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(instanceId)) return false;
  if (!_serverInstanceLoaded) {
    _serverInstanceLoaded = true;
    try { _serverInstanceId = sessionStorage.getItem(SSE_INSTANCE_KEY); } catch { /* ignore */ }
  }
  const switched = _serverInstanceId != null && _serverInstanceId !== instanceId;
  _serverInstanceId = instanceId;
  try { sessionStorage.setItem(SSE_INSTANCE_KEY, instanceId); } catch { /* ignore */ }
  return switched;
}

// 재연결 리싱크 합치기 — instance 핸드셰이크·_bulk_resync·zombie 재연결이 몇 백 ms 안에
// 연달아 오면 App.tsx + useChat 의 콜백이 매번 ~10개의 /op 요청을 쏜다(재연결 폭풍 → 429).
// leading-edge 로 첫 리싱크는 즉시 실행하고, 창 안의 중복은 한 번의 trailing 실행으로 합친다.
// (버리지 않고 합치는 것 — 마지막 상태 재동기화는 반드시 한 번 더 보장된다.)
const RESYNC_COALESCE_MS = 1_500;
let _lastResyncRunAt = 0;
let _pendingResyncTimer: ReturnType<typeof setTimeout> | null = null;
let _coalescedResyncCount = 0;

function _invokeReconnectCallbacks(): void {
  _lastResyncRunAt = Date.now();
  _reconnectCallbacks.forEach(fn => { try { fn(); } catch {} });
}

/** 재연결 리싱크 실행 — 짧은 창 안의 중복 호출은 1회로 합쳐진다. */
function runReconnectResync(): void {
  const waited = Date.now() - _lastResyncRunAt;
  if (waited >= RESYNC_COALESCE_MS) {
    _invokeReconnectCallbacks();
    return;
  }
  if (_pendingResyncTimer) { _coalescedResyncCount++; return; }
  _coalescedResyncCount++;
  _pendingResyncTimer = setTimeout(() => {
    _pendingResyncTimer = null;
    diag('debug', 'sse', 'resync-coalesced', { data: { merged: _coalescedResyncCount } });
    _coalescedResyncCount = 0;
    _invokeReconnectCallbacks();
  }, RESYNC_COALESCE_MS - waited);
}

function markSseMessageConnected(forceResync = false, reason = 'reconnected'): void {
  const shouldResync = forceResync || (_sseHasConnected && _sseNeedsResync);
  if (shouldResync) {
    _sseNeedsResync = false;
    diag('info', 'sse', reason);
    reportLinkUp('sse-message');
    runReconnectResync();
  } else if (_sseHasConnected) {
    reportLinkUp('sse-healthy');
  }
  _sseHasConnected = true;
}

// ── Ping 감시 (좀비 클라이언트 방어) ─────────────────────────────────────────
// 서버 keep-alive 주기: 15초. 타임아웃은 그 3배(45초)로 잡아 지터/지연으로 인한
// 오탐 재연결 폭풍을 막습니다. (이전: 15초 타임아웃 = 서버 주기와 동일 → 잦은 끊김)
let _lastPingAt = 0; // 마지막 ping/메시지 수신 시각 (0 = 아직 미연결)
const PING_TIMEOUT_MS = 45_000; // 서버 ping 15s × 3
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

/** 테스트용 — 장시간 세션에서 리스너/EventSource 누수·토큰 선제 갱신 검증 */
export function sseDebugState(): {
  listeners: number;
  hasEventSource: boolean;
  eventSourceReadyState: number | null;
  tokenSecondsLeft: number;
  hasRefreshTimer: boolean;
} {
  return {
    listeners: _sseListeners.size,
    hasEventSource: _es != null,
    eventSourceReadyState: _es ? _es.readyState : null,
    tokenSecondsLeft: sseTokenSecondsLeft(),
    hasRefreshTimer: _tokenRefreshTimer != null,
  };
}

/** 최근 ping/메시지 기준 SSE가 살아 있는지 — 폴링 간격 완화용 */
export function isSseHealthy(maxAgeMs = 25_000): boolean {
  if (!_sseHasConnected || _sseNeedsResync) return false;
  if (!_lastPingAt) return false;
  return Date.now() - _lastPingAt < maxAgeMs;
}

// SSE 인증 토큰 — 서버에서 발급한 HMAC 토큰으로 자신의 이벤트만 수신 가능
let _sseToken: string | null = null;
/** 현재 토큰 만료 시각(Unix 초). 0 = 만료 시각 미상. */
let _sseTokenExp = 0;

let _tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null;
const SSE_TOK_KEY = 'sse_tok';
const SSE_TOK_EXP_KEY = 'sse_tok_exp';

// 서버 토큰 TTL 은 1시간. 만료 뒤에만 갱신하면 EventSource 가 같은 URL 로 401 재시도
// → NAT 공인 IP 429 로 번진다. 수명의 80% 지점(남은 20%)에서 선제 갱신한다.
// 가드: SSE_TOKEN_REFRESH_LEAD_SEC 를 0 으로 되돌리거나 2s 점검에서 refreshSseTokenIfStale
// 를 빼면 localdb-long-session 테스트가 실패한다.
export const SSE_TOKEN_TTL_SEC = 3600;
export const SSE_TOKEN_REFRESH_LEAD_SEC = Math.floor(SSE_TOKEN_TTL_SEC * 0.2); // 720s = 80% TTL
/** 탭 복귀 시에는 더 일찍 갱신 — 잠든 동안 만료된 토큰으로 EventSource 401 재시도를 막는다. */
export const SSE_TOKEN_WAKE_REFRESH_LEAD_SEC = 20 * 60;
/** 서버 SSE 링 TTL(20분)과 맞춤. 이보다 오래 끊기면 Last-Event-ID 재전송을 포기하고 HTTP merge. */
const SSE_RING_STALE_MS = 20 * 60 * 1_000;
const SSE_TOKEN_MIN_REFRESH_GAP_MS = 30_000; // 갱신 재시도 최소 간격 (요청 증폭 방지)
let _lastTokenRefreshStartedAt = 0;

/** 150명이 동시에 입장하면 토큰 만료도 몰린다. userId 해시로 0~2분 분산. */
function sseRefreshJitterMs(userId: string | null): number {
  if (!userId) return 0;
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return h % 120_000;
}

/** 남은 토큰 수명(초). 토큰이 없으면 0, 만료 시각 미상이면 Infinity. */
function sseTokenSecondsLeft(): number {
  if (!_sseToken) return 0;
  if (!_sseTokenExp) return Number.POSITIVE_INFINITY;
  return _sseTokenExp - Math.floor(Date.now() / 1000);
}

/** 지금 서버에 보내도 401 이 나지 않을 토큰인지 (시계 오차 10초 여유). */
function hasUsableSseToken(): boolean {
  return sseTokenSecondsLeft() > 10;
}

/** 만료가 임박했으면 선제 재발급. 이미 진행 중이면 아무것도 하지 않는다. */
function refreshSseTokenIfStale(opts?: { wake?: boolean }): void {
  if (!_currentUserId) return;
  const lead = opts?.wake ? SSE_TOKEN_WAKE_REFRESH_LEAD_SEC : SSE_TOKEN_REFRESH_LEAD_SEC;
  const left = sseTokenSecondsLeft();
  if (left > lead) return;
  // 만료·임박 복귀는 30초 쿨다운을 건너뛰어 401 EventSource 재시도를 막는다.
  const minGap = opts?.wake && left <= 30 ? 2_000 : SSE_TOKEN_MIN_REFRESH_GAP_MS;
  if (Date.now() - _lastTokenRefreshStartedAt < minGap) return;
  if (_sseTokenRetryTimer) return; // 백오프 재시도 예약됨 — 중복 발사 금지
  void fetchAndSetSseToken(_currentUserId).catch(() => {});
}

// SSE 토큰 재시도 타이머 — userId 변경 시 명시적으로 취소
let _sseTokenRetryTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * SSE 재연결 시 localStorage 캐시 토큰을 복원합니다.
 * 실제 토큰 발급은 fetchAndSetSseToken(App.tsx에서 호출)이 담당합니다.
 * 이 함수는 캐시 확인 + SSE 재연결만 수행합니다.
 */
/** setSseToken·캐시 복원 공통 — 80% TTL 지점(+ userId 지터)에서 선제 재발급 예약 */
function scheduleSseTokenRefresh(expiresAt: number): void {
  if (_tokenRefreshTimer) { clearTimeout(_tokenRefreshTimer); _tokenRefreshTimer = null; }
  const refreshIn = (expiresAt - Math.floor(Date.now() / 1000) - SSE_TOKEN_REFRESH_LEAD_SEC) * 1000
    - sseRefreshJitterMs(_currentUserId);
  if (!_currentUserId) return;
  if (refreshIn > 0) {
    _tokenRefreshTimer = setTimeout(() => {
      if (_currentUserId) fetchAndSetSseToken(_currentUserId).catch(() => {});
    }, refreshIn);
  } else {
    refreshSseTokenIfStale();
  }
}

function fetchSseToken(userId: string): void {
  // localStorage 캐시 확인 — 선제 갱신 창(TTL 80%)에 들어갔으면 재사용하지 않음
  let restoredFromCache = false;
  try {
    const cached = localStorage.getItem(SSE_TOK_KEY);
    const exp = parseInt(localStorage.getItem(SSE_TOK_EXP_KEY) ?? '0', 10);
    const nowSec = Math.floor(Date.now() / 1000);
    if (cached && exp > nowSec + 10 && nowSec < exp - SSE_TOKEN_REFRESH_LEAD_SEC) {
      _sseToken = cached;
      _sseTokenExp = exp;
      scheduleSseTokenRefresh(exp);
      restoredFromCache = true;
    } else if (_currentUserId === userId && (!cached || exp <= nowSec + 10 || nowSec >= exp - SSE_TOKEN_REFRESH_LEAD_SEC)) {
      // 캐시 없음·만료·80% 창 — 즉시 재발급 (장시간 idle 후 401 방지)
      void fetchAndSetSseToken(userId).catch(() => {});
    }
  } catch { /* ignore */ }
  // userId가 일치할 때만 SSE 재연결 (userId 변경 경합 방지)
  if (_currentUserId === userId) {
    if (restoredFromCache || _sseToken) {
      closeSse();
      if (_sseListeners.size > 0) ensureSse();
    }
  }
}

/** 사용자 로그인/로그아웃 시 호출 — SSE를 userId 식별 연결로 재연결 */
export function setLocalDbUserId(userId: string | null) {
  if (_currentUserId === userId) return;
  _currentUserId = userId;
  _sseToken = null; // 사용자 변경 시 이전 토큰 폐기
  _sseTokenExp = 0;
  _lastTokenRefreshStartedAt = 0;
  _lastEventId = '';
  try { sessionStorage.removeItem('sse_last_event_id'); } catch { /* ignore */ }
  // userId 변경 → 이전 userId 대상 재시도 타이머 취소 (오래된 userId로 재시도되는 경쟁 방지)
  if (_sseTokenRetryTimer) { clearTimeout(_sseTokenRetryTimer); _sseTokenRetryTimer = null; }
  if (_tokenRefreshTimer) { clearTimeout(_tokenRefreshTimer); _tokenRefreshTimer = null; }
  suppressDisconnectBriefly(15_000);
  closeSse();
  if (!userId) {
    // 로그아웃: 토큰 캐시 삭제, 세션 게이트 즉시 해제
    _clearSessionBearer();
    _markSessionReady();
    try { localStorage.removeItem(SSE_TOK_KEY); localStorage.removeItem(SSE_TOK_EXP_KEY); } catch { /* ignore */ }
    if (_sseListeners.size > 0) ensureSse(); // 익명 SSE 유지
    return;
  }
  // userId가 바뀐 경우: loginSession 완료 전까지 /op 요청을 게이트로 차단
  // → 서버 세션(구 UUID)과 body.requesterId(신 UUID) 불일치로 인한 403 차단 방지
  _markSessionPending();
  if (_loadSessionBearer(userId)) _markSessionReady();
  void loginSession(userId);
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
  const base = Math.min(Math.pow(2, _sseFailCount) * 300, 15_000);
  const jitter = Math.random() * 1_000;
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
  const url = params.length ? `${SSE_API}/events?${params.join('&')}` : `${SSE_API}/events`;
  const es = new EventSource(url);
  es.onmessage = (ev) => {
    if (ev.lastEventId) {
      _lastEventId = ev.lastEventId;
      try { sessionStorage.setItem('sse_last_event_id', _lastEventId); } catch { /* ignore */ }
    }
    _lastPingAt = Date.now(); // Ping 감시: 마지막 수신 시각 갱신
    _sseErrorSince = null; // 메시지 수신 = 연결 정상
    cancelDisconnectNotify();

    let data: SseEvent | null = null;
    try { data = JSON.parse(ev.data) as SseEvent; } catch { /* malformed payload: connection is still alive */ }

    // ── 서버 재시작 신호: 백오프 없이 즉시 재연결 ──────────────────────────────
    // 서버가 SIGTERM/SIGINT 수신 시 모든 SSE 클라이언트에 {"type":"shutdown"}을 보냄.
    // 클라이언트는 백오프 카운터를 초기화하고 즉시 재연결하여 60s 대기를 1s 이하로 단축.
    if (data?.type === 'shutdown') {
        // 빠른 복구 모드 활성화 — SSE_SHUTDOWN_RECOVERY_MS 동안 onerror 시 백오프 누적 없음
        _shutdownRecoveryUntil = Date.now() + SSE_SHUTDOWN_RECOVERY_MS;
        // 실패 카운터·백오프 초기화
        _sseFailCount = 0;
        _sseNextAllowedRetry = 0;
        // 끊김 콜백 → UI 재연결 오버레이 표시 (debounced)
        if (_sseHasConnected) {
          _sseNeedsResync = true;
          scheduleDisconnectNotify('shutdown');
        }
        // ★ 핵심: es.close()를 호출하지 않음.
        //   서버가 'retry: 100\n' 필드를 보낸 후 res.end()로 연결을 닫으면,
        //   브라우저 내장 EventSource가 100ms 후 자동 재연결을 시도한다.
        //   여기서 es.close()를 호출하면 retry 지연값이 버려지고
        //   새 EventSource는 브라우저 기본값(~3s)으로 초기화된다.
        //   → 서버가 연결을 닫을 때 onerror가 자연스럽게 발생하도록 위임.
      return;
    }

    // 재연결 성공 → 실패 카운터·백오프 타이머 초기화
    _sseFailCount = 0;
    _sseNextAllowedRetry = 0;
    if (data?.type === 'instance') {
      const switched = rememberServerInstance(data.instanceId);
      markSseMessageConnected(switched, switched ? 'server-instance-switched' : 'reconnected');
      return;
    }
    // 링 재전송이 너무 커서 서버가 스킵함 → HTTP merge-by-id. _bulk_resync(전체 리로드) 아님.
    if (data?.type === 'catchup') {
      markSseMessageConnected(true, 'sse-catchup');
      return;
    }
    // 재연결 감지: 이전에 한 번 이상 연결됐었고, 끊김 이후 첫 메시지
    markSseMessageConnected();
    if (data) {
      // api-server 전체 리싱크 신호 (_bulk_resync:true) → 재연결 콜백 실행해 전체 데이터 리로드
      // resyncAllFromNativeDb() 호출 후 브로드캐스트되는 신호; 정상 row 이벤트와 구분
      if (data.type === 'change' && (data.newRow as Record<string, unknown> | null)?._bulk_resync) {
        runReconnectResync();
        return; // 개별 리스너에게 전파 불필요
      }
      if (
        data.type === 'change'
        && data.table
        && ['messages', 'likes', 'contact_shares', 'contact_share_events'].includes(data.table)
      ) {
        const row = data.newRow ?? data.oldRow;
        const rowId = typeof row?.id === 'string' ? row.id : null;
        diag('debug', 'realtime', 'client-receive', {
          corr: rowId ?? ev.lastEventId ?? undefined,
          data: {
            table: data.table,
            event: data.event,
            rowId,
            roomId: typeof row?.chat_id === 'string' ? row.chat_id : null,
            createdAt: typeof row?.created_at === 'string' ? row.created_at : null,
          },
        });
      }
      _sseListeners.forEach(fn => { try { fn(data); } catch {} });
    }
  };
  es.onerror = () => {
    // 일부 브라우저는 OPEN 상태에서도 onerror를 한 번 쏨 — 단절로 보지 않음
    if (es.readyState === EventSource.OPEN) return;
    const wasConnected = _sseHasConnected;
    if (!_sseErrorSince) {
      _sseErrorSince = Date.now();
      // 이전에 한 번이라도 연결된 적 있으면 — 즉시 모달하지 말고 debounce
      if (wasConnected) {
        scheduleDisconnectNotify('onerror');
      }
    }
    // 끊겼음을 기록 — 다음 메시지 수신 시 재연결 콜백 실행
    if (wasConnected) _sseNeedsResync = true;
    // CLOSED 상태면 실패 카운터 증가 후 백오프 쿨다운 설정
    // 단, 서버 재시작 복구 모드 중에는 카운터 증가·백오프 생략 (예상된 실패이므로)
    if (_currentUserId && !hasUsableSseToken()) {
      try { es.close(); } catch { /* ignore */ }
      if (_es === es) _es = null;
      refreshSseTokenIfStale();
      return;
    }
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

function closeSse(reason = 'close') {
  if (!_es) return;
  try { _es.close(); } catch { /* ignore */ }
  _es = null;
  if (reason) diag('debug', 'sse', reason);
}

function ensureSse() {
  // 로그인 사용자는 토큰이 생기기 전 익명 SSE에 붙지 않습니다.
  // 익명 연결은 채팅·하트 같은 비공개 이벤트를 받지 못해 메시지 누락의 주원인입니다.
  // 만료된 토큰도 마찬가지로 사용하지 않습니다 — 서버가 401 로 끊고 EventSource 가
  // 곧바로 같은 토큰으로 재시도해 무한 401 루프가 됩니다. 대신 재발급을 트리거합니다.
  if (_currentUserId && !hasUsableSseToken()) {
    // FORBIDDEN: 만료 EventSource 를 열린 채로 두지 말 것.
    // 브라우저 내장 EventSource 는 401 이후 같은 URL(만료 토큰)로 자동 재시도한다.
    // 닫지 않으면 행사 중후반에 401 폭풍 → IP rate-limit → 채팅/하트/시그널 전부 429.
    // localdb-long-session 테스트가 closeSse('expired-token-close') 를 요구한다.
    closeSse('expired-token-close');
    refreshSseTokenIfStale();
    return;
  }

  // [백오프 쿨다운] 연속 실패 후 정해진 시간 전에는 재연결 시도 안 함
  // 단, 서버 재시작 복구 모드 중에는 백오프를 무시하고 즉시 재시도
  if (!inShutdownRecovery() && _sseNextAllowedRetry && Date.now() < _sseNextAllowedRetry) return;

  // CONNECTING 상태가 12초 이상 지속되면 강제 재연결 (행사장 Wi‑Fi·Render 핸드셰이크)
  // ★ 복구 모드 중에는 강제 닫기 생략 — 브라우저가 retry:100 지연값을 기억한 채로
  //   자체 재시도 중이므로 es.close()를 호출하면 그 지연값이 리셋된다.
  if (!inShutdownRecovery() && _es && _es.readyState === EventSource.CONNECTING && _sseErrorSince && Date.now() - _sseErrorSince > 12_000) {
    closeSse('connecting-timeout');
    _sseErrorSince = null;
  }
  if (_es && _es.readyState !== EventSource.CLOSED) return;
  _sseErrorSince = null;
  _es = createSse();
}

// 2초마다 연결 상태 점검 — 끊어진 SSE를 자동 복구 (백오프 중에는 ensureSse가 자체 skip)
setInterval(() => {
  // 토큰 만료 선제 갱신은 리스너 유무와 무관 — 만료된 토큰으로 /unread-counts 등이 401 나는 것도 막는다.
  refreshSseTokenIfStale();

  if (_sseListeners.size === 0) return;

  // ── Ping 감시: 서버 keep-alive(15s)의 3배(45s) 이상 미수신 → 좀비 SSE 강제 재연결 ──
  // _lastPingAt > 0: 한 번 이상 연결된 적 있음
  // 현재 OPEN 상태지만 ping이 오지 않는다면 프록시가 연결을 silent-drop한 것
  if (
    _lastPingAt > 0 &&
    _es && _es.readyState === EventSource.OPEN &&
    Date.now() - _lastPingAt > PING_TIMEOUT_MS
  ) {
    diag('warn', 'sse', 'zombie-ping-timeout');
    _lastPingAt = 0;
    suppressDisconnectBriefly(12_000);
    closeSse();
    _sseNeedsResync = true;
    // 끊김만 알림 — 복구 콜백은 실제 메시지 수신 시에만 (오탐 모달 방지)
    scheduleDisconnectNotify('zombie');
    ensureSse();
    return;
  }

  ensureSse();
}, 1_500);

/**
 * 폰/탭 슬립 복귀 — 타이머·EventSource 가 멈춘 뒤 만료 토큰으로 401 폭풍이 나지 않게
 * 토큰을 먼저 갱신하고, 링 TTL 을 넘긴 Last-Event-ID 는 버린 뒤 HTTP merge-by-id 로 따라잡는다.
 * 예상된 재연결은 에러 UI 를 띄우지 않는다. _bulk_resync 는 여기서 쓰지 않는다.
 */
function recoverSseAfterSleep(reason: 'visible' | 'online'): void {
  diag('debug', 'sse', `wake:${reason}`);
  suppressDisconnectBriefly(20_000);
  cancelDisconnectNotify();
  _sseNextAllowedRetry = 0;

  const sleptMs = _lastPingAt > 0 ? Date.now() - _lastPingAt : 0;
  const ringStale = sleptMs > SSE_RING_STALE_MS;
  if (ringStale && _lastEventId) {
    _lastEventId = '';
    try { sessionStorage.removeItem('sse_last_event_id'); } catch { /* ignore */ }
    _sseNeedsResync = true;
    diag('info', 'sse', 'wake-ring-stale');
  }

  const zombie = !!_es && (
    _es.readyState !== EventSource.OPEN
    || (_lastPingAt > 0 && Date.now() - _lastPingAt > PING_TIMEOUT_MS)
  );
  if (zombie) {
    closeSse('wake-reconnect');
    _sseNeedsResync = true;
  }

  if (_currentUserId) refreshSseTokenIfStale({ wake: true });
  if (_sseListeners.size > 0) ensureSse();
  if (ringStale && _sseHasConnected) runReconnectResync();
}

// 탭/앱 포그라운드 복귀 시 즉시 토큰 점검 + SSE 재연결 (만료 URL 로 브라우저 401 재시도 금지)
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') recoverSseAfterSleep('visible');
  });
}

// 네트워크 복구(WiFi→LTE 전환, 공유기 재시작 등) 시 즉시 SSE 재연결
// SSE는 TCP 연결이라 visibilitychange와 독립적으로 끊길 수 있음
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    reportBrowserOnline();
    recoverSseAfterSleep('online');
    diag('info', 'net', 'browser-online');
  });
  window.addEventListener('offline', () => {
    reportBrowserOffline();
    diag('warn', 'net', 'browser-offline');
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
      if (_sseListeners.size === 0) closeSse('idle');
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
          await uploadStorageDataUrl(path, dataUrl, _currentUserId ?? undefined);
          return { data: { path }, error: null };
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

/** Netlify 프록시에서 connect.sid 쿠키가 끊겨도 sessionToken으로 storage 인증 ( /op 와 동일 ). */
export async function uploadStorageDataUrl(
  path: string,
  dataUrl: string,
  userId?: string | null,
): Promise<void> {
  const uid = userId ?? _currentUserId;
  if (!uid) throw new Error('로그인 세션이 필요합니다.');
  // /op 와 동일: loginSession 완료 전 requesterId만 보내면 storage-upload 가 401
  const sessionOk = await _waitForSession();
  if (!sessionOk) {
    throw new Error('로그인 세션이 필요합니다. 잠시 후 다시 시도해 주세요.');
  }
  if (!hasUsableSessionBearer() && _currentUserId === uid) {
    if (!(await loginSession(uid))) {
      throw new Error('로그인 세션이 필요합니다. 잠시 후 다시 시도해 주세요.');
    }
  }
  const result = await apiFetch('/storage-upload', {
    path,
    dataUrl,
    requesterId: uid,
    sessionToken: (_sessionReady && _sessionBearerToken) ? _sessionBearerToken : undefined,
  }) as { data: { path: string } | null; error: { message: string } | null };
  if (result.error) {
    throw new Error(result.error.message ?? '사진 업로드 실패');
  }
}

/**
 * 채팅 이미지 <img> 용 — Netlify 쿠키 단절 시 sessionToken query로 인증.
 * profile-photos·blob·이미 토큰이 붙은 URL은 그대로 둔다.
 */
export function withChatImageAuth(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('blob:') || url.startsWith('data:')) return url;
  if (!url.includes('/api/db/storage-image')) return url;
  if (/[?&]p=profile-photos%2F|[?&]p=profile-photos\//.test(url)) return url;
  if (/[?&]sessionToken=/.test(url) || /[?&]adminToken=/.test(url)) return url;
  const uid = _currentUserId;
  const token = (_sessionReady && _sessionBearerToken) ? _sessionBearerToken : null;
  if (!uid || !token) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}userId=${encodeURIComponent(uid)}&sessionToken=${encodeURIComponent(token)}`;
}

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
let _sseTokenFetchInFlight: { userId: string; promise: Promise<void> } | null = null;

export function fetchAndSetSseToken(userId: string, attempt = 0): Promise<void> {
  // App.tsx 의 여러 경로(userId effect · 프로필 로드 · 복구)가 같은 순간에 호출한다.
  // 합치지 않으면 부팅 한 번에 /auth/login + /auth/sse-token 이 여러 벌 나간다.
  if (_sseTokenFetchInFlight && _sseTokenFetchInFlight.userId === userId) {
    return _sseTokenFetchInFlight.promise;
  }
  const promise = _fetchAndSetSseToken(userId, attempt);
  const entry = { userId, promise };
  _sseTokenFetchInFlight = entry;
  return promise.finally(() => {
    if (_sseTokenFetchInFlight === entry) _sseTokenFetchInFlight = null;
  });
}

async function _fetchAndSetSseToken(userId: string, attempt: number): Promise<void> {
  // 이전 재시도 타이머 초기화 (중복 재시도 방지)
  if (_sseTokenRetryTimer) { clearTimeout(_sseTokenRetryTimer); _sseTokenRetryTimer = null; }
  _lastTokenRefreshStartedAt = Date.now();

  /** 모든 실패 경로에서 호출 — 지수 백오프(5s→10s→20s→40s→최대 60s) + 지터로 재시도 예약 */
  const scheduleRetry = (reason: string) => {
    if (_currentUserId !== userId) return; // userId 변경됐으면 재시도 불필요
    const baseDelay = Math.min(Math.pow(2, attempt) * 5_000, 60_000);
    const jitter = Math.random() * 2_000; // thundering herd 방지
    const delayMs = baseDelay + jitter;
    diag('warn', 'sse', 'token-retry', { data: { reason: reason.slice(0, 80), attempt: attempt + 1, delayMs } });
    _sseTokenRetryTimer = setTimeout(() => {
      _sseTokenRetryTimer = null;
      if (_currentUserId === userId) fetchAndSetSseToken(userId, attempt + 1).catch(() => {});
    }, delayMs);
  };

  try {
    // 세션 Bearer 가 아직 유효하면 /auth/login 을 다시 치지 않는다.
    // 150명이 48분마다 login 을 같은 NAT IP 로 치면 분당 10회 IP 한도에 걸린다.
    if (!hasUsableSessionBearer()) {
      const loggedIn = await loginSession(userId);
      if (!loggedIn) {
        // device_not_bound·네트워크 오류 모두 재시도 (익명 SSE 영구 고착 방지)
        scheduleRetry('loginSession 실패');
        return;
      }
    }
    // 경합 방지: 비동기 대기 중 계정이 바뀐 경우 토큰을 설치하지 않음
    if (_currentUserId !== userId) return;

    // 2단계: 세션이 수립된 브라우저에만 SSE 토큰 발급
    const resp = await fetch(`${API}/auth/sse-token`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, sessionToken: _sessionBearerToken }),
    });
    if (!resp.ok) {
      // 세션이 죽은 것처럼 보여도 7일 기기 세션이 살아 있으면 재로그인 후 조용히 재발급.
      // 앱에서 로그아웃하지 않는다. /op 전체를 게이트하지 않는다.
      if (resp.status === 401) {
        _clearSessionBearer();
      }
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

/**
 * 현재 SSE 토큰 반환 — push/subscribe·unread-counts 등 인증이 필요한 요청에서 사용.
 * 만료된 토큰은 서버에서 401 + [SECURITY] 경고 로그를 만들 뿐이므로 null 로 취급하고
 * 동시에 재발급을 예약한다. 호출부는 null 이면 요청 자체를 건너뛰면 된다.
 */
export function getSseToken(): string | null {
  if (!hasUsableSseToken()) {
    refreshSseTokenIfStale();
    return null;
  }
  return _sseToken;
}

/** 서버에서 발급받은 SSE 토큰 저장 및 SSE 재연결. expiresAt은 Unix 초. */
export function setSseToken(token: string, expiresAt: number) {
  _sseToken = token;
  _sseTokenExp = expiresAt;
  // #4: localStorage에 토큰 캐시 저장 → 앱 재시작 후에도 재연결 없이 즉시 재사용
  try {
    localStorage.setItem(SSE_TOK_KEY, token);
    localStorage.setItem(SSE_TOK_EXP_KEY, String(expiresAt));
  } catch { /* storage quota 초과 시 무시 — 메모리 캐시로 폴백 */ }
  scheduleSseTokenRefresh(expiresAt);
  // 새 토큰으로 SSE 재연결. 브라우저가 EventSource를 새로 만들면 Last-Event-ID 헤더가
  // 사라지므로 lastEventId 쿼리로 링 캐치업한다. 건강한 선제 갱신마다 HTTP 전체 리로드하면
  // 48분마다 채팅이 끊기므로, 끊겼던 경우에만 merge-by-id 콜백을 예약한다.
  const needsCatchup = _sseNeedsResync
    || !_sseHasConnected
    || (_lastPingAt > 0 && Date.now() - _lastPingAt > PING_TIMEOUT_MS);
  suppressDisconnectBriefly(15_000);
  if (needsCatchup) _sseNeedsResync = true;
  closeSse();
  if (_sseListeners.size > 0) ensureSse();
}

const DEVICE_SECRET_PREFIX = 'bolt_device_secret_';
/** PIN 프로필 복구 시 /auth/login에 pinCode 전달 — 새 기기 device re-bind */
let _pendingPinCode: string | null = null;

export function setDeviceRecoveryPin(pin: string | null): void {
  _pendingPinCode = pin ? pin.trim() : null;
}

/**
 * userId + deviceSecret으로 서버 세션을 수립합니다.
 * deviceSecret은 localStorage에만 있는 값이므로
 * userId만 아는 공격자는 세션을 얻을 수 없습니다.
 */
const LOGIN_MAX_ATTEMPTS = 4;

// 세션 수립은 반드시 한 번에 하나만 — 부팅 시 setLocalDbUserId · fetchAndSetSseToken ·
// 세션 게이트를 기다리는 모든 /op 쿼리가 각자 loginSession 을 부르면 기기 한 대가
// /auth/login 을 6~10번 쏜다. 행사장 NAT 처럼 IP 를 공유하면 그대로 429 가 된다.
let _loginInFlight: { userId: string; promise: Promise<boolean> } | null = null;

function loginSession(userId: string): Promise<boolean> {
  if (_loginInFlight && _loginInFlight.userId === userId) return _loginInFlight.promise;
  const promise = _loginSessionAttempt(userId, 0);
  const entry = { userId, promise };
  _loginInFlight = entry;
  return promise.finally(() => {
    if (_loginInFlight === entry) _loginInFlight = null;
  });
}

async function _loginSessionAttempt(userId: string, attempt: number): Promise<boolean> {
  try {
    const deviceSecret = getDeviceSecret(userId);
    const resp = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        deviceSecret,
        ...( _pendingPinCode ? { pinCode: _pendingPinCode } : {}),
        ...(typeof localStorage !== 'undefined' && localStorage.getItem('test_token_v1')
          ? { testToken: localStorage.getItem('test_token_v1') }
          : {}),
      }),
      credentials: 'include',
    });
    if (!resp.ok) {
      // 401 은 결정적 인증 실패(기기 불일치·알 수 없는 userId)다. 같은 자격증명으로
      // 재시도해도 결과가 바뀌지 않으므로 401 을 3번 더 만들 뿐 — 즉시 포기한다.
      if (resp.status === 401) {
        const body = await resp.json().catch(() => ({})) as { code?: string };
        if (body.code === 'DEVICE_MISMATCH') {
          console.warn('[localdb] 기기 불일치 — 고유번호(PIN)로 프로필 복구를 이용하세요.');
          return false;
        }
        // Unknown userId 등은 콜드스타트 중 빈 스토어일 수 있음 — 로그아웃하지 않고 조용히 재시도
        if (attempt + 1 < LOGIN_MAX_ATTEMPTS) {
          await new Promise<void>(r => setTimeout(r, 1_000 * Math.pow(2, attempt)));
          return _loginSessionAttempt(userId, attempt + 1);
        }
        return false;
      }
      if (attempt + 1 < LOGIN_MAX_ATTEMPTS) {
        const delay = resp.status === 429 ? 3_000 * (attempt + 1) : 1_000 * Math.pow(2, attempt);
        await new Promise<void>(r => setTimeout(r, delay));
        return _loginSessionAttempt(userId, attempt + 1);
      }
      return false;
    }
    _pendingPinCode = null;
    const data = await resp.json().catch(() => ({})) as { sessionToken?: string; sessionExpiresAt?: number };
    if (data.sessionToken && data.sessionExpiresAt) {
      _saveSessionBearer(userId, data.sessionToken, data.sessionExpiresAt);
    }
    if (_currentUserId === userId) _markSessionReady();
    return true;
  } catch {
    if (attempt + 1 < LOGIN_MAX_ATTEMPTS) {
      await new Promise<void>(r => setTimeout(r, 1_000 * Math.pow(2, attempt)));
      return _loginSessionAttempt(userId, attempt + 1);
    }
    return false;
  }
}

/** Critical writes (likes, chat) — loginSession 완료 + bearer 확보까지 대기 (mobile Safari). */
export async function ensureWriteSession(): Promise<boolean> {
  const userId = _currentUserId;
  if (!userId) return false;
  if (!hasUsableSessionBearer()) {
    _markSessionPending();
    if (!(await loginSession(userId))) return false;
  }
  const ready = await _waitForSession();
  return ready && hasUsableSessionBearer();
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
