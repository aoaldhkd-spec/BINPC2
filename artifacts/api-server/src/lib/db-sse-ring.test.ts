import { describe, it, expect } from 'vitest';
import { createSseRing } from './db-sse-ring.js';

describe('db-sse-ring', () => {
  it('assigns increasing seq and returns all for broadcastAll targets', () => {
    const ring = createSseRing({ max: 10, ttlMs: 60_000 });
    const a = ring.add('{"a":1}', 'all');
    const b = ring.add('{"b":2}', 'all');
    expect(b).toBe(a + 1);
    expect(ring.getSince(a, 'u1', false).map(e => e.seq)).toEqual([b]);
    expect(ring.latestSeq()).toBe(b);
  });

  it('filters private targets by userId; admin sees all', () => {
    const ring = createSseRing({ max: 10, ttlMs: 60_000 });
    ring.add('pub', 'all');
    const priv = ring.add('priv', ['alice']);
    expect(ring.getSince(0, 'alice', false).map(e => e.seq)).toContain(priv);
    expect(ring.getSince(0, 'bob', false).map(e => e.seq)).not.toContain(priv);
    expect(ring.getSince(0, 'bob', true).map(e => e.seq)).toContain(priv);
  });

  it('prunes by max size', () => {
    const ring = createSseRing({ max: 3, ttlMs: 60_000 });
    for (let i = 0; i < 5; i++) ring.add(String(i), 'all');
    expect(ring.size()).toBe(3);
    expect(ring.getSince(0, null, true)).toHaveLength(3);
  });
});
