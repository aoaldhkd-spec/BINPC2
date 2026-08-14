import './lib/dns-ipv4-first.js';
import app from "./app";
import { logger } from "./lib/logger";
import { pgPool } from "./lib/pg-pool.js";
import { gracefulShutdown } from "./routes/db";

// ── 전역 비동기 예외 처리 — 서버 프로세스 다운 방지 ─────────────────────────
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, '[FATAL] Unhandled promise rejection — 서버는 유지됩니다');
});
process.on('uncaughtException', (err) => {
  logger.error({ err }, '[FATAL] Uncaught exception — 프로세스를 안전하게 종료합니다');
  process.exit(1);
});

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  // 첫 유저 요청 전에 PG 커넥션·DNS 워밍 — Render 콜드스타트 후 첫 채팅/하트 지연 완화
  void pgPool.query('SELECT 1')
    .then(() => logger.info('PG pool warmed'))
    .catch((err) => logger.warn({ err }, 'PG warm-up failed'));
});

// ── Graceful shutdown: SIGTERM(컨테이너 종료)·SIGINT(Ctrl+C) 시 자원 정리 ──
// DB 커넥션·LISTEN 클라이언트·SSE 소켓이 강제 종료되지 않도록 순서대로 정리
async function shutdown(signal: string) {
  logger.info({ signal }, 'Graceful shutdown initiated');
  // 1) 새 HTTP 연결 차단
  server.close(() => logger.info('HTTP server closed'));
  // 2) DB 커넥션 풀·LISTEN 클라이언트 정리
  try { await gracefulShutdown(); } catch (e) { logger.error({ err: e }, 'Error during graceful shutdown'); }
  logger.info('Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => { shutdown('SIGTERM').catch(console.error); });
process.on('SIGINT',  () => { shutdown('SIGINT').catch(console.error); });
