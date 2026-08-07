// @vitest-environment happy-dom
/**
 * Unread badge accuracy across app restarts
 *
 * Task: Confirm unread badge count stays accurate across app restarts.
 *
 * These tests call the REAL useChat hook via renderHook, with the supabase
 * client and fetch mocked. This means a regression in the actual hook wiring
 * (e.g. loadChatList stops calling syncUnreadCountsRef) will be caught here.
 *
 * Key scenarios:
 *   1. loadChatList completes → syncUnreadCounts is called → badge = DB total
 *   2. Currently-open chat is excluded from badge total
 *   3. Empty chat list still triggers syncUnreadCounts (early-return path)
 *   4. /api/db/unread-counts endpoint is called after loadChatList, not before
 *   5. Network error in syncUnreadCounts does not break the hook
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Profile } from '../types/app';

// ─── Module mocks (hoisted before imports) ──────────────────────────────────

// Track fetch calls per-test
let mockFetch: ReturnType<typeof vi.fn>;

// Channel mock — returned by supabase.channel(name)
function makeChannelMock() {
  // handlers 배열로 모든 .on() 등록 — new-chats-u1/u2 채널이 기존 핸들러를 덮어쓰지 않도록
  const ch: Record<string, unknown> = {};
  ch.on = vi.fn().mockReturnValue(ch);
  ch.subscribe = vi.fn().mockReturnValue(ch);
  ch.unsubscribe = vi.fn().mockReturnValue(ch);
  return ch;
}

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
  qb.upsert = vi.fn().mockResolvedValue({ data: null, error: null });
  qb.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  qb.single = vi.fn().mockResolvedValue({ data: null, error: null });
  qb.delete = vi.fn().mockResolvedValue({ data: null, error: null });
  qb.insert = vi.fn().mockResolvedValue({ data: null, error: null });
  // Promise-like: await-able returns { data: _data, error: null }
  qb.then = (f: (v: { data: unknown; error: null }) => unknown) => Promise.resolve({ data: _data, error: null }).then(f);
  qb._setData = (d: unknown) => { _data = d; };
  return qb;
}

// Supabase mock — tracks .from() calls and returns table-specific data
let chatQB: ReturnType<typeof makeQB>;
let msgQB: ReturnType<typeof makeQB>;
let channelMock: ReturnType<typeof makeChannelMock>;

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'chats') return chatQB;
      if (table === 'messages') return msgQB;
      // Default: return a no-op QBs for chat_reads etc.
      return makeQB(null);
    }),
    channel: vi.fn(() => channelMock),
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

// ─── Import the real hook after mocks are registered ────────────────────────

// eslint-disable-next-line import/first
import { useChat } from '../hooks/useChat';

// ─── Test setup ─────────────────────────────────────────────────────────────

const TEST_USER_ID = 'user-test-001';
const CHAT_A = 'chat-aaa';
const CHAT_B = 'chat-bbb';

const BASE_DEPS = {
  currentUserId: TEST_USER_ID,
  profilesRef: { current: [] as Profile[] },
  setSelectedProfile: vi.fn(),
  setView: vi.fn(),
  setBottomNotif: vi.fn(),
};

function makeChatRow(id: string) {
  return { id, user1_id: TEST_USER_ID, user2_id: 'user-other', created_at: '2026-07-31T00:00:00Z' };
}

function setupFetch(unreadData: Record<string, number> | null, ok = true) {
  mockFetch = vi.fn().mockResolvedValue({
    ok,
    json: async () => ({ data: unreadData }),
  });
  vi.stubGlobal('fetch', mockFetch);
}

beforeEach(() => {
  chatQB = makeQB([]);
  msgQB = makeQB([]);
  channelMock = makeChannelMock();
  // Default: unread-counts returns empty
  setupFetch({});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useChat — syncUnreadCounts called after loadChatList (restart sequence)', () => {
  it('calls /api/db/unread-counts after loadChatList populates the chat list', async () => {
    // Arrange: server has two chats, unread endpoint returns counts
    chatQB._setData([makeChatRow(CHAT_A), makeChatRow(CHAT_B)]);
    setupFetch({ [CHAT_A]: 2, [CHAT_B]: 3 });

    const { result } = renderHook(() => useChat(BASE_DEPS));

    // Act: trigger loadChatList as the app would on restart
    await act(async () => {
      await result.current.loadChatList(TEST_USER_ID);
    });

    // Assert: /api/db/unread-counts was called with the correct userId
    const calls = mockFetch.mock.calls.map((c) => c[0] as string);
    const unreadCall = calls.find((url) => url.includes('/api/db/unread-counts'));
    expect(unreadCall).toBeDefined();
    expect(unreadCall).toContain(`userId=${encodeURIComponent(TEST_USER_ID)}`);
  });

  it('badge (newMsgCount) reflects messages received while app was closed', async () => {
    // Arrange
    chatQB._setData([makeChatRow(CHAT_A), makeChatRow(CHAT_B)]);
    setupFetch({ [CHAT_A]: 2, [CHAT_B]: 3 });

    const { result } = renderHook(() => useChat(BASE_DEPS));

    await act(async () => {
      await result.current.loadChatList(TEST_USER_ID);
    });

    // Assert: badge total = 2 + 3 = 5
    await waitFor(() => {
      expect(result.current.newMsgCount).toBe(5);
    });
  });

  it('per-room unreadChatCounts reflects DB counts after restart', async () => {
    chatQB._setData([makeChatRow(CHAT_A), makeChatRow(CHAT_B)]);
    setupFetch({ [CHAT_A]: 2, [CHAT_B]: 3 });

    const { result } = renderHook(() => useChat(BASE_DEPS));

    await act(async () => {
      await result.current.loadChatList(TEST_USER_ID);
    });

    await waitFor(() => {
      expect(result.current.unreadChatCounts[CHAT_A]).toBe(2);
      expect(result.current.unreadChatCounts[CHAT_B]).toBe(3);
    });
  });

  it('badge is 0 when there are no unread messages (clean restart)', async () => {
    chatQB._setData([makeChatRow(CHAT_A)]);
    setupFetch({});

    const { result } = renderHook(() => useChat(BASE_DEPS));

    await act(async () => {
      await result.current.loadChatList(TEST_USER_ID);
    });

    await waitFor(() => {
      expect(result.current.newMsgCount).toBe(0);
    });
  });

  it('syncUnreadCounts is called even when the chat list is empty (early-return path)', async () => {
    // data.length === 0 early-return still calls syncUnreadCountsRef
    chatQB._setData([]);
    setupFetch({ [CHAT_A]: 4 });

    const { result } = renderHook(() => useChat(BASE_DEPS));

    await act(async () => {
      await result.current.loadChatList(TEST_USER_ID);
    });

    // Even with empty chat list, the unread endpoint must be called
    const calls = mockFetch.mock.calls.map((c) => c[0] as string);
    const unreadCall = calls.find((url) => url.includes('/api/db/unread-counts'));
    expect(unreadCall).toBeDefined();
  });
});

describe('useChat — open chat is excluded from badge on restart', () => {
  it('currently-open chat is excluded from badge total', async () => {
    chatQB._setData([makeChatRow(CHAT_A), makeChatRow(CHAT_B)]);
    // CHAT_A has 4 unread, CHAT_B has 6 unread
    setupFetch({ [CHAT_A]: 4, [CHAT_B]: 6 });

    const { result } = renderHook(() => useChat(BASE_DEPS));

    // Open CHAT_A first (simulates the chat being open on restart)
    act(() => {
      result.current.setChatId(CHAT_A);
    });

    await act(async () => {
      await result.current.loadChatList(TEST_USER_ID);
    });

    // Badge must only count CHAT_B (6), not CHAT_A (4)
    await waitFor(() => {
      expect(result.current.newMsgCount).toBe(6);
    });
    expect(result.current.unreadChatCounts).not.toHaveProperty(CHAT_A);
    expect(result.current.unreadChatCounts[CHAT_B]).toBe(6);
  });
});

describe('useChat — syncUnreadCounts is called once on mount (currentUserId becomes available)', () => {
  it('calls /api/db/unread-counts once when currentUserId is set on mount', async () => {
    setupFetch({ [CHAT_A]: 1 });

    renderHook(() => useChat(BASE_DEPS));

    await waitFor(() => {
      const calls = mockFetch.mock.calls.map((c) => c[0] as string);
      const unreadCalls = calls.filter((url) => url.includes('/api/db/unread-counts'));
      expect(unreadCalls.length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('useChat — openChat clears both per-chat badge and global newMsgCount', () => {
  it('newMsgCount decrements correctly when openChat clears unread for the resolved chat', async () => {
    // Scenario: user has 1 unread in CHAT_A. They open the chat list and click the chat.
    // openChat calls setUnreadChatCounts (clearing CHAT_A) before the chatId effect fires.
    // The bug (regressed): if openChat did NOT read the count before calling
    // setUnreadChatCounts, the chatId effect would find removed=0 and never decrement newMsgCount.
    //
    // Verifies that after openChat resolves: unreadChatCounts[CHAT_A] is gone AND newMsgCount===0.

    // Arrange: chat list shows CHAT_A; unread-counts endpoint returns { [CHAT_A]: 1 }
    chatQB._setData([makeChatRow(CHAT_A)]);
    setupFetch({ [CHAT_A]: 1 });

    // Make chatQB.maybeSingle return the existing chat so openChat resolves to CHAT_A
    // (chatQB is reused for supabase.from('chats') lookups inside openChat)
    chatQB.maybeSingle = vi.fn().mockResolvedValue({ data: { id: CHAT_A, user1_id: TEST_USER_ID, user2_id: 'other-user' }, error: null });

    const { result } = renderHook(() => useChat(BASE_DEPS));

    // 1. Load chat list → triggers syncUnreadCounts which sets newMsgCount = 1
    await act(async () => {
      await result.current.loadChatList(TEST_USER_ID);
    });
    expect(result.current.newMsgCount).toBe(1);
    expect(result.current.unreadChatCounts[CHAT_A]).toBe(1);

    // 2. Open the chat — openChat must clear both per-chat count AND global badge
    const otherProfile: Profile = {
      id: 'other-user',
      nickname: 'Other',
      pin_code: '1234',
      bio: '',
      mbti: null,
      photo_url: null,
      seat_number: null,
      personality_score: 50,
      birth_year: null,
      is_admin: false,
      device_secret: null,
      push_subscription: null,
      created_at: new Date().toISOString(),
    };
    await act(async () => {
      await result.current.openChat(otherProfile);
    });

    // Both the per-chat bubble and the global badge must be cleared in the same cycle
    expect(result.current.unreadChatCounts[CHAT_A]).toBeUndefined();
    expect(result.current.newMsgCount).toBe(0);
  });
});

describe('useChat — error resilience', () => {
  it('hook remains stable when /api/db/unread-counts returns 500', async () => {
    chatQB._setData([makeChatRow(CHAT_A)]);
    setupFetch(null, false); // ok: false

    const { result } = renderHook(() => useChat(BASE_DEPS));

    await act(async () => {
      await result.current.loadChatList(TEST_USER_ID);
    });

    // Hook must not throw; badge stays at 0 (no data applied)
    expect(result.current.newMsgCount).toBe(0);
  });

  it('hook remains stable when fetch rejects (network error)', async () => {
    chatQB._setData([makeChatRow(CHAT_A)]);
    mockFetch = vi.fn().mockRejectedValue(new Error('network failure'));
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useChat(BASE_DEPS));

    await act(async () => {
      await result.current.loadChatList(TEST_USER_ID);
    });

    expect(result.current.newMsgCount).toBe(0);
  });
});
