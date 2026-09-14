import { describe, it, expect } from 'vitest';
import {
  planSseFallbackTick,
  sseFallbackPollIntervalMs,
  SSE_FALLBACK_ERROR_MS,
  SSE_FALLBACK_RECONNECTING_MS,
} from './sse-fallback-poll';

describe('sseFallbackPollIntervalMs', () => {
  it('uses 5s on error and 8s otherwise', () => {
    expect(sseFallbackPollIntervalMs('error')).toBe(SSE_FALLBACK_ERROR_MS);
    expect(sseFallbackPollIntervalMs('reconnecting')).toBe(SSE_FALLBACK_RECONNECTING_MS);
    expect(sseFallbackPollIntervalMs('ok')).toBe(SSE_FALLBACK_RECONNECTING_MS);
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
