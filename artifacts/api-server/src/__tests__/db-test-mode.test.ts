import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { EVENT_TEST_MODE_BANNER } from '@workspace/api-zod';

const fixture = vi.hoisted(() => {
  process.env.BOOTSTRAP_TEST_PASSWORD = 'test-mode-fixture-password';
  return {
    mode: undefined as Record<string, unknown> | undefined,
    writes: [] as string[],
  };
});

vi.mock('pg', async () => {
  const { createMockPg } = await import('./support/mock-pg-kv.js');
  const { MockPool: BasePool, MockClient: BaseClient } = createMockPg();
  const base = new BasePool();
  const query = async (sql: string, values: unknown[] = []) => {
    if (sql.startsWith('SELECT data FROM event_hub_records')
      && values[0] === 'laboratory-mode' && values[1] === 'global') {
      return { rows: fixture.mode ? [{ data: fixture.mode }] : [] };
    }
    if (/^(INSERT|UPDATE|DELETE)/.test(sql.trim())) fixture.writes.push(`${sql}:${values[0] ?? ''}`);
    return base.query(sql, values);
  };
  class MockPool extends BasePool {
    query = query;
    connect = async () => ({ query, release() {}, on() {} });
  }
  class MockClient extends BaseClient { query = query; }
  return { default: { Pool: MockPool, Client: MockClient } };
});
vi.mock('web-push', () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: vi.fn().mockResolvedValue(undefined) },
}));

import app from '../app.js';

const op = (body: Record<string, unknown>) => request(app).post('/api/db/op').send(body);
const disableMode = () => {
  fixture.mode = { enabled: false, publicAdmissionOpen: true, admissionOpenedAt: '2026-10-28T00:00:00Z',
    banner: EVENT_TEST_MODE_BANNER, generation: 1, revision: 3, dirty: false,
    resetGeneration: 1, resetAt: '2026-10-28T00:00:00Z', changedAt: '2026-10-28T00:00:00Z' };
};
async function participant() {
  const id = randomUUID();
  const nickname = `test-${id.slice(0, 8)}`;
  const response = await op({ table: 'profiles', op: 'insert',
    payload: { id, nickname, _device_secret: `secret-${id}` }, single: true, selectAfterWrite: true });
  expect(response.status).toBe(200);
  expect(response.body.error).toBeNull();
  return response.body.data as { id: string; nickname: string; pin_code: string };
}

beforeEach(() => { fixture.mode = undefined; fixture.writes = []; });

