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

import { describe, it, expect, vi, beforeAll } from 'vitest';
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
  return { default: { Pool: MockPool } };
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
