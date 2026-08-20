import type { Profile } from '../types/app';
import { getPositionLabel, isSwipeGestureVerifyProfile } from './profile';
import { sortProfilesStable } from './profile-list-order';
import { koreanMatch } from './utils';

export type ProfileDeckFilters = {
  currentUserId: string | null;
  search: string;
  personality: string | null;
  mbti: string | null;
  blockedUserIds: ReadonlySet<string>;
  hiddenByIds: ReadonlySet<string>;
};

export function filterProfilesForDeck(
  profiles: readonly Profile[],
  filters: ProfileDeckFilters,
): Profile[] {
  const {
    currentUserId,
    search,
    personality,
    mbti,
    blockedUserIds,
    hiddenByIds,
  } = filters;

  const filtered = profiles.filter(profile => {
    if (isSwipeGestureVerifyProfile(profile) && profile.id !== currentUserId) return false;
    if (blockedUserIds.has(profile.id) || hiddenByIds.has(profile.id)) return false;
    if (search) {
      const matches =
        koreanMatch(profile.nickname, search)
        || Boolean(profile.mbti && koreanMatch(profile.mbti, search))
        || koreanMatch(getPositionLabel(profile.personality_score ?? 50), search);
      if (!matches) return false;
    }
    if (personality) {
      const score = profile.personality_score ?? 50;
      if (personality === '비선호' && score >= 0) return false;
      if (personality === '바텀계열' && (score < 0 || score > 49)) return false;
      if (personality === '올계열' && (score < 50 || score > 55)) return false;
      if (personality === '탑계열' && score < 56) return false;
    }
    return !mbti || profile.mbti === mbti;
  });

  // 입력 배열이 SSE/리프레시로 섞여도 표시 순서는 항상 동일 (self → created_at → id)
  return sortProfilesStable(filtered, currentUserId);
}
