import { HEART_TYPES, type HeartType } from './constants';

/** Stored in app_settings.event_schedule (version 2). */
export type HeartUnlockKey = HeartType | 'rainbow';

export type HeartOpsSlot = {
  id: string;
  /** Seoul HH:mm — 24:00 / 24:30 allowed (next calendar day after midnight). */
  at: string;
  unlock: HeartUnlockKey[];
};

export type HeartOpsConfig = {
  timezone: 'Asia/Seoul';
  version: 2;
  slots: HeartOpsSlot[];
  /** Immediate unlocks persisted across saves. */
  instant_unlock?: HeartUnlockKey[];
  /** Operator broadcast (separate from auto schedule copy). */
  direct_notice?: string;
};

export type HeartUsage = {
  grantUsed: Record<HeartType, boolean>;
  rainbowUsed: number;
};

export const RAINBOW_MAX_USES = 4;

export const DEFAULT_HEART_OPS_SLOTS: HeartOpsSlot[] = [
  { id: 'slot-1', at: '23:00', unlock: ['red'] },
  { id: 'slot-2', at: '23:30', unlock: ['blue'] },
  { id: 'slot-3', at: '24:00', unlock: ['pink', 'green'] },
  { id: 'slot-4', at: '24:30', unlock: ['rainbow'] },
];

export const DEFAULT_HEART_OPS: HeartOpsConfig = {
  timezone: 'Asia/Seoul',
  version: 2,
  slots: DEFAULT_HEART_OPS_SLOTS.map(s => ({ ...s, unlock: [...s.unlock] })),
  instant_unlock: [],
  direct_notice: '',
};

const TYPES: HeartType[] = ['red', 'blue', 'pink', 'green'];
/** HH:mm including 24:00–24:59 for post-midnight event slots. */
export const HEART_OPS_AT_RE = /^([01]\d|2[0-4]):([0-5]\d)$/;

/** Split stored `HH:MM` (including 24:xx) for hour/minute editors. */
export function parseHeartOpsClock(at: string): { hour: number; minute: number } {
  if (!HEART_OPS_AT_RE.test(at)) return { hour: 23, minute: 0 };
  return { hour: Number(at.slice(0, 2)), minute: Number(at.slice(3, 5)) };
}

/** Build `HH:MM` including 24:00–24:59. Invalid values return null. */
export function formatHeartOpsClock(hour: number, minute: number): string | null {
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 24 || minute < 0 || minute > 59) return null;
  const at = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return HEART_OPS_AT_RE.test(at) ? at : null;
}

/** Change one slot's `at` only — never drops sibling slots or unlock lists. */
export function patchHeartOpsSlotAt(
  slots: HeartOpsSlot[],
  index: number,
  hour: number,
  minute: number,
): HeartOpsSlot[] {
  const at = formatHeartOpsClock(hour, minute);
  if (!at) return slots;
  return slots.map((s, i) => (i === index ? { ...s, at } : s));
}

const HEART_OPS_CLOCK_MAX_MIN = 24 * 60 + 59;

/** Step `HH:MM` by minutes, wrapping 00:00–24:59 so 24:xx stays valid. */
export function stepHeartOpsClock(at: string, deltaMinutes: number): string {
  const { hour, minute } = parseHeartOpsClock(at);
  const span = HEART_OPS_CLOCK_MAX_MIN + 1;
  let total = hour * 60 + minute + deltaMinutes;
  total = ((total % span) + span) % span;
  return formatHeartOpsClock(Math.floor(total / 60), total % 60) ?? at;
}

/** Step hour only (0–24), keep the minute. */
export function stepHeartOpsHour(at: string, deltaHours: number): string {
  const { hour, minute } = parseHeartOpsClock(at);
  return formatHeartOpsClock(((hour + deltaHours) % 25 + 25) % 25, minute) ?? at;
}

/** Open the like picker when any grant type remains, or rainbow still has uses. */
export function canOpenHeartPicker(sentTypeCount: number, rainbowLeft: number): boolean {
  return sentTypeCount < TYPES.length || rainbowLeft > 0;
}

