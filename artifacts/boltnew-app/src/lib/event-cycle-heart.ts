/**
 * The event's next 01:00 and 17:00 depend on its start time:
 * 00:00-00:59 joins the previous night's slots; 01:00 or later starts
 * the current calendar day's evening slots. Keep server and client identical.
 */
export function eventCycleMilestones(startedAt: string): {
  grantAt: Date; rainbowAt: Date; admissionCloseAt: Date; resetAt: Date;
} | null {
  const startMs = Date.parse(startedAt);
  if (!Number.isFinite(startMs)) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
  }).formatToParts(new Date(startMs));
  const v = (k: string) => Number(parts.find(p => p.type === k)?.value ?? 0);
  const date = `${v('year')}-${String(v('month')).padStart(2, '0')}-${String(v('day')).padStart(2, '0')}`;
  const midnight = Date.parse(date + 'T00:00:00+09:00');
  const grantMs = midnight + (v('hour') === 0 ? -86_400_000 : 0) + 23 * 3_600_000;
  const rainbowMs = grantMs + 3_600_000;
  const closeMs = rainbowMs + 3_600_000;
  return {
    grantAt: new Date(grantMs), rainbowAt: new Date(rainbowMs),
    admissionCloseAt: new Date(closeMs), resetAt: new Date(closeMs + 16 * 3_600_000),
  };
}

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
