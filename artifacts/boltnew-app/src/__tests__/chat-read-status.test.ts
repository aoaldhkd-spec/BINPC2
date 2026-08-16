// @vitest-environment happy-dom
/**
 * Confirm messages already read in a chat show as read when you return to it.
 *
 * Scenario:
 *   1. User A opens a chat room (chatId set).
 *   2. A message from user B arrives while the chat is open.
 *   3. User A leaves the chat (chatId → null).
 *   4. The exit-time cleanup upserts chat_reads with read_at > message's created_at.
 *   5. Re-syncing unread counts returns 0 for that chat.
 *
 * These tests drive the REAL useChat hook via renderHook with supabase and
 * fetch mocked, so any regression in the hook's exit-cleanup or
 * syncUnreadCounts logic will be caught here.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Profile } from '../types/app';

// ─── Module mocks (hoisted before imports) ───────────────────────────────────

let mockFetch: ReturnType<typeof vi.fn>;

// Tracks every chat_reads upsert call so tests can inspect them
const chatReadsUpsertCalls: unknown[] = [];

function makeChannelMock() {
  // 여러 .on() 호출이 모두 등록되도록 handlers 배열 사용
  // (new-chats-u1/u2 채널 등 추가 구독이 기존 핸들러를 덮어쓰지 않도록)
  const handlers: ((payload: unknown) => void)[] = [];
  const ch: Record<string, unknown> = {};
  ch.on = vi.fn().mockImplementation(
    (_event: string, _filter: unknown, handler: (payload: unknown) => void) => {
      handlers.push(handler);
      return ch;
    },
  );
  ch.subscribe = vi.fn().mockImplementation(() => ch);
  ch.unsubscribe = vi.fn().mockReturnValue(ch);
  // Expose: fires all registered handlers so message-channel and new-chats-channel coexist
  (ch as unknown as { _triggerInsert: (p: unknown) => void })
    ._triggerInsert = (p: unknown) => {
      handlers.forEach(h => { try { h(p); } catch { /* ignore side effects from unrelated channels */ } });
    };
  return ch;
}

type ChannelMock = ReturnType<typeof makeChannelMock>;

// QueryBuilder mock — chainable, settles with { data, error: null }
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
  // chat_reads upsert — track calls, always resolve ok
  qb.upsert = vi.fn().mockImplementation((row: unknown) => {
    if (typeof row === 'object' && row !== null && 'reader_id' in row) {
      chatReadsUpsertCalls.push(row);
    }
    return Promise.resolve({ data: null, error: null });
  });
  // Promise-like: await-able
  qb.then = (f: (v: { data: unknown; error: null }) => unknown) =>
    Promise.resolve({ data: _data, error: null }).then(f);
  qb._setData = (d: unknown) => { _data = d; };
  return qb;
}

// Stable channel mock — replaced per test when needed
let activeChannelMock: ChannelMock;

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'chats') return chatQB;
      if (table === 'messages') return msgQB;
      // chat_reads and any other table — shared tracking QBs
      return chatReadsQB;
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
  isSseHealthy: vi.fn(() => true),
}));

vi.mock('../lib/sounds', () => ({
  playCuteSound: vi.fn(),
}));

// ─── Import the real hook after mocks ────────────────────────────────────────

// eslint-disable-next-line import/first
import { useChat } from '../hooks/useChat';

// ─── Shared QBs (reset per test) ─────────────────────────────────────────────
let chatQB: ReturnType<typeof makeQB>;
let msgQB: ReturnType<typeof makeQB>;
let chatReadsQB: ReturnType<typeof makeQB>;

// ─── Constants ────────────────────────────────────────────────────────────────
const USER_A = 'user-aaa';
const USER_B = 'user-bbb';
const CHAT_ID = 'chat-test-001';

