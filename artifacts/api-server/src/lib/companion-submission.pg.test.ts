import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { DEFAULT_PRIVACY_POLICY, HUB_CONSENT_VERSION, PROFILE_CONSENT_VERSION, type HubApplication, type HubEvent } from '@workspace/api-zod';
import { EventHubService, type HubOwner } from './event-hub-service.js';
import { HubStore } from './event-hub-store.js';
import { EventTestModeService } from './event-test-mode.js';
import { isolatedFixtureDatabase } from './event-hub-isolation.js';
import { withVerifiedBossParticipation } from './boss-participation.js';

// The HTTP regression below delegates the real router singleton to this suite's
// real PG-backed service. It never creates the production DB singleton or calls
// realtime side effects outside the isolated schema.
vi.mock('./pg-pool.js', () => ({ pgPool: null }));
vi.mock('../routes/db.js', () => ({
  verifyAdminToken: (token?: string) => token === 'isolated-pg-route-admin',
  eventHubProfileCommitted: vi.fn(),
  eventHubChanged: vi.fn(),
}));

const url = process.env.HUB_TEST_DATABASE_URL;
const suite = describe.skipIf(!url);

// This suite owns a fresh schema, never public or the browser fixture schema.
// The guard runs before any connection; even connection-string override options
// cannot point this test at an operating database.
suite('companion submission — actual isolated PostgreSQL transactions', () => {
  const schema = `companion_pg_${randomUUID().replaceAll('-', '')}`;
  const secret = 'isolated-companion-pg-test-secret';
  const now = () => new Date('2026-10-31T14:00:00Z');
  let control: pg.Pool | undefined;
  let pool: pg.Pool;
  let otherPool: pg.Pool;
  let service: EventHubService;
  let otherService: EventHubService;
  let owner: string;
  let eventId: string;
  let madeSchema = false;
  let sequence = 0;
  const nickname = () => `동${(++sequence).toString(36).padStart(4, '0')}`;
  const basic = (name = nickname()) => ({ nickname: name, birthYear: 1995, location: '부산', depositor: '가상입금자', collection: true, version: HUB_CONSENT_VERSION });
  const consent = { collection: true, sharing: true, notice: true, version: HUB_CONSENT_VERSION, reuse: false, marketing: false, push: false, profileNow: false };
  const profile = { mbti: 'INTJ', interests: ['여행', '음악'], personalityScore: 50, privacyConsent: { collection: true, sharing: true, version: PROFILE_CONSENT_VERSION }, pushDecision: 'skip', lastStep: 6 };
  const eventInput = { title: '격리 동반신청 검사', type: 'halloween', date: '2026-10-31', start: '22:00', end: '01:00', area: '격리 지역', address: '비공개 시험 장소', mapUrl: 'https://example.com/private-map', fee: 25000, deposit: 25000, account: '실제 송금 불가 시험 계좌', deadline: '행사 전', included: '시험', notice: '격리 시험 공지', benefitsEnabled: true, benefits: [], cardsEnabled: true };
  const call = (action: string, target = '', data: Record<string, unknown> = {}, revision?: number, admin = false, who = owner, requestId = randomUUID(), engine = service) => engine.mutate(who, admin, { action, target, data, ...(revision === undefined ? {} : { revision }), requestId });
  const app = (id: string) => service.store.transaction(async tx => (await tx.get<HubApplication>('application', id))!);
  const event = () => service.store.transaction(async tx => (await tx.get<HubEvent>('event', eventId))!);
  const account = (id = owner) => service.store.transaction(async tx => (await tx.get<HubOwner>('owner', id))!);
  const group = async (who = owner) => (await account(who)).companionDrafts![eventId];
  const freshOwner = () => service.session(randomBytes(32).toString('base64url'), true);
  const createOwn = async (who: string, name = nickname()) => String((await call('application.basic', '', { eventId, basic: basic(name) }, undefined, false, who)).id);
  const saveDraft = async (who = owner, value = { nickname: nickname(), birthYear: 1995, location: '서울' }) => {
    const id = randomUUID();
    const revision = (await account(who)).companionDrafts?.[eventId]?.revision ?? 0;
    await call('companion.draft.save', '', { eventId, id, basic: value, permissionToProvide: true }, revision, false, who);
    return id;
  };
  const submit = async (draftIds: string[], who = owner, requestId = randomUUID(), engine = service) => call('companion.submit', '', { eventId, basic: basic(), draftIds }, (await group(who)).revision, false, who, requestId, engine);
  const submitted = async (count = 2) => {
    const drafts: string[] = [];
    for (let i = 0; i < count; i++) drafts.push(await saveDraft());
    const result = await submit(drafts);
    return { self: String(result.id), children: result.companionApplicationIds as string[], drafts };
  };
  const confirm = async (self: string, children: string[]) => {
    await call('application.consent', self, { consent }, (await app(self)).revision);
    const revisions = Object.fromEntries((await Promise.all(children.map(app))).map(a => [a.id, a.revision]));
    await call('companion.confirm', self, { eventId, applicationIds: children, revisions, groupRevision: (await group()).revision }, (await app(self)).revision);
  };
  const report = async (ids: string[], requestId = randomUUID()) => {
    const applications = await Promise.all(ids.map(app));
    return call('companion.report', '', { eventId, applicationIds: ids, combinedPayment: true, revisions: Object.fromEntries(applications.map(a => [a.id, a.revision])) }, undefined, false, owner, requestId);
  };
  const approve = async (id: string) => call('admin.application.payment', id, { status: 'approved', bankChecked: true }, (await app(id)).revision, true);
  const requestLink = async (who: string) => call('companion.link.request', '', { eventId }, undefined, false, who);
  const link = async (who: string, id: string) => {
    const result = await requestLink(who);
    const request = (await account(who)).companionLinkRequests![eventId];
    expect(result.linkRequestId).toBe(request.id);
    // Deliberately no body eventId/owner: the pending request is authoritative.
    await call('admin.companion.link', request.id, { applicationId: id, applicationRevision: (await app(id)).revision, identityChecked: true }, request.revision, true);
  };
  const setModule = (enabled: boolean) => pool.query("UPDATE app_kv_rows SET data=jsonb_set(data,'{module_flags,event_hub}',$1::jsonb) WHERE table_name='app_settings' AND row_id='settings'", [JSON.stringify(enabled)]);
  const activate = () => pool.query("UPDATE app_kv_rows SET data=data||$1::jsonb WHERE table_name='app_settings' AND row_id='settings'", [JSON.stringify({ session_active: true, event_cycle_started_at: '2026-10-31T13:00:00Z', event_cycle_archive_id: `binpc2:event-anon:v1:2026-10-31:${randomUUID()}`, event_cycle_reset_complete: false })]);

  beforeAll(async () => {
    if (!url) throw new Error('An explicit isolated fixture URL is required');
    isolatedFixtureDatabase(url, ['binpc2_hub_test', 'binpc2_hub_test_resume']);
    control = new pg.Pool({ connectionString: url, max: 1 });
    await control.query(`CREATE SCHEMA "${schema}"`);
    madeSchema = true;
    pool = new pg.Pool({ connectionString: url, max: 6, options: `-c search_path=${schema}` });
    otherPool = new pg.Pool({ connectionString: url, max: 3, options: `-c search_path=${schema}` });
    await pool.query(readFileSync(new URL('../../migrations/20261027_event_hub.sql', import.meta.url), 'utf8'));
    await pool.query('CREATE TABLE app_kv_rows(table_name text NOT NULL,row_id text NOT NULL,data jsonb NOT NULL,updated_at timestamptz DEFAULT now(),PRIMARY KEY(table_name,row_id))');
    await pool.query("INSERT INTO app_kv_rows(table_name,row_id,data) VALUES('app_settings','settings',$1)", [JSON.stringify({ id: 'settings', module_flags: { event_hub: true }, session_active: false })]);
    service = new EventHubService(new HubStore(pool, secret), secret, now);
    otherService = new EventHubService(new HubStore(otherPool, secret), secret, now);
  });
  beforeEach(async () => {
    await setModule(true);
    // Only this suite's fresh schema is opened for synthetic registrations.
    const lab = new EventTestModeService(service.store, now);
    const old = (await lab.state(true)).mode;
    const reset = await lab.mutate(true, { operation: 'reset', generation: old.generation, revision: old.revision });
    const off = await lab.mutate(true, { operation: 'mode', enabled: false, generation: reset.mode.generation, revision: reset.mode.revision, resetGeneration: reset.mode.generation });
    await lab.mutate(true, { operation: 'admission', open: true, confirmOpen: true, generation: off.mode.generation, revision: off.mode.revision });
    owner = await freshOwner();
    eventId = String((await call('event.save', '', eventInput, undefined, true)).id);
    await call('event.recruitment', eventId, { enabled: true }, (await event()).revision, true);
  });
  afterAll(async () => {
    await Promise.all([pool?.end(), otherPool?.end()]);
    if (madeSchema) await control!.query(`DROP SCHEMA "${schema}" CASCADE`);
    await control?.end();
  });

  it('submits own + friends atomically across Saturday rank 3/4 without copying personal consent', async () => {
    const e = await event();
    await call('event.save', eventId, { ...eventInput, campaign: { kind: 'halloween-saturday', round: 1, secondRoundLink: '' } }, e.revision, true);
    await createOwn(await freshOwner());
    await createOwn(await freshOwner());
    const { self, children } = await submitted(2);
    const applications = await Promise.all([self, ...children].map(app));
    expect(applications.map(a => a.rank)).toEqual([3, 4, 5]);
    expect(applications.map(a => a.quote?.fee)).toEqual([10000, 13000, 13000]);
    expect(new Set(applications.map(a => a.owner)).size).toBe(3);
    for (const a of applications.slice(1)) {
      expect(a.sponsorOwner).toBe(owner);
      expect(a.basic.collection).toBeUndefined();
      expect(a.basic.phone).toBeUndefined();
      expect(a.consent).toBeUndefined();
      expect(a.profile).toEqual({ lastStep: 1 });
      expect(a.companionSubmission?.personalConsentPending).toBe(true);
    }
    expect((await event()).nextRank).toBe(5);
    expect(applications.every(a => a.basic.phone === undefined)).toBe(true);
  });

  it('accepts no-phone registration through the real Express route, with manual approval and personal entry still required', async () => {
    const route = await import('../routes/event-hub.js');
    const spies = [
      vi.spyOn(route.eventHubService, 'session').mockImplementation(service.session.bind(service)),
      vi.spyOn(route.eventHubService, 'mutate').mockImplementation(service.mutate.bind(service)),
      vi.spyOn(route.eventHubService, 'autoTick').mockResolvedValue(undefined),
    ];
    try {
      const http = express();
      http.use(express.json());
      http.use(session({ secret: 'isolated-pg-http-session', resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'lax' } }));
      http.use('/api/event-hub', route.default);
      const client = request.agent(http);
      const input = basic();
      const command = { action: 'application.basic', target: '', data: { eventId, basic: input }, requestId: randomUUID() };
      await request(http).post('/api/event-hub/mutate').send(command).expect(401);
      const recoveryCode = randomBytes(32).toString('base64url');
      await client.post('/api/event-hub/session').send({ recoveryCode, create: true }).expect(200);
      const who = await service.session(recoveryCode, false);
      const response = await client.post('/api/event-hub/mutate').send(command).expect(200);
      const id = String(response.body.id);
      expect(await app(id)).toMatchObject({ owner: who, payment: 'none' });
      expect((await app(id)).basic.phone).toBeUndefined();
      const post = async (action: string, data: Record<string, unknown>, admin = false) => {
        const pending = client.post('/api/event-hub/mutate');
        if (admin) pending.set('x-admin-token', 'isolated-pg-route-admin');
        return pending.send({ action, target: id, data, revision: (await app(id)).revision, requestId: randomUUID() });
      };
      expect((await post('application.consent', { consent })).status).toBe(200);
      expect((await post('application.confirm', {})).status).toBe(200);
      expect((await post('application.report', {})).status).toBe(200);
      expect((await app(id)).payment).toBe('reported');
      expect((await post('admin.application.payment', { status: 'approved', bankChecked: true, admin: true })).status).toBe(403);
      expect((await post('application.enter', { deviceSecret: 'isolated-no-phone-device' })).body.code).toBe('ATTENDANCE');
      expect((await post('admin.application.payment', { status: 'approved', bankChecked: true }, true)).status).toBe(200);
      expect((await post('application.enter', { deviceSecret: 'isolated-no-phone-device' })).body.code).toBe('PROFILE_INCOMPLETE');
      expect((await post('application.profile', { profile })).status).toBe(200);
      await activate();
      const entered = await post('application.enter', { deviceSecret: 'isolated-no-phone-device' });
      expect(entered.status).toBe(200);
      expect(entered.body.profile).toMatchObject({ event_hub_owner: who, phone_number: null });
      expect((await app(id)).basic.phone).toBeUndefined();
      expect((await app(id)).profileId).toBe(entered.body.profile.id);
    } finally { spies.forEach(spy => spy.mockRestore()); }
  });

  it('keeps the production policy fingerprint guard when no contact phone is submitted', async () => {
    const policy = { ...DEFAULT_PRIVACY_POLICY, policyVersion: 'isolated-no-phone-v1', controllerName: '합성 주체', contact: 'example.invalid', notice: '격리 시험 정책 원문', backupProcedure: '합성 백업 절차', rules: Object.fromEntries(Object.keys(DEFAULT_PRIVACY_POLICY.rules).map(key => [key, { days: 30, basis: '격리 검토 근거' }])) };
    await call('admin.privacy.policy', '', policy, 0, true);
    await call('admin.privacy.policy.approve', '', { confirmed: true }, 1, true);
    const approved = (await service.state(owner, true)).privacyPolicy!;
    const oldEnv = { node: process.env.NODE_ENV, release: process.env.EVENT_HUB_PRODUCTION_RELEASE, hash: process.env.EVENT_HUB_RELEASE_POLICY_SHA256 };
    try {
      process.env.NODE_ENV = 'production';
      process.env.EVENT_HUB_PRODUCTION_RELEASE = 'approved-v6';
      process.env.EVENT_HUB_RELEASE_POLICY_SHA256 = approved.publicationFingerprint;
      const input = basic();
      await expect(call('application.basic', '', { eventId, basic: input })).rejects.toMatchObject({ code: 'PRIVACY_NOTICE_CHANGED' });
      await expect(call('application.basic', '', { eventId, basic: input, privacyPolicyFingerprint: '0'.repeat(64) })).rejects.toMatchObject({ code: 'PRIVACY_NOTICE_CHANGED' });
      const created = await call('application.basic', '', { eventId, basic: input, privacyPolicyFingerprint: approved.publicationFingerprint });
      expect(await app(String(created.id))).toMatchObject({ payment: 'none', privacyPolicyConsent: { fingerprint: approved.publicationFingerprint } });
      expect((await app(String(created.id))).basic.phone).toBeUndefined();
    } finally {
      for (const [name, value] of Object.entries({ NODE_ENV: oldEnv.node, EVENT_HUB_PRODUCTION_RELEASE: oldEnv.release, EVENT_HUB_RELEASE_POLICY_SHA256: oldEnv.hash })) {
        if (value === undefined) delete process.env[name]; else process.env[name] = value;
      }
    }
  });

  it('requests reward contact only after actual payment, and preserves stored contact when the request is cancelled', async () => {
    const id = await createOwn(owner);
    const rev = async () => (await app(id)).revision;
    await expect(call('application.phone', id, { phone: '01022223333', purposeAccepted: true }, await rev())).rejects.toMatchObject({ code: 'REWARD_RECEIPT' });
    const resultId = randomUUID();
    await call('admin.application.result', id, { id: resultId, label: '격리 시험 수동 상금', kind: 'cash', amount: 3000, reason: '합성 현장 확인' }, await rev(), true);
    const contact = { source: 'result', resultId, purpose: '실제 지급한 상금 수령 확인용' };
    await expect(call('admin.application.phone-request', id, contact, await rev(), true)).rejects.toMatchObject({ code: 'REWARD_RECEIPT' });
    await call('admin.application.result.confirm', id, { id: resultId, field: 'receivedAt' }, await rev(), true);
    await expect(call('admin.application.phone-request', id, contact, await rev(), true)).rejects.toMatchObject({ code: 'REWARD_RECEIPT' });
    await expect(call('admin.application.result.confirm', id, { id: resultId, field: 'paidAt' }, await rev(), true)).rejects.toMatchObject({ code: 'DOUBLE_CHECK' });
    await call('admin.application.result.confirm', id, { id: resultId, field: 'paidAt', doubleChecked: true }, await rev(), true);
    await expect(call('admin.application.phone-request', id, contact, await rev())).rejects.toMatchObject({ code: 'ADMIN' });
    await call('admin.application.phone-request', id, contact, await rev(), true);
    await expect(call('application.phone', id, { phone: '01022223333' }, await rev())).rejects.toMatchObject({ code: 'PURPOSE' });
    const outsider = await freshOwner();
    await expect(call('application.phone', id, { phone: '01022223333', purposeAccepted: true }, await rev(), false, outsider)).rejects.toMatchObject({ code: 'APPLICATION' });
    await call('application.phone', id, { phone: '01022223333', purposeAccepted: true }, await rev());
    expect((await app(id)).rewardPhone).toBe('01022223333');
    expect((await app(id)).basic.phone).toBeUndefined();
    expect((await app(id)).payment).toBe('none');
    expect(JSON.stringify(await service.state(outsider))).not.toContain('01022223333');
    const paidAt = (await app(id)).manualResults![0].paidAt;
    await call('admin.application.phone-request', id, { cancel: true }, await rev(), true);
    expect((await app(id)).rewardPhone).toBe('01022223333');
    expect((await app(id)).rewardPhoneRequest).toBeUndefined();
    expect((await app(id)).manualResults![0].paidAt).toBe(paidAt);
    await expect(call('application.phone', id, { phone: '01033334444', purposeAccepted: true }, await rev())).rejects.toMatchObject({ code: 'REWARD_RECEIPT' });
  });

  it('opens an image-only notice and requires renewed consent after replacing it without changing approval or private map access', async () => {
    await call('event.recruitment', eventId, { enabled: false }, (await event()).revision, true);
    await call('event.save', eventId, { ...eventInput, notice: '' }, (await event()).revision, true);
    await expect(call('event.recruitment', eventId, { enabled: true }, (await event()).revision, true)).rejects.toMatchObject({ code: 'NOTICE' });
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD9sAAAAASUVORK5CYII=';
    const upload = async (purpose: string, alt: string) => call('event.media.upload', eventId, { purpose, alt, publicConfirmed: purpose === 'notice', mime: 'image/png', base64: png }, (await event()).revision, true);
    await upload('map', '비공개 합성 지도');
    await upload('poster', '기존 승인자 전용 포스터');
    await expect(call('event.recruitment', eventId, { enabled: true }, (await event()).revision, true)).rejects.toMatchObject({ code: 'NOTICE' });
    const notice = await upload('notice', '합성 공개 공지');
    await call('event.recruitment', eventId, { enabled: true }, (await event()).revision, true);
    const id = await createOwn(owner);
    await call('application.consent', id, { consent }, (await app(id)).revision);
    await call('application.confirm', id, {}, (await app(id)).revision);
    await approve(id);
    await call('application.profile', id, { profile }, (await app(id)).revision);
    const approved = await app(id), acceptedVersion = approved.consent!.noticeVersion;
    await upload('map', '지도 추가는 공지 동의를 바꾸지 않음');
    expect((await event()).noticeVersion).toBe(acceptedVersion);
    const updatedNotice = await upload('notice', '새 합성 공개 공지');
    expect((await event()).noticeVersion).toBeGreaterThan(acceptedVersion);
    expect((await app(id)).payment).toBe('approved');
    expect((await app(id)).approvedAt).toBe(approved.approvedAt);
    await expect(call('application.enter', id, { deviceSecret: 'isolated-notice-device' }, (await app(id)).revision)).rejects.toMatchObject({ code: 'CONSENT' });
    const latest = await event();
    await expect(call('event.media.update', eventId, { items: latest.materials!.map(item => ({ id: item.id, alt: item.alt, hidden: item.purpose === 'notice' })) }, latest.revision, true)).rejects.toMatchObject({ code: 'NOTICE' });
    const ids = [notice.mediaUrl, updatedNotice.mediaUrl].map(value => String(value).match(/([a-f0-9-]{36})\./)![1]);
    for (const mediaId of ids) expect((await service.media(mediaId, owner)).base64).toBe(png);
    expect((await event()).versions?.some(version => (version.noticeMedia ?? []).some(item => item.url === notice.mediaUrl))).toBe(true);
    await call('application.notice', id, {}, (await app(id)).revision);
    expect((await app(id)).consent?.noticeVersion).toBe((await event()).noticeVersion);
    expect((await app(id)).payment).toBe('approved');
    await activate();
    expect((await call('application.enter', id, { deviceSecret: 'isolated-notice-device' }, (await app(id)).revision)).profile).toBeTruthy();
  });

  it('atomically replaces a public notice at the ten-visible limit without promoting other types or deleting originals', async () => {
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD9sAAAAASUVORK5CYII=';
    const payload = { purpose: 'notice', publicConfirmed: true, mime: 'image/png', base64: png };
    for (let index = 0; index < 10; index++) await call('event.media.upload', eventId, { ...payload, alt: `합성 공지 ${index}` }, (await event()).revision, true);
    const before = await event();
    const original = before.materials![3];
    const otherId = String((await call('event.save', '', { ...eventInput, title: '다른 격리 행사' }, undefined, true)).id);
    const otherUpload = await call('event.media.upload', otherId, { ...payload, alt: '다른 행사 공지' }, 1, true);
    const foreignId = String(otherUpload.mediaUrl).match(/([a-f0-9-]{36})\./)![1];
    await expect(call('event.media.upload', eventId, { ...payload, alt: '11번째 추가' }, before.revision, true)).rejects.toMatchObject({ code: 'MEDIA_LIMIT' });
    await expect(call('event.media.upload', eventId, { ...payload, purpose: 'map', replaceId: original.id }, before.revision, true)).rejects.toMatchObject({ code: 'MEDIA_REPLACE' });
    await expect(call('event.media.upload', eventId, { ...payload, replaceId: foreignId }, before.revision, true)).rejects.toMatchObject({ code: 'MEDIA_REPLACE' });
    await expect(call('event.media.upload', eventId, { ...payload, publicConfirmed: false, replaceId: original.id }, before.revision, true)).rejects.toMatchObject({ code: 'MEDIA_PUBLIC_CONFIRM' });
    await expect(call('event.media.upload', eventId, { ...payload, replaceId: original.id }, before.revision)).rejects.toMatchObject({ code: 'ADMIN' });
    expect(await event()).toEqual(before);
    const requestId = randomUUID(), replacement = { ...payload, replaceId: original.id, alt: '교체된 합성 공지' };
    const result = await call('event.media.upload', eventId, replacement, before.revision, true, owner, requestId);
    expect(await call('event.media.upload', eventId, replacement, before.revision, true, owner, requestId)).toEqual(result);
    const after = await event();
    expect(after.media).toEqual(before.media.map(url => url === original.url ? result.mediaUrl : url));
    expect(after.media).toHaveLength(10);
    expect(after.materials).toHaveLength(11);
    expect(after.materials!.filter(item => !item.hidden)).toHaveLength(10);
    expect(after.noticeVersion).toBe(before.noticeVersion + 1);
    expect(after.revision).toBe(before.revision + 1);
    expect(after.materials!.find(item => item.id === original.id)).toMatchObject({ ...original, hidden: true });
    for (const item of before.materials!) {
      expect(after.materials!.some(value => value.id === item.id && value.url === item.url && value.purpose === item.purpose)).toBe(true);
      expect((await service.media(item.id, owner, true)).base64).toBe(png);
    }
    await expect(service.media(original.id, owner)).rejects.toMatchObject({ code: 'MEDIA' });
    const replacementId = String(result.mediaUrl).match(/([a-f0-9-]{36})\./)![1];
    expect((await service.media(replacementId, owner)).base64).toBe(png);
  });

  it('deduplicates the same request concurrently across independent pools and after restart', async () => {
    const draft = await saveDraft();
    const requestId = randomUUID();
    const command = { action: 'companion.submit', target: '', revision: (await group()).revision, data: { eventId, basic: basic(), draftIds: [draft] }, requestId };
    const results = await Promise.all([service.mutate(owner, false, command), otherService.mutate(owner, false, command)]);
    expect(results[0]).toEqual(results[1]);
    expect(await new EventHubService(new HubStore(otherPool, secret), secret, now).mutate(owner, false, command)).toEqual(results[0]);
    expect((await event()).nextRank).toBe(2);
    const children = results[0].companionApplicationIds as string[];
    expect((await app(children[0])).history.filter(h => h.action === 'companion.submit')).toHaveLength(1);
    expect((await group()).items.filter(d => d.applicationId)).toHaveLength(1);
    const retry = await submit([draft]);
    expect(retry.id).toBe(results[0].id);
    expect(retry.companionApplicationIds).toEqual(children);
    expect((await event()).nextRank).toBe(2);
  });

  it('serializes different simultaneous groups with contiguous per-person ranks', async () => {
    const peer = await freshOwner();
    const first = await saveDraft(owner);
    const second = await saveDraft(peer);
    const results = await Promise.all([submit([first], owner), submit([second], peer, randomUUID(), otherService)]);
    const ids = results.flatMap(r => [String(r.id), ...(r.companionApplicationIds as string[])]);
    const rows = await Promise.all(ids.map(app));
    expect(rows.map(a => a.rank).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
    expect(new Set(ids).size).toBe(4);
    for (const result of results) expect((await app((result.companionApplicationIds as string[])[0])).rank).toBe((await app(String(result.id))).rank + 1);
  });

  it('rolls back own registration, first child, rank and receipt when a later friend has a conflicting nickname', async () => {
    const name = nickname();
    const first = await saveDraft(owner, { nickname: name, birthYear: 1995, location: '서울' });
    const invalid = await saveDraft(owner, { nickname: name, birthYear: 1996, location: '인천' });
    const before = await group();
    const ownerCount = Number((await pool.query("SELECT count(*) FROM event_hub_records WHERE kind='owner'")).rows[0].count);
    const requestId = randomUUID();
    await expect(submit([first, invalid], owner, requestId)).rejects.toMatchObject({ code: 'NICKNAME' });
    expect((await event()).nextRank).toBe(0);
    expect(await group()).toEqual(before);
    expect((await pool.query("SELECT count(*) FROM event_hub_records WHERE kind='application' AND data->>'eventId'=$1", [eventId])).rows[0].count).toBe('0');
    expect(Number((await pool.query("SELECT count(*) FROM event_hub_records WHERE kind='owner'")).rows[0].count)).toBe(ownerCount);
    expect(await service.receipt(owner, false, requestId)).toMatchObject({ saved: false });
  });

  it('shows only limited friend summaries, with fee hidden until the sponsor accepts notice', async () => {
    const { self, children } = await submitted(1);
    const childId = children[0];
    await service.store.transaction(async tx => {
      const a = (await tx.get<HubApplication>('application', childId))!;
      a.basic.phone = '01011112222'; a.rewardPhone = '01033334444'; a.profile = { ...profile, lastStep: 6 } as HubApplication['profile'];
      await tx.put('application', childId, a);
    });
    const before = await service.state(owner);
    expect((before.applications as HubApplication[]).map(a => a.id)).toEqual([self]);
    const hidden = before.companionApplications.find(a => a.id === childId)!;
    expect(hidden.quote).toBeUndefined();
    expect(hidden.rank).toBeUndefined();
    await call('application.consent', self, { consent }, (await app(self)).revision);
    const after = await service.state(owner);
    const summary = after.companionApplications.find(a => a.id === childId)!;
    expect(summary.quote?.fee).toBe(25000);
    const encoded = JSON.stringify(summary);
    for (const forbidden of ['01011112222', '01033334444', 'INTJ', 'recovery', 'profile', 'owner', 'private-map', '비공개 시험 장소']) expect(encoded).not.toContain(forbidden);
    for (const action of ['application.profile', 'application.enter', 'application.draw']) await expect(call(action, childId, action === 'application.profile' ? { profile } : {}, (await app(childId)).revision)).rejects.toMatchObject({ code: 'APPLICATION' });
  });

  it('records one combined deposit report but requires independent manual approvals', async () => {
    const { self, children } = await submitted(2);
    const ids = [self, ...children];
    await confirm(self, children);
    const result = await report(ids);
    const reported = await Promise.all(ids.map(app));
    expect(reported.map(a => a.payment)).toEqual(['reported', 'reported', 'reported']);
    expect(new Set(reported.map(a => a.combinedPaymentReport?.batchId))).toEqual(new Set([result.batchId]));
    expect(reported.every(a => !a.approvedAt && a.attendance === 'pending')).toBe(true);
    await approve(children[0]);
    expect((await Promise.all(ids.map(app))).map(a => a.payment)).toEqual(['reported', 'approved', 'reported']);
    const revision = (await app(children[1])).revision;
    const requestId = randomUUID();
    const data = { status: 'approved', bankChecked: true };
    const first = await call('admin.application.payment', children[1], data, revision, true, owner, requestId);
    expect(await call('admin.application.payment', children[1], data, revision, true, owner, requestId)).toEqual(first);
    expect((await app(children[1])).revision).toBe(revision + 1);
    expect((await app(self)).payment).toBe('reported');
    expect((await app(children[0])).consent).toBeUndefined();
    await expect(call('application.enter', children[0], {}, (await app(children[0])).revision)).rejects.toMatchObject({ code: 'APPLICATION' });
  });

  it('rejects a stale friend revision after admin review without partially confirming the group', async () => {
    const { self, children } = await submitted(2);
    await call('application.consent', self, { consent }, (await app(self)).revision);
    const revisions = Object.fromEntries((await Promise.all(children.map(app))).map(a => [a.id, a.revision]));
    const ownRevision = (await app(self)).revision;
    const groupRevision = (await group()).revision;
    await call('admin.application.eligibility', children[1], { status: 'approved', reason: '격리 시험의 참가 검토' }, revisions[children[1]], true);
    await expect(call('companion.confirm', self, { eventId, applicationIds: children, revisions, groupRevision }, ownRevision)).rejects.toMatchObject({ code: 'REVISION' });
    expect((await Promise.all([self, ...children].map(app))).every(a => !a.confirmedAt && a.payment === 'none')).toBe(true);
    expect((await app(children[1])).eligibility?.status).toBe('approved');
  });

  it('preserves paid rank/quote when friend requests linking and personally completes consent', async () => {
    const { self, children } = await submitted(1);
    const childId = children[0];
    await confirm(self, children); await report([self, childId]); await approve(childId);
    const original = await app(childId);
    const friendOwner = await freshOwner();
    await link(friendOwner, childId);
    expect((await app(childId)).owner).toBe(friendOwner);
    await expect(call('application.enter', childId, {}, (await app(childId)).revision, false, friendOwner)).rejects.toMatchObject({ code: 'COMPANION_CONSENT' });
    await call('application.basic', '', { eventId, edit: true, basic: basic(original.basic.nickname) }, (await app(childId)).revision, false, friendOwner);
    await call('application.consent', childId, { consent }, (await app(childId)).revision, false, friendOwner);
    const done = await app(childId);
    expect(done).toMatchObject({ id: original.id, rank: original.rank, quote: original.quote, payment: 'approved', confirmedAt: original.confirmedAt, sponsorOwner: owner });
    expect(done.companionSubmission?.personalConsentPending).toBe(false);
    expect(done.consent?.collection).toBe(true);
    await expect(call('application.enter', childId, {}, done.revision, false, friendOwner)).rejects.toMatchObject({ code: 'PROFILE_INCOMPLETE' });
    await call('application.profile', childId, { profile }, done.revision, false, friendOwner);
    await pool.query("UPDATE app_kv_rows SET data=data||$1::jsonb WHERE table_name='app_settings' AND row_id='settings'", [JSON.stringify({ session_active: true, event_cycle_started_at: '2026-10-31T13:00:00Z', event_cycle_archive_id: `binpc2:event-anon:v1:2026-10-31:${randomUUID()}`, event_cycle_reset_complete: false })]);
    const entered = await call('application.enter', childId, { deviceSecret: 'isolated-friend-device-secret' }, (await app(childId)).revision, false, friendOwner);
    expect((entered.profile as Record<string, unknown>).event_hub_owner).toBe(friendOwner);
    expect((await app(childId)).profileId).toBe((entered.profile as Record<string, unknown>).id);
    expect((await app(self)).profileId).toBeUndefined();
    await expect(call('application.enter', childId, { deviceSecret: 'sponsor-cannot-bind-friend' }, (await app(childId)).revision)).rejects.toMatchObject({ code: 'APPLICATION' });
    expect((await service.state(friendOwner)).applications.map(a => a.id)).toEqual([childId]);
    expect((await service.state(owner)).applications.map(a => a.id)).toEqual([self]);
    expect((await event()).nextRank).toBe(2);
  });

  it('rejects unauthenticated admin claims and refuses to merge an existing friend application', async () => {
    const { children } = await submitted(1);
    const friendOwner = await freshOwner();
    const result = await requestLink(friendOwner);
    const request = (await account(friendOwner)).companionLinkRequests![eventId];
    const data = { applicationId: children[0], applicationRevision: (await app(children[0])).revision, identityChecked: true };
    await expect(call('admin.companion.link', String(result.linkRequestId), data, request.revision, false, friendOwner)).rejects.toMatchObject({ code: 'ADMIN' });
    const existing = await createOwn(friendOwner);
    await expect(call('admin.companion.link', request.id, data, request.revision, true)).rejects.toMatchObject({ code: 'COMPANION_CONFLICT' });
    expect((await app(existing)).owner).toBe(friendOwner);
    expect((await app(children[0])).companionSubmission?.linkedAt).toBeUndefined();
    expect((await account(friendOwner)).companionLinkRequests![eventId].status).toBe('pending');
  });

  it('allows an existing boss-test friend to finish after recruitment/module OFF without opening public admission', async () => {
    const { self, children } = await submitted(1);
    const childId = children[0];
    await confirm(self, children); await report([self, childId]); await approve(childId);
    await service.store.transaction(async tx => {
      const e = (await tx.get<HubEvent>('event', eventId))!; e.bossTestOnly = true; e.recruitment = false; await tx.put('event', e.id, e);
      for (const id of [self, childId]) { const a = (await tx.get<HubApplication>('application', id))!; a.bossTestOnly = true; await tx.put('application', id, a); }
    });
    const lab = new EventTestModeService(service.store, now);
    const old = (await lab.state(true)).mode;
    await lab.mutate(true, { operation: 'mode', enabled: true, generation: old.generation, revision: old.revision });
    await setModule(false);
    const friendOwner = await freshOwner();
    await withVerifiedBossParticipation(() => link(friendOwner, childId));
    const original = await app(childId);
    await withVerifiedBossParticipation(() => call('application.basic-draft', '', { eventId, basic: { nickname: original.basic.nickname, collection: true, version: HUB_CONSENT_VERSION }, nextStep: 1 }, 0, false, friendOwner));
    expect((await account(friendOwner)).basicDrafts![eventId].basic.nickname).toBe(original.basic.nickname);
    expect(await app(childId)).toEqual(original);
    await withVerifiedBossParticipation(() => call('application.basic', '', { eventId, edit: true, basic: basic(original.basic.nickname) }, original.revision, false, friendOwner));
    expect((await account(friendOwner)).basicDrafts?.[eventId]).toBeUndefined();
    await withVerifiedBossParticipation(async () => call('application.consent', childId, { consent }, (await app(childId)).revision, false, friendOwner));
    expect(await app(childId)).toMatchObject({ owner: friendOwner, rank: original.rank, quote: original.quote, payment: 'approved' });
    expect((await lab.state(true)).mode).toMatchObject({ enabled: true, publicAdmissionOpen: false });
    expect((await event()).recruitment).toBe(false);
    expect((await pool.query("SELECT data->'module_flags'->>'event_hub' value FROM app_kv_rows WHERE table_name='app_settings'")).rows[0].value).toBe('false');
    await expect(call('companion.link.request', '', { eventId }, undefined, false, await freshOwner())).rejects.toMatchObject({ code: 'BOSS_AUTH' });
  });
});
