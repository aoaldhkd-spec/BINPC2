import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  canOpenHeartPicker,
  DEFAULT_HEART_OPS,
  formatHeartOpsClock,
  grantRemaining,
  heartUsageFromLikeRows,
  parseHeartOps,
  parseHeartOpsClock,
  patchHeartOpsSlotAt,
  patchHeartOpsSlotNoticeAt,
  rainbowRemaining,
  resetHeartUnlocks,
  serializeHeartOps,
  slotEventMinute,
  stepHeartOpsClock,
  stepHeartOpsHour,
  unlockedHeartKeys,
  participantHeartState,
  headerHeartRemainings,
  heartOpsBannerState,
  heartOpsHeartRows,
} from './heart-ops';

afterEach(() => {
  vi.useRealTimers();
});

function seoulTime(iso: string): Date {
  return new Date(iso);
}

describe('heart-ops lock/unlock model', () => {
  const config = DEFAULT_HEART_OPS;
  const emptyUsage = () => heartUsageFromLikeRows([], 'me');

  it('hour/minute helpers keep 24:00/24:30 and patch one slot only', () => {
    expect(formatHeartOpsClock(23, 15)).toBe('23:15');
    expect(formatHeartOpsClock(24, 0)).toBe('24:00');
    expect(formatHeartOpsClock(24, 30)).toBe('24:30');
    expect(formatHeartOpsClock(25, 0)).toBeNull();
    expect(parseHeartOpsClock('24:30')).toEqual({ hour: 24, minute: 30 });
    expect(slotEventMinute('24:00')).toBe(1440);
    expect(slotEventMinute('24:30')).toBe(1470);

    const patched = patchHeartOpsSlotAt(DEFAULT_HEART_OPS.slots, 0, 23, 15);
    expect(patched[0].at).toBe('23:15');
    expect(patched[0].unlock).toEqual(DEFAULT_HEART_OPS.slots[0].unlock);
    expect(patched.slice(1)).toEqual(DEFAULT_HEART_OPS.slots.slice(1));
    const roundTrip = parseHeartOps(serializeHeartOps({ ...DEFAULT_HEART_OPS, slots: patched }));
    expect(roundTrip.slots.map(s => s.at)).toEqual(['23:15', '23:30', '24:00', '24:30']);
    expect(roundTrip.slots.map(s => s.unlock)).toEqual(DEFAULT_HEART_OPS.slots.map(s => s.unlock));
    expect(stepHeartOpsClock('23:00', 15)).toBe('23:15');
    expect(stepHeartOpsClock('23:30', 15)).toBe('23:45');
    expect(stepHeartOpsHour('23:30', 1)).toBe('24:30');
    expect(stepHeartOpsClock('24:55', 5)).toBe('00:00');
    expect(stepHeartOpsHour('00:15', -1)).toBe('24:15');
  });

  it('canOpenHeartPicker stays open for rainbow after all grant types were sent', () => {
    expect(canOpenHeartPicker(0, 0)).toBe(true);
    expect(canOpenHeartPicker(4, 0)).toBe(false);
    expect(canOpenHeartPicker(4, 3)).toBe(true);
  });

  it('grant: locked → unavailable, unlocked → 1, used → 0', () => {
    vi.setSystemTime(seoulTime('2026-09-17T22:00:00+09:00'));
    expect(grantRemaining(config, emptyUsage(), 'red')).toBe(0);

    vi.setSystemTime(seoulTime('2026-09-17T23:05:00+09:00'));
    expect(grantRemaining(config, emptyUsage(), 'red')).toBe(1);

    const used = heartUsageFromLikeRows([
      { liker_id: 'me', heart_type: 'red', like_source: 'grant' },
    ], 'me');
    expect(grantRemaining(config, used, 'red')).toBe(0);
  });

  it('rainbow: locked → 0, unlocked → 4, decrements per rainbow send', () => {
    vi.setSystemTime(seoulTime('2026-09-17T23:00:00+09:00'));
    expect(rainbowRemaining(config, emptyUsage())).toBe(0);

    vi.setSystemTime(seoulTime('2026-09-18T00:35:00+09:00'));
    expect(rainbowRemaining(config, emptyUsage())).toBe(4);

    const rows = Array.from({ length: 4 }, () => ({
      liker_id: 'me', heart_type: 'red', like_source: 'rainbow',
    }));
    expect(rainbowRemaining(config, heartUsageFromLikeRows(rows, 'me'))).toBe(0);
  });

  it('rainbow send does not consume grant hearts', () => {
    vi.setSystemTime(seoulTime('2026-09-18T00:35:00+09:00'));
    const usage = heartUsageFromLikeRows([
      { liker_id: 'me', heart_type: 'red', like_source: 'rainbow' },
    ], 'me');
    expect(grantRemaining(config, usage, 'red')).toBe(1);
    expect(rainbowRemaining(config, usage)).toBe(3);
  });

  it('schedule unlocks blue at 23:30 and updates when time changes', () => {
    vi.setSystemTime(seoulTime('2026-09-17T23:25:00+09:00'));
    const early = parseHeartOps(serializeHeartOps(config));
    expect(unlockedHeartKeys(early).has('blue')).toBe(false);

    vi.setSystemTime(seoulTime('2026-09-17T23:31:00+09:00'));
    expect(unlockedHeartKeys(early).has('blue')).toBe(true);

    const shifted = parseHeartOps(serializeHeartOps({
      ...config,
      slots: config.slots.map(s => s.id === 'slot-2' ? { ...s, at: '23:27' } : s),
    }));
    vi.setSystemTime(seoulTime('2026-09-17T23:26:00+09:00'));
    expect(unlockedHeartKeys(shifted).has('blue')).toBe(false);
    vi.setSystemTime(seoulTime('2026-09-17T23:28:00+09:00'));
    expect(unlockedHeartKeys(shifted).has('blue')).toBe(true);

    const banner = heartOpsBannerState(shifted, seoulTime('2026-09-17T23:26:00+09:00'));
    expect(banner.autoLine).toContain('23:27');
    expect(banner.autoLine).toContain('해금');
    expect(banner.countdownSec).toBeGreaterThan(0);
  });

  it('notice_at is display-only and never unlocks hearts', () => {
    vi.setSystemTime(seoulTime('2026-09-17T22:50:00+09:00'));
    const config = parseHeartOps(JSON.stringify({
      version: 2,
      timezone: 'Asia/Seoul',
      slots: [{ id: 'slot-1', at: '23:00', notice_at: '22:40', unlock: ['red'] }],
    }));
    expect(config.slots[0]?.notice_at).toBe('22:40');
    expect(unlockedHeartKeys(config).has('red')).toBe(false);
    vi.setSystemTime(seoulTime('2026-09-17T23:00:00+09:00'));
    expect(unlockedHeartKeys(config).has('red')).toBe(true);
    const round = parseHeartOps(serializeHeartOps(config));
    expect(round.slots[0]?.notice_at).toBe('22:40');
    expect(round.slots[0]?.at).toBe('23:00');
  });

  it('auto-notice shows only checked banner fields', () => {
    vi.setSystemTime(seoulTime('2026-09-17T22:50:00+09:00'));
    const base = parseHeartOps(JSON.stringify({
      version: 2,
      timezone: 'Asia/Seoul',
      slots: [{ id: 'slot-red', at: '23:00', notice_at: '22:40', unlock: ['red'] }],
    }));
    const noticeOnly = heartOpsBannerState({
      ...base,
      slots: [{ ...base.slots[0], notice_at: '22:55', show_notice: true, unlock: [] }],
      show_countdown: false,
    });
    expect(noticeOnly.autoLine).toBe('호감 하트 22:55 공지');
    expect(noticeOnly.countdownSec).toBeNull();

    const unlockOnly = heartOpsBannerState({ ...base, show_countdown: false });
    expect(unlockOnly.autoLine).toBe('호감 하트 23:00 해금');
    expect(unlockOnly.countdownSec).toBeNull();

    const two = heartOpsBannerState({
      ...base,
      slots: [{ ...base.slots[0], show_notice: true }],
      show_countdown: false,
    });
    expect(two.autoLine).toBe('호감 하트 22:40 공지 · 23:00 해금');
    expect(two.countdownSec).toBeNull();

    const all = heartOpsBannerState({
      ...base,
      slots: [{ ...base.slots[0], show_notice: true }],
    });
    expect(all.autoLine).toBe('호감 하트 22:40 공지 · 23:00 해금');
    expect(all.countdownSec).toBe(10 * 60);
  });

  it('empty unlock list does not auto-unlock after at', () => {
    vi.setSystemTime(seoulTime('2026-09-17T23:05:00+09:00'));
    const held = parseHeartOps(JSON.stringify({
      version: 2,
      timezone: 'Asia/Seoul',
      slots: [{ id: 'slot-red', at: '23:00', unlock: [] }],
    }));
    expect(unlockedHeartKeys(held).has('red')).toBe(false);
  });

  it('heartOpsHeartRows expands shared pink+green into two independent rows', () => {
    const rows = heartOpsHeartRows(DEFAULT_HEART_OPS);
    expect(rows.map(s => s.id)).toEqual(['slot-red', 'slot-blue', 'slot-pink', 'slot-green', 'slot-rainbow']);
    expect(rows.map(s => s.at)).toEqual(['23:00', '23:30', '24:00', '24:00', '24:30']);
    expect(rows.map(s => s.unlock)).toEqual([['red'], ['blue'], ['pink'], ['green'], ['rainbow']]);
  });

  it('patchHeartOpsSlotNoticeAt does not change unlock at', () => {
    const patched = patchHeartOpsSlotNoticeAt(DEFAULT_HEART_OPS.slots, 0, 22, 40);
    expect(patched[0].notice_at).toBe('22:40');
    expect(patched[0].at).toBe('23:00');
    expect(patched[0].unlock).toEqual(DEFAULT_HEART_OPS.slots[0].unlock);
  });

  it('resetHeartUnlocks relocks passed slots without dropping times or likes usage', () => {
    vi.setSystemTime(seoulTime('2026-09-18T00:35:00+09:00'));
    const open = { ...config, instant_unlock: ['rainbow' as const] };
    expect(unlockedHeartKeys(open).has('red')).toBe(true);
    expect(unlockedHeartKeys(open).has('rainbow')).toBe(true);

    const reset = resetHeartUnlocks({ ...open, show_notice_time: true, show_countdown: false });
    expect(reset.slots).toEqual(open.slots);
    expect(reset.instant_unlock).toEqual([]);
    expect(reset.direct_notice).toBe(open.direct_notice);
    expect(reset.show_notice_time).toBe(true);
    expect(reset.show_countdown).toBe(false);
    expect(unlockedHeartKeys(reset).has('red')).toBe(false);
    expect(unlockedHeartKeys(reset).has('blue')).toBe(false);
    expect(unlockedHeartKeys(reset).has('pink')).toBe(false);
    expect(unlockedHeartKeys(reset).has('green')).toBe(false);
    expect(unlockedHeartKeys(reset).has('rainbow')).toBe(false);

    const again = parseHeartOps(serializeHeartOps({ ...reset, instant_unlock: ['red'] }));
    expect(again.slots.map(s => s.at)).toEqual(open.slots.map(s => s.at));
    expect(again.slots.map(s => s.unlock)).toEqual(open.slots.map(s => s.unlock));
    expect(unlockedHeartKeys(again).has('red')).toBe(true);
    expect(unlockedHeartKeys(again).has('rainbow')).toBe(false);
    expect(heartUsageFromLikeRows([
      { liker_id: 'me', heart_type: 'red', like_source: 'grant' },
    ], 'me').grantUsed.red).toBe(true);

    vi.setSystemTime(seoulTime('2026-09-17T23:10:00+09:00'));
    const earlyReset = resetHeartUnlocks(config);
    expect(unlockedHeartKeys(earlyReset).has('red')).toBe(false);
    vi.setSystemTime(seoulTime('2026-09-17T23:31:00+09:00'));
    expect(unlockedHeartKeys(earlyReset).has('red')).toBe(false);
    expect(unlockedHeartKeys(earlyReset).has('blue')).toBe(true);
  });

  it('24:00 and 24:30 map to post-midnight event minutes', () => {
    expect(slotEventMinute('24:00')).toBe(24 * 60);
    expect(slotEventMinute('24:30')).toBe(24 * 60 + 30);

    vi.setSystemTime(seoulTime('2026-09-18T00:05:00+09:00'));
    expect(unlockedHeartKeys(config).has('pink')).toBe(true);
    expect(unlockedHeartKeys(config).has('green')).toBe(true);
    expect(unlockedHeartKeys(config).has('rainbow')).toBe(false);

    vi.setSystemTime(seoulTime('2026-09-18T00:31:00+09:00'));
    expect(unlockedHeartKeys(config).has('rainbow')).toBe(true);
  });

  it('migrates v1 heart_grants to unlock flags', () => {
    const raw = JSON.stringify({
      timezone: 'Asia/Seoul',
      slots: [{ id: 's1', at: '23:00', heart_grants: { red: 2 }, rainbow_pool: 4 }],
    });
    const parsed = parseHeartOps(raw);
    expect(parsed.version).toBe(2);
    expect(parsed.slots[0]?.unlock).toContain('red');
    expect(parsed.slots[0]?.unlock).toContain('rainbow');
  });

  it('re-evaluating the same unlock slot never revives used hearts', () => {
    const rows = [
      { liker_id: 'me', heart_type: 'red', like_source: 'grant' },
      { liker_id: 'me', heart_type: 'pink', like_source: 'rainbow' },
      { liker_id: 'me', heart_type: 'green', like_source: 'rainbow' },
    ];
    const usage = heartUsageFromLikeRows(rows, 'me');

    // Same slot minute evaluated repeatedly (SSE re-emit / interval tick / re-render).
    for (const iso of [
      '2026-09-18T00:30:00+09:00',
      '2026-09-18T00:30:00+09:00',
      '2026-09-18T00:30:30+09:00',
      '2026-09-18T01:10:00+09:00',
    ]) {
      vi.setSystemTime(seoulTime(iso));
      expect(grantRemaining(config, usage, 'red')).toBe(0);
      expect(rainbowRemaining(config, usage)).toBe(2);
    }
  });

  it('duplicate instant_unlock does not add rainbow capacity', () => {
    vi.setSystemTime(seoulTime('2026-09-17T23:10:00+09:00'));
    const twice = parseHeartOps(JSON.stringify({
      version: 2,
      timezone: 'Asia/Seoul',
      slots: [{ id: 'r', at: '24:30', unlock: ['rainbow', 'rainbow'] }],
      instant_unlock: ['rainbow', 'rainbow', 'rainbow'],
    }));
    expect(twice.instant_unlock).toEqual(['rainbow']);
    const usage = heartUsageFromLikeRows([
      { liker_id: 'me', heart_type: 'red', like_source: 'rainbow' },
      { liker_id: 'me', heart_type: 'blue', like_source: 'rainbow' },
    ], 'me');
    expect(rainbowRemaining(twice, usage)).toBe(2);
  });

  it('reload keeps usage-derived remaining after serialize/parse round-trip', () => {
    vi.setSystemTime(seoulTime('2026-09-18T00:40:00+09:00'));
    const rows = [
      { liker_id: 'me', heart_type: 'red', like_source: 'grant' },
      { liker_id: 'me', heart_type: 'blue', like_source: 'rainbow' },
    ];
    const before = participantHeartState(config, heartUsageFromLikeRows(rows, 'me'), false);
    const reloaded = parseHeartOps(serializeHeartOps(config));
    const after = participantHeartState(reloaded, heartUsageFromLikeRows(rows, 'me'), false);
    expect(after.grantRemaining).toEqual(before.grantRemaining);
    expect(after.grantRemaining.red).toBe(0);
    expect(after.grantRemaining.blue).toBe(1);
    expect(after.rainbowRemaining).toBe(3);
  });

  it('participantHeartState shows 0 rainbow after 4 uses (5th rejected server-side)', () => {
    vi.setSystemTime(seoulTime('2026-09-18T00:35:00+09:00'));
    const onlyRainbow = parseHeartOps(JSON.stringify({
      version: 2,
      timezone: 'Asia/Seoul',
      slots: [{ id: 'r', at: '24:30', unlock: ['rainbow'] }],
      instant_unlock: ['rainbow'],
    }));
    const usage = heartUsageFromLikeRows(
      Array.from({ length: 4 }, () => ({ liker_id: 'me', heart_type: 'blue', like_source: 'rainbow' })),
      'me',
    );
    const state = participantHeartState(onlyRainbow, usage, false);
    expect(state.rainbowRemaining).toBe(0);
    expect(state.heartsLocked).toBe(true);
  });

  it('functionsLocked locks every header chip and restores prior state when released', () => {
    vi.setSystemTime(seoulTime('2026-09-18T00:35:00+09:00'));
    const usage = heartUsageFromLikeRows([
      { liker_id: 'me', heart_type: 'red', like_source: 'grant' },
    ], 'me');
    const open = headerHeartRemainings({ functionsLocked: false, config, usage });
    expect(open.find(c => c.key === 'blue')?.locked).toBe(false);
    expect(open.find(c => c.key === 'red')?.locked).toBe(true);

    const locked = headerHeartRemainings({ functionsLocked: true, config, usage });
    expect(locked.every(c => c.locked)).toBe(true);
    expect(locked.find(c => c.key === 'blue')?.remaining).toBe(1);

    const released = headerHeartRemainings({ functionsLocked: false, config, usage });
    expect(released).toEqual(open);
    expect(released.find(c => c.key === 'red')?.locked).toBe(true);
  });
});
