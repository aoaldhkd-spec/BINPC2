import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { createSessionMiddleware } from "./lib/session";
import { mountProductionSpa } from "./lib/static-spa";
import { classifyRoute, recordForbidden, recordRateLimited, recordUnauthorized } from "./lib/http-metrics";

// ─── Per-IP sliding-window rate limiter ───────────────────────────────────────
// Tracks request timestamps per IP in a sliding window.
// JavaScript is single-threaded so Map ops are inherently race-free.

interface RateLimitEntry {
  timestamps: number[];
}

const _rateLimitStore = new Map<string, RateLimitEntry>();

// Prune stale entries every 60 s to prevent unbounded memory growth
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [key, entry] of _rateLimitStore) {
    if (!entry.timestamps.length || entry.timestamps[entry.timestamps.length - 1] < cutoff) {
      _rateLimitStore.delete(key);
    }
  }
}, 60_000).unref();

/**
 * Build an Express middleware that allows at most `maxRequests` requests
 * within a rolling `windowMs` window, keyed by `namespace` (explicit, stable
 * per-endpoint string) + trusted client IP.
 *
 * Pass an explicit `namespace` instead of relying on `req.path`, because
 * Express sets `req.path` relative to the mount point — so every middleware
 * mounted at a specific path sees `req.path === '/'`, making path-based keys
 * ambiguous when multiple limiters share the same store.
 *
 * IP is taken from `req.ip`, which Express populates from the rightmost
 * trusted proxy hop when `trust proxy` is configured. `trust proxy: 1`
 * tells Express to trust exactly one upstream proxy hop.
 */
function makeRateLimiter(maxRequests: number, windowMs: number, namespace: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
      next();
      return;
    }
    // req.ip is set by Express after applying the trust-proxy setting.
    // Fall back to the raw socket address only if somehow unset.
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    // Venue NAT: 같은 WiFi IP를 수십~수백 명이 공유하면 IP 버킷이 즉시 고갈됨.
    // 인증된 사용자(requesterId / session)가 있으면 사용자 단위로 분리해 파티 규모를 견딤.
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>)
      : null;
    const bodyUid = body?.requesterId != null ? String(body.requesterId) : '';
    const sessionUid = (() => {
      try {
        const s = (req as Request & { session?: { userId?: string } }).session;
        return s?.userId ? String(s.userId) : '';
      } catch { return ''; }
    })();
    const loginNick = body?.nickname != null ? String(body.nickname).trim() : '';
    const queryUid = typeof req.query?.userId === 'string' ? String(req.query.userId) : '';
    const identity = bodyUid || sessionUid || queryUid || (namespace === 'auth-login' && loginNick ? `nick:${loginNick}` : '');
    const key = identity ? `${namespace}:id:${identity}` : `${namespace}:ip:${ip}`;
    const now = Date.now();
    const cutoff = now - windowMs;

    let entry = _rateLimitStore.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      _rateLimitStore.set(key, entry);
    }

    // Drop timestamps outside the window
    let lo = 0;
    while (lo < entry.timestamps.length && entry.timestamps[lo] < cutoff) lo++;
    if (lo > 0) entry.timestamps.splice(0, lo);

    if (entry.timestamps.length >= maxRequests) {
      // Oldest timestamp + windowMs tells the client when a slot opens
      const retryAfterMs = entry.timestamps[0] + windowMs - now;
      const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        error: { message: 'Too many requests — slow down and retry', code: 'RATE_LIMIT' },
      });
      return;
    }

    entry.timestamps.push(now);
    next();
  };
}

const app: Express = express();

// 운영 환경에서는 기존과 동일하게 프록시 한 단계를 신뢰합니다.
// 로컬에서는 직접 접속하므로 전달된 IP 헤더를 신뢰하지 않습니다.
app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);

// ─── Security headers (helmet) ────────────────────────────────────────────────
// Helmet sets X-Frame-Options, X-Content-Type-Options, X-XSS-Protection,
// Strict-Transport-Security, Referrer-Policy, etc. in one shot.
// CSP is disabled here because the SPA uses inline scripts/styles (Vite/React).
// crossOriginEmbedderPolicy is disabled to allow external avatar images/fonts.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// ─── Auth/rate-limit 결과 집계 ────────────────────────────────────────────────
// 401/403/429 를 라우트 분류별 정수 카운터로만 모은다 (관리자 DB헬스 탭에서 조회).
// 본문·쿼리·IP·userId 는 기록하지 않는다.
app.use((req, res, next) => {
  res.on('finish', () => {
    const status = res.statusCode;
    if (status !== 401 && status !== 403 && status !== 429) return;
    const route = classifyRoute(req.path);
    if (status === 401) recordUnauthorized(route);
    else if (status === 403) recordForbidden(route);
    else recordRateLimited(route);
  });
  next();
});

