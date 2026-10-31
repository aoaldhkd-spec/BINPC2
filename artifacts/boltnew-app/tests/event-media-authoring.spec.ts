import { test, expect, type APIRequestContext, type BrowserContext, type Page, type Locator } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const origin = process.env.HUB_E2E_BASE_URL;
const token = process.env.HUB_E2E_ADMIN_TOKEN;
if (!origin || !/^http:\/\/127\.0\.0\.1:300[12356]$/.test(origin) || !token)
  throw Error('Explicit isolated localhost and administrator fixture binding required');
const headers = { 'x-admin-token': token };
const source = readFileSync(new URL('../public/tour-logos-v3/on_top.png', import.meta.url));
const file = (name: string) => ({ name, mimeType: 'image/png', buffer: source });
const publicConfirmation = '신청 전 공개할 사진입니다. 계좌·상세 장소·개인정보가 없는지 확인했습니다.';
type Material = { id: string; purpose: string; url: string; alt: string; hidden?: boolean };
type Event = { id: string; title: string; date: string; notice: string; revision: number; noticeVersion: number; media: string[]; materials: Material[]; venueAddressId?: string | null };
async function local(context: BrowserContext, admin = false) {
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await context.addInitScript(({ offset, adminToken }) => {
    const Native = Date;
    class Clock extends Native {
      constructor(...args: unknown[]) { super(...((args.length ? args : [Native.now() + offset]) as [string])); }
      static now() { return Native.now() + offset; }
    }
    globalThis.Date = Clock as DateConstructor;
    if (adminToken) {
      localStorage.setItem('admin_token_v1', adminToken);
      localStorage.setItem('admin_session_v1', JSON.stringify({ phone: '01000000000', authedAt: Date.now() }));
    }
  }, { offset: Number(process.env.HUB_E2E_CLOCK_OFFSET_MS ?? 0), adminToken: admin ? token : undefined });
}
async function state(request: APIRequestContext) {
  const response = await request.get('/api/event-hub/admin', { headers });
  expect(response.status()).toBe(200);
  return response.json();
}
async function event(request: APIRequestContext, id: string): Promise<Event> {
  return (await state(request)).events.find((value: Event) => value.id === id);
}
async function command(request: APIRequestContext, action: string, target = '', data: Record<string, unknown> = {}, revision?: number) {
  const response = await request.post('/api/event-hub/mutate', { headers, data: { action, target, data, revision, requestId: randomUUID() } });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}
async function openEditor(page: Page, id?: string) {
  await page.goto('/admin');
  await page.getByRole('button', { name: '🎉 술번개', exact: true }).click();
  if (id) await page.getByLabel('관리할 행사', { exact: true }).selectOption(id);
  await page.getByText('행사 설정·기록·관리 도구', { exact: true }).click();
  await page.getByRole('button', { name: '행사·자동방', exact: true }).click();
  if (!id) await page.getByRole('button', { name: '+ 술번개 만들기', exact: true }).click();
}
const mediaEditor = (page: Page) => page.locator('section').filter({ has: page.getByRole('heading', { name: '행사 포스터·대표 이미지', exact: true }) }).last();
const article = (page: Page, manager: Locator, alt: string) => manager.locator('article').filter({ has: page.locator(`input[aria-label="저장한 사진 설명"][value="${alt}"]`) });
const cover = (value: Event) => value.materials?.find(item => item.purpose === 'notice' && !item.hidden && value.media.includes(item.url));

