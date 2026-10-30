import { persistenceFailureCode } from "../lib/persistence-failure.js";
import { readVerificationEvidence } from "../lib/event-verification.js";
import { Router, type Request } from "express";
import { z } from "@workspace/api-zod";
import { pgPool } from "../lib/pg-pool.js";
import { EventHubService } from "../lib/event-hub-service.js";
import { HubStore, HubError } from "../lib/event-hub-store.js";
import { verifyAdminToken, eventHubProfileCommitted, eventHubChanged } from "./db.js";
import { issueSessionToken } from "../lib/db-session-tokens.js";
import { logger } from "../lib/logger.js";
import { EventTestModeService } from "../lib/event-test-mode.js";
import { bossParticipationAllowed } from '../lib/boss-participation.js';

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
const eventTestModeService = new EventTestModeService(eventHubService.store);
// Shared projection for a normal read and the optional credential response.
// Administrator headers never expand this participant response.
const participantState = async (req: Request) => ({
  ...(await eventHubService.state(req.session.hubOwner)),
  hasSession: !!req.session.hubOwner,
});
const administratorState = async (req: Request) => {
  if (!admin(req)) throw new HubError(403,"ADMIN","관리자 인증이 필요합니다.");
  return eventHubService.state(req.session.hubOwner,true);
};
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
router.get("/verification",async(req,res,next)=>{try{if(!admin(req))throw new HubError(403,"ADMIN","관리자 인증이 필요합니다.");res.json(await readVerificationEvidence());}catch(e){next(e);}});
router.get("/test-mode", async (_req, res, next) => {
  try { res.json({...await eventTestModeService.publicState(), bossParticipationAllowed:bossParticipationAllowed()}); } catch (e) { next(e); }
});
router.post('/boss-participant-events',async(_req,res,next)=>{
  try { res.json(await eventHubService.prepareBossParticipantEvents()); eventHubChanged(); } catch(e){next(e);}
});
router.get("/laboratory", async (req, res, next) => {
  try { res.json(await eventTestModeService.state(admin(req))); } catch (e) { next(e); }
});
router.post("/laboratory", async (req, res, next) => {
  try {
    res.json(await eventTestModeService.mutate(admin(req), req.body));
    eventHubChanged();
  } catch (e) { next(e); }
});
router.get("/state", async (req, res, next) => {
  try {
    res.json(await participantState(req));
  } catch (e) {
    next(e);
  }
});
router.get("/admin", async (req, res, next) => {
  try {
    res.json(await administratorState(req));
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
      .object({ recoveryCode: z.string(), create: z.boolean().default(false), includeState: z.boolean().default(false) })
      .parse(req.body);
    const owner = await eventHubService.session(b.recoveryCode, b.create);
    // Regenerate on credential login to avoid session fixation; preserve existing onsite identity.
    const userId =
      !req.session.hubOwner || req.session.hubOwner === owner
        ? req.session.userId
        : undefined;
    const bossAccessId = req.session.bossAccessId;
    await new Promise<void>((resolve, reject) =>
      req.session.regenerate((e) => (e ? reject(e) : resolve())),
    );
    // The separate server grant still controls revocation; retain only its pointer.
    if (bossAccessId) req.session.bossAccessId = bossAccessId;
    req.session.hubOwner = owner;
    if (userId) req.session.userId = userId;
    await new Promise<void>((resolve, reject) =>
      req.session.save((e) => (e ? reject(e) : resolve())),
    );
    // Only read after the regenerated session is durably saved. If that read
    // fails, the saved session/recovery identity remains available for retry.
    res.json({ ok: true, ...(b.includeState ? { state: await participantState(req) } : {}) });
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
    const bossAccessId = req.session.bossAccessId;
    await new Promise<void>((resolve, reject) =>
      req.session.regenerate((e) => (e ? reject(e) : resolve())),
    );
    if (bossAccessId) req.session.bossAccessId = bossAccessId;
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
    // Validate response options before any write. Mutation.parse strips this
    // transport-only option from the durable idempotency hash.
    const includeState = z.boolean().optional().parse(req.body?.includeState) === true;
    const administrative = admin(req);
    const result = await eventHubService.mutate(
      req.session.hubOwner ?? "",
      administrative,
      req.body,
    );
    eventHubChanged();
    const response: Record<string,unknown> = {...result};
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
      Object.assign(response, {
        binding: undefined,
        sessionToken: bearer.token,
        expiresAt: bearer.expiresAt,
      });
    }
    if (includeState) {
      try {
        response.state = await (administrative ? administratorState(req) : participantState(req));
        response.stateScope = administrative ? 'admin' : 'participant';
      } catch (error) {
        // The mutation is already committed. Preserve its receipt and any
        // profile/session binding, but require a separate fresh-state read.
        response.stateUnavailable = true;
        logger.warn({stage:'event-hub-followup-state',code:persistenceFailureCode(error)},'committed event hub mutation needs a fresh state read');
      }
    }
    res.json(response);
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
    const code = persistenceFailureCode(err);
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
function scheduleTick() {
  const timer = setTimeout(() => {
    void eventHubService.autoTick().then(()=>eventHubChanged()).catch(()=>{}).finally(scheduleTick);
  }, 60000 - Date.now()%60000);
  timer.unref();
}
scheduleTick();
export default router;
