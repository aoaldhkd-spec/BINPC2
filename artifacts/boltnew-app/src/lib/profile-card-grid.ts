import { ls } from './storage';

/** 참여자 카드 그리드 밀도 — compact=작게(3열·1:1 정사각), 2=한 줄 2개, 3=한 줄 3개(기본·3:4) */
export type ProfileCardGridMode = 'compact' | '2' | '3';

export const PROFILE_CARD_GRID_KEY = 'profile_card_grid_v1';

const VALID: ProfileCardGridMode[] = ['compact', '2', '3'];

export function readProfileCardGridMode(): ProfileCardGridMode {
  try {
    const v = ls.getItem(PROFILE_CARD_GRID_KEY);
    if (v && VALID.includes(v as ProfileCardGridMode)) return v as ProfileCardGridMode;
  } catch { /* ignore */ }
  return '3';
}

export function writeProfileCardGridMode(mode: ProfileCardGridMode): void {
  try { ls.setItem(PROFILE_CARD_GRID_KEY, mode); } catch { /* ignore */ }
}

export function profileGridColSpan(mode: ProfileCardGridMode): number {
  if (mode === '2') return 2;
  return 3;
}

export function profileGridClassName(mode: ProfileCardGridMode): string {
  if (mode === 'compact') return 'grid grid-cols-3 gap-1 sm:gap-1.5 items-start overflow-visible';
  if (mode === '2') return 'grid grid-cols-2 gap-1.5 sm:gap-2 items-start';
  return 'grid grid-cols-3 gap-1 sm:gap-1.5 items-start';
}