test('actual app: create an image-only event notice/cover, keep the map private, and preserve one cover through list/detail/waiting', async ({ page, context, browser, request }, info) => {
  test.setTimeout(150000);
  await local(context, true);
  await page.setViewportSize({ width: 1024, height: 900 });
  const title = `포스터 실앱 ${Date.now()}`;
  const date = new Date(Date.parse((await state(request)).serverNow) + 9 * 3600000).toISOString().slice(0, 10);
  await openEditor(page);
  for (const [label, value] of [
    ['행사 제목', title], ['날짜', date], ['시작 시간', '22:00'], ['종료 시간 (다음 날 가능)', '01:00'],
    ['대략적인 지역', '격리 시험 지역'], ['상세 주소·층수 (입금 승인자만 공개)', '가상 승인자 전용 7층'],
    ['일반 회비 (원)', '10000'], ['선입금 (원)', '10000'], ['계좌·예금주', '실제 송금 금지'], ['입금 기한', '행사 전'],
  ]) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByLabel('필독 공지·설명서', { exact: true }).fill('');
  const media = mediaEditor(page);
  await media.getByLabel('공지 사진 파일 선택', { exact: true }).setInputFiles(file('synthetic-public-cover.png'));
  await expect(media.getByAltText('선택한 자료 미리보기', { exact: true })).toBeVisible();
  await expect(media.getByRole('button', { name: '저장', exact: true })).toBeDisabled();
  await media.getByLabel('사진 설명 (선택)', { exact: true }).fill('공개 행사 표지');
  await media.getByLabel(publicConfirmation, { exact: true }).check();
  await page.screenshot({ path: info.outputPath('media-create-file-preview.png'), fullPage: true });
  await media.getByRole('button', { name: '저장', exact: true }).click();
  await expect.poll(async () => (await state(request)).events.filter((e: Event) => e.title === title).length).toBe(1);
  const id = (await state(request)).events.find((e: Event) => e.title === title).id;
  await expect.poll(async () => cover(await event(request, id))?.alt).toBe('공개 행사 표지');
  expect((await event(request, id)).notice).toBe('');
  await page.getByRole('button', { name: '행사 설정 저장', exact: true }).click();
  const withCover = await event(request, id);
  await command(request, 'event.recruitment', id, { enabled: true, immediate: true }, withCover.revision);
  await openEditor(page, id);
  await media.getByRole('button', { name: /기존 이미지 선택/ }).click();
  await expect(article(page, media, '공개 행사 표지')).toBeVisible();

  await page.getByRole('button', { name: '공지·장소', exact: true }).click();
  // Only synthetic address strings enter the public test/evidence. Registering
  // a venue is distinct from assigning a first-round date/event.
  const addressLabel = `합성 주소 ${Date.now()}`, road = '합성검사로 2, 3층', parcel = '합성검사동 12(13), 3층';
  const openAddresses = () => page.getByText('매장 주소 등록·1차 장소 연결', { exact: true }).click();
  await openAddresses();
  await page.getByLabel('주소의 매장', { exact: true }).selectOption('red_hole');
  for (const [label, value] of [['자료 이름', addressLabel], ['도로명 원문', '합성검사로 1, 3층'], ['지번 원문', parcel], ['층', '3층'], ['제공 출처', '격리 합성 검사']]) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole('button', { name: '매장 주소 저장', exact: true }).click();
  await expect.poll(async () => (await state(request)).venueDirectory.items.filter((item: { label: string }) => item.label === addressLabel).length).toBe(1);
  const addressId = (await state(request)).venueDirectory.items.find((item: { label: string }) => item.label === addressLabel).id;
  expect((await event(request, id)).venueAddressId).toBeFalsy();
  await openEditor(page, id);
  await page.getByRole('button', { name: '공지·장소', exact: true }).click();
  await openAddresses();
  await page.getByLabel('저장된 매장 주소', { exact: true }).selectOption(addressId);
  await expect(page.getByLabel('도로명 원문', { exact: true })).toHaveValue('합성검사로 1, 3층');
  await expect(page.getByLabel('지번 원문', { exact: true })).toHaveValue(parcel);
  await page.getByLabel('도로명 원문', { exact: true }).fill(road);
  await page.getByRole('button', { name: '매장 주소 저장', exact: true }).click();
  await expect.poll(async () => (await state(request)).venueDirectory.items.find((item: { id: string }) => item.id === addressId).roadOriginal).toBe(road);
  const directory = (await state(request)).venueDirectory;
  expect(directory.history.some((entry: { id: string; previous?: { roadOriginal: string } }) => entry.id === addressId && entry.previous?.roadOriginal === '합성검사로 1, 3층')).toBe(true);
  expect((await event(request, id)).venueAddressId).toBeFalsy();
  await expect(page.getByRole('button', { name: '이 행사 1차 장소로 연결', exact: true })).toBeDisabled();
  await page.getByLabel('이 매장의 해당 날짜 1차 배정을 확인했습니다', { exact: true }).check();
  await page.getByRole('button', { name: '이 행사 1차 장소로 연결', exact: true }).click();
  await expect.poll(async () => (await event(request, id)).venueAddressId).toBe(addressId);
  await page.getByRole('tab', { name: '지도·장소', exact: true }).click();
  await page.getByRole('button', { name: '지도 사진 업로드', exact: true }).click();
  const maps = page.locator('section').filter({ has: page.getByRole('heading', { name: '지도·약도 사진', exact: true }) }).last();
  await maps.getByLabel('지도·약도 사진 파일 선택', { exact: true }).setInputFiles(file('synthetic-protected-map.png'));
  await maps.getByLabel('사진 설명 (선택)', { exact: true }).fill('승인자 전용 약도');
  const noticeVersion = (await event(request, id)).noticeVersion;
  await maps.getByRole('button', { name: '저장', exact: true }).click();
  await expect.poll(async () => (await event(request, id)).materials.some(item => item.purpose === 'map')).toBe(true);
  expect((await event(request, id)).noticeVersion).toBe(noticeVersion);
  const stored = await event(request, id), poster = cover(stored)!, map = stored.materials.find(item => item.purpose === 'map')!;
  await page.screenshot({ path: info.outputPath('media-map-separate-admin.png'), fullPage: true });

  const participant = await browser.newContext({ baseURL: origin, viewport: { width: 390, height: 844 } });
  try {
    await local(participant);
    const user = await participant.newPage();
    await user.goto('/events');
    await expect(user.getByRole('heading', { name: '행사·신청 일정', exact: true })).toBeVisible();
    const card = user.locator('.hub-event-list-card').filter({ hasText: title });
    for (let pages = 0; (await card.count()) === 0 && pages < 50; pages++) {
      const more = user.getByRole('button', { name: '행사 더 보기', exact: true });
      await expect(more).toBeVisible();
      await more.click();
    }
    await expect(card.getByAltText('공개 행사 표지 · 미리보기', { exact: true })).toBeVisible();
    await card.click();
    await expect(user).toHaveURL(new RegExp(`/events/e/${id}$`));
    await expect(user.getByAltText('공개 행사 표지 · 미리보기', { exact: true })).toBeVisible();
    expect((await user.request.get(poster.url)).status()).toBe(200);
    expect((await user.request.get(map.url)).status()).toBe(404);
    const unapprovedState = await (await user.request.get('/api/event-hub/state')).json();
    expect(unapprovedState.venueDirectory).toBeUndefined();
    expect(JSON.stringify(unapprovedState)).not.toContain(road);
    expect(JSON.stringify(unapprovedState)).not.toContain(parcel);
    await expect(user.getByAltText('승인자 전용 약도', { exact: true })).toHaveCount(0);
    await user.getByRole('button', { name: '신청하기', exact: true }).click();
    await user.getByRole('button', { name: '혼자 신청', exact: true }).click();
    await user.getByLabel('[필수] 위 개인정보').check();
    await user.getByRole('button', { name: '다음', exact: true }).click();
    await user.getByLabel('닉네임', { exact: true }).fill('표' + String(Date.now()).slice(-5));
    await user.getByRole('button', { name: '다음', exact: true }).click();
    await user.getByRole('button', { name: '1995년생', exact: true }).click();
    await user.getByRole('button', { name: '다음', exact: true }).click();
    await user.getByRole('button', { name: '부산', exact: true }).click();
    await user.getByRole('button', { name: '부산진구', exact: true }).click();
    await user.getByRole('button', { name: '다음', exact: true }).click();
    await user.getByLabel('실제 은행 입금 시 보내는 분 이름').fill('가상');
    await user.getByRole('button', { name: '다음', exact: true }).click();
    await expect(user).toHaveURL(/\/events\/a\//);
    const appId = user.url().split('/').pop()!;
    await user.getByLabel('필수 안내를 모두 확인하고 동의합니다', { exact: true }).check();
    await user.getByRole('button', { name: /동의.*다음|동의.*회비/ }).click();
    await user.getByRole('button', { name: '금액 확인 후 신청 확정', exact: true }).click();
    await expect(user.locator('.hub-waiting-summary').getByAltText('공개 행사 표지 · 미리보기', { exact: true })).toBeVisible();
    await user.getByRole('button', { name: /입금했어요/ }).click();
    await expect.poll(async () => (await state(request)).applications.find((a: { id: string }) => a.id === appId).payment).toBe('reported');
    const application = (await state(request)).applications.find((a: { id: string }) => a.id === appId);
    await command(request, 'admin.application.payment', appId, { status: 'approved', bankChecked: true }, application.revision);
    await expect(user.getByAltText('승인자 전용 약도', { exact: true })).toBeVisible({ timeout: 20000 });
    await expect(user.getByText(road, { exact: true })).toBeVisible();
    await expect(user.getByText(parcel, { exact: true })).toBeVisible();
    await user.reload();
    await expect(user.locator('.hub-waiting-summary').getByAltText('공개 행사 표지 · 미리보기', { exact: true })).toBeVisible();
    await expect(user.getByAltText('승인자 전용 약도', { exact: true })).toBeVisible();
    expect((await user.request.get(map.url)).status()).toBe(200);
    await user.screenshot({ path: info.outputPath('media-approved-waiting-cover-map-390.png'), fullPage: true });

    // Revoke only this synthetic application's approval: loaded maps disappear,
    // fresh requests are rejected, and public notices still remain available.
    const beforeRevocation = (await state(request)).applications.find((a: { id: string }) => a.id === appId);
    await command(request, 'admin.application.revoke', appId, { reason: '격리 지도 권한 재검사' }, beforeRevocation.revision);
    await expect(user.getByAltText('승인자 전용 약도', { exact: true })).toHaveCount(0, { timeout: 20000 });
    const revokedMap = await user.request.get(map.url);
    expect(revokedMap.status()).toBe(404);
    expect(revokedMap.headers()['cache-control']).toContain('no-store');
    expect(JSON.stringify(await (await user.request.get('/api/event-hub/state')).json())).not.toContain(road);
    expect((await user.request.get(poster.url)).status()).toBe(200);
    await user.reload();
    await expect(user.getByAltText('승인자 전용 약도', { exact: true })).toHaveCount(0);
    const revoked = (await state(request)).applications.find((a: { id: string }) => a.id === appId);
    await command(request, 'admin.application.payment', appId, { status: 'approved', bankChecked: true }, revoked.revision);
    await expect(user.getByAltText('승인자 전용 약도', { exact: true })).toBeVisible({ timeout: 20000 });
    expect((await user.request.get(map.url)).status()).toBe(200);

    // Unlinking a public image also blocks its original URL for participants;
    // administrator access and the immutable original bytes remain intact.
    const beforeHide = await event(request, id);
    const hiddenItems = beforeHide.materials.map(item => ({ id: item.id, alt: item.alt, hidden: item.id === poster.id || !!item.hidden }));
    const blockedLastNotice = await request.post('/api/event-hub/mutate', { headers, data: { action: 'event.media.update', target: id, data: { items: hiddenItems }, revision: beforeHide.revision, requestId: randomUUID() } });
    expect(blockedLastNotice.status()).toBe(409);
    expect((await blockedLastNotice.json()).code).toBe('NOTICE');
    expect((await event(request, id)).revision).toBe(beforeHide.revision);
    expect((await user.request.get(poster.url)).status()).toBe(200);
    await command(request, 'event.recruitment', id, { enabled: false }, beforeHide.revision);
    await command(request, 'event.media.update', id, { items: hiddenItems }, (await event(request, id)).revision);
    await expect(user.getByAltText('공개 행사 표지 · 미리보기', { exact: true })).toHaveCount(0, { timeout: 20000 });
    expect((await user.request.get(poster.url)).status()).toBe(404);
    const original = await request.get(poster.url, { headers });
    expect(original.status()).toBe(200);
    expect((await original.body()).equals(source)).toBe(true);
    const hidden = await event(request, id);
    await command(request, 'event.media.update', id, { items: hidden.materials.map(item => ({ id: item.id, alt: item.alt, hidden: item.id === poster.id ? false : !!item.hidden })) }, hidden.revision);
    await expect(user.locator('.hub-waiting-summary').getByAltText('공개 행사 표지 · 미리보기', { exact: true })).toBeVisible({ timeout: 20000 });
    expect((await user.request.get(poster.url)).status()).toBe(200);
  } finally { await participant.close(); }
});

test('actual app: public cover reorder/replace/unlink/restore keeps originals and never promotes a protected poster', async ({ page, context, request }, info) => {
  test.setTimeout(120000);
  await local(context, true);
  const date = new Date(Date.parse((await state(request)).serverNow) + 9 * 3600000).toISOString().slice(0, 10);
  const id = (await command(request, 'event.save', '', { title: `포스터 이력 ${Date.now()}`, date, start: '22:00', end: '01:00', area: '격리 지역', address: '가상 비공개 장소', fee: 10000, account: '송금 금지', deadline: '행사 전', notice: '원본을 보존하는 합성 공지' })).id;
  const upload = async (purpose: string, alt: string) => command(request, 'event.media.upload', id, { purpose, publicConfirmed: purpose === 'notice', alt, mime: 'image/png', base64: source.toString('base64') }, (await event(request, id)).revision);
  await upload('poster', '기존 보호 포스터');
  const protectedPoster = (await event(request, id)).materials[0];
  await upload('map', '기존 보호 지도');
  await upload('notice', '첫 공개 표지');
  await upload('notice', '둘째 공개 표지');
  const before = await event(request, id);
  await openEditor(page, id);
  const media = mediaEditor(page);
  await media.getByRole('button', { name: /기존 이미지 선택/ }).click();
  await expect(article(page, media, '기존 보호 포스터').getByRole('button', { name: '대표 이미지 지정', exact: true })).toHaveCount(0);
  await article(page, media, '둘째 공개 표지').getByRole('button', { name: '대표 이미지 지정', exact: true }).click();
  await expect.poll(async () => cover(await event(request, id))?.alt).toBe('둘째 공개 표지');
  await article(page, media, '첫 공개 표지').getByRole('button', { name: '앞으로', exact: true }).click();
  await expect.poll(async () => (await event(request, id)).materials.map(item => item.alt).join('|')).toBe('둘째 공개 표지|기존 보호 포스터|첫 공개 표지|기존 보호 지도');
  await article(page, media, '둘째 공개 표지').getByRole('button', { name: '교체', exact: true }).click();
  await media.getByLabel('공지 사진 파일 선택', { exact: true }).setInputFiles(file('synthetic-replacement-cover.png'));
  await expect(media.getByAltText('선택한 자료 미리보기', { exact: true })).toBeVisible();
  await media.getByLabel('사진 설명 (선택)', { exact: true }).fill('교체한 공개 표지');
  await media.getByLabel(publicConfirmation, { exact: true }).check();
  await media.getByRole('button', { name: '저장', exact: true }).click();
  await expect.poll(async () => cover(await event(request, id))?.alt).toBe('교체한 공개 표지');
  expect((await event(request, id)).materials.find(item => item.alt === '둘째 공개 표지')?.hidden).toBe(true);
  const replaced = await event(request, id);
  expect(replaced.materials).toHaveLength(5);
  for (const item of before.materials) expect(replaced.materials.some(current => current.id === item.id && current.url === item.url)).toBe(true);
  await article(page, media, '교체한 공개 표지').getByRole('button', { name: '연결 해제', exact: true }).click();
  await expect.poll(async () => cover(await event(request, id))?.alt).toBe('첫 공개 표지');
  await article(page, media, '교체한 공개 표지').getByRole('button', { name: '복원', exact: true }).click();
  await expect.poll(async () => cover(await event(request, id))?.alt).toBe('교체한 공개 표지');
  await openEditor(page, id);
  await media.getByRole('button', { name: /기존 이미지 선택/ }).click();
  const selected = article(page, media, '교체한 공개 표지');
  await expect(selected.getByText('공지 사진 · 신청 전 공개 · 대표 이미지', { exact: true })).toBeVisible();
  await selected.locator('summary').click();
  await expect(selected.getByAltText('교체한 공개 표지', { exact: true })).toBeVisible();
  await expect(article(page, media, '둘째 공개 표지').getByRole('button', { name: '복원', exact: true })).toBeVisible();
  for (const material of before.materials) {
    const response = await request.get(material.url, { headers });
    expect(response.status()).toBe(200);
    expect((await response.body()).equals(source)).toBe(true);
  }
  expect((await request.get(protectedPoster.url)).status()).toBe(404);
  const visible = await event(request, id);
  expect(cover(visible)?.purpose).toBe('notice');
  expect(visible.materials.find(item => item.id === protectedPoster.id)?.purpose).toBe('poster');
  await page.screenshot({ path: info.outputPath('media-cover-history-restored.png'), fullPage: true });
  await media.screenshot({ path: info.outputPath('media-cover-history-controls.png') });
});

test('actual app: cancel replacement keeps the draft and saves a new map without hiding the old original', async ({ page, context, request }, info) => {
  test.setTimeout(90000);
  await local(context, true);
  const date = new Date(Date.parse((await state(request)).serverNow) + 9 * 3600000).toISOString().slice(0, 10);
  const id = (await command(request, 'event.save', '', { title: `지도 교체 취소 ${Date.now()}`, date, start: '22:00', end: '01:00', area: '격리 지역', address: '가상 승인자 주소', fee: 10000, account: '실제 송금 금지', deadline: '행사 전', notice: '합성 공지' })).id;
  await command(request, 'event.media.upload', id, { purpose: 'map', alt: '보존할 지도', mime: 'image/png', base64: source.toString('base64') }, (await event(request, id)).revision);
  const before = await event(request, id), original = before.materials[0];
  await openEditor(page, id);
  await page.getByRole('button', { name: '공지·장소', exact: true }).click();
  await page.getByRole('tab', { name: '지도·장소', exact: true }).click();
  await page.getByRole('button', { name: '지도 사진 업로드', exact: true }).click();
  const maps = page.locator('section').filter({ has: page.getByRole('heading', { name: '지도·약도 사진', exact: true }) }).last();
  await maps.getByRole('button', { name: '기존 이미지 선택 (1)', exact: true }).click();
  await article(page, maps, '보존할 지도').getByRole('button', { name: '교체', exact: true }).click();
  await maps.getByLabel('지도·약도 사진 파일 선택', { exact: true }).setInputFiles(file('synthetic-additional-map.png'));
  await maps.getByLabel('사진 설명 (선택)', { exact: true }).fill('추가 지도 초안');
  await maps.getByRole('button', { name: '교체 취소', exact: true }).click();
  await expect(maps.getByAltText('선택한 자료 미리보기', { exact: true })).toBeVisible();
  await expect(maps.getByLabel('사진 설명 (선택)', { exact: true })).toHaveValue('추가 지도 초안');
  expect((await event(request, id)).revision).toBe(before.revision);
  await maps.getByRole('button', { name: '저장', exact: true }).click();
  await expect.poll(async () => (await event(request, id)).materials.length).toBe(2);
  const after = await event(request, id);
  expect(after.materials.find(item => item.id === original.id)).toMatchObject({ url: original.url, hidden: false });
  expect(after.media).toHaveLength(2);
  await openEditor(page, id);
  const allMedia = mediaEditor(page);
  await allMedia.getByRole('button', { name: '기존 이미지 선택 (2)', exact: true }).click();
  await expect(article(page, allMedia, '보존할 지도').getByRole('button', { name: '연결 해제', exact: true })).toBeVisible();
  await expect(article(page, allMedia, '추가 지도 초안').getByRole('button', { name: '연결 해제', exact: true })).toBeVisible();
  const bytes = await request.get(original.url, { headers });
  expect(bytes.status()).toBe(200);
  expect((await bytes.body()).equals(source)).toBe(true);
  await allMedia.screenshot({ path: info.outputPath('media-replacement-cancel-original-preserved.png') });
});
