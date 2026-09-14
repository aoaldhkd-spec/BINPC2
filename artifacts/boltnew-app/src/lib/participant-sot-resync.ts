/**
 * Decide when visibility / SSE-reconnect should fire multi SELECT SoT reloads.
 * Real reconnect always reloads (coalesce only). Visibility skips when SSE healthy + fresh.
 * Domains cover whole participant app (profiles/hearts/chat/contact/session), not chat-only.
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

/** Domains reloaded together on participant SoT (attach/detach by callback wiring). */
export type ParticipantSoTDomain =
  | 'profiles'
  | 'chatList'
  | 'likes'
  | 'receivedLikes'
  | 'contactShares'
  | 'sessionReady';

const ALL_SOT_DOMAINS: readonly ParticipantSoTDomain[] = [
  'profiles',
  'chatList',
  'likes',
  'receivedLikes',
  'contactShares',
  'sessionReady',
] as const;

export function planParticipantSoTDomains(
  _trigger: ParticipantSoTTrigger,
): readonly ParticipantSoTDomain[] {
  return ALL_SOT_DOMAINS;
}

export type ParticipantSoTLoaders = {
  loadProfiles: () => PromiseLike<unknown[] | void> | unknown[] | void;
  loadChatList: (userId: string) => void | PromiseLike<void>;
  loadLikes: (userId: string) => void | PromiseLike<void>;
  loadReceivedLikes: (userId: string) => void | PromiseLike<void>;
  loadContactShareData: (userId: string) => void | PromiseLike<void>;
  /** Optional — /ready session/timer/lock (reconnect path). */
  refreshSessionReady?: () => void | PromiseLike<void>;
};

/**
 * Run domain loaders after planParticipantSoTReload said shouldReload.
 * visibility: profiles first; skip dependents if empty (preserve 7d session).
 * sse-reconnect / manual: fire all in parallel (including sessionReady).
 */
export async function runParticipantSoTReload(
  trigger: ParticipantSoTTrigger,
  userId: string,
  loaders: ParticipantSoTLoaders,
): Promise<void> {
  const domains = planParticipantSoTDomains(trigger);
  const want = (d: ParticipantSoTDomain) => domains.includes(d);

  if (trigger === 'visibility') {
    if (want('profiles')) {
      const allProfiles = await Promise.resolve(loaders.loadProfiles());
      if (Array.isArray(allProfiles) && allProfiles.length === 0) return;
    }
    if (want('receivedLikes')) void loaders.loadReceivedLikes(userId);
    if (want('likes')) void loaders.loadLikes(userId);
    if (want('chatList')) void loaders.loadChatList(userId);
    if (want('contactShares')) void loaders.loadContactShareData(userId);
    return;
  }

  if (want('chatList')) void loaders.loadChatList(userId);
  if (want('receivedLikes')) void loaders.loadReceivedLikes(userId);
  if (want('likes')) void loaders.loadLikes(userId);
  if (want('contactShares')) void loaders.loadContactShareData(userId);
  if (want('profiles')) void loaders.loadProfiles();
  if (want('sessionReady') && loaders.refreshSessionReady) void loaders.refreshSessionReady();
}
