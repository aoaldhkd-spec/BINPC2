import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { DEFAULT_PRIVACY_POLICY, HubEventInput, type HubApplication, type HubEvent, type PrivacyPolicy } from "@workspace/api-zod";
import { companionDraftViews, type CompanionDraft } from "./companion-records.js";
import type { CompanionLinkRequest } from "./companion-submission.js";
import type { HubOwner } from "./event-hub-service.js";
import { HubStore, digest } from "./event-hub-store.js";
import { isolatedFixtureDatabase } from "./event-hub-isolation.js";
import { executePrivacyPlanForIsolatedTest, planPrivacy, privacySnapshot } from "./event-hub-privacy.js";

const url = process.env.HUB_TEST_DATABASE_URL;
const oldAt = "2026-10-31T14:00:00.000Z";
const now = new Date("2028-11-01T00:00:00.000Z");
const confirmed = { mode: "isolated-test" as const, policyConfirmed: true, identityConfirmed: true, backupConfirmed: true };

// Synthetic retention rules exercise the isolation-only executor. They do not
// assert a legal period, approve operating policy, or enable automatic erasure.
const policy: PrivacyPolicy = {
  ...DEFAULT_PRIVACY_POLICY,
  revision: 1,
  backupProcedure: "격리 합성자료만 검사; 운영 백업/파기 승인이 아님",
  rules: Object.fromEntries(Object.keys(DEFAULT_PRIVACY_POLICY.rules).map(purpose => [purpose, {
    days: purpose === "finance" ? 3650 : 1,
    basis: "합성 검사용 기준; 운영 보관기간이 아님",
  }])) as PrivacyPolicy["rules"],
};

