/** Server-authoritative event clock schedule and per-heart grants. */

export const EVENT_HEART_TYPES = ['red', 'blue', 'pink', 'green'] as const;
export type EventHeartType = (typeof EVENT_HEART_TYPES)[number];

export type EventScheduleSlot = {
  id: string;
  at: string; // Asia/Seoul HH:mm
  notice: string;
  functions_locked?: boolean;
  heart_grants?: Partial<Record<EventHeartType, number>>;
};

export type EventSchedule = {
  timezone: 'Asia/Seoul';
  slots: EventScheduleSlot[];
};

const AT_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseEventSchedule(raw: unknown): EventSchedule {
  let value = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { value = null; }
  }
  const slotsRaw = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>).slots
    : null;
  const slots: EventScheduleSlot[] = Array.isArray(slotsRaw)
    ? slotsRaw.slice(0, 48).flatMap((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const row = item as Record<string, unknown>;
      const at = typeof row.at === 'string' && AT_RE.test(row.at) ? row.at : null;
      if (!at) return [];
      const grants: Partial<Record<EventHeartType, number>> = {};
      const rawGrants = row.heart_grants;
      if (rawGrants && typeof rawGrants === 'object' && !Array.isArray(rawGrants)) {
        for (const type of EVENT_HEART_TYPES) {
          const n = Number((rawGrants as Record<string, unknown>)[type]);
          if (Number.isFinite(n) && n > 0) grants[type] = Math.min(20, Math.floor(n));
        }
      }
      return [{
        id: typeof row.id === 'string' && row.id ? row.id.slice(0, 64) : `slot-${index + 1}`,
        at,
        notice: typeof row.notice === 'string' ? row.notice.replace(/<[^>]*>/g, '').slice(0, 240) : '',
        ...(typeof row.functions_locked === 'boolean' ? { functions_locked: row.functions_locked } : {}),
        ...(Object.keys(grants).length ? { heart_grants: grants } : {}),
      }];
    })
    : [];
  slots.sort((a, b) => a.at.localeCompare(b.at));
  return { timezone: 'Asia/Seoul', slots };
}

function seoulMinute(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find(p => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find(p => p.type === 'minute')?.value ?? 0);
  return (hour === 24 ? 0 : hour) * 60 + minute;
}

function slotMinute(at: string): number { return Number(at.slice(0, 2)) * 60 + Number(at.slice(3)); }

export function activeEventScheduleSlot(raw: unknown, now = new Date()): EventScheduleSlot | null {
  const schedule = parseEventSchedule(raw);
  const minute = seoulMinute(now);
  let active: EventScheduleSlot | null = null;
  for (const slot of schedule.slots) if (slotMinute(slot.at) <= minute) active = slot;
  return active;
}

export function eventHeartQuota(raw: unknown, type: EventHeartType, now = new Date(), base = 2): number {
  const schedule = parseEventSchedule(raw);
  const minute = seoulMinute(now);
  return base + schedule.slots
    .filter(slot => slotMinute(slot.at) <= minute)
    .reduce((sum, slot) => sum + (slot.heart_grants?.[type] ?? 0), 0);
}

export function serializeEventSchedule(raw: unknown): string {
  return JSON.stringify(parseEventSchedule(raw));
}
