/**
 * Participant session-init: clear hearts on user switch, resolve profile → main/recover,
 * deferred contact/chat loads, and ?share= QR contact open.
 * App wires setState + loaders; pure decisions live in lib/session-init.
 */
import {
  useEffect,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { supabase } from '../lib/supabase';
import { MATCHING_USER_KEY, MATCHING_DRAFT_KEY } from '../lib/constants';
import { ls } from '../lib/storage';
import { findProfileById } from '../lib/profile-session';
import { PROFILE_ROW_SELECT } from '../lib/profile-select';
import {
  SESSION_INIT_CONTACT_DELAY_MS,
  SESSION_INIT_MISSING_RETRY_MS,
  planSessionInitAfterProfiles,
  planSessionInitMissingRetry,
  shouldEnterMainFromCachePlan,
  shouldForceMainOnExistingComplete,
  shouldForceMainOnMissingRetry,
  shouldProcessPendingShare,
  shouldRefreshMissingPin,
} from '../lib/session-init';
import type { Profile, View, MainTab } from '../types/app';
import type { ProfileBootPhase } from './useNicknameRegistration';

type SetState<T> = Dispatch<SetStateAction<T>>;

export type UseSessionInitArgs = {
  currentUserId: string | null;
  isNewRegistration: MutableRefObject<boolean>;
  viewRef: MutableRefObject<View>;
  /** In-memory / ls cache — optimistic main before network refresh. */
  getProfiles: () => Profile[];
  loadProfiles: () => Promise<Profile[]>;
  loadLikes: (userId: string) => void;
  loadReceivedLikes: (userId: string) => void;
  loadContactShareData: (userId: string) => void;
  loadChatList: (userId: string) => void;
  clearHeartsState: () => void;
  setProfileBoot: SetState<ProfileBootPhase>;
  setView: SetState<View>;
  setMainTab: SetState<MainTab>;
  setMySubTabHint: SetState<'status' | 'chats' | null>;
  setCurrentUserId: SetState<string | null>;
  setShownWaiting: SetState<boolean>;
  setProfiles: SetState<Profile[]>;
  saveScannedContact: (profile: Profile) => void;
  setScannedContactProfile: SetState<Profile | null>;
  confettiTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  confettiInnerTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
};

export function useSessionInit(args: UseSessionInitArgs): void {
  const {
    currentUserId,
    isNewRegistration,
    viewRef,
    getProfiles,
    loadProfiles,
    loadLikes,
    loadReceivedLikes,
    loadContactShareData,
    loadChatList,
    clearHeartsState,
    setProfileBoot,
    setView,
    setMainTab,
    setMySubTabHint: _setMySubTabHint,
    setCurrentUserId,
    setShownWaiting,
    setProfiles,
    saveScannedContact,
    setScannedContactProfile,
    confettiTimerRef,
    confettiInnerTimerRef,
  } = args;

  // ?share=<profileId> URL 파라미터 — 프로필 QR 스캔 시 연락처 자동 수신
  const [pendingShareId] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('share'),
  );

  useEffect(() => {
    if (!currentUserId) return;
    // #52: 계정 전환 시 이전 유저의 하트 상태가 잠깐 보이는 현상 방지
    // 새 userId로 로드하기 전에 상태를 즉시 비움
    clearHeartsState();
    // 타이머 ID 추적 — 언마운트 시 clearTimeout으로 stale setState 방지
    let retryTimerId: ReturnType<typeof setTimeout> | null = null;
    let initTimerId1: ReturnType<typeof setTimeout> | null = null;
    // cancelled 플래그 — 언마운트 후 비동기 콜백이 setState를 호출하는 것을 방지
    let cancelled = false;

    // Optimistic: cached complete profile → main immediately (network refresh still runs).
    const cachePlan = planSessionInitAfterProfiles({
      allProfiles: getProfiles(),
      currentUserId,
      isNewRegistration: isNewRegistration.current,
    });
    if (shouldEnterMainFromCachePlan(cachePlan)) {
      setProfileBoot('ok');
      if (cachePlan.kind === 'new-reg-complete') {
        setView('main');
        setMainTab('profiles');
      } else {
        const v = viewRef.current;
        if (shouldForceMainOnExistingComplete(v)) setView('main');
      }
    }

    const refreshPinIfMissing = (uid: string, me: Profile | undefined) => {
      if (!shouldRefreshMissingPin(me)) return;
      // 고유번호 없으면 서버에서 직접 재조회 (클라이언트 임의 PIN 생성 금지)
      void (async () => {
        try {
          const { data: refreshed } = await supabase
            .from('profiles')
            .select(PROFILE_ROW_SELECT)
            .eq('id', uid)
            .maybeSingle();
          if (cancelled) return;
          if (refreshed && (refreshed as Profile).pin_code) {
            setProfiles(prev => prev.map(p => (p.id === uid ? (refreshed as Profile) : p)));
            setProfileBoot('ok');
          }
        } catch (err) {
          console.warn('[pin] 고유번호 재조회 실패:', err);
        }
      })();
    };

    loadProfiles().catch(() => []).then(async (allProfiles) => {
      if (cancelled) return;
      const wasNew = isNewRegistration.current;
      if (wasNew) isNewRegistration.current = false;
      const plan = planSessionInitAfterProfiles({
        allProfiles,
        currentUserId,
        isNewRegistration: wasNew,
      });

      if (plan.kind === 'empty') return;

      if (plan.kind === 'new-reg-complete') {
        setProfileBoot('ok');
        setView('main');
        // Stay on participants/home so first-entry coach tip 1 is not skipped by a my-tab jump.
        setMainTab('profiles');
        return;
      }
      if (plan.kind === 'new-reg-incomplete') {
        setView('loading-main');
        return;
      }

      if (plan.kind === 'missing') {
        retryTimerId = setTimeout(async () => {
          const retry = await loadProfiles();
          if (cancelled) return;
          let me = findProfileById(retry, currentUserId);
          if (!me) {
            const { data: direct } = await supabase
              .from('profiles')
              .select(PROFILE_ROW_SELECT)
              .eq('id', currentUserId)
              .maybeSingle();
            if (direct) me = direct as Profile;
          }
          if (cancelled) return;
          const retryPlan = planSessionInitMissingRetry({ retryProfiles: retry, me });
          if (retryPlan.kind === 'enter-main') {
            setProfileBoot('ok');
            const v = viewRef.current;
            if (shouldForceMainOnMissingRetry(v)) setView('main');
            return;
          }
          if (retryPlan.kind === 'recover-cleared') {
            ls.removeItem(MATCHING_USER_KEY);
            ls.removeItem(MATCHING_DRAFT_KEY);
            setCurrentUserId(null);
            setShownWaiting(false);
            setProfileBoot('recover');
            setView('entry-recover');
          }
        }, SESSION_INIT_MISSING_RETRY_MS);
        return;
      }

      if (plan.kind === 'existing-complete') {
        setProfileBoot('ok');
        const v = viewRef.current;
        if (shouldForceMainOnExistingComplete(v)) setView('main');
        refreshPinIfMissing(currentUserId, plan.me);
        return;
      }

      // existing-incomplete
      setView('loading-main');
      refreshPinIfMissing(currentUserId, plan.me);
    });

    loadLikes(currentUserId);
    loadReceivedLikes(currentUserId);
    initTimerId1 = setTimeout(() => {
      loadContactShareData(currentUserId);
      loadChatList(currentUserId);
    }, SESSION_INIT_CONTACT_DELAY_MS);

    // ── ?share=<profileId> 처리: 연락처 QR 스캔 → 연락처 모달 표시 ──
    if (shouldProcessPendingShare(pendingShareId, currentUserId)) {
      window.history.replaceState(window.history.state ?? {}, '', window.location.pathname);
      void (async () => {
        try {
          const { data: shareProfile } = await supabase
            .from('profiles')
            .select(PROFILE_ROW_SELECT)
            .eq('id', pendingShareId!)
            .maybeSingle();
          if (cancelled || !shareProfile) return;
          const p = shareProfile as Profile;
          saveScannedContact(p);
          setScannedContactProfile(p);
        } catch (err) {
          console.warn('[share-profile] QR 스캔 프로필 로드 실패:', err);
        }
      })();
    }

    // profiles + user-bundle SSE subscribe live in useUserRealtimeChannel (App wiring).

    return () => {
      cancelled = true;
      if (retryTimerId) clearTimeout(retryTimerId);
      if (initTimerId1) clearTimeout(initTimerId1);
      if (confettiTimerRef.current) {
        clearTimeout(confettiTimerRef.current);
        confettiTimerRef.current = null;
      }
      if (confettiInnerTimerRef.current) {
        clearTimeout(confettiInnerTimerRef.current);
        confettiInnerTimerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loadXxx are stable useCallbacks; setState/refs are stable
  }, [currentUserId, loadProfiles, loadLikes, loadReceivedLikes, loadContactShareData, loadChatList]);
}
