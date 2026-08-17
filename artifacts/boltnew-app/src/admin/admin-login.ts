/** Retired public panel defaults. Production rejects these on purpose. */
export const RETIRED_PUBLIC_PANEL_PASSWORDS = ['116606', '166606'] as const;

export const TEST_ADMIN_HINT =
  '전화번호만 채웠습니다. 관리자 패널에 저장한 비밀번호를 입력하세요. 예전 공개 기본값은 사용할 수 없습니다.';

export function isRetiredPublicPanelPassword(password: string): boolean {
  const trimmed = password.trim();
  return (RETIRED_PUBLIC_PANEL_PASSWORDS as readonly string[]).includes(trimmed);
}

export function mapPanelLoginError(rpcMessage: string, submittedPassword = ''): string {
  const msg = String(rpcMessage ?? '');
  if (/429|너무 많|RATE_LIMIT/i.test(msg)) {
    return '시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  }
  if (
    msg.includes('HTTP')
    || msg.includes('fetch')
    || msg.includes('abort')
    || msg.includes('network')
    || msg.includes('503')
  ) {
    return '서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.';
  }
  if (isRetiredPublicPanelPassword(submittedPassword)) {
    return '예전 공개 기본 비밀번호는 더 이상 사용할 수 없습니다. 관리자 패널에 저장한 비밀번호를 입력해 주세요.';
  }
  return '비밀번호가 올바르지 않습니다.';
}

export function readSubmittedPassword(
  field: HTMLInputElement | null,
  reactState: string,
): string {
  return String(field?.value || reactState || '').trim();
}
