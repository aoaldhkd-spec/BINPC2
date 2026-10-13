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
  const start = new Date(startMs);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
  });
  const parts = formatter.formatToParts(start);
  const val = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0);
  const startDate = `${val('year')}-${String(val('month')).padStart(2, '0')}-${String(val('day')).padStart(2, '0')}`;
  // 00:00–06:59 belongs to the previous evening's event.
  const d = new Date(startDate + 'T00:00:00+09:00');
  if (val('hour') < 7 || val('hour') === 24) d.setTime(d.getTime() - 86_400_000);
  const yyyyMmDd = (x: Date) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(x);
  const day = yyyyMmDd(d);
  const grantAt = Date.parse(day + 'T23:00:00+09:00');
  const rainbowAt = grantAt + 3_600_000;
  if (now.getTime() >= grantAt) {
    keys.add('red'); keys.add('blue'); keys.add('pink'); keys.add('green');
  }
  if (now.getTime() >= rainbowAt) keys.add('rainbow');
  return keys;
}