// A message sent by user B at a known time — used to verify read_at is after it
const MSG_CREATED_AT = '2026-07-31T10:00:00.000Z';
const MSG_FROM_B = {
  id: 'msg-001',
  chat_id: CHAT_ID,
  sender_id: USER_B,
  content: 'hello from B',
  created_at: MSG_CREATED_AT,
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

function setupFetch(unreadData: Record<string, number> | null, ok = true) {
  mockFetch = vi.fn().mockResolvedValue({
    ok,
    json: async () => ({ data: unreadData }),
  });
  vi.stubGlobal('fetch', mockFetch);
}

beforeEach(() => {
  chatReadsUpsertCalls.length = 0;
  chatQB = makeQB([]);
  msgQB = makeQB([]);
  chatReadsQB = makeQB(null);
  activeChannelMock = makeChannelMock();
  setupFetch({});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('chat-read-status: exit-time chat_reads upsert', () => {
  it('upserts chat_reads when user leaves the chat (chatId → null)', async () => {
    const { result } = renderHook(() => useChat(BASE_DEPS));

    // Open the chat
    act(() => { result.current.setChatId(CHAT_ID); });

    // Wait for the open-entry upsert (on chat open)
    await waitFor(() => {
      expect(chatReadsQB.upsert).toHaveBeenCalled();
    });

    const callsBefore = chatReadsUpsertCalls.length;

    // Leave the chat
    act(() => { result.current.setChatId(null); });

    // Exit-cleanup should produce another upsert
    await waitFor(() => {
      expect(chatReadsUpsertCalls.length).toBeGreaterThan(callsBefore);
    });

    const exitCall = chatReadsUpsertCalls[chatReadsUpsertCalls.length - 1] as {
      id: string;
      chat_id: string;
      reader_id: string;
      read_at: string;
    };
    expect(exitCall.chat_id).toBe(CHAT_ID);
    expect(exitCall.reader_id).toBe(USER_A);
    expect(exitCall.read_at).toBeDefined();
  });

  it('exit-time read_at is after (or equal to) the message created_at', async () => {
    // Track when we measure the "before open" time
    const beforeOpen = new Date().toISOString();

    const { result } = renderHook(() => useChat(BASE_DEPS));

    // Open the chat
    act(() => { result.current.setChatId(CHAT_ID); });
    await waitFor(() => { expect(chatReadsQB.upsert).toHaveBeenCalled(); });

    // Simulate a message from user B arriving while the chat is open.
    // The active SSE channel handler fires with the new message payload.
    act(() => {
      (activeChannelMock as unknown as { _triggerInsert: (p: unknown) => void })
        ._triggerInsert({ new: MSG_FROM_B, old: {} });
    });

    // Message should appear in the messages list
    await waitFor(() => {
      expect(result.current.messages.some((m) => m.id === 'msg-001')).toBe(true);
    });

    const upsertCountBefore = chatReadsUpsertCalls.length;

    // Leave the chat — cleanup fires the exit-time upsert
    act(() => { result.current.setChatId(null); });

    await waitFor(() => {
      expect(chatReadsUpsertCalls.length).toBeGreaterThan(upsertCountBefore);
    });

    const exitCall = chatReadsUpsertCalls[chatReadsUpsertCalls.length - 1] as {
      read_at: string;
    };

    // read_at must be >= MSG_CREATED_AT so it covers the message received during the visit
    expect(new Date(exitCall.read_at).getTime()).toBeGreaterThanOrEqual(
      new Date(MSG_CREATED_AT).getTime(),
    );
    // Also should not be in the past relative to when the chat was opened
    expect(new Date(exitCall.read_at).getTime()).toBeGreaterThanOrEqual(
      new Date(beforeOpen).getTime(),
    );
  });

  it('read_at is recorded with correct chat_id, chat_id row id, and reader_id', async () => {
    const { result } = renderHook(() => useChat(BASE_DEPS));

    act(() => { result.current.setChatId(CHAT_ID); });
    await waitFor(() => { expect(chatReadsQB.upsert).toHaveBeenCalled(); });

    act(() => { result.current.setChatId(null); });

    await waitFor(() => {
      const exitCall = chatReadsUpsertCalls.find(
        (c) => typeof c === 'object' && c !== null && (c as { chat_id?: string }).chat_id === CHAT_ID,
      );
      expect(exitCall).toBeDefined();
    });

    const exitCall = chatReadsUpsertCalls.find(
      (c) => typeof c === 'object' && c !== null && (c as { chat_id?: string }).chat_id === CHAT_ID,
    ) as { id: string; chat_id: string; reader_id: string; read_at: string };

    expect(exitCall.id).toBe(`${CHAT_ID}__${USER_A}`);
    expect(exitCall.chat_id).toBe(CHAT_ID);
    expect(exitCall.reader_id).toBe(USER_A);
  });

  it('no upsert is fired when currentUserId is null (unauthenticated)', async () => {
    const deps = { ...BASE_DEPS, currentUserId: null };
    const { result } = renderHook(() => useChat(deps));

    act(() => { result.current.setChatId(CHAT_ID); });
    // Slight delay to let effects settle
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });

    const callsBefore = chatReadsUpsertCalls.length;

    act(() => { result.current.setChatId(null); });
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });

    // No authenticated user → no upsert should have been made
    expect(chatReadsUpsertCalls.length).toBe(callsBefore);
  });
});

