import { describe, expect, it } from 'vitest';
import {
  clampIntegrityScanIntervalMs,
  clampIntegrityScanMaxRows,
  INTEGRITY_SCAN_INTERVAL_MS_DEFAULT,
  INTEGRITY_SCAN_MAX_ROWS_DEFAULT,
} from './db-integrity.js';

describe('integrity scan env clamps', () => {
  it('clampIntegrityScanMaxRows floors and defaults', () => {
    expect(clampIntegrityScanMaxRows(12.9)).toBe(12);
    expect(clampIntegrityScanMaxRows(0)).toBe(1);
    expect(clampIntegrityScanMaxRows(Number.NaN)).toBe(INTEGRITY_SCAN_MAX_ROWS_DEFAULT);
  });

  it('clampIntegrityScanIntervalMs enforces 30s floor', () => {
    expect(clampIntegrityScanIntervalMs(1000)).toBe(30_000);
    expect(clampIntegrityScanIntervalMs(60_000.7)).toBe(60_000);
    expect(clampIntegrityScanIntervalMs(Number.NaN)).toBe(INTEGRITY_SCAN_INTERVAL_MS_DEFAULT);
  });
});