export function heartLabel(key: HeartUnlockKey): string {
  if (key === 'rainbow') return '무지개';
  return HEART_TYPES.find(h => h.type === key)?.label ?? key;
}

export function formatHeartOpsTime(at: string): string {
  const h = Number(at.slice(0, 2));
  const m = at.slice(3);
  if (h >= 24) return `${h}:${m}`;
  return at;
}

export function slotEventMinute(at: string): number {
  return Number(at.slice(0, 2)) * 60 + Number(at.slice(3));
}

export function seoulClockParts(now = new Date()): { hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find(p => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find(p => p.type === 'minute')?.value ?? 0);
  const second = Number(parts.find(p => p.type === 'second')?.value ?? 0);
  return { hour: hour === 24 ? 0 : hour, minute, second };
}

/** Event timeline minute: evening 23:xx and post-midnight 00:xx–06:xx on one axis. */
export function nowEventMinute(now = new Date()): number {
  const { hour, minute } = seoulClockParts(now);
  let base = hour * 60 + minute;
  if (hour < 7) base += 1440;
  return base;
}

function parseUnlockList(raw: unknown): HeartUnlockKey[] {
  if (!Array.isArray(raw)) return [];
  const out: HeartUnlockKey[] = [];
  for (const v of raw) {
    if (v === 'rainbow') { out.push('rainbow'); continue; }
    if (typeof v === 'string' && (TYPES as string[]).includes(v)) out.push(v as HeartType);
  }
  return [...new Set(out)];
}

function migrateV1Slot(row: Record<string, unknown>, index: number): HeartOpsSlot | null {
  const at = typeof row.at === 'string' && HEART_OPS_AT_RE.test(row.at) ? row.at : null;
  if (!at) return null;
  const unlock: HeartUnlockKey[] = [];
  const grants = row.heart_grants;
  if (grants && typeof grants === 'object' && !Array.isArray(grants)) {
    for (const t of TYPES) {
      const n = Number((grants as Record<string, unknown>)[t]);
      if (Number.isFinite(n) && n > 0) unlock.push(t);
    }
  }
  const rainbowPool = Number(row.rainbow_pool);
  if (Number.isFinite(rainbowPool) && rainbowPool > 0) unlock.push('rainbow');
  return {
    id: typeof row.id === 'string' ? row.id : `slot-${index + 1}`,
    at,
    unlock,
  };
}

export function parseHeartOps(raw: unknown): HeartOpsConfig {
  let value = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { value = null; }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_HEART_OPS, slots: DEFAULT_HEART_OPS.slots.map(s => ({ ...s, unlock: [...s.unlock] })) };
  }
  const obj = value as Record<string, unknown>;
  const version = Number(obj.version);
  const rows = Array.isArray(obj.slots) ? obj.slots : [];

  let slots: HeartOpsSlot[];
  if (version === 2) {
    slots = rows.flatMap((v, i) => {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return [];
      const r = v as Record<string, unknown>;
      const at = typeof r.at === 'string' && HEART_OPS_AT_RE.test(r.at) ? r.at : null;
      if (!at) return [];
      const unlock = parseUnlockList(r.unlock);
      return [{ id: typeof r.id === 'string' ? r.id.slice(0, 64) : `slot-${i + 1}`, at, unlock }];
    });
  } else {
    slots = rows.flatMap((v, i) => {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return [];
      const migrated = migrateV1Slot(v as Record<string, unknown>, i);
      return migrated ? [migrated] : [];
    });
  }

  if (!slots.length) {
    slots = DEFAULT_HEART_OPS.slots.map(s => ({ ...s, unlock: [...s.unlock] }));
  }
  slots.sort((a, b) => slotEventMinute(a.at) - slotEventMinute(b.at));

  const instant = parseUnlockList(obj.instant_unlock);
  const directNotice = typeof obj.direct_notice === 'string' ? obj.direct_notice.slice(0, 240) : '';

  return {
    timezone: 'Asia/Seoul',
    version: 2,
    slots,
    instant_unlock: instant,
    direct_notice: directNotice,
  };
}

