/**
 * API-server セキュリティ不変条件テスト
 *
 * 発見済みの HIGH バグが再発しないよう、セキュリティ検証ロジックを
 * 自動テストとして固定する。
 *
 * テスト対象インバリアント:
 *  1. messages INSERT — requesterId なしは 403
 *  2. messages INSERT — sender_id が requesterId と不一致なら 403
 *  3. messages INSERT — chat_id なしは 400
 *  4. messages INSERT — 参加していない chat への INSERT は 403
 *  5. chats INSERT   — セルフチャット (u1===u2) は 400
 *  6. chats INSERT   — requesterId が参加者でなければ 403
 *  7. messages SELECT — requesterId なしは 403
 *  8. messages SELECT — chat_id フィルタなしは 403
 *  9. chats SELECT   — requesterId なしは 403
 * 10. /unread-counts — token なしは 401
 * 11. /unread-counts — 偽造 token は 401
 * 12. /unread-counts — 他ユーザーの有効 token は 401 (IDOR ブロック)
 * 13. /unread-counts — 自分の有効 token は 200
 * 14. /auth/login    — deviceSecret 不一致時は再バインドせず 401
 */

import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { randomUUID } from 'node:crypto';

// SESSION_SECRET をアプリ import 前に設定 — SSE_TOKEN_SECRET の初期化に必要
const TEST_SSE_SECRET = vi.hoisted(() => {
  const secret = 'test-sse-secret-for-unit-tests';
  process.env.SESSION_SECRET = secret;
  return secret;
});

/** issueSseToken と同じロジックでテスト用トークンを生成 */
function makeSseToken(userId: string, secret = TEST_SSE_SECRET, offsetSec = 0): string {
  const exp = Math.floor(Date.now() / 1000) + 3600 + offsetSec;
  const mac = createHmac('sha256', secret).update(`${userId}:${exp}`).digest('hex');
  return `${exp}:${mac}`;
}
import request from 'supertest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

// ── 必ずアプリ import より前に宣言 ────────────────────────────────────────────
// vitest がこのブロックをファイル先頭に hoisting するため、
// pg / web-push は app の import 時に既にモックになっている。

vi.mock('pg', () => {
  const mockClient = {
    query: () => Promise.resolve({ rows: [] }),
    release: () => {},
    on: () => {},
  };
  // アロー関数は new できないため、class を使う
  class MockPool {
    connect = () => Promise.resolve(mockClient);
    query   = () => Promise.resolve({ rows: [] });
    on      = () => {};
    end     = () => Promise.resolve();
  }
  class MockClient {
    connect = () => Promise.resolve();
    query   = () => Promise.resolve({ rows: [] });
    on      = () => {};
    end     = () => Promise.resolve();
  }
  return { default: { Pool: MockPool, Client: MockClient } };
});

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn().mockResolvedValue(undefined),
  },
}));

// ── app を import (モック設定後) ───────────────────────────────────────────────
import app from '../app.js';

// ─── helpers ────────────────────────────────────────────────────────────────

/** POST /api/db/op を呼び出す共通ヘルパー */
async function op(body: Record<string, unknown>) {
  return request(app)
    .post('/api/db/op')
    .set('Content-Type', 'application/json')
    .send(body);
}

async function loginAgent(userId: string) {
  await op({
    op: 'insert',
    table: 'profiles',
    payload: { id: userId, nickname: `test-${userId}` },
  });
  const agent = request.agent(app);
  const login = await agent
    .post('/api/db/auth/login')
    .set('Content-Type', 'application/json')
    .send({ userId, deviceSecret: `secret-${userId}` });
  expect(login.status).toBe(200);
  return agent;
}

// ════════════════════════════════════════════════════════════════════════════════
// messages INSERT セキュリティ
// ════════════════════════════════════════════════════════════════════════════════

