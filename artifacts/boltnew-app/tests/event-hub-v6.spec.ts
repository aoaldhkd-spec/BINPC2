import {eventCycleMilestones} from "../../../lib/api-zod/src/event-cycle-clock";
import {
  test,
  expect,
  type APIRequestContext,
  type BrowserContext,
  type Page,
  request as apiRequest,
} from "@playwright/test";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { EventLaboratoryState } from "../../../lib/api-zod/src/event-test-mode";
import type { LabSnapshot } from "../src/event-hub/event-laboratory-store";
const token = process.env.HUB_E2E_ADMIN_TOKEN;
if (!token)
  throw new Error("Missing isolated local administrator test binding");
const adminHeaders = { "x-admin-token": token };
let eventId: string;
const suffix = String(Date.now()).slice(-6);
async function command(
  request: APIRequestContext,
  action: string,
  target = "",
  data: Record<string, unknown> = {},
  revision?: number,
) {
  const r = await request.post("/api/event-hub/mutate", {
    headers: adminHeaders,
    data: { action, target, data, revision, requestId: randomUUID() },
  });
  expect(r.status()).toBe(200);
  return r.json();
}
async function fillBasicSteps(page: Page, values: [string, string, string, string, string]) {
  await page.getByRole("button", { name: "신청하기", exact: true }).click();
  await page.getByRole("button", { name: "혼자 신청", exact: true }).click();
  await page.getByLabel("[필수] 위 개인정보").check();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByLabel("닉네임", { exact: true }).fill(values[0]);
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByLabel("태어난 년도", { exact: true }).selectOption(values[1]);
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByLabel("도시", { exact: true }).selectOption(values[2] === "부산" ? "부산" : "서울");
  if (values[2] === "부산") await page.getByLabel("부산 구", { exact: true }).selectOption("부산진구");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByLabel("연락용 전화번호", { exact: false })).toHaveCount(0);
  await page.getByLabel("실제 은행 입금 시 보내는 분 이름", { exact: true }).fill(values[4]);
}
async function application(request: APIRequestContext, id: string) {
  const r = await request.get("/api/event-hub/admin", {
    headers: adminHeaders,
  });
  expect(r.status()).toBe(200);
  return (await r.json()).applications.find((a: { id: string }) => a.id === id);
}
// Only dedicated loopback fixtures may explicitly reopen after clean OFF for legacy cases.
async function withLegacyLaboratory(request: APIRequestContext, page: Page, run: () => Promise<void>) {
  const write = async (operation: Record<string, unknown>): Promise<EventLaboratoryState> => {
    const read = await request.get("/api/event-hub/laboratory", { headers: adminHeaders });
    expect(read.status()).toBe(200);
    const current = await read.json() as EventLaboratoryState;
    const response = await request.post("/api/event-hub/laboratory", {
      headers: adminHeaders,
      data: { ...operation, generation: current.mode.generation, revision: current.mode.revision },
    });
    expect(response.status()).toBe(200);
    return response.json();
  };
  try {
    expect((await write({ operation: "mode", enabled: true })).mode.enabled).toBe(true);
    await run();
  } finally {
    // Unmount the laboratory before resetting its snapshot namespace so no delayed UI save races cleanup.
    await page.goto("/events");
    const clean = await write({ operation: "reset" });
    const off = await write({ operation: "mode", enabled: false, resetGeneration: clean.mode.generation });
    expect(off.mode.enabled).toBe(false);
    expect(off.mode.publicAdmissionOpen).toBe(false);
    expect(off.mode.dirty).toBe(false);
    expect(off.workspaces).toEqual({});
    expect((await write({ operation: "admission", open: true, confirmOpen: true })).mode.publicAdmissionOpen).toBe(true);
  }
}
// Every browser page is denied non-local network access, including popups and media.
async function restrictToLocal(context: BrowserContext) {
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (
      url.protocol === "http:" &&
      url.hostname === "127.0.0.1" &&
      url.port === new URL(process.env.HUB_E2E_BASE_URL!).port
    )
      return route.continue();
    return route.abort("blockedbyclient");
  });
}
test.beforeEach(async ({ context },testInfo) => {
 await restrictToLocal(context);
 const raw=process.env.HUB_E2E_CLOCK_OFFSET_MS;
 if(raw&&!testInfo.title.includes('theme expires')){const offset=Number(raw);if(!Number.isFinite(offset)||Math.abs(offset)>365*86400000)throw Error("Invalid explicit internal browser clock");
  await context.addInitScript((value)=>{const NativeDate=Date;class FixtureDate extends NativeDate{constructor(...args:unknown[]){super(...(args.length?args:[NativeDate.now()+value]) as [string]);}static now(){return NativeDate.now()+value;}}globalThis.Date=FixtureDate as DateConstructor;},offset);
 }
});
test.beforeAll(async ({ request }) => {
  // The focused maintenance-mode regression must never seed operational events or stock.
  if (process.env.HUB_E2E_TEST_MODE_ONLY === "1") return;
  const ready=await (await request.get("/api/db/ready")).json();
  const milestones=eventCycleMilestones(String(ready.settings?.event_cycle_started_at??""));
  const date = new Date((milestones?.grantAt.getTime()??Date.now()) + 9 * 3600000).toISOString().slice(0, 10);
  const e = await command(request, "event.save", "", {
    title: `격리 V6 시험 ${suffix}`,
    date,
    start: "22:00",
    end: "01:00",
    area: "격리 테스트 지역",
    address: "승인자 전용 테스트 7층",
    fee: 50000,
    account: "격리 시험 계좌",
    deadline: "테스트 행사 전",
    notice: "격리 자동시험 전용입니다. 운영 모집이 아닙니다.",
    cardsEnabled: true,
    benefitsEnabled: true,
    benefits: [
      {
        from: 1,
        to: 3,
        type: "discount",
        value: 10000,
        label: "선착순 1~3등 혜택",
      },
    ],
  });
  eventId = e.id;
  await command(request, "event.recruitment", eventId, { enabled: true }, 1);
  await command(request, "stock.save", "", {
    eventId,
    label: "소품 2번",
    add: 3,
  });
});
test("actual browser + API + PostgreSQL: saved stages, payment recovery, private profile and exactly-once entry", async ({
  page,
  request,
  browser,
}, testInfo) => {
  // This case performs the entire six-stage flow plus multiple mobile fault
  // injections. Individual response/UI assertions retain their own deadlines.
  test.setTimeout(120000);
  // At midnight KST the real rainbow guide legitimately covers the coach.
  // Acknowledge it through its real button; do not force-click or seed a seen key.
  await page.addLocatorHandler(
    page.getByRole("dialog", { name: "🌈 무지개하트가 열렸어요", exact: true }),
    async (dialog) => { await dialog.getByRole("button", { name: "확인했어요", exact: true }).click(); },
    { times: 3 },
  );
  await page.goto(`/events/e/${eventId}`);
  await fillBasicSteps(page, [`검증${suffix.slice(-4)}`, "1995", "부산", "01000000000", "격리테스트"]);
  await expect(page.getByText("격리 시험 계좌", { exact: true })).toHaveCount(
    0,
  );
  await page.screenshot({
    path: testInfo.outputPath("00-actual-basic-privacy.png"),
    fullPage: true,
  });
  let release!: () => void;
  const delay = new Promise<void>((r) => {
    release = r;
  });
  await page.route("**/api/event-hub/mutate", async (route) => {
    if (route.request().postDataJSON().action === "application.basic")
      await delay;
    await route.continue();
  });
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "저장 중…", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("00-actual-saving.png"),
    fullPage: true,
  });
  release();
  await expect(page).toHaveURL(/\/events\/a\//);
  await page.unroute("**/api/event-hub/mutate");
  const id = page.url().split("/").pop()!;
  const code = await page.evaluate(() =>
    localStorage.getItem("binpc2_event_recovery_v6"),
  );
  expect(code?.length).toBeGreaterThanOrEqual(43);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "공지 확인·동의" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("00-actual-notice-before-fee.png"),
    fullPage: true,
  });
  await page.getByLabel("필수 안내를 모두 확인하고 동의합니다", { exact: true }).check();
  let failed = false;
  await page.route("**/api/event-hub/mutate", async (route) => {
    if (
      !failed &&
      route.request().postDataJSON().action === "application.consent"
    ) {
      failed = true;
      await route.abort("internetdisconnected");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "동의하고 다음" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "공지 확인·동의" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("[필수] 행사 공지를 확인했습니다"),
  ).toBeChecked();
  await page.screenshot({
    path: testInfo.outputPath("01-save-failure-input-retained.png"),
    fullPage: true,
  });
  await page.unroute("**/api/event-hub/mutate");
  await page.getByRole("button", { name: "동의하고 다음" }).click();
  await expect(
    page.getByRole("heading", { name: "회비 확인 및 신청 확정" }),
  ).toBeVisible();
  await expect(page.getByText("최종 납부 금액 40,000원")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("01-actual-saved-fee.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "금액 확인 후 신청 확정" }).click();
  await expect(
    page.getByRole("heading", { name: "👤 내 프로필" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "입금했어요 (신고)" }).click();
  await expect(
    page.getByText("입금 신고 · 승인 대기", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("입금 신고 · 승인 대기", { exact: true }),
  ).toBeVisible();
  expect((await application(request, id)).payment).toBe("reported");
  let a = await application(request, id);
  const approvalContext = await browser.newContext({
    baseURL: process.env.HUB_E2E_BASE_URL,
    recordVideo: { dir: testInfo.outputPath("approval-video") },
  });
  await restrictToLocal(approvalContext);
  await approvalContext.addInitScript((value) => {
    localStorage.setItem("admin_token_v1", value);
    localStorage.setItem(
      "admin_session_v1",
      JSON.stringify({ phone: "01000000000", authedAt: Date.now() }),
    );
  }, token!);
  const approvalPage = await approvalContext.newPage();
  await approvalPage.goto("/admin");
  await approvalPage
    .getByRole("button", { name: "🎉 술번개", exact: true })
    .click();
  await approvalPage.getByLabel("관리할 행사").selectOption(eventId);
  await approvalPage
    .getByRole("button", { name: "신청·입금", exact: true })
    .click();
  const approvalCard = approvalPage
    .locator("section")
    .filter({ has: approvalPage.getByText(`신청번호 ${id}`, { exact: true }) });
  approvalPage.once("dialog", (dialog) => dialog.accept());
  await approvalCard
    .getByRole("button", { name: "입금 승인", exact: true })
    .click();
  await expect(approvalCard.getByText(/입금 확인 완료/)).toBeVisible();
  await approvalPage.screenshot({
    path: testInfo.outputPath("01-actual-admin-payment-approved.png"),
    fullPage: true,
  });
  await approvalContext.close();
  a = await application(request, id);
  await command(
    request,
    "admin.application.attendance",
    id,
    { status: "confirmed" },
    a.revision,
  );
  a = await application(request, id);
  await command(
    request,
    "admin.application.checkin",
    id,
    { checked: true },
    a.revision,
  );
  await page.reload();
  await expect(
    page.getByText("관리자 입금 확인 완료", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("장소: 승인자 전용 테스트 7층")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "입금했어요 (신고)" }),
  ).toHaveCount(0);
  const blocked = await page.request.post("/api/event-hub/mutate", {
    data: {
      action: "application.enter",
      target: id,
      revision: (await application(request, id)).revision,
      data: { deviceSecret: "e2e-device" },
      requestId: randomUUID(),
    },
  });
  expect(blocked.status()).toBe(403);
  expect((await blocked.json()).code).toBe("PROFILE_INCOMPLETE");
  await page.screenshot({
    path: testInfo.outputPath("02-actual-incomplete-entry-blocked.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "프로필 미리 설정하기" }).click();
  await page.screenshot({
    path: testInfo.outputPath("02-actual-profile-wizard.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "ENFP", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "관심사", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "이어서 설정하기" }).click();
  await expect(
    page.getByRole("heading", { name: "관심사", exact: true }),
  ).toBeVisible();
  const known = await application(request, id);
  expect(known.profile.mbti).toBe("ENFP");
  // Complete the remaining existing profile picker fields through its actual controls.
  await page.getByRole("button", { name: "여행", exact: true }).click();
  await page.getByRole("button", { name: "쇼핑", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "성향", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "올", exact: true }).click();
  await page
    .getByRole("checkbox", {
      name: "[필수] 개인정보 수집 및 이용 동의",
      exact: true,
    })
    .check();
  await page
    .getByRole("checkbox", {
      name: "[필수] 개인정보 제3자 제공 동의",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "알림 없이 계속", exact: true })
    .click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "프로필 저장 완료" }).click();
  await expect(
    page.getByRole("heading", { name: "👤 내 프로필" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("02-approved-complete-waiting-room.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("03-approved-mobile-waiting-room.png"),
    fullPage: true,
  });
  const other = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await restrictToLocal(other);
  const p2 = await other.newPage();
  await p2.goto("/events");
  await p2.getByText("이전 신청 복구 / 기존 신청자 로그인").click();
  await p2.getByText("다른 방법으로 복구", { exact: true }).click();
  await p2.getByLabel("개인 복구코드", { exact: true }).fill(code!);
  await p2.getByRole("button", { name: "기존 신청 복구", exact: true }).click();
  await expect(p2.getByRole("heading", { name: "내 신청 목록" })).toBeVisible();
  await p2
    .getByRole("button")
    .filter({ hasText: `격리 V6 시험 ${suffix}` })
    .first()
    .click();
  await expect(
    p2.getByText("관리자 입금 확인 완료", { exact: true }),
  ).toBeVisible();
  expect((await application(request, id)).id).toBe(id);
  await other.close();
  await page
    .getByRole("button", { name: "술번개 입장하기", exact: true })
    .click();
  await expect(page).toHaveURL(/127\.0\.0\.1:300[12356]\/?$/);
  await expect
    .poll(async () => (await application(request, id)).profileId)
    .toBeTruthy();
  const profileId = (await application(request, id)).profileId;
  const lookup = await request.post("/api/db/op", {
    data: {
      table: "profiles",
      op: "select",
      filters: [{ col: "id", op: "eq", val: profileId }],
      adminToken: token,
    },
  });
  expect(lookup.status()).toBe(200);
  const pin = (await lookup.json()).data[0].pin_code;
  const pinOnly = await request.post("/api/db/by-pin", {
    data: { pin, nickname: `검증${suffix.slice(-4)}` },
  });
  expect(pinOnly.status()).toBe(403);
  const oldDevice = await request.post("/api/db/auth/login", {
    data: { userId: profileId, pinCode: pin, deviceSecret: "different-device" },
  });
  expect(oldDevice.status()).toBe(403);
  expect((await oldDevice.json()).code).toBe("EVENT_RECOVERY_REQUIRED");

  await page.goto(`/events/a/${id}`);
  await page
    .getByRole("button", { name: "술번개 입장하기", exact: true })
    .click();
  await expect(page).toHaveURL(/127\.0\.0\.1:300[12356]\/?$/);
  expect((await application(request, id)).profileId).toBe(profileId);
  // A cold CI navigation can show the midnight guide while the participant shell
  // loads. Acknowledge the real dialog before asserting the underlying menu,
  // instead of charging its click handler to the menu's default 5s assertion.
  // Keep the handler above for later re-entry; never force-click or seed seen state.
  const rainbowGuide = page.getByRole("dialog", { name: "🌈 무지개하트가 열렸어요", exact: true });
  await page.removeLocatorHandler(rainbowGuide);
  if (await rainbowGuide.isVisible()) {
    await rainbowGuide.getByRole("button", { name: "확인했어요", exact: true }).click({ timeout: 15000 });
    await expect(rainbowGuide).toBeHidden();
  }
  await page.addLocatorHandler(rainbowGuide, async (dialog) => {
    await dialog.getByRole("button", { name: "확인했어요", exact: true }).click();
  }, { times: 3 });
  await expect(page.getByRole("navigation",{name:"참여자 메뉴"})).toBeVisible({ timeout: 15000 });
  if(await page.getByTestId("first-entry-coach").isVisible()) await page.getByTestId("first-entry-coach").getByRole("button",{name:"건너뛰기",exact:true}).click();
  await page.getByRole("navigation", { name: "참여자 메뉴" }).getByRole("button", { name: "설정", exact: true }).click();
  const avatarSettings = page.getByRole("button", { name: /사진 · 아바타 · 배경/ });
  if (!(await avatarSettings.isVisible())) await page.getByRole("button", { name: "✏️ 프로필 편집", exact: true }).click();
  await avatarSettings.click();
  await page.getByRole("button", { name: "🎃 할로윈", exact: true }).click();
  await expect(page.locator('[data-coach="settings-avatar"] .grid img[src*="/avatars/av3"]')).toHaveCount(30);
  await page.getByRole("button", { name: "호박 DJ 호박 DJ", exact: true }).click();
  await expect.poll(async () => {
    const r = await request.post("/api/db/op", { data: { table: "profiles", op: "select", filters: [{ col: "id", op: "eq", val: profileId }], adminToken: token } });
    return (await r.json()).data[0].photo_url;
  }).toBe("/avatars/av361.webp");
  await page.reload();
  await page.getByRole("button",{name:"하트, 채팅",exact:true}).click();
  await expect(page.getByRole("link", { name: /행사 카드/ })).toHaveAttribute("href", "/events/cards");
  const myAvatar = page.getByRole("main").getByRole("img", { name: `검증${suffix.slice(-4)}`, exact: true });
  await expect(myAvatar).toBeVisible();
  await expect(myAvatar).toHaveAttribute("src", /\/avatars\/av361\.webp/);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("binpc-seasonal-skin-changed", { detail: false })));
  await expect(page.locator("html")).not.toHaveAttribute("data-seasonal-skin", "halloween");
  await expect(myAvatar).toBeVisible();
  await expect(myAvatar).toHaveAttribute("src", /\/avatars\/av361\.webp/);
  await page.screenshot({ path: testInfo.outputPath("v12-avatar-theme-off-preserved.png"), fullPage: true });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("binpc-seasonal-skin-changed", { detail: true })));
  await page.getByRole("button",{name:"하트, 채팅",exact:true}).click();
  await expect(page.getByRole("group",{name:"내 고유번호",exact:true})).toBeVisible();
  const originalIdentity=await page.evaluate(()=>localStorage.getItem("matching_app_user_id"));
  // Real isolated social records: normal participant writes still pass the real ownership guards.
  const peerId=randomUUID();let chatId='';const profileRow={...(await lookup.json()).data[0],id:peerId,nickname:`복구${suffix.slice(-3)}`,phone:'01000009998',pin_code:'9999'};
  for (const key of Object.keys(profileRow)) if (key.startsWith("event_hub_")) delete profileRow[key];
  const peerSeed=await request.post('/api/db/op',{data:{table:'profiles',op:'insert',payload:profileRow,adminToken:token,selectAfterWrite:true}});expect(peerSeed.status()).toBe(200);expect((await peerSeed.json()).error).toBeFalsy();
  const socialWrite=await page.evaluate(async({me,peer,chat})=>{const {supabase}=await import('/src/lib/supabase.ts');const sent=await supabase.from('likes').insert({liker_id:me,liked_id:peer,status:'pending',heart_type:'red'});return {error:sent.error?.message};},{me:profileId,peer:peerId,chat:chatId});expect(socialWrite.error).toBeFalsy();
  const chatSeed=await page.evaluate(async({me,peer})=>{const {supabase}=await import('/src/lib/supabase.ts');const r=await supabase.from('chats').insert({user1_id:me,user2_id:peer}).select().single();return {id:r.data?.id,error:r.error?.message};},{me:profileId,peer:peerId});expect(chatSeed.error).toBeFalsy();chatId=String(chatSeed.id);
  const messageWrite=await page.evaluate(async({me,chat})=>{const {supabase}=await import('/src/lib/supabase.ts');const r=await supabase.from('messages').insert({chat_id:chat,sender_id:me,content:'같은 주기 복구 검증 대화'});return {error:r.error?.message};},{me:profileId,chat:chatId});expect(messageWrite.error).toBeFalsy();
  async function socialSnapshot(){const result=[];for(const [table,col,val] of [['likes','liker_id',profileId],['messages','chat_id',chatId]]){const r=await request.post('/api/db/op',{data:{table,op:'select',filters:[{col,op:'eq',val}],adminToken:token}});expect(r.status()).toBe(200);const body=await r.json();expect(body.error).toBeFalsy();result.push((body.data??[]).map((v:{id:string})=>v.id).sort());}return result;}
  const socialBefore=await socialSnapshot();expect(socialBefore.every(ids=>ids.length>0)).toBe(true);

  // Same cookie/bearer remains valid; revoke only new social actions of this application.
  const cancelAt = performance.now();
  await command(request, 'admin.application.revoke', id, { reason: '격리 권한회수 검사' }, (await application(request,id)).revision);
  const cancelledSocial = await page.evaluate(async ({ me, peer, chat }) => {
    const {supabase}=await import('/src/lib/supabase.ts');
    const message=await supabase.from('messages').insert({chat_id:chat,sender_id:me,content:'취소 후 차단되어야 함'});
    const heart=await supabase.from('likes').insert({liker_id:me,liked_id:peer,status:'pending',heart_type:'blue'});
    const old=await supabase.from('messages').select('*').eq('chat_id',chat);
    const tamper=await supabase.from('profiles').update({event_hub_application:null}).eq('id',me);
    return {message:message.error?.code,heart:heart.error?.code,old:old.data?.length,tamper:tamper.error?.code};
  },{me:profileId,peer:peerId,chat:chatId});
  expect(cancelledSocial).toMatchObject({message:'EVENT_APPROVAL_REVOKED',heart:'EVENT_APPROVAL_REVOKED',tamper:'EVENT_LINK_PROTECTED'});
  expect(cancelledSocial.old).toBeGreaterThan(0);
  expect(await socialSnapshot()).toEqual(socialBefore);
  expect(await page.evaluate(()=>localStorage.getItem('matching_app_user_id'))).toBe(originalIdentity);
  await page.screenshot({path:testInfo.outputPath('v12-revoked-session-records-preserved.png'),fullPage:true});
  await testInfo.attach('approval-cancellation-same-session', { body:JSON.stringify({blocked:cancelledSocial,elapsedMs:Math.round(performance.now()-cancelAt),profilePreserved:true,recordsUnchanged:true}),contentType:'application/json'});
  await command(request,'admin.application.payment',id,{status:'approved',bankChecked:true},(await application(request,id)).revision);
  const resumed=await page.evaluate(async({me,chat})=>{const {supabase}=await import('/src/lib/supabase.ts');const r=await supabase.from('messages').insert({chat_id:chat,sender_id:me,content:'재승인 후 같은 세션'});return r.error?.message;},{me:profileId,chat:chatId});
  expect(resumed).toBeFalsy();
  const socialAfterReapproval=await socialSnapshot();

  let profileReadMode="empty";
  const partialProfileRead=async (route: import("@playwright/test").Route)=>{
    const body=route.request().postDataJSON();
    if(body?.table==="profiles"&&body?.op==="select"){
      if(profileReadMode==="failure")return route.fulfill({status:503,json:{data:null,error:{code:"TEMPORARY"}}});
      return route.fulfill({status:200,json:{data:[],error:null}});
    }
    return route.continue();
  };
  await page.route("**/api/db/op",partialProfileRead);
  await page.reload();
  await expect(page.getByRole("navigation",{name:"참여자 메뉴"})).toBeVisible();
  if(await page.getByTestId("first-entry-coach").isVisible()) await page.getByTestId("first-entry-coach").getByRole("button",{name:"건너뛰기",exact:true}).click();
  await page.getByRole("button",{name:"하트, 채팅",exact:true}).click();
  expect(await page.evaluate(()=>localStorage.getItem("matching_app_user_id"))).toBe(originalIdentity);
  await expect(page.getByRole("group",{name:"내 고유번호",exact:true})).toBeVisible();
  await page.evaluate(()=>{
    Object.defineProperty(document,"visibilityState",{configurable:true,value:"hidden"});
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document,"visibilityState",{configurable:true,value:"visible"});
    document.dispatchEvent(new Event("visibilitychange"));
  });
  profileReadMode="failure";
  await page.reload();
  await expect(page.getByRole("navigation",{name:"참여자 메뉴"})).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem("matching_app_user_id"))).toBe(originalIdentity);
  await page.screenshot({path:testInfo.outputPath("mobile-profile-resume-api-unavailable.png"),fullPage:true});
  await page.unroute("**/api/db/op",partialProfileRead);
  await page.getByRole('button',{name:'하트, 채팅',exact:true}).click();
  await page.context().setOffline(true);
  const disconnected=await page.evaluate(async()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('offline'));document.dispatchEvent(new Event('visibilitychange'));const {supabase}=await import('/src/lib/supabase.ts');const r=await supabase.from('profiles').select('*');return !!r.error;});expect(disconnected).toBe(true);
  expect(await page.evaluate(()=>localStorage.getItem('matching_app_user_id'))).toBe(originalIdentity);
  // The full-site access check hides cached private screens offline without clearing profile state.
  await expect(page.getByRole('group',{name:'내 고유번호',exact:true,includeHidden:true})).toBeAttached();
  await expect(page.getByRole('group',{name:'내 고유번호',exact:true,includeHidden:true})).toBeHidden();
  await expect(page.getByText('접근 권한을 확인하지 못했습니다.')).toBeVisible();
  await page.context().setOffline(false);await page.reload();
  await expect(page.getByRole('navigation',{name:'참여자 메뉴'})).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('matching_app_user_id'))).toBe(originalIdentity);
  expect(await socialSnapshot()).toEqual(socialAfterReapproval);
  expect((await application(request,id)).profileId).toBe(profileId);
  await page.goto(`/events/a/${id}`);
  await expect(page.getByRole("button", { name: "카드 한 장 뽑기", exact: true })).toHaveCount(0);
  await page.goto("/events/cards");
  for (let count = 1; count <= 3; count++) {
    await page
      .getByRole("button", { name: "카드 한 장 뽑기", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: `🎃 행사 카드 · ${count}/3` }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole("button", { name: "카드 한 장 뽑기", exact: true }),
  ).toBeDisabled();
  const cards = (await application(request, id)).cards;
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "🎃 행사 카드 · 3/3" }),
  ).toBeVisible();
  expect((await application(request, id)).cards).toEqual(cards);
  const fourth = await page.request.post("/api/event-hub/mutate", {
    data: {
      action: "application.draw",
      target: id,
      revision: (await application(request, id)).revision,
      requestId: randomUUID(),
    },
  });
  expect(fourth.status()).toBe(409);
  expect((await fourth.json()).code).toBe("CARD_LIMIT");
  await page.screenshot({
    path: testInfo.outputPath("04-actual-three-cards-restored.png"),
    fullPage: true,
  });
  const rewardContext = await browser.newContext({
    baseURL: process.env.HUB_E2E_BASE_URL,
    recordVideo: { dir: testInfo.outputPath("reward-video") },
  });
  await restrictToLocal(rewardContext);
  await rewardContext.addInitScript((value) => {
    localStorage.setItem("admin_token_v1", value);
    localStorage.setItem(
      "admin_session_v1",
      JSON.stringify({ phone: "01000000000", authedAt: Date.now() }),
    );
  }, token!);
  try {
    const admin = await rewardContext.newPage();
    await admin.goto("/admin");
    await admin.getByRole("button", { name: "🎉 술번개", exact: true }).click();
    await admin.getByLabel("관리할 행사").selectOption(eventId);
    await admin.getByRole("button", { name: "현장·상품", exact: true }).click();
    const card = admin
      .locator("section")
      .filter({ has: admin.getByText(`신청번호 ${id}`, { exact: true }) });
    await card
      .getByRole("button", { name: "하리보 1개 지급", exact: true })
      .click();
    await expect(
      card.getByRole("button", { name: "하리보 지급 완료", exact: true }),
    ).toBeDisabled();
    expect((await application(request, id)).candy).toBe("haribo");
    await expect(card.getByRole("button", { name: /하리보 [AB] 지급/ })).toHaveCount(0);
    const winning = cards.find(
      (c: { prize: string }) => c.prize !== "다음 기회에",
    );
    if (winning) {
      await card
        .getByRole("button", { name: "지급 완료", exact: true })
        .first()
        .click();
      await expect.poll(async () => (await application(request, id)).prizesGiven.length).toBe(1);
      const fulfilled = card.locator(`[data-card-id="${winning.id}"]`);
      await expect(fulfilled.getByRole("status")).toHaveText("지급 완료");
      await expect(fulfilled.getByRole("button", { name: "지급 완료", exact: true })).toHaveCount(0);
    }
    await card.screenshot({
      path: testInfo.outputPath("04-actual-admin-rewards.png"),
    });
  } finally {
    await rewardContext.close();
  }
});

