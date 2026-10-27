import { Router, type Request } from "express";
import { z } from "@workspace/api-zod";
import { pgPool } from "../lib/pg-pool.js";
import { EventHubService } from "../lib/event-hub-service.js";
import { HubStore, HubError } from "../lib/event-hub-store.js";
import { verifyAdminToken, eventHubProfileCommitted } from "./db.js";
import { issueSessionToken } from "../lib/db-session-tokens.js";
import { logger } from "../lib/logger.js";

declare module "express-session" {
  interface SessionData {
    hubOwner?: string;
  }
}
const router = Router();
export const eventHubService = new EventHubService(
  new HubStore(pgPool),
  process.env.SESSION_SECRET!,
);
const admin = (req: Request) => verifyAdminToken(req.get("x-admin-token"));
// Same-origin JSON mutations + SameSite cookies; no identifiers or recovery codes in URLs.
router.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (
    req.method !== "GET" &&
    (!req.is("application/json") || req.get("sec-fetch-site") === "cross-site")
  )
    return res
      .status(403)
      .json({ code: "ORIGIN", error: "같은 사이트에서 요청해 주세요." });
  return next();
});
router.get("/state", async (req, res, next) => {
  try {
    res.json({
      ...(await eventHubService.state(req.session.hubOwner)),
      hasSession: !!req.session.hubOwner,
    });
  } catch (e) {
    next(e);
  }
});
router.get("/admin", async (req, res, next) => {
  try {
    if (!admin(req))
      throw new HubError(403, "ADMIN", "관리자 인증이 필요합니다.");
    res.json(await eventHubService.state(req.session.hubOwner, true));
  } catch (e) {
    next(e);
  }
});
router.get("/receipt/:requestId", async (req, res, next) => {
  try {
    if (!req.session.hubOwner && !admin(req))
      throw new HubError(401, "AUTH", "신청 세션이 필요합니다.");
    res.json(
      await eventHubService.receipt(
        req.session.hubOwner ?? "",
        admin(req),
        String(req.params.requestId),
      ),
    );
  } catch (e) {
    next(e);
  }
});
router.get("/screening-photo/:id", async (req, res, next) => {
  try {
    const photo = await eventHubService.screeningPhoto(
      String(req.params.id),
      req.session.hubOwner ?? "",
      admin(req),
    );
    res.setHeader("Content-Type", photo.mime);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(Buffer.from(photo.base64, "base64"));
  } catch (e) {
    next(e);
  }
});
router.get("/media/:file", async (req, res, next) => {
  try {
    const match = /^([a-f0-9-]{36})\.(png|jpg|webp|mp4|webm)$/.exec(
      String(req.params.file),
    );
    if (!match) throw new HubError(404, "MEDIA", "자료에 접근할 수 없습니다.");
    const file = await eventHubService.media(
      match[1],
      req.session.hubOwner ?? "",
      admin(req),
    );
    const bytes = Buffer.from(file.base64, "base64");
    res.setHeader("Content-Type", file.mime);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.setHeader("Accept-Ranges", "bytes");
    const range = req.get("range");
    if (range) {
      const m = /^bytes=(\d+)-(\d*)$/.exec(range);
      const start = m ? Number(m[1]) : -1,
        end = m?.[2] ? Number(m[2]) : bytes.length - 1;
      if (
        !m ||
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        start > end ||
        end >= bytes.length
      ) {
        res.setHeader("Content-Range", `bytes */${bytes.length}`);
        res.status(416).end();
        return;
      }
      res.setHeader("Content-Range", `bytes ${start}-${end}/${bytes.length}`);
      res.status(206).send(bytes.subarray(start, end + 1));
      return;
    }
    res.send(bytes);
  } catch (e) {
    next(e);
  }
});
router.post("/unsubscribe", async (req, res, next) => {
  try {
    res.json(
      await eventHubService.unsubscribe(
        z.string().max(512).parse(req.body?.token),
      ),
    );
  } catch (e) {
    next(e);
  }
});
router.get("/campaign-preview/:eventId", async (req, res, next) => {
  try {
    if (!admin(req))
      throw new HubError(403, "ADMIN", "관리자 인증이 필요합니다.");
    res.json(await eventHubService.campaignPreview(String(req.params.eventId)));
  } catch (e) {
    next(e);
  }
});
router.post("/session", async (req, res, next) => {
  try {
    const b = z
      .object({ recoveryCode: z.string(), create: z.boolean().default(false) })
      .parse(req.body);
    const owner = await eventHubService.session(b.recoveryCode, b.create);
    // Regenerate on credential login to avoid session fixation; preserve existing onsite identity.
    const userId =
      !req.session.hubOwner || req.session.hubOwner === owner
        ? req.session.userId
        : undefined;
    await new Promise<void>((resolve, reject) =>
      req.session.regenerate((e) => (e ? reject(e) : resolve())),
    );
    req.session.hubOwner = owner;
    if (userId) req.session.userId = userId;
    await new Promise<void>((resolve, reject) =>
      req.session.save((e) => (e ? reject(e) : resolve())),
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
router.post("/member-login", async (req, res, next) => {
  try {
    const b = z
      .object({ nickname: z.string().max(20), password: z.string().max(128) })
      .parse(req.body);
    const { owner, recoveryCode } = await eventHubService.memberLogin(
      b.nickname,
      b.password,
    );
    const userId =
      !req.session.hubOwner || req.session.hubOwner === owner
        ? req.session.userId
        : undefined;
    await new Promise<void>((resolve, reject) =>
      req.session.regenerate((e) => (e ? reject(e) : resolve())),
    );
    req.session.hubOwner = owner;
    if (userId) req.session.userId = userId;
    await new Promise<void>((resolve, reject) =>
      req.session.save((e) => (e ? reject(e) : resolve())),
    );
    res.json({ ok: true, recoveryCode });
  } catch (e) {
    next(e);
  }
});
router.post("/mutate", async (req, res, next) => {
  try {
    const result = await eventHubService.mutate(
      req.session.hubOwner ?? "",
      admin(req),
      req.body,
    );
    if (result.profile) {
      const profile = result.profile as Record<string, unknown>;
      eventHubProfileCommitted(
        profile,
        result.binding as Record<string, unknown> | undefined,
        result.signal as Record<string, unknown> | undefined,
      );
      req.session.userId = String(profile.id);
      await new Promise<void>((resolve, reject) =>
        req.session.save((e) => (e ? reject(e) : resolve())),
      );
      const bearer = issueSessionToken(
        String(profile.id),
        process.env.SESSION_SECRET!,
      );
      res.json({
        ...result,
        binding: undefined,
        sessionToken: bearer.token,
        expiresAt: bearer.expiresAt,
      });
      return;
    }
    res.json(result);
  } catch (e) {
    next(e);
  }
});
router.use(
  (
    err: unknown,
    req: Request,
    res: import("express").Response,
    _next: import("express").NextFunction,
  ) => {
    const requestId =
      typeof req.body?.requestId === "string"
        ? req.body.requestId.slice(0, 60)
        : undefined;
    if (err instanceof HubError) {
      res
        .status(err.status)
        .json({ error: err.message, code: err.code, requestId });
      return;
    }
    if (err instanceof z.ZodError) {
      res.status(400).json({
        error: "입력 항목을 확인해 주세요.",
        code: "VALIDATION",
        fields: err.issues.map((v) => v.path.join(".")),
        requestId,
      });
      return;
    }
    // Never log request bodies, credentials, PII or raw DB error detail.
    const code = (err as { code?: string })?.code ?? "UNKNOWN";
    const safeRequestId =
      requestId && /^[a-f0-9-]{36}$/i.test(requestId) ? requestId : undefined;
    logger.error(
      { requestId: safeRequestId, stage: "event-hub", code },
      "event hub persistence failed",
    );
    if (safeRequestId)
      void eventHubService
        .recordFailure(
          req.session.hubOwner ?? "",
          safeRequestId,
          String(req.body?.action ?? "unknown"),
          code,
        )
        .catch(() => {});
    res.status(503).json({
      error: "저장 결과를 확인할 수 없습니다. 상태를 다시 확인해 주세요.",
      code: "PERSISTENCE_UNKNOWN",
      requestId,
    });
  },
);
// Only creates unpublished drafts, defaults OFF, no external messages or operating-clock changes.
const timer = setInterval(() => {
  void eventHubService.autoTick().catch(() => {});
}, 60000);
timer.unref();
export default router;
