/**
 * 집계 전용 관측 카운터.
 *
 * 프로덕션에서 "401 이 늘었나 / 재연결 폭풍인가 / 업로드가 왜 막히나" 를 볼 수 있게
 * 숫자만 모은다. 메시지 본문·연락처·userId·토큰·IP 는 절대 저장하지 않는다.
 * 저장하는 것은 라우트 분류 문자열과 정수 카운터뿐이다.
 */

/** 401/403/429 를 묶어서 볼 라우트 분류. URL 원문 대신 이 고정 목록만 기록한다. */
export type RouteClass =
  | 'op'
  | 'events'
  | 'unread-counts'
  | 'sse-token'
  | 'auth-login'
  | 'storage'
  | 'push'
  | 'admin'
  | 'broadcast'
  | 'other';

export const ROUTE_CLASSES: readonly RouteClass[] = [
  'op', 'events', 'unread-counts', 'sse-token', 'auth-login',
  'storage', 'push', 'admin', 'broadcast', 'other',
];

/** 업로드 거절 사유 — 8M/9M 캡인지 MIME/매직바이트인지 구분해서 본다. */
export type UploadRejectReason =
  | 'size_cap'
  | 'mime'
  | 'magic'
  | 'path'
  | 'forbidden'
  | 'rate_limited'
  | 'unauthenticated'
  | 'other';

export const UPLOAD_REJECT_REASONS: readonly UploadRejectReason[] = [
  'size_cap', 'mime', 'magic', 'path', 'forbidden', 'rate_limited', 'unauthenticated', 'other',
];

export interface HttpMetricsSnapshot {
  since: string;
  unauthorized: Record<RouteClass, number>;
  forbidden: Record<RouteClass, number>;
  rateLimited: Record<RouteClass, number>;
  /** 만료된(서명은 정상) SSE 토큰으로 들어온 요청 — 클라이언트 갱신 실패 신호 */
  expiredSseTokens: number;
  /** 토큰 자체가 없는 요청 — 로그인 전 정상 프로브일 수 있음 */
  missingSseTokens: number;
  sseConnectionsAccepted: number;
  sseConnectionsClosed: number;
  uploadRejections: Record<UploadRejectReason, number>;
  uploadsAccepted: number;
}

function emptyRouteCounters(): Record<RouteClass, number> {
  const out = {} as Record<RouteClass, number>;
  for (const c of ROUTE_CLASSES) out[c] = 0;
  return out;
}

function emptyUploadCounters(): Record<UploadRejectReason, number> {
  const out = {} as Record<UploadRejectReason, number>;
  for (const r of UPLOAD_REJECT_REASONS) out[r] = 0;
  return out;
}

let _since = Date.now();
let _unauthorized = emptyRouteCounters();
let _forbidden = emptyRouteCounters();
let _rateLimited = emptyRouteCounters();
let _expiredSseTokens = 0;
let _missingSseTokens = 0;
let _sseAccepted = 0;
let _sseClosed = 0;
let _uploadRejections = emptyUploadCounters();
let _uploadsAccepted = 0;

export function recordUnauthorized(route: RouteClass): void { _unauthorized[route]++; }
export function recordForbidden(route: RouteClass): void { _forbidden[route]++; }
export function recordRateLimited(route: RouteClass): void { _rateLimited[route]++; }
export function recordExpiredSseToken(): void { _expiredSseTokens++; }
export function recordMissingSseToken(): void { _missingSseTokens++; }
export function recordSseAccepted(): void { _sseAccepted++; }
export function recordSseClosed(): void { _sseClosed++; }
export function recordUploadRejected(reason: UploadRejectReason): void { _uploadRejections[reason]++; }
export function recordUploadAccepted(): void { _uploadsAccepted++; }

export function snapshotHttpMetrics(): HttpMetricsSnapshot {
  return {
    since: new Date(_since).toISOString(),
    unauthorized: { ..._unauthorized },
    forbidden: { ..._forbidden },
    rateLimited: { ..._rateLimited },
    expiredSseTokens: _expiredSseTokens,
    missingSseTokens: _missingSseTokens,
    sseConnectionsAccepted: _sseAccepted,
    sseConnectionsClosed: _sseClosed,
    uploadRejections: { ..._uploadRejections },
    uploadsAccepted: _uploadsAccepted,
  };
}

/** 관리자 화면에서 "이 시점부터 다시 세기" 용. 테스트 격리에도 쓴다. */
export function resetHttpMetrics(now = Date.now()): void {
  _since = now;
  _unauthorized = emptyRouteCounters();
  _forbidden = emptyRouteCounters();
  _rateLimited = emptyRouteCounters();
  _expiredSseTokens = 0;
  _missingSseTokens = 0;
  _sseAccepted = 0;
  _sseClosed = 0;
  _uploadRejections = emptyUploadCounters();
  _uploadsAccepted = 0;
}

/** Express req.path → RouteClass. 알 수 없는 경로는 'other'. */
export function classifyRoute(path: string): RouteClass {
  const p = path.split('?')[0];
  if (p.startsWith('/api/db/op') || p === '/op') return 'op';
  if (p.startsWith('/api/db/events') || p === '/events') return 'events';
  if (p.includes('/unread-counts')) return 'unread-counts';
  if (p.includes('/auth/sse-token')) return 'sse-token';
  if (p.includes('/auth/login')) return 'auth-login';
  if (p.includes('/storage-')) return 'storage';
  if (p.includes('/push/')) return 'push';
  if (p.includes('/admin')) return 'admin';
  if (p.includes('/broadcast')) return 'broadcast';
  return 'other';
}
