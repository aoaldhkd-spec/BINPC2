import { z } from "zod";

export const HUB_CONSENT_VERSION = "2026-10-27-event-v6";
export const PROFILE_CONSENT_VERSION = "2026-10-13-v1";
export const HubBasic = z.object({
  nickname: z.string().trim().min(2).max(12),
  birthYear: z.number().int().min(1900).max(2100),
  location: z.string().trim().min(1).max(40),
  phone: z.string().regex(/^0[0-9 -]{8,14}$/),
  depositor: z.string().trim().min(1).max(40),
  collection: z.literal(true),
  version: z.literal(HUB_CONSENT_VERSION),
});
export const HubConsent = z.object({
  collection: z.literal(true),
  sharing: z.literal(true),
  notice: z.literal(true),
  version: z.literal(HUB_CONSENT_VERSION),
  reuse: z.boolean().default(false),
  marketing: z.boolean().default(false),
  push: z.boolean().default(false),
  profileNow: z.boolean().default(false),
});
export const HubProfile = z.object({
  mbti: z
    .string()
    .regex(/^[IE][NS][TF][JP]$/)
    .optional(),
  interests: z.array(z.string().trim().min(1).max(30)).max(5).optional(),
  personalityScore: z
    .number()
    .refine((v) => [-1, 15, 35, 50, 70, 100].includes(v))
    .optional(),
  privacyConsent: z
    .object({
      collection: z.literal(true),
      sharing: z.literal(true),
      version: z.literal(PROFILE_CONSENT_VERSION),
    })
    .optional(),
  pushDecision: z.enum(["enable", "skip"]).optional(),
  idealMsg: z.string().max(500).nullable().optional(),
  featureMsg: z.string().max(500).nullable().optional(),
  lastStep: z.number().int().min(1).max(6).default(1),
});
export type HubProfileData = z.infer<typeof HubProfile>;
export const Benefit = z.object({
  from: z.number().int().positive(),
  to: z.number().int().positive(),
  type: z.enum(["discount", "final", "free", "gift"]),
  value: z.number().int().min(0),
  label: z.string().max(100),
});
export const HubEventInput = z.object({
  opensAt: z.string().datetime().optional(),
  title: z.string().trim().min(1).max(100),
  type: z.enum(["normal", "halloween", "tour", "custom"]).default("normal"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .default("22:00"),
  end: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .default("01:00"),
  area: z.string().max(100),
  address: z.string().max(400),
  mapUrl: z.string().max(500).default(""),
  fee: z.number().int().min(0).max(10000000),
  deposit: z.number().int().min(0).default(0),
  account: z.string().max(200),
  deadline: z.string().max(100),
  included: z.string().max(1000).default(""),
  notice: z.string().min(1).max(10000),
  noticeVersion: z.number().int().positive().default(1),
  benefitsEnabled: z.boolean().default(false),
  benefits: z.array(Benefit).max(30).default([]),
  cardsEnabled: z.boolean().default(false),
  notificationsEnabled: z.boolean().default(false),
  media: z
    .array(
      z.union([
        z.string().url().max(500),
        z
          .string()
          .regex(
            /^\/api\/event-hub\/media\/[a-f0-9-]{36}\.(png|jpg|webp|mp4|webm)$/,
          ),
      ]),
    )
    .max(10)
    .default([]),
});
export type HubEvent = z.infer<typeof HubEventInput> & {
  id: string;
  revision: number;
  recruitment: boolean;
  nextRank: number;
  autoDate?: string;
  history: HubAudit[];
  versions?: {
    at: string;
    notice: string;
    address: string;
    fee: number;
    account: string;
  }[];
};
export type HubAudit = {
  at: string;
  actor: string;
  action: string;
  reason?: string;
};
export type HubApplication = {
  erasedAt?: string;
  id: string;
  eventId: string;
  owner: string;
  revision: number;
  stage: 1 | 2 | 3 | 4;
  rank: number;
  basic: z.infer<typeof HubBasic>;
  consent?: z.infer<typeof HubConsent> & {
    acceptedAt: string;
    noticeVersion: number;
  };
  quote?: { fee: number; original: number; benefit: string; version: number };
  confirmedAt?: string;
  payment: "none" | "reported" | "approved" | "mismatch" | "held";
  reportedAt?: string;
  approvedAt?: string;
  attendance: "pending" | "paid_waitlist" | "confirmed";
  checkin: boolean;
  profile: HubProfileData;
  profileId?: string;
  cycleId?: string;
  cards: { id: string; prize: string; at: string }[];
  candy?: string;
  prizesGiven: string[];
  history: HubAudit[];
  retainUntil?: string;
  updatedAt: string;
};
export type HubSettings = {
  revision?: number;
  autoSaturday: boolean;
  paused: boolean;
  skipDates: string[];
  leadDays: number;
  retentionDays: number;
  budget?: { totalCandidate: number; cashEnabled: false };
  templates?: {
    name: string;
    event: Omit<z.infer<typeof HubEventInput>, "date">;
  }[];
  autoTemplate?: Omit<z.infer<typeof HubEventInput>, "date">;
  places: { name: string; area: string; address: string; mapUrl: string }[];
};
export const DEFAULT_HUB_SETTINGS: HubSettings = {
  autoSaturday: false,
  paused: false,
  skipDates: [],
  leadDays: 7,
  retentionDays: 180,
  places: [],
};
export function profileMissing(p: Partial<HubProfileData>): string[] {
  const missing: string[] = [];
  if (!p.mbti || !/^[IE][NS][TF][JP]$/.test(p.mbti)) missing.push("MBTI");
  if (!p.interests || new Set(p.interests).size < 2)
    missing.push("관심사 2개 이상");
  if (
    p.personalityScore === undefined ||
    ![-1, 15, 35, 50, 70, 100].includes(p.personalityScore)
  )
    missing.push("성향");
  if (
    p.privacyConsent?.collection !== true ||
    p.privacyConsent?.sharing !== true ||
    p.privacyConsent.version !== PROFILE_CONSENT_VERSION
  )
    missing.push("필수 개인정보 동의");
  if (!p.pushDecision) missing.push("알림 수신 여부 선택");
  return missing;
}
export function quoteFor(
  e: Pick<HubEvent, "fee" | "benefitsEnabled" | "benefits" | "revision">,
  rank: number,
) {
  const b = e.benefitsEnabled
    ? e.benefits.find((b) => rank >= b.from && rank <= b.to)
    : undefined;
  const fee =
    !b || b.type === "gift"
      ? e.fee
      : b.type === "free"
        ? 0
        : b.type === "final"
          ? b.value
          : Math.max(0, e.fee - b.value);
  return {
    fee,
    original: e.fee,
    benefit: b?.label ?? "일반 회비",
    version: e.revision,
  };
}
/** Pure preview also used by the removable administrator laboratory. */
export function nextSaturday(now: Date, skipDates: string[] = []): string {
  const kst = new Date(now.getTime() + 9 * 3600000);
  for (let i = 0; i < 7 * (skipDates.length + 2); i++) {
    const d = new Date(
      Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + i),
    );
    const key = d.toISOString().slice(0, 10);
    if (
      d.getUTCDay() === 6 &&
      !skipDates.includes(key) &&
      Date.parse(`${key}T22:00:00+09:00`) > now.getTime()
    )
      return key;
  }
  throw new Error("다음 토요일을 확인해 주세요.");
}

export function recruitmentIsOpen(
  e: Pick<HubEvent, "recruitment" | "opensAt">,
  now: Date = new Date(),
): boolean {
  return (
    e.recruitment && (!e.opensAt || Date.parse(e.opensAt) <= now.getTime())
  );
}

export function budgetSplit(total: number) {
  const friday = Math.floor(total * 0.3);
  return { friday, saturday: total - friday };
}
