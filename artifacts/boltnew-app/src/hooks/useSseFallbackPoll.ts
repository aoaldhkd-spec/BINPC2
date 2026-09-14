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
      sseHealthy: false, // effect gate; per-tick checks real SSE
    });
    if (!start.shouldPoll || !currentUserId) return;

    const uid = currentUserId;
    const tick = () => {
      const a = argsRef.current;
      const plan = planSseFallbackTick({
        connStatus: a.connStatus,
        currentUserId: uid,
        sseHealthy: isSseHealthy(),
      });
      if (!plan.shouldPoll) return;
      void Promise.resolve(a.loadProfiles()).catch(() => {});
      void Promise.resolve(a.loadChatList(uid)).catch(() => {});
      void Promise.resolve(a.loadGroupChats(uid)).catch(() => {});
      void Promise.resolve(a.loadReceivedLikes(uid)).catch(() => {});
      void Promise.resolve(a.loadLikes(uid)).catch(() => {});
      void Promise.resolve(a.loadContactShareData(uid)).catch(() => {});
    };

    tick();
    const pollId = setInterval(tick, sseFallbackPollIntervalMs(connStatus));
    return () => { clearInterval(pollId); };
  // argsRef keeps loaders fresh; only restart interval on status/user change
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mirror useParticipantSoTResync
  }, [args.connStatus, args.currentUserId]);
}
