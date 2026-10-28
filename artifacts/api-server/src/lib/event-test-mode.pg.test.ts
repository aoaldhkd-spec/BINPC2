import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { EVENT_TEST_MODE_BANNER, type EventLaboratoryState } from "@workspace/api-zod";
import { EventHubService } from "./event-hub-service.js";
import { HubStore } from "./event-hub-store.js";
import { isolatedFixtureDatabase } from "./event-hub-isolation.js";
import { EventTestModeService, TEST_MODE_KIND, TEST_WORKSPACE_KIND } from "./event-test-mode.js";

const url = process.env.HUB_TEST_DATABASE_URL;
describe.skipIf(!url)("persistent administrator laboratory — isolated PostgreSQL", () => {
  // Each suite has its own tables even when another fixture suite runs concurrently.
  const schema = `test_mode_${randomUUID().replaceAll("-", "")}`;
  let pool: pg.Pool;
  let store: HubStore;
  let laboratory: EventTestModeService;
  let hub: EventHubService;
  const now = () => new Date("2026-10-30T10:00:00Z");
  const command = (state: EventLaboratoryState, fields: Record<string, unknown>) => ({
    ...fields, generation: state.mode.generation, revision: state.mode.revision,
  });
  const save = (state: EventLaboratoryState, workspaceId = "halloween-friday") => laboratory.mutate(true, command(state, {
    operation: "save", workspaceId, snapshot: {
      version: 1, event: { id: "lab-event-only" },
      applications: [{ id: "lab-application-only", payment: "reported", attendance: "waiting", cards: ["test-prize-only"] }],
      heartChat: { hearts: [{ id: "test-heart" }], messages: [{ text: "synthetic-chat-only" }] },
    },
  }));
  const reset = (state: EventLaboratoryState) => laboratory.mutate(true, command(state, { operation: "reset" }));
  const setMode = (state: EventLaboratoryState, enabled: boolean, confirmed = true) => laboratory.mutate(true, command(state, {
    operation: "mode", enabled, ...(confirmed ? { resetGeneration: state.mode.generation } : {}),
  }));
  const mutate = (action: string, owner = "", target = "", data: Record<string, unknown> = {}, admin = false, revision?: number) =>
    hub.mutate(owner, admin, { requestId: randomUUID(), action, target, data, revision });
  const operationalRows = async () => ({
    ledger: (await pool.query("SELECT * FROM event_hub_records WHERE kind NOT IN ($1,$2) ORDER BY kind,id", [TEST_MODE_KIND, TEST_WORKSPACE_KIND])).rows,
    tables: (await pool.query("SELECT * FROM app_kv_rows ORDER BY table_name,row_id")).rows,
  });
  beforeAll(async () => {
    isolatedFixtureDatabase(url!, ["binpc2_hub_test", "binpc2_hub_test_resume"]);
    const bootstrap = new pg.Pool({ connectionString: url, max: 1 });
    try { await bootstrap.query(`CREATE SCHEMA "${schema}"`); } finally { await bootstrap.end(); }
    pool = new pg.Pool({ connectionString: url, max: 8, options: `-c search_path=${schema}` });
    await pool.query(readFileSync(new URL("../../migrations/20261027_event_hub.sql", import.meta.url), "utf8"));
    await pool.query("CREATE TABLE app_kv_rows(table_name text NOT NULL,row_id text NOT NULL,data jsonb NOT NULL,updated_at timestamptz DEFAULT now(),PRIMARY KEY(table_name,row_id))");
  });
  beforeEach(async () => {
    vi.unstubAllEnvs();
    await pool.query("TRUNCATE event_hub_records,app_kv_rows");
    await pool.query("INSERT INTO app_kv_rows(table_name,row_id,data) VALUES('app_settings','settings',$1)", [JSON.stringify({ module_flags: { event_hub: true } })]);
    store = new HubStore(pool, "test-mode-isolated-encryption-key-only");
    laboratory = new EventTestModeService(store, now);
    hub = new EventHubService(store, "test-mode-isolated-session-key-only", now);
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    if (pool) {
      await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
      await pool.end();
    }
  });

  it("defaults ON without seeding, exposes only the public flag/banner and requires administrator authentication", async () => {
    expect(await laboratory.publicState()).toEqual({ enabled: true, banner: EVENT_TEST_MODE_BANNER });
    expect((await hub.state()).testMode).toEqual({ enabled: true, banner: EVENT_TEST_MODE_BANNER });
    expect((await pool.query("SELECT count(*) FROM event_hub_records")).rows[0].count).toBe("0");
    await expect(laboratory.state(false)).rejects.toMatchObject({ code: "ADMIN", status: 403 });
    await expect(laboratory.mutate(false, { operation: "reset", generation: 0, revision: 0 })).rejects.toMatchObject({ code: "ADMIN" });
  });

  it("blocks rank allocation, confirmation, payment reports, entry and draw at the authoritative write boundary", async () => {
    const before = await operationalRows();
    for (const action of ["application.basic", "application.consent", "application.confirm", "application.report", "application.enter", "application.draw"])
      await expect(mutate(action)).rejects.toMatchObject({ code: "TEST_MODE", status: 423 });
    // An administrator cannot turn participant commands into a real-data test bypass.
    await expect(mutate("application.basic", "", "", {}, true)).rejects.toMatchObject({ code: "TEST_MODE" });
    expect(await operationalRows()).toEqual(before);
  });

  it("allows a new visitor's consented inquiry during ON and preserves the real support records through laboratory reset", async () => {
    const recoveryCode = randomBytes(32).toString("base64url");
    const owner = await hub.session(recoveryCode, true);
    expect(await hub.session(recoveryCode, false)).toBe(owner);
    await expect(mutate("thread.send", owner, "", { text: "신청 전 문의" })).rejects.toMatchObject({ code: "CONSENT" });
    await mutate("thread.send", owner, "", { text: "신청 전 문의", collection: true });
    await mutate("thread.send", "", owner, { text: "관리자 안내" }, true);
    expect((await hub.state(owner)).threads[0].messages).toHaveLength(2);
    await expect(mutate("application.basic", owner)).rejects.toMatchObject({ code: "TEST_MODE" });
    expect((await pool.query("SELECT count(*) FROM event_hub_records WHERE kind='application'")).rows[0].count).toBe("0");
    expect((await pool.query("SELECT count(*) FROM app_kv_rows WHERE table_name='profiles'")).rows[0].count).toBe("0");
    const before = await operationalRows();
    const saved = await save(await laboratory.state(true));
    await reset(saved);
    expect(await operationalRows()).toEqual(before);
  });

  it("fails closed on malformed encrypted mode flags or an inconsistent OFF acknowledgement", async () => {
    const initial = (await laboratory.state(true)).mode;
    for (const malformed of [
      { ...initial, enabled: null },
      { ...initial, enabled: undefined },
      { ...initial, enabled: false },
    ]) {
      await store.transaction(tx => tx.put(TEST_MODE_KIND, "global", malformed));
      await expect(laboratory.publicState()).rejects.toMatchObject({ code: "TEST_MODE_STATE", status: 503 });
      await expect(mutate("application.basic")).rejects.toMatchObject({ code: "TEST_MODE_STATE" });
    }
  });

  it("requires an acknowledged current reset, persists mode through service reconstruction, and invalidates old acknowledgements on re-entry", async () => {
    let state = await laboratory.state(true);
    await expect(setMode(state, false)).rejects.toMatchObject({ code: "TEST_RESET_REQUIRED" });
    state = await save(state);
    await expect(setMode(state, false)).rejects.toMatchObject({ code: "TEST_RESET_REQUIRED" });
    state = await reset(state);
    expect(state.mode).toMatchObject({ dirty: false, generation: 1, resetGeneration: 1 });
    expect(state.workspaces).toEqual({});
    await expect(setMode(state, false, false)).rejects.toMatchObject({ code: "TEST_RESET_REQUIRED" });
    state = await setMode(state, false);
    expect(await new EventTestModeService(new HubStore(pool, "test-mode-isolated-encryption-key-only")).state(true)).toEqual(state);
    await expect(save(state)).rejects.toMatchObject({ code: "TEST_MODE_OFF" });
    state = await setMode(state, true);
    expect(state.mode.resetGeneration).toBeNull();
    await expect(setMode(state, false)).rejects.toMatchObject({ code: "TEST_RESET_REQUIRED" });
  });

  it("encrypts complete synthetic snapshots and reset preserves every operational record byte-for-byte", async () => {
    for (const table of ["profiles", "hearts", "messages", "chat_rooms", "payment_reports", "waiting", "application_history", "draws", "prizes"])
      await pool.query("INSERT INTO app_kv_rows(table_name,row_id,data) VALUES($1,'real-existing',$2)", [table, JSON.stringify({ preserved: table })]);
    await store.transaction(async tx => {
      for (const kind of ["event", "application", "owner", "member", "thread", "stock", "request", "error", "settings"])
        await tx.put(kind, `real-${kind}`, { id: `real-${kind}`, retained: true });
    });
    const before = await operationalRows();
    let state = await laboratory.state(true);
    for (const id of ["halloween-friday", "halloween-saturday", "tour-friday-first", "tour-saturday-first"])
      state = await save(state, id);
    const raw = JSON.stringify((await pool.query("SELECT data FROM event_hub_records WHERE kind=$1", [TEST_WORKSPACE_KIND])).rows);
    expect(raw).toContain("crypto_box");
    expect(raw).not.toContain("synthetic-chat-only");
    expect(raw).not.toContain("test-prize-only");
    expect(Object.keys(state.workspaces)).toHaveLength(4);
    expect(await laboratory.publicState()).toEqual({ enabled: true, banner: EVENT_TEST_MODE_BANNER });
    state = await reset(state);
    expect(state.workspaces).toEqual({});
    expect((await pool.query("SELECT count(*) FROM event_hub_records WHERE kind=$1", [TEST_WORKSPACE_KIND])).rows[0].count).toBe("0");
    expect(await operationalRows()).toEqual(before);
  });

  it("serializes save/reset races and prevents old tabs from repopulating a cleared generation", async () => {
    const initial = await laboratory.state(true);
    const racing = await Promise.allSettled([reset(initial), save(initial)]);
    expect(racing.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(racing.find(result => result.status === "rejected")).toMatchObject({ reason: { code: "STALE_LABORATORY" } });
    let state = await laboratory.state(true);
    if (state.mode.resetGeneration === null) state = await reset(state);
    await expect(save(initial)).rejects.toMatchObject({ code: "STALE_LABORATORY" });
    expect((await laboratory.state(true)).workspaces).toEqual({});
    const clean = state;
    // OFF vs. a new simulation also has a single winning revision.
    const opening = await Promise.allSettled([setMode(clean, false), save(clean)]);
    expect(opening.filter(result => result.status === "fulfilled")).toHaveLength(1);
    state = await laboratory.state(true);
    expect(state.mode.enabled || (!state.mode.dirty && Object.keys(state.workspaces).length === 0)).toBe(true);
  });

  it("OFF preserves module and production policy gates and ON never runs scheduled opening", async () => {
    let state = await reset(await laboratory.state(true));
    state = await setMode(state, false);
    const owner = await hub.session(randomBytes(32).toString("base64url"), true);
    await pool.query("UPDATE app_kv_rows SET data=$1 WHERE table_name='app_settings'", [JSON.stringify({ module_flags: { event_hub: false } })]);
    await expect(mutate("application.basic", owner)).rejects.toMatchObject({ code: "MODULE_DISABLED" });
    await pool.query("UPDATE app_kv_rows SET data=$1 WHERE table_name='app_settings'", [JSON.stringify({ module_flags: { event_hub: true } })]);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_MODE", "");
    await expect(mutate("application.basic", owner)).rejects.toMatchObject({ code: "PRIVACY_POLICY_UNCONFIRMED" });
    vi.unstubAllEnvs();
    const eventId = String((await mutate("event.save", owner, "", {
      title: "격리 운영 보존 확인", date: "2026-10-30", start: "22:00", end: "01:00", area: "테스트", address: "테스트",
      account: "실제 송금 금지", deadline: "시험", notice: "테스트", fee: 10000,
      opensAt: "2026-10-30T09:00:00Z",
    }, true)).id);
    await store.transaction(async tx => {
      const e = await tx.get<Record<string, unknown>>("event", eventId);
      await tx.put("event", eventId, { ...e, scheduleEnabled: true, schedulePaused: false });
    });
    await setMode(state, true);
    const before = await operationalRows();
    await hub.autoTick();
    expect((await hub.state()).events.every(event => !event.recruitment)).toBe(true);
    await expect(mutate("event.recruitment", owner, eventId, { enabled: true }, true, 1)).rejects.toMatchObject({ code: "TEST_MODE" });
    expect(await operationalRows()).toEqual(before);
  });
});
