import { test, expect, type APIRequestContext, type BrowserContext } from "@playwright/test";
import { randomUUID, randomBytes } from "node:crypto";
import { campaignPresets } from "../../../lib/api-zod/src/event-campaign";
import { tourSessionSchedule } from "../../../lib/api-zod/src/event-policy-tour";
const token = process.env.HUB_E2E_ADMIN_TOKEN;
if (!token) throw Error("Dedicated isolated administrator binding required");
const headers = { "x-admin-token": token };
async function local(context: BrowserContext) {
  await context.route("**/*", (route) => {
    const u = new URL(route.request().url());
    return u.origin === process.env.HUB_E2E_BASE_URL ? route.continue() : route.abort("blockedbyclient");
  });
  const offset = Number(process.env.HUB_E2E_CLOCK_OFFSET_MS);
  if (!Number.isFinite(offset)) throw Error("Explicit isolated clock required");
  await context.addInitScript((value) => {
    const Native = Date;
    class Fixture extends Native {
      constructor(...args: unknown[]) { super(...(args.length ? args : [Native.now() + value]) as [string]); }
      static now() { return Native.now() + value; }
    }
    globalThis.Date = Fixture as DateConstructor;
  }, offset);
}
test.beforeEach(async ({ context }) => local(context));
async function admin(request: APIRequestContext) {
  const r = await request.get("/api/event-hub/admin", { headers });
  expect(r.status()).toBe(200); return r.json();
}
async function command(request: APIRequestContext, action: string, target = "", data = {}, revision?: number) {
  const r = await request.post("/api/event-hub/mutate", { headers, data: { action, target, data, revision, requestId: randomUUID() } });
  expect(r.status(), `${action}: ${r.status()}`).toBe(200); return r.json();
}
test("V12 staged basic draft: failed save stays put, reload resumes, lost final reply produces one application and password login restores it", async ({ page, request, browser }, info) => {
  const event = await command(request, "event.save", "", { title: "격리 V12 이어쓰기", type: "normal", date: "2030-01-05", start: "22:00", end: "01:00", area: "합성 시험", address: "승인자 전용 합성 장소", account: "실제 송금 금지", fee: 30000, deadline: "시험 전용", notice: "합성 데이터만 사용하는 V12 자동검사" });
  await command(request, "event.recruitment", event.id, { enabled: true }, 1);
  await page.goto(`/events/e/${event.id}`);
  await expect(page.getByLabel("닉네임", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "신청하기", exact: true }).click();
  await expect(page.getByLabel("[필수] 위 개인정보")).not.toBeChecked();
  await expect(page.getByRole("button", { name: "다음", exact: true })).toBeDisabled();
  await page.getByLabel("[필수] 위 개인정보").check();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  const nickname = "복원" + String(Date.now()).slice(-4);
  await page.getByLabel("닉네임", { exact: true }).fill(nickname);
  let failOnce = true;
  await page.route("**/api/event-hub/mutate", async (route) => {
    if (failOnce && route.request().postDataJSON().action === "application.basic-draft") { failOnce = false; return route.abort("internetdisconnected"); }
    await route.continue();
  });
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("닉네임", { exact: true })).toHaveValue(nickname);
  await expect(page.getByLabel("태어난 년도", { exact: true })).toHaveCount(0);
  await page.unroute("**/api/event-hub/mutate");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByLabel("태어난 년도", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "신청하기", exact: true }).click();
  await expect(page.getByLabel("태어난 년도", { exact: true })).toBeVisible();
  for (const [label, value] of [["태어난 년도", "1995"], ["사는 지역", "합성 지역"], ["연락용 전화번호 (문자 인증 없음)", "01000000000"]]) {
    await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByRole("button", { name: "다음", exact: true }).click();
  }
  await page.getByLabel("실제 은행 입금 시 보내는 분 이름").fill("합성 입금자");
  let dropped = false;
  await page.route("**/api/event-hub/mutate", async (route) => {
    if (!dropped && route.request().postDataJSON().action === "application.basic") {
      dropped = true; const saved = await route.fetch(); expect(saved.status()).toBe(200); return route.abort("connectionclosed");
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page).toHaveURL(/\/events\/a\//, { timeout: 15000 });
  expect(dropped).toBe(true);
  await page.unroute("**/api/event-hub/mutate");
  const id = page.url().split("/").pop();
  expect((await admin(request)).applications.filter((a: { eventId: string }) => a.eventId === event.id)).toHaveLength(1);
  await page.getByText("다음에도 닉네임으로 로그인하기", { exact: true }).click();
  const password = randomBytes(20).toString("base64url");
  await page.getByLabel("로그인 비밀번호 (10자 이상)", { exact: true }).fill(password);
  await page.getByLabel("로그인 비밀번호 확인", { exact: true }).fill(password);
  await page.getByLabel("[선택] 다음 행사에도 내 기본정보와 프로필을 재사용하는 데 동의합니다", { exact: true }).check();
  await page.getByRole("button", { name: "로그인 설정 저장", exact: true }).click();
  await expect(page.getByRole("heading", { name: "재사용 프로필·안내 수신" })).toBeVisible();
  await expect(page.getByLabel("향후 행사 광고성 안내 받기 (별도 선택)")).not.toBeChecked();
  expect(await page.evaluate((secret) => JSON.stringify(localStorage).includes(secret) || JSON.stringify(sessionStorage).includes(secret), password)).toBe(false);
  const other = await browser.newContext({ baseURL: process.env.HUB_E2E_BASE_URL });
  await local(other);
  try {
    const p = await other.newPage(); await p.goto("/events/waiting");
    await p.getByText("이전 신청 복구 / 기존 신청자 로그인", { exact: true }).click();
    await p.getByLabel("닉네임", { exact: true }).fill(nickname); await p.getByLabel("비밀번호", { exact: true }).fill(password);
    await p.getByRole("button", { name: "기존 신청자 로그인", exact: true }).click();
    await expect.poll(async () => (await (await p.request.get("/api/event-hub/state")).json()).applications.map((a: { id: string }) => a.id)).toEqual([id]);
    await p.goto(`/events/a/${id}`); await expect(p.getByRole("heading", { name: "공지 확인·동의" })).toBeVisible();
    await p.screenshot({ path: info.outputPath("v12-password-restored-same-application.png"), fullPage: true });
  } finally { await other.close(); }
});

test("V12 Daegu four days use provided BLACK, preserve all 20 tour dates and render at seven viewport widths", async ({ page, request }, info) => {
  test.setTimeout(90000);
  const ids: Record<string, string> = {};
  for (const p of campaignPresets().filter((p) => p.event.campaign?.kind === "tour")) ids[p.event.date] = (await command(request, "campaign.prepare", p.key)).id;
  expect(Object.keys(ids)).toHaveLength(20);
  for (const date of ["2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06"]) {
    const e = (await admin(request)).events.find((e: { id: string }) => e.id === ids[date]);
    expect(e.venueLogoId).toBe("black"); expect(e.area).toContain("대구"); expect(e.notice).toContain(date);
    expect(Date.parse(`${date}T${e.start}:00+09:00`)).toBe(Date.parse(tourSessionSchedule(date)!.first.startsAt));
    await command(request, "event.save", e.id, { ...e, opensAt: "2000-01-01T00:00:00.000Z", account: "실제 송금 금지", deadline: "합성 시험", campaign: { ...e.campaign, advance: 17000 } }, e.revision);
    const current = (await admin(request)).events.find((v: { id: string }) => v.id === e.id);
    await command(request, "event.recruitment", e.id, { enabled: true }, current.revision);
  }
  await page.addInitScript(() => sessionStorage.setItem("binpc2_application_guide_v6:tour", "1"));
  for (const width of [320, 360, 390, 430, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/events/e/${ids["2026-12-03"]}`);
    const logo = page.getByAltText("블랙 · BLACK", { exact: true }).first();
    await expect(logo).toBeVisible();
    expect(await logo.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth === 2048 && getComputedStyle(i).objectFit === "contain")).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath(`v12-daegu-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/events");
  const tourCard = page.locator(".hub-event-list-card").filter({ hasText: "대구 전국투어" }).first();
  await expect(tourCard).toBeVisible();
  expect((await tourCard.boundingBox())!.height).toBeLessThan(240);
  await expect(tourCard.getByAltText("블랙 · BLACK", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("v12-tour-list-compact.png"), fullPage: true });
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:900});
    await expect(page.getByRole('region',{name:'전국투어 지역 안내'})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    const map=page.getByAltText('대한민국 지도: 인천, 종로, 광주, 신림, 대구 전국투어 지역');
    expect(await map.evaluate((i:HTMLImageElement)=>i.complete&&i.naturalWidth>0)).toBe(true);
    await page.screenshot({path:info.outputPath(`v12-korea-tour-map-${width}.png`),fullPage:true});
  }
  await page.getByRole('button',{name:/05 대구/}).click();
  await expect(page.locator('.hub-event-list-card')).toHaveCount(4);
  for(const card of await page.locator('.hub-event-list-card').all())await expect(card).toContainText('대구 전국투어');
  await page.getByRole('button',{name:'전체 행사 다시 보기'}).click();
  await page.addInitScript((t) => { localStorage.setItem("admin_token_v1", t); localStorage.setItem("admin_session_v1", JSON.stringify({ phone: "01000000000", authedAt: Date.now() })); }, token!);
  await page.goto("/admin"); await page.getByRole("button", { name: "🎉 술번개", exact: true }).click();
  for (const [date, id] of Object.entries(ids)) {
    await expect(page.getByLabel("관리할 행사", { exact: true }).locator(`option[value="${id}"]`), date).toHaveCount(1);
  }
  await page.getByLabel("관리할 행사", { exact: true }).selectOption(ids["2026-12-06"]);
  await page.screenshot({ path: info.outputPath("v12-daegu-admin-date-selector.png"), fullPage: true });
});

test("V12 inquiry consent is once per version, IME Enter does not send, and reopening keeps the unsent draft", async ({ page, request }, info) => {
  await page.goto("/events/waiting"); await page.getByRole("button", { name: /💬 관리자 문의/ }).click();
  const input = page.getByLabel("문의 내용", { exact: true });
  const text = "한글 조합 시험 " + String(Date.now()).slice(-5);
  await input.fill(text); await page.getByLabel("문의 처리 목적으로").check();
  await input.dispatchEvent("compositionstart");
  await input.dispatchEvent("keydown", { key: "Enter", ctrlKey: true, isComposing: true, keyCode: 229 });
  await input.dispatchEvent("compositionend");
  await expect(input).toHaveValue(text);
  expect((await admin(request)).threads.some((t: { messages: { text: string }[] }) => t.messages.some((m) => m.text === text))).toBe(false);
  await page.getByRole("button", { name: "문의 보내기", exact: true }).click();
  await expect(page.getByText(text, { exact: true })).toBeVisible();
  await expect(page.getByLabel("문의 처리 목적으로")).toHaveCount(0);
  await input.fill("다음 질문\n줄바꿈 보존"); await page.keyboard.press("Escape");
  await page.reload(); await page.getByRole("button", { name: /💬 관리자 문의/ }).click();
  await expect(input).toHaveValue("다음 질문\n줄바꿈 보존");
  await expect(page.getByLabel("문의 처리 목적으로")).toHaveCount(0);
  await page.getByRole("button", { name: "문의 보내기", exact: true }).click();
  await expect(page.getByText("다음 질문\n줄바꿈 보존", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("v12-inquiry-chat-once-consent.png"), fullPage: true });
});


test("V12 accessible navigation survives missing decorations, text zoom and reduced motion", async ({ page, context }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({width:320,height:740});
  let missingAssets = 0;
  await context.route(/\.(?:png|webp|svg|jpg)(?:\?|$)/,r=>{ missingAssets++; return r.abort('failed'); });
  await page.goto('/events');
  await expect(page.getByRole('heading',{name:'술번개 신청',exact:true})).toBeVisible();
  await page.evaluate(()=>document.documentElement.style.fontSize='20px');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
  await page.keyboard.press('Tab');
  const focused=await page.evaluate(()=>({tag:document.activeElement?.tagName,label:document.activeElement?.getAttribute('aria-label')||document.activeElement?.textContent?.trim(),outline:document.activeElement?getComputedStyle(document.activeElement).outlineStyle:''}));
  expect(['A','BUTTON','INPUT']).toContain(focused.tag); expect(focused.label).toBeTruthy();
  expect(focused.outline).not.toBe('none');
  for(const width of [740,320]){
    await page.setViewportSize({width,height:width===320?740:320});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
  }
  expect(missingAssets).toBeGreaterThan(0);
  await expect(page.locator('.hub-event-list-card').first()).toBeVisible();
  const animations=await page.locator('.hub-event-list-card').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).animationName));
  expect(animations.every(name=>name==='none')).toBe(true);
  await page.screenshot({path:info.outputPath('v12-accessible-events-320-textzoom.png'),fullPage:true});
  await info.attach('keyboard-textzoom-motion',{body:JSON.stringify({focused,widths:[320,740],textSize:20,reducedMotion:true,missingAssets,animations,scope:'Public event list; not all menus or physical screen readers'}),contentType:'application/json'});
});

