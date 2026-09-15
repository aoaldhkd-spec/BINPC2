/**
 * Hearts + contact_shares SSE apply — App wires setState; this hook owns
 * planners, toast timers, confetti trigger, and diag merge traces.
 * Does not subscribe (useUserRealtimeChannel routes events here).
 */
import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { diag } from '../lib/diag';
import { isIncomingHeartToastTarget, MUTUAL_HEART_TOAST, planIncomingHeartBottomNotif } from '../lib/heart-toast';
import { planReceivedLikeUpdate, preferReceivedHeartType } from '../lib/received-like-update';
import { planSentLikeInsert, shouldKeepExistingSentHeartType, planSentLikeStatusNotif } from '../lib/sent-like-insert';
import {
  upsertReceivedContactShare,
  upsertReceivedLikerFront,
} from '../lib/realtime-row-upsert';
import type { HeartType } from '../lib/constants';
import type { ContactShare, Profile } from '../types/app';
import { PROFILE_ROW_SELECT } from '../lib/profile-select';
import type { BottomNotificationData } from '../components/BottomNotification';
import type {
  ReceivedLikeInsertRow,
  ReceivedLikeUpdateRow,
  SentLikeInsertRow,
  SentLikeUpdateRow,
} from './useUserRealtimeChannel';

type SetState<T> = React.Dispatch<React.SetStateAction<T>>;

export type UseHeartsRealtimeApplyArgs = {
  currentUserId: string | null;
  userIdRef: React.MutableRefObject<string | null>;
  profilesRef: React.MutableRefObject<Profile[]>;
  loadReceivedLikesRef: React.MutableRefObject<((userId: string) => Promise<void>) | null>;
  loadContactShareData: (userId: string) => void | Promise<void>;
  triggerConfetti: () => void;
  setLikedIds: SetState<Set<string>>;
  setSentHeartTypes: SetState<Map<string, HeartType>>;
  setLikeStatuses: SetState<Map<string, string>>;
  setSentHeartsPerPerson: SetState<Map<string, Set<HeartType>>>;
  setReceivedHeartTypes: SetState<Map<string, HeartType>>;
  setReceivedLikers: SetState<Profile[]>;
  setAcknowledgedComplimentIds: SetState<Set<string>>;
  setReceivedContactShares: SetState<ContactShare[]>;
  setBottomNotif: SetState<BottomNotificationData | null>;
  setRejectionNotif: SetState<string | null>;
  /** For render-diag: likedIds / likeStatuses / receivedContactShares / receivedHeartTypes */
  likedIds: Set<string>;
  likeStatuses: Map<string, string>;
  receivedContactShares: ContactShare[];
  receivedHeartTypes: Map<string, HeartType>;
  sentHeartsPerPerson: Map<string, Set<HeartType>>;
};

export type HeartsRealtimeApplyHandlers = {
  onSentLikeInsert: (row: SentLikeInsertRow) => void;
  onSentLikeUpdate: (row: SentLikeUpdateRow) => void;
  onReceivedLikeInsert: (row: ReceivedLikeInsertRow) => void | Promise<void>;
  onReceivedLikeUpdate: (row: ReceivedLikeUpdateRow) => void;
  onContactShareInsert: (share: ContactShare) => void | Promise<void>;
  onContactShareUpdate: (share: ContactShare) => void;
};

