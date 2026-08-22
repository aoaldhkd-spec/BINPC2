import {
  lazy, Suspense, useState, useEffect, useCallback, useMemo,
} from 'react';
import {
  Shield, LogOut, Users, LayoutGrid, Heart, MessageCircle, BellRing,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { setLocalDbUserId, supabase as ldbSupabase } from './lib/localdb';
import {
  setAdminToken, loadAdminSession, getAdminPassword, refreshAdminToken,
  adminApiRpc, patchAdminSettings, adminApiSelect, adminSupabase,
  ADMIN_TOKEN_KEY, ADMIN_PW_KEY, ADMIN_SESSION_KEY, ADMIN_API, MAX_ADMIN_MESSAGES,
  MAX_ADMIN_GROUP_MESSAGES, MAX_ADMIN_GROUP_PARTICIPANTS, MAX_ADMIN_SIGNAL_SENDS,
  type Profile, type AppSettings, type SessionHistory, type Like, type Chat, type Message,
  type GroupChat, type GroupMessage, type GroupParticipant, type SignalSend, type DbHealthData,
} from './admin/shared';
import { LoginScreen } from './admin/LoginScreen';
import {
  adminSettingsSubTabFromUrl, initialAdminSettingsSubTab, syncAdminSettingsSubTabUrl,
} from './admin/admin-login';
import { NotificationTab } from './admin/NotificationTab';
import { DashboardTab } from './admin/DashboardTab';
import { ADMIN_FIXED_NICKNAME } from './lib/panel-password';

const AdminQrTab = lazy(() => import('./admin/AdminQrTab').then(m => ({ default: m.AdminQrTab })));
const DbHealthTab = lazy(() => import('./admin/DbHealthTab').then(m => ({ default: m.DbHealthTab })));
const HeartsTab = lazy(() => import('./admin/HeartsTab').then(m => ({ default: m.HeartsTab })));
const PopularityTab = lazy(() => import('./admin/PopularityTab').then(m => ({ default: m.PopularityTab })));
const ChatsTab = lazy(() => import('./admin/ChatsTab').then(m => ({ default: m.ChatsTab })));
const ProfilesTabSection = lazy(() => import('./admin/ProfilesTabSection').then(m => ({ default: m.ProfilesTabSection })));
const CredentialsTab = lazy(() => import('./admin/CredentialsTab').then(m => ({ default: m.CredentialsTab })));

// ─── Admin Dashboard ──────────────────────────────────────────────────────────

type AdminTab = 'settings' | 'profiles' | 'hearts' | 'chats' | 'notify';
type SettingsSubTab = 'control' | 'qr' | 'admin' | 'db';
type HeartSubTab = 'hearts' | 'popularity';

function AdminTabFallback() {
  return (
    <div className="min-h-48 flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-t-teal-500 animate-spin" />
    </div>
  );
}

function digitsOnly(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '');
}

/** After profile wipe, keep admin row and force nickname 범일NPC. */
async function restoreAdminProfileAfterWipe(
  backupProfiles: Profile[],
  adminPhone: string | null | undefined,
): Promise<void> {
  const adminDigits = digitsOnly(adminPhone);
  const fromBackup = backupProfiles.find((p) => {
    if (adminDigits && digitsOnly(p.phone_number) === adminDigits) return true;
    return p.nickname === ADMIN_FIXED_NICKNAME;
  });
  if (!fromBackup && !adminDigits) return;
  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    ...(fromBackup ?? {}),
    id: fromBackup?.id ?? crypto.randomUUID(),
    nickname: ADMIN_FIXED_NICKNAME,
    phone_number: fromBackup?.phone_number ?? String(adminPhone ?? ''),
    updated_at: now,
  };
  if (!row.created_at) row.created_at = now;
  await adminSupabase.from('profiles').upsert(row);
}

