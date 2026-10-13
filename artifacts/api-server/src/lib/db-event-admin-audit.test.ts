import { describe, expect, it } from 'vitest';
import { eventActionsAfter, normaliseEventActions } from './db-event-admin-audit.js';
describe('privacy-minimal administrator event actions', () => {
  it('starts new events with a fresh anonymous counter and preserves prior event totals independently', () => {
    const previous = { start: 3, end: 2 };
    const current = eventActionsAfter({ previous, action: 'start', isNewEvent: true });
    expect(current.start).toBe(1);
    expect(current.end).toBe(0);
    expect(previous).toEqual({ start: 3, end: 2 });
    expect(eventActionsAfter({ previous: current, action: 'end' }).end).toBe(1);
  });
  it('never persists arbitrary user text or invalid counters', () => {
    const x = normaliseEventActions({ start: -5, end: 'PII', hidden: 'PRIVATE', lock: 2 });
    expect(x).toEqual({ start: 0, end: 0, autoEnd: 0, settings: 0, lock: 2 });
    expect(JSON.stringify(x)).not.toContain('PRIVATE');
  });
});
