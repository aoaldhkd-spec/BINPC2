/**
 * 술번개 오픈 + 다음날 17:00 자동 전체초기화 — 기존 admin_event_end_reset 재사용.
 */
import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

const TEST_SSE_SECRET = vi.hoisted(() => {
  const secret = 'test-sse-secret-for-unit-tests';
  process.env.SESSION_SECRET = secret;
  return secret;
});
void TEST_SSE_SECRET;

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

import app from '../app.js';
import { parseEventSchedule } from '../lib/db-heart-ops.js';
import { parseSulbunEvent } from '../lib/db-sulbun-event.js';

const ADMIN = { p_admin_password: '116606' };

async function op(body: Record<string, unknown>) {
  return request(app)
    .post('/api/db/op')
    .set('Content-Type', 'application/json')
    .send(body);
}

async function rpc(name: string, extra: Record<string, unknown> = {}) {
  return request(app)
    .post(`/api/db/rpc/${name}`)
    .send({ ...ADMIN, ...extra });
}

describe('admin_sulbun_open + auto reset', () => {
  it('opens a cycle for next-day 17:00 without wiping likes or heart unlocks', async () => {
    const userId = `sulbun-u-${randomUUID()}`;
    const likeId = `sulbun-l-${randomUUID()}`;
    await rpc('admin_update_settings', {
      p_payload: {
        event_schedule: JSON.stringify({
          timezone: 'Asia/Seoul',
          version: 2,
          slots: [{ id: 'slot-1', at: '23:00', unlock: ['red'] }],
          instant_unlock: ['red', 'rainbow'],
          direct_notices: [{ id: 'n1', text: '기존 공지', at: '23:00', enabled: true }],
        }),
      },
    });
    const otherId = `sulbun-o-${randomUUID()}`;
    await op({ op: 'insert', table: 'profiles', payload: { id: userId, nickname: `s-${userId.slice(0, 8)}` } });
    await op({ op: 'insert', table: 'profiles', payload: { id: otherId, nickname: `o-${otherId.slice(0, 8)}` } });
    const likeIns = await op({
      op: 'insert',
      table: 'likes',
      requesterId: userId,
      single: true,
      selectAfterWrite: true,
      payload: { id: likeId, liker_id: userId, liked_id: otherId, heart_type: 'red' },
    });
    expect(likeIns.status).toBe(200);

    const opened = await rpc('admin_sulbun_open');
    expect(opened.status).toBe(200);
    const event = parseSulbunEvent(opened.body.data?.sulbun_event);
    expect(event?.auto_reset_enabled).toBe(true);
    expect(event?.reset_done).toBe(false);
    const resetAt = new Date(event!.auto_reset_at);
    const openedAt = new Date(event!.opened_at);
    const seoulOpen = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(openedAt);
    const seoulReset = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(resetAt);
    expect(seoulReset.endsWith('17:00')).toBe(true);
    const [oy, om, od] = seoulOpen.split('-').map(Number);
    const next = new Date(Date.UTC(oy, om - 1, od + 1));
    expect(seoulReset.startsWith(
      `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`,
    )).toBe(true);

    const likes = await op({ op: 'select', table: 'likes', requesterId: userId });
    expect((likes.body.data as { id: string }[]).some(r => r.id === likeId)).toBe(true);

    const settings = await op({ op: 'select', table: 'app_settings' });
    const row = (settings.body.data as Record<string, unknown>[])[0];
    const schedule = parseEventSchedule(row.event_schedule);
    expect(schedule.slots[0]).toMatchObject({ id: 'slot-1', at: '23:00', unlock: ['red'] });
    expect(schedule.instant_unlock).toEqual(['red', 'rainbow']);
    expect(schedule.direct_notices?.[0]).toMatchObject({ id: 'n1', text: '기존 공지' });
    expect(schedule.direct_notices?.[0]?.enabled).toBeUndefined();

    const again = await rpc('admin_sulbun_open');
    expect(again.status).toBe(200);
    expect(again.body.data.already_active).toBe(true);
    expect(again.body.data.sulbun_event.cycle_id).toBe(event!.cycle_id);
  });

  it('manual event-end reset cancels auto reset so a due /ready does not wipe again', async () => {
    const userId = `sulbun-m-${randomUUID()}`;
    await op({ op: 'insert', table: 'profiles', payload: { id: userId, nickname: `m-${userId.slice(0, 8)}` } });
    const opened = await rpc('admin_sulbun_open');
    expect(opened.status).toBe(200);
    const cycleId = opened.body.data.sulbun_event.cycle_id as string;

    const reset = await rpc('admin_event_end_reset');
    expect(reset.status).toBe(200);

    const afterManual = await op({ op: 'select', table: 'app_settings' });
    const row = (afterManual.body.data as Record<string, unknown>[])[0];
    const event = parseSulbunEvent(row.sulbun_event);
    expect(event?.cycle_id).toBe(cycleId);
    expect(event?.auto_reset_enabled).toBe(false);
    expect(event?.reset_done).toBe(true);

    await rpc('admin_update_settings', {
      p_payload: {
        sulbun_event: JSON.stringify({
          ...event,
          auto_reset_at: new Date(Date.now() - 1000).toISOString(),
        }),
      },
    });
    const ready = await request(app).get('/api/db/ready');
    expect(ready.status).toBe(200);
    const readyEvent = parseSulbunEvent(ready.body.settings?.sulbun_event);
    expect(readyEvent?.reset_done).toBe(true);
    expect(readyEvent?.auto_reset_enabled).toBe(false);
  });

  it('due cycle on /ready runs the same event-end wipe once', async () => {
    const userId = `sulbun-d-${randomUUID()}`;
    await op({ op: 'insert', table: 'profiles', payload: { id: userId, nickname: `d-${userId.slice(0, 8)}` } });
    const opened = await rpc('admin_sulbun_open');
    const cycleId = opened.body.data.sulbun_event.cycle_id as string;
    await rpc('admin_update_settings', {
      p_payload: {
        sulbun_event: JSON.stringify({
          cycle_id: cycleId,
          opened_at: new Date(Date.now() - 3600_000).toISOString(),
          auto_reset_at: new Date(Date.now() - 1000).toISOString(),
          auto_reset_enabled: true,
          reset_done: false,
        }),
      },
    });

    const ready = await request(app).get('/api/db/ready');
    expect(ready.status).toBe(200);
    expect(ready.body.settings.reset_signal).toBeTruthy();
    const readyEvent = parseSulbunEvent(ready.body.settings?.sulbun_event);
    expect(readyEvent?.reset_done).toBe(true);
    expect(readyEvent?.auto_reset_enabled).toBe(false);

    const profiles = await op({ op: 'select', table: 'profiles' });
    const nicks = (profiles.body.data as { nickname?: string }[]).map(p => p.nickname);
    expect(nicks.some(n => n === `d-${userId.slice(0, 8)}`)).toBe(false);

    const signal1 = ready.body.settings.reset_signal;
    const ready2 = await request(app).get('/api/db/ready');
    expect(ready2.body.settings.reset_signal).toBe(signal1);
  });

  it('serializes concurrent opens to one cycle and keeps auto_reset_at', async () => {
    await rpc('admin_event_end_reset');
    const burst = await Promise.all(Array.from({ length: 5 }, () => rpc('admin_sulbun_open')));
    expect(burst.every(r => r.status === 200)).toBe(true);
    const firstIds = burst.map(r => r.body.data?.sulbun_event?.cycle_id as string);
    const firstResets = burst.map(r => r.body.data?.sulbun_event?.auto_reset_at as string);
    expect(new Set(firstIds).size).toBe(1);
    expect(new Set(firstResets).size).toBe(1);
    const cycleId = firstIds[0];
    const autoResetAt = firstResets[0];

    const again = await Promise.all(Array.from({ length: 5 }, () => rpc('admin_sulbun_open')));
    expect(again.every(r => r.status === 200)).toBe(true);
    expect(again.every(r => r.body.data?.already_active === true)).toBe(true);
    expect(again.every(r => r.body.data?.sulbun_event?.cycle_id === cycleId)).toBe(true);
    expect(again.every(r => r.body.data?.sulbun_event?.auto_reset_at === autoResetAt)).toBe(true);

    const settings = await op({ op: 'select', table: 'app_settings' });
    const row = (settings.body.data as Record<string, unknown>[])[0];
    const stored = parseSulbunEvent(row.sulbun_event);
    expect(stored?.cycle_id).toBe(cycleId);
    expect(stored?.auto_reset_at).toBe(autoResetAt);
    expect(stored?.auto_reset_enabled).toBe(true);
  });
});
