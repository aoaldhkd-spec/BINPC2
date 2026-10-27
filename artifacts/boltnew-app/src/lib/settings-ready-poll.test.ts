import { describe, it, expect } from 'vitest';
import {
  settingsReadyPollGapMs,
  shouldRunSettingsReadyPoll,
  SETTINGS_READY_POLL_HEALTHY_MS,
  SETTINGS_READY_POLL_UNHEALTHY_MS,
} from './settings-ready-poll';

describe('settingsReadyPollGapMs', () => {
  it('slows when SSE healthy', () => {
    expect(settingsReadyPollGapMs(true)).toBe(SETTINGS_READY_POLL_HEALTHY_MS);
    expect(settingsReadyPollGapMs(false)).toBe(SETTINGS_READY_POLL_UNHEALTHY_MS);
  });
});

describe('shouldRunSettingsReadyPoll', () => {
  it('does not start a second settings poll while the first request is pending', () => {
    expect(shouldRunSettingsReadyPoll({
      now: 100_000, lastReadyAt: 0, sseHealthy: false, inFlight: true,
    })).toBe(false);
    expect(shouldRunSettingsReadyPoll({
      now: 100_000, lastReadyAt: 0, sseHealthy: true, inFlight: true,
    })).toBe(false);
    // After success, timeout, or fetch rejection, the caller releases the flag.
    expect(shouldRunSettingsReadyPoll({
      now: 100_000, lastReadyAt: 0, sseHealthy: false, inFlight: false,
    })).toBe(true);
  });

  it('respects gap', () => {
    expect(shouldRunSettingsReadyPoll({
      now: 14_000,
      lastReadyAt: 9_000,
      sseHealthy: false,
    })).toBe(true);
    expect(shouldRunSettingsReadyPoll({
      now: 12_000,
      lastReadyAt: 9_000,
      sseHealthy: false,
    })).toBe(false);
    expect(shouldRunSettingsReadyPoll({
      now: 40_000,
      lastReadyAt: 9_000,
      sseHealthy: true,
    })).toBe(true);
    expect(shouldRunSettingsReadyPoll({
      now: 20_000,
      lastReadyAt: 9_000,
      sseHealthy: true,
    })).toBe(false);
  });
});
