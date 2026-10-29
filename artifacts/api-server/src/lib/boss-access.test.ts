import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bossAccessGate, bossOnlyLocked, configureBossAccess, bossProtectedSseWrite } from './boss-access';
import { deriveAdminToken } from './db-panel-tokens';
const owner = { admin_phone: '010-0000-0000', admin_password: 'synthetic-owner-private-pass' };
const saved = { profiles: ['profile-1'], hearts: ['heart-1'], messages: ['message-1'], payment: 'approved' };
let store: session.MemoryStore;
function app(stream = false) {
  const server = express();
  server.use(express.json());
  server.use(session({ store, secret: 'synthetic-session-key', resave: false, saveUninitialized: false }));
  server.use(bossAccessGate);
  if (stream) server.get('/api/db/events', (_req, res) => {
    res.type('text/event-stream');
    const timer = setInterval(() => bossProtectedSseWrite(res, 'data: protected-event\n\n'), 10);
    res.on('close', () => clearInterval(timer));
  });
  server.use('/api', (_req, res) => res.json(saved));
  return server;
}
async function login(server: ReturnType<typeof app>) {
  const response = await request(server).post('/api/boss-access/login').send({ phone: owner.admin_phone, password: owner.admin_password }).expect(200);
  return { cookie: response.headers['set-cookie'][0].split(';')[0], token: response.body.adminToken };
}
function sessions() { return new Promise<Record<string, session.SessionData>>(resolve => store.all((_err, result) => resolve(result as Record<string, session.SessionData>))); }
beforeEach(() => { vi.stubEnv('BOSS_ONLY_LOCK', '1'); store = new session.MemoryStore(); configureBossAccess(() => owner); });
afterEach(() => { vi.unstubAllEnvs(); });
describe('full-site boss-only restriction', () => {
  it('blocks ordinary/old admin credentials, direct APIs and mixed case routes without data', async () => {
    const server = app();
    for (const path of ['/api/db/op', '/API/db/op', '/Api/event-hub/admin', '/api/db/storage-image', '/api/db/unread-counts', '/api/db/events', '/api/event-hub/state']) {
      const r = await request(server).get(path).set('x-admin-token', deriveAdminToken(owner.admin_password)).expect(423);
      expect(r.body).toEqual({ data: null, error: { code: 'BOSS_ONLY', message: '현재 테스트 중입니다' } });
      expect(r.headers['cache-control']).toContain('no-store');
    }
  });
  it('requires both existing owner credentials; old tokens, factory passwords and blank phones cannot grant access', async () => {
    const server = app();
    for (const body of [{ adminToken: deriveAdminToken(owner.admin_password) }, { phone: '', password: owner.admin_password }, { phone: owner.admin_phone, password: '116606' }, { phone: '010-9999-9999', password: owner.admin_password }])
      await request(server).post('/api/boss-access/login').send(body).expect(403);
    await request(server).post('/api/boss-access/login').set('sec-fetch-site', 'cross-site').send({ phone: owner.admin_phone, password: owner.admin_password }).expect(403);
  });
  it('owner login survives middleware restart, logout blocks old cookie/ticket and preserves data', async () => {
    const before = JSON.stringify(saved), server = app(), auth = await login(server);
    const r = await request(server).get('/api/boss-access').set('Cookie', auth.cookie).expect(200);
    expect(r.body).toMatchObject({ locked: true, authorized: true });
    await request(app()).get('/api/event-hub/state').set('Cookie', auth.cookie).expect(200, saved);
    await request(server).get('/api/db/events').query({ bossTicket: r.body.sseTicket }).expect(200);
    await request(server).post('/api/boss-access/logout').set('Cookie', auth.cookie).send({}).expect(200);
    await request(server).get('/api/db/op').set('Cookie', auth.cookie).expect(423);
    await request(server).get('/api/db/events').query({ bossTicket: r.body.sseTicket }).expect(423);
    expect(JSON.stringify(saved)).toBe(before);
  });
  it('a delayed ordinary-session save cannot resurrect a logged-out grant', async () => {
    const server = app(), auth = await login(server);
    const rows = await sessions(), [id, old] = Object.entries(rows).find(([id]) => !id.startsWith('boss-grant:'))!;
    const stale = structuredClone(old);
    await request(server).post('/api/boss-access/logout').set('Cookie', auth.cookie).send({}).expect(200);
    await new Promise<void>(resolve => store.set(id, stale, () => resolve()));
    await request(server).get('/api/db/op').set('Cookie', auth.cookie).expect(423);
  });
  it('credential changes and expiration revoke grants and tickets without touching participant records', async () => {
    const server = app(), auth = await login(server);
    configureBossAccess(() => ({ ...owner, admin_password: 'different-existing-credential' }));
    await request(server).get('/api/event-hub/state').set('Cookie', auth.cookie).expect(423);
    configureBossAccess(() => owner);
    const rows = await sessions(), [id, row] = Object.entries(rows).find(([id]) => id.startsWith('boss-grant:'))!;
    row.bossGrant!.expires = 0;
    await new Promise<void>(resolve => store.set(id, row, () => resolve()));
    await request(server).get('/api/event-hub/state').set('Cookie', auth.cookie).expect(423);
  });
  it('does not accept an SSE ticket as general API authorization or a tampered ticket', async () => {
    const server = app(), auth = await login(server);
    const r = await request(server).get('/api/boss-access').set('Cookie', auth.cookie);
    await request(server).get('/api/event-hub/admin').query({ bossTicket: r.body.sseTicket }).expect(423);
    await request(server).get('/api/db/events').query({ bossTicket: r.body.sseTicket + 'a' }).expect(423);
  });
  it('blocks external push and does not expose settings in public status', async () => {
    const server = app(), auth = await login(server);
    await request(server).post('/api/db/push/self-test').set('Cookie', auth.cookie).send({}).expect(423);
    const r = await request(server).get('/api/boss-access');
    expect(r.body).toEqual({ locked: true, authorized: false, message: '현재 테스트 중입니다' });
  });
  it('closes a real open SSE stream at logout and refuses reconnection with its old ticket', async () => {
    const application = app(true), auth = await login(application);
    const status = await request(application).get('/api/boss-access').set('Cookie', auth.cookie);
    const server = application.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    const port = (server.address() as {port:number}).port;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/db/events?bossTicket=${encodeURIComponent(status.body.sseTicket)}`);
      const reader = response.body!.getReader();
      expect(new TextDecoder().decode((await reader.read()).value)).toContain('protected-event');
      await request(application).post('/api/boss-access/logout').set('Cookie', auth.cookie).send({}).expect(200);
      // Drain bytes sent before logout; the stream must end, not stay subscribed.
      let ended = false;
      for (let i=0;i<20;i++) { if ((await reader.read()).done) {ended=true;break;} }
      expect(ended).toBe(true);
      await request(application).get('/api/db/events').query({bossTicket:status.body.sseTicket}).expect(423);
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(()=>resolve())); }
  });
  it('fails closed for a malformed stored grant', async () => {
    const server = app(), auth = await login(server), rows = await sessions();
    const [id,row] = Object.entries(rows).find(([id])=>id.startsWith('boss-grant:'))!;
    delete (row.bossGrant as Partial<NonNullable<typeof row.bossGrant>>).fingerprint;
    await new Promise<void>(resolve=>store.set(id,row,()=>resolve()));
    await request(server).get('/api/event-hub/state').set('Cookie',auth.cookie).expect(423);
  });
  it('production stays locked independently of test mode, schedules and restart', () => {
    vi.stubEnv('BOSS_ONLY_LOCK', '0'); vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('BOSS_PUBLIC_RELEASE', '');
    configureBossAccess(() => ({ ...owner, testMode: false, publicAdmissionOpen: true, session_active: true }));
    expect(bossOnlyLocked()).toBe(true);
  });
});
