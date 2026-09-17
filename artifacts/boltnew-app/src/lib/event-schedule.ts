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
function eventHeartQuota(raw: unknown, type: HeartType, now = new Date(), base = 0): number {
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

/** Combined rainbow_pool + per-color heart_grants. Not the user-facing 무지개하트 count. */
export function eventGrantedHeartTotal(raw: unknown, now = new Date()): number {
  const colors = eventHeartQuotas(raw, now);
  return eventRainbowQuota(raw, now) + colors.red + colors.blue + colors.pink + colors.green;
}
export function currentEventSlot(raw: unknown, now = new Date()): EventScheduleSlot | null {
  const minute = nowSeoulMinute(now); let active: EventScheduleSlot | null = null;
  for (const s of parseEventSchedule(raw).slots) if (slotMinute(s.at) <= minute) active = s;
  return active;
}

/** Normalize app_settings.event_schedule from SSE/ready (string or object) into a JSON string. */
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

/** Shared-pool pick state for LikeConfirmDialog / header — unlocked only when rainbow_pool > 0. */
export function rainbowPoolPickState(input: {
  rainbowPool: number;
  totalUsed: number;
  alreadySentThisType: boolean;
}): { unlocked: boolean; poolRemaining: number; disabled: boolean } {
  const unlocked = input.rainbowPool > 0;
  const poolRemaining = unlocked ? Math.max(0, input.rainbowPool - input.totalUsed) : 0;
  const disabled = !unlocked || poolRemaining <= 0 || input.alreadySentThisType;
  return { unlocked, poolRemaining, disabled };
}

/** User-facing heart vs chat lock + remaining pool — one shared count, not per-color fake 0s. */
export function participantHeartChatLock(input: {
  functionsLocked: boolean;
  rainbowPool: number;
  totalUsed: number;
}): { remaining: number; heartsLocked: boolean; chatLocked: boolean; poolGranted: boolean } {
  const pick = rainbowPoolPickState({
    rainbowPool: input.rainbowPool,
    totalUsed: input.totalUsed,
    alreadySentThisType: false,
  });
  return {
    remaining: pick.poolRemaining,
    poolGranted: pick.unlocked,
    heartsLocked: input.functionsLocked || !pick.unlocked,
    chatLocked: input.functionsLocked,
  };
}

/** Minutes a last-slot notice stays visible after its `at` when no next slot. */
export const EVENT_NOTICE_HOLD_MINUTES = 5;

export type EventScheduleBannerState = {
  show: boolean;
  active: EventScheduleSlot | null;
  next: EventScheduleSlot | null;
  nextSeconds: number | null;
  showNotice: boolean;
  cumulativeRainbow: number;
  upcomingHeartText: string | null;
};

const GRANT_LABEL: Record<HeartType, string> = {
  red: '호감', blue: '친구', pink: '뜨밤', green: '칭찬',
};

function slotHasHeartGrant(slot: EventScheduleSlot): boolean {
  if ((slot.rainbow_pool ?? 0) > 0) return true;
  return TYPES.some(t => (slot.heart_grants?.[t] ?? 0) > 0);
}

/** Korean 「N분 뒤 ○○하트가 추가됩니다」 copy from the next future grant slot. */
export function upcomingHeartGrantPreview(raw: unknown, now = new Date()): { minutes: number; text: string } | null {
  const schedule = parseEventSchedule(raw);
  const current = nowSeoulMinute(now);
  const nextGrant = schedule.slots.find(s => slotMinute(s.at) > current && slotHasHeartGrant(s)) ?? null;
  if (!nextGrant) return null;
  const remainingSec = (slotMinute(nextGrant.at) - current) * 60 - now.getSeconds();
  if (remainingSec <= 0) return null;
  const minutes = Math.max(1, Math.ceil(remainingSec / 60));
  const prefix = `${minutes}분 뒤`;
  if ((nextGrant.rainbow_pool ?? 0) > 0) {
    return { minutes, text: `${prefix} 무지개하트 ${nextGrant.rainbow_pool}개가 추가됩니다` };
  }
  const granted = TYPES.filter(t => (nextGrant.heart_grants?.[t] ?? 0) > 0);
  if (granted.length === 1) {
    return { minutes, text: `${prefix} ${GRANT_LABEL[granted[0]]}하트가 추가됩니다` };
  }
  if (granted.length > 1) {
    return { minutes, text: `${prefix} ${granted.map(t => GRANT_LABEL[t]).join('·')}하트가 추가됩니다` };
  }
  return null;
}

/** Participant banner: show notice only inside its window; hide when past. */
export function eventScheduleBannerState(raw: unknown, now = new Date()): EventScheduleBannerState {
  const schedule = parseEventSchedule(raw);
  const empty = { show: false, active: null, next: null, nextSeconds: null, showNotice: false, cumulativeRainbow: 0, upcomingHeartText: null as string | null };
  if (!schedule.slots.length) return empty;
  const current = nowSeoulMinute(now);
  const active = currentEventSlot(raw, now);
  const next = schedule.slots.find(s => slotMinute(s.at) > current) ?? null;
  const nextSeconds = next
    ? (slotMinute(next.at) - current) * 60 - now.getSeconds()
    : null;
  let showNotice = false;
  if (active?.notice) {
    const start = slotMinute(active.at);
    const end = next ? slotMinute(next.at) : start + EVENT_NOTICE_HOLD_MINUTES;
    showNotice = current >= start && current < end;
  }
  const upcoming = upcomingHeartGrantPreview(raw, now);
  const showCountdown = next != null && nextSeconds != null && nextSeconds > 0;
  return {
    show: showNotice || showCountdown || upcoming != null,
    active,
    next: showCountdown ? next : null,
    nextSeconds: showCountdown ? nextSeconds : null,
    showNotice,
    cumulativeRainbow: eventRainbowQuota(raw, now),
    upcomingHeartText: upcoming?.text ?? null,
  };
}

