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
  it('accepts new participants during a started and active event', () => {
    expect(newParticipantAdmissionReject(started, visitor)).toBeNull();
  });
  it('closes new admission at manual/01:00 end, without locking existing writes', () => {
    const stopped = { ...started, session_active: false };
    expect(newParticipantAdmissionReject(stopped, visitor)?.body.error.code)
      .toBe('EVENT_ADMISSION_CLOSED');
    expect(newParticipantAdmissionReject({ ...started, event_cycle_reset_complete: true }, visitor))
      .not.toBeNull();
  });
  it('preserves existing administrator and isolated test account workflows', () => {
    expect(newParticipantAdmissionReject({}, { isAdmin: true, isTestRuntime: false })).toBeNull();
    expect(newParticipantAdmissionReject({}, { isAdmin: false, isTestRuntime: true })).toBeNull();
  });
});
