/**
 * 첫 화면 게이트 — 더미/복구/재입장 유저가 참여자 대기 랜딩을 스치지 않게 한다.
 */
export function shouldShowWaitingOverlay(opts: {
  shownWaiting: boolean;
  currentUserId: string | null | undefined;
  hasValidProfile: boolean;
  isTester?: boolean;
}): boolean {
  if (opts.shownWaiting) return false;
  if (opts.isTester) return false;
  // 이미 계정 id가 있으면(더미 입장·고유번호 복구·재방문) 대기 랜딩 금지
  if (opts.currentUserId) return false;
  return !opts.hasValidProfile;
}
