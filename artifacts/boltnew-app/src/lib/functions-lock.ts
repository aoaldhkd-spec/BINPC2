import type { MainTab } from '../types/app';

/** 행사 중 매칭/소셜 정지 — 하트·채팅·시그널·단톡·운세. 통계·랭킹 탭은 잠그지 않음. */
export const FUNCTIONS_LOCK_TOAST = '🔒 현재 잠금 중';
export const FUNCTIONS_LOCK_KICK_TOAST = '행사 중에는 하트·채팅·시그널·단톡·운세를 쓸 수 없어요';
export const FUNCTIONS_UNLOCK_TOAST = '🔓 기능 잠금이 해제됐어요 — 다시 사용할 수 있어요';

export const SOCIAL_LOCKED_TABS = new Set<MainTab>([
  'signal',
  'chats',
  'fortune',
]);

export function isSocialLockedTab(tab: MainTab): boolean {
  return SOCIAL_LOCKED_TABS.has(tab);
}

/** /op·insert 응답이 mid-run 기능 잠금인지 (서버 code FUNCTIONS_LOCKED) */
export function isFunctionsLockedOpError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string };
  return e.code === 'FUNCTIONS_LOCKED';
}
