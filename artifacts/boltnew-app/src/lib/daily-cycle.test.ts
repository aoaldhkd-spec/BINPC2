import { describe, expect, it } from 'vitest';
import { dailyCycleBannerState } from './daily-cycle';

describe('fixed daily participant notices', () => {
  it('shows no false heart unlock/countdown before an administrator starts, or after reset', () => {
    const now = new Date('2026-10-13T23:30:00+09:00');
    expect(dailyCycleBannerState(now, null, false).phase).toBe('idle');
    expect(dailyCycleBannerState(now, '2026-10-13T18:00:00+09:00', true).countdownSec).toBe(0);
    expect(dailyCycleBannerState(new Date('2026-10-14T10:00:00+09:00'),
      '2026-10-13T18:00:00+09:00', false).message).toContain('기존 참가자');
  });
  it('a 13:00 administrator start waits for 23:00, never announces premature 01:00 closing', () => {
    const s = dailyCycleBannerState(new Date('2026-10-13T14:00:00+09:00'),
      '2026-10-13T13:00:00+09:00', false);
    expect(s.phase).toBe('waiting-hearts');
    expect(s.countdownSec).toBe(9 * 3600);
  });
  it('a 05:00 start waits for the current-day 23:00 unlock', () => {
    const s = dailyCycleBannerState(new Date('2026-10-14T06:00:00+09:00'),
      '2026-10-14T05:00:00+09:00', false);
    expect(s.phase).toBe('waiting-hearts');
    expect(s.countdownSec).toBe(17 * 3600);
  });
  it('a 00:30 start reaches that day 01:00 admission close, then 17:00 reset', () => {
    const started='2026-10-14T00:30:00+09:00';
    expect(dailyCycleBannerState(new Date('2026-10-14T00:45:00+09:00'),started,false).phase).toBe('rainbow-open');
    expect(dailyCycleBannerState(new Date('2026-10-14T01:00:00+09:00'),started,false).phase).toBe('ended');
    expect(dailyCycleBannerState(new Date('2026-10-14T10:00:00+09:00'),started,false).countdownSec).toBe(7*3600);
  });
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
