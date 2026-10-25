import { describe, expect, it } from 'vitest';
import {
 CAROUSEL_DOT_LIMIT, CAROUSEL_LOAD_CHUNK, carouselDotIndices,
 clampCarouselIndex, nextCarouselVisibleCount,
} from './profile-carousel';

describe('optional profile card carousel, original grid preserved', () => {
 it('bounds indices and does not create invalid pages', () => {
  expect(clampCarouselIndex(-2, 10)).toBe(0);
  expect(clampCarouselIndex(5.9, 10)).toBe(5);
  expect(clampCarouselIndex(500, 10)).toBe(9);
  expect(clampCarouselIndex(NaN, 10)).toBe(0);
  expect(clampCarouselIndex(100, 0)).toBe(0);
 });
 it('limits indicators for real 150-person events instead of 150 dots', () => {
  expect(CAROUSEL_DOT_LIMIT).toBe(5);
  expect(carouselDotIndices(0, 0)).toEqual([]);
  expect(carouselDotIndices(0, 1)).toEqual([0]);
  expect(carouselDotIndices(2, 5)).toEqual([0, 1, 2, 3, 4]);
  expect(carouselDotIndices(74, 150)).toEqual([72, 73, 74, 75, 76]);
  expect(carouselDotIndices(149, 150)).toEqual([145, 146, 147, 148, 149]);
 });
 it('keeps lazy rendering for 150 users and loads another chunk near the end', () => {
  expect(CAROUSEL_LOAD_CHUNK).toBe(36);
  expect(nextCarouselVisibleCount(0, 36, 150)).toBe(36);
  expect(nextCarouselVisibleCount(33, 36, 150)).toBe(36);
  expect(nextCarouselVisibleCount(34, 36, 150)).toBe(72);
  expect(nextCarouselVisibleCount(71, 72, 150)).toBe(108);
  expect(nextCarouselVisibleCount(149, 144, 150)).toBe(150);
  expect(nextCarouselVisibleCount(0, 150, 150)).toBe(150);
  expect(nextCarouselVisibleCount(0, 0, 0)).toBe(0);
 });
});
