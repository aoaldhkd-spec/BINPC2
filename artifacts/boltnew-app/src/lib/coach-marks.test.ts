import { beforeEach, describe, expect, it } from 'vitest';
import { hasCompletedFirstEntryCoach, isFirstEntryCoachPending, markFirstEntryCoachSeen } from './coach-marks';

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
    expect(hasCompletedFirstEntryCoach()).toBe(false);
    markFirstEntryCoachSeen('profiles');
    expect(isFirstEntryCoachPending()).toBe(false);
    expect(hasCompletedFirstEntryCoach()).toBe(true);
  });
});
