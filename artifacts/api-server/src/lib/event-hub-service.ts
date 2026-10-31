import { VenueAddressInput, type VenueDirectory } from "../../../../lib/api-zod/src/event-venue-directory.js";
import { bossParticipationAllowed } from './boss-participation.js';
import { todayHeartNowSession } from './heartnow-access.js';
import { companionCommand, companionDraftViews, type CompanionGroup } from './companion-records.js';
import { companionApplicationViews, companionSubmissionCommand, type CompanionLinkRequest } from './companion-submission.js';
import {participantLinkRequest} from './companion-links.js';
import { saveBasicApplication,withoutGeneralPhoneInput } from './event-hub-application-basic.js';
import { campaignPresets } from '@workspace/api-zod';
import { cardSlotAvailable } from "../../../../lib/api-zod/src/event-card-clock.js";
import { validateLogoOriginal } from "./event-hub-logo.js";
import { HubBasicDraftInput, type HubBasicDraft } from "@workspace/api-zod";
import { publicationBlockedForTx, photoPublicationBlockedForTx, policyCompletionIssue, policyFingerprint, publicPolicyNotice } from "./event-hub-publication.js";
import { applyScheduledRecruitment, applyApplicationOperation, recruitmentConfigurationIssue, captureEventNotice, recordEventNoticeChange } from "./event-operations.js";
import { halloweenTiming, tourFirstTiming } from "@workspace/api-zod";
import {
  effectiveHalloweenHours,
  eventEnded,
  eventExpired,
  effectiveEventTheme,
  drawModuleEnabled,
} from "@workspace/api-zod";
const eTour = (id: string, events: import("@workspace/api-zod").HubEvent[]) =>
  events.find((e) => e.id === id)?.campaign?.kind === "tour";