export function useHeartsRealtimeApply(args: UseHeartsRealtimeApplyArgs): HeartsRealtimeApplyHandlers {
  const {
    currentUserId,
    userIdRef,
    profilesRef,
    loadReceivedLikesRef,
    loadContactShareData,
    triggerConfetti,
    setLikedIds,
    setSentHeartTypes,
    setLikeStatuses,
    setSentHeartsPerPerson,
    setReceivedHeartTypes,
    setReceivedLikers,
    setAcknowledgedComplimentIds,
    setReceivedContactShares,
    setBottomNotif,
    setRejectionNotif,
    likedIds,
    likeStatuses,
    receivedContactShares,
    receivedHeartTypes,
    sentHeartsPerPerson,
  } = args;

  const sentHeartsPerPersonRef = useRef(sentHeartsPerPerson);
  sentHeartsPerPersonRef.current = sentHeartsPerPerson;
  const receivedHeartTypesRef = useRef(receivedHeartTypes);
  receivedHeartTypesRef.current = receivedHeartTypes;

  const realtimeNotifTimerIdsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pendingRealtimeRenderTraceRef = useRef<{
    feature: 'hearts' | 'contact';
    rowId: string | null;
    createdAt: string | null;
  } | null>(null);

  const traceRealtimeStateMerge = useCallback((
    feature: 'hearts' | 'contact',
    row: { id?: string; created_at?: string },
  ) => {
    const trace = {
      feature,
      rowId: row.id ?? null,
      createdAt: row.created_at ?? null,
    };
    pendingRealtimeRenderTraceRef.current = trace;
    diag('debug', feature, 'state-merge', {
      corr: trace.rowId ?? undefined,
      data: { rowId: trace.rowId, createdAt: trace.createdAt, source: 'sse' },
    });
  }, []);

  useEffect(() => {
    const trace = pendingRealtimeRenderTraceRef.current;
    if (!trace) return;
    pendingRealtimeRenderTraceRef.current = null;
    diag('debug', trace.feature, 'render', {
      corr: trace.rowId ?? undefined,
      data: { rowId: trace.rowId, createdAt: trace.createdAt, userId: currentUserId },
    });
  }, [currentUserId, likedIds, likeStatuses, receivedContactShares, receivedHeartTypes]);

  // Clear SSE toast timers on user switch / unmount
  useEffect(() => {
    return () => {
      realtimeNotifTimerIdsRef.current.forEach(clearTimeout);
      realtimeNotifTimerIdsRef.current = [];
    };
  }, [currentUserId]);

  const onSentLikeInsert = useCallback((row: SentLikeInsertRow) => {
    const plan = planSentLikeInsert(row, {
      counterpartReceivedHeartType: receivedHeartTypesRef.current.get(row.liked_id),
    });
    if (!plan) return;
    setLikedIds((prev) => new Set([...prev, plan.likedId]));
    setSentHeartTypes((prev) => {
      const existing = prev.get(plan.likedId);
      if (shouldKeepExistingSentHeartType(existing, plan.heartType)) return prev;
      return new Map(prev).set(plan.likedId, plan.heartType);
    });
    setLikeStatuses(prev => prev.has(plan.likedId) ? prev : new Map(prev).set(plan.likedId, 'pending'));
    setSentHeartsPerPerson(prev => {
      const next = new Map(prev);
      const s = new Set(next.get(plan.likedId) ?? []);
      s.add(plan.heartType);
      next.set(plan.likedId, s);
      return next;
    });
    if (plan.showMutualToast) {
      const nick = profilesRef.current.find(p => p.id === plan.likedId)?.nickname ?? '상대방';
      setBottomNotif({ type: 'heart', heartMutual: true, nickname: nick, profileId: plan.likedId, message: MUTUAL_HEART_TOAST });
    }
    traceRealtimeStateMerge('hearts', row);
  }, [
    profilesRef, setLikedIds, setSentHeartTypes, setLikeStatuses, setSentHeartsPerPerson,
    setBottomNotif, traceRealtimeStateMerge,
  ]);

  const onSentLikeUpdate = useCallback((updated: SentLikeUpdateRow) => {
    setLikeStatuses(prev => new Map(prev).set(updated.liked_id, updated.status));
    const statusNick = profilesRef.current.find(p => p.id === updated.liked_id)?.nickname ?? '상대방';
    const statusNotif = planSentLikeStatusNotif(updated.status, statusNick);
    if (statusNotif?.kind === 'rejected') {
      setRejectionNotif(statusNotif.nickname);
      realtimeNotifTimerIdsRef.current.push(setTimeout(() => setRejectionNotif(null), 5000));
    } else if (statusNotif?.kind === 'accepted') {
      const uid = userIdRef.current;
      if (uid) void loadContactShareData(uid);
      setBottomNotif({ type: 'chat', nickname: statusNotif.nickname, message: statusNotif.message });
      realtimeNotifTimerIdsRef.current.push(setTimeout(() => setBottomNotif(prev => prev?.message === statusNotif.message ? null : prev), 5000));
    }
    traceRealtimeStateMerge('hearts', updated);
  }, [
    profilesRef, userIdRef, loadContactShareData, setLikeStatuses, setRejectionNotif,
    setBottomNotif, traceRealtimeStateMerge,
  ]);

  const onReceivedLikeInsert = useCallback(async (row: ReceivedLikeInsertRow) => {
    try {
      const likerId = row.liker_id;
      const uid = userIdRef.current;
      if (!uid || !isIncomingHeartToastTarget(uid, { liker_id: likerId, liked_id: row.liked_id ?? uid })) return;
      if (likerId) {
        const incomingHt = row.heart_type ?? 'red';
        setReceivedHeartTypes(prev => {
          const existing = prev.get(likerId);
          if (shouldKeepExistingSentHeartType(existing, incomingHt)) return prev;
          return new Map(prev).set(likerId, incomingHt);
        });
        const { data } = await supabase.from('profiles').select(PROFILE_ROW_SELECT).eq('id', likerId).maybeSingle();
        if (data) {
          setReceivedLikers((prev) => upsertReceivedLikerFront(prev, data as Profile));
        } else {
          loadReceivedLikesRef.current?.(uid)?.catch(() => {});
        }
        setBottomNotif(planIncomingHeartBottomNotif({
          likerId,
          heartType: row.heart_type ?? 'red',
          nickname: data?.nickname ?? '누군가',
          sentHeartsToLiker: sentHeartsPerPersonRef.current.get(likerId),
        }));
      } else {
        setBottomNotif(planIncomingHeartBottomNotif({ heartType: row.heart_type ?? 'red' }));
      }
      triggerConfetti();
      realtimeNotifTimerIdsRef.current.push(setTimeout(() => setBottomNotif(prev => (prev?.type === 'heart') ? null : prev), 5000));
      traceRealtimeStateMerge('hearts', row);
    } catch (e) { console.warn('[realtime:likes]', e); }
  }, [
    userIdRef, loadReceivedLikesRef, setReceivedHeartTypes, setReceivedLikers,
    setBottomNotif, triggerConfetti, traceRealtimeStateMerge,
  ]);

  const onReceivedLikeUpdate = useCallback((updated: ReceivedLikeUpdateRow) => {
    try {
      const patch = planReceivedLikeUpdate(updated);
      const uid = userIdRef.current;
      if (patch.needsFullRefetch) {
        if (uid) loadReceivedLikesRef.current?.(uid).catch(() => {});
        return;
      }
      if (patch.removeLikerId) {
        setReceivedLikers(prev => prev.filter(p => p.id !== patch.removeLikerId));
      }
      if (patch.ackGreenLikerId) {
        setAcknowledgedComplimentIds(prev => {
          if (prev.has(patch.ackGreenLikerId!)) return prev;
          return new Set([...prev, patch.ackGreenLikerId!]);
        });
      }
      if (patch.setHeartType) {
        const { likerId, heartType } = patch.setHeartType;
        setReceivedHeartTypes(prev => {
          const nextType = preferReceivedHeartType(prev.get(likerId), heartType);
          if (prev.get(likerId) === nextType) return prev;
          return new Map(prev).set(likerId, nextType);
        });
      }
      traceRealtimeStateMerge('hearts', updated);
    } catch (e) {
      console.warn('[realtime:likes-update]', e);
      const uid = userIdRef.current;
      if (uid) loadReceivedLikesRef.current?.(uid).catch(() => {});
    }
  }, [
    userIdRef, loadReceivedLikesRef, setReceivedLikers, setAcknowledgedComplimentIds,
    setReceivedHeartTypes, traceRealtimeStateMerge,
  ]);

  const onContactShareInsert = useCallback(async (share: ContactShare) => {
    try {
      setReceivedContactShares(prev => upsertReceivedContactShare(prev, share));
      traceRealtimeStateMerge('contact', share);
      const { data } = await supabase.from('profiles').select('nickname').eq('id', share.liked_id).maybeSingle();
      setBottomNotif({ type: 'contact', nickname: data?.nickname ?? '' });
    } catch (e) { console.warn('[realtime:contact-shares]', e); }
  }, [setReceivedContactShares, setBottomNotif, traceRealtimeStateMerge]);

  const onContactShareUpdate = useCallback((share: ContactShare) => {
    setReceivedContactShares(prev => upsertReceivedContactShare(prev, share));
    traceRealtimeStateMerge('contact', share);
  }, [setReceivedContactShares, traceRealtimeStateMerge]);

  return {
    onSentLikeInsert,
    onSentLikeUpdate,
    onReceivedLikeInsert,
    onReceivedLikeUpdate,
    onContactShareInsert,
    onContactShareUpdate,
  };
}
