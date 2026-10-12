// @vitest-environment happy-dom
import { afterEach, describe, it, expect, vi } from 'vitest';
vi.mock('./supabase', () => ({ fetchAndSetSseToken: vi.fn(), getSseToken: vi.fn() }));
import { currentPushStatus } from './webPush';
afterEach(() => vi.restoreAllMocks());
function platform(ua: string, standalone: boolean, permission = 'default') {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {} });
  Object.defineProperty(navigator, 'platform', { configurable: true, value: 'Linux' });
  Object.defineProperty(navigator, 'standalone', { configurable: true, value: standalone });
  Object.defineProperty(window, 'PushManager', { configurable: true, value: function() {} });
  Object.defineProperty(window, 'Notification', { configurable: true, value: { permission } });
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: standalone } as MediaQueryList);
}
describe('mobile web push capabilities', () => {
  it('does not reject Android web merely because not installed', () => { platform('Android Chrome', false); expect(currentPushStatus().code).toBe('permission-required'); });
  it('explains iPhone home-screen requirement before unsupported status', () => { platform('iPhone Safari', false); expect(currentPushStatus().code).toBe('install-required'); });
  it('registers an installed permitted iPhone', () => { platform('iPhone Safari', true, 'granted'); expect(currentPushStatus().code).toBe('registering'); });
  it('does not pretend permission denied is connected', () => { platform('Android Chrome', false, 'denied'); expect(currentPushStatus().code).toBe('blocked'); });
});
