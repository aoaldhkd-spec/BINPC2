/**
 * 회식 종료 전체 초기화(admin_event_end_reset)가 단체채팅까지 같은 경로로 지운다.
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

async function op(body: Record<string, unknown>) {
  return request(app)
    .post('/api/db/op')
    .set('Content-Type', 'application/json')
    .send(body);
}

describe('[Admin] admin_event_end_reset wipes group chats', () => {
  it('clears rooms, memberships, and messages, then re-seeds empty catalog rooms', async () => {
    const a = `wipe-a-${randomUUID()}`;
    const customId = `wipe-room-${randomUUID()}`;
    const catalogId = 'group_afterparty_club';

    await op({ op: 'insert', table: 'profiles', payload: { id: a, nickname: `wa-${a.slice(0, 8)}` } });
    expect((await op({
      op: 'insert',
      table: 'group_chats',
      payload: { id: customId, name: '지워야할방', interest_tag: 'wipe', age_group: null, max_members: 999999, room_kind: 'test' },
      requesterId: 'seed-admin',
    })).status).toBe(200);

    expect((await op({
      op: 'insert',
      table: 'group_participants',
      requesterId: a,
      payload: { group_id: customId, user_id: a },
    })).status).toBe(200);

    expect((await op({
      op: 'insert',
      table: 'group_messages',
      requesterId: a,
      payload: { group_id: customId, sender_id: a, content: 'custom-should-wipe', client_id: randomUUID() },
    })).status).toBe(200);

    const reset = await request(app)
      .post('/api/db/rpc/admin_event_end_reset')
      .send({ p_admin_password: '116606' });
    expect(reset.status).toBe(200);

    const rooms = await op({ op: 'select', table: 'group_chats' });
    expect(rooms.status).toBe(200);
    const roomIds = (rooms.body.data as { id: string }[]).map(r => r.id);
    expect(roomIds).not.toContain(customId);
    expect(roomIds).toContain(catalogId);
    expect(roomIds).toContain('group_afterparty_drink');

    const parts = await op({
      op: 'select',
      table: 'group_participants',
      requesterId: a,
    });
    expect(parts.status).toBe(200);
    expect(parts.body.data).toEqual([]);

    const leftoverCustom = await op({
      op: 'insert',
      table: 'group_participants',
      requesterId: a,
      payload: { group_id: customId, user_id: a },
    });
    expect(leftoverCustom.status).toBe(400);
    expect(leftoverCustom.body.error?.code).toBe('INVALID_INPUT');

    const b = `wipe-b-${randomUUID()}`;
    await op({ op: 'insert', table: 'profiles', payload: { id: b, nickname: `wb-${b.slice(0, 8)}` } });
    expect((await op({
      op: 'insert',
      table: 'group_participants',
      requesterId: b,
      payload: { group_id: catalogId, user_id: b },
    })).status).toBe(200);
    const catalogMsgs = await op({
      op: 'select',
      table: 'group_messages',
      requesterId: b,
      filters: [{ type: 'eq', col: 'group_id', val: catalogId }],
    });
    expect(catalogMsgs.status).toBe(200);
    expect((catalogMsgs.body.data as unknown[]).length).toBe(0);
  });

  it('sets reset_signal on app_settings after wipe', async () => {
    await op({ op: 'insert', table: 'profiles', payload: { id: 'sig-user', nickname: 'sig-user-nick' } });
    const reset = await request(app)
      .post('/api/db/rpc/admin_event_end_reset')
      .send({ p_admin_password: '116606' });
    expect(reset.status).toBe(200);
    const settings = await op({ op: 'select', table: 'app_settings' });
    expect(settings.status).toBe(200);
    const row = (settings.body.data as { reset_signal?: string | null }[])[0];
    expect(row?.reset_signal).toBeTruthy();
  });
});
