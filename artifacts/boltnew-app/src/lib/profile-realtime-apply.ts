/**
 * Pure planners for profiles SSE INSERT/UPDATE/DELETE apply.
 * App (or hook apply callbacks) only calls setProfiles with the result.
 */
import type { Profile } from '../types/app';
import {
  excludeSwipeGestureVerifyProfiles,
  isSwipeGestureVerifyProfile,
} from './profile';
import { mergeProfilesPreserveOrder, patchProfileInPlace } from './profile-list-order';

/** Profiles INSERT — skip verify decoys / dupes; append preserving order. */
export function planProfilesAfterInsert(
  prev: readonly Profile[],
  incoming: Profile,
  currentUserId: string | null,
): Profile[] {
  if (isSwipeGestureVerifyProfile(incoming) && incoming.id !== currentUserId) {
    return prev as Profile[];
  }
  if (prev.some((p) => p.id === incoming.id)) return prev as Profile[];
  return mergeProfilesPreserveOrder(prev as Profile[], [...prev, incoming]);
}

/** Profiles UPDATE — patch in place, then drop verify decoys (except self). */
export function planProfilesAfterUpdate(
  prev: readonly Profile[],
  incoming: Profile,
  currentUserId: string | null,
): Profile[] {
  const next = patchProfileInPlace(prev as Profile[], incoming);
  return excludeSwipeGestureVerifyProfiles(next, currentUserId);
}

/** Profiles DELETE — drop by id. */
export function planProfilesAfterDelete(
  prev: readonly Profile[],
  deletedId: string,
): Profile[] {
  return prev.filter((p) => p.id !== deletedId);
}
