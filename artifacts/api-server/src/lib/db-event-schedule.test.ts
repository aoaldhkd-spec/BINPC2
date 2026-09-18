import { describe, expect, it } from 'vitest';
import {
  activeEventScheduleSlot,
  heartUsageFromLikeRows,
  parseEventSchedule,
  serializeEventSchedule,
  unlockedHeartKeys,
  RAINBOW_MAX_USES,
} from './db-event-schedule';

describe('event schedule (heart ops v2)', () => {
  it('parses v2 unlock slots and drops invalid times', () => {
    const s = parseEventSchedule(JSON.stringify({
      version: 2,
      slots: [
        { id: 'a', at: '23:00', unlock: ['red'] },
        { id: 'b', at: '99:99', unlock: ['blue'] },
      ],
    }));
    expect(s.version).toBe(2);
    expect(s.slots).toHaveLength(1);
    expect(s.slots[0]).toMatchObject({ at: '23:00', unlock: ['red'] });
  });

  it('migrates v1 heart_grants / rainbow_pool into unlock flags', () => {
    const s = parseEventSchedule(JSON.stringify({
      slots: [{ at: '23:05', notice: 'open', heart_grants: { red: 4, blue: -2 }, rainbow_pool: 4 }],
    }));
    expect(s.slots[0]?.unlock).toContain('red');
    expect(s.slots[0]?.unlock).toContain('rainbow');
    expect(s.slots[0]?.unlock).not.toContain('blue');
  });

  it('serializeEventSchedule takes raw settings values and never wipes slots', () => {
    // Regression: aliasing the config-taking serializer here silently emitted
    // `{"timezone":...,"version":2}` and erased the whole schedule on every save.
    const fromObject = JSON.parse(serializeEventSchedule({
      timezone: 'Asia/Seoul',
      slots: [{ id: 'slot-1', at: '23:00', notice: 'open', rainbow_pool: 4 }],
    }));
    expect(fromObject.slots).toHaveLength(1);
    expect(fromObject.slots[0].unlock).toEqual(['rainbow']);

    const fromString = JSON.parse(serializeEventSchedule(
      JSON.stringify({ version: 2, slots: [{ id: 'slot-1', at: '23:30', unlock: ['blue'] }] }),
    ));
    expect(fromString.slots).toEqual([{ id: 'slot-1', at: '23:30', unlock: ['blue'] }]);
  });

  it('serialization round-trips unlock flags without heart counts', () => {
    const saved = JSON.parse(serializeEventSchedule({
      version: 2,
      slots: [{ id: 'now', at: '24:00', unlock: ['pink', 'green'] }],
      instant_unlock: ['rainbow'],
    }));
    expect(saved.version).toBe(2);
    expect(saved.slots[0]).toEqual({ id: 'now', at: '24:00', unlock: ['pink', 'green'] });
    expect(saved.slots[0].heart_grants).toBeUndefined();
    expect(saved.slots[0].rainbow_pool).toBeUndefined();
    expect(saved.instant_unlock).toEqual(['rainbow']);
  });

  it('unlocks by Seoul clock and carries 24:00 past midnight', () => {
    const raw = {
      version: 2,
      slots: [
        { id: 'a', at: '23:00', unlock: ['red'] },
        { id: 'b', at: '24:00', unlock: ['rainbow'] },
      ],
    };
    // 2026-09-16T14:04Z = 23:04 Seoul
    const before = unlockedHeartKeys(raw, new Date('2026-09-16T14:04:00.000Z'));
    expect(before.has('red')).toBe(true);
    expect(before.has('rainbow')).toBe(false);
    // 2026-09-16T15:10Z = 00:10 Seoul (next day)
    const after = unlockedHeartKeys(raw, new Date('2026-09-16T15:10:00.000Z'));
    expect(after.has('rainbow')).toBe(true);
  });

  it('auto_unlock_from holds passed slots until instant_unlock', () => {
    const raw = {
      version: 2,
      slots: [
        { id: 'a', at: '23:00', unlock: ['red'] },
        { id: 'b', at: '24:30', unlock: ['rainbow'] },
      ],
      instant_unlock: ['blue'],
      auto_unlock_from: 24 * 60 + 35,
    };
    const parsed = parseEventSchedule(raw);
    expect(parsed.slots).toHaveLength(2);
    expect(parsed.auto_unlock_from).toBe(24 * 60 + 35);
    const held = unlockedHeartKeys(parsed, new Date('2026-09-16T15:40:00.000Z'));
    expect(held.has('red')).toBe(false);
    expect(held.has('rainbow')).toBe(false);
    expect(held.has('blue')).toBe(true);
    const round = JSON.parse(serializeEventSchedule(raw));
    expect(round.auto_unlock_from).toBe(24 * 60 + 35);
    expect(round.slots).toHaveLength(2);
  });

  it('instant_unlock applies regardless of clock and stays idempotent', () => {
    const raw = { version: 2, slots: [{ id: 'a', at: '24:30', unlock: ['rainbow'] }], instant_unlock: ['rainbow', 'rainbow'] };
    const keys = unlockedHeartKeys(raw, new Date('2026-09-16T13:00:00.000Z'));
    expect(keys.has('rainbow')).toBe(true);
    expect(parseEventSchedule(raw).instant_unlock).toEqual(['rainbow']);
  });

  it('usage separates grant vs rainbow and caps rainbow at 4', () => {
    const rows = [
      { liker_id: 'me', heart_type: 'red', like_source: 'grant' },
      { liker_id: 'me', heart_type: 'red', like_source: 'rainbow' },
      { liker_id: 'other', heart_type: 'blue', like_source: 'rainbow' },
    ];
    const usage = heartUsageFromLikeRows(rows, 'me');
    expect(usage.grantUsed.red).toBe(true);
    expect(usage.grantUsed.blue).toBe(false);
    expect(usage.rainbowUsed).toBe(1);
    expect(RAINBOW_MAX_USES).toBe(4);
  });

  it('activeEventScheduleSlot still reads legacy functions_locked', () => {
    const raw = { slots: [{ at: '14:30', functions_locked: true }] };
    expect(activeEventScheduleSlot(raw, new Date('2026-09-16T05:30:00.000Z'))?.functions_locked).toBe(true);
    expect(activeEventScheduleSlot(raw, new Date('2026-09-16T05:29:00.000Z'))).toBeNull();
  });
});
