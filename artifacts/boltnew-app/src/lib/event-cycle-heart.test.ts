import { describe, expect, it } from 'vitest';
import { eventCycleUnlocked } from './event-cycle-heart';

describe('session-anchored heart unlocks (KST)', () => {
  const startedAt = '2026-10-13T18:00:00+09:00';
  const at = (x: string, resetComplete = false) =>
    [...eventCycleUnlocked({ startedAt, resetComplete, now: new Date(x) })].sort();
  it('never unlocks before admin start or after durable reset', () => {
    expect(eventCycleUnlocked({ startedAt: null, resetComplete:false, now:new Date('2026-10-13T23:30:00+09:00') }).size).toBe(0);
    expect(at('2026-10-13T22:59:59+09:00')).toEqual([]);
    expect(at('2026-10-14T00:05:00+09:00',true)).toEqual([]);
  });
  it('unlocks each classic heart at 23 and rainbow at midnight, retaining after 01 admission close', () => {
    expect(at('2026-10-13T23:00:00+09:00')).toEqual(['blue','green','pink','red']);
    expect(at('2026-10-14T00:00:00+09:00')).toEqual(['blue','green','pink','rainbow','red']);
    expect(at('2026-10-14T10:00:00+09:00')).toHaveLength(5);
  });
  it('a 00:30 late start can access its 23/24 event slots but reset closes access', () => {
    const keys=eventCycleUnlocked({startedAt:'2026-10-14T00:30:00+09:00',resetComplete:false,now:new Date('2026-10-14T00:45:00+09:00')});
    expect(keys.has('rainbow')).toBe(true);
  });
});
