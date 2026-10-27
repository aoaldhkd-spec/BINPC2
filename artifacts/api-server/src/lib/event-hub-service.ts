import { validateLogoOriginal } from "./event-hub-logo.js";
import { publicationBlockedForTx, photoPublicationBlockedForTx, policyCompletionIssue, policyFingerprint, publicPolicyNotice } from "./event-hub-publication.js";
import { applyScheduledRecruitment, applyApplicationOperation, recruitmentConfigurationIssue } from "./event-operations.js";
import { halloweenTiming, tourFirstTiming } from "@workspace/api-zod";
import {
  effectiveHalloweenHours,
  eventEnded,
  eventExpired,
  effectiveEventTheme,
  drawModuleEnabled,
  campaignEligibility,
} from "@workspace/api-zod";
const eTour = (id: string, events: import("@workspace/api-zod").HubEvent[]) =>
  events.find((e) => e.id === id)?.campaign?.kind === "tour";
import { campaignAction, drawCampaign } from "./event-campaign-service.js";
import {
  paymentSatisfied,
  campaignCardLimit,
  tourDates,
} from "@workspace/api-zod";
import {
  createHmac,
  randomUUID,
  randomInt,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import {
  participantApplication,
  participantThread,
  applicationAdmissionIssue,
  DEFAULT_PRIVACY_POLICY,
  PrivacyPolicyInput,
  type PrivacyPolicy,
  type PrivacyCase,
  containsBannedNicknameWord,
  recruitmentIsOpen,
  HubBasic,
  HubConsent,
  HubProfile,
  HubEventInput,
  HUB_CONSENT_VERSION,
  DEFAULT_HUB_SETTINGS,
  quoteFor,
  nextSaturday,
  type HubApplication,
  type HubEvent,
  type HubSettings,
  type HubAudit,
} from "@workspace/api-zod";
import { z } from "@workspace/api-zod";
import {
  HUB_MEDIA_PATH,
  validateHubMedia,
  type HubMedia,
} from "./event-hub-media.js";
import { planPrivacy } from "./event-hub-privacy.js";
import { HubStore, HubTx, fail, digest, normalizeHubNickname } from "./event-hub-store.js";
import { eventCycleMilestones } from "./db-event-cycle-heart.js";
import { parseModuleFlags } from "./db-module-flags.js";
import { newParticipantAdmissionReject } from "./db-event-admission.js";
import { resolvePin, pinPoolParams, collectUsedPinCodes } from "./pin.js";
import {
  collectUsedPresetAvatarIds,
  resolveEntryAvatar,
} from "./avatar-pool.js";
import { isAdultBirthYear } from "./korean-age.js";
import { hashDeviceSecret } from "./db-session-tokens.js";

type HubEventView = Partial<HubEvent> &
  Pick<
    HubEvent,
    | "id"
    | "title"
    | "date"
    | "start"
    | "end"
    | "area"
    | "notice"
    | "noticeVersion"
    | "media"
    | "recruitment"
    | "cardsEnabled"
  >;
type HubApplicationView = Omit<HubApplication, "rank" | "owner"> &
  Partial<Pick<HubApplication, "rank" | "owner">> &
  Partial<
    Pick<
      ReturnType<typeof participantApplication>,
      "venue" | "billing" | "profileMissing"
    >
  >;
export type HubOwner = {
  id: string;
  recoveryHash: string;
  createdAt: string;
  memberId?: string;
  restricted?: { active: boolean; reason: string; at: string };
  history?: HubAudit[];
  deleteRequestedAt?: string;
  marketingConsent?: { enabled: boolean; at: string; version: string };
  erasedAt?: string;
  privacyCase?: PrivacyCase;
  privacyHold?: { reason: string; until?: string };
  loginFailures?: number;
  loginLockedUntil?: string;
};
export type HubMember = {
  id: string;
  owner: string;
  nicknameKey: string;
  salt: string;
  passwordHash: string;
  lastActivityAt?: string;
  nicknameChanges?: number;
  basic: HubApplication["basic"];
  profile: HubApplication["profile"];
  marketing: boolean;
  history: HubAudit[];
};
export type HubThread = {
  status?: "open" | "resolved";
  id: string;
  messages: { id: string; sender: string; text: string; at: string }[];
  readUserAt: string;
  readAdminAt: string;
  tags: string[];
  history: HubAudit[];
};
export type HubStock = {
  id: string;
  eventId: string;
  label: string;
  remaining: number;
  history: HubAudit[];
};
const SettingsInput = z.object({
  campaignModules: z
    .object({ halloweenDraw: z.boolean(), tourDraw: z.boolean() })
    .optional(),
  budget: z
    .object({
      totalCandidate: z.number().int().min(0).max(10000000),
      cashEnabled: z.literal(false),
    })
    .optional(),
  templates: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        event: HubEventInput.omit({ date: true }),
      }),
    )
    .max(20)
    .default([]),
  autoTemplate: HubEventInput.omit({ date: true }).optional(),
  autoSaturday: z.boolean(),
  paused: z.boolean(),
  skipDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(60),
  leadDays: z.number().int().min(1).max(30),
  retentionDays: z.number().int().min(30).max(365),
  places: z
    .array(
      z.object({
        name: z.string().max(80),
        area: z.string().max(100),
        address: z.string().max(400),
        mapUrl: z.string().max(500),
      }),
    )
    .max(30),
});
const Mutation = z.object({
  requestId: z.string().uuid(),
  revision: z.number().int().nonnegative().optional(),
  action: z.string().max(50),
  target: z.string().max(100).default(""),
  data: z.record(z.unknown()).default({}),
});
const text = (v: unknown, max = 100) =>
  z.string().trim().min(1).max(max).parse(v);
