import type { HubEvent, HubApplication } from "./event-hub";
export const HALLOWEEN_STOCK = {
  "2026-10-30": {
    "LED 반지": 15,
    "할로윈 키링": 6,
    "LED 밴드": 0,
    "LED 목걸이": 2,
  },
  "2026-10-31": {
    "LED 반지": 25,
    "할로윈 키링": 18,
    "LED 밴드": 2,
    "LED 목걸이": 4,
  },
} as const;

export const HALLOWEEN_CARD_LIMIT = 3;
export type HalloweenRecognitionKind = "none" | "costume" | "painting-sticker";
export const HALLOWEEN_RECOGNITION_LABELS: Record<HalloweenRecognitionKind, string> = {
  none: "분장 혜택 미인정",
  costume: "코스튬 인정",
  "painting-sticker": "페인팅·스티커 인정",
};
export function halloweenEligibility(year: number): "review" | "approved" {
  return year < 1991 ? "review" : "approved";
}
export function halloweenSpecialEligible(
  e: Pick<HubEvent, "campaign">,
  a: Pick<HubApplication, "rank" | "benefitRank" | "benefitExcluded">,
) {
  return (
    !a.benefitExcluded &&
    (a.benefitRank ?? a.rank) > 0 &&
    (a.benefitRank ?? a.rank) <=
      (e.campaign?.kind === "halloween-friday" ? 10 : 15)
  );
}
export function halloweenQuote(
  e: Pick<HubEvent, "campaign" | "date" | "revision"> &
    Partial<Pick<HubEvent, "benefitsEnabled">>,
  rank: number,
  at: Date,
  recognition: HalloweenRecognitionKind = "none",
) {
  const friday = e.campaign?.kind === "halloween-friday";
  if (e.benefitsEnabled === false || rank < 1) rank = 1000000;
  const amount = friday
    ? rank === 1
      ? 0
      : rank === 2
        ? 12000
        : rank === 3
          ? 14000
          : rank <= 5
            ? 16000
            : rank <= 10
              ? 18000
              : undefined
    : rank === 1
      ? 0
      : rank <= 3
        ? 10000
        : rank <= 5
          ? 13000
          : rank <= 10
            ? 15000
            : rank <= 15
              ? 18000
              : undefined;
  const early = at.getTime() < Date.parse(e.date + "T21:00:00+09:00");
  const quote = {
    fee: amount ?? (early ? (friday ? 20000 : 22000) : friday ? 23000 : 25000),
    original: friday ? 23000 : 25000,
    benefit:
      amount !== undefined
        ? rank === 1
          ? "1등 무료 · 관리자 별도 승인"
          : "유효 선착순 혜택"
        : early
          ? "당일 21시 이전 신청"
          : "일반 회비",
    version: e.revision,
    kind: "fixed" as const,
  };
  // Only the server's operator recognition supplies this candidate. Fees never stack.
  const recognizedFee = recognition === "costume" ? 15000 : recognition === "painting-sticker" ? 18000 : undefined;
  return recognizedFee !== undefined && recognizedFee < quote.fee
    ? { ...quote, fee: recognizedFee, benefit: `운영자 ${HALLOWEEN_RECOGNITION_LABELS[recognition]}` }
    : quote;
}
export function halloweenTiming(
  kind: "halloween-friday" | "halloween-saturday",
) {
  return kind === "halloween-friday"
    ? { start: "22:30", end: "01:00" }
    : { start: "22:00", end: "01:00" };
}

// Apply the corrected official hours to existing drafts without rewriting history.
export function effectiveHalloweenHours(e: {type?:string;date:string;start:string;end:string;campaign?:{kind:string}}) {
  if(e.type==="halloween"&&e.campaign?.kind.startsWith("halloween-")&&(e.date==="2026-10-30"||e.date==="2026-10-31"))
    return {start:e.date==="2026-10-30"?"22:30":"22:00",end:"01:00"};
  return {start:e.start,end:e.end};
}