test('CURRENT address editor saves, reopens, blocks unsaved links and preserves original fields on mobile/tablet/PC',async({page,request},info)=>{
  const e=await command(request,'event.save','',{title:'격리 주소 연결 검사',type:'normal',date:'2030-01-05',start:'22:00',end:'01:00',area:'합성 지역',address:'',account:'실제 송금 금지',fee:30000,deadline:'시험 전용',notice:'주소 접근권한 검사'});
  await page.addInitScript(value=>{localStorage.setItem('admin_token_v1',value);localStorage.setItem('admin_session_v1',JSON.stringify({phone:'01000000000',authedAt:Date.now()}));},token!);
  await page.goto('/admin');
  await page.getByRole('button',{name:'🎉 술번개',exact:true}).click();
  await page.getByRole('button',{name:'공지·장소',exact:true}).first().click();
  await page.getByLabel('관리할 행사',{exact:true}).selectOption(e.id);
  await page.getByText('매장 주소 등록·1차 장소 연결',{exact:true}).click();
  const label='합성주소'+String(Date.now()).slice(-6);
  await page.getByLabel('주소의 매장',{exact:true}).selectOption('check_in');
  for(const [key,value] of [['자료 이름',label],['도로명 원문','시험로 100'],['지번 원문','시험동 12(13)'],['층','2층'],['제공 출처','격리 브라우저 합성 검사']])await page.getByLabel(key,{exact:true}).fill(value);
  const saved=page.waitForResponse(r=>r.url().endsWith('/api/event-hub/mutate')&&r.request().postDataJSON()?.action==='venue.address.save');
  await page.getByRole('button',{name:'매장 주소 저장',exact:true}).click();expect((await saved).status()).toBe(200);
  const state=await admin(request),address=state.venueDirectory.items.find((v:{label:string})=>v.label===label);
  expect(address.parcelOriginal).toBe('시험동 12(13)');
  await page.reload();
  await page.getByRole('button',{name:'🎉 술번개',exact:true}).click();
  await page.getByRole('button',{name:'공지·장소',exact:true}).first().click();
  await page.getByLabel('관리할 행사',{exact:true}).selectOption(e.id);
  await page.getByText('매장 주소 등록·1차 장소 연결',{exact:true}).click();
  await page.getByLabel('저장된 매장 주소',{exact:true}).selectOption(address.id);
  await expect(page.getByLabel('지번 원문',{exact:true})).toHaveValue('시험동 12(13)');
  await page.getByLabel('이 매장의 해당 날짜 1차 배정을 확인했습니다').check();
  await page.getByLabel('층',{exact:true}).fill('3층');
  await expect(page.getByRole('button',{name:'이 행사 1차 장소로 연결'})).toBeDisabled();
  await page.getByLabel('층',{exact:true}).fill('2층');
  const linked=page.waitForResponse(r=>r.url().endsWith('/api/event-hub/mutate')&&r.request().postDataJSON()?.action==='event.address.select');
  await page.getByRole('button',{name:'이 행사 1차 장소로 연결'}).click();expect((await linked).status()).toBe(200);
  expect((await admin(request)).events.find((v:{id:string})=>v.id===e.id).addressRecord).toMatchObject({id:address.id,parcelOriginal:'시험동 12(13)',floor:'2층'});
  for(const width of [360,768,1440]){
    await page.setViewportSize({width,height:900});
    await expect(page.getByRole('button',{name:'매장 주소 저장',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
    await page.screenshot({path:info.outputPath(`current-address-${width}.png`),fullPage:true});
  }
});
