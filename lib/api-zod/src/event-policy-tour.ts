import type { HubEvent, HubApplication } from "./event-hub";
export const TOUR_WEEKS = [
  {
    region: "인천",
    start: "2026-11-05",
    venues: ["레드홀(RED HOLE)", "페이크(FAKE)"],
  },
  { region: "종로", start: "2026-11-12", venues: ["자크(JACK)"] },
  {
    region: "광주",
    start: "2026-11-19",
    venues: ["M가라오케", "스피드(SPEED)"],
  },
  {
    region: "신림",
    start: "2026-11-26",
    venues: ["체크인(CHECK-IN)", "온탑(ONTOP)"],
  },
] as const;
export function tourDates() {
  return TOUR_WEEKS.flatMap((w) =>
    Array.from({ length: 4 }, (_, i) => ({
      ...w,
      date: new Date(Date.parse(w.start + "T00:00:00Z") + i * 86400000)
        .toISOString()
        .slice(0, 10),
    })),
  );
}
export function tourDrawEligible(
  e: Pick<HubEvent, "campaign" | "date">,
  a: Pick<HubApplication, "rank" | "benefitRank" | "benefitExcluded">,
) {
  const day = new Date(e.date + "T12:00:00+09:00").getUTCDay();
  return (
    e.campaign?.kind === "tour" &&
    e.campaign.round === 1 &&
    [5, 6].includes(day) &&
    !a.benefitExcluded &&
    (a.benefitRank ?? a.rank) >= 1 &&
    (a.benefitRank ?? a.rank) <= 10
  );
}
export function tourSessionHours(date: string) {
  if (!tourDates().some((d) => d.date === date)) return null;
  const weekend = [5, 6].includes(
    new Date(date + "T12:00:00+09:00").getUTCDay(),
  );
  return {
    first: weekend ? "22:00~익일00:30" : "21:00~23:30",
    second: weekend ? "익일00:30~02:30" : "23:30~익일01:30",
    third: weekend
      ? "익일02:30 이후 · 종료 미정"
      : "익일01:30 이후 · 종료 미정",
  };
}

export const TOUR_CARD_LIMIT = 2;
export function tourEligibility(year: number): "review" | "approved" {
  return year < 1991 ? "review" : "approved";
}
export function tourQuote(e: Pick<HubEvent, "campaign" | "revision">) {
  return {
    fee: e.campaign?.advance ?? 0,
    original: e.campaign?.advance ?? 0,
    benefit: "선입금 · 최종 1/N 정산은 운영자 직접 안내",
    version: e.revision,
    kind: "advance" as const,
  };
}
export function tourFirstTiming(date: string) {
  const weekend = [5, 6].includes(
    new Date(date + "T12:00:00+09:00").getUTCDay(),
  );
  return weekend
    ? { start: "22:00", end: "00:30" }
    : { start: "21:00", end: "23:30" };
}
