// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({
  getSseToken: vi.fn(() => null),
  fetchAndSetSseToken: vi.fn().mockResolvedValue(undefined),
}));

import { getPushOptIn, setPushOptIn, currentPushStatus, requestPushPermissionFromClick } from './webPush';

describe('BINPC2 phone notification opt-in', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true, value: { register: vi.fn() },
    });
    Object.defineProperty(window, 'PushManager', { configurable: true, value: {} });
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: {
        permission: 'default',
        requestPermission: vi.fn().mockResolvedValue('granted'),
      },
    });
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true, value: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit Chrome/124',
    });
  });

  it('does not opt a new participant in without an explicit choice', () => {
    expect(getPushOptIn('new-user')).toBe(false);
    setPushOptIn('new-user', true);
    expect(getPushOptIn('new-user')).toBe(true);
    setPushOptIn('new-user', false);
    expect(getPushOptIn('new-user')).toBe(false);
    expect(getPushOptIn('different-user')).toBe(false);
  });

  it('allows Android browser notification permission and invokes request synchronously', async () => {
    expect(currentPushStatus().code).toBe('permission-required');
    const pending = requestPushPermissionFromClick();
    expect(window.Notification.requestPermission).toHaveBeenCalledTimes(1);
    expect((await pending).code).toBe('registering');
  });

  it('never prompts again when permission was already denied', async () => {
    Object.defineProperty(window, 'Notification', {
      configurable: true, value: { permission: 'denied', requestPermission: vi.fn() },
    });
    expect((await requestPushPermissionFromClick()).code).toBe('blocked');
    expect(window.Notification.requestPermission).not.toHaveBeenCalled();
  });
});
