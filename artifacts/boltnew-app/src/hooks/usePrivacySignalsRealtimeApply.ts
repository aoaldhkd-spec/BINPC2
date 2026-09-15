/**
 * Privacy (blocked_users / profile_views) + user_signals SSE apply.
 * App wires setState; this hook owns filter/upsert/merge — does not subscribe
 * (useUserRealtimeChannel routes events here).
 */
import { useCallback } from 'react';
import { mergeUserSignalRow } from '../lib/user-signal-merge';
import { isBlockedRowForMe, upsertById } from '../lib/realtime-row-upsert';
import type { BlockedUser, ProfileView, UserSignal } from '../types/app';

type SetState<T> = React.Dispatch<React.SetStateAction<T>>;

export type UsePrivacySignalsRealtimeApplyArgs = {
  userIdRef: React.MutableRefObject<string | null>;
  setBlockedUsers: SetState<BlockedUser[]>;
  setProfileVisitors: SetState<ProfileView[]>;
  setUserSignals: SetState<UserSignal[]>;
};

export type PrivacySignalsRealtimeApplyHandlers = {
  onBlockedUserInsert: (row: BlockedUser) => void;
  onProfileViewInsert: (row: ProfileView) => void;
  onUserSignalInsert: (row: UserSignal) => void;
  onUserSignalUpdate: (row: UserSignal) => void;
};

export function usePrivacySignalsRealtimeApply(
  args: UsePrivacySignalsRealtimeApplyArgs,
): PrivacySignalsRealtimeApplyHandlers {
  const { userIdRef, setBlockedUsers, setProfileVisitors, setUserSignals } = args;

  const onBlockedUserInsert = useCallback((b: BlockedUser) => {
    const uid = userIdRef.current;
    if (uid && isBlockedRowForMe(b, uid)) {
      setBlockedUsers(prev => upsertById(prev, b));
    }
  }, [userIdRef, setBlockedUsers]);

  const onProfileViewInsert = useCallback((v: ProfileView) => {
    const uid = userIdRef.current;
    if (uid && v.viewed_id === uid) {
      setProfileVisitors(prev => upsertById(prev, v));
    }
  }, [userIdRef, setProfileVisitors]);

  const onUserSignalInsert = useCallback((s: UserSignal) => {
    setUserSignals(prev => mergeUserSignalRow(prev, s, 'upsert'));
  }, [setUserSignals]);

  const onUserSignalUpdate = useCallback((s: UserSignal) => {
    setUserSignals(prev => mergeUserSignalRow(prev, s, 'update-only'));
  }, [setUserSignals]);

  return {
    onBlockedUserInsert,
    onProfileViewInsert,
    onUserSignalInsert,
    onUserSignalUpdate,
  };
}
