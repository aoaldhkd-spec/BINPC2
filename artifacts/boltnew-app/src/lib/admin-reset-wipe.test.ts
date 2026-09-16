import { describe, it, expect, vi } from 'vitest';
import {
  planAdminResetWipe,
  runAdminResetWipe,
} from './admin-reset-wipe';
import {
  MATCHING_DRAFT_KEY,
  MATCHING_LAST_RESET_KEY,
  MATCHING_PROFILES_CACHE_KEY,
  MATCHING_USER_KEY,
} from './constants';
import { COACH_STORAGE_KEYS_TO_CLEAR } from './coach-marks';

describe('planAdminResetWipe', () => {
  it('targets identity + cache keys and entry-1', () => {
    const plan = planAdminResetWipe('sig-9');
    expect(plan.serverReset).toBe('sig-9');
    expect(plan.lastResetKey).toBe(MATCHING_LAST_RESET_KEY);
    expect(plan.storageKeysToRemove).toEqual([
      MATCHING_USER_KEY,
      MATCHING_DRAFT_KEY,
      MATCHING_PROFILES_CACHE_KEY,
      ...COACH_STORAGE_KEYS_TO_CLEAR,
    ]);
    expect(plan.clearGroupLastReads).toBe(true);
    expect(plan.reloadProfiles).toBe(true);
    expect(plan.nextView).toBe('entry-1');
  });
});

describe('runAdminResetWipe', () => {
  it('persists reset, clears storage/state, reloads profiles, goes entry-1', () => {
    const removed: string[] = [];
    const setItem = vi.fn();
    const deps = {
      setItem,
      removeItem: (k: string) => { removed.push(k); },
      clearAllGroupLastReads: vi.fn(),
      setCurrentUserId: vi.fn(),
      setShownWaiting: vi.fn(),
      setProfilesEmpty: vi.fn(),
      clearHeartsAndChats: vi.fn(),
      setActiveNotif: vi.fn(),
      reloadProfiles: vi.fn(),
      setView: vi.fn(),
    };
    runAdminResetWipe(planAdminResetWipe('r2'), deps);
    expect(setItem).toHaveBeenCalledWith(MATCHING_LAST_RESET_KEY, 'r2');
    expect(removed).toEqual([
      MATCHING_USER_KEY,
      MATCHING_DRAFT_KEY,
      MATCHING_PROFILES_CACHE_KEY,
      ...COACH_STORAGE_KEYS_TO_CLEAR,
    ]);
    expect(deps.clearAllGroupLastReads).toHaveBeenCalledTimes(1);
    expect(deps.setCurrentUserId).toHaveBeenCalledWith(null);
    expect(deps.setShownWaiting).toHaveBeenCalledWith(false);
    expect(deps.setProfilesEmpty).toHaveBeenCalledTimes(1);
    expect(deps.clearHeartsAndChats).toHaveBeenCalledTimes(1);
    expect(deps.setActiveNotif).toHaveBeenCalledWith(null);
    expect(deps.reloadProfiles).toHaveBeenCalledTimes(1);
    expect(deps.setView).toHaveBeenCalledWith('entry-1');
  });
});
