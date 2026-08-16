/**
 * 첫 화면 게이트 — 더미/복구/재입장 유저가 참여자 전용 화면을 스치지 않게 한다.
 */

export function shouldShowWaitingOverlay(opts: {
  shownWaiting: boolean;
  currentUserId: string | null | undefined;
  hasValidProfile: boolean;
  isTester?: boolean;
}): boolean {
  if (opts.shownWaiting) return false;
  // 테스터 첫 진입 스킵은 shownWaiting 초기값(test_token)으로만 처리한다.
  // 이미 계정 id가 있으면(더미 입장·고유번호 복구·재방문) 대기 랜딩 금지
  if (opts.currentUserId) return false;
  return !opts.hasValidProfile;
}

/**
 * 관리자가 회식을 켜는 순간에만 대기 랜딩을 건너뛴다.
 * 이미 켜진 상태에서 설정이 갱신되면 건너뛰지 않는다 — 닉네임 설정 1단계 뒤로가기가 대기화면으로 남으려면 이 조건이 필요하다.
 */
export function shouldAutoSkipWaiting(opts: {
  sessionActive: boolean;
  wasSessionActive: boolean | null;
  hasStoredUser: boolean;
}): boolean {
  if (opts.hasStoredUser) return false;
  if (!opts.sessionActive) return false;
  return opts.wasSessionActive === false;
}

/** 입장 코드(PIN) — 이미 식별된 유저/테스터는 스킵 */
export function shouldShowEntryGate(opts: {
  entryPassword: string | null | undefined;
  entryVerified: boolean;
  currentUserId?: string | null;
  isTester?: boolean;
}): boolean {
  if (!opts.entryPassword) return false;
  if (opts.entryVerified) return false;
  if (opts.currentUserId) return false;
  if (opts.isTester) return false;
  return true;
}

/** 신규 닉네임 등록 — 이미 식별됐거나 프로필이 있으면 스킵 */
export function shouldShowNicknameSetup(opts: {
  currentUserId: string | null | undefined;
  hasValidProfile: boolean;
  view: string;
  shownWaiting?: boolean;
}): boolean {
  if (opts.currentUserId) return false;
  if (opts.hasValidProfile) return false;
  if (opts.view === 'entry-recover' || opts.view === 'loading-main') return false;
  // 대기 랜딩을 아직 통과하지 않았거나, 1단계에서 뒤로 돌아온 경우
  if (opts.shownWaiting === false) return false;
  return true;
}

/**
 * 고유번호 복구 — 프로필이 이미 있거나, 저장된 계정을 아직 확인 중이면 스킵
 * (확인 실패로 profileBoot=recover 가 된 뒤에만 복구 화면)
 */
export function shouldShowRecoveryScreen(opts: {
  hasValidProfile: boolean;
  profileBoot: string;
  view: string;
}): boolean {
  if (opts.hasValidProfile) return false;
  if (opts.profileBoot === 'checking') return false;
  return opts.profileBoot === 'recover' || opts.view === 'entry-recover';
}