test("mobile/tablet/desktop layouts and administrator sandbox remain isolated", async ({
  page,
  request,
}, testInfo) => {
  // Twenty independent theme/viewport combinations plus the real administrator
  // lab. Keep each interaction's deadline; allow the complete capture matrix to
  // finish on the retained, accumulated fixture database.
  test.setTimeout(120000);
  const originalReady = await (await request.get("/api/db/ready")).json();
  const rawFlags = originalReady.settings.module_flags;
  const originalFlags = typeof rawFlags === "string" ? JSON.parse(rawFlags) : rawFlags;
  const setSkin = async (enabled: boolean) => {
    const response = await request.post("/api/db/rpc/admin_update_settings", {data: {adminToken: token, p_payload: {module_flags: {...originalFlags, seasonal_landing: enabled}}}});
    expect(response.status()).toBe(200);
    expect((await response.json()).error).toBeFalsy();
  };
  try {
  for (const skin of [false, true]) {
    await setSkin(skin);
  for (const dark of [false, true]) {
    for (const width of [320, 360, 390, 768, 1024]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/events");
      await page.evaluate(
        (value) => localStorage.setItem("dark_mode", value),
        dark ? "1" : "0",
      );
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "술번개 신청", exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      ).toBe(true);
      if (skin) await expect(page.locator("html")).toHaveAttribute("data-seasonal-skin", "halloween");
      else await expect(page.locator("html")).not.toHaveAttribute("data-seasonal-skin");
      const inquiry = page.getByRole("button", { name: /💬 관리자 문의/ });
      await expect(inquiry).toBeVisible();
      const rect = await inquiry.boundingBox();
      expect(rect?.x).toBeGreaterThanOrEqual(0);
      expect((rect?.x ?? 0) + (rect?.width ?? 0)).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: testInfo.outputPath(
          `theme-${skin ? "halloween" : "original"}-layout-${width}-${dark ? "dark" : "light"}.png`,
        ),
        fullPage: true,
      });
      await inquiry.click();
      const dialog = page.getByRole("dialog", {
        name: "관리자 문의",
        exact: true,
      });
      await expect(dialog).toBeVisible();
      expect(
        await dialog.evaluate(
          (element) => getComputedStyle(element).backgroundColor,
        ),
      ).toBe(skin ? "rgb(33, 19, 31)" : dark ? "rgb(15, 23, 42)" : "rgb(255, 255, 255)");
      const dialogRect = await dialog.boundingBox();
      expect(dialogRect!.x).toBeGreaterThanOrEqual(0);
      expect(dialogRect!.width).toBeLessThanOrEqual(width);
      expect(dialogRect!.height).toBeLessThanOrEqual(844);
      if (width === 390)
        await page.screenshot({
          path: testInfo.outputPath(
            `theme-${skin ? "halloween" : "original"}-inquiry-390-${dark ? "dark" : "light"}.png`,
          ),
        });
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
    }
  }
  }
  } finally { await setSkin(originalFlags.seasonal_landing ?? true); }
  const before = await (
    await request.get("/api/event-hub/admin", { headers: adminHeaders })
  ).json();
  await withLegacyLaboratory(request, page, async () => {
  await page.addInitScript((value) => {
    localStorage.setItem("admin_token_v1", value);
    localStorage.setItem(
      "admin_session_v1",
      JSON.stringify({ phone: "010-0000-0000", authedAt: Date.now() }),
    );
  }, token!);
  await page.goto("/admin");
  await page.getByRole("button", { name: "🎉 술번개", exact: true }).click();
  if(!await page.getByText("행사 설정·기록·관리 도구",{exact:true}).evaluate(el=>(el.parentElement as HTMLDetailsElement).open)) await page.getByText("행사 설정·기록·관리 도구",{exact:true}).click();
  await page
    .getByRole("button", { name: "🧪 선착순 시험실", exact: true })
    .click();
  await page.getByLabel("가상 진행 상태").selectOption("회비 확인");
  await expect(page.getByText("최종 납부 금액 40,000원")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("admin-rank-3-sandbox.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "4등", exact: true }).click();
  await expect(page.getByText("최종 납부 금액 50,000원")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("admin-rank-4-sandbox.png"),
    fullPage: true,
  });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`admin-sandbox-${width}.png`),
      fullPage: true,
    });
  }
  const after = await (
    await request.get("/api/event-hub/admin", { headers: adminHeaders })
  ).json();
  expect(after.applications).toEqual(before.applications);
  expect(after.stocks).toEqual(before.stocks);
  expect(after.events).toEqual(before.events);
  });
  const unauthorized = await request.get("/api/event-hub/admin");
  expect(unauthorized.status()).toBe(403);
  const oldEntry = await request.post("/api/db/op", {
    data: {
      table: "profiles",
      op: "insert",
      payload: { id: randomUUID(), nickname: "우회신청" },
      selectAfterWrite: true,
    },
  });
  expect(oldEntry.status()).toBe(403);
});

