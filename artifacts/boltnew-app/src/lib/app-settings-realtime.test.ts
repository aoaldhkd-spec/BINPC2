import { describe, expect, it } from 'vitest';
import { planAppSettingsRealtimeUpdate } from './app-settings-realtime';

describe('planAppSettingsRealtimeUpdate', () => {
  it('returns reset when admin reset_signal changes', () => {
    const plan = planAppSettingsRealtimeUpdate(
      { reset_signal: 'r2', session_active: true },
      {
        localReset: 'r1',
        wasSessionActive: true,
        hasStoredUser: true,
      },
    );
    expect(plan).toEqual({ kind: 'reset', resetSignal: 'r2' });
  });

  it('plans session on→off returnToWaiting and timers', () => {
    const plan = planAppSettingsRealtimeUpdate(
      {
        session_active: false,
        timer_end_at: 't1',
        timer_label: 'L',
        reset_signal: 'r1',
        functions_locked: true,
      },
      {
        localReset: 'r1',
        wasSessionActive: true,
        hasStoredUser: true,
      },
    );
    expect(plan.kind).toBe('patch');
    if (plan.kind !== 'patch') return;
    expect(plan.setSessionActive).toBe(true);
    expect(plan.sessionActive).toBe(false);
    expect(plan.returnToWaiting).toBe(true);
    expect(plan.autoSkipWaiting).toBe(false);
    expect(plan.timerEndAt).toBe('t1');
    expect(plan.timerLabel).toBe('L');
    expect(plan.hasFunctionsLocked).toBe(true);
    expect(plan.functionsLockedRaw).toBe(true);
  });

  it('plans autoSkipWaiting only on false→true without stored user', () => {
    const plan = planAppSettingsRealtimeUpdate(
      { session_active: true, reset_signal: null },
      {
        localReset: null,
        wasSessionActive: false,
        hasStoredUser: false,
      },
    );
    expect(plan.kind).toBe('patch');
    if (plan.kind !== 'patch') return;
    expect(plan.autoSkipWaiting).toBe(true);
    expect(plan.returnToWaiting).toBe(false);
  });

  it('ignores leftover entry_password on SSE settings', () => {
    const plan = planAppSettingsRealtimeUpdate(
      { entry_password: 'pin', reset_signal: null },
      {
        localReset: null,
        wasSessionActive: null,
        hasStoredUser: false,
      },
    );
    expect(plan.kind).toBe('patch');
    if (plan.kind !== 'patch') return;
    expect('hasEntryPassword' in plan).toBe(false);
    expect('entryPassword' in plan).toBe(false);
    expect('entryVerified' in plan).toBe(false);
  });
});
