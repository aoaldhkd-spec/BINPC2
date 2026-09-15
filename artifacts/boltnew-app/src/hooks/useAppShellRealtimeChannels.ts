/**
 * Thin wire: mount-scoped SSE — app_settings, notifications, contact_share_events.
 * App owns setState via apply callbacks — hook only subscribes and routes.
 * Does not own /ready bootstrap/settings poll (useSessionReadyBootstrap) or wipe (admin-reset-wipe).
 */
import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { AppSettingsRealtimeRow } from '../lib/app-settings-realtime';

type PgPayload = { new: Record<string, unknown>; old: Record<string, unknown> };

export type BroadcastNotifInsertRow = {
  id: string;
  message: string;
  type: string;
  target: string;
  is_active: boolean;
};

export type BroadcastNotifUpdateRow = {
  id: string;
  is_active: boolean;
};

export type BroadcastNotifDeleteRow = {
  id: string;
};

export type ContactShareEventInsertRow = {
  id?: string;
  from_user_id: string;
  to_user_id: string;
  event_type: string;
  created_at?: string;
};

export type UseAppShellRealtimeChannelsArgs = {
  onAppSettingsUpdate: (row: AppSettingsRealtimeRow) => void;
  onBroadcastNotifInsert: (row: BroadcastNotifInsertRow) => void;
  onBroadcastNotifUpdate: (row: BroadcastNotifUpdateRow) => void;
  onBroadcastNotifDelete: (row: BroadcastNotifDeleteRow) => void;
  onContactShareEventInsert: (row: ContactShareEventInsertRow) => void;
};

export function useAppShellRealtimeChannels(args: UseAppShellRealtimeChannelsArgs): void {
  const argsRef = useRef(args);
  argsRef.current = args;

  useEffect(() => {
    const settingsChannel = supabase
      .channel('app-settings-user')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'app_settings' },
        (payload: PgPayload) => {
          argsRef.current.onAppSettingsUpdate(payload.new as AppSettingsRealtimeRow);
        },
      )
      .subscribe();

    const notifChannel = supabase
      .channel('notifications-user')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload: PgPayload) => {
          argsRef.current.onBroadcastNotifInsert(payload.new as BroadcastNotifInsertRow);
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications' },
        (payload: PgPayload) => {
          argsRef.current.onBroadcastNotifUpdate(payload.new as BroadcastNotifUpdateRow);
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'notifications' },
        (payload: PgPayload) => {
          argsRef.current.onBroadcastNotifDelete(payload.old as BroadcastNotifDeleteRow);
        },
      )
      .subscribe();

    const contactEventsChannel = supabase
      .channel('contact-share-events-user')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'contact_share_events' },
        (payload: PgPayload) => {
          argsRef.current.onContactShareEventInsert(payload.new as ContactShareEventInsertRow);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(settingsChannel);
      supabase.removeChannel(notifChannel);
      supabase.removeChannel(contactEventsChannel);
    };
  }, []);
}
