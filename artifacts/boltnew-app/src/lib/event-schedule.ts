import type { HeartType } from './constants';

export type EventScheduleSlot = {
  id: string;
  at: string;
  notice: string;
  functions_locked?: boolean;
  heart_grants?: Partial<Record<HeartType, number>>;
  /** Cumulative pool of hearts spendable on any heart type. */
  rainbow_pool?: number;
};
export type EventSchedule = { timezone: 'Asia/Seoul'; slots: EventScheduleSlot[] };

const TYPES: HeartType[] = ['red', 'blue', 'pink', 'green'];
const AT_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseEventSchedule(raw: unknown): EventSchedule {
  let value = raw;
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { value = null; } }
  const rows = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>).slots : null;
  const slots = Array.isArray(rows) ? rows.flatMap((v, i) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return [];
    const r = v as Record<string, unknown>;
    if (typeof r.at !== 'string' || !AT_RE.test(r.at)) return [];
    const grants: Partial<Record<HeartType, number>> = {};
    if (r.heart_grants && typeof r.heart_grants === 'object' && !Array.isArray(r.heart_grants)) {
      for (const t of TYPES) {
        const n = Number((r.heart_grants as Record<string, unknown>)[t]);
        if (Number.isFinite(n) && n > 0) grants[t] = Math.min(20, Math.floor(n));
      }
    }
    const rainbowPool = Number(r.rainbow_pool);
    return [{ id: typeof r.id === 'string' ? r.id : `slot-${i + 1}`, at: r.at, notice: typeof r.notice === 'string' ? r.notice.slice(0, 240) : '', ...(typeof r.functions_locked === 'boolean' ? { functions_locked: r.functions_locked } : {}), ...(Object.keys(grants).length ? { heart_grants: grants } : {}), ...(Number.isFinite(rainbowPool) && rainbowPool > 0 ? { rainbow_pool: Math.min(100, Math.floor(rainbowPool)) } : {}) }];
  }) : [];
  return { timezone: 'Asia/Seoul', slots: slots.sort((a, b) => a.at.localeCompare(b.at)) };
}
function nowSeoulMinute(now = new Date()): number {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
  const h = Number(p.find(x => x.type === 'hour')?.value ?? 0);
  const m = Number(p.find(x => x.type === 'minute')?.value ?? 0);
  return (h === 24 ? 0 : h) * 60 + m;
}
function slotMinute(at: string): number { return Number(at.slice(0, 2)) * 60 + Number(at.slice(3)); }
export function eventHeartQuota(raw: unknown, type: HeartType, now = new Date(), base = 0): number {
  const minute = nowSeoulMinute(now);
  return base + parseEventSchedule(raw).slots.filter(s => slotMinute(s.at) <= minute).reduce((n, s) => n + (s.heart_grants?.[type] ?? 0), 0);
}
export function eventRainbowQuota(raw: unknown, now = new Date(), base = 0): number {
  const minute = nowSeoulMinute(now);
  return base + parseEventSchedule(raw).slots.filter(s => slotMinute(s.at) <= minute).reduce((n, s) => n + (s.rainbow_pool ?? 0), 0);
}
export function eventHeartQuotas(raw: unknown, now = new Date()): Record<HeartType, number> {
  return { red: eventHeartQuota(raw, 'red', now), blue: eventHeartQuota(raw, 'blue', now), pink: eventHeartQuota(raw, 'pink', now), green: eventHeartQuota(raw, 'green', now) };
}
export function currentEventSlot(raw: unknown, now = new Date()): EventScheduleSlot | null {
  const minute = nowSeoulMinute(now); let active: EventScheduleSlot | null = null;
  for (const s of parseEventSchedule(raw).slots) if (slotMinute(s.at) <= minute) active = s;
  return active;
}
