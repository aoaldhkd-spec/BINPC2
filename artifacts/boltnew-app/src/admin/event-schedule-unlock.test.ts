import { describe, expect, it } from 'vitest';
import {
  applyHeartsIndependently,
  applyNoticeIndependently,
  applySlotNowPatch,
  applySlotPatch,
  LIVE_HEARTS_ID,
  LIVE_NOTICE_ID,
  rainbowUnlockNowPatch,
  seoulNowHHMM,
} from './EventScheduleTab';
import { eventRainbowQuota, parseEventSchedule, type EventScheduleSlot } from '../lib/event-schedule';

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

  it('applies notice without changing rainbow_pool on other slots', () => {
    const now = new Date('2026-09-16T05:30:00.000Z');
    const slots: EventScheduleSlot[] = [
      { id: 'slot-1', at: '23:00', notice: '예약 공지', functions_locked: true, rainbow_pool: 4 },
    ];
    const next = applyNoticeIndependently(slots, '지금 공지', true, now);
    const live = next.find(s => s.id === LIVE_NOTICE_ID);
    const reserved = next.find(s => s.id === 'slot-1');
    expect(live).toMatchObject({ at: '14:30', notice: '지금 공지', functions_locked: true });
    expect(live?.rainbow_pool).toBeUndefined();
    expect(reserved?.rainbow_pool).toBe(4);
    expect(reserved?.notice).toBe('예약 공지');
    expect(eventRainbowQuota({ timezone: 'Asia/Seoul', slots: next }, now)).toBe(0);
  });

  it('applies hearts without replacing the live notice text', () => {
    const now = new Date('2026-09-16T05:30:00.000Z');
    const withNotice = applyNoticeIndependently(
      [{ id: 'slot-1', at: '23:00', notice: '', functions_locked: true }],
      '라이브 공지',
      false,
      now,
    );
    const next = applyHeartsIndependently(withNotice, 4, now);
    const hearts = next.find(s => s.id === LIVE_HEARTS_ID);
    const notice = next.find(s => s.id === LIVE_NOTICE_ID);
    expect(hearts).toMatchObject({ at: '14:30', rainbow_pool: 4, functions_locked: false, notice: '라이브 공지' });
    expect(notice?.notice).toBe('라이브 공지');
    expect(eventRainbowQuota({ timezone: 'Asia/Seoul', slots: next }, now)).toBe(4);
    expect(JSON.parse(JSON.stringify({ timezone: 'Asia/Seoul', slots: parseEventSchedule({ slots: next }).slots })).slots
      .some((s: { rainbow_pool?: number }) => s.rainbow_pool === 4)).toBe(true);
  });
});
