import {eventCycleMilestones} from "../../../lib/api-zod/src/event-cycle-clock";
import {
  test,
  expect,
  type APIRequestContext,
  type BrowserContext,
  request as apiRequest,
} from "@playwright/test";
import { randomUUID, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
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
async function application(request: APIRequestContext, id: string) {
  const r = await request.get("/api/event-hub/admin", {
    headers: adminHeaders,
  });
  expect(r.status()).toBe(200);
  return (await r.json()).applications.find((a: { id: string }) => a.id === id);
}
// Every browser page is denied non-local network access, including popups and media.
async function restrictToLocal(context: BrowserContext) {
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (
      url.protocol === "http:" &&
      url.hostname === "127.0.0.1" &&
      ["3001", "3002"].includes(url.port)
    )
      return route.continue();
    return route.abort("blockedbyclient");
  });
}
test.beforeEach(async ({ context }) => restrictToLocal(context));
test.beforeAll(async ({ request }) => {
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
  // At midnight KST the real rainbow guide legitimately covers the coach.
  // Acknowledge it through its real button; do not force-click or seed a seen key.
  await page.addLocatorHandler(
    page.getByRole("dialog", { name: "🌈 무지개하트가 열렸어요", exact: true }),
    async (dialog) => { await dialog.getByRole("button", { name: "확인했어요", exact: true }).click(); },
    { times: 3 },
  );
  await page.goto(`/events/e/${eventId}`);
  await page
    .getByLabel("닉네임", { exact: true })
    .fill(`검증${suffix.slice(-4)}`);
  await page.getByLabel("태어난 년도").fill("1995");
  await page.getByLabel("사는 지역").fill("부산");
  await page.getByLabel("연락용 전화번호").fill("01012345678");
  await page.getByLabel("실제 은행 입금 시 보내는 분 이름").fill("격리테스트");
  await expect(page.getByText("격리 시험 계좌", { exact: true })).toHaveCount(
    0,
  );
  await page.screenshot({
    path: testInfo.outputPath("00-actual-basic-privacy.png"),
    fullPage: true,
  });
  await page.getByLabel("[필수] 위 개인정보").check();
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
    page.getByRole("button", { name: "◌ 저장 중…", exact: true }),
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
  for (const label of [
    "[필수] 행사 공지를 확인했습니다",
    "[필수] 행사 운영을 위한 개인정보 수집",
    "[필수] 입장 후 같은 행사 참가자",
  ])
    await page.getByLabel(label).check();
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
  await expect(approvalCard.getByText(/입금 approved/)).toBeVisible();
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
  await expect(page).toHaveURL(/127\.0\.0\.1:300[12]\/?$/);
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
  await expect(page).toHaveURL(/127\.0\.0\.1:300[12]\/?$/);
  expect((await application(request, id)).profileId).toBe(profileId);
  await expect(page.getByRole("navigation",{name:"참여자 메뉴"})).toBeVisible();
  if(await page.getByTestId("first-entry-coach").isVisible()) await page.getByTestId("first-entry-coach").getByRole("button",{name:"건너뛰기",exact:true}).click();
  await page.getByRole("button",{name:"하트, 채팅",exact:true}).click();
  await expect(page.getByRole("group",{name:"내 고유번호",exact:true})).toBeVisible();
  const originalIdentity=await page.evaluate(()=>localStorage.getItem("matching_app_user_id"));
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
  expect((await application(request,id)).profileId).toBe(profileId);
  await page.goto(`/events/a/${id}`);
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
      .getByRole("button", { name: "하리보 A 지급", exact: true })
      .click();
    await expect(
      card.getByRole("button", { name: "하리보 B 지급", exact: true }),
    ).toBeDisabled();
    const winning = cards.find(
      (c: { prize: string }) => c.prize !== "다음 기회에",
    );
    if (winning) {
      await card
        .getByRole("button", { name: "상품 지급 확인", exact: true })
        .first()
        .click();
      await expect(card.getByText("지급 완료", { exact: false })).toBeVisible();
      expect((await application(request, id)).prizesGiven).toHaveLength(1);
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
        page.getByRole("heading", { name: "🎉 술번개 신청" }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      ).toBe(true);
      const inquiry = page.getByRole("button", { name: /💬 관리자 문의/ });
      await expect(inquiry).toBeVisible();
      const rect = await inquiry.boundingBox();
      expect(rect?.x).toBeGreaterThanOrEqual(0);
      expect((rect?.x ?? 0) + (rect?.width ?? 0)).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: testInfo.outputPath(
          `layout-${width}-${dark ? "dark" : "light"}.png`,
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
      ).toBe(dark ? "rgb(15, 23, 42)" : "rgb(255, 255, 255)");
      const dialogRect = await dialog.boundingBox();
      expect(dialogRect!.x).toBeGreaterThanOrEqual(0);
      expect(dialogRect!.width).toBeLessThanOrEqual(width);
      expect(dialogRect!.height).toBeLessThanOrEqual(844);
      if (width === 390)
        await page.screenshot({
          path: testInfo.outputPath(
            `inquiry-390-${dark ? "dark" : "light"}.png`,
          ),
        });
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
    }
  }
  const before = await (
    await request.get("/api/event-hub/admin", { headers: adminHeaders })
  ).json();
  await page.addInitScript((value) => {
    localStorage.setItem("admin_token_v1", value);
    localStorage.setItem(
      "admin_session_v1",
      JSON.stringify({ phone: "010-0000-0000", authedAt: Date.now() }),
    );
  }, token!);
  await page.goto("/admin");
  await page.getByRole("button", { name: "🎉 술번개", exact: true }).click();
  await page
    .getByRole("button", { name: "🧪 선착순 시험실", exact: true })
    .click();
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
  await expect(page.getByText(`나 · ${text}`)).toBeVisible();
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
  ).toHaveLength(1);
  await admin
    .getByRole("textbox", { name: "관리자 답장", exact: true })
    .fill(reply);
  await admin
    .getByRole("button", { name: "수정한 답장 보내기", exact: true })
    .click();
  await expect(
    admin.getByText(`관리자: ${reply}`, { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("관리자에게서 연락이 왔습니다", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /💬 관리자 문의/ }).click();
  await expect(
    page.getByText(`관리자 · ${reply}`, { exact: true }),
  ).toBeVisible();
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
    page.getByText("처리 상태: requested", { exact: false }),
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
      .getByRole("button", { name: "공지·미디어", exact: true })
      .click();
    const upload = admin.getByLabel(
      "사진·포스터·영상 파일 업로드 (승인자 전용)",
      { exact: false },
    );
    await upload.setInputFiles({
      name: "synthetic-poster.png",
      mimeType: "image/png",
      buffer: Buffer.from(png, "base64"),
    });
    await expect(
      admin.getByText("저장되었습니다 ✓", { exact: true }),
    ).toBeVisible();
    const latest = await (
      await request.get("/api/event-hub/admin", { headers: adminHeaders })
    ).json();
    expect(
      latest.events.find((v: { id: string }) => v.id === eventId).media,
    ).toHaveLength(3);
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
    const toggle = page.getByLabel("토요일 자동 초안 생성", { exact: true });
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
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await page.locator(".application-tutorial .line-clamp-2").evaluateAll(elements=>elements.every(element=>element.scrollHeight<=element.clientHeight+1))).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("campaign-application-guide-390.png"),
  });
  await page.getByRole("dialog").getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "알겠어요", exact: true }).click();
  await page
    .getByLabel("닉네임", { exact: true })
    .fill(`행사${suffix.slice(-4)}`);
  await page.getByLabel("태어난 년도").fill("1995");
  await page.getByLabel("사는 지역").fill("부산");
  await page.getByLabel("연락용 전화번호").fill("01000000000");
  await page.getByLabel("실제 은행 입금 시 보내는 분 이름").fill("가상행사");
  await expect(page.getByText("범일 비턴점", { exact: false })).toHaveCount(0);
  await expect(page.getByText("격리 시험 계좌", { exact: true })).toHaveCount(
    0,
  );
  await page.getByLabel("[필수] 위 개인정보").check();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  for (const label of [
    "[필수] 행사 공지를 확인했습니다",
    "[필수] 행사 운영을 위한 개인정보 수집",
    "[필수] 입장 후 같은 행사 참가자",
  ])
    await page.getByLabel(label).check();
  await page.getByRole("button", { name: "동의하고 다음" }).click();
  const appId = page.url().split("/").pop()!;
  let a = await application(request, appId);
  const expected =
    [0, 12000, 14000, 16000, 16000, 18000, 18000, 18000, 18000, 18000][
      a.rank - 1
    ] ?? 20000;
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
  await page.getByRole("dialog").getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "알겠어요", exact: true }).click();
  await page
    .getByLabel("닉네임", { exact: true })
    .fill(`투어${suffix.slice(-4)}`);
  await page.getByLabel("태어난 년도").fill("1995");
  await page.getByLabel("사는 지역").fill("인천");
  await page.getByLabel("연락용 전화번호").fill("01000000000");
  await page.getByLabel("실제 은행 입금 시 보내는 분 이름").fill("가상투어");
  await page.getByLabel("[필수] 위 개인정보").check();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  for (const label of [
    "[필수] 행사 공지를 확인했습니다",
    "[필수] 행사 운영을 위한 개인정보 수집",
    "[필수] 입장 후 같은 행사 참가자",
  ])
    await page.getByLabel(label).check();
  await page.getByRole("button", { name: "동의하고 다음" }).click();
  await expect(
    page.getByText("선입금액 (최종 회비 아님) 17,000원", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/최종 납부 금액/)).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("campaign-tour-advance-not-final.png"),
    fullPage: true,
  });
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
  await page.getByRole("dialog").getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "알겠어요", exact: true }).click();
  await page
    .getByLabel("닉네임", { exact: true })
    .fill(`사진${suffix.slice(-4)}`);
  await page.getByLabel("태어난 년도").fill("1990");
  await page.getByLabel("사는 지역").fill("부산");
  await page.getByLabel("연락용 전화번호").fill("01000000000");
  await page.getByLabel("실제 은행 입금 시 보내는 분 이름").fill("가상사진");
  await page.getByLabel("[필수] 위 개인정보").check();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  for (const label of [
    "[필수] 행사 공지를 확인했습니다",
    "[필수] 행사 운영을 위한 개인정보 수집",
    "[필수] 입장 후 같은 행사 참가자",
  ])
    await page.getByLabel(label).check();
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
  await expect(page.locator('[data-campaign-theme="halloween"]')).toBeVisible();
  await page.clock.pauseAt(new Date("2026-10-31T16:59:59+09:00"));
  await page.screenshot({
    path: testInfo.outputPath("halloween-before-1700.png"),
    fullPage: true,
  });
  await page.clock.runFor(1000);
  await expect(page.locator('[data-campaign-theme="halloween"]')).toHaveCount(
    0,
  );
  await expect(page.locator('[data-campaign-theme="default"]')).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("halloween-at-1700-restored.png"),
    fullPage: true,
  });
  const after = await application(request, id);
  expect(after.payment).toBe(before.payment);
  expect(after.quote).toEqual(before.quote);
  expect(after.cards).toEqual(before.cards);
});

