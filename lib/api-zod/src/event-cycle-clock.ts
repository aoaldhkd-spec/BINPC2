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
