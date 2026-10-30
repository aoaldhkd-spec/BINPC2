import { test, expect, type APIRequestContext, type BrowserContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { eventCycleMilestones } from '../../../lib/api-zod/src/event-cycle-clock';

const token = process.env.HUB_E2E_ADMIN_TOKEN;
if (!token) throw Error('Explicit isolated administrator fixture binding required');
const headers = { 'x-admin-token': token };
async function local(context: BrowserContext, administrator = false) {
  const origin = process.env.HUB_E2E_BASE_URL!;
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await context.addInitScript(({ offset, token }) => {
    const Native = Date;
    class Clock extends Native {
      constructor(...args: unknown[]) { super(...((args.length ? args : [Native.now() + offset]) as [string])); }
      static now() { return Native.now() + offset; }
    }
    globalThis.Date = Clock as DateConstructor;
    if (token) {
      localStorage.setItem('admin_token_v1', token);
      localStorage.setItem('admin_session_v1', JSON.stringify({ phone: '01000000000', authedAt: Date.now() }));
    }
  }, { offset: Number(process.env.HUB_E2E_CLOCK_OFFSET_MS ?? 0), token: administrator ? token : undefined });
}
async function adminCommand(request: APIRequestContext, action: string, target = '', data: Record<string, unknown> = {}, revision?: number) {
  const response = await request.post('/api/event-hub/mutate', { headers, data: { action, target, data, revision, requestId: randomUUID() } });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}
async function adminState(request: APIRequestContext) {
  const response = await request.get('/api/event-hub/admin', { headers });
  expect(response.status()).toBe(200);
  return response.json();
}

test('actual app + PostgreSQL: together submission/deposit, separate approval and private friend completion', async ({ page, context, request, browser }, info) => {
  test.setTimeout(150000);
  context.setDefaultTimeout(15000);
  await local(context);
  await page.setViewportSize({ width: 390, height: 844 });
  const suffix = String(Date.now()).slice(-4);
  const ownName = `본${suffix}`, friendName = `친${suffix}`;
  const ready = await (await request.get('/api/db/ready')).json();
  const milestones = eventCycleMilestones(String(ready.settings?.event_cycle_started_at ?? ''));
  expect(milestones).toBeTruthy();
  const date = new Date(milestones!.grantAt.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  const eventId = (await adminCommand(request, 'event.save', '', {
    title: `격리 동반신청 ${suffix}`, date, start: '22:00', end: '01:00', area: '시험 지역',
    address: '승인자 전용 시험 장소', fee: 23000, deposit: 23000, account: '실제 송금 불가 시험 계좌',
    deadline: '행사 전', notice: '동반신청 격리 검사 공지', cardsEnabled: true, benefitsEnabled: false, benefits: [],
  })).id;
  await adminCommand(request, 'event.recruitment', eventId, { enabled: true }, 1);
  await page.goto(`/events/e/${eventId}`);
  await page.getByRole('button', { name: '신청하기', exact: true }).click();
  await page.getByRole('button', { name: '지인과 함께', exact: true }).click();
  await page.getByRole('button', { name: '+ 지인 추가', exact: true }).click();
  await page.getByLabel('친구 닉네임', { exact: true }).fill(friendName);
  await page.getByLabel('친구 출생연도', { exact: true }).selectOption('1995');
  await page.getByLabel('도시', { exact: true }).selectOption('서울');
  await page.getByLabel('친구에게 이번 행사 신청에 필요한 정보를 전달해도 된다는 확인을 받았습니다').check();
  await page.getByRole('button', { name: '친구 정보 저장', exact: true }).click();
  await expect(page.getByText('친구 정보 저장됨 · 신청 미확정', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '신청하기', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '누구와 신청하시나요?' })).toHaveCount(0);
  await page.getByRole('button', { name: '본인 정보 입력', exact: true }).click();
  await page.getByLabel('[필수] 위 개인정보').check();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page.getByLabel('닉네임', { exact: true }).fill(ownName);
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page.getByLabel('태어난 년도', { exact: true }).selectOption('1995');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page.getByLabel('도시', { exact: true }).selectOption('부산');
  await page.getByRole('button', { name: '동으로 입력', exact: true }).click();
  await page.getByLabel('부산 동', { exact: true }).selectOption('전포동');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByLabel('연락용 전화번호', { exact: false })).toHaveCount(0);
  await page.getByLabel('실제 은행 입금 시 보내는 분 이름', { exact: true }).fill('격리합산');
  await expect(page.getByText('실제 송금 불가 시험 계좌', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '2명 함께 신청', exact: true }).click();
  await expect(page).toHaveURL(/\/events\/a\//);
  const ownId = page.url().split('/').pop()!;
  let all = (await adminState(request)).applications.filter((a: { eventId: string }) => a.eventId === eventId);
  expect(all).toHaveLength(2);
  const childId = all.find((a: { id: string }) => a.id !== ownId).id;
  expect(all.map((a: { rank: number }) => a.rank).sort()).toEqual([1, 2]);
  await page.getByLabel('필수 안내를 모두 확인하고 동의합니다', { exact: true }).check();
  await page.getByRole('button', { name: '동의하고 다음', exact: true }).click();
  await expect(page.getByText('총 2명 · 46,000원', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '2명 금액 확인·신청 확정', exact: true }).click();
  await expect(page.getByRole('button', { name: '선택한 2명 입금 신고', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('companion-combined-payment-390.png'), fullPage: true });
  await page.getByRole('button', { name: '선택한 2명 입금 신고', exact: true }).click();
  await expect.poll(async () => (await adminState(request)).applications.filter((a: { eventId: string }) => a.eventId === eventId).map((a: { payment: string }) => a.payment)).toEqual(['reported', 'reported']);
  await page.reload();
  expect((await adminState(request)).applications.filter((a: { eventId: string }) => a.eventId === eventId)).toHaveLength(2);

  const adminContext = await browser.newContext({ baseURL: process.env.HUB_E2E_BASE_URL });
  const friendContext = await browser.newContext({ baseURL: process.env.HUB_E2E_BASE_URL, viewport: { width: 390, height: 844 } });
  try {
    await local(adminContext, true); await local(friendContext);
    adminContext.setDefaultTimeout(15000); friendContext.setDefaultTimeout(15000);
    const admin = await adminContext.newPage(), friend = await friendContext.newPage();
    await admin.goto('/admin');
    await admin.getByRole('button', { name: '🎉 술번개', exact: true }).click();
    await admin.getByLabel('관리할 행사').selectOption(eventId);
    await admin.getByRole('button', { name: '신청·입금', exact: true }).click();
    await admin.locator('.hub-applicant-list').getByRole('button').filter({ hasText: ownName }).click();
    const ownCard = admin.locator('section').filter({ has: admin.getByText(`신청번호 ${ownId}`, { exact: true }) });
    admin.once('dialog', dialog => dialog.accept());
    await ownCard.getByRole('button', { name: '입금 승인', exact: true }).click();
    await expect.poll(async () => (await adminState(request)).applications.find((a: { id: string }) => a.id === ownId).payment).toBe('approved');
    expect((await adminState(request)).applications.find((a: { id: string }) => a.id === childId).payment).toBe('reported');
    await admin.screenshot({ path: info.outputPath('companion-separate-approval.png'), fullPage: true });
    // An unrelated friend cannot discover or operate the child's application by id.
    await friend.goto(`/events/e/${eventId}`);
    await friend.getByRole('button', { name: '친구가 대신 신청했어요', exact: true }).click();
    await expect(friend.getByText(/관리자 확인 대기/)).toBeVisible();
    let state = await (await friend.request.get('/api/event-hub/state')).json();
    expect(state.applications).toHaveLength(0);
    await admin.reload();
    await admin.getByRole('button', { name: '🎉 술번개', exact: true }).click();
    await admin.getByLabel('관리할 행사').selectOption(eventId);
    await admin.getByRole('button', { name: '신청·입금', exact: true }).click();
    await admin.getByLabel(/^연결할 친구 · /).selectOption(childId);
    await admin.getByLabel('요청자 본인과 선택한 친구가 같은 사람임을 확인했습니다.', { exact: true }).check();
    await admin.getByRole('button', { name: '본인 연결', exact: true }).click();
    await expect.poll(async () => (await adminState(request)).applications.find((a: { id: string }) => a.id === childId).companionSubmission.linkedAt).toBeTruthy();
    let child = (await adminState(request)).applications.find((a: { id: string }) => a.id === childId);
    await adminCommand(request, 'admin.application.payment', childId, { status: 'approved', bankChecked: true }, child.revision);
    child = (await adminState(request)).applications.find((a: { id: string }) => a.id === childId);
    const preserved = { rank: child.rank, quote: child.quote, confirmedAt: child.confirmedAt };
    await friend.goto(`/events/a/${childId}`);
    await friend.getByLabel('[필수] 위 개인정보').check();
    await friend.getByRole('button', { name: '다음', exact: true }).click();
    await expect(friend.getByLabel('연락용 전화번호', { exact: false })).toHaveCount(0);
    await friend.reload();
    await friend.getByLabel('실제 은행 입금 시 보내는 분 이름', { exact: true }).fill('격리친구');
    await friend.getByRole('button', { name: '다음', exact: true }).click();
    await friend.getByLabel('필수 안내를 모두 확인하고 동의합니다', { exact: true }).check();
    await friend.getByRole('button', { name: '동의하고 다음', exact: true }).click();
    await expect(friend.getByRole('heading', { name: '👤 내 프로필', exact: true })).toBeVisible();
    child = (await adminState(request)).applications.find((a: { id: string }) => a.id === childId);
    expect(child.payment).toBe('approved');
    expect({ rank: child.rank, quote: child.quote, confirmedAt: child.confirmedAt }).toEqual(preserved);
    expect(child.companionSubmission.personalConsentPending).toBe(false);
    const sponsor = await (await page.request.get('/api/event-hub/state')).json();
    expect(sponsor.applications.map((a: { id: string }) => a.id)).toEqual([ownId]);
    for (const key of ['owner', 'phone', 'depositor', 'profile', 'cards', 'venue', 'consent']) expect(sponsor.companionApplications[0]).not.toHaveProperty(key);
    const forbidden = await page.request.post('/api/event-hub/mutate', { data: { action: 'application.enter', target: childId, revision: child.revision, data: { deviceSecret: 'sponsor-cannot-enter-friend' }, requestId: randomUUID() } });
    expect(forbidden.ok()).toBe(false);
    await friend.screenshot({ path: info.outputPath('companion-friend-private-completion-390.png'), fullPage: true });
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 }); await page.reload();
      await expect(page.getByRole('heading', { name: '함께 신청한 친구', exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: info.outputPath(`companion-result-${width}.png`), fullPage: true });
    }
  } finally { await adminContext.close(); await friendContext.close(); }
});
