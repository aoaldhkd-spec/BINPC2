/** Server mirror of boltnew-app heart-ops (lock/unlock + rainbow 4 uses). */

export const EVENT_HEART_TYPES = ['red', 'blue', 'pink', 'green'] as const;
export type EventHeartType = (typeof EVENT_HEART_TYPES)[number];
export type HeartUnlockKey = EventHeartType | 'rainbow';

export type HeartOpsSlot = {
  id: string;
  at: string;
  notice_at?: string;
  show_notice?: boolean;
  unlock: HeartUnlockKey[];
};

export type HeartOpsConfig = {
  timezone: 'Asia/Seoul';
  version: 2;
  slots: HeartOpsSlot[];
  instant_unlock?: HeartUnlockKey[];
  direct_notice?: string;
  auto_unlock_from?: number;
  show_notice_time?: boolean;
  show_unlock_time?: boolean;
  show_countdown?: boolean;
};

export const RAINBOW_MAX_USES = 4;

const AT_RE = /^([01]\d|2[0-4]):([0-5]\d)$/;

function parseOptionalClock(raw: unknown): string | undefined {
  return typeof raw === 'string' && AT_RE.test(raw) ? raw : undefined;
}

function serializeBannerDisplay(config: {
  show_notice_time?: boolean;
  show_unlock_time?: boolean;
  show_countdown?: boolean;
}) {
  return {
    ...(config.show_notice_time ? { show_notice_time: true as const } : {}),
    ...(config.show_unlock_time === false ? { show_unlock_time: false as const } : {}),
    ...(config.show_countdown === false ? { show_countdown: false as const } : {}),
  };
}

function parseUnlockList(raw: unknown): HeartUnlockKey[] {
  if (!Array.isArray(raw)) return [];
  const out: HeartUnlockKey[] = [];
  for (const v of raw) {
    if (v === 'rainbow') { out.push('rainbow'); continue; }
    if (typeof v === 'string' && (EVENT_HEART_TYPES as readonly string[]).includes(v)) {
      out.push(v as EventHeartType);
    }
  }
  return [...new Set(out)];
}

function migrateV1Slot(row: Record<string, unknown>, index: number): HeartOpsSlot | null {
  const at = typeof row.at === 'string' && AT_RE.test(row.at) ? row.at : null;
  if (!at) return null;
  const unlock: HeartUnlockKey[] = [];
  const grants = row.heart_grants;
  if (grants && typeof grants === 'object' && !Array.isArray(grants)) {
    for (const t of EVENT_HEART_TYPES) {
      const n = Number((grants as Record<string, unknown>)[t]);
      if (Number.isFinite(n) && n > 0) unlock.push(t);
    }
  }
  const rainbowPool = Number(row.rainbow_pool);
  if (Number.isFinite(rainbowPool) && rainbowPool > 0) unlock.push('rainbow');
  return {
    id: typeof row.id === 'string' ? row.id.slice(0, 64) : `slot-${index + 1}`,
    at,
    unlock,
  };
}

export function slotEventMinute(at: string): number {
  return Number(at.slice(0, 2)) * 60 + Number(at.slice(3));
}

function seoulClockParts(now: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find(p => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find(p => p.type === 'minute')?.value ?? 0);
  return { hour: hour === 24 ? 0 : hour, minute };
}

export function nowEventMinute(now = new Date()): number {
  const { hour, minute } = seoulClockParts(now);
  let base = hour * 60 + minute;
  if (hour < 7) base += 1440;
  return base;
}

export function parseHeartOps(raw: unknown): HeartOpsConfig {
  let value = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { value = null; }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { timezone: 'Asia/Seoul', version: 2, slots: [] };
  }
  const obj = value as Record<string, unknown>;
  const version = Number(obj.version);
  const rows = Array.isArray(obj.slots) ? obj.slots : [];
  let slots: HeartOpsSlot[];
  if (version === 2) {
    slots = rows.flatMap((v, i) => {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return [];
      const r = v as Record<string, unknown>;
      const at = typeof r.at === 'string' && AT_RE.test(r.at) ? r.at : null;
      if (!at) return [];
      const noticeAt = parseOptionalClock(r.notice_at);
      return [{
        id: typeof r.id === 'string' ? r.id.slice(0, 64) : `slot-${i + 1}`,
        at,
        unlock: parseUnlockList(r.unlock),
        ...(noticeAt ? { notice_at: noticeAt } : {}),
        ...(r.show_notice === true ? { show_notice: true } : {}),
      }];
    });
  } else {
    slots = rows.flatMap((v, i) => {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return [];
      const migrated = migrateV1Slot(v as Record<string, unknown>, i);
      return migrated ? [migrated] : [];
    });
  }
  slots.sort((a, b) => slotEventMinute(a.at) - slotEventMinute(b.at));
  const autoUnlockFrom = parseAutoUnlockFrom(obj.auto_unlock_from);
  return {
    timezone: 'Asia/Seoul',
    version: 2,
    slots,
    instant_unlock: parseUnlockList(obj.instant_unlock),
    direct_notice: typeof obj.direct_notice === 'string' ? obj.direct_notice.slice(0, 240) : '',
    ...(autoUnlockFrom != null ? { auto_unlock_from: autoUnlockFrom } : {}),
    ...serializeBannerDisplay({
      show_notice_time: obj.show_notice_time === true,
      show_unlock_time: obj.show_unlock_time !== false,
      show_countdown: obj.show_countdown !== false,
    }),
  };
}

