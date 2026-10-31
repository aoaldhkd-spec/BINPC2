// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '../types/app';
const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ order: read }) }) } }));
import { useProfilePrivacyLoaders } from './useProfilePrivacyLoaders';
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function setup() {
  const owner = { current: 'owner-a' as string | null }, profiles = { current: [] as Profile[] };
  const setProfiles = vi.fn(), noop = vi.fn();
  const { result } = renderHook(() => useProfilePrivacyLoaders({ currentUserId: null,
    userIdRef: owner, profilesRef: profiles, loadProfilesRef: { current: async () => [] },
    setProfiles, setUserSignals: noop, setBlockedUsers: noop, setProfileVisitors: noop }));
  return { result, owner, setProfiles };
}
describe('simultaneous participant profile refreshes', () => {
  it('shares one pending HTTP read and starts a fresh read after completion', async () => {
    let finish!: (v: unknown) => void;
    read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const { result } = setup();
    const requests = Array.from({ length: 10 }, () => result.current.loadProfiles());
    expect(read).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ data: [], error: null }); await Promise.all(requests); });
    read.mockResolvedValueOnce({ data: [], error: null });
    await act(async () => { await result.current.loadProfiles(); });
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('does not reuse a failed request or turn it into an empty successful profile list', async () => {
    read.mockResolvedValueOnce({ data: null, error: { code: 'OFFLINE' } }).mockResolvedValueOnce({ data: [], error: null });
    const { result } = setup();
    await expect(result.current.loadProfiles()).rejects.toThrow('PROFILE_READ_UNAVAILABLE');
    await act(async () => { expect(await result.current.loadProfiles()).toEqual([]); });
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('separates concurrent identities and ignores an old identity response', async () => {
    let finishOld!: (v: unknown) => void;
    read.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
      .mockResolvedValueOnce({ data: [], error: null });
    const { result, owner, setProfiles } = setup();
    const old = result.current.loadProfiles(); owner.current = 'owner-b';
    await act(async () => { await result.current.loadProfiles(); });
    expect(read).toHaveBeenCalledTimes(2); expect(setProfiles).toHaveBeenCalledTimes(1);
    await act(async () => { finishOld({ data: [{ id: 'owner-a' }], error: null }); await old; });
    expect(setProfiles).toHaveBeenCalledTimes(1);
  });
});
