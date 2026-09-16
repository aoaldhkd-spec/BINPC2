const KEY_PREFIX = 'binpc2_coach_marks_v5_';
const COMPLETE_KEY = 'binpc2_coach_marks_completed';
/** Home (participants) phase finished — unlocks tab navigation for sequential tour. */
const HOME_DONE_KEY = `${KEY_PREFIX}home_done`;
/** Only the participant home tour (or explicit COMPLETE_KEY) counts as done for re-entry skip. */
const PROFILE_COMPLETE_KEYS = [
  `${KEY_PREFIX}profiles`,
  'binpc2_coach_marks_v4_profiles',
  'binpc2_coach_marks_v3_profiles',
] as const;

/** Keys wiped on admin reset / new registration so tip 1 can show again. */
export const COACH_STORAGE_KEYS_TO_CLEAR = [COMPLETE_KEY, HOME_DONE_KEY, ...PROFILE_COMPLETE_KEYS] as const;

export function hasCompletedFirstEntryCoach(): boolean {
  try {
    if (localStorage.getItem(COMPLETE_KEY) === '1') return true;
    for (const key of PROFILE_COMPLETE_KEYS) {
      if (localStorage.getItem(key) === '1') return true;
    }
    return false;
  } catch { return false; }
}

/** True until the full coach tour is finished or skipped (re-entry gate). */
export function isFirstEntryCoachPending(): boolean {
  return !hasCompletedFirstEntryCoach();
}

/**
 * True only while the participant home tips are still running.
 * After home advances to other tabs, users (and coach navigation) may leave profiles.
 */
export function isHomeCoachPending(): boolean {
  try {
    if (hasCompletedFirstEntryCoach()) return false;
    return localStorage.getItem(HOME_DONE_KEY) !== '1';
  } catch {
    return true;
  }
}

export function markHomeCoachDone(): void {
  try {
    localStorage.setItem(HOME_DONE_KEY, '1');
  } catch { /* private mode */ }
}

export function markFirstEntryCoachSeen(tab = 'profiles'): void {
  try {
    localStorage.setItem(`${KEY_PREFIX}${tab}`, '1');
    localStorage.setItem(HOME_DONE_KEY, '1');
    localStorage.setItem(COMPLETE_KEY, '1');
  } catch { /* private mode */ }
}

/** Clear completion so Settings replay / tests can re-open tip 1. */
export function clearFirstEntryCoachSeen(): void {
  try {
    localStorage.removeItem(COMPLETE_KEY);
    localStorage.removeItem(HOME_DONE_KEY);
    for (const key of PROFILE_COMPLETE_KEYS) localStorage.removeItem(key);
    localStorage.removeItem(`${KEY_PREFIX}profiles`);
  } catch { /* private mode */ }
}
