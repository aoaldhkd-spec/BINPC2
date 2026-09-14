/**
 * Incremental patch planner for received-likes SSE UPDATE.
 * Avoids full loadReceivedLikes (likes SELECT + profiles IN) on every status change.
 */
import type { HeartType } from './constants';
import { isInterestHeart } from './signal-match';

export type ReceivedLikeUpdateRow = {
  id?: string;
  liker_id?: string | null;
  status?: string | null;
  heart_type?: HeartType | string | null;
  created_at?: string;
};

export type ReceivedLikeUpdatePatch = {
  /** Malformed payload — caller should fall back to one full refetch */
  needsFullRefetch: boolean;
  removeLikerId: string | null;
  ackGreenLikerId: string | null;
  setHeartType: { likerId: string; heartType: HeartType } | null;
};

/** Same preference as useHearts: interest hearts win over green compliments. */
export function preferReceivedHeartType(
  existing: HeartType | undefined,
  incoming: HeartType,
): HeartType {
  if (isInterestHeart(incoming)) return incoming;
  if (existing && isInterestHeart(existing)) return existing;
  return incoming;
}

export function planReceivedLikeUpdate(row: ReceivedLikeUpdateRow | null | undefined): ReceivedLikeUpdatePatch {
  const likerId = row?.liker_id;
  if (!likerId || typeof likerId !== 'string') {
    return {
      needsFullRefetch: true,
      removeLikerId: null,
      ackGreenLikerId: null,
      setHeartType: null,
    };
  }
  const status = row?.status ?? '';
  const ht = (row?.heart_type ?? 'red') as HeartType;
  return {
    needsFullRefetch: false,
    removeLikerId: status === 'rejected' ? likerId : null,
    ackGreenLikerId: status === 'accepted' && ht === 'green' ? likerId : null,
    setHeartType: { likerId, heartType: ht },
  };
}
