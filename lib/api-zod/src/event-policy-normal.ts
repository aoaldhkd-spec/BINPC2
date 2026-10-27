import type { HubEvent } from "./event-hub";
export function normalQuote(
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
export const NORMAL_CARD_LIMIT = 3;
