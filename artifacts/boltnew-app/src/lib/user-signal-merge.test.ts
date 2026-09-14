import { describe, it, expect } from 'vitest';
import { mergeUserSignalRow, recordsShallowEqual } from './user-signal-merge';

describe('recordsShallowEqual', () => {
  it('compares union of keys', () => {
    expect(recordsShallowEqual({ a: 1 }, { a: 1 })).toBe(true);
    expect(recordsShallowEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(recordsShallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });
});

describe('mergeUserSignalRow', () => {
  it('appends on upsert when missing', () => {
    const next = mergeUserSignalRow([], { user_id: 'u1', one_liner: 'hi' }, 'upsert');
    expect(next).toEqual([{ user_id: 'u1', one_liner: 'hi' }]);
  });

  it('ignores missing on update-only', () => {
    expect(mergeUserSignalRow([], { user_id: 'u1' }, 'update-only')).toEqual([]);
  });

  it('replaces when changed', () => {
    const prev = [{ user_id: 'u1', one_liner: 'a' }];
    const next = mergeUserSignalRow(prev, { user_id: 'u1', one_liner: 'b' }, 'upsert');
    expect(next[0].one_liner).toBe('b');
  });

  it('returns same ref when equal', () => {
    const prev = [{ user_id: 'u1', one_liner: 'a' }];
    expect(mergeUserSignalRow(prev, { user_id: 'u1', one_liner: 'a' }, 'upsert')).toBe(prev);
  });
});
