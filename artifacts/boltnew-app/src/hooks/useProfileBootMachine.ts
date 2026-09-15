/**
 * Thin wire for loading-main profile boot / backoff.
 * Pure decisions live in profile-boot-machine; App applies results.
 */
import { useEffect, useRef } from 'react';
import type { Profile } from '../types/app';
import { findProfileById } from '../lib/profile-session';
import {
  PROFILE_BOOT_EXHAUSTED_RETRY_MS,
  PROFILE_BOOT_POLL_MS,
  planProfileBootCacheHit,
  planProfileBootFetchResult,
} from '../lib/profile-boot-machine';

export type UseProfileBootMachineArgs = {
  view: string;
  getUserId: () => string | null;
  getProfiles: () => Profile[];
  loadProfiles: () => Promise<Profile[]>;
  fetchProfileById: (uid: string) => Promise<Profile | null>;
  mergeFetchedProfile: (me: Profile) => void;
  onEnterMain: () => void;
  onRegister: () => void;
  /** Others present, me missing — clear stored user + recover screen. */
  onRecoverCleared: () => void;
  /** Max attempts — recover screen without clearing uid (server may still be booting). */
  onRecoverExhausted: () => void;
};

export function useProfileBootMachine(args: UseProfileBootMachineArgs): void {
  const argsRef = useRef(args);
  argsRef.current = args;

  useEffect(() => {
    if (args.view !== 'loading-main') return;
    let cancelled = false;

    const tryEnterMainFromCache = (): boolean => {
      const a = argsRef.current;
      const me = findProfileById(a.getProfiles(), a.getUserId());
      const decision = planProfileBootCacheHit(me);
      if (decision.kind === 'enter-main') {
        a.onEnterMain();
        return true;
      }
      return false;
    };

    tryEnterMainFromCache();
    const pollId = setInterval(() => {
      if (cancelled) return;
      if (tryEnterMainFromCache()) clearInterval(pollId);
    }, PROFILE_BOOT_POLL_MS);

    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRetry = (delay: number) => {
      retryTimer = setTimeout(async () => {
        if (cancelled) return;
        attempt++;
        const a = argsRef.current;
        try {
          const uid = a.getUserId();
          if (!uid) {
            clearInterval(pollId);
            a.onRegister();
            return;
          }
          const allProfiles = await a.loadProfiles();
          if (cancelled) return;
          let me = findProfileById(allProfiles, uid);
          if (!me) {
            const direct = await a.fetchProfileById(uid);
            if (direct) {
              me = direct;
              a.mergeFetchedProfile(direct);
            }
          }
          const decision = planProfileBootFetchResult({
            uid,
            me,
            allProfilesCount: allProfiles.length,
            attempt,
          });
          if (decision.kind === 'enter-main') {
            clearInterval(pollId);
            a.onEnterMain();
            return;
          }
          if (decision.kind === 'recover-cleared') {
            clearInterval(pollId);
            a.onRecoverCleared();
            return;
          }
          if (decision.kind === 'register') {
            clearInterval(pollId);
            a.onRegister();
            return;
          }
          if (decision.kind === 'continue-retry') {
            if (!cancelled) scheduleRetry(decision.delayMs);
            return;
          }
          if (decision.kind === 'recover-exhausted') {
            // Do not send a returning user to recovery merely because the API
            // was unavailable for the first few attempts. Keep the identity
            // and continue in the background until the profile is readable.
            a.onRecoverExhausted();
            if (!cancelled) scheduleRetry(PROFILE_BOOT_EXHAUSTED_RETRY_MS);
            return;
          }
        } catch {
          // network — retry with same attempt already incremented
          const decision = planProfileBootFetchResult({
            uid: argsRef.current.getUserId(),
            me: undefined,
            allProfilesCount: 0,
            attempt,
          });
          if (!cancelled) {
            if (decision.kind === 'continue-retry') {
              scheduleRetry(decision.delayMs);
            } else if (decision.kind === 'recover-exhausted') {
              argsRef.current.onRecoverExhausted();
              if (!cancelled) scheduleRetry(PROFILE_BOOT_EXHAUSTED_RETRY_MS);
            } else if (decision.kind === 'register') {
              clearInterval(pollId);
              argsRef.current.onRegister();
            }
          }
        }
      }, delay);
    };

    // First lookup immediate — backoff only after failure.
    scheduleRetry(0);

    return () => {
      cancelled = true;
      clearInterval(pollId);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [args.view]);
}
