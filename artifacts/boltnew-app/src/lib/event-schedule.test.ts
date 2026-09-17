import { describe, expect, it } from 'vitest';
import {
  coerceEventScheduleRaw,
  eventHeartQuotas,
  eventRainbowQuota,
  eventScheduleBannerState,
  rainbowPoolPickState,
  upcomingHeartGrantPreview,
} from './event-schedule';

describe('client event schedule quotas', () => {
  it('updates all heart types at an opened clock slot without changing JSON', () => {
    const schedule = { slots: [{ at: '23:05', notice: 'open', heart_grants: { red: 2, blue: 1, pink: 0, green: 3 } }] };
    expect(eventHeartQuotas(schedule, new Date('2026-09-16T14:04:59.000Z'))).toEqual({ red: 0, blue: 0, pink: 0, green: 0 });
    expect(eventHeartQuotas(schedule, new Date('2026-09-16T14:05:00.000Z'))).toEqual({ red: 2, blue: 1, pink: 0, green: 3 });
  });

  it('accumulates a shared rainbow pool, independent of color', () => {
    const schedule = { slots: [{ at: '23:05', rainbow_pool: 4 }] };
    expect(eventRainbowQuota(schedule, new Date('2026-09-16T14:04:59.000Z'))).toBe(0);
    expect(eventRainbowQuota(schedule, new Date('2026-09-16T14:05:00.000Z'))).toBe(4);
  });

  it('stays locked (pool 0) until a rainbow_pool slot opens', () => {
    const schedule = { slots: [{ at: '23:05', notice: 'later', rainbow_pool: 4 }] };
    expect(eventRainbowQuota(schedule, new Date('2026-09-16T14:00:00.000Z'))).toBe(0);
  });

  it('coerces object schedules from SSE/ready instead of clearing them', () => {
    const obj = { timezone: 'Asia/Seoul', slots: [{ at: '12:00', rainbow_pool: 4 }] };
    const raw = coerceEventScheduleRaw(obj);
    expect(typeof raw).toBe('string');
    expect(eventRainbowQuota(raw, new Date('2026-09-16T03:00:00.000Z'))).toBe(4);
    expect(coerceEventScheduleRaw(null)).toBeNull();
    expect(coerceEventScheduleRaw('')).toBeNull();
  });

  it('rainbowPoolPickState locks before grant and unlocks any color after', () => {
    expect(rainbowPoolPickState({ rainbowPool: 0, totalUsed: 0, alreadySentThisType: false })).toEqual({
      unlocked: false, poolRemaining: 0, disabled: true,
    });
    expect(rainbowPoolPickState({ rainbowPool: 4, totalUsed: 1, alreadySentThisType: false })).toEqual({
      unlocked: true, poolRemaining: 3, disabled: false,
    });
    expect(rainbowPoolPickState({ rainbowPool: 4, totalUsed: 4, alreadySentThisType: false }).disabled).toBe(true);
    expect(rainbowPoolPickState({ rainbowPool: 4, totalUsed: 0, alreadySentThisType: true }).disabled).toBe(true);
  });
});

describe('eventScheduleBannerState', () => {
  it('shows notice only until the next slot, then hides', () => {
    const schedule = {
      timezone: 'Asia/Seoul',
      slots: [
        { at: '23:00', notice: '시작' },
        { at: '23:05', notice: '오픈', rainbow_pool: 4 },
      ],
    };
    const during = eventScheduleBannerState(schedule, new Date('2026-09-16T14:02:00.000Z'));
    expect(during.show).toBe(true);
    expect(during.showNotice).toBe(true);
    expect(during.active?.notice).toBe('시작');
    expect(during.next?.at).toBe('23:05');

    const afterNext = eventScheduleBannerState(schedule, new Date('2026-09-16T14:05:00.000Z'));
    expect(afterNext.showNotice).toBe(true);
    expect(afterNext.active?.notice).toBe('오픈');
    expect(afterNext.next).toBeNull();
  });

  it('hides last-slot notice after hold window with no countdown', () => {
    const schedule = { slots: [{ at: '23:00', notice: '마지막' }] };
    const early = eventScheduleBannerState(schedule, new Date('2026-09-16T14:02:00.000Z'));
    expect(early.show).toBe(true);
    expect(early.showNotice).toBe(true);
    const late = eventScheduleBannerState(schedule, new Date('2026-09-16T14:06:00.000Z'));
    expect(late.show).toBe(false);
    expect(late.showNotice).toBe(false);
    expect(late.upcomingHeartText).toBeNull();
  });

  it('previews upcoming rainbow or color heart grants in Seoul time', () => {
    const rainbow = {
      slots: [
        { at: '23:00', notice: '시작' },
        { at: '23:05', rainbow_pool: 4 },
      ],
    };
    const at2302 = new Date('2026-09-16T14:02:00.000Z');
    expect(upcomingHeartGrantPreview(rainbow, at2302)).toEqual({
      minutes: 3,
      text: '3분 뒤 무지개하트 4개가 추가됩니다',
    });
    expect(eventScheduleBannerState(rainbow, at2302).upcomingHeartText).toBe('3분 뒤 무지개하트 4개가 추가됩니다');

    const color = { slots: [{ at: '23:10', heart_grants: { red: 2 } }] };
    expect(upcomingHeartGrantPreview(color, new Date('2026-09-16T14:05:00.000Z'))?.text).toBe(
      '5분 뒤 호감하트가 추가됩니다',
    );
    expect(upcomingHeartGrantPreview(rainbow, new Date('2026-09-16T14:05:00.000Z'))).toBeNull();
  });
});

