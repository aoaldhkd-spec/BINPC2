/**
 * In-process 50/100/150 VU load — production API는 별도 시뮬레이터.
 * UI/테마/라우팅은 건드리지 않고 서버 처리량·메모리·세션 복구만 측정한다.
 */
import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

vi.hoisted(() => {
  process.env.SESSION_SECRET = 'test-sse-secret-for-unit-tests';
});


vi.mock('pg', () => {
  const mockClient = {
    query: () => Promise.resolve({ rows: [] }),
    release: () => {},
    on: () => {},
  };
  class MockPool {
    connect = () => Promise.resolve(mockClient);
    query = () => Promise.resolve({ rows: [] });
    on = () => {};
    end = () => Promise.resolve();
  }
  class MockClient {
    connect = () => Promise.resolve();
    query = () => Promise.resolve({ rows: [] });
    on = () => {};
    end = () => Promise.resolve();
  }
  return { default: { Pool: MockPool, Client: MockClient } };
});

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn().mockResolvedValue(undefined),
  },
}));

import request from 'supertest';
import app from '../app.js';

function pct(arr: number[], p: number) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
}

async function op(body: Record<string, unknown>) {
  const t0 = Date.now();
  const res = await request(app).post('/api/db/op').set('Content-Type', 'application/json').send(body);
  return { status: res.status, body: res.body, ms: Date.now() - t0 };
}

describe('venue load 50/100/150 (in-process)', () => {
  it('registers 150 users, serves /ready, seats, PIN recover, and stays under RSS budget', async () => {
    const rss0 = process.memoryUsage().rss;
    const n = 150;
    const ids = Array.from({ length: n }, () => randomUUID());
    const lat: number[] = [];

    const created = await Promise.all(ids.map((id, i) =>
      op({
        op: 'insert', table: 'profiles', single: true, selectAfterWrite: true,
        payload: { id, nickname: `vu150_${i}_${id.slice(0, 6)}`, bio: 'load', _device_secret: randomUUID() },
      }).then((r) => { lat.push(r.ms); return r; }),
    ));
    const ok = created.filter((r) => r.status === 200 && r.body.data?.id).length;
    expect(ok).toBe(n);
    expect(pct(lat, 95)).toBeLessThan(2_000);

    const readyLat: number[] = [];
    for (const stage of [50, 100, 150]) {
      const batch = await Promise.all(Array.from({ length: stage }, async () => {
        const t0 = Date.now();
        const res = await request(app).get('/api/db/ready');
        readyLat.push(Date.now() - t0);
        return res.status;
      }));
      expect(batch.every((s) => s === 200)).toBe(true);
    }
    expect(pct(readyLat, 95)).toBeLessThan(500);

    const profiles = await Promise.all(ids.slice(0, 40).map((id) =>
      op({ op: 'select', table: 'profiles', requesterId: id, filters: [{ type: 'eq', col: 'id', val: id }], maybeSingle: true }),
    ));
    expect(profiles.every((r) => r.status === 200)).toBe(true);
    const seatsUser = await op({ op: 'select', table: 'seats', requesterId: ids[0] });
    expect(seatsUser.status).toBe(403);

    const pinUser = created[0].body.data as { id: string; nickname: string; pin_code: string };
    const step1 = await request(app).post('/api/db/by-pin').send({ pin: String(pinUser.pin_code) });
    expect(step1.status).toBe(200);
    expect(step1.body.data?.step).toBe('confirm');
    const step2 = await request(app).post('/api/db/by-pin').send({
      pin: String(pinUser.pin_code),
      nickname: pinUser.nickname,
    });
    expect(step2.status).toBe(200);
    expect(step2.body.data?.id).toBe(pinUser.id);

    const a = ids[0];
    const b = ids[1];
    const [u1, u2] = [a, b].sort();
    const chat = await op({
      op: 'insert', table: 'chats', requesterId: a, single: true, selectAfterWrite: true,
      payload: { user1_id: u1, user2_id: u2 },
    });
    expect(chat.status).toBe(200);
    const chatId = chat.body.data.id as string;
    const msgLat: number[] = [];
    const msgs = await Promise.all(Array.from({ length: 40 }, (_, i) => {
      const sender = i % 2 === 0 ? a : b;
      const t0 = Date.now();
      return op({
        op: 'insert', table: 'messages', requesterId: sender, single: true, selectAfterWrite: true,
        payload: { chat_id: chatId, sender_id: sender, content: `vu-${i}`, client_id: randomUUID() },
      }).then((r) => { msgLat.push(Date.now() - t0); return r; });
    }));
    expect(msgs.every((r) => r.status === 200 && r.body.data?.id)).toBe(true);

    const likes = await Promise.all(ids.slice(2, 22).map((liker) =>
      op({
        op: 'insert', table: 'likes', requesterId: liker, single: true, selectAfterWrite: true,
        payload: { liker_id: liker, liked_id: b, heart_type: 'red' },
      }),
    ));
    expect(likes.filter((r) => r.status === 200).length).toBeGreaterThan(0);

    if (global.gc) global.gc();
    const rss1 = process.memoryUsage().rss;
    const grewMb = (rss1 - rss0) / 1048576;
    expect(grewMb).toBeLessThan(250);

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      registerP50: pct(lat, 50), registerP95: pct(lat, 95),
      readyP50: pct(readyLat, 50), readyP95: pct(readyLat, 95),
      msgP50: pct(msgLat, 50), msgP95: pct(msgLat, 95),
      rssGrewMb: Number(grewMb.toFixed(1)),
    }));
  }, 60_000);

  it('issues SSE tokens for 150 users without 5xx', async () => {
    const n = 150;
    const users = await Promise.all(Array.from({ length: n }, async (_, i) => {
      const id = randomUUID();
      const secret = randomUUID();
      await op({
        op: 'insert', table: 'profiles', single: true, selectAfterWrite: true,
        payload: { id, nickname: `sse150_${i}_${id.slice(0, 6)}`, _device_secret: secret },
      });
      const login = await request(app).post('/api/db/auth/login')
        .send({ userId: id, deviceSecret: secret });
      return { id, sessionToken: login.body.sessionToken as string, loginStatus: login.status };
    }));
    expect(users.filter((u) => u.loginStatus === 200 && u.sessionToken).length).toBe(n);

    const tokens = await Promise.all(users.map((u) =>
      request(app).post('/api/db/auth/sse-token').send({ userId: u.id, sessionToken: u.sessionToken }),
    ));
    expect(tokens.every((r) => r.status === 200 && r.body.token)).toBe(true);

    const sse = await Promise.all(users.slice(0, 30).map((u, i) =>
      request(app)
        .get(`/api/db/events?userId=${encodeURIComponent(u.id)}&token=${encodeURIComponent(tokens[i].body.token)}`)
        .buffer(false)
        .parse((res, cb) => {
          res.on('data', () => { res.destroy(); cb(null, 'ok'); });
          res.on('error', () => cb(null, 'err'));
        }),
    ));
    expect(sse.filter((r) => r.status === 200).length).toBeGreaterThan(20);
  }, 60_000);
});
