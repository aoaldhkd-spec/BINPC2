/**
 * Profiles SSE INSERT/UPDATE/DELETE apply — App wires setState; hook owns planners.
 * Does not subscribe (useUserRealtimeChannel routes events here).
 */
import { useCallback } from 'react';
import {
  planProfilesAfterDelete,
  planProfilesAfterInsert,
  planProfilesAfterUpdate,
} from '../lib/profile-realtime-apply';
import type { Profile } from '../types/app';

type SetState<T> = React.Dispatch<React.SetStateAction<T>>;

export type UseProfilesRealtimeApplyArgs = {
  userIdRef: React.MutableRefObject<string | null>;
  setProfiles: SetState<Profile[]>;
};

export type ProfilesRealtimeApplyHandlers = {
  onProfileInsert: (incoming: Profile) => void;
  onProfileUpdate: (incoming: Profile) => void;
  onProfileDelete: (deletedId: string) => void;
};

export function useProfilesRealtimeApply(
  args: UseProfilesRealtimeApplyArgs,
): ProfilesRealtimeApplyHandlers {
  const { userIdRef, setProfiles } = args;

  const onProfileInsert = useCallback((incoming: Profile) => {
    setProfiles((prev) => planProfilesAfterInsert(prev, incoming, userIdRef.current));
  }, [userIdRef, setProfiles]);

  const onProfileUpdate = useCallback((incoming: Profile) => {
    setProfiles((prev) => planProfilesAfterUpdate(prev, incoming, userIdRef.current));
  }, [userIdRef, setProfiles]);

  const onProfileDelete = useCallback((deletedId: string) => {
    setProfiles((prev) => planProfilesAfterDelete(prev, deletedId));
  }, [setProfiles]);

  return { onProfileInsert, onProfileUpdate, onProfileDelete };
}
