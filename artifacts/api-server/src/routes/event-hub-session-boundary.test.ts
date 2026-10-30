import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  mutate: vi.fn(),
  session: vi.fn(),
  memberLogin: vi.fn(),
  changed: vi.fn(),
}));
vi.mock('../lib/pg-pool.js', () => ({ pgPool: null }));
vi.mock('../lib/event-hub-service.js', () => ({
  EventHubService: class {
    store = {};
    mutate = fake.mutate;
    session = fake.session;
    memberLogin = fake.memberLogin;
    autoTick = async () => {};
  },
}));
vi.mock('./db.js', () => ({
  verifyAdminToken: (token?: string) => token === 'isolated-route-admin',
  eventHubProfileCommitted: vi.fn(),
  eventHubChanged: fake.changed,
}));
import eventHubRouter from './event-hub.js';

function application() {
  const app = express();
  app.use(express.json());
  app.use(session({
    secret: 'isolated-route-session-key',
    resave: false,
    saveUninitialized: false,
    cookie: { sameSite: 'lax', httpOnly: true },
  }));
  // Test-only session fixture. Never mounted by the production application.
  app.post('/fixture/session', (req, res) => {
    req.session.hubOwner = req.body.hubOwner;
    req.session.userId = req.body.userId;
    req.session.bossAccessId = 'existing-server-grant';
    req.session.save(() => res.json({ ok: true }));
  });
  app.get('/fixture/session', (req, res) => res.json({
    id: req.sessionID,
    hubOwner: req.session.hubOwner,
    userId: req.session.userId,
    bossAccessId: req.session.bossAccessId,
  }));
  app.use('/api/event-hub', eventHubRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.mutate.mockResolvedValue({ ok: true });
  fake.session.mockResolvedValue('friend-owner');
  fake.memberLogin.mockResolvedValue({ owner: 'friend-owner', recoveryCode: 'isolated-recovery' });
});

describe('companion HTTP actor and session boundaries', () => {
  it('uses the authenticated friend session, never submitted owner or profile identifiers, for a no-code link request', async () => {
    const app = application();
    const client = request.agent(app);
    await client.post('/fixture/session').send({ hubOwner: 'friend-owner', userId: 'existing-own-profile' }).expect(200);
    const command = {
      action: 'companion.link.request', requestId: 'synthetic-request',
      data: { eventId: 'event-one', owner: 'victim-owner', userId: 'victim-profile', admin: true },
      owner: 'victim-owner', userId: 'victim-profile', admin: true,
    };
    await client.post('/api/event-hub/mutate').send(command).expect(200);
    expect(fake.mutate).toHaveBeenCalledExactlyOnceWith('friend-owner', false, command);
    const after = await client.get('/fixture/session').expect(200);
    expect(after.body).toMatchObject({ hubOwner: 'friend-owner', userId: 'existing-own-profile' });
  });

  it('does not turn a body claim of admin or a generic token into administrator authority', async () => {
    const app = application();
    const command = {
      action: 'admin.companion.link', target: 'pending-request', revision: 2,
      data: { applicationId: 'friend-application', applicationRevision: 3, identityChecked: true },
      admin: true,
    };
    await request(app).post('/api/event-hub/mutate').set('x-admin-token', 'invented-token').send(command).expect(200);
    expect(fake.mutate).toHaveBeenLastCalledWith('', false, command);
    await request(app).post('/api/event-hub/mutate').set('x-admin-token', 'isolated-route-admin').send(command).expect(200);
    expect(fake.mutate).toHaveBeenLastCalledWith('', true, command);
  });

  it('rejects cross-site and non-JSON companion writes before the service runs', async () => {
    const app = application();
    await request(app).post('/api/event-hub/mutate').set('sec-fetch-site', 'cross-site')
      .send({ action: 'companion.link.request', data: { eventId: 'event-one' } }).expect(403);
    await request(app).post('/api/event-hub/mutate').type('form')
      .send({ action: 'companion.link.request' }).expect(403);
    expect(fake.mutate).not.toHaveBeenCalled();
    expect(fake.changed).not.toHaveBeenCalled();
  });

  it.each(['/session', '/member-login'])('rotates the cookie and drops a different owner onsite identity at %s', async path => {
    const client = request.agent(application());
    await client.post('/fixture/session').send({ hubOwner: 'sponsor-owner', userId: 'sponsor-profile' }).expect(200);
    const before = (await client.get('/fixture/session')).body;
    const body = path === '/session' ? { recoveryCode: 'isolated-credential', create: false, userId: 'sponsor-profile' }
      : { nickname: 'synthetic-friend', password: 'isolated-password', userId: 'sponsor-profile' };
    await client.post('/api/event-hub' + path).send(body).expect(200);
    const after = (await client.get('/fixture/session')).body;
    expect(after.id).not.toBe(before.id);
    expect(after).toMatchObject({ hubOwner: 'friend-owner', bossAccessId: 'existing-server-grant' });
    expect(after.userId).toBeUndefined();
  });

  it.each(['/session', '/member-login'])('keeps the same authenticated owner profile through credential refresh at %s', async path => {
    const client = request.agent(application());
    await client.post('/fixture/session').send({ hubOwner: 'friend-owner', userId: 'existing-own-profile' }).expect(200);
    const before = (await client.get('/fixture/session')).body;
    const body = path === '/session' ? { recoveryCode: 'isolated-credential', create: false }
      : { nickname: 'synthetic-friend', password: 'isolated-password' };
    await client.post('/api/event-hub' + path).send(body).expect(200);
    const after = (await client.get('/fixture/session')).body;
    expect(after.id).not.toBe(before.id);
    expect(after).toMatchObject({ hubOwner: 'friend-owner', userId: 'existing-own-profile', bossAccessId: 'existing-server-grant' });
  });
});
