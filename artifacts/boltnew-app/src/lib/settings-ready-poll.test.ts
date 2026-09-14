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
