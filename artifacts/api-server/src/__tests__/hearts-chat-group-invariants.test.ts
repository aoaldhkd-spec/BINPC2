/**
 * 하트·1:1·단톡 A↔B 재발방지. db-security 와 분리해 다른 에이전트와 충돌을 피한다.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

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

import request from 'supertest';
import app from '../app.js';
import { collectBroadcastTargets } from '../routes/db.js';
import { deterministicChatId } from '../lib/db-chat-ids.js';

async function op(body: Record<string, unknown>) {
  return request(app)
    .post('/api/db/op')
    .set('Content-Type', 'application/json')
    .send(body);
}

describe('[Hearts] A likes B bidirectional + ranking strip', () => {
  it('requesterId 없이 likes INSERT 는 403', async () => {
    const res = await op({
      op: 'insert',
      table: 'likes',
      payload: { liker_id: 'spoof', liked_id: randomUUID(), heart_type: 'red' },
    });
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('FORBIDDEN');
  });

  it('A→B 하트: B inbox 는 liker_id, A sent 유지, 랭킹은 liker_id 숨김, 브로드캐스트는 A+B만', async () => {
    const a = randomUUID();
    const b = randomUUID();
    const c = randomUUID();
    await op({ op: 'insert', table: 'profiles', payload: { id: a, nickname: `ha-${a.slice(0, 8)}` } });
    await op({ op: 'insert', table: 'profiles', payload: { id: b, nickname: `hb-${b.slice(0, 8)}` } });

    const sent = await op({
      op: 'insert',
      table: 'likes',
      requesterId: a,
      payload: { liker_id: 'spoof-as-c', liked_id: b, heart_type: 'red', status: 'pending' },
      selectAfterWrite: true,
      single: true,
    });
    expect(sent.status).toBe(200);
    expect(sent.body.data?.liker_id).toBe(a);
    expect(sent.body.data?.liked_id).toBe(b);

    const inboxB = await op({
      op: 'select',
      table: 'likes',
      requesterId: b,
      filters: [{ type: 'eq', col: 'liked_id', val: b }],
    });
    expect(inboxB.status).toBe(200);
    expect(inboxB.body.data[0]?.liker_id).toBe(a);

    const sentA = await op({
      op: 'select',
      table: 'likes',
      requesterId: a,
      filters: [{ type: 'eq', col: 'liker_id', val: a }],
    });
    expect(sentA.body.data[0]?.liker_id).toBe(a);
    expect(sentA.body.data[0]?.liked_id).toBe(b);

    const ranking = await op({
      op: 'select',
      table: 'likes',
      requesterId: c,
    });
    expect(ranking.status).toBe(200);
    const row = (ranking.body.data as { liked_id?: string; liker_id?: string }[])
      .find((r) => r.liked_id === b);
    expect(row).toBeTruthy();
    expect(row?.liker_id).toBeUndefined();

    const targets = collectBroadcastTargets('likes', sent.body.data);
    expect(targets.sort()).toEqual([a, b].sort());
    expect(targets).not.toContain(c);
  });
});

describe('[Chat] persist-before-broadcast + sibling visibility', () => {
  it('A→B / B→A 는 같은 canonical chat_id 이고 양쪽 메시지가 서로 보인다', async () => {
    const a = randomUUID();
    const b = randomUUID();
    const fromA = await op({
      op: 'insert',
      table: 'chats',
      requesterId: a,
      payload: { user1_id: a, user2_id: b },
      selectAfterWrite: true,
      single: true,
    });
    const fromB = await op({
      op: 'insert',
      table: 'chats',
      requesterId: b,
      payload: { user1_id: b, user2_id: a },
      selectAfterWrite: true,
      single: true,
    });
    expect(fromA.status).toBe(200);
    expect(fromB.status).toBe(200);
    const chatId = fromA.body.data.id as string;
    expect(fromB.body.data.id).toBe(chatId);
    expect(chatId).toBe(deterministicChatId(a, b));

    const msgA = await op({
      op: 'insert',
      table: 'messages',
      requesterId: a,
      payload: { chat_id: chatId, sender_id: a, content: 'from-a', client_id: randomUUID() },
      selectAfterWrite: true,
      single: true,
    });
    expect(msgA.status).toBe(200);

    const seenByB = await op({
      op: 'select',
      table: 'messages',
      requesterId: b,
      filters: [{ type: 'eq', col: 'chat_id', val: chatId }],
    });
    expect(seenByB.body.data.some((m: { content: string }) => m.content === 'from-a')).toBe(true);

    const msgB = await op({
      op: 'insert',
      table: 'messages',
      requesterId: b,
      payload: { chat_id: chatId, sender_id: b, content: 'from-b', client_id: randomUUID() },
      selectAfterWrite: true,
      single: true,
    });
    expect(msgB.status).toBe(200);

    const seenByA = await op({
      op: 'select',
      table: 'messages',
      requesterId: a,
      filters: [{ type: 'eq', col: 'chat_id', val: chatId }],
    });
    const contents = (seenByA.body.data as { content: string }[]).map((m) => m.content);
    expect(contents).toEqual(expect.arrayContaining(['from-a', 'from-b']));

    const targets = collectBroadcastTargets(
      'messages',
      { ...msgA.body.data, chat_user1_id: a, chat_user2_id: b },
      () => ({ id: chatId, user1_id: a, user2_id: b }),
    );
    expect(targets.sort()).toEqual([a, b].sort());
  });

  it('duplicate client_id INSERT 는 한 행만 남긴다 (SSE dedupe 전제)', async () => {
    const a = randomUUID();
    const b = randomUUID();
    const chat = await op({
      op: 'insert',
      table: 'chats',
      requesterId: a,
      payload: { user1_id: a, user2_id: b },
      selectAfterWrite: true,
      single: true,
    });
    const chatId = chat.body.data.id as string;
    const clientId = randomUUID();
    const first = await op({
      op: 'insert',
      table: 'messages',
      requesterId: a,
      payload: { chat_id: chatId, sender_id: a, content: 'once', client_id: clientId },
      selectAfterWrite: true,
      single: true,
    });
    const retry = await op({
      op: 'insert',
      table: 'messages',
      requesterId: a,
      payload: { chat_id: chatId, sender_id: a, content: 'once', client_id: clientId },
      selectAfterWrite: true,
      single: true,
    });
    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect(retry.body.data.id).toBe(first.body.data.id);

    const list = await op({
      op: 'select',
      table: 'messages',
      requesterId: b,
      filters: [{ type: 'eq', col: 'chat_id', val: chatId }],
    });
    const same = (list.body.data as { client_id: string }[]).filter((m) => m.client_id === clientId);
    expect(same).toHaveLength(1);
  });
});

describe('[Group] max 4 + unlimited members + both see message', () => {
  async function seedGroup(id: string, name: string) {
    const res = await op({
      op: 'insert',
      table: 'group_chats',
      payload: { id, name, interest_tag: name.slice(0, 10), age_group: null, max_members: 999999, room_kind: 'test' },
      requesterId: 'seed-admin',
      selectAfterWrite: true,
      single: true,
    });
    expect(res.status).toBe(200);
    return id;
  }

  it('5번째 단톡 입장은 거부하고, 방 인원 8명 제한은 없다', async () => {
    const uid = `inv-max-${randomUUID()}`;
    const ids = await Promise.all([
      seedGroup(`inv-a-${uid}`, '방A'),
      seedGroup(`inv-b-${uid}`, '방B'),
      seedGroup(`inv-c-${uid}`, '방C'),
      seedGroup(`inv-d-${uid}`, '방D'),
      seedGroup(`inv-e-${uid}`, '방E'),
    ]);
    for (let i = 0; i < 4; i++) {
      const join = await op({
        op: 'insert',
        table: 'group_participants',
        requesterId: uid,
        payload: { group_id: ids[i], user_id: uid },
      });
      expect(join.status).toBe(200);
    }
    const fifth = await op({
      op: 'insert',
      table: 'group_participants',
      requesterId: uid,
      payload: { group_id: ids[4], user_id: uid },
    });
    expect(fifth.status).toBe(400);
    expect(fifth.body.error?.code).toBe('GROUP_LIMIT');

    const crowdId = `inv-crowd-${randomUUID()}`;
    await seedGroup(crowdId, '만원');
    for (let i = 0; i < 9; i++) {
      const member = `inv-c9-${i}-${crowdId.slice(0, 6)}`;
      const join = await op({
        op: 'insert',
        table: 'group_participants',
        requesterId: member,
        payload: { group_id: crowdId, user_id: member },
      });
      expect(join.status).toBe(200);
    }
  });

  it('단톡 메시지는 양쪽 참여자가 SELECT 로 본다', async () => {
    const a = `ga-${randomUUID()}`;
    const b = `gb-${randomUUID()}`;
    const gid = `gmsg-${randomUUID()}`;
    await seedGroup(gid, '양방향');
    expect((await op({
      op: 'insert', table: 'group_participants', requesterId: a,
      payload: { group_id: gid, user_id: a },
    })).status).toBe(200);
    expect((await op({
      op: 'insert', table: 'group_participants', requesterId: b,
      payload: { group_id: gid, user_id: b },
    })).status).toBe(200);

    const sent = await op({
      op: 'insert',
      table: 'group_messages',
      requesterId: a,
      payload: { group_id: gid, sender_id: a, content: 'group-hi', client_id: randomUUID() },
      selectAfterWrite: true,
      single: true,
    });
    expect(sent.status).toBe(200);

    const asB = await op({
      op: 'select',
      table: 'group_messages',
      requesterId: b,
      filters: [{ type: 'eq', col: 'group_id', val: gid }],
    });
    expect(asB.status).toBe(200);
    expect((asB.body.data as { content: string }[]).some((m) => m.content === 'group-hi')).toBe(true);

    const asA = await op({
      op: 'select',
      table: 'group_messages',
      requesterId: a,
      filters: [{ type: 'eq', col: 'group_id', val: gid }],
    });
    expect((asA.body.data as { content: string }[]).some((m) => m.content === 'group-hi')).toBe(true);
  });

  it('나가기는 참여만 지우고 방은 남긴다', async () => {
    const a = `lv-${randomUUID()}`;
    const gid = `gleave-${randomUUID()}`;
    await seedGroup(gid, '남기는방');
    expect((await op({
      op: 'insert', table: 'group_participants', requesterId: a,
      payload: { group_id: gid, user_id: a },
    })).status).toBe(200);

    const leave = await op({
      op: 'delete',
      table: 'group_participants',
      requesterId: a,
      filters: [
        { type: 'eq', col: 'group_id', val: gid },
        { type: 'eq', col: 'user_id', val: a },
      ],
    });
    expect(leave.status).toBe(200);

    const room = await op({
      op: 'select',
      table: 'group_chats',
      requesterId: a,
      filters: [{ type: 'eq', col: 'id', val: gid }],
    });
    expect(room.status).toBe(200);
    expect((room.body.data as { id: string }[]).some((g) => g.id === gid)).toBe(true);

    const destroy = await op({
      op: 'delete',
      table: 'group_chats',
      requesterId: a,
      filters: [{ type: 'eq', col: 'id', val: gid }],
    });
    expect(destroy.status).toBe(403);
  });
});

describe('[Chat] third party cannot see A↔B', () => {
  it('C 는 A-B 메시지를 SELECT 하지 못한다', async () => {
    const a = randomUUID();
    const b = randomUUID();
    const c = randomUUID();
    const chat = await op({
      op: 'insert',
      table: 'chats',
      requesterId: a,
      payload: { user1_id: a, user2_id: b },
      selectAfterWrite: true,
      single: true,
    });
    const chatId = chat.body.data.id as string;
    expect((await op({
      op: 'insert',
      table: 'messages',
      requesterId: a,
      payload: { chat_id: chatId, sender_id: a, content: 'secret-ab', client_id: randomUUID() },
    })).status).toBe(200);

    const asC = await op({
      op: 'select',
      table: 'messages',
      requesterId: c,
      filters: [{ type: 'eq', col: 'chat_id', val: chatId }],
    });
    expect(asC.status).toBe(403);
  });
});

async function setFunctionsLocked(locked: boolean) {
  const passwords = ['116606', 'custom-admin-pw-xyz', process.env.BOOTSTRAP_ADMIN_PASSWORD].filter(Boolean);
  let lastStatus = 0;
  for (const pw of passwords) {
    const res = await request(app)
      .post('/api/db/rpc/admin_update_settings')
      .send({ p_admin_password: pw, p_payload: { functions_locked: locked } });
    lastStatus = res.status;
    if (res.status === 200) return;
  }
  throw new Error(`admin_update_settings functions_locked=${locked} failed (${lastStatus})`);
}

describe('[Lock] functions_locked rejects matching writes and broadcasts', () => {
  afterEach(async () => {
    try { await setFunctionsLocked(false); } catch { /* unlock best-effort */ }
  });

  it('잠금 중 likes / messages / group_messages / group_participants INSERT 는 403, 해제 후 허용', async () => {
    const a = randomUUID();
    const b = randomUUID();
    await op({ op: 'insert', table: 'profiles', payload: { id: a, nickname: `lk-${a.slice(0, 8)}` } });
    await op({ op: 'insert', table: 'profiles', payload: { id: b, nickname: `lk-${b.slice(0, 8)}` } });
    const chat = await op({
      op: 'insert',
      table: 'chats',
      requesterId: a,
      payload: { user1_id: a, user2_id: b },
      selectAfterWrite: true,
      single: true,
    });
    expect(chat.status).toBe(200);
    const chatId = chat.body.data.id as string;
    const gid = `glock-${randomUUID()}`;
    expect((await op({
      op: 'insert',
      table: 'group_chats',
      payload: { id: gid, name: '잠금방', interest_tag: 'lock', age_group: null, max_members: 999, room_kind: 'test' },
      requesterId: 'seed-admin',
    })).status).toBe(200);

    await setFunctionsLocked(true);

    const likeLocked = await op({
      op: 'insert',
      table: 'likes',
      requesterId: a,
      payload: { liker_id: a, liked_id: b, heart_type: 'red' },
    });
    expect(likeLocked.status).toBe(403);
    expect(likeLocked.body.error?.code).toBe('FUNCTIONS_LOCKED');

    const msgLocked = await op({
      op: 'insert',
      table: 'messages',
      requesterId: a,
      payload: { chat_id: chatId, sender_id: a, content: 'nope', client_id: randomUUID() },
    });
    expect(msgLocked.status).toBe(403);
    expect(msgLocked.body.error?.code).toBe('FUNCTIONS_LOCKED');

    const joinLocked = await op({
      op: 'insert',
      table: 'group_participants',
      requesterId: a,
      payload: { group_id: gid, user_id: a },
    });
    expect(joinLocked.status).toBe(403);
    expect(joinLocked.body.error?.code).toBe('FUNCTIONS_LOCKED');

    const readyLocked = await request(app).get('/api/db/ready');
    expect(readyLocked.status).toBe(200);
    expect(readyLocked.body.functions_locked).toBe(true);
    expect(readyLocked.body.settings?.functions_locked).toBe(true);

    await setFunctionsLocked(false);

    expect((await op({
      op: 'insert',
      table: 'group_participants',
      requesterId: a,
      payload: { group_id: gid, user_id: a },
    })).status).toBe(200);

    const likeOk = await op({
      op: 'insert',
      table: 'likes',
      requesterId: a,
      payload: { liker_id: a, liked_id: b, heart_type: 'red' },
    });
    expect(likeOk.status).toBe(200);

    const msgOk = await op({
      op: 'insert',
      table: 'messages',
      requesterId: a,
      payload: { chat_id: chatId, sender_id: a, content: 'ok', client_id: randomUUID() },
    });
    expect(msgOk.status).toBe(200);

    const groupOk = await op({
      op: 'insert',
      table: 'group_messages',
      requesterId: a,
      payload: { group_id: gid, sender_id: a, content: 'ok', client_id: randomUUID() },
    });
    expect(groupOk.status).toBe(200);
  });

  it('functions_locked 변경은 app_settings SSE로 브로드캐스트된다', async () => {
    const userId = randomUUID();
    await op({ op: 'insert', table: 'profiles', payload: { id: userId, nickname: `sse-${userId.slice(0, 8)}` } });
    const agent = request.agent(app);
    const login = await agent.post('/api/db/auth/login').send({ userId, deviceSecret: `sec-${userId}` });
    expect(login.status).toBe(200);
    const tokenRes = await agent.post('/api/db/auth/sse-token');
    expect(tokenRes.status).toBe(200);
    const token = tokenRes.body.token as string;

    const server = await new Promise<http.Server>((resolve) => {
      const s = http.createServer(app);
      s.listen(0, '127.0.0.1', () => resolve(s));
    });
    const { port } = server.address() as AddressInfo;
    try {
      const path = `/api/db/events?userId=${encodeURIComponent(userId)}&token=${encodeURIComponent(token)}`;
      await new Promise<void>((resolve, reject) => {
        let buf = '';
        let toggled = false;
        const req = http.get({
          hostname: '127.0.0.1',
          port,
          path,
          headers: { Accept: 'text/event-stream' },
        }, (res) => {
          res.setEncoding('utf8');
          res.on('data', (chunk: string) => {
            buf += chunk;
            if (!toggled && buf.includes('"type":"ping"')) {
              toggled = true;
              void setFunctionsLocked(true).catch((e) => {
                req.destroy();
                reject(e);
              });
            }
            if (buf.includes('"table":"app_settings"') && buf.includes('functions_locked')) {
              req.destroy();
              resolve();
            }
          });
        });
        req.on('error', (err) => {
          if ((err as NodeJS.ErrnoException).code === 'ECONNRESET') return;
          reject(err);
        });
        setTimeout(() => {
          req.destroy();
          reject(new Error(`SSE lock broadcast timeout. got: ${buf.slice(0, 800)}`));
        }, 6000);
      });
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
