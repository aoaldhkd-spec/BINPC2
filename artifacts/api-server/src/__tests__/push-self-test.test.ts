/** Own-device push diagnostic — all provider sends are mocked. Never touches real devices. */
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { issueSseToken } from '../lib/db-session-tokens.js';

vi.hoisted(() => { process.env.SESSION_SECRET = 'test-own-device-push-session-secret'; });
const mocks = vi.hoisted(() => ({ sendPush: vi.fn().mockResolvedValue(true) }));
vi.mock('pg', () => {
  const client = { query: () => Promise.resolve({ rows: [] }), release: () => {}, on: () => {} };
  class Pool {
    connect = () => Promise.resolve(client);
    query = () => Promise.resolve({ rows: [] });
    on = () => {};
    end = () => Promise.resolve();
  }
  return { default: { Pool, Client: Pool } };
});
vi.mock('../lib/push', () => ({
  VAPID_PUBLIC_KEY: 'synthetic-test-key',
  vapidConfigured: true,
  sendPush: mocks.sendPush,
}));
import app from '../app.js';

function token(userId: string) {
  return issueSseToken(userId, process.env.SESSION_SECRET!).token;
}
const userId = 'self-push-user-001';
const endpoint = 'https://push.example.com/push/device-001';
const subscription = {
  userId, subscription: { endpoint,
    keys: { auth: 'test-auth', p256dh: 'test-p256dh' } },
};
function call(body: Record<string, unknown>, userToken?: string) {
  const req = request(app).post('/api/db/push/self-test')
    .set('Content-Type', 'application/json');
  if (userToken) req.set('x-sse-token', userToken);
  return req.send(body);
}
describe('own-device push diagnostic (no production messages or hearts)', () => {
  it('requires a matching session token and a subscribed endpoint, rate-limits self tests', async () => {
    mocks.sendPush.mockClear();
    const unauthorized = await call({ userId, endpoint });
    expect(unauthorized.status).toBe(401);
    const forged = await call({ userId, endpoint }, token('unrelated-account'));
    expect(forged.status).toBe(401);
    const beforeSubscribe = await call({ userId, endpoint }, token(userId));
    expect(beforeSubscribe.status).toBe(409);
    const subscribe = await request(app).post('/api/db/push/subscribe')
      .set('x-sse-token', token(userId)).send(subscription);
    expect(subscribe.status).toBe(200);
    const otherEndpoint = await call({ userId, endpoint: 'https://push.example.com/other' }, token(userId));
    expect(otherEndpoint.status).toBe(409);
    const success = await call({ userId, endpoint }, token(userId));
    expect(success.status).toBe(200);
    expect(success.body).toEqual({ ok: true, requested: 1, deliveredVerified: false });
    expect(mocks.sendPush).toHaveBeenCalledTimes(1);
    expect(mocks.sendPush.mock.calls[0][0].endpoint).toBe(endpoint);
    expect(mocks.sendPush.mock.calls[0][1].url).toBe('/');
    const repeat = await call({ userId, endpoint }, token(userId));
    expect(repeat.status).toBe(429);
    expect(mocks.sendPush).toHaveBeenCalledTimes(1);
  });
});