export function serializeHeartOps(config: HeartOpsConfig): string {
  const clean: HeartOpsConfig = {
    timezone: 'Asia/Seoul',
    version: 2,
    slots: config.slots.map(s => ({
      id: s.id,
      at: s.at,
      unlock: [...new Set(s.unlock)],
    })),
    ...(config.instant_unlock?.length ? { instant_unlock: [...new Set(config.instant_unlock)] } : {}),
    ...(config.direct_notice?.trim() ? { direct_notice: config.direct_notice.trim().slice(0, 240) } : {}),
  };
  return JSON.stringify(clean);
}

export function coerceEventScheduleRaw(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof raw === 'object') {
    try { return JSON.stringify(raw); } catch { return null; }
  }
  return null;
}

export function unlockedHeartKeys(config: HeartOpsConfig, now = new Date()): Set<HeartUnlockKey> {
  const minute = nowEventMinute(now);
  const keys = new Set<HeartUnlockKey>();
  for (const slot of config.slots) {
    if (slotEventMinute(slot.at) <= minute) {
      for (const k of slot.unlock) keys.add(k);
    }
  }
  for (const k of config.instant_unlock ?? []) keys.add(k);
  return keys;
}

export function emptyHeartUsage(): HeartUsage {
  return { grantUsed: { red: false, blue: false, pink: false, green: false }, rainbowUsed: 0 };
}

export function heartUsageFromLikeRows(rows: Record<string, unknown>[], likerId: string): HeartUsage {
  const usage = emptyHeartUsage();
  for (const row of rows) {
    if (String(row.liker_id) !== likerId) continue;
    const type = String(row.heart_type ?? '');
    if (String(row.like_source) === 'rainbow') {
      usage.rainbowUsed += 1;
    } else if ((TYPES as string[]).includes(type)) {
      usage.grantUsed[type as HeartType] = true;
    }
  }
  return usage;
}

export function grantRemaining(config: HeartOpsConfig, usage: HeartUsage, type: HeartType, now = new Date()): 0 | 1 {
  if (!unlockedHeartKeys(config, now).has(type)) return 0;
  return usage.grantUsed[type] ? 0 : 1;
}

export function rainbowRemaining(config: HeartOpsConfig, usage: HeartUsage, now = new Date()): number {
  if (!unlockedHeartKeys(config, now).has('rainbow')) return 0;
  return Math.max(0, RAINBOW_MAX_USES - usage.rainbowUsed);
}

export type ParticipantHeartState = {
  unlocked: Set<HeartUnlockKey>;
  grantRemaining: Record<HeartType, 0 | 1>;
  rainbowRemaining: number;
  heartsLocked: boolean;
};

export function participantHeartState(
  config: HeartOpsConfig,
  usage: HeartUsage,
  functionsLocked: boolean,
  now = new Date(),
): ParticipantHeartState {
  const unlocked = unlockedHeartKeys(config, now);
  const grantRemainingMap = {
    red: grantRemaining(config, usage, 'red', now),
    blue: grantRemaining(config, usage, 'blue', now),
    pink: grantRemaining(config, usage, 'pink', now),
    green: grantRemaining(config, usage, 'green', now),
  } as Record<HeartType, 0 | 1>;
  const rainbowRem = rainbowRemaining(config, usage, now);
  const anyHeart = unlocked.size > 0 && (
    grantRemainingMap.red + grantRemainingMap.blue + grantRemainingMap.pink + grantRemainingMap.green + rainbowRem > 0
  );
  return {
    unlocked,
    grantRemaining: grantRemainingMap,
    rainbowRemaining: rainbowRem,
    heartsLocked: functionsLocked || !anyHeart,
  };
}

export type HeaderHeartChip = {
  key: 'rainbow' | HeartType;
  testId: string;
  emoji: string;
  label: string;
  remaining: number;
  locked: boolean;
};

