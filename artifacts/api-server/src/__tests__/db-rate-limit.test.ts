import { describe, it, expect } from 'vitest';
import { consumeRateLimit, pruneRateMap } from '../lib/db-rate-limit.js';

describe('consumeRateLimit', () => {
  it('allows up to max then limits', () => {
    const map = new Map();
    expect(consumeRateLimit(map, 'ip', { now: 1000, windowMs: 1000, max: 2 })).toBe('ok');
    expect(consumeRateLimit(map, 'ip', { now: 1000, windowMs: 1000, max: 2 })).toBe('ok');
    expect(consumeRateLimit(map, 'ip', { now: 1000, windowMs: 1000, max: 2 })).toBe('limited');
  });

  it('resets after window', () => {
    const map = new Map();
    consumeRateLimit(map, 'ip', { now: 1000, windowMs: 100, max: 1 });
    expect(consumeRateLimit(map, 'ip', { now: 1000, windowMs: 100, max: 1 })).toBe('limited');
    expect(consumeRateLimit(map, 'ip', { now: 1101, windowMs: 100, max: 1 })).toBe('ok');
  });

  it('rejects new keys when map is full', () => {
    const map = new Map();
    consumeRateLimit(map, 'a', { now: 1, windowMs: 1000, max: 10, maxMapSize: 1 });
    expect(consumeRateLimit(map, 'b', { now: 1, windowMs: 1000, max: 10, maxMapSize: 1 })).toBe('map_full');
  });

  it('pruneRateMap removes expired buckets', () => {
    const map = new Map();
    consumeRateLimit(map, 'ip', { now: 1, windowMs: 10, max: 3 });
    pruneRateMap(map, 20);
    expect(map.size).toBe(0);
  });
});
