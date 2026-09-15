import { describe, it, expect } from 'vitest';
import { createMergedIdMap } from './db-merged-id-map.js';

describe('db-merged-id-map', () => {
  it('remembers and resolves chains', () => {
    const m = createMergedIdMap(10);
    m.remember('a', 'b');
    m.remember('b', 'c');
    expect(m.resolve('a')).toBe('c');
    expect(m.resolve('c')).toBe('c');
  });

  it('ignores empty or identity remember', () => {
    const m = createMergedIdMap(10);
    m.remember('', 'x');
    m.remember('y', 'y');
    expect(m.size()).toBe(0);
  });

  it('evicts oldest when over maxSize', () => {
    const m = createMergedIdMap(2);
    m.remember('1', 'a');
    m.remember('2', 'b');
    m.remember('3', 'c');
    expect(m.size()).toBe(2);
    expect(m.resolve('1')).toBe('1'); // evicted
    expect(m.resolve('2')).toBe('b');
    expect(m.resolve('3')).toBe('c');
  });

  it('clear empties the map', () => {
    const m = createMergedIdMap(10);
    m.remember('a', 'b');
    m.clear();
    expect(m.size()).toBe(0);
    expect(m.resolve('a')).toBe('a');
  });
});

import { resolveMergedIdViaRows, createMergedIdMap } from './db-merged-id-map.js';

describe('resolveMergedIdViaRows (70)', () => {
  it('follows map then merged_into', () => {
    const m = createMergedIdMap(10);
    m.remember('a', 'b');
    const rows: Record<string, string> = { b: 'c', c: '' };
    const id = resolveMergedIdViaRows(
      'a',
      (x) => m.resolve(x),
      (f, t) => m.remember(f, t),
      (cur) => rows[cur] ?? '',
    );
    expect(id).toBe('c');
    expect(m.resolve('b')).toBe('c');
  });
});

