/**
 * Pure decisions for loading-main profile boot / exponential backoff.
 * Hook owns timers; App applies enter-main / recover / register side effects.
 * Empty profile lists keep retrying (do not clear 7d session storage).
 */
import type { Profile } from '../types/app';
import { isCompleteProfile } from './profile-session';

export const PROFILE_BOOT_MAX_ATTEMPTS = 8;
export const PROFILE_BOOT_BASE_DELAY_MS = 1_000;
export const PROFILE_BOOT_POLL_MS = 200;
/** After the initial bounded burst, keep the session alive and retry quietly. */
export const PROFILE_BOOT_EXHAUSTED_RETRY_MS = 3_000;

/** Delay after a failed attempt (attempt already incremented). */
export function profileBootRetryDelayMs(
  attempt: number,
  baseDelayMs: number = PROFILE_BOOT_BASE_DELAY_MS,
): number {
  return baseDelayMs * Math.pow(2, Math.min(attempt, 4));
}

export type ProfileBootDecision =
  | { kind: 'enter-main' }
  | { kind: 'register' }
  | { kind: 'recover-cleared' }
  | { kind: 'recover-exhausted' }
  | { kind: 'continue-retry'; delayMs: number }
  | { kind: 'await-profile' };

/** Cache / SSE poll tick — enter main only when my profile is complete. */
export function planProfileBootCacheHit(
  me: Profile | null | undefined,
): ProfileBootDecision {
  if (me && isCompleteProfile(me)) return { kind: 'enter-main' };
  return { kind: 'await-profile' };
}

/**
 * After loadProfiles (+ optional direct id fetch).
 * - no uid → register
 * - complete me → main
 * - others exist but me missing → retry too (a partial/stale response must not sign users out)
 * - empty list or incomplete me → retry until max; the caller keeps retrying without clearing uid
 */
export function planProfileBootFetchResult(input: {
  uid: string | null | undefined;
  me: Profile | null | undefined;
  allProfilesCount: number;
  attempt: number;
  maxAttempts?: number;
  baseDelayMs?: number;
}): ProfileBootDecision {
  if (!input.uid) return { kind: 'register' };
  if (input.me && isCompleteProfile(input.me)) return { kind: 'enter-main' };
  // A non-empty list is not proof that this profile was deleted: a cold start,
  // replica lag, or a partial response can omit one row. Never clear the local
  // identity from this observation; a real wipe has an explicit reset path.
  const maxAttempts = input.maxAttempts ?? PROFILE_BOOT_MAX_ATTEMPTS;
  if (input.attempt < maxAttempts) {
    return {
      kind: 'continue-retry',
      delayMs: profileBootRetryDelayMs(input.attempt, input.baseDelayMs),
    };
  }
  return { kind: 'recover-exhausted' };
}