import { campaignAction, drawCampaign } from "./event-campaign-service.js";
import {
  paymentSatisfied,
  hasPublicEventNotice,
  publicNoticeMaterials,
  publicNoticeSignature,
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
import {recordPrivacyErasure} from './event-hub-privacy-restore.js';
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
import { assertTestModeAllowsPublicMutation, publicEventTestMode, readEventTestMode } from "./event-test-mode.js";

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
  basicDrafts?: Record<string, HubBasicDraft>;
  companionDrafts?: Record<string, CompanionGroup>;
  companionPendingApplicationId?: string;
  companionLinkRequests?: Record<string, CompanionLinkRequest>;
  companionOrigins?: Record<string,{sponsorOwner:string;companionDraftId:string;claimedAt:string}>;
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
  consentVersion?: string;
  consentAt?: string;
  status?: "open" | "resolved";
  resolvedAt?:string;
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
      fail("CAMPAIGN_DATE", "확정된 11~12월 전국투어 날짜만 사용할 수 있습니다.");
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
    return this.moduleEnabled(s);
  }
  private moduleEnabled(s: Record<string,unknown> | undefined) {
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
    if (!a || (!admin && (a.owner !== owner || a.erasedAt || (a.bossTestOnly && !bossParticipationAllowed()))))
      fail("APPLICATION", "신청정보에 접근할 수 없습니다.", 404);
    return a;
  }
  async prepareBossParticipantEvents() {
    if (!bossParticipationAllowed()) fail("BOSS_AUTH", "보스 로그인 후 사용할 수 있습니다.", 403);
    return this.store.transaction(async tx => {
      const ids: string[] = [];
      for (const preset of campaignPresets().filter(p => p.event.campaign.kind.startsWith('halloween'))) {
        const result = await campaignAction(tx, {action:'campaign.prepare',target:preset.key,data:{}}, true, this.now().toISOString(), true);
        ids.push(String(result.id));
      }
      return { ids };
    });
  }
  async state(owner?: string, admin = false) {
    return this.store.transaction(async (tx) => {
      const boss = bossParticipationAllowed();
      const inputs = await tx.stateInputs(owner,admin);
      const testMode = publicEventTestMode(await readEventTestMode(tx));
      const enabled = this.moduleEnabled(inputs.appSettings);
      const publicationBlocked = await publicationBlockedForTx(tx);
      const account = owner
        ? await tx.get<HubOwner>("owner", owner)
        : undefined;
      if (account?.erasedAt && !admin)
        fail("AUTH", "삭제 처리된 신청 세션입니다.", 401);
      if (!enabled && !owner && !admin && !boss)
        return {
          testMode,
          basicDrafts: undefined,
          companionDrafts: undefined,
          companionApplications: [],
          companionAccounts: {},
          companionLinkRequests: [],
          bossParticipationAllowed: false,
          venueDirectory: undefined,
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
      const loadedEvents=inputs.all<HubEvent>('event');
      await applyScheduledRecruitment(tx, this.now(), enabled, loadedEvents);
      const events = loadedEvents.map(e=>({...e,...effectiveHalloweenHours(e)}));
      const apps = inputs.all<HubApplication>("application")
        .filter((a) => admin || (a.owner === owner && (!a.bossTestOnly || boss)));
      const safeEvents: HubEventView[] = admin
        ? events
        : events
            .filter(
              (e) => (!e.bossTestOnly || boss) && (
                (e.bossTestOnly && boss) || (enabled &&
                  !publicationBlocked &&
                  (recruitmentIsOpen(e, this.now()) || (e.scheduleEnabled && !e.schedulePaused && !eventEnded(e,this.now())))) ||
                apps.some((a) => a.eventId === e.id)),
            )
            .map((e) => ({
              id: e.id,
              bossTestOnly: e.bossTestOnly,
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
              promotionLogo: e.promotionLogo?.versionId
                ? (() => { const v=e.logoVersions?.find(v=>v.id===e.promotionLogo?.versionId && v.role==='venue'); return v ? {url:v.url,label:v.label,provenance:v.provenance,width:v.width,height:v.height} : undefined; })()
                : e.promotionLogo?.builtinId ? {builtinId:e.promotionLogo.builtinId} : undefined,
              promotionLogos: e.promotionLogos?.flatMap<NonNullable<HubEvent["promotionLogo"]>>(choice => {
                if (choice.builtinId) return [{builtinId:choice.builtinId}];
                const v = e.logoVersions?.find(v => v.id === choice.versionId && v.role === 'venue');
                return v ? [{url:v.url,label:v.label,provenance:v.provenance,width:v.width,height:v.height}] : [];
              }),
              media: e.media.filter(url => {
                const material=e.materials?.find(v=>v.url===url);
                return !material?.hidden && (material?.purpose==="notice" || apps.some(a=>a.eventId===e.id && paymentSatisfied(a) && !a.erasedAt));
              }),
              materials: e.materials?.filter(v=>e.media.includes(v.url) && !v.hidden && (v.purpose==="notice" || apps.some(a=>a.eventId===e.id && paymentSatisfied(a) && !a.erasedAt))),
              noticeHistory: (e.versions ?? []).map((v) => ({
                at: v.at,
                notice: v.notice,
              })),
              recruitment:
                (boss && e.bossTestOnly && !eventEnded(e,this.now())) || (enabled &&
                !testMode.enabled &&
                testMode.publicAdmissionOpen &&
                !publicationBlocked &&
                recruitmentIsOpen(e, this.now())),
              cardsEnabled:
                ((boss && e.bossTestOnly) || (enabled && !testMode.enabled && testMode.publicAdmissionOpen)) &&
                drawModuleEnabled(e, switches) &&
                !eventEnded(e, this.now()),
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
      const threads = admin ? inputs.all<HubThread>("thread") : ownThread ? [ownThread] : [];
      const stocks = admin ? inputs.all<HubStock>("stock") : [];
      const settings = admin
        ? ((await tx.get<HubSettings>("settings", "global")) ??
          DEFAULT_HUB_SETTINGS)
        : undefined;
      const member = owner
        ? inputs.all<HubMember>("member").find((m) => m.owner === owner)
        : undefined;
      const owners = admin
        ? inputs.all<HubOwner>("owner").map(
            ({ recoveryHash: _recoveryHash, ...o }) => o,
          )
        : undefined;
      const members = admin
        ? inputs.all<HubMember>("member").map(
            ({ salt: _salt, passwordHash: _passwordHash, ...m }) => m,
          )
        : undefined;
      const errors = admin
        ? inputs.all<{
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
        testMode,
        bossParticipationAllowed: boss,
        venueDirectory: admin ? (await tx.get<VenueDirectory>("settings","venue-directory") ?? {revision:0,items:[],history:[]}) : undefined,
        basicDrafts: !admin && !account?.erasedAt ? account?.basicDrafts ?? {} : undefined,
        companionDrafts: !admin && !account?.erasedAt ? companionDraftViews(account) : undefined,
        companionApplications: !admin && !account?.erasedAt ? await companionApplicationViews(tx,account,apps) : [],
        companionAccounts: !admin && !account?.erasedAt ? Object.fromEntries(events.filter(e=>account?.companionDrafts?.[e.id] && apps.some(a=>a.eventId===e.id&&a.owner===owner&&!a.erasedAt&&a.consent?.notice)).map(e=>[e.id,e.accounts??[]])) : {},
        companionLinkRequests: admin ? (owners??[]).flatMap(o=>Object.values(o.companionLinkRequests??{})) : Object.values(account?.companionLinkRequests??{}).map(participantLinkRequest),
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
        onsiteTodayActive: todayHeartNowSession(inputs.appSettings??{},this.now()),
        enabled: enabled || boss,
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
      const needsOwnerApplications = m.action==='application.basic-draft'||(m.action==='application.basic'&&m.data.edit===true);
      const mutationInputs = await tx.mutationInputs<HubApplication>([
        {kind:"laboratory-mode",id:"global"}, {kind:"settings",id:"global"},
        {kind:"settings",id:"privacy-policy"}, {kind:"request",id:key},
        ...(owner ? [{kind:"owner",id:owner}] : []),
        ...(typeof m.data.eventId === "string" && m.data.eventId ? [{kind:"event",id:m.data.eventId}] : []),
        ...((m.action.startsWith("application.") || m.action.startsWith("admin.application.")) && !["application.basic", "application.basic-draft"].includes(m.action) ? [{kind:"application",id:m.target}] : []),
      ],needsOwnerApplications?owner:undefined);
      // Reuse only inside this locked transaction, before any application write.
      // Routing metadata is not authority: consumers still check decrypted owner/event.
      const ownerApplicationsBeforeMutation = needsOwnerApplications ? mutationInputs.applications : undefined;
      const pendingCompanion = ownerApplicationsBeforeMutation?.find(a=>a.owner===owner&&a.eventId===m.data.eventId&&!a.erasedAt&&a.companionSubmission?.linkedAt&&a.companionSubmission.personalConsentPending);
      const persistedLinkAction=['admin.companion.link','admin.companion.link-draft','admin.companion.unlink-draft','companion.link.cancel'].includes(m.action);
      const linkRequest = persistedLinkAction ? await tx.get<CompanionLinkRequest>('settings',`companion-link:${m.target}`) : undefined;
      const targetApp = m.action.startsWith('application.') && !['application.basic','application.basic-draft'].includes(m.action) ? await tx.get<HubApplication>('application',m.target) : undefined;
      const targetEventId = targetApp?.eventId ?? linkRequest?.eventId ?? (typeof m.data.eventId === 'string' ? m.data.eventId : '');
      const targetEvent = targetEventId ? await tx.get<HubEvent>('event',targetEventId) : undefined;
      const bossTestRequest = bossParticipationAllowed() && targetEvent?.bossTestOnly === true && (!targetApp || targetApp.owner === owner);
      if (targetEvent?.bossTestOnly && !bossTestRequest && !admin) fail('BOSS_AUTH','보스 확인용 행사입니다.',403);
      if (bossTestRequest && !pendingCompanion && targetEvent && eventEnded(targetEvent,this.now()) && (['application.basic','application.basic-draft','application.confirm','companion.submit','companion.confirm','companion.draft.save','companion.invite','companion.claim'].includes(m.action)))
        fail('EVENT_ENDED','행사 접수가 종료되었습니다. 기존 기록은 보존됩니다.',403);
      if (!bossTestRequest && (m.action.startsWith('companion.') || ["application.basic-draft", "application.basic", "application.consent", "application.confirm", "application.report", "application.enter", "application.draw"].includes(m.action)))
        await assertTestModeAllowsPublicMutation(tx);
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
      const enabled = this.moduleEnabled(mutationInputs.appSettings);
      const publicationBlocked = await publicationBlockedForTx(tx);
      // Only opening an application needs the scheduler before this mutation.
      // State reads and the timer still apply every due open/close under the same
      // locks. Profile/payment/chat/card writes retain their own expiry checks;
      // they need not decrypt and traverse every unrelated event's notice/history.
      const basicRegistration = m.action === "application.basic" || m.action === "application.basic-draft";
      // An unscheduled target cannot open/close through this scheduler. Full state
      // reads and the timer still sweep all events. A scheduled target MUST use
      // the full sweep so same-date/auto/tour conflicts remain authoritative.
      if (!pendingCompanion && ["application.basic", "application.basic-draft", "companion.submit", "companion.confirm"].includes(m.action) && (!basicRegistration || targetEvent?.scheduleEnabled === true))
        await applyScheduledRecruitment(tx, this.now(), enabled);
      const requireEnabled = () => {
        if (!enabled && !bossTestRequest)
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
      if (m.action.startsWith('companion.') || persistedLinkAction) {
        const e=await this.event(tx,text(linkRequest?.eventId??m.data.eventId));
        const newRegistration=['companion.submit','companion.confirm','companion.draft.save','companion.invite','companion.claim'].includes(m.action);
        if(newRegistration){
          requireEnabled();
          if(!hasPublicEventNotice(e))fail('NOTICE','공지가 준비된 뒤 신청할 수 있습니다.',409);
          if(!bossTestRequest && publicationBlocked)fail('PRIVACY_POLICY_UNCONFIRMED','개인정보 정책 확정 전 신규 신청은 차단됩니다.',403);
          if(!bossTestRequest && !recruitmentIsOpen(e,this.now()))fail('CLOSED','현재 신청 접수 중이 아닙니다.',403);
        }
        const policy=await tx.get<PrivacyPolicy>('settings','privacy-policy');
        if(newRegistration && process.env.NODE_ENV==='production' && publicPolicyNotice(policy) && m.data.privacyPolicyFingerprint!==policyFingerprint(policy!))fail('PRIVACY_NOTICE_CHANGED','최신 개인정보 안내를 확인해 주세요.',409);
        const year=(m.data.basic as {birthYear?:unknown}|undefined)?.birthYear;
        if(typeof year==='number'&&!isAdultBirthYear(year,this.now()))fail('ADULT','성인 참가 조건을 확인해 주세요.');
        if(['companion.submit','companion.confirm','companion.report','companion.link.request','companion.link.cancel','admin.companion.link','admin.companion.link-draft','admin.companion.unlink-draft'].includes(m.action)){
          Object.assign(result,await companionSubmissionCommand(tx,{owner,admin,event:e,now:this.now(),command:m,...(publicPolicyNotice(policy)?{privacyPolicyConsent:{version:policy!.policyVersion!,fingerprint:policyFingerprint(policy!),at:now}}:{})}));
        }else Object.assign(result,await companionCommand(tx,{owner,eventId:e.id,now,command:m,maxDrafts:20,invitationTtlMs:24*3600000}));
      } else if (m.action === "venue.address.save") {
        requireAdmin();
        const directory = await tx.get<VenueDirectory>("settings","venue-directory") ?? {revision:0,items:[],history:[]};
        revision(directory.revision);
        const value = VenueAddressInput.parse(m.data);
        const previous = directory.items.find(v=>v.id===value.id) ?? null;
        if(!previous && directory.items.length>=100) fail("LIMIT","매장 주소 등록 한도입니다.");
        directory.history.push({at:now,actor,id:value.id,previous});
        directory.items = [...directory.items.filter(v=>v.id!==value.id),value];
        directory.revision++;
        await tx.put("settings","venue-directory",directory);
      } else if (m.action === "event.address.select") {
        requireAdmin(); const e=await this.event(tx,m.target); revision(e.revision);
        if (m.data.addressId === null) {
          e.versions=[...(e.versions??[]),{at:now,notice:e.notice,address:e.address,fee:e.fee,account:e.account}];
          e.addressRecord=undefined; e.venueAddressId=null; e.address="";
          e.revision++;e.history.push(audit(actor,"event.address.unlink",now));await tx.put("event",e.id,e);
        } else {
        const directory=await tx.get<VenueDirectory>("settings","venue-directory");
        const value=directory?.items.find(v=>v.id===m.data.addressId);
        if(!value?.venueId || m.data.confirmedFirstRound!==true || (e.campaign && e.campaign.round!==1)) fail("VENUE_ASSIGNMENT","확인된 1차 장소만 연결할 수 있습니다.",409);
        e.versions=[...(e.versions??[]),{at:now,notice:e.notice,address:e.address,fee:e.fee,account:e.account}];
        e.addressRecord=value; e.venueAddressId=value!.id;e.venueLogoId=value!.venueId!;e.venueLogoVersionId=undefined;
        e.address=[value!.roadOriginal,value!.parcelOriginal].filter(Boolean).join(" / ");
        e.revision++;e.history.push(audit(actor,"event.address.select",now));await tx.put("event",e.id,e);
        }
      } else if (m.action.startsWith("campaign.")) {
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
      } else if (m.action === "event.logo.order") {
        requireAdmin(); const e=await this.event(tx,m.target);revision(e.revision);
        const choices=z.array(z.object({builtinId:z.enum(["red_hole","fake","jack","m_karaoke","speed","check_in","on_top","black"]).optional(),versionId:z.string().uuid().optional()}).refine(v=>Boolean(v.builtinId)!==Boolean(v.versionId))).max(9).nullable().parse(m.data.items);
        if(choices){
          const keys=choices.map(v=>v.builtinId??v.versionId);
          if(new Set(keys).size!==keys.length)fail("LOGO","같은 로고를 중복 연결할 수 없습니다.");
          for(const c of choices)if(c.versionId&&!e.logoVersions?.some(v=>v.id===c.versionId&&v.role==='venue'))fail("LOGO","이 행사의 장소용 원본만 연결할 수 있습니다.");
          const old=e.promotionLogos??(e.promotionLogo?[e.promotionLogo]:[]);
          if(choices.some(c=>!old.some(v=>v.builtinId===c.builtinId&&v.versionId===c.versionId))&&m.data.publicConfirmed!==true)fail("LOGO_PUBLIC_CONFIRM","연락처·상세 주소가 없는 공개 홍보용 로고인지 확인해 주세요.");
        }
        e.promotionLogos=choices??undefined; e.promotionLogo=undefined;
        e.revision++;e.history.push(audit(actor,"event.logo.order",now,choices===null?"지역 기본값 복원":JSON.stringify(choices)));await tx.put("event",e.id,e);result.id=e.id;
      } else if (m.action === "event.logo.select") {
        requireAdmin();
        const e=await this.event(tx,m.target);revision(e.revision);
        const choice=z.object({versionId:z.string().uuid().nullable(),builtinId:z.enum(["red_hole","fake","jack","m_karaoke","speed","check_in","on_top","black"]).optional(),restore:z.boolean().default(false),area:z.enum(["venue","thanks","promotion"]).default("venue"),publicConfirmed:z.boolean().optional()}).parse(m.data);
        if(choice.versionId){const v=e.logoVersions?.find(v=>v.id===choice.versionId);if(!v||v.role!==(choice.area==='promotion'?'venue':choice.area))fail("LOGO","이 행사의 해당 용도 로고만 연결할 수 있습니다.");}
        if(choice.area==='promotion'){
          if((choice.versionId||choice.builtinId)&&choice.publicConfirmed!==true)fail("LOGO_PUBLIC_CONFIRM","연락처·상세 주소가 없는 공개 홍보용 로고인지 확인해 주세요.");
          e.promotionLogo=choice.versionId?{versionId:choice.versionId}:choice.builtinId?{builtinId:choice.builtinId}:undefined;
          e.promotionLogos=undefined;
        }
        else if(choice.area==="thanks")e.thanksLogoVersionId=choice.versionId??undefined;
        else {e.venueLogoVersionId=choice.versionId??undefined;e.venueLogoId=choice.versionId?undefined:choice.builtinId;}
        e.revision++;e.history.push(audit(actor,choice.restore?"event.logo.restore":"event.logo.select",now,`${choice.area}: ${choice.versionId??choice.builtinId??"text-only"}`));
        await tx.put("event",e.id,e);result.id=e.id;
      } else if (m.action === "event.media.upload") {
        requireAdmin();
        const e = await this.event(tx, m.target);
        revision(e.revision);
        const noticeBefore=captureEventNotice(e);
        const purpose = z.enum(["notice","map","poster","video"]).optional().parse(m.data.purpose);
        const replaceId=z.string().uuid().optional().parse(m.data.replaceId);
        const replacement=replaceId?e.materials?.find(item=>item.id===replaceId):undefined;
        if(replaceId&&(!replacement||replacement.purpose!==purpose))fail("MEDIA_REPLACE","이 행사의 같은 유형 자료만 교체할 수 있습니다.",409);
        const replacementVisible=!!replacement&&!replacement.hidden&&e.media.includes(replacement.url);
        if ((e.media.length >= 10 && !replacementVisible) || (e.materials?.length??0)>=40)
          fail("MEDIA_LIMIT", "표시 자료는 10개, 보존 원본은 40개까지입니다. 이전 자료의 연결을 해제하면 표시 공간을 확보할 수 있습니다.");
        if(purpose==="notice" && m.data.publicConfirmed!==true) fail("MEDIA_PUBLIC_CONFIRM","신청 전 공개할 공지 사진인지 확인해 주세요.");
        const file = validateHubMedia(m.data);
        if(purpose && purpose!=="video") validateLogoOriginal({...m.data,label:"행사 자료",role:"venue",provenance:"original"});
        if(purpose==="video" && !file.mime.startsWith("video/"))fail("MEDIA_TYPE","영상 파일을 선택해 주세요.");
        const alt=z.string().trim().max(200).parse(m.data.alt??"");
        const id = randomUUID();
        await tx.put("settings", `media:${id}`, {
          id,
          eventId: e.id,
          purpose,
          mime: file.mime,
          base64: file.base64,
          createdAt: now,
        });
        const url = `/api/event-hub/media/${id}.${file.extension}`;
        if(replacementVisible)e.media=e.media.map(value=>value===replacement!.url?url:value);
        else e.media.push(url);
        if(purpose){
          const added={id,url,purpose,alt,hidden:false,at:now};
          e.materials=replacement?(e.materials??[]).flatMap(item=>item.id===replacement.id?[added,{...item,hidden:true}]:[item]):[...(e.materials??[]),added];
        }
        recordEventNoticeChange(e,noticeBefore,now);
        e.revision++;
        e.history.push(audit(actor, "event.media.upload", now, JSON.stringify({id,purpose:purpose??"legacy-private",alt,...(replaceId?{replaces:replaceId}:{})})));
        await tx.put("event", e.id, e);
        result.id = e.id;
        result.mediaUrl = url;
      } else if (m.action === "event.media.update") {
        requireAdmin();const e=await this.event(tx,m.target);revision(e.revision);
        const noticeBefore=captureEventNotice(e);
        const order=z.array(z.object({id:z.string().uuid(),alt:z.string().trim().max(200),hidden:z.boolean()})).max(40).parse(m.data.items);
        if(order.length!==(e.materials??[]).length || new Set(order.map(v=>v.id)).size!==order.length || order.some(v=>!e.materials?.some(x=>x.id===v.id)))fail("MEDIA","이 행사의 저장한 자료만 정리할 수 있습니다.");
        e.materials=order.map(v=>({...e.materials!.find(x=>x.id===v.id)!,alt:v.alt,hidden:v.hidden}));
        const legacy=e.media.filter(url=>!e.materials!.some(v=>v.url===url));
        const visible=e.materials.filter(v=>!v.hidden).map(v=>v.url);
        if(legacy.length+visible.length>10)fail("MEDIA_LIMIT","동시에 표시할 자료는 10개까지입니다. 원본은 보존됩니다.");
        e.media=[...visible,...legacy];
        if(e.recruitment&&!hasPublicEventNotice(e))fail("NOTICE","접수를 중지한 뒤 마지막 공지를 숨길 수 있습니다.",409);
        recordEventNoticeChange(e,noticeBefore,now);
        e.revision++;e.history.push(audit(actor,"event.media.update",now,JSON.stringify(order)));
        await tx.put("event",e.id,e);result.id=e.id;
      } else if (m.action === "event.save") {
        requireAdmin();
        const old = m.target ? await this.event(tx, m.target) : undefined;
        if (old) revision(old.revision);
        const e: HubEvent = {
          ...validateEvent(m.data),
          bossTestOnly: old?.bossTestOnly,
          id: old?.id ?? randomUUID(),
          revision: (old?.revision ?? 0) + 1,
          recruitment: old?.recruitment ?? false,
          nextRank: old?.nextRank ?? 0,
          history: [...(old?.history ?? []), audit(actor, "event.save", now)],
          logoVersions: old?.logoVersions,
          promotionLogo: old?.promotionLogo,
          promotionLogos: old?.promotionLogos,
          addressRecord: old?.addressRecord,
          materials: old?.materials,
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
        if (e.venueAddressId) {
          const directory=await tx.get<VenueDirectory>("settings","venue-directory");
          const address=directory?.items.find(v=>v.id===e.venueAddressId);
          if(!address?.venueId || address.venueId!==e.venueLogoId || (e.campaign && e.campaign.round!==1)) fail("VENUE_ASSIGNMENT","매장과 1차 배정을 확인한 주소만 연결해 주세요.",409);
          e.addressRecord=address;
          e.address=[address.roadOriginal,address.parcelOriginal].filter(Boolean).join(" / ");
        } else if (e.venueAddressId===null) { e.addressRecord=undefined; }
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
              noticeVersion: old.noticeVersion,
              noticeMedia: publicNoticeMaterials(old),
              address: old.address,
              fee: old.fee,
              account: old.account,
            },
          ];
          if (publicNoticeSignature(old) !== publicNoticeSignature(e) || old.address !== e.address)
            e.noticeVersion = old.noticeVersion + 1;
        }
        if(e.recruitment&&!hasPublicEventNotice(e))fail("NOTICE","접수를 중지한 뒤 공지를 비울 수 있습니다.",409);
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
        if (on) await assertTestModeAllowsPublicMutation(tx);
        if (on && eventEnded(e, this.now()))
          fail("EVENT_ENDED", "종료된 행사의 신규 접수는 열 수 없습니다.", 403);
        if (on && publicationBlocked)
          fail(
            "PRIVACY_POLICY_UNCONFIRMED",
            "운영 개인정보 정책이 미확정입니다. 운영 모집 공개는 검토·승인 전 차단됩니다.",
            403,
          );
        if(on&&!hasPublicEventNotice(e))fail("NOTICE","공지를 작성하거나 공개 공지 사진을 등록해 주세요.",409);
        if (on && ((!e.account && !e.accounts?.length) || !e.deadline || !e.area))
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
      } else if (m.action === "application.basic-draft") {
        if (!pendingCompanion) requireEnabled();
        if (!pendingCompanion && publicationBlocked && !bossTestRequest) fail("PRIVACY_POLICY_UNCONFIRMED", "운영 개인정보 정책 확정 전 신규 신청은 차단됩니다.", 403);
        const e = await this.event(tx, text(m.data.eventId));
        if(!pendingCompanion&&!hasPublicEventNotice(e))fail("NOTICE","공지가 준비된 뒤 신청할 수 있습니다.",409);
        if (!pendingCompanion && !bossTestRequest && !recruitmentIsOpen(e, this.now())) fail("CLOSED", "현재 신청 접수 중이 아닙니다.", 403);
        const own = await tx.get<HubOwner>("owner", owner);
        if (!own) fail("AUTH", "개인 신청 세션을 복구해 주세요.", 401);
        if (own.restricted?.active) fail("RESTRICTED", "관리자 확인이 필요한 신청입니다.", 403);
        const policy = await tx.get<PrivacyPolicy>("settings", "privacy-policy");
        if (process.env.NODE_ENV === "production" && publicPolicyNotice(policy) && m.data.privacyPolicyFingerprint !== policyFingerprint(policy!)) fail("PRIVACY_NOTICE_CHANGED", "최신 개인정보 안내를 확인해 주세요.", 409);
        if (!pendingCompanion && ownerApplicationsBeforeMutation!.some((a) => a.owner === owner && a.eventId === e.id)) fail("STAGE", "이미 저장된 신청을 이어가 주세요. 승인 상태는 변경되지 않았습니다.", 409);
        const input = HubBasicDraftInput.parse({...m.data,basic:withoutGeneralPhoneInput(m.data.basic)});
        if (pendingCompanion && ((input.basic.nickname !== undefined && nickKey(input.basic.nickname) !== nickKey(pendingCompanion.basic.nickname)) || (input.basic.birthYear !== undefined && input.basic.birthYear !== pendingCompanion.basic.birthYear))) fail('COMPANION_IDENTITY','접수한 이름·년생 정정은 관리자에게 문의해 주세요.',409);
        const old = own.basicDrafts?.[e.id];
        revision(old?.revision ?? 0);
        if (!old && Object.keys(own.basicDrafts ?? {}).length >= 30) fail("DRAFT_LIMIT", "작성 중인 신청이 많습니다. 기존 신청을 먼저 확인해 주세요.");
        own.basicDrafts ??= {};
        own.basicDrafts[e.id] = { ...input, basic: { ...input.basic, ...(input.basic.phone === undefined && old?.basic.phone !== undefined ? { phone: old.basic.phone } : {}) }, revision: (old?.revision ?? 0) + 1, updatedAt: now };
        await tx.put("owner", owner, own);
        result.draft = own.basicDrafts[e.id];
      } else if (m.action === "application.basic") {
        const linkedPending = m.data.edit === true && pendingCompanion;
        if (!linkedPending) requireEnabled();
        if (!linkedPending && publicationBlocked && !bossTestRequest)
          fail(
            "PRIVACY_POLICY_UNCONFIRMED",
            "운영 개인정보 정책 확정 전 신규 신청은 차단됩니다.",
            403,
          );
        const e = await this.event(tx, text(m.data.eventId));
        if(!linkedPending&&!hasPublicEventNotice(e))fail("NOTICE","공지가 준비된 뒤 신청할 수 있습니다.",409);
        if (!linkedPending && !bossTestRequest && !recruitmentIsOpen(e, this.now()))
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
        const basic = HubBasic.parse(withoutGeneralPhoneInput(m.data.basic));
        const policy=await tx.get<PrivacyPolicy>("settings","privacy-policy");
        if(process.env.NODE_ENV==="production" && publicPolicyNotice(policy) && m.data.privacyPolicyFingerprint!==policyFingerprint(policy!))fail("PRIVACY_NOTICE_CHANGED","개인정보 안내가 변경되었습니다. 최신 안내를 확인한 뒤 같은 신청을 이어가세요.",409);
        const saved = await saveBasicApplication(tx,{owner:own,event:e,basic,now:this.now(),actor,edit:m.data.edit===true,revision:m.revision,...(publicPolicyNotice(policy)?{privacyPolicyConsent:{version:policy!.policyVersion!,fingerprint:policyFingerprint(policy!),at:now}}:{})});
        result.id = saved.id;
        if (linkedPending && own.basicDrafts?.[e.id]) { delete own.basicDrafts[e.id]; await tx.put('owner',own.id,own); }
      } else if (
        m.action.startsWith("application.") ||
        m.action.startsWith("admin.application.")
      ) {
        const a = await this.app(tx, m.target, owner, admin);
        // This application branch has not changed the event under this lock.
        // Keep ownership/revision/expiry checks; avoid a duplicate DB round trip.
        const e = targetEvent?.id === a.eventId
          ? { ...targetEvent, ...effectiveHalloweenHours(targetEvent) }
          : await this.event(tx, a.eventId);
        if (!prior) revision(a.revision);
        if (applyApplicationOperation(a,e,m.action,m.data,this.now(),admin)) {
          // Ownership, revision, durable receipt, audit and encryption use the common engine.
        } else if (m.action === "application.consent") {
          if(!hasPublicEventNotice(e))fail("NOTICE","현재 공지가 준비되지 않았습니다. 관리자에게 문의해 주세요.",409);
          if (!a.companionSubmission?.linkedAt || !a.companionSubmission.personalConsentPending) requireEnabled();
          const c = HubConsent.parse(m.data.consent);
          if (a.confirmedAt && !a.companionSubmission?.personalConsentPending)
            fail(
              "STAGE",
              "완료된 신청의 동의는 공지 재확인으로 갱신해 주세요.",
            );
          if (a.companionSubmission?.personalConsentPending) {
            if (!a.companionSubmission.linkedAt) fail("COMPANION_LINK","본인 신청 연결을 확인해 주세요.",403);
            HubBasic.parse(a.basic);
          }
          if (c.reuse) {
            const password = z.string().min(10).max(128).parse(m.data.password);
            const existing = (await tx.membersForOwner<HubMember>(owner)).find(
              (v) => v.owner === owner,
            );
            const salt = randomUUID();
            const member: HubMember = {
              id: existing?.id ?? randomUUID(),
              owner,
              nicknameKey: nickKey(a.basic.nickname),
              basic: { ...a.basic, ...(a.basic.phone === undefined && existing?.basic.phone !== undefined ? { phone: existing.basic.phone } : {}) },
              profile: a.profile,
              marketing: c.marketing,
              salt,
              passwordHash: scryptSync(password, salt, 64).toString("hex"),
              nicknameChanges: existing?.nicknameChanges ?? 0,
              lastActivityAt:now,
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
            {
              await tx.db.query(
                "DELETE FROM event_hub_records WHERE kind='member' AND id=$1",
                [existing.id],
              );
              await recordPrivacyErasure(tx,owner,[{kind:'member',id:existing.id,action:'erase'}],now);
            }
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
          if (a.companionSubmission) a.companionSubmission.personalConsentPending = false;
          a.stage = a.confirmedAt ? 4 : 3;
        } else if (m.action === "application.notice") {
          if(!hasPublicEventNotice(e))fail("NOTICE","현재 공지가 준비되지 않았습니다. 관리자에게 문의해 주세요.",409);
          if (!a.consent) fail("CONSENT", "필수 공지 동의가 필요합니다.");
          a.consent.noticeVersion = e.noticeVersion;
          a.consent.acceptedAt = now;
        } else if (m.action === "application.confirm") {
          if(!hasPublicEventNotice(e))fail("NOTICE","현재 공지가 준비되지 않았습니다. 관리자에게 문의해 주세요.",409);
          requireEnabled();
          if (!bossTestRequest && !recruitmentIsOpen(e, this.now()))
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
          if ((a.quote?.fee??0)>0 && (e.accounts?.length??0)>0 && !a.paymentAccount) fail("ACCOUNT","입금할 계좌 하나를 먼저 선택해 주세요.");
          if (a.paymentAccount && !a.confirmedAt) {
            const currentAccount = e.accounts?.find(v => v.id === a.paymentAccount!.id);
            if (!currentAccount || currentAccount.bank !== a.paymentAccount.bank || currentAccount.number !== a.paymentAccount.number || (currentAccount.holder ?? "") !== (a.paymentAccount.holder ?? ""))
              fail("ACCOUNT_CHANGED", "안내 계좌가 변경되었습니다. 현재 계좌를 다시 선택해 주세요. 아직 송금하지 마세요.", 409);
          }
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
        } else if (m.action === "application.account") {
          if(a.stage<3 || a.confirmedAt || a.reportedAt || a.approvedAt || a.waivedAt) fail("PAYMENT_LOCKED","금액 확인 전 계좌만 선택할 수 있습니다.",409);
          const selected=e.accounts?.find(v=>v.id===m.data.accountId);
          if(!selected) fail("ACCOUNT","안내된 계좌 중 하나를 선택해 주세요.");
          a.paymentAccount={...selected!};
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
              member.lastActivityAt = now;
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
          delete a.approvalRevokedAt;
          a.attendance = "confirmed";
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
          if (status === "approved" && !(a.bossTestOnly && bossParticipationAllowed() && m.data.testChecked === true) && m.data.bankChecked !== true)
            fail("BANK", "은행 내역을 직접 대조한 뒤 확인해 주세요.");
          if (paymentSatisfied(a) && status !== "approved")
            fail(
              "PAYMENT",
              "이미 승인한 입금은 이 동작으로 되돌릴 수 없습니다.",
            );
          a.payment = status;
          if (status === "approved") {
            a.approvedAt ??= now;
            delete a.approvalRevokedAt;
            a.attendance = "confirmed";
          }
        } else if (m.action === "admin.application.revoke") {
          requireAdmin();
          text(m.data.reason, 1000);
          if (!paymentSatisfied(a))
            fail("APPROVAL", "현재 승인된 신청만 취소할 수 있습니다.", 409);
          a.approvalRevokedAt = now;
          a.attendance = "pending";
          // Keep the bank/free approval, actual entry, card and delivery evidence.
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
          let settings = (
            await tx.db.query(
              "SELECT data FROM app_kv_rows WHERE table_name='app_settings' ORDER BY updated_at DESC LIMIT 1 FOR UPDATE",
            )
          ).rows[0]?.data;
          if (bossTestRequest) settings = { ...settings, session_active: true, event_cycle_reset_complete: false, event_cycle_started_at: `${e.date}T${e.start}:00+09:00`, event_cycle_archive_id: `boss-test:${e.id}` };
          const cycleTimes=settings?.event_cycle_started_at ? eventCycleMilestones(String(settings.event_cycle_started_at)) : null;
          const mayResume=Boolean(a.profileId && cycleTimes && !settings.event_cycle_reset_complete
            && a.cycleId===settings.event_cycle_archive_id && this.now().getTime()<cycleTimes.resetAt.getTime());
          if (
            !settings ||
            (!bossTestRequest && !mayResume && newParticipantAdmissionReject(
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
          if (!bossTestRequest && !a.profileId && this.now().getTime() < Date.parse(`${e.date}T${e.start}:00+09:00`))
            fail("EVENT_NOT_STARTED", "해당 술번개 시작 시각 이후 입장할 수 있습니다.", 403);
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
                "SELECT data->>'nickname' AS nickname,data->>'pin_code' AS pin_code,data->>'photo_url' AS photo_url FROM app_kv_rows WHERE table_name='profiles'",
              )
            ).rows;
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
              ...(bossTestRequest ? { boss_test_event: e.id } : {}),
              contact_private: true,
              phone_number: null,
            };
            const binding = {
              id: randomUUID(),
              user_id: id,
              secret_hash: hashDeviceSecret(deviceSecret, this.secret),
              created_at: now,
            };
            const onsiteRows: Array<[string, Record<string, unknown>]> = [
              ["profiles", profile],
              ["device_secrets", binding],
            ];
            if (a.profile.idealMsg || a.profile.featureMsg) {
              const signal = {
                id: randomUUID(),
                user_id: id,
                status_msg: null,
                ideal_msg: a.profile.idealMsg ?? null,
                feature_msg: a.profile.featureMsg ?? null,
                updated_at: now,
              };
              onsiteRows.push(["user_signals", signal]);
              result.signal = signal;
            }
            await tx.db.query(
              "INSERT INTO app_kv_rows(table_name,row_id,data,updated_at) SELECT r.kind,r.id,r.data,now() FROM jsonb_to_recordset($1::jsonb) AS r(kind text,id text,data jsonb)",
              [JSON.stringify(onsiteRows.map(([kind, row]) => ({ kind, id: row.id, data: row })))],
            );
            a.profileId = id;
            a.cycleId = String(settings.event_cycle_archive_id);
            result.profile = profile;
            result.binding = binding;
          }
          a.enteredAt ??= now;
          a.checkin = true;
          a.attendance = "confirmed";
        } else if (m.action === "application.draw") {
          requireEnabled();
          if (eventEnded(e, this.now()))
            fail(
              "EVENT_ENDED",
              "행사 뽑기가 종료되었습니다. 기존 결과는 보존됩니다.",
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
            !paymentSatisfied(a)
          )
            fail("CARDS", "입장 및 카드 활성화가 필요합니다.", 403);
          const onsiteCards = a.profileId ? await tx.get<{cards:unknown[]}>("settings",`onsite-halloween:${e.id}:${a.profileId}`) : undefined;
          if (onsiteCards?.cards.length) fail("CARD_IDENTITY_CONFLICT","기존 현장 카드 결과를 운영자에게 확인해 주세요. 다시 뽑지 마세요.",409);
          if (a.cards.length >= campaignCardLimit(e))
            fail("CARD_LIMIT", `행사별 카드는 ${campaignCardLimit(e)}장까지 뽑을 수 있습니다.`, 409);
          if (!cardSlotAvailable(e, a.cards.length, this.now())) fail("CARD_LOCKED", "아직 카드 해제 시각이 아닙니다.", 403);
          const current = (await tx.db.query(
            "SELECT s.data AS settings, EXISTS(SELECT 1 FROM app_kv_rows p WHERE p.table_name='profiles' AND p.row_id=$1) AS profile_exists FROM (SELECT data FROM app_kv_rows WHERE table_name='app_settings' LIMIT 1) s",
            [a.profileId],
          )).rows[0];
          const currentSettings = current?.settings;
          const liveProfile = current?.profile_exists;
          if (
            !currentSettings ||
            !currentSettings.session_active ||
            currentSettings.event_cycle_reset_complete ||
            currentSettings.event_cycle_archive_id !== a.cycleId ||
            !liveProfile
          )
            fail(
              "EVENT_ENDED",
              "현재 현장 행사에서만 카드를 뽑을 수 있습니다.",
              403,
            );
          if (e.type === "halloween" && m.data.slot !== undefined && m.data.slot !== a.cards.length) fail("CARD_SLOT", "이미 사용했거나 아직 차례가 아닌 카드입니다.", 409);
          if (e.campaign) await drawCampaign(tx, e, a, now, this.pick);
          else {
            const stocks = (await tx.stocksForEvent<HubStock>(e.id)).filter(
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
          if (!a.profileId) fail("CHECKIN", "실제 입장 기록이 필요합니다.");
          if (a.candy)
            fail("CANDY_LIMIT", "하리보는 한 사람에게 한 개만 지급합니다.", 409);
          // Old clients may send an A/B label; new deliveries have one canonical kind.
          z.enum(["haribo", "haribo-a", "haribo-b"]).parse(m.data.kind ?? "haribo");
          a.candy = "haribo";
        } else if (m.action === "admin.application.prize") {
          requireAdmin();
          const card = text(m.data.cardId);
          if (
            !a.cards.some((c) => c.id === card && c.prize !== "다음 기회에") ||
            a.prizesGiven.includes(card)
          )
            fail("PRIZE", "당첨 기록이 없거나 이미 지급했습니다.", 409);
          a.prizesGiven.push(card);
          a.prizeGivenAt={...a.prizeGivenAt,[card]:now};
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
      } else if (m.action === "member.setup") {
        const input = z.object({ reuse: z.literal(true), version: z.literal(HUB_CONSENT_VERSION), password: z.string().min(10).max(128) }).parse(m.data);
        const own = await tx.get<HubOwner>("owner", owner);
        if (!own || own.erasedAt) fail("AUTH", "본인 신청 세션을 먼저 복구해 주세요.", 401);
        if ((await tx.membersForOwner<HubMember>(owner)).some((v) => v.owner === owner)) fail("MEMBER_EXISTS", "이미 비밀번호가 설정되어 있습니다. 기존 비밀번호로 로그인해 주세요.", 409);
        const a = (await tx.applicationsForOwner<HubApplication>(owner)).filter((v) => v.owner === owner && !v.erasedAt && v.basic.collection).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
        if (!a) fail("APPLICATION", "본인 신청 기록을 확인한 뒤 설정할 수 있습니다.", 403);
        const nicknameKey = nickKey(a.basic.nickname);
        if ((await tx.nicknameCandidates<HubMember>("member", nicknameKey)).some((m) => m.owner !== owner && m.nicknameKey === nicknameKey)) fail("NICKNAME", "닉네임 확인이 필요합니다. 관리자에게 문의해 주세요.", 409);
        const salt = randomUUID(), id = randomUUID();
        await tx.put("member", id, { id, owner, nicknameKey, basic: a.basic, profile: a.profile, marketing: own.marketingConsent?.enabled ?? false, salt, passwordHash: scryptSync(input.password, salt, 64).toString("hex"), nicknameChanges: 0,lastActivityAt:now, history: [audit(actor, "member.setup.consent", now)] } satisfies HubMember);
        own.history = [...(own.history ?? []), audit(actor, "member.setup.consent", now, input.version)];
        await tx.put("owner", owner, own);
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
          await recordPrivacyErasure(tx,owner,[{kind:'member',id:member.id,action:'erase'}],now);
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
          if (!admin && m.data.collection !== true && t.consentVersion !== HUB_CONSENT_VERSION)
            fail("CONSENT", "문의 내용 수집 안내에 동의해 주세요.");
          const message = text(m.data.text, 2000);
          if (t.messages.length >= 1000)
            fail(
              "THREAD_LIMIT",
              "문의 기록 보관 한도에 도달했습니다. 관리자에게 문의해 주세요.",
            );
          if (!admin) {
            t.status = "open";
            t.resolvedAt=undefined;
            if (m.data.collection === true) {
              t.consentVersion = HUB_CONSENT_VERSION;
              t.consentAt ??= now;
            }
          }
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
          t.resolvedAt=t.status==="resolved"?(t.resolvedAt??now):undefined;
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
      const { recoveryCode: _recoveryCode, invitationToken: _invitationToken, ...receiptResult } = result;
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
        const e=await this.event(tx,file.eventId);
        const material=e.materials?.find(v=>v.id===id);
        if(material?.hidden || (file.purpose!=="venue-logo" && !e.media.some(url=>HUB_MEDIA_PATH.exec(url)?.[1]===id)))fail("MEDIA","자료에 접근할 수 없습니다.",404);
        const publicLogo=file.purpose==='venue-logo' && (e.promotionLogos??(e.promotionLogo?[e.promotionLogo]:[])).some(v=>v.versionId===id) && e.logoVersions?.some(v=>v.id===id&&v.role==='venue');
        if(publicLogo || (file.purpose==="notice" && material?.purpose==="notice" && !material.hidden)) {
          const own=(await tx.applicationsForOwner<HubApplication>(owner)).some(a=>a.owner===owner&&a.eventId===e.id&&!a.erasedAt);
          if(own || (await this.enabled(tx) && !await publicationBlockedForTx(tx) && (recruitmentIsOpen(e,this.now()) || (e.scheduleEnabled&&!e.schedulePaused&&!eventEnded(e,this.now())))))return file;
        }
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
      const mode = await readEventTestMode(tx);
      if (mode.enabled || !mode.publicAdmissionOpen) return;
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
