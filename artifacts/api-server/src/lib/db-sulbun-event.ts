/**
 * One-shot 술번개 cycle: open → next Seoul calendar day 17:00 auto reset.
 * Does not change HeartOps slots / instant_unlock / likes.
 */
import { parseEventSchedule, serializeEventSchedule } from './db-heart-ops.js';

export const SULBUN_TZ = 'Asia/Seoul';
export const SULBUN_AUTO_RESET_HOUR = 17;
export const SULBUN_AUTO_RESET_MINUTE = 0;
export const NODE_TIMEOUT_MAX_MS = 2_147_483_647;

export type SulbunEventState = {
  cycle_id: string;
  opened_at: string;
  auto_reset_at: string;
  auto_reset_enabled: boolean;
  reset_done: boolean;
  reset_done_at?: string | null;
};

export type SulbunOpenPlan =
  | { kind: 'already_active'; event: SulbunEventState }
  | { kind: 'open'; event: SulbunEventState };

export type SulbunTimerPlan =
  | { kind: 'idle' }
  | { kind: 'arm'; delayMs: number }
  | { kind: 'catch_up' };

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function seoulYmd(now: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SULBUN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  return {
    y: Number(parts.find(p => p.type === 'year')?.value ?? 0),
    m: Number(parts.find(p => p.type === 'month')?.value ?? 0),
    d: Number(parts.find(p => p.type === 'day')?.value ?? 0),
  };
}

export function addSeoulCalendarDays(
  y: number,
  m: number,
  d: number,
  days: number,
): { y: number; m: number; d: number } {
  const utc = Date.UTC(y, m - 1, d + days, 12, 0, 0);
  const dt = new Date(utc);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

export function seoulWallTimeToDate(
  y: number,
  m: number,
  d: number,
  hour: number,
  minute: number,
): Date {
  return new Date(`${y}-${pad2(m)}-${pad2(d)}T${pad2(hour)}:${pad2(minute)}:00+09:00`);
}

/** Opened Seoul calendar date + 1 day, 17:00 Asia/Seoul. Real timestamp, not HeartOps 24:xx. */
export function computeSulbunAutoResetAt(openedAt: Date): Date {
  const ymd = seoulYmd(openedAt);
  const next = addSeoulCalendarDays(ymd.y, ymd.m, ymd.d, 1);
  return seoulWallTimeToDate(
    next.y,
    next.m,
    next.d,
    SULBUN_AUTO_RESET_HOUR,
    SULBUN_AUTO_RESET_MINUTE,
  );
}

export function parseSulbunEvent(raw: unknown): SulbunEventState | null {
  let value = raw;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try { value = JSON.parse(trimmed); } catch { return null; }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  const cycleId = typeof o.cycle_id === 'string' ? o.cycle_id.trim() : '';
  const openedAt = typeof o.opened_at === 'string' ? o.opened_at : '';
  const autoResetAt = typeof o.auto_reset_at === 'string' ? o.auto_reset_at : '';
  if (!cycleId || !openedAt || !autoResetAt) return null;
  if (Number.isNaN(Date.parse(openedAt)) || Number.isNaN(Date.parse(autoResetAt))) return null;
  return {
    cycle_id: cycleId.slice(0, 80),
    opened_at: openedAt,
    auto_reset_at: autoResetAt,
    auto_reset_enabled: o.auto_reset_enabled === true,
    reset_done: o.reset_done === true,
    reset_done_at: typeof o.reset_done_at === 'string' ? o.reset_done_at : null,
  };
}

export function serializeSulbunEvent(state: SulbunEventState): string {
  return JSON.stringify({
    cycle_id: state.cycle_id,
    opened_at: state.opened_at,
    auto_reset_at: state.auto_reset_at,
    auto_reset_enabled: state.auto_reset_enabled,
    reset_done: state.reset_done,
    ...(state.reset_done_at ? { reset_done_at: state.reset_done_at } : {}),
  });
}

export function publicSulbunEventView(raw: unknown): SulbunEventState | null {
  return parseSulbunEvent(raw);
}

export function isSulbunEventActive(state: SulbunEventState | null | undefined): boolean {
  return Boolean(state && state.auto_reset_enabled && !state.reset_done);
}

export function planSulbunOpen(opts: {
  existing: unknown;
  now: Date;
  cycleId: string;
}): SulbunOpenPlan {
  const current = parseSulbunEvent(opts.existing);
  if (isSulbunEventActive(current) && current) {
    return { kind: 'already_active', event: current };
  }
  const openedAt = opts.now;
  const autoResetAt = computeSulbunAutoResetAt(openedAt);
  return {
    kind: 'open',
    event: {
      cycle_id: opts.cycleId.slice(0, 80),
      opened_at: openedAt.toISOString(),
      auto_reset_at: autoResetAt.toISOString(),
      auto_reset_enabled: true,
      reset_done: false,
      reset_done_at: null,
    },
  };
}

export function planSulbunMarkResetDone(
  existing: SulbunEventState | null,
  now: Date,
): SulbunEventState | null {
  if (!existing) return null;
  if (!existing.auto_reset_enabled && existing.reset_done) return existing;
  return {
    ...existing,
    auto_reset_enabled: false,
    reset_done: true,
    reset_done_at: now.toISOString(),
  };
}

export function shouldRunSulbunAutoReset(
  existing: unknown,
  now: Date,
  expectedCycleId?: string,
): SulbunEventState | null {
  const state = parseSulbunEvent(existing);
  if (!isSulbunEventActive(state) || !state) return null;
  if (expectedCycleId && state.cycle_id !== expectedCycleId) return null;
  if (now.getTime() < Date.parse(state.auto_reset_at)) return null;
  return state;
}

export function planSulbunTimerRestore(existing: unknown, now: Date): SulbunTimerPlan {
  const state = parseSulbunEvent(existing);
  if (!isSulbunEventActive(state) || !state) return { kind: 'idle' };
  const dueAt = Date.parse(state.auto_reset_at);
  const delayMs = dueAt - now.getTime();
  if (delayMs <= 0) return { kind: 'catch_up' };
  return { kind: 'arm', delayMs: Math.min(delayMs, NODE_TIMEOUT_MAX_MS) };
}

/** Turn HeartOps 직접공지 enabled off; keep text/times and all unlock slots. */
export function disableDirectNoticesInSchedule(raw: unknown): string {
  const config = parseEventSchedule(raw);
  const notices = (config.direct_notices ?? []).map(n => ({
    id: n.id,
    text: n.text,
    ...(n.at ? { at: n.at } : {}),
  }));
  return serializeEventSchedule({
    ...config,
    direct_notice: '',
    ...(notices.length ? { direct_notices: notices } : {}),
  });
}

export function disableDirectNoticePresets(raw: unknown): string | null {
  let value = raw;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try { value = JSON.parse(trimmed); } catch { return typeof raw === 'string' ? raw : null; }
  }
  if (!Array.isArray(value)) return typeof raw === 'string' ? raw : null;
  const next = value.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
    const r = { ...(row as Record<string, unknown>) };
    delete r.enabled;
    return r;
  });
  return JSON.stringify(next);
}
