/**
 * Pure plan + thin runner for admin reset_signal wipe.
 * App/SSE only supply side-effect deps — no identity logic re-bundled into a god-hook.
 */
import {
  MATCHING_DRAFT_KEY,
  MATCHING_LAST_RESET_KEY,
  MATCHING_PROFILES_CACHE_KEY,
  MATCHING_USER_KEY,
} from './constants';
import { COACH_STORAGE_KEYS_TO_CLEAR } from './coach-marks';

export type AdminResetWipePlan = {
  serverReset: string;
  lastResetKey: typeof MATCHING_LAST_RESET_KEY;
  storageKeysToRemove: readonly string[];
  clearGroupLastReads: true;
  nextView: 'entry-1';
  reloadProfiles: true;
};

/** What client state/storage to clear when admin bumps reset_signal (event-end / wipe). */
export function planAdminResetWipe(serverReset: string): AdminResetWipePlan {
  return {
    serverReset,
    lastResetKey: MATCHING_LAST_RESET_KEY,
    storageKeysToRemove: [
      MATCHING_USER_KEY,
      MATCHING_DRAFT_KEY,
      MATCHING_PROFILES_CACHE_KEY,
      ...COACH_STORAGE_KEYS_TO_CLEAR,
    ],
    clearGroupLastReads: true,
    nextView: 'entry-1',
    reloadProfiles: true,
  };
}

export type AdminResetWipeDeps = {
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clearAllGroupLastReads: () => void;
  setCurrentUserId: (id: null) => void;
  setShownWaiting: (v: boolean) => void;
  setProfilesEmpty: () => void;
  clearHeartsAndChats: () => void;
  setActiveNotif: (n: null) => void;
  /** App keeps loadProfilesRef.current() so event-end still reloads deck. */
  reloadProfiles: () => void;
  setView: (view: 'entry-1') => void;
};

export function runAdminResetWipe(plan: AdminResetWipePlan, deps: AdminResetWipeDeps): void {
  deps.setItem(plan.lastResetKey, plan.serverReset);
  for (const key of plan.storageKeysToRemove) deps.removeItem(key);
  if (plan.clearGroupLastReads) deps.clearAllGroupLastReads();
  deps.setCurrentUserId(null);
  deps.setShownWaiting(false);
  deps.setProfilesEmpty();
  deps.clearHeartsAndChats();
  deps.setActiveNotif(null);
  if (plan.reloadProfiles) deps.reloadProfiles();
  deps.setView(plan.nextView);
}
