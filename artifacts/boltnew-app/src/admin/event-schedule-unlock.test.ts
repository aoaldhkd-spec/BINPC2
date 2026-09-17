import { describe, expect, it } from 'vitest';
import { applySlotNowPatch, applySlotPatch, nextRainbowPoolGrant, rainbowUnlockNowPatch, seoulNowHHMM } from './EventScheduleTab';
import { eventRainbowQuota, type EventScheduleSlot } from '../lib/event-schedule';

describe('admin rainbow unlock now', () => {
  it('bumps slot clock to Seoul now and grants shared pool', () => {
    const now = new Date('2026-09-16T05:30:00.000Z'); // 14:30 Seoul
    const patch = rainbowUnlockNowPatch(4, now);
    expect(patch.at).toBe(seoulNowHHMM(now));
    expect(patch.functions_locked).toBe(false);
    expect(patch.rainbow_pool).toBe(4);

    const slots: EventScheduleSlot[] = [
      { id: 'slot-1', at: '23:00', notice: '', functions_locked: true },
    ];
    const next = applySlotPatch(slots, 'slot-1', patch);
    expect(eventRainbowQuota({ timezone: 'Asia/Seoul', slots: next }, now)).toBe(4);
  });

  it('applySlotNowPatch opens functions at Seoul now without changing pool', () => {
    const now = new Date('2026-09-16T05:30:00.000Z');
    const patch = applySlotNowPatch(now);
    expect(patch).toEqual({ at: '14:30', functions_locked: false });
    const slots: EventScheduleSlot[] = [
      { id: 'slot-1', at: '23:00', notice: '', functions_locked: true, rainbow_pool: 4 },
    ];
    const next = applySlotPatch(slots, 'slot-1', patch);
    expect(next[0].rainbow_pool).toBe(4);
    expect(next[0].functions_locked).toBe(false);
    expect(next[0].at).toBe('14:30');
  });

  it('notice-only clock bump keeps rainbow_pool and unlock keeps notice text', () => {
    const now = new Date('2026-09-16T05:30:00.000Z');
    const slots: EventScheduleSlot[] = [
      { id: 'slot-1', at: '23:00', notice: '라이브 공지', functions_locked: true, rainbow_pool: 4 },
    ];
    const noticeOnly = applySlotPatch(slots, 'slot-1', { at: seoulNowHHMM(now) });
    expect(noticeOnly[0].rainbow_pool).toBe(4);
    expect(noticeOnly[0].notice).toBe('라이브 공지');
    expect(noticeOnly[0].functions_locked).toBe(true);

    const heartsOnly = applySlotPatch(slots, 'slot-1', rainbowUnlockNowPatch(4, now));
    expect(heartsOnly[0].notice).toBe('라이브 공지');
    expect(heartsOnly[0].rainbow_pool).toBe(4);
    expect(eventRainbowQuota({ timezone: 'Asia/Seoul', slots: heartsOnly }, now)).toBe(4);
  });

  it('adds each unlock onto the existing slot pool (not a hardcoded 4)', () => {
    expect(nextRainbowPoolGrant(undefined, 4)).toBe(4);
    expect(nextRainbowPoolGrant(4, 4)).toBe(8);
    expect(nextRainbowPoolGrant(8, 3)).toBe(11);
    const now = new Date('2026-09-16T05:30:00.000Z');
    const slots: EventScheduleSlot[] = [
      { id: 'slot-1', at: '23:00', notice: '', functions_locked: true, rainbow_pool: 4 },
    ];
    const granted = nextRainbowPoolGrant(slots[0].rainbow_pool, 4);
    const next = applySlotPatch(slots, 'slot-1', rainbowUnlockNowPatch(granted, now));
    expect(next[0].rainbow_pool).toBe(8);
    expect(eventRainbowQuota({ timezone: 'Asia/Seoul', slots: next }, now)).toBe(8);
  });
});
