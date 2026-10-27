import { benefitSuccession } from "./event-benefit-succession.js";
import { drawTour } from "./event-policy-tour-server.js";
import { drawHalloween } from "./event-policy-halloween-server.js";
import {
  campaignPresets,
  HALLOWEEN_STOCK,
  HubEventInput,
  type HubApplication,
  type HubEvent,
} from "@workspace/api-zod";
import { type HubTx, fail } from "./event-hub-store.js";
export type CampaignStock = {
  id: string;
  eventId: string;
  label: string;
  remaining: number;
  special?: boolean;
  coupon?: number;
  history: { at: string; actor: string; action: string; reason?: string }[];
};
export async function campaignAction(
  tx: HubTx,
  m: {
    action: string;
    target: string;
    revision?: number;
    data: Record<string, unknown>;
  },
  admin: boolean,
  now: string,
) {
  if (!admin) fail("ADMIN", "관리자만 처리할 수 있습니다.", 403);
  if (m.action === "campaign.prepare") {
    const preset = campaignPresets().find((p) => p.key === m.target);
    if (!preset) fail("CAMPAIGN", "행사 초안을 선택해 주세요.");
    const id = `campaign-${preset.key}`;
    const existing = await tx.get<HubEvent>("event", id);
    if (existing) return { id };
    const others = await tx.all<HubEvent>("event");
    if (
      others.some(
        (e) =>
          e.date === preset.event.date &&
          (e.autoDate ||
            (e.campaign && e.campaign.kind === preset.event.campaign.kind)),
      )
    )
      fail(
        "DUPLICATE_DATE",
        "해당 날짜에 자동방 또는 같은 행사 초안이 있습니다. 기존 방을 확인하세요.",
        409,
      );
    const e: HubEvent = {
      ...HubEventInput.parse(preset.event),
      id,
      revision: 1,
      recruitment: false,
      nextRank: 0,
      history: [{ at: now, actor: "admin", action: "campaign.prepare" }],
    };
    if (e.campaign?.kind === "halloween-friday")
      e.address = "범일 비턴점 · 정확한 주소·지도는 운영자 입력 필요";
    await tx.put("event", id, e);
    const entries =
      e.campaign?.kind === "tour"
        ? [5, 6].includes(new Date(e.date + "T12:00:00+09:00").getUTCDay())
          ? [5000, 4000, 3000, 2000].map((value, i) => ({
              label: `할인권 ${value.toLocaleString()}원`,
              remaining: i + 1,
              coupon: value,
              special: false,
            }))
          : []
        : Object.entries(
            HALLOWEEN_STOCK[e.date as keyof typeof HALLOWEEN_STOCK],
          ).map(([label, remaining]) => ({
            label,
            remaining,
            special: ["LED 밴드", "LED 목걸이"].includes(label),
          }));
    for (const [i, stock] of entries.entries())
      await tx.put("stock", `${id}:stock:${i}`, {
        ...stock,
        id: `${id}:stock:${i}`,
        eventId: id,
        history: [
          { at: now, actor: "admin", action: "campaign.stock.initialized" },
        ],
      });
    return { id };
  }
  return benefitSuccession(tx, m, now);
}
export async function drawCampaign(
  tx: HubTx,
  e: HubEvent,
  a: HubApplication,
  now: string,
  pick: (max: number) => number,
) {
  if (e.campaign?.kind === "tour") return drawTour(tx, e, a, now, pick);
  return drawHalloween(tx, e, a, now, pick);
}