export function headerHeartRemainings(input: {
  functionsLocked: boolean;
  config: HeartOpsConfig;
  usage: HeartUsage;
  now?: Date;
}): HeaderHeartChip[] {
  const now = input.now ?? new Date();
  const state = participantHeartState(input.config, input.usage, input.functionsLocked, now);
  const meta = (type: HeartType) => HEART_TYPES.find(h => h.type === type)!;
  const color = (type: HeartType, testId: string): HeaderHeartChip => {
    const rem = state.grantRemaining[type];
    const isUnlocked = state.unlocked.has(type);
    return {
      key: type,
      testId,
      emoji: meta(type).emoji,
      label: meta(type).label,
      remaining: rem,
      // functionsLocked blocks the send server-side, so the chip must look locked too.
      // `remaining` stays untouched so the pre-lock state returns as-is when unlocked.
      locked: input.functionsLocked || !isUnlocked || rem <= 0,
    };
  };
  const rainbowLocked = !state.unlocked.has('rainbow') || state.rainbowRemaining <= 0 || input.functionsLocked;
  return [
    {
      key: 'rainbow',
      testId: 'home-heart-remaining-rainbow',
      emoji: rainbowLocked ? '🔒🌈' : '🌈',
      label: '무지개',
      remaining: state.rainbowRemaining,
      locked: rainbowLocked,
    },
    color('red', 'home-heart-remaining-red'),
    color('pink', 'home-heart-remaining-pink'),
    color('blue', 'home-heart-remaining-blue'),
    color('green', 'home-heart-remaining-green'),
  ];
}

export type HeartOpsBannerState = {
  show: boolean;
  directNotice: string | null;
  autoLine: string | null;
  countdownSec: number | null;
  justUnlocked: string | null;
};

export function heartOpsBannerState(config: HeartOpsConfig, now = new Date()): HeartOpsBannerState {
  const direct = (config.direct_notice ?? '').trim();
  const minute = nowEventMinute(now);
  const { second } = seoulClockParts(now);

  const passed = config.slots.filter(s => slotEventMinute(s.at) <= minute);
  const justSlot = passed.find(s => {
    const sm = slotEventMinute(s.at);
    return minute === sm || (minute - sm <= 1 && second < 60);
  });
  let justUnlocked: string | null = null;
  if (justSlot?.unlock.length) {
    const names = justSlot.unlock.map(heartLabel).join('·');
    justUnlocked = `${names} 하트가 해금되었습니다`;
  }

  const next = config.slots.find(s => slotEventMinute(s.at) > minute && s.unlock.length > 0) ?? null;
  let autoLine: string | null = null;
  let countdownSec: number | null = null;
  if (next) {
    const names = next.unlock.map(heartLabel).join('·');
    autoLine = `${names} 하트 ${formatHeartOpsTime(next.at)} 해금`;
    countdownSec = Math.max(0, (slotEventMinute(next.at) - minute) * 60 - second);
  }

  const show = Boolean(direct || autoLine || justUnlocked);
  return { show, directNotice: direct || null, autoLine, countdownSec, justUnlocked };
}

/** Legacy slot flags (functions_locked) from stored JSON. */
export function currentEventSlot(raw: unknown, now = new Date()): { functions_locked?: boolean; notice?: string } | null {
  let value = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { value = null; }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const rows = (value as Record<string, unknown>).slots;
  if (!Array.isArray(rows)) return null;
  const minute = nowEventMinute(now);
  let active: Record<string, unknown> | null = null;
  for (const item of rows) {
    if (!item || typeof item !== 'object') continue;
    const at = (item as Record<string, unknown>).at;
    if (typeof at === 'string' && HEART_OPS_AT_RE.test(at) && slotEventMinute(at) <= minute) {
      active = item as Record<string, unknown>;
    }
  }
  if (!active) return null;
  return {
    ...(typeof active.functions_locked === 'boolean' ? { functions_locked: active.functions_locked } : {}),
    ...(typeof active.notice === 'string' && active.notice ? { notice: active.notice.slice(0, 240) } : {}),
  };
}

export function adminHeartStatusLine(config: HeartOpsConfig, now = new Date()): { key: HeartUnlockKey; locked: boolean }[] {
  const unlocked = unlockedHeartKeys(config, now);
  const order: HeartUnlockKey[] = ['red', 'blue', 'pink', 'green', 'rainbow'];
  return order.map(key => ({ key, locked: !unlocked.has(key) }));
}
