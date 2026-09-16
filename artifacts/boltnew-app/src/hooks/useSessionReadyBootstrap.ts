/**
 * Mount /ready bootstrap + backup settings poll.
 * App wires apply callbacks (incl. wipe); hook owns timers / parallel /ready+SELECT race.
 */
import { useEffect, useRef } from 'react';
import { supabase, isSseHealthy } from '../lib/supabase';
import { shouldRunSettingsReadyPoll } from '../lib/settings-ready-poll';
import {
  READY_BOOTSTRAP_FETCH_MS,
  READY_BOOTSTRAP_POLL_FETCH_MS,
  READY_BOOTSTRAP_POLL_MS,
  READY_BOOTSTRAP_SAFETY_MS,
  pickReadyBootstrapSettings,
  planReadyBootstrapApply,
  planReadyBootstrapExhausted,
  planReadyBootstrapRetry,
  planReadyBootstrapSafety,
  raceFirstNonNullSettings,
  type ReadyBootstrapApplyPlan,
} from '../lib/ready-bootstrap-settings';
import { MATCHING_LAST_RESET_KEY, MATCHING_USER_KEY, ENTRY_VERIFIED_KEY } from '../lib/constants';
import { ls } from '../lib/storage';
import { parseFunctionsLocked } from '../lib/functions-lock';

export type UseSessionReadyBootstrapArgs = {
  /** Shared wipe used by SSE settings apply as well. */
  applyResetSignal: (serverReset: string) => void;
  setAppLoading: (v: boolean) => void;
  setSessionActive: (
    v: boolean | null | ((prev: boolean | null) => boolean | null),
  ) => void;
  setSessionActiveRef: (v: boolean) => void;
  setEntryPassword: (v: string) => void;
  setEntryVerified: (v: boolean) => void;
  setTimerEndAt: (v: string | null) => void;
  setTimerLabel: (v: string | null) => void;
  setEventSchedule: (v: string | null) => void;
  setFunctionsLocked: (v: boolean) => void;
};

function applyReadyPlan(
  plan: ReadyBootstrapApplyPlan,
  args: UseSessionReadyBootstrapArgs,
): void {
  if (plan.kind === 'reset') {
    args.applyResetSignal(plan.resetSignal);
    return;
  }
  args.setSessionActiveRef(plan.sessionActive);
  args.setSessionActive(plan.sessionActive);
  args.setEntryPassword(plan.entryPassword);
  args.setEntryVerified(plan.entryVerified);
  args.setTimerEndAt(plan.timerEndAt);
  args.setTimerLabel(plan.timerLabel);
  if (plan.eventScheduleRaw !== undefined) args.setEventSchedule(plan.eventScheduleRaw);
  if (plan.hasFunctionsLocked) {
    args.setFunctionsLocked(parseFunctionsLocked(plan.functionsLockedRaw));
  }
}

export function useSessionReadyBootstrap(args: UseSessionReadyBootstrapArgs): void {
  const argsRef = useRef(args);
  argsRef.current = args;

  useEffect(() => {
    let cancelled = false;

    const safetyTimer = setTimeout(() => {
      if (cancelled) return;
      const a = argsRef.current;
      const safety = planReadyBootstrapSafety(Boolean(ls.getItem(MATCHING_USER_KEY)));
      a.setAppLoading(false);
      if (safety.coerceSessionInactiveIfUnset) {
        a.setSessionActive(prev => (prev === null ? false : prev));
      }
    }, READY_BOOTSTRAP_SAFETY_MS);

    const applySettings = (data: Record<string, unknown> | null) => {
      if (cancelled || !data) return;
      const plan = planReadyBootstrapApply(data, {
        localReset: ls.getItem(MATCHING_LAST_RESET_KEY),
        entryVerifiedStored: ls.getItem(ENTRY_VERIFIED_KEY),
      });
      applyReadyPlan(plan, argsRef.current);
    };

    async function loadSettings(attempt = 0): Promise<void> {
      const a = argsRef.current;
      // Race /ready with SELECT — first success unblocks entry gate (no serial fallback wait).
      const readySettings = fetch('/api/db/ready', {
        signal: AbortSignal.timeout(READY_BOOTSTRAP_FETCH_MS),
      })
        .then(async (resp) => {
          if (!resp.ok) return null;
          const json = await resp.json() as {
            ready?: boolean;
            settings?: Record<string, unknown>;
          };
          return pickReadyBootstrapSettings(json, 'bootstrap');
        })
        .catch(() => null);

      const selectSettings = supabase
        .from('app_settings')
        .select('session_active, timer_end_at, timer_label, event_schedule, reset_signal, entry_password, functions_locked')
        .eq('id', 1)
        .single()
        .then(({ data, error }) => {
          if (error || !data) return null;
          return data as Record<string, unknown>;
        })
        .catch(() => null);

      const settings = await raceFirstNonNullSettings([readySettings, selectSettings]);
      if (cancelled) return;
      if (settings) {
        a.setAppLoading(false);
        applySettings(settings);
        return;
      }
      const retry = planReadyBootstrapRetry(attempt);
      if (retry.kind === 'retry') {
        await new Promise(r => setTimeout(r, retry.delayMs));
        return loadSettings(retry.nextAttempt);
      }
      const exhausted = planReadyBootstrapExhausted();
      a.setAppLoading(exhausted.appLoading);
      a.setSessionActive(exhausted.sessionActive);
      a.setEntryPassword(exhausted.entryPassword);
    }

    void loadSettings();
    let lastReadyAt = 0;
    const settingsPoll = setInterval(() => {
      const now = Date.now();
      if (!shouldRunSettingsReadyPoll({
        now,
        lastReadyAt,
        sseHealthy: isSseHealthy(),
      })) return;
      lastReadyAt = now;
      fetch('/api/db/ready', { signal: AbortSignal.timeout(READY_BOOTSTRAP_POLL_FETCH_MS) })
        .then(r => (r.ok ? r.json() : null))
        .then((json: { ready?: boolean; settings?: Record<string, unknown> } | null) => {
          if (cancelled) return;
          const settings = pickReadyBootstrapSettings(json, 'poll');
          if (!settings) return;
          applySettings(settings);
        })
        .catch(() => {});
    }, READY_BOOTSTRAP_POLL_MS);

    return () => {
      cancelled = true;
      clearTimeout(safetyTimer);
      clearInterval(settingsPoll);
    };
  }, []); // mount-only; argsRef keeps apply fresh — adding deps reconnect-loops
}
