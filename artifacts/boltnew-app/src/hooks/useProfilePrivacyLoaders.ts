/**
 * Profile list + user_signals + privacy (blocked/visitors) loaders.
 * App owns setState; this hook owns fetches + merge/filter planners.
 */
import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { supabase } from '../lib/supabase';
import { excludeSwipeGestureVerifyProfiles } from '../lib/profile';
import { mergeProfileRefresh, mergeProfilesPreserveOrder, sortProfilesStable } from '../lib/profile-list-order';
import { mergeUserSignalRow } from '../lib/user-signal-merge';
import { filterBlockedUsersForMe } from '../lib/realtime-row-upsert';
import {
  BLOCKED_USER_ROW_SELECT,
  PROFILE_ROW_SELECT,
  PROFILE_VIEW_ROW_SELECT,
  USER_SIGNAL_ROW_SELECT,
} from '../lib/profile-select';
import { MATCHING_PROFILES_CACHE_KEY } from '../lib/constants';
import { ls } from '../lib/storage';
import type { BlockedUser, Profile, ProfileView, UserSignal } from '../types/app';

type SetState<T> = Dispatch<SetStateAction<T>>;

export type UseProfilePrivacyLoadersArgs = {
  currentUserId: string | null;
  userIdRef: MutableRefObject<string | null>;
  profilesRef: MutableRefObject<Profile[]>;
  loadProfilesRef: MutableRefObject<() => Promise<Profile[]>>;
  setProfiles: SetState<Profile[]>;
  setUserSignals: SetState<UserSignal[]>;
  setBlockedUsers: SetState<BlockedUser[]>;
  setProfileVisitors: SetState<ProfileView[]>;
};

export function useProfilePrivacyLoaders(args: UseProfilePrivacyLoadersArgs) {
  const {
    currentUserId,
    userIdRef,
    profilesRef,
    loadProfilesRef,
    setProfiles,
    setUserSignals,
    setBlockedUsers,
    setProfileVisitors,
  } = args;

  const readSequence = useRef(0);
  const inFlight = useRef<{ owner: string | null; promise: Promise<Profile[]> } | null>(null);
  const loadProfiles = useCallback((force = false) => {
    const owner = userIdRef.current;
    if (!force && inFlight.current?.owner === owner) return inFlight.current.promise;
    const sequence = ++readSequence.current;
    const promise = (async () => {
    const { data, error } = await supabase.from('profiles').select(PROFILE_ROW_SELECT).order('created_at', { ascending: false });
    if (sequence !== readSequence.current || owner !== userIdRef.current) return profilesRef.current;
    if (error) throw new Error('PROFILE_READ_UNAVAILABLE');
    if (Array.isArray(data)) {
      const visible = excludeSwipeGestureVerifyProfiles(data as Profile[], userIdRef.current);
      // 전량 교체 금지: SSE 패치 중 리프레시해도 기존 상대 순서 유지 + 안정 키로 신규만 삽입
      setProfiles(prev => {
        const merged = prev.length === 0
          ? sortProfilesStable(visible)
          : owner ? mergeProfileRefresh(prev, visible, owner) : mergeProfilesPreserveOrder(prev, visible);
        try { ls.setItem(MATCHING_PROFILES_CACHE_KEY, JSON.stringify(merged)); } catch { /* quota */ }
        return merged;
      });
      return mergeProfileRefresh(profilesRef.current, visible, owner);
    }
    throw new Error('PROFILE_READ_UNAVAILABLE');
    })();
    const entry = { owner, promise: promise.finally(() => {
      if (inFlight.current === entry) inFlight.current = null;
    }) };
    inFlight.current = entry;
    return entry.promise;
  }, [setProfiles, userIdRef, profilesRef]);

  // loading-main 지수 백오프 재시도에서 항상 최신 함수 참조 유지
  loadProfilesRef.current = loadProfiles;

  const loadUserSignals = useCallback(() => {
    supabase.from('user_signals').select(USER_SIGNAL_ROW_SELECT)
      .then(({ data }: { data: unknown }) => {
        if (Array.isArray(data)) setUserSignals(data as UserSignal[]);
      }).catch(() => {});
  }, [setUserSignals]);

  const handleUserSignalUpdate = useCallback((row: UserSignal) => {
    setUserSignals(prev => mergeUserSignalRow(prev, row, 'upsert'));
  }, [setUserSignals]);

  const refreshProfilesTab = useCallback(() => {
    void loadProfiles(true);
    loadUserSignals();
  }, [loadProfiles, loadUserSignals]);

  // ─── 차단·숨기기 / 방문자 기록 로드 ─────────────────────────────────────────
  useEffect(() => {
    if (!currentUserId) {
      setBlockedUsers([]);
      setProfileVisitors([]);
      return;
    }
    const uid = currentUserId;
    supabase.from('blocked_users').select(BLOCKED_USER_ROW_SELECT)
      .then(({ data }: { data: unknown }) => {
        if (Array.isArray(data)) {
          setBlockedUsers(filterBlockedUsersForMe(data as BlockedUser[], uid));
        }
      }).catch(() => {});
    supabase.from('profile_views').select(PROFILE_VIEW_ROW_SELECT).eq('viewed_id', uid)
      .then(({ data }: { data: unknown }) => {
        if (Array.isArray(data)) setProfileVisitors(data as ProfileView[]);
      }).catch(() => {});

    // user_signals 전체 로드 (전광판 + 카드 뒤면용)
    loadUserSignals();
    // privacy + user_signals SSE subscribe live in useUserRealtimeChannel.
  }, [currentUserId, loadUserSignals, setBlockedUsers, setProfileVisitors]);

  return {
    loadProfiles,
    loadUserSignals,
    handleUserSignalUpdate,
    refreshProfilesTab,
  };
}
