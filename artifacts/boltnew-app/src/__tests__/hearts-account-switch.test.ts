// @vitest-environment happy-dom
/**
 * Task #52 — Account-switch race condition guard for useHearts
 *
 * Verifies that:
 *   1. Switching currentUserId synchronously clears all previous-user heart state
 *   2. A slow loadLikes response for User A is discarded when User B is now active
 *   3. A slow loadReceivedLikes response for User A (two awaits) is discarded for User B
 *   4. User B's own loadLikes / loadReceivedLikes responses are still applied correctly
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Deferred helper ────────────────────────────────────────────────────────

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (r?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// ─── Supabase mock ──────────────────────────────────────────────────────────

// Controlled per-test: resolve these to simulate DB responses arriving at
// specific moments.
let likesSelectDeferred: Deferred<{ data: unknown[] | null; error: null }>;
let profilesSelectDeferred: Deferred<{ data: unknown[] | null; error: null }>;

// How many times supabase.from('likes').select().eq() has been called
let likesCallCount = 0;
let profilesCallCount = 0;

// Per-call deferreds so each invocation gets its own deferred
const likesDeferreds: Array<Deferred<{ data: unknown[] | null; error: null }>> = [];
const profilesDeferreds: Array<Deferred<{ data: unknown[] | null; error: null }>> = [];

vi.mock('../lib/supabase', () => {
  function makeLikesQB() {
    const d = deferred<{ data: unknown[] | null; error: null }>();
    likesDeferreds.push(d);
    // then-able so `await supabase.from('likes').select(…).eq(…)` returns the deferred
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      then: (onfulfilled: (v: { data: unknown[] | null; error: null }) => unknown) =>
        d.promise.then(onfulfilled),
    };
  }

  function makeProfilesQB() {
    const d = deferred<{ data: unknown[] | null; error: null }>();
    profilesDeferreds.push(d);
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      then: (onfulfilled: (v: { data: unknown[] | null; error: null }) => unknown) =>
        d.promise.then(onfulfilled),
    };
  }

  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'likes') return makeLikesQB();
        if (table === 'profiles') return makeProfilesQB();
        if (table === 'contact_shares') {
          // contact_shares: immediately resolve with empty
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            then: (f: (v: { data: null; error: null }) => unknown) =>
              Promise.resolve({ data: null, error: null }).then(f),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          then: (f: (v: { data: null; error: null }) => unknown) =>
            Promise.resolve({ data: null, error: null }).then(f),
        };
      }),
      channel: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
        unsubscribe: vi.fn(),
      })),
      removeChannel: vi.fn(),
    },
  };
});

// ─── Import hook AFTER mocks ────────────────────────────────────────────────

import { useHearts } from '../hooks/useHearts';
import type { Profile } from '../types/app';

// ─── Test data ──────────────────────────────────────────────────────────────

const USER_A = 'user-aaaa';
const USER_B = 'user-bbbb';
const OTHER_USER = 'user-other';

const likeRowForA = { liked_id: OTHER_USER, status: 'pending', heart_type: 'red' };
const likeRowForB = { liked_id: 'user-cccc', status: 'pending', heart_type: 'blue' };
const receivedLikeForA = { liker_id: 'user-dddd', status: 'pending', heart_type: 'pink' };
const receivedLikeForB = { liker_id: 'user-eeee', status: 'pending', heart_type: 'green' };
const profileForBLiker: Profile = {
  id: 'user-eeee', name: 'E User', gender: 'female', birth_year: 1995, birth_month: 3,
  birth_day: 15, mbti: null, photo_url: null, device_id: 'dev-e', pin: '0000',
  created_at: new Date().toISOString(),
};

const BASE_HOOK_ARGS = {
  profiles: [] as Profile[],
  profileMap: new Map<string, Profile>(),
  onOpenChat: vi.fn(),
};

// ─── Test suite ─────────────────────────────────────────────────────────────

beforeEach(() => {
  likesDeferreds.length = 0;
  profilesDeferreds.length = 0;
  vi.clearAllMocks();
});

describe('useHearts — account-switch race guard', () => {
  it('clears all heart state synchronously when currentUserId changes', async () => {
    // Start as User A with some loaded state
    const { result, rerender } = renderHook(
      ({ uid }: { uid: string | null }) =>
        useHearts(uid, BASE_HOOK_ARGS.profiles, BASE_HOOK_ARGS.profileMap, BASE_HOOK_ARGS.onOpenChat),
      { initialProps: { uid: USER_A as string | null } },
    );

    // Manually resolve the mount-time contact_shares call (no-op: already immediate)
    // Inject some state as if User A had loaded hearts
    act(() => {
      result.current.setLikedIds(new Set([OTHER_USER]));
      result.current.setReceivedLikers([profileForBLiker]);
      result.current.setSentHeartsPerPerson(new Map([[OTHER_USER, new Set(['red' as const])]]));
    });

    expect(result.current.likedIds.size).toBe(1);
    expect(result.current.receivedLikers.length).toBe(1);

    // Switch to User B — useEffect should clear state synchronously
    act(() => {
      rerender({ uid: USER_B });
    });

    expect(result.current.likedIds.size).toBe(0);
    expect(result.current.sentHeartsPerPerson.size).toBe(0);
    expect(result.current.receivedLikers.length).toBe(0);
    expect(result.current.receivedHeartTypes.size).toBe(0);
    expect(result.current.sentHeartTypes.size).toBe(0);
    expect(result.current.likeStatuses.size).toBe(0);
  });

  it('discards User A loadLikes response that arrives after switching to User B', async () => {
    const { result, rerender } = renderHook(
      ({ uid }: { uid: string | null }) =>
        useHearts(uid, BASE_HOOK_ARGS.profiles, BASE_HOOK_ARGS.profileMap, BASE_HOOK_ARGS.onOpenChat),
      { initialProps: { uid: USER_A as string | null } },
    );

    // Fire loadLikes for User A (in-flight, not yet resolved)
    act(() => { result.current.loadLikes(USER_A); });
    // likesDeferreds[0] is User A's likes query — don't resolve yet

    // Switch to User B — increments the gen counter
    act(() => { rerender({ uid: USER_B }); });
    expect(result.current.likedIds.size).toBe(0); // cleared immediately

    // Fire loadLikes for User B
    act(() => { result.current.loadLikes(USER_B); });

    // Now resolve User A's response first (stale — should be discarded)
    act(() => { likesDeferreds[0]?.resolve({ data: [likeRowForA], error: null }); });
    await waitFor(() => {}); // flush microtasks

    // User A's data must NOT appear
    expect(result.current.likedIds.has(OTHER_USER)).toBe(false);

    // Now resolve User B's response
    act(() => { likesDeferreds[1]?.resolve({ data: [likeRowForB], error: null }); });

    await waitFor(() => {
      expect(result.current.likedIds.has('user-cccc')).toBe(true);
    });

    // Confirm User A's data is still absent
    expect(result.current.likedIds.has(OTHER_USER)).toBe(false);
  });

  it('discards User A loadReceivedLikes response (both awaits) after switching to User B', async () => {
    const { result, rerender } = renderHook(
      ({ uid }: { uid: string | null }) =>
        useHearts(uid, BASE_HOOK_ARGS.profiles, BASE_HOOK_ARGS.profileMap, BASE_HOOK_ARGS.onOpenChat),
      { initialProps: { uid: USER_A as string | null } },
    );

    // Fire loadReceivedLikes for User A
    act(() => { result.current.loadReceivedLikes(USER_A); });
    // likesDeferreds[0] = User A's first await (likes SELECT)

    // Switch to User B before User A's query resolves
    act(() => { rerender({ uid: USER_B }); });
    expect(result.current.receivedLikers.length).toBe(0);

    // Fire loadReceivedLikes for User B
    act(() => { result.current.loadReceivedLikes(USER_B); });

    // Resolve User A's likes query — passes gen check (stale gen), should be discarded
    act(() => { likesDeferreds[0]?.resolve({ data: [receivedLikeForA], error: null }); });
    await waitFor(() => {}); // flush; no profiles query should be issued for A

    // Resolve User B's likes query — passes gen check, profiles fetch should follow
    act(() => { likesDeferreds[1]?.resolve({ data: [receivedLikeForB], error: null }); });
    await waitFor(() => {}); // flush so profiles fetch is issued

    // Resolve User B's profiles query
    act(() => { profilesDeferreds[0]?.resolve({ data: [profileForBLiker], error: null }); });

    await waitFor(() => {
      expect(result.current.receivedLikers.length).toBe(1);
    });

    // Only User B's liker must appear
    expect(result.current.receivedLikers[0].id).toBe('user-eeee');
    // User A's liker must not appear
    expect(result.current.receivedLikers.find(p => p.id === 'user-dddd')).toBeUndefined();
  });

  it('clears heart state on logout (currentUserId → null)', async () => {
    const { result, rerender } = renderHook(
      ({ uid }: { uid: string | null }) =>
        useHearts(uid, BASE_HOOK_ARGS.profiles, BASE_HOOK_ARGS.profileMap, BASE_HOOK_ARGS.onOpenChat),
      { initialProps: { uid: USER_A as string | null } },
    );

    act(() => {
      result.current.setLikedIds(new Set([OTHER_USER]));
      result.current.setReceivedLikers([profileForBLiker]);
    });

    act(() => { rerender({ uid: null }); });

    expect(result.current.likedIds.size).toBe(0);
    expect(result.current.receivedLikers.length).toBe(0);
  });
});
