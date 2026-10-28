import { describe, it, expect } from "vitest";
import { campaignPresets, campaignInitialStocks } from "../../../../lib/api-zod/src/event-campaign";
import { HubEventInput } from "../../../../lib/api-zod/src/event-hub";
import {
  EventLaboratoryStore,
  laboratoryStage,
} from "./event-laboratory-store";
import {
  HUB_CONSENT_VERSION,
  PROFILE_CONSENT_VERSION,
} from "../../../../lib/api-zod/src/event-hub";
const basic = {
  nickname: "가상회원",
  birthYear: 1995,
  location: "부산",
  phone: "01000000000",
  depositor: "가상 입금자",
  collection: true,
  version: HUB_CONSENT_VERSION,
};
const consent = {
  collection: true,
  sharing: true,
  notice: true,
  version: HUB_CONSENT_VERSION,
  reuse: false,
};
function command(
  s: EventLaboratoryStore,
  action: string,
  data: Record<string, unknown> = {},
  admin = false,
  id = crypto.randomUUID(),
) {
  const app = s.value.applications[0];
  return s.execute(
    {
      action,
      target: app?.id ?? "",
      revision: app?.revision,
      data,
      requestId: id,
    },
    admin,
  );
}
describe("complete event laboratory adapter", () => {
  it("runs actual form stages without early fee/address exposure; rank 3/4 uses the shared quote rules", () => {
    const s = new EventLaboratoryStore();
    s.reset();
    expect(s.state().applications).toEqual([]);
    command(s, "application.basic", { eventId: s.value.event.id, basic });
    expect(s.state().applications[0]).not.toHaveProperty("billing");
    command(s, "application.consent", { consent });
    expect(s.state().applications[0].billing?.quote.fee).toBe(40000);
    command(s, "application.confirm");
    command(s, "application.report");
    expect(s.value.applications[0].payment).toBe("reported");
    expect(() =>
      command(s, "admin.application.payment", {
        status: "approved",
        bankChecked: true,
      }),
    ).toThrow("관리자");
    command(
      s,
      "admin.application.payment",
      { status: "approved", bankChecked: true },
      true,
    );
    expect(s.state().applications[0].venue?.address).toContain("가상");
    s.jump("회비 확인", 4);
    expect(s.state().applications[0].billing?.quote.fee).toBe(50000);
  });
  it("blocks incomplete/unchecked/not-started entry and enforces card/candy/prize state through both roles", () => {
    const s = new EventLaboratoryStore();
    s.jump("프로필 미완료");
    expect(() => command(s, "application.enter")).toThrow("프로필");
    command(s, "application.profile", {
      profile: {
        mbti: "ENFP",
        interests: ["여행", "쇼핑"],
        personalityScore: 50,
        privacyConsent: {
          collection: true,
          sharing: true,
          version: PROFILE_CONSENT_VERSION,
        },
        pushDecision: "skip",
        lastStep: 6,
      },
    });
    s.configure({ active: false });
    expect(() => command(s, "application.enter")).toThrow("회식");
    s.configure({ active: true });
    command(s, "application.enter");
    for (let i = 0; i < 3; i++) command(s, "application.draw");
    expect(() => command(s, "application.draw")).toThrow("3장");
    expect(s.value.stock).toBe(0);
    command(s, "admin.application.candy", { kind: "haribo-a" }, true);
    expect(() =>
      command(s, "admin.application.candy", { kind: "haribo-b" }, true),
    ).toThrow("한 개");
    const cardId = s.value.applications[0].cards[0].id;
    command(s, "admin.application.prize", { cardId }, true);
    expect(() =>
      command(s, "admin.application.prize", { cardId }, true),
    ).toThrow("이미 지급");
  });
  it("replays identical requests once, rolls back rejected commands, and restores local progress across reload", () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
      removeItem: (k: string) => {
        map.delete(k);
      },
    };
    const s = new EventLaboratoryStore(undefined, storage);
    s.jump("입금 신고");
    const app = s.value.applications[0];
    const c = {
      action: "admin.application.payment",
      target: app.id,
      revision: app.revision,
      data: { status: "approved", bankChecked: true },
      requestId: crypto.randomUUID(),
    };
    s.execute(c, true);
    s.execute(c, true);
    expect(s.value.applications[0].revision).toBe(c.revision + 1);
    const before = JSON.stringify(s.state(true));
    expect(() =>
      command(
        s,
        "admin.application.attendance",
        { status: "paid_waitlist" },
        false,
      ),
    ).toThrow();
    expect(JSON.stringify(s.state(true))).toBe(before);
    const resumed = new EventLaboratoryStore(undefined, storage);
    expect(resumed.state().applications[0]).toMatchObject({
      payment: "approved",
      id: app.id,
    });
    expect(
      resumed.value.audit.filter((x) =>
        x.endsWith("admin.application.payment"),
      ),
    ).toHaveLength(1);
  });
  it("persists inquiry/replies and clearing the sandbox never calls a live network client", () => {
    const s = new EventLaboratoryStore();
    command(s, "thread.send", { text: "가상 문의", collection: true });
    command(s, "thread.send", { text: "가상 답장" }, true);
    expect(s.state().threads[0].messages).toHaveLength(2);
    s.reset();
    expect(s.state().threads[0].messages).toEqual([]);
    expect(s.value.applications).toEqual([]);
  });
  it("does not persist password-bearing request signatures and remains usable with blocked browser storage", () => {
    const map = new Map<string, string>();
    const s = new EventLaboratoryStore(undefined, {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => {
        map.set(k, v);
      },
      removeItem: (k) => {
        map.delete(k);
      },
    });
    s.jump("공지 동의 완료");
    command(s, "application.consent", {
      consent: { ...consent, reuse: true },
      password: "never-persist-this-password",
    });
    expect([...map.values()].join("")).not.toContain(
      "never-persist-this-password",
    );
    expect(
      () =>
        new EventLaboratoryStore(undefined, {
          getItem: () => {
            throw new Error("blocked");
          },
          setItem: () => {
            throw new Error("blocked");
          },
          removeItem: () => {},
        }),
    ).not.toThrow();
  });
});

