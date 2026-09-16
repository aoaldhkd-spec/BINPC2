import { describe, expect, it } from 'vitest';
import { eventHeartQuotas } from './event-schedule';

describe('client event schedule quotas', () => {
  it('updates all heart types at an opened clock slot without changing JSON', () => {
    const schedule = { slots: [{ at: '23:05', notice: 'open', heart_grants: { red: 2, blue: 1, pink: 0, green: 3 } }] };
    expect(eventHeartQuotas(schedule, new Date('2026-09-16T14:04:59.000Z'))).toEqual({ red: 0, blue: 0, pink: 0, green: 0 });
    expect(eventHeartQuotas(schedule, new Date('2026-09-16T14:05:00.000Z'))).toEqual({ red: 2, blue: 1, pink: 0, green: 3 });
  });
});
