export function rainbowGuideKey(userId: string, now: Date): string {
  // Shift UTC by -8h: the daily boundary is 17:00 Asia/Seoul, not midnight.
  const day = new Date(now.getTime() - 8 * 60 * 60_000).toISOString().slice(0, 10);
  return `binpc2:rainbow-guide:v1:${userId}:${day}`;
}
export const RAINBOW_GUIDE_LINES = [
  '일반 하트는 23:00에 열리고 ❤️ 호감·💙 친구·💗 뜨밤·💚 칭찬을 각각 1번씩 보낼 수 있어요.',
  '무지개하트는 24:00에 별도로 4회 열려요. 상대의 하트 버튼 → 무지개하트 → 전달할 색을 선택하면 1회가 사용돼요.',
  '무지개를 사용해도 일반 하트의 남은 횟수는 줄지 않아요. 남아 있는 일반 하트도 그대로 사용할 수 있어요.',
  '일반으로 보낸 상대에게 무지개로 같은 색을 한 번 더 보낼 수 있어요. 일반과 무지개는 서로 다른 전송으로 구분돼요.',
  '무지개에서 같은 상대·같은 색을 다시 누르는 것은 중복 전송되지 않아요. 같은 상대에게 다른 색을 보내거나 다른 상대에게 보낼 수 있어요.',
  '상대에게는 무지개라는 별도 알림이 아니라 선택한 하트의 의미가 전달돼요. 보낸 본인에게 알림을 보내지 않아요.',
] as const;