export function serializeHeartOps(config: HeartOpsConfig): string {
  return JSON.stringify({
    timezone: 'Asia/Seoul',
    version: 2,
    slots: config.slots.map(s => ({
      id: s.id,
      at: s.at,
      unlock: s.unlock,
      ...(s.notice_at && AT_RE.test(s.notice_at) ? { notice_at: s.notice_at } : {}),
      ...(s.show_notice ? { show_notice: true } : {}),
    })),
    ...(config.instant_unlock?.length ? { instant_unlock: config.instant_unlock } : {}),
    ...(config.direct_notice?.trim() ? { direct_notice: config.direct_notice.trim().slice(0, 240) } : {}),
    ...(config.auto_unlock_from != null ? { auto_unlock_from: config.auto_unlock_from } : {}),
    ...serializeBannerDisplay(config),
  });
}

function parseAutoUnlockFrom(raw: unknown): number | undefined {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 0 || n > 2000) return undefined;
  return n;
}

function slotHeldByReset(config: HeartOpsConfig, at: string): boolean {
  const hold = config.auto_unlock_from;
  if (hold == null || !Number.isFinite(hold)) return false;
  return slotEventMinute(at) <= hold;
}

export function unlockedHeartKeys(config: HeartOpsConfig, now = new Date()): Set<HeartUnlockKey> {
  const minute = nowEventMinute(now);
  const keys = new Set<HeartUnlockKey>();
  for (const slot of config.slots) {
    if (slotHeldByReset(config, slot.at)) continue;
    if (slotEventMinute(slot.at) <= minute) {
      for (const k of slot.unlock) keys.add(k);
    }
  }
  for (const k of config.instant_unlock ?? []) keys.add(k);
  return keys;
}

export function heartUsageFromLikeRows(rows: Record<string, unknown>[], likerId: string): {
  grantUsed: Record<EventHeartType, boolean>;
  rainbowUsed: number;
} {
  const grantUsed: Record<EventHeartType, boolean> = { red: false, blue: false, pink: false, green: false };
  let rainbowUsed = 0;
  for (const row of rows) {
    if (String(row.liker_id) !== likerId) continue;
    const type = String(row.heart_type ?? '');
    if (String(row.like_source) === 'rainbow') rainbowUsed += 1;
    else if ((EVENT_HEART_TYPES as readonly string[]).includes(type)) {
      grantUsed[type as EventHeartType] = true;
    }
  }
  return { grantUsed, rainbowUsed };
}

/** Legacy export name — delegates to heart ops parse. */
export function parseEventSchedule(raw: unknown): HeartOpsConfig {
  return parseHeartOps(raw);
}

export function serializeEventSchedule(raw: unknown): string {
  return serializeHeartOps(parseHeartOps(raw));
}

/** functions_locked from legacy slot fields (optional). */
export function activeEventScheduleSlot(raw: unknown, now = new Date()): { functions_locked?: boolean } | null {
  let value = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return null; }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const rows = (value as Record<string, unknown>).slots;
  if (!Array.isArray(rows)) return null;
  const minute = nowEventMinute(now);
  let active: Record<string, unknown> | null = null;
  for (const item of rows) {
    if (!item || typeof item !== 'object') continue;
    const at = (item as Record<string, unknown>).at;
    if (typeof at === 'string' && AT_RE.test(at) && slotEventMinute(at) <= minute) {
      active = item as Record<string, unknown>;
    }
  }
  if (!active) return null;
  return typeof active.functions_locked === 'boolean'
    ? { functions_locked: active.functions_locked }
    : null;
}
