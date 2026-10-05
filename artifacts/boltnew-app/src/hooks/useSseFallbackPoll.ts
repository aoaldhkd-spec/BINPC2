/**
 * Thin wire: when Net UI is not ok, periodically reload SoT domains if SSE is unhealthy.
 * App only passes loaders + status — no new App useState.
 */
import { useEffect, useRef } from 'react';
import {
  planSseFallbackTick,
  sseFallbackPollIntervalMs,
  type SseFallbackConnStatus,
} from '../lib/sse-fallback-poll';
import { isSseHealthy } from '../lib/supabase';

export type UseSseFallbackPollArgs = {
  connStatus: SseFallbackConnStatus;
  currentUserId: string | null;
  loadProfiles: () => void | Promise<unknown>;
  loadChatList: (userId: string) => void | Promise<void>;
  loadGroupChats: (userId: string) => void | Promise<void>;
  loadReceivedLikes: (userId: string) => void | Promise<void>;
  loadLikes: (userId: string) => void | Promise<void>;
  loadContactShareData: (userId: string) => void | Promise<void>;
};

export function useSseFallbackPoll(args: UseSseFallbackPollArgs): void {
  const argsRef = useRef(args);
  argsRef.current = args;

  useEffect(() => {
    const { connStatus, currentUserId } = args;
    const start = planSseFallbackTick({
      connStatus,
      currentUserId,
      sseHealthy: false,
    });
    if (!start.shouldPoll || !currentUserId) return;

    const uid = currentUserId;
    let cancelled = false;
    let pollInFlight = false;
    let consecutivePolls = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (cancelled) return;
      const delay = sseFallbackPollIntervalMs(argsRef.current.connStatus, consecutivePolls);
      timer = setTimeout(tick, delay);
    };

    const tick = () => {
      if (cancelled) return;
      if (pollInFlight) { schedule(); return; }

      const a = argsRef.current;
      const plan = planSseFallbackTick({
        connStatus: a.connStatus,
        currentUserId: uid,
        sseHealthy: isSseHealthy(),
      });
      if (!plan.shouldPoll) {
        consecutivePolls = 0;
        schedule();
        return;
      }

      pollInFlight = true;
      void Promise.allSettled([
        Promise.resolve(a.loadProfiles()),
        Promise.resolve(a.loadChatList(uid)),
        Promise.resolve(a.loadGroupChats(uid)),
        Promise.resolve(a.loadReceivedLikes(uid)),
        Promise.resolve(a.loadLikes(uid)),
        Promise.resolve(a.loadContactShareData(uid)),
      ]).finally(() => {
        pollInFlight = false;
        consecutivePolls += 1;
        schedule();
      });
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  // argsRef keeps loaders fresh; only restart recovery loop on status/user change
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mirror useParticipantSoTResync
  }, [args.connStatus, args.currentUserId]);
}
