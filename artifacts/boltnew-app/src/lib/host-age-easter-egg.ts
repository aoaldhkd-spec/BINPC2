import { ADMIN_FIXED_NICKNAME } from './panel-password';

/** 헤더 '술번개' 3연타 → NPC 나이 이스터에그 안내 문구 */
export const HOST_AGE_EASTER_EGG_HINT =
  "NPC 나이가 궁금하면 '술번개' 글자만 3번 클릭하세요";

type HostBirthProfile = { nickname?: string | null; birth_year?: number | null };

/** 범일NPC(방장) 프로필 출생연도 — 이스터에그 영수증용 */
export function hostBirthYearFromProfiles(profiles: ReadonlyArray<HostBirthProfile>): number | null {
  return profiles.find(p => p.nickname === ADMIN_FIXED_NICKNAME)?.birth_year ?? null;
}
