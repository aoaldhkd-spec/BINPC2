import { useState, useEffect, useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import {
  Shield, LogOut, Trash2, Users,
  LayoutGrid, X, AlertTriangle, ChevronDown,
  Heart, MessageCircle, Send, CheckCircle, BellRing, Eye, EyeOff,
  PlayCircle, StopCircle, Timer, RefreshCw, Sparkles,
  Lock, Unlock, Search, Database as DatabaseIcon, Activity,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { setLocalDbUserId, supabase as ldbSupabase } from './lib/localdb';
import {
  withAdminImageToken, setAdminToken, loadAdminSession, getAdminPassword, refreshAdminToken,
  adminApiRpc, patchAdminSettings, adminApiSelect, adminSupabase,
  ADMIN_TOKEN_KEY, ADMIN_PW_KEY, ADMIN_SESSION_KEY, ADMIN_API, MAX_ADMIN_MESSAGES,
  type Profile, type AppSettings, type SessionHistory, type Like, type Chat, type Message, type DbHealthData,
} from './admin/shared';
import { LoginScreen } from './admin/LoginScreen';
import { ConfirmDialog } from './admin/ConfirmDialog';
import { NotificationTab } from './admin/NotificationTab';
import { AdminQrTab } from './admin/AdminQrTab';
import { DbHealthTab } from './admin/DbHealthTab';
import { DashboardTab } from './admin/DashboardTab';
import { HeartsTab } from './admin/HeartsTab';
import { PopularityTab } from './admin/PopularityTab';
import { ChatsTab } from './admin/ChatsTab';
import { ProfilesTabSection } from './admin/ProfilesTabSection';
import { CredentialsTab } from './admin/CredentialsTab';

// ─── Admin Dashboard ──────────────────────────────────────────────────────────

type AdminTab = 'settings' | 'profiles' | 'hearts' | 'chats' | 'notify';
type SettingsSubTab = 'control' | 'qr' | 'admin' | 'db';
type HeartSubTab = 'hearts' | 'popularity';

function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<AdminTab>('settings');
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsSubTab>('control');
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
  // Recovery banner (floating top)
  const [recovery, setRecovery] = useState<{ label: string; emoji: string; restore: (() => Promise<void>) | null; timerId: ReturnType<typeof setTimeout> } | null>(null);
  // Persistent restore map — key → restore function (shown as buttons in DashboardTab)
  const [restoreMap, setRestoreMap] = useState<Map<string, () => Promise<void>>>(new Map());
  // Table label editing panel
  const [seenHeartsCount, setSeenHeartsCountRaw] = useState(() => parseInt(localStorage.getItem('admin_seen_hearts') ?? '0', 10));
  const [seenMessagesCount, setSeenMessagesCountRaw] = useState(() => parseInt(localStorage.getItem('admin_seen_messages') ?? '0', 10));
  const [seenProfilesCount, setSeenProfilesCountRaw] = useState(() => parseInt(localStorage.getItem('admin_seen_profiles') ?? '0', 10));

  const setSeenHeartsCount = (n: number) => { localStorage.setItem('admin_seen_hearts', String(n)); setSeenHeartsCountRaw(n); };
  const setSeenMessagesCount = (n: number) => { localStorage.setItem('admin_seen_messages', String(n)); setSeenMessagesCountRaw(n); };
  const setSeenProfilesCount = (n: number) => { localStorage.setItem('admin_seen_profiles', String(n)); setSeenProfilesCountRaw(n); };

  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  const loadAll = useCallback(async () => {
    const [{ data: s }, { data: pr }, { data: hi }, { data: li }, { data: ch }, { data: msgs }] = await Promise.all([
      adminSupabase.from('app_settings').select('*').eq('id', 1).single(),
      adminSupabase.from('profiles').select('*').order('created_at', { ascending: false }),
      adminSupabase.from('session_history').select('*').order('ended_at', { ascending: false }),
      adminApiSelect<Like>('likes', [{ column: 'created_at', ascending: false }]),
      adminApiSelect<Chat>('chats', [{ column: 'created_at', ascending: false }]),
      adminApiSelect<Message>('messages', [{ column: 'created_at', ascending: true }]),
    ]);
    if (s) setSettings(s);
    if (pr) setProfiles(pr);
    if (hi) setHistories(hi);
    if (li) setLikes(li);
    if (ch) setAllChats(ch);
    if (msgs) setAllMessages(msgs.slice(-MAX_ADMIN_MESSAGES));
  }, []);

  useEffect(() => {
    // 관리자 SSE 핵심 수정: 일반 유저 userId가 localStorage에 남아 있으면
    // localdb가 adminToken 조건(userId===null)을 만족 못해 admin SSE가 아닌 user SSE로 연결됨.
    // → setLocalDbUserId(null)로 userId를 초기화하여 adminToken이 SSE URL에 포함되도록 강제.
    setLocalDbUserId(null);
    loadAll();
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
        if (row.id == null && typeof row.session_active !== 'boolean') return;
        setSettings(prev => (prev ? { ...prev, ...row } : row) as AppSettings);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadAll]);

  // ── api-server SSE 실시간 동기화: likes · messages · chats ──────────────────
  // api-server는 이 세 테이블을 app_kv_rows에 저장하므로 Supabase Realtime이 아닌
  // localdb SSE 채널을 써야 실시간 변경을 받을 수 있다.
  useEffect(() => {
    const ch = ldbSupabase
      .channel('admin-ldb-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'likes' },
        (payload: { new: Record<string, unknown> }) => {
          setLikes(prev => [payload.new as Like, ...prev]);
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
          setAllChats(prev => [payload.new as Chat, ...prev]);
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chats' },
        (payload: { old: Record<string, unknown> }) => {
          setAllChats(prev => prev.filter(c => c.id !== (payload.old as Chat).id));
        })
      .subscribe();
    return () => { ldbSupabase.removeChannel(ch); };
  }, []);

  // ─── DB health polling (30s interval) ──────────────────────────────────────
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
    fetchDbHealth();
    // 5초 주기로 SSE 연결 수 갱신 (기존 30초는 실시간성이 너무 낮음)
    const id = setInterval(fetchDbHealth, 5_000);
    return () => clearInterval(id);
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
      // api-server 전체 초기화 (인메모리 스토어 + SSE broadcast → 모든 유저에게 즉시 반영)
      // Supabase 직접 삭제만으로는 api-server 인메모리가 그대로 남아 유저에게 반영 안 됨
      await adminApiRpc('admin_event_end_reset', {});
      // 병렬 삭제 (Supabase 네이티브 테이블 — 관리자 화면용)
      await Promise.all([
        adminSupabase.from('profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
        adminSupabase.from('likes').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
        adminSupabase.from('anonymous_reports').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
        adminSupabase.from('messages').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
        adminSupabase.from('chats').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
        adminSupabase.from('notifications').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      ]);
      const { error: sigErr } = await adminSupabase.from('app_settings').update({ reset_signal: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', 1);
      if (sigErr) throw new Error(sigErr.message);
      // api-server reset_signal 동기화
      adminApiRpc('admin_update_settings', { p_payload: { reset_signal: new Date().toISOString() } })
        .catch(() => null);
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
    await adminSupabase.from('profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    adminApiRpc('admin_force_resync_all', {}).catch(e => console.warn('[admin] resync:', e));
    showRecovery('참여자 프로필', '👤', backupProfiles.length > 0 ? async () => {
      for (const p of backupProfiles) await adminSupabase.from('profiles').upsert(p);
      await loadAll();
      setRecovery(null);
    } : null, 'profiles');
    await loadAll();
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
    // RPC 단일 경로 — 이중 쓰기(업데이트+재조회+RPC) 제거로 저장 지연 해소
    localStorage.setItem(ADMIN_PW_KEY, password);
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
    if (!settings) return;
    const newVal = !((settings as any).functions_locked ?? false);
    try {
      await patchAdminSettings({ functions_locked: newVal }, setSettings);
    } catch (e) {
      setSettings(prev => prev ? { ...prev, functions_locked: !newVal } as any : prev);
      console.error('[admin] 기능 잠금 토글 실패:', e instanceof Error ? e.message : e);
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

  const TABS: { id: AdminTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'settings', label: '설정', icon: <LayoutGrid className="w-4 h-4" /> },
    { id: 'profiles', label: '참여자', icon: <Users className="w-4 h-4" />, badge: Math.max(0, profiles.length - seenProfilesCount) || undefined },
    { id: 'hearts', label: '하트', icon: <Heart className="w-4 h-4" />, badge: Math.max(0, likes.length - seenHeartsCount) || undefined },
    { id: 'chats', label: '채팅', icon: <MessageCircle className="w-4 h-4" />, badge: Math.max(0, allMessages.length - seenMessagesCount) || undefined },
    { id: 'notify', label: '공지', icon: <BellRing className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 text-white sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-3 py-2.5 flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <Shield className="w-4 h-4 text-slate-300 flex-shrink-0" />
            <h1 className="font-bold text-sm truncate">관리자 대시보드</h1>
            <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 ${settings?.session_active ? 'bg-teal-500 text-white' : 'bg-slate-700 text-slate-300'}`}>
              {settings?.session_active ? '진행 중' : '대기 중'}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <a href="/test"
              className="flex items-center gap-1 text-xs text-violet-300 hover:text-violet-100 transition-colors px-2 py-1 rounded-lg bg-violet-700/40 hover:bg-violet-700/60 border border-violet-600/40">
              🧪 테스터
            </a>
            <button onClick={onLogout} className="flex items-center gap-1 text-xs text-slate-300 hover:text-white transition-colors">
              <LogOut className="w-3.5 h-3.5" />
              로그아웃
            </button>
          </div>
        </div>
        <div className="max-w-4xl mx-auto px-2 grid grid-cols-5 pb-0">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => handleTabChange(t.id)}
              className={`relative flex items-center justify-center gap-1 px-1 py-2 text-[11px] font-semibold border-b-2 transition-all ${
                tab === t.id ? 'border-teal-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}>
              {t.icon}
              <span className="truncate">{t.label}</span>
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
            <div className="flex border-b border-gray-200 bg-white px-4">
              {([
                { id: 'control' as SettingsSubTab, label: '대시보드' },
                { id: 'qr' as SettingsSubTab, label: 'QR코드' },
                { id: 'admin' as SettingsSubTab, label: '관리자 설정' },
                { id: 'db' as SettingsSubTab, label: 'DB헬스', errorBadge: (dbHealth?.persistErrors ?? 0) > 0 },
              ]).map(st => (
                <button key={st.id} onClick={() => setSettingsSubTab(st.id)}
                  className={`relative px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${settingsSubTab === st.id ? 'border-teal-500 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  {st.label}
                  {'errorBadge' in st && st.errorBadge && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />
                  )}
                </button>
              ))}
            </div>
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
          </div>
        )}
        {tab === 'profiles' && (
          <ProfilesTabSection profiles={profiles} settings={settings} onClear={async () => {
            await adminSupabase.from('profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            await loadAll();
          }} onDeleteProfile={handleDeleteProfile} />
        )}
        {tab === 'hearts' && (
          <div>
            <div className="flex border-b border-gray-200 bg-gray-50 px-4">
              {([
                { id: 'hearts' as HeartSubTab, label: '하트 현황' },
                { id: 'popularity' as HeartSubTab, label: '인기도 랭킹' },
              ]).map(st => (
                <button key={st.id} onClick={() => setHeartSubTab(st.id)}
                  className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${heartSubTab === st.id ? 'border-rose-500 text-rose-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  {st.label}
                </button>
              ))}
            </div>
            {heartSubTab === 'hearts' && <HeartsTab likes={likes} profileMap={profileMap} onClear={handleClearLikes} onRefresh={loadAll} />}
            {heartSubTab === 'popularity' && <PopularityTab likes={likes} profileMap={profileMap} />}
          </div>
        )}
        {tab === 'chats' && <ChatsTab chats={allChats} messages={allMessages} profileMap={profileMap} onDeleteChat={handleDeleteChat} onClearAll={handleClearAllChats} onRefresh={loadAll} />}
        {tab === 'notify' && <NotificationTab tableCount={0} settings={settings} onSetTimer={handleSetTimer} />}
      </main>

      {/* 초기화 복구 배너 (non-blocking) */}
      {recovery && (
        <div className={`fixed top-0 left-0 right-0 z-[400] flex items-center gap-3 px-4 py-3 shadow-lg transition-all ${recovery.restore ? 'bg-teal-600' : 'bg-gray-700'}`}>
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
      const session = loadAdminSession();
      let token = localStorage.getItem(ADMIN_TOKEN_KEY);
      if (!session || !token) {
        localStorage.removeItem(ADMIN_SESSION_KEY);
        localStorage.removeItem(ADMIN_PW_KEY);
        setAdminToken(null);
        if (!cancelled) { setIsLoggedIn(false); setCheckingSession(false); }
        return;
      }
      // 저장된 비밀번호로 토큰 선제 갱신 (redeploy 후 회의시작 403 방지)
      if (getAdminPassword()) await refreshAdminToken();
      token = localStorage.getItem(ADMIN_TOKEN_KEY);
      try {
        const res = await fetch(`${ADMIN_API}/op`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: 'app_settings', op: 'select', adminToken: token }),
        });
        const json = await res.json() as { data: unknown; error: unknown };
        if (!cancelled) {
          if (res.ok && json.data && !json.error) setIsLoggedIn(true);
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

