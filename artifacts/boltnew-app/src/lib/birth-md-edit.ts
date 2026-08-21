/** 생월·생일(birth_month / birth_day) 변경 최대 횟수 — 서버 db.ts와 동기화 */
export const BIRTH_MD_EDIT_MAX = 2;

export type BirthMdProfile = {
  birth_month?: number | null;
  birth_day?: number | null;
  birth_md_edit_count?: number | null;
};

export function getBirthMdEditCount(profile: BirthMdProfile | null | undefined): number {
  const n = Number(profile?.birth_md_edit_count ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function birthMdEditsRemaining(profile: BirthMdProfile | null | undefined): number {
  return Math.max(0, BIRTH_MD_EDIT_MAX - getBirthMdEditCount(profile));
}

export function isBirthMdEditLocked(profile: BirthMdProfile | null | undefined): boolean {
  return getBirthMdEditCount(profile) >= BIRTH_MD_EDIT_MAX;
}

export function birthMdWouldChange(
  profile: BirthMdProfile | null | undefined,
  month: number | null,
  day: number | null,
): boolean {
  return Number(profile?.birth_month ?? 0) !== Number(month ?? 0)
    || Number(profile?.birth_day ?? 0) !== Number(day ?? 0);
}

export function nextBirthMdEditCount(
  profile: BirthMdProfile | null | undefined,
  month: number | null,
  day: number | null,
): number {
  if (!birthMdWouldChange(profile, month, day)) return getBirthMdEditCount(profile);
  return getBirthMdEditCount(profile) + 1;
}
