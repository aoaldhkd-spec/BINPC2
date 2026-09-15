/**
 * Thin wire: subscribe profiles + user-bundle (likes / contact_shares) SSE channels.
 * App owns setState via apply callbacks — hook only subscribes and routes.
 * Does not own settings/reset/boot or a mega apply blob.
 */
import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { HeartType } from '../lib/constants';
import type { ContactShare, Profile } from '../types/app';

type PgPayload = { new: Record<string, unknown>; old: Record<string, unknown> };

export type SentLikeInsertRow = {
  id?: string;
  liked_id: string;
  heart_type: HeartType;
  created_at?: string;
};

export type SentLikeUpdateRow = {
  id?: string;
  liked_id: string;
  status: string;
  created_at?: string;
};

export type ReceivedLikeInsertRow = {
  id?: string;
  liker_id?: string;
  liked_id?: string;
  heart_type: HeartType;
  created_at?: string;
};

export type ReceivedLikeUpdateRow = {
  id?: string;
  liker_id?: string;
  status?: string;
  heart_type?: HeartType | null;
  created_at?: string;
};

export type UseUserRealtimeChannelArgs = {
  currentUserId: string | null;
  onProfileInsert: (incoming: Profile) => void;
  onProfileUpdate: (incoming: Profile) => void;
  onProfileDelete: (deletedId: string) => void;
  onSentLikeInsert: (row: SentLikeInsertRow) => void;
  onSentLikeUpdate: (row: SentLikeUpdateRow) => void;
  onReceivedLikeInsert: (row: ReceivedLikeInsertRow) => void | Promise<void>;
  onReceivedLikeUpdate: (row: ReceivedLikeUpdateRow) => void;
  onContactShareInsert: (share: ContactShare) => void | Promise<void>;
  onContactShareUpdate: (share: ContactShare) => void;
};

export function useUserRealtimeChannel(args: UseUserRealtimeChannelArgs): void {
  const argsRef = useRef(args);
  argsRef.current = args;

  useEffect(() => {
    if (!args.currentUserId) return;
    const uid = args.currentUserId;

    const profileChannel = supabase
      .channel('realtime:profiles')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profiles' },
        (payload: PgPayload) => {
          argsRef.current.onProfileInsert(payload.new as Profile);
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload: PgPayload) => {
          argsRef.current.onProfileUpdate(payload.new as Profile);
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'profiles' },
        (payload: PgPayload) => {
          const id = (payload.old as Profile).id;
          if (id) argsRef.current.onProfileDelete(id);
        })
      .subscribe();

    // 하트/연락처 — 단일 채널로 묶어 SSE 리스너 수 감소 (EventSource는 공유)
    const userRealtimeChannel = supabase
      .channel(`realtime:user-bundle:${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'likes', filter: `liker_id=eq.${uid}` },
        (payload: PgPayload) => {
          argsRef.current.onSentLikeInsert(payload.new as SentLikeInsertRow);
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'likes', filter: `liker_id=eq.${uid}` },
        (payload: PgPayload) => {
          argsRef.current.onSentLikeUpdate(payload.new as SentLikeUpdateRow);
        })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'likes', filter: `liked_id=eq.${uid}` },
        (payload: PgPayload) => {
          void argsRef.current.onReceivedLikeInsert(payload.new as ReceivedLikeInsertRow);
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'likes', filter: `liked_id=eq.${uid}` },
        (payload: PgPayload) => {
          argsRef.current.onReceivedLikeUpdate(payload.new as ReceivedLikeUpdateRow);
        })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'contact_shares', filter: `liker_id=eq.${uid}` },
        (payload: PgPayload) => {
          void argsRef.current.onContactShareInsert(payload.new as ContactShare);
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'contact_shares', filter: `liker_id=eq.${uid}` },
        (payload: PgPayload) => {
          argsRef.current.onContactShareUpdate(payload.new as ContactShare);
        })
      .subscribe();

    return () => {
      supabase.removeChannel(profileChannel);
      supabase.removeChannel(userRealtimeChannel);
    };
  }, [args.currentUserId]);
}
