import { describe, it, expect } from 'vitest';
import {
  shouldShowWaitingOverlay,
  shouldShowEntryGate,
  shouldShowNicknameSetup,
  shouldShowRecoveryScreen,
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

describe('shouldShowEntryGate', () => {
  it('shows PIN only for unidentified visitors when a code is set', () => {
    expect(shouldShowEntryGate({
      entryPassword: '0816',
      entryVerified: false,
      currentUserId: null,
    })).toBe(true);
  });

  it('skips PIN when already verified or no code', () => {
    expect(shouldShowEntryGate({
      entryPassword: '0816',
      entryVerified: true,
      currentUserId: null,
    })).toBe(false);
    expect(shouldShowEntryGate({
      entryPassword: '',
      entryVerified: false,
      currentUserId: null,
    })).toBe(false);
    expect(shouldShowEntryGate({
      entryPassword: null,
      entryVerified: false,
      currentUserId: null,
    })).toBe(false);
  });

  it('skips PIN for dummy / stored account / tester even if not verified yet', () => {
    expect(shouldShowEntryGate({
      entryPassword: '0816',
      entryVerified: false,
      currentUserId: 'dummy-1',
    })).toBe(false);
    expect(shouldShowEntryGate({
      entryPassword: '0816',
      entryVerified: false,
      currentUserId: null,
      isTester: true,
    })).toBe(false);
  });
});

describe('shouldShowNicknameSetup', () => {
  it('shows nickname setup for a true first visit', () => {
    expect(shouldShowNicknameSetup({
      currentUserId: null,
      hasValidProfile: false,
      view: 'entry-1',
    })).toBe(true);
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
