/**
 * app_settings + notifications + contact_share_events SSE apply.
 * App wires setState / applyResetSignal; this hook owns planners + toast timers.
 * Does not subscribe (useAppShellRealtimeChannels routes events here).
 */
import { useCallback, useEffect, useRef } from 'react';
import { planAppSettingsRealtimeUpdate, type AppSettingsRealtimeRow } from '../lib/app-settings-realtime';
import { planContactShareEvent, pruneSeenIdSet } from '../lib/contact-share-event';
import { shouldShowBroadcastNotif, dismissActiveNotifIfMatch } from '../lib/notification-active';
import { parseFunctionsLocked } from '../lib/functions-lock';
import { MATCHING_LAST_RESET_KEY, MATCHING_USER_KEY } from '../lib/constants';
import { ls } from '../lib/storage';
import type { ShareEventNotificationData } from '../components/ShareEventNotification';
import type { View } from '../types/app';
import { coerceEventScheduleRaw, noteEventScheduleRealtime } from '../lib/event-schedule';
import type {
  BroadcastNotifDeleteRow,
  BroadcastNotifInsertRow,
  BroadcastNotifUpdateRow,
  ContactShareEventInsertRow,
  UseAppShellRealtimeChannelsArgs,
} from './useAppShellRealtimeChannels';

type SetState<T> = React.Dispatch<React.SetStateAction<T>>;

export type UseAppShellRealtimeApplyArgs = {
  userIdRef: React.MutableRefObject<string | null>;
  sessionActiveRef: React.MutableRefObject<boolean | null>;
  applyResetSignal: (serverReset: string) => void;
  loadContactShareData: (userId: string) => void | Promise<void>;
  setSessionActive: SetState<boolean>;
  setShownWaiting: SetState<boolean>;
  setView: SetState<View>;
  setTimerEndAt: SetState<string | null>;
  setTimerLabel: SetState<string | null>;
  setEventScheduleRaw: SetState<string | null>;
  setFunctionsLocked: SetState<boolean>;
  setActiveNotif: SetState<{ id: string; message: string; type: string; target: string } | null>;
  setShareEventNotif: SetState<ShareEventNotificationData | null>;
};

export type AppShellRealtimeApplyHandlers = UseAppShellRealtimeChannelsArgs;

export function useAppShellRealtimeApply(
  args: UseAppShellRealtimeApplyArgs,
): AppShellRealtimeApplyHandlers {
  const {
    userIdRef,
    sessionActiveRef,
    applyResetSignal,
    loadContactShareData,
    setSessionActive,
    setShownWaiting,
    setView,
    setTimerEndAt,
    setTimerLabel,
    setEventScheduleRaw,
    setFunctionsLocked,
    setActiveNotif,
    setShareEventNotif,
  } = args;

  const seenContactEventIdsRef = useRef<Set<string>>(new Set());
  const shareEventNotifTimerIdsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => {
    shareEventNotifTimerIdsRef.current.forEach(clearTimeout);
    shareEventNotifTimerIdsRef.current = [];
  }, []);

  const onAppSettingsUpdate = useCallback((p: AppSettingsRealtimeRow) => {
    const plan = planAppSettingsRealtimeUpdate(p, {
      localReset: ls.getItem(MATCHING_LAST_RESET_KEY),
      wasSessionActive: sessionActiveRef.current,
      hasStoredUser: Boolean(ls.getItem(MATCHING_USER_KEY)),
    });
    if (plan.kind === 'reset') {
      applyResetSignal(plan.resetSignal);
      return;
    }
    if (plan.setSessionActive && typeof plan.sessionActive === 'boolean') {
      sessionActiveRef.current = plan.sessionActive;
      setSessionActive(plan.sessionActive);
      if (plan.autoSkipWaiting) {
        setShownWaiting(true);
        setView('entry-1');
      }
      if (plan.returnToWaiting && userIdRef.current) {
        setShownWaiting(false);
      }
    }
    setTimerEndAt(plan.timerEndAt);
    setTimerLabel(plan.timerLabel);
    if (p.event_schedule !== undefined) {
      noteEventScheduleRealtime();
      setEventScheduleRaw(coerceEventScheduleRaw(p.event_schedule));
    }
    if (plan.hasFunctionsLocked) setFunctionsLocked(parseFunctionsLocked(plan.functionsLockedRaw));
  }, [
    userIdRef, sessionActiveRef, applyResetSignal,
    setSessionActive, setShownWaiting, setView,
    setTimerEndAt, setTimerLabel, setEventScheduleRaw, setFunctionsLocked,
  ]);

  const onBroadcastNotifInsert = useCallback((n: BroadcastNotifInsertRow) => {
    if (shouldShowBroadcastNotif(n)) setActiveNotif(n);
  }, [setActiveNotif]);

  const onBroadcastNotifUpdate = useCallback((n: BroadcastNotifUpdateRow) => {
    if (!n.is_active) setActiveNotif(prev => dismissActiveNotifIfMatch(prev, n.id));
  }, [setActiveNotif]);

  const onBroadcastNotifDelete = useCallback((n: BroadcastNotifDeleteRow) => {
    setActiveNotif(prev => dismissActiveNotifIfMatch(prev, n.id));
  }, [setActiveNotif]);

  const onContactShareEventInsert = useCallback((row: ContactShareEventInsertRow) => {
    const myId = userIdRef.current;
    const plan = planContactShareEvent(row, myId, { seenIds: seenContactEventIdsRef.current });
    if (plan.ignore) return;
    seenContactEventIdsRef.current.add(plan.eventKey);
    seenContactEventIdsRef.current = pruneSeenIdSet(seenContactEventIdsRef.current);
    if (plan.loadContactShares && myId) void loadContactShareData(myId);
    if (plan.notif) {
      setShareEventNotif(plan.notif);
      shareEventNotifTimerIdsRef.current.push(setTimeout(() => setShareEventNotif(null), 5000));
    }
  }, [userIdRef, loadContactShareData, setShareEventNotif]);

  return {
    onAppSettingsUpdate,
    onBroadcastNotifInsert,
    onBroadcastNotifUpdate,
    onBroadcastNotifDelete,
    onContactShareEventInsert,
  };
}
