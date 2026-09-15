/**
 * Nickname registration / recovery planners — pure helpers for App wiring.
 * Behavior-preserving extract from App handleNicknameSetup / recovery.
 */

export type NicknameSetupInput = {
  birthYear: number;
  birthMonth: number | null;
  birthDay: number | null;
  location: string;
  mbti: string;
  interests: string[];
  personalityScore: number;
  domSubScore: number | null;
  nickname: string;
  kakaoId: string;
  instagramId: string;
  phoneNumber: string;
  contactPrivate: boolean;
  idealMsg: string | null;
  featureMsg: string | null;
};

export type RegistrationErrorCode = '23505' | 'PIN_EXHAUSTED' | string;

export function buildRegistrationProfileInsert(
  newProfileId: string,
  deviceSecret: string,
  data: NicknameSetupInput,
): Record<string, unknown> {
  return {
    id: newProfileId,
    _device_secret: deviceSecret,
    nickname: data.nickname,
    bio: data.interests.join(', '),
    // photo_url: server assigns a unique preset avatar on INSERT (avatar-pool.ts)
    personality_score: data.personalityScore,
    dom_sub_score: data.domSubScore,
    mbti: data.mbti,
    birth_year: data.birthYear,
    birth_month: data.birthMonth,
    birth_day: data.birthDay,
    location: data.location,
    interests: Array.isArray(data.interests) ? data.interests.join(', ') : (data.interests as unknown as string | null),
    contact_private: data.contactPrivate,
    kakao_id: data.kakaoId || null,
    instagram_id: data.instagramId || null,
    phone_number: data.phoneNumber || null,
  };
}

export function mapRegistrationErrorMessage(code: RegistrationErrorCode | undefined, message: string | undefined): string {
  if (code === '23505') {
    return '이미 사용 중인 닉네임입니다. 다른 닉네임을 선택해 주세요.';
  }
  if (code === 'PIN_EXHAUSTED') {
    return '현재 정원이 가득 찼습니다. 운영진에 문의하세요.';
  }
  if (message) return `오류가 발생했습니다: ${message}`;
  return '오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
}

export function buildRegistrationSignalRow(
  profileId: string,
  idealMsg: string | null,
  featureMsg: string | null,
  nowIso: string = new Date().toISOString(),
  id: string = crypto.randomUUID(),
): {
  id: string;
  user_id: string;
  status_msg: null;
  ideal_msg: string | null;
  feature_msg: string | null;
  created_at: string;
} | null {
  if (!idealMsg && !featureMsg) return null;
  return {
    id,
    user_id: profileId,
    status_msg: null,
    ideal_msg: idealMsg,
    feature_msg: featureMsg,
    created_at: nowIso,
  };
}