describe('legacy registration respects the authoritative test mode', () => {
  it.each(['insert', 'upsert'])('blocks a forged public profile %s by default before operational writes', async operation => {
    const id = randomUUID();
    const response = await op({ table: 'profiles', op: operation,
      payload: { id, nickname: 'forged-button', _device_secret: 'must-not-bind', testMode: false },
      testMode: false, isAdmin: true });
    expect(response.status).toBe(423);
    expect(response.body.error.code).toBe('TEST_MODE');
    expect(fixture.writes.filter(sql => sql.includes(':profiles') || sql.includes(':device_secrets'))).toEqual([]);
    const profiles = await op({ table: 'profiles', op: 'select', filters: [{ type: 'eq', col: 'id', val: id }] });
    expect(profiles.body.data).toEqual([]);
  });

  it('keeps legacy and explicit OFF states closed until a separate opening, without removing existing profiles', async () => {
    disableMode();
    const existing = await participant();
    const off = { ...fixture.mode, publicAdmissionOpen: false, admissionOpenedAt: null };
    const legacy = { ...off } as Record<string, unknown>;
    delete legacy.publicAdmissionOpen;
    delete legacy.admissionOpenedAt;
    for (const mode of [off, legacy]) {
      fixture.mode = mode;
      for (const operation of ['insert', 'upsert']) {
        const id = randomUUID();
        const start = fixture.writes.length;
        const response = await op({ table: 'profiles', op: operation,
          payload: { id, nickname: 'closed-before-open', _device_secret: 'unbound', publicAdmissionOpen: true },
          publicAdmissionOpen: true });
        expect(response.status).toBe(423);
        expect(response.body.error.code).toBe('PUBLIC_ADMISSION_CLOSED');
        expect(fixture.writes.slice(start).filter(sql => sql.includes(':profiles') || sql.includes(':device_secrets'))).toEqual([]);
      }
      const recovery = await request(app).post('/api/db/by-pin').send({ pin: existing.pin_code, nickname: existing.nickname });
      expect(recovery.status).toBe(200);
      expect(recovery.body.data.id).toBe(existing.id);
    }
  });

  it('keeps existing recovery, profile edits, hearts, chats and administrator support available while ON', async () => {
    disableMode();
    const a = await participant();
    const b = await participant();
    fixture.mode = { ...fixture.mode, enabled: true, publicAdmissionOpen: false, admissionOpenedAt: null };
    const recovery = await request(app).post('/api/db/by-pin').send({ pin: a.pin_code, nickname: a.nickname });
    expect(recovery.status).toBe(200);
    expect(recovery.body.data.id).toBe(a.id);
    const login = await request(app).post('/api/db/auth/login').send({ userId: a.id, deviceSecret: `secret-${a.id}` });
    expect(login.status).toBe(200);
    for (const operation of ['update', 'upsert']) {
      const updated = await op({ table: 'profiles', op: operation, requesterId: a.id,
        payload: { id: a.id, bio: 'existing participant' }, filters: [{ type: 'eq', col: 'id', val: a.id }] });
      expect(updated.status).toBe(200);
      expect(updated.body.error).toBeNull();
    }
    const like = await op({ table: 'likes', op: 'insert', requesterId: a.id,
      payload: { liker_id: a.id, liked_id: b.id, heart_type: 'red', status: 'pending' } });
    expect(like.status).toBe(200);
    expect(like.body.error).toBeNull();
    const chat = await op({ table: 'chats', op: 'insert', requesterId: a.id,
      payload: { user1_id: a.id, user2_id: b.id }, single: true, selectAfterWrite: true });
    expect(chat.status).toBe(200);
    const message = await op({ table: 'messages', op: 'insert', requesterId: a.id,
      payload: { chat_id: chat.body.data.id, sender_id: a.id, content: 'existing conversation', client_id: randomUUID() } });
    expect(message.status).toBe(200);
    expect(message.body.error).toBeNull();
    const support = await request(app).post('/api/db/rpc/admin_update_profile')
      .send({ p_admin_password: '116606', p_profile_id: a.id, p_bio: 'administrator support' });
    expect(support.status).toBe(200);
    const newProfile = await op({ table: 'profiles', op: 'insert', payload: { id: randomUUID(), nickname: 'still-closed' } });
    expect(newProfile.status).toBe(423);
  });

  it('rejects production legacy tester writes even when mode is OFF, while preserving operational rows', async () => {
    disableMode();
    const a = await participant();
    const password = await request(app).post('/api/db/rpc/test_verify_password').send({ p_test_password: 'test-mode-fixture-password' });
    expect(password.status).toBe(200);
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      for (const enabled of [false, true]) {
        fixture.mode = { ...fixture.mode, enabled, publicAdmissionOpen: !enabled,
          admissionOpenedAt: enabled ? null : '2026-10-28T00:00:00Z' };
        for (const operation of ['insert', 'update', 'upsert', 'delete']) {
          const response = await op({ table: 'profiles', op: operation, testToken: password.body.data,
            payload: { id: a.id, nickname: 'must-not-change' }, filters: [{ type: 'eq', col: 'id', val: a.id }] });
          expect(response.status).toBe(423);
          expect(response.body.error.code).toBe('LEGACY_TEST_WRITE_DISABLED');
        }
        for (const name of ['test_clear_hearts', 'test_wipe_all', 'test_update_settings']) {
          const response = await request(app).post(`/api/db/rpc/${name}`)
            .send({ p_test_password: 'test-mode-fixture-password', p_payload: { session_active: true } });
          expect(response.status).toBe(423);
          expect(response.body.error.code).toBe('LEGACY_TEST_WRITE_DISABLED');
        }
      }
      const existing = await op({ table: 'profiles', op: 'select',
        filters: [{ type: 'eq', col: 'id', val: a.id }], single: true });
      expect(existing.body.data.nickname).toBe(a.nickname);
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('keeps existing recovery available in production with a previous admission approval but no current approved privacy policy', async () => {
    disableMode();
    const existing = await participant();
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      // This fixture has no privacy-policy record or matching production release.
      // Recovery never enters the new-profile write or its publication guard.
      const recovery = await request(app).post('/api/db/by-pin').send({ pin: existing.pin_code, nickname: existing.nickname });
      expect(recovery.status).toBe(200);
      expect(recovery.body.data.id).toBe(existing.id);
      const login = await request(app).post('/api/db/auth/login').send({ userId: existing.id, deviceSecret: `secret-${existing.id}` });
      expect(login.status).toBe(200);
    } finally { process.env.NODE_ENV = previousNodeEnv; }
  });
});
