import { describe, it, expect } from 'vitest';
import {
  planReadyBootstrapApply,
  planReadyBootstrapSafety,
  planReadyBootstrapRetry,
  planReadyBootstrapExhausted,
  pickReadyBootstrapSettings,
  raceFirstNonNullSettings,
  READY_BOOTSTRAP_MAX_ATTEMPTS,
} from './ready-bootstrap-settings';

describe('planReadyBootstrapApply', () => {
  it('returns reset when reset_signal changes', () => {
    expect(
      planReadyBootstrapApply(
        { reset_signal: 'r2', session_active: true, entry_password: '' },
        { localReset: 'r1', entryVerifiedStored: null },
      ),
    ).toEqual({ kind: 'reset', resetSignal: 'r2' });
  });

  it('applies session, entry, timers, functions_locked', () => {
    const plan = planReadyBootstrapApply(
      {
        session_active: 1,
        entry_password: 'pin',
        timer_end_at: 't1',
        timer_label: 'L',
        functions_locked: true,
        reset_signal: 'r1',
      },
      { localReset: 'r1', entryVerifiedStored: 'pin' },
    );
    expect(plan).toEqual({
      kind: 'apply',
      sessionActive: true,
      entryPassword: 'pin',
      entryVerified: true,
      timerEndAt: 't1',
      timerLabel: 'L',
      hasFunctionsLocked: true,
      functionsLockedRaw: true,
    });
  });

  it('omits functionsLockedRaw when absent', () => {
    const plan = planReadyBootstrapApply(
      { session_active: false, reset_signal: null },
      { localReset: null, entryVerifiedStored: null },
    );
    expect(plan.kind).toBe('apply');
    if (plan.kind === 'apply') {
      expect(plan.hasFunctionsLocked).toBe(false);
      expect(plan.functionsLockedRaw).toBeUndefined();
      expect(plan.entryVerified).toBe(true);
    }
  });
});

describe('planReadyBootstrapSafety', () => {
  it('coerces session only when no stored user', () => {
    expect(planReadyBootstrapSafety(false).coerceSessionInactiveIfUnset).toBe(true);
    expect(planReadyBootstrapSafety(true).coerceSessionInactiveIfUnset).toBe(false);
  });
});

describe('planReadyBootstrapRetry', () => {
  it('retries with exponential cap then exhausts', () => {
    expect(planReadyBootstrapRetry(0)).toEqual({ kind: 'retry', delayMs: 400, nextAttempt: 1 });
    expect(planReadyBootstrapRetry(3)).toEqual({ kind: 'retry', delayMs: 3200, nextAttempt: 4 });
    expect(planReadyBootstrapRetry(READY_BOOTSTRAP_MAX_ATTEMPTS - 1).kind).toBe('retry');
    expect(planReadyBootstrapRetry(READY_BOOTSTRAP_MAX_ATTEMPTS)).toEqual({ kind: 'exhausted' });
  });
});

describe('planReadyBootstrapExhausted', () => {
  it('forces loading off and inactive empty entry', () => {
    expect(planReadyBootstrapExhausted()).toEqual({
      appLoading: false,
      sessionActive: false,
      entryPassword: '',
    });
  });
});

describe('pickReadyBootstrapSettings', () => {
  it('bootstrap requires ready flag; poll does not', () => {
    const body = { ready: false, settings: { session_active: true } };
    expect(pickReadyBootstrapSettings(body, 'bootstrap')).toBeNull();
    expect(pickReadyBootstrapSettings(body, 'poll')).toEqual({ session_active: true });
    expect(pickReadyBootstrapSettings({ ready: true, settings: { a: 1 } }, 'bootstrap')).toEqual({ a: 1 });
    expect(pickReadyBootstrapSettings(null, 'poll')).toBeNull();
  });
});

describe('raceFirstNonNullSettings', () => {
  it('resolves with the first non-null settings', async () => {
    const slow = new Promise<Record<string, unknown> | null>((resolve) => {
      setTimeout(() => resolve({ from: 'slow' }), 30);
    });
    const fast = Promise.resolve({ from: 'fast' } as Record<string, unknown>);
    await expect(raceFirstNonNullSettings([slow, fast])).resolves.toEqual({ from: 'fast' });
  });

  it('returns null when every source fails', async () => {
    await expect(raceFirstNonNullSettings([
      Promise.resolve(null),
      Promise.reject(new Error('x')).catch(() => null),
    ])).resolves.toBeNull();
  });
});