test("V3 actual app: phone-only reward record, late-arrival review and eight received logos preserve ownership",async({page,request,browser},testInfo)=>{
 const code=randomBytes(32).toString("base64url");
 await page.request.post("/api/event-hub/session",{data:{recoveryCode:code,create:true}});
 const user=async(action:string,target:string,data:Record<string,unknown>,revision?:number)=>{
  const response=await page.request.post("/api/event-hub/mutate",{data:{action,target,data,revision,requestId:randomUUID()}});
  expect(response.status()).toBe(200);return response.json();
 };
 const nickname="추가"+suffix.slice(-3);
 const {id}=await user("application.basic","",{eventId,basic:{nickname,birthYear:1995,location:"부산",phone:"01000000000",depositor:"합성",collection:true,version:"2026-10-27-event-v6"}});
 await user("application.consent",id,{consent:{collection:true,sharing:true,notice:true,version:"2026-10-27-event-v6"}},1);
 await user("application.confirm",id,{},2);
 await page.addInitScript((id)=>sessionStorage.setItem("binpc2_application_guide_v6:"+id,"1"),eventId);
 await page.goto("/events/a/"+id);
 await page.getByLabel("상품·상금·할인 기록용 전화번호",{exact:true}).fill("01011110000");
 await page.getByRole("button",{name:"기록용 전화번호 저장",exact:true}).click();
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
  await admin.getByRole("button",{name:"경품·상금·할인 결과",exact:true}).click();
  await admin.getByLabel("번호·닉네임·행사 검색",{exact:true}).fill(nickname);
  await admin.getByRole("button",{name:"권한 있는 관리자 상세 열람",exact:true}).click();
  await expect(admin.getByText("전화번호 01011110000",{exact:true})).toBeVisible();
  await admin.getByLabel("늦참 검토 사유",{exact:true}).fill("현장 확인 후 안내");
  await admin.getByRole("button",{name:"늦참 승인",exact:true}).click();
  await expect.poll(async()=> (await application(request,id)).lateArrival?.status).toBe("approved");
  await admin.screenshot({path:testInfo.outputPath("v3-admin-benefit-phone-late-review.png"),fullPage:true});
  await admin.getByRole("button",{name:"행사·자동방",exact:true}).click();
  await admin.getByText("수령한 7개 매장 로고 확인",{exact:true}).click();
  for(const name of ["레드홀 · RED HOLE","페이크 · FAKE","자크 · JACK","M가라오케 · M KARAOKE (기존 제작 시안)","스피드 · SPEED","체크인 · CHECK-IN","온탑 · ON TOP","고래 Gorae 감사용 로고"]){
   await admin.getByAltText(name,{exact:true}).scrollIntoViewIfNeeded();
   await expect.poll(()=>admin.getByAltText(name,{exact:true}).evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
  }
  await admin.screenshot({path:testInfo.outputPath("v3-eight-logos-actual-admin.png"),fullPage:true});
 }finally{await adminContext.close();}
 await page.screenshot({path:testInfo.outputPath("v3-participant-late-arrival-phone.png"),fullPage:true});
});