describe('chat-read-status: re-syncing unread counts returns 0 after leaving', () => {
  it('unreadChatCounts is 0 for the chat after returning and syncing', async () => {
    // The unread-counts API confirms 0 unread for CHAT_ID after the user has read it
    setupFetch({ [CHAT_ID]: 0 });

    const { result } = renderHook(() => useChat(BASE_DEPS));

    // Open the chat → open-entry upsert fires
    act(() => { result.current.setChatId(CHAT_ID); });
    await waitFor(() => { expect(chatReadsQB.upsert).toHaveBeenCalled(); });

    // Message from B arrives while chat is open — would normally add an unread
    // but since the chat is open, unreadChatCounts[CHAT_ID] should stay at 0
    act(() => {
      (activeChannelMock as unknown as { _triggerInsert: (p: unknown) => void })
        ._triggerInsert({ new: MSG_FROM_B, old: {} });
    });

    // Still in chat — no unread count for the active room
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(result.current.unreadChatCounts[CHAT_ID]).toBeUndefined();

    // Leave the chat
    act(() => { result.current.setChatId(null); });

    // Re-sync: API returns 0 for CHAT_ID (server respects the chat_reads record)
    await act(async () => {
      await result.current.loadChatList(USER_A);
    });

    await waitFor(() => {
      // After sync, the chat should have 0 unread — either absent or explicitly 0
      const count = result.current.unreadChatCounts[CHAT_ID] ?? 0;
      expect(count).toBe(0);
    });
  });

  it('badge (newMsgCount) remains 0 for a chat that was open when messages arrived', async () => {
    // Server says 0 unread for CHAT_ID after the read was recorded
    setupFetch({ [CHAT_ID]: 0 });

    const { result } = renderHook(() => useChat(BASE_DEPS));

    // Open the chat
    act(() => { result.current.setChatId(CHAT_ID); });
    await waitFor(() => { expect(chatReadsQB.upsert).toHaveBeenCalled(); });

    // Message arrives while chat is open
    act(() => {
      (activeChannelMock as unknown as { _triggerInsert: (p: unknown) => void })
        ._triggerInsert({ new: MSG_FROM_B, old: {} });
    });

    // Leave and re-sync
    act(() => { result.current.setChatId(null); });
    await act(async () => {
      await result.current.loadChatList(USER_A);
    });

    await waitFor(() => {
      // Total badge should be 0 (no unread chats after sync)
      expect(result.current.newMsgCount).toBe(0);
    });
  });

  it('unread count is cleared immediately when the chat is opened', async () => {
    // Pre-seed: hook starts with a known unread count for CHAT_ID
    setupFetch({ [CHAT_ID]: 3 });

    const { result } = renderHook(() => useChat(BASE_DEPS));

    // Trigger initial sync so the unread count is populated
    await waitFor(() => {
      const calls = mockFetch.mock.calls.map((c) => c[0] as string);
      expect(calls.some((u) => u.includes('/api/db/unread-counts'))).toBe(true);
    });

    await waitFor(() => {
      expect(result.current.unreadChatCounts[CHAT_ID]).toBe(3);
    });

    // Now open the chat — unread count must drop to 0 immediately (before exit)
    act(() => { result.current.setChatId(CHAT_ID); });

    await waitFor(() => {
      expect(result.current.unreadChatCounts[CHAT_ID]).toBeUndefined();
    });

    // Badge must reflect the removal too
    expect(result.current.newMsgCount).toBe(0);
  });
});
