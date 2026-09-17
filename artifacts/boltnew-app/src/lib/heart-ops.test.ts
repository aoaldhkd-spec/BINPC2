import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  DEFAULT_HEART_OPS,
  grantRemaining,
  heartUsageFromLikeRows,
  parseHeartOps,
  rainbowRemaining,
  serializeHeartOps,
  slotEventMinute,
  unlockedHeartKeys,
  participantHeartState,
  headerHeartRemainings,
  heartOpsBannerState,
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
