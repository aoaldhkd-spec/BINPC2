import { coerceEventScheduleRaw } from './event-schedule';
import { parseSulbunEvent, type SulbunEventState } from './sulbun-event';
/**
 * Pure planner for /api/db/ready settings → App apply callbacks.
 * Whole-app (entry/session/timer/functions-lock), not chat-only.
 */

export type SessionReadySettingsPatch = {
  sessionActive?: boolean;
  functionsLockedRaw?: unknown;
  hasFunctionsLocked: boolean;
  timerEndAt?: string | null;
  timerLabel?: string | null;
  eventScheduleRaw?: string | null;
  sulbunEvent?: SulbunEventState | null;
  includeTimers: boolean;
};

export function planSessionReadySettingsPatch(
  settings: Record<string, unknown> | null | undefined,
  opts?: { includeTimers?: boolean; omitEventSchedule?: boolean },
): SessionReadySettingsPatch | null {
  if (!settings || typeof settings !== 'object') return null;
  const includeTimers = opts?.includeTimers === true;
  const hasSession = typeof settings.session_active === 'boolean';
  const hasFunctionsLocked = settings.functions_locked != null;
  if (!hasSession && !hasFunctionsLocked && !includeTimers) return null;

  const patch: SessionReadySettingsPatch = {
    hasFunctionsLocked,
    includeTimers,
  };
  if (hasSession) patch.sessionActive = settings.session_active as boolean;
  if (hasFunctionsLocked) patch.functionsLockedRaw = settings.functions_locked;
  if (!opts?.omitEventSchedule && Object.prototype.hasOwnProperty.call(settings, 'event_schedule')) {
    patch.eventScheduleRaw = coerceEventScheduleRaw(settings.event_schedule);
  }
  if (Object.prototype.hasOwnProperty.call(settings, 'sulbun_event')) {
    patch.sulbunEvent = parseSulbunEvent(settings.sulbun_event);
  }
  if (includeTimers) {
    patch.timerEndAt = (settings.timer_end_at as string | null | undefined) ?? null;
    patch.timerLabel = (settings.timer_label as string | null | undefined) ?? null;
  }
  return patch;
}

/** Fetch /ready settings blob; returns null on network/HTTP failure. */
export async function fetchReadySettingsJson(
  timeoutMs: number,
): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch('/api/db/ready', { signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return null;
    const json = (await r.json()) as { settings?: Record<string, unknown> };
    return json?.settings ?? null;
  } catch {
    return null;
  }
}