const nickKey = normalizeHubNickname;
const audit = (
  actor: string,
  action: string,
  now: string,
  reason?: string,
): HubAudit => ({ actor, action, at: now, ...(reason ? { reason } : {}) });
function validateEvent(raw: unknown) {
  const e = HubEventInput.parse(raw);
  const d = new Date(`${e.date}T${e.start}:00+09:00`);
  if (
    !Number.isFinite(d.getTime()) ||
    new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10) !== e.date ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(e.start) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(e.end)
  )
    fail("DATE", "날짜·시간을 확인해 주세요.");
  if (e.type === "tour" && !e.campaign)
    fail("TOUR_POLICY", "전국투어는 1차 전용 선입금 초안에서 생성하세요.");
  if (e.theme === "halloween" && e.type !== "halloween")
    fail(
      "THEME_SCOPE",
      "할로윈 테마는 할로윈 행사 안에서만 사용할 수 있습니다.",
    );
  if (e.campaign) {
    const timing =
      e.campaign.kind === "tour"
        ? tourFirstTiming(e.date)
        : halloweenTiming(e.campaign.kind);
    if (e.start !== timing.start || e.end !== timing.end)
      fail(
        "CAMPAIGN_TIME",
        "확정된 해당 행사 1차 시작·종료 시간을 유지해 주세요.",
      );
    if (
      (e.campaign.kind === "halloween-friday" && e.date !== "2026-10-30") ||
      (e.campaign.kind === "halloween-saturday" && e.date !== "2026-10-31")
    )
      fail("CAMPAIGN_DATE", "할로윈 날짜·유형을 확인해 주세요.");
    if (
      e.campaign.kind === "tour" &&
      !tourDates().some((d) => d.date === e.date)
    )
      fail("CAMPAIGN_DATE", "확정된 11월 전국투어 날짜만 사용할 수 있습니다.");
    if (e.campaign.secondRoundLink) {
      const link = new URL(e.campaign.secondRoundLink);
      if (link.protocol !== "https:" || link.username || link.password)
        fail("LINK", "오픈채팅은 인증정보 없는 HTTPS 링크만 입력하세요.");
    }
  }
  for (const [i, b] of e.benefits.entries()) {
    if (
      b.to < b.from ||
      e.benefits.some((o, j) => j !== i && o.from <= b.to && o.to >= b.from)
    )
      fail("BENEFITS", "혜택 구간이 겹치거나 잘못되었습니다.");
    if ((b.type === "discount" || b.type === "final") && b.value > 10000000)
      fail("BENEFITS", "혜택 금액을 확인해 주세요.");
  }
  for (const u of [...e.media, ...(e.mapUrl ? [e.mapUrl] : [])]) {
    if (e.media.includes(u) && HUB_MEDIA_PATH.test(u)) continue;
    const p = new URL(u);
    if (p.protocol !== "https:" || p.username || p.password)
      fail("MEDIA", "HTTPS 링크만 사용할 수 있습니다.");
  }
  if (e.campaign?.kind !== "tour" && e.deposit > e.fee)
    fail("FEE", "선입금이 일반 회비를 초과합니다.");
  return e;
}
export class EventHubService {
  constructor(
    readonly store: HubStore,
    readonly secret: string,
    readonly now: () => Date = () => new Date(),
    readonly pick: (max: number) => number = randomInt,
  ) {}
  async session(code: string, create: boolean) {
    if (!/^[A-Za-z0-9_-]{43,100}$/.test(code))
      fail("RECOVERY", "개인 복구코드를 확인해 주세요.", 401);
    return this.store.transaction(async (tx) => {
      const hash = digest(code);
      const owner = await tx.ownerForRecoveryHash<HubOwner>(hash);
      // Routing metadata is not authentication: verify the encrypted payload too.
      if (owner && owner.recoveryHash !== hash)
        fail("RECOVERY", "복구코드가 일치하지 않습니다.", 401);
      if (owner && !owner.erasedAt) return owner.id;
      if (owner?.erasedAt) fail("RECOVERY", "삭제 처리된 복구수단입니다.", 401);
      if (!create) fail("RECOVERY", "복구코드가 일치하지 않습니다.", 401);
      const id = randomUUID();
      await tx.put("owner", id, {
        id,
        recoveryHash: digest(code),
        createdAt: this.now().toISOString(),
      });
      return id;
    });
  }
  private async enabled(tx: HubTx) {
    const s = (
      await tx.db.query(
        "SELECT data FROM app_kv_rows WHERE table_name='app_settings' LIMIT 1",
      )
    ).rows[0]?.data;
    let f = s?.module_flags ?? {};
    if (typeof f === "string") {
      try {
        f = JSON.parse(f);
      } catch {
        f = {};
      }
    }
    return parseModuleFlags(f).event_hub;
  }
  private async event(tx: HubTx, id: string) {
    const e = await tx.get<HubEvent>("event", id);
    if (!e) fail("EVENT", "행사를 찾을 수 없습니다.", 404);
    return {...e,...effectiveHalloweenHours(e)};
  }
  private async app(tx: HubTx, id: string, owner: string, admin: boolean) {
    const a = await tx.get<HubApplication>("application", id);
    if (!a || (!admin && (a.owner !== owner || a.erasedAt)))
      fail("APPLICATION", "신청정보에 접근할 수 없습니다.", 404);
    return a;
  }
  async state(owner?: string, admin = false) {
    return this.store.transaction(async (tx) => {
      const enabled = await this.enabled(tx);
      const publicationBlocked = await publicationBlockedForTx(tx);
      const account = owner
        ? await tx.get<HubOwner>("owner", owner)
        : undefined;
      if (account?.erasedAt && !admin)
        fail("AUTH", "삭제 처리된 신청 세션입니다.", 401);
      if (!enabled && !owner && !admin)
        return {
          privacyPolicy: undefined,
          privacyCase: undefined,
          marketingPreference: undefined,
          unsubscribeToken: undefined,
          serverNow: this.now().toISOString(),
          retentionDays: 180,
          enabled: false,
          events: [] as HubEventView[],
          applications: [] as HubApplicationView[],
          threads: [],
          stocks: [],
          member: null,
          owners: undefined,
          members: undefined,
          errors: undefined,
          settings: undefined,
          nextSaturday: undefined,
          consentVersion: HUB_CONSENT_VERSION,
        };
      const switches =
        (await tx.get<HubSettings>("settings", "global")) ??
        DEFAULT_HUB_SETTINGS;
      await applyScheduledRecruitment(tx, this.now(), enabled);
      const events = (await tx.all<HubEvent>("event")).map(e=>({...e,...effectiveHalloweenHours(e)}));
      const apps = (
        admin
          ? await tx.all<HubApplication>("application")
          : await tx.applicationsForOwner<HubApplication>(owner ?? "")
      ).filter((a) => admin || a.owner === owner);
      const safeEvents: HubEventView[] = admin
        ? events
        : events
            .filter(
              (e) =>
                (enabled &&
                  !publicationBlocked &&
                  (recruitmentIsOpen(e, this.now()) || (e.scheduleEnabled && !e.schedulePaused && !eventEnded(e,this.now())))) ||
                apps.some((a) => a.eventId === e.id),
            )
            .map((e) => ({
              id: e.id,
              title: e.title,
              type: e.type,
              date: e.date,
              start: e.start,
              end: e.end,
              area: e.area,
              opensAt: e.opensAt, closesAt:e.closesAt, scheduleEnabled:e.scheduleEnabled, schedulePaused:e.schedulePaused,
              notice: e.notice,
              campaign: e.campaign
                ? {
                    kind: e.campaign.kind,
                    round: 1 as const,
                    secondRoundLink: e.campaign.secondRoundLink,
                  }
                : undefined,
              theme: e.theme,
              themeEnabled: effectiveEventTheme(e, this.now()) !== "default",
              replyNotice: e.replyNotice,
              noticeVersion: e.noticeVersion,
              media: e.media,
              noticeHistory: (e.versions ?? []).map((v) => ({
                at: v.at,
                notice: v.notice,
              })),
              recruitment:
                enabled &&
                !publicationBlocked &&
                recruitmentIsOpen(e, this.now()),
              cardsEnabled:
                enabled &&
                drawModuleEnabled(e, switches) &&
                !eventExpired(e, this.now()),
            }));
      const safeApps: HubApplicationView[] = admin
        ? apps.map((a) => ({
            ...a,
            resultDetails: a.cards,
            cards: a.cards.map(({ couponAmount: _couponAmount, ...card }) =>
              eTour(a.eventId, events)
                ? {
                    ...card,
                    prizeLabel: card.prize === "다음 기회에" ? "꽝" : "당첨",
                  }
                : card,
            ),
          }))
        : apps.map((a) =>
            participantApplication(
              a,
              events.find((e) => e.id === a.eventId)!,
            ),
          );
      const ownThread = !admin && owner ? await tx.get<HubThread>("thread",owner) : undefined;
      const threads = admin ? await tx.all<HubThread>("thread") : ownThread ? [ownThread] : [];
      const stocks = admin ? await tx.all<HubStock>("stock") : [];
      const settings = admin
        ? ((await tx.get<HubSettings>("settings", "global")) ??
          DEFAULT_HUB_SETTINGS)
        : undefined;
      const member = owner
        ? (await tx.all<HubMember>("member")).find((m) => m.owner === owner)
        : undefined;
      const owners = admin
        ? (await tx.all<HubOwner>("owner")).map(
            ({ recoveryHash: _recoveryHash, ...o }) => o,
          )
        : undefined;
      const members = admin
        ? (await tx.all<HubMember>("member")).map(
            ({ salt: _salt, passwordHash: _passwordHash, ...m }) => m,
          )
        : undefined;
      const errors = admin
        ? await tx.all<{
            id: string;
            requestId: string;
            stage: string;
            code: string;
            count: number;
            at: string;
          }>("error")
        : undefined;
      const publicationPolicy=await tx.get<PrivacyPolicy>("settings","privacy-policy");
      return {
        privacyNotice:publicPolicyNotice(publicationPolicy),
        publicationBlocked:admin?publicationBlocked:undefined,
        retentionDays:
          (await tx.get<HubSettings>("settings", "global"))?.retentionDays ??
          180,
        marketingPreference:
          account?.marketingConsent ??
          (member
            ? {
                enabled: member.marketing,
                at: member.history.at(-1)?.at ?? "",
                version: HUB_CONSENT_VERSION,
              }
            : undefined),
        unsubscribeToken:
          owner && !admin ? this.unsubscribeToken(owner) : undefined,
        privacyPolicy: admin
          ? ((await tx.get<PrivacyPolicy>("settings", "privacy-policy")) ??
            DEFAULT_PRIVACY_POLICY)
          : undefined,
        privacyCase: account?.privacyCase
          ? {
              status: account.privacyCase.status,
              createdAt: account.privacyCase.createdAt,
              updatedAt: account.privacyCase.updatedAt,
              publicMessage: account.privacyCase.publicMessage,
            }
          : undefined,
        owners,
        members,
        serverNow: this.now().toISOString(),
        errors,
        enabled,
        events: safeEvents,
        applications: safeApps,
        readiness: admin
          ? events.map((e) => ({
              eventId: e.id,
              confirmed: apps.filter(
                (a) => a.eventId === e.id && a.attendance === "confirmed",
              ).length,
              minimum: 5,
              ready:
                apps.filter(
                  (a) => a.eventId === e.id && a.attendance === "confirmed",
                ).length >= 5,
            }))
          : undefined,
        threads: admin ? threads : threads.map(participantThread),
        stocks,
        ...(settings
          ? {
              settings,
              nextSaturday: nextSaturday(this.now(), settings.skipDates),
            }
          : {}),
        member: member
          ? {
              nickname: member.basic.nickname,
              basic: member.basic,
              profile: member.profile,
              marketing: member.marketing,
            }
          : null,
        consentVersion: HUB_CONSENT_VERSION,
      };
    });
  }
  async mutate(owner: string, admin: boolean, input: unknown) {
    const m = Mutation.parse(input);
    const actor = admin ? "admin" : owner;
    const now = this.now().toISOString();
    const key = digest(`${actor}:${m.requestId}`);
    const hash = digest(JSON.stringify(m));
    return this.store.transaction(async (tx) => {
      const prior = await tx.get<{
        hash: string;
        result: Record<string, unknown>;
      }>("request", key);
      if (prior) {
        if (prior.hash !== hash)
          fail("IDEMPOTENCY", "같은 요청번호의 내용이 다릅니다.", 409);
        if (m.action !== "application.enter") return prior.result;
      }
      if (!admin && (await tx.get<HubOwner>("owner", owner))?.erasedAt)
        fail("AUTH", "삭제 처리된 신청 세션입니다.", 401);
      if (!owner && !admin)
        fail("AUTH", "개인 신청 세션을 먼저 복구해 주세요.", 401);
      const enabled = await this.enabled(tx);
      const publicationBlocked = await publicationBlockedForTx(tx);
      await applyScheduledRecruitment(tx, this.now(), enabled);
      const requireEnabled = () => {
        if (!enabled)
          fail("MODULE_DISABLED", "술번개 신청 기능이 꺼져 있습니다.", 403);
      };
      const requireAdmin = () => {
        if (!admin) fail("ADMIN", "관리자만 처리할 수 있습니다.", 403);
      };
      const revision = (saved: number) => {
        if (m.revision !== saved)
          fail(
            "REVISION",
            "서버에 최신 변경이 있습니다. 상태를 확인한 후 다시 시도해 주세요.",
            409,
          );
      };
      const result: Record<string, unknown> = {
        saved: true,
        requestId: m.requestId,
      };
      if (m.action.startsWith("campaign.")) {
        Object.assign(result, await campaignAction(tx, m, admin, now));
      } else if (m.action === "event.logo.upload") {
        requireAdmin();
        const e = await this.event(tx,m.target); revision(e.revision);
        const file = validateLogoOriginal(m.data);
        const existing=e.logoVersions?.find(v=>v.sha256===file.sha256&&v.label===file.label&&v.role===file.role&&v.provenance===file.provenance);
        if(existing){result.versionId=existing.id;result.mediaUrl=existing.url;}
        else {
          if((e.logoVersions?.length??0)>=40)fail("LOGO_LIMIT","행사별 원본40개 한도입니다. 기존 원본은 삭제하지 않았습니다.");
          const id=randomUUID(),url=`/api/event-hub/media/${id}.${file.extension}`;
          await tx.put("settings",`media:${id}`,{id,eventId:e.id,mime:file.mime,base64:file.base64,createdAt:now,purpose:"venue-logo"});
          e.logoVersions=[...(e.logoVersions??[]),{id,url,label:file.label,role:file.role,provenance:file.provenance,sourceNote:file.sourceNote,mime:file.mime,width:file.width,height:file.height,size:file.size,sha256:file.sha256,at:now}];
          e.revision++;e.history.push(audit(actor,"event.logo.upload",now,id));await tx.put("event",e.id,e);
          result.versionId=id;result.mediaUrl=url;
        }
      } else if (m.action === "event.logo.select") {
        requireAdmin();
        const e=await this.event(tx,m.target);revision(e.revision);
        const choice=z.object({versionId:z.string().uuid().nullable(),builtinId:z.enum(["red_hole","fake","jack","m_karaoke","speed","check_in","on_top"]).optional(),restore:z.boolean().default(false),area:z.enum(["venue","thanks"]).default("venue")}).parse(m.data);
        if(choice.versionId){const v=e.logoVersions?.find(v=>v.id===choice.versionId);if(!v||v.role!==choice.area)fail("LOGO","이 행사의 장소용 로고만 연결할 수 있습니다.");}
        if(choice.area==="thanks")e.thanksLogoVersionId=choice.versionId??undefined;
        else {e.venueLogoVersionId=choice.versionId??undefined;e.venueLogoId=choice.versionId?undefined:choice.builtinId;}
        e.revision++;e.history.push(audit(actor,choice.restore?"event.logo.restore":"event.logo.select",now,choice.versionId??choice.builtinId??"text-only"));
        await tx.put("event",e.id,e);result.id=e.id;
      } else if (m.action === "event.media.upload") {
        requireAdmin();
        const e = await this.event(tx, m.target);
        revision(e.revision);
        if (e.media.length >= 10)
          fail("MEDIA_LIMIT", "행사 자료는 10개까지입니다.");
        const file = validateHubMedia(m.data);
        const id = randomUUID();
        await tx.put("settings", `media:${id}`, {
          id,
          eventId: e.id,
          mime: file.mime,
          base64: file.base64,
          createdAt: now,
        });
        const url = `/api/event-hub/media/${id}.${file.extension}`;
        e.media.push(url);
        e.revision++;
        e.history.push(audit(actor, "event.media.upload", now));
        await tx.put("event", e.id, e);
        result.id = e.id;
        result.mediaUrl = url;
      } else if (m.action === "event.save") {
        requireAdmin();
        const old = m.target ? await this.event(tx, m.target) : undefined;
        if (old) revision(old.revision);
        const e: HubEvent = {
          ...validateEvent(m.data),
          id: old?.id ?? randomUUID(),
          revision: (old?.revision ?? 0) + 1,
          recruitment: old?.recruitment ?? false,
          nextRank: old?.nextRank ?? 0,
          history: [...(old?.history ?? []), audit(actor, "event.save", now)],
          logoVersions: old?.logoVersions,
        };
        if (
          old?.campaign &&
          (old.date !== e.date ||
            old.campaign.kind !== e.campaign?.kind ||
            old.campaign.round !== e.campaign?.round)
        )
          fail(
            "CAMPAIGN_LOCK",
            "확정 정책의 날짜·차수·종류는 변경할 수 없습니다. 별도 초안을 선택하세요.",
          );
        if (!old && e.campaign)
          fail("CAMPAIGN_PRESET", "전용 행사 초안 준비에서 생성해 주세요.");
        if(e.thanksLogoVersionId && !e.logoVersions?.some(v=>v.id===e.thanksLogoVersionId&&v.role==="thanks"))fail("LOGO","이 행사의 감사용 원본만 연결할 수 있습니다.");
        if(e.venueLogoVersionId && !e.logoVersions?.some(v=>v.id===e.venueLogoVersionId&&v.role==="venue"))fail("LOGO","이 행사에 저장한 장소용 원본만 연결할 수 있습니다.");
        for (const url of e.media) {
          const match = HUB_MEDIA_PATH.exec(url);
          if (match) {
            const media = await tx.get<HubMedia>(
              "settings",
              `media:${match[1]}`,
            );
            if (!media || media.eventId !== e.id)
              fail("MEDIA", "이 행사에 업로드한 자료만 사용할 수 있습니다.");
          }
        }
        // A changed important notice invalidates prior entry consent, but never re-prices old quotes.
        if (old) {
          e.versions = [
            ...(old.versions ?? []),
            {
              at: now,
              notice: old.notice,
              address: old.address,
              fee: old.fee,
              account: old.account,
            },
          ];
          if (old.notice !== e.notice || old.address !== e.address)
            e.noticeVersion = old.noticeVersion + 1;
        }
        if (old?.scheduleEnabled && old.opensAt !== e.opensAt) e.recruitment=false;
        if (e.benefitsOpensAt&&e.benefitsClosesAt&&Date.parse(e.benefitsClosesAt)<=Date.parse(e.benefitsOpensAt))fail("CONFIG","혜택 종료는 시작 이후여야 합니다.");
        if (old) e.noticeVersion = Math.max(old.noticeVersion, e.noticeVersion);
        await tx.put("event", e.id, e);
        result.id = e.id;
      } else if (m.action === "event.schedule") {
        requireAdmin();
        const e = await this.event(tx,m.target); revision(e.revision);
        const data=z.object({enabled:z.boolean(),paused:z.boolean()}).parse(m.data);
        if (data.enabled && !data.paused) {
          requireEnabled();
          if (publicationBlocked) fail("PRIVACY_POLICY_UNCONFIRMED","운영 개인정보 정책·배포 승인이 미확정입니다.",403);
          if (!e.opensAt || recruitmentConfigurationIssue(e)) fail("CONFIG",recruitmentConfigurationIssue(e)??"예약 시작 시각을 입력하세요.");
        }
        e.scheduleEnabled=data.enabled; e.schedulePaused=data.paused;
        e.recruitment=false;
        if (!data.enabled || data.paused) e.recruitment=false;
        e.revision++;e.history.push(audit(actor,data.paused?"schedule.paused":"schedule.enabled",now));
        await tx.put("event",e.id,e);
        await applyScheduledRecruitment(tx,this.now(),enabled);
      } else if (m.action === "event.recruitment") {
        requireAdmin();
        const e = await this.event(tx, m.target);
        revision(e.revision);
        const on = z.boolean().parse(m.data.enabled);
        if (on && eventEnded(e, this.now()))
          fail("EVENT_ENDED", "종료된 행사의 신규 접수는 열 수 없습니다.", 403);
        if (on && publicationBlocked)
          fail(
            "PRIVACY_POLICY_UNCONFIRMED",
            "운영 개인정보 정책이 미확정입니다. 운영 모집 공개는 검토·승인 전 차단됩니다.",
            403,
          );
        if (on && (!e.account || !e.deadline || !e.area))
          fail("CONFIG", "계좌·입금기한·지역을 먼저 설정해 주세요.");
        if (on && e.campaign?.kind === "tour" && !e.campaign.advance)
          fail("ADVANCE", "전국투어 선입금액을 먼저 입력하세요.");
        if (
          on &&
          (await tx.all<HubEvent>("event")).some(
            (other) =>
              other.id !== e.id &&
              other.date === e.date &&
              other.recruitment &&
              (other.autoDate ||
                e.autoDate ||
                (other.campaign?.kind === "tour" &&
                  e.campaign?.kind === "tour")),
          )
        )
          fail(
            "DUPLICATE_DATE",
            "같은 날짜의 자동방·전국투어 모집을 중복 공개할 수 없습니다.",
            409,
          );
        if(on&&m.data.immediate===true){e.opensAt=now;e.scheduleEnabled=false;e.schedulePaused=true;}
        e.recruitment = on;
        if (!on && e.scheduleEnabled) e.schedulePaused=true;
        e.revision++;
        e.history.push(
          audit(actor, on ? "recruitment.open" : "recruitment.close", now),
        );
        await tx.put("event", e.id, e);
      } else if (m.action === "settings.save") {
        requireAdmin();
        const old = await tx.get<HubSettings>("settings", "global");
        if ((m.revision ?? 0) !== (old?.revision ?? 0))
          fail(
            "REVISION",
            "자동방 설정의 최신 상태를 다시 확인해 주세요.",
            409,
          );
        const saved = SettingsInput.parse(m.data);
        if (
          saved.autoTemplate?.campaign ||
          saved.templates.some((t) => t.event.campaign)
        )
          fail(
            "AUTO_TEMPLATE",
            "특별 행사·전국투어는 날짜별 전용 초안으로 관리해 주세요.",
          );
        for (const t of saved.templates)
          validateEvent({ ...t.event, date: "2099-01-03" });
        if (saved.autoTemplate)
          validateEvent({ ...saved.autoTemplate, date: "2099-01-03" });
        if (
          [
            ...saved.templates.map((t) => t.event),
            ...(saved.autoTemplate ? [saved.autoTemplate] : []),
          ].some((t) => t.media.some((url) => HUB_MEDIA_PATH.test(url)))
        )
          fail(
            "MEDIA_SCOPE",
            "업로드 파일은 행사별 자료입니다. 새 행사에서 다시 업로드하세요.",
          );
        await tx.put("settings", "global", {
          ...saved,
          campaignModules: saved.campaignModules ?? old?.campaignModules,
          revision: (old?.revision ?? 0) + 1,
        });
      } else if (m.action === "application.basic") {
        requireEnabled();
        if (publicationBlocked)
          fail(
            "PRIVACY_POLICY_UNCONFIRMED",
            "운영 개인정보 정책 확정 전 신규 신청은 차단됩니다.",
            403,
          );
        const e = await this.event(tx, text(m.data.eventId));
        if (!recruitmentIsOpen(e, this.now()))
          fail("CLOSED", "현재 신청 접수 중이 아닙니다.", 403);
        const own = await tx.get<HubOwner>("owner", owner);
        if (!own) fail("AUTH", "개인 신청 세션을 복구해 주세요.", 401);
        if (own.restricted?.active)
          fail(
            "RESTRICTED",
            "관리자 확인이 필요한 신청입니다. 문의해 주세요.",
            403,
          );
        if (e.campaign && m.data.round !== undefined && m.data.round !== 1)
          fail("ROUND", "BINPC2는 1차만 신청받습니다.");
        const basic = HubBasic.parse(m.data.basic);
        const policy=await tx.get<PrivacyPolicy>("settings","privacy-policy");
        if(process.env.NODE_ENV==="production" && publicPolicyNotice(policy) && m.data.privacyPolicyFingerprint!==policyFingerprint(policy!))fail("PRIVACY_NOTICE_CHANGED","개인정보 안내가 변경되었습니다. 최신 안내를 확인한 뒤 같은 신청을 이어가세요.",409);
        if (!isAdultBirthYear(basic.birthYear, this.now()))
          fail("ADULT", "성인 참가 조건을 확인해 주세요.");
        if (
          containsBannedNicknameWord(basic.nickname) ||
          /[<>\u0000-\u001f\u200b-\u200f]/.test(basic.nickname) ||
          [
            ...new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(
              basic.nickname,
            ),
          ].length > 6 ||
          /관리자|범일NPC|admin|운영자/i.test(basic.nickname)
        )
          fail("NICKNAME", "사용할 수 없는 닉네임입니다.");
        const apps = (await tx.applicationsForOwner<HubApplication>(owner)).filter(a=>a.owner===owner);
        const member = (await tx.membersForOwner<HubMember>(owner)).find(v=>v.owner===owner);
        if (
          member &&
          member.nicknameKey !== nickKey(basic.nickname) &&
          (member.nicknameChanges ?? 0) >= 1
        )
          fail(
            "NICKNAME_CHANGE",
            "닉네임 변경권을 이미 사용했습니다. 관리자에게 문의해 주세요.",
            409,
          );
        const old = apps.find((a) => a.eventId === e.id && a.owner === owner);
        if (old && m.data.edit !== true) {
          result.id = old.id;
        } else {
          const candidates=await tx.nicknameCandidates<HubApplication>("application",nickKey(basic.nickname));
          const members = await tx.nicknameCandidates<HubMember>("member",nickKey(basic.nickname));
          if (
            candidates.some(
              (a) =>
                a.owner !== owner &&
                nickKey(a.basic.nickname) === nickKey(basic.nickname),
            ) ||
            members.some(
              (a) =>
                a.owner !== owner && a.nicknameKey === nickKey(basic.nickname),
            )
          )
            fail("NICKNAME", "이미 사용 중인 닉네임입니다.", 409);
          const live = (
            await tx.db.query(
              "SELECT data FROM app_kv_rows WHERE table_name='profiles'",
            )
          ).rows.map((r) => r.data);
          if (
            live.some(
              (p) =>
                nickKey(String(p.nickname ?? "")) === nickKey(basic.nickname) &&
                p.event_hub_owner !== owner,
            )
          )
            fail("NICKNAME", "이미 현장에서 사용 중인 닉네임입니다.", 409);
          if (member && member.nicknameKey !== nickKey(basic.nickname)) {
            member.nicknameChanges = (member.nicknameChanges ?? 0) + 1;
            member.nicknameKey = nickKey(basic.nickname);
            member.basic = basic;
            member.history.push(audit(actor, "member.nickname.change", now));
            await tx.put("member", member.id, member);
          }
          if (old) {
            revision(old.revision);
            if (old.confirmedAt)
              fail(
                "STAGE",
                "신청 확정 후 기본정보 변경은 관리자 문의를 이용해 주세요.",
              );
            old.basic = basic;
            old.revision++;
            old.updatedAt = now;
            old.history.push(audit(actor, "application.basic.edit", now));
            await tx.put("application", old.id, old);
            result.id = old.id;
          } else {
            e.nextRank++;
            await tx.put("event", e.id, e);
            const a: HubApplication = {
              id: randomUUID(),
              eventId: e.id,
              owner,
              revision: 1,
              stage: 2,
              rank: e.nextRank,
              basic,
              ...(publicPolicyNotice(policy)?{privacyPolicyConsent:{version:policy!.policyVersion!,fingerprint:policyFingerprint(policy!),at:now}}:{}),
              payment: "none",
              attendance: "pending",
              checkin: false,
              profile: member ? { ...member.profile } : { lastStep: 1 },
              quote: quoteFor(e, e.nextRank, this.now()),
              ...(e.campaign
                ? {
                    benefitRank: e.nextRank,
                    eligibility: {
                      status: campaignEligibility(e, basic.birthYear),
                    },
                  }
                : {}),
              cards: [],
              prizesGiven: [],
              history: [audit(actor, "application.basic", now)],
              retainUntil: new Date(
                Date.parse(`${e.date}T${e.end}:00+09:00`) +
                  (e.end <= e.start ? 86400000 : 0) +
                  ((await tx.get<HubSettings>("settings", "global"))
                    ?.retentionDays ?? 180) *
                    86400000,
              ).toISOString(),
              updatedAt: now,
            };
            await tx.put("application", a.id, a);
            result.id = a.id;
          }
        }
      } else if (
        m.action.startsWith("application.") ||
        m.action.startsWith("admin.application.")
      ) {
        const a = await this.app(tx, m.target, owner, admin);
        const e = await this.event(tx, a.eventId);
        if (!prior) revision(a.revision);
        if (applyApplicationOperation(a,e,m.action,m.data,this.now(),admin)) {
          // Ownership, revision, durable receipt, audit and encryption use the common engine.
        } else if (m.action === "application.consent") {
          requireEnabled();
          const c = HubConsent.parse(m.data.consent);
          if (a.confirmedAt)
            fail(
              "STAGE",
              "완료된 신청의 동의는 공지 재확인으로 갱신해 주세요.",
            );
          if (c.reuse) {
            const password = z.string().min(10).max(128).parse(m.data.password);
            const existing = (await tx.all<HubMember>("member")).find(
              (v) => v.owner === owner,
            );
            const salt = randomUUID();
            const member: HubMember = {
              id: existing?.id ?? randomUUID(),
              owner,
              nicknameKey: nickKey(a.basic.nickname),
              basic: a.basic,
              profile: a.profile,
              marketing: c.marketing,
              salt,
              passwordHash: scryptSync(password, salt, 64).toString("hex"),
              nicknameChanges: existing?.nicknameChanges ?? 0,
              history: [
                ...(existing?.history ?? []),
                audit(actor, "member.consent", now),
              ],
            };
            await tx.put("member", member.id, member);
          }
          if (!c.reuse && a.consent?.reuse) {
            const existing = (await tx.all<HubMember>("member")).find(
              (v) => v.owner === a.owner,
            );
            if (existing)
              await tx.db.query(
                "DELETE FROM event_hub_records WHERE kind='member' AND id=$1",
                [existing.id],
              );
          }
          const person = await tx.get<HubOwner>("owner", a.owner);
          if (person) {
            person.marketingConsent = {
              enabled: c.marketing,
              at: now,
              version: HUB_CONSENT_VERSION,
            };
            person.history = [
              ...(person.history ?? []),
              audit(
                a.owner,
                c.marketing ? "marketing.optin" : "marketing.optout",
                now,
              ),
            ];
            await tx.put("owner", person.id, person);
          }
          a.consent = { ...c, acceptedAt: now, noticeVersion: e.noticeVersion };
          a.quote ??= quoteFor(e, a.rank);
          a.stage = 3;
        } else if (m.action === "application.notice") {
          if (!a.consent) fail("CONSENT", "필수 공지 동의가 필요합니다.");
          a.consent.noticeVersion = e.noticeVersion;
          a.consent.acceptedAt = now;
        } else if (m.action === "application.confirm") {
          requireEnabled();
          if (!recruitmentIsOpen(e, this.now()))
            fail(
              "CLOSED",
              "행사 접수 또는 신청 확정 기간이 종료되었습니다. 기존 기록은 보존됩니다.",
              403,
            );
          if (
            a.stage !== 3 ||
            !a.quote ||
            a.consent?.noticeVersion !== e.noticeVersion
          )
            fail("STAGE", "최신 공지와 회비를 확인해 주세요.");
          a.stage = 4;
          a.confirmedAt = now;
        } else if (m.action === "application.report") {
          if (a.lateArrival?.status === "review" || a.lateArrival?.status === "declined")
            fail("ARRIVAL_REVIEW","입금 전 도착 예정시간을 관리자와 확인해 주세요.");
          if (!a.confirmedAt)
            fail("STAGE", "먼저 금액을 확인하고 신청을 확정해 주세요.");
          if (a.waivedAt || (e.campaign && a.quote?.fee === 0))
            fail("FREE", "무료 참가 승인 상태입니다. 다시 송금하지 마세요.");
          if (a.payment !== "approved") {
            a.payment = "reported";
            a.reportedAt ??= now;
          }
        } else if (m.action === "application.profile") {
          if (a.profileId)
            fail(
              "PROFILE_LINKED",
              "입장 후 프로필 수정은 기존 BINPC2 설정에서 진행해 주세요.",
            );
          const parsed = HubProfile.parse(m.data.profile);
          a.profile = { ...a.profile, ...parsed };
          if (a.consent?.reuse) {
            const member = (await tx.all<HubMember>("member")).find(
              (v) => v.owner === a.owner,
            );
            if (member) {
              member.profile = a.profile;
              await tx.put("member", member.id, member);
            }
          }
        } else if (m.action === "application.screening.photo") {
          if (admin)
            fail(
              "OWNER",
              "사진 수집 동의는 신청자 본인이 제출해야 합니다.",
              403,
            );
          if (publicationBlocked || await photoPublicationBlockedForTx(tx))
            fail(
              "PRIVACY_POLICY_UNCONFIRMED",
              "사진 보관·백업 정책 승인 전 운영 업로드는 차단됩니다.",
              403,
            );
          if (!a.eligibility || a.eligibility.status !== "review")
            fail("REVIEW", "관리자 사전 검토 대상에서만 첨부할 수 있습니다.");
          if (m.data.photoConsent !== true)
            fail("CONSENT", "사전 검토 사진의 별도 수집 동의가 필요합니다.");
          const image = validateHubMedia(m.data);
          if (!image.mime.startsWith("image/"))
            fail("MEDIA", "사진만 첨부할 수 있습니다.");
          if (a.screeningPhoto && !a.screeningPhoto.deletedAt)
            fail("PHOTO_EXISTS", "기존 사진을 삭제한 뒤 새로 첨부해 주세요.");
          const id = randomUUID();
          await tx.put("settings", `screening:${id}`, {
            id,
            applicationId: a.id,
            mime: image.mime,
            base64: image.base64,
            consentVersion: "2026-10-27-screening-draft",
            at: now,
          });
          a.screeningPhoto = { id };
        } else if (
          m.action === "application.screening.delete" ||
          m.action === "admin.application.screening.delete"
        ) {
          if (admin && a.eligibility?.status === "review")
            fail("REVIEW", "검토 결과를 기록한 뒤 사진 삭제를 확인하세요.");
          if (a.screeningPhoto) {
            await tx.db.query(
              "DELETE FROM event_hub_records WHERE kind='settings' AND id=$1",
              [`screening:${a.screeningPhoto.id}`],
            );
            a.screeningPhoto.deletedAt = now;
          }
        } else if (m.action === "admin.application.free") {
          requireAdmin();
          if (
            !a.confirmedAt ||
            !e.campaign ||
            e.campaign.kind === "tour" ||
            a.quote?.fee !== 0 ||
            (a.benefitRank ?? a.rank) !== 1 ||
            a.benefitExcluded ||
            a.payment === "approved"
          )
            fail("FREE", "확정된 유효 1등 무료 참가만 승인할 수 있습니다.");
          a.waivedAt ??= now;
        } else if (m.action === "admin.application.eligibility") {
          requireAdmin();
          const reason = text(m.data.reason, 1000);
          a.eligibility = {
            status: z.enum(["approved", "declined"]).parse(m.data.status),
            message: z
              .string()
              .max(500)
              .parse(m.data.message ?? ""),
          };
          a.history.push(audit(actor, "admin.eligibility.review", now, reason));
        } else if (m.action === "admin.application.payment") {
          requireAdmin();
          if (e.campaign && a.quote?.fee === 0)
            fail(
              "FREE",
              "무료 참가 승인 버튼을 사용해 주세요. 입금 승인으로 기록하지 않습니다.",
            );
          const status = z
            .enum(["approved", "mismatch", "held"])
            .parse(m.data.status);
          if (!a.confirmedAt)
            fail("STAGE", "아직 최종 신청을 확정하지 않았습니다.");
          if (status === "approved" && m.data.bankChecked !== true)
            fail("BANK", "은행 내역을 직접 대조한 뒤 확인해 주세요.");
          if (paymentSatisfied(a) && status !== "approved")
            fail(
              "PAYMENT",
              "이미 승인한 입금은 이 동작으로 되돌릴 수 없습니다.",
            );
          a.payment = status;
          if (status === "approved") a.approvedAt ??= now;
        } else if (m.action === "admin.application.attendance") {
          requireAdmin();
          if (!paymentSatisfied(a))
            fail(
              "PAYMENT",
              "실제 입금을 승인한 사람만 대기자·참가 확정이 가능합니다.",
            );
          if (a.eligibility && a.eligibility.status !== "approved")
            fail("ELIGIBILITY", "사전 참가 검토 후 확정해 주세요.");
          a.attendance = z
            .enum(["paid_waitlist", "confirmed"])
            .parse(m.data.status);
        } else if (m.action === "admin.application.checkin") {
          requireAdmin();
          if (!paymentSatisfied(a) || a.attendance !== "confirmed")
            fail("ATTENDANCE", "참가 확정 후 현장 확인해 주세요.");
          a.checkin = z.boolean().parse(m.data.checked);
        } else if (m.action === "admin.application.note") {
          requireAdmin();
          text(m.data.reason, 1000);
        } else if (m.action === "admin.application.reprice") {
          requireAdmin();
          if (e.campaign?.kind === "tour")
            fail(
              "ADVANCE_ONLY",
              "전국투어는 최종 회비 변경·자동 정산을 하지 않습니다. 행사 선입금 설정과 운영자 수동 안내를 사용하세요.",
            );
          if (!a.confirmedAt)
            fail("STAGE", "신청 확정 후에만 회비를 조정할 수 있습니다.");
          const reason = text(m.data.reason, 500);
          const fee = z.number().int().min(0).max(10000000).parse(m.data.fee);
          a.history.push(
            audit(actor, `fee:${a.quote?.fee ?? 0}→${fee}`, now, reason),
          );
          a.quote = {
            fee,
            original: a.quote?.original ?? e.fee,
            benefit: "관리자 조정",
            version: e.revision,
          };
        } else if (m.action === "application.enter") {
          requireEnabled();
          if (eventEnded(e, this.now()) && (!a.profileId || (e.type==="halloween"&&eventExpired(e,this.now()))))
            fail(
              "EVENT_ENDED",
              "행사 입장 기간이 종료되었습니다. 기존 신청·입금 기록은 보존됩니다.",
              403,
            );
          const own = await tx.get<HubOwner>("owner", a.owner);
          if (own?.restricted?.active)
            fail(
              "RESTRICTED",
              "관리자 확인이 필요한 신청입니다. 문의해 주세요.",
              403,
            );
          const issue = applicationAdmissionIssue(a, e);
          if (issue) fail(issue.code, issue.message, 403);
          const settings = (
            await tx.db.query(
              "SELECT data FROM app_kv_rows WHERE table_name='app_settings' ORDER BY updated_at DESC LIMIT 1 FOR UPDATE",
            )
          ).rows[0]?.data;
          const cycleTimes=settings?.event_cycle_started_at ? eventCycleMilestones(String(settings.event_cycle_started_at)) : null;
          const mayResume=Boolean(a.profileId && cycleTimes && !settings.event_cycle_reset_complete
            && a.cycleId===settings.event_cycle_archive_id && this.now().getTime()<cycleTimes.resetAt.getTime());
          if (
            !settings ||
            (!mayResume && newParticipantAdmissionReject(
              settings,
              { isAdmin: false, isTestRuntime: false },
              this.now(),
            ))
          )
            fail(
              "EVENT_NOT_STARTED",
              "관리자의 회식 시작 후 입장할 수 있습니다.",
              403,
            );
          const start = eventCycleMilestones(
            String(settings.event_cycle_started_at),
          )!.grantAt;
          const date = new Date(start.getTime() + 9 * 3600000)
            .toISOString()
            .slice(0, 10);
          if (date !== e.date)
            fail("EVENT_MISMATCH", "다른 날짜 행사로 입장할 수 없습니다.", 403);
          if (a.profileId) {
            const exists = (
              await tx.db.query(
                "SELECT data FROM app_kv_rows WHERE table_name='profiles' AND row_id=$1",
                [a.profileId],
              )
            ).rows[0]?.data;
            if (!exists || a.cycleId !== settings.event_cycle_archive_id)
              fail(
                "EVENT_ENDED",
                "이미 종료·초기화된 현장 프로필은 복원하지 않습니다.",
                403,
              );
            result.profile = exists;
            const deviceSecret = text(m.data.deviceSecret, 200);
            const binding = (
              await tx.db.query(
                "SELECT data FROM app_kv_rows WHERE table_name='device_secrets' AND data->>'user_id'=$1",
                [a.profileId],
              )
            ).rows[0]?.data;
            if (!binding)
              fail(
                "BINDING",
                "현장 기기 연결을 관리자에게 문의해 주세요.",
                409,
              );
            binding.secret_hash = hashDeviceSecret(deviceSecret, this.secret);
            await tx.db.query(
              "UPDATE app_kv_rows SET data=$1,updated_at=now() WHERE table_name='device_secrets' AND row_id=$2",
              [JSON.stringify(binding), binding.id],
            );
            result.binding = binding;
          } else {
            const profiles = (
              await tx.db.query(
                "SELECT data FROM app_kv_rows WHERE table_name='profiles'",
              )
            ).rows.map((r) => r.data);
            if (
              profiles.some(
                (p) =>
                  nickKey(String(p.nickname ?? "")) ===
                  nickKey(a.basic.nickname),
              )
            )
              fail(
                "NICKNAME",
                "현장 닉네임 충돌을 관리자에게 문의해 주세요.",
                409,
              );
            const params = pinPoolParams(profiles.length);
            const pin = resolvePin(
              collectUsedPinCodes(profiles),
              params.poolSize,
              params.use5Digit,
              null,
            );
            if (!pin.ok)
              fail("PIN_EXHAUSTED", "현장 고유번호를 발급할 수 없습니다.", 503);
            const id = randomUUID();
            const deviceSecret = text(m.data.deviceSecret, 200);
            const avatar = resolveEntryAvatar(
              collectUsedPresetAvatarIds(profiles),
              null,
            );
            const profile = {
              id,
              ...(avatar.ok ? { photo_url: avatar.path } : {}),
              nickname: a.basic.nickname,
              birth_year: a.basic.birthYear,
              location: a.basic.location,
              mbti: a.profile.mbti,
              interests: a.profile.interests!.join(", "),
              bio: a.profile.interests!.join(", "),
              personality_score: a.profile.personalityScore,
              registration_consent: {
                ...a.profile.privacyConsent,
                accepted_at: now,
              },
              pin_code: pin.pin,
              created_at: now,
              updated_at: now,
              event_hub_application: a.id,
              event_hub_owner: owner,
              event_hub_complete: true,
              contact_private: true,
              phone_number: null,
            };
            const binding = {
              id: randomUUID(),
              user_id: id,
              secret_hash: hashDeviceSecret(deviceSecret, this.secret),
              created_at: now,
            };
            for (const [kind, row] of [
              ["profiles", profile],
              ["device_secrets", binding],
            ] as const)
              await tx.db.query(
                "INSERT INTO app_kv_rows(table_name,row_id,data,updated_at) VALUES($1,$2,$3,now())",
                [kind, row.id, JSON.stringify(row)],
              );
            if (a.profile.idealMsg || a.profile.featureMsg) {
              const signal = {
                id: randomUUID(),
                user_id: id,
                status_msg: null,
                ideal_msg: a.profile.idealMsg ?? null,
                feature_msg: a.profile.featureMsg ?? null,
                updated_at: now,
              };
              await tx.db.query(
                "INSERT INTO app_kv_rows(table_name,row_id,data,updated_at) VALUES('user_signals',$1,$2,now())",
                [signal.id, JSON.stringify(signal)],
              );
              result.signal = signal;
            }
            a.profileId = id;
            a.cycleId = String(settings.event_cycle_archive_id);
            result.profile = profile;
            result.binding = binding;
          }
        } else if (m.action === "application.draw") {
          requireEnabled();
          if (eventExpired(e, this.now()))
            fail(
              "EVENT_ENDED",
              "행사 뽑기 기간이 종료되었습니다. 기존 결과는 보존됩니다.",
              403,
            );
          if (
            !drawModuleEnabled(
              e,
              (await tx.get<HubSettings>("settings", "global")) ??
                DEFAULT_HUB_SETTINGS,
            )
          )
            fail(
              "MODULE_DISABLED",
              "해당 뽑기 모듈이 OFF입니다. 기존 당첨·지급 기록은 보존됩니다.",
              403,
            );
          if (
            !e.cardsEnabled ||
            !a.profileId ||
            !a.checkin ||
            a.attendance !== "confirmed" ||
            !paymentSatisfied(a)
          )
            fail("CARDS", "입장 및 카드 활성화가 필요합니다.", 403);
          if (a.cards.length >= campaignCardLimit(e))
            fail("CARD_LIMIT", "행사별 카드는 3장까지 뽑을 수 있습니다.", 409);
          const currentSettings = (
            await tx.db.query(
              "SELECT data FROM app_kv_rows WHERE table_name='app_settings' LIMIT 1",
            )
          ).rows[0]?.data;
          const liveProfile = (
            await tx.db.query(
              "SELECT row_id FROM app_kv_rows WHERE table_name='profiles' AND row_id=$1",
              [a.profileId],
            )
          ).rows[0];
          if (
            !currentSettings ||
            (!currentSettings.session_active && e.type!=="halloween") ||
            currentSettings.event_cycle_reset_complete ||
            currentSettings.event_cycle_archive_id !== a.cycleId ||
            !liveProfile
          )
            fail(
              "EVENT_ENDED",
              "현재 현장 행사에서만 카드를 뽑을 수 있습니다.",
              403,
            );
          if (e.campaign) await drawCampaign(tx, e, a, now, this.pick);
          else {
            const stocks = (await tx.all<HubStock>("stock")).filter(
              (s) => s.eventId === e.id && s.remaining > 0,
            );
            const pick = this.pick(stocks.length + 1);
            const stock = stocks[pick];
            if (stock) {
              stock.remaining--;
              stock.history.push(audit(actor, "draw.reserve", now, a.id));
              await tx.put("stock", stock.id, stock);
            }
            a.cards.push({
              id: randomUUID(),
              prize: stock?.id ?? "다음 기회에",
              prizeLabel: stock?.label ?? "다음 기회에",
              at: now,
            });
          }
        } else if (m.action === "admin.application.candy") {
          requireAdmin();
          if (!a.checkin) fail("CHECKIN", "현장 확인이 필요합니다.");
          if (a.candy)
            fail("CANDY_LIMIT", "하리보는 두 종류 중 한 개만 지급합니다.", 409);
          a.candy = z.enum(["haribo-a", "haribo-b"]).parse(m.data.kind);
        } else if (m.action === "admin.application.prize") {
          requireAdmin();
          const card = text(m.data.cardId);
          if (
            !a.cards.some((c) => c.id === card && c.prize !== "다음 기회에") ||
            a.prizesGiven.includes(card)
          )
            fail("PRIZE", "당첨 기록이 없거나 이미 지급했습니다.", 409);
          a.prizesGiven.push(card);
        } else fail("ACTION", "지원하지 않는 신청 동작입니다.");
        // Admission replays still re-check cycle, consent, ownership and device binding above.
        // They must not advance the application revision or duplicate its durable audit.
        if (!prior) {
        a.revision++;
        a.updatedAt = now;
        a.history.push(
          audit(
            actor,
            m.action,
            now,
            typeof m.data.reason === "string"
              ? m.data.reason.slice(0, 1000)
              : undefined,
          ),
        );
        await tx.put("application", a.id, a);
        }
        result.id = a.id;
      } else if (m.action === "admin.owner.restrict") {
        requireAdmin();
        const own = await tx.get<HubOwner>("owner", m.target);
        if (!own) fail("OWNER", "대상을 확인해 주세요.", 404);
        const reason = text(m.data.reason, 500);
        const active = z.boolean().parse(m.data.active);
        own.restricted = { active, reason, at: now };
        own.history = [
          ...(own.history ?? []),
          audit(
            actor,
            active ? "owner.restrict" : "owner.release",
            now,
            reason,
          ),
        ];
        await tx.put("owner", own.id, own);
      } else if (m.action === "admin.privacy.policy.approve") {
        requireAdmin();const p=await tx.get<PrivacyPolicy>("settings","privacy-policy");if(!p)fail("PRIVACY_POLICY","먼저 정책 초안을 저장하세요.");revision(p.revision);
        const issue=policyCompletionIssue(p);if(issue||m.data.confirmed!==true)fail("PRIVACY_POLICY",issue??"확정 원문과 목적별 기간·백업 절차를 직접 확인하세요.");
        p.status="approved";p.approvedAt=now;p.publicationFingerprint=policyFingerprint(p);p.revision++;p.updatedAt=now;p.history=[...(p.history??[]),audit(actor,"privacy.policy.approved",now)];await tx.put("settings","privacy-policy",p);
        result.policyFingerprint=p.publicationFingerprint;
      } else if (m.action === "admin.privacy.policy") {
        requireAdmin();
        const old =
          (await tx.get<PrivacyPolicy>("settings", "privacy-policy")) ??
          DEFAULT_PRIVACY_POLICY;
        revision(old.revision);
        const policy = {
          ...PrivacyPolicyInput.parse(m.data),
          revision: old.revision + 1,
          updatedAt: now,
          history: [
            ...(old.history ?? []),
            audit(actor, "privacy.policy.draft", now),
          ],
        };
        await tx.put("settings", "privacy-policy", policy);
      } else if (m.action === "admin.privacy.plan") {
        requireAdmin();
        result.plan = await planPrivacy(tx, m.target, this.now());
      } else if (m.action === "admin.privacy.review") {
        requireAdmin();
        const own = await tx.get<HubOwner>("owner", m.target);
        if (!own?.privacyCase)
          fail("PRIVACY_CASE", "삭제 요청이 없습니다.", 404);
        revision(own.privacyCase.revision);
        const status = z.enum(["hold", "reviewed"]).parse(m.data.status);
        const reason = text(m.data.reason, 1000);
        if (status === "reviewed" && m.data.identityConfirmed !== true)
          fail("IDENTITY", "별도 본인 확인 완료를 기록해 주세요.");
        own.privacyCase = {
          ...own.privacyCase,
          revision: own.privacyCase.revision + 1,
          status,
          identityConfirmed: m.data.identityConfirmed === true,
          publicMessage: z
            .string()
            .max(500)
            .parse(m.data.publicMessage ?? ""),
          updatedAt: now,
          history: [
            ...own.privacyCase.history,
            audit(actor, `privacy.${status}`, now, reason),
          ],
        };
        await tx.put("owner", own.id, own);
      } else if (m.action === "admin.privacy.hold") {
        requireAdmin();
        const own = await tx.get<HubOwner>("owner", m.target);
        if (!own) fail("OWNER", "대상을 찾을 수 없습니다.", 404);
        const reason = text(m.data.reason, 1000);
        own.privacyHold =
          m.data.enabled === true
            ? {
                reason,
                until: z.string().datetime().optional().parse(m.data.until),
              }
            : undefined;
        own.history = [
          ...(own.history ?? []),
          audit(actor, "privacy.hold.change", now, reason),
        ];
        await tx.put("owner", own.id, own);
      } else if (
        m.action === "admin.owner.unlock" ||
        m.action === "admin.owner.recover"
      ) {
        requireAdmin();
        const own = await tx.get<HubOwner>("owner", m.target);
        if (!own || own.erasedAt)
          fail("OWNER", "대상을 찾을 수 없습니다.", 404);
        if (m.data.identityConfirmed !== true)
          fail("IDENTITY", "본인 확인 완료를 먼저 기록해 주세요.");
        const reason = text(m.data.reason, 1000);
        own.loginFailures = 0;
        own.loginLockedUntil = undefined;
        if (m.action === "admin.owner.recover") {
          const code = randomBytes(32).toString("base64url");
          own.recoveryHash = digest(code);
          result.recoveryCode = code;
        }
        own.history = [
          ...(own.history ?? []),
          audit(actor, m.action, now, reason),
        ];
        await tx.put("owner", own.id, own);
      } else if (m.action === "privacy.request") {
        const own = await tx.get<HubOwner>("owner", owner);
        if (!own) fail("AUTH", "개인 신청 세션을 복구해 주세요.", 401);
        own.deleteRequestedAt = now;
        if (
          !own.privacyCase ||
          ["cancelled", "completed"].includes(own.privacyCase.status)
        )
          own.privacyCase = {
            id: m.requestId,
            revision: 1,
            status: "requested",
            createdAt: now,
            updatedAt: now,
            history: [audit(actor, "privacy.request", now)],
          };
        own.history = [
          ...(own.history ?? []),
          audit(actor, "privacy.delete.request", now),
        ];
        await tx.put("owner", own.id, own);
      } else if (
        m.action === "member.withdraw" ||
        m.action === "member.marketing" ||
        m.action === "marketing.preference"
      ) {
        const member = (await tx.membersForOwner<HubMember>(owner)).find(
          (v) => v.owner === owner,
        );
        if (!member && m.action === "member.withdraw")
          fail("MEMBER", "재사용 회원정보가 없습니다.", 404);
        const own = await tx.get<HubOwner>("owner", owner);
        if (!own) fail("AUTH", "신청 세션이 필요합니다.", 401);
        own.marketingConsent = {
          enabled:
            m.action === "member.withdraw"
              ? false
              : z.boolean().parse(m.data.enabled),
          at: now,
          version: HUB_CONSENT_VERSION,
        };
        own.history = [
          ...(own.history ?? []),
          audit(
            actor,
            own.marketingConsent.enabled
              ? "marketing.optin"
              : "marketing.optout",
            now,
          ),
        ];
        await tx.put("owner", own.id, own);
        if (m.action === "member.withdraw" && member) {
          await tx.db.query(
            "DELETE FROM event_hub_records WHERE kind='member' AND id=$1",
            [member.id],
          );
          for (const a of (await tx.all<HubApplication>("application")).filter(
            (a) => a.owner === owner && a.consent,
          )) {
            a.consent!.reuse = false;
            a.consent!.marketing = false;
            a.revision++;
            a.history.push(audit(actor, "member.withdraw", now));
            await tx.put("application", a.id, a);
          }
        } else if (member) {
          member.marketing = z.boolean().parse(m.data.enabled);
          member.history.push(
            audit(
              actor,
              member.marketing ? "marketing.optin" : "marketing.optout",
              now,
            ),
          );
          await tx.put("member", member.id, member);
        }
      } else if (m.action === "stock.save") {
        requireAdmin();
        const stockEvent = await this.event(tx, String(m.data.eventId ?? ""));
        if (stockEvent.campaign)
          fail(
            "CAMPAIGN_STOCK",
            "확정 행사 재고는 전용 초안에서 초기화합니다. 추가 중복 등록은 차단됩니다.",
          );
        requireAdmin();
        const eventId = text(m.data.eventId);
        await this.event(tx, eventId);
        const label = z
          .enum(["소품 2번", "소품 10번", "소품 15번", "소품 24번"])
          .parse(m.data.label);
        const id = `${eventId}:${label}`;
        const old = await tx.get<HubStock>("stock", id);
        const amount = z.number().int().min(0).max(10000).parse(m.data.add);
        await tx.put("stock", id, {
          id,
          eventId,
          label,
          remaining: (old?.remaining ?? 0) + amount,
          history: [
            ...(old?.history ?? []),
            audit(actor, "stock.add", now, String(amount)),
          ],
        });
      } else if (
        m.action === "thread.send" ||
        m.action === "thread.read" ||
        m.action === "thread.tag" ||
        m.action === "thread.resolve"
      ) {
        const id = admin ? text(m.target) : owner;
        if (!(await tx.get<HubOwner>("owner", id)))
          fail("OWNER", "문의 대상을 찾을 수 없습니다.", 404);
        const t: HubThread = (await tx.get<HubThread>("thread", id)) ?? {
          id,
          messages: [],
          readUserAt: "",
          readAdminAt: "",
          tags: [],
          history: [],
        };
        if (m.action === "thread.send") {
          if (
            !admin &&
            !enabled &&
            !t.messages.length &&
            !(await tx.all<HubApplication>("application")).some(
              (a) => a.owner === owner,
            )
          )
            fail(
              "MODULE_DISABLED",
              "신규 문의 접수는 OFF입니다. 기존 문의와 신청 후속 처리는 유지합니다.",
              403,
            );
          if (!admin && m.data.collection !== true)
            fail("CONSENT", "문의 내용 수집 안내에 동의해 주세요.");
          const message = text(m.data.text, 2000);
          if (t.messages.length >= 1000)
            fail(
              "THREAD_LIMIT",
              "문의 기록 보관 한도에 도달했습니다. 관리자에게 문의해 주세요.",
            );
          if (!admin) t.status = "open";
          t.messages.push({
            id: m.requestId,
            sender: admin ? "admin" : "user",
            text: message,
            at: now,
          });
        } else if (m.action === "thread.read") {
          if (admin) t.readAdminAt = now;
          else t.readUserAt = now;
        } else if (m.action === "thread.resolve") {
          requireAdmin();
          t.status = z.enum(["open", "resolved"]).parse(m.data.status);
          t.history.push(
            audit(actor, `thread.${t.status}`, now, text(m.data.reason, 500)),
          );
        } else {
          requireAdmin();
          t.tags = z
            .array(
              z.enum([
                "답장 지연",
                "연락두절",
                "중도이탈",
                "미참석",
                "검토 필요",
              ]),
            )
            .max(5)
            .parse(m.data.tags);
          t.history.push(
            audit(actor, "thread.tag", now, text(m.data.reason, 500)),
          );
        }
        await tx.put("thread", id, t);
      } else fail("ACTION", "지원하지 않는 동작입니다.");
      // Recovery codes are one-time responses, never durable receipt payloads.
      const { recoveryCode: _recoveryCode, ...receiptResult } = result;
      if (!prior) await tx.put("request", key, {
        hash,
        result: receiptResult,
        owner: admin ? undefined : owner,
        createdAt: now,
      });
      return result;
    });
  }
  unsubscribeToken(owner: string) {
    const payload = Buffer.from(
      JSON.stringify({ owner, expires: this.now().getTime() + 30 * 86400000 }),
    ).toString("base64url");
    return (
      payload +
      "." +
      createHmac("sha256", this.secret)
        .update("hub-marketing-unsubscribe:" + payload)
        .digest("hex")
    );
  }
  async unsubscribe(token: string) {
    let owner = "";
    try {
      if (token.length > 512) throw new Error();
      const parts = token.split(".");
      if (parts.length !== 2) throw new Error();
      const [payload, mac] = parts;
      if (!/^[A-Za-z0-9_-]+$/.test(payload) || !/^[a-f0-9]{64}$/.test(mac))
        throw new Error();
      const expected = createHmac("sha256", this.secret)
        .update("hub-marketing-unsubscribe:" + payload)
        .digest();
      if (!mac || !timingSafeEqual(expected, Buffer.from(mac, "hex")))
        throw new Error();
      const value = JSON.parse(
        Buffer.from(payload, "base64url").toString("utf8"),
      );
      if (
        typeof value.owner !== "string" ||
        !Number.isFinite(value.expires) ||
        value.expires < this.now().getTime()
      )
        throw new Error();
      owner = value.owner;
    } catch {
      fail(
        "UNSUBSCRIBE",
        "수신거부 링크가 만료되었거나 올바르지 않습니다.",
        400,
      );
    }
    return this.store.transaction(async (tx) => {
      const own = await tx.get<HubOwner>("owner", owner);
      if (!own || own.erasedAt) return { unsubscribed: true };
      if (own.marketingConsent?.enabled === false)
        return { unsubscribed: true };
      own.marketingConsent = {
        enabled: false,
        at: this.now().toISOString(),
        version: HUB_CONSENT_VERSION,
      };
      own.history = [
        ...(own.history ?? []),
        audit("recipient", "marketing.unsubscribe", this.now().toISOString()),
      ];
      await tx.put("owner", own.id, own);
      for (const member of (await tx.all<HubMember>("member")).filter(
        (m) => m.owner === owner,
      )) {
        member.marketing = false;
        await tx.put("member", member.id, member);
      }
      return { unsubscribed: true };
    });
  }
  async screeningPhoto(id: string, owner: string, admin: boolean) {
    return this.store.transaction(async (tx) => {
      const photo = await tx.get<{
        id: string;
        applicationId: string;
        mime: string;
        base64: string;
      }>("settings", `screening:${id}`);
      if (!photo) fail("MEDIA", "사진이 없거나 삭제되었습니다.", 404);
      const a = await tx.get<HubApplication>(
        "application",
        photo.applicationId,
      );
      if (!a || (!admin && a.owner !== owner) || a.screeningPhoto?.deletedAt)
        fail("MEDIA", "사진에 접근할 수 없습니다.", 404);
      return photo;
    });
  }
  async campaignPreview(eventId: string) {
    return this.store.transaction(async (tx) => {
      const e = await this.event(tx, eventId);
      const enabled = await this.enabled(tx);
      const owners = await tx.all<HubOwner>("owner");
      const members = await tx.all<HubMember>("member");
      const selected =
        enabled && e.notificationsEnabled
          ? owners.filter(
              (o) =>
                !o.erasedAt &&
                !o.restricted?.active &&
                (o.marketingConsent?.enabled ??
                  members.some((m) => m.owner === o.id && m.marketing)),
            )
          : [];
      return {
        eventId,
        eligibleCount: new Set(selected.map((o) => o.id)).size,
        externalSendingEnabled: false,
        reason:
          "대상 수 확인만 제공합니다. 실제 외부 발송은 별도 승인 전 비활성 상태입니다.",
      };
    });
  }
  async recordFailure(
    owner: string,
    requestId: string,
    stage: string,
    code: string,
  ) {
    if (!/^[a-f0-9-]{36}$/i.test(requestId)) return;
    const id = digest(`${owner}:${requestId}`);
    return this.store.transaction(async (tx) => {
      const old = await tx.get<{ count: number }>("error", id);
      await tx.put("error", id, {
        id,
        requestId,
        owner,
        stage: stage.slice(0, 50),
        code: code.slice(0, 40),
        count: (old?.count ?? 0) + 1,
        at: this.now().toISOString(),
      });
    });
  }
  async receipt(owner: string, admin: boolean, requestId: string) {
    z.string().uuid().parse(requestId);
    return this.store.transaction(async (tx) => {
      const r = await tx.get<{ result: Record<string, unknown> }>(
        "request",
        digest(`${admin ? "admin" : owner}:${requestId}`),
      );
      return r
        ? { saved: true, id: r.result.id, requestId }
        : { saved: false, requestId };
    });
  }
  async media(id: string, owner: string, admin = false) {
    return this.store.transaction(async (tx) => {
      const file = await tx.get<HubMedia>("settings", `media:${id}`);
      if (!file) fail("MEDIA", "자료에 접근할 수 없습니다.", 404);
      if (!admin) {
        const account = await tx.get<HubOwner>("owner", owner);
        const apps = await tx.applicationsForOwner<HubApplication>(owner);
        if (
          !account ||
          account.erasedAt ||
          !apps.some(
            (a) =>
              a.owner === owner &&
              a.eventId === file.eventId &&
              paymentSatisfied(a) &&
              !a.erasedAt,
          )
        )
          fail("MEDIA", "자료에 접근할 수 없습니다.", 404);
      }
      return file;
    });
  }
  async memberLogin(nickname: string, password: string) {
    const result = await this.store.transaction(async (tx) => {
      const member = (await tx.all<HubMember>("member")).find(
        (m) => m.nicknameKey === nickKey(nickname),
      );
      const own = member
        ? await tx.get<HubOwner>("owner", member.owner)
        : undefined;
      if (
        own?.loginLockedUntil &&
        Date.parse(own.loginLockedUntil) > this.now().getTime()
      )
        return null;
      const candidate = scryptSync(
        password.slice(0, 128),
        member?.salt ?? "invalid-member",
        64,
      );
      if (
        !member ||
        !own ||
        own.erasedAt ||
        !timingSafeEqual(candidate, Buffer.from(member.passwordHash, "hex"))
      ) {
        if (own) {
          own.loginFailures = (own.loginFailures ?? 0) + 1;
          if (own.loginFailures >= 8)
            own.loginLockedUntil = new Date(
              this.now().getTime() + 15 * 60000,
            ).toISOString();
          await tx.put("owner", own.id, own);
        }
        return null;
      }
      member.lastActivityAt = this.now().toISOString();
      await tx.put("member", member.id, member);
      own.loginFailures = 0;
      own.loginLockedUntil = undefined;
      const recoveryCode = randomBytes(32).toString("base64url");
      own.recoveryHash = digest(recoveryCode);
      await tx.put("owner", own.id, own);
      return { owner: member.owner, recoveryCode };
    });
    if (!result)
      fail(
        "LOGIN",
        "닉네임·비밀번호를 확인해 주세요. 반복 실패 시 잠시 후 다시 시도해 주세요.",
        401,
      );
    return result;
  }
  async autoTick() {
    return this.store.transaction(async (tx) => {
      if (!(await this.enabled(tx))) return;
      await applyScheduledRecruitment(tx,this.now(),true);
      const s =
        (await tx.get<HubSettings>("settings", "global")) ??
        DEFAULT_HUB_SETTINGS;
      if (!s.autoSaturday || s.paused || s.autoTemplate?.campaign) return;
      const date = nextSaturday(this.now(), s.skipDates);
      if (
        Date.parse(`${date}T22:00:00+09:00`) - this.now().getTime() >
        s.leadDays * 86400000
      )
        return;
      const id = `auto-${date}`;
      if (await tx.get("event", id)) return;
      if (
        (await tx.all<HubEvent>("event")).some(
          (e) => e.date === date && e.campaign?.kind === "tour",
        )
      )
        return;
      const e: HubEvent = {
        ...HubEventInput.parse({
          title: "술번개 신청",
          area: "",
          address: "",
          fee: 0,
          account: "",
          deadline: "",
          notice: "관리자 확인 전 초안입니다.",
          ...s.autoTemplate,
          opensAt: new Date(
            Date.parse(`${date}T${s.autoTemplate?.start ?? "22:00"}:00+09:00`) -
              s.leadDays * 86400000,
          ).toISOString(),
          date,
        }),
        id,
        revision: 1,
        recruitment: false,
        nextRank: 0,
        autoDate: date,
        history: [audit("system", "auto.draft", this.now().toISOString())],
      };
      await tx.put("event", id, e);
    });
  }
}
