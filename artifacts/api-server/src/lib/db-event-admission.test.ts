import { describe, expect, it } from 'vitest';
import { newParticipantAdmissionReject } from './db-event-admission.js';

const visitor = { isAdmin: false, isTestRuntime: false };
const started = {
  session_active: true,
  event_cycle_started_at: '2026-10-13T18:00:00+09:00',
  event_cycle_reset_complete: false,
};

describe('administrator-controlled new participant admission', () => {
  it('rejects admission before the administrator starts the event', () => {
    expect(newParticipantAdmissionReject({ session_active: false }, visitor)?.status).toBe(403);
    expect(newParticipantAdmissionReject({ session_active: true }, visitor)?.body.error.code)
      .toBe('EVENT_ADMISSION_CLOSED');
  });
  it('accepts new participants only after actual event start and before the 01:00 close', () => {
    expect(newParticipantAdmissionReject(started, visitor,
      new Date('2026-10-13T19:00:00+09:00'))).toBeNull();
    expect(newParticipantAdmissionReject(started, visitor,
      new Date('2026-10-14T00:59:59+09:00'))).toBeNull();
    expect(newParticipantAdmissionReject(started, visitor,
      new Date('2026-10-14T01:00:00+09:00'))?.body.error.code)
      .toBe('EVENT_ADMISSION_CLOSED');
    expect(newParticipantAdmissionReject(started, visitor,
      new Date('2026-10-14T02:00:00+09:00'))?.status).toBe(403);
    expect(newParticipantAdmissionReject(started, visitor,
      new Date('2026-10-13T17:00:00+09:00'))?.status).toBe(403);
  });
  it('closes new admission at manual/01:00 end, without locking existing writes', () => {
    const stopped = { ...started, session_active: false };
    expect(newParticipantAdmissionReject(stopped, visitor)?.body.error.code)
      .toBe('EVENT_ADMISSION_CLOSED');
    expect(newParticipantAdmissionReject({ ...started, event_cycle_reset_complete: true }, visitor))
      .not.toBeNull();
  });
  it('enforces the 01:00 boundary for a 00:30 start and closes malformed cycles', () => {
    const late = { ...started, event_cycle_started_at: '2026-10-14T00:30:00+09:00' };
    expect(newParticipantAdmissionReject(late, visitor,
      new Date('2026-10-14T00:45:00+09:00'))).toBeNull();
    expect(newParticipantAdmissionReject(late, visitor,
      new Date('2026-10-14T01:00:00+09:00'))?.status).toBe(403);
    expect(newParticipantAdmissionReject({ ...started, event_cycle_started_at: 'invalid' },
      visitor, new Date('2026-10-13T19:00:00+09:00'))?.status).toBe(403);
  });
  it('preserves existing administrator and isolated test account workflows', () => {
    expect(newParticipantAdmissionReject({}, { isAdmin: true, isTestRuntime: false })).toBeNull();
    expect(newParticipantAdmissionReject({}, { isAdmin: false, isTestRuntime: true })).toBeNull();
  });
});