describe.skipIf(!url)("companion privacy — actual isolated PostgreSQL", () => {
  // A new schema keeps this file away from the existing public-schema fixtures.
  // The URL guard runs before opening a connection and only permits the DB
  // explicitly accepted by executePrivacyPlanForIsolatedTest.
  const schema = `companion_privacy_${randomUUID().replaceAll("-", "")}`;
  let control: pg.Pool | undefined;
  let pool: pg.Pool | undefined;
  let store: HubStore;
  let madeSchema = false;
  let eventId: string;

  const owner = (): HubOwner => ({ id: randomUUID(), recoveryHash: digest(randomBytes(32).toString("base64url")), createdAt: oldAt });
  const draft = (id = randomUUID()): CompanionDraft => ({
    id, basic: { nickname: "가상친구", birthYear: 1995, location: "부산", residence: { city: "부산", kind: "district", value: "부산진구" } },
    providedAt: oldAt, permissionToProvideAt: oldAt, changedAt: oldAt,
  });
  const application = (who: HubOwner, rank = 1): HubApplication => ({
    id: randomUUID(), eventId, owner: who.id, revision: 1, stage: 4, rank,
    basic: { nickname: `가상${rank}`, birthYear: 1995, location: "부산", residence: { city: "부산", kind: "district", value: "부산진구" }, phone: "01000000000", depositor: "가상입금자" },
    payment: "approved", approvedAt: oldAt, confirmedAt: oldAt,
    attendance: "confirmed", checkin: false, profile: { lastStep: 1 },
    cards: [], prizesGiven: [], history: [], updatedAt: oldAt,
    rewardPhone: "01000000000",
    rewardPhoneRequest: {source:"result",resultId:randomUUID(),purpose:"합성 상품 수령 연락",requestedAt:oldAt},
    quote: { fee: 15000, original: 25000, benefit: "합성 회비", version: 1, kind: "fixed" },
  });
  const request = (who: HubOwner, overrides: Partial<CompanionLinkRequest> = {}): CompanionLinkRequest => ({
    id: randomUUID(), owner: who.id, eventId, at: oldAt, revision: 1, status: "pending", ...overrides,
  });
  const readOwner = (id: string) => store.transaction(async tx => (await tx.get<HubOwner>("owner", id))!);
  const readApp = (id: string) => store.transaction(tx => tx.get<HubApplication>("application", id));
  const readRequest = (id: string) => store.transaction(tx => tx.get<CompanionLinkRequest>("settings", `companion-link:${id}`));
  const plan = (id: string) => store.transaction(tx => planPrivacy(tx, id, now));
  const erase = async (id: string) => executePrivacyPlanForIsolatedTest(store, id, (await plan(id)).fingerprint, confirmed, now);

  beforeAll(async () => {
    if (!url) throw new Error("An explicit isolated fixture URL is required");
    isolatedFixtureDatabase(url, ["binpc2_hub_test_resume"]);
    control = new pg.Pool({ connectionString: url, max: 1 });
    await control.query(`CREATE SCHEMA "${schema}"`);
    madeSchema = true;
    pool = new pg.Pool({ connectionString: url, max: 2, options: `-c search_path=${schema}` });
    await pool.query(readFileSync(new URL("../../migrations/20261027_event_hub.sql", import.meta.url), "utf8"));
    await pool.query("CREATE TABLE app_kv_rows(table_name text NOT NULL,row_id text NOT NULL,data jsonb NOT NULL,updated_at timestamptz DEFAULT now(),PRIMARY KEY(table_name,row_id))");
    store = new HubStore(pool, "isolated-companion-privacy-test-secret");
  });
  beforeEach(async () => {
    await pool!.query("TRUNCATE event_hub_records, app_kv_rows");
    eventId = randomUUID();
    const event: HubEvent = {
      ...HubEventInput.parse({ title: "개인정보 격리 검사", type: "halloween", date: "2026-10-31", start: "22:00", end: "01:00", area: "가상", address: "가상 장소", fee: 25000, deposit: 25000, account: "실제 송금 불가", deadline: "행사 전", notice: "합성 공지" }),
      id: eventId, revision: 1, recruitment: false, nextRank: 0, history: [],
    };
    await store.transaction(async tx => {
      await tx.put("event", eventId, event);
      await tx.put("settings", "privacy-policy", policy);
    });
  });
  afterAll(async () => {
    await pool?.end();
    if (madeSchema) await control!.query(`DROP SCHEMA "${schema}" CASCADE`);
    await control?.end();
  });

  it("erases sponsor draft personal data but retains verified child provenance without touching the child's ledger", async () => {
    const sponsor = owner(), child = owner(), stranger = owner();
    const submitted = draft(), unsubmitted = draft(), invalid = draft();
    const childApp = { ...application(child), sponsorOwner: sponsor.id, companionDraftId: submitted.id,
      companionSubmission: { submittedAt: oldAt, permissionToProvideAt: oldAt, personalConsentPending: true } };
    const strangerApp = application(stranger, 2);
    Object.assign(submitted, { applicationId: childApp.id, submittedAt: oldAt, inviteHash: "expired-synthetic-invitation-hash" });
    // A forged/dangling reference must not acquire ownership of another person's record.
    invalid.applicationId = strangerApp.id;
    sponsor.companionDrafts = { [eventId]: { revision: 4, items: [submitted, unsubmitted, invalid] } };
    const pending = request(sponsor), otherPending = request(stranger), linked = request(sponsor, { eventId: randomUUID(), status: "linked", applicationId: childApp.id });
    sponsor.companionLinkRequests = { [eventId]: pending, [linked.eventId]: linked };
    await store.transaction(async tx => {
      for (const person of [sponsor, child, stranger]) await tx.put("owner", person.id, person);
      for (const app of [childApp, strangerApp]) await tx.put("application", app.id, app);
      for (const link of [pending, otherPending, linked]) await tx.put("settings", `companion-link:${link.id}`, link);
    });
    const snapshot = await store.transaction(tx => privacySnapshot(tx, sponsor.id));
    expect(snapshot.applications).toEqual([]);
    await erase(sponsor.id);
    const saved = await readOwner(sponsor.id);
    expect(saved.erasedAt).toBe(now.toISOString());
    expect(saved.recoveryHash).not.toBe(sponsor.recoveryHash);
    expect(saved.companionDrafts![eventId].revision).toBe(5);
    expect(saved.companionDrafts![eventId].items).toEqual([{
      id: submitted.id, basic: {}, applicationId: childApp.id, submittedAt: oldAt,
      providedAt: oldAt, permissionToProvideAt: oldAt, changedAt: now.toISOString(), removedAt: now.toISOString(),
    }]);
    expect(companionDraftViews(saved)[eventId].items).toEqual([]);
    expect(await readApp(childApp.id)).toEqual(childApp);
    expect(await readOwner(child.id)).toEqual(child);
    expect(await readApp(strangerApp.id)).toEqual(strangerApp);
    expect(await readRequest(pending.id)).toBeUndefined();
    expect(saved.companionLinkRequests![eventId]).toBeUndefined();
    expect(await readRequest(otherPending.id)).toEqual(otherPending);
    expect(await readRequest(linked.id)).toEqual(linked);
    expect(saved.companionLinkRequests![linked.eventId]).toEqual(linked);
    expect((await store.transaction(tx => privacySnapshot(tx, sponsor.id))).basicDrafts).toEqual([]);
  });

  it("minimizes a paid child's own data and only the exact sponsor copy while preserving finance and other friends", async () => {
    const sponsor = owner(), child = owner(), peer = owner();
    const first = draft(), second = draft();
    const childApp = { ...application(child), sponsorOwner: sponsor.id, companionDraftId: first.id };
    const peerApp = { ...application(peer, 2), sponsorOwner: sponsor.id, companionDraftId: second.id };
    Object.assign(first, { applicationId: childApp.id, submittedAt: oldAt });
    Object.assign(second, { applicationId: peerApp.id, submittedAt: oldAt });
    sponsor.companionDrafts = { [eventId]: { revision: 2, items: [first, second] } };
    const differentEvent = randomUUID();
    sponsor.companionDrafts[differentEvent] = { revision: 1, items: [draft()] };
    await store.transaction(async tx => {
      for (const person of [sponsor, child, peer]) await tx.put("owner", person.id, person);
      for (const app of [childApp, peerApp]) await tx.put("application", app.id, app);
    });
    expect((await plan(child.id)).items).toContainEqual(expect.objectContaining({ id: childApp.id, action: "minimize" }));
    await erase(child.id);
    const saved = (await readApp(childApp.id))!;
    expect(saved).toMatchObject({ id: childApp.id, owner: child.id, sponsorOwner: sponsor.id, companionDraftId: first.id, payment: "approved", approvedAt: oldAt, rank: 1, quote: childApp.quote, erasedAt: now.toISOString() });
    expect(saved.basic).toEqual({ nickname: "삭제된 신청자", birthYear: 1900, location: "", phone: "", depositor: "" });
    expect(saved.rewardPhone).toBeUndefined();
    expect(saved.rewardPhoneRequest).toBeUndefined();
    const savedSponsor = await readOwner(sponsor.id);
    expect(savedSponsor.erasedAt).toBeUndefined();
    expect(savedSponsor.recoveryHash).toBe(sponsor.recoveryHash);
    expect(savedSponsor.companionDrafts![eventId].items[0]).toMatchObject({ id: first.id, applicationId: childApp.id, basic: {}, removedAt: now.toISOString() });
    expect(savedSponsor.companionDrafts![eventId].items[1]).toEqual(second);
    expect(savedSponsor.companionDrafts![differentEvent]).toEqual(sponsor.companionDrafts[differentEvent]);
    expect(await readApp(peerApp.id)).toEqual(peerApp);
    expect(await readOwner(peer.id)).toEqual(peer);
  });

  it("removes only an expired unpaid application and its exact sponsor copy", async () => {
    const sponsor = owner(), child = owner(), peer = owner();
    const first = draft(), second = draft();
    const childApp: HubApplication = { ...application(child), payment: "none", approvedAt: undefined, sponsorOwner: sponsor.id, companionDraftId: first.id };
    const peerApp = { ...application(peer, 2), sponsorOwner: sponsor.id, companionDraftId: second.id };
    Object.assign(first, { applicationId: childApp.id, submittedAt: oldAt });
    Object.assign(second, { applicationId: peerApp.id, submittedAt: oldAt });
    sponsor.companionDrafts = { [eventId]: { revision: 2, items: [first, second] } };
    await store.transaction(async tx => {
      for (const person of [sponsor, child, peer]) await tx.put("owner", person.id, person);
      for (const app of [childApp, peerApp]) await tx.put("application", app.id, app);
    });
    await erase(child.id);
    expect(await readApp(childApp.id)).toBeUndefined();
    expect((await readOwner(sponsor.id)).companionDrafts![eventId]).toEqual({ revision: 3, items: [second] });
    expect(await readApp(peerApp.id)).toEqual(peerApp);
    expect(await readOwner(peer.id)).toEqual(peer);
  });

  it("includes pending link revisions in the plan fingerprint and rejects a stale plan without deleting requests", async () => {
    const person = owner(), link = request(person);
    person.companionLinkRequests = { [eventId]: link };
    await store.transaction(async tx => {
      await tx.put("owner", person.id, person);
      await tx.put("settings", `companion-link:${link.id}`, link);
    });
    const original = await plan(person.id);
    expect(original.items).toContainEqual(expect.objectContaining({ id: `companion-link:${eventId}`, action: "erase" }));
    const changed = { ...link, revision: 2, at: "2028-10-31T23:59:00.000Z" };
    await store.transaction(async tx => {
      const saved = (await tx.get<HubOwner>("owner", person.id))!;
      saved.companionLinkRequests![eventId] = changed;
      await tx.put("owner", person.id, saved);
      await tx.put("settings", `companion-link:${link.id}`, changed);
    });
    await expect(executePrivacyPlanForIsolatedTest(store, person.id, original.fingerprint, confirmed, now)).rejects.toMatchObject({ code: "REVISION" });
    expect(await readRequest(link.id)).toEqual(changed);
    expect((await readOwner(person.id)).erasedAt).toBeUndefined();
  });

  it("keeps a recent event request when another expired pending request is removed", async () => {
    const person = owner(), old = request(person), recent = request(person, { eventId: randomUUID(), at: "2028-10-31T23:59:00.000Z" });
    person.companionLinkRequests = { [old.eventId]: old, [recent.eventId]: recent };
    await store.transaction(async tx => {
      await tx.put("owner", person.id, person);
      for (const link of [old, recent]) await tx.put("settings", `companion-link:${link.id}`, link);
    });
    await erase(person.id);
    expect(await readRequest(old.id)).toBeUndefined();
    expect(await readRequest(recent.id)).toEqual(recent);
    const saved = await readOwner(person.id);
    expect(saved.erasedAt).toBeUndefined();
    expect(saved.recoveryHash).toBe(person.recoveryHash);
    expect(saved.companionLinkRequests).toEqual({ [recent.eventId]: recent });
  });

  it("preserves hold, explicit confirmation and incomplete operating-policy safeguards", async () => {
    const person = owner(), submitted = draft();
    person.companionDrafts = { [eventId]: { revision: 1, items: [submitted] } };
    person.privacyHold = { reason: "격리 검사용 보관 보류" };
    await store.transaction(tx => tx.put("owner", person.id, person));
    const heldPlan = await plan(person.id);
    await expect(executePrivacyPlanForIsolatedTest(store, person.id, heldPlan.fingerprint, { ...confirmed, backupConfirmed: false }, now)).rejects.toMatchObject({ code: "PRIVACY_EXECUTION_DISABLED" });
    await expect(executePrivacyPlanForIsolatedTest(store, person.id, heldPlan.fingerprint, confirmed, now)).rejects.toMatchObject({ code: "PRIVACY_HOLD" });
    expect(await readOwner(person.id)).toEqual(person);
    delete person.privacyHold;
    await store.transaction(async tx => {
      await tx.put("owner", person.id, person);
      await tx.put("settings", "privacy-policy", DEFAULT_PRIVACY_POLICY);
    });
    const incomplete = await plan(person.id);
    await expect(executePrivacyPlanForIsolatedTest(store, person.id, incomplete.fingerprint, confirmed, now)).rejects.toMatchObject({ code: "PRIVACY_POLICY_INCOMPLETE" });
    expect(await readOwner(person.id)).toEqual(person);
    expect(incomplete.blocked.length).toBeGreaterThan(0);
  });
});
