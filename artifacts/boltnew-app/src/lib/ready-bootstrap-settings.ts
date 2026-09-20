import { coerceEventScheduleRaw } from './event-schedule';
import { parseSulbunEvent, type SulbunEventState } from './sulbun-event';
/**
 * Pure planners for /ready mount bootstrap + settings poll apply.
 * Side effects (fetch, setState, wipe) stay in the thin hook / App wiring.
 */
import {
  shouldApplyAdminResetSignal,
} from './entry-gate';

export const READY_BOOTSTRAP_SAFETY_MS = 2_500;
export const READY_BOOTSTRAP_FETCH_MS = 8_000;
export const READY_BOOTSTRAP_POLL_MS = 4_000;
export const READY_BOOTSTRAP_POLL_FETCH_MS = 5_000;
export const READY_BOOTSTRAP_MAX_ATTEMPTS = 5;

export type ReadyBootstrapApplyPlan =
  | { kind: 'reset'; resetSignal: string; sulbunEvent: SulbunEventState | null }
  | {
      kind: 'apply';
      sessionActive: boolean;
      timerEndAt: string | null;
      timerLabel: string | null;
      eventScheduleRaw?: string | null;
      hasFunctionsLocked: boolean;
      functionsLockedRaw?: unknown;
      sulbunEvent: SulbunEventState | null;
    };

/** /ready or app_settings row → reset wipe or full session/entry/timer apply. */
export function planReadyBootstrapApply(
  data: Record<string, unknown>,
  opts: {
    localReset: string | null | undefined;
    omitEventSchedule?: boolean;
  },
): ReadyBootstrapApplyPlan {
  const serverReset = (data.reset_signal as string | null | undefined) ?? null;
  if (shouldApplyAdminResetSignal(serverReset, opts.localReset)) {
    return { kind: 'reset', resetSignal: serverReset as string, sulbunEvent: parseSulbunEvent(data.sulbun_event) };
  }
  return {
    kind: 'apply',
    sessionActive: Boolean(data.session_active),
    timerEndAt: (data.timer_end_at as string | null | undefined) ?? null,
    timerLabel: (data.timer_label as string | null | undefined) ?? null,
    ...(!opts.omitEventSchedule && Object.prototype.hasOwnProperty.call(data, 'event_schedule')
      ? { eventScheduleRaw: coerceEventScheduleRaw(data.event_schedule) }
      : {}),
    hasFunctionsLocked: data.functions_locked != null,
    functionsLockedRaw: data.functions_locked != null ? data.functions_locked : undefined,
    sulbunEvent: parseSulbunEvent(data.sulbun_event),
  };
}

export type ReadyBootstrapSafetyPlan = {
  setAppLoadingFalse: true;
  /** Only when no stored user — avoid waiting-landing flash for dummy/recover re-entry. */
  coerceSessionInactiveIfUnset: boolean;
};

export function planReadyBootstrapSafety(hasStoredUser: boolean): ReadyBootstrapSafetyPlan {
  return {
    setAppLoadingFalse: true,
    coerceSessionInactiveIfUnset: !hasStoredUser,
  };
}

export type ReadyBootstrapRetryPlan =
  | { kind: 'retry'; delayMs: number; nextAttempt: number }
  | { kind: 'exhausted' };

export function planReadyBootstrapRetry(attempt: number): ReadyBootstrapRetryPlan {
  if (attempt < READY_BOOTSTRAP_MAX_ATTEMPTS) {
    return {
      kind: 'retry',
      delayMs: Math.min(400 * Math.pow(2, attempt), 3200),
      nextAttempt: attempt + 1,
    };
  }
  return { kind: 'exhausted' };
}

export type ReadyBootstrapExhaustedPlan = {
  appLoading: false;
  sessionActive: false;
};

export function planReadyBootstrapExhausted(): ReadyBootstrapExhaustedPlan {
  return { appLoading: false, sessionActive: false };
}

/** Parse /ready JSON; require ready+settings for bootstrap success (poll may omit ready). */
export function pickReadyBootstrapSettings(
  json: { ready?: boolean; settings?: Record<string, unknown> } | null | undefined,
  mode: 'bootstrap' | 'poll',
): Record<string, unknown> | null {
  if (!json?.settings) return null;
  if (mode === 'bootstrap' && !json.ready) return null;
  return json.settings;
}

/** First successful settings payload wins (parallel /ready + SELECT). */
export function raceFirstNonNullSettings(
  sources: Array<Promise<Record<string, unknown> | null>>,
): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    let remaining = sources.length;
    if (remaining === 0) {
      resolve(null);
      return;
    }
    let settled = false;
    const failOne = () => {
      if (settled) return;
      remaining -= 1;
      if (remaining === 0) resolve(null);
    };
    for (const src of sources) {
      void src.then(
        (s) => {
          if (settled) return;
          if (s) {
            settled = true;
            resolve(s);
            return;
          }
          failOne();
        },
        () => failOne(),
      );
    }
  });
}

