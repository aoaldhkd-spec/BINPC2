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
  bossTestOnly = false,
) {
  if (!admin) fail("ADMIN", "관리자만 처리할 수 있습니다.", 403);
  if (m.action === "campaign.prepare") {
    const preset = campaignPresets().find((p) => p.key === m.target);
    if (!preset) fail("CAMPAIGN", "행사 초안을 선택해 주세요.");
    const id = `${bossTestOnly ? 'boss-test' : 'campaign'}-${preset.key}`;
    const existing = await tx.get<HubEvent>("event", id);
    const others = (await tx.all<HubEvent>("event")).filter(e => Boolean(e.bossTestOnly) === bossTestOnly);
    const daegu = preset.event.campaign.kind === "tour" && preset.event.area === "대구";
    const candidates = others.filter((e) => e.campaign?.kind === "tour" && e.date === preset.event.date && /대구|BLACK/i.test(e.area + " " + e.title));
    if (daegu && (existing || candidates.length)) {
      if (!existing && candidates.length > 1) fail("DUPLICATE_DATE", "같은 날짜의 대구 후보가 여러 개입니다. 기존 기록을 관리자에게 확인해 주세요.", 409);
      const e = existing ?? candidates[0];
      if (!e.history.some((h) => h.action === "campaign.daegu.confirm.v12")) {
        e.versions = [...(e.versions ?? []), { at: now, notice: e.notice, address: e.address, fee: e.fee, account: e.account }];
        e.title = preset.event.title;
        e.area = preset.event.area;
        e.start = preset.event.start;
        e.end = preset.event.end;
        e.venueCandidates = [...(HubEventInput.parse(preset.event).venueCandidates ?? [])];
        if (!e.venueLogoVersionId) e.venueLogoId = "black";
        e.notice = e.notice.replace(/대구[^\n.。]*(?:미확정|확정 전)[^\n.。]*/g, "대구 BLACK 개최 확정 · 2026년 12월 3~6일");
        const line = `${e.date} 대구 블랙(BLACK) · 1차 ${e.start}~${e.end <= e.start ? "다음 날 " : ""}${e.end}. BINPC2는 1차만 신청하며 모집 오픈은 별도 안내합니다.`;
        if (!e.notice.includes(line)) e.notice += "\n\n" + line;
        e.noticeVersion++;
        e.revision++;
        e.history.push({ at: now, actor: "admin", action: "campaign.daegu.confirm.v12" });
        await tx.put("event", e.id, e);
      }
      return { id: e.id, reused: true };
    }
    if (existing) return { id };
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
      ...(bossTestOnly ? { bossTestOnly: true, title: `${preset.event.title} · 보스 확인용`, account: "실제 송금 없이 입금 신고·승인 흐름만 확인하세요.", accounts: [], scheduleEnabled: false } : {}),
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
