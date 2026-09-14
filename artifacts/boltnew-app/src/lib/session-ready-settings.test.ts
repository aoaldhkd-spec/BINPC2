import { describe, it, expect } from 'vitest';
import { planSessionReadySettingsPatch } from './session-ready-settings';

describe('planSessionReadySettingsPatch', () => {
  it('returns null for empty/invalid', () => {
    expect(planSessionReadySettingsPatch(null)).toBeNull();
    expect(planSessionReadySettingsPatch(undefined)).toBeNull();
    expect(planSessionReadySettingsPatch({})).toBeNull();
  });

  it('maps session_active + functions_locked without timers by default', () => {
    const p = planSessionReadySettingsPatch({
      session_active: true,
      functions_locked: '1',
      timer_end_at: 'x',
      timer_label: 'y',
    });
    expect(p).toEqual({
      sessionActive: true,
      hasFunctionsLocked: true,
      functionsLockedRaw: '1',
      includeTimers: false,
    });
  });

  it('includes timers when requested', () => {
    const p = planSessionReadySettingsPatch(
      { session_active: false, timer_end_at: 't1', timer_label: null },
      { includeTimers: true },
    );
    expect(p?.sessionActive).toBe(false);
    expect(p?.includeTimers).toBe(true);
    expect(p?.timerEndAt).toBe('t1');
    expect(p?.timerLabel).toBeNull();
  });

  it('returns timers-only patch when includeTimers and no other fields', () => {
    const p = planSessionReadySettingsPatch({ timer_end_at: null }, { includeTimers: true });
    expect(p).toEqual({
      hasFunctionsLocked: false,
      includeTimers: true,
      timerEndAt: null,
      timerLabel: null,
    });
  });
});
