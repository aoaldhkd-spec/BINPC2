import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import session from "express-session";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

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
 * trusted proxy hop when `trust proxy` is configured.  This cannot be
 * spoofed by the client: Replit's reverse proxy always appends the real
 * remote address, and `trust proxy: 1` tells Express to trust exactly one
 * hop, so any client-injected X-Forwarded-For entries are ignored.
 */
function makeRateLimiter(maxRequests: number, windowMs: number, namespace: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // req.ip is set by Express after applying the trust-proxy setting.
    // Fall back to the raw socket address only if somehow unset.
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const key = `${namespace}:${ip}`;
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

// SESSION_SECRET는 반드시 환경변수로 설정되어야 합니다.
// 개발 환경에서도 빈 값 없이 사용하세요.
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  throw new Error('SESSION_SECRET environment variable is required');
}

const app: Express = express();

// Trust exactly one upstream proxy hop (Replit's reverse proxy).
// This lets Express populate req.ip from the rightmost X-Forwarded-For entry
// added by Replit's infrastructure, which the client cannot spoof.
app.set('trust proxy', 1);

// ─── Security headers (helmet) ────────────────────────────────────────────────
// Helmet sets X-Frame-Options, X-Content-Type-Options, X-XSS-Protection,
// Strict-Transport-Security, Referrer-Policy, etc. in one shot.
// CSP is disabled here because the SPA uses inline scripts/styles (Vite/React).
// crossOriginEmbedderPolicy is disabled to allow external avatar images/fonts.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// 세션 미들웨어 — userId를 httpOnly 서명 쿠키로 관리
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    // trust proxy:1 이 설정되어 있으므로 Replit 프록시의 HTTPS가 올바르게 감지됨
    secure: process.env.NODE_ENV !== 'test', // 테스트 환경 제외 항상 secure
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7일
  },
}));

app.use(
  pinoHttp({
    logger,
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
// Same-origin only: frontend & backend share the same Replit domain.
// origin:false sends no CORS headers → browser same-origin policy blocks
// cross-site requests automatically, closing CSRF-style API attacks.
app.use(cors({ origin: false }));
// 최대 이미지 크기(~7MB base64) 고려해 10MB로 제한 — 50MB는 DoS 위험
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Per-IP rate limits applied before the main router.
// The third argument is a stable namespace that isolates each endpoint's
// quota bucket regardless of how Express resolves req.path at the mount point.
//   /api/auth/login       — 5 req/s : one shot per login attempt; blocks brute-force
//   /api/op               — 30 req/s: burst-safe for initial data load (~10-15 req/s)
//   /api/db/storage-upload— 20 per 60 s: image uploads are large; prevent spam uploads
//   /api/db/events        — 20 per 60 s: SSE connections; blocks token-farming bots
//   /api/db/unread-counts — 60 per 60 s: polling at ~1 req/s max per client
app.use('/api/auth/login',          makeRateLimiter(5,  1_000,  'auth-login'));
app.use('/api/op',                  makeRateLimiter(30, 1_000,  'op'));
app.use('/api/db/storage-upload',   makeRateLimiter(20, 60_000, 'storage-upload'));
app.use('/api/db/events',           makeRateLimiter(20, 60_000, 'sse-events'));
app.use('/api/db/unread-counts',    makeRateLimiter(60, 60_000, 'unread-counts'));
// SSE 토큰 발급: 분당 10회 (토큰 파밍 봇 차단)
app.use('/api/db/auth/sse-token',   makeRateLimiter(10, 60_000, 'sse-token'));
// RPC 어드민 엔드포인트: 분당 30회 (비밀번호 브루트포스 방어)
app.use('/api/db/rpc',              makeRateLimiter(30, 60_000, 'rpc'));

app.use("/api", router);

export default app;
