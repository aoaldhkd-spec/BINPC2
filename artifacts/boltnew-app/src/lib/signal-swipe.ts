/**
 * Signal deck swipe physics (Tinder-like).
 * Side effects (pass / send) stay in SignalTab — this file is gesture math only.
 */

export const SWIPE_COMMIT_PX = 96;
export const SWIPE_FLICK_MIN_PX = 40;
export const SWIPE_VELOCITY_PX_MS = 0.55;
export const SWIPE_ACTIVATE_PX = 14;
export const SWIPE_EXIT_MS = 280;
export const SWIPE_SPRING_MS = 240;
export const SWIPE_ROTATE_DIVISOR = 22;
export const SWIPE_MAX_ROTATE_DEG = 15;
export const SWIPE_STACK_SCALE = 0.94;
export const SWIPE_STACK_LIFT = 10;

export type SwipeCommit = 'left' | 'right' | null;

export function cardRotateDeg(dx: number): number {
  const raw = dx / SWIPE_ROTATE_DIVISOR;
  return Math.max(-SWIPE_MAX_ROTATE_DEG, Math.min(SWIPE_MAX_ROTATE_DEG, raw));
}

export function stampOpacity(dx: number, side: 'left' | 'right'): number {
  if (side === 'left') return dx >= 0 ? 0 : Math.min(1, -dx / SWIPE_COMMIT_PX);
  return dx <= 0 ? 0 : Math.min(1, dx / SWIPE_COMMIT_PX);
}

export function shouldCommitSwipe(dx: number, vx: number): SwipeCommit {
  if (dx >= SWIPE_COMMIT_PX || (dx >= SWIPE_FLICK_MIN_PX && vx >= SWIPE_VELOCITY_PX_MS)) return 'right';
  if (dx <= -SWIPE_COMMIT_PX || (dx <= -SWIPE_FLICK_MIN_PX && vx <= -SWIPE_VELOCITY_PX_MS)) return 'left';
  return null;
}

export function swipeExitX(dir: 'left' | 'right', width: number): number {
  const travel = Math.max(width, 320) * 1.35;
  return dir === 'right' ? travel : -travel;
}

export function nextCardPeek(dx: number): number {
  return Math.min(1, Math.abs(dx) / SWIPE_COMMIT_PX);
}

export function nextCardScale(dx: number): number {
  return SWIPE_STACK_SCALE + (1 - SWIPE_STACK_SCALE) * nextCardPeek(dx);
}

export function updateSwipeVelocity(prevVx: number, sampleDx: number, dtMs: number): number {
  if (dtMs <= 0 || dtMs > 80) return prevVx;
  const inst = sampleDx / dtMs;
  return prevVx * 0.55 + inst * 0.45;
}

export function cardTransform(dx: number): string {
  return `translate3d(${dx}px, 0, 0) rotate(${cardRotateDeg(dx)}deg)`;
}

/** After a failed send/pass persist, keep that card in front — do not reshuffle it away. */
export function pinRestoredCard<T extends { profileId: string }>(
  deck: T[],
  restoredId: string | null,
): T[] {
  if (!restoredId || deck.length < 2) return deck;
  const idx = deck.findIndex((c) => c.profileId === restoredId);
  if (idx <= 0) return deck;
  const next = deck.slice();
  const [card] = next.splice(idx, 1);
  next.unshift(card);
  return next;
}