describe("laboratory event selection and restored controls", () => {
  it.each(["tour-2026-11-06", "tour-2026-11-07"])("keeps canned tour approvals as payment records instead of Halloween waivers: %s", (key) => {
    const preset = campaignPresets().find(p => p.key === key)!;
    const source = { ...HubEventInput.parse(preset.event), id: key, revision: 1, recruitment: true, nextRank: 0, history: [] };
    const store = new EventLaboratoryStore(source);
    for (const stage of ["입금 승인", "무료 참가 승인", "현장 입장"] as const) {
      store.jump(stage, 1);
      expect(store.value.applications[0]).toMatchObject({ payment: "approved" });
      expect(store.value.applications[0].waivedAt).toBeUndefined();
      expect(store.value.applications[0].approvedAt).toBeTruthy();
    }
  });
  it("stores only synthetic source fields, sanitizes private links and resets partial heart/chat progress", () => {
    const source = {
      ...new EventLaboratoryStore().value.event,
      id: "real-event-id",
      account: "private-bank", address: "private-address", mapUrl: "https://private-map.test",
      media: ["https://private-photo.test"],
      campaign: { kind: "halloween-friday" as const, round: 1 as const, secondRoundLink: "https://old-chat.test" },
    };
    const store = new EventLaboratoryStore(source, undefined, null);
    expect(store.value.applications).toEqual([]);
    store.interact("a");
    expect(() => store.interact("a")).toThrow("이미");
    expect(() => store.interact("a", "pending")).toThrow("상호");
    store.interact("b");
    store.interact("a", "가상 메시지");
    const restored = new EventLaboratoryStore(source, undefined, store.snapshot());
    expect(restored.value.interaction?.messages[0].text).toBe("가상 메시지");
    const serialized = JSON.stringify(restored.snapshot());
    for (const privateValue of ["private-bank", "private-address", "private-map", "private-photo", "old-chat", "real-event-id"])
      expect(serialized).not.toContain(privateValue);
    restored.reset(source);
    expect(restored.value.interaction).toEqual({ hearts: [], messages: [] });
    expect(restored.value.applications).toEqual([]);
    expect(restored.value.audit).toEqual([]);
  });
  it("runs both Halloween days and tour Friday/Saturday draws with separate pools and shared eligibility", () => {
    for (const key of ["halloween-2026-10-30", "halloween-2026-10-31", "tour-2026-11-06", "tour-2026-11-07"]) {
      const preset = campaignPresets().find(p => p.key === key)!;
      const source = { ...HubEventInput.parse(preset.event), id: key, revision: 1, recruitment: true, nextRank: 0, history: [] };
      const store = new EventLaboratoryStore(source);
      store.jump("현장 입장", 3);
      const poolBefore = campaignInitialStocks(source).reduce((n, prize) => n + prize.remaining, 0);
      const count = source.campaign?.kind === "tour" ? 1 : 3;
      for (let i = 0; i < count; i++) command(store, "application.draw");
      const app = store.value.applications[0];
      expect(app.cards).toHaveLength(source.campaign?.kind === "tour" ? 2 : 3);
      expect(() => command(store, "application.draw")).toThrow("3장");
      const wins = app.cards.filter(card => card.prize !== "다음 기회에");
      expect(store.value.prizePool!.reduce((n, prize) => n + prize.remaining, 0)).toBe(poolBefore - wins.length);
      if (source.campaign?.kind === "tour") {
        expect(wins).toHaveLength(1);
        expect(wins[0].couponAmount).toBeGreaterThanOrEqual(2000);
        store.jump("현장 입장", 11);
        expect(() => command(store, "application.draw")).toThrow("선착순10명");
      }
      store.jump("현장 입장", 3);
      expect(store.value.applications[0].cards).toEqual([]);
      expect(store.value.prizePool).toEqual(campaignInitialStocks(source));
    }
  });
  it("preserves edited synthetic dates, title, address, card flags and fee when switching ranks and stages", () => {
    const store = new EventLaboratoryStore();
    store.configureEvent({
      ...store.value.event,
      title: "시험 금요일",
      date: "2026-10-30",
      address: "가상 장소 수정",
      cardsEnabled: false,
      fee: 60000,
    });
    store.jump("프로필 완료", 4);
    expect(store.value.event).toMatchObject({
      title: "시험 금요일",
      date: "2026-10-30",
      address: "가상 장소 수정",
      cardsEnabled: false,
      fee: 60000,
    });
    expect(store.state().applications[0].billing?.quote.fee).toBe(60000);
    expect(laboratoryStage(store.value)).toBe("프로필 완료");
    store.jump("신청 확정", 3);
    expect(store.value.applications[0].payment).toBe("none");
    expect(laboratoryStage(store.value)).toBe("신청 확정");
  });
  it("separates sandbox state per selected real event without copying its private data", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    };
    const fixture = new EventLaboratoryStore().value.event;
    const first = {
      ...fixture,
      id: "source-a",
      address: "never-copy-real-address",
      account: "never-copy-real-account",
    };
    const second = { ...fixture, id: "source-b" };
    const a = new EventLaboratoryStore(first, storage);
    a.jump("입금 승인", 3);
    const b = new EventLaboratoryStore(second, storage);
    b.jump("프로필 완료", 4);
    const restored = new EventLaboratoryStore(first, storage);
    expect(laboratoryStage(restored.value)).toBe("입금 승인");
    expect(restored.value.rank).toBe(3);
    expect(new EventLaboratoryStore(second, storage).value.rank).toBe(4);
    expect(JSON.stringify([...values.values()])).not.toContain(
      "never-copy-real",
    );
  });
});
