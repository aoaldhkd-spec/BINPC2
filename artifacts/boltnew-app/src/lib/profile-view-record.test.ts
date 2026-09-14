import { describe, it, expect } from 'vitest';
import { shouldRecordProfileView, PROFILE_VIEW_DEBOUNCE_MS } from './profile-view-record';

describe('shouldRecordProfileView', () => {
  it('skips self and missing viewer', () => {
    expect(shouldRecordProfileView({
      viewerId: null,
      viewedId: 'a',
      lastRecordedAt: 0,
      now: 1,
    })).toBe(false);
    expect(shouldRecordProfileView({
      viewerId: 'a',
      viewedId: 'a',
      lastRecordedAt: 0,
      now: 1,
    })).toBe(false);
  });

  it('debounces within window', () => {
    expect(shouldRecordProfileView({
      viewerId: 'me',
      viewedId: 'u2',
      lastRecordedAt: 1_000,
      now: 1_000 + PROFILE_VIEW_DEBOUNCE_MS - 1,
    })).toBe(false);
    expect(shouldRecordProfileView({
      viewerId: 'me',
      viewedId: 'u2',
      lastRecordedAt: 1_000,
      now: 1_000 + PROFILE_VIEW_DEBOUNCE_MS,
    })).toBe(true);
  });
});
