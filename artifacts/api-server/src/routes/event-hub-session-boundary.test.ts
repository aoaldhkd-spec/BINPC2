import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bossParticipationAllowed, withVerifiedBossParticipation } from '../lib/boss-participation.js';

const fake = vi.hoisted(() => ({
  mutate: vi.fn(),
  session: vi.fn(),
  memberLogin: vi.fn(),
  state: vi.fn(),
  changed: vi.fn(),
}));
vi.mock('../lib/pg-pool.js', () => ({ pgPool: null }));
vi.mock('../lib/event-hub-service.js', () => ({
  EventHubService: class {
    store = {};
    mutate = fake.mutate;
    session = fake.session;
    memberLogin = fake.memberLogin;
    state = fake.state;
    autoTick = async () => {};
  },
}));
vi.mock('./db.js', () => ({
  verifyAdminToken: (token?: string) => token === 'isolated-route-admin',
  eventHubProfileCommitted: vi.fn(),
  eventHubChanged: fake.changed,
}));
import eventHubRouter from './event-hub.js';

function application(verifiedBoss = false) {
  const app = express();
  const store = new session.MemoryStore();
  app.locals.sessionStore = store;
  app.use(express.json());
  app.use(session({
    store,
    secret: 'isolated-route-session-key',
    resave: false,
    saveUninitialized: false,
    cookie: { sameSite: 'lax', httpOnly: true },
  }));
  if (verifiedBoss) app.use((_req, _res, next) => withVerifiedBossParticipation(next));
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
  fake.state.mockResolvedValue({ events: [], applications: [], testMode: { enabled: true, publicAdmissionOpen: false } });
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
    const body = path === '/session' ? { recoveryCode: 'isolated-credential', create: false, includeState: true, userId: 'sponsor-profile' }
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
    const body = path === '/session' ? { recoveryCode: 'isolated-credential', create: false, includeState: true }
      : { nickname: 'synthetic-friend', password: 'isolated-password' };
    await client.post('/api/event-hub' + path).send(body).expect(200);
    const after = (await client.get('/fixture/session')).body;
    expect(after.id).not.toBe(before.id);
    expect(after).toMatchObject({ hubOwner: 'friend-owner', userId: 'existing-own-profile', bossAccessId: 'existing-server-grant' });
  });
});

describe('optional participant state on credential response', () => {
  it('keeps the existing small response for older clients', async () => {
    const response = await request(application()).post('/api/event-hub/session')
      .send({ recoveryCode: 'isolated-credential', create: false }).expect(200);
    expect(response.body).toEqual({ ok: true });
    expect(fake.state).not.toHaveBeenCalled();
  });

  it('reads only the saved authenticated participant and reuses the GET projection despite an administrator header', async () => {
    const app = application();
    const store = app.locals.sessionStore as session.MemoryStore;
    const value = { events: [], applications: [{ id: 'own-safe-summary' }], testMode: { enabled: true, publicAdmissionOpen: false } };
    fake.state.mockImplementation(async (owner, admin) => {
      expect(owner).toBe('friend-owner');
      expect(admin).toBeUndefined();
      const saved = await new Promise<Record<string, session.SessionData>>((resolve, reject) => store.all((err, sessions) => err ? reject(err) : resolve(sessions as Record<string, session.SessionData>)));
      expect(Object.values(saved).some(s => s.hubOwner === owner)).toBe(true);
      return value;
    });
    const client = request.agent(app);
    const response = await client.post('/api/event-hub/session').set('x-admin-token', 'isolated-route-admin')
      .send({ recoveryCode: 'isolated-credential', create: false, includeState: true, owner: 'victim-owner', admin: true }).expect(200);
    expect(response.body).toEqual({ ok: true, state: { ...value, hasSession: true } });
    const normal = await client.get('/api/event-hub/state').expect(200);
    expect(response.body.state).toEqual(normal.body);
  });

  it('keeps the saved session and profile if the optional state read temporarily fails', async () => {
    const client = request.agent(application());
    await client.post('/fixture/session').send({ hubOwner: 'friend-owner', userId: 'existing-own-profile' }).expect(200);
    fake.state.mockRejectedValueOnce(new Error('synthetic unavailable state'));
    await client.post('/api/event-hub/session').send({ recoveryCode: 'isolated-credential', create: false, includeState: true }).expect(503);
    const saved = await client.get('/fixture/session').expect(200);
    expect(saved.body).toMatchObject({ hubOwner: 'friend-owner', userId: 'existing-own-profile', bossAccessId: 'existing-server-grant' });
    const retry = await client.get('/api/event-hub/state').expect(200);
    expect(retry.body.hasSession).toBe(true);
    expect(fake.session).toHaveBeenCalledTimes(1);
  });

  it('does not read state before a failed durable session save', async () => {
    const app = application();
    const store = app.locals.sessionStore as session.MemoryStore;
    vi.spyOn(store, 'set').mockImplementation((_id, _value, callback) => callback?.(new Error('synthetic save failure')));
    await request(app).post('/api/event-hub/session').send({ recoveryCode: 'isolated-credential', create: false, includeState: true }).expect(503);
    expect(fake.state).not.toHaveBeenCalled();
  });

  it('rejects malformed flags and cross-site requests before credential access', async () => {
    const app = application();
    await request(app).post('/api/event-hub/session').send({ recoveryCode: 'isolated-credential', includeState: 'true' }).expect(400);
    await request(app).post('/api/event-hub/session').set('sec-fetch-site', 'cross-site')
      .send({ recoveryCode: 'isolated-credential', includeState: true }).expect(403);
    expect(fake.session).not.toHaveBeenCalled();
    expect(fake.state).not.toHaveBeenCalled();
  });

  it('preserves the separately verified boss request context without accepting a body claim', async () => {
    fake.state.mockImplementation(async () => ({ bossParticipationAllowed: bossParticipationAllowed() }));
    const verified = await request(application(true)).post('/api/event-hub/session')
      .send({ recoveryCode: 'isolated-credential', includeState: true }).expect(200);
    expect(verified.body.state.bossParticipationAllowed).toBe(true);
    const unverified = await request(application()).post('/api/event-hub/session')
      .send({ recoveryCode: 'isolated-credential', includeState: true, bossParticipationAllowed: true }).expect(200);
    expect(unverified.body.state.bossParticipationAllowed).toBe(false);
  });
});

