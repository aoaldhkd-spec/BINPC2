import { eventCycleMilestones } from '@workspace/api-zod';
export { eventCycleMilestones };

/**
 * One administrator-started event owns one 23:00/24:00 unlock sequence.
 * Unlocks remain available after the 01:00 admission close until a durable reset.
 * Do not unlock merely because the wall clock reads 23/24 with no active cycle.
 */
export function eventCycleUnlocked(input: {
  startedAt: unknown;
  resetComplete: unknown;
  now?: Date;
}): Set<'red' | 'blue' | 'pink' | 'green' | 'rainbow'> {
  const now = input.now ?? new Date();
  const startMs = typeof input.startedAt === 'string' ? Date.parse(input.startedAt) : NaN;
  const keys = new Set<'red' | 'blue' | 'pink' | 'green' | 'rainbow'>();
  if (!Number.isFinite(startMs) || startMs > now.getTime() || input.resetComplete === true) return keys;
  const times = eventCycleMilestones(input.startedAt as string);
  if (!times) return keys;
  const grantAt = times.grantAt.getTime();
  const rainbowAt = times.rainbowAt.getTime();
  if (now.getTime() >= grantAt) {
    keys.add('red'); keys.add('blue'); keys.add('pink'); keys.add('green');
  }
  if (now.getTime() >= rainbowAt) keys.add('rainbow');
  return keys;
}

/** Operator cannot reopen last night's admissions after the event's 01:00 close. */
export function eventCycleCanOpenAdmission(settings: Record<string, unknown>, now = new Date()): boolean {
  if (settings.event_cycle_reset_complete === true) return true;
  if (typeof settings.event_cycle_started_at !== 'string') return true; // new, not-yet-started event
  const milestones = eventCycleMilestones(settings.event_cycle_started_at);
  if (!milestones) return false; // invalid existing marker: fail closed
  return now.getTime() < milestones.admissionCloseAt.getTime();
}
