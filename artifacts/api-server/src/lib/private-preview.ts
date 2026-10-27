import pg from "pg";
import { readFile } from "node:fs/promises";
import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
export type PreviewEnv = Record<string, string | undefined>;
export function validatePrivatePreview(env: PreviewEnv = process.env): boolean {
  if (env.APP_MODE !== "private-preview") return false;
  const url = new URL(env.DATABASE_URL ?? "invalid:");
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.pathname !== "/binpc2_private_v6" ||
    !/^(dpg-[a-z0-9-]+|127\.0\.0\.1|localhost)$/.test(url.hostname)
  )
    throw new Error("PRIVATE_PREVIEW_DATABASE_REFUSED");
  const origin = new URL(
    env.PREVIEW_PUBLIC_ORIGIN ?? env.RENDER_EXTERNAL_URL ?? "invalid:",
  );
  const local =
    env.PREVIEW_ALLOW_LOOPBACK_HTTP === "1" &&
    ["127.0.0.1", "localhost"].includes(origin.hostname);
  if (
    !local &&
    (origin.protocol !== "https:" ||
      origin.hostname === "binpc2.onrender.com" ||
      origin.hostname === "binpc2.netlify.app")
  )
    throw new Error("PRIVATE_PREVIEW_ORIGIN_REFUSED");
  if (env.NODE_ENV !== "production")
    throw new Error("PRIVATE_PREVIEW_REQUIRES_PRODUCTION_SECURITY");
  if (
    !env.PREVIEW_ACCESS_USER ||
    (env.PREVIEW_ACCESS_PASSWORD?.length ?? 0) < 32 ||
    (env.BOOTSTRAP_ADMIN_PASSWORD?.length ?? 0) < 32 ||
    (env.BOOTSTRAP_TEST_PASSWORD?.length ?? 0) < 32 ||
    (env.SESSION_SECRET?.length ?? 0) < 48
  )
    throw new Error("PRIVATE_PREVIEW_CREDENTIALS_REQUIRED");
  if (env.PREVIEW_ACCESS_PASSWORD === env.BOOTSTRAP_ADMIN_PASSWORD)
    throw new Error("PRIVATE_PREVIEW_ROLES_MUST_DIFFER");
  if (
    env.VAPID_PRIVATE_KEY ||
    env.VAPID_PUBLIC_KEY ||
    env.SMTP_URL ||
    env.SMS_API_KEY
  )
    throw new Error("PRIVATE_PREVIEW_EXTERNAL_SEND_REFUSED");
  return true;
}
export function productionHubBlocked(): boolean {
  return process.env.NODE_ENV === "production" && !validatePrivatePreview();
}
export function createPrivatePreviewGate(
  env: PreviewEnv = process.env,
): RequestHandler {
  const enabled = validatePrivatePreview(env);
  const hash = (v: string) => createHash("sha256").update(v).digest();
  const failures = new Map<string, { count: number; at: number }>();
  return (req, res, next) => {
    if (!enabled) return next();
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    res.setHeader("Cache-Control", "no-store");
    if (req.path === "/api/healthz") return next();
    if (!req.secure && env.PREVIEW_ALLOW_LOOPBACK_HTTP !== "1")
      return res.status(426).json({ code: "HTTPS_REQUIRED" });
    if (
      env.PREVIEW_ALLOW_LOOPBACK_HTTP === "1" &&
      !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
        req.socket.remoteAddress ?? "",
      )
    )
      return res.sendStatus(403);
    const ip = req.ip ?? "unknown",
      now = Date.now(),
      old = failures.get(ip);
    if (old && now - old.at < 60000 && old.count >= 20) {
      res.setHeader("Retry-After", "60");
      return res.sendStatus(429);
    }
    let user = "",
      password = "";
    try {
      const auth = req.get("authorization") ?? "";
      if (auth.startsWith("Basic ")) {
        const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8"),
          colon = decoded.indexOf(":");
        if (colon >= 0) {
          user = decoded.slice(0, colon);
          password = decoded.slice(colon + 1);
        }
      }
    } catch {
      /* Reject malformed Basic credentials. */
    }
    const valid =
      timingSafeEqual(hash(user), hash(env.PREVIEW_ACCESS_USER!)) &&
      timingSafeEqual(hash(password), hash(env.PREVIEW_ACCESS_PASSWORD!));
    if (!valid) {
      if (failures.size > 1000) failures.clear();
      failures.set(ip, {
        count: old && now - old.at < 60000 ? old.count + 1 : 1,
        at: old && now - old.at < 60000 ? old.at : now,
      });
      res.setHeader(
        "WWW-Authenticate",
        'Basic realm="Private app test", charset="UTF-8"',
      );
      return res
        .status(401)
        .send("비공개 시험 환경입니다. 시험용 접근 계정으로 로그인하세요.");
    }
    failures.delete(ip);
    // Keep device/application authorization behind this additional access gate.
    // Notifications stay disabled even if somebody uploads a push subscription.
    if (/^\/api\/.*(?:push|broadcast)/.test(req.path))
      return res.status(403).json({ code: "PREVIEW_EXTERNAL_SEND_DISABLED" });
    return next();
  };
}

export async function initializePrivatePreviewSchema() {
  if (!validatePrivatePreview()) return;
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    ssl: process.env.DATABASE_URL?.includes("sslmode=disable")
      ? undefined
      : { rejectUnauthorized: false },
  });
  try {
    const migration = await readFile(
      new URL("./event-hub-schema.sql", import.meta.url),
      "utf8",
    );
    await pool.query(migration);
  } finally {
    await pool.end();
  }
}
