import { describe, it, expect } from 'vitest';
import {
  shouldShowWaitingOverlay,
  shouldShowNicknameSetup,
  shouldShowRecoveryScreen,
  shouldAutoSkipWaiting,
  shouldApplyAdminResetSignal,
} from './entry-gate';

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

  it('skips landing after recovery (shownWaiting)', () => {
    expect(shouldShowWaitingOverlay({
      shownWaiting: true,
      currentUserId: null,
      hasValidProfile: false,
    })).toBe(false);
  });

  it('shows landing when a tester goes back from nickname setup', () => {
    expect(shouldShowWaitingOverlay({
      shownWaiting: false,
      currentUserId: null,
      hasValidProfile: false,
      isTester: true,
    })).toBe(true);
  });
});

describe('shouldAutoSkipWaiting', () => {
  it('skips waiting only when the session turns on', () => {
    expect(shouldAutoSkipWaiting({
      sessionActive: true,
      wasSessionActive: false,
      hasStoredUser: false,
    })).toBe(true);
  });

  it('does not skip waiting on later settings updates while the session stays on', () => {
    expect(shouldAutoSkipWaiting({
      sessionActive: true,
      wasSessionActive: true,
      hasStoredUser: false,
    })).toBe(false);
  });

  it('does not skip waiting on first load or for stored accounts', () => {
    expect(shouldAutoSkipWaiting({
      sessionActive: true,
      wasSessionActive: null,
      hasStoredUser: false,
    })).toBe(false);
    expect(shouldAutoSkipWaiting({
      sessionActive: true,
      wasSessionActive: false,
      hasStoredUser: true,
    })).toBe(false);
  });
});

describe('shouldShowNicknameSetup', () => {
  it('shows nickname setup for a true first visit', () => {
    expect(shouldShowNicknameSetup({
      currentUserId: null,
      hasValidProfile: false,
      view: 'entry-1',
      shownWaiting: true,
    })).toBe(true);
  });

  it('skips nickname setup after going back to the waiting landing', () => {
    expect(shouldShowNicknameSetup({
      currentUserId: null,
      hasValidProfile: false,
      view: 'entry-1',
      shownWaiting: false,
    })).toBe(false);
  });

  it('skips nickname setup when already identified (dummy / recovery / revisit)', () => {
    expect(shouldShowNicknameSetup({
      currentUserId: 'dummy-1',
      hasValidProfile: false,
      view: 'entry-1',
    })).toBe(false);
    expect(shouldShowNicknameSetup({
      currentUserId: 'user-1',
      hasValidProfile: true,
      view: 'entry-1',
    })).toBe(false);
  });

  it('skips nickname setup while loading or on recovery', () => {
    expect(shouldShowNicknameSetup({
      currentUserId: null,
      hasValidProfile: false,
      view: 'loading-main',
    })).toBe(false);
    expect(shouldShowNicknameSetup({
      currentUserId: null,
      hasValidProfile: false,
      view: 'entry-recover',
    })).toBe(false);
  });
});

describe('shouldShowRecoveryScreen', () => {
  it('shows recovery after a failed profile check or explicit recover view', () => {
    expect(shouldShowRecoveryScreen({
      hasValidProfile: false,
      profileBoot: 'recover',
      view: 'loading-main',
    })).toBe(true);
    expect(shouldShowRecoveryScreen({
      hasValidProfile: false,
      profileBoot: 'register',
      view: 'entry-recover',
    })).toBe(true);
  });

  it('skips recovery while the stored account is still being checked', () => {
    expect(shouldShowRecoveryScreen({
      hasValidProfile: false,
      profileBoot: 'checking',
      view: 'entry-recover',
    })).toBe(false);
  });

  it('skips recovery when a complete profile is already known', () => {
    expect(shouldShowRecoveryScreen({
      hasValidProfile: true,
      profileBoot: 'ok',
      view: 'entry-recover',
    })).toBe(false);
    expect(shouldShowRecoveryScreen({
      hasValidProfile: true,
      profileBoot: 'recover',
      view: 'entry-recover',
    })).toBe(false);
  });
});


describe('shouldApplyAdminResetSignal', () => {
  it('fires when server differs', () => {
    expect(shouldApplyAdminResetSignal('r2', 'r1')).toBe(true);
    expect(shouldApplyAdminResetSignal('r1', 'r1')).toBe(false);
    expect(shouldApplyAdminResetSignal(null, 'r1')).toBe(false);
  });
});
