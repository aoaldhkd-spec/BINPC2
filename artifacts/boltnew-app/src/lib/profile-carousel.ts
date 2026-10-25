/**
 * Optional participant-card carousel helpers.
 * Does not alter the existing default profile grid, heart rules or DB state.
 * All positions describe existing sorted/filtered participant data only.
 */
export const CAROUSEL_DOT_LIMIT = 5;
export const CAROUSEL_LOAD_CHUNK = 36;

export function clampCarouselIndex(index: number, total: number): number {
  if (!Number.isFinite(index) || !Number.isFinite(total) || total < 1) return 0;
  return Math.max(0, Math.min(Math.trunc(total) - 1, Math.trunc(index)));
}

export function carouselDotIndices(
  index: number,
  total: number,
  maxDots = CAROUSEL_DOT_LIMIT,
): number[] {
  if (!Number.isInteger(total) || total < 1) return [];
  const safeLimit = Math.max(1, Math.min(7, Math.trunc(maxDots) || CAROUSEL_DOT_LIMIT));
  const count = Math.min(total, safeLimit);
  const current = clampCarouselIndex(index, total);
  const start = Math.max(0, Math.min(total - count, current - Math.floor(count / 2)));
  return Array.from({ length: count }, (_, offset) => start + offset);
}

export function nextCarouselVisibleCount(
  targetIndex: number,
  visibleCount: number,
  total: number,
  chunk = CAROUSEL_LOAD_CHUNK,
): number {
  if (!Number.isInteger(total) || total < 0) return 0;
  const size = Number.isInteger(chunk) && chunk > 0 ? chunk : CAROUSEL_LOAD_CHUNK;
  const current = Math.max(0, Math.min(total, Math.trunc(visibleCount) || 0));
  const target = clampCarouselIndex(targetIndex, total);
  if (current === total || target < current - 2) return current;
  return Math.min(total, current + size);
}
