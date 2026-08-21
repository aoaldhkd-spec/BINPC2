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

describe('[Security] private /op tables and relationship ownership', () => {
  it.each(['app_kv_rows', 'device_secrets', 'push_subscriptions'])(
    '%s는 generic /op SELECT/INSERT 모두 400으로 차단한다',
    async (table) => {
      const read = await op({ op: 'select', table, requesterId: randomUUID() });
      expect(read.status).toBe(400);
      expect(read.body.error?.code).toBe('INVALID_TABLE');

      const write = await op({
        op: 'insert',
        table,
        requesterId: randomUUID(),
        payload: { id: randomUUID(), secret: 'must-not-be-stored' },
      });
      expect(write.status).toBe(400);
      expect(write.body.error?.code).toBe('INVALID_TABLE');
    },
  );

  it('push 구독 전용 endpoint는 유효한 소유자 토큰이 없으면 401이다', async () => {
    const res = await request(app)
      .post('/api/db/push/subscribe')
      .send({
        userId: randomUUID(),
        subscription: {
          endpoint: 'https://push.example.test/subscription',
          keys: { auth: 'auth-key', p256dh: 'p256dh-key' },
        },
      });
    expect(res.status).toBe(401);
  });

  it('production에서 세션 없이 requesterId만 주장하면 관계 조회도 401이다', async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await op({
        op: 'select',
        table: 'blocked_users',
        requesterId: randomUUID(),
      });
      expect(res.status).toBe(401);
      expect(res.body.error?.code).toBe('UNAUTHORIZED');
    } finally {
      if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNodeEnv;
    }
  });

  it('blocked_users는 관계 당사자만 읽고 작성자만 수정·삭제하며 user_id를 강제한다', async () => {
    const owner = randomUUID();
    const target = randomUUID();
    const outsider = randomUUID();
    const inserted = await op({
      op: 'insert',
      table: 'blocked_users',
      requesterId: owner,
      payload: {
        id: randomUUID(),
        user_id: outsider,
        target_id: target,
        block_type: 'block',
      },
      selectAfterWrite: true,
      single: true,
    });
    expect(inserted.status).toBe(200);
    expect(inserted.body.data.user_id).toBe(owner);
    const rowId = inserted.body.data.id as string;

    const idCollision = await op({
      op: 'insert',
      table: 'blocked_users',
      requesterId: target,
      payload: { id: rowId, user_id: target, target_id: owner, block_type: 'hide' },
    });
    expect(idCollision.status).toBe(403);
    expect(idCollision.body.error?.code).toBe('FORBIDDEN');

    const unauthenticated = await op({ op: 'select', table: 'blocked_users' });
    expect(unauthenticated.status).toBe(403);
    expect(unauthenticated.body.error?.code).toBe('FORBIDDEN');

    const asTarget = await op({ op: 'select', table: 'blocked_users', requesterId: target });
    expect(asTarget.status).toBe(200);
    expect(asTarget.body.data.some((row: { id: string }) => row.id === rowId)).toBe(true);

    const asOutsider = await op({ op: 'select', table: 'blocked_users', requesterId: outsider });
    expect(asOutsider.status).toBe(200);
    expect(asOutsider.body.data.some((row: { id: string }) => row.id === rowId)).toBe(false);

    const stolenUpdate = await op({
      op: 'update',
      table: 'blocked_users',
      requesterId: target,
      filters: [{ type: 'eq', col: 'id', val: rowId }],
      payload: { block_type: 'hide' },
    });
    expect(stolenUpdate.status).toBe(403);
    expect(stolenUpdate.body.error?.code).toBe('FORBIDDEN');

    const stolenDelete = await op({
      op: 'delete',
      table: 'blocked_users',
      requesterId: target,
      filters: [{ type: 'eq', col: 'id', val: rowId }],
    });
    expect(stolenDelete.status).toBe(403);
    expect(stolenDelete.body.error?.code).toBe('FORBIDDEN');
  });

  it('blocked_users는 대상 누락·자기 차단을 400으로 거부한다', async () => {
    const owner = randomUUID();
    const missingTarget = await op({
      op: 'insert',
      table: 'blocked_users',
      requesterId: owner,
      payload: { block_type: 'block' },
    });
    expect(missingTarget.status).toBe(400);
    expect(missingTarget.body.error?.code).toBe('INVALID_INPUT');

    const selfBlock = await op({
      op: 'insert',
      table: 'blocked_users',
      requesterId: owner,
      payload: { target_id: owner, block_type: 'block' },
    });
    expect(selfBlock.status).toBe(400);
    expect(selfBlock.body.error?.code).toBe('INVALID_INPUT');
  });

  it('contact_shares/events는 발신자를 강제하고 당사자 조회·작성자 변경만 허용한다', async () => {
    const sharer = randomUUID();
    const recipient = randomUUID();
    const outsider = randomUUID();
    await op({ op: 'insert', table: 'profiles', payload: { id: sharer, nickname: `cs-${sharer}` } });
    await op({ op: 'insert', table: 'profiles', payload: { id: recipient, nickname: `cr-${recipient}` } });
    await op({ op: 'insert', table: 'profiles', payload: { id: outsider, nickname: `co-${outsider}` } });

    const share = await op({
      op: 'upsert',
      table: 'contact_shares',
      requesterId: sharer,
      payload: {
        id: randomUUID(),
        liker_id: recipient,
        liked_id: outsider,
        kakao: 'safe-kakao',
      },
      conflictCols: ['liker_id', 'liked_id'],
      selectAfterWrite: true,
    });
    expect(share.status).toBe(200);
    expect(share.body.data[0].liked_id).toBe(sharer);
    const shareId = share.body.data[0].id as string;

    const event = await op({
      op: 'insert',
      table: 'contact_share_events',
      requesterId: sharer,
      payload: {
        id: randomUUID(),
        from_user_id: outsider,
        to_user_id: recipient,
        event_type: 'accepted',
      },
      selectAfterWrite: true,
      single: true,
    });
    expect(event.status).toBe(200);
    expect(event.body.data.from_user_id).toBe(sharer);
    const eventId = event.body.data.id as string;

    const conflictTakeover = await op({
      op: 'upsert',
      table: 'contact_shares',
      requesterId: outsider,
      payload: { liker_id: recipient, liked_id: outsider, kakao: 'forged' },
      conflictCols: ['liker_id'],
    });
    expect(conflictTakeover.status).toBe(403);
    expect(conflictTakeover.body.error?.code).toBe('FORBIDDEN');

    const eventIdCollision = await op({
      op: 'insert',
      table: 'contact_share_events',
      requesterId: outsider,
      payload: {
        id: eventId,
        from_user_id: outsider,
        to_user_id: recipient,
        event_type: 'rejected',
      },
    });
    expect(eventIdCollision.status).toBe(403);
    expect(eventIdCollision.body.error?.code).toBe('FORBIDDEN');

    const noEventAuth = await op({ op: 'select', table: 'contact_share_events' });
    expect(noEventAuth.status).toBe(403);
    expect(noEventAuth.body.error?.code).toBe('FORBIDDEN');

    const recipientShares = await op({
      op: 'select',
      table: 'contact_shares',
      requesterId: recipient,
      filters: [{ type: 'eq', col: 'liker_id', val: recipient }],
    });
    expect(recipientShares.body.data.some((row: { id: string }) => row.id === shareId)).toBe(true);
    const recipientEvents = await op({ op: 'select', table: 'contact_share_events', requesterId: recipient });
    expect(recipientEvents.body.data.some((row: { id: string }) => row.id === eventId)).toBe(true);

    const outsiderShares = await op({ op: 'select', table: 'contact_shares', requesterId: outsider });
    expect(outsiderShares.body.data.every((row: Record<string, unknown>) =>
      Object.keys(row).length === 1 && 'created_at' in row,
    )).toBe(true);
    expect(outsiderShares.body.data.length).toBeGreaterThanOrEqual(1);
    const outsiderEvents = await op({ op: 'select', table: 'contact_share_events', requesterId: outsider });
    expect(outsiderEvents.body.data.some((row: { id: string }) => row.id === eventId)).toBe(false);

    const stolenShareUpdate = await op({
      op: 'update',
      table: 'contact_shares',
      requesterId: recipient,
      filters: [{ type: 'eq', col: 'id', val: shareId }],
      payload: { phone: 'forged' },
    });
    expect(stolenShareUpdate.status).toBe(403);
    expect(stolenShareUpdate.body.error?.code).toBe('FORBIDDEN');

    const stolenEventDelete = await op({
      op: 'delete',
      table: 'contact_share_events',
      requesterId: recipient,
      filters: [{ type: 'eq', col: 'id', val: eventId }],
    });
    expect(stolenEventDelete.status).toBe(403);
    expect(stolenEventDelete.body.error?.code).toBe('FORBIDDEN');
  });

  it('contact_shares/events는 상대 ID 누락을 400으로 거부한다', async () => {
    const requesterId = randomUUID();
    const share = await op({
      op: 'upsert',
      table: 'contact_shares',
      requesterId,
      payload: { kakao: 'missing-recipient' },
    });
    expect(share.status).toBe(400);
    expect(share.body.error?.code).toBe('INVALID_INPUT');

    const event = await op({
      op: 'insert',
      table: 'contact_share_events',
      requesterId,
      payload: { event_type: 'accepted' },
    });
    expect(event.status).toBe(400);
    expect(event.body.error?.code).toBe('INVALID_INPUT');
  });

  it('관리자·테스트 토큰은 관계 테이블 감사 조회를 유지한다', async () => {
    const owner = randomUUID();
    const target = randomUUID();
    const seeded = await op({
      op: 'insert',
      table: 'blocked_users',
      requesterId: owner,
      payload: { id: randomUUID(), target_id: target, block_type: 'block' },
      selectAfterWrite: true,
      single: true,
    });
    const rowId = seeded.body.data.id as string;

    const adminLogin = await request(app)
      .post('/api/db/rpc/admin_create_session')
      .send({ p_admin_password: '116606' });
    expect(adminLogin.status).toBe(200);
    const adminRead = await op({
      op: 'select',
      table: 'blocked_users',
      adminToken: adminLogin.body.data,
    });
    expect(adminRead.status).toBe(200);
    expect(adminRead.body.data.some((row: { id: string }) => row.id === rowId)).toBe(true);

    const testLogin = await request(app)
      .post('/api/db/rpc/test_verify_password')
      .send({ p_test_password: '116606' });
    expect(testLogin.status).toBe(200);
    const testRead = await op({
      op: 'select',
      table: 'blocked_users',
      testToken: testLogin.body.data,
    });
    expect(testRead.status).toBe(200);
    expect(testRead.body.data.some((row: { id: string }) => row.id === rowId)).toBe(true);
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

  it('하트 전체 조회 시 liker_id를 숨기고 본인 보낸/받은 하트 조회만 liker_id를 노출한다', async () => {
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

    // 수신자 무필터/랭킹 덤프 — liker_id 숨김
    const allRes = await op({
      op: 'select',
      table: 'likes',
      requesterId: likedId,
    });
    expect(allRes.status).toBe(200);
    expect(allRes.body.data[0]?.liker_id).toBeUndefined();
    expect(allRes.body.data[0]?.liked_id).toBe(likedId);

    // 제3자 무필터 랭킹 덤프 — liker_id 숨김
    const rankingRes = await op({
      op: 'select',
      table: 'likes',
      requesterId: randomUUID(),
    });
    expect(rankingRes.status).toBe(200);
    expect(rankingRes.body.data[0]?.liker_id).toBeUndefined();
    expect(rankingRes.body.data[0]?.liked_id).toBe(likedId);

    // 수신함: liked_id === requesterId — liker_id 필수
    const inboxRes = await op({
      op: 'select',
      table: 'likes',
      requesterId: likedId,
      filters: [{ type: 'eq', col: 'liked_id', val: likedId }],
    });
    expect(inboxRes.status).toBe(200);
    expect(inboxRes.body.data[0]?.liker_id).toBe(likerId);

    // 본인 발신: liker_id === requesterId — liker_id 유지
    const ownRes = await op({
      op: 'select',
      table: 'likes',
      requesterId: likerId,
      filters: [{ type: 'eq', col: 'liker_id', val: likerId }],
    });
    expect(ownRes.status).toBe(200);
    expect(ownRes.body.data[0]?.liker_id).toBe(likerId);
  });

  it('방문자 전체 조회 시 viewer_id를 숨기고 내 프로필 방문자 조회만 viewer_id를 노출한다', async () => {
    const viewerId = randomUUID();
    const viewedId = randomUUID();
    await op({
      op: 'insert',
      table: 'profiles',
      payload: { id: viewerId, nickname: 'viewer-a' },
    });
    await op({
      op: 'insert',
      table: 'profiles',
      payload: { id: viewedId, nickname: 'viewed-b' },
    });
    await op({
      op: 'insert',
      table: 'profile_views',
      requesterId: viewerId,
      payload: { viewer_id: viewerId, viewed_id: viewedId, viewed_at: new Date().toISOString() },
    });

    const allRes = await op({
      op: 'select',
      table: 'profile_views',
      requesterId: viewedId,
    });
    expect(allRes.status).toBe(200);
    expect(allRes.body.data[0]?.viewer_id).toBeUndefined();
    expect(allRes.body.data[0]?.viewed_id).toBe(viewedId);

    const inboxRes = await op({
      op: 'select',
      table: 'profile_views',
      requesterId: viewedId,
      filters: [{ type: 'eq', col: 'viewed_id', val: viewedId }],
    });
    expect(inboxRes.status).toBe(200);
    expect(inboxRes.body.data[0]?.viewer_id).toBe(viewerId);

    const ownRes = await op({
      op: 'select',
      table: 'profile_views',
      requesterId: viewerId,
      filters: [{ type: 'eq', col: 'viewer_id', val: viewerId }],
    });
    expect(ownRes.status).toBe(200);
    expect(ownRes.body.data[0]?.viewer_id).toBe(viewerId);
  });

  it('profile_views INSERT는 requesterId 없이 403, viewer_id는 세션 사용자로 강제한다', async () => {
    const viewerId = randomUUID();
    const viewedId = randomUUID();
    const spoofId = randomUUID();
    await op({
      op: 'insert',
      table: 'profiles',
      payload: { id: viewerId, nickname: 'viewer-force' },
    });
    await op({
      op: 'insert',
      table: 'profiles',
      payload: { id: viewedId, nickname: 'viewed-force' },
    });

    const noAuth = await op({
      op: 'insert',
      table: 'profile_views',
      payload: { viewer_id: viewerId, viewed_id: viewedId },
    });
    expect(noAuth.status).toBe(403);

    const spoof = await op({
      op: 'insert',
      table: 'profile_views',
      requesterId: viewerId,
      payload: { viewer_id: spoofId, viewed_id: viewedId, viewed_at: new Date().toISOString() },
      selectAfterWrite: true,
      single: true,
    });
    expect(spoof.status).toBe(200);
    expect(spoof.body.data?.viewer_id).toBe(viewerId);
    expect(spoof.body.data?.viewed_id).toBe(viewedId);
  });

  it('하트를 받지 않은 사용자의 status UPDATE를 차단한다', async () => {
    const likerId = randomUUID();
    const likedId = randomUUID();
    await op({ op: 'insert', table: 'profiles', payload: { id: likerId, nickname: `ul-${likerId}` } });
    await op({ op: 'insert', table: 'profiles', payload: { id: likedId, nickname: `ud-${likedId}` } });
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

  it('인증되지 않은 이미지 업로드는 차단하고, 프로필 사진 조회는 공개한다', async () => {
    const upload = await request(app)
      .post('/api/db/storage-upload')
      .send({ path: 'profile-photos/anonymous', dataUrl: 'data:image/jpeg;base64,/9j/' });
    expect(upload.status).toBe(401);

    const read = await request(app)
      .get('/api/db/storage-image?p=profile-photos%2Fanonymous');
    expect(read.status).toBe(404);
  });

  it('storage-upload는 sessionToken만으로도 인증된다 (Netlify 쿠키 단절 대비)', async () => {
    const ownerId = randomUUID();
    await op({
      op: 'insert',
      table: 'profiles',
      payload: { id: ownerId, nickname: `tok-${ownerId.slice(0, 8)}` },
    });
    const login = await request(app)
      .post('/api/db/auth/login')
      .set('Content-Type', 'application/json')
      .send({ userId: ownerId, deviceSecret: `secret-${ownerId}` });
    expect(login.status).toBe(200);
    const sessionToken = login.body.sessionToken as string;
    expect(sessionToken).toBeTruthy();

    const path = `profile-photos/${ownerId}`;
    const dataUrl = 'data:image/jpeg;base64,/9j/4AAQ';
    const upload = await request(app)
      .post('/api/db/storage-upload')
      .send({ path, dataUrl, requesterId: ownerId, sessionToken });
    expect(upload.status).toBe(200);
  });

  it('채팅 이미지 GET은 sessionToken query로 인증된다 (img 태그 / Netlify 쿠키 단절)', async () => {
    const aId = randomUUID();
    const bId = randomUUID();
    const strangerId = randomUUID();
    for (const id of [aId, bId, strangerId]) {
      await op({
        op: 'insert',
        table: 'profiles',
        payload: { id, nickname: `img-${id.slice(0, 8)}` },
      });
    }
    const [u1, u2] = [aId, bId].sort();
    const chat = await op({
      op: 'insert',
      table: 'chats',
      requesterId: aId,
      single: true,
      selectAfterWrite: true,
      payload: { user1_id: u1, user2_id: u2 },
    });
    const chatId = chat.body.data?.id as string;
    expect(chatId).toBeTruthy();

    const loginA = await request(app)
      .post('/api/db/auth/login')
      .send({ userId: aId, deviceSecret: `secret-${aId}` });
    const loginB = await request(app)
      .post('/api/db/auth/login')
      .send({ userId: bId, deviceSecret: `secret-${bId}` });
    const loginS = await request(app)
      .post('/api/db/auth/login')
      .send({ userId: strangerId, deviceSecret: `secret-${strangerId}` });
    const tokenA = loginA.body.sessionToken as string;
    const tokenB = loginB.body.sessionToken as string;
    const tokenS = loginS.body.sessionToken as string;

    const path = `${chatId}/${aId}/${randomUUID()}.jpg`;
    const dataUrl = `data:image/jpeg;base64,${Buffer.from([0xFF, 0xD8, 0xFF, 0xD9]).toString('base64')}`;
    const upload = await request(app)
      .post('/api/db/storage-upload')
      .send({ path, dataUrl, requesterId: aId, sessionToken: tokenA });
    expect(upload.status).toBe(200);

    const bare = await request(app).get(`/api/db/storage-image?p=${encodeURIComponent(path)}`);
    expect(bare.status).toBe(401);

    const peer = await request(app).get(
      `/api/db/storage-image?p=${encodeURIComponent(path)}&userId=${encodeURIComponent(bId)}&sessionToken=${encodeURIComponent(tokenB)}`,
    );
    expect(peer.status).toBe(200);
    expect(peer.headers['content-type']).toMatch(/image\/jpeg/);

    const stranger = await request(app).get(
      `/api/db/storage-image?p=${encodeURIComponent(path)}&userId=${encodeURIComponent(strangerId)}&sessionToken=${encodeURIComponent(tokenS)}`,
    );
    expect(stranger.status).toBe(403);
  });

  it('프로필 업로드 MIME과 magic bytes를 JPEG/PNG/WebP/GIF로 제한한다', async () => {
    const ownerId = randomUUID();
    const owner = await loginAgent(ownerId);
    const path = `profile-photos/${ownerId}`;
    const imageFixtures = [
      { mime: 'image/jpeg', bytes: [0xFF, 0xD8, 0xFF] },
      { mime: 'image/png', bytes: [0x89, 0x50, 0x4E, 0x47] },
      { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
      {
        mime: 'image/webp',
        bytes: [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
      },
    ];

    for (const fixture of imageFixtures) {
      const dataUrl = `data:${fixture.mime};base64,${Buffer.from(fixture.bytes).toString('base64')}`;
      const upload = await owner.post('/api/db/storage-upload').send({ path, dataUrl });
      expect(upload.status, fixture.mime).toBe(200);
    }

    const disguisedWebp = await owner.post('/api/db/storage-upload').send({
      path,
      dataUrl: `data:image/webp;base64,${Buffer.from('RIFFnot-NOPE').toString('base64')}`,
    });
    expect(disguisedWebp.status).toBe(400);

    const heic = await owner.post('/api/db/storage-upload').send({
      path,
      dataUrl: `data:image/heic;base64,${Buffer.from('heic').toString('base64')}`,
    });
    expect(heic.status).toBe(400);
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

describe('[Security] legacy removed-feature tables stay blocked on /op', () => {
  it.each(['seats', 'seating', 'heart_balances', 'suggestions', 'seat_assignments'])(
    '%s table returns 400 INVALID_TABLE',
    async (table) => {
      const res = await op({ op: 'select', table, requesterId: randomUUID() });
      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('INVALID_TABLE');
    },
  );
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
    expect(res.body.data === false || res.body.data == null).toBe(true);
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

  it('admin_update_settings가 빈 test_password 패치로 비밀번호를 지우지 않는다', async () => {
    const customAdmin = 'custom-admin-pw-xyz';
    const customTest = 'keep-this-test-pw-99';
    await request(app)
      .post('/api/db/rpc/admin_update_settings')
      .send({
        p_admin_password: customAdmin,
        p_payload: { test_password: customTest },
      });

    await request(app)
      .post('/api/db/rpc/admin_update_settings')
      .send({
        p_admin_password: customAdmin,
        p_payload: { test_password: null },
      });

    const testOk = await request(app)
      .post('/api/db/rpc/test_verify_password')
      .send({ p_test_password: customTest });
    expect(testOk.status).toBe(200);
  });

  it('production에서는 공개된 공장 기본 비밀번호를 거부하고 DB 비밀번호만 허용한다', async () => {
    const prevAdmin = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    const prevTest = process.env.BOOTSTRAP_TEST_PASSWORD;
    const prevNodeEnv = process.env.NODE_ENV;
    delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
    delete process.env.BOOTSTRAP_TEST_PASSWORD;
    try {
      const setCustom = await request(app)
        .post('/api/db/rpc/admin_update_settings')
        .send({
          p_admin_password: '116606',
          p_payload: {
            admin_password: 'custom-admin-pw-xyz',
            test_password: 'custom-test-pw-abc',
            reset_password: 'custom-reset-pw',
          },
        });
      expect(setCustom.status).toBe(200);

      process.env.NODE_ENV = 'production';

      const defaultAdmin = await request(app)
        .post('/api/db/rpc/admin_create_session')
        .send({ p_phone: '010-3878-6740', p_admin_password: '116606' });
      expect(defaultAdmin.status).toBe(403);

      const defaultTest = await request(app)
        .post('/api/db/rpc/test_verify_password')
        .send({ p_test_password: '116606' });
      expect(defaultTest.status).toBe(403);

      const defaultReset = await request(app)
        .post('/api/db/rpc/verify_panel_password')
        .send({ p_kind: 'reset', p_password: '116606' });
      expect(defaultReset.status).toBe(401);

      const customAdmin = await request(app)
        .post('/api/db/rpc/admin_create_session')
        .send({ p_phone: '010-3878-6740', p_admin_password: 'custom-admin-pw-xyz' });
      expect(customAdmin.status).toBe(200);

      const customTest = await request(app)
        .post('/api/db/rpc/test_verify_password')
        .send({ p_test_password: 'custom-test-pw-abc' });
      expect(customTest.status).toBe(200);

      const customReset = await request(app)
        .post('/api/db/rpc/verify_panel_password')
        .send({ p_kind: 'reset', p_password: 'custom-reset-pw' });
      expect(customReset.status).toBe(200);
      expect(customReset.body.data?.ok).toBe(true);
    } finally {
      if (prevNodeEnv !== undefined) process.env.NODE_ENV = prevNodeEnv;
      else delete process.env.NODE_ENV;
      if (prevAdmin !== undefined) process.env.BOOTSTRAP_ADMIN_PASSWORD = prevAdmin;
      else delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
      if (prevTest !== undefined) process.env.BOOTSTRAP_TEST_PASSWORD = prevTest;
      else delete process.env.BOOTSTRAP_TEST_PASSWORD;
    }
  });

  it('패널에서 저장한 비밀번호가 로그인에 쓰이고 응답에 원문을 넣지 않는다', async () => {
    const customAdmin = 'panel-kv-login-admin-1';
    const customTest = 'panel-kv-login-test-1';
    const customReset = 'panel-kv-login-reset-1';
    const saved = await request(app)
      .post('/api/db/rpc/admin_update_settings')
      .send({
        p_admin_password: '116606',
        p_payload: { admin_password: customAdmin, test_password: customTest, reset_password: customReset },
      });
    expect(saved.status).toBe(200);
    expect(saved.body.data?.admin_password).toBeUndefined();
    expect(saved.body.data?.test_password).toBeUndefined();
    expect(saved.body.data?.reset_password).toBeUndefined();
    expect(saved.body.data?.admin_password_set).toBe(true);
    expect(saved.body.data?.test_password_set).toBe(true);
    expect(saved.body.data?.reset_password_set).toBe(true);

    const adminOk = await request(app)
      .post('/api/db/rpc/admin_create_session')
      .send({ p_phone: '010-3878-6740', p_admin_password: customAdmin });
    expect(adminOk.status).toBe(200);
    expect(typeof adminOk.body.data).toBe('string');

    const toggle = await request(app)
      .post('/api/db/rpc/admin_toggle_session')
      .send({ p_admin_password: customAdmin, p_active: true });
    expect(toggle.status).toBe(200);

    const stillOk = await request(app)
      .post('/api/db/rpc/admin_create_session')
      .send({ p_phone: '010-3878-6740', p_admin_password: customAdmin });
    expect(stillOk.status).toBe(200);

    const testOk = await request(app)
      .post('/api/db/rpc/test_verify_password')
      .send({ p_test_password: customTest });
    expect(testOk.status).toBe(200);

    const resetOk = await request(app)
      .post('/api/db/rpc/verify_panel_password')
      .send({ p_kind: 'reset', p_password: customReset });
    expect(resetOk.status).toBe(200);
    expect(resetOk.body.data?.ok).toBe(true);
  });

  it('BOOTSTRAP_ADMIN_PASSWORD와 BOOTSTRAP_TEST_PASSWORD로도 로그인된다', async () => {
    const prevAdmin = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    const prevTest = process.env.BOOTSTRAP_TEST_PASSWORD;
    process.env.BOOTSTRAP_ADMIN_PASSWORD = 'env-admin-secret-zz';
    process.env.BOOTSTRAP_TEST_PASSWORD = 'env-test-secret-zz';
    try {
      const adminOk = await request(app)
        .post('/api/db/rpc/admin_create_session')
        .send({ p_phone: '010-3878-6740', p_admin_password: 'env-admin-secret-zz' });
      expect(adminOk.status).toBe(200);
      expect(typeof adminOk.body.data).toBe('string');

      const testOk = await request(app)
        .post('/api/db/rpc/test_verify_password')
        .send({ p_test_password: 'env-test-secret-zz' });
      expect(testOk.status).toBe(200);
      expect(typeof testOk.body.data).toBe('string');
    } finally {
      process.env.BOOTSTRAP_ADMIN_PASSWORD = prevAdmin;
      process.env.BOOTSTRAP_TEST_PASSWORD = prevTest;
    }
  });

  it('하트 차감 RPC는 더 이상 존재하지 않는다', async () => {
    const res = await request(app)
      .post('/api/db/rpc/admin_drain_unused_hearts')
      .send({ p_admin_password: '116606', p_drain_count: 1 });
    expect(res.status).toBe(404);
  });

  it('admin_update_settings가 레거시 seating/heart-drain 키를 저장하지 않는다', async () => {
    const res = await request(app)
      .post('/api/db/rpc/admin_update_settings')
      .send({
        p_admin_password: '116606',
        p_payload: {
          heart_drain_enabled: true,
          heart_drain_minutes: 15,
          seating_locked: true,
          seats_snapshot: { leftover: true },
          timer_label: 'legacy-strip',
        },
      });
    expect(res.status).toBe(200);
    const row = res.body.data as Record<string, unknown>;
    expect(row.timer_label).toBe('legacy-strip');
    expect(row.heart_drain_enabled).toBeUndefined();
    expect(row.heart_drain_minutes).toBeUndefined();
    expect(row.seating_locked).toBeUndefined();
    expect(row.seats_snapshot).toBeUndefined();
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

    await request(app)
      .post('/api/db/auth/login')
      .set('Content-Type', 'application/json')
      .send({ userId, deviceSecret: 'my-secret-xyz' });

    const reLogin = await request(app)
      .post('/api/db/auth/login')
      .set('Content-Type', 'application/json')
      .send({ userId, deviceSecret: 'my-secret-xyz' });
    expect(reLogin.status).toBe(200);
    expect(reLogin.body.ok).toBe(true);
  });

  it('PIN으로 새 기기 device re-bind 허용', async () => {
    const userId = randomUUID();

    await op({
      op: 'insert',
      table: 'profiles',
      payload: { id: userId, nickname: 'pin-user', pin_code: '4321' },
    });

    await request(app)
      .post('/api/db/auth/login')
      .set('Content-Type', 'application/json')
      .send({ userId, deviceSecret: 'original-secret-aaa' });

    const wrongDevice = await request(app)
      .post('/api/db/auth/login')
      .set('Content-Type', 'application/json')
      .send({ userId, deviceSecret: 'new-phone-secret-bbb' });
    expect(wrongDevice.status).toBe(401);
    expect(wrongDevice.body.code).toBe('DEVICE_MISMATCH');

    const pinRecover = await request(app)
      .post('/api/db/auth/login')
      .set('Content-Type', 'application/json')
      .send({ userId, deviceSecret: 'new-phone-secret-bbb', pinCode: '4321' });
    expect(pinRecover.status).toBe(200);
    expect(pinRecover.body.ok).toBe(true);
  });

  it('profiles UPSERT 신규 행에 PIN을 부여한다', async () => {
    const nick = `up-${randomUUID().slice(0, 8)}`;
    const res = await op({
      op: 'upsert',
      table: 'profiles',
      payload: { nickname: nick, bio: 'dummy' },
      conflictCols: ['nickname'],
      selectAfterWrite: true,
    });
    expect(res.status).toBe(200);
    const row = Array.isArray(res.body.data) ? res.body.data[0] : res.body.data;
    expect(row?.nickname).toBe(nick);
    expect(String(row?.pin_code ?? '')).toMatch(/^\d{4,5}$/);
  });

  it('테스트 토큰으로 다른 기기에서 dummy 로그인을 허용한다', async () => {
    const userId = randomUUID();
    await op({
      op: 'insert',
      table: 'profiles',
      payload: { id: userId, nickname: `tok-${userId.slice(0, 6)}` },
    });
    await request(app)
      .post('/api/db/auth/login')
      .set('Content-Type', 'application/json')
      .send({ userId, deviceSecret: 'original-secret-aaa' });

    const testLogin = await request(app)
      .post('/api/db/rpc/test_verify_password')
      .send({ p_test_password: '116606' });
    expect(testLogin.status).toBe(200);
    const testToken = testLogin.body.data as string;

    const impersonate = await request(app)
      .post('/api/db/auth/login')
      .set('Content-Type', 'application/json')
      .send({ userId, deviceSecret: 'test-dashboard-secret', testToken });
    expect(impersonate.status).toBe(200);
    expect(impersonate.body.ok).toBe(true);
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

describe('[Security] test_update_settings SSE must not leak panel passwords', () => {
  it('세션 토글 SSE에 admin/test/reset 비밀번호가 없다', async () => {
    const customAdmin = 'sse-admin-secret-do-not-leak';
    const customTest = 'sse-test-secret-do-not-leak';
    const customReset = 'sse-reset-secret-do-not-leak';
    const setPw = await request(app)
      .post('/api/db/rpc/admin_update_settings')
      .send({
        p_admin_password: '116606',
        p_payload: {
          admin_password: customAdmin,
          test_password: customTest,
          reset_password: customReset,
        },
      });
    expect(setPw.status).toBe(200);

    const userId = randomUUID();
    const agent = await loginAgent(userId);
    const tokenRes = await agent.post('/api/db/auth/sse-token');
    expect(tokenRes.status).toBe(200);
    const token = tokenRes.body.token as string;

    const server = await listenApp();
    const { port } = server.address() as AddressInfo;
    try {
      const path = `/api/db/events?userId=${encodeURIComponent(userId)}&token=${encodeURIComponent(token)}`;
      const buf = await new Promise<string>((resolve, reject) => {
        let acc = '';
        let toggled = false;
        const req = http.get({
          hostname: '127.0.0.1',
          port,
          path,
          headers: { Accept: 'text/event-stream' },
        }, (res) => {
          res.setEncoding('utf8');
          res.on('data', (chunk: string) => {
            acc += chunk;
            if (!toggled && acc.includes('"type":"ping"')) {
              toggled = true;
              void request(app)
                .post('/api/db/rpc/test_update_settings')
                .send({ p_test_password: customTest, p_payload: { session_active: true } })
                .then((rpcRes) => {
                  if (rpcRes.status !== 200) {
                    req.destroy();
                    reject(new Error(`test_update_settings ${rpcRes.status}`));
                  }
                })
                .catch((e) => {
                  req.destroy();
                  reject(e);
                });
            }
            if (acc.includes('"table":"app_settings"') && acc.includes('session_active')) {
              req.destroy();
              resolve(acc);
            }
          });
        });
        req.on('error', (err) => {
          if ((err as NodeJS.ErrnoException).code === 'ECONNRESET') return;
          reject(err);
        });
        setTimeout(() => {
          req.destroy();
          reject(new Error(`SSE settings leak timeout. got: ${acc.slice(0, 800)}`));
        }, 6000);
      });
      expect(buf).toContain('"table":"app_settings"');
      expect(buf).not.toContain(customAdmin);
      expect(buf).not.toContain(customTest);
      expect(buf).not.toContain(customReset);
      expect(buf).not.toContain('"admin_password"');
      expect(buf).not.toContain('"test_password"');
      expect(buf).not.toContain('"reset_password"');
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});

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

describe('[Security] DELETE IDOR + ready secrets', () => {
  it('chats DELETE — 비참여자는 403', async () => {
    const a = randomUUID();
    const b = randomUUID();
    const c = randomUUID();
    const agentA = await loginAgent(a);
    const agentC = await loginAgent(c);

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

    const del = await agentC
      .post('/api/db/op')
      .set('Content-Type', 'application/json')
      .send({
        op: 'delete',
        table: 'chats',
        requesterId: c,
        filters: [{ type: 'eq', col: 'id', val: chatId }],
      });
    expect(del.status).toBe(403);
    expect(del.body.error?.code).toBe('FORBIDDEN');
  });

  it('/ready 응답에 reset_password 가 없다', async () => {
    const res = await request(app).get('/api/db/ready');
    expect(res.status).toBe(200);
    expect(res.body.settings?.reset_password).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(res.body.settings ?? {}, 'reset_password')).toBe(false);
    expect(res.body.legacy_leftovers).toEqual(expect.objectContaining({
      kv_tables: expect.any(Number),
      settings_rows: expect.any(Number),
      history_rows: expect.any(Number),
    }));
    expect(JSON.stringify(res.body)).not.toMatch(/admin_password|test_password|reset_password/);
  });
});

describe('[Longevity] expired SSE token is 401 JSON, not an open EventSource stream', () => {
  it('서명 유효·만료된 토큰은 SSE_TOKEN_EXPIRED 이고 event-stream 이 아니다', async () => {
    const userId = randomUUID();
    const token = makeSseToken(userId, TEST_SSE_SECRET, -4000);
    const res = await request(app)
      .get(`/api/db/events?userId=${encodeURIComponent(userId)}&token=${encodeURIComponent(token)}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SSE_TOKEN_EXPIRED');
    expect(String(res.headers['content-type'] ?? '')).not.toMatch(/text\/event-stream/);
  });

  it('위조 토큰은 SSE_TOKEN_INVALID', async () => {
    const userId = randomUUID();
    const res = await request(app)
      .get(`/api/db/events?userId=${encodeURIComponent(userId)}&token=${encodeURIComponent('999:deadbeef')}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SSE_TOKEN_INVALID');
  });
});

describe('[Security] chat_reads partner receipt + 1:1 isolation', () => {
  it('같은 방 상대의 read_at 은 조회되고, 제3자에게는 숨겨진다', async () => {
    const a = randomUUID();
    const b = randomUUID();
    const c = randomUUID();
    await op({ op: 'insert', table: 'profiles', payload: { id: a, nickname: `ra-${a}` } });
    await op({ op: 'insert', table: 'profiles', payload: { id: b, nickname: `rb-${b}` } });
    await op({ op: 'insert', table: 'profiles', payload: { id: c, nickname: `rc-${c}` } });

    const chatRes = await op({
      op: 'insert',
      table: 'chats',
      requesterId: a,
      payload: { user1_id: a, user2_id: b },
      selectAfterWrite: true,
      single: true,
    });
    expect(chatRes.status).toBe(200);
    const chatId = chatRes.body.data.id as string;
    expect(chatId).toBeTruthy();

    const readAt = '2026-08-16T00:00:00.000Z';
    const upsert = await op({
      op: 'upsert',
      table: 'chat_reads',
      requesterId: b,
      payload: { id: `${chatId}__${b}`, chat_id: chatId, reader_id: b, read_at: readAt },
      selectAfterWrite: true,
    });
    expect(upsert.status).toBe(200);

    const asPartner = await op({
      op: 'select',
      table: 'chat_reads',
      requesterId: a,
      filters: [
        { type: 'eq', col: 'chat_id', val: chatId },
        { type: 'eq', col: 'reader_id', val: b },
      ],
      maybeSingle: true,
    });
    expect(asPartner.status).toBe(200);
    expect(asPartner.body.data?.reader_id).toBe(b);
    expect(typeof asPartner.body.data?.read_at).toBe('string');
    expect(String(asPartner.body.data?.read_at).length).toBeGreaterThan(0);

    const asOutsider = await op({
      op: 'select',
      table: 'chat_reads',
      requesterId: c,
      filters: [
        { type: 'eq', col: 'chat_id', val: chatId },
        { type: 'eq', col: 'reader_id', val: b },
      ],
      maybeSingle: true,
    });
    expect(asOutsider.status).toBe(200);
    expect(asOutsider.body.data).toBeNull();
  });

  it('비참여자의 chat_reads UPSERT 는 403', async () => {
    const a = randomUUID();
    const b = randomUUID();
    const c = randomUUID();
    const chatRes = await op({
      op: 'insert',
      table: 'chats',
      requesterId: a,
      payload: { user1_id: a, user2_id: b },
      selectAfterWrite: true,
      single: true,
    });
    const chatId = chatRes.body.data.id as string;
    const res = await op({
      op: 'upsert',
      table: 'chat_reads',
      requesterId: c,
      payload: { id: `${chatId}__${c}`, chat_id: chatId, reader_id: c, read_at: new Date().toISOString() },
    });
    expect(res.status).toBe(403);
  });

  it('1:1 메시지 INSERT 는 참여자만 가능하고 상대 SELECT 에 나타난다', async () => {
    const a = randomUUID();
    const b = randomUUID();
    const c = randomUUID();
    const chatRes = await op({
      op: 'insert',
      table: 'chats',
      requesterId: a,
      payload: { user1_id: a, user2_id: b },
      selectAfterWrite: true,
      single: true,
    });
    expect(chatRes.status).toBe(200);
    const chatId = chatRes.body.data.id as string;

    const sent = await op({
      op: 'insert',
      table: 'messages',
      requesterId: a,
      payload: { chat_id: chatId, sender_id: a, content: 'hello-b', client_id: randomUUID() },
      selectAfterWrite: true,
      single: true,
    });
    expect(sent.status).toBe(200);
    expect(sent.body.data?.chat_id).toBe(chatId);
    expect(sent.body.data?.content).toBe('hello-b');

    const asB = await op({
      op: 'select',
      table: 'messages',
      requesterId: b,
      filters: [{ type: 'eq', col: 'chat_id', val: chatId }],
    });
    expect(asB.status).toBe(200);
    expect(asB.body.data.some((m: { content: string }) => m.content === 'hello-b')).toBe(true);

    const asC = await op({
      op: 'select',
      table: 'messages',
      requesterId: c,
      filters: [{ type: 'eq', col: 'chat_id', val: chatId }],
    });
    expect(asC.status).toBe(403);
  });

  it('같은 두 사람이 방을 여러 번·역순으로 열어도 채팅방은 1개이고 상대도 메시지를 본다', async () => {
    const a = randomUUID();
    const b = randomUUID();
    const first = await op({
      op: 'insert',
      table: 'chats',
      requesterId: a,
      payload: { user1_id: a, user2_id: b },
      selectAfterWrite: true,
      single: true,
    });
    expect(first.status).toBe(200);
    const chatId = first.body.data.id as string;

    const reversed = await op({
      op: 'insert',
      table: 'chats',
      requesterId: b,
      payload: { user1_id: b, user2_id: a },
      selectAfterWrite: true,
      single: true,
    });
    expect(reversed.status).toBe(200);
    expect(reversed.body.data.id).toBe(chatId);

    const again = await op({
      op: 'insert',
      table: 'chats',
      requesterId: a,
      payload: { user1_id: a, user2_id: b },
      selectAfterWrite: true,
      single: true,
    });
    expect(again.body.data.id).toBe(chatId);

    const listA = await op({ op: 'select', table: 'chats', requesterId: a });
    const listB = await op({ op: 'select', table: 'chats', requesterId: b });
    const roomsA = (listA.body.data as { id: string; user1_id: string; user2_id: string }[])
      .filter(c => [c.user1_id, c.user2_id].includes(a) && [c.user1_id, c.user2_id].includes(b));
    const roomsB = (listB.body.data as { id: string; user1_id: string; user2_id: string }[])
      .filter(c => [c.user1_id, c.user2_id].includes(a) && [c.user1_id, c.user2_id].includes(b));
    expect(roomsA).toHaveLength(1);
    expect(roomsB).toHaveLength(1);
    expect(roomsA[0].id).toBe(chatId);
    expect(roomsB[0].id).toBe(chatId);

    const sent = await op({
      op: 'insert',
      table: 'messages',
      requesterId: a,
      payload: { chat_id: chatId, sender_id: a, content: 'pair-one-room', client_id: randomUUID() },
      selectAfterWrite: true,
      single: true,
    });
    expect(sent.status).toBe(200);

    const asB = await op({
      op: 'select',
      table: 'messages',
      requesterId: b,
      filters: [{ type: 'eq', col: 'chat_id', val: chatId }],
    });
    expect(asB.status).toBe(200);
    expect(asB.body.data.some((m: { content: string }) => m.content === 'pair-one-room')).toBe(true);

    const reply = await op({
      op: 'insert',
      table: 'messages',
      requesterId: b,
      payload: { chat_id: chatId, sender_id: b, content: 'seen-by-a', client_id: randomUUID() },
      selectAfterWrite: true,
      single: true,
    });
    expect(reply.status).toBe(200);

    const asA = await op({
      op: 'select',
      table: 'messages',
      requesterId: a,
      filters: [{ type: 'eq', col: 'chat_id', val: chatId }],
    });
    expect(asA.body.data.some((m: { content: string }) => m.content === 'seen-by-a')).toBe(true);
    expect(asA.body.data.some((m: { content: string }) => m.content === 'pair-one-room')).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 단체 채팅 — 클릭 입장 · 사람당 최대 4방 · 방 인원 제한 없음 · IDOR
// ════════════════════════════════════════════════════════════════════════════════

describe('[Security] group chats auto 2 + opt-in 2차', () => {
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

  it('프로필 INSERT 시 년생·N대 두 방만 자동 입장하고 관심사·2차는 넣지 않음', async () => {
    const uid = `g-auto2-${randomUUID()}`;
    const created = await op({
      op: 'insert',
      table: 'profiles',
      payload: {
        id: uid,
        nickname: `na-${uid.replace(/-/g, '').slice(0, 12)}`,
        bio: '등산, 영화',
        mbti: 'ENFP',
        birth_year: 1998,
      },
      requesterId: uid,
    });
    expect(created.status).toBe(200);

    const parts = await op({
      op: 'select',
      table: 'group_participants',
      requesterId: uid,
      filters: [{ type: 'eq', col: 'user_id', val: uid }],
    });
    expect(parts.status).toBe(200);
    const rows = Array.isArray(parts.body.data) ? parts.body.data : (parts.body.data ? [parts.body.data] : []);
    expect(rows).toHaveLength(2);

    const groupIds = rows.map((r: { group_id: string }) => r.group_id);
    const rooms = await op({
      op: 'select',
      table: 'group_chats',
      requesterId: uid,
    });
    const mine = (Array.isArray(rooms.body.data) ? rooms.body.data : [])
      .filter((g: { id: string }) => groupIds.includes(g.id));
    const kinds = mine.map((g: { room_kind?: string; name?: string }) => String(g.room_kind ?? ''));
    expect(kinds.sort()).toEqual(['age_decade', 'birth_year']);
    expect(mine.some((g: { name?: string }) => String(g.name ?? '') === '20대 모임')).toBe(true);
    expect(mine.some((g: { name?: string }) => String(g.name ?? '') === '1998년생 모임')).toBe(true);
    expect(mine.some((g: { name?: string }) => String(g.name ?? '').includes('2차'))).toBe(false);
    expect(mine.every((g: { name?: string }) => /^(?:\d{4}년생 모임|\d+대 모임)$/.test(String(g.name ?? '')))).toBe(true);
    expect(mine.some((g: { name?: string }) => String(g.name ?? '').includes('등산') || String(g.name ?? '').includes('영화'))).toBe(false);
  });

  it('97년생(한국식 30세)은 30대 모임에 자동 입장한다', async () => {
    const uid = `g-kage97-${randomUUID()}`;
    const created = await op({
      op: 'insert',
      table: 'profiles',
      payload: {
        id: uid,
        nickname: `k97-${uid.replace(/-/g, '').slice(0, 12)}`,
        bio: '영화',
        mbti: 'ENFP',
        birth_year: 1997,
      },
      requesterId: uid,
    });
    expect(created.status).toBe(200);

    const parts = await op({
      op: 'select',
      table: 'group_participants',
      requesterId: uid,
      filters: [{ type: 'eq', col: 'user_id', val: uid }],
    });
    expect(parts.status).toBe(200);
    const rows = Array.isArray(parts.body.data) ? parts.body.data : (parts.body.data ? [parts.body.data] : []);
    expect(rows).toHaveLength(2);

    const groupIds = rows.map((r: { group_id: string }) => r.group_id);
    const rooms = await op({
      op: 'select',
      table: 'group_chats',
      requesterId: uid,
    });
    const mine = (Array.isArray(rooms.body.data) ? rooms.body.data : [])
      .filter((g: { id: string }) => groupIds.includes(g.id));
    expect(mine.some((g: { name?: string }) => String(g.name ?? '') === '30대 모임')).toBe(true);
    expect(mine.some((g: { name?: string }) => String(g.name ?? '') === '1997년생 모임')).toBe(true);
    expect(mine.some((g: { name?: string }) => String(g.name ?? '') === '20대 모임')).toBe(false);
  });

  it('N대 모임은 시드되어 목록에 있고 관심사 이름 방은 자동 입장되지 않는다', async () => {
    const leftoverId = `legacy-photo-${randomUUID()}`;
    const leftover = await op({
      op: 'insert',
      table: 'group_chats',
      payload: {
        id: leftoverId,
        name: '30대 사진찍기 모임',
        interest_tag: '사진찍기',
        age_group: '30대',
        max_members: 999999,
        room_kind: 'interest_age',
      },
      requesterId: 'seed-admin',
      selectAfterWrite: true,
      single: true,
    });
    expect(leftover.status).toBe(200);

    const rooms = await op({
      op: 'select',
      table: 'group_chats',
      requesterId: `seed-cat-${randomUUID()}`,
    });
    expect(rooms.status).toBe(200);
    const list = Array.isArray(rooms.body.data) ? rooms.body.data : [];
    const names = list.map((g: { name?: string }) => String(g.name ?? ''));
    const visible = list
      .filter((g: { hidden?: boolean; merged_into?: string | null }) => !g.hidden && !g.merged_into)
      .map((g: { name?: string }) => String(g.name ?? ''));
    expect(names).toContain('20대 모임');
    expect(names).toContain('30대 모임');
    expect(names).toContain('30대 사진찍기 모임');
    expect(visible).not.toContain('10대 모임');
    expect(visible).not.toContain('40대 모임');
    expect(visible).not.toContain('50대 모임');
    expect(visible).not.toContain('60대 모임');
    expect(visible).not.toContain('70대 모임');

    const uid = `g-nolegacy-${randomUUID()}`;
    const created = await op({
      op: 'insert',
      table: 'profiles',
      payload: {
        id: uid,
        nickname: `nl-${uid.replace(/-/g, '').slice(0, 12)}`,
        bio: '사진찍기',
        mbti: 'ISFP',
        birth_year: 1995,
      },
      requesterId: uid,
    });
    expect(created.status).toBe(200);
    const parts = await op({
      op: 'select',
      table: 'group_participants',
      requesterId: uid,
      filters: [{ type: 'eq', col: 'user_id', val: uid }],
    });
    const rows = Array.isArray(parts.body.data) ? parts.body.data : [];
    const groupIds = rows.map((r: { group_id: string }) => r.group_id);
    expect(groupIds).not.toContain(leftoverId);
    const mineFromSelect = await op({
      op: 'select',
      table: 'group_chats',
      requesterId: uid,
    });
    const all = Array.isArray(mineFromSelect.body.data) ? mineFromSelect.body.data : [];
    const joined = all.filter((g: { id: string }) => groupIds.includes(g.id));
    expect(joined.some((g: { name?: string }) => String(g.name ?? '') === '30대 모임')).toBe(true);
    expect(joined.some((g: { name?: string }) => String(g.name ?? '') === '1995년생 모임')).toBe(true);
    expect(joined.some((g: { name?: string }) => String(g.name ?? '').includes('사진'))).toBe(false);
  });

  it('40대 이상은 30대 모임에 들어가고 10대/40대 방은 만들지 않는다', async () => {
    const uid = `g-age40-${randomUUID()}`;
    const created = await op({
      op: 'insert',
      table: 'profiles',
      payload: {
        id: uid,
        nickname: `a4-${uid.replace(/-/g, '').slice(0, 12)}`,
        bio: '영화',
        mbti: 'INFJ',
        birth_year: 1980,
      },
      requesterId: uid,
    });
    expect(created.status).toBe(200);
    const parts = await op({
      op: 'select',
      table: 'group_participants',
      requesterId: uid,
      filters: [{ type: 'eq', col: 'user_id', val: uid }],
    });
    const rows = Array.isArray(parts.body.data) ? parts.body.data : [];
    const groupIds = rows.map((r: { group_id: string }) => r.group_id);
    const rooms = await op({
      op: 'select',
      table: 'group_chats',
      requesterId: uid,
    });
    const all = Array.isArray(rooms.body.data) ? rooms.body.data : [];
    const joined = all.filter((g: { id: string }) => groupIds.includes(g.id));
    expect(joined.some((g: { name?: string }) => String(g.name ?? '') === '30대 모임')).toBe(true);
    expect(joined.some((g: { name?: string }) => String(g.name ?? '') === '1980년생 모임')).toBe(true);
    expect(joined.some((g: { name?: string }) => String(g.name ?? '') === '40대 모임')).toBe(false);
    expect(joined.some((g: { name?: string }) => String(g.name ?? '') === '10대 모임')).toBe(false);
    const visible = all
      .filter((g: { hidden?: boolean; merged_into?: string | null }) => !g.hidden && !g.merged_into)
      .map((g: { name?: string }) => String(g.name ?? ''));
    expect(visible).not.toContain('10대 모임');
    expect(visible).not.toContain('50대 모임');
  });

  it('남아 있는 10대/40대 방은 숨기지 않고 삭제한다', async () => {
    const leftoverUser = `g-retired-mem-${randomUUID()}`;
    const teenId = `group_age_10_${randomUUID()}`;
    const fortyId = `group_age_40_${randomUUID()}`;
    const teen = await op({
      op: 'insert',
      table: 'group_chats',
      payload: {
        id: teenId,
        name: '10대 모임',
        interest_tag: '10대',
        age_group: '10대',
        max_members: 999999,
        room_kind: 'age_decade',
        hidden: true,
      },
      requesterId: 'seed-admin',
      selectAfterWrite: true,
      single: true,
    });
    expect(teen.status).toBe(200);
    const forty = await op({
      op: 'insert',
      table: 'group_chats',
      payload: {
        id: fortyId,
        name: '40대 모임',
        interest_tag: '40대',
        age_group: '40대',
        max_members: 999999,
        room_kind: 'age_decade',
        hidden: false,
      },
      requesterId: 'seed-admin',
      selectAfterWrite: true,
      single: true,
    });
    expect(forty.status).toBe(200);

    const joinTeen = await op({
      op: 'insert',
      table: 'group_participants',
      requesterId: leftoverUser,
      payload: { group_id: teenId, user_id: leftoverUser },
    });
    expect(joinTeen.status).toBe(200);
    const teenMsg = await op({
      op: 'insert',
      table: 'group_messages',
      requesterId: leftoverUser,
      payload: { group_id: teenId, sender_id: leftoverUser, content: 'leftover-teen-msg' },
    });
    expect(teenMsg.status).toBe(200);

    const uid = `g-purge-age-${randomUUID()}`;
    const created = await op({
      op: 'insert',
      table: 'profiles',
      payload: {
        id: uid,
        nickname: `pg-${uid.replace(/-/g, '').slice(0, 12)}`,
        bio: '영화',
        mbti: 'ENFP',
        birth_year: 1998,
      },
      requesterId: uid,
    });
    expect(created.status).toBe(200);

    const rooms = await op({
      op: 'select',
      table: 'group_chats',
      requesterId: uid,
    });
    expect(rooms.status).toBe(200);
    const list = Array.isArray(rooms.body.data) ? rooms.body.data : [];
    const names = list.map((g: { name?: string }) => String(g.name ?? ''));
    const ids = list.map((g: { id?: string }) => String(g.id ?? ''));
    expect(names).not.toContain('10대 모임');
    expect(names).not.toContain('40대 모임');
    expect(ids).not.toContain(teenId);
    expect(ids).not.toContain(fortyId);
    expect(list.some((g: { name?: string; hidden?: boolean }) => String(g.name ?? '') === '10대 모임' && g.hidden === true)).toBe(false);
    expect(names).toContain('20대 모임');
    expect(names).toContain('30대 모임');
    expect(names).toContain('1998년생 모임');

    const leftoverParts = await op({
      op: 'select',
      table: 'group_participants',
      requesterId: leftoverUser,
      filters: [{ type: 'eq', col: 'user_id', val: leftoverUser }],
    });
    const leftoverRows = Array.isArray(leftoverParts.body.data) ? leftoverParts.body.data : [];
    expect(leftoverRows.some((p: { group_id?: string }) => String(p.group_id) === teenId)).toBe(false);

    const leftoverMsgs = await op({
      op: 'select',
      table: 'group_messages',
      requesterId: leftoverUser,
      filters: [{ type: 'eq', col: 'group_id', val: teenId }],
    });
    const leftoverMsgRows = Array.isArray(leftoverMsgs.body.data) ? leftoverMsgs.body.data : [];
    expect(leftoverMsgRows).toHaveLength(0);
  });

  it('생년이 없으면 기타 모임을 만들지 않는다', async () => {
    const uid = `g-noyear-${randomUUID()}`;
    const created = await op({
      op: 'insert',
      table: 'profiles',
      payload: {
        id: uid,
        nickname: `ny-${uid.replace(/-/g, '').slice(0, 12)}`,
        bio: '영화',
        mbti: 'INTP',
      },
      requesterId: uid,
    });
    expect(created.status).toBe(200);
    const parts = await op({
      op: 'select',
      table: 'group_participants',
      requesterId: uid,
      filters: [{ type: 'eq', col: 'user_id', val: uid }],
    });
    const rows = Array.isArray(parts.body.data) ? parts.body.data : [];
    expect(rows).toHaveLength(0);
    const rooms = await op({
      op: 'select',
      table: 'group_chats',
      requesterId: uid,
    });
    const list = Array.isArray(rooms.body.data) ? rooms.body.data : [];
    expect(list.some((g: { name?: string }) => String(g.name ?? '').includes('기타'))).toBe(false);
  });

  it('group_participants INSERT 는 사람당 최대 4개 방 (방 정원 아님)', async () => {
    const uid = `g-max4-${randomUUID()}`;
    const ids = await Promise.all([
      seedGroup(`g4a-${uid}`, '방A'),
      seedGroup(`g4b-${uid}`, '방B'),
      seedGroup(`g4c-${uid}`, '방C'),
      seedGroup(`g4d-${uid}`, '방D'),
      seedGroup(`g4e-${uid}`, '방E'),
    ]);

    for (let i = 0; i < 4; i++) {
      const join = await op({
        op: 'insert',
        table: 'group_participants',
        requesterId: uid,
        payload: { group_id: ids[i], user_id: uid },
        selectAfterWrite: true,
        single: true,
      });
      expect(join.status).toBe(200);
      expect(join.body.error).toBeNull();
    }

    const fifth = await op({
      op: 'insert',
      table: 'group_participants',
      requesterId: uid,
      payload: { group_id: ids[4], user_id: uid },
    });
    expect(fifth.status).toBe(400);
    expect(fifth.body.error?.code).toBe('GROUP_LIMIT');
    expect(fifth.body.error?.message).toMatch(/최대 4개/);
  });

  it('비참여자 group_messages INSERT 는 403', async () => {
    const member = `g-mem-${randomUUID()}`;
    const stranger = `g-str-${randomUUID()}`;
    const gid = `g-msg-${randomUUID()}`;
    await seedGroup(gid, '메시지방');

    const join = await op({
      op: 'insert',
      table: 'group_participants',
      requesterId: member,
      payload: { group_id: gid, user_id: member },
    });
    expect(join.status).toBe(200);

    const blocked = await op({
      op: 'insert',
      table: 'group_messages',
      requesterId: stranger,
      payload: { group_id: gid, sender_id: stranger, content: 'nope', client_id: randomUUID() },
    });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error?.code).toBe('FORBIDDEN');

    const ok = await op({
      op: 'insert',
      table: 'group_messages',
      requesterId: member,
      payload: { group_id: gid, sender_id: member, content: 'hello-group', client_id: randomUUID() },
      selectAfterWrite: true,
      single: true,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.data?.content).toBe('hello-group');

    const leaked = await op({
      op: 'select',
      table: 'group_messages',
      requesterId: stranger,
      filters: [{ type: 'eq', col: 'group_id', val: gid }],
    });
    expect(leaked.status).toBe(200);
    const leakedRows = Array.isArray(leaked.body.data) ? leaked.body.data : [];
    expect(leakedRows).toHaveLength(0);
  });

  it('한 방에 9명도 입장 가능 (방 인원 상한 없음)', async () => {
    const gid = `g-crowd-${randomUUID()}`;
    await seedGroup(gid, '만원방');
    for (let i = 0; i < 9; i++) {
      const uid = `crowd-${i}-${gid.slice(0, 8)}`;
      const join = await op({
        op: 'insert',
        table: 'group_participants',
        requesterId: uid,
        payload: { group_id: gid, user_id: uid },
      });
      expect(join.status).toBe(200);
    }
  });

  it('group_participants last_read_at 는 본인만 갱신 가능', async () => {
    const a = `g-read-a-${randomUUID()}`;
    const b = `g-read-b-${randomUUID()}`;
    const gid = `g-read-${randomUUID()}`;
    await seedGroup(gid, '읽음방');
    expect((await op({
      op: 'insert', table: 'group_participants', requesterId: a,
      payload: { group_id: gid, user_id: a },
    })).status).toBe(200);
    expect((await op({
      op: 'insert', table: 'group_participants', requesterId: b,
      payload: { group_id: gid, user_id: b },
    })).status).toBe(200);

    const mine = await op({
      op: 'update',
      table: 'group_participants',
      requesterId: a,
      payload: { last_read_at: '2026-08-16T03:00:00.000Z' },
      filters: [
        { type: 'eq', col: 'group_id', val: gid },
        { type: 'eq', col: 'user_id', val: a },
      ],
    });
    expect(mine.status).toBe(200);

    const stolen = await op({
      op: 'update',
      table: 'group_participants',
      requesterId: a,
      payload: { last_read_at: '2026-08-16T04:00:00.000Z' },
      filters: [
        { type: 'eq', col: 'group_id', val: gid },
        { type: 'eq', col: 'user_id', val: b },
      ],
    });
    expect(stolen.status).toBe(403);
  });

  it('나가기 후 같은 방에 다시 입장할 수 있음', async () => {
    const uid = `g-rejoin-${randomUUID()}`;
    const gid = `g-rejoin-room-${randomUUID()}`;
    await seedGroup(gid, '재입장방');

    const join1 = await op({
      op: 'insert',
      table: 'group_participants',
      requesterId: uid,
      payload: { group_id: gid, user_id: uid },
    });
    expect(join1.status).toBe(200);

    const leave = await op({
      op: 'delete',
      table: 'group_participants',
      requesterId: uid,
      filters: [
        { type: 'eq', col: 'group_id', val: gid },
        { type: 'eq', col: 'user_id', val: uid },
      ],
    });
    expect(leave.status).toBe(200);

    const join2 = await op({
      op: 'insert',
      table: 'group_participants',
      requesterId: uid,
      payload: { group_id: gid, user_id: uid },
    });
    expect(join2.status).toBe(200);
  });

  it('년생·N대 자동 입장 후에도 2차 술과 2차 클럽을 둘 다 입장할 수 있다', async () => {
    const uid = `g-bothap-${randomUUID()}`;
    const leftoverId = `legacy-photo-${uid}`;
    expect((await op({
      op: 'insert',
      table: 'group_chats',
      payload: {
        id: leftoverId,
        name: '20대 사진찍기 모임',
        interest_tag: '사진찍기',
        age_group: '20대',
        max_members: 999999,
        room_kind: 'interest_age',
      },
      requesterId: 'seed-admin',
    })).status).toBe(200);

    const created = await op({
      op: 'insert',
      table: 'profiles',
      payload: {
        id: uid,
        nickname: `ba-${uid.replace(/-/g, '').slice(0, 12)}`,
        bio: '영화',
        mbti: 'ENFP',
        birth_year: 1998,
      },
      requesterId: uid,
    });
    expect(created.status).toBe(200);

    expect((await op({
      op: 'insert',
      table: 'group_participants',
      requesterId: uid,
      payload: { group_id: leftoverId, user_id: uid },
    })).status).toBe(200);

    const drink = await op({
      op: 'insert',
      table: 'group_participants',
      requesterId: uid,
      payload: { group_id: 'group_afterparty_drink', user_id: uid },
    });
    expect(drink.status).toBe(200);
    expect(drink.body.error).toBeNull();

    const club = await op({
      op: 'insert',
      table: 'group_participants',
      requesterId: uid,
      payload: { group_id: 'group_afterparty_club', user_id: uid },
    });
    expect(club.status).toBe(200);
    expect(club.body.error).toBeNull();
  });

  it('자동 방에서 나가면 프로필 저장 후에도 다시 넣지 않는다', async () => {
    const uid = `g-nrejoin-${randomUUID()}`;
    const created = await op({
      op: 'insert',
      table: 'profiles',
      payload: {
        id: uid,
        nickname: `nr-${uid.replace(/-/g, '').slice(0, 12)}`,
        bio: '등산',
        mbti: 'INFP',
        birth_year: 1995,
      },
      requesterId: uid,
    });
    expect(created.status).toBe(200);

    const parts1 = await op({
      op: 'select',
      table: 'group_participants',
      requesterId: uid,
      filters: [{ type: 'eq', col: 'user_id', val: uid }],
    });
    const rows1 = Array.isArray(parts1.body.data) ? parts1.body.data : [];
    expect(rows1).toHaveLength(2);
    const leaveId = String(rows1[0].group_id);

    const leave = await op({
      op: 'delete',
      table: 'group_participants',
      requesterId: uid,
      filters: [
        { type: 'eq', col: 'group_id', val: leaveId },
        { type: 'eq', col: 'user_id', val: uid },
      ],
    });
    expect(leave.status).toBe(200);

    const updated = await op({
      op: 'update',
      table: 'profiles',
      requesterId: uid,
      filters: [{ type: 'eq', col: 'id', val: uid }],
      payload: { bio: '등산, 영화' },
    });
    expect(updated.status).toBe(200);

    const parts2 = await op({
      op: 'select',
      table: 'group_participants',
      requesterId: uid,
      filters: [{ type: 'eq', col: 'user_id', val: uid }],
    });
    const rows2 = Array.isArray(parts2.body.data) ? parts2.body.data : [];
    expect(rows2).toHaveLength(1);
    expect(rows2.some((r: { group_id: string }) => String(r.group_id) === leaveId)).toBe(false);
  });

  it('년생 방에서 나가면 참가자 SELECT 해도 다시 넣지 않는다', async () => {
    const uid = `g-nrejoin-sel-${randomUUID()}`;
    const created = await op({
      op: 'insert',
      table: 'profiles',
      payload: {
        id: uid,
        nickname: `ns-${uid.replace(/-/g, '').slice(0, 12)}`,
        bio: '영화',
        mbti: 'INFP',
        birth_year: 1995,
      },
      requesterId: uid,
    });
    expect(created.status).toBe(200);

    const rooms = await op({ op: 'select', table: 'group_chats', requesterId: uid });
    const yearRoom = (Array.isArray(rooms.body.data) ? rooms.body.data : [])
      .find((g: { name?: string }) => String(g.name) === '1995년생 모임');
    expect(yearRoom?.id).toBeTruthy();
    const leaveId = String(yearRoom.id);

    const leave = await op({
      op: 'delete',
      table: 'group_participants',
      requesterId: uid,
      filters: [
        { type: 'eq', col: 'group_id', val: leaveId },
        { type: 'eq', col: 'user_id', val: uid },
      ],
    });
    expect(leave.status).toBe(200);

    const parts2 = await op({
      op: 'select',
      table: 'group_participants',
      requesterId: uid,
      filters: [{ type: 'eq', col: 'user_id', val: uid }],
    });
    const rows2 = Array.isArray(parts2.body.data) ? parts2.body.data : [];
    expect(rows2.some((r: { group_id: string }) => String(r.group_id) === leaveId)).toBe(false);
    expect(rows2).toHaveLength(1);
  });

  it('2차 클럽 나가기는 숨은 중복 방 참여까지 지운다', async () => {
    const uid = `g-clubdup-${randomUUID()}`;
    expect((await op({
      op: 'insert',
      table: 'profiles',
      payload: {
        id: uid,
        nickname: `cd-${uid.replace(/-/g, '').slice(0, 12)}`,
        bio: '영화',
        mbti: 'ENFP',
        birth_year: 1998,
      },
      requesterId: uid,
    })).status).toBe(200);

    const dupId = `dup-club-${uid}`;
    expect((await op({
      op: 'insert',
      table: 'group_chats',
      payload: {
        id: dupId,
        name: '2차 클럽 갈 분',
        interest_tag: '2차클럽',
        room_kind: 'afterparty_club',
        max_members: 999999,
      },
      requesterId: 'seed-admin',
    })).status).toBe(200);

    const joined = await op({
      op: 'insert',
      table: 'group_participants',
      requesterId: uid,
      payload: { group_id: dupId, user_id: uid },
    });
    expect(joined.status).toBe(200);

    const leave = await op({
      op: 'delete',
      table: 'group_participants',
      requesterId: uid,
      filters: [
        { type: 'eq', col: 'group_id', val: 'group_afterparty_club' },
        { type: 'eq', col: 'user_id', val: uid },
      ],
    });
    expect(leave.status).toBe(200);

    const parts = await op({
      op: 'select',
      table: 'group_participants',
      requesterId: uid,
      filters: [{ type: 'eq', col: 'user_id', val: uid }],
    });
    const rows = Array.isArray(parts.body.data) ? parts.body.data : [];
    expect(rows.some((r: { group_id: string }) => ['group_afterparty_club', dupId].includes(String(r.group_id)))).toBe(false);
  });

  it('같은 이름 2차·N대 방은 canonical 한 줄로 합친다', async () => {
    const uid = `g-dedupe-${randomUUID()}`;
    const dupAge = `dup-age20-${uid}`;
    const dupDrink = `dup-drink-${uid}`;
    expect((await op({
      op: 'insert',
      table: 'group_chats',
      payload: {
        id: dupAge,
        name: '20대 모임',
        interest_tag: '20대',
        age_group: '20대',
        max_members: 999999,
        room_kind: 'age_decade',
      },
      requesterId: 'seed-admin',
    })).status).toBe(200);
    expect((await op({
      op: 'insert',
      table: 'group_chats',
      payload: {
        id: dupDrink,
        name: '2차 술갈분',
        interest_tag: '2차술',
        max_members: 999999,
        room_kind: 'afterparty_drink',
      },
      requesterId: 'seed-admin',
    })).status).toBe(200);

    expect((await op({
      op: 'insert',
      table: 'group_participants',
      requesterId: uid,
      payload: { group_id: dupAge, user_id: uid },
    })).status).toBe(200);
    expect((await op({
      op: 'insert',
      table: 'group_messages',
      requesterId: uid,
      payload: { group_id: dupAge, sender_id: uid, content: 'keep-me-age' },
    })).status).toBe(200);
    expect((await op({
      op: 'insert',
      table: 'group_participants',
      requesterId: uid,
      payload: { group_id: dupDrink, user_id: uid },
    })).status).toBe(200);

    const rooms = await op({
      op: 'select',
      table: 'group_chats',
      requesterId: uid,
    });
    expect(rooms.status).toBe(200);
    const list = Array.isArray(rooms.body.data) ? rooms.body.data : [];
    const twenties = list.filter((g: { name?: string }) => String(g.name ?? '') === '20대 모임');
    const thirties = list.filter((g: { name?: string }) => String(g.name ?? '') === '30대 모임');
    const drinks = list.filter((g: { room_kind?: string }) => String(g.room_kind ?? '') === 'afterparty_drink');
    const clubs = list.filter((g: { room_kind?: string }) => String(g.room_kind ?? '') === 'afterparty_club');
    expect(twenties).toHaveLength(1);
    expect(twenties[0].id).toBe('group_age_20');
    expect(thirties).toHaveLength(1);
    expect(thirties[0].id).toBe('group_age_30');
    expect(drinks).toHaveLength(1);
    expect(drinks[0].id).toBe('group_afterparty_drink');
    expect(clubs).toHaveLength(1);
    expect(clubs[0].id).toBe('group_afterparty_club');
    expect(list.some((g: { id?: string }) => String(g.id) === dupAge)).toBe(false);
    expect(list.some((g: { id?: string }) => String(g.id) === dupDrink)).toBe(false);

    const parts = await op({
      op: 'select',
      table: 'group_participants',
      requesterId: uid,
      filters: [{ type: 'eq', col: 'user_id', val: uid }],
    });
    const partRows = Array.isArray(parts.body.data) ? parts.body.data : [];
    expect(partRows.some((p: { group_id?: string }) => String(p.group_id) === 'group_age_20')).toBe(true);
    expect(partRows.some((p: { group_id?: string }) => String(p.group_id) === dupAge)).toBe(false);
    expect(partRows.filter((p: { group_id?: string }) => String(p.group_id) === 'group_afterparty_drink')).toHaveLength(1);
    expect(partRows.some((p: { group_id?: string }) => String(p.group_id) === dupDrink)).toBe(false);

    const msgs = await op({
      op: 'select',
      table: 'group_messages',
      requesterId: uid,
      filters: [{ type: 'eq', col: 'group_id', val: 'group_age_20' }],
    });
    const msgRows = Array.isArray(msgs.body.data) ? msgs.body.data : [];
    expect(msgRows.some((m: { content?: string }) => String(m.content) === 'keep-me-age')).toBe(true);
  });
});

describe('[Security] profiles birth month/day edit limit', () => {
  async function readProfile(agent: request.SuperAgentTest, userId: string) {
    const res = await agent.post('/api/db/op').send({
      op: 'select',
      table: 'profiles',
      requesterId: userId,
      filters: [{ type: 'eq', col: 'id', val: userId }],
    });
    expect(res.status).toBe(200);
    const row = Array.isArray(res.body.data) ? res.body.data[0] : res.body.data;
    return row as { birth_month?: number; birth_day?: number; birth_md_edit_count?: number };
  }

  it('allows up to 2 birth month/day changes then returns BIRTH_MD_LIMIT', async () => {
    const userId = randomUUID();
    const agent = await loginAgent(userId);

    expect((await agent.post('/api/db/op').send({
      op: 'update',
      table: 'profiles',
      requesterId: userId,
      payload: { birth_month: 3, birth_day: 10 },
      filters: [{ type: 'eq', col: 'id', val: userId }],
    })).status).toBe(200);
    expect((await readProfile(agent, userId)).birth_md_edit_count).toBe(1);

    expect((await agent.post('/api/db/op').send({
      op: 'update',
      table: 'profiles',
      requesterId: userId,
      payload: { birth_month: 4, birth_day: 20 },
      filters: [{ type: 'eq', col: 'id', val: userId }],
    })).status).toBe(200);
    expect((await readProfile(agent, userId)).birth_md_edit_count).toBe(2);

    const third = await agent.post('/api/db/op').send({
      op: 'update',
      table: 'profiles',
      requesterId: userId,
      payload: { birth_month: 5, birth_day: 1 },
      filters: [{ type: 'eq', col: 'id', val: userId }],
    });
    expect(third.status).toBe(403);
    expect(third.body.error?.code).toBe('BIRTH_MD_LIMIT');
  });

  it('does not increment count when month/day unchanged', async () => {
    const userId = randomUUID();
    const agent = await loginAgent(userId);

    await agent.post('/api/db/op').send({
      op: 'update',
      table: 'profiles',
      requesterId: userId,
      payload: { birth_month: 7, birth_day: 7 },
      filters: [{ type: 'eq', col: 'id', val: userId }],
    });

    expect((await agent.post('/api/db/op').send({
      op: 'update',
      table: 'profiles',
      requesterId: userId,
      payload: { birth_month: 7, birth_day: 7, bio: 'same birthday' },
      filters: [{ type: 'eq', col: 'id', val: userId }],
    })).status).toBe(200);
    expect((await readProfile(agent, userId)).birth_md_edit_count).toBe(1);
  });
});