describe('[Security] messages INSERT', () => {
  it('requesterId なしで INSERT すると 403 (認証必須)', async () => {
    const res = await op({
      op: 'insert',
      table: 'messages',
      payload: { content: 'hello', chat_id: 'chat-1' },
      // requesterId: 未指定
    });
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('FORBIDDEN');
  });

  it('sender_id が requesterId と違う場合 403 (IDOR 攻撃ブロック)', async () => {
    const res = await op({
      op: 'insert',
      table: 'messages',
      payload: { content: 'hi', chat_id: 'chat-1', sender_id: 'attacker-user' },
      requesterId: 'real-user-a',
    });
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('FORBIDDEN');
  });

  it('chat_id なしで INSERT すると 400', async () => {
    const res = await op({
      op: 'insert',
      table: 'messages',
      payload: { content: 'hi', sender_id: 'user-a' },
      requesterId: 'user-a',
    });
    expect(res.status).toBe(400);
  });

  it('存在しない chat_id (参加者でない) への INSERT は 403', async () => {
    const res = await op({
      op: 'insert',
      table: 'messages',
      payload: { content: 'hi', chat_id: 'non-existent-chat', sender_id: 'user-a' },
      requesterId: 'user-a',
    });
    // store は空 → chat が存在しない → 参加者検証で 403
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('FORBIDDEN');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// chats INSERT セキュリティ
// ════════════════════════════════════════════════════════════════════════════════

describe('[Security] chats INSERT', () => {
  it('セルフチャット (user1_id === user2_id) は 400', async () => {
    const res = await op({
      op: 'insert',
      table: 'chats',
      payload: { user1_id: 'user-a', user2_id: 'user-a' },
      requesterId: 'user-a',
    });
    expect(res.status).toBe(400);
    expect(res.body.error?.message).toMatch(/self-chat/);
  });

  it('requesterId が参加者でなければ 403', async () => {
    const res = await op({
      op: 'insert',
      table: 'chats',
      payload: { user1_id: 'user-b', user2_id: 'user-c' },
      requesterId: 'user-x',   // user-b でも user-c でもない
    });
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('FORBIDDEN');
  });

  it('requesterId なしで chats INSERT は 403', async () => {
    const res = await op({
      op: 'insert',
      table: 'chats',
      payload: { user1_id: 'user-b', user2_id: 'user-c' },
      // requesterId: 未指定
    });
    expect(res.status).toBe(403);
  });

  it('user1_id / user2_id が空文字なら 400', async () => {
    const res = await op({
      op: 'insert',
      table: 'chats',
      payload: { user1_id: '', user2_id: 'user-c' },
      requesterId: 'user-c',
    });
    expect(res.status).toBe(400);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// SELECT IDOR ガード
// ════════════════════════════════════════════════════════════════════════════════

describe('[Security] SELECT IDOR ガード', () => {
  it('messages SELECT — requesterId なしは 403', async () => {
    const res = await op({
      op: 'select',
      table: 'messages',
      filters: [{ col: 'chat_id', type: 'eq', val: 'some-chat' }],
    });
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('FORBIDDEN');
  });

  it('messages SELECT — chat_id フィルタなしは 403 (全件ダンプ禁止)', async () => {
    const res = await op({
      op: 'select',
      table: 'messages',
      filters: [],
      requesterId: 'user-a',
    });
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('FORBIDDEN');
  });

  it('messages SELECT — 存在しない chat_id は空配列 (情報漏洩ではなく empty)', async () => {
    const res = await op({
      op: 'select',
      table: 'messages',
      filters: [{ col: 'chat_id', type: 'eq', val: 'ghost-chat' }],
      requesterId: 'user-a',
    });
    // store 空 → chat 存在しない → 情報漏洩なく空配列を返す
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('chats SELECT — requesterId なしは 403', async () => {
    const res = await op({
      op: 'select',
      table: 'chats',
    });
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('FORBIDDEN');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// セッション requesterId スプーフィングガード
// ════════════════════════════════════════════════════════════════════════════════

describe('[Security] requesterId スプーフィング防止', () => {
  it('未知のテーブルは 400 (allowlist 外)', async () => {
    const res = await op({
      op: 'select',
      table: 'internal_secrets',
      requesterId: 'user-a',
    });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('INVALID_TABLE');
  });

  it('op が文字列でなければ 400', async () => {
    const res = await op({
      op: 42,
      table: 'messages',
      requesterId: 'user-a',
    });
    expect(res.status).toBe(400);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// /unread-counts IDOR ガード — SSE トークン認証
// ════════════════════════════════════════════════════════════════════════════════

describe('[Security] /unread-counts — SSE トークン IDOR ガード', () => {
  it('token なしは 401', async () => {
    const res = await request(app).get('/api/db/unread-counts?userId=user-a');
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('UNAUTHORIZED');
  });

  it('偽造 token (ランダム文字列) は 401', async () => {
    const res = await request(app).get(
      `/api/db/unread-counts?userId=user-a&token=${encodeURIComponent('9999999999:deadbeefdeadbeef')}`,
    );
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('UNAUTHORIZED');
  });

  it('user-A の有効 token を user-B の userId に使うと 401 (IDOR ブロック)', async () => {
    const userAId = 'user-a-' + randomUUID();
    const userBId = 'user-b-' + randomUUID();
    const tokenForA = makeSseToken(userAId);
    // userB のデータを userA のトークンで取得しようとする → 弾かれる
    const res = await request(app).get(
      `/api/db/unread-counts?userId=${encodeURIComponent(userBId)}&token=${encodeURIComponent(tokenForA)}`,
    );
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('UNAUTHORIZED');
  });

  it('自分の有効 token を使うと 200 (正常フロー)', async () => {
    const userId = 'user-self-' + randomUUID();
    const token = makeSseToken(userId);
    const res = await request(app).get(
      `/api/db/unread-counts?userId=${encodeURIComponent(userId)}&token=${encodeURIComponent(token)}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    // データは空オブジェクト (このユーザーのチャットは存在しない)
    expect(res.body.data).toEqual({});
  });

  it('x-sse-token ヘッダー経由でも 200 (ヘッダー認証フロー)', async () => {
    const userId = 'user-header-' + randomUUID();
    const token = makeSseToken(userId);
    const res = await request(app)
      .get(`/api/db/unread-counts?userId=${encodeURIComponent(userId)}`)
      .set('x-sse-token', token);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({});
  });
});

describe('[Security] heart_balances — 본인 조회 전용', () => {
  it('본인 id 필터가 있으면 조회를 허용한다', async () => {
    const userId = randomUUID();
    const res = await op({
      op: 'select',
      table: 'heart_balances',
      requesterId: userId,
      filters: [{ type: 'eq', col: 'id', val: userId }],
      maybeSingle: true,
    });
    expect(res.status).toBe(200);
  });

  it('일반 사용자의 직접 수정을 차단한다', async () => {
    const userId = randomUUID();
    const res = await op({
      op: 'update',
      table: 'heart_balances',
      requesterId: userId,
      filters: [{ type: 'eq', col: 'id', val: userId }],
      payload: { heart_count: 999 },
    });
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('FORBIDDEN');
  });
});

describe('[Security] profiles / likes / storage', () => {
  it('비공개 프로필의 연락처는 다른 사용자 SELECT 응답에서 제거한다', async () => {
    const ownerId = randomUUID();
    await op({
      op: 'insert',
      table: 'profiles',
      payload: {
        id: ownerId,
        nickname: `private-${ownerId}`,
        contact_private: true,
        phone_number: '010-1234-5678',
        kakao_id: 'secret-kakao',
        instagram_id: 'secret-insta',
      },
    });

    const res = await op({
      op: 'select',
      table: 'profiles',
      requesterId: randomUUID(),
      filters: [{ type: 'eq', col: 'id', val: ownerId }],
      maybeSingle: true,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.phone_number).toBeUndefined();
    expect(res.body.data.kakao_id).toBeUndefined();
    expect(res.body.data.instagram_id).toBeUndefined();
  });

  it('하트 전체 조회 시 liker_id를 숨기고 본인 보낸 하트 조회만 liker_id를 노출한다', async () => {
    const likerId = randomUUID();
    const likedId = randomUUID();
    await op({
      op: 'insert',
      table: 'profiles',
      payload: { id: likerId, nickname: 'liker-a' },
    });
    await op({
      op: 'insert',
      table: 'profiles',
      payload: { id: likedId, nickname: 'liked-b' },
    });
    await op({
      op: 'insert',
      table: 'likes',
      requesterId: likerId,
      payload: { liker_id: likerId, liked_id: likedId, heart_type: 'red', status: 'pending' },
    });

    const allRes = await op({
      op: 'select',
      table: 'likes',
      requesterId: likedId,
    });
    expect(allRes.status).toBe(200);
    expect(allRes.body.data[0]?.liker_id).toBeUndefined();
    expect(allRes.body.data[0]?.liked_id).toBe(likedId);

    const ownRes = await op({
      op: 'select',
      table: 'likes',
      requesterId: likerId,
      filters: [{ type: 'eq', col: 'liker_id', val: likerId }],
    });
    expect(ownRes.status).toBe(200);
    expect(ownRes.body.data[0]?.liker_id).toBe(likerId);
  });

  it('하트를 받지 않은 사용자의 status UPDATE를 차단한다', async () => {
    const likerId = randomUUID();
    const likedId = randomUUID();
    const inserted = await op({
      op: 'insert',
      table: 'likes',
      requesterId: likerId,
      payload: { liker_id: likerId, liked_id: likedId, heart_type: 'pink', status: 'pending' },
      selectAfterWrite: true,
      single: true,
    });
    const likeId = inserted.body.data.id as string;

    const res = await op({
      op: 'update',
      table: 'likes',
      requesterId: randomUUID(),
      filters: [{ type: 'eq', col: 'id', val: likeId }],
      payload: { status: 'accepted' },
    });

    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('FORBIDDEN');
  });

  it('인증되지 않은 이미지 업로드와 조회를 차단한다', async () => {
    const upload = await request(app)
      .post('/api/db/storage-upload')
      .send({ path: 'profile-photos/anonymous', dataUrl: 'data:image/jpeg;base64,/9j/' });
    expect(upload.status).toBe(401);

    const read = await request(app)
      .get('/api/db/storage-image?p=profile-photos%2Fanonymous');
    expect(read.status).toBe(401);
  });

  it('자신의 프로필 이미지만 업로드·삭제할 수 있다', async () => {
    const ownerId = randomUUID();
    const otherId = randomUUID();
    const owner = await loginAgent(ownerId);
    const other = await loginAgent(otherId);
    const path = `profile-photos/${ownerId}`;

    const upload = await owner
      .post('/api/db/storage-upload')
      .send({ path, dataUrl: 'data:image/jpeg;base64,/9j/' });
    expect(upload.status).toBe(200);

    const forbiddenDelete = await other
      .post('/api/db/storage-remove')
      .send({ paths: [path] });
    expect(forbiddenDelete.status).toBe(403);

    const ownerDelete = await owner
      .post('/api/db/storage-remove')
      .send({ paths: [path] });
    expect(ownerDelete.status).toBe(200);
  });
});

describe('[Security] test dashboard password', () => {
  it('app_settings 일반 조회에서 test_password를 노출하지 않는다', async () => {
    const res = await op({ op: 'select', table: 'app_settings' });
    expect(res.status).toBe(200);
    expect(res.body.data[0]?.test_password).toBeUndefined();
    expect(res.body.data[0]?.admin_password).toBeUndefined();
  });

  it('서버 RPC가 잘못된 테스트 비밀번호를 거부한다', async () => {
    const res = await request(app)
      .post('/api/db/rpc/test_verify_password')
      .send({ p_test_password: 'definitely-wrong' });
    expect(res.status).toBe(403);
    expect(res.body.data).toBe(false);
  });

  it('mergeAppSettings가 admin/test 비밀번호를 유지한다', async () => {
    const customAdmin = 'custom-admin-pw-xyz';
    const customTest = 'custom-test-pw-abc';
    await request(app)
      .post('/api/db/rpc/admin_update_settings')
      .send({
        p_admin_password: '116606',
        p_payload: { admin_password: customAdmin, test_password: customTest },
      });

    const adminOk = await request(app)
      .post('/api/db/rpc/admin_create_session')
      .send({ p_phone: '010-3878-6740', p_admin_password: customAdmin });
    expect(adminOk.status).toBe(200);
    expect(typeof adminOk.body.data).toBe('string');

    const testOk = await request(app)
      .post('/api/db/rpc/test_verify_password')
      .send({ p_test_password: customTest });
    expect(testOk.status).toBe(200);
    expect(typeof testOk.body.data).toBe('string');
  });

  it('admin_update_settings는 heart_drain_enabled를 항상 false로 유지한다', async () => {
    await request(app)
      .post('/api/db/rpc/admin_update_settings')
      .send({
        p_admin_password: '116606',
        p_payload: { heart_drain_enabled: true, heart_drain_minutes: 3 },
      });

    const res = await op({ op: 'select', table: 'app_settings' });
    expect(res.status).toBe(200);
    expect(res.body.data[0]?.heart_drain_enabled).toBe(false);
  });

  it('admin_drain_unused_hearts RPC는 비활성화된다', async () => {
    const login = await request(app)
      .post('/api/db/rpc/admin_create_session')
      .send({ p_phone: '010-3878-6740', p_admin_password: 'custom-admin-pw-xyz' });
    expect(login.status).toBe(200);

    const res = await request(app)
      .post('/api/db/rpc/admin_drain_unused_hearts')
      .send({
        p_admin_password: 'custom-admin-pw-xyz',
        adminToken: login.body.data,
        p_drain_count: 1,
      });
    expect(res.status).toBe(403);
    expect(res.body.error?.message).toContain('비활성화');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// /auth/login — deviceSecret 不一致は再バインドせず 401
// ════════════════════════════════════════════════════════════════════════════════

describe('[Security] /auth/login — device secret 再バインド禁止', () => {
  it('別の deviceSecret で既存アカウントにログインしようとすると 401', async () => {
    const userId = randomUUID();

    // 1. プロフィール作成 (store に挿入)
    await op({
      op: 'insert',
      table: 'profiles',
      payload: { id: userId, nickname: 'test-user' },
    });

    // 2. 最初の deviceSecret でログイン (first-claim → 成功)
    const firstLogin = await request(app)
      .post('/api/db/auth/login')
      .set('Content-Type', 'application/json')
      .send({ userId, deviceSecret: 'original-secret-aaa' });
    expect(firstLogin.status).toBe(200);
    expect(firstLogin.body.ok).toBe(true);

    // 3. 別の deviceSecret で再ログイン → 再バインドせず 401
    const attackerLogin = await request(app)
      .post('/api/db/auth/login')
      .set('Content-Type', 'application/json')
      .send({ userId, deviceSecret: 'attacker-secret-bbb' });
    expect(attackerLogin.status).toBe(401);
    expect(attackerLogin.body.code).toBe('DEVICE_MISMATCH');
  });

  it('同じ deviceSecret での再ログインは 200 (正常フロー)', async () => {
    const userId = randomUUID();

    await op({
      op: 'insert',
      table: 'profiles',
      payload: { id: userId, nickname: 'test-user-2' },
    });

    // first-claim
    await request(app)
      .post('/api/db/auth/login')
      .set('Content-Type', 'application/json')
      .send({ userId, deviceSecret: 'my-secret-xyz' });

    // 同じ secret で再ログイン → 成功
    const reLogin = await request(app)
      .post('/api/db/auth/login')
      .set('Content-Type', 'application/json')
      .send({ userId, deviceSecret: 'my-secret-xyz' });
    expect(reLogin.status).toBe(200);
    expect(reLogin.body.ok).toBe(true);
  });
});

function listenApp(): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function readSseUntil(port: number, path: string, predicate: (buf: string) => boolean, timeoutMs = 4000): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = '';
    const req = http.get({
      hostname: '127.0.0.1',
      port,
      path,
      headers: { Accept: 'text/event-stream' },
    }, (res) => {
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        buf += chunk;
        if (predicate(buf)) {
          req.destroy();
          resolve(buf);
        }
      });
    });
    req.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ECONNRESET') return;
      reject(err);
    });
    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error(`SSE timeout. got: ${buf.slice(0, 800)}`));
    }, timeoutMs);
    req.on('close', () => clearTimeout(timer));
  });
}

describe('[Realtime] 인증 SSE 채팅 전달', () => {
  it('상대가 INSERT한 메시지를 인증 SSE로 실시간 수신한다', async () => {
    const a = randomUUID();
    const b = randomUUID();
    const agentA = await loginAgent(a);
    const agentB = await loginAgent(b);

    const chatRes = await agentA
      .post('/api/db/op')
      .set('Content-Type', 'application/json')
      .send({
        op: 'insert',
        table: 'chats',
        requesterId: a,
        payload: { user1_id: a, user2_id: b },
        selectAfterWrite: true,
        single: true,
      });
    expect(chatRes.status).toBe(200);
    const chatId = chatRes.body.data.id as string;

    const tokenRes = await agentB.post('/api/db/auth/sse-token');
    expect(tokenRes.status).toBe(200);
    const token = tokenRes.body.token as string;

    const marker = `hello-from-a-${chatId.slice(0, 8)}`;
    const server = await listenApp();
    const { port } = server.address() as AddressInfo;
    try {
      const path = `/api/db/events?userId=${encodeURIComponent(b)}&token=${encodeURIComponent(token)}`;
      await new Promise<void>((resolve, reject) => {
        let buf = '';
        let inserted = false;
        const req = http.get({
          hostname: '127.0.0.1',
          port,
          path,
          headers: { Accept: 'text/event-stream' },
        }, (res) => {
          res.setEncoding('utf8');
          res.on('data', (chunk: string) => {
            buf += chunk;
            if (!inserted && buf.includes('"type":"ping"')) {
              inserted = true;
              void agentA
                .post('/api/db/op')
                .set('Content-Type', 'application/json')
                .send({
                  op: 'insert',
                  table: 'messages',
                  requesterId: a,
                  payload: {
                    chat_id: chatId,
                    sender_id: a,
                    content: marker,
                    client_id: randomUUID(),
                  },
                  selectAfterWrite: true,
                  single: true,
                })
                .then((r) => {
                  if (r.status !== 200) {
                    req.destroy();
                    reject(new Error(`insert failed ${r.status}`));
                  }
                });
            }
            if (buf.includes(marker)) {
              req.destroy();
              resolve();
            }
          });
        });
        req.on('error', (err) => {
          if ((err as NodeJS.ErrnoException).code === 'ECONNRESET') return;
          reject(err);
        });
        const timer = setTimeout(() => {
          req.destroy();
          reject(new Error(`SSE timeout. got: ${buf.slice(0, 800)}`));
        }, 4000);
        req.on('close', () => clearTimeout(timer));
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('A가 만든 채팅방을 B가 SELECT와 SSE로 모두 수신한다', async () => {
    const a = randomUUID();
    const b = randomUUID();
    const agentA = await loginAgent(a);
    const agentB = await loginAgent(b);

    const tokenRes = await agentB.post('/api/db/auth/sse-token');
    expect(tokenRes.status).toBe(200);
    const token = tokenRes.body.token as string;

    const server = await listenApp();
    const { port } = server.address() as AddressInfo;
    try {
      const path = `/api/db/events?userId=${encodeURIComponent(b)}&token=${encodeURIComponent(token)}`;
      let chatId = '';
      await new Promise<void>((resolve, reject) => {
        let buf = '';
        let inserted = false;
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          req.destroy();
          resolve();
        };
        const req = http.get({
          hostname: '127.0.0.1',
          port,
          path,
          headers: { Accept: 'text/event-stream' },
        }, (res) => {
          res.setEncoding('utf8');
          res.on('data', (chunk: string) => {
            buf += chunk;
            if (!inserted && buf.includes('"type":"ping"')) {
              inserted = true;
              void agentA
                .post('/api/db/op')
                .set('Content-Type', 'application/json')
                .send({
                  op: 'insert',
                  table: 'chats',
                  requesterId: a,
                  payload: { user1_id: a, user2_id: b },
                  selectAfterWrite: true,
                  single: true,
                })
                .then((r) => {
                  if (r.status !== 200 || !r.body.data?.id) {
                    if (!done) {
                      done = true;
                      req.destroy();
                      reject(new Error(`chat insert failed ${r.status}`));
                    }
                    return;
                  }
                  chatId = r.body.data.id as string;
                  if (buf.includes(chatId) && buf.includes('"table":"chats"')) finish();
                });
            }
            if (chatId && buf.includes(chatId) && buf.includes('"table":"chats"') && buf.includes('"INSERT"')) {
              finish();
            }
          });
        });
        req.on('error', (err) => {
          if ((err as NodeJS.ErrnoException).code === 'ECONNRESET') return;
          reject(err);
        });
        const timer = setTimeout(() => {
          req.destroy();
          reject(new Error(`chat SSE timeout. got: ${buf.slice(0, 800)}`));
        }, 4000);
        req.on('close', () => clearTimeout(timer));
      });

      const listB = await agentB
        .post('/api/db/op')
        .set('Content-Type', 'application/json')
        .send({
          op: 'select',
          table: 'chats',
          requesterId: b,
          filters: [{ type: 'or', expr: `user1_id.eq.${b},user2_id.eq.${b}` }],
        });
      expect(listB.status).toBe(200);
      expect(Array.isArray(listB.body.data)).toBe(true);
      expect(listB.body.data.some((c: { id: string }) => c.id === chatId)).toBe(true);

      const marker = `pair-${chatId.slice(0, 8)}`;
      const msgRes = await agentA
        .post('/api/db/op')
        .set('Content-Type', 'application/json')
        .send({
          op: 'insert',
          table: 'messages',
          requesterId: a,
          payload: { chat_id: chatId, sender_id: a, content: marker, client_id: randomUUID() },
          selectAfterWrite: true,
          single: true,
        });
      expect(msgRes.status).toBe(200);

      const msgsB = await agentB
        .post('/api/db/op')
        .set('Content-Type', 'application/json')
        .send({
          op: 'select',
          table: 'messages',
          requesterId: b,
          filters: [{ type: 'eq', col: 'chat_id', val: chatId }],
        });
      expect(msgsB.status).toBe(200);
      expect((msgsB.body.data as { content: string }[]).some((m) => m.content === marker)).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('lastEventId 쿼리로 링버퍼 미수신 메시지를 재전송한다', async () => {
    const a = randomUUID();
    const b = randomUUID();
    const agentA = await loginAgent(a);
    const agentB = await loginAgent(b);

    const chatRes = await agentA
      .post('/api/db/op')
      .set('Content-Type', 'application/json')
      .send({
        op: 'insert',
        table: 'chats',
        requesterId: a,
        payload: { user1_id: a, user2_id: b },
        selectAfterWrite: true,
        single: true,
      });
    expect(chatRes.status).toBe(200);
    const chatId = chatRes.body.data.id as string;

    const marker = `replay-${chatId.slice(0, 8)}`;
    const insertRes = await agentA
      .post('/api/db/op')
      .set('Content-Type', 'application/json')
      .send({
        op: 'insert',
        table: 'messages',
        requesterId: a,
        payload: {
          chat_id: chatId,
          sender_id: a,
          content: marker,
          client_id: randomUUID(),
        },
        selectAfterWrite: true,
        single: true,
      });
    expect(insertRes.status).toBe(200);

    const tokenRes = await agentB.post('/api/db/auth/sse-token');
    expect(tokenRes.status).toBe(200);
    const token = tokenRes.body.token as string;

    const server = await listenApp();
    const { port } = server.address() as AddressInfo;
    try {
      const path = `/api/db/events?userId=${encodeURIComponent(b)}&token=${encodeURIComponent(token)}&lastEventId=1`;
      const stream = await readSseUntil(port, path, (buf) => buf.includes(marker));
      expect(stream).toContain(marker);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
