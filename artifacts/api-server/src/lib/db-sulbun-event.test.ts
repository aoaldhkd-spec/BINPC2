import { describe, expect, it } from 'vitest';
import {
  addSeoulCalendarDays,
  computeSulbunAutoResetAt,
  disableDirectNoticePresets,
  disableDirectNoticesInSchedule,
  isSulbunEventActive,
  parseSulbunEvent,
  planSulbunMarkResetDone,
  planSulbunOpen,
  planSulbunTimerRestore,
  serializeSulbunEvent,
  shouldRunSulbunAutoReset,
} from './db-sulbun-event.js';
import { parseEventSchedule } from './db-heart-ops.js';

describe('sulbun auto-reset clock Asia/Seoul', () => {
  it('20th 18:00 → 21st 17:00', () => {
    const at = computeSulbunAutoResetAt(new Date('2026-09-20T18:00:00+09:00'));
    expect(at.toISOString()).toBe(new Date('2026-09-21T17:00:00+09:00').toISOString());
  });

  it('20th 23:59 → 21st 17:00', () => {
    const at = computeSulbunAutoResetAt(new Date('2026-09-20T23:59:00+09:00'));
    expect(at.toISOString()).toBe(new Date('2026-09-21T17:00:00+09:00').toISOString());
  });

  it('21st 00:10 → 22nd 17:00', () => {
    const at = computeSulbunAutoResetAt(new Date('2026-09-21T00:10:00+09:00'));
    expect(at.toISOString()).toBe(new Date('2026-09-22T17:00:00+09:00').toISOString());
  });

  it('month end and year end and leap day', () => {
    expect(computeSulbunAutoResetAt(new Date('2026-09-30T19:00:00+09:00')).toISOString())
      .toBe(new Date('2026-10-01T17:00:00+09:00').toISOString());
    expect(computeSulbunAutoResetAt(new Date('2026-12-31T23:00:00+09:00')).toISOString())
      .toBe(new Date('2027-01-01T17:00:00+09:00').toISOString());
    expect(computeSulbunAutoResetAt(new Date('2028-02-28T12:00:00+09:00')).toISOString())
      .toBe(new Date('2028-02-29T17:00:00+09:00').toISOString());
    expect(computeSulbunAutoResetAt(new Date('2028-02-29T12:00:00+09:00')).toISOString())
      .toBe(new Date('2028-03-01T17:00:00+09:00').toISOString());
  });

  it('addSeoulCalendarDays does not use HeartOps 24:xx', () => {
    expect(addSeoulCalendarDays(2026, 9, 20, 1)).toEqual({ y: 2026, m: 9, d: 21 });
  });
});

describe('planSulbunOpen', () => {
  it('opens a new cycle and refuses a second click', () => {
    const now = new Date('2026-09-20T22:00:00+09:00');
    const first = planSulbunOpen({ existing: null, now, cycleId: 'cycle-a' });
    expect(first.kind).toBe('open');
    if (first.kind !== 'open') return;
    expect(first.event.cycle_id).toBe('cycle-a');
    expect(first.event.auto_reset_enabled).toBe(true);
    expect(first.event.reset_done).toBe(false);
    expect(first.event.auto_reset_at).toBe(new Date('2026-09-21T17:00:00+09:00').toISOString());

    const second = planSulbunOpen({ existing: first.event, now: new Date('2026-09-20T22:05:00+09:00'), cycleId: 'cycle-b' });
    expect(second).toEqual({ kind: 'already_active', event: first.event });
  });

  it('allows a new cycle after reset is marked done', () => {
    const opened = planSulbunOpen({ existing: null, now: new Date('2026-09-20T22:00:00+09:00'), cycleId: 'a' });
    if (opened.kind !== 'open') return;
    const done = planSulbunMarkResetDone(opened.event, new Date('2026-09-20T23:00:00+09:00'));
    const next = planSulbunOpen({ existing: done, now: new Date('2026-09-23T19:00:00+09:00'), cycleId: 'b' });
    expect(next.kind).toBe('open');
    if (next.kind !== 'open') return;
    expect(next.event.cycle_id).toBe('b');
    expect(next.event.auto_reset_at).toBe(new Date('2026-09-24T17:00:00+09:00').toISOString());
  });
});

