import { randomUUID } from "node:crypto";
import {
  halloweenSpecialEligible,
  type HubEvent,
  type HubApplication,
} from "@workspace/api-zod";
import type { HubTx } from "./event-hub-store.js";
import type { CampaignStock } from "./event-campaign-service.js";
/** Halloween-only physical inventory transaction. No tour coupon pool or settlement. */
export async function drawHalloween(
  tx: HubTx,
  e: HubEvent,
  a: Pick<HubApplication,"rank"|"benefitRank"|"benefitExcluded"|"owner"|"cards">,
  now: string,
  pick: (max: number) => number,
) {
  const special = halloweenSpecialEligible(e, a);
  const stocks = (await tx.stocksForEvent<CampaignStock>(e.id)).filter(
    (s) =>
      s.eventId === e.id &&
      s.remaining > 0 &&
      !s.coupon &&
      (!s.special || special),
  );
  const selected = stocks[pick(stocks.length + 1)];
  if (selected) {
    selected.remaining--;
    selected.history.push({ at: now, actor: a.owner, action: "draw.reserve" });
    await tx.put("stock", selected.id, selected);
  }
  a.cards.push({
    id: randomUUID(),
    prize: selected?.id ?? "다음 기회에",
    prizeLabel: selected?.label ?? "다음 기회에",
    at: now,
  });
}
