/** 1:1 채팅 메시지 스와이프 답장 · 롱프레스 메뉴 제스처 판정 (순수 함수) */

export const SWIPE_REPLY_PX = 55;
export const SWIPE_ACTIVATE_PX = 10;
export const SWIPE_MAX_PX = 72;
export const LONG_PRESS_MS = 500;
export const MOVE_CANCEL_PX = 10;
export const VERTICAL_LOCK_SLACK = 4;
export const MENU_CLICK_GUARD_MS = 500;

export function shouldTreatAsHorizontalSwipe(dx: number, dy: number, alreadySwiping: boolean): boolean {
  if (alreadySwiping) return true;
  return Math.abs(dy) <= Math.abs(dx) + VERTICAL_LOCK_SLACK;
}

export function clampSwipeOffset(dx: number, max = SWIPE_MAX_PX): number {
  if (dx === 0) return 0;
  return Math.sign(dx) * Math.min(Math.abs(dx), max);
}

/**
 * 스와이프 답장은 실제로 가로 스와이프가 시작된 뒤에만 커밋한다.
 * (`swiping === false` 이면 offset 이 커 보여도 커밋하지 않음 — 과거 버그)
 */
export function shouldCommitSwipeReply(swiping: boolean, offsetX: number): boolean {
  return swiping === true && Math.abs(offsetX) >= SWIPE_REPLY_PX;
}

export function shouldCancelLongPress(dx: number, dy: number): boolean {
  return Math.abs(dx) > MOVE_CANCEL_PX || Math.abs(dy) > MOVE_CANCEL_PX;
}

export function contextMenuShowsDelete(isMine: boolean): boolean {
  return isMine === true;
}
