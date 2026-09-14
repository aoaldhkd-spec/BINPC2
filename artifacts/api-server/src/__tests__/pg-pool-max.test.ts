import { describe, expect, it } from 'vitest';
import { PG_POOL_HARD_CAP, resolvePgPoolMax } from '../lib/pg-pool.js';

describe('resolvePgPoolMax', () => {
  it('defaults to hard cap when unset/empty', () => {
    expect(resolvePgPoolMax(undefined)).toBe(PG_POOL_HARD_CAP);
    expect(resolvePgPoolMax('')).toBe(PG_POOL_HARD_CAP);
  });

  it('hard-caps values above safe max (stale Render env)', () => {
    expect(resolvePgPoolMax('24')).toBe(PG_POOL_HARD_CAP);
    expect(resolvePgPoolMax('100')).toBe(PG_POOL_HARD_CAP);
  });

  it('allows lower values and rejects non-finite', () => {
    expect(resolvePgPoolMax('4')).toBe(4);
    expect(resolvePgPoolMax('1')).toBe(1);
    expect(resolvePgPoolMax('0')).toBe(1);
    expect(resolvePgPoolMax('-3')).toBe(1);
    expect(resolvePgPoolMax('nope')).toBe(PG_POOL_HARD_CAP);
  });
});
