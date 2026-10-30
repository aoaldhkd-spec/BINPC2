import { PaymentAccount, type VenueAddress } from "./event-venue-directory";
import { eventEnded } from "./event-hub-modules";
import { normalQuote } from "./event-policy-normal";
import { z } from "zod";
import { CampaignInput, campaignQuote } from "./event-campaign";
import type { HalloweenRecognitionKind } from "./event-policy-halloween";

export const HUB_CONSENT_VERSION = "2026-10-27-event-v6";
export const PROFILE_CONSENT_VERSION = "2026-10-13-v1";
export const HubBasic = z.object({
  nickname: z.string().trim().min(2).max(12),
  birthYear: z.number().int().min(1900).max(2100),
  location: z.string().trim().min(1).max(40),
  residence: z.object({city:z.string().trim().min(1).max(20),kind:z.enum(["city","district","neighborhood"]),value:z.string().trim().min(1).max(30)}).optional(),
  // Legacy records remain readable. General request handlers discard newly supplied phone input.
  phone: z.string().regex(/^0[0-9 -]{8,14}$/).optional(),
  depositor: z.string().trim().min(1).max(40),
  collection: z.literal(true),
  version: z.literal(HUB_CONSENT_VERSION),
});
// A consented draft never reserves a rank or changes an approved application.
export const HubBasicDraftInput = z.object({
  basic: HubBasic.partial().required({ collection: true, version: true }),
  nextStep: z.number().int().min(1).max(5),
});
export type HubBasicDraft = z.infer<typeof HubBasicDraftInput> & {
  revision: number;
  updatedAt: string;
};
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
  campaign: CampaignInput.optional(),
  theme: z.enum(["default", "halloween", "christmas", "yearend"]).optional(),
  themeEnabled: z.boolean().optional(),
  replyNotice: z.string().max(4000).optional(),
  venueCandidates: z.array(z.string().max(100)).max(10).optional(),
  opensAt: z.string().datetime().optional(),
  closesAt: z.string().datetime().optional(),
  scheduleEnabled: z.boolean().optional(),
  schedulePaused: z.boolean().optional(),
  benefitsOpensAt: z.string().datetime().optional(),
  benefitsClosesAt: z.string().datetime().optional(),
  lateReviewAfter: z.string().datetime().optional(),
  venueLogoId: z.enum(["red_hole","fake","jack","m_karaoke","speed","check_in","on_top","black"]).optional(),
  venueLogoVersionId: z.string().uuid().optional(),
  thanksLogoVersionId: z.string().uuid().optional(),
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
  accounts: z.array(PaymentAccount).max(2).optional(),
  venueAddressId: z.string().uuid().nullable().optional(),
  deadline: z.string().max(100),
  included: z.string().max(1000).default(""),
  // A draft may be empty; publication/consent require text or approved public notice images.
  notice: z.string().max(10000).default(""),
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
export type HubLogoVersion = {id:string;url:string;label:string;role:'venue'|'thanks';provenance:'original'|'design';sourceNote:string;mime:string;width:number;height:number;size:number;sha256:string;at:string};
export type HubMaterial = {id:string;url:string;purpose:"notice"|"map"|"poster"|"video";alt:string;hidden:boolean;at:string};
export type HubPromotionLogo = { builtinId?: string; versionId?: string; url?: string; label?: string; provenance?: 'original'|'design'; width?: number; height?: number };
export type HubEvent = z.infer<typeof HubEventInput> & {
  /** Server-created real API test event; never eligible for public admission. */
  bossTestOnly?: boolean;
  /** Changed only by the explicit logo selection command; general event saves preserve it. */
  addressRecord?: VenueAddress;
  promotionLogo?: HubPromotionLogo;
  /** undefined keeps legacy/default artwork; [] explicitly unlinks all public logos. */
  promotionLogos?: HubPromotionLogo[];
  logoVersions?: HubLogoVersion[];
  materials?: HubMaterial[];
  id: string;
  revision: number;
  recruitment: boolean;
  nextRank: number;
  autoDate?: string;
  history: HubAudit[];
  noticeHistory?: { at: string; notice: string }[];
  versions?: {
    at: string;
    notice: string;
    address: string;
    fee: number;
    account: string;
    noticeVersion?: number;
    noticeMedia?: {id:string;url:string;alt:string}[];
  }[];
};
export type HubAudit = {
  at: string;
  actor: string;
  action: string;
  reason?: string;
};
export type HubApplication = {
  bossTestOnly?: boolean;
  sponsorOwner?: string;
  companionDraftId?: string;
  /** Representative-provided event registration; never substitutes for personal consent. */
  companionSubmission?: { submittedAt: string; permissionToProvideAt: string; personalConsentPending: boolean; linkedAt?: string };
  combinedPaymentReport?: { sponsorOwner: string; batchId: string; at: string };
  privacyPolicyConsent?:{version:string;fingerprint:string;at:string};
  erasedAt?: string;
  id: string;
  eventId: string;
  owner: string;
  revision: number;
  stage: 1 | 2 | 3 | 4;
  rank: number;
  basic: Omit<z.infer<typeof HubBasic>, "phone" | "depositor" | "collection" | "version"> &
    Partial<Pick<z.infer<typeof HubBasic>, "phone" | "depositor" | "collection" | "version">>;
  consent?: z.infer<typeof HubConsent> & {
    acceptedAt: string;
    noticeVersion: number;
  };
  quote?: {
    fee: number;
    original: number;
    benefit: string;
    version: number;
    kind?: "fixed" | "advance";
  };
  confirmedAt?: string;
  payment: "none" | "reported" | "approved" | "mismatch" | "held";
  paymentAccount?: z.infer<typeof PaymentAccount>;
  reportedAt?: string;
  approvedAt?: string;
  waivedAt?: string;
  approvalRevokedAt?: string;
  enteredAt?: string;
  rewardPhone?: string;
  rewardPhoneRetainFrom?: string;
  prizeGivenAt?: Record<string,string>;
  rewardPhoneRequest?: {source:"card"|"result";resultId:string;purpose:string;requestedAt:string;fulfilledAt?:string;retentionStartedAt?:string};
  lateArrival?: { at: string; reason: string; status: "noted"|"review"|"approved"|"declined"; reviewReason?: string };
  manualResults?: {id:string;label:string;amount:number;kind?:"item"|"cash"|"discount";at:string;reason?:string;receivedAt?:string;paidAt?:string}[];
  benefitRank?: number;
  benefitExcluded?: boolean;
  benefitContact?: string;
  differenceReview?: { previous: number; proposed: number; at: string };
  halloweenRecognition?: {
    kind: HalloweenRecognitionKind;
    at: string;
    finalFee: number;
    proposedFee: number;
    participantNotice: string;
  };
  eligibility?: {
    status: "review" | "approved" | "declined";
    message?: string;
  };
  screeningPhoto?: { id: string; deletedAt?: string };

  attendance: "pending" | "paid_waitlist" | "confirmed";
  checkin: boolean;
  profile: HubProfileData;
  profileId?: string;
  cycleId?: string;
  cards: {
    id: string;
    prize: string;
    prizeLabel?: string;
    couponAmount?: number;
    at: string;
  }[];
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
  campaignModules?: { halloweenDraw: boolean; tourDraw: boolean };
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
  e: Pick<HubEvent, "fee" | "benefitsEnabled" | "benefits" | "revision"> &
    Partial<Pick<HubEvent, "campaign" | "date" | "benefitsOpensAt" | "benefitsClosesAt">>,
  rank: number,
  at: Date = new Date(),
  recognition?: HalloweenRecognitionKind,
) {
  const outsideBenefitWindow = (e.benefitsOpensAt && at.getTime()<Date.parse(e.benefitsOpensAt)) || (e.benefitsClosesAt && at.getTime()>=Date.parse(e.benefitsClosesAt));
  if (outsideBenefitWindow) e={...e,benefitsEnabled:false};
  if (e.campaign) return campaignQuote(e as HubEvent, rank, at, recognition);
  return normalQuote(e, rank);
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
  e: Pick<HubEvent, "recruitment" | "opensAt"> &
    Partial<Pick<HubEvent, "date" | "start" | "end" | "closesAt">>,
  now: Date = new Date(),
): boolean {
  return (
    e.recruitment &&
    (!(e.date && e.start && e.end) || !eventEnded(e as HubEvent, now)) &&
    (!e.opensAt || Date.parse(e.opensAt) <= now.getTime()) &&
    (!e.closesAt || now.getTime() < Date.parse(e.closesAt))
  );
}

export function budgetSplit(total: number) {
  const friday = Math.floor(total * 0.3);
  return { friday, saturday: total - friday };
}
