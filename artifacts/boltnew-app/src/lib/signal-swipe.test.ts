import { describe, expect, it } from 'vitest';
import {
  SWIPE_COMMIT_PX,
  SWIPE_FLICK_MIN_PX,
  SWIPE_VELOCITY_PX_MS,
  cardRotateDeg,
  cardTransform,
  nextCardScale,
  shouldCommitSwipe,
  stampOpacity,
  swipeExitX,
  pinRestoredCard,
  updateSwipeVelocity,
} from './signal-swipe';

describe('shouldCommitSwipe', () => {
  it('springs back under the distance threshold without a flick', () => {
    expect(shouldCommitSwipe(40, 0)).toBeNull();
    expect(shouldCommitSwipe(-40, 0)).toBeNull();
    expect(shouldCommitSwipe(SWIPE_COMMIT_PX - 1, 0.1)).toBeNull();
  });

  it('commits by distance: right = signal, left = pass', () => {
    expect(shouldCommitSwipe(SWIPE_COMMIT_PX, 0)).toBe('right');
    expect(shouldCommitSwipe(-SWIPE_COMMIT_PX, 0)).toBe('left');
    expect(shouldCommitSwipe(180, 0)).toBe('right');
    expect(shouldCommitSwipe(-180, 0)).toBe('left');
  });

  it('commits a short flick with enough velocity', () => {
    expect(shouldCommitSwipe(SWIPE_FLICK_MIN_PX, SWIPE_VELOCITY_PX_MS)).toBe('right');
    expect(shouldCommitSwipe(-SWIPE_FLICK_MIN_PX, -SWIPE_VELOCITY_PX_MS)).toBe('left');
    expect(shouldCommitSwipe(SWIPE_FLICK_MIN_PX, 0.1)).toBeNull();
  });
});

describe('stamps + stack preview', () => {
  it('fades only the matching direction stamp', () => {
    expect(stampOpacity(0, 'left')).toBe(0);
    expect(stampOpacity(0, 'right')).toBe(0);
    expect(stampOpacity(-SWIPE_COMMIT_PX, 'left')).toBe(1);
    expect(stampOpacity(-SWIPE_COMMIT_PX, 'right')).toBe(0);
    expect(stampOpacity(SWIPE_COMMIT_PX, 'right')).toBe(1);
    expect(stampOpacity(SWIPE_COMMIT_PX, 'left')).toBe(0);
    expect(stampOpacity(-48, 'left')).toBeCloseTo(0.5, 5);
  });

  it('scales the next card up as the front card leaves', () => {
    expect(nextCardScale(0)).toBeCloseTo(0.92, 5);
    expect(nextCardScale(SWIPE_COMMIT_PX)).toBe(1);
    expect(nextCardScale(-SWIPE_COMMIT_PX)).toBe(1);
  });
});

describe('transform helpers', () => {
  it('rotates slightly with drag and uses GPU-friendly translate3d', () => {
    expect(cardRotateDeg(88)).toBeGreaterThan(0);
    expect(cardRotateDeg(-88)).toBeLessThan(0);
    expect(cardTransform(50)).toContain('translate3d(50px');
    expect(cardTransform(50)).toContain('rotate(');
  });

  it('flies the card past the deck width', () => {
    expect(swipeExitX('right', 320)).toBeGreaterThan(320);
    expect(swipeExitX('left', 320)).toBeLessThan(-320);
  });

  it('smooths velocity samples', () => {
    const vx = updateSwipeVelocity(0, 20, 16);
    expect(vx).toBeGreaterThan(0);
    expect(updateSwipeVelocity(1, 20, 0)).toBe(1);
  });
});

describe('pinRestoredCard', () => {
  it('moves the failed persist card back to the front', () => {
    const deck = [{ profileId: 'alpha' }, { profileId: 'beta' }, { profileId: 'gamma' }];
    expect(pinRestoredCard(deck, 'beta').map((c) => c.profileId)).toEqual(['beta', 'alpha', 'gamma']);
    expect(pinRestoredCard(deck, null)).toBe(deck);
    expect(pinRestoredCard(deck, 'alpha')).toBe(deck);
  });
});
