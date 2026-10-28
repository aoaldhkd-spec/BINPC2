import {
  test,
  expect,
  type APIRequestContext,
  type BrowserContext,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
const token = process.env.HUB_E2E_ADMIN_TOKEN;
if (!token) throw Error("Explicit isolated admin binding required");
const headers = { "x-admin-token": token };
async function cmd(
  r: APIRequestContext,
  action: string,
  target = "",
  data: Record<string, unknown> = {},
  revision?: number,
) {
  const response = await r.post("/api/event-hub/mutate", {
    headers,
    data: { action, target, data, revision, requestId: randomUUID() },
  });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}
async function state(r: APIRequestContext) {
  const response = await r.get("/api/event-hub/admin", { headers });
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function rpc(
  r: APIRequestContext,
  name: string,
  data: Record<string, unknown>,
) {
  const response = await r.post("/api/db/rpc/" + name, {
    data: { ...data, adminToken: token },
  });
  const body = await response.json();
  expect(response.status()).toBe(200);
  expect(body.error).toBeFalsy();
  return body;
}
async function local(context: BrowserContext) {
  const origin = process.env.HUB_E2E_BASE_URL!;
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin
      ? route.continue()
      : route.abort(),
  );
  const offset = Number(process.env.HUB_E2E_CLOCK_OFFSET_MS ?? 0);
  await context.addInitScript((value) => {
    const N = Date;
    class D extends N {
      constructor(...args: unknown[]) {
        super(...((args.length ? args : [N.now() + value]) as [string]));
      }
      static now() {
        return N.now() + value;
      }
    }
    globalThis.Date = D as DateConstructor;
  }, offset);
}
async function admin(context: BrowserContext) {
  await context.addInitScript((value) => {
    localStorage.setItem("admin_token_v1", value);
    localStorage.setItem(
      "admin_session_v1",
      JSON.stringify({ phone: "01000000000", authedAt: Date.now() }),
    );
  }, token!);
}
test.beforeEach(async ({ context }) => {
  await local(context);
});
test("V4 main uses central actions; actual server start activates entry and inquiry is route-scoped", async ({
  page,
  request,
}, info) => {
  const ready = await (await request.get("/api/db/ready")).json(),
    wasActive = Boolean(ready.settings?.session_active);
  try {
    await rpc(request, "admin_toggle_session", { p_active: false });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const entry = page.getByRole("button", { name: "입장하기", exact: true });
    await expect(entry).toBeDisabled();
    for (const label of [
      "입장 전 체크",
      "모임이 시작되었습니다",
      "관리자 문의",
    ])
      await expect(page.getByText(label, { exact: true })).toHaveCount(0);
    const application = page.getByRole("link", {
        name: "술번개 신청",
        exact: true,
      }),
      waiting = page.getByRole("link", { name: "신청대기방", exact: true });
    const rects = await Promise.all(
      [application, waiting, entry].map((l) => l.boundingBox()),
    );
    expect(rects[0]!.y + rects[0]!.height).toBeLessThanOrEqual(rects[2]!.y);
    expect(rects[1]!.y + rects[1]!.height).toBeLessThanOrEqual(rects[2]!.y);
    await page.screenshot({
      path: info.outputPath("v4-home-before-start.png"),
      fullPage: true,
    });
    await rpc(request, "admin_toggle_session", { p_active: true });
    await expect(entry).toBeEnabled({ timeout: 20000 });
    await page.screenshot({
      path: info.outputPath("v4-home-after-start.png"),
      fullPage: true,
    });
    await application.click();
    const inquiry = page.getByRole("button", { name: /관리자 문의/ });
    await expect(inquiry).toBeVisible();
    const bounds = await inquiry.boundingBox();
    expect(bounds!.x).toBeGreaterThan(195);
    await inquiry.click();
    await page
      .getByLabel("문의 내용", { exact: true })
      .fill("작성 중인 가상 문의");
    await page.goBack();
    await expect(page.getByRole("dialog", { name: "관리자 문의" })).toHaveCount(
      0,
    );
    await inquiry.click();
    await expect(page.getByLabel("문의 내용", { exact: true })).toHaveValue(
      "작성 중인 가상 문의",
    );
    await page.getByRole("button", { name: "닫기", exact: true }).click();
    await page.reload();
    await inquiry.click();
    await expect(page.getByLabel("문의 내용", { exact: true })).toHaveValue(
      "작성 중인 가상 문의",
    );
    await page.screenshot({
      path: info.outputPath("v4-inquiry-draft-reopen.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "닫기", exact: true }).click();
    await page.goto("/");
    await expect(page.getByRole("button", { name: /관리자 문의/ })).toHaveCount(
      0,
    );
  } finally {
    await rpc(request, "admin_toggle_session", { p_active: wasActive });
  }
});
test("V4 integrated overview shows both Halloween inventories without mutation on view switches", async ({
  page,
  context,
  request,
}, info) => {
  await admin(context);
  const ids = [];
  for (const date of ["2026-10-30", "2026-10-31"])
    ids.push((await cmd(request, "campaign.prepare", "halloween-" + date)).id);
  const before = await state(request);
  let mutations = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/event-hub/mutate")) mutations++;
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "🎉 술번개", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "전체 운영", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: info.outputPath("v4-admin-overview.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "현장·상품", exact: true }).click();
  await expect(
    page.getByText("금요일 예정 배분 23개", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("토요일 예정 배분 49개", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("v4-both-day-products.png"),
    fullPage: true,
  });
  for (const width of [320, 360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      )
      .toBe(true);
  }
  for (const name of [/10\/30 금요일/, /10\/31 토요일/, "전체"])
    await page
      .getByRole("button", { name, exact: typeof name === "string" })
      .click();
  expect(mutations).toBe(0);
  const after = await state(request);
  expect(after.stocks).toEqual(before.stocks);
  expect(after.applications).toEqual(before.applications);
});
test("V4 notice/map actual file preview, save, reopen, approval ACL and context-safe drafts", async ({
  page,
  context,
  browser,
  request,
}, info) => {
  await admin(context);
  const now = (await state(request)).serverNow,
    date = new Date(Date.parse(now) + 9 * 3600000).toISOString().slice(0, 10);
  const created = await cmd(request, "event.save", "", {
    title: "사진 흐름 검증",
    date,
    start: "22:00",
    end: "01:00",
    area: "가상 지역",
    address: "가상 상세 장소",
    fee: 10000,
    account: "실제 송금 금지",
    deadline: "행사 전",
    notice: "신분증을 준비해 주세요.",
  });
  const id = created.id;
  await cmd(
    request,
    "event.recruitment",
    id,
    { enabled: true, immediate: true },
    1,
  );
  await page.goto("/admin");
  await page.getByRole("button", { name: "🎉 술번개", exact: true }).click();
  await page.getByLabel("관리할 행사").selectOption(id);
  await page.getByRole("button", { name: "공지·장소", exact: true }).click();
  await page
    .getByLabel("참가자 공지", { exact: true })
    .fill("금·토 모두 다음 날 01시에 종료합니다.");
  const file = {
    name: "synthetic-notice.png",
    mimeType: "image/png",
    buffer: readFileSync(
      new URL("../public/tour-logos-v3/on_top.png", import.meta.url),
    ),
  };
  await page
    .getByLabel("공지 사진 파일 선택", { exact: true })
    .setInputFiles(file);
  await expect(page.getByAltText("선택한 자료 미리보기")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "선택한 자료 저장", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("신청 전 공개할 공지 사진입니다.").check();
  await page.getByLabel("사진 설명", { exact: true }).fill("공개 공지 검증");
  await page.screenshot({
    path: info.outputPath("v4-notice-preview.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "선택한 자료 저장", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await state(request)).events.find((e: { id: string }) => e.id === id)
          .materials?.length,
    )
    .toBe(1);
  await page
    .getByRole("button", { name: "지도·약도 사진 추가", exact: true })
    .click();
  await page
    .getByLabel("지도·약도 사진 파일 선택", { exact: true })
    .setInputFiles({ ...file, name: "synthetic-map.png" });
  await page.getByLabel("사진 설명", { exact: true }).fill("승인자 지도 검증");
  await page
    .getByRole("button", { name: "선택한 자료 저장", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await state(request)).events.find((e: { id: string }) => e.id === id)
          .materials?.length,
    )
    .toBe(2);
  await page.getByRole("button", { name: "신청·입금", exact: true }).click();
  await page.getByRole("button", { name: "공지·장소", exact: true }).click();
  await expect(page.getByLabel("참가자 공지", { exact: true })).toHaveValue(
    "금·토 모두 다음 날 01시에 종료합니다.",
  );
  await page
    .getByRole("button", { name: "공지·장소 저장", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await state(request)).events.find((e: { id: string }) => e.id === id)
          .notice,
    )
    .toBe("금·토 모두 다음 날 01시에 종료합니다.");
  await page.reload();
  await page.getByRole("button", { name: "🎉 술번개", exact: true }).click();
  await page.getByLabel("관리할 행사").selectOption(id);
  await page.getByRole("button", { name: "공지·장소", exact: true }).click();
  await expect(
    page.getByAltText("공개 공지 검증", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByAltText("승인자 지도 검증", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("v4-photos-reopened.png"),
    fullPage: true,
  });
  const e = (await state(request)).events.find(
      (e: { id: string }) => e.id === id,
    ),
    notice = e.materials.find(
      (m: { purpose: string }) => m.purpose === "notice",
    ),
    map = e.materials.find((m: { purpose: string }) => m.purpose === "map");
  const participant = await browser.newContext({
    baseURL: process.env.HUB_E2E_BASE_URL,
  });
  try {
    await local(participant);
    const user = await participant.newPage();
    await user.goto("/events/e/" + id);
    await expect(
      user.getByAltText("공개 공지 검증", { exact: true }),
    ).toBeVisible();
    await expect(
      user.getByAltText("승인자 지도 검증", { exact: true }),
    ).toHaveCount(0);
    expect((await user.request.get(map.url)).status()).toBe(404);
    expect((await user.request.get(notice.url)).status()).toBe(200);
    await user
      .getByLabel("닉네임", { exact: true })
      .fill("사진" + String(Date.now()).slice(-4));
    await user.getByLabel("태어난 년도").fill("1995");
    await user.getByLabel("사는 지역").fill("부산");
    await user.getByLabel("연락용 전화번호").fill("01000000000");
    await user.getByLabel("실제 은행 입금 시 보내는 분 이름").fill("가상");
    await user.getByLabel("[필수] 위 개인정보").check();
    await user.getByRole("button", { name: "다음", exact: true }).click();
    await expect(user).toHaveURL(/\/events\/a\//);
    const appId = user.url().split("/").pop()!;
    await user.getByLabel("[필수] 행사 운영을 위한 개인정보 수집").check();
    await user.getByLabel("[필수] 입장 후 같은 행사 참가자에게").check();
    await user.getByLabel("[필수] 행사 공지를").check();
    await user.getByRole("button", { name: /동의.*다음|동의.*회비/ }).click();
    await expect(
      user.getByText("계좌·예금주: 실제 송금 금지", { exact: true }),
    ).toBeVisible();
    await user
      .getByRole("button", { name: "금액 확인 후 신청 확정", exact: true })
      .click();
    await user.getByRole("button", { name: /입금했어요/ }).click();
    await expect.poll(async()=> (await state(request)).applications.find((a:{id:string})=>a.id===appId)?.payment).toBe('reported');
    const app = (await state(request)).applications.find(
      (a: { id: string }) => a.id === appId,
    );
    await cmd(
      request,
      "admin.application.payment",
      app.id,
      { status: "approved", bankChecked: true },
      app.revision,
    );
    await expect(
      user.getByAltText("승인자 지도 검증", { exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await user.reload();
    await expect(
      user.getByAltText("승인자 지도 검증", { exact: true }),
    ).toBeVisible();
    await user.screenshot({
      path: info.outputPath("v4-approved-map-waiting.png"),
      fullPage: true,
    });
  } finally {
    await participant.close();
  }
});
test("V4 new-event photo survives upload failure without duplicate event; drafts stay with their date", async ({
  page,
  context,
  request,
}, info) => {
  await admin(context);
  const before = await state(request);
  await page.goto("/admin");
  await page.getByRole("button", { name: "🎉 술번개", exact: true }).click();
  await page.getByText("행사 설정·기록·관리 도구", { exact: true }).click();
  await page.getByRole("button", { name: "행사·자동방", exact: true }).click();
  await page
    .getByRole("button", { name: "+ 술번개 만들기", exact: true })
    .click();
  await page.getByLabel("행사 제목", { exact: true }).fill("새 행사 사진 검증");
  await page.getByLabel("날짜", { exact: true }).fill("2026-11-07");
  await page
    .getByLabel("공지 사진 파일 선택", { exact: true })
    .setInputFiles({
      name: "synthetic-new-event.png",
      mimeType: "image/png",
      buffer: readFileSync(
        new URL("../public/tour-logos-v3/on_top.png", import.meta.url),
      ),
    });
  await expect(page.getByAltText("선택한 자료 미리보기")).toBeVisible();
  expect((await state(request)).events.length).toBe(before.events.length);
  await page.getByLabel("신청 전 공개할 공지 사진입니다.").check();
  let fail = true;
  await page.route("**/api/event-hub/mutate", async (route) => {
    if (
      route.request().postDataJSON().action === "event.media.upload" &&
      fail
    ) {
      fail = false;
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: "합성 저장 실패",
          code: "TEST_TRANSIENT",
        }),
      });
    }
    return route.continue();
  });
  await page
    .getByRole("button", { name: "선택한 자료 저장", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByAltText("선택한 자료 미리보기")).toBeVisible();
  expect((await state(request)).events.length).toBe(before.events.length + 1);
  await page
    .getByRole("button", { name: "선택한 자료 저장", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await state(request)).events.filter(
          (e: { id: string }) =>
            !before.events.some((b: { id: string }) => b.id === e.id),
        )[0]?.materials?.length ?? 0,
    )
    .toBe(1);
  expect((await state(request)).events.length).toBe(before.events.length + 1);
  await page.screenshot({
    path: info.outputPath("v4-new-event-upload-retried.png"),
    fullPage: true,
  });
  await page.unroute("**/api/event-hub/mutate");
  const dates = (await state(request)).events
    .filter((e: { campaign?: { kind: string } }) =>
      e.campaign?.kind.startsWith("halloween"),
    )
    .sort((a: { date: string }, b: { date: string }) =>
      a.date.localeCompare(b.date),
    );
  await page.getByLabel("관리할 행사").selectOption(dates[0].id);
  await page.getByRole("button", { name: "공지·장소", exact: true }).click();
  const text = "금요일에만 보관할 작성 중 공지";
  await page.getByLabel("참가자 공지", { exact: true }).fill(text);
  await page.getByRole('button',{name:'설정',exact:true}).click();
  await page.getByRole('button',{name:'🎉 술번개',exact:true}).click();
  await expect(page.getByLabel('참가자 공지',{exact:true})).toHaveValue(text);
  await page.getByLabel("관리할 행사").selectOption(dates[1].id);
  await expect(page.getByLabel("참가자 공지", { exact: true })).not.toHaveValue(
    text,
  );
  await page.getByLabel("관리할 행사").selectOption(dates[0].id);
  await expect(page.getByLabel("참가자 공지", { exact: true })).toHaveValue(
    text,
  );
  expect(
    (await state(request)).events.find(
      (e: { id: string }) => e.id === dates[0].id,
    ).notice,
  ).toBe(dates[0].notice);
});
