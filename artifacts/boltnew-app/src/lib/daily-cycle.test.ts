import { describe, expect, it } from 'vitest';
import { dailyCycleBannerState } from './daily-cycle';

describe('fixed daily participant notices', () => {
  it('17~23 counts down to normal hearts', () => {
    const s = dailyCycleBannerState(new Date('2026-10-05T22:00:00+09:00'));
    expect(s.phase).toBe('waiting-hearts');
    expect(s.message).toContain('23시');
    expect(s.countdownSec).toBe(60 * 60);
  });

  it('23~24 says normal hearts opened and counts to rainbow', () => {
    const s = dailyCycleBannerState(new Date('2026-10-05T23:30:00+09:00'));
    expect(s.phase).toBe('grant-open');
    expect(s.message).toContain('일반 하트가 풀렸습니다');
    expect(s.message).toContain('24시');
    expect(s.countdownSec).toBe(30 * 60);
  });

  it('00~01 says rainbow opened and counts to closing', () => {
    const s = dailyCycleBannerState(new Date('2026-10-06T00:30:00+09:00'));
    expect(s.phase).toBe('rainbow-open');
    expect(s.message).toContain('무지개하트가 풀렸습니다');
    expect(s.message).toContain('01시');
    expect(s.countdownSec).toBe(30 * 60);
  });

  it('01~17 says event ended and counts to reset', () => {
    const s = dailyCycleBannerState(new Date('2026-10-06T10:00:00+09:00'));
    expect(s.phase).toBe('ended');
    expect(s.message).toContain('17시');
    expect(s.countdownSec).toBe(7 * 60 * 60);
  });

  it('switches exactly at 01 / 17 / 23 / 24 boundaries', () => {
    expect(dailyCycleBannerState(new Date('2026-10-06T00:59:59+09:00')).phase).toBe('rainbow-open');
    expect(dailyCycleBannerState(new Date('2026-10-06T01:00:00+09:00')).phase).toBe('ended');
    expect(dailyCycleBannerState(new Date('2026-10-06T17:00:00+09:00')).phase).toBe('waiting-hearts');
    expect(dailyCycleBannerState(new Date('2026-10-06T23:00:00+09:00')).phase).toBe('grant-open');
    expect(dailyCycleBannerState(new Date('2026-10-07T00:00:00+09:00')).phase).toBe('rainbow-open');
  });
});