describe('optional committed mutation state', () => {
  it('validates the response option before a write and keeps old responses unchanged',async()=>{
    const app=application();
    await request(app).post('/api/event-hub/mutate').send({action:'thread.send',includeState:'true'}).expect(400);
    expect(fake.mutate).not.toHaveBeenCalled();
    const old=await request(app).post('/api/event-hub/mutate').send({action:'thread.send'}).expect(200);
    expect(old.body).toEqual({ok:true});expect(fake.state).not.toHaveBeenCalled();
  });
  it('returns only the authenticated participant projection for an ordinary save',async()=>{
    const client=request.agent(application());
    await client.post('/fixture/session').send({hubOwner:'friend-owner'}).expect(200);
    fake.mutate.mockResolvedValue({saved:true,requestId:'synthetic-request'});
    const response=await client.post('/api/event-hub/mutate').set('x-admin-token','invalid-token')
      .send({action:'thread.send',requestId:'synthetic-request',includeState:true,admin:true,stateScope:'admin'}).expect(200);
    expect(response.body).toMatchObject({saved:true,stateScope:'participant',state:{hasSession:true,testMode:{enabled:true,publicAdmissionOpen:false}}});
    expect(fake.state).toHaveBeenCalledExactlyOnceWith('friend-owner');
  });
  it('uses the existing administrator GET projection only for verified administrator requests',async()=>{
    const client=request.agent(application());await client.post('/fixture/session').send({hubOwner:'friend-owner'}).expect(200);
    fake.state.mockResolvedValue({owners:[{id:'synthetic-owner'}]});
    const response=await client.post('/api/event-hub/mutate').set('x-admin-token','isolated-route-admin')
      .send({action:'admin.application.payment',includeState:true}).expect(200);
    expect(response.body.stateScope).toBe('admin');expect(fake.state).toHaveBeenCalledExactlyOnceWith('friend-owner',true);
    expect(response.body.state).toEqual((await client.get('/api/event-hub/admin').set('x-admin-token','isolated-route-admin').expect(200)).body);
  });
  it('saves an entry session before reading state and keeps the bearer response private binding removed',async()=>{
    const app=application(),client=request.agent(app),store=app.locals.sessionStore as session.MemoryStore;
    await client.post('/fixture/session').send({hubOwner:'friend-owner'}).expect(200);
    fake.mutate.mockResolvedValue({saved:true,profile:{id:'own-entered-profile'},binding:{private:'synthetic-binding'}});
    fake.state.mockImplementation(async()=>{
      const saved=await new Promise<Record<string,session.SessionData>>((resolve,reject)=>store.all((err,all)=>err?reject(err):resolve(all as Record<string,session.SessionData>)));
      expect(Object.values(saved).some(s=>s.hubOwner==='friend-owner'&&s.userId==='own-entered-profile')).toBe(true);
      return{applications:[{profileId:'own-entered-profile'}]};
    });
    const response=await client.post('/api/event-hub/mutate').send({action:'application.enter',includeState:true}).expect(200);
    expect(response.body.state.applications[0].profileId).toBe('own-entered-profile');expect(response.body.binding).toBeUndefined();expect(typeof response.body.sessionToken).toBe('string');
  });
  it('preserves the committed acknowledgement on a failed follow-up read and permits a fresh GET retry',async()=>{
    const client=request.agent(application());await client.post('/fixture/session').send({hubOwner:'friend-owner',userId:'existing-own-profile'}).expect(200);
    fake.mutate.mockResolvedValue({saved:true,requestId:'synthetic-request',id:'own-application'});
    fake.state.mockRejectedValueOnce(new Error('synthetic follow-up failure'));
    const response=await client.post('/api/event-hub/mutate').send({action:'application.report',includeState:true}).expect(200);
    expect(response.body).toEqual({saved:true,requestId:'synthetic-request',id:'own-application',stateUnavailable:true});
    expect((await client.get('/fixture/session')).body).toMatchObject({hubOwner:'friend-owner',userId:'existing-own-profile'});
    expect((await client.get('/api/event-hub/state').expect(200)).body.hasSession).toBe(true);expect(fake.mutate).toHaveBeenCalledTimes(1);
  });
});