function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<AdminTab>('settings');
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsSubTab>(
    () => initialAdminSettingsSubTab(),
  );
  const [heartSubTab, setHeartSubTab] = useState<HeartSubTab>('hearts');
  const [dbHealth, setDbHealth] = useState<DbHealthData | null>(null);
  const [dbHealthAuthError, setDbHealthAuthError] = useState(false);
  const [dbHealthLoading, setDbHealthLoading] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [histories, setHistories] = useState<SessionHistory[]>([]);
  const [likes, setLikes] = useState<Like[]>([]);
  const [allChats, setAllChats] = useState<Chat[]>([]);
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  const [groupChats, setGroupChats] = useState<GroupChat[]>([]);
  const [groupMessages, setGroupMessages] = useState<GroupMessage[]>([]);
  const [groupParticipants, setGroupParticipants] = useState<GroupParticipant[]>([]);
  const [signalSends, setSignalSends] = useState<SignalSend[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  // Recovery banner (floating top)
  const [recovery, setRecovery] = useState<{ label: string; emoji: string; restore: (() => Promise<void>) | null; timerId: ReturnType<typeof setTimeout> } | null>(null);
  // Persistent restore map — key → restore function (shown as buttons in DashboardTab)
  const [restoreMap, setRestoreMap] = useState<Map<string, () => Promise<void>>>(new Map());
  // Table label editing panel
  const [seenHeartsCount, setSeenHeartsCountRaw] = useState(() => parseInt(localStorage.getItem('admin_seen_hearts') ?? '0', 10));
  const [seenMessagesCount, setSeenMessagesCountRaw] = useState(() => parseInt(localStorage.getItem('admin_seen_messages') ?? '0', 10));
  const [lockToggleBusy, setLockToggleBusy] = useState(false);
  const [seenProfilesCount, setSeenProfilesCountRaw] = useState(() => parseInt(localStorage.getItem('admin_seen_profiles') ?? '0', 10));

  const setSeenHeartsCount = (n: number) => { localStorage.setItem('admin_seen_hearts', String(n)); setSeenHeartsCountRaw(n); };
  const setSeenMessagesCount = (n: number) => { localStorage.setItem('admin_seen_messages', String(n)); setSeenMessagesCountRaw(n); };
  const setSeenProfilesCount = (n: number) => { localStorage.setItem('admin_seen_profiles', String(n)); setSeenProfilesCountRaw(n); };

  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const loadCore = useCallback(async () => {
    const [{ data: s }, { data: pr }, { data: hi }] = await Promise.all([
      adminSupabase.from('app_settings').select('*').eq('id', 1).single(),
      adminSupabase.from('profiles').select('*').order('created_at', { ascending: false }),
      adminSupabase.from('session_history').select('*').order('ended_at', { ascending: false }),
    ]);
    if (s) setSettings(s);
    if (pr) setProfiles(pr);
    if (hi) setHistories(hi);
  }, []);

  const loadActivity = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const [
        { data: li }, { data: ch }, { data: msgs }, { data: groups },
        { data: groupMsgs }, { data: participants }, { data: signals },
      ] = await Promise.all([
        adminApiSelect<Like>('likes', [{ column: 'created_at', ascending: false }]),
        adminApiSelect<Chat>('chats', [{ column: 'created_at', ascending: false }]),
        adminApiSelect<Message>('messages', [{ column: 'created_at', ascending: true }]),
        adminApiSelect<GroupChat>('group_chats', [{ column: 'created_at', ascending: false }], 250),
        adminApiSelect<GroupMessage>('group_messages', [{ column: 'created_at', ascending: false }], MAX_ADMIN_GROUP_MESSAGES),
        adminApiSelect<GroupParticipant>('group_participants', [{ column: 'joined_at', ascending: false }], MAX_ADMIN_GROUP_PARTICIPANTS),
        adminApiSelect<SignalSend>('signal_sends', [{ column: 'created_at', ascending: false }], MAX_ADMIN_SIGNAL_SENDS),
      ]);
      if (li) setLikes(li);
      if (ch) setAllChats(ch);
      if (msgs) setAllMessages(msgs.slice(-MAX_ADMIN_MESSAGES));
      if (groups) setGroupChats(groups);
      if (groupMsgs) setGroupMessages(groupMsgs.slice(0, MAX_ADMIN_GROUP_MESSAGES));
      if (participants) setGroupParticipants(participants.slice(0, MAX_ADMIN_GROUP_PARTICIPANTS));
      if (signals) setSignalSends(signals.slice(0, MAX_ADMIN_SIGNAL_SENDS));
      const failed = [
        groups == null && '단체방',
        groupMsgs == null && '단체 메시지',
        participants == null && '참여자 수',
        signals == null && '시그널',
      ].filter(Boolean);
      if (failed.length > 0) setHistoryError(`${failed.join(', ')} 조회 실패`);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([loadCore(), loadActivity()]);
  }, [loadActivity, loadCore]);

  useEffect(() => {
    // 관리자 SSE 핵심 수정: 일반 유저 userId가 localStorage에 남아 있으면
    // localdb가 adminToken 조건(userId===null)을 만족 못해 admin SSE가 아닌 user SSE로 연결됨.
    // → setLocalDbUserId(null)로 userId를 초기화하여 adminToken이 SSE URL에 포함되도록 강제.
    setLocalDbUserId(null);
    void loadCore();
    // 첫 화면과 입력 반응이 그려진 다음 대용량 하트·채팅 데이터를 받는다.
    const activityTimer = window.setTimeout(() => { void loadActivity(); }, 150);
    const channel = supabase
      .channel('admin-realtime')
      // ── profiles: 페이로드 기반 증분 업데이트 ───────────────────────
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profiles' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        const p = payload.new as Profile;
        setProfiles(prev => prev.some(x => x.id === p.id) ? prev : [p, ...prev]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        const p = payload.new as Profile;
        setProfiles(prev => prev.map(x => x.id === p.id ? p : x));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'profiles' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        setProfiles(prev => prev.filter(x => x.id !== (payload.old as Profile).id));
      })
      // ── app_settings ─────────────────────────────────────────────────
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        const row = payload.new;
        if (row._bulk_resync) {
          void loadAll();
          return;
        }
        if (row.id == null && typeof row.session_active !== 'boolean' && !('functions_locked' in row)) return;
        setSettings(prev => (prev ? { ...prev, ...row } : row) as AppSettings);
      })
      .subscribe();
    return () => {
      window.clearTimeout(activityTimer);
      supabase.removeChannel(channel);
    };
  }, [loadActivity, loadAll, loadCore]);

  // ── api-server SSE 실시간 동기화: 활동·채팅·시그널 ─────────────────────────
  // api-server는 이 테이블들을 app_kv_rows에 저장하므로 Supabase Realtime이 아닌
  // localdb SSE 채널을 써야 실시간 변경을 받을 수 있다.
  useEffect(() => {
    const ch = ldbSupabase
      .channel('admin-ldb-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'likes' },
        (payload: { new: Record<string, unknown> }) => {
          const like = payload.new as Like;
          setLikes(prev => {
            if (!like?.id || prev.some(existing => existing.id === like.id)) return prev;
            return [like, ...prev];
          });
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'likes' },
        (payload: { new: Record<string, unknown> }) => {
          const like = payload.new as Like;
          if (!like?.id) return;
          setLikes(prev => {
            const idx = prev.findIndex(existing => existing.id === like.id);
            if (idx === -1) return [like, ...prev];
            const next = [...prev];
            next[idx] = { ...next[idx], ...like };
            return next;
          });
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'likes' },
        (payload: { old: Record<string, unknown> }) => {
          setLikes(prev => prev.filter(l => l.id !== (payload.old as Like).id));
        })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload: { new: Record<string, unknown> }) => {
          const message = payload.new as Message;
          setAllMessages(prev => {
            if (!message?.id || prev.some(existing => existing.id === message.id)) return prev;
            return [...prev, message].slice(-MAX_ADMIN_MESSAGES);
          });
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' },
        (payload: { old: Record<string, unknown> }) => {
          setAllMessages(prev => prev.filter(m => m.id !== (payload.old as Message).id));
        })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chats' },
        (payload: { new: Record<string, unknown> }) => {
          const chat = payload.new as Chat;
          setAllChats(prev => {
            if (!chat?.id || prev.some(existing => existing.id === chat.id)) return prev;
            return [chat, ...prev];
          });
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chats' },
        (payload: { old: Record<string, unknown> }) => {
          setAllChats(prev => prev.filter(c => c.id !== (payload.old as Chat).id));
        })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_chats' },
        (payload: { new: Record<string, unknown> }) => {
          const room = payload.new as GroupChat;
          setGroupChats(prev => [room, ...prev.filter(item => item.id !== room.id)]);
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'group_chats' },
        (payload: { new: Record<string, unknown> }) => {
          const room = payload.new as GroupChat;
          setGroupChats(prev => prev.map(item => item.id === room.id ? room : item));
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'group_chats' },
        (payload: { old: Record<string, unknown> }) => {
          setGroupChats(prev => prev.filter(item => item.id !== (payload.old as GroupChat).id));
        })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_messages' },
        (payload: { new: Record<string, unknown> }) => {
          const message = payload.new as GroupMessage;
          setGroupMessages(prev =>
            [message, ...prev.filter(item => item.id !== message.id)].slice(0, MAX_ADMIN_GROUP_MESSAGES));
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'group_messages' },
        (payload: { new: Record<string, unknown> }) => {
          const message = payload.new as GroupMessage;
          setGroupMessages(prev => prev.map(item => item.id === message.id ? message : item));
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'group_messages' },
        (payload: { old: Record<string, unknown> }) => {
          setGroupMessages(prev => prev.filter(item => item.id !== (payload.old as GroupMessage).id));
        })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_participants' },
        (payload: { new: Record<string, unknown> }) => {
          const participant = payload.new as GroupParticipant;
          setGroupParticipants(prev =>
            [participant, ...prev.filter(item => item.id !== participant.id)].slice(0, MAX_ADMIN_GROUP_PARTICIPANTS));
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'group_participants' },
        (payload: { new: Record<string, unknown> }) => {
          const participant = payload.new as GroupParticipant;
          setGroupParticipants(prev => prev.map(item => item.id === participant.id ? participant : item));
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'group_participants' },
        (payload: { old: Record<string, unknown> }) => {
          setGroupParticipants(prev => prev.filter(item => item.id !== (payload.old as GroupParticipant).id));
        })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'signal_sends' },
        (payload: { new: Record<string, unknown> }) => {
          const signal = payload.new as SignalSend;
          setSignalSends(prev =>
            [signal, ...prev.filter(item => item.id !== signal.id)].slice(0, MAX_ADMIN_SIGNAL_SENDS));
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'signal_sends' },
        (payload: { new: Record<string, unknown> }) => {
          const signal = payload.new as SignalSend;
          setSignalSends(prev => prev.map(item => item.id === signal.id ? signal : item));
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'signal_sends' },
        (payload: { old: Record<string, unknown> }) => {
          setSignalSends(prev => prev.filter(item => item.id !== (payload.old as SignalSend).id));
        })
      .subscribe();
    return () => { ldbSupabase.removeChannel(ch); };
  }, []);

  // ─── DB health polling (5s interval) ──────────────────────────────────────
  const fetchDbHealth = useCallback(async () => {
    setDbHealthLoading(true);
    try {
      const adminToken = localStorage.getItem(ADMIN_TOKEN_KEY) ?? '';
      const resp = await fetch('/api/db/health', {
        headers: { 'x-admin-token': adminToken },
      });
      if (resp.status === 401) {
        setDbHealthAuthError(true);
        setDbHealth(null);
        return;
      }
      setDbHealthAuthError(false);
      if (resp.ok) {
        const data = await resp.json() as DbHealthData;
        setDbHealth(data);
      }
    } catch { /* network error — ignore */ }
    finally { setDbHealthLoading(false); }
  }, []);

  const handleClearDbErrors = useCallback(async () => {
    const adminToken = localStorage.getItem(ADMIN_TOKEN_KEY) ?? '';
    try {
      await fetch('/api/db/admin/clear-db-errors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken,
        },
        body: JSON.stringify({}),
      });
    } catch { /* ignore */ }
    await fetchDbHealth();
  }, [fetchDbHealth]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => { void fetchDbHealth(); }, 300);
    // 5초 주기로 SSE 연결 수 갱신 (기존 30초는 실시간성이 너무 낮음)
    const id = setInterval(fetchDbHealth, 5_000);
    return () => {
      window.clearTimeout(initialTimer);
      clearInterval(id);
    };
  }, [fetchDbHealth]);

  const handleToggleSession = async () => {
    if (!settings) return;
    const newVal = !(settings.session_active ?? false);
    setSettings(prev => prev ? { ...prev, session_active: newVal } : prev);
    try {
      // api-server RPC만 사용 — DB 저장·SSE 브로드캐스트 단일 경로 (이중 쓰기로 resync 시 상태 되돌림 방지)
      await adminApiRpc('admin_toggle_session', { p_active: newVal });
    } catch (e) {
      setSettings(prev => prev ? { ...prev, session_active: !newVal } : prev);
      const msg = e instanceof Error ? e.message : String(e);
      if (/만료|403|일치/.test(msg)) {
        localStorage.removeItem(ADMIN_PW_KEY);
        localStorage.removeItem(ADMIN_TOKEN_KEY);
        localStorage.removeItem(ADMIN_SESSION_KEY);
      }
      alert(`회식 시작/종료 실패: ${msg}\n\n로그아웃 후 관리자 비밀번호로 다시 로그인해 주세요.`);
    }
  };

  const handleSetTimer = async (endAt: string | null, label: string | null) => {
    try {
      await patchAdminSettings({ timer_end_at: endAt, timer_label: label }, setSettings);
    } catch (e) {
      alert(`타이머 설정 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleEventEndReset = async () => {
    const backupProfiles = [...profiles];
    const backupLikes = [...likes];
    const backupChats = [...allChats];
    const backupMsgs = [...allMessages];
    const backupHistories = [...histories];
    // 백업 데이터 수집 — 실패해도 초기화 진행
    const [notifRes] = await Promise.allSettled([
      adminSupabase.from('notifications').select('*'),
    ]);
    const safeData = (r: PromiseSettledResult<{ data: unknown[] | null }>) =>
      r.status === 'fulfilled' ? (r.value as { data: unknown[] | null }).data : null;
    try {
      await adminSupabase.from('session_history').insert({ ended_at: new Date().toISOString() });
      // api-server: 인메모리 wipe + PG persist + reset_signal SSE (유저·테스트 즉시 반영)
      await adminApiRpc('admin_event_end_reset', {});
      const hasData = backupProfiles.length > 0 || backupLikes.length > 0 || backupChats.length > 0;
      showRecovery('전체 초기화', '🗑️', hasData ? async () => {
        // 복구 upsert — 개별 실패는 로그만
        await Promise.allSettled([
          ...backupProfiles.map(p => adminSupabase.from('profiles').upsert(p)),
          ...backupLikes.map(l => adminSupabase.from('likes').upsert({ id: l.id, liker_id: l.liker_id, liked_id: l.liked_id, heart_type: l.heart_type, status: l.status, created_at: l.created_at })),
          ...backupChats.map(c => adminSupabase.from('chats').upsert(c)),
          ...backupMsgs.map(m => adminSupabase.from('messages').upsert(m)),
          ...backupHistories.map(h => adminSupabase.from('session_history').upsert({ id: h.id, ended_at: h.ended_at, created_at: (h as { created_at?: string }).created_at })),
          ...(safeData(notifRes) ?? []).map((n: unknown) => adminSupabase.from('notifications').upsert(n)),
        ]);
        await loadAll();
        setRecovery(null);
      } : null, 'eventEnd');
    } catch (e: unknown) {
      alert(`전체 초기화 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      await loadAll();
    }
  };

  const showRecovery = useCallback((label: string, emoji: string, restore: (() => Promise<void>) | null, mapKey?: string) => {
    setRecovery(prev => {
      if (prev?.timerId) clearTimeout(prev.timerId);
      const timerId = setTimeout(() => setRecovery(null), 30000);
      return { label, emoji, restore, timerId };
    });
    if (restore && mapKey) {
      setRestoreMap(prev => new Map(prev).set(mapKey, async () => {
        await restore();
        setRestoreMap(prev2 => { const m = new Map(prev2); m.delete(mapKey); return m; });
      }));
    } else if (!restore && mapKey) {
      setRestoreMap(prev => { const m = new Map(prev); m.delete(mapKey); return m; });
    }
  }, []);

  const handleClearLikes = async () => {
    const backup = [...likes];
    await adminSupabase.from('likes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    setLikes([]);
    adminApiRpc('admin_force_resync_all', {}).catch(e => console.warn('[admin] resync:', e));
    showRecovery('하트 기록', '❤️', backup.length > 0 ? async () => {
      for (const l of backup) {
        await adminSupabase.from('likes').upsert({ id: l.id, liker_id: l.liker_id, liked_id: l.liked_id, heart_type: l.heart_type, status: l.status, created_at: l.created_at });
      }
      await loadAll();
      setRecovery(null);
    } : null, 'likes');
  };

  const handleClearProfiles = async () => {
    const backupProfiles = [...profiles];
    try {
      await adminApiRpc('admin_clear_profiles', {});
      showRecovery('참여자 프로필', '👤', backupProfiles.length > 0 ? async () => {
        for (const p of backupProfiles) await adminSupabase.from('profiles').upsert(p);
        await loadAll();
        setRecovery(null);
      } : null, 'profiles');
    } catch (e: unknown) {
      alert(`참여자 초기화 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      await loadAll();
    }
  };

  const handleDeleteChat = async (chatId: string) => {
    await adminSupabase.from('messages').delete().eq('chat_id', chatId);
    await adminSupabase.from('chats').delete().eq('id', chatId);
    adminApiRpc('admin_force_resync_all', {}).catch(e => console.warn('[admin] resync:', e));
    await loadAll();
  };

  const handleClearAllChats = async () => {
    const backupChats = [...allChats];
    const backupMsgs = [...allMessages];
    await adminSupabase.from('messages').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await adminSupabase.from('chats').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    adminApiRpc('admin_force_resync_all', {}).catch(e => console.warn('[admin] resync:', e));
    showRecovery('채팅', '💬', (backupChats.length > 0 || backupMsgs.length > 0) ? async () => {
      for (const c of backupChats) await adminSupabase.from('chats').upsert(c);
      for (const m of backupMsgs) await adminSupabase.from('messages').upsert(m);
      await loadAll();
      setRecovery(null);
    } : null, 'chats');
    await loadAll();
  };

  const handleClearHistory = async () => {
    const backup = [...histories];
    await adminSupabase.from('session_history').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    setHistories([]);
    adminApiRpc('admin_force_resync_all', {}).catch(e => console.warn('[admin] resync:', e));
    showRecovery('회식 이력', '📋', backup.length > 0 ? async () => {
      for (const h of backup) {
        await adminSupabase.from('session_history').upsert({ id: h.id, ended_at: (h as Record<string, unknown>)['ended_at'] as string ?? h.ended_at });
      }
      await loadAll();
      setRecovery(null);
    } : null, 'history');
  };

  const handleSaveCredentials = async (phone: string, password: string) => {
    // 저장 성공 후에만 localStorage·토큰을 갱신 (실패 시 옛 비밀번호로 로그인 유지)
    await patchAdminSettings({ admin_phone: phone, admin_password: password }, setSettings);
  };

  const handleSaveEntryPassword = async (entryPassword: string) => {
    await patchAdminSettings({ entry_password: entryPassword || null }, setSettings);
  };

  const handleSaveResetPassword = async (resetPassword: string) => {
    await patchAdminSettings({ reset_password: resetPassword || null }, setSettings);
  };

  const handleSaveTestPassword = async (testPassword: string) => {
    await patchAdminSettings({ test_password: testPassword || null }, setSettings);
  };

  const handleToggleFunctionsLock = async () => {
    if (!settings || lockToggleBusy) return;
    const newVal = !((settings as AppSettings).functions_locked ?? false);
    setLockToggleBusy(true);
    try {
      await patchAdminSettings({ functions_locked: newVal }, setSettings);
    } catch (e) {
      setSettings(prev => prev ? { ...prev, functions_locked: !newVal } as AppSettings : prev);
      console.error('[admin] 기능 잠금 토글 실패:', e instanceof Error ? e.message : e);
      alert(`기능 잠금 변경 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLockToggleBusy(false);
    }
  };

  const handleDeleteProfile = async (profileId: string) => {
    await adminSupabase.from('profiles').delete().eq('id', profileId);
    setProfiles(prev => prev.filter(p => p.id !== profileId));
    // api-server 인메모리 동기화
    adminApiRpc('admin_force_resync_all', {}).catch(e => console.warn('[admin] resync:', e));
  };


  const handleTabChange = (t: AdminTab) => {
    if (t === 'profiles') setSeenProfilesCount(profiles.length);
    if (t === 'hearts') setSeenHeartsCount(likes.length);
    if (t === 'chats') setSeenMessagesCount(allMessages.length);
    setTab(t);
  };

  const handleSettingsSubTabChange = (st: SettingsSubTab) => {
    setSettingsSubTab(st);
    syncAdminSettingsSubTabUrl(st);
  };

  useEffect(() => {
    const onUrlChange = () => setSettingsSubTab(adminSettingsSubTabFromUrl());
    window.addEventListener('popstate', onUrlChange);
    return () => window.removeEventListener('popstate', onUrlChange);
  }, []);

  const TABS: { id: AdminTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'settings', label: '설정', icon: <LayoutGrid className="w-4 h-4" /> },
    { id: 'profiles', label: '참여자', icon: <Users className="w-4 h-4" />, badge: Math.max(0, profiles.length - seenProfilesCount) || undefined },
    { id: 'hearts', label: '하트', icon: <Heart className="w-4 h-4" />, badge: Math.max(0, likes.length - seenHeartsCount) || undefined },
    { id: 'chats', label: '채팅', icon: <MessageCircle className="w-4 h-4" />, badge: Math.max(0, allMessages.length - seenMessagesCount) || undefined },
    { id: 'notify', label: '공지', icon: <BellRing className="w-4 h-4" /> },
  ];

  return (
    <div className="app-viewport min-w-0 bg-gray-50">
      <header className="bg-slate-900 text-white sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-3 py-2.5 flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <Shield className="w-4 h-4 text-slate-300 flex-shrink-0" />
            <h1 className="font-bold text-sm break-words">관리자 대시보드</h1>
            <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 ${settings?.session_active ? 'bg-teal-500 text-white' : 'bg-slate-700 text-slate-300'}`}>
              {settings?.session_active ? '진행 중' : '대기 중'}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <a href="/test"
              className="touch-target flex items-center gap-1 text-xs text-violet-300 hover:text-violet-100 transition-colors px-2 py-1 rounded-lg bg-violet-700/40 hover:bg-violet-700/60 border border-violet-600/40">
              🧪 테스터
            </a>
            <button onClick={onLogout} className="touch-target flex items-center gap-1 text-xs text-slate-300 hover:text-white transition-colors">
              <LogOut className="w-3.5 h-3.5" />
              로그아웃
            </button>
          </div>
        </div>
        <div className="max-w-4xl mx-auto px-2 grid grid-cols-5 pb-0">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => handleTabChange(t.id)}
              className={`touch-target relative flex min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 py-2 text-[9px] min-[360px]:text-[10px] min-[390px]:text-[11px] font-semibold border-b-2 transition-all ${
                tab === t.id ? 'border-teal-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}>
              {t.icon}
              <span className="text-center leading-tight break-words">{t.label}</span>
              {t.badge !== undefined && t.badge > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 bg-rose-500 text-white text-[10px] font-bold rounded-full leading-none">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-4xl mx-auto">
        {tab === 'settings' && (
          <div>
            <div className="grid grid-cols-4 border-b border-gray-200 bg-white px-2 min-[360px]:px-4">
              {([
                { id: 'control' as SettingsSubTab, label: '대시보드' },
                { id: 'qr' as SettingsSubTab, label: 'QR코드' },
                { id: 'admin' as SettingsSubTab, label: '접속정보' },
                { id: 'db' as SettingsSubTab, label: 'DB헬스', errorBadge: (dbHealth?.persistErrors ?? 0) > 0 },
              ]).map(st => (
                <button key={st.id} onClick={() => handleSettingsSubTabChange(st.id)}
                  className={`touch-target relative min-w-0 px-0.5 min-[390px]:px-2 py-2.5 text-[9px] min-[360px]:text-[10px] min-[390px]:text-xs font-semibold border-b-2 transition-all text-center leading-tight break-words ${settingsSubTab === st.id ? 'border-teal-500 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  {st.label}
                  {'errorBadge' in st && st.errorBadge && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />
                  )}
                </button>
              ))}
            </div>
            <Suspense fallback={<AdminTabFallback />}>
              {settingsSubTab === 'control' && (
                <DashboardTab settings={settings} profiles={profiles}
                  onToggleSession={handleToggleSession} onEventEndReset={handleEventEndReset}
                  onToggleFunctionsLock={handleToggleFunctionsLock}
                  onClearLikes={handleClearLikes} onClearChats={handleClearAllChats}
                  onClearProfiles={handleClearProfiles}
                  onClearHistory={handleClearHistory} restoreMap={restoreMap} />
              )}
              {settingsSubTab === 'qr' && <AdminQrTab settings={settings} onSaveQrBase={async (url) => {
                try {
                  await patchAdminSettings({ qr_base_url: url }, setSettings);
                } catch (e) {
                  alert(`QR URL 저장 실패: ${e instanceof Error ? e.message : String(e)}`);
                }
              }} />}
              {settingsSubTab === 'admin' && <CredentialsTab settings={settings} onSave={handleSaveCredentials} onSaveEntry={handleSaveEntryPassword} onSaveReset={handleSaveResetPassword} onSaveTest={handleSaveTestPassword} />}
              {settingsSubTab === 'db' && (
                <>
                  {dbHealthAuthError && (
                    <div className="mx-4 mt-4 bg-amber-50 border border-amber-300 rounded-xl p-3 text-xs text-amber-800">
                      DB 헬스 조회 인증이 만료됐습니다. 로그아웃 후 다시 로그인해 주세요.
                    </div>
                  )}
                  <DbHealthTab health={dbHealth} loading={dbHealthLoading} onRefresh={fetchDbHealth} onClearErrors={handleClearDbErrors} />
                </>
              )}
            </Suspense>
          </div>
        )}
        {tab === 'profiles' && (
          <Suspense fallback={<AdminTabFallback />}>
            <ProfilesTabSection profiles={profiles} settings={settings} onClear={handleClearProfiles} onDeleteProfile={handleDeleteProfile} />
          </Suspense>
        )}
        {tab === 'hearts' && (
          <div>
            <div className="grid grid-cols-2 border-b border-gray-200 bg-gray-50 px-2 min-[360px]:px-4">
              {([
                { id: 'hearts' as HeartSubTab, label: '하트 현황' },
                { id: 'popularity' as HeartSubTab, label: '인기도 랭킹' },
              ]).map(st => (
                <button key={st.id} onClick={() => setHeartSubTab(st.id)}
                  className={`touch-target min-w-0 px-1 py-2.5 text-[10px] min-[360px]:text-xs font-semibold border-b-2 transition-all text-center leading-tight break-words ${heartSubTab === st.id ? 'border-rose-500 text-rose-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  {st.label}
                </button>
              ))}
            </div>
            <Suspense fallback={<AdminTabFallback />}>
              {heartSubTab === 'hearts' && <HeartsTab likes={likes} profileMap={profileMap} onClear={handleClearLikes} onRefresh={loadAll} />}
              {heartSubTab === 'popularity' && <PopularityTab likes={likes} profileMap={profileMap} />}
            </Suspense>
          </div>
        )}
        {tab === 'chats' && (
          <Suspense fallback={<AdminTabFallback />}>
            <ChatsTab
              chats={allChats} messages={allMessages}
              groupChats={groupChats} groupMessages={groupMessages}
              groupParticipants={groupParticipants} signalSends={signalSends}
              profileMap={profileMap} historyLoading={historyLoading} historyError={historyError}
              onDeleteChat={handleDeleteChat} onClearAll={handleClearAllChats} onRefresh={loadAll}
            />
          </Suspense>
        )}
        {tab === 'notify' && <NotificationTab tableCount={0} settings={settings} onSetTimer={handleSetTimer} />}
      </main>

      {/* 초기화 복구 배너 (non-blocking) */}
      {recovery && (
        <div className={`fixed top-[env(safe-area-inset-top)] left-[env(safe-area-inset-left)] right-[env(safe-area-inset-right)] z-[400] flex items-center gap-2 min-[360px]:gap-3 px-3 min-[360px]:px-4 py-3 shadow-lg transition-all ${recovery.restore ? 'bg-teal-600' : 'bg-gray-700'}`}>
          <span className="text-2xl flex-shrink-0">{recovery.emoji}</span>
          <div className="flex-1 min-w-0">
            <p className="text-white font-black text-sm leading-tight">{recovery.label} 초기화 완료</p>
            {recovery.restore
              ? <p className="text-teal-200 text-[10px] font-semibold leading-none mt-0.5">30초 안에 복구 가능</p>
              : <p className="text-gray-400 text-[10px] font-semibold leading-none mt-0.5">데이터 없음 — 복구 불가</p>
            }
          </div>
          {recovery.restore && (
            <button
              onClick={() => recovery.restore!()}
              className="flex-shrink-0 px-4 py-2 bg-white text-teal-700 font-black text-sm rounded-xl active:scale-95 transition-all shadow">
              ↩ 복구
            </button>
          )}
          <button
            onClick={() => { clearTimeout(recovery.timerId); setRecovery(null); }}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-xl bg-white/20 hover:bg-white/30 text-white font-black text-base transition-all">
            ×
          </button>
        </div>
      )}

    </div>
  );
}

// ─── AdminApp Root ────────────────────────────────────────────────────────────

export default function AdminApp() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function verifySession() {
      let session = loadAdminSession();
      let token = localStorage.getItem(ADMIN_TOKEN_KEY);
      if ((!session || !token) && import.meta.env.DEV) {
        try {
          const boot = await fetch('/__dev/admin-session', { cache: 'no-store' });
          if (boot.ok) {
            const data = await boot.json() as { token?: string; password?: string; phone?: string };
            if (data.token && data.password) {
              localStorage.setItem(ADMIN_TOKEN_KEY, data.token);
              localStorage.setItem(ADMIN_PW_KEY, data.password);
              localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({
                phone: data.phone || '010-3878-6740',
                authedAt: Date.now(),
              }));
              token = data.token;
              session = loadAdminSession();
            }
          }
        } catch { /* local operator bootstrap is optional */ }
      }
      if (!session || !token) {
        localStorage.removeItem(ADMIN_SESSION_KEY);
        localStorage.removeItem(ADMIN_PW_KEY);
        setAdminToken(null);
        if (!cancelled) { setIsLoggedIn(false); setCheckingSession(false); }
        return;
      }
      try {
        const tokenWorks = async (candidate: string | null) => {
          if (!candidate) return false;
          const res = await fetch(`${ADMIN_API}/op`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table: 'app_settings', op: 'select', adminToken: candidate }),
          });
          const json = await res.json() as { data: unknown; error: unknown };
          return res.ok && !!json.data && !json.error;
        };

        // 평소에는 저장된 토큰 한 번만 확인한다. 배포로 토큰이 만료된 경우에만
        // 비밀번호 기반 갱신 후 재검증해 매 진입의 불필요한 왕복을 없앤다.
        let valid = await tokenWorks(token);
        if (!valid && getAdminPassword()) {
          await refreshAdminToken();
          token = localStorage.getItem(ADMIN_TOKEN_KEY);
          valid = await tokenWorks(token);
        }
        if (!cancelled) {
          if (valid) setIsLoggedIn(true);
          else {
            localStorage.removeItem(ADMIN_SESSION_KEY);
            localStorage.removeItem(ADMIN_PW_KEY);
            setAdminToken(null);
            setIsLoggedIn(false);
          }
          setCheckingSession(false);
        }
      } catch {
        if (!cancelled) {
          localStorage.removeItem(ADMIN_SESSION_KEY);
          localStorage.removeItem(ADMIN_PW_KEY);
          setAdminToken(null);
          setIsLoggedIn(false);
          setCheckingSession(false);
        }
      }
    }
    void verifySession();
    return () => { cancelled = true; };
  }, []);

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-white/20 border-t-white animate-spin" />
      </div>
    );
  }

  return isLoggedIn ? (
    <AdminDashboard onLogout={async () => {
      const token = localStorage.getItem(ADMIN_TOKEN_KEY);
      if (token) { try { await supabase.rpc('admin_invalidate_session', { p_token: token }); } catch {} }
      localStorage.removeItem(ADMIN_SESSION_KEY);
      localStorage.removeItem(ADMIN_PW_KEY);
      setAdminToken(null);
      setIsLoggedIn(false);
      window.location.href = '/';
    }} />
  ) : (
    <LoginScreen onLogin={() => setIsLoggedIn(true)} />
  );
}

