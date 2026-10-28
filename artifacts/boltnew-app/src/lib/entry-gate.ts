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

/** V4: a session start enables the entry button; it never navigates for the user.
 * Kept as the shared transition contract so reconnects and stored accounts follow the same rule.
 */
export function shouldAutoSkipWaiting(_opts: {
  sessionActive: boolean;
  wasSessionActive: boolean | null;
  hasStoredUser: boolean;
}): boolean {
  return false;
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

/** Admin reset_signal changed vs local last-seen key. */
export function shouldApplyAdminResetSignal(
  serverReset: string | null | undefined,
  localReset: string | null | undefined,
): boolean {
  if (!serverReset || serverReset === localReset) return false;
  const serverAt = Date.parse(serverReset), localAt = Date.parse(localReset ?? '');
  if (Number.isFinite(serverAt) && Number.isFinite(localAt)) return serverAt > localAt;
  return true; // Legacy opaque reset IDs remain supported.

}
