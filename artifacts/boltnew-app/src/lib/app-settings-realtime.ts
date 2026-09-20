/**
 * Pure planner for app_settings SSE UPDATE → App apply callbacks.
 * Does not wipe identity / storage — returns { kind: 'reset' } for App's applyResetSignal.
 */
import {
  shouldApplyAdminResetSignal,
  shouldAutoSkipWaiting,
} from './entry-gate';
import { parseSulbunEvent, type SulbunEventState } from './sulbun-event';

export type AppSettingsRealtimeRow = {
  session_active?: boolean;
  timer_end_at?: string | null;
  timer_label?: string | null;
  event_schedule?: string | Record<string, unknown> | null;
  reset_signal?: string | null;
  entry_password?: string | null;
  functions_locked?: boolean | null;
  sulbun_event?: unknown;
};

export type AppSettingsRealtimePlan =
  | { kind: 'reset'; resetSignal: string; sulbunEvent: SulbunEventState | null }
  | {
      kind: 'patch';
      setSessionActive: boolean;
      sessionActive?: boolean;
      autoSkipWaiting: boolean;
      /** Session went inactive — App still gates on userIdRef before setShownWaiting(false). */
      returnToWaiting: boolean;
      timerEndAt: string | null;
      timerLabel: string | null;
      hasFunctionsLocked: boolean;
      functionsLockedRaw?: unknown;
      sulbunEvent: SulbunEventState | null;
      setSulbunEvent: boolean;
    };

export function planAppSettingsRealtimeUpdate(
  p: AppSettingsRealtimeRow,
  opts: {
    localReset: string | null | undefined;
    wasSessionActive: boolean | null;
    hasStoredUser: boolean;
  },
): AppSettingsRealtimePlan {
  if (shouldApplyAdminResetSignal(p.reset_signal, opts.localReset)) {
    return { kind: 'reset', resetSignal: p.reset_signal as string, sulbunEvent: parseSulbunEvent(p.sulbun_event) };
  }

  const plan: Extract<AppSettingsRealtimePlan, { kind: 'patch' }> = {
    kind: 'patch',
    setSessionActive: typeof p.session_active === 'boolean',
    autoSkipWaiting: false,
    returnToWaiting: false,
    timerEndAt: p.timer_end_at ?? null,
    timerLabel: p.timer_label ?? null,
    hasFunctionsLocked: p.functions_locked != null,
    sulbunEvent: parseSulbunEvent(p.sulbun_event),
    setSulbunEvent: Object.prototype.hasOwnProperty.call(p, 'sulbun_event'),
  };

  if (typeof p.session_active === 'boolean') {
    plan.sessionActive = p.session_active;
    plan.autoSkipWaiting = shouldAutoSkipWaiting({
      sessionActive: p.session_active,
      wasSessionActive: opts.wasSessionActive,
      hasStoredUser: opts.hasStoredUser,
    });
    plan.returnToWaiting = !p.session_active;
  }

  if (plan.hasFunctionsLocked) {
    plan.functionsLockedRaw = p.functions_locked;
  }

  return plan;
}
