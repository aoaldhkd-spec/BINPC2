import { randomUUID } from "node:crypto";
import {
  tourDrawEligible,
  type HubEvent,
  type HubApplication,
} from "@workspace/api-zod";
import { type HubTx, fail } from "./event-hub-store.js";
import type { CampaignStock } from "./event-campaign-service.js";
/** Tour-only voucher transaction. Never reads Halloween allocation or normal fixed fees. */
export async function drawTour(
  tx: HubTx,
  e: HubEvent,
  a: HubApplication,
  now: string,
  pick: (max: number) => number,
) {
  if (!tourDrawEligible(e, a))
    fail(
      "TOUR_DRAW",
      "금·토 1차 유효 선착순 10명만 추억의 뽑기를 이용할 수 있습니다.",
      403,
    );
  if (a.cards.length)
    fail("CARD_LIMIT", "추억의 뽑기는 두 장 한 번만 사용할 수 있습니다.", 409);
  const stocks = (await tx.stocksForEvent<CampaignStock>(e.id)).filter(
    (s) => s.eventId === e.id && s.remaining > 0 && s.coupon,
  );
  const pool = stocks.flatMap((s) =>
    Array.from({ length: s.remaining }, () => s),
  );
  if (!pool.length) fail("STOCK", "할인권 재고가 없습니다.", 409);
  const selected = pool[pick(pool.length)];
  selected.remaining--;
  selected.history.push({ at: now, actor: a.owner, action: "coupon.reserve" });
  await tx.put("stock", selected.id, selected);
  const win = {
    id: randomUUID(),
    prize: selected.id,
    prizeLabel: selected.label,
    at: now,
    couponAmount: selected.coupon,
  };
  const loss = {
    id: randomUUID(),
    prize: "다음 기회에",
    prizeLabel: "꽝",
    at: now,
  };
  a.cards = pick(2) === 0 ? [win, loss] : [loss, win];
}
