import { describe, it, expect } from "vitest";
import { EventLaboratoryStore } from "./event-laboratory-store";
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
