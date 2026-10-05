import { describe, expect, it } from 'vitest';
import {
  FIXED_DAILY_EVENT_SCHEDULE,
  dueDailyCycleActions,
  nextDailyCycleDelayMs,
} from './db-daily-cycle.js';

const at = (isoKst: string) => new Date(isoKst);
const schedule = JSON.parse(FIXED_DAILY_EVENT_SCHEDULE) as {
  timezone: string;
  slots: Array<{ at: string; unlock: string[] }>;
};

describe('fixed daily cycle — fake-clock full day', () => {
  it('runs the whole 01 → 17 → 23 → 24 flow without duplicate destructive jobs', () => {
    const settings: Record<string, unknown> = {
      daily_session_end_date: '2026-10-05',
      daily_reset_date: '2026-10-05',
      event_schedule: FIXED_DAILY_EVENT_SCHEDULE,
    };

    expect(dueDailyCycleActions(settings, at('2026-10-06T00:59:59+09:00'))).toEqual({
      sessionEndDate: null,
      resetDate: null,
    });

    const at0100 = dueDailyCycleActions(settings, at('2026-10-06T01:00:00+09:00'));
    expect(at0100).toEqual({ sessionEndDate: '2026-10-06', resetDate: null });
    settings.daily_session_end_date = at0100.sessionEndDate;

    expect(dueDailyCycleActions(settings, at('2026-10-06T01:00:01+09:00'))).toEqual({
      sessionEndDate: null,
      resetDate: null,
    });

    expect(dueDailyCycleActions(settings, at('2026-10-06T16:59:59+09:00')).resetDate).toBeNull();
    const at1700 = dueDailyCycleActions(settings, at('2026-10-06T17:00:00+09:00'));
    expect(at1700).toEqual({ sessionEndDate: null, resetDate: '2026-10-06' });
    settings.daily_reset_date = at1700.resetDate;

    expect(dueDailyCycleActions(settings, at('2026-10-06T17:00:01+09:00'))).toEqual({
      sessionEndDate: null,
      resetDate: null,
    });

    expect(schedule.timezone).toBe('Asia/Seoul');
    expect(schedule.slots.filter(s => s.at === '23:00').flatMap(s => s.unlock).sort())
      .toEqual(['blue', 'green', 'pink', 'red']);
    expect(schedule.slots.filter(s => s.at === '24:00').flatMap(s => s.unlock))
      .toEqual(['rainbow']);

    expect(nextDailyCycleDelayMs(at('2026-10-06T00:59:59+09:00'))).toBe(1_000);
    expect(nextDailyCycleDelayMs(at('2026-10-06T16:59:59+09:00'))).toBe(1_000);
  });
});
