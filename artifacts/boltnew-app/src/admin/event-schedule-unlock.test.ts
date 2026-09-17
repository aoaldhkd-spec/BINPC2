import { describe, expect, it } from 'vitest';
import {
  applySavedFieldPatch,
  applySlotNowPatch,
  applySlotPatch,
  heartsOnlyPatch,
  nextRainbowPoolGrant,
  noticeOnlyPatch,
  rainbowUnlockNowPatch,
  seoulNowHHMM,
  TIME_ONLY_APPLY_HINT,
  timeOnlyPatch,
} from './EventScheduleTab';
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
    const noticeOnly = applySlotPatch(slots, 'slot-1', noticeOnlyPatch('새 공지'));
    expect(noticeOnly[0].at).toBe('23:00');
    expect(noticeOnly[0].rainbow_pool).toBe(4);
    expect(noticeOnly[0].notice).toBe('새 공지');
    expect(noticeOnly[0].functions_locked).toBe(true);

    const heartsOnly = applySlotPatch(slots, 'slot-1', heartsOnlyPatch(4, 4));
    expect(heartsOnly[0].notice).toBe('라이브 공지');
    expect(heartsOnly[0].at).toBe('23:00');
    expect(heartsOnly[0].rainbow_pool).toBe(8);
    expect(heartsOnly[0].functions_locked).toBe(false);
    expect(eventRainbowQuota({ timezone: 'Asia/Seoul', slots: heartsOnly }, now)).toBe(0);
    expect(eventRainbowQuota({ timezone: 'Asia/Seoul', slots: heartsOnly }, new Date('2026-09-16T14:00:00.000Z'))).toBe(8);
  });

  it('applies one field onto last-saved slots without wiping siblings', () => {
    const saved: EventScheduleSlot[] = [
      { id: 'slot-1', at: '10:00', notice: '저장 공지', functions_locked: true, rainbow_pool: 4 },
    ];
    const dirty: EventScheduleSlot[] = [
      { id: 'slot-1', at: '18:00', notice: '편집 중 공지', functions_locked: false, rainbow_pool: 9 },
    ];
    const notice = applySavedFieldPatch(saved, dirty, 'slot-1', noticeOnlyPatch(dirty[0].notice));
    expect(notice[0]).toMatchObject({ at: '10:00', notice: '편집 중 공지', rainbow_pool: 4, functions_locked: true });

    const hearts = applySavedFieldPatch(saved, dirty, 'slot-1', heartsOnlyPatch(saved[0].rainbow_pool, 3));
    expect(hearts[0]).toMatchObject({ at: '10:00', notice: '저장 공지', rainbow_pool: 7, functions_locked: false });

    const time = applySavedFieldPatch(saved, dirty, 'slot-1', timeOnlyPatch(dirty[0].at));
    expect(time[0]).toMatchObject({ at: '18:00', notice: '저장 공지', rainbow_pool: 4, functions_locked: true });
    expect(TIME_ONLY_APPLY_HINT).toContain('공지나 하트도 같이');
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
