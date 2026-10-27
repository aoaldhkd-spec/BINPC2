import { eventCycleMilestones } from '../../../../lib/api-zod/src/event-cycle-clock';
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

/** New admission is separate from existing participants' heart/chat access. */
export function eventCycleAdmissionOpen(input: {
  sessionActive: unknown; startedAt: unknown; resetComplete: unknown; now?: Date;
}): boolean {
  if (input.sessionActive !== true || input.resetComplete === true
    || typeof input.startedAt !== 'string') return false;
  const now = input.now ?? new Date();
  const startMs = Date.parse(input.startedAt);
  if (!Number.isFinite(startMs) || startMs > now.getTime()) return false;
  const times = eventCycleMilestones(input.startedAt);
  return Boolean(times && now.getTime() < times.admissionCloseAt.getTime());
}
