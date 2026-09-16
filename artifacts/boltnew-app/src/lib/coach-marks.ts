const KEY_PREFIX = 'binpc2_coach_marks_v5_';
const COMPLETE_KEY = 'binpc2_coach_marks_completed';

export function hasCompletedFirstEntryCoach(): boolean {
  try {
    if (localStorage.getItem(COMPLETE_KEY) === '1') return true;
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i) ?? '';
      if (key.startsWith('binpc2_coach_marks_') && localStorage.getItem(key) === '1') return true;
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
