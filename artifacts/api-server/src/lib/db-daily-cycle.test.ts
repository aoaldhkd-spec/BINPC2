import { describe, expect, it } from 'vitest';
import {
  FIXED_DAILY_EVENT_SCHEDULE,
  dailyCycleBootstrapPatch,
  dueDailyCycleActions,
  nextDailyCycleDelayMs,
} from './db-daily-cycle.js';

describe('db-daily-cycle', () => {
  it('fixes normal hearts at 23:00 and rainbow at 24:00', () => {
    const cfg = JSON.parse(FIXED_DAILY_EVENT_SCHEDULE) as {
      slots: Array<{ at: string; unlock: string[] }>;
    };
    expect(cfg.slots.filter(s => !s.unlock.includes('rainbow')).every(s => s.at === '23:00')).toBe(true);
    expect(cfg.slots.flatMap(s => s.at === '23:00' ? s.unlock : []).sort())
      .toEqual(['blue', 'green', 'pink', 'red']);
    expect(cfg.slots.find(s => s.unlock.includes('rainbow'))?.at).toBe('24:00');
  });

  it('does not retroactively wipe/close when first deployed after a boundary', () => {
    const patch = dailyCycleBootstrapPatch({}, new Date('2026-10-05T20:00:00+09:00'));
    expect(patch.daily_session_end_date).toBe('2026-10-05');
    expect(patch.daily_reset_date).toBe('2026-10-05');
  });

  it('before a boundary seeds yesterday so today can execute', () => {
    const patch = dailyCycleBootstrapPatch({}, new Date('2026-10-05T04:45:00+09:00'));
    expect(patch.daily_session_end_date).toBe('2026-10-05');
    expect(patch.daily_reset_date).toBe('2026-10-04');
  });

  it('runs 01:00 end and 17:00 reset once per Seoul date', () => {
    const base = {
      daily_session_end_date: '2026-10-04',
      daily_reset_date: '2026-10-04',
    };
    expect(dueDailyCycleActions(base, new Date('2026-10-05T00:59:59+09:00')))
      .toEqual({ sessionEndDate: null, resetDate: null });
    expect(dueDailyCycleActions(base, new Date('2026-10-05T01:00:00+09:00')))
      .toEqual({ sessionEndDate: '2026-10-05', resetDate: null });
    expect(dueDailyCycleActions(
      { ...base, daily_session_end_date: '2026-10-05' },
      new Date('2026-10-05T17:00:00+09:00'),
    )).toEqual({ sessionEndDate: null, resetDate: '2026-10-05' });
  });

  it('arms the next exact destructive boundary', () => {
    expect(nextDailyCycleDelayMs(new Date('2026-10-05T00:30:00+09:00'))).toBe(30 * 60 * 1000);
    expect(nextDailyCycleDelayMs(new Date('2026-10-05T16:30:00+09:00'))).toBe(30 * 60 * 1000);
  });
});
