import { describe, it, expect } from 'vitest';
import { shouldShowWaitingOverlay } from './entry-gate';

describe('shouldShowWaitingOverlay', () => {
  it('shows landing only for first-time visitors without an account', () => {
    expect(shouldShowWaitingOverlay({
      shownWaiting: false,
      currentUserId: null,
      hasValidProfile: false,
    })).toBe(true);
  });

  it('skips landing for dummy / stored account even if session is not ready', () => {
    expect(shouldShowWaitingOverlay({
      shownWaiting: false,
      currentUserId: 'dummy-1',
      hasValidProfile: true,
    })).toBe(false);
    expect(shouldShowWaitingOverlay({
      shownWaiting: false,
      currentUserId: 'dummy-1',
      hasValidProfile: false,
    })).toBe(false);
  });

  it('skips landing after recovery (shownWaiting) and for testers', () => {
    expect(shouldShowWaitingOverlay({
      shownWaiting: true,
      currentUserId: null,
      hasValidProfile: false,
    })).toBe(false);
    expect(shouldShowWaitingOverlay({
      shownWaiting: false,
      currentUserId: null,
      hasValidProfile: false,
      isTester: true,
    })).toBe(false);
  });
});
