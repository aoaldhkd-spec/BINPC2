import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearFirstEntryCoachSeen,
  hasCompletedFirstEntryCoach,
  isFirstEntryCoachPending,
  isHomeCoachPending,
  markFirstEntryCoachSeen,
  markHomeCoachDone,
} from './coach-marks';

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  const memory = {
    get length() { return store.size; },
    clear() { store.clear(); },
    getItem(key: string) { return store.has(key) ? store.get(key)! : null; },
    setItem(key: string, value: string) { store.set(key, String(value)); },
    removeItem(key: string) { store.delete(key); },
    key(index: number) { return [...store.keys()][index] ?? null; },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: memory, configurable: true });
}

describe('coach-marks pending gate', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    localStorage.clear();
  });

  it('starts pending until marked seen', () => {
    expect(isFirstEntryCoachPending()).toBe(true);
    expect(isHomeCoachPending()).toBe(true);
    expect(hasCompletedFirstEntryCoach()).toBe(false);
    markFirstEntryCoachSeen('profiles');
    expect(isFirstEntryCoachPending()).toBe(false);
    expect(isHomeCoachPending()).toBe(false);
    expect(hasCompletedFirstEntryCoach()).toBe(true);
  });

  it('home done unlocks other tabs without completing the full tour', () => {
    expect(isHomeCoachPending()).toBe(true);
    markHomeCoachDone();
    expect(isHomeCoachPending()).toBe(false);
    expect(isFirstEntryCoachPending()).toBe(true);
    expect(hasCompletedFirstEntryCoach()).toBe(false);
  });

  it('ignores non-profiles legacy tab keys so tip 1 is not skipped', () => {
    localStorage.setItem('binpc2_coach_marks_v5_my', '1');
    localStorage.setItem('binpc2_coach_marks_v4_settings', '1');
    expect(hasCompletedFirstEntryCoach()).toBe(false);
    expect(isFirstEntryCoachPending()).toBe(true);
  });

  it('honors legacy profiles completion keys', () => {
    localStorage.setItem('binpc2_coach_marks_v4_profiles', '1');
    expect(hasCompletedFirstEntryCoach()).toBe(true);
    clearFirstEntryCoachSeen();
    expect(hasCompletedFirstEntryCoach()).toBe(false);
  });
});