describe('shouldRunSulbunAutoReset + timer restore', () => {
  it('does not run before due and runs once after due', () => {
    const opened = planSulbunOpen({ existing: null, now: new Date('2026-09-20T22:00:00+09:00'), cycleId: 'c1' });
    if (opened.kind !== 'open') return;
    const raw = serializeSulbunEvent(opened.event);
    expect(shouldRunSulbunAutoReset(raw, new Date('2026-09-21T16:59:59+09:00'))).toBeNull();
    expect(shouldRunSulbunAutoReset(raw, new Date('2026-09-21T17:00:00+09:00'))?.cycle_id).toBe('c1');
    expect(shouldRunSulbunAutoReset(raw, new Date('2026-09-21T17:00:00+09:00'), 'other')).toBeNull();

    const done = planSulbunMarkResetDone(opened.event, new Date('2026-09-21T17:00:01+09:00'));
    expect(shouldRunSulbunAutoReset(done, new Date('2026-09-21T17:05:00+09:00'))).toBeNull();
    expect(isSulbunEventActive(done)).toBe(false);
  });

  it('restores arm / catch_up / idle for server restart', () => {
    const opened = planSulbunOpen({ existing: null, now: new Date('2026-09-20T22:00:00+09:00'), cycleId: 'c1' });
    if (opened.kind !== 'open') return;
    const before = planSulbunTimerRestore(opened.event, new Date('2026-09-21T16:00:00+09:00'));
    expect(before.kind).toBe('arm');
    if (before.kind === 'arm') expect(before.delayMs).toBe(60 * 60 * 1000);

    expect(planSulbunTimerRestore(opened.event, new Date('2026-09-21T17:00:00+09:00'))).toEqual({ kind: 'catch_up' });
    const done = planSulbunMarkResetDone(opened.event, new Date('2026-09-21T17:00:00+09:00'));
    expect(planSulbunTimerRestore(done, new Date('2026-09-21T17:01:00+09:00'))).toEqual({ kind: 'idle' });
    expect(planSulbunTimerRestore(null, new Date())).toEqual({ kind: 'idle' });
  });

  it('round-trips parse/serialize', () => {
    const opened = planSulbunOpen({ existing: null, now: new Date('2026-09-20T22:00:00+09:00'), cycleId: 'c1' });
    if (opened.kind !== 'open') return;
    expect(parseSulbunEvent(serializeSulbunEvent(opened.event))).toEqual({
      ...opened.event,
      reset_done_at: null,
    });
  });
});

describe('disableDirectNoticesInSchedule', () => {
  it('turns enabled off without dropping HeartOps slots or instant_unlock', () => {
    const raw = JSON.stringify({
      timezone: 'Asia/Seoul',
      version: 2,
      slots: [
        { id: 'slot-1', at: '23:00', unlock: ['red'] },
        { id: 'slot-2', at: '23:30', unlock: ['blue'] },
      ],
      instant_unlock: ['rainbow'],
      direct_notice: '바로 표시',
      direct_notices: [
        { id: 'n1', text: '기존 공지', at: '23:00', enabled: true },
        { id: 'n2', text: '다음날 23시', at: '23:00', enabled: true },
      ],
      auto_unlock_from: 10,
    });
    const next = parseEventSchedule(disableDirectNoticesInSchedule(raw));
    expect(next.slots.map(s => ({ id: s.id, at: s.at, unlock: s.unlock }))).toEqual([
      { id: 'slot-1', at: '23:00', unlock: ['red'] },
      { id: 'slot-2', at: '23:30', unlock: ['blue'] },
    ]);
    expect(next.instant_unlock).toEqual(['rainbow']);
    expect(next.auto_unlock_from).toBe(10);
    expect(next.direct_notice).toBe('');
    expect(next.direct_notices?.map(n => n.enabled)).toEqual([undefined, undefined]);
    expect(next.direct_notices?.map(n => n.text)).toEqual(['기존 공지', '다음날 23시']);
  });

  it('disables preset enabled flags without deleting text', () => {
    const raw = JSON.stringify([
      { id: 'p1', text: 'keep me', at: '23:00', enabled: true },
      { id: 'p2', text: 'also keep', enabled: false },
    ]);
    const out = JSON.parse(disableDirectNoticePresets(raw) ?? '[]') as Array<{ enabled?: boolean; text: string }>;
    expect(out.map(n => n.text)).toEqual(['keep me', 'also keep']);
    expect(out.every(n => n.enabled !== true)).toBe(true);
  });
});