// 세션 미들웨어 — SSE·헬스체크는 HMAC/토큰 인증이라 PG 세션 조회 생략
const sessionMiddleware = createSessionMiddleware();
const SESSIONLESS_PATHS = [
  '/api/healthz',
  '/api/db/events',
  '/api/db/unread-counts',
  '/api/db/push/vapid-key',
  '/api/db/ready',
  '/api/db/by-pin',
  '/api/db/op',
  '/api/db/rpc',
];
app.use((req, res, next) => {
  const path = req.path;
  if (SESSIONLESS_PATHS.some(p => path === p || path.startsWith(`${p}?`))) {
    return next();
  }
  return sessionMiddleware(req, res, next);
});

app.use(
  pinoHttp({
    logger,
    genReqId(req, res) {
      const incoming = req.headers['x-request-id'];
      const id = typeof incoming === 'string' && incoming.length > 0 && incoming.length < 80
        ? incoming
        : `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      res.setHeader('x-request-id', id);
      return id;
    },
    customProps(req) {
      return { requestId: req.id };
    },
    autoLogging: {
      ignore: (req) =>
        req.url?.startsWith('/api/healthz') === true ||
        req.url?.startsWith('/api/db/events') === true,
    },
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// HTTP API는 same-origin(Netlify 프록시)만 허용 — CSRF 차단.
// SSE(/api/db/events)만 Netlify→Render 직접 연결을 위해 CORS 허용
// (Netlify 프록시는 event-stream 버퍼링으로 실시간 이벤트를 유실시킴)
const SSE_CORS_ORIGINS = new Set(
  String(process.env.SSE_CORS_ORIGINS ?? 'https://binpc2.netlify.app')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);
app.use('/api/db/events', cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true); // same-origin / non-browser
    if (SSE_CORS_ORIGINS.has(origin) || origin.endsWith('.netlify.app')) return cb(null, true);
    return cb(null, false);
  },
  methods: ['GET', 'HEAD', 'OPTIONS'],
  allowedHeaders: ['Last-Event-ID', 'Accept', 'Cache-Control'],
  maxAge: 86400,
}));
app.use(cors({ origin: false }));
// 최대 이미지 크기(~7MB base64) 고려해 10MB로 제한 — 50MB는 DoS 위험
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Per-IP rate limits — 술번개(동시 입장 버스트) 규모를 기본으로 두고 env로 조절 가능.
//   login     : 초당 N (동시 입장)
//   op        : 초당 N (초기 데이터 로드 + 채팅)
//   events    : 분당 N (SSE 연결 버스트; 옛 20/min 은 파티 WiFi 에서 즉시 고갈)
//   sse-token : 분당 N
const RL_LOGIN_PER_SEC = Number(process.env.RL_LOGIN_PER_SEC ?? 80);
const RL_OP_PER_SEC = Number(process.env.RL_OP_PER_SEC ?? 150);
const RL_SSE_CONN_PER_MIN = Number(process.env.RL_SSE_CONN_PER_MIN ?? 500);
const RL_SSE_TOKEN_PER_MIN = Number(process.env.RL_SSE_TOKEN_PER_MIN ?? 500);
const RL_UNREAD_PER_MIN = Number(process.env.RL_UNREAD_PER_MIN ?? 600);

app.use('/api/db/auth/login',       makeRateLimiter(RL_LOGIN_PER_SEC, 1_000, 'auth-login'));
app.use('/api/db/op',               makeRateLimiter(RL_OP_PER_SEC, 1_000, 'op'));
app.use('/api/db/storage-upload',   makeRateLimiter(20, 60_000, 'storage-upload'));
app.use('/api/db/storage-remove',   makeRateLimiter(20, 60_000, 'storage-remove'));
app.use('/api/db/events',           makeRateLimiter(RL_SSE_CONN_PER_MIN, 60_000, 'sse-events'));
app.use('/api/db/unread-counts',    makeRateLimiter(RL_UNREAD_PER_MIN, 60_000, 'unread-counts'));
app.use('/api/db/auth/sse-token',   makeRateLimiter(RL_SSE_TOKEN_PER_MIN, 60_000, 'sse-token'));
app.use('/api/db/rpc',              makeRateLimiter(30, 60_000, 'rpc'));

app.use("/api", router);

mountProductionSpa(app);

// ── 전역 Express 에러 미들웨어 — 모든 라우트 핸들러의 throw/reject를 포착 ────
// Express async 핸들러가 throw하면 next(err)로 넘어와 여기서 처리.
// 반드시 router 등록 이후, export 이전에 위치해야 함.
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, '[EXPRESS] Unhandled route error');
  if (!res.headersSent) {
    res.status(500).json({ data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
  }
});

export default app;
