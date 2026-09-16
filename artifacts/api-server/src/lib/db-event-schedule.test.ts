import { describe, expect, it } from 'vitest';
import { activeEventScheduleSlot, eventHeartQuota, parseEventSchedule, serializeEventSchedule } from './db-event-schedule';

describe('event schedule', () => {
  it('normalizes slots and grants', () => {
    const s = parseEventSchedule(JSON.stringify({ slots: [{ at: '23:05', notice: '<b>open</b>', heart_grants: { red: 4, blue: -2 } }] }));
    expect(s.slots[0]).toMatchObject({ at: '23:05', notice: 'open', heart_grants: { red: 4 } });
  });
  it('preserves grant fields through the admin-save serialization path', () => {
    const saved = JSON.parse(serializeEventSchedule({ slots: [{ id: 'now', at: '09:00', notice: 'open', heart_grants: { red: 4, green: 2 } }] }));
    expect(saved.slots[0].heart_grants).toEqual({ red: 4, green: 2 });
  });
  it('uses Seoul server clock and cumulative grants', () => {
    const raw = { slots: [{ at: '23:00', notice: 'start', heart_grants: { red: 1 } }, { at: '23:05', notice: 'more', heart_grants: { red: 3 } }] };
    expect(eventHeartQuota(raw, 'red', new Date('2026-09-16T14:06:00.000Z'))).toBe(4);
    expect(activeEventScheduleSlot(raw, new Date('2026-09-16T14:04:00.000Z'))?.notice).toBe('start');
  });
});
