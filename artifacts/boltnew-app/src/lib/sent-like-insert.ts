/**
 * Incremental planner for sent-likes SSE INSERT (liker_id = me).
 * Keeps App channel handler as thin apply + toast wiring.
 */
import type { HeartType } from './constants';
import { isInterestHeart } from './signal-match';

export type SentLikeInsertRow = {
  id?: string;
  liked_id?: string | null;
  heart_type?: HeartType | string | null;
  created_at?: string;
};

export type SentLikeInsertPlan = {
  likedId: string;
  heartType: HeartType;
  /** Mutual interest — App shows MUTUAL_HEART_TOAST */
  showMutualToast: boolean;
};

/** Same rule as App setSentHeartTypes: green must not overwrite interest. */
export function shouldKeepExistingSentHeartType(
  existing: HeartType | undefined,
  incoming: HeartType,
): boolean {
  return incoming === 'green' && !!existing && isInterestHeart(existing);
}

export function planSentLikeInsert(
  row: SentLikeInsertRow | null | undefined,
  opts: { counterpartReceivedHeartType?: HeartType | undefined } = {},
): SentLikeInsertPlan | null {
  const likedId = row?.liked_id;
  if (!likedId || typeof likedId !== 'string') return null;
  const heartType = (row?.heart_type ?? 'red') as HeartType;
  const showMutualToast =
    isInterestHeart(heartType) && isInterestHeart(opts.counterpartReceivedHeartType);
  return { likedId, heartType, showMutualToast };
}

export type SentLikeStatusNotif =
  | { kind: 'rejected'; nickname: string }
  | { kind: 'accepted'; nickname: string; message: string }
  | null;

export function heartAcceptedToastMessage(nickname: string): string {
  return `💚 ${nickname}님이 하트를 수락했어요`;
}

/** Planner for sent-likes SSE UPDATE (liker_id = me). */
export function planSentLikeStatusNotif(
  status: string | undefined | null,
  nickname: string,
): SentLikeStatusNotif {
  if (status === 'rejected') return { kind: 'rejected', nickname };
  if (status === 'accepted') {
    return { kind: 'accepted', nickname, message: heartAcceptedToastMessage(nickname) };
  }
  return null;
}
