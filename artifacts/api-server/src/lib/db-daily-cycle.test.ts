import { describe, expect, it } from 'vitest';
import {
  FIXED_DAILY_EVENT_SCHEDULE,
  dailyCycleBootstrapPatch,
  dueDailyCycleActions,
  planEventCycleStartPatch,
  nextDailyCycleDelayMs,
} from './db-daily-cycle.js';

describe('db-daily-cycle', () => {
  it('does not run the automatic reset before an administrator starts an event', () => {
    const now = new Date('2026-10-13T19:00:00+09:00');
    expect(dueDailyCycleActions({ daily_reset_date: '2026-10-12' }, now))
      .toEqual({ sessionEndDate: null, resetDate: null });
  });

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
      event_cycle_started_at: '2026-10-04T18:00:00+09:00',
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

  it('starts only the next 01:00 and 17:00 boundaries and stops after reset', () => {
    const started = {
      event_cycle_started_at: '2026-10-13T18:00:00+09:00',
      daily_session_end_date: '2026-10-13',
      daily_reset_date: '2026-10-13',
    };
    expect(dueDailyCycleActions(started, new Date('2026-10-13T23:00:00+09:00')))
      .toEqual({ sessionEndDate: null, resetDate: null });
    expect(dueDailyCycleActions(started, new Date('2026-10-14T01:00:00+09:00')))
      .toEqual({ sessionEndDate: '2026-10-14', resetDate: null });
    expect(dueDailyCycleActions(
      { ...started, daily_session_end_date: '2026-10-14' },
      new Date('2026-10-14T17:00:00+09:00'),
    )).toEqual({ sessionEndDate: null, resetDate: '2026-10-14' });
    expect(dueDailyCycleActions(
      { ...started, event_cycle_reset_complete: true },
      new Date('2026-10-15T19:00:00+09:00'),
    )).toEqual({ sessionEndDate: null, resetDate: null });
  });

  it('preserves the same archive identity when a stopped event is reopened', () => {
    const started = planEventCycleStartPatch({}, new Date('2026-10-13T19:00:00+09:00'));
    expect(started.session_active).toBe(true);
    expect(started.event_cycle_archive_id).toMatch(/^binpc2:event-anon:v1:2026-10-13:/);
    const reopened = planEventCycleStartPatch(
      { ...started, session_active: false },
      new Date('2026-10-13T22:00:00+09:00'),
    );
    expect(reopened.event_cycle_started_at).toBe(started.event_cycle_started_at);
    expect(reopened.event_cycle_archive_id).toBe(started.event_cycle_archive_id);
    const next = planEventCycleStartPatch(
      { ...started, event_cycle_reset_complete: true },
      new Date('2026-10-14T19:00:00+09:00'),
    );
    expect(next.event_cycle_archive_id).not.toBe(started.event_cycle_archive_id);
    expect(next.event_cycle_started_at).not.toBe(started.event_cycle_started_at);
  });

  it('never resets a daytime-started event before the next 01:00 close', () => {
    const settings = planEventCycleStartPatch({}, new Date('2026-10-13T13:00:00+09:00'));
    expect(dueDailyCycleActions(settings, new Date('2026-10-13T17:00:00+09:00')))
      .toEqual({ sessionEndDate: null, resetDate: null });
    expect(dueDailyCycleActions(settings, new Date('2026-10-14T01:00:00+09:00')))
      .toEqual({ sessionEndDate: '2026-10-14', resetDate: null });
    expect(dueDailyCycleActions({ ...settings, daily_session_end_date: '2026-10-14' },
      new Date('2026-10-14T17:00:00+09:00')))
      .toEqual({ sessionEndDate: null, resetDate: '2026-10-14' });
  });

  it('closes and resets a 00:30 start on that same calendar day', () => {
    const settings = planEventCycleStartPatch({}, new Date('2026-10-14T00:30:00+09:00'));
    expect(dueDailyCycleActions(settings, new Date('2026-10-14T01:00:00+09:00')))
      .toEqual({ sessionEndDate: '2026-10-14', resetDate: null });
    expect(dueDailyCycleActions({ ...settings, daily_session_end_date: '2026-10-14' },
      new Date('2026-10-14T17:00:00+09:00')))
      .toEqual({ sessionEndDate: null, resetDate: '2026-10-14' });
  });

  it('arms the next exact destructive boundary', () => {
    expect(nextDailyCycleDelayMs(new Date('2026-10-05T00:30:00+09:00'))).toBe(30 * 60 * 1000);
    expect(nextDailyCycleDelayMs(new Date('2026-10-05T16:30:00+09:00'))).toBe(30 * 60 * 1000);
  });
});
