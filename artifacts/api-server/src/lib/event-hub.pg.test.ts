import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import { readFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { EventHubService } from "./event-hub-service.js";
import { atomicEventReset } from "./db-event-reset-transaction.js";
import { HubStore } from "./event-hub-store.js";
import { executePrivacyPlanForIsolatedTest } from "./event-hub-privacy.js";
import type { HubApplication, HubEvent } from "@workspace/api-zod";
import {
  HUB_CONSENT_VERSION,
  PROFILE_CONSENT_VERSION,
  profileMissing,
  nextSaturday,
  DEFAULT_HUB_SETTINGS,
} from "@workspace/api-zod";
const url = process.env.HUB_TEST_DATABASE_URL;
const suite = describe.skipIf(!url);
suite("event hub V6 — actual isolated PostgreSQL transactions", () => {
  const pool = new pg.Pool({ connectionString: url, max: 12 });
  const now = () => new Date("2026-10-31T14:00:00Z");
  let service: EventHubService;
  let owner: string;
  let eventId: string;
  const event = {
    title: "할로윈 이벤트 술번개",
    type: "halloween",
    date: "2026-10-31",
    start: "22:00",
    end: "01:00",
    area: "테스트 지역",
    address: "비공개 상세주소 7층",
    mapUrl: "https://example.com/map",
    fee: 50000,
    deposit: 10000,
    account: "격리 시험 계좌",
    deadline: "행사 전",
    included: "시험",
    notice: "격리 시험 공지",
    benefitsEnabled: true,
    benefits: [
      { from: 1, to: 3, type: "discount", value: 10000, label: "1~3등 할인" },
    ],
    cardsEnabled: true,
  };
  const basic = (nickname = "테스터") => ({
    nickname,
    birthYear: 1995,
    location: "부산",
    phone: "01012345678",
    depositor: "시험입금자",
    collection: true,
    version: HUB_CONSENT_VERSION,
  });
  const consent = {
    collection: true,
    sharing: true,
    notice: true,
    version: HUB_CONSENT_VERSION,
    reuse: false,
    marketing: false,
    push: false,
    profileNow: false,
  };
  const fullProfile = {
    mbti: "INTJ",
    interests: ["여행", "음악"],
    personalityScore: 50,
    privacyConsent: {
      collection: true,
      sharing: true,
      version: PROFILE_CONSENT_VERSION,
    },
    pushDecision: "skip",
    lastStep: 6,
  };
  const call = (
    action: string,
    target = "",
    data: Record<string, unknown> = {},
    revision?: number,
    admin = false,
    who = owner,
    requestId = randomUUID(),
  ) =>
    service.mutate(who, admin, {
      action,
      target,
      data,
      ...(revision === undefined ? {} : { revision }),
      requestId,
    });
  const adminState = async (who = owner) => {
    const s = await service.state(who, true);
    return {
      ...s,
      applications: s.applications as HubApplication[],
      events: s.events as HubEvent[],
    };
  };
  const app = async (id: string, who = owner) =>
    (await adminState(who)).applications.find((a) => a.id === id)!;
  const create = async (nick = "테스터", who = owner) =>
    String(
      (
        await call(
          "application.basic",
          "",
          { eventId, basic: basic(nick) },
          undefined,
          false,
          who,
        )
      ).id,
    );
  const complete = async (id: string) => {
    await call(
      "application.consent",
      id,
      { consent },
      (await app(id)).revision,
    );
    await call("application.confirm", id, {}, (await app(id)).revision);
  };
  const approved = async (id: string) => {
    await complete(id);
    await call(
      "admin.application.payment",
      id,
      { status: "approved", bankChecked: true },
      (await app(id)).revision,
      true,
    );
    await call(
      "admin.application.attendance",
      id,
      { status: "confirmed" },
      (await app(id)).revision,
      true,
    );
    await call(
      "admin.application.checkin",
      id,
      { checked: true },
      (await app(id)).revision,
      true,
    );
  };
  const activate = () =>
    pool.query(
      "UPDATE app_kv_rows SET data=data||$1::jsonb WHERE table_name='app_settings'",
      [
        JSON.stringify({
          session_active: true,
          event_cycle_started_at: "2026-10-31T13:00:00Z",
          event_cycle_archive_id:
            "binpc2:event-anon:v1:2026-10-31:00000000-0000-4000-8000-000000000001",
          event_cycle_reset_complete: false,
        }),
      ],
    );
  beforeAll(async () => {
    if (!url || !/^binpc2_hub_test/.test(new URL(url).pathname.slice(1)))
      throw new Error(
        "Refuse to modify any DB except explicitly named binpc2_hub_test*",
      );
    await pool.query(
      readFileSync(
        new URL("../../migrations/20261027_event_hub.sql", import.meta.url),
        "utf8",
      ),
    );
    await pool.query(
      "CREATE TABLE IF NOT EXISTS app_kv_rows(table_name text NOT NULL,row_id text NOT NULL,data jsonb NOT NULL,updated_at timestamptz DEFAULT now(),PRIMARY KEY(table_name,row_id))",
    );
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE event_hub_records,app_kv_rows");
    await pool.query(
      "INSERT INTO app_kv_rows(table_name,row_id,data) VALUES('app_settings','settings',$1)",
      [
        JSON.stringify({
          id: "settings",
          module_flags: { event_hub: true },
          session_active: false,
        }),
      ],
    );
    service = new EventHubService(
      new HubStore(pool),
      "isolated-test-session-secret",
      now,
    );
    owner = await service.session(randomBytes(32).toString("base64url"), true);
    eventId = String((await call("event.save", "", event, undefined, true)).id);
    await call("event.recruitment", eventId, { enabled: true }, 1, true);
  });
  afterAll(() => pool.end());
  it("does not save PII without first collection consent; hides money/address/rank before notice save", async () => {
    await expect(
      call("application.basic", "", {
        eventId,
        basic: { ...basic(), collection: false },
      }),
    ).rejects.toThrow();
    expect((await adminState()).applications).toHaveLength(0);
    const id = await create();
    const view = await service.state(owner);
    const a = view.applications[0];
    expect(a.id).toBe(id);
    expect(JSON.stringify(view)).not.toContain("비공개 상세주소");
    expect(JSON.stringify(view)).not.toContain("격리 시험 계좌");
    expect(a).not.toHaveProperty("rank");
    expect(a).not.toHaveProperty("quote");
    await call("application.consent", id, { consent }, 1);
    expect((await service.state(owner)).applications[0]).toMatchObject({
      stage: 3,
      billing: { quote: { fee: 40000 } },
    });
    expect((await app(id)).confirmedAt).toBeUndefined();
  });
  it("restores every saved stage, reported and approved payment after restart without repricing/resubmitting", async () => {
    const id = await create();
    service = new EventHubService(
      new HubStore(pool),
      "isolated-test-session-secret",
      now,
    );
    expect((await service.state(owner)).applications[0]).toMatchObject({
      id,
      stage: 2,
    });
    await complete(id);
    await call("application.report", id, {}, (await app(id)).revision);
    expect((await app(id)).payment).toBe("reported");
    await call(
      "admin.application.payment",
      id,
      { status: "approved", bankChecked: true },
      (await app(id)).revision,
      true,
    );
    const a = await app(id);
    const e = (await adminState()).events[0];
    await call("event.save", eventId, { ...e, fee: 90000 }, e.revision, true);
    service = new EventHubService(
      new HubStore(pool),
      "isolated-test-session-secret",
      now,
    );
    expect((await service.state(owner)).applications[0]).toMatchObject({
      id,
      payment: "approved",
      billing: { quote: { fee: 40000 } },
      venue: { address: event.address },
    });
    expect(await create()).toBe(id);
    expect((await adminState()).applications).toHaveLength(1);
    await expect(
      call(
        "application.profile",
        id,
        { profile: { mbti: "ENFP", lastStep: 3 } },
        a.revision - 1,
      ),
    ).rejects.toMatchObject({ code: "REVISION" });
    expect((await app(id)).payment).toBe("approved");
  });
  it("lost COMMIT acknowledgement reconciles through the same request id; changed replay is rejected", async () => {
    const id = randomUUID();
    const command = {
      action: "application.basic",
      data: { eventId, basic: basic() },
      requestId: id,
    };
    const original = pool.connect.bind(pool);
    let armed = true;
    const flaky = {
      connect: async () => {
        const c = await original();
        const q = c.query.bind(c);
        const wrapped = {
          query: async (sql: string, args?: unknown[]) => {
            const r = await q(sql, args);
            if (sql === "COMMIT" && armed) {
              armed = false;
              throw new Error("lost reply");
            }
            return r;
          },
          release: () => c.release(),
        };
        return wrapped;
      },
    };
    const flakyService = new EventHubService(
      new HubStore(flaky as unknown as pg.Pool),
      "isolated-test-session-secret",
      now,
    );
    await expect(flakyService.mutate(owner, false, command)).rejects.toThrow(
      "lost reply",
    );
    const result = await service.mutate(owner, false, command);
    expect((await adminState()).applications).toHaveLength(1);
    expect(result.id).toBe((await service.state(owner)).applications[0].id);
    await expect(
      service.mutate(owner, false, {
        ...command,
        data: { eventId, basic: basic("다른이름") },
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY" });
  });
  it("100 concurrent applications from two API instances receive unique durable ranks; 3/4 boundary and normalized nickname reservations", async () => {
    const other = new EventHubService(
      new HubStore(pool),
      "isolated-test-session-secret",
      now,
    );
    const owners = await Promise.all(
      Array.from({ length: 100 }, () =>
        service.session(randomBytes(32).toString("base64url"), true),
      ),
    );
    const results = await Promise.all(
      owners.map((o, i) =>
        (i % 2 ? other : service).mutate(o, false, {
          action: "application.basic",
          requestId: randomUUID(),
          data: { eventId, basic: basic(`시험${String(i).padStart(3, "0")}`) },
        }),
      ),
    );
    const apps = (await adminState()).applications;
    expect(new Set(apps.map((a) => a.id)).size).toBe(100);
    expect(new Set(apps.map((a) => a.rank)).size).toBe(100);
    expect(Math.max(...apps.map((a) => a.rank!))).toBe(100);
    for (const n of [3, 4]) {
      const a = apps.find((a) => a.rank === n)!;
      await call(
        "application.consent",
        a.id,
        { consent },
        a.revision,
        false,
        a.owner,
      );
      expect((await app(a.id)).quote?.fee).toBe(n === 3 ? 40000 : 50000);
    }
    await expect(
      call(
        "application.basic",
        "",
        { eventId, basic: basic("시험000") },
        undefined,
        false,
        owner,
      ),
    ).rejects.toMatchObject({ code: "NICKNAME" });
    expect(results).toHaveLength(100);
  }, 30000);
  it("requires actual bank confirmation for paid waitlist and preserves approval against client-supplied fields", async () => {
    const id = await create();
    await complete(id);
    await expect(
      call(
        "admin.application.attendance",
        id,
        { status: "paid_waitlist" },
        (await app(id)).revision,
        true,
      ),
    ).rejects.toMatchObject({ code: "PAYMENT" });
    await call(
      "application.report",
      id,
      { payment: "approved" },
      (await app(id)).revision,
    );
    expect((await app(id)).payment).toBe("reported");
    await expect(
      call(
        "admin.application.payment",
        id,
        { status: "approved" },
        (await app(id)).revision,
        true,
      ),
    ).rejects.toMatchObject({ code: "BANK" });
    await call(
      "admin.application.payment",
      id,
      { status: "approved", bankChecked: true },
      (await app(id)).revision,
      true,
    );
    await call(
      "admin.application.attendance",
      id,
      { status: "paid_waitlist" },
      (await app(id)).revision,
      true,
    );
    expect((await app(id)).attendance).toBe("paid_waitlist");
  });
  it("stores partial private profile drafts and resumes later; no public profile before atomic admission", async () => {
    const id = await create();
    await complete(id);
    await call(
      "application.profile",
      id,
      { profile: { mbti: "ENFP", lastStep: 3 } },
      (await app(id)).revision,
    );
    service = new EventHubService(
      new HubStore(pool),
      "isolated-test-session-secret",
      now,
    );
    expect((await app(id)).profile).toMatchObject({
      mbti: "ENFP",
      lastStep: 3,
    });
    expect(profileMissing((await app(id)).profile)).toContain("성향");
    expect(
      (
        await pool.query(
          "SELECT * FROM app_kv_rows WHERE table_name='profiles'",
        )
      ).rows,
    ).toHaveLength(0);
    const stranger = await service.session(
      randomBytes(32).toString("base64url"),
      true,
    );
    expect((await service.state(stranger)).applications).toHaveLength(0);
    await expect(
      call(
        "application.profile",
        id,
        { profile: fullProfile },
        (await app(id)).revision,
        false,
        stranger,
      ),
    ).rejects.toMatchObject({ code: "APPLICATION" });
  });
  it("blocks incomplete and unstarted entry; an acknowledged retry returns the same public profile", async () => {
    const id = await create();
    await approved(id);
    await activate();
    await expect(
      call(
        "application.enter",
        id,
        { deviceSecret: "device-secret" },
        (await app(id)).revision,
      ),
    ).rejects.toMatchObject({ code: "PROFILE_INCOMPLETE" });
    await call(
      "application.profile",
      id,
      { profile: fullProfile },
      (await app(id)).revision,
    );
    await pool.query(
      "UPDATE app_kv_rows SET data=data||'{\"session_active\":false}' WHERE table_name='app_settings'",
    );
    await expect(
      call(
        "application.enter",
        id,
        { deviceSecret: "device-secret" },
        (await app(id)).revision,
      ),
    ).rejects.toMatchObject({ code: "EVENT_NOT_STARTED" });
    await activate();
    const rev = (await app(id)).revision;
    const req = randomUUID();
    const first = await call(
      "application.enter",
      id,
      { deviceSecret: "device-secret" },
      rev,
      false,
      owner,
      req,
    );
    const replay = await call(
      "application.enter",
      id,
      { deviceSecret: "device-secret" },
      rev,
      false,
      owner,
      req,
    );
    expect((first.profile as { id: string }).id).toBe(
      (replay.profile as { id: string }).id,
    );
    expect(
      (
        await pool.query(
          "SELECT * FROM app_kv_rows WHERE table_name='profiles'",
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await pool.query(
          "SELECT * FROM app_kv_rows WHERE table_name='device_secrets'",
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("refuses a cached admission replay after reset; ledger and draft survive live-profile deletion", async () => {
    const id = await create();
    await approved(id);
    await activate();
    await call(
      "application.profile",
      id,
      { profile: fullProfile },
      (await app(id)).revision,
    );
    const req = randomUUID(),
      rev = (await app(id)).revision;
    await call(
      "application.enter",
      id,
      { deviceSecret: "device-secret" },
      rev,
      false,
      owner,
      req,
    );
    await pool.query(
      "DELETE FROM app_kv_rows WHERE table_name IN ('profiles','device_secrets')",
    );
    await expect(
      call(
        "application.enter",
        id,
        { deviceSecret: "device-secret" },
        rev,
        false,
        owner,
        req,
      ),
    ).rejects.toMatchObject({ code: "EVENT_ENDED" });
    expect((await app(id)).payment).toBe("approved");
    expect((await app(id)).profile.mbti).toBe("INTJ");
  });
  it("enforces three durable cards, nonnegative stock and one candy choice", async () => {
    const id = await create();
    await approved(id);
    await activate();
    await call(
      "application.profile",
      id,
      { profile: fullProfile },
      (await app(id)).revision,
    );
    await call(
      "application.enter",
      id,
      { deviceSecret: "device-secret" },
      (await app(id)).revision,
    );
    await call(
      "stock.save",
      "",
      { eventId, label: "소품 2번", add: 1 },
      undefined,
      true,
    );
    for (let i = 0; i < 3; i++)
      await call("application.draw", id, {}, (await app(id)).revision);
    await expect(
      call("application.draw", id, {}, (await app(id)).revision),
    ).rejects.toMatchObject({ code: "CARD_LIMIT" });
    expect((await app(id)).cards).toHaveLength(3);
    expect((await adminState()).stocks[0].remaining).toBeGreaterThanOrEqual(0);
    await call(
      "admin.application.candy",
      id,
      { kind: "haribo-a" },
      (await app(id)).revision,
      true,
    );
    await expect(
      call(
        "admin.application.candy",
        id,
        { kind: "haribo-b" },
        (await app(id)).revision,
        true,
      ),
    ).rejects.toMatchObject({ code: "CANDY_LIMIT" });
  });
  it("safe recovery requires a high-entropy secret; session and message persistence span API restarts", async () => {
    const code = randomBytes(32).toString("base64url");
    const id = await service.session(code, true);
    expect(await service.session(code, false)).toBe(id);
    await expect(
      service.session("application-number", false),
    ).rejects.toThrow();
    await call(
      "thread.send",
      "",
      { text: "입금 확인 문의", collection: true },
      undefined,
      false,
      id,
    );
    await call("thread.send", id, { text: "관리자 답장" }, undefined, true);
    const restarted = new EventHubService(
      new HubStore(pool),
      "isolated-test-session-secret",
      now,
    );
    expect(
      (await restarted.state(id)).threads[0].messages.map((m) => m.text),
    ).toEqual(["입금 확인 문의", "관리자 답장"]);
    expect((await restarted.state(owner)).threads).toHaveLength(0);
  });
  it("module OFF preserves records and default auto-generation is OFF", async () => {
    const id = await create();
    await complete(id);
    await service.autoTick();
    expect((await adminState()).events).toHaveLength(1);
    await pool.query(
      "UPDATE app_kv_rows SET data=data||'{\"module_flags\":{\"event_hub\":false}}' WHERE table_name='app_settings'",
    );
    expect((await service.state(owner)).applications[0].id).toBe(id);
    await expect(
      call("application.basic", "", { eventId, basic: basic("새신청") }),
    ).rejects.toMatchObject({ code: "MODULE_DISABLED" });
  });
  it("Saturday scheduler is idempotent after restart, skips Friday and excluded weeks, creates drafts only", async () => {
    await call(
      "settings.save",
      "",
      { ...DEFAULT_HUB_SETTINGS, autoSaturday: true },
      undefined,
      true,
    );
    await service.autoTick();
    await service.autoTick();
    const auto = (await adminState()).events.filter((e) =>
      e.id.startsWith("auto-"),
    );
    expect(auto).toHaveLength(1);
    expect(auto[0].date).toBe("2026-11-07");
    expect(auto[0].recruitment).toBe(false);
    expect(nextSaturday(new Date("2026-10-30T10:00:00Z"))).toBe("2026-10-31");
    expect(nextSaturday(new Date("2026-10-30T10:00:00Z"), ["2026-10-31"])).toBe(
      "2026-11-07",
    );
  });
  it("rolls back the rank reservation when application persistence fails; receipt never reports a failed transaction as saved", async () => {
    await pool.query(
      "CREATE OR REPLACE FUNCTION hub_test_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind='application' THEN RAISE EXCEPTION 'synthetic persistence fault'; END IF; RETURN NEW; END $$",
    );
    await pool.query(
      "CREATE TRIGGER hub_test_fault BEFORE INSERT ON event_hub_records FOR EACH ROW EXECUTE FUNCTION hub_test_fault()",
    );
    const req = randomUUID();
    try {
      await expect(
        call(
          "application.basic",
          "",
          { eventId, basic: basic() },
          undefined,
          false,
          owner,
          req,
        ),
      ).rejects.toThrow("synthetic persistence fault");
    } finally {
      await pool.query("DROP TRIGGER hub_test_fault ON event_hub_records");
      await pool.query("DROP FUNCTION hub_test_fault()");
    }
    expect((await adminState()).events[0].nextRank).toBe(0);
    expect(await service.receipt(owner, false, req)).toMatchObject({
      saved: false,
    });
    await call(
      "application.basic",
      "",
      { eventId, basic: basic() },
      undefined,
      false,
      owner,
      req,
    );
    expect((await adminState()).applications[0].rank).toBe(1);
  });
  it("freezes the fee at the first durable application while withholding it until consent", async () => {
    const id = await create();
    const e = (await adminState()).events[0];
    await call(
      "event.save",
      e.id,
      { ...e, fee: 90000, benefitsEnabled: false },
      e.revision,
      true,
    );
    expect((await service.state(owner)).applications[0]).not.toHaveProperty(
      "quote",
    );
    await call(
      "application.consent",
      id,
      { consent },
      (await app(id)).revision,
    );
    expect((await app(id)).quote?.fee).toBe(40000);
  });
  it("checks wrong-date and changed-notice admission, then two simultaneous identical requests create one public profile", async () => {
    const id = await create();
    await approved(id);
    await activate();
    await call(
      "application.profile",
      id,
      { profile: fullProfile },
      (await app(id)).revision,
    );
    let e = (await adminState()).events[0];
    await call(
      "event.save",
      e.id,
      { ...e, date: "2026-11-01" },
      e.revision,
      true,
    );
    await expect(
      call(
        "application.enter",
        id,
        { deviceSecret: "device-secret" },
        (await app(id)).revision,
      ),
    ).rejects.toMatchObject({ code: "EVENT_MISMATCH" });
    e = (await adminState()).events[0];
    await call(
      "event.save",
      e.id,
      { ...e, date: event.date, notice: "변경된 중요 공지" },
      e.revision,
      true,
    );
    await expect(
      call(
        "application.enter",
        id,
        { deviceSecret: "device-secret" },
        (await app(id)).revision,
      ),
    ).rejects.toMatchObject({ code: "CONSENT" });
    await call("application.notice", id, {}, (await app(id)).revision);
    const req = randomUUID(),
      rev = (await app(id)).revision;
    const results = await Promise.all([
      call(
        "application.enter",
        id,
        { deviceSecret: "device-secret" },
        rev,
        false,
        owner,
        req,
      ),
      call(
        "application.enter",
        id,
        { deviceSecret: "device-secret" },
        rev,
        false,
        owner,
        req,
      ),
    ]);
    expect((results[0].profile as { id: string }).id).toBe(
      (results[1].profile as { id: string }).id,
    );
    expect(
      (
        await pool.query(
          "SELECT row_id FROM app_kv_rows WHERE table_name='profiles'",
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("midnight administrator start still belongs to the preceding evening event", async () => {
    const id = await create();
    await approved(id);
    await activate();
    await call(
      "application.profile",
      id,
      { profile: fullProfile },
      (await app(id)).revision,
    );
    await pool.query(
      "UPDATE app_kv_rows SET data=data||$1::jsonb WHERE table_name='app_settings'",
      [JSON.stringify({ event_cycle_started_at: "2026-10-31T15:10:00Z" })],
    );
    service = new EventHubService(
      new HubStore(pool),
      "isolated-test-session-secret",
      () => new Date("2026-10-31T15:20:00Z"),
    );
    expect(
      (
        await call(
          "application.enter",
          id,
          { deviceSecret: "device-secret" },
          (await app(id)).revision,
        )
      ).profile,
    ).toBeTruthy();
  });
  it("actual existing 17:00 atomic reset deletes onsite rows but preserves applications, members and inquiries", async () => {
    const id = await create();
    await approved(id);
    await activate();
    await call(
      "application.profile",
      id,
      { profile: fullProfile },
      (await app(id)).revision,
    );
    await call(
      "application.enter",
      id,
      { deviceSecret: "device-secret" },
      (await app(id)).revision,
    );
    await call("thread.send", "", {
      text: "초기화 이후에도 문의 보존",
      collection: true,
    });
    await atomicEventReset(pool, {
      clearTables: ["profiles", "device_secrets", "likes", "chats", "messages"],
      now: new Date("2026-11-01T08:00:00Z"),
      planAdmin: () => ({
        id: "restored-admin",
        pin_code: "9999",
        nickname: "관리자",
      }),
      adminIsProfile: (p) => p.id === "restored-admin",
      buildNextSettings: (s) => ({
        ...s,
        session_active: false,
        event_cycle_reset_complete: true,
      }),
    });
    expect((await app(id)).payment).toBe("approved");
    expect((await service.state(owner)).threads[0].messages[0].text).toBe(
      "초기화 이후에도 문의 보존",
    );
    expect(
      (
        await pool.query(
          "SELECT row_id FROM app_kv_rows WHERE table_name='profiles'",
        )
      ).rows.map((r) => r.row_id),
    ).toEqual(["restored-admin"]);
  });
  it("opt-in member data uses password hashes and authenticated encryption; password login rotates recovery codes and reuses private profile on another event", async () => {
    const id = await create();
    await call(
      "application.consent",
      id,
      { consent: { ...consent, reuse: true }, password: "test-reuse-password" },
      (await app(id)).revision,
    );
    await call(
      "application.profile",
      id,
      { profile: fullProfile },
      (await app(id)).revision,
    );
    const raw = (
      await pool.query("SELECT data::text AS text FROM event_hub_records")
    ).rows
      .map((r) => r.text)
      .join("");
    expect(raw).not.toContain("test-reuse-password");
    expect(raw).not.toContain("01012345678");
    expect(raw).not.toContain("시험입금자");
    expect(raw).toContain("crypto_box");
    await expect(
      service.memberLogin("테스터", "wrong-password"),
    ).rejects.toMatchObject({ code: "LOGIN" });
    const login = await service.memberLogin("테스터", "test-reuse-password");
    expect(login.owner).toBe(owner);
    expect(await service.session(login.recoveryCode, false)).toBe(owner);
    const next = String(
      (
        await call(
          "event.save",
          "",
          { ...event, date: "2026-11-07" },
          undefined,
          true,
        )
      ).id,
    );
    await call("event.recruitment", next, { enabled: true }, 1, true);
    const nextId = String(
      (await call("application.basic", "", { eventId: next, basic: basic() }))
        .id,
    );
    expect(profileMissing((await app(nextId)).profile)).toEqual([]);
    expect((await app(nextId)).payment).toBe("none");
    expect((await app(nextId)).rank).toBe(1);
    await call("member.marketing", "", { enabled: true });
    expect((await service.state(owner)).member?.marketing).toBe(true);
    await call("member.withdraw");
    expect((await service.state(owner)).member).toBeNull();
    await expect(
      service.memberLogin("테스터", "test-reuse-password"),
    ).rejects.toMatchObject({ code: "LOGIN" });
    expect((await app(id)).consent?.reuse).toBe(false);
  });
  it("verified individual restrictions block new application/admission, preserve records and can be released with history", async () => {
    await call(
      "admin.owner.restrict",
      owner,
      { active: true, reason: "개별 확인 필요" },
      undefined,
      true,
    );
    await expect(create()).rejects.toMatchObject({ code: "RESTRICTED" });
    await call(
      "admin.owner.restrict",
      owner,
      { active: false, reason: "개별 확인 완료" },
      undefined,
      true,
    );
    const id = await create();
    expect(id).toBeTruthy();
    await call("privacy.request");
    const state = await adminState();
    expect(
      state.owners?.find((o) => o.id === owner)?.deleteRequestedAt,
    ).toBeTruthy();
    expect(JSON.stringify(state.owners)).not.toContain("recoveryHash");
  });
  it("one reserved prize can only be fulfilled once, with durable stock and duplicate-request protection", async () => {
    service = new EventHubService(
      new HubStore(pool),
      "isolated-test-session-secret",
      now,
      () => 0,
    );
    const id = await create();
    await approved(id);
    await activate();
    await call(
      "application.profile",
      id,
      { profile: fullProfile },
      (await app(id)).revision,
    );
    await call(
      "application.enter",
      id,
      { deviceSecret: "device-secret" },
      (await app(id)).revision,
    );
    await call(
      "stock.save",
      "",
      { eventId, label: "소품 10번", add: 1 },
      undefined,
      true,
    );
    const req = randomUUID(),
      rev = (await app(id)).revision;
    await call("application.draw", id, {}, rev, false, owner, req);
    await call("application.draw", id, {}, rev, false, owner, req);
    expect((await app(id)).cards).toHaveLength(1);
    expect((await adminState()).stocks[0].remaining).toBe(0);
    const cardId = (await app(id)).cards[0].id;
    await call(
      "admin.application.prize",
      id,
      { cardId },
      (await app(id)).revision,
      true,
    );
    await expect(
      call(
        "admin.application.prize",
        id,
        { cardId },
        (await app(id)).revision,
        true,
      ),
    ).rejects.toMatchObject({ code: "PRIZE" });
  });
  it("receipts are private to the applicant and error records contain only request/stage/error metadata", async () => {
    const req = randomUUID();
    await call(
      "application.basic",
      "",
      { eventId, basic: basic() },
      undefined,
      false,
      owner,
      req,
    );
    expect(await service.receipt(owner, false, req)).toMatchObject({
      saved: true,
    });
    expect(await service.receipt("stranger", false, req)).toMatchObject({
      saved: false,
    });
    await service.recordFailure(
      owner,
      req,
      "application.basic",
      "TEST_FAILURE",
    );
    await service.recordFailure(
      owner,
      req,
      "application.basic",
      "TEST_FAILURE",
    );
    expect((await adminState()).errors?.[0]).toMatchObject({
      requestId: req,
      count: 2,
      code: "TEST_FAILURE",
    });
    expect(JSON.stringify((await adminState()).errors)).not.toContain(
      "01012345678",
    );
  });
  it("editing an unconfirmed application keeps its ID, reserved fee and rank; stale edits cannot overwrite it", async () => {
    const id = await create();
    const old = await app(id);
    await call(
      "application.basic",
      "",
      {
        eventId,
        edit: true,
        basic: { ...basic(), depositor: "수정된 입금자" },
      },
      old.revision,
    );
    expect((await app(id)).basic.depositor).toBe("수정된 입금자");
    expect((await app(id)).rank).toBe(1);
    expect((await app(id)).quote?.fee).toBe(40000);
    await expect(
      call(
        "application.basic",
        "",
        { eventId, edit: true, basic: basic() },
        old.revision,
      ),
    ).rejects.toMatchObject({ code: "REVISION" });
    expect((await adminState()).applications).toHaveLength(1);
  });
  it("member password guessing lock persists across server restarts and expires without weakening the password check", async () => {
    const id = await create();
    await call(
      "application.consent",
      id,
      { consent: { ...consent, reuse: true }, password: "test-reuse-password" },
      (await app(id)).revision,
    );
    for (let i = 0; i < 8; i++)
      await expect(
        service.memberLogin("테스터", "wrong-password"),
      ).rejects.toMatchObject({ code: "LOGIN" });
    service = new EventHubService(
      new HubStore(pool),
      "isolated-test-session-secret",
      now,
    );
    await expect(
      service.memberLogin("테스터", "test-reuse-password"),
    ).rejects.toMatchObject({ code: "LOGIN" });
    service = new EventHubService(
      new HubStore(pool),
      "isolated-test-session-secret",
      () => new Date(now().getTime() + 16 * 60000),
    );
    expect(
      (await service.memberLogin("테스터", "test-reuse-password")).owner,
    ).toBe(owner);
  });
  it("a linked public profile cannot be downgraded through a private-draft write and cards stop after the real reset", async () => {
    const id = await create();
    await approved(id);
    await activate();
    await call(
      "application.profile",
      id,
      { profile: fullProfile },
      (await app(id)).revision,
    );
    await call(
      "application.enter",
      id,
      { deviceSecret: "device-secret" },
      (await app(id)).revision,
    );
    await expect(
      call(
        "application.profile",
        id,
        { profile: { interests: [], lastStep: 1 } },
        (await app(id)).revision,
      ),
    ).rejects.toMatchObject({ code: "PROFILE_LINKED" });
    await pool.query("DELETE FROM app_kv_rows WHERE table_name='profiles'");
    await expect(
      call("application.draw", id, {}, (await app(id)).revision),
    ).rejects.toMatchObject({ code: "EVENT_ENDED" });
  });
  it("an explicitly approved recruitment schedule is invisible before its server-side opening time", async () => {
    const e = (await adminState()).events[0];
    await call(
      "event.save",
      eventId,
      { ...e, opensAt: "2026-10-31T14:30:00Z" },
      e.revision,
      true,
    );
    await expect(create()).rejects.toMatchObject({ code: "CLOSED" });
    expect((await service.state()).events).toHaveLength(0);
    service = new EventHubService(
      new HubStore(pool),
      "isolated-test-session-secret",
      () => new Date("2026-10-31T14:31:00Z"),
    );
    expect((await service.state()).events).toHaveLength(1);
    expect(await create()).toBeTruthy();
  });
  it("saved templates reproduce explicitly chosen fees/notices in a Saturday draft without opening recruitment", async () => {
    const e = (await adminState()).events[0];
    const { date, ...template } = e;
    await call(
      "settings.save",
      "",
      {
        ...DEFAULT_HUB_SETTINGS,
        autoSaturday: true,
        templates: [{ name: "확인된 운영 템플릿", event: template }],
        autoTemplate: template,
      },
      undefined,
      true,
    );
    await service.autoTick();
    const draft = (await adminState()).events.find(
      (e) => e.id === "auto-2026-11-07",
    )!;
    expect(draft).toMatchObject({
      date: "2026-11-07",
      fee: 50000,
      account: event.account,
      notice: event.notice,
      recruitment: false,
    });
    expect(draft.opensAt).toBe("2026-10-31T13:00:00.000Z");
  });
  it("records a fixed retention review date and budget candidate; random cash activation is rejected", async () => {
    await call(
      "settings.save",
      "",
      {
        ...DEFAULT_HUB_SETTINGS,
        retentionDays: 30,
        budget: { totalCandidate: 100000, cashEnabled: false },
      },
      undefined,
      true,
    );
    const id = await create();
    expect((await app(id)).retainUntil).toBe(
      new Date(
        Date.parse("2026-11-01T01:00:00+09:00") + 30 * 86400000,
      ).toISOString(),
    );
    await expect(
      call(
        "settings.save",
        "",
        {
          ...DEFAULT_HUB_SETTINGS,
          budget: { totalCandidate: 100000, cashEnabled: true },
        },
        1,
        true,
      ),
    ).rejects.toThrow();
    expect((await adminState()).settings?.budget).toEqual({
      totalCandidate: 100000,
      cashEnabled: false,
    });
  });
  it("transfers optional signal preferences with the public profile in the same admission transaction", async () => {
    const id = await create();
    await approved(id);
    await activate();
    await call(
      "application.profile",
      id,
      { profile: { ...fullProfile, idealMsg: "차분함", featureMsg: "활발함" } },
      (await app(id)).revision,
    );
    const saved = await call(
      "application.enter",
      id,
      { deviceSecret: "device-secret" },
      (await app(id)).revision,
    );
    const rows = (
      await pool.query(
        "SELECT data FROM app_kv_rows WHERE table_name='user_signals'",
      )
    ).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].data).toMatchObject({
      user_id: (saved.profile as { id: string }).id,
      ideal_msg: "차분함",
      feature_msg: "활발함",
    });
  });
  it("keeps internal administrator notes out of the participant projection", async () => {
    const id = await create();
    await call("admin.application.note", id, {reason:"PRIVATE-ADMIN-NOTE"}, (await app(id)).revision, true);
    expect(JSON.stringify(await adminState())).toContain("PRIVATE-ADMIN-NOTE");
    expect(JSON.stringify(await service.state(owner))).not.toContain("PRIVATE-ADMIN-NOTE");
  });
  it("reviews privacy cases with separate identity evidence and participant-safe messages; draft plans never execute", async () => {
    await create();
    await call("privacy.request");
    await expect(call("admin.privacy.review", owner, {status:"reviewed",reason:"PRIVATE-REVIEW"}, 1, false)).rejects.toThrow();
    await expect(call("admin.privacy.review", owner, {status:"reviewed",reason:"PRIVATE-REVIEW"}, 1, true)).rejects.toThrow();
    await call("admin.privacy.review", owner, {status:"reviewed",reason:"PRIVATE-REVIEW",identityConfirmed:true,publicMessage:"검토 중입니다"}, 1, true);
    const state = await service.state(owner);
    expect(state.privacyCase).toMatchObject({status:"reviewed",publicMessage:"검토 중입니다"});
    expect(JSON.stringify(state)).not.toContain("PRIVATE-REVIEW");
    const result = await call("admin.privacy.plan", owner, {}, undefined, true);
    expect((result.plan as {blocked:string[]}).blocked).toContain("운영 보관·파기 정책이 검토 초안입니다. 운영 파기는 승인 전 실행하지 않습니다.");
    expect((await adminState()).applications).toHaveLength(1);
  });
  it("rotates recovery only after administrator identity checks and never stores the new code in receipts", async () => {
    await expect(call("admin.owner.recover",owner,{reason:"격리 본인 확인"},undefined,true)).rejects.toThrow();
    const result=await call("admin.owner.recover",owner,{reason:"격리 본인 확인",identityConfirmed:true},undefined,true);
    expect(typeof result.recoveryCode).toBe("string");
    expect(await service.session(String(result.recoveryCode),false)).toBe(owner);
    const records=await pool.query("SELECT data FROM event_hub_records");
    expect(JSON.stringify(records.rows)).not.toContain(String(result.recoveryCode));
  });
  it("separates advertising consent from membership and provides an idempotent purpose-limited unsubscribe", async () => {
    await create();
    await call("marketing.preference","",{enabled:true});
    expect((await service.state(owner)).marketingPreference).toMatchObject({enabled:true});
    const token=service.unsubscribeToken(owner);
    await expect(service.unsubscribe(token+"invalid")).rejects.toThrow();
    await service.unsubscribe(token);
    await service.unsubscribe(token);
    expect((await service.state(owner)).marketingPreference).toMatchObject({enabled:false});
    expect((await adminState()).applications).toHaveLength(1);
    const preview=await service.campaignPreview(eventId);
    expect(preview).toMatchObject({externalSendingEnabled:false});
  });
  it("removes reusable membership if reuse consent is explicitly withdrawn before confirmation", async () => {
    const id=await create();
    await call("application.consent",id,{consent:{...consent,reuse:true},password:"Synthetic-test-pass-123"},(await app(id)).revision);
    expect((await pool.query("SELECT id FROM event_hub_records WHERE kind='member'")).rowCount).toBe(1);
    await call("application.consent",id,{consent:{...consent,reuse:false}},(await app(id)).revision);
    expect((await pool.query("SELECT id FROM event_hub_records WHERE kind='member'")).rowCount).toBe(0);
  });

  it("refuses privacy execution without explicit isolated-test confirmations or with a stale fingerprint", async () => {
    await create();
    const store=new HubStore(pool);
    const denied={mode:"isolated-test" as const,policyConfirmed:false,identityConfirmed:false,backupConfirmed:false};
    await expect(executePrivacyPlanForIsolatedTest(store,owner,"stale",denied,now())).rejects.toThrow("운영 파기는 승인 전 비활성");
    await expect(executePrivacyPlanForIsolatedTest(store,owner,"stale",{...denied,policyConfirmed:true,identityConfirmed:true,backupConfirmed:true},now())).rejects.toThrow("원본 또는 정책이 변경");
    expect((await adminState()).applications).toHaveLength(1);
  });

});
