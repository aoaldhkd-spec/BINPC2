import { describe, it, expect } from 'vitest';
import { countPendingHearts, isPendingReceivedHeart } from './pending-hearts';

describe('isPendingReceivedHeart', () => {
  it('green pending until acknowledged', () => {
    expect(isPendingReceivedHeart({
      likerId: 'a',
      heartType: 'green',
      acknowledgedComplimentIds: new Set(),
      contactSharedWithIds: new Set(),
    })).toBe(true);
    expect(isPendingReceivedHeart({
      likerId: 'a',
      heartType: 'green',
      acknowledgedComplimentIds: new Set(['a']),
      contactSharedWithIds: new Set(),
    })).toBe(false);
  });

  it('interest pending until contact shared', () => {
    expect(isPendingReceivedHeart({
      likerId: 'b',
      heartType: 'red',
      acknowledgedComplimentIds: new Set(),
      contactSharedWithIds: new Set(),
    })).toBe(true);
    expect(isPendingReceivedHeart({
      likerId: 'b',
      heartType: 'red',
      acknowledgedComplimentIds: new Set(),
      contactSharedWithIds: new Set(['b']),
    })).toBe(false);
  });
});

describe('countPendingHearts', () => {
  it('counts mixed pending likers', () => {
    const n = countPendingHearts(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      new Map([['a', 'green'], ['b', 'red'], ['c', 'blue']]),
      new Set(['a']),
      new Set(['b']),
    );
    expect(n).toBe(1); // only c
  });
});
