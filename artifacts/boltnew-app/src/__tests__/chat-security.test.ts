// @vitest-environment happy-dom
/**
 * チャットセキュリティ 不変条件テスト
 *
 * 発見済みの HIGH バグが再発しないよう、セキュリティ/整合性チェックを
 * 自動テストとして固定する。
 *
 * テスト対象インバリアント:
 * 1. [Guard 3] DELETE ペイロードの chat_id が現在の chatId と違う場合メッセージを削除しない
 * 2. [Guard 2] DELETE ペイロードに id がなければ何もしない (malformed payload)
 * 3. [Guard 3 逆確認] 正しい chatId の DELETE は正常に動作する
 * 4. [Guard 1] chatIdRef が変わった後に届いた DELETE は無視される (stale channel)
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Profile, Message } from '../types/app';

// ─── Module mocks (hoisted before imports) ─────────────────────────────────

let mockFetch: ReturnType<typeof vi.fn>;

// channel ハンドラを全て保持するモック (new-chats チャンネル等が上書きしないように)
function makeChannelMock() {
  const handlers: Array<(payload: unknown) => void> = [];
  const ch: Record<string, unknown> = {};
  ch.on = vi.fn().mockImplementation(
    (_event: string, _filter: unknown, handler: (payload: unknown) => void) => {
      handlers.push(handler);
      return ch;
    },
  );
  ch.subscribe = vi.fn().mockImplementation(() => ch);
  ch.unsubscribe = vi.fn().mockReturnValue(ch);
  (ch as unknown as { _triggerAll: (p: unknown) => void })
    ._triggerAll = (p: unknown) => {
      handlers.forEach(h => { try { h(p); } catch { /* ignore */ } });
    };
  return ch;
}

type ChannelMock = ReturnType<typeof makeChannelMock>;

function makeQB(defaultData: unknown = null) {
  let _data: unknown = defaultData;
  const qb: Record<string, unknown> = {};
  const chain = () => qb;
  qb.select = vi.fn().mockImplementation(chain);
  qb.or = vi.fn().mockImplementation(chain);
  qb.eq = vi.fn().mockImplementation(chain);
  qb.in = vi.fn().mockImplementation(chain);
  qb.order = vi.fn().mockImplementation(chain);
  qb.limit = vi.fn().mockImplementation(chain);
  qb.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  qb.single = vi.fn().mockResolvedValue({ data: null, error: null });
  qb.delete = vi.fn().mockResolvedValue({ data: null, error: null });
  qb.insert = vi.fn().mockResolvedValue({ data: null, error: null });
  qb.upsert = vi.fn().mockResolvedValue({ data: null, error: null });
  qb.then = (f: (v: { data: unknown; error: null }) => unknown) =>
    Promise.resolve({ data: _data, error: null }).then(f);
  qb._setData = (d: unknown) => { _data = d; };
  return qb;
}

let activeChannelMock: ChannelMock;
let chatQB: ReturnType<typeof makeQB>;
let msgQB: ReturnType<typeof makeQB>;
let otherQB: ReturnType<typeof makeQB>;

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'chats') return chatQB;
      if (table === 'messages') return msgQB;
      return otherQB;
    }),
    channel: vi.fn(() => activeChannelMock),
    removeChannel: vi.fn().mockResolvedValue(undefined),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(),
        remove: vi.fn(),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: '' } })),
      })),
    },
  },
}));

vi.mock('../lib/localdb', () => ({
  onSseReconnect: vi.fn(() => () => {}),
  onSseDisconnect: vi.fn(() => () => {}),
  getSseToken: vi.fn(() => 'test-sse-token'),
}));

vi.mock('../lib/sounds', () => ({
  playCuteSound: vi.fn(),
}));

// ─── Import real hook and pure functions after mocks ──────────────────────
// eslint-disable-next-line import/first
import { useChat } from '../hooks/useChat';
// eslint-disable-next-line import/first
import { applySseInsert } from '../lib/chat-reducers';

// ─── Constants & helpers ─────────────────────────────────────────────────────

const USER_A  = 'user-aaa';
const CHAT_A  = 'chat-aaa';
const CHAT_B  = 'chat-bbb';

const MSG_1 = {
  id: 'msg-001',
  chat_id: CHAT_A,
  sender_id: USER_A,
  content: 'hello',
  created_at: '2026-08-08T01:00:00.000Z',
  image_url: null,
  client_id: null,
};

const BASE_DEPS = {
  currentUserId: USER_A,
  profilesRef: { current: [] as Profile[] },
  setSelectedProfile: vi.fn(),
  setView: vi.fn(),
  setBottomNotif: vi.fn(),
};

function setupFetch(data: unknown = {}) {
  mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data }),
  });
  vi.stubGlobal('fetch', mockFetch);
}

