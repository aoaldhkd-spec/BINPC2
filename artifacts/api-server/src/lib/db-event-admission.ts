import { eventCycleMilestones } from './db-event-cycle-heart.js';

/**
 * Only an administrator-started, not-yet-reset event accepts new participant profiles.
 * Existing participants' updates, hearts and chats are intentionally unaffected.
 */
export function newParticipantAdmissionReject(
  settings: Record<string, unknown>,
  access: { isAdmin: boolean; isTestRuntime: boolean },
  now = new Date(),
): { status: number; body: { data: null; error: { message: string; code: string } } } | null {
  if (access.isAdmin || access.isTestRuntime) return null;
  const startedAt = typeof settings.event_cycle_started_at === 'string'
    ? Date.parse(settings.event_cycle_started_at) : NaN;
  const close = Number.isFinite(startedAt)
    ? eventCycleMilestones(String(settings.event_cycle_started_at))?.admissionCloseAt.getTime()
    : undefined;
  // The 01:00 boundary is authoritative even if a server timer or SSE is
  // delayed. Never admit a new profile merely because session_active is stale.
  if (settings.session_active === true
    && Number.isFinite(startedAt) && startedAt <= now.getTime()
    && close !== undefined && now.getTime() < close
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
