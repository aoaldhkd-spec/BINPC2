/** UI policy version. Notice is limited to the currently verified deletion behavior. */
export const REGISTRATION_CONSENT_VERSION = '2026-10-13-v1';
export type RegistrationConsent = { collection: boolean; sharing: boolean; version: string };
export function hasRequiredConsent(consent: RegistrationConsent | undefined): boolean {
  return consent?.collection === true && consent.sharing === true && consent.version === REGISTRATION_CONSENT_VERSION;
}
export const RESET_PRIVACY_NOTICE = '행사 프로필·하트·채팅은 매일 17:00 전체 초기화 시 삭제 대상입니다. 사진 원본·일부 운영기록 및 별도 백업의 보관·삭제는 별도 정책에 따릅니다.';
