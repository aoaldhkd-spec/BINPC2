import type { Profile } from '../types/app';

/** 서버에 등록된 완전한 프로필인지 (닉네임 + 고유번호 필수) */
export function isCompleteProfile(p: Profile | null | undefined): boolean {
  if (!p?.id) return false;
  return Boolean(p.nickname?.trim() && p.pin_code?.trim());
}

export function findProfileById(profiles: Profile[], userId: string | null | undefined): Profile | undefined {
  if (!userId) return undefined;
  return profiles.find(p => p.id === userId);
}
