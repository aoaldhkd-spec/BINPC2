import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { APPROVED_PRIVACY_RETENTION_RULES, APPROVED_REWARD_PHONE_RULE, DEFAULT_PRIVACY_POLICY, HubEventInput, type HubApplication, type HubEvent, type PrivacyPolicy } from '@workspace/api-zod';
import { EventHubService, type HubMember, type HubOwner, type HubThread } from './event-hub-service.js';
import { HubStore, digest } from './event-hub-store.js';
import { isolatedFixtureDatabase } from './event-hub-isolation.js';
import { executePrivacyPlanForIsolatedTest, planPrivacy, privacySnapshot } from './event-hub-privacy.js';
import { assertPrivacyRestoreCheckpoint, capturePrivacyRestoreCheckpoint } from './event-hub-privacy-restore.js';
import { atomicEventReset } from './db-event-reset-transaction.js';

const url = process.env.HUB_TEST_DATABASE_URL;
const end = '2026-10-31T16:00:00.000Z'; // 2026-11-01 01:00 KST, not the onsite 17:00 reset.
const at = (days: number) => new Date(Date.parse(end) + days * 86400000);
const confirmed = { mode: 'isolated-test' as const, policyConfirmed: true, identityConfirmed: true, backupConfirmed: true };
const approvedPurposes = (): PrivacyPolicy => ({ ...structuredClone(DEFAULT_PRIVACY_POLICY), revision: 1,
  rules: { ...structuredClone(DEFAULT_PRIVACY_POLICY.rules), ...structuredClone(APPROVED_PRIVACY_RETENTION_RULES) }, rewardPhoneRule: { ...APPROVED_REWARD_PHONE_RULE } });
// Unknown audit/recovery/backup periods remain unknown in the real policy. These
// isolated-only values permit exercising the otherwise unreachable test executor.
const executionFixturePolicy = (): PrivacyPolicy => ({ ...approvedPurposes(), status: 'approved', backupProcedure: '합성 fixture 전용: 운영 정책·외부 백업 완료를 의미하지 않음',
  rules: { ...approvedPurposes().rules, ...Object.fromEntries(['audit', 'recovery', 'backup'].map(key => [key, { days: 1, basis: '격리 테스트 전용 값; 사용자 운영 보관기간이 아님' }])) } });

