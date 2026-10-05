import { describe, it, expect } from 'vitest';
import {
  planSseFallbackTick,
  sseFallbackPollIntervalMs,
  SSE_FALLBACK_BACKOFF_MS,
  SSE_FALLBACK_ERROR_MS,
  SSE_FALLBACK_RECONNECTING_MS,
} from './sse-fallback-poll';

describe('sseFallbackPollIntervalMs', () => {
  it('backs off from 3s to 15s during a long outage', () => {
    expect(sseFallbackPollIntervalMs('error', 0)).toBe(3_000);
    expect(sseFallbackPollIntervalMs('error', 1)).toBe(5_000);
    expect(sseFallbackPollIntervalMs('error', 2)).toBe(10_000);
    expect(sseFallbackPollIntervalMs('error', 3)).toBe(15_000);
    expect(sseFallbackPollIntervalMs('error', 99)).toBe(15_000);
    expect(SSE_FALLBACK_BACKOFF_MS).toEqual([3_000, 5_000, 10_000, 15_000]);
  });

  it('keeps compatibility constants at the fast first-recovery cadence', () => {
    expect(SSE_FALLBACK_ERROR_MS).toBe(3_000);
    expect(SSE_FALLBACK_RECONNECTING_MS).toBe(3_000);
    expect(sseFallbackPollIntervalMs('ok', 99)).toBe(3_000);
  });
});

describe('planSseFallbackTick', () => {
  it('skips when conn is ok', () => {
    expect(planSseFallbackTick({
      connStatus: 'ok',
      currentUserId: 'u1',
      sseHealthy: false,
    })).toEqual({ shouldPoll: false, skipReason: 'conn-ok' });
  });

  it('skips without user', () => {
    expect(planSseFallbackTick({
      connStatus: 'error',
      currentUserId: null,
      sseHealthy: false,
    }).skipReason).toBe('no-user');
  });

  it('skips when EventSource is healthy (UI lag)', () => {
    expect(planSseFallbackTick({
      connStatus: 'reconnecting',
      currentUserId: 'u1',
      sseHealthy: true,
    })).toEqual({ shouldPoll: false, skipReason: 'sse-healthy' });
  });

  it('polls when unhealthy and user present', () => {
    expect(planSseFallbackTick({
      connStatus: 'error',
      currentUserId: 'u1',
      sseHealthy: false,
    })).toEqual({ shouldPoll: true });
  });
});
