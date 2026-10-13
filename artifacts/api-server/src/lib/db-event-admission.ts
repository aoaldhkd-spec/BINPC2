/**
 * Only an administrator-started, not-yet-reset event accepts new participant profiles.
 * Existing participants' updates, hearts and chats are intentionally unaffected.
 */
export function newParticipantAdmissionReject(
  settings: Record<string, unknown>,
  access: { isAdmin: boolean; isTestRuntime: boolean },
): { status: number; body: { data: null; error: { message: string; code: string } } } | null {
  if (access.isAdmin || access.isTestRuntime) return null;
  const startedAt = typeof settings.event_cycle_started_at === 'string'
    ? Date.parse(settings.event_cycle_started_at) : NaN;
  if (settings.session_active === true
    && Number.isFinite(startedAt)
    && settings.event_cycle_reset_complete !== true) return null;
  return {
    status: 403,
    body: {
      data: null,
      error: {
        message: '현재 신규 입장이 마감되었습니다. 관리자 회식 시작 후 입장해 주세요.',
        code: 'EVENT_ADMISSION_CLOSED',
      },
    },
  };
}
