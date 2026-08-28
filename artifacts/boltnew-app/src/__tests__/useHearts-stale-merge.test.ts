// @vitest-environment happy-dom
/**
 * P4 — stale HTTP fetch vs concurrent SSE / optimistic updates in useHearts.
 *
 * Verifies mergeSetAfterSnapshot / mergeMapAfterSnapshot / mergeRowsAfterSnapshot
 * wiring: a slow likes SELECT must not undo rows that arrived via SSE or optimistic UI.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

const likesDeferreds: Array<Deferred<{ data: unknown[] | null; error: null }>> = [];
const profilesDeferreds: Array<Deferred<{ data: unknown[] | null; error: null }>> = [];

vi.mock('../lib/supabase', () => {
  function makeLikesQB() {
    const d = deferred<{ data: unknown[] | null; error: null }>();
    likesDeferreds.push(d);
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
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            then: (f: (v: { data: null; error: null }) => unknown) =>
              Promise.resolve({ data: null, error: null }).then(f),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
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

import { useHearts } from '../hooks/useHearts';
import type { Profile } from '../types/app';

const USER = 'user-self';
const LIKER_SSE = 'user-sse-liker';
const LIKED_OPTIMISTIC = 'user-liked-live';

const sseLikerProfile: Profile = {
  id: LIKER_SSE,
  name: 'SSE Liker',
  gender: 'female',
  birth_year: 1998,
  birth_month: 1,
  birth_day: 1,
  mbti: null,
  photo_url: null,
  device_id: 'dev-sse',
  pin: '0000',
  created_at: new Date().toISOString(),
};

const BASE_HOOK_ARGS = {
  profiles: [] as Profile[],
  profileMap: new Map<string, Profile>(),
  onOpenChat: vi.fn(),
};

beforeEach(() => {
  likesDeferreds.length = 0;
  profilesDeferreds.length = 0;
  vi.clearAllMocks();
});

describe('useHearts — stale fetch vs SSE merge', () => {
  it('keeps SSE-received liker when loadReceivedLikes returns stale empty', async () => {
    const { result } = renderHook(() =>
      useHearts(USER, BASE_HOOK_ARGS.profiles, BASE_HOOK_ARGS.profileMap, BASE_HOOK_ARGS.onOpenChat),
    );

    act(() => { result.current.loadReceivedLikes(USER); });

    act(() => {
      result.current.setReceivedHeartTypes(new Map([[LIKER_SSE, 'red']]));
      result.current.setReceivedLikers([sseLikerProfile]);
    });

    act(() => {
      likesDeferreds[0]?.resolve({ data: [], error: null });
    });

    await waitFor(() => {
      expect(result.current.receivedLikers).toHaveLength(1);
    });

    expect(result.current.receivedLikers[0].id).toBe(LIKER_SSE);
    expect(result.current.receivedHeartTypes.get(LIKER_SSE)).toBe('red');
  });

  it('keeps optimistic outgoing like when loadLikes returns stale empty', async () => {
    const { result } = renderHook(() =>
      useHearts(USER, BASE_HOOK_ARGS.profiles, BASE_HOOK_ARGS.profileMap, BASE_HOOK_ARGS.onOpenChat),
    );

    act(() => { result.current.loadLikes(USER); });

    act(() => {
      result.current.setLikedIds(new Set([LIKED_OPTIMISTIC]));
      result.current.setSentHeartTypes(new Map([[LIKED_OPTIMISTIC, 'blue']]));
      result.current.setSentHeartsPerPerson(new Map([[LIKED_OPTIMISTIC, new Set(['blue' as const])]]));
    });

    act(() => {
      likesDeferreds[0]?.resolve({ data: [], error: null });
    });

    await waitFor(() => {
      expect(result.current.likedIds.has(LIKED_OPTIMISTIC)).toBe(true);
    });

    expect(result.current.sentHeartTypes.get(LIKED_OPTIMISTIC)).toBe('blue');
  });

  it('merges stale fetch with SSE heart row that arrived mid-flight', async () => {
    const { result } = renderHook(() =>
      useHearts(USER, BASE_HOOK_ARGS.profiles, BASE_HOOK_ARGS.profileMap, BASE_HOOK_ARGS.onOpenChat),
    );

    act(() => { result.current.loadReceivedLikes(USER); });

    act(() => {
      result.current.setReceivedHeartTypes(new Map([[LIKER_SSE, 'pink']]));
      result.current.setReceivedLikers([sseLikerProfile]);
    });

    act(() => {
      likesDeferreds[0]?.resolve({
        data: [{ id: 'like-old', liker_id: 'user-server-only', status: 'pending', heart_type: 'green' }],
        error: null,
      });
    });

    await waitFor(() => {
      expect(profilesDeferreds.length).toBe(1);
    });

    const serverOnlyProfile: Profile = {
      ...sseLikerProfile,
      id: 'user-server-only',
      name: 'Server Only',
    };

    act(() => {
      profilesDeferreds[0]?.resolve({ data: [serverOnlyProfile], error: null });
    });

    await waitFor(() => {
      expect(result.current.receivedLikers.length).toBeGreaterThanOrEqual(2);
    });

    const ids = result.current.receivedLikers.map(p => p.id).sort();
    expect(ids).toContain(LIKER_SSE);
    expect(ids).toContain('user-server-only');
    expect(result.current.receivedHeartTypes.get(LIKER_SSE)).toBe('pink');
    expect(result.current.receivedHeartTypes.get('user-server-only')).toBe('green');
  });

  it('keeps green compliment ack when loadReceivedLikes returns stale pending', async () => {
    const { result } = renderHook(() =>
      useHearts(USER, BASE_HOOK_ARGS.profiles, BASE_HOOK_ARGS.profileMap, BASE_HOOK_ARGS.onOpenChat),
    );

    act(() => { result.current.loadReceivedLikes(USER); });

    act(() => {
      result.current.setAcknowledgedComplimentIds(new Set([LIKER_SSE]));
    });

    act(() => {
      likesDeferreds[0]?.resolve({
        data: [{ id: 'like-old', liker_id: LIKER_SSE, status: 'pending', heart_type: 'green' }],
        error: null,
      });
    });

    await waitFor(() => {
      expect(profilesDeferreds.length).toBe(1);
    });

    act(() => {
      profilesDeferreds[0]?.resolve({ data: [sseLikerProfile], error: null });
    });

    await waitFor(() => {
      expect(result.current.acknowledgedComplimentIds.has(LIKER_SSE)).toBe(true);
    });
  });
});
