import {
  test,
  expect,
  type APIRequestContext,
  request as apiRequest,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
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
test.beforeAll(async ({ request }) => {
  const date = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
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
});
test("actual browser + API + PostgreSQL: saved stages, payment recovery, private profile and exactly-once entry", async ({
  page,
  request,
  browser,
}, testInfo) => {
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
  await command(
    request,
    "admin.application.payment",
    id,
    { status: "approved", bankChecked: true },
    a.revision,
  );
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
  await page.getByRole("button", { name: "프로필 미리 설정하기" }).click();
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
  await expect(page).toHaveURL(/127\.0\.0\.1:3001\/?$/);
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
  await expect(page).toHaveURL(/127\.0\.0\.1:3001\/?$/);
  expect((await application(request, id)).profileId).toBe(profileId);
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
    }
  }
  const before = await (
    await request.get("/api/event-hub/admin", { headers: adminHeaders })
  ).json();
  await page.addInitScript((value) => {
    localStorage.setItem("admin_token_v1", value);
    localStorage.setItem(
      "admin_session_v1",
      JSON.stringify({ phone: "010-3878-6740", authedAt: Date.now() }),
    );
  }, token!);
  await page.goto("/admin");
  await page.getByRole("button", { name: "🎉 술번개", exact: true }).click();
  await page
    .getByRole("button", { name: "🧪 선착순 시험실", exact: true })
    .click();
  await expect(page.getByText("최종 납부 금액 40,000원")).toBeVisible();
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
}) => {
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
  await context.addInitScript((value) => {
    localStorage.setItem("admin_token_v1", value);
    localStorage.setItem(
      "admin_session_v1",
      JSON.stringify({ phone: "010-3878-6740", authedAt: Date.now() }),
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
