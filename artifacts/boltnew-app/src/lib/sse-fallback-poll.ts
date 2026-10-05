/**
 * Interval + skip rules for SSE-unhealthy polling fallback.
 * App/hook only wires loaders — no feature useState here.
 */

export type SseFallbackConnStatus = 'ok' | 'reconnecting' | 'error' | string;

// Fast first recovery, then progressively reduce pressure during long outages.
export const SSE_FALLBACK_BACKOFF_MS = [3_000, 5_000, 10_000, 15_000] as const;
export const SSE_FALLBACK_ERROR_MS = SSE_FALLBACK_BACKOFF_MS[0];
export const SSE_FALLBACK_RECONNECTING_MS = SSE_FALLBACK_BACKOFF_MS[0];

export function sseFallbackPollIntervalMs(
  connStatus: SseFallbackConnStatus,
  consecutivePolls = 0,
): number {
  if (connStatus === 'ok') return SSE_FALLBACK_BACKOFF_MS[0];
  const idx = Math.min(Math.max(0, Math.floor(consecutivePolls)), SSE_FALLBACK_BACKOFF_MS.length - 1);
  return SSE_FALLBACK_BACKOFF_MS[idx];
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
  if (input.sseHealthy) return { shouldPoll: false, skipReason: 'sse-healthy' };
  return { shouldPoll: true };
}
