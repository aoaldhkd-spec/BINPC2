/**
 * Fixed daily BINPC2 operating cycle (Asia/Seoul).
 *
 * 23:00  red/blue/pink/green grant hearts unlock by event_schedule
 * 24:00  rainbow unlocks by event_schedule
 * 01:00  session_active becomes false
 * 17:00  full event reset runs using the same core as admin_event_end_reset
 *
 * 23/24 are time-based unlocks, so they do not need a destructive timer job.
 * 01/17 use durable per-Seoul-date markers so a server restart can catch up once.
 */

export const FIXED_DAILY_EVENT_SCHEDULE = JSON.stringify({
  timezone: 'Asia/Seoul',
  version: 2,
  slots: [
    { id: 'slot-1', at: '23:00', unlock: ['red'] },
    { id: 'slot-2', at: '23:00', unlock: ['blue'] },
    { id: 'slot-3', at: '23:00', unlock: ['pink', 'green'] },
    { id: 'slot-4', at: '24:00', unlock: ['rainbow'] },
  ],
});

const SEOUL = 'Asia/Seoul';
export const DAILY_SESSION_END_HOUR = 1;
export const DAILY_RESET_HOUR = 17;

type Ymd = { y: number; m: number; d: number };

type SeoulParts = Ymd & {
  hour: number;
  minute: number;
  second: number;
};

function pad2(v: number): string {
  return String(v).padStart(2, '0');
}

function parts(now: Date): SeoulParts {
  const ps = new Intl.DateTimeFormat('en-US', {
    timeZone: SEOUL,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const n = (type: Intl.DateTimeFormatPartTypes) =>
    Number(ps.find(p => p.type === type)?.value ?? 0);
  const rawHour = n('hour');
  return {
    y: n('year'), m: n('month'), d: n('day'),
    hour: rawHour === 24 ? 0 : rawHour,
    minute: n('minute'), second: n('second'),
  };
}

function addDays(ymd: Ymd, days: number): Ymd {
  const d = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d + days, 12));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

function key(ymd: Ymd): string {
  return `${ymd.y}-${pad2(ymd.m)}-${pad2(ymd.d)}`;
}

function wall(ymd: Ymd, hour: number): Date {
  return new Date(`${key(ymd)}T${pad2(hour)}:00:00+09:00`);
}

function minuteOfDay(now: Date): number {
  const p = parts(now);
  return p.hour * 60 + p.minute;
}

export function seoulDateKey(now = new Date()): string {
  return key(parts(now));
}

export function previousSeoulDateKey(now = new Date()): string {
  return key(addDays(parts(now), -1));
}

/**
 * First-deploy/bootstrap safety:
 * - If today's boundary already passed before this feature was deployed, mark it done.
 * - If boundary is still ahead today, seed yesterday so today's job can run.
 * This prevents a first deployment at 20:00 from immediately deleting live data.
 */
export function dailyCycleBootstrapPatch(
  settings: Record<string, unknown>,
  now = new Date(),
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const today = seoulDateKey(now);
  const prev = previousSeoulDateKey(now);
  const minute = minuteOfDay(now);

  if (typeof settings.daily_session_end_date !== 'string') {
    patch.daily_session_end_date = minute >= DAILY_SESSION_END_HOUR * 60 ? today : prev;
  }
  if (typeof settings.daily_reset_date !== 'string') {
    patch.daily_reset_date = minute >= DAILY_RESET_HOUR * 60 ? today : prev;
  }
  if (String(settings.event_schedule ?? '') !== FIXED_DAILY_EVENT_SCHEDULE) {
    patch.event_schedule = FIXED_DAILY_EVENT_SCHEDULE;
  }
  if (String(settings.direct_notice_presets ?? '') !== '[]') {
    patch.direct_notice_presets = '[]';
  }
  return patch;
}

export function dueDailyCycleActions(
  settings: Record<string, unknown>,
  now = new Date(),
): { sessionEndDate: string | null; resetDate: string | null } {
  const today = seoulDateKey(now);
  const minute = minuteOfDay(now);
  return {
    sessionEndDate:
      minute >= DAILY_SESSION_END_HOUR * 60
      && String(settings.daily_session_end_date ?? '') !== today
        ? today
        : null,
    resetDate:
      minute >= DAILY_RESET_HOUR * 60
      && String(settings.daily_reset_date ?? '') !== today
        ? today
        : null,
  };
}

export function nextDailyCycleDelayMs(now = new Date()): number {
  const p = parts(now);
  const today: Ymd = { y: p.y, m: p.m, d: p.d };
  const tomorrow = addDays(today, 1);

  const endToday = wall(today, DAILY_SESSION_END_HOUR);
  const resetToday = wall(today, DAILY_RESET_HOUR);
  const nextEnd = endToday.getTime() > now.getTime()
    ? endToday
    : wall(tomorrow, DAILY_SESSION_END_HOUR);
  const nextReset = resetToday.getTime() > now.getTime()
    ? resetToday
    : wall(tomorrow, DAILY_RESET_HOUR);

  return Math.max(1_000, Math.min(nextEnd.getTime(), nextReset.getTime()) - now.getTime());
}
