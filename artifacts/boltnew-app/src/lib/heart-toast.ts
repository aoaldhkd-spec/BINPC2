/**
 * 받은 하트 하단 토스트는 수신자만.
 * SSE likes 이벤트는 보낸/받은 양쪽 inbox 갱신용으로 가지만,
 * "하트를 보냈어요" 토스트는 liked_id === me 이고 자기 자신이 보낸 행이 아닐 때만.
 */
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
/** @deprecated 시그널은 추천. 상호 해금은 하트. */
export const MUTUAL_SIGNAL_TOAST = MUTUAL_HEART_TOAST;

export function incomingInterestToast(nickname: string): string {
  return `💕 ${nickname}님이 회원님에게 하트를 보냈어요.`;
}
