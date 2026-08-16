import { describe, expect, it } from 'vitest';
import {
  excludeSwipeGestureVerifyProfiles,
  isSwipeGestureVerifyProfile,
  SWIPE_GESTURE_VERIFY_MARKER,
} from '../lib/profile';

describe('swipe-gesture-verify deck filter', () => {
  it('detects leftover Playwright fixtures by bio / interests / nickname blob', () => {
    expect(isSwipeGestureVerifyProfile({ bio: SWIPE_GESTURE_VERIFY_MARKER })).toBe(true);
    expect(isSwipeGestureVerifyProfile({ interests: `#${SWIPE_GESTURE_VERIFY_MARKER}` })).toBe(true);
    expect(isSwipeGestureVerifyProfile({ nickname: '민수', bio: '카페' })).toBe(false);
  });

  it('drops fixtures from the live list but keeps the current smoke-test user', () => {
    const keep = { id: 'me', nickname: 'sg_a_me', bio: SWIPE_GESTURE_VERIFY_MARKER };
    const other = { id: 'other', nickname: 'sg_b_xx', bio: SWIPE_GESTURE_VERIFY_MARKER };
    const real = { id: 'real', nickname: '민수', bio: '카페' };
    expect(excludeSwipeGestureVerifyProfiles([keep, other, real], 'me').map((p) => p.id))
      .toEqual(['me', 'real']);
  });
});
