import { describe, expect, it } from 'vitest';
import {
  coerceEventScheduleRaw,
  eventHeartQuotas,
  eventRainbowQuota,
  rainbowPoolPickState,
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
