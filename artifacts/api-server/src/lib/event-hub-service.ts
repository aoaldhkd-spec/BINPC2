import {
  randomUUID,
  randomInt,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import {
  containsBannedNicknameWord,
  recruitmentIsOpen,
  HubBasic,
  HubConsent,
  HubProfile,
  HubEventInput,
  HUB_CONSENT_VERSION,
  DEFAULT_HUB_SETTINGS,
  profileMissing,
  quoteFor,
  nextSaturday,
  type HubApplication,
  type HubEvent,
  type HubSettings,
  type HubAudit,
} from "@workspace/api-zod";
import { z } from "@workspace/api-zod";
import { HubStore, HubTx, fail, digest } from "./event-hub-store.js";
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

export type HubOwner = {
  id: string;
  recoveryHash: string;
  createdAt: string;
  memberId?: string;
  restricted?: { active: boolean; reason: string; at: string };
  history?: HubAudit[];
  deleteRequestedAt?: string;
  loginFailures?: number;
  loginLockedUntil?: string;
};
export type HubMember = {
  id: string;
  owner: string;
  nicknameKey: string;
  salt: string;
  passwordHash: string;
  nicknameChanges?: number;
  basic: HubApplication["basic"];
  profile: HubApplication["profile"];
  marketing: boolean;
  history: HubAudit[];
};
export type HubThread = {
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
const nickKey = (s: string) =>
  s.normalize("NFKC").toLocaleLowerCase("ko-KR").trim();
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
    const p = new URL(u);
    if (p.protocol !== "https:" || p.username || p.password)
      fail("MEDIA", "HTTPS 링크만 사용할 수 있습니다.");
  }
  if (e.deposit > e.fee) fail("FEE", "선입금이 일반 회비를 초과합니다.");
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
      const owner = (await tx.all<HubOwner>("owner")).find(
        (o) => o.recoveryHash === digest(code),
      );
      if (owner) return owner.id;
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
    return e;
  }
  private async app(tx: HubTx, id: string, owner: string, admin: boolean) {
    const a = await tx.get<HubApplication>("application", id);
    if (!a || (!admin && a.owner !== owner))
      fail("APPLICATION", "신청정보에 접근할 수 없습니다.", 404);
    return a;
  }
  async state(owner?: string, admin = false) {
    return this.store.transaction(async (tx) => {
      const enabled = await this.enabled(tx);
      if (!enabled && !owner && !admin)
        return {
          retentionDays: 180,
          enabled: false,
          events: [],
          applications: [],
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
      const events = await tx.all<HubEvent>("event");
      const apps = (await tx.all<HubApplication>("application")).filter(
        (a) => admin || a.owner === owner,
      );
      const safeEvents = admin
        ? events
        : events
            .filter(
              (e) =>
                (enabled && recruitmentIsOpen(e, this.now())) ||
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
              notice: e.notice,
              noticeVersion: e.noticeVersion,
              media: e.media,
              noticeHistory: (e.versions ?? []).map((v) => ({
                at: v.at,
                notice: v.notice,
              })),
              recruitment: enabled && recruitmentIsOpen(e, this.now()),
              cardsEnabled: e.cardsEnabled,
            }));
      const safeApps = admin
        ? apps
        : apps.map((a) => {
            const e = events.find((e) => e.id === a.eventId)!;
            const { rank, owner: _, quote, ...safe } = a;
            return {
              ...safe,
              profileMissing: profileMissing(a.profile),
              ...(a.stage >= 3
                ? {
                    quote,
                    billing: {
                      quote: a.quote,
                      account: e.account,
                      deadline: e.deadline,
                      included: e.included,
                      deposit: Math.min(e.deposit, a.quote?.fee ?? 0),
                    },
                  }
                : {}),
              ...(a.payment === "approved"
                ? { venue: { address: e.address, mapUrl: e.mapUrl } }
                : {}),
            };
          });
      const threads = (await tx.all<HubThread>("thread")).filter(
        (t) => admin || t.id === owner,
      );
      const stocks = admin ? await tx.all<HubStock>("stock") : [];
      const settings = admin
        ? ((await tx.get<HubSettings>("settings", "global")) ??
          DEFAULT_HUB_SETTINGS)
        : undefined;
      const member = owner
        ? (await tx.all<HubMember>("member")).find((m) => m.owner === owner)
        : undefined;
      const owners = admin
        ? (await tx.all<HubOwner>("owner")).map(({ recoveryHash, ...o }) => o)
        : undefined;
      const members = admin
        ? (await tx.all<HubMember>("member")).map(
            ({ salt, passwordHash, ...m }) => m,
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
      return {
        retentionDays:
          (await tx.get<HubSettings>("settings", "global"))?.retentionDays ??
          180,
        owners,
        members,
        errors,
        enabled,
        events: safeEvents,
        applications: safeApps,
        threads,
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
      if (!owner && !admin)
        fail("AUTH", "개인 신청 세션을 먼저 복구해 주세요.", 401);
      const enabled = await this.enabled(tx);
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
      let result: Record<string, unknown> = {
        saved: true,
        requestId: m.requestId,
      };
      if (m.action === "event.save") {
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
        };
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
        if (old) e.noticeVersion = Math.max(old.noticeVersion, e.noticeVersion);
        await tx.put("event", e.id, e);
        result.id = e.id;
      } else if (m.action === "event.recruitment") {
        requireAdmin();
        const e = await this.event(tx, m.target);
        revision(e.revision);
        const on = z.boolean().parse(m.data.enabled);
        if (on && (!e.account || !e.deadline || !e.area))
          fail("CONFIG", "계좌·입금기한·지역을 먼저 설정해 주세요.");
        e.recruitment = on;
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
        for (const t of saved.templates)
          validateEvent({ ...t.event, date: "2099-01-03" });
        if (saved.autoTemplate)
          validateEvent({ ...saved.autoTemplate, date: "2099-01-03" });
        await tx.put("settings", "global", {
          ...saved,
          revision: (old?.revision ?? 0) + 1,
        });
      } else if (m.action === "application.basic") {
        requireEnabled();
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
        const basic = HubBasic.parse(m.data.basic);
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
        const apps = await tx.all<HubApplication>("application");
        const member = (await tx.all<HubMember>("member")).find(
          (v) => v.owner === owner,
        );
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
          const members = await tx.all<HubMember>("member");
          if (
            apps.some(
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
              payment: "none",
              attendance: "pending",
              checkin: false,
              profile: member ? { ...member.profile } : { lastStep: 1 },
              quote: quoteFor(e, e.nextRank),
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
        if (m.action === "application.consent") {
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
          a.consent = { ...c, acceptedAt: now, noticeVersion: e.noticeVersion };
          a.quote ??= quoteFor(e, a.rank);
          a.stage = 3;
        } else if (m.action === "application.notice") {
          if (!a.consent) fail("CONSENT", "필수 공지 동의가 필요합니다.");
          a.consent.noticeVersion = e.noticeVersion;
          a.consent.acceptedAt = now;
        } else if (m.action === "application.confirm") {
          requireEnabled();
          if (
            a.stage !== 3 ||
            !a.quote ||
            a.consent?.noticeVersion !== e.noticeVersion
          )
            fail("STAGE", "최신 공지와 회비를 확인해 주세요.");
          a.stage = 4;
          a.confirmedAt = now;
        } else if (m.action === "application.report") {
          if (!a.confirmedAt)
            fail("STAGE", "먼저 금액을 확인하고 신청을 확정해 주세요.");
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
        } else if (m.action === "admin.application.payment") {
          requireAdmin();
          const status = z
            .enum(["approved", "mismatch", "held"])
            .parse(m.data.status);
          if (!a.confirmedAt)
            fail("STAGE", "아직 최종 신청을 확정하지 않았습니다.");
          if (status === "approved" && m.data.bankChecked !== true)
            fail("BANK", "은행 내역을 직접 대조한 뒤 확인해 주세요.");
          if (a.payment === "approved" && status !== "approved")
            fail(
              "PAYMENT",
              "이미 승인한 입금은 이 동작으로 되돌릴 수 없습니다.",
            );
          a.payment = status;
          if (status === "approved") a.approvedAt ??= now;
        } else if (m.action === "admin.application.attendance") {
          requireAdmin();
          if (a.payment !== "approved")
            fail(
              "PAYMENT",
              "실제 입금을 승인한 사람만 대기자·참가 확정이 가능합니다.",
            );
          a.attendance = z
            .enum(["paid_waitlist", "confirmed"])
            .parse(m.data.status);
        } else if (m.action === "admin.application.checkin") {
          requireAdmin();
          if (a.payment !== "approved" || a.attendance !== "confirmed")
            fail("ATTENDANCE", "참가 확정 후 현장 확인해 주세요.");
          a.checkin = z.boolean().parse(m.data.checked);
        } else if (m.action === "admin.application.note") {
          requireAdmin();
          text(m.data.reason, 1000);
        } else if (m.action === "admin.application.reprice") {
          requireAdmin();
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
          const own = await tx.get<HubOwner>("owner", a.owner);
          if (own?.restricted?.active)
            fail(
              "RESTRICTED",
              "관리자 확인이 필요한 신청입니다. 문의해 주세요.",
              403,
            );
          const missing = profileMissing(a.profile);
          if (
            !a.confirmedAt ||
            a.payment !== "approved" ||
            a.attendance !== "confirmed" ||
            !a.checkin
          )
            fail("ATTENDANCE", "입금·참가 확정·현장 확인이 필요합니다.", 403);
          if (missing.length)
            fail(
              "PROFILE_INCOMPLETE",
              `입장하려면 프로필을 먼저 완성해야 합니다: ${missing.join(", ")}`,
              403,
            );
          if (
            a.consent?.version !== HUB_CONSENT_VERSION ||
            a.consent.noticeVersion !== e.noticeVersion
          )
            fail("CONSENT", "변경된 공지를 확인해 주세요.", 403);
          const settings = (
            await tx.db.query(
              "SELECT data FROM app_kv_rows WHERE table_name='app_settings' ORDER BY updated_at DESC LIMIT 1 FOR UPDATE",
            )
          ).rows[0]?.data;
          if (
            !settings ||
            newParticipantAdmissionReject(
              settings,
              { isAdmin: false, isTestRuntime: false },
              this.now(),
            )
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
          if (
            !e.cardsEnabled ||
            !a.profileId ||
            !a.checkin ||
            a.attendance !== "confirmed" ||
            a.payment !== "approved"
          )
            fail("CARDS", "입장 및 카드 활성화가 필요합니다.", 403);
          if (a.cards.length >= 3)
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
            !currentSettings?.session_active ||
            currentSettings.event_cycle_reset_complete ||
            currentSettings.event_cycle_archive_id !== a.cycleId ||
            !liveProfile
          )
            fail(
              "EVENT_ENDED",
              "현재 현장 행사에서만 카드를 뽑을 수 있습니다.",
              403,
            );
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
            at: now,
          });
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
      } else if (m.action === "privacy.request") {
        const own = await tx.get<HubOwner>("owner", owner);
        if (!own) fail("AUTH", "개인 신청 세션을 복구해 주세요.", 401);
        own.deleteRequestedAt = now;
        own.history = [
          ...(own.history ?? []),
          audit(actor, "privacy.delete.request", now),
        ];
        await tx.put("owner", own.id, own);
      } else if (
        m.action === "member.withdraw" ||
        m.action === "member.marketing"
      ) {
        const member = (await tx.all<HubMember>("member")).find(
          (v) => v.owner === owner,
        );
        if (!member) fail("MEMBER", "재사용 회원정보가 없습니다.", 404);
        if (m.action === "member.withdraw") {
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
        } else {
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
        m.action === "thread.tag"
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
          if (!admin && m.data.collection !== true)
            fail("CONSENT", "문의 내용 수집 안내에 동의해 주세요.");
          const message = text(m.data.text, 2000);
          if (t.messages.length >= 1000)
            fail(
              "THREAD_LIMIT",
              "문의 기록 보관 한도에 도달했습니다. 관리자에게 문의해 주세요.",
            );
          t.messages.push({
            id: m.requestId,
            sender: admin ? "admin" : "user",
            text: message,
            at: now,
          });
        } else if (m.action === "thread.read") {
          if (admin) t.readAdminAt = now;
          else t.readUserAt = now;
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
      await tx.put("request", key, { hash, result, createdAt: now });
      return result;
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
      const s =
        (await tx.get<HubSettings>("settings", "global")) ??
        DEFAULT_HUB_SETTINGS;
      if (!s.autoSaturday || s.paused) return;
      const date = nextSaturday(this.now(), s.skipDates);
      if (
        Date.parse(`${date}T22:00:00+09:00`) - this.now().getTime() >
        s.leadDays * 86400000
      )
        return;
      const id = `auto-${date}`;
      if (await tx.get("event", id)) return;
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