test("inquiry drafts, participant messages and administrator replies survive reopening without external notifications", async ({
  page,
  browser,
  request,
}, testInfo) => {
  const text = `격리 문의 ${suffix}`;
  await page.goto("/events");
  await page.getByRole("button", { name: /💬 관리자 문의/ }).click();
  await page.getByLabel("문의 내용", { exact: true }).fill(text);
  await page.getByLabel("문의 처리 목적으로").check();
  await page.getByRole("button", { name: "문의 보내기", exact: true }).click();
  await expect(page.getByText(text, { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "관리자 문의", exact: true }),
  ).toHaveCount(0);
  const inquiryUrl = page.url();
  await page.getByRole("button", { name: /💬 관리자 문의/ }).click();
  await expect(
    page.getByRole("dialog", { name: "관리자 문의", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("dialog", { name: "관리자 문의", exact: true }),
  ).toHaveCount(0);
  expect(page.url()).toBe(inquiryUrl);
  const state = await (
    await request.get("/api/event-hub/admin", { headers: adminHeaders })
  ).json();
  const owner = state.threads.find((t: { messages: { text: string }[] }) =>
    t.messages.some((m) => m.text === text),
  ).id;
  const context = await browser.newContext({
    baseURL: process.env.HUB_E2E_BASE_URL,
  });
  await restrictToLocal(context);
  await context.addInitScript((value) => {
    localStorage.setItem("admin_token_v1", value);
    localStorage.setItem(
      "admin_session_v1",
      JSON.stringify({ phone: "010-0000-0000", authedAt: Date.now() }),
    );
  }, token!);
  const admin = await context.newPage();
  await admin.goto("/admin");
  await admin.getByRole("button", { name: "🎉 술번개", exact: true }).click();
  await admin.getByRole("button", { name: "관리자 문의", exact: true }).click();
  await admin.getByLabel("문의 대상").selectOption(owner);
  await admin.getByRole('button',{name:'전체 운영',exact:true}).click();
  await page.getByRole('button',{name:/💬 관리자 문의/}).click();
  const followup=`알림 확인 ${suffix}`;
  await page.getByLabel('문의 내용',{exact:true}).fill(followup);
  const adminAlertStarted=performance.now();
  await page.getByRole('button',{name:'문의 보내기',exact:true}).click();
  await expect(admin.locator('.hub-inquiry-alert').getByRole('button',{name:'새 문의 대화 열기'})).toBeVisible({timeout:15000});
  await expect(admin.locator('.hub-inquiry-alert')).toHaveAttribute('data-latest-thread',owner,{timeout:15000});
  await expect.poll(async()=>{const s=await(await request.get('/api/event-hub/admin',{headers:adminHeaders})).json();const t=s.threads.find((v:{id:string})=>v.id===owner);return t.messages.at(-1).text===followup&&t.messages.at(-1).at>t.readAdminAt;}).toBe(true);
  await admin.locator('.hub-inquiry-alert').getByRole('button',{name:'새 문의 대화 열기'}).click();
  await expect(admin.getByLabel('문의 대상')).toHaveValue(owner);
  await expect(admin.getByText(`신청자: ${followup}`,{exact:true})).toBeVisible();
  const contrast=await admin.locator('.hub-admin-conversation p').last().evaluate(el=>{
    const c=getComputedStyle(el);const luminance=(rgb:string)=>{const v=rgb.match(/[\d.]+/g)!.slice(0,3).map(Number).map(n=>{const s=n/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;});return .2126*v[0]+.7152*v[1]+.0722*v[2];};const a=luminance(c.color),b=luminance(c.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  const adminAlertMs=Math.round(performance.now()-adminAlertStarted);
  await admin.screenshot({path:testInfo.outputPath('v12-admin-new-inquiry-chat.png'),fullPage:true});
  await page.keyboard.press('Escape');
  const reply = `관리자 격리 답장 ${suffix}`;
  await admin.getByLabel("빠른문구").selectOption({ index: 1 });
  await expect(
    admin.getByRole("textbox", { name: "관리자 답장", exact: true }),
  ).not.toHaveValue("");
  const afterQuick = await (
    await request.get("/api/event-hub/admin", { headers: adminHeaders })
  ).json();
  expect(
    afterQuick.threads.find((t: { id: string }) => t.id === owner).messages,
  ).toHaveLength(2);
  await admin
    .getByRole("textbox", { name: "관리자 답장", exact: true })
    .fill(reply);
  const replyStarted = performance.now();
  await admin
    .getByRole("button", { name: "수정한 답장 보내기", exact: true })
    .click();
  await expect(
    admin.getByText(`관리자: ${reply}`, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("관리자에게서 연락이 왔습니다", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  const replyVisibleMs = Math.round(performance.now() - replyStarted);
  await page.getByRole("button", { name: /💬 관리자 문의/ }).click();
  await expect(
    page.getByText(reply, { exact: true }),
  ).toBeVisible();
  const timing = { environment: "two Chromium contexts, loopback React/Express/PostgreSQL, no reload before notification", action: "administrator reply click to participant unread banner", milliseconds: replyVisibleMs, participantMessageToAdminConversationMs:adminAlertMs, targetMs: 2000, targetMet: replyVisibleMs <= 2000 };
  writeFileSync(testInfo.outputPath("v12-inquiry-visible-timing.json"), JSON.stringify(timing, null, 2));
  console.log("V12_INQUIRY_VISIBLE_TIMING", JSON.stringify(timing));
  await page
    .getByLabel("문의 내용", { exact: true })
    .fill("보내지 않은 임시 문의");
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("button", { name: /💬 관리자 문의/ }).click();
  await expect(page.getByLabel("문의 내용", { exact: true })).toHaveValue(
    "보내지 않은 임시 문의",
  );
  await page.screenshot({
    path: testInfo.outputPath("actual-inquiry-drawer.png"),
    fullPage: true,
  });
  await admin.screenshot({
    path: testInfo.outputPath("actual-admin-inquiry.png"),
    fullPage: true,
  });
  await context.close();
});

test("100 distinct cookie sessions submit concurrently through the actual HTTP API without duplicate applications or ranks", async ({
  request,
}) => {
  const contexts = await Promise.all(
    Array.from({ length: 100 }, () =>
      apiRequest.newContext({ baseURL: process.env.HUB_E2E_BASE_URL }),
    ),
  );
  try {
    const results = await Promise.all(
      contexts.map(async (c, i) => {
        const code = Buffer.from(
          crypto.getRandomValues(new Uint8Array(32)),
        ).toString("base64url");
        expect(
          (
            await c.post("/api/event-hub/session", {
              data: { recoveryCode: code, create: true },
            })
          ).status(),
        ).toBe(200);
        const requestId = randomUUID(),
          data = {
            action: "application.basic",
            requestId,
            data: {
              eventId,
              basic: {
                nickname: ((Number(suffix) + 100000) * 100 + i).toString(36),
                birthYear: 1995,
                location: "부산",
                phone: "01012345678",
                depositor: "격리 동시 시험",
                collection: true,
                version: "2026-10-27-event-v6",
              },
            },
          };
        const r = await c.post("/api/event-hub/mutate", { data });
        expect(r.status()).toBe(200);
        const saved = await r.json();
        // The same network request may be repeated; it must return the same application.
        const again = await c.post("/api/event-hub/mutate", { data });
        expect(again.status()).toBe(200);
        expect((await again.json()).id).toBe(saved.id);
        return saved.id;
      }),
    );
    expect(new Set(results).size).toBe(100);
    const state = await (
      await request.get("/api/event-hub/admin", { headers: adminHeaders })
    ).json();
    const apps = state.applications.filter((a: { id: string }) =>
      results.includes(a.id),
    );
    expect(apps).toHaveLength(100);
    expect(new Set(apps.map((a: { rank: number }) => a.rank)).size).toBe(100);
  } finally {
    await Promise.all(contexts.map((c) => c.dispose()));
  }
});

test("protected media HTTP, privacy review and participant-safe notices use the real isolated DB", async ({
  page,
  request,
  browser,
}, testInfo) => {
  const code = (randomUUID() + randomUUID()).replaceAll("-", "");
  expect(
    (
      await page.request.post("/api/event-hub/session", {
        data: { recoveryCode: code, create: true },
      })
    ).status(),
  ).toBe(200);
  const nick = `보안${suffix.slice(-4)}`;
  const mutate = async (
    action: string,
    target = "",
    data: Record<string, unknown> = {},
    revision?: number,
  ) => {
    const r = await page.request.post("/api/event-hub/mutate", {
      data: { action, target, data, revision, requestId: randomUUID() },
    });
    const body = await r.json();
    expect(
      r.status(),
      JSON.stringify({ code: body.code, error: body.error }),
    ).toBe(200);
    return body;
  };
  const id = String(
    (
      await mutate("application.basic", "", {
        eventId,
        basic: {
          nickname: nick,
          birthYear: 1995,
          location: "부산",
          phone: "01000000000",
          depositor: "가상 보안시험",
          collection: true,
          version: "2026-10-27-event-v6",
        },
      })
    ).id,
  );
  const all = await (
    await request.get("/api/event-hub/admin", { headers: adminHeaders })
  ).json();
  const e = all.events.find((v: { id: string }) => v.id === eventId);
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZAAAAABJRU5ErkJggg==";
  const uploaded = await command(
    request,
    "event.media.upload",
    eventId,
    { mime: "image/png", base64: png },
    e.revision,
  );
  const url = String(uploaded.mediaUrl);
  expect((await page.request.get(url)).status()).toBe(404);
  expect((await request.get(url)).status()).toBe(404);
  const range = await request.get(url, {
    headers: { ...adminHeaders, range: "bytes=0-7" },
  });
  expect(range.status()).toBe(206);
  expect((await range.body()).length).toBe(8);
  expect(
    (
      await request.get(url, {
        headers: { ...adminHeaders, range: "bytes=99999-100000" },
      })
    ).status(),
  ).toBe(416);
  await mutate(
    "application.consent",
    id,
    {
      consent: {
        collection: true,
        sharing: true,
        notice: true,
        version: "2026-10-27-event-v6",
      },
    },
    (await application(request, id)).revision,
  );
  await mutate(
    "application.confirm",
    id,
    {},
    (await application(request, id)).revision,
  );
  await command(
    request,
    "admin.application.payment",
    id,
    { status: "approved", bankChecked: true },
    (await application(request, id)).revision,
  );
  expect((await page.request.get(url)).status()).toBe(200);
  const videoEvent = (
    await (
      await request.get("/api/event-hub/admin", { headers: adminHeaders })
    ).json()
  ).events.find((v: { id: string }) => v.id === eventId);
  const uploadedVideo = await command(
    request,
    "event.media.upload",
    eventId,
    {
      mime: "video/webm",
      base64: readFileSync(
        new URL("./fixtures/event-hub-synthetic.webm", import.meta.url),
      ).toString("base64"),
    },
    videoEvent.revision,
  );
  expect((await request.get(String(uploadedVideo.mediaUrl))).status()).toBe(
    404,
  );
  await page.goto(`/events/a/${id}`);
  const video = page.locator("video");
  await video.evaluate(async (element: HTMLVideoElement) => {
    element.muted = true;
    await element.play();
  });
  await expect
    .poll(() =>
      video.evaluate((element: HTMLVideoElement) => element.readyState),
    )
    .toBeGreaterThanOrEqual(2);
  expect(
    await video.evaluate((element: HTMLVideoElement) => element.videoWidth),
  ).toBe(160);
  await page.screenshot({
    path: testInfo.outputPath("actual-protected-video-playback.png"),
    fullPage: true,
  });
  await page.goto("/events");
  await page.getByText("개인정보 열람·삭제 문의", { exact: true }).click();
  await page
    .getByRole("button", { name: "개인정보 삭제 검토 요청", exact: true })
    .click();
  await expect(
    page.getByText("처리 상태: 요청 접수", { exact: false }),
  ).toBeVisible();
  const owner = (await application(request, id)).owner;
  const ctx = await browser.newContext({
    baseURL: process.env.HUB_E2E_BASE_URL,
  });
  try {
    await restrictToLocal(ctx);
    await ctx.addInitScript((value) => {
      localStorage.setItem("admin_token_v1", value);
      localStorage.setItem(
        "admin_session_v1",
        JSON.stringify({ phone: "010-0000-0000", authedAt: Date.now() }),
      );
    }, token!);
    const admin = await ctx.newPage();
  admin.on("response", async response=>{
    const path=new URL(response.url()).pathname;
    if(path!=="/api/event-hub/mutate"&&path!=="/api/event-hub/admin")return;
    const request=response.request(), action=request.postDataJSON()?.action;
    if(action==="admin.privacy.review"||path==="/api/event-hub/admin"){
      const timing=request.timing();
      const body=action==="admin.privacy.review"?await response.json().catch(()=>({code:"UNREADABLE"})):undefined;
      console.log("V3_PRIVACY_TRACE",JSON.stringify({path,action,status:response.status(),responseStartMs:timing.responseStart,code:body?.code}));
    }
  });

    await admin.goto("/admin");
    await admin.getByRole("button", { name: "🎉 술번개", exact: true }).click();
    await admin
      .getByRole("combobox", { name: /^관리할 행사/ })
      .selectOption(eventId);
    await admin
      .getByRole("button", { name: "공지·장소", exact: true })
      .click();
    await admin.getByRole('tab',{name:'대기방 자료',exact:true}).click();
    await admin.getByRole("button",{name:"사진·포스터 추가",exact:true}).click();
    const upload = admin.getByLabel("사진·포스터 파일 선택");
    await upload.setInputFiles({
      name: "synthetic-poster.png",
      mimeType: "image/png",
      buffer: readFileSync(new URL('../public/tour-logos-v3/on_top.png',import.meta.url)),
    });
    await expect(admin.getByAltText("선택한 자료 미리보기")).toBeVisible();
    await admin.locator('section').filter({has:admin.getByRole('heading',{name:'행사 자료',exact:true})}).getByRole("button",{name:"저장",exact:true}).click();
    await expect(
      admin.getByText("저장되었습니다 ✓", { exact: true }),
    ).toBeVisible();
    const latest = await (
      await request.get("/api/event-hub/admin", { headers: adminHeaders })
    ).json();
    expect(
      latest.events.find((v: { id: string }) => v.id === eventId).media,
    ).toHaveLength(3);
  if(!await admin.getByText("행사 설정·기록·관리 도구",{exact:true}).evaluate(el=>(el.parentElement as HTMLDetailsElement).open)) await admin.getByText("행사 설정·기록·관리 도구",{exact:true}).click();
    await admin
      .getByRole("button", { name: "이력·개인정보", exact: true })
      .click();
    const card = admin.locator("section").filter({
      has: admin.getByRole("heading", {
        name: `개인정보 요청 · ${nick}`,
        exact: true,
      }),
    });
    await card
      .getByLabel("관리자 검토·보관 보류 사유 (비공개)", { exact: true })
      .fill("PRIVATE-UI-REVIEW");
    await card
      .getByLabel("신청자에게 보여줄 처리 안내", { exact: true })
      .fill("가상 본인 확인 검토를 마쳤습니다");
    await expect(
      card.getByRole("button", {
        name: "본인 확인·검토 완료 기록",
        exact: true,
      }),
    ).toBeDisabled();
    await card
      .getByRole("checkbox", { name: /별도 절차로 요청자 본인 확인/ })
      .check();
    await card
      .getByRole("button", { name: "본인 확인·검토 완료 기록", exact: true })
      .click();
    await expect(
      card.getByText("상태: reviewed", { exact: false }),
    ).toBeVisible();
    await card.screenshot({
      path: testInfo.outputPath("privacy-reviewed-admin.png"),
      animations: "disabled",
    });
    await page.reload();
    await page.getByText("개인정보 열람·삭제 문의", { exact: true }).click();
    await expect(
      page.getByText("가상 본인 확인 검토를 마쳤습니다", { exact: false }),
    ).toBeVisible();
    const own = await (await page.request.get("/api/event-hub/state")).json();
    expect(JSON.stringify(own)).not.toContain("PRIVATE-UI-REVIEW");
    expect(
      own.applications.find((a: { id: string }) => a.id === id).payment,
    ).toBe("approved");
    expect(own.privacyCase.status).toBe("reviewed");
    await card
      .getByRole("button", { name: "파기 후보·보류 사유 확인", exact: true })
      .click();
    await expect(
      admin.getByText(
        "운영 보관·파기 정책이 검토 초안입니다. 운영 파기는 승인 전 실행하지 않습니다.",
        { exact: true },
      ),
    ).toBeVisible();
    expect(owner).toBeTruthy();
  } finally {
    await ctx.close();
  }
});

test("actual administrator Saturday toggle survives reload and returns to the original isolated configuration", async ({
  page,
  request,
}, testInfo) => {
  await page.addInitScript((value) => {
    localStorage.setItem("admin_token_v1", value);
    localStorage.setItem(
      "admin_session_v1",
      JSON.stringify({ phone: "01000000000", authedAt: Date.now() }),
    );
  }, token!);
  const initial = await (
    await request.get("/api/event-hub/admin", { headers: adminHeaders })
  ).json();
  try {
    await page.goto("/admin");
    await page.getByRole("button", { name: "🎉 술번개", exact: true }).click();
    await page.getByText("행사 설정·기록·관리 도구",{exact:true}).click();
    await page.getByRole("button",{name:"행사·자동방",exact:true}).click();
    const toggle = page.getByLabel("토요일 행사 자동 준비", { exact: true });
    await toggle.setChecked(!initial.settings.autoSaturday);
    await page
      .getByRole("button", { name: "자동방 설정 저장", exact: true })
      .click();
    await expect(
      page.getByText("저장되었습니다 ✓", { exact: true }),
    ).toBeVisible();
    const saved = await (
      await request.get("/api/event-hub/admin", { headers: adminHeaders })
    ).json();
    expect(saved.settings.autoSaturday).toBe(!initial.settings.autoSaturday);
    await page.reload();
    await page.getByRole("button", { name: "🎉 술번개", exact: true }).click();
    await page.getByText("행사 설정·기록·관리 도구",{exact:true}).click();
    await page.getByRole("button",{name:"행사·자동방",exact:true}).click();
    await expect(toggle).toBeChecked({
      checked: !initial.settings.autoSaturday,
    });
    await page.screenshot({
      path: testInfo.outputPath("actual-admin-saturday-toggle.png"),
      fullPage: true,
    });
  } finally {
    const current = await (
      await request.get("/api/event-hub/admin", { headers: adminHeaders })
    ).json();
    await command(
      request,
      "settings.save",
      "",
      initial.settings,
      current.settings.revision,
    );
  }
});

test("latest campaign actual API: first-rank free approval stays separate from bank payment and private venue", async ({
  page,
  request,
  browser,
}, testInfo) => {
  const prepared = await command(
    request,
    "campaign.prepare",
    "halloween-2026-10-30",
  );
  const id = String(prepared.id);
  let state = await (
    await request.get("/api/event-hub/admin", { headers: adminHeaders })
  ).json();
  let e = state.events.find((v: { id: string }) => v.id === id);
  // The isolated fixture may be reused; this scenario uses its next unclaimed rank.
  await command(
    request,
    "event.save",
    id,
    { ...e, opensAt:"2000-01-01T00:00:00.000Z", account: "격리 시험 계좌", deadline: "관리자 개별 안내" },
    e.revision,
  );
  state = await (
    await request.get("/api/event-hub/admin", { headers: adminHeaders })
  ).json();
  e = state.events.find((v: { id: string }) => v.id === id);
  await command(
    request,
    "event.recruitment",
    id,
    { enabled: true },
    e.revision,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/events/e/${id}`);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "신청 안내", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await page.locator(".application-tutorial .line-clamp-2").evaluateAll(elements=>elements.every(element=>element.scrollHeight<=element.clientHeight+1))).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("campaign-application-guide-390.png"),
  });
  await page.getByRole("dialog").getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "알겠어요", exact: true }).click();
  await fillBasicSteps(page, [`행사${suffix.slice(-4)}`, "1995", "부산", "01000000000", "가상행사"]);
  await expect(page.getByText("범일 비턴점", { exact: false })).toHaveCount(0);
  await expect(page.getByText("격리 시험 계좌", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByLabel("필수 안내를 모두 확인하고 동의합니다", { exact: true }).check();
  await page.getByRole("button", { name: "동의하고 다음" }).click();
  const appId = page.url().split("/").pop()!;
  let a = await application(request, appId);
  const expected =
    [0, 12000, 14000, 16000, 16000, 18000, 18000, 18000, 18000, 18000][
      a.rank - 1
    ] ?? (Date.parse(a.history.find((h: {action:string;at:string}) => h.action === "application.basic").at) < Date.parse("2026-10-30T21:00:00+09:00") ? 20000 : 23000);
  await expect(
    page.getByText(`최종 납부 금액 ${expected.toLocaleString()}원`, {
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("campaign-halloween-personal-fee.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "금액 확인 후 신청 확정" }).click();
  const adminContext = await browser.newContext({
    baseURL: process.env.HUB_E2E_BASE_URL,
  });
  await restrictToLocal(adminContext);
  await adminContext.addInitScript((value) => {
    localStorage.setItem("admin_token_v1", value);
    localStorage.setItem(
      "admin_session_v1",
      JSON.stringify({ phone: "01000000000", authedAt: Date.now() }),
    );
  }, token!);
  try {
    const admin = await adminContext.newPage();
    await admin.goto("/admin");
    await admin.getByRole("button", { name: "🎉 술번개", exact: true }).click();
    await admin.getByLabel("관리할 행사").selectOption(id);
    await admin.getByRole("button", { name: "신청·입금", exact: true }).click();
    await admin.getByLabel("닉네임·신청번호로 찾기", { exact: true }).fill(appId);
    await admin.locator(".hub-applicant-list > button").click();
    const card = admin
      .locator("section")
      .filter({ has: admin.getByText(`신청번호 ${appId}`, { exact: true }) });
    if (expected === 0) {
      admin.once("dialog", (d) => d.accept());
      await card
        .getByRole("button", { name: "무료 참가 승인", exact: true })
        .click();
      await expect(
        card.getByText("무료 참가 승인 완료 · 은행 입금으로 기록하지 않음"),
      ).toBeVisible();
      a = await application(request, appId);
      expect(a.payment).toBe("none");
      expect(a.waivedAt).toBeTruthy();
    }
    await admin.screenshot({
      path: testInfo.outputPath("campaign-admin-free-priority.png"),
      fullPage: true,
    });
  } finally {
    await adminContext.close();
  }
  await page.reload();
  await page.screenshot({
    path: testInfo.outputPath("campaign-halloween-waiting.png"),
    fullPage: true,
  });
});

test("tour actual API advance and shared-component lab enforce rank ten/eleven without changing live inventory", async ({
  page,
  request,
}, testInfo) => {
  const prepared = await command(
    request,
    "campaign.prepare",
    "tour-2026-11-06",
  );
  const id = String(prepared.id);
  let state = await (
    await request.get("/api/event-hub/admin", { headers: adminHeaders })
  ).json();
  let e = state.events.find((v: { id: string }) => v.id === id);
  await command(
    request,
    "event.save",
    id,
    {
      ...e,
      opensAt:"2000-01-01T00:00:00.000Z",
      account: "격리 시험 계좌",
      deadline: "관리자 안내",
      campaign: { ...e.campaign, advance: 17000 },
    },
    e.revision,
  );
  state = await (
    await request.get("/api/event-hub/admin", { headers: adminHeaders })
  ).json();
  e = state.events.find((v: { id: string }) => v.id === id);
  await command(
    request,
    "event.recruitment",
    id,
    { enabled: true },
    e.revision,
  );
  await page.goto(`/events/e/${id}`);
  await page.getByRole("button", { name: "신청 안내", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "알겠어요", exact: true }).click();
  await fillBasicSteps(page, [`투어${suffix.slice(-4)}`, "1995", "인천", "01000000000", "가상투어"]);
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByLabel("필수 안내를 모두 확인하고 동의합니다", { exact: true }).check();
  await page.getByRole("button", { name: "동의하고 다음" }).click();
  await expect(
    page.getByText("선입금액 (최종 회비 아님) 17,000원", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/최종 납부 금액/)).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("campaign-tour-advance-not-final.png"),
    fullPage: true,
  });
  await withLegacyLaboratory(request, page, async () => {
  await page.addInitScript((value) => {
    localStorage.setItem("admin_token_v1", value);
    localStorage.setItem(
      "admin_session_v1",
      JSON.stringify({ phone: "01000000000", authedAt: Date.now() }),
    );
  }, token!);
  await page.goto("/admin");
  await page.getByRole("button", { name: "🎉 술번개", exact: true }).click();
  await page.getByLabel("관리할 행사").selectOption(id);
  if(!await page.getByText("행사 설정·기록·관리 도구",{exact:true}).evaluate(el=>(el.parentElement as HTMLDetailsElement).open)) await page.getByText("행사 설정·기록·관리 도구",{exact:true}).click();
  await page
    .getByRole("button", { name: "🧪 선착순 시험실", exact: true })
    .click();
  const before = await (
    await request.get("/api/event-hub/admin", { headers: adminHeaders })
  ).json();
  await page.getByRole("button", { name: "10등", exact: true }).click();
  await page.getByLabel("가상 진행 상태").selectOption("현장 입장");
  await page
    .getByRole("button", { name: "추억의 뽑기 두 장 열기", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "추억의 뽑기 · 2/2" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("campaign-tour-rank10-two-cards.png"),
    animations:"disabled",
    fullPage: true,
  });
  await page.getByRole("button", { name: "11등", exact: true }).click();
  await page
    .getByRole("button", { name: "추억의 뽑기 두 장 열기", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("10명");
  await page.screenshot({
    path: testInfo.outputPath("campaign-tour-rank11-blocked.png"),
    fullPage: true,
  });
  const after = await (
    await request.get("/api/event-hub/admin", { headers: adminHeaders })
  ).json();
  expect(after.stocks).toEqual(before.stocks);
  expect(after.applications).toEqual(before.applications);
  });
});

test("private screening photo UI requires explicit consent, administrator review and verified source deletion", async ({
  page,
  request,
  browser,
}, testInfo) => {
  const prepared = await command(
    request,
    "campaign.prepare",
    "halloween-2026-10-31",
  );
  const id = String(prepared.id);
  let state = await (
    await request.get("/api/event-hub/admin", { headers: adminHeaders })
  ).json();
  let e = state.events.find((v: { id: string }) => v.id === id);
  await command(
    request,
    "event.save",
    id,
    { ...e, end:"01:00", opensAt:"2000-01-01T00:00:00.000Z", account: "격리 시험 계좌", deadline: "개별 사전 안내" },
    e.revision,
  );
  state = await (
    await request.get("/api/event-hub/admin", { headers: adminHeaders })
  ).json();
  e = state.events.find((v: { id: string }) => v.id === id);
  await command(
    request,
    "event.recruitment",
    id,
    { enabled: true },
    e.revision,
  );
  await page.goto(`/events/e/${id}`);
  await page.getByRole("button", { name: "신청 안내", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "알겠어요", exact: true }).click();
  await fillBasicSteps(page, [`사진${suffix.slice(-4)}`, "1990", "부산", "01000000000", "가상사진"]);
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByLabel("필수 안내를 모두 확인하고 동의합니다", { exact: true }).check();
  await page.getByRole("button", { name: "동의하고 다음" }).click();
  await page.getByRole("button", { name: "금액 확인 후 신청 확정" }).click();
  const appId = page.url().split("/").pop()!;
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZAAAAABJRU5ErkJggg==",
    "base64",
  );
  await page.getByLabel("사전 검토 사진 선택").setInputFiles({
    name: "synthetic-review.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(page.getByAltText("전송 전 사진 미리보기")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "비공개 사진 전송" }),
  ).toBeDisabled();
  await page.getByLabel("사전 검토용 사진 별도 수집").check();
  await page.getByRole("button", { name: "비공개 사진 전송" }).click();
  await expect(
    page.getByRole("button", { name: "비공개 사진 열람" }),
  ).toBeVisible();
  const a = await application(request, appId);
  const photoURL = `/api/event-hub/screening-photo/${a.screeningPhoto.id}`;
  expect((await request.get(photoURL)).status()).toBe(404);
  expect((await page.request.get(photoURL)).status()).toBe(200);
  await page.screenshot({
    path: testInfo.outputPath("campaign-photo-private-consent.png"),
    fullPage: true,
  });
  const adminContext = await browser.newContext({
    baseURL: process.env.HUB_E2E_BASE_URL,
  });
  await restrictToLocal(adminContext);
  await adminContext.addInitScript((value) => {
    localStorage.setItem("admin_token_v1", value);
    localStorage.setItem(
      "admin_session_v1",
      JSON.stringify({ phone: "01000000000", authedAt: Date.now() }),
    );
  }, token!);
  try {
    const admin = await adminContext.newPage();
    await admin.goto("/admin");
    await admin.getByRole("button", { name: "🎉 술번개", exact: true }).click();
    await admin.getByLabel("관리할 행사").selectOption(id);
    await admin.getByRole("button", { name: "신청·입금", exact: true }).click();
    await admin.getByLabel("닉네임·신청번호로 찾기", { exact: true }).fill(appId);
    await admin.locator(".hub-applicant-list > button").click();
    const card = admin
      .locator("section")
      .filter({ has: admin.getByText(`신청번호 ${appId}`, { exact: true }) });
    await card.getByRole("button", { name: "비공개 사진 열람" }).click();
    await expect(card.getByAltText("사전 검토 비공개 사진")).toBeVisible();
    await card
      .getByLabel("사전 검토 사유 (관리자 기록)")
      .fill("격리 가상 사진 수동 검토");
    await card
      .getByRole("button", { name: "사전 검토 승인", exact: true })
      .click();
    await card
      .getByRole("button", { name: "사진 원본 삭제·결과 확인" })
      .click();
    await expect(card.getByText(/서버 원본 삭제 완료/)).toBeVisible();
    await admin.screenshot({
      path: testInfo.outputPath("campaign-photo-source-deleted.png"),
      fullPage: true,
    });
    expect((await page.request.get(photoURL)).status()).toBe(404);
  } finally {
    await adminContext.close();
  }
});

test("independent draw module switches persist and the Halloween theme expires in the actual React page without a reset", async ({
  page,
  request,
}, testInfo) => {
  const initial = await (
    await request.get("/api/event-hub/admin", { headers: adminHeaders })
  ).json();
  await page.addInitScript((value) => {
    localStorage.setItem("admin_token_v1", value);
    localStorage.setItem(
      "admin_session_v1",
      JSON.stringify({ phone: "01000000000", authedAt: Date.now() }),
    );
    sessionStorage.setItem("binpc2_application_guide_v6:halloween-friday", "1");
  }, token!);
  try {
    await page.goto("/admin");
    await page.getByRole("button", { name: "🎉 술번개", exact: true }).click();
    await page.getByText("행사 설정·기록·관리 도구",{exact:true}).click();
    await page.getByRole("button",{name:"행사·자동방",exact:true}).click();
    await page
      .getByLabel("할로윈 경품 모듈 ON (모든 할로윈 행사)", { exact: true })
      .uncheck();
    await page
      .getByRole("button", { name: "자동방 설정 저장", exact: true })
      .click();
    await expect(
      page.getByText("저장되었습니다 ✓", { exact: true }),
    ).toBeVisible();
    const settings = (
      await (
        await request.get("/api/event-hub/admin", { headers: adminHeaders })
      ).json()
    ).settings;
    expect(settings.campaignModules.halloweenDraw).toBe(false);
    expect(settings.campaignModules.tourDraw).toBe(
      initial.settings.campaignModules?.tourDraw ?? true,
    );
    await page.screenshot({
      path: testInfo.outputPath("modules-independent-off.png"),
      fullPage: true,
    });
  } finally {
    const current = await (
      await request.get("/api/event-hub/admin", { headers: adminHeaders })
    ).json();
    await command(
      request,
      "settings.save",
      "",
      {
        ...initial.settings,
        campaignModules: initial.settings.campaignModules ?? {
          halloweenDraw: true,
          tourDraw: true,
        },
      },
      current.settings.revision,
    );
  }
  const prepared = await command(
    request,
    "campaign.prepare",
    "halloween-2026-10-30",
  );
  const event = String(prepared.id);
  const code = (randomUUID() + randomUUID()).replaceAll("-", "");
  expect(
    (
      await page.request.post("/api/event-hub/session", {
        data: { recoveryCode: code, create: true },
      })
    ).status(),
  ).toBe(200);
  const user = async (
    action: string,
    target = "",
    data: Record<string, unknown> = {},
    revision?: number,
  ) => {
    const r = await page.request.post("/api/event-hub/mutate", {
      data: { action, target, data, revision, requestId: randomUUID() },
    });
    expect(r.status()).toBe(200);
    return r.json();
  };
  const a = await user("application.basic", "", {
    eventId: event,
    basic: {
      nickname: `테마${suffix.slice(-4)}`,
      birthYear: 1995,
      location: "부산",
      phone: "01000000000",
      depositor: "가상테마",
      collection: true,
      version: "2026-10-27-event-v6",
    },
  });
  const id = String(a.id);
  await user(
    "application.consent",
    id,
    {
      consent: {
        collection: true,
        sharing: true,
        notice: true,
        version: "2026-10-27-event-v6",
      },
    },
    1,
  );
  await user("application.confirm", id, {}, 2);
  const before = await application(request, id);
  await page.clock.install({ time: new Date("2026-10-31T00:00:00+09:00") });
  await page.goto(`/events/a/${id}`);
  // V12 keeps cards out of the waiting room; verify the actual decorative cover.
  await expect(page.locator('[data-art-theme="halloween"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "카드 한 장 뽑기", exact: true })).toHaveCount(0);
  await page.clock.pauseAt(new Date("2026-10-31T16:59:59+09:00"));
  await page.screenshot({
    path: testInfo.outputPath("halloween-before-1700.png"),
    fullPage: true,
  });
  await page.clock.runFor(1000);
  await expect(page.locator('[data-art-theme="halloween"]')).toHaveCount(
    0,
  );
  await expect(page.locator('[data-art-theme="default"]')).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("halloween-at-1700-restored.png"),
    fullPage: true,
  });
  const after = await application(request, id);
  expect(after.payment).toBe(before.payment);
  expect(after.quote).toEqual(before.quote);
  expect(after.cards).toEqual(before.cards);
});

test("actual app: optional receipt contact only after paid reward, late-arrival review and received logos preserve ownership",async({page,request,browser},testInfo)=>{
 const code=randomBytes(32).toString("base64url");
 await page.request.post("/api/event-hub/session",{data:{recoveryCode:code,create:true}});
 const user=async(action:string,target:string,data:Record<string,unknown>,revision?:number)=>{
  const response=await page.request.post("/api/event-hub/mutate",{data:{action,target,data,revision,requestId:randomUUID()}});
  expect(response.status()).toBe(200);return response.json();
 };
 const nickname="추"+randomBytes(3).toString("hex").slice(0,5);
 const {id}=await user("application.basic","",{eventId,basic:{nickname,birthYear:1995,location:"부산",phone:"01000000000",depositor:"합성",collection:true,version:"2026-10-27-event-v6"}});
 await user("application.consent",id,{consent:{collection:true,sharing:true,notice:true,version:"2026-10-27-event-v6"}},1);
 await user("application.confirm",id,{},2);
 await page.addInitScript((id)=>sessionStorage.setItem("binpc2_application_guide_v6:"+id,"1"),eventId);
 await page.goto("/events/a/"+id);
 await expect(page.getByLabel("수령 연락처 (선택)",{exact:true})).toHaveCount(0);
 const rewardId=randomUUID();
 await command(request,'admin.application.result',id,{id:rewardId,label:'합성 수동 상금',kind:'cash',amount:3000,reason:'격리 시험 지급 기록'},(await application(request,id)).revision);
 await command(request,'admin.application.result.confirm',id,{id:rewardId,field:'paidAt',doubleChecked:true},(await application(request,id)).revision);
 await command(request,'admin.application.phone-request',id,{source:'result',resultId:rewardId,purpose:'수령 기록 확인용 선택 연락처'},(await application(request,id)).revision);
 await page.reload();
 await page.getByLabel("수령 연락처 (선택)",{exact:true}).fill("01011110000");
 await expect(page.getByRole("button",{name:"연락처 저장",exact:true})).toBeDisabled();
 await page.getByLabel('위 수령 목적의 연락처 이용에 동의합니다 (선택)',{exact:true}).check();
 await page.getByRole("button",{name:"연락처 저장",exact:true}).click();
 await expect.poll(async()=> (await application(request,id)).rewardPhone).toBe("01011110000");
 const initial=await application(request,id);
 await page.getByRole("button",{name:"늦게 도착해요 / 도착 예정시간",exact:true}).click();
 const state=await (await request.get("/api/event-hub/admin",{headers:adminHeaders})).json();
 const event=state.events.find((e:{id:string})=>e.id===eventId);
 const nextDate=new Date(Date.parse(event.date+"T00:00:00Z")+86400000).toISOString().slice(0,10);
 await page.getByLabel("도착 예정 (한국시간)",{exact:true}).fill(nextDate+"T01:00");
 await page.getByLabel("늦참 사유 (선택)",{exact:true}).fill("합성 늦참 검토");
 await page.getByRole("button",{name:"내용 확인 · 도착시간 저장",exact:true}).click();
 await expect.poll(async()=> (await application(request,id)).lateArrival?.status).toBe("review");
 const after=await application(request,id);
 expect(after.quote).toEqual(initial.quote);expect(after.payment).toBe(initial.payment);
 await expect(page.getByRole("button",{name:"입금했어요 (신고)",exact:true})).toHaveCount(0);
 const adminContext=await browser.newContext({baseURL:process.env.HUB_E2E_BASE_URL});
 await restrictToLocal(adminContext);
 await adminContext.addInitScript(token=>{
  localStorage.setItem("admin_token_v1",token);localStorage.setItem("admin_session_v1",JSON.stringify({phone:"01000000000",authedAt:Date.now()}));
 },token);
 const admin=await adminContext.newPage();
 try{
  await admin.goto("/admin");
  await admin.getByRole("button",{name:"🎉 술번개",exact:true}).click();
  await admin.getByLabel("관리할 행사").selectOption(eventId);
  if(!await admin.getByText("행사 설정·기록·관리 도구",{exact:true}).evaluate(el=>(el.parentElement as HTMLDetailsElement).open)) await admin.getByText("행사 설정·기록·관리 도구",{exact:true}).click();
  await admin.getByRole("button",{name:"경품·상금·할인 결과",exact:true}).click();
  await admin.getByLabel("닉네임·행사 검색",{exact:true}).fill(nickname);
  await admin.getByRole("button",{name:"권한 있는 관리자 상세 열람",exact:true}).click();
  await admin.getByText('수령 연락처 · 저장됨',{exact:true}).click();
  await expect(admin.getByText("수령 연락처: 01011110000",{exact:true})).toBeVisible();
  await admin.getByLabel("늦참 검토 사유",{exact:true}).fill("현장 확인 후 안내");
  await admin.getByRole("button",{name:"늦참 승인",exact:true}).click();
  await expect.poll(async()=> (await application(request,id)).lateArrival?.status).toBe("approved");
  await admin.screenshot({path:testInfo.outputPath("v3-admin-benefit-phone-late-review.png"),fullPage:true});
  if(!await admin.getByText("행사 설정·기록·관리 도구",{exact:true}).evaluate(el=>(el.parentElement as HTMLDetailsElement).open)) await admin.getByText("행사 설정·기록·관리 도구",{exact:true}).click();
  await admin.getByRole("button",{name:"행사·자동방",exact:true}).click();
  await admin.getByText("수령한 8개 매장 로고 확인",{exact:true}).click();
  for(const name of ["레드홀 · RED HOLE","페이크 · FAKE","자크 · JACK","M가라오케 · M KARAOKE (기존 제작 시안)","스피드 · SPEED","체크인 · CHECK-IN","온탑 · ON TOP","블랙 · BLACK","고래 Gorae 감사용 로고"]){
   await admin.getByAltText(name,{exact:true}).scrollIntoViewIfNeeded();
   await expect.poll(()=>admin.getByAltText(name,{exact:true}).evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
  }
  await admin.screenshot({path:testInfo.outputPath("v3-eight-logos-actual-admin.png"),fullPage:true});
 }finally{await adminContext.close();}
 await page.screenshot({path:testInfo.outputPath("v3-participant-late-arrival-phone.png"),fullPage:true});
});

test("administrator verification history and immutable logo upload/select/restore use the actual app and DB",async({page,request,browser},testInfo)=>{
 expect((await request.get('/api/event-hub/verification')).status()).toBe(403);
 const evidence=await request.get('/api/event-hub/verification',{headers:adminHeaders});expect(evidence.status()).toBe(200);const history=await evidence.json();expect(history.runs.some((r:{historical:boolean})=>r.historical)).toBe(true);
 await page.addInitScript(value=>{localStorage.setItem('admin_token_v1',value);localStorage.setItem('admin_session_v1',JSON.stringify({phone:'01000000000',authedAt:Date.now()}));},token!);
 await page.goto('/admin');await page.getByRole('button',{name:'🎉 술번개',exact:true}).click();await page.getByRole('combobox',{name:'관리할 행사',exact:true}).selectOption(eventId);
  if(!await page.getByText("행사 설정·기록·관리 도구",{exact:true}).evaluate(el=>(el.parentElement as HTMLDetailsElement).open)) await page.getByText("행사 설정·기록·관리 도구",{exact:true}).click();
 await page.getByRole('button',{name:'행사·자동방',exact:true}).click();
 const logo=page.locator('section').filter({has:page.getByRole('heading',{name:'행사 로고 선택·업로드',exact:true})});
 if(!await logo.getByText('새 원본 업로드 · 미리보기 후 저장',{exact:true}).evaluate(el=>(el.parentElement as HTMLDetailsElement).open)) await logo.getByText('새 원본 업로드 · 미리보기 후 저장',{exact:true}).click();
 const original=readFileSync(new URL('../public/tour-logos-v3/on_top.png',import.meta.url));
 await logo.getByLabel('새 로고 원본 파일').setInputFiles({name:'provided-on-top.png',mimeType:'image/png',buffer:original});
 await expect(logo.getByAltText('저장 전 새 로고 미리보기')).toBeVisible();
 await logo.getByLabel('로고 이름',{exact:true}).fill('격리 ON TOP 원본 A');await logo.getByRole('button',{name:'미리본 원본 저장 (아직 미연결)',exact:true}).click();
 await expect.poll(async()=>{const s=await(await request.get('/api/event-hub/admin',{headers:adminHeaders})).json();return s.events.find((e:{id:string})=>e.id===eventId).logoVersions?.length??0;}).toBe(1);
 let e=(await(await request.get('/api/event-hub/admin',{headers:adminHeaders})).json()).events.find((e:{id:string})=>e.id===eventId);const a=e.logoVersions[0];expect(e.venueLogoVersionId).toBeUndefined();
 await logo.getByLabel('저장한 장소용 로고 버전').selectOption(a.id);await logo.getByRole('button',{name:'선택한 로고를 행사에 연결',exact:true}).click();
 await expect.poll(async()=>{const s=await(await request.get('/api/event-hub/admin',{headers:adminHeaders})).json();return s.events.find((e:{id:string})=>e.id===eventId).venueLogoVersionId;}).toBe(a.id);
 if(!await logo.getByText('새 원본 업로드 · 미리보기 후 저장',{exact:true}).evaluate(el=>(el.parentElement as HTMLDetailsElement).open)) await logo.getByText('새 원본 업로드 · 미리보기 후 저장',{exact:true}).click();await logo.getByLabel('새 로고 원본 파일').setInputFiles({name:'provided-on-top-v2.png',mimeType:'image/png',buffer:original});await logo.getByLabel('로고 이름',{exact:true}).fill('격리 ON TOP 원본 B');await logo.getByRole('button',{name:'미리본 원본 저장 (아직 미연결)',exact:true}).click();
 await expect.poll(async()=>{const s=await(await request.get('/api/event-hub/admin',{headers:adminHeaders})).json();return s.events.find((e:{id:string})=>e.id===eventId).logoVersions?.length;}).toBe(2);
 e=(await(await request.get('/api/event-hub/admin',{headers:adminHeaders})).json()).events.find((e:{id:string})=>e.id===eventId);const b=e.logoVersions[1];await logo.getByLabel('저장한 장소용 로고 버전').selectOption(b.id);await logo.getByRole('button',{name:'선택한 로고를 행사에 연결',exact:true}).click();
 await expect.poll(async()=>{const s=await(await request.get('/api/event-hub/admin',{headers:adminHeaders})).json();return s.events.find((e:{id:string})=>e.id===eventId).venueLogoVersionId;}).toBe(b.id);
 if(!await logo.getByText(/원본·변경 이력과 이전 버전 복원/).evaluate(el=>(el.parentElement as HTMLDetailsElement).open)) await logo.getByText(/원본·변경 이력과 이전 버전 복원/).click();const row=logo.locator('article').filter({hasText:'격리 ON TOP 원본 A'});await row.getByRole('button',{name:'이 버전으로 복원',exact:true}).click();
 await expect.poll(async()=>{const s=await(await request.get('/api/event-hub/admin',{headers:adminHeaders})).json();return s.events.find((e:{id:string})=>e.id===eventId).venueLogoVersionId;}).toBe(a.id);
 const bytes=await request.get(a.url,{headers:adminHeaders});expect(bytes.status()).toBe(200);expect(await bytes.body()).toEqual(original);
 const guest=await browser.newContext({baseURL:process.env.HUB_E2E_BASE_URL});await restrictToLocal(guest);
 try{
   expect((await guest.request.get(a.url)).status()).toBe(404);
   await logo.getByLabel('저장한 장소용 로고 버전').selectOption(a.id);
   await expect(logo.getByRole('button',{name:'목록·상세의 공개 홍보 로고로 저장',exact:true})).toBeDisabled();
   await logo.getByLabel('선택한 로고에 연락처·상세 주소·개인정보가 없으며').check();
   await logo.getByRole('button',{name:'목록·상세의 공개 홍보 로고로 저장',exact:true}).click();
   await expect.poll(async()=>{const s=await(await request.get('/api/event-hub/admin',{headers:adminHeaders})).json();return s.events.find((e:{id:string})=>e.id===eventId).promotionLogo?.versionId;}).toBe(a.id);
   expect((await guest.request.get(a.url)).status()).toBe(200);expect((await guest.request.get(b.url)).status()).toBe(404);
   const visitor=await guest.newPage();await visitor.goto(`/events/e/${eventId}`);
   await expect(visitor.getByAltText('격리 ON TOP 원본 A',{exact:true})).toBeVisible();
   await visitor.reload();await expect(visitor.getByAltText('격리 ON TOP 원본 A',{exact:true})).toBeVisible();
   await visitor.screenshot({path:testInfo.outputPath('public-selected-logo-detail.png'),fullPage:true});
   await visitor.goto('/events');
   await expect(visitor.locator('.hub-event-list-card').first()).toBeVisible();
   const savedLogo=visitor.locator(`.hub-event-list-card img[src="${a.url}"]`);
   while(!await savedLogo.count() && await visitor.getByRole('button',{name:'행사 더 보기',exact:true}).count())await visitor.getByRole('button',{name:'행사 더 보기',exact:true}).click();
   await expect(savedLogo).toHaveAttribute('alt','격리 ON TOP 원본 A');
   await expect(savedLogo).toBeVisible();
   await logo.getByRole('button',{name:'공개 홍보 로고를 지역 기본값으로 복원',exact:true}).click();
   await expect.poll(async()=>(await guest.request.get(a.url)).status()).toBe(404);
   expect((await request.get(a.url,{headers:adminHeaders})).status()).toBe(200);
 }finally{await guest.close();}
 if(!await logo.getByText(/원본·변경 이력과 이전 버전 복원/).evaluate(el=>(el.parentElement as HTMLDetailsElement).open)) await logo.getByText(/원본·변경 이력과 이전 버전 복원/).click();await page.screenshot({path:testInfo.outputPath('admin-logo-original-restore.png'),fullPage:true});
  if(!await page.getByText("행사 설정·기록·관리 도구",{exact:true}).evaluate(el=>(el.parentElement as HTMLDetailsElement).open)) await page.getByText("행사 설정·기록·관리 도구",{exact:true}).click();
 await page.getByRole('button',{name:'운영 점검',exact:true}).click();await expect(page.getByRole('heading',{name:'코드 버전별 실제 검사결과',exact:true})).toBeVisible();if(history.runs.every((r:{historical:boolean})=>r.historical))await expect(page.getByText(/현재 코드 버전 검사결과: 미실행/)).toBeVisible();else await expect(page.getByText(/현재 코드 내용과 일치/).first()).toBeVisible();await page.getByText(/과거 버전 · github-40532639584/).click();await expect(page.getByText(/물리 기기 미검증/)).toBeVisible();await page.screenshot({path:testInfo.outputPath('admin-verification-real-history.png'),fullPage:true});
});

test("test mode real browser: isolated campaigns, durable restore, global reset and stale generation", async ({ page, request, browser }, testInfo) => {
  test.setTimeout(90000);
  const banner = "현재 테스트 및 점검 중입니다. 테스트 완료 후 신청이 오픈됩니다.";
  const directory = resolve(process.env.HUB_E2E_TEST_MODE_EVIDENCE_DIR ?? testInfo.outputPath("test-mode-evidence"));
  mkdirSync(directory, { recursive: true });
  const screenshots: { file: string; description: string }[] = [];
  const readLaboratory = async (): Promise<EventLaboratoryState> => {
    const response = await request.get("/api/event-hub/laboratory", { headers: adminHeaders });
    expect(response.status()).toBe(200);
    return response.json();
  };
  const writeLaboratory = async (operation: Record<string, unknown>) => {
    const current = await readLaboratory();
    const response = await request.post("/api/event-hub/laboratory", {
      headers: adminHeaders,
      data: { ...operation, generation: current.mode.generation, revision: current.mode.revision },
    });
    expect(response.status()).toBe(200);
    return response.json() as Promise<EventLaboratoryState>;
  };
  const operationalRecords = async () => {
    const response = await request.get("/api/event-hub/admin", { headers: adminHeaders });
    expect(response.status()).toBe(200);
    const state = await response.json();
    const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
    return {
      applications: state.applications.sort(byId),
      stocks: state.stocks.sort(byId),
      ranks: state.events.map((event: { id: string; nextRank: number }) => ({ id: event.id, nextRank: event.nextRank })).sort(byId),
      payments: state.applications.reduce((counts: Record<string, number>, app: { payment: string }) => {
        counts[app.payment] = (counts[app.payment] ?? 0) + 1;
        return counts;
      }, {}),
    };
  };
  const before = await operationalRecords();
  const adminContext = await browser.newContext({ baseURL: process.env.HUB_E2E_BASE_URL, viewport: { width: 1280, height: 1000 } });
  await restrictToLocal(adminContext);
  await adminContext.addInitScript(value => {
    localStorage.setItem("admin_token_v1", value);
    localStorage.setItem("admin_session_v1", JSON.stringify({ phone: "01000000000", authedAt: Date.now() }));
  }, token!);
  const admin = await adminContext.newPage();
  const nonLaboratoryWrites: string[] = [];
  admin.on("request", outgoing => {
    const path = new URL(outgoing.url()).pathname;
    // The compatibility database client sends SELECT reads as POST requests.
    if (path === "/api/db/op" && outgoing.postDataJSON()?.op === "select") return;
    if (["POST", "PUT", "PATCH", "DELETE"].includes(outgoing.method()) && path !== "/api/event-hub/laboratory")
      nonLaboratoryWrites.push(path);
  });
  const capture = async (target: typeof page, file: string, description: string) => {
    await target.screenshot({ path: resolve(directory, file), fullPage: true });
    screenshots.push({ file, description });
  };
  const openLaboratory = async () => {
    await admin.getByRole("button", { name: "🎉 술번개", exact: true }).click();
    const tools = admin.getByText("행사 설정·기록·관리 도구", { exact: true });
    if (!await tools.evaluate(element => (element.parentElement as HTMLDetailsElement).open)) await tools.click();
    await admin.getByRole("button", { name: "🧪 선착순 시험실", exact: true }).click();
    const settings = admin.getByText("테스트 설정", { exact: true });
    if (!await settings.evaluate(element => (element.parentElement as HTMLDetailsElement).open)) await settings.click();
  };
  const lab = admin.getByTestId("event-laboratory");
  const savedAction = async (operation: string, action: () => Promise<unknown>) => {
    const response = admin.waitForResponse(response => response.url().endsWith("/api/event-hub/laboratory") && response.request().method() === "POST" && response.request().postDataJSON().operation === operation);
    await action();
    expect((await response).status()).toBe(200);
    if (!["mode", "admission"].includes(operation)) await expect(lab).toBeEnabled();
  };
  const resetLabel = "모든 시험실의 가상 신청·결제·대기방·뽑기·경품·하트·채팅을 삭제하는 것을 확인했습니다.";
  const acknowledgeLabel = "초기화 완료를 확인했습니다. 테스트 모드 OFF 후에도 개인정보·접수 일정 등 실제 오픈 조건을 별도로 확인합니다.";
  try {
    await admin.goto("/admin");
    await openLaboratory();
    if (!(await readLaboratory()).mode.enabled)
      await savedAction("mode", () => admin.getByRole("switch", { name: "테스트 모드 ON", exact: true }).click());
    await expect(lab).toBeVisible();
    await admin.getByLabel(resetLabel, { exact: true }).check();
    await savedAction("reset", () => admin.getByRole("button", { name: "테스트 데이터 초기화", exact: true }).click());
    await expect(admin.getByRole("switch", { name: "테스트 모드 OFF", exact: true })).toBeDisabled();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByText(banner, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "술번개 신청", exact: true })).toBeDisabled();
    await expect(page.getByRole("link", { name: "행사 공지 · 관리자 문의", exact: true })).toBeVisible();
    await capture(page, "01-public-test-mode.png", "Public homepage: exact maintenance banner, disabled application, notices and inquiries available.");
    await capture(admin, "02-admin-test-mode-on.png", "Authenticated administrator: test mode ON and empty isolated workspace.");

    const scenarios = [
      ["halloween-2026-10-30", "03-halloween-friday.png", "Halloween Friday", 3],
      ["halloween-2026-10-31", "04-halloween-saturday.png", "Halloween Saturday", 3],
      ["tour-2026-11-06", "05-tour-friday.png", "Tour Friday first round", 2],
      ["tour-2026-11-07", "06-tour-saturday.png", "Tour Saturday first round", 2],
    ] as const;
    for (const [workspaceId, file, description, cards] of scenarios) {
      await admin.getByLabel("반복 테스트 시나리오", { exact: true }).selectOption(workspaceId);
      await savedAction("save", () => lab.getByLabel("가상 진행 상태", { exact: true }).selectOption("현장 입장"));
      const draw = lab.getByRole("button", { name: cards === 2 ? "추억의 뽑기 두 장 열기" : "카드 한 장 뽑기", exact: true });
      for (let i = 0; i < (cards === 2 ? 1 : 3); i++) {
        if(cards===3) await savedAction("save",()=>lab.getByLabel("시험 기준 시각 (한국시간)",{exact:true}).selectOption({label:`카드${i+1} 해제 정각`}));
        await savedAction("save", () => draw.click());
      }
      await expect(draw).toBeDisabled();
      const snapshot = (await readLaboratory()).workspaces[workspaceId] as LabSnapshot;
      expect(snapshot.applications[0].cards).toHaveLength(cards);
      if (cards === 2) {
        expect(snapshot.applications[0].cards.filter(card => card.prize !== "다음 기회에")).toHaveLength(1);
        expect(snapshot.applications[0].waivedAt).toBeUndefined();
        expect(snapshot.applications[0].payment).toBe("approved");
      }
      await expect(admin.getByRole("switch", { name: "테스트 모드 OFF", exact: true })).toBeDisabled();
      await capture(admin, file, `${description}: real shared forms and draw rules, ${cards} synthetic results, further draws disabled.`);
      // Repeat without any operational stock changes; the fresh stage restocks only this synthetic scenario.
      await savedAction("save", () => lab.getByLabel("가상 진행 상태", { exact: true }).selectOption("프로필 완료"));
      await savedAction("save", () => lab.getByLabel("가상 진행 상태", { exact: true }).selectOption("현장 입장"));
      await savedAction("save", () => draw.click());
      expect(((await readLaboratory()).workspaces[workspaceId] as LabSnapshot).applications[0].cards).toHaveLength(cards === 2 ? 2 : 1);
      if (workspaceId === "halloween-2026-10-30") {
        await savedAction("save", () => lab.getByLabel("가상 진행 상태", { exact: true }).selectOption("프로필 완료"));
        await savedAction("save", () => lab.getByLabel("시험 기준 시각 (한국시간)", { exact: true }).selectOption({ label: "해당 회차17시 직전" }));
        await lab.getByRole("button", { name: "술번개 입장하기", exact: true }).click();
        await expect(lab.getByRole("alert")).toContainText("신규 입장 기간이 종료되었습니다.");
        expect(((await readLaboratory()).workspaces[workspaceId] as LabSnapshot).entered).toBe(false);
        await savedAction("save", () => lab.getByLabel("가상 진행 상태", { exact: true }).selectOption("현장 입장"));
        await expect(draw).toBeDisabled();
        await savedAction("save", () => lab.getByLabel("시험 기준 시각 (한국시간)", { exact: true }).selectOption({ label: "해당 회차17시 만료" }));
        await expect(draw).toBeDisabled();
        await savedAction("save", () => lab.getByLabel("시험 기준 시각 (한국시간)", { exact: true }).selectOption({ label: "당일20:59:59" }));
      }
    }
    await savedAction("save", () => lab.getByRole("button", { name: "가상 A 하트 보내기", exact: true }).click());
    await savedAction("save", () => lab.getByRole("button", { name: "가상 B 하트 보내기", exact: true }).click());
    await lab.getByLabel("가상 채팅 메시지", { exact: true }).fill("격리 저장·복원 확인용 가상 메시지");
    await savedAction("save", () => lab.getByRole("button", { name: "가상 채팅 전송", exact: true }).click());
    const durable = await readLaboratory();
    expect(Object.keys(durable.workspaces)).toHaveLength(4);
    await admin.reload();
    await openLaboratory();
    await admin.getByLabel("반복 테스트 시나리오", { exact: true }).selectOption("tour-2026-11-07");
    await expect(lab.getByText("가상 A: 격리 저장·복원 확인용 가상 메시지", { exact: true })).toBeVisible();
    await expect(lab.getByRole("heading", { name: /추억의 뽑기.*2\/2/ })).toBeVisible();
    await capture(admin, "07-restored-test-results.png", "Reloaded from isolated PostgreSQL workspace: two draw results and synthetic mutual hearts/chat restored.");
    await admin.getByLabel(resetLabel, { exact: true }).check();
    await savedAction("reset", () => admin.getByRole("button", { name: "테스트 데이터 초기화", exact: true }).click());
    const clean = await readLaboratory();
    expect(clean.workspaces).toEqual({});
    expect(clean.mode.generation).toBeGreaterThan(durable.mode.generation);
    await expect(lab.getByText("가상 A: 격리 저장·복원 확인용 가상 메시지", { exact: true })).toHaveCount(0);
    await expect(lab.getByLabel("가상 진행 상태", { exact: true })).toHaveValue("기본정보 작성 중");
    const stale = await request.post("/api/event-hub/laboratory", {
      headers: adminHeaders,
      data: { operation: "save", generation: durable.mode.generation, revision: durable.mode.revision,
        workspaceId: "tour-2026-11-07", snapshot: durable.workspaces["tour-2026-11-07"] },
    });
    expect(stale.status()).toBe(409);
    expect((await stale.json()).code).toBe("STALE_LABORATORY");
    expect((await readLaboratory()).workspaces).toEqual({});
    await expect(admin.getByRole("switch", { name: "테스트 모드 OFF", exact: true })).toBeDisabled();
    await admin.getByLabel(acknowledgeLabel, { exact: true }).check();
    await expect(admin.getByRole("switch", { name: "테스트 모드 OFF", exact: true })).toBeEnabled();
    // A second administrator reset must invalidate this tab's previous acknowledgement too.
    await writeLaboratory({ operation: "reset" });
    await admin.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(admin.getByLabel(acknowledgeLabel, { exact: true })).not.toBeChecked();
    await expect(admin.getByRole("switch", { name: "테스트 모드 OFF", exact: true })).toBeDisabled();
    await capture(admin, "08-global-reset-confirmation.png", "All four workspaces erased; stale generation rejected; a new reset requires a fresh OFF acknowledgement.");
    await admin.getByLabel(acknowledgeLabel, { exact: true }).check();
    await savedAction("mode", () => admin.getByRole("switch", { name: "테스트 모드 OFF", exact: true }).click());
    await expect(admin.getByText("시험실을 사용하려면 테스트 모드를 ON으로 전환하세요.", { exact: true })).toBeVisible();
    expect((await readLaboratory()).mode.enabled).toBe(false);
    expect((await readLaboratory()).mode.publicAdmissionOpen).toBe(false);
    await page.reload();
    await expect(page.getByRole("button", { name: "술번개 신청", exact: true })).toBeDisabled();
    await page.goto("/events");
    await expect(page.getByText(/웹·오픈채팅 모두 접수 전/).first()).toBeVisible();
    const blocked = await request.post("/api/event-hub/mutate", {
      headers: adminHeaders,
      data: { action: "application.basic", target: eventId ?? "", data: {}, requestId: randomUUID() },
    });
    expect(blocked.status()).toBe(423);
    expect((await blocked.json()).code).toBe("PUBLIC_ADMISSION_CLOSED");
    const open = admin.getByRole("button", { name: "실제 모집 오픈 확인·저장", exact: true });
    await expect(open).toBeDisabled();
    await capture(admin, "09-test-off-admission-still-closed.png", "Test mode OFF alone keeps both web and open-chat application guidance blocked; separate opening confirmation required.");
    const openLabel = "테스트와 운영 준비를 마쳤으며, 웹·오픈채팅의 실제 모집을 오픈하는 것을 확인했습니다.";
    await admin.getByLabel(openLabel, { exact: true }).check();
    await expect(open).toBeEnabled();
    // Another administrator revision invalidates this tab's separate opening acknowledgement.
    await writeLaboratory({ operation: "reset" });
    await admin.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(admin.getByLabel(openLabel, { exact: true })).not.toBeChecked();
    await expect(open).toBeDisabled();
    await admin.getByLabel(openLabel, { exact: true }).check();
    await savedAction("admission", () => open.click());
    expect((await readLaboratory()).mode.publicAdmissionOpen).toBe(true);
    await page.goto("/");
    await expect(page.getByRole("link", { name: "술번개 신청", exact: true })).toHaveAttribute("href", "/events");
    await savedAction("admission", () => admin.getByRole("button", { name: "실제 신규 접수 중지", exact: true }).click());
    expect((await readLaboratory()).mode.publicAdmissionOpen).toBe(false);
    await page.reload();
    await expect(page.getByRole("button", { name: "술번개 신청", exact: true })).toBeDisabled();
    expect(nonLaboratoryWrites).toEqual([]);
    expect(await operationalRecords()).toEqual(before);
    writeFileSync(resolve(directory, "README.md"), [
      "# Test mode browser evidence", "",
      "Passed against the isolated localhost React/API/PostgreSQL fixture. No production service was accessed.", "",
      "Verified public blocking, four campaign scenarios and repeated draws, isolated durable restoration, synthetic heart/chat, global reset, stale-generation rejection, and fresh acknowledgement after another administrator reset. OFF remains closed; only a separate authenticated opening confirmation enables admission, and closing immediately blocks it again.", "",
      "For Halloween, cards unlock at 23:00, 00:00 and 00:30. New entry and new draws close at 01:00; theme expiry remains 17:00 and saved records are retained.", "",
      "Operational applications, payment states, ranks and stock records were identical before and after. Only the explicitly isolated fixture is restored to OFF and separately reopened for following regression tests; no production opening request was sent.", "",
      ...screenshots.map(shot => `- [${shot.file}](${shot.file}) — ${shot.description}`), "",
    ].join("\n"));
  } finally {
    // This is the explicitly bound local fixture, whose other CI flows require OFF.
    const clean = await writeLaboratory({ operation: "reset" });
    await writeLaboratory({ operation: "mode", enabled: false, resetGeneration: clean.mode.generation });
    await writeLaboratory({ operation: "admission", open: true, confirmOpen: true });
    expect(await operationalRecords()).toEqual(before);
    await adminContext.close();
  }
});