describe.skipIf(!url)('purpose retention — actual isolated PostgreSQL', () => {
  const schema = `retention_pg_${randomUUID().replaceAll('-', '')}`;
  let control: pg.Pool | undefined, pool: pg.Pool, store: HubStore, madeSchema = false;
  let who: HubOwner, eventId: string;
  const plan = (when: Date) => store.transaction(tx => planPrivacy(tx, who.id, when));
  const readApp = (id: string) => store.transaction(tx => tx.get<HubApplication>('application', id));
  const apply = async (when: Date) => executePrivacyPlanForIsolatedTest(store, who.id, (await plan(when)).fingerprint, confirmed, when);
  const content = async () => (await pool.query("SELECT md5(string_agg(kind||id||data::text, '' ORDER BY kind,id)) value FROM event_hub_records")).rows[0].value;
  const makeApp = (overrides: Partial<HubApplication> = {}): HubApplication => ({ id: randomUUID(), eventId, owner: who.id, revision: 1, stage: 4, rank: 1,
    basic: { nickname: '가상참가', birthYear: 1995, location: '부산', depositor: '합성입금자' }, payment: 'approved', approvedAt: end, confirmedAt: end,
    attendance: 'confirmed', checkin: false, profile: { lastStep: 1 }, cards: [], prizesGiven: [], history: [], updatedAt: end,
    quote: { fee: 15000, original: 25000, benefit: '합성 회비', version: 1, kind: 'fixed' }, ...overrides });
  beforeAll(async () => {
    if (!url) throw Error('Explicit isolated test URL required');
    isolatedFixtureDatabase(url, ['binpc2_hub_test_resume']);
    control = new pg.Pool({ connectionString: url, max: 1 });
    await control.query(`CREATE SCHEMA "${schema}"`); madeSchema = true;
    pool = new pg.Pool({ connectionString: url, max: 2, options: `-c search_path=${schema}` });
    await pool.query(readFileSync(new URL('../../migrations/20261027_event_hub.sql', import.meta.url), 'utf8'));
    await pool.query('CREATE TABLE app_kv_rows(table_name text NOT NULL,row_id text NOT NULL,data jsonb NOT NULL,updated_at timestamptz DEFAULT now(),PRIMARY KEY(table_name,row_id))');
    store = new HubStore(pool, 'isolated-retention-test-secret');
  });
  beforeEach(async () => {
    // Only this suite's newly created schema; public/other fixtures are never reset.
    await pool.query('TRUNCATE event_hub_records, app_kv_rows');
    who = { id: randomUUID(), recoveryHash: digest(randomBytes(32).toString('base64url')), createdAt: end };
    eventId = randomUUID();
    const event: HubEvent = { ...HubEventInput.parse({ title: '보관기간 합성 검사', date: '2026-10-31', start: '22:00', end: '01:00', area: '합성', address: '비공개 합성 장소', fee: 25000, account: '실제 송금 불가', deadline: '행사 전', notice: '합성 공지' }), id: eventId, revision: 1, recruitment: false, nextRank: 1, history: [] };
    await store.transaction(async tx => { await tx.put('owner', who.id, who); await tx.put('event', eventId, event); await tx.put('settings', 'privacy-policy', executionFixturePolicy()); });
  });
  afterAll(async () => { await pool?.end(); if (madeSchema) await control!.query(`DROP SCHEMA "${schema}" CASCADE`); await control?.end(); });

  it('keeps unknown audit/recovery/backup policy blocked and makes the preview read-only', async () => {
    const policy = approvedPurposes(), application = makeApp();
    await store.transaction(async tx => { await tx.put('settings', 'privacy-policy', policy); await tx.put('application', application.id, application); });
    const before = await content(), preview = await plan(at(200));
    expect(preview.blocked.join(' ')).toMatch(/audit/); expect(preview.blocked.join(' ')).toMatch(/recovery/); expect(preview.blocked.join(' ')).toMatch(/backup/);
    expect(policy.rules.audit.days).toBeNull(); expect(policy.rules.recovery.days).toBeNull(); expect(policy.rules.backup.days).toBeNull();
    expect(await content()).toBe(before);
    await expect(executePrivacyPlanForIsolatedTest(store, who.id, preview.fingerprint, confirmed, at(200))).rejects.toMatchObject({ code: 'PRIVACY_POLICY_INCOMPLETE' });
    expect(await readApp(application.id)).toEqual(application);
    const old = process.env.NODE_ENV; process.env.NODE_ENV = 'production';
    try { await expect(executePrivacyPlanForIsolatedTest(store, who.id, preview.fingerprint, confirmed, at(200))).rejects.toMatchObject({ code: 'PRIVACY_EXECUTION_DISABLED' }); }
    finally { process.env.NODE_ENV = old; }
  });

  it('separates 30-day application minimization, receipt-based phone deletion, and 180-day final financial erasure', async () => {
    const payout = randomUUID(), received = at(12).toISOString();
    const application = makeApp({ rewardPhone: '01000000000', rewardPhoneRetainFrom: received,
      rewardPhoneRequest: { source: 'result', resultId: payout, purpose: '합성 상품 지급 확인', requestedAt: received, fulfilledAt: received, retentionStartedAt: received },
      manualResults: [{ id: payout, label: '합성 상금', kind: 'cash', amount: 5000, at: at(10).toISOString(), paidAt: at(11).toISOString(), receivedAt: received }] });
    await store.transaction(tx => tx.put('application', application.id, application));
    const snapshot = await store.transaction(tx => privacySnapshot(tx, who.id));
    expect(snapshot.applications[0]).toMatchObject({ eventEnd: end, financeAt: received, rewardPhone: { confirmedAt: received } });
    expect((await plan(new Date(at(30).getTime() - 1))).items.find(i => i.kind === 'application')?.action).toBe('keep');
    expect((await plan(at(30))).items.find(i => i.kind === 'application')?.action).toBe('minimize');
    await apply(at(30));
    const minimized = (await readApp(application.id))!;
    expect(minimized.erasedAt).toBe(at(30).toISOString()); expect(minimized.rewardPhone).toBe(application.rewardPhone);
    expect(minimized.payment).toBe('approved'); expect(minimized.manualResults?.[0]).toMatchObject({ id: payout, amount: 5000, paidAt: at(11).toISOString(), receivedAt: received });
    expect((await plan(new Date(at(42).getTime() - 1))).items.find(i => i.kind === 'reward-phone')?.action).toBe('keep');
    expect((await plan(at(42))).items.find(i => i.kind === 'application')?.action).toBe('keep');
    expect((await plan(at(42))).items.find(i => i.kind === 'reward-phone')?.action).toBe('erase');
    await apply(at(42));
    const contactRemoved = (await readApp(application.id))!;
    expect(contactRemoved.rewardPhone).toBeUndefined(); expect(contactRemoved.rewardPhoneRequest).toBeUndefined();
    expect(contactRemoved.manualResults).toEqual(minimized.manualResults); expect(contactRemoved.quote).toEqual(minimized.quote); expect(contactRemoved.payment).toBe('approved');
    expect((await plan(new Date(at(192).getTime() - 1))).items.find(i => i.kind === 'application')?.action).toBe('keep');
    expect((await plan(at(192))).items.find(i => i.kind === 'application')?.action).toBe('erase');
    await apply(at(192)); expect(await readApp(application.id)).toBeUndefined();
  });

  it('keeps an old unresolved inquiry, waits 90 days after resolution, and resets the period when reopened', async () => {
    const thread: HubThread = { id: who.id, status: 'open', messages: [{ id: randomUUID(), sender: 'user', text: '합성 미처리 문의', at: end }], readUserAt: end, readAdminAt: end, tags: [], history: [] };
    await store.transaction(tx => tx.put('thread', who.id, thread));
    expect((await plan(at(800))).items.find(i => i.kind === 'thread')?.action).toBe('keep');
    thread.status = 'resolved'; thread.resolvedAt = at(10).toISOString();
    await store.transaction(tx => tx.put('thread', who.id, thread));
    expect((await plan(new Date(at(100).getTime() - 1))).items.find(i => i.kind === 'thread')?.action).toBe('keep');
    expect((await plan(at(100))).items.find(i => i.kind === 'thread')?.action).toBe('erase');
    thread.status = 'open'; thread.messages.push({ id: randomUUID(), sender: 'user', text: '다시 열린 합성 문의', at: at(101).toISOString() });
    await store.transaction(tx => tx.put('thread', who.id, thread));
    expect((await plan(at(800))).items.find(i => i.kind === 'thread')?.action).toBe('keep');
    thread.status = 'resolved'; thread.resolvedAt = at(110).toISOString();
    await store.transaction(tx => tx.put('thread', who.id, thread));
    expect((await plan(at(199))).items.find(i => i.kind === 'thread')?.action).toBe('keep');
    expect((await plan(at(200))).items.find(i => i.kind === 'thread')?.action).toBe('erase');
  });

  it('uses member last activity + 365 days and keeps withdrawal separate from application/finance records', async () => {
    const application = makeApp();
    const member: HubMember = { id: randomUUID(), owner: who.id, nicknameKey: '가상참가', salt: 'synthetic-salt', passwordHash: '00'.repeat(64), basic: application.basic, profile: application.profile, marketing: false, history: [], lastActivityAt: at(100).toISOString() };
    await store.transaction(async tx => { await tx.put('application', application.id, application); await tx.put('member', member.id, member); });
    expect((await plan(new Date(at(465).getTime() - 1))).items.find(i => i.kind === 'member')?.action).toBe('keep');
    expect((await plan(at(465))).items.find(i => i.kind === 'member')?.action).toBe('erase');
    const legacy = { ...member, lastActivityAt: undefined, history: [
      { at: end, actor: who.id, action: 'member.consent' },
      { at: at(400).toISOString(), actor: who.id, action: 'member.marketing' },
    ] };
    await store.transaction(tx => tx.put('member', member.id, legacy));
    expect((await store.transaction(tx => privacySnapshot(tx, who.id))).member?.lastAt).toBe(end);
    expect((await plan(at(365))).items.find(i => i.kind === 'member')?.action).toBe('erase');
    legacy.history = [legacy.history[1]];
    await store.transaction(tx => tx.put('member', member.id, legacy));
    const unknown = await plan(at(800));
    expect(unknown.items.find(i => i.kind === 'member')?.action).toBe('keep');
    expect(unknown.blocked.join(' ')).toContain('member:');
    const service = new EventHubService(store, 'isolated-retention-test-secret', () => at(101));
    await service.mutate(who.id, false, { action: 'member.withdraw', target: '', data: {}, requestId: randomUUID() });
    expect(await store.transaction(tx => tx.get('member', member.id))).toBeUndefined();
    expect(await readApp(application.id)).toEqual(application);
  });

  it('makes a retention hold win in both preview and the isolated executor', async () => {
    const application = makeApp({ rewardPhone: '01000000000', rewardPhoneRetainFrom: end });
    who.privacyHold = { reason: '확인 중인 합성 분쟁 보류', until: at(900).toISOString() };
    await store.transaction(async tx => { await tx.put('owner', who.id, who); await tx.put('application', application.id, application); });
    const preview = await plan(at(300));
    expect(preview.items.filter(i => i.action !== 'external-review').every(i => i.action === 'keep')).toBe(true);
    expect(preview.blocked.join(' ')).toContain('보류');
    await expect(apply(at(300))).rejects.toMatchObject({ code: 'PRIVACY_HOLD' });
    expect(await readApp(application.id)).toEqual(application);
  });

  it('keeps application/finance/member/inquiry records independent of the actual onsite 17:00 reset', async () => {
    const profileId = randomUUID(), application = makeApp({ profileId });
    const thread: HubThread = { id: who.id, status: 'open', messages: [], readUserAt: end, readAdminAt: end, tags: [], history: [] };
    const member: HubMember = { id: randomUUID(), owner: who.id, nicknameKey: '가상참가', salt: 'synthetic-reset-salt', passwordHash: '00'.repeat(64), basic: application.basic, profile: application.profile, marketing: false, history: [], lastActivityAt: end };
    await store.transaction(async tx => { await tx.put('application', application.id, application); await tx.put('thread', who.id, thread); await tx.put('member', member.id, member); });
    await pool.query("INSERT INTO app_kv_rows(table_name,row_id,data) VALUES('app_settings','settings',$1),('profiles',$2,$3)", [
      { id: 'settings', session_active: true, event_cycle_started_at: '2026-10-31T13:00:00Z', event_cycle_archive_id: `binpc2:event-anon:v1:2026-10-31:${randomUUID()}`, event_cycle_reset_complete: false }, profileId, { id: profileId, event_hub_owner: who.id, nickname: '합성현장', pin_code: '654321' }]);
    const resetAt = new Date('2026-11-01T08:00:00Z');
    expect((await plan(resetAt)).items.find(i => i.kind === 'application')?.action).toBe('keep');
    await atomicEventReset(pool, { clearTables: ['profiles', 'device_secrets', 'likes', 'chats', 'messages'], now: resetAt,
      planAdmin: () => ({ id: 'synthetic-admin', nickname: '관리자', pin_code: '9999' }), adminIsProfile: p => p.id === 'synthetic-admin', buildNextSettings: s => ({ ...s, session_active: false, event_cycle_reset_complete: true }) });
    expect(await readApp(application.id)).toEqual(application);
    expect(await store.transaction(tx => tx.get('thread', who.id))).toEqual(thread);
    expect(await store.transaction(tx => tx.get('member', member.id))).toEqual(member);
    expect((await pool.query("SELECT row_id FROM app_kv_rows WHERE table_name='profiles'")).rows.map(r => r.row_id)).toEqual(['synthetic-admin']);
    expect((await plan(resetAt)).items.some(i => i.kind === 'onsite')).toBe(false);
    expect((await plan(resetAt)).items.find(i => i.kind === 'application')?.action).toBe('keep');
  });

  it('detects erased personal data restored from an older backup and requires the independent current erasure checkpoint', async () => {
    const application = makeApp({ payment: 'none', approvedAt: undefined });
    await store.transaction(tx => tx.put('application', application.id, application));
    await apply(at(31)); expect(await readApp(application.id)).toBeUndefined();
    const checkpoint = await store.transaction(capturePrivacyRestoreCheckpoint);
    expect(checkpoint.ledgers).toHaveLength(1);
    expect(await store.transaction(tx => assertPrivacyRestoreCheckpoint(tx, checkpoint))).toMatchObject({ verified: true, ledgerCount: 1 });
    await store.transaction(tx => tx.put('application', application.id, application));
    await expect(store.transaction(tx => assertPrivacyRestoreCheckpoint(tx, checkpoint))).rejects.toMatchObject({ code: 'PRIVACY_RESTORE_RESURRECTION' });
    await pool.query("DELETE FROM event_hub_records WHERE kind='settings' AND id=$1", [`privacy-erasure:${who.id}`]);
    await expect(store.transaction(tx => assertPrivacyRestoreCheckpoint(tx, checkpoint))).rejects.toMatchObject({ code: 'PRIVACY_RESTORE_STALE' });
    expect(await readApp(application.id)).toEqual(application); // The gate is read-only; it does not secretly delete the restored row.
  });
});
