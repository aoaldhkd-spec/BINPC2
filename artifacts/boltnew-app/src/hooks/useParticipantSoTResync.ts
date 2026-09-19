/**
 * Thin wire for participant SoT: visibility + SSE reconnect.
 * App only passes loaders + applySessionReady — no new App useState.
 */
import { useEffect, useRef } from 'react';
import {
  planParticipantSoTReload,
  runParticipantSoTReload,
} from '../lib/participant-sot-resync';
import {
  fetchReadySettingsJson,
  planSessionReadySettingsPatch,
  type SessionReadySettingsPatch,
} from '../lib/session-ready-settings';
import { eventScheduleRealtimeSeqValue, fetchedScheduleIsCurrent } from '../lib/event-schedule';
import { onSseReconnect, isSseHealthy } from '../lib/supabase';
import type { Profile } from '../types/app';

export type UseParticipantSoTResyncArgs = {
  currentUserId: string | null;
  getStoredUserId: () => string | null;
  loadProfiles: () => Promise<Profile[]>;
  loadChatList: (userId: string) => void | Promise<void>;
  loadLikes: (userId: string) => void | Promise<void>;
  loadReceivedLikes: (userId: string) => void | Promise<void>;
  loadContactShareData: (userId: string) => void | Promise<void>;
  /** App wires setState / refs; hook owns no feature state. */
  applySessionReady: (
    patch: SessionReadySettingsPatch,
    source: 'visibility' | 'sse-reconnect',
  ) => void;
};

export function useParticipantSoTResync(args: UseParticipantSoTResyncArgs): void {
  const lastAtRef = useRef(0);
  const argsRef = useRef(args);
  argsRef.current = args;

  // Re-validate when the user returns to the app (Android/iOS back, home, tab switch)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      const a = argsRef.current;
      // 백그라운드 중 SSE 유실 시 기능 잠금·세션 상태를 /ready로 즉시 보정 (SoT skip과 무관)
      void fetchReadySettingsJson(5_000).then((settings) => {
        const patch = planSessionReadySettingsPatch(settings, {
          includeTimers: false,
          omitEventSchedule: isSseHealthy(),
        });
        if (patch) a.applySessionReady(patch, 'visibility');
      });
      const storedId = a.getStoredUserId();
      if (!storedId) return;
      const plan = planParticipantSoTReload({
        trigger: 'visibility',
        now: Date.now(),
        lastReloadAt: lastAtRef.current,
        sseHealthy: isSseHealthy(),
      });
      if (!plan.shouldReload) return;
      // 포그라운드 복귀 시 데이터만 조용히 갱신. 목록이 비거나 잘려도 7일 세션을 끊지 않는다.
      lastAtRef.current = Date.now();
      void runParticipantSoTReload('visibility', storedId, {
        loadProfiles: a.loadProfiles,
        loadChatList: a.loadChatList,
        loadLikes: a.loadLikes,
        loadReceivedLikes: a.loadReceivedLikes,
        loadContactShareData: a.loadContactShareData,
      }).catch(() => { /* 네트워크 오류 → 세션 유지 */ });
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // SSE 재연결 시 DB Source-of-Truth 재동기화 (UI 모달은 net-health가 담당)
  // Duplicate reconnect storms coalesce; visibility skips when SSE healthy + fresh.
  // Real disconnect recovery always reloads (planParticipantSoTReload sse-reconnect).
  useEffect(() => {
    if (!args.currentUserId) return;
    const uid = args.currentUserId;
    const unsubReconnect = onSseReconnect(() => {
      const a = argsRef.current;
      const plan = planParticipantSoTReload({
        trigger: 'sse-reconnect',
        now: Date.now(),
        lastReloadAt: lastAtRef.current,
        sseHealthy: isSseHealthy(),
      });
      if (!plan.shouldReload) return;
      lastAtRef.current = Date.now();
      void runParticipantSoTReload('sse-reconnect', uid, {
        loadProfiles: a.loadProfiles,
        loadChatList: a.loadChatList,
        loadLikes: a.loadLikes,
        loadReceivedLikes: a.loadReceivedLikes,
        loadContactShareData: a.loadContactShareData,
        refreshSessionReady: () => {
          const startedSeq = eventScheduleRealtimeSeqValue();
          return fetchReadySettingsJson(8_000).then((settings) => {
            const patch = planSessionReadySettingsPatch(settings, {
              includeTimers: true,
              omitEventSchedule: !fetchedScheduleIsCurrent(startedSeq),
            });
            if (patch) a.applySessionReady(patch, 'sse-reconnect');
          });
        },
      });
    });
    return unsubReconnect;
  }, [args.currentUserId]);
}
