/**
 * API-server セキュリティ不変条件テスト
 *
 * 発見済みの HIGH バグが再発しないよう、セキュリティ検証ロジックを
 * 自動テストとして固定する。
 *
 * テスト対象インバリアント:
 * 1. messages INSERT — requesterId なしは 403
 * 2. messages INSERT — sender_id が requesterId と不一致なら 403
 * 3. messages INSERT — chat_id なしは 400
 * 4. messages INSERT — 参加していない chat への INSERT は 403
 * 5. chats INSERT   — セルフチャット (u1===u2) は 400
 * 6. chats INSERT   — requesterId が参加者でなければ 403
 * 7. messages SELECT — requesterId なしは 403
 * 8. messages SELECT — chat_id フィルタなしは 403
 * 9. chats SELECT   — requesterId なしは 403
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
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
