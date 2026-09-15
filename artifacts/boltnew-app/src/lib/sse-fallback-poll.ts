/**
 * Interval + skip rules for SSE-unhealthy polling fallback.
 * App/hook only wires loaders — no feature useState here.
 */

export type SseFallbackConnStatus = 'ok' | 'reconnecting' | 'error' | string;

// Fallback reads are a safety net, not a reconnect loop. Keep a short bounded
// cadence; the hook-level in-flight guard prevents an outage from becoming a 429 burst.
export const SSE_FALLBACK_ERROR_MS = 3_000;
export const SSE_FALLBACK_RECONNECTING_MS = 3_000;

/** Use the same short cadence for recovery and hard-error fallback. */
export function sseFallbackPollIntervalMs(connStatus: SseFallbackConnStatus): number {
  return connStatus === 'error' ? SSE_FALLBACK_ERROR_MS : SSE_FALLBACK_RECONNECTING_MS;
}

export type SseFallbackTickPlan = {
  shouldPoll: boolean;
  skipReason?: 'conn-ok' | 'no-user' | 'sse-healthy';
};

/** Decide whether this tick should fire multi-domain loaders. */
export function planSseFallbackTick(input: {
  connStatus: SseFallbackConnStatus;
  currentUserId: string | null | undefined;
  sseHealthy: boolean;
}): SseFallbackTickPlan {
  if (input.connStatus === 'ok') return { shouldPoll: false, skipReason: 'conn-ok' };
  if (!input.currentUserId) return { shouldPoll: false, skipReason: 'no-user' };
  // UI status can lag behind a healthy EventSource — skip duplicate full refetches
  // (onSseReconnect / SoT already resyncs when the link comes back).
  if (input.sseHealthy) return { shouldPoll: false, skipReason: 'sse-healthy' };
  return { shouldPoll: true };
}
