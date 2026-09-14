/**
 * 받은 하트 하단 토스트는 수신자만.
 * SSE likes 이벤트는 보낸/받은 양쪽 inbox 갱신용으로 가지만,
 * "하트를 보냈어요" 토스트는 liked_id === me 이고 자기 자신이 보낸 행이 아닐 때만.
 */
import type { HeartType } from './constants';
import { hasInterestHeart, isInterestHeart } from './signal-match';

export function isIncomingHeartToastTarget(
  currentUserId: string | null | undefined,
  row: { liker_id?: string | null; liked_id?: string | null },
): boolean {
  if (!currentUserId || row.liked_id == null || row.liked_id === '') return false;
  if (String(row.liked_id) !== String(currentUserId)) return false;
  if (row.liker_id != null && String(row.liker_id) === String(currentUserId)) return false;
  return true;
}

export const MUTUAL_HEART_TOAST = '💕 서로 하트를 보내면 채팅을 시작할 수 있어요!';

export function incomingInterestToast(nickname: string): string {
  return `💕 ${nickname}님이 회원님에게 하트를 보냈어요.`;
}

/** Shape matches BottomNotificationData heart variants (App applies setBottomNotif). */
export type IncomingHeartBottomNotif = {
  type: 'heart';
  nickname: string;
  heartType?: HeartType;
  heartMutual?: boolean;
  profileId?: string;
  message?: string;
};

/**
 * Pure toast payload for received-like INSERT (liked_id = me).
 * App still owns confetti / timers / profile fetch.
 */
export function planIncomingHeartBottomNotif(input: {
  likerId?: string | null;
  heartType?: HeartType | string | null;
  nickname?: string | null;
  /** Types already sent by me to this liker (interest check). */
  sentHeartsToLiker?: ReadonlySet<HeartType | string> | undefined;
}): IncomingHeartBottomNotif {
  const ht = (input.heartType ?? 'red') as HeartType;
  if (!input.likerId) {
    return { type: 'heart', nickname: '누군가', heartType: ht };
  }
  const nick = input.nickname?.trim() ? input.nickname : '누군가';
  if (isInterestHeart(ht) && hasInterestHeart(input.sentHeartsToLiker)) {
    return {
      type: 'heart',
      nickname: nick,
      profileId: input.likerId,
      message: MUTUAL_HEART_TOAST,
      heartMutual: true,
    };
  }
  if (isInterestHeart(ht)) {
    return {
      type: 'heart',
      nickname: nick,
      heartType: ht,
      profileId: input.likerId,
      message: incomingInterestToast(nick),
    };
  }
  return { type: 'heart', nickname: nick, heartType: ht };
}
