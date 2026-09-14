import { describe, it, expect } from 'vitest';
import { shouldShowBroadcastNotif, dismissActiveNotifIfMatch } from './notification-active';

describe('notification-active', () => {
  it('only shows active all-target', () => {
    expect(shouldShowBroadcastNotif({ is_active: true, target: 'all' })).toBe(true);
    expect(shouldShowBroadcastNotif({ is_active: false, target: 'all' })).toBe(false);
    expect(shouldShowBroadcastNotif({ is_active: true, target: 'table:1' })).toBe(false);
  });

  it('dismisses matching active', () => {
    expect(dismissActiveNotifIfMatch({ id: 'n1' }, 'n1')).toBeNull();
    expect(dismissActiveNotifIfMatch({ id: 'n1' }, 'n2')).toEqual({ id: 'n1' });
  });
});