beforeEach(() => {
  chatQB  = makeQB([]);
  msgQB   = makeQB([]);
  otherQB = makeQB(null);
  activeChannelMock = makeChannelMock();
  setupFetch({});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ─── テスト: Cross-room DELETE ガード ────────────────────────────────────────

describe('[Security] Cross-room DELETE ガード', () => {
  /**
   * バグ再現シナリオ:
   * ・chat-a チャンネルが購読中
   * ・SSE/DB から chat_id: chat-b の DELETE イベントが誤って届く
   * → chat-a のメッセージは削除されてはならない
   */
  it('DELETE ペイロードの chat_id が現在 chatId と違う場合メッセージを維持する', async () => {
    // chat-a に SSE INSERT でメッセージを注入
    msgQB._setData([MSG_1]);

    const { result } = renderHook(() => useChat(BASE_DEPS));

    // chat-a を開く
    act(() => { result.current.setChatId(CHAT_A); });

    // loadMessages が呼ばれるまで待つ
    await waitFor(() => {
      expect(result.current.messages.length).toBeGreaterThan(0);
    }, { timeout: 3000 });

    const before = result.current.messages.length;
    expect(before).toBe(1);

    // chat-b の DELETE イベントを chat-a チャンネルに注入 (cross-room 攻撃)
    act(() => {
      (activeChannelMock as unknown as { _triggerAll: (p: unknown) => void })
        ._triggerAll({
          eventType: 'DELETE',
          old: { id: MSG_1.id, chat_id: CHAT_B },  // chat_id が chat-b → guard で弾かれるべき
        });
    });

    // メッセージ数は変わらない (guard が効いていること)
    expect(result.current.messages.length).toBe(before);
    expect(result.current.messages[0].id).toBe(MSG_1.id);
  });

  it('DELETE ペイロードに id がなければ (malformed) 何もしない', async () => {
    msgQB._setData([MSG_1]);
    const { result } = renderHook(() => useChat(BASE_DEPS));
    act(() => { result.current.setChatId(CHAT_A); });

    await waitFor(() => {
      expect(result.current.messages.length).toBeGreaterThan(0);
    }, { timeout: 3000 });

    const before = result.current.messages.length;

    act(() => {
      (activeChannelMock as unknown as { _triggerAll: (p: unknown) => void })
        ._triggerAll({
          eventType: 'DELETE',
          old: { chat_id: CHAT_A },  // id がない → guard 2 で弾かれるべき
        });
    });

    expect(result.current.messages.length).toBe(before);
  });

  it('正しい chatId の DELETE は正常にメッセージを削除する (guard が正常動作を壊さない)', async () => {
    msgQB._setData([MSG_1]);
    const { result } = renderHook(() => useChat(BASE_DEPS));
    act(() => { result.current.setChatId(CHAT_A); });

    await waitFor(() => {
      expect(result.current.messages.length).toBeGreaterThan(0);
    }, { timeout: 3000 });

    // 正しい chat_id の DELETE → 削除されるべき
    act(() => {
      (activeChannelMock as unknown as { _triggerAll: (p: unknown) => void })
        ._triggerAll({
          eventType: 'DELETE',
          old: { id: MSG_1.id, chat_id: CHAT_A },  // 正しい chat_id
        });
    });

    await waitFor(() => {
      expect(result.current.messages.length).toBe(0);
    }, { timeout: 3000 });
  });
});

// ─── テスト: sender_id 検証 (reducer レベル) ─────────────────────────────────

describe('[Security] メッセージ reducer インバリアント', () => {
  it('SSE INSERT で受け取ったメッセージの id/sender_id は保持される', () => {
    const msg: Message = {
      id: 'db-row-001',
      chat_id: CHAT_A,
      sender_id: 'user-b',
      content: 'hi',
      created_at: '2026-08-08T02:00:00.000Z',
      image_url: null,
      client_id: 'client-uuid-001',
    };

    const state = applySseInsert([], msg);
    expect(state).toHaveLength(1);
    expect(state[0].sender_id).toBe('user-b');   // sender_id はそのまま保持
    expect(state[0].id).toBe('db-row-001');
  });

  it('同じ id を 2 回 INSERT しても 1 件のみ (idempotent)', () => {
    const msg: Message = {
      id: 'idempotent-test',
      chat_id: CHAT_A,
      sender_id: 'user-b',
      content: 'hello',
      created_at: '2026-08-08T02:00:00.000Z',
      image_url: null,
      client_id: null,
    };

    let state = applySseInsert([], msg);
    state = applySseInsert(state, msg);
    state = applySseInsert(state, msg);

    expect(state).toHaveLength(1);
  });
});
