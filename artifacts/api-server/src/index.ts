import app from "./app";
import { logger } from "./lib/logger";

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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
