import { withVerifiedBossParticipation } from './boss-participation.js';
import { assertBossTestSocialScope, assertOnsiteSocialWrite } from './event-onsite-access.js';
import { drawCampaign } from "./event-campaign-service.js";
import { isolatedFixtureDatabase } from "./event-hub-isolation.js";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import { readFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { EventHubService } from "./event-hub-service.js";
import { EventTestModeService } from "./event-test-mode.js";
import { atomicEventReset } from "./db-event-reset-transaction.js";
import { HubStore, digest } from "./event-hub-store.js";
import {
  executePrivacyPlanForIsolatedTest,
  planPrivacy,
} from "./event-hub-privacy.js";
import type { HubApplication, HubEvent } from "@workspace/api-zod";
import {
  HUB_CONSENT_VERSION,
  HubEventInput,
  PROFILE_CONSENT_VERSION,
  profileMissing,
  nextSaturday,
  DEFAULT_HUB_SETTINGS,
  DEFAULT_PRIVACY_POLICY,
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
  const clockSlot = async (slot:number) => {
    const e=(await adminState()).events.find(e=>e.id===eventId)!;
    const at=Date.parse(e.date+"T00:00:00+09:00")+[23,24,24.5][slot]*3600000;
    service=new EventHubService(new HubStore(pool),"isolated-test-session-secret",()=>new Date(at));
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
    if (!url) throw new Error("An explicit isolated fixture URL is required");
    isolatedFixtureDatabase(url, ["binpc2_hub_test", "binpc2_hub_test_resume"]);
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
    // These legacy operational fixtures explicitly complete the isolated lab reset gate.
    const laboratory = new EventTestModeService(service.store, now);
    const reset = await laboratory.mutate(true, { operation: "reset", generation: 0, revision: 0 });
    const off = await laboratory.mutate(true, {
      operation: "mode", enabled: false, generation: reset.mode.generation,
      revision: reset.mode.revision, resetGeneration: reset.mode.generation,
    });
    await laboratory.mutate(true, { operation: "admission", open: true, confirmOpen: true,
      generation: off.mode.generation, revision: off.mode.revision });
    owner = await service.session(randomBytes(32).toString("base64url"), true);
    eventId = String((await call("event.save", "", event, undefined, true)).id);
    await call("event.recruitment", eventId, { enabled: true }, 1, true);
  });
  afterAll(() => pool.end());
  it("consented basic drafts resume after restart without a rank, reject stale writes, and cannot overwrite an approved application", async () => {
    const data = { eventId, basic: { nickname: "이어쓰기", collection: true, version: HUB_CONSENT_VERSION }, nextStep: 2 };
    await expect(call("application.basic-draft", "", { ...data, basic: { ...data.basic, collection: false } }, 0)).rejects.toThrow();
    const req = randomUUID();
    const saved = await call("application.basic-draft", "", data, 0, false, owner, req);
    expect(await call("application.basic-draft", "", data, 0, false, owner, req)).toEqual(saved);
    const other = await service.session(randomBytes(32).toString("base64url"), true);
    expect((await service.state(other)).basicDrafts).toEqual({});
    expect((await adminState()).events.find((e) => e.id === eventId)?.nextRank).toBe(0);
    expect((await adminState()).applications).toHaveLength(0);
    service = new EventHubService(new HubStore(pool), "isolated-test-session-secret", now);
    expect((await service.state(owner)).basicDrafts?.[eventId]).toMatchObject({ revision: 1, nextStep: 2, basic: data.basic });
    await expect(call("application.basic-draft", "", data, 0)).rejects.toMatchObject({ code: "REVISION" });
    const raw = await pool.query("SELECT data FROM event_hub_records WHERE kind='owner' AND id=$1", [owner]);
    expect(JSON.stringify(raw.rows)).not.toContain("이어쓰기");
    const id = await create("이어쓰기"); await approved(id);
    const before = await app(id);
    await expect(call("application.basic-draft", "", data, 1)).rejects.toMatchObject({ code: "STAGE" });
    expect(await app(id)).toEqual(before);
    const plan = await service.store.transaction((tx) => planPrivacy(tx, owner, now()));
    expect(plan.items).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "basic-draft", id: eventId, action: "keep" })]));
  });
  it("one bank approval permits actual entry without manual checkin, and revocation preserves history while denying reuse", async () => {
    const id = await create(); await complete(id);
    await call("admin.application.payment", id, { status: "approved", bankChecked: true }, (await app(id)).revision, true);
    expect(await app(id)).toMatchObject({ attendance: "confirmed", checkin: false });
    await call("application.profile", id, { profile: fullProfile }, (await app(id)).revision);
    await expect(call("application.draw", id, {}, (await app(id)).revision)).rejects.toMatchObject({ code: "CARDS" });
    await activate();
    const entered = await call("application.enter", id, { deviceSecret: "isolated-v12-device" }, (await app(id)).revision);
    expect((await app(id)).enteredAt).toBe(now().toISOString());
    expect((await app(id)).checkin).toBe(true);
    await call("admin.application.candy", id, { kind: "haribo-b" }, (await app(id)).revision, true);
    expect((await app(id)).candy).toBe("haribo");
    const before = await app(id);
    await expect(call("admin.application.revoke", id, { reason: "합성 취소" }, before.revision)).rejects.toMatchObject({ code: "ADMIN" });
    await call("admin.application.revoke", id, { reason: "합성 취소" }, before.revision, true);
    const revoked = await app(id);
    expect(revoked).toMatchObject({ payment: "approved", approvedAt: before.approvedAt, profileId: before.profileId, candy: "haribo", approvalRevokedAt: now().toISOString() });
    await expect(call("application.enter", id, { deviceSecret: "isolated-v12-device" }, revoked.revision)).rejects.toMatchObject({ code: "ATTENDANCE" });
    await expect(call("application.draw", id, {}, revoked.revision)).rejects.toMatchObject({ code: "CARDS" });
    expect((await pool.query("SELECT data FROM app_kv_rows WHERE table_name='profiles' AND row_id=$1", [(entered.profile as {id: string}).id])).rows).toHaveLength(1);
    await call("admin.application.payment", id, { status: "approved", bankChecked: true }, revoked.revision, true);
    expect((await app(id)).approvalRevokedAt).toBeUndefined();
    await expect(call("admin.application.candy", id, { kind: "haribo" }, (await app(id)).revision, true)).rejects.toMatchObject({ code: "CANDY_LIMIT" });
  });
  it("revoked social writes are checked under the approval lock without deleting history or revoking another application", async () => {
    const id = await create(); await approved(id);
    await call("application.profile", id, { profile: fullProfile }, (await app(id)).revision);
    await activate();
    const entered = await call("application.enter", id, { deviceSecret: "isolated-social-device" }, (await app(id)).revision);
    const profile = entered.profile as { id: string; pin_code: string };
    const write = () => service.store.transaction(async tx => {
      await assertOnsiteSocialWrite(tx, profile.id);
      await tx.db.query("INSERT INTO app_kv_rows(table_name,row_id,data) VALUES('messages','preserved-social',$1) ON CONFLICT(table_name,row_id) DO UPDATE SET data=EXCLUDED.data", [JSON.stringify({ id: "preserved-social", sender_id: profile.id, content: "합성 대화" })]);
    });
    await write();
    const before = (await pool.query("SELECT data FROM app_kv_rows WHERE table_name='profiles' AND row_id=$1", [profile.id])).rows[0].data;
    await call("admin.application.revoke", id, { reason: "합성 취소" }, (await app(id)).revision, true);
    await expect(write()).rejects.toMatchObject({ code: "EVENT_APPROVAL_REVOKED", status: 403 });
    expect((await pool.query("SELECT data FROM app_kv_rows WHERE table_name='profiles' AND row_id=$1", [profile.id])).rows[0].data).toEqual(before);
    expect((await pool.query("SELECT data FROM app_kv_rows WHERE row_id='preserved-social'")).rows).toHaveLength(1);
    await call("thread.send", "", { text: "취소 후 문의", collection: true });
    await service.store.transaction(async tx => {
      const original = await tx.get<HubApplication>("application", id);
      await tx.put("application", "unrelated-application", { ...original, id: "unrelated-application", eventId: "other-event", profileId: "another-profile", cycleId: "other-cycle" });
    });
    await call("admin.application.payment", id, { status: "approved", bankChecked: true }, (await app(id)).revision, true);
    await expect(write()).resolves.toBeUndefined();
    // Another process cancelling first must win against a waiting social writer.
    let release!: () => void; let locked!: () => void;
    const enteredLock = new Promise<void>(r => { locked = r; });
    const hold = new Promise<void>(r => { release = r; });
    const cancel = service.store.transaction(async tx => {
      const a = (await tx.get<HubApplication>("application", id))!;
      a.approvalRevokedAt = now().toISOString(); await tx.put("application", id, a);
      locked(); await hold;
    });
    await enteredLock;
    const waitingWrite = write(); release(); await cancel;
    await expect(waitingWrite).rejects.toMatchObject({ code: "EVENT_APPROVAL_REVOKED" });
  });
  it("allows a password once only from an owned legacy application and retains approvals without marketing opt-in", async () => {
    const id = await create("기존회원"); await approved(id); const before = await app(id);
    const data = { reuse: true, version: HUB_CONSENT_VERSION, password: "isolated-v12-password" };
    const other = await service.session(randomBytes(32).toString("base64url"), true);
    await expect(call("member.setup", id, data, undefined, false, other)).rejects.toMatchObject({ code: "APPLICATION" });
    await expect(call("member.setup", id, { ...data, reuse: false })).rejects.toThrow();
    await call("member.setup", "", data);
    await expect(call("member.setup", "", data)).rejects.toMatchObject({ code: "MEMBER_EXISTS" });
    expect((await service.memberLogin("기존회원", data.password)).owner).toBe(owner);
    expect((await service.state(owner)).member?.marketing).toBe(false);
    expect(await app(id)).toEqual(before);
    const raw = await pool.query("SELECT data FROM event_hub_records WHERE kind IN ('member','owner','request')");
    expect(JSON.stringify(raw.rows)).not.toContain(data.password);
  });
  it("retains inquiry purpose consent for later messages and never shares a thread with another owner", async () => {
    await expect(call("thread.send", "", { text: "첫 문의" })).rejects.toMatchObject({ code: "CONSENT" });
    await call("thread.send", "", { text: "첫 문의", collection: true });
    await call("thread.send", "", { text: "다음 문의" });
    const own = (await service.state(owner)).threads[0];
    expect(own.consentVersion).toBe(HUB_CONSENT_VERSION);
    expect(own.messages).toHaveLength(2);
    const other = await service.session(randomBytes(32).toString("base64url"), true);
    expect((await service.state(other)).threads).toEqual([]);
    await expect(call("thread.send", owner, { text: "타인의 동의로 전송 시도" }, undefined, false, other)).rejects.toMatchObject({ code: "CONSENT" });
  });
  it("prepares all four BLACK days once and upgrades a Daegu candidate in place without changing inventory or records", async () => {
    const candidate = randomUUID();
    await service.store.transaction((tx) => tx.put("event", candidate, { ...HubEventInput.parse({ ...event, date: "2026-12-03", start: "21:00", end: "23:30", type: "tour", title: "대구 후보", area: "대구", notice: "대구 미확정\n기존 안내 보존", campaign: { kind: "tour", round: 1, advance: 17000, secondRoundLink: "" } }), id: candidate, revision: 1, recruitment: false, nextRank: 0, history: [] }));
    await service.store.transaction((tx) => tx.put("stock", "v12-existing-candidate-stock", { id: "v12-existing-candidate-stock", eventId: candidate, label: "보존 재고", remaining: 7, history: [] }));
    const beforeStock = (await adminState()).stocks;
    for (const date of ["2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06"]) {
      const first = await call("campaign.prepare", `tour-${date}`, {}, undefined, true);
      const second = await call("campaign.prepare", `tour-${date}`, {}, undefined, true);
      expect(first.id).toBe(second.id);
      const e = (await adminState()).events.find((e) => e.id === first.id)!;
      expect(e).toMatchObject({ date, area: "대구", venueLogoId: "black", recruitment: false, nextRank: 0 });
    }
    const saved = (await adminState()).events.find((e) => e.id === candidate)!;
    expect(saved.versions?.[0].notice).toContain("대구 미확정");
    expect(saved.notice).toContain("기존 안내 보존");
    expect(saved.notice).not.toContain("대구 미확정");
    expect((await adminState()).stocks.filter((s) => s.eventId === candidate)).toEqual(beforeStock);
  });

  it("routes participant reads before decrypting unrelated owners while retaining payload ownership checks", async () => {
    const id = await create();
    const a = await app(id);
    await new HubStore(pool).transaction(async (tx) => {
      await tx.put("application", "zz-unrelated-owner", {
        ...a,
        id: "zz-unrelated-owner",
        rank: 2,
        owner: "another-private-owner",
      });
    });
    await pool.query(
      "UPDATE event_hub_records SET data=jsonb_set(data,'{crypto_box,tag}',$1::jsonb) WHERE kind='application' AND id='zz-unrelated-owner'",
      [JSON.stringify("broken")],
    );
    const mine = await service.state(owner);
    expect(mine.applications.map((v) => v.id)).toEqual([id]);
    await expect(service.state(owner, true)).rejects.toThrow();
  });
  it("indexed recovery keeps authentication tied to the encrypted owner and skips unrelated ciphertext", async () => {
    const code = randomBytes(32).toString("base64url");
    const id = await service.session(code, true);
    const otherCode = randomBytes(32).toString("base64url");
    const otherId = await service.session(otherCode, true);
    await pool.query("UPDATE event_hub_records SET data=jsonb_set(data,'{crypto_box,tag}',$1::jsonb) WHERE kind='owner' AND id=$2", [JSON.stringify("broken"), otherId]);
    expect(await service.session(code, false)).toBe(id);
    const stolenCode = randomBytes(32).toString("base64url");
    await pool.query("UPDATE event_hub_records SET data=jsonb_set(data,'{recoveryHash}',$1::jsonb) WHERE kind='owner' AND id=$2", [JSON.stringify(digest(stolenCode)), id]);
    await expect(service.session(stolenCode, false)).rejects.toMatchObject({code:"RECOVERY",status:401});
  });
  it("logo originals are immutable, admin-only, event-bound, versioned and hidden until approval",async()=>{
    const base={mime:"image/png",base64:"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD9sAAAAASUVORK5CYII=",label:"새 로고",role:"venue",provenance:"original"};
    const before=(await adminState()).events.find(e=>e.id===eventId)!;
    await expect(call("event.logo.upload",eventId,base,before.revision,false)).rejects.toMatchObject({code:"ADMIN"});
    const a1=await call("event.logo.upload",eventId,base,before.revision,true);
    let e=(await adminState()).events.find(e=>e.id===eventId)!;
    expect(e.venueLogoVersionId).toBeUndefined();
    const a2=await call("event.logo.upload",eventId,{...base,label:"두 번째 시안",provenance:"design"},e.revision,true);
    e=(await adminState()).events.find(e=>e.id===eventId)!;
    await call("event.logo.select",eventId,{versionId:a2.versionId},e.revision,true);
    const id=await create();
    const participant=async()=> (await service.state(owner)).applications.find(a=>a.id===id)!;
    expect((await participant()).venue).toBeUndefined();
    await expect(service.media(String(a1.versionId),owner)).rejects.toMatchObject({code:"MEDIA"});
    await approved(id);
    expect((await participant()).venue?.logo).toMatchObject({url:a2.mediaUrl,width:1,height:1});
    e=(await adminState()).events.find(e=>e.id===eventId)!;
    await call("event.logo.select",eventId,{versionId:a1.versionId,restore:true},e.revision,true);
    const restored=(await adminState()).events.find(e=>e.id===eventId)!;
    expect(restored.logoVersions).toHaveLength(2);expect(restored.history.at(-1)?.action).toBe("event.logo.restore");
    expect((await participant()).venue?.logo?.url).toBe(a1.mediaUrl);
    expect((await service.media(String(a2.versionId),owner)).base64).toBe(base.base64);
    await expect(call("event.logo.select",eventId,{versionId:a2.versionId},e.revision,true)).rejects.toMatchObject({code:"REVISION"});
    const thanks=await call("event.logo.upload",eventId,{...base,label:"감사 전용",role:"thanks"},restored.revision,true);
    e=(await adminState()).events.find(e=>e.id===eventId)!;
    await expect(call("event.logo.select",eventId,{versionId:thanks.versionId},e.revision,true)).rejects.toMatchObject({code:"LOGO"});
    await call("event.logo.select",eventId,{versionId:thanks.versionId,area:"thanks"},e.revision,true);
    expect((await participant()).venue?.thanksLogo?.label).toBe("감사 전용");
    const other=await call("event.save","",{...event,title:"다른 행사"},undefined,true);
    await expect(call("event.save",String(other.id),{...event,venueLogoVersionId:a1.versionId},1,true)).rejects.toMatchObject({code:"LOGO"});
  });
  it("only an explicitly selected promotional logo becomes public; maps, other versions, other events and original history stay protected",async()=>{
    const base={mime:"image/png",base64:"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD9sAAAAASUVORK5CYII=",label:"공개 가능 합성 로고",role:"venue",provenance:"original"};
    const current=async()=> (await adminState()).events.find(e=>e.id===eventId)!;
    const logo=await call('event.logo.upload',eventId,base,(await current()).revision,true);
    const other=await call('event.logo.upload',eventId,{...base,label:'비공개 시안'},(await current()).revision,true);
    const map=await call('event.media.upload',eventId,{...base,purpose:'map',alt:'승인자 약도'},(await current()).revision,true);
    await expect(service.media(String(logo.versionId),'')).rejects.toMatchObject({code:'MEDIA'});
    const choice={versionId:logo.versionId,area:'promotion'};
    await expect(call('event.logo.select',eventId,{...choice,publicConfirmed:true},(await current()).revision,false)).rejects.toMatchObject({code:'ADMIN'});
    await expect(call('event.logo.select',eventId,choice,(await current()).revision,true)).rejects.toMatchObject({code:'LOGO_PUBLIC_CONFIRM'});
    await call('event.logo.select',eventId,{...choice,publicConfirmed:true},(await current()).revision,true);
    const e=(await service.state()).events.find(e=>e.id===eventId)!;
    expect(e.promotionLogo).toMatchObject({url:logo.mediaUrl,label:base.label,width:1,height:1});
    expect(e.promotionLogo).not.toHaveProperty('versionId');
    expect(e).not.toHaveProperty('logoVersions');
    expect((await service.media(String(logo.versionId),'')).base64).toBe(base.base64);
    await expect(service.media(String(other.versionId),'')).rejects.toMatchObject({code:'MEDIA'});
    await expect(service.media(String(map.mediaUrl).match(/([a-f0-9-]{36})\./)![1],'')).rejects.toMatchObject({code:'MEDIA'});
    const otherEvent=await call('event.save','',{...event,title:'다른 행사'},undefined,true);
    await expect(call('event.logo.select',String(otherEvent.id),{...choice,publicConfirmed:true},1,true)).rejects.toMatchObject({code:'LOGO'});
    // General saves cannot silently clear or forge public permission.
    await call('event.save',eventId,{...event,promotionLogo:{versionId:other.versionId}},(await current()).revision,true);
    expect((await current()).promotionLogo?.versionId).toBe(logo.versionId);
    await call('event.logo.select',eventId,{versionId:null,area:'promotion'},(await current()).revision,true);
    await expect(service.media(String(logo.versionId),'')).rejects.toMatchObject({code:'MEDIA'});
    expect((await current()).logoVersions).toHaveLength(2);
    expect((await service.media(String(logo.versionId),'',true)).base64).toBe(base.base64);
  });
  it("policy approval records complete terms but never opens production without the exact separate release",async()=>{
    await expect(call("admin.privacy.policy.approve","",{confirmed:true},0,true)).rejects.toMatchObject({code:"PRIVACY_POLICY"});
    const p={...DEFAULT_PRIVACY_POLICY,policyVersion:"isolated-v1",controllerName:"합성 주체",contact:"example.invalid",notice:"합성 확정 원문",backupProcedure:"합성 백업 만료·보류 절차",rules:Object.fromEntries(Object.keys(DEFAULT_PRIVACY_POLICY.rules).map(k=>[k,{days:30,basis:"격리 검토 근거"}]))};
    await call("admin.privacy.policy","",p,0,true);
    await call("admin.privacy.policy.approve","",{confirmed:true},1,true);
    const policy=(await adminState()).privacyPolicy!;expect(policy.status).toBe("approved");expect(policy.publicationFingerprint).toHaveLength(64);
    const saved=process.env.NODE_ENV;process.env.NODE_ENV="production";
    try{
      await expect(call("event.recruitment",eventId,{enabled:true},2,true)).rejects.toMatchObject({code:"PRIVACY_POLICY_UNCONFIRMED"});
      process.env.EVENT_HUB_PRODUCTION_RELEASE="approved-v6";process.env.EVENT_HUB_RELEASE_POLICY_SHA256=policy.publicationFingerprint;
      await call("event.recruitment",eventId,{enabled:true},2,true);
      const code=randomBytes(32).toString("base64url"),who=await service.session(code,true);
      await expect(call("application.basic","",{eventId,basic:basic("새개인")},undefined,false,who)).rejects.toMatchObject({code:"PRIVACY_NOTICE_CHANGED"});
      const r=await call("application.basic","",{eventId,basic:basic("새개인"),privacyPolicyFingerprint:policy.publicationFingerprint},undefined,false,who);
      expect((await app(String(r.id),who)).privacyPolicyConsent?.fingerprint).toBe(policy.publicationFingerprint);
      await call("admin.privacy.policy","",{...p,notice:"수정 원문"},2,true);
      expect((await adminState()).privacyPolicy?.status).toBe("draft");
      await expect(call("event.recruitment",eventId,{enabled:true},3,true)).rejects.toMatchObject({code:"PRIVACY_POLICY_UNCONFIRMED"});
    }finally{process.env.NODE_ENV=saved;delete process.env.EVENT_HUB_PRODUCTION_RELEASE;delete process.env.EVENT_HUB_RELEASE_POLICY_SHA256;}
  });
  it("stock lookup authenticates the event boundary and preserves legacy ciphertext during metadata preparation", async () => {
    const store = new HubStore(pool);
    await store.transaction(async tx => {
      await tx.put("stock", "own-stock", { id:"own-stock",eventId,remaining:2,history:[] });
      await tx.put("stock", "other-stock", { id:"other-stock",eventId:"another-event",remaining:9,history:[] });
    });
    await pool.query("UPDATE event_hub_records SET data=data-'eventId' WHERE kind='stock'");
    const before = (await pool.query("SELECT id,data->'crypto_box' AS cipher,updated_at FROM event_hub_records WHERE kind='stock' ORDER BY id")).rows;
    const stocks = () => store.transaction(tx => tx.stocksForEvent<{eventId:string;remaining:number}>(eventId));
    expect(await stocks()).toEqual([expect.objectContaining({eventId,remaining:2})]);
    expect(await store.transaction(tx=>tx.prepareLookupMetadata())).toBe(2);
    expect((await pool.query("SELECT id,data->'crypto_box' AS cipher,updated_at FROM event_hub_records WHERE kind='stock' ORDER BY id")).rows).toEqual(before);
    await pool.query("UPDATE event_hub_records SET data=jsonb_set(data,'{eventId}',to_jsonb($1::text)) WHERE kind='stock' AND id='other-stock'",[eventId]);
    expect(await stocks()).toEqual([expect.objectContaining({eventId,remaining:2})]);
  });
  it("keyed nickname lookup preserves legacy checks and metadata preparation never changes ciphertext or business state",async()=>{
    const id=await create("중복검사");
    await pool.query("UPDATE event_hub_records SET data=data-'nicknameLookup' WHERE kind='application' AND id=$1",[id]);
    const old=(await pool.query("SELECT data,updated_at FROM event_hub_records WHERE kind='application' AND id=$1",[id])).rows[0];
    const other=await service.session(randomBytes(32).toString("base64url"),true);
    await expect(call("application.basic","",{eventId,basic:basic("중복검사")},undefined,false,other)).rejects.toMatchObject({code:"NICKNAME"});
    const store=new HubStore(pool);expect(await store.transaction(tx=>tx.prepareLookupMetadata())).toBe(1);
    const current=(await pool.query("SELECT data,updated_at FROM event_hub_records WHERE kind='application' AND id=$1",[id])).rows[0];
    expect(current.data.crypto_box).toEqual(old.data.crypto_box);expect(current.updated_at).toEqual(old.updated_at);expect(current.data.nicknameLookup).toHaveLength(64);expect(current.data.nicknameLookup).not.toContain("중복검사");
    expect(await store.transaction(tx=>tx.prepareLookupMetadata())).toBe(0);
    await expect(call("application.basic","",{eventId,basic:basic("중복검사")},undefined,false,other)).rejects.toMatchObject({code:"NICKNAME"});
    const own=await call("application.basic","",{eventId,basic:basic("중복검사")});expect(own.id).toBe(id);
    expect(await store.transaction(tx=>tx.nicknameCandidates<HubApplication>("application","중복검사"))).toHaveLength(1);
  });
  it("legacy unencrypted member names keep duplicate protection and remain unchanged by lookup preparation",async()=>{
    const id=randomUUID(),legacy={id,owner:randomUUID(),nicknameKey:"이전회원",basic:basic("이전회원"),profile:{lastStep:1},marketing:false,salt:"isolated",passwordHash:"0".repeat(128),nicknameChanges:0,history:[]};
    await pool.query("INSERT INTO event_hub_records(kind,id,data) VALUES('member',$1,$2)",[id,JSON.stringify(legacy)]);
    await expect(create("이전회원")).rejects.toMatchObject({code:"NICKNAME"});
    expect(await new HubStore(pool).transaction(tx=>tx.prepareLookupMetadata())).toBe(1);
    const row=(await pool.query("SELECT data FROM event_hub_records WHERE kind='member' AND id=$1",[id])).rows[0].data;
    const {nicknameLookup,...unchanged}=row;expect(nicknameLookup).toHaveLength(64);expect(unchanged).toEqual(legacy);
    await expect(create("이전회원")).rejects.toMatchObject({code:"NICKNAME"});
  });
  for (const [date,startDate] of [["2026-10-30","2026-10-28"],["2026-10-31","2026-10-29"]]) {
    it(`scheduled ${date} opens exactly at 20:00 once, survives restart and stays manually paused`,async()=>{
      let time=new Date(startDate+"T19:59:59+09:00");
      service=new EventHubService(new HubStore(pool),"isolated-test-session-secret",()=>time);
      const e=(await adminState()).events.find(e=>e.id===eventId)!;
      await call("event.save",eventId,{...e,date,opensAt:new Date(startDate+"T20:00:00+09:00").toISOString(),closesAt:new Date(startDate+"T20:10:00+09:00").toISOString()},e.revision,true);
      await call("event.schedule",eventId,{enabled:true,paused:false},(await adminState()).events.find(e=>e.id===eventId)!.revision,true);
      await expect(create("예약전")).rejects.toMatchObject({code:"CLOSED"});
      expect((await adminState()).events.find(e=>e.id===eventId)!.nextRank).toBe(0);
      time=new Date(startDate+"T20:00:00+09:00");
      await Promise.all([service.autoTick(),service.autoTick()]);
      const opened=(await adminState()).events.find(e=>e.id===eventId)!;
      expect(opened.recruitment).toBe(true);
      expect(opened.history.filter(h=>h.action==="schedule.opened")).toHaveLength(1);
      const id=await create("예약정각");expect((await app(id)).rank).toBe(1);
      await call("event.recruitment",eventId,{enabled:false},opened.revision,true);
      service=new EventHubService(new HubStore(pool),"isolated-test-session-secret",()=>time);
      await service.autoTick();
      expect((await adminState()).events.find(e=>e.id===eventId)!.recruitment).toBe(false);
      time=new Date(startDate+"T20:10:00+09:00");
      await service.autoTick();
      await expect(create("마감후")).rejects.toMatchObject({code:"CLOSED"});
    });
  }
  it("keeps venue logos behind payment approval just like the private address",async()=>{
    const e=(await adminState()).events.find(e=>e.id===eventId)!;
    await call("event.save",eventId,{...e,venueLogoId:"jack"},e.revision,true);
    const id=await create();
    let view=await service.state(owner);
    expect(view.applications[0].venue).toBeUndefined();
    expect(JSON.stringify(view.events)).not.toContain("venueLogoId");
    await call("application.consent",id,{consent},1);
    await call("application.confirm",id,{},2);
    await call("admin.application.payment",id,{status:"approved",bankChecked:true},3,true);
    view=await service.state(owner);
    expect(view.applications[0].venue?.logoId).toBe("jack");
  });
  it("requests contact only after actual prize payment without verification or identity merging; late review and result guards remain",async()=>{
    const id=await create();
    const rev=async(target=id)=> (await app(target)).revision;
    await expect(call("application.phone",id,{phone:"01000000000",purposeAccepted:true},await rev())).rejects.toMatchObject({code:"REWARD_RECEIPT"});
    const other=await service.session(randomBytes(32).toString("base64url"),true);
    await expect(call("application.phone",id,{phone:"01011111111",purposeAccepted:true},await rev(),false,other)).rejects.toMatchObject({code:"APPLICATION"});
    const id2=await create("다른분",other);
    expect((await service.state(other)).applications.map(a=>a.id)).toEqual([id2]);
    await call("application.consent",id,{consent},await rev());
    await call("application.confirm",id,{},await rev());
    await call("admin.application.payment",id,{status:"approved",bankChecked:true},await rev(),true);
    await call("application.late",id,{at:"2026-10-31T16:00:00.000Z",reason:"업무 후 도착"},await rev());
    expect((await app(id)).lateArrival?.status).toBe("review");
    expect((await app(id)).payment).toBe("approved");
    const resultId=randomUUID(),requestId=randomUUID();
    const result={id:resultId,label:"운영자 수동 상금",kind:"cash",amount:3000,reason:"현장 확인"};
    const resultRevision=await rev();
    await expect(call("admin.application.result",id,result,resultRevision)).rejects.toMatchObject({code:"ADMIN"});
    await call("admin.application.result",id,result,resultRevision,true,owner,requestId);
    await call("admin.application.result",id,result,resultRevision,true,owner,requestId);
    expect((await app(id)).manualResults).toHaveLength(1);
    expect((await service.state(owner)).applications[0].manualResults?.[0]).not.toHaveProperty("reason");
    const contact={source:"result",resultId,purpose:"실제 지급한 상금 수령 확인용"};
    await expect(call("admin.application.phone-request",id,contact,await rev(),true)).rejects.toMatchObject({code:"REWARD_RECEIPT"});
    await expect(call("admin.application.result.confirm",id,{id:resultId,field:"paidAt"},await rev(),true)).rejects.toMatchObject({code:"DOUBLE_CHECK"});
    await call("admin.application.result.confirm",id,{id:resultId,field:"receivedAt"},await rev(),true);
    expect((await app(id)).manualResults![0].paidAt).toBeUndefined();
    await expect(call("admin.application.phone-request",id,contact,await rev(),true)).rejects.toMatchObject({code:"REWARD_RECEIPT"});
    await call("admin.application.result.confirm",id,{id:resultId,field:"paidAt",doubleChecked:true},await rev(),true);
    expect((await app(id)).manualResults![0].paidAt).toBeTruthy();
    await expect(call("admin.application.result.confirm",id,{id:resultId,field:"paidAt",doubleChecked:true},await rev(),true)).rejects.toMatchObject({code:"RESULT_DUPLICATE"});
    await call("admin.application.phone-request",id,contact,await rev(),true);
    await expect(call("application.phone",id,{phone:"01000000000"},await rev())).rejects.toMatchObject({code:"PURPOSE"});
    await call("application.phone",id,{phone:"01000000000",purposeAccepted:true},await rev());
    expect((await app(id)).rewardPhone).toBe("01000000000");
    const secondResult=randomUUID();
    await call("admin.application.result",id2,{...result,id:secondResult},await rev(id2),true);
    await call("admin.application.result.confirm",id2,{id:secondResult,field:"paidAt",doubleChecked:true},await rev(id2),true);
    await call("admin.application.phone-request",id2,{...contact,resultId:secondResult},await rev(id2),true);
    await call("application.phone",id2,{phone:"01000000000",purposeAccepted:true},await rev(id2),false,other);
    expect((await service.state(other)).applications.map(a=>a.id)).toEqual([id2]);
    expect((await app(id)).owner).not.toBe((await app(id2)).owner);
  });
  it("blocks all ledger writes under a replaced key and recovers unchanged approved records with the original key", async () => {
    const id = await create();
    await call("application.consent", id, { consent }, 1);
    await call("application.confirm", id, {}, 2);
    const a = await app(id);
    await call(
      "admin.application.payment",
      id,
      { status: "approved", bankChecked: true },
      a.revision,
      true,
    );
    const before = (
      await pool.query(
        "SELECT kind,id,data FROM event_hub_records ORDER BY kind,id",
      )
    ).rows;
    let enteredCallback = false;
    await expect(
      new HubStore(pool, "replacement-key-not-for-deployment").transaction(
        async (tx) => {
          enteredCallback = true;
          await tx.put("event", eventId, { title: "must-not-overwrite" });
        },
      ),
    ).rejects.toMatchObject({ code: "LEDGER_KEY_UNAVAILABLE", status: 503 });
    expect(enteredCallback).toBe(false);
    expect(
      (
        await pool.query(
          "SELECT kind,id,data FROM event_hub_records ORDER BY kind,id",
        )
      ).rows,
    ).toEqual(before);
    const restarted = new EventHubService(
      new HubStore(pool),
      "isolated-test-session-secret",
      now,
    );
    expect(
      (await restarted.state(owner)).applications.find((a) => a.id === id)
        ?.payment,
    ).toBe("approved");
  });
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
    for (let i = 0; i < 3; i++) {
      await clockSlot(i);
      await call("application.draw", id, {slot:i}, (await app(id)).revision);
    }
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
    expect((await app(id)).revision).toBe(rev+1);
    expect((await app(id)).history.filter(h=>h.action==="application.enter")).toHaveLength(1);
    await call("application.draw",id,{},rev+1);
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
  it("queues hub lock waiters before borrowing the shared pool, preserving session reads and releasing after failure", async () => {
    const small = new pg.Pool({ connectionString: url, max: 2, connectionTimeoutMillis: 300 });
    const stores = [new HubStore(small), new HubStore(small)];
    let release!: () => void;
    const hold = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void;
    const inside = new Promise<void>((resolve) => { entered = resolve; });
    const active = stores[0].transaction(async () => { entered(); await hold; return "first"; });
    await inside;
    const waiting = Array.from({ length: 12 }, (_, i) => stores[i % 2].transaction(async (tx) => {
      await tx.db.query("SELECT 1");
      if (i === 4) throw new Error("synthetic callback failure");
      return i;
    }));
    const completed = Promise.allSettled(waiting);
    try {
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect((await small.query("SELECT 7 AS session_read")).rows[0].session_read).toBe(7);
      expect(small.waitingCount).toBe(0);
    } finally {
      release();
      await active;
      const results = await completed;
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(11);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
      expect(await stores[0].transaction(async () => "after-error")).toBe("after-error");
      await small.end();
    }
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
    expect((await app(id)).cards[0].prizeLabel).toBe("소품 10번");
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
    const { date: _date, ...template } = e;
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
    await call(
      "admin.application.note",
      id,
      { reason: "PRIVATE-ADMIN-NOTE" },
      (await app(id)).revision,
      true,
    );
    expect(JSON.stringify(await adminState())).toContain("PRIVATE-ADMIN-NOTE");
    expect(JSON.stringify(await service.state(owner))).not.toContain(
      "PRIVATE-ADMIN-NOTE",
    );
  });
  it("reviews privacy cases with separate identity evidence and participant-safe messages; draft plans never execute", async () => {
    await create();
    await call("privacy.request");
    await expect(
      call(
        "admin.privacy.review",
        owner,
        { status: "reviewed", reason: "PRIVATE-REVIEW" },
        1,
        false,
      ),
    ).rejects.toThrow();
    await expect(
      call(
        "admin.privacy.review",
        owner,
        { status: "reviewed", reason: "PRIVATE-REVIEW" },
        1,
        true,
      ),
    ).rejects.toThrow();
    await call(
      "admin.privacy.review",
      owner,
      {
        status: "reviewed",
        reason: "PRIVATE-REVIEW",
        identityConfirmed: true,
        publicMessage: "검토 중입니다",
      },
      1,
      true,
    );
    const state = await service.state(owner);
    expect(state.privacyCase).toMatchObject({
      status: "reviewed",
      publicMessage: "검토 중입니다",
    });
    expect(JSON.stringify(state)).not.toContain("PRIVATE-REVIEW");
    const result = await call("admin.privacy.plan", owner, {}, undefined, true);
    expect((result.plan as { blocked: string[] }).blocked).toContain(
      "운영 보관·파기 정책이 검토 초안입니다. 운영 파기는 승인 전 실행하지 않습니다.",
    );
    expect((await adminState()).applications).toHaveLength(1);
  });
  it("rotates recovery only after administrator identity checks and never stores the new code in receipts", async () => {
    await expect(
      call(
        "admin.owner.recover",
        owner,
        { reason: "격리 본인 확인" },
        undefined,
        true,
      ),
    ).rejects.toThrow();
    const result = await call(
      "admin.owner.recover",
      owner,
      { reason: "격리 본인 확인", identityConfirmed: true },
      undefined,
      true,
    );
    expect(typeof result.recoveryCode).toBe("string");
    expect(await service.session(String(result.recoveryCode), false)).toBe(
      owner,
    );
    const records = await pool.query("SELECT data FROM event_hub_records");
    expect(JSON.stringify(records.rows)).not.toContain(
      String(result.recoveryCode),
    );
  });
  it("separates advertising consent from membership and provides an idempotent purpose-limited unsubscribe", async () => {
    await create();
    await call("marketing.preference", "", { enabled: true });
    expect((await service.state(owner)).marketingPreference).toMatchObject({
      enabled: true,
    });
    const token = service.unsubscribeToken(owner);
    await expect(service.unsubscribe(token + "invalid")).rejects.toThrow();
    await service.unsubscribe(token);
    await service.unsubscribe(token);
    expect((await service.state(owner)).marketingPreference).toMatchObject({
      enabled: false,
    });
    expect((await adminState()).applications).toHaveLength(1);
    const preview = await service.campaignPreview(eventId);
    expect(preview).toMatchObject({ externalSendingEnabled: false });
  });
  it("removes reusable membership if reuse consent is explicitly withdrawn before confirmation", async () => {
    const id = await create();
    await call(
      "application.consent",
      id,
      {
        consent: { ...consent, reuse: true },
        password: "Synthetic-test-pass-123",
      },
      (await app(id)).revision,
    );
    expect(
      (await pool.query("SELECT id FROM event_hub_records WHERE kind='member'"))
        .rowCount,
    ).toBe(1);
    await call(
      "application.consent",
      id,
      { consent: { ...consent, reuse: false } },
      (await app(id)).revision,
    );
    expect(
      (await pool.query("SELECT id FROM event_hub_records WHERE kind='member'"))
        .rowCount,
    ).toBe(0);
  });

  it("refuses privacy execution without explicit isolated-test confirmations or with a stale fingerprint", async () => {
    await create();
    const store = new HubStore(pool);
    const denied = {
      mode: "isolated-test" as const,
      policyConfirmed: false,
      identityConfirmed: false,
      backupConfirmed: false,
    };
    await expect(
      executePrivacyPlanForIsolatedTest(store, owner, "stale", denied, now()),
    ).rejects.toThrow("운영 파기는 승인 전 비활성");
    await expect(
      executePrivacyPlanForIsolatedTest(
        store,
        owner,
        "stale",
        {
          ...denied,
          policyConfirmed: true,
          identityConfirmed: true,
          backupConfirmed: true,
        },
        now(),
      ),
    ).rejects.toThrow("원본 또는 정책이 변경");
    expect((await adminState()).applications).toHaveLength(1);
  });

  it("keeps inquiry triage private, closes/reopens cases and reopens when a participant sends again", async () => {
    await call("thread.send", "", { text: "가상 문의", collection: true });
    await call(
      "thread.tag",
      owner,
      { tags: ["검토 필요"], reason: "PRIVATE-TRIAGE-NOTE" },
      undefined,
      true,
    );
    expect(JSON.stringify(await adminState())).toContain("PRIVATE-TRIAGE-NOTE");
    const own = await service.state(owner);
    expect(own.threads[0].history).toEqual([]);
    expect(own.threads[0].tags).toEqual([]);
    expect(JSON.stringify(own)).not.toContain("PRIVATE-TRIAGE-NOTE");
    await expect(
      call("thread.resolve", owner, {
        status: "resolved",
        reason: "권한 없음",
      }),
    ).rejects.toThrow();
    await call(
      "thread.resolve",
      owner,
      { status: "resolved", reason: "격리 문의 처리" },
      undefined,
      true,
    );
    expect((await adminState()).threads[0].status).toBe("resolved");
    const id = randomUUID();
    await call(
      "thread.send",
      "",
      { text: "추가 문의", collection: true },
      undefined,
      false,
      owner,
      id,
    );
    await call(
      "thread.send",
      "",
      { text: "추가 문의", collection: true },
      undefined,
      false,
      owner,
      id,
    );
    expect((await adminState()).threads[0]).toMatchObject({ status: "open" });
    expect((await adminState()).threads[0].messages).toHaveLength(2);
  });

  it("V4 public notices require explicit approval; map and legacy bytes remain event-owner protected",async()=>{
    const png="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD9sAAAAASUVORK5CYII=";
    const current=async()=> (await adminState()).events.find(e=>e.id===eventId)!;
    const upload=async(purpose:string,confirmed=false)=>call("event.media.upload",eventId,{mime:"image/png",base64:png,purpose,publicConfirmed:confirmed,alt:"격리 안내"},(await current()).revision,true);
    await expect(upload("notice")).rejects.toMatchObject({code:"MEDIA_PUBLIC_CONFIRM"});
    await expect(call("event.media.upload",eventId,{mime:"image/png",base64:png,purpose:"notice",publicConfirmed:true},(await current()).revision)).rejects.toMatchObject({code:"ADMIN"});
    const notice=await upload("notice",true),map=await upload("map");
    const idOf=(url:unknown)=>String(url).split('/').at(-1)!.split('.')[0];
    expect((await service.media(idOf(notice.mediaUrl),"")).mime).toBe("image/png");
    await expect(service.media(idOf(map.mediaUrl),owner)).rejects.toMatchObject({code:"MEDIA"});
    const anonymous=await service.state();
    expect(anonymous.events.find(e=>e.id===eventId)?.media).toEqual([notice.mediaUrl]);
    expect(anonymous.events.find(e=>e.id===eventId)?.materials?.map(m=>m.purpose)).toEqual(["notice"]);
    const id=await create();await approved(id);
    expect((await service.media(idOf(map.mediaUrl),owner)).base64).toBe(png);
    const stranger=await service.session(randomBytes(32).toString("base64url"),true);
    await expect(service.media(idOf(map.mediaUrl),stranger)).rejects.toMatchObject({code:"MEDIA"});
    const e=await current(),items=e.materials!.map(m=>({id:m.id,alt:m.alt,hidden:m.purpose==="notice"}));
    await call("event.media.update",eventId,{items},e.revision,true);
    await expect(service.media(idOf(notice.mediaUrl),owner)).rejects.toMatchObject({code:"MEDIA"});
    expect((await service.media(idOf(notice.mediaUrl),"",true)).base64).toBe(png);
    await expect(call("event.media.update",eventId,{items},e.revision,true)).rejects.toMatchObject({code:"REVISION"});
    await call("event.media.update",eventId,{items:items.reverse().map(m=>({...m,hidden:false}))},(await current()).revision,true);
    expect((await service.state(owner)).events.find(e=>e.id===eventId)?.materials?.map(m=>m.purpose)).toEqual(["map","notice"]);
    expect((await current()).history.filter(h=>h.action==="event.media.update")).toHaveLength(2);
  });
  it("V4 malformed image, foreign attachment and repeated upload cannot bypass file or idempotency checks",async()=>{
    const e=(await adminState()).events.find(e=>e.id===eventId)!;
    await expect(call("event.media.upload",eventId,{mime:"image/png",base64:Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]).toString("base64"),purpose:"map"},e.revision,true)).rejects.toThrow();
    await expect(call("event.media.update",eventId,{items:[{id:randomUUID(),alt:"",hidden:false}]},e.revision,true)).rejects.toMatchObject({code:"MEDIA"});
    const requestId=randomUUID(),data={mime:"image/png",base64:"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD9sAAAAASUVORK5CYII=",purpose:"map"};
    const first=await call("event.media.upload",eventId,data,e.revision,true,owner,requestId);
    const retry=await call("event.media.upload",eventId,data,e.revision,true,owner,requestId);
    expect(retry).toEqual(first);expect((await adminState()).events.find(e=>e.id===eventId)?.materials).toHaveLength(1);
  });
  it("uploads passive media with admin/revision/content/size checks and requires this event's payment approval to read", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZAAAAABJRU5ErkJggg==",
      "base64",
    ).toString("base64");
    await expect(
      call(
        "event.media.upload",
        eventId,
        { mime: "image/png", base64: png },
        2,
      ),
    ).rejects.toThrow();
    await expect(
      call(
        "event.media.upload",
        eventId,
        {
          mime: "image/png",
          base64: Buffer.from("<html>unsafe</html>").toString("base64"),
        },
        2,
        true,
      ),
    ).rejects.toThrow();
    await expect(
      call(
        "event.media.upload",
        eventId,
        {
          mime: "image/png",
          base64: Buffer.alloc(2 * 1024 * 1024 + 1).toString("base64"),
        },
        2,
        true,
      ),
    ).rejects.toThrow();
    const result = await call(
      "event.media.upload",
      eventId,
      { mime: "image/png", base64: png },
      2,
      true,
    );
    const mediaId = String(result.mediaUrl).split("/").at(-1)!.split(".")[0];
    await expect(service.media(mediaId, owner)).rejects.toThrow();
    const id = await create();
    await approved(id);
    expect((await service.media(mediaId, owner)).base64).toBe(png);
    const stranger = await service.session(
      randomBytes(32).toString("base64url"),
      true,
    );
    await expect(service.media(mediaId, stranger)).rejects.toThrow();
    expect((await service.media(mediaId, "", true)).mime).toBe("image/png");
    const second = await call(
      "event.save",
      "",
      { ...event, date: "2026-11-07" },
      undefined,
      true,
    );
    await expect(
      call(
        "event.save",
        String(second.id),
        { ...event, date: "2026-11-07", media: [result.mediaUrl] },
        1,
        true,
      ),
    ).rejects.toThrow();
  });
  const testPrivacyPolicy = async (financeDays = 1) => {
    await call(
      "admin.privacy.policy",
      "",
      {
        ...DEFAULT_PRIVACY_POLICY,
        backupProcedure: "격리 fixture 백업 없음 · 시험 확인",
        rules: Object.fromEntries(
          Object.keys(DEFAULT_PRIVACY_POLICY.rules).map((k) => [
            k,
            {
              days: k === "finance" ? financeDays : 1,
              basis: "법적 정책이 아닌 합성 fixture 시험 기준",
            },
          ]),
        ),
      },
      0,
      true,
    );
  };
  const eraseFixture = async (who = owner) => {
    const future = new Date("2028-11-01T00:00:00Z");
    const store = new HubStore(pool);
    const plan = await store.transaction((tx) => planPrivacy(tx, who, future));
    return executePrivacyPlanForIsolatedTest(
      store,
      who,
      plan.fingerprint,
      {
        mode: "isolated-test",
        policyConfirmed: true,
        identityConfirmed: true,
        backupConfirmed: true,
      },
      future,
    );
  };
  it("erases only expired synthetic hub records, scrubs duplicate receipts and permits two independent erasures without hash collisions", async () => {
    const id = await create();
    await complete(id);
    await call("thread.send", "", {
      text: "synthetic private message",
      collection: true,
    });
    // Inquiry retention starts at actual resolution; an old open thread is preserved.
    await call("thread.resolve", owner, { status: "resolved", reason: "격리 문의 처리 완료" }, undefined, true);
    await call("privacy.request");
    const screeningId = randomUUID();
    await new HubStore(pool).transaction(async (tx) => {
      const a = (await tx.get<HubApplication>("application", id))!;
      a.screeningPhoto = { id: screeningId };
      await tx.put("application", id, a);
      await tx.put("settings", `screening:${screeningId}`, {
        id: screeningId,
        applicationId: id,
        mime: "image/png",
        base64: "synthetic-private-photo",
      });
    });
    await testPrivacyPolicy();
    await eraseFixture();
    expect((await adminState()).applications).toHaveLength(0);
    expect((await adminState()).threads).toHaveLength(0);
    await expect(service.state(owner)).rejects.toThrow();
    const all = await new HubStore(pool).transaction(async (tx) => ({
      requests: await tx.all<{ result: unknown }>("request"),
      owners: await tx.all<{ erasedAt?: string }>("owner"),
    }));
    expect(JSON.stringify(all.requests)).not.toContain(
      "synthetic private message",
    );
    expect(all.owners[0].erasedAt).toBeTruthy();
    expect(
      await new HubStore(pool).transaction((tx) =>
        tx.get("settings", `screening:${screeningId}`),
      ),
    ).toBeUndefined();
    const secondOwner = await service.session(
      randomBytes(32).toString("base64url"),
      true,
    );
    await create("두번째가상", secondOwner);
    await eraseFixture(secondOwner);
    const owners = await new HubStore(pool).transaction((tx) =>
      tx.all<{ erasedAt?: string; recoveryHash: string }>("owner"),
    );
    expect(owners.filter((x) => x.erasedAt)).toHaveLength(2);
    expect(new Set(owners.map((x) => x.recoveryHash)).size).toBe(2);
  });
  it("preserves a paid financial ledger while minimizing expired profile/contact data and blocks holds and onsite records", async () => {
    const id = await create();
    await approved(id);
    // Ordinary requests no longer collect phone numbers. Seed an existing legacy
    // record only inside this isolated fixture to verify hold/minimization safety.
    await new HubStore(pool).transaction(async (tx) => {
      const existing = (await tx.get<HubApplication>("application", id))!;
      existing.basic.phone = basic().phone;
      await tx.put("application", id, existing);
    });
    await testPrivacyPolicy(3650);
    await call(
      "admin.privacy.hold",
      owner,
      { enabled: true, reason: "격리 분쟁 보류" },
      undefined,
      true,
    );
    await expect(eraseFixture()).rejects.toThrow("보관 보류");
    expect((await app(id)).basic.phone).toBe(basic().phone);
    await call(
      "admin.privacy.hold",
      owner,
      { enabled: false, reason: "격리 보류 해제" },
      undefined,
      true,
    );
    await eraseFixture();
    const retained = await app(id);
    expect(retained.payment).toBe("approved");
    expect(retained.quote?.fee).toBe(40000);
    expect(retained.basic.phone).toBe("");
    expect(retained.basic.depositor).toBe("");
    expect(retained.erasedAt).toBeTruthy();
  });

  it("refuses disposal of linked onsite profiles and rolls back when receipt scrubbing fails", async () => {
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
      { deviceSecret: "synthetic-private-device" },
      (await app(id)).revision,
    );
    await testPrivacyPolicy();
    await expect(eraseFixture()).rejects.toThrow("현장 데이터 범위");
    expect(
      (
        await pool.query(
          "SELECT row_id FROM app_kv_rows WHERE table_name='profiles'",
        )
      ).rowCount,
    ).toBe(1);
    // A separate, newly created owner has no linked onsite records.
    const other = await service.session(
      randomBytes(32).toString("base64url"),
      true,
    );
    const second = await create("롤백가상", other);
    await pool.query(
      "CREATE OR REPLACE FUNCTION hub_privacy_fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.kind='request' THEN RAISE EXCEPTION 'fixture rollback'; END IF; RETURN NEW; END $$",
    );
    await pool.query(
      "CREATE TRIGGER hub_privacy_fixture_fail BEFORE UPDATE ON event_hub_records FOR EACH ROW EXECUTE FUNCTION hub_privacy_fixture_fail()",
    );
    try {
      await expect(eraseFixture(other)).rejects.toThrow("fixture rollback");
      expect((await app(second)).basic.nickname).toBe("롤백가상");
    } finally {
      await pool.query(
        "DROP TRIGGER IF EXISTS hub_privacy_fixture_fail ON event_hub_records",
      );
      await pool.query("DROP FUNCTION IF EXISTS hub_privacy_fixture_fail()");
    }
  });
  it("blocks new production recruitment with draft privacy terms but preserves approved recovery and allows closure", async () => {
    const id = await create();
    await approved(id);
    const other = await service.session(
      randomBytes(32).toString("base64url"),
      true,
    );
    const previous = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      await expect(create("운영차단가상", other)).rejects.toThrow("개인정보");
      const revision = (await adminState()).events.find(
        (e) => e.id === eventId,
      )!.revision;
      await expect(
        call("event.recruitment", eventId, { enabled: true }, revision, true),
      ).rejects.toThrow("개인정보");
      const own = await service.state(owner);
      expect(own.applications[0].payment).toBe("approved");
      expect(own.applications[0]).toMatchObject({
        venue: { address: event.address },
      });
      await call(
        "event.recruitment",
        eventId,
        { enabled: false },
        revision,
        true,
      );
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
  describe("latest integrated Halloween and tour campaigns", () => {
    const prepare = async (key: string) =>
      String((await call("campaign.prepare", key, {}, undefined, true)).id);
    const open = async (id: string, advance?: number) => {
      let e = (await adminState()).events.find((e) => e.id === id)!;
      await call(
        "event.save",
        id,
        {
          ...e,
          account: "격리 시험 계좌",
          deadline: "관리자 개별 안내",
          campaign: { ...e.campaign, ...(advance ? { advance } : {}) },
        },
        e.revision,
        true,
      );
      e = (await adminState()).events.find((e) => e.id === id)!;
      await call("event.recruitment", id, { enabled: true }, e.revision, true);
    };
    it("creates exactly two unpublished Halloween events with 72 inventory units, idempotently", async () => {
      const f = await prepare("halloween-2026-10-30"),
        s = await prepare("halloween-2026-10-31");
      await prepare("halloween-2026-10-30");
      const state = await adminState();
      expect(
        state.events
          .filter((e) => [f, s].includes(e.id))
          .every((e) => !e.recruitment),
      ).toBe(true);
      expect(
        state.stocks
          .filter((v) => v.eventId === f)
          .reduce((n, v) => n + v.remaining, 0),
      ).toBe(23);
      expect(
        state.stocks
          .filter((v) => v.eventId === s)
          .reduce((n, v) => n + v.remaining, 0),
      ).toBe(49);
      expect(
        state.stocks.find((v) => v.eventId === f && v.label === "LED 밴드")
          ?.remaining,
      ).toBe(0);
      await expect(
        call("campaign.prepare", "halloween-2026-10-30"),
      ).rejects.toMatchObject({ code: "ADMIN" });
    });
    it("operator costume recognition persists its minimum fee, private audit and participant notice idempotently", async () => {
      eventId = await prepare("halloween-2026-10-31");
      await open(eventId);
      await new HubStore(pool).transaction(async tx => {
        const e = (await tx.get<HubEvent>("event", eventId))!;
        e.nextRank = 15;
        await tx.put("event", e.id, e);
      });
      const id = await create();
      expect((await app(id)).quote?.fee).toBe(25000);
      const data = {kind:"costume",reason:"operator-only recognition note"};
      await expect(call("admin.application.costume",id,data,1)).rejects.toMatchObject({code:"ADMIN"});
      const requestId = randomUUID();
      await call("admin.application.costume",id,data,1,true,owner,requestId);
      await call("admin.application.costume",id,data,1,true,owner,requestId);
      const recognized = await app(id);
      expect(recognized.revision).toBe(2);
      expect(recognized.quote?.fee).toBe(15000);
      expect(recognized.halloweenRecognition).toMatchObject({kind:"costume",finalFee:15000,proposedFee:15000});
      expect(recognized.history.filter(h=>h.action==="admin.halloween.recognition")).toHaveLength(1);
      expect(JSON.parse(recognized.history.find(h=>h.action==="admin.halloween.recognition")!.reason!))
        .toMatchObject({...data,previousFee:25000,finalFee:15000,participantNotice:recognized.halloweenRecognition!.participantNotice});
      expect((await service.state(owner)).applications[0]).not.toHaveProperty("halloweenRecognition");
      await call("application.consent",id,{consent},2);
      const visible = (await service.state(owner)).applications[0];
      expect(visible.halloweenRecognition?.participantNotice).toContain("15,000원");
      expect(JSON.stringify(visible)).not.toContain(data.reason);
    });
    it.each(["none", "reported", "approved"] as const)("costume recognition preserves a confirmed %s payment and records the lower proposal", async payment => {
      eventId = await prepare("halloween-2026-10-31");
      await open(eventId);
      await new HubStore(pool).transaction(async tx => {
        const e = (await tx.get<HubEvent>("event", eventId))!;
        e.nextRank = 15;
        await tx.put("event", e.id, e);
      });
      const id = await create();
      await complete(id);
      if (payment === "reported") await call("application.report",id,{},(await app(id)).revision);
      if (payment === "approved") await call("admin.application.payment",id,{status:"approved",bankChecked:true},(await app(id)).revision,true);
      const before = await app(id);
      await call("admin.application.costume",id,{kind:"costume",reason:"현장 코스튬 확인"},before.revision,true);
      const after = await app(id);
      expect(after.quote).toEqual(before.quote);
      expect(after.payment).toBe(payment);
      expect(after.confirmedAt).toBe(before.confirmedAt);
      expect(after.approvedAt).toBe(before.approvedAt);
      expect(after.differenceReview).toMatchObject({previous:25000,proposed:15000});
      expect(after.halloweenRecognition?.participantNotice).toContain("25,000원 유지");
    });
    it("free approval is separate from bank payment and still requires an actual start and complete profile", async () => {
      eventId = await prepare("halloween-2026-10-31");
      await open(eventId);
      const id = await create();
      await call("admin.application.costume",id,{kind:"costume",reason:"1등 코스튬 확인"},(await app(id)).revision,true);
      expect((await app(id)).quote?.fee).toBe(0);
      expect((await app(id)).waivedAt).toBeUndefined();
      await complete(id);
      await expect(
        call(
          "admin.application.payment",
          id,
          { status: "approved", bankChecked: true },
          (await app(id)).revision,
          true,
        ),
      ).rejects.toMatchObject({ code: "FREE" });
      await call(
        "admin.application.free",
        id,
        {},
        (await app(id)).revision,
        true,
      );
      expect((await app(id)).payment).toBe("none");
      expect((await app(id)).waivedAt).toBeTruthy();
      await expect(
        call("application.report", id, {}, (await app(id)).revision),
      ).rejects.toMatchObject({ code: "FREE" });
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
      await activate();
      await expect(
        call(
          "application.enter",
          id,
          { deviceSecret: "campaign-device" },
          (await app(id)).revision,
        ),
      ).rejects.toMatchObject({ code: "PROFILE_INCOMPLETE" });
      await call(
        "application.profile",
        id,
        { profile: fullProfile },
        (await app(id)).revision,
      );
      await call(
        "application.enter",
        id,
        { deviceSecret: "campaign-device" },
        (await app(id)).revision,
      );
      expect(
        (await service.state(owner)).applications[0].venue?.address,
      ).toBeDefined();
      for (let n = 0; n < 3; n++) {
        await clockSlot(n);
        await call("application.draw", id, {slot:n}, (await app(id)).revision);
      }
      await expect(
        call("application.draw", id, {}, (await app(id)).revision),
      ).rejects.toMatchObject({ code: "CARD_LIMIT" });
    });
    it("manual priority exclusion needs bank review; succession preserves paid/final quotes and original order", async () => {
      eventId = await prepare("halloween-2026-10-31");
      await open(eventId);
      const first = await create("선착첫째");
      await complete(first);
      const secondOwner = await service.session(
        randomBytes(32).toString("base64url"),
        true,
      );
      const second = await create("선착둘째", secondOwner);
      await call(
        "application.consent",
        second,
        { consent },
        1,
        false,
        secondOwner,
      );
      await call("application.confirm", second, {}, 2, false, secondOwner);
      await call(
        "admin.application.payment",
        second,
        { status: "approved", bankChecked: true },
        3,
        true,
      );
      let e = (await adminState()).events.find((e) => e.id === eventId)!;
      await expect(
        call(
          "campaign.priority",
          eventId,
          {
            applicationId: second,
            kind: "exclude",
            confirmed: true,
            reason: "검토",
          },
          e.revision,
          true,
        ),
      ).rejects.toMatchObject({ code: "BANK_REVIEW" });
      await call(
        "campaign.priority",
        eventId,
        {
          applicationId: first,
          kind: "exclude",
          confirmed: true,
          reason: "개별 안내 후 무응답 확인",
        },
        e.revision,
        true,
      );
      e = (await adminState()).events.find((e) => e.id === eventId)!;
      await call(
        "campaign.succeed",
        eventId,
        { confirmed: true, reason: "관리자 확인 후 승계" },
        e.revision,
        true,
      );
      const a = await app(second);
      expect(a.rank).toBe(2);
      expect(a.benefitRank).toBe(1);
      expect(a.quote?.fee).toBe(10000);
      expect(a.payment).toBe("approved");
      expect(a.differenceReview?.proposed).toBe(0);
    });
    it("new tour presets quote the confirmed 10,000 advance without a final settlement", async () => {
      eventId = await prepare("tour-2026-11-06");
      await open(eventId);
      const id = await create();
      await complete(id);
      expect((await app(id)).quote).toMatchObject({ fee: 10000, kind: "advance" });
      expect((await app(id)).quote).not.toHaveProperty("finalSettlement");
    });
    it("tour advance is required, rounds 2/3 are refused and no final settlement is generated", async () => {
      eventId = await prepare("tour-2026-11-06");
      // Old unconfigured records still require an explicit amount. New presets have a default.
      await new HubStore(pool).transaction(async (tx) => {
        const event = (await tx.get<HubEvent>("event", eventId))!;
        delete event.campaign!.advance;
        await tx.put("event", event.id, event);
      });
      await expect(open(eventId)).rejects.toMatchObject({ code: "ADVANCE" });
      await open(eventId, 17000);
      for (const round of [2, 3])
        await expect(
          call("application.basic", "", { eventId, round, basic: basic() }),
        ).rejects.toMatchObject({ code: "ROUND" });
      const id = await create();
      await complete(id);
      expect((await app(id)).quote).toMatchObject({
        fee: 17000,
        kind: "advance",
      });
      expect((await app(id)).quote).not.toHaveProperty("finalSettlement");
      await expect(
        call(
          "admin.application.reprice",
          id,
          {
            fee: 0,
            reason: "must not convert advance into a free final price",
          },
          (await app(id)).revision,
          true,
        ),
      ).rejects.toMatchObject({ code: "ADVANCE_ONLY" });
      await new HubStore(pool).transaction(async (tx) => {
        const a = (await tx.get<HubApplication>("application", id))!;
        a.quote!.fee = 0;
        await tx.put("application", id, a);
      });
      await expect(
        call("admin.application.free", id, {}, (await app(id)).revision, true),
      ).rejects.toMatchObject({ code: "FREE" });
    });
    it("tour ten people receive exactly one random voucher and one loss each, with durable pool quantities", async () => {
      const tourNow = () => new Date("2026-11-06T14:00:00Z");
      service = new EventHubService(
        new HubStore(pool),
        "isolated-test-session-secret",
        tourNow,
        () => 0,
      );
      eventId = await prepare("tour-2026-11-06");
      await open(eventId, 17000);
      await pool.query(
        "UPDATE app_kv_rows SET data=data||$1::jsonb WHERE table_name='app_settings'",
        [
          JSON.stringify({
            session_active: true,
            event_cycle_started_at: "2026-11-06T13:00:00Z",
            event_cycle_archive_id:
              "binpc2:event-anon:v1:2026-11-06:00000000-0000-4000-8000-000000000001",
            event_cycle_reset_complete: false,
          }),
        ],
      );
      const amounts: number[] = [];
      const jobs: (() => Promise<void>)[] = [];
      for (let n = 0; n < 11; n++) {
        const who = await service.session(
          randomBytes(32).toString("base64url"),
          true,
        );
        const id = await create(`투어${n.toString().padStart(2, "0")}`, who);
        await call("application.consent", id, { consent }, 1, false, who);
        await call("application.confirm", id, {}, 2, false, who);
        await call(
          "admin.application.payment",
          id,
          { status: "approved", bankChecked: true },
          3,
          true,
        );
        await call(
          "admin.application.attendance",
          id,
          { status: "confirmed" },
          4,
          true,
        );
        await call("admin.application.checkin", id, { checked: true }, 5, true);
        await call(
          "application.profile",
          id,
          { profile: fullProfile },
          6,
          false,
          who,
        );
        await call(
          "application.enter",
          id,
          { deviceSecret: `tour-device-${n}` },
          7,
          false,
          who,
        );
        if (n === 10) {
          await expect(
            call("application.draw", id, {}, 8, false, who),
          ).rejects.toMatchObject({ code: "TOUR_DRAW" });
          continue;
        }
        jobs.push(async () => {
          const nonce = randomUUID();
          await call("application.draw", id, {}, 8, false, who, nonce);
          await call("application.draw", id, {}, 8, false, who, nonce);
          const a = (await service.state(who)).applications[0];
          expect(a.cards).toHaveLength(2);
          expect(a.cards.filter((c) => c.prize === "다음 기회에")).toHaveLength(
            1,
          );
          amounts.push(a.cards.find((c) => c.couponAmount)!.couponAmount!);
          await expect(
            call("application.draw", id, {}, 9, false, who),
          ).rejects.toMatchObject({ code: "CARD_LIMIT" });
        });
      }
      await Promise.all(jobs.map((job) => job()));
      expect(amounts.sort((a, b) => a - b)).toEqual([
        2000, 2000, 2000, 2000, 3000, 3000, 3000, 4000, 4000, 5000,
      ]);
      expect(
        (await adminState()).stocks
          .filter((s) => s.eventId === eventId)
          .reduce((n, s) => n + s.remaining, 0),
      ).toBe(0);
      expect(
        (await adminState()).applications
          .filter((a) => a.eventId === eventId)
          .flatMap((a) => a.cards)
          .every((c) => !c.prizeLabel?.includes("원") && !c.couponAmount),
      ).toBe(true);
    });
    it("private screening requires purpose consent and deletes the source after manual review", async () => {
      eventId = await prepare("halloween-2026-10-31");
      await open(eventId);
      const id = String(
        (
          await call("application.basic", "", {
            eventId,
            basic: { ...basic(), birthYear: 1990 },
          })
        ).id,
      );
      await complete(id);
      expect((await app(id)).eligibility?.status).toBe("review");
      const image = {
        mime: "image/png",
        base64:
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZAAAAABJRU5ErkJggg==",
      };
      await expect(
        call("application.screening.photo", id, image, 3),
      ).rejects.toMatchObject({ code: "CONSENT" });
      await call(
        "application.screening.photo",
        id,
        { ...image, photoConsent: true },
        3,
      );
      const photo = (await app(id)).screeningPhoto!.id;
      await expect(
        service.screeningPhoto(photo, "other-owner", false),
      ).rejects.toMatchObject({ status: 404 });
      expect((await service.screeningPhoto(photo, owner, false)).mime).toBe(
        "image/png",
      );
      await call(
        "admin.application.eligibility",
        id,
        { status: "approved", reason: "개별 검토", message: "사전 검토 승인" },
        4,
        true,
      );
      await call("admin.application.screening.delete", id, {}, 5, true);
      await expect(
        service.screeningPhoto(photo, owner, false),
      ).rejects.toMatchObject({ status: 404 });
      expect((await app(id)).screeningPhoto?.deletedAt).toBeTruthy();
      expect(
        JSON.stringify((await service.state(owner)).applications),
      ).not.toContain("iVBOR");
    });
  });
  it("manual tour Saturdays suppress automatic rooms, and existing automatic drafts block duplicate tour creation", async () => {
    const setClock = (day: string) => {
      service = new EventHubService(
        new HubStore(pool),
        "isolated-test-session-secret",
        () => new Date(day + "T12:00:00Z"),
      );
    };
    setClock("2026-11-05");
    await call("campaign.prepare", "tour-2026-11-07", {}, undefined, true);
    await call(
      "settings.save",
      "",
      { ...DEFAULT_HUB_SETTINGS, autoSaturday: true },
      0,
      true,
    );
    await service.autoTick();
    expect(
      (await adminState()).events.some((e) => e.id === "auto-2026-11-07"),
    ).toBe(false);
    setClock("2026-11-12");
    await service.autoTick();
    await expect(
      call("campaign.prepare", "tour-2026-11-14", {}, undefined, true),
    ).rejects.toMatchObject({ code: "DUPLICATE_DATE" });
  });

  it("Halloween ordinary ranks cannot consume special stock and eligible ranks reserve only remaining units", async () => {
    const holder = await app(await create("재고검사"));
    eventId = String(
      (
        await call(
          "campaign.prepare",
          "halloween-2026-10-31",
          {},
          undefined,
          true,
        )
      ).id,
    );
    await new HubStore(pool).transaction(async (tx) => {
      const e = (await tx.get<HubEvent>("event", eventId))!;
      const a: HubApplication = { ...holder, eventId, rank: 16, cards: [] };
      const stocks =
        await tx.all<import("./event-campaign-service.js").CampaignStock>(
          "stock",
        );
      for (const stock of stocks)
        if (stock.eventId === eventId && !stock.special) {
          stock.remaining = 0;
          await tx.put("stock", stock.id, stock);
        }
      await drawCampaign(tx, e, a, now().toISOString(), () => 0);
      expect(a.cards[0].prize).toBe("다음 기회에");
      a.rank = 15;
      await drawCampaign(tx, e, a, now().toISOString(), () => 0);
      expect(a.cards[1].prizeLabel).toBe("LED 밴드");
      expect(
        (
          await tx.all<import("./event-campaign-service.js").CampaignStock>(
            "stock",
          )
        ).find((s) => s.eventId === eventId && s.label === "LED 밴드")
          ?.remaining,
      ).toBe(1);
    });
  });
  it("soft OFF and exact campaign end block new use but preserve approvals, draws and administrator fulfillment across 17:00 reset", async () => {
    eventId = String(
      (
        await call(
          "campaign.prepare",
          "halloween-2026-10-31",
          {},
          undefined,
          true,
        )
      ).id,
    );
    let e = (await adminState()).events.find((e) => e.id === eventId)!;
    await call(
      "event.save",
      eventId,
      { ...e, account: "격리 시험 계좌", deadline: "개별 안내" },
      e.revision,
      true,
    );
    e = (await adminState()).events.find((e) => e.id === eventId)!;
    await call(
      "event.recruitment",
      eventId,
      { enabled: true },
      e.revision,
      true,
    );
    const id = await create();
    await complete(id);
    await call("admin.application.free", id, {}, 3, true);
    await call(
      "admin.application.attendance",
      id,
      { status: "confirmed" },
      4,
      true,
    );
    await call("admin.application.checkin", id, { checked: true }, 5, true);
    await call("application.profile", id, { profile: fullProfile }, 6);
    await activate();
    await call(
      "application.enter",
      id,
      { deviceSecret: "module-isolated-fixture" },
      7,
    );
    await clockSlot(0);
    await call("application.draw", id, {slot:0}, 8);
    const original = await app(id);
    await call(
      "settings.save",
      "",
      {
        ...DEFAULT_HUB_SETTINGS,
        campaignModules: { halloweenDraw: false, tourDraw: true },
      },
      0,
      true,
    );
    await expect(
      call("application.draw", id, {}, original.revision),
    ).rejects.toMatchObject({ code: "MODULE_DISABLED" });
    expect((await service.state(owner)).applications[0].cards).toEqual(
      original.cards,
    );
    expect(
      (await service.state(owner)).events.find((e) => e.id === eventId)
        ?.cardsEnabled,
    ).toBe(false);
    await call(
      "settings.save",
      "",
      {
        ...DEFAULT_HUB_SETTINGS,
        campaignModules: { halloweenDraw: true, tourDraw: true },
      },
      1,
      true,
    );
    await clockSlot(1);
    await call("application.draw", id, {slot:1}, original.revision);
    await pool.query(
      "UPDATE app_kv_rows SET data=jsonb_set(data,'{module_flags,event_hub}','false'::jsonb) WHERE table_name='app_settings'",
    );
    const saved = await app(id);
    await expect(
      call("application.draw", id, {}, saved.revision),
    ).rejects.toMatchObject({ code: "MODULE_DISABLED" });
    await expect(
      call(
        "application.enter",
        id,
        { deviceSecret: "same-device" },
        saved.revision,
      ),
    ).rejects.toMatchObject({ code: "MODULE_DISABLED" });
    await call(
      "admin.application.candy",
      id,
      { kind: "haribo-a" },
      saved.revision,
      true,
    );
    expect((await service.state(owner)).applications[0].cards).toHaveLength(2);
    await pool.query(
      "UPDATE app_kv_rows SET data=jsonb_set(data,'{module_flags,event_hub}','true'::jsonb) WHERE table_name='app_settings'",
    );
    const lateOwner = await service.session(
      randomBytes(32).toString("base64url"),
      true,
    );
    const lateDraft = await create("만료대기", lateOwner);
    await call(
      "application.consent",
      lateDraft,
      { consent },
      1,
      false,
      lateOwner,
    );
    service = new EventHubService(
      new HubStore(pool),
      "isolated-test-session-secret",
      () => new Date("2026-10-31T16:00:00Z"),
    );
    await expect(
      call("application.confirm", lateDraft, {}, 2, false, lateOwner),
    ).rejects.toMatchObject({ code: "CLOSED" });

    await pool.query("UPDATE app_kv_rows SET data=jsonb_set(data,'{session_active}','false'::jsonb) WHERE table_name='app_settings'");
    await expect(call("application.draw", id, {}, (await app(id)).revision)).rejects.toMatchObject({code:"EVENT_ENDED"});
    expect((await app(id)).cards).toHaveLength(2);
    expect((await service.state(owner)).events.find(e => e.id === eventId)?.themeEnabled).toBe(true);
    const resumed=await call("application.enter",id,{deviceSecret:"same-device"},(await app(id)).revision);
    expect((resumed.profile as {id:string}).id).toBe((await app(id)).profileId);
    await expect(call("application.enter",lateDraft,{deviceSecret:"never-admitted"},2,false,lateOwner)).rejects.toMatchObject({code:"EVENT_ENDED"});
    service = new EventHubService(new HubStore(pool), "isolated-test-session-secret", () => new Date("2026-11-01T08:00:00Z"));
    await expect(call("application.draw", id, {}, (await app(id)).revision)).rejects.toMatchObject({code:"EVENT_ENDED"});
    const view = await service.state(owner);
    expect(view.events.find((e) => e.id === eventId)?.themeEnabled).toBe(false);
    expect(view.applications[0].cards).toHaveLength(2);
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
    expect((await app(id)).cards).toHaveLength(2);
    expect((await app(id)).waivedAt).toBeTruthy();
    expect((await app(id)).candy).toBe("haribo");
    expect(
      (await service.state(owner)).events.find((e) => e.id === eventId)
        ?.themeEnabled,
    ).toBe(false);
  });
  it("whole module OFF preserves pre-application inquiries and administrator replies but rejects a new inquiry", async () => {
    await call("thread.send", "", {
      text: "기존 신청 전 문의",
      collection: true,
    });
    const fresh = await service.session(
      randomBytes(32).toString("base64url"),
      true,
    );
    await pool.query(
      "UPDATE app_kv_rows SET data=jsonb_set(data,'{module_flags,event_hub}','false'::jsonb) WHERE table_name='app_settings'",
    );
    await call("thread.send", "", { text: "기존 문의 후속", collection: true });
    await call(
      "thread.send",
      owner,
      { text: "관리자 후속 답변" },
      undefined,
      true,
    );
    expect((await service.state(owner)).threads[0].messages).toHaveLength(3);
    await expect(
      call(
        "thread.send",
        "",
        { text: "새 문의", collection: true },
        undefined,
        false,
        fresh,
      ),
    ).rejects.toMatchObject({ code: "MODULE_DISABLED" });
  });
  it("CURRENT addresses keep original fields private and require a confirmed venue before event linking", async () => {
    const address={id:randomUUID(),venueId:"jack",label:"가상 매장",roadOriginal:"시험로 1 지하1층",parcelOriginal:"시험동 12(13)",floor:"B1",source:"합성 시험",receivedAt:now().toISOString()};
    await expect(call("venue.address.save","",address,0)).rejects.toMatchObject({code:"ADMIN"});
    await call("venue.address.save","",address,0,true);
    expect((await adminState()).venueDirectory?.items[0]).toEqual(address);
    expect(JSON.stringify(await service.state(owner))).not.toContain(address.roadOriginal);
    const e=(await adminState()).events.find(e=>e.id===eventId)!;
    await expect(call("event.address.select",eventId,{addressId:address.id},e.revision,true)).rejects.toMatchObject({code:"VENUE_ASSIGNMENT"});
    await call("event.address.select",eventId,{addressId:address.id,confirmedFirstRound:true},e.revision,true);
    const id=await create();
    expect(JSON.stringify(await service.state(owner))).not.toContain(address.parcelOriginal);
    await approved(id);
    expect((await service.state(owner)).applications.find(a=>a.id===id)?.venue?.addressRecord).toEqual({roadOriginal:address.roadOriginal,parcelOriginal:address.parcelOriginal,floor:address.floor});
    const stranger=await service.session(randomBytes(32).toString("base64url"),true);
    expect(JSON.stringify(await service.state(stranger))).not.toContain(address.roadOriginal);
    const unknown={...address,id:randomUUID(),venueId:null,label:"매장 연결 미확인"};
    await call("venue.address.save","",unknown,1,true);
    const updated=(await adminState()).events.find(e=>e.id===eventId)!;
    await expect(call("event.address.select",eventId,{addressId:unknown.id,confirmedFirstRound:true},updated.revision,true)).rejects.toMatchObject({code:"VENUE_ASSIGNMENT"});
    expect((await adminState()).venueDirectory?.items).toHaveLength(2);
  });
  it("CURRENT structured alternative accounts satisfy recruitment readiness while missing accounts, deadline or area remain blocked", async () => {
    let e=(await adminState()).events.find(e=>e.id===eventId)!;
    await call("event.recruitment",eventId,{enabled:false},e.revision,true);
    const accounts=[{id:randomUUID(),bank:"시험은행A",number:"0000-0000-0001"},{id:randomUUID(),bank:"시험은행B",number:"0000-0000-0002"}];
    const save = async (changes: Record<string, unknown>) => {
      e=(await adminState()).events.find(e=>e.id===eventId)!;
      await call("event.save",eventId,{...e,...changes},e.revision,true);
      return (await adminState()).events.find(e=>e.id===eventId)!;
    };
    for(const changes of [
      {account:"",accounts:[],deadline:event.deadline,area:event.area},
      {account:"",accounts,deadline:"",area:event.area},
      {account:"",accounts,deadline:event.deadline,area:""},
    ]) {
      e=await save(changes);
      await expect(call("event.recruitment",eventId,{enabled:true,immediate:true},e.revision,true)).rejects.toMatchObject({code:"CONFIG"});
      expect((await adminState()).events.find(e=>e.id===eventId)!.recruitment).toBe(false);
    }
    e=await save({account:"",accounts,deadline:event.deadline,area:event.area});
    await expect(call("event.recruitment",eventId,{enabled:true,immediate:true},e.revision,false)).rejects.toMatchObject({code:"ADMIN"});
    await call("event.recruitment",eventId,{enabled:true,immediate:true},e.revision,true);
    const ready=(await adminState()).events.find(e=>e.id===eventId)!;
    expect(ready.recruitment).toBe(true);
    expect(ready.account).toBe("");
    expect(ready.accounts).toEqual(accounts);
  });
  it("CURRENT alternative accounts require one choice and preserve the confirmed snapshot when administrator settings change", async () => {
    let e=(await adminState()).events.find(e=>e.id===eventId)!;
    const accounts=[{id:randomUUID(),bank:"시험은행A",number:"0000-0000-0001"},{id:randomUUID(),bank:"시험은행B",number:"0000-0000-0002"}];
    await call("event.save",eventId,{...e,accounts},e.revision,true);
    const id=await create();
    await call("application.consent",id,{consent},(await app(id)).revision);
    await expect(call("application.confirm",id,{},(await app(id)).revision)).rejects.toMatchObject({code:"ACCOUNT"});
    await call("application.account",id,{accountId:accounts[1].id},(await app(id)).revision);
    await call("application.confirm",id,{},(await app(id)).revision);
    await call("application.report",id,{},(await app(id)).revision);
    const before=await app(id);
    e=(await adminState()).events.find(e=>e.id===eventId)!;
    await call("event.save",eventId,{...e,accounts:[accounts[0]]},e.revision,true);
    expect((await app(id)).paymentAccount).toEqual(accounts[1]);
    expect((await service.state(owner)).applications.find(a=>a.id===id)?.billing?.account).toContain(accounts[1].number);
    await expect(call("application.account",id,{accountId:accounts[0].id},before.revision)).rejects.toMatchObject({code:"PAYMENT_LOCKED"});
    expect((await app(id)).payment).toBe("reported");
  });
  it("CURRENT Halloween server slots reject early/concurrent use and preserve a lost-response receipt after closing", async () => {
    const id=await create();await approved(id);await activate();
    await call("application.profile",id,{profile:fullProfile},(await app(id)).revision);
    await call("application.enter",id,{deviceSecret:"slot-isolated-device"},(await app(id)).revision);
    const midnight=Date.parse(event.date+"T00:00:00+09:00");
    const at=(ms:number)=>{service=new EventHubService(new HubStore(pool),"isolated-test-session-secret",()=>new Date(ms));};
    let lastRequest:Record<string,unknown>|undefined;
    for(const [slot,hour] of [23,24,24.5].entries()) {
      at(midnight+hour*3600000-1);
      await expect(call("application.draw",id,{slot},(await app(id)).revision)).rejects.toMatchObject({code:"CARD_LOCKED"});
      at(midnight+hour*3600000);
      const revision=(await app(id)).revision;
      const requests=[0,1].map(()=>({action:"application.draw",target:id,data:{slot},revision,requestId:randomUUID()}));
      const results=await Promise.allSettled(requests.map(request=>service.mutate(owner,false,request)));
      expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
      lastRequest=requests[results.findIndex(r=>r.status==="fulfilled")];
      expect((await app(id)).cards).toHaveLength(slot+1);
    }
    const saved=await app(id);at(midnight+25*3600000);
    await expect(call("application.draw",id,{},saved.revision)).rejects.toMatchObject({code:"EVENT_ENDED"});
    expect((await app(id)).cards).toEqual(saved.cards);
    // Existing receipts remain readable after the draw window, without another stock deduction.
    expect((await service.receipt(owner,false,lastRequest!.requestId as string)).saved).toBe(true);
  });
  it("companion drafts and one-time claims keep self/friend identities and permissions separate", async () => {
    const friend=await service.session('C'.repeat(64),true),other=await service.session('D'.repeat(64),true),draftId=randomUUID();
    const selfBefore=await service.store.transaction(tx=>tx.get('owner',owner));
    await call('companion.draft.save','',{eventId,id:draftId,basic:{nickname:'친구한명',birthYear:1995,location:'파주'},permissionToProvide:true},0);
    const own=await service.store.transaction(tx=>tx.get<import('./event-hub-service').HubOwner>('owner',owner));
    expect(own?.basicDrafts).toEqual((selfBefore as import('./event-hub-service').HubOwner).basicDrafts);
    expect((await service.state(owner)).applications).toHaveLength(0);
    const requestId=randomUUID();
    const invitation=await call('companion.invite',draftId,{eventId},1,false,owner,requestId);
    expect(typeof invitation.invitationToken).toBe('string');
    expect(JSON.stringify(await service.state(owner))).not.toContain('inviteHash');
    expect(await service.receipt(owner,false,requestId)).not.toHaveProperty('invitationToken');
    await expect(call('companion.claim','',{eventId,invitationToken:invitation.invitationToken,collection:true,version:HUB_CONSENT_VERSION})).rejects.toMatchObject({code:'COMPANION_SELF'});
    const outcomes=await Promise.allSettled([friend,other].map(who=>call('companion.claim','',{eventId,invitationToken:invitation.invitationToken,collection:true,version:HUB_CONSENT_VERSION},undefined,false,who)));
    expect(outcomes.filter(x=>x.status==='fulfilled')).toHaveLength(1);
    const winner=outcomes[0].status==='fulfilled'?friend:other;
    const friendState=await service.state(winner);
    expect(friendState.basicDrafts?.[eventId].basic.nickname).toBe('친구한명');
    const id=await create('친구한명',winner);
    expect((await app(id,winner)).owner).toBe(winner);
    expect((await app(id,winner)).sponsorOwner).toBe(owner);
    expect((await service.state(owner)).applications).toHaveLength(0);
    await expect(call('application.profile',id,{profile:fullProfile},(await app(id,winner)).revision)).rejects.toMatchObject({code:'APPLICATION'});
    await expect(call('application.enter',id,{deviceSecret:randomUUID()},(await app(id,winner)).revision)).rejects.toMatchObject({code:'APPLICATION'});
    await expect(call('application.draw',id,{},(await app(id,winner)).revision)).rejects.toMatchObject({code:'APPLICATION'});
    expect((await service.state(owner)).companionDrafts?.[eventId].items[0].claimedAt).toBeTruthy();
    expect(JSON.stringify((await service.state(winner)).applications)).not.toContain(owner);
  });
  it("resumes own saved application without decrypting an unrelated broken legacy nickname candidate",async()=>{
    const id=await create();
    await pool.query("INSERT INTO event_hub_records(kind,id,data) VALUES('application','zz-legacy-candidate',$1)",[JSON.stringify({id:'zz-legacy-candidate',owner:'unrelated-owner',eventId,rank:999,crypto_box:{v:1,iv:'invalid',tag:'invalid',ciphertext:'invalid'}})]);
    expect(await create()).toBe(id);
    expect((await service.store.transaction(tx=>tx.get<HubApplication>('application',id)))?.basic.nickname).toBe('테스터');
  });
  it("account changes before confirmation require re-selection without changing a confirmed payment", async () => {
    const account={id:randomUUID(),bank:"합성은행",number:"0000-0000-0042"};
    let e=(await adminState()).events.find(e=>e.id===eventId)!;
    await call("event.save",eventId,{...e,accounts:[account]},e.revision,true);
    const id=await create();
    await call("application.consent",id,{consent},(await app(id)).revision);
    await call("application.account",id,{accountId:account.id},(await app(id)).revision);
    e=(await adminState()).events.find(e=>e.id===eventId)!;
    await call("event.save",eventId,{...e,accounts:[{...account,number:"0000-0000-0043"}]},e.revision,true);
    await expect(call("application.confirm",id,{},(await app(id)).revision)).rejects.toMatchObject({code:"ACCOUNT_CHANGED"});
    expect((await app(id)).confirmedAt).toBeUndefined();
    await call("application.account",id,{accountId:account.id},(await app(id)).revision);
    await call("application.confirm",id,{},(await app(id)).revision);
    expect((await app(id)).paymentAccount?.number).toBe("0000-0000-0043");
  });
  it("ordered logo links persist across saves, explicit empty differs from defaults, originals remain", async () => {
    const current=async()=>(await adminState()).events.find(e=>e.id===eventId)!;
    await expect(call("event.logo.order",eventId,{items:[{builtinId:"jack"}]},(await current()).revision)).rejects.toMatchObject({code:"ADMIN"});
    await expect(call("event.logo.order",eventId,{items:[{builtinId:"jack"}]},(await current()).revision,true)).rejects.toMatchObject({code:"LOGO_PUBLIC_CONFIRM"});
    await call("event.logo.order",eventId,{items:[{builtinId:"jack"},{builtinId:"on_top"}],publicConfirmed:true},(await current()).revision,true);
    await call("event.logo.order",eventId,{items:[{builtinId:"on_top"},{builtinId:"jack"}]},(await current()).revision,true);
    const e=await current();await call("event.save",eventId,{...e,promotionLogos:[]},e.revision,true);
    expect((await current()).promotionLogos?.map(v=>v.builtinId)).toEqual(["on_top","jack"]);
    await call("event.logo.order",eventId,{items:[]},(await current()).revision,true);
    expect((await service.state(owner)).events.find(e=>e.id===eventId)?.promotionLogos).toEqual([]);
    await call("event.logo.order",eventId,{items:null},(await current()).revision,true);
    expect((await current()).promotionLogos).toBeUndefined();
  });
  it("verified boss uses actual participant API only for tagged events; approval, identity and global locks remain", async () => {
    service=new EventHubService(new HubStore(pool),"isolated-test-session-secret",()=>new Date("2026-10-29T10:00:00Z"));
    const modeService=new EventTestModeService(service.store);
    const mode=(await modeService.state(true)).mode;
    await service.store.transaction(tx=>tx.put("laboratory-mode","global",{...mode,enabled:true,publicAdmissionOpen:false,admissionOpenedAt:null}));
    const settingsBefore=(await pool.query("SELECT data FROM app_kv_rows WHERE table_name='app_settings'")).rows;
    await expect(service.prepareBossParticipantEvents()).rejects.toMatchObject({code:"BOSS_AUTH"});
    const ids=await withVerifiedBossParticipation(()=>service.prepareBossParticipantEvents());
    expect((await withVerifiedBossParticipation(()=>service.prepareBossParticipantEvents())).ids).toEqual(ids.ids);
    expect((await service.state(owner)).events.some(e=>e.bossTestOnly)).toBe(false);
    const run=<T,>(fn:()=>T)=>withVerifiedBossParticipation(fn);
    await expect(run(()=>create())).rejects.toMatchObject({code:"TEST_MODE"});
    const id=String((await run(()=>call("application.basic","",{eventId:ids.ids[1],basic:basic("보스시험")}))).id);
    expect((await app(id)).bossTestOnly).toBe(true);
    await expect(call("application.consent",id,{consent},(await app(id)).revision)).rejects.toMatchObject({code:"BOSS_AUTH"});
    await run(()=>complete(id));
    await expect(run(()=>call("application.enter",id,{deviceSecret:randomUUID()},1))).rejects.toMatchObject({code:"REVISION"});
    await run(async()=>{await call("admin.application.free",id,{},(await app(id)).revision,true);});
    await expect(run(async()=>call("application.enter",id,{deviceSecret:randomUUID()},(await app(id)).revision))).rejects.toMatchObject({code:"PROFILE_INCOMPLETE"});
    await run(async()=>call("application.profile",id,{profile:fullProfile},(await app(id)).revision));
    const result=await run(async()=>call("application.enter",id,{deviceSecret:randomUUID()},(await app(id)).revision));
    expect(result.profile).toMatchObject({event_hub_application:id,boss_test_event:ids.ids[1]});
    const entered=await app(id);
    expect(entered.cycleId).toBe(`boss-test:${ids.ids[1]}`);
    await expect(run(()=>service.store.transaction(tx=>assertOnsiteSocialWrite(tx,entered.profileId!)))).resolves.toBeUndefined();
    const normal=randomUUID();await pool.query("INSERT INTO app_kv_rows(table_name,row_id,data) VALUES('profiles',$1,$2)",[normal,JSON.stringify({id:normal,nickname:"일반보존"})]);
    await expect(service.store.transaction(tx=>assertBossTestSocialScope(tx,"likes",{liker_id:entered.profileId,liked_id:normal}))).rejects.toMatchObject({code:"BOSS_TEST_SCOPE"});
    await expect(service.store.transaction(tx=>assertBossTestSocialScope(tx,"profile_views",{viewer_id:entered.profileId,viewed_id:normal}))).rejects.toMatchObject({code:"BOSS_TEST_SCOPE"});
    await expect(service.store.transaction(tx=>assertBossTestSocialScope(tx,"group_chats",{id:randomUUID(),name:"운영 자동방"},entered.profileId))).rejects.toMatchObject({code:"BOSS_TEST_SCOPE"});
    await run(async()=>call("admin.application.revoke",id,{reason:"격리 취소검사"},(await app(id)).revision,true));
    await expect(run(()=>service.store.transaction(tx=>assertOnsiteSocialWrite(tx,entered.profileId!)))).rejects.toMatchObject({code:"EVENT_APPROVAL_REVOKED"});
    expect((await pool.query("SELECT data FROM app_kv_rows WHERE table_name='app_settings'")).rows).toEqual(settingsBefore);
    expect((await modeService.state(true)).mode).toMatchObject({enabled:true,publicAdmissionOpen:false});
    expect((await app(id)).profileId).toBe(entered.profileId);
  });

});

suite('private PostgreSQL roles and RLS compatibility',()=>{
 it('enables RLS even when managed PostgreSQL has no Supabase anon/authenticated roles',async()=>{
  const {buildPublicTableRlsSql}=await import('./db-table-policy');
  const pool=new pg.Pool({connectionString:url,max:1});
  try{
   await pool.query(buildPublicTableRlsSql());
   const row=(await pool.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.event_hub_records'::regclass")).rows[0];
   expect(row.relrowsecurity).toBe(true);
  }finally{await pool.end();}
 });


});
