import { NORMAL_CARD_LIMIT } from "./event-policy-normal";
import {
  HALLOWEEN_STOCK,
  halloweenQuote,
  HALLOWEEN_CARD_LIMIT,
  halloweenEligibility,
} from "./event-policy-halloween";
import {
  TOUR_CARD_LIMIT,
  tourDates,
  tourQuote,
  tourEligibility,
} from "./event-policy-tour";
export * from "./event-policy-halloween";
export * from "./event-policy-tour";
import { z } from "zod";
import type { HubApplication, HubEvent } from "./event-hub";
export const CampaignInput = z.object({
  kind: z.enum(["halloween-friday", "halloween-saturday", "tour"]),
  round: z.literal(1).default(1),
  advance: z.number().int().positive().max(10000000).optional(),
  secondRoundLink: z
    .union([z.literal(""), z.string().url().max(500)])
    .default(""),
});
export const CAMPAIGN_NOTICE = `성인 대상이며 현장에서 신분증을 확인합니다. 기본 참가 범위는 1991~2007년생이며 1990년생 이전은 관리자 사전 문의·개별 검토가 필요합니다.
존댓말과 기본 예절을 지켜 주세요. 욕설·비하·폭력·무단촬영·원치 않는 언행이나 신체접촉·진행방해를 금지합니다. 음주·게임·코스프레를 강요하지 않습니다.
늦참·중간참석·취소·불참은 관리자에게 먼저 알려 주세요. 참가 확정자 최소 5명 이상일 때 개최합니다.
인원질문, 간보기 등은 받지 않으며, 인원과 회비에 크게 신경 쓰지 않으시는 분만 신청 부탁드립니다.
입금 시 신청한 보내는 분 이름을 사용해 주세요. 입금 신고는 승인과 다릅니다. 은행 대조 후 관리자 승인·참가 확정이 필요합니다.
상세 장소·지도는 승인 후 본인 대기방에서 공개합니다. 현장 체크인과 필수 프로필 완료 후 입장할 수 있습니다.`;
export const REPLY_NOTICE = `운영자는 근무 중이거나 숙면 중인 시간을 제외하면 빠르게 답변드립니다.
근무 또는 숙면 중에는 답변이 늦어질 수 있으니 조금만 기다려 주세요. 🙏
신청 접수와 입금 확인은 순차적으로 진행하며, 입금 확인 후 관리자 승인이 완료되어야 참가가 확정됩니다.
선착순 신청자는 안내에 따라 빠르게 입금·응답해 주세요. 입금이나 답변이 늦으면 관리자 확인 후 다음 신청자에게 혜택이 넘어갈 수 있습니다.
단, 관리자의 답변·입금확인 지연 때문에 정상 송금자가 부당하게 혜택을 잃어서는 안 됩니다.`;
export function campaignQuote(
  e: Pick<HubEvent, "campaign" | "date" | "revision"> &
    Partial<Pick<HubEvent, "benefitsEnabled">>,
  rank: number,
  at: Date,
) {
  return e.campaign?.kind === "tour"
    ? tourQuote(e)
    : halloweenQuote(e, rank, at);
}
export function paymentSatisfied(
  a: Pick<HubApplication, "payment" | "waivedAt">,
) {
  return a.payment === "approved" || !!a.waivedAt;
}
export function campaignCardLimit(e: Pick<HubEvent, "campaign">) {
  return !e.campaign
    ? NORMAL_CARD_LIMIT
    : e.campaign.kind === "tour"
      ? TOUR_CARD_LIMIT
      : HALLOWEEN_CARD_LIMIT;
}
export function campaignPresets() {
  const base = {
    area: "부산 범일",
    address: "",
    mapUrl: "",
    fee: 0,
    deposit: 0,
    account: "",
    deadline: "",
    notice: CAMPAIGN_NOTICE,
    replyNotice: REPLY_NOTICE,
    cardsEnabled: true,
    benefitsEnabled: true,
    benefits: [],
    themeEnabled: true,
  };
  const halloween = (["2026-10-30", "2026-10-31"] as const).map((date, i) => ({
    key: `halloween-${date}`,
    event: {
      ...base,
      title: "할로윈 이벤트 술번개",
      type: "halloween" as const,
      date,
      start: i ? "22:00" : "22:30",
      end: "01:00",
      opensAt: i ? "2026-10-29T11:00:00.000Z" : "2026-10-28T11:00:00.000Z",
      scheduleEnabled: false, schedulePaused: true,
      fee: i ? 25000 : 23000,
      address: "",
      theme: "halloween" as const,
      campaign: {
        kind: i
          ? ("halloween-saturday" as const)
          : ("halloween-friday" as const),
        round: 1 as const,
        secondRoundLink: "",
      },
    },
  }));
  const tour = tourDates().map((d) => {
    const weekday = new Date(d.date + "T12:00:00+09:00").getUTCDay(),
      weekend = [5, 6].includes(weekday);
    return {
      key: `tour-${d.date}`,
      event: {
        ...base,
        title: `${d.region} 전국투어 1차`,
        type: "tour" as const,
        date: d.date,
        area: d.region,
        start: weekend ? "22:00" : "21:00",
        end: weekend ? "00:30" : "23:30",
        cardsEnabled: weekend,
        theme: "default" as const,
        campaign: {
          kind: "tour" as const,
          round: 1 as const,
          secondRoundLink: "",
        },
        notice:
          CAMPAIGN_NOTICE +
          "\n대관에 도움을 주신 고래 사장님께 감사드립니다.\n1차만 BINPC2 신청. 2차는 오픈채팅, 3차는 현장 안내입니다. 선입금액은 운영자가 입력하며 최종 1/N 정산은 직접 안내합니다.",
        venueCandidates: [...d.venues],
      },
    };
  });
  return [...halloween, ...tour];
}

export type CampaignPrize = {
  label: string;
  remaining: number;
  special?: boolean;
  coupon?: number;
};
export function campaignInitialStocks(
  e: Pick<HubEvent, "campaign" | "date">,
): CampaignPrize[] {
  if (!e.campaign) return [];
  if (e.campaign.kind === "tour")
    return [5, 6].includes(new Date(e.date + "T12:00:00+09:00").getUTCDay())
      ? [5000, 4000, 3000, 2000].map((coupon, i) => ({
          label: `할인권 ${coupon.toLocaleString()}원`,
          remaining: i + 1,
          coupon,
        }))
      : [];
  const allocation = HALLOWEEN_STOCK[e.date as keyof typeof HALLOWEEN_STOCK];
  return allocation
    ? Object.entries(allocation).map(([label, remaining]) => ({
        label,
        remaining,
        special: ["LED 밴드", "LED 목걸이"].includes(label),
      }))
    : [];
}

export function campaignEligibility(
  e: Pick<HubEvent, "campaign">,
  year: number,
) {
  return e.campaign?.kind === "tour"
    ? tourEligibility(year)
    : halloweenEligibility(year);
}
