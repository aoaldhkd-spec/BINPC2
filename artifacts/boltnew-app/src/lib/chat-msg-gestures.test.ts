import { describe, it, expect } from 'vitest';
import {
  SWIPE_REPLY_PX,
  clampSwipeOffset,
  contextMenuShowsDelete,
  shouldCancelLongPress,
  shouldCommitSwipeReply,
  shouldTreatAsHorizontalSwipe,
} from './chat-msg-gestures';

describe('shouldCommitSwipeReply', () => {
  it('does not attach reply when swiping is still false (the production bug)', () => {
    expect(shouldCommitSwipeReply(false, 60)).toBe(false);
    expect(shouldCommitSwipeReply(false, SWIPE_REPLY_PX)).toBe(false);
  });

  it('attaches reply after a real horizontal swipe of 55px+', () => {
    expect(shouldCommitSwipeReply(true, 55)).toBe(true);
    expect(shouldCommitSwipeReply(true, -60)).toBe(true);
    expect(shouldCommitSwipeReply(true, 40)).toBe(false);
  });
});

describe('shouldTreatAsHorizontalSwipe', () => {
  it('lets vertical scroll win when dy dominates', () => {
    expect(shouldTreatAsHorizontalSwipe(8, 20, false)).toBe(false);
  });

  it('starts a swipe when dx dominates', () => {
    expect(shouldTreatAsHorizontalSwipe(30, 4, false)).toBe(true);
  });

  it('keeps an in-progress swipe even if the finger drifts vertically', () => {
    expect(shouldTreatAsHorizontalSwipe(40, 50, true)).toBe(true);
  });
});

describe('clampSwipeOffset', () => {
  it('caps visual offset at 72px', () => {
    expect(clampSwipeOffset(200)).toBe(72);
    expect(clampSwipeOffset(-200)).toBe(-72);
  });
});

describe('shouldCancelLongPress', () => {
  it('cancels when the finger moves more than 10px', () => {
    expect(shouldCancelLongPress(11, 0)).toBe(true);
    expect(shouldCancelLongPress(0, 3)).toBe(false);
  });
});

describe('contextMenuShowsDelete', () => {
  it('shows 삭제 only for own messages', () => {
    expect(contextMenuShowsDelete(true)).toBe(true);
    expect(contextMenuShowsDelete(false)).toBe(false);
  });
});
