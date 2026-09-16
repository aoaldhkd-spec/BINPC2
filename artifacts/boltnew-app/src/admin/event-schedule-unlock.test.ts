import { describe, expect, it } from 'vitest';
import { applySlotPatch, rainbowUnlockNowPatch, seoulNowHHMM } from './EventScheduleTab';
import { eventRainbowQuota, type EventScheduleSlot } from '../lib/event-schedule';

describe('admin rainbow unlock now', () => {
  it('bumps slot clock to Seoul now and grants shared pool', () => {
    const now = new Date('2026-09-16T05:30:00.000Z'); // 14:30 Seoul
    const patch = rainbowUnlockNowPatch(4, now);
    expect(patch.at).toBe(seoulNowHHMM(now));
    expect(patch.functions_locked).toBe(false);
    expect(patch.rainbow_pool).toBe(4);

    const slots: EventScheduleSlot[] = [
      { id: 'slot-1', at: '23:00', notice: '', functions_locked: true },
    ];
    const next = applySlotPatch(slots, 'slot-1', patch);
    expect(eventRainbowQuota({ timezone: 'Asia/Seoul', slots: next }, now)).toBe(4);
  });
});
