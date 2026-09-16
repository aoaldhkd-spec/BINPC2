const KEY_PREFIX = 'binpc2_coach_marks_v5_';
const COMPLETE_KEY = 'binpc2_coach_marks_completed';
/** Only the participant home tour (or explicit COMPLETE_KEY) counts as done. */
const PROFILE_COMPLETE_KEYS = [
  `${KEY_PREFIX}profiles`,
  'binpc2_coach_marks_v4_profiles',
  'binpc2_coach_marks_v3_profiles',
] as const;

/** Keys wiped on admin reset / new registration so tip 1 can show again. */
export const COACH_STORAGE_KEYS_TO_CLEAR = [COMPLETE_KEY, ...PROFILE_COMPLETE_KEYS] as const;

export function hasCompletedFirstEntryCoach(): boolean {
  try {
    if (localStorage.getItem(COMPLETE_KEY) === '1') return true;
    for (const key of PROFILE_COMPLETE_KEYS) {
      if (localStorage.getItem(key) === '1') return true;
    }
    return false;
  } catch { return false; }
}

export function markFirstEntryCoachSeen(tab = 'profiles'): void {
  try {
    localStorage.setItem(`${KEY_PREFIX}${tab}`, '1');
    localStorage.setItem(COMPLETE_KEY, '1');
  } catch { /* private mode */ }
}

/** True until the participant home tour is finished or skipped. */
export function isFirstEntryCoachPending(): boolean {
  return !hasCompletedFirstEntryCoach();
}

/** Clear completion so Settings replay / tests can re-open tip 1. */
export function clearFirstEntryCoachSeen(): void {
  try {
    localStorage.removeItem(COMPLETE_KEY);
    for (const key of PROFILE_COMPLETE_KEYS) localStorage.removeItem(key);
    localStorage.removeItem(`${KEY_PREFIX}profiles`);
  } catch { /* private mode */ }
}
