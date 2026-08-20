/**
 * Signal deck swipe physics (Tinder-like).
 * Side effects (pass / send) stay in SignalTab — this file is gesture math only.
 */

export const SWIPE_COMMIT_PX = 96;
export const SWIPE_FLICK_MIN_PX = 40;
export const SWIPE_VELOCITY_PX_MS = 0.55;
export const SWIPE_ACTIVATE_PX = 10;
export const SWIPE_EXIT_MS = 320;
export const SWIPE_SPRING_MS = 340;
export const SWIPE_EXIT_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
export const SWIPE_SPRING_EASE = 'cubic-bezier(0.34, 1.25, 0.64, 1)';
export const SWIPE_ROTATE_DIVISOR = 20;
export const SWIPE_MAX_ROTATE_DEG = 16;
export const SWIPE_STACK_SCALE = 0.92;
export const SWIPE_THIRD_SCALE = 0.86;
export const SWIPE_STACK_LIFT = 16;
export const SWIPE_DRAG_LIFT = 0.035;

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

export function thirdCardScale(dx: number): number {
  const peek = nextCardPeek(dx);
  return SWIPE_THIRD_SCALE + (SWIPE_STACK_SCALE - SWIPE_THIRD_SCALE) * peek;
}

export function stackCardTransform(dx: number, scale: number): string {
  const lift = (1 - scale) * SWIPE_STACK_LIFT;
  return `translate3d(0, ${lift}px, 0) scale(${scale})`;
}

export function nextCardTransform(dx: number): string {
  return stackCardTransform(dx, nextCardScale(dx));
}

export function thirdCardTransform(dx: number): string {
  return stackCardTransform(dx, thirdCardScale(dx));
}

export function updateSwipeVelocity(prevVx: number, sampleDx: number, dtMs: number): number {
  if (dtMs <= 0 || dtMs > 80) return prevVx;
  const inst = sampleDx / dtMs;
  return prevVx * 0.55 + inst * 0.45;
}

export function cardTransform(dx: number): string {
  const liftY = -Math.abs(dx) * SWIPE_DRAG_LIFT;
  return `translate3d(${dx}px, ${liftY}px, 0) rotate(${cardRotateDeg(dx)}deg)`;
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
