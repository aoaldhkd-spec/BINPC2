/**
 * Decide when App.tsx visibility / SSE-reconnect should fire multi SELECT SoT reloads.
 * Real reconnect always reloads (coalesce only). Visibility skips when SSE healthy + fresh.
 */
export type ParticipantSoTTrigger = 'sse-reconnect' | 'visibility' | 'manual';

export const PARTICIPANT_SOT_FRESH_MS = 45_000;
export const PARTICIPANT_SOT_COALESCE_MS = 2_000;

export type ParticipantSoTPlanInput = {
  trigger: ParticipantSoTTrigger;
  now: number;
  lastReloadAt: number;
  sseHealthy: boolean;
  freshMs?: number;
  coalesceMs?: number;
};

export type ParticipantSoTPlan = {
  shouldReload: boolean;
  skipReason?: 'sse-healthy-fresh' | 'coalesced';
};

export function planParticipantSoTReload(input: ParticipantSoTPlanInput): ParticipantSoTPlan {
  const freshMs = input.freshMs ?? PARTICIPANT_SOT_FRESH_MS;
  const coalesceMs = input.coalesceMs ?? PARTICIPANT_SOT_COALESCE_MS;
  const since = input.now - (input.lastReloadAt || 0);

  if (input.trigger === 'manual') {
    return { shouldReload: true };
  }

  // After a real disconnect, SoT must run — only collapse duplicate reconnect storms.
  if (input.trigger === 'sse-reconnect') {
    if (input.lastReloadAt > 0 && since < coalesceMs) {
      return { shouldReload: false, skipReason: 'coalesced' };
    }
    return { shouldReload: true };
  }

  // Tab foreground: skip redundant full SELECT when link is healthy and data is fresh.
  if (input.sseHealthy && input.lastReloadAt > 0 && since < freshMs) {
    return { shouldReload: false, skipReason: 'sse-healthy-fresh' };
  }
  if (input.lastReloadAt > 0 && since < coalesceMs) {
    return { shouldReload: false, skipReason: 'coalesced' };
  }
  return { shouldReload: true };
}
