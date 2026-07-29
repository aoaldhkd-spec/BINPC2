import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import {
  Heart, MessageCircle, Users, ChevronRight, ChevronDown,
  LayoutGrid, CheckCircle, X, XCircle,
} from 'lucide-react';
import { supabase, setLocalDbUserId } from './lib/supabase';
import SeatingMap from './components/SeatingMap';
import ProfileAvatar from './components/ProfileAvatar';
import { genAvatar } from './lib/profile';
const FortuneTab = lazy(() => import('./components/FortuneTab'));
import { HEART_TYPES, HeartType } from './lib/constants';
// ─── 분리된 타입·유틸·컴포넌트 imports ────────────────────────────────────────
import type {
  Profile, Message, Seat, ContactShare, Suggestion, BalanceGame, BalanceVote,
  AnonymousReport, Chat, View, MainTab, TableMiniGameSession, GameState,
} from './types/app';
export type { GameState } from './types/app';
import { koreanMatch, MBTI_COLORS, domSubLabel } from './lib/utils';
import { heartMeta } from './lib/constants';
import ChatScreen from './components/ChatScreen';
import ProfileDetail from './components/ProfileDetail';
import BrowserGuidePopup from './components/BrowserGuidePopup';
import ReconnectOverlay from './components/ReconnectOverlay';
import DrumRoller from './components/DrumRoller';
import ProfileScoreBar from './components/ProfileScoreBar';
import { SeatRegisterDialog } from './components/SeatRegisterDialog';
import { DiceDisplay, RouletteDisplay, LadderDisplay } from './components/games/GameDisplays';
import { GameResultModal } from './components/games/GameResultModal';
import { GameActiveBanner } from './components/games/GameActiveBanner';
import { GameAnnouncementModal } from './components/games/GameAnnouncementModal';
import { QaGameOverlay } from './components/games/QaGameOverlay';
import { TableMiniGameModal } from './components/games/TableMiniGameModal';
import { NotifModal } from './components/NotifModal';
import { WelcomeNoticeModal } from './components/WelcomeNoticeModal';
import { LikeConfirmDialog } from './components/LikeConfirmDialog';
import { ContactShareModal } from './components/ContactShareModal';
import { ContactViewModal } from './components/ContactViewModal';
import { TimerBanner } from './components/TimerBanner';
import { RefreshBtn } from './components/RefreshBtn';
import { WaitingOverlay } from './components/WaitingOverlay';
import { NicknameSetupScreen } from './components/NicknameSetupScreen';
import { EntryGateScreen } from './components/EntryGateScreen';
import { TutorialModal } from './components/TutorialModal';
import { ResetButton } from './components/ResetButton';
import { ProfileQrModal } from './components/ProfileQrModal';
import {
  MATCHING_USER_KEY, MATCHING_DRAFT_KEY, MATCHING_LAST_RESET_KEY,
  MATCHING_GUIDE_SHOWN_KEY, MATCHING_PROFILES_CACHE_KEY, MATCHING_SEATS_CACHE_KEY,
  ENTRY_VERIFIED_KEY,
} from './lib/constants';
import { ls } from './lib/storage';
import { MainScreen } from './components/MainScreen';
import { useSeating } from './hooks/useSeating';
import { useGames } from './hooks/useGames';
import { useHearts } from './hooks/useHearts';
import { useChat } from './hooks/useChat';

// ─── App ──────────────────────────────────────────────────────────────────────


function playCuteSound() {
  if (document.hidden) return; // 백그라운드(화면 꺼짐)에서는 JS 오디오 불가 → 건너뜀
  try {
    type WinWithWebkit = Window & { webkitAudioContext?: typeof AudioContext };
    const Ctx = window.AudioContext ?? (window as WinWithWebkit).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    // iOS/Safari의 autoplay 정책으로 suspended 상태일 수 있으므로 resume
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const t = ctx.currentTime;

    // 'BI-DING' — C6 → E6 두 음 상행 아르페지오
    [1047, 1319].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const s = t + i * 0.13;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, s);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.018, s + 0.06); // 살짝 피치 업 → 발랄함
      gain.gain.setValueAtTime(0, s);
      gain.gain.linearRampToValueAtTime(0.28, s + 0.018); // 빠른 어택
      gain.gain.exponentialRampToValueAtTime(0.001, s + 0.38); // 부드러운 릴리즈
      osc.start(s);
      osc.stop(s + 0.38);
    });

    // 스파클 ✨ — E7 고음 잔향
    const sp = ctx.createOscillator();
    const spGain = ctx.createGain();
    sp.connect(spGain);
    spGain.connect(ctx.destination);
    sp.type = 'sine';
    sp.frequency.setValueAtTime(2637, t + 0.27);
    spGain.gain.setValueAtTime(0, t + 0.27);
    spGain.gain.linearRampToValueAtTime(0.1, t + 0.29);
    spGain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    sp.start(t + 0.27);
    sp.stop(t + 0.55);

    setTimeout(() => ctx.close(), 700);
  } catch { /* 소리 재생 실패는 무시 */ }
}


// ── Web Push helpers ───────────────────────────────────────────────────────────
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

async function registerPushSub(userId: string): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
  try {
    // 알림 권한 확인 / 요청
    if (Notification.permission === 'denied') return;
    if (Notification.permission === 'default') {
      const perm = await Notification.requestPermission().catch(() => 'denied' as NotificationPermission);
      if (perm !== 'granted') return;
    }

    const swUrl = (import.meta.env.BASE_URL as string).replace(/\/$/, '') + '/sw.js';
    const reg = await navigator.serviceWorker.register(swUrl, { scope: import.meta.env.BASE_URL as string });
    await navigator.serviceWorker.ready;

    // VAPID 키 취득 (타임아웃 10초)
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    const keyRes = await fetch('/api/db/push/vapid-key', { signal: ctrl.signal }).catch(() => null);
    clearTimeout(timer);
    if (!keyRes?.ok) return;

    const { key } = await keyRes.json() as { key?: string };
    if (!key) return;

    let sub = await reg.pushManager.getSubscription().catch(() => null);
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as unknown as ArrayBuffer,
      }).catch(() => null);
    }
    if (!sub) return;

    await fetch('/api/db/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, subscription: sub.toJSON() }),
    }).catch(() => null);
  } catch (e) {
    console.warn('[push] 등록 건너뜀:', (e as Error)?.message ?? e);
  }
}

function App() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(() => {
    return ls.getItem(MATCHING_USER_KEY) ?? null;
  });
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = currentUserId;

  // SSE 연결을 현재 userId로 식별 → 서버가 당사자 이벤트만 라우팅
  useEffect(() => { setLocalDbUserId(currentUserId); }, [currentUserId]);

  const handleChannelStatus = useCallback((status: string) => {
    if (status === 'SUBSCRIBED') {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
      setConnStatus('ok');
    } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      if (reconnectTimerRef.current) return;
      reconnectTimerRef.current = setTimeout(() => {
        setConnStatus('error');
        reconnectTimerRef.current = null;
      }, 15000);
      setConnStatus('reconnecting');
    }
  }, []);
  const [appLoading, setAppLoading] = useState(true);
  const [connStatus, setConnStatus] = useState<'ok' | 'reconnecting' | 'error'>('ok');
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showGuide, setShowGuide] = useState(() => !ls.getItem(MATCHING_GUIDE_SHOWN_KEY));
  const [sessionActive, setSessionActive] = useState<boolean | null>(null);
  // Existing users skip the waiting overlay entirely and go straight to main.
  // New users go straight to nickname setup — no waiting overlay.
  const [shownWaiting, setShownWaiting] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>(() => {
    try {
      const cached = ls.getItem(MATCHING_PROFILES_CACHE_KEY);
      return cached ? (JSON.parse(cached) as Profile[]) : [];
    } catch { return []; }
  });
  const [shareEventNotif, setShareEventNotif] = useState<{ type: 'accepted' | 'rejected'; fromUserId: string } | null>(null);
  const seenContactEventIdsRef = useRef<Set<string>>(new Set());
  const [contactViewShare, setContactViewShare] = useState<{ share: ContactShare; profile: Profile } | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [view, setView] = useState<View>(() => {
    if (ls.getItem(MATCHING_USER_KEY)) return 'main';
    return 'entry-1';
  });
  const [mainTab, setMainTab] = useState<MainTab>('profiles');
  const [showTutorialModal, setShowTutorialModal] = useState(false);
  const [tutorialPage, setTutorialPage] = useState(0);
  const [showProfileQr, setShowProfileQr] = useState(false);
  const isNewRegistration = useRef(false);
  // 항상 최신 profiles를 가리키는 ref (stale 클로저 방지)
  const profilesRef = useRef<Profile[]>([]);
  // ?share=<profileId> URL 파라미터 — 프로필 QR 스캔 시 연락처 자동 수신
  const [pendingShareId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('share'));

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentGame, setCurrentGame] = useState<GameState | null>(null);
  const [gameModalVisible, setGameModalVisible] = useState(false);
  const [activeQaGame, setActiveQaGame] = useState<{ id: string; question: string; correct_answer: string | null } | null>(null);
  const [qaOverlayVisible, setQaOverlayVisible] = useState(false);
  const [qaSubmittedIds, setQaSubmittedIds] = useState<Set<string>>(new Set());
  const [activeNotif, setActiveNotif] = useState<{ id: string; message: string; type: string; target: string } | null>(null);
  const [showWelcomeNotice, setShowWelcomeNotice] = useState(false);
  const [timerEndAt, setTimerEndAt] = useState<string | null>(null);
  const [timerLabel, setTimerLabel] = useState<string | null>(null);
  const [rejectionNotif, setRejectionNotif] = useState<string | null>(null); // nickname of person who rejected
  const [bottomNotif, setBottomNotif] = useState<{ type: 'heart' | 'chat' | 'message' | 'contact'; nickname: string; heartType?: HeartType } | null>(null);
  const [seatingLocked, setSeatingLocked] = useState(false);
  const [activeTables, setActiveTables] = useState<number[] | null>(null);
  const [tableLabels, setTableLabels] = useState<Record<string, string> | null>(null);
  const [resetPassword, setResetPassword] = useState<string | null>(null);
  const [entryPassword, setEntryPassword] = useState<string | null>(null); // null = 아직 로드 전
  const [entryVerified, setEntryVerified] = useState(false);
  const [darkMode, setDarkMode] = useState(() => ls.getItem('dark_mode') === '1');

  // Track user's current table number for notification targeting (ref for stable access in channel callbacks)
  const userTableNumRef = useRef<number | null>(null);

  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  // 렌더마다 최신 profiles를 ref에 동기화 (stale 클로저 방지)
  profilesRef.current = profiles;

  // ── 커스텀 훅 호출 ────────────────────────────────────────────────────────────
  const {
    seats, setSeats, seatDialog, setSeatDialog,
    loadSeats, handleRegisterSeat,
  } = useSeating(currentUserId);

  const {
    balanceGames, setBalanceGames, voteCounts, setVoteCounts, myVotes, setMyVotes,
    gameEndResult, setGameEndResult, incomingTableGame, setIncomingTableGame,
    tableMinigameChRef, loadBalanceGames, loadMyVotes, voteOnGame, voteOnImageGame,
    createTableGame, endBalanceGame, broadcastTableGame,
  } = useGames(currentUserId, seats, profiles);

  const {
    chatId, setChatId, chatIdRef, selfInitiatedPairRef, messages, setMessages, chatList, setChatList, chatListRef,
    unreadChatCounts, setUnreadChatCounts, newMsgCount, setNewMsgCount,
    loadChatList, loadMessages, openChat, sendMessage, sendImage,
    deleteChat, deleteAllChats, deleteMessage,
  } = useChat({ currentUserId, profilesRef, setSelectedProfile, setView, setBottomNotif });

  const {
    likedIds, setLikedIds, sentHeartTypes, setSentHeartTypes, sentHeartsPerPerson, setSentHeartsPerPerson,
    receivedHeartTypes, setReceivedHeartTypes, likeStatuses, setLikeStatuses,
    receivedLikers, setReceivedLikers, contactSharedWithIds, setContactSharedWithIds,
    acknowledgedComplimentIds, setAcknowledgedComplimentIds, receivedContactShares, setReceivedContactShares,
    likeConfirmTarget, setLikeConfirmTarget, contactShareTarget, setContactShareTarget,
    loadLikes, loadReceivedLikes, loadContactShareData, heartCountByType, likedByTypeRecord,
    handleLike, executeLike, handleHeartResponse, handleContactShare, handleContactShareReject,
  } = useHearts(currentUserId, profiles, profileMap, openChat);

  const currentUserSeat = seats.find((s) => s.profile_id === currentUserId) ?? null;
  // Keep ref updated so notification channel can check user's table without stale closure
  userTableNumRef.current = currentUserSeat?.table_number ?? null;

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled) setAppLoading(false);
    }, 6000);
    supabase.from('app_settings').select('session_active, game_state, timer_end_at, timer_label, seating_locked, active_tables, reset_signal, table_labels, reset_password, entry_password').eq('id', 1).single().then(({ data }: { data: any }) => {
      if (cancelled) return;
      clearTimeout(timeout);
      setAppLoading(false);
      const localReset = ls.getItem(MATCHING_LAST_RESET_KEY);
      const serverReset = data?.reset_signal ?? null;
      if (serverReset && serverReset !== localReset) {
        ls.setItem(MATCHING_LAST_RESET_KEY, serverReset);
        ls.removeItem(MATCHING_USER_KEY);
        ls.removeItem(MATCHING_DRAFT_KEY);
        setCurrentUserId(null);
        setShownWaiting(false);
        setProfiles([]);
        setSeats([]);
        setLikedIds(new Set());
        setSentHeartTypes(new Map());
        setAcknowledgedComplimentIds(new Set());
        setReceivedLikers([]);
        setSuggestions([]);
        setView('entry-1');
        return;
      }
      setSessionActive(data?.session_active ?? false);
      setTimerEndAt(data?.timer_end_at ?? null);
      setTimerLabel(data?.timer_label ?? null);
      if (data?.seating_locked != null) setSeatingLocked(data.seating_locked);
      setActiveTables((data?.active_tables as number[] | null) ?? null);
      setTableLabels((data?.table_labels as Record<string, string> | null) ?? null);
      setResetPassword((data as { reset_password?: string | null })?.reset_password ?? null);
      const ep = (data as { entry_password?: string | null })?.entry_password ?? '';
      setEntryPassword(ep);
      setEntryVerified(!ep || ls.getItem(ENTRY_VERIFIED_KEY) === ep);
      const gs = data?.game_state as GameState | null;
      if (gs?.active) { setCurrentGame(gs); setGameModalVisible(true); }
    });
    const settingsChannel = supabase
      .channel('app-settings-user')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'app_settings' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        const p = payload.new as { session_active: boolean; game_state: GameState | null; timer_end_at: string | null; timer_label: string | null; seating_locked: boolean | null; active_tables: number[] | null; reset_signal: string | null; table_labels: Record<string, string> | null; reset_password: string | null; entry_password: string | null };
        // Admin triggered a full reset: wipe local user identity and force back to nickname setup
        if (p.reset_signal && p.reset_signal !== ls.getItem(MATCHING_LAST_RESET_KEY)) {
          ls.setItem(MATCHING_LAST_RESET_KEY, p.reset_signal);
          ls.removeItem(MATCHING_USER_KEY);
          ls.removeItem(MATCHING_DRAFT_KEY);
          setCurrentUserId(null);
          setShownWaiting(false);
          setProfiles([]);
          setSeats([]);
          setLikedIds(new Set());
          setReceivedLikers([]);
          setChatList([]);
          setSuggestions([]);
          setView('entry-1');
          return;
        }
        setSessionActive(p.session_active);
        // 관리자 '회식 시작' → session_active=true 감지 시
        // 대기 중인 신규 접속자 자동으로 닉네임 설정 화면으로 이동
        if (p.session_active && !ls.getItem(MATCHING_USER_KEY)) {
          setShownWaiting(true);
          setView('entry-1');
        }
        setTimerEndAt(p.timer_end_at ?? null);
        setTimerLabel(p.timer_label ?? null);
        if (p.seating_locked != null) setSeatingLocked(p.seating_locked);
        setActiveTables(p.active_tables ?? null);
        if (p.table_labels !== undefined) setTableLabels(p.table_labels);
        if (p.reset_password !== undefined) setResetPassword(p.reset_password ?? null);
        if (p.entry_password !== undefined) {
          const ep = p.entry_password ?? '';
          setEntryPassword(ep);
          setEntryVerified(!ep || ls.getItem(ENTRY_VERIFIED_KEY) === ep);
        }
        const gs = p.game_state as GameState | null;
        if (gs?.active) {
          // Only show if game targets all or the user's own table
          const userTableNum = seats.find(s => s.profile_id === currentUserId)?.table_number ?? null;
          const isForMe = !gs.table_number || gs.table_number === userTableNum;
          if (isForMe) {
            setCurrentGame(gs);
            setGameModalVisible(true);
          } else {
            setCurrentGame(null);
            setGameModalVisible(false);
          }
        } else {
          setCurrentGame(null);
          setGameModalVisible(false);
        }
      })
      .subscribe();
    const notifChannel = supabase
      .channel('notifications-user')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        const n = payload.new as { id: string; message: string; type: string; target: string; is_active: boolean };
        if (!n.is_active) return;
        // Only show if target is 'all' or matches user's table
        const myTable = userTableNumRef.current;
        const isForMe = n.target === 'all' || n.target === `table_${myTable}`;
        if (isForMe) setActiveNotif(n);
      })
      .subscribe();

    // Q&A game subscription (root-level so overlay shows on any tab)
    const loadActiveQa = async () => {
      const { data } = await supabase.from('qa_games').select('id, question, correct_answer').eq('status', 'active').neq('scope', 'chosung').order('created_at', { ascending: false }).limit(1);
      const game = data?.[0] ?? null;
      if (game) {
        setActiveQaGame(game);
        setQaOverlayVisible(true);
      } else {
        setActiveQaGame(null);
        setQaOverlayVisible(false);
      }
    };
    loadActiveQa();
    const qaChannel = supabase.channel('qa-user-root')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'qa_games' }, loadActiveQa)
      .subscribe();

    // Image game table subscription: show modal when a new image game is inserted for this user's table
    const imageGameChannel = supabase.channel('image-games-user')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'image_games' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        const row = payload.new as { id: string; question: string; penalty: string; scope: string; table_number: number | null; status: string };
        if (row.status === 'ended') return;
        const myTable = userTableNumRef.current;
        const isForMe = row.scope === 'global' || row.table_number == null || row.table_number === myTable;
        if (!isForMe) return;
        const gs: GameState = {
          active: true,
          type: 'image',
          title: row.question,
          description: '',
          rules: '',
          penalty: row.penalty ?? '',
          game_id: row.id,
          started_at: new Date().toISOString(),
          table_number: row.table_number ?? undefined,
        };
        setCurrentGame(gs);
        setGameModalVisible(true);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'image_games' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        const row = payload.new as { id: string; status: string };
        if (row.status === 'ended') {
          setCurrentGame(prev => {
            if (prev?.type === 'image' && prev.game_id === row.id) {
              setGameModalVisible(false);
              return null;
            }
            return prev;
          });
        }
      })
      .subscribe();

    // Contact share events subscription (acceptance/rejection notifications)
    const contactEventsChannel = supabase.channel('contact-share-events-user')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'contact_share_events' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        const row = payload.new as { id?: string; from_user_id: string; to_user_id: string; event_type: string; created_at?: string };
        const myId = userIdRef.current;
        if (!myId || row.to_user_id !== myId) return;
        // 재연결 시 오래된 이벤트 재전송 방지: 30초 초과 이벤트 무시
        if (row.created_at && Date.now() - new Date(row.created_at).getTime() > 8000) return;
        // 동일 이벤트 중복 처리 방지
        const eventKey = row.id ?? `${row.from_user_id}:${row.event_type}:${row.created_at}`;
        if (seenContactEventIdsRef.current.has(eventKey)) return;
        seenContactEventIdsRef.current.add(eventKey);
        if (row.event_type === 'accepted') {
          setShareEventNotif({ type: 'accepted', fromUserId: row.from_user_id });
          setTimeout(() => setShareEventNotif(null), 5000);
          loadContactShareData(myId);
        } else if (row.event_type === 'rejected') {
          setShareEventNotif({ type: 'rejected', fromUserId: row.from_user_id });
          setTimeout(() => setShareEventNotif(null), 5000);
        }
      })
      .subscribe();

    return () => {
      cancelled = true;
      clearTimeout(timeout); // 언마운트 시 타임아웃 정리 (메모리 누수 방지)
      supabase.removeChannel(settingsChannel);
      supabase.removeChannel(notifChannel);
      supabase.removeChannel(qaChannel);
      supabase.removeChannel(imageGameChannel);
      supabase.removeChannel(contactEventsChannel);
    };
  }, []);


  const loadProfiles = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (data) {
      setProfiles(data);
      try { ls.setItem(MATCHING_PROFILES_CACHE_KEY, JSON.stringify(data)); } catch { /* quota */ }
    }
    return data ?? [];
  }, []);





  const loadSuggestions = useCallback(async (userId: string) => {
    const { data } = await supabase.from('suggestions').select('*').eq('profile_id', userId).order('created_at', { ascending: false });
    if (data) setSuggestions(data as Suggestion[]);
  }, []);







  const submitAnonymousReport = async (content: string, tableNumber: number | null) => {
    if (!content.trim()) return;
    await supabase.from('anonymous_reports').insert({ content: content.trim(), table_number: tableNumber });
  };


  useEffect(() => {
    if (!currentUserId) return;
    loadProfiles().then((allProfiles) => {
      // 프로필 목록이 비어있으면 서버 기동 중이거나 네트워크 오류 — 세션 유지
      // 실제 프로필 삭제는 reset_signal SSE로 처리되므로 여기서 aggressive하게 지우지 않음
      if (allProfiles.length === 0) return;
      // 신규 가입 직후: DB 반영 지연으로 인한 false-positive 세션 삭제 방지
      // isNewRegistration이 true이면 방금 insert한 프로필이므로 삭제하지 않고 바로 main으로 이동
      if (isNewRegistration.current) {
        isNewRegistration.current = false;
        setView('main');
        setMainTab('status');
        return;
      }
      // If the profile no longer exists (e.g. admin reset the session), clear stale state
      if (!allProfiles.some((p: { id: string }) => p.id === currentUserId)) {
        ls.removeItem(MATCHING_USER_KEY);
        ls.removeItem(MATCHING_DRAFT_KEY);
        setCurrentUserId(null);
        setShownWaiting(false);
        setView('entry-1');
        return;
      }
      setView('main');
    });
    loadSeats();
    loadLikes(currentUserId);
    loadReceivedLikes(currentUserId);
    setTimeout(() => {
      loadContactShareData(currentUserId);
      loadChatList(currentUserId);
    }, 300);
    setTimeout(() => {
      loadSuggestions(currentUserId);
      loadBalanceGames();
      loadMyVotes(currentUserId);
    }, 600);

    // ── ?share=<profileId> 처리: 연락처 QR 스캔 → 채팅 자동 오픈 + 연락처 수신 ──
    if (pendingShareId && pendingShareId !== currentUserId) {
      window.history.replaceState({}, '', window.location.pathname);
      (async () => {
        const { data: shareProfile } = await supabase.from('profiles').select('*').eq('id', pendingShareId).maybeSingle();
        if (!shareProfile) return;
        const uid1 = currentUserId < shareProfile.id ? currentUserId : shareProfile.id;
        const uid2 = currentUserId < shareProfile.id ? shareProfile.id : currentUserId;
        const { data: existingChat } = await supabase.from('chats').select('*').eq('user1_id', uid1).eq('user2_id', uid2).maybeSingle();
        let cid = existingChat?.id ?? null;
        if (!cid) {
          const { data: newChat } = await supabase.from('chats').insert({ user1_id: uid1, user2_id: uid2 }).select().single();
          cid = newChat?.id ?? null;
        }
        if (cid) {
          // 연락처 정보가 있으면 자동 메시지 전송
          const { kakao_id, instagram_id, phone_number, contact_private } = shareProfile;
          if (!contact_private && (kakao_id || instagram_id || phone_number)) {
            const parts: string[] = [];
            if (kakao_id) parts.push(`카카오: ${kakao_id}`);
            if (instagram_id) parts.push(`인스타: @${instagram_id}`);
            if (phone_number) parts.push(`전화: ${phone_number}`);
            // 메시지가 이미 있는지 확인 (중복 방지)
            const { data: existingMsgs } = await supabase.from('messages').select('id,content').eq('chat_id', cid).eq('sender_id', shareProfile.id);
            const alreadySent = existingMsgs?.some((m: { id: string; content: string }) => m.content?.startsWith('__contact__'));
            if (!alreadySent) {
              await supabase.from('messages').insert({
                chat_id: cid,
                sender_id: shareProfile.id,
                content: `__contact__\n${parts.join('\n')}`,
              });
            }
          }
          setChatId(cid);
          setSelectedProfile(shareProfile);
          setView('chat');
        }
      })();
    }

    const profileChannel = supabase
      .channel('realtime:profiles')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profiles' },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => setProfiles((prev) => {
          if (prev.find((p) => p.id === (payload.new as Profile).id)) return prev;
          return [payload.new as Profile, ...prev];
        }))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) =>
          setProfiles((prev) => prev.map((p) => p.id === (payload.new as Profile).id ? { ...p, ...(payload.new as Profile) } : p)))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'profiles' },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => setProfiles((prev) => prev.filter((p) => p.id !== (payload.old as Profile).id)))
      .subscribe();

    const likesChannel = supabase
      .channel('realtime:likes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'likes', filter: `liker_id=eq.${currentUserId}` },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          const row = payload.new as { liked_id: string; heart_type: HeartType };
          setLikedIds((prev) => new Set([...prev, row.liked_id]));
          setSentHeartTypes((prev) => new Map(prev).set(row.liked_id, row.heart_type ?? 'red'));
          setSentHeartsPerPerson(prev => {
            const next = new Map(prev);
            const s = new Set(next.get(row.liked_id) ?? []);
            s.add(row.heart_type ?? 'red');
            next.set(row.liked_id, s);
            return next;
          });
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'likes', filter: `liker_id=eq.${currentUserId}` },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          const updated = payload.new as { liked_id: string; status: string };
          // likeStatuses에 보낸 하트 응답 상태 즉시 반영 (거부됨 배지 표시용)
          setLikeStatuses(prev => new Map(prev).set(updated.liked_id, updated.status));
          if (updated.status === 'rejected') {
            // profilesRef로 최신 데이터 참조 (stale 클로저 방지)
            const rejectedProfile = profilesRef.current.find(p => p.id === updated.liked_id);
            const nick = rejectedProfile?.nickname ?? '상대방';
            setRejectionNotif(nick);
            setTimeout(() => setRejectionNotif(null), 5000);
          } else if (updated.status === 'accepted') {
            loadContactShareData(currentUserId);
          }
        })
      .subscribe();

    const receivedLikesChannel = supabase
      .channel('realtime:received-likes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'likes', filter: `liked_id=eq.${currentUserId}` },
        async (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          try {
            const row = payload.new as { liker_id: string; heart_type: HeartType };
            const likerId = row.liker_id;
            setReceivedHeartTypes(prev => new Map(prev).set(likerId, row.heart_type ?? 'red'));
            const { data } = await supabase.from('profiles').select('*').eq('id', likerId).maybeSingle();
            if (data) {
              setReceivedLikers((prev) => {
                if (prev.find((p) => p.id === data.id)) return prev;
                return [data, ...prev];
              });
              setBottomNotif({ type: 'heart', nickname: data.nickname, heartType: row.heart_type ?? 'red' });
              playCuteSound();
            }
          } catch (e) { console.warn('[realtime:likes]', e); }
        })
      .subscribe();

    const contactSharesChannel = supabase
      .channel('realtime:contact-shares')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'contact_shares', filter: `liker_id=eq.${currentUserId}` },
        async (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          try {
            const share = payload.new as ContactShare;
            setReceivedContactShares(prev => {
              if (prev.find(s => s.liked_id === share.liked_id)) return prev.map(s => s.liked_id === share.liked_id ? share : s);
              return [share, ...prev];
            });
            const { data } = await supabase.from('profiles').select('nickname').eq('id', share.liked_id).maybeSingle();
            setBottomNotif({ type: 'contact', nickname: data?.nickname ?? '' });
          } catch (e) { console.warn('[realtime:contact-shares]', e); }
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'contact_shares', filter: `liker_id=eq.${currentUserId}` },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          const share = payload.new as ContactShare;
          setReceivedContactShares(prev => prev.map(s => s.liked_id === share.liked_id ? share : s));
        })
      .subscribe();

    // chats 생성만 감지 — messages 구독은 별도 perChatChannels 로 분리 (서버 사이드 필터 적용)
    const chatChannel = supabase
      .channel('realtime:chats-user')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chats' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        const c = payload.new as { user1_id: string; user2_id: string; id: string; created_at: string };
        if (c.user1_id !== currentUserId && c.user2_id !== currentUserId) return;
        const newChat: Chat = { id: c.id, user1_id: c.user1_id, user2_id: c.user2_id, created_at: c.created_at, lastMessage: '', messageCount: 0 };
        setChatList(prev => {
          if (prev.some(x => x.id === c.id)) return prev;
          const next = [newChat, ...prev];
          chatListRef.current = next;
          return next;
        });
        const otherId = c.user1_id === currentUserId ? c.user2_id : c.user1_id;
        const otherProfile = profilesRef.current.find(p => p.id === otherId);
        const pairKey = `${c.user1_id}:${c.user2_id}`;
        const iMadeThis = selfInitiatedPairRef.current === pairKey;
        if (otherProfile && !iMadeThis) setBottomNotif({ type: 'chat', nickname: otherProfile.nickname });
      })
      .subscribe();

    // 자리 변경: 증분 업데이트 + 디바운스된 전체 리프레시 (thundering herd 방지)
    let seatsRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleSeatsRefresh = () => {
      if (seatsRefreshTimer) return;
      seatsRefreshTimer = setTimeout(() => {
        seatsRefreshTimer = null;
        supabase.from('seats').select('*').order('table_number').order('seat_position').then(({ data }: { data: any }) => {
          if (data) setSeats(data);
        });
      }, 400);
    };
    const seatsChannel = supabase
      .channel('realtime:seats')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'seats' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        const s = payload.new as Seat;
        setSeats(prev => prev.some(x => x.id === s.id) ? prev.map(x => x.id === s.id ? s : x) : [...prev, s]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'seats' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        const s = payload.new as Seat;
        setSeats(prev => prev.map(x => x.id === s.id ? s : x));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'seats' }, () => {
        scheduleSeatsRefresh();
      })
      .subscribe();

    const balanceChannel = supabase
      .channel('realtime:balance')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'balance_votes' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        const v = payload.new as BalanceVote;
        setVoteCounts(prev => {
          const copy = new Map(prev);
          const c = copy.get(v.game_id) || { a: 0, b: 0 };
          copy.set(v.game_id, { ...c, [v.option]: c[v.option] + 1 });
          return copy;
        });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'balance_games' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        const g = payload.new as BalanceGame;
        setBalanceGames(prev => prev.some(x => x.id === g.id) ? prev : [g, ...prev]);
        // Show announcement modal for the user's table
        if (g.status === 'ended') return;
        const myTable = userTableNumRef.current;
        const isForMe = g.scope === 'global' || (myTable != null && g.table_number === myTable);
        if (!isForMe) return;
        const gs: GameState = {
          active: true,
          type: 'balance',
          title: g.question,
          description: '',
          rules: '',
          penalty: '',
          option_a: g.option_a,
          option_b: g.option_b,
          game_id: g.id,
          started_at: new Date().toISOString(),
          table_number: g.table_number ?? undefined,
        };
        setCurrentGame(gs);
        setGameModalVisible(true);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'balance_games' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        const updated = payload.new as BalanceGame;
        setBalanceGames(prev => prev.map(g => g.id === updated.id ? updated : g));
        if (updated.status === 'ended') {
          setVoteCounts(prev => {
            const counts = prev.get(updated.id) || { a: 0, b: 0 };
            setGameEndResult({ game: updated, counts });
            return prev;
          });
        }
      })
      .subscribe();

    const suggestionsChannel = supabase
      .channel('realtime:suggestions')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'suggestions', filter: `profile_id=eq.${currentUserId}` }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        const s = payload.new as Suggestion;
        setSuggestions(prev => prev.map(x => x.id === s.id ? s : x));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'suggestions', filter: `profile_id=eq.${currentUserId}` }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        const s = payload.new as Suggestion;
        setSuggestions(prev => prev.some(x => x.id === s.id) ? prev : [s, ...prev]);
      })
      .subscribe();

    return () => {
      if (seatsRefreshTimer) clearTimeout(seatsRefreshTimer);
      supabase.removeChannel(profileChannel);
      supabase.removeChannel(likesChannel);
      supabase.removeChannel(receivedLikesChannel);
      supabase.removeChannel(contactSharesChannel);
      supabase.removeChannel(seatsChannel);
      supabase.removeChannel(balanceChannel);
      supabase.removeChannel(chatChannel);
      supabase.removeChannel(suggestionsChannel);
    };
  }, [currentUserId, loadProfiles, loadLikes, loadReceivedLikes, loadContactShareData, loadChatList, loadSuggestions, loadBalanceGames, loadMyVotes, loadSeats]);

  // Re-validate profile when the user returns to the app (Android/iOS back, home button, tab switch)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      const storedId = ls.getItem(MATCHING_USER_KEY);
      if (!storedId) return;
      // 포그라운드 복귀 시 전체 데이터 리프레시
      // ⚠️ 세션 제거는 allProfiles.length > 0 인 경우에만: 빈 결과 = 서버 오류/기동 중
      loadProfiles().then((allProfiles) => {
        if (allProfiles.length > 0 && !allProfiles.some((p: { id: string }) => p.id === storedId)) {
          // 실제로 프로필이 삭제된 경우(관리자 리셋)만 세션 제거
          ls.removeItem(MATCHING_USER_KEY);
          ls.removeItem(MATCHING_DRAFT_KEY);
          setCurrentUserId(null);
          setShownWaiting(false);
          setView('entry-1');
        } else {
          // Refresh data on returning to app
          loadSeats();
          loadReceivedLikes(storedId);
          loadLikes(storedId);
          loadChatList(storedId);
          loadContactShareData(storedId);
          loadBalanceGames();
          loadMyVotes(storedId);
          loadSuggestions(storedId);
        }
      }).catch(() => { /* 네트워크 오류 → 세션 유지, 데이터는 다음 리프레시 때 갱신 */ });
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [loadProfiles, loadReceivedLikes, loadLikes, loadChatList, loadSeats, loadContactShareData, loadBalanceGames, loadMyVotes, loadSuggestions]);

  // Web push 구독 — 로그인 완료 후 알림 권한 요청 및 구독 등록
  useEffect(() => {
    if (!currentUserId) return;
    registerPushSub(currentUserId);
  }, [currentUserId]);



  // Manual refresh for status and chat tabs
  const refreshStatusTab = useCallback(() => {
    if (!currentUserId) return;
    loadReceivedLikes(currentUserId);
    loadLikes(currentUserId);
    loadContactShareData(currentUserId);
  }, [currentUserId, loadReceivedLikes, loadLikes, loadContactShareData]);

  const refreshChatTab = useCallback(() => {
    if (!currentUserId) return;
    loadChatList(currentUserId);
  }, [currentUserId, loadChatList]);

  const refreshProfilesTab = useCallback(() => {
    loadProfiles();
  }, [loadProfiles]);

  const refreshSeatingTab = useCallback(() => {
    loadSeats();
  }, [loadSeats]);

  const handleNicknameSetup = async (data: {
    birthYear: number;
    birthMonth: number | null;
    birthDay: number | null;
    location: string;
    mbti: string;
    interests: string[];
    personalityScore: number;
    domSubScore: number | null;
    nickname: string;
    kakaoId: string;
    instagramId: string;
    phoneNumber: string;
    contactPrivate: boolean;
  }) => {
    setLoading(true);
    // Generate unique 4-digit pin code
    const { data: existingPins } = await supabase.from('profiles').select('pin_code');
    const usedPins = new Set((existingPins ?? []).map((p: { pin_code: string | null }) => p.pin_code).filter(Boolean));
    let pinCode = String(Math.floor(1000 + Math.random() * 9000));
    while (usedPins.has(pinCode)) pinCode = String(Math.floor(1000 + Math.random() * 9000));

    const { data: profile, error } = await supabase
      .from('profiles')
      .insert({
        nickname: data.nickname,
        bio: data.interests.join(', '),
        photo_url: genAvatar(data.nickname),
        personality_score: data.personalityScore,
        dom_sub_score: data.domSubScore,
        mbti: data.mbti,
        birth_year: data.birthYear,
        birth_month: data.birthMonth,
        birth_day: data.birthDay,
        location: data.location,
        interests: Array.isArray(data.interests) ? (data.interests as string[]).join(', ') : data.interests as string | null,
        contact_private: data.contactPrivate,
        kakao_id: data.kakaoId || null,
        instagram_id: data.instagramId || null,
        phone_number: data.phoneNumber || null,
        pin_code: pinCode,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        alert('이미 사용 중인 닉네임입니다. 다른 닉네임을 선택해 주세요.');
      } else {
        alert(`오류가 발생했습니다: ${error.message}`);
      }
      setLoading(false);
      return;
    }
    if (profile) {
      ls.setItem(MATCHING_USER_KEY, profile.id);
      ls.removeItem(MATCHING_DRAFT_KEY);
      isNewRegistration.current = true;
      // 새 프로필을 즉시 로컬 상태에 추가 — DB 반영 지연/SSE 타이밍에 무관하게 세션 유지
      setProfiles(prev => prev.some(p => p.id === profile.id) ? prev : [profile as Profile, ...prev]);
      setView('loading-main');
      setCurrentUserId(profile.id);
    }
    setLoading(false);
  };














  const reset = () => {
    ls.removeItem(MATCHING_USER_KEY);
    ls.removeItem(MATCHING_DRAFT_KEY);
    setCurrentUserId(null);
    setShownWaiting(false);
    setView('entry-1');
  };





  const submitSuggestion = async (content: string, contactInfo: string) => {
    if (!currentUserId || !content.trim()) return;
    const currentProfile = profiles.find(p => p.id === currentUserId);
    const { data } = await supabase.from('suggestions').insert({
      profile_id: currentUserId,
      nickname: currentProfile?.nickname ?? null,
      content: content.trim(),
      contact_info: contactInfo.trim() || null,
    }).select().single();
    if (data) setSuggestions(prev => [data as Suggestion, ...prev]);
  };

  // useMemo: 매 렌더마다 filter 재계산 방지 — 모든 early return 전에 선언 (Rules of Hooks 준수)
  const sentLikedProfiles = useMemo(
    () => profiles.filter((p) => likedIds.has(p.id)),
    [profiles, likedIds],
  );
  const pendingHeartsCount = useMemo(
    () => receivedLikers.filter((l) => {
      const ht = receivedHeartTypes.get(l.id) ?? 'red';
      if (ht === 'green') return !acknowledgedComplimentIds.has(l.id);
      return !contactSharedWithIds.has(l.id);
    }).length,
    [receivedLikers, receivedHeartTypes, acknowledgedComplimentIds, contactSharedWithIds],
  );

  // 신규 접속자(localStorage에 userId 없음) → WaitingOverlay 표시
  // 기존 접속자(userId 있음) → 즉시 메인 화면 진입 (showWaiting = false)
  // shownWaiting: 대기 화면에서 '입장하기' 클릭 or 관리자 시작 감지 시 true
  const showWaiting = !currentUserId && !shownWaiting;
  // QR 스캔 후 미등록 사용자: 자리 QR URL 파라미터는 pendingSeatId/pendingSeatPath에 보존됨.
  // 등록 완료 후 currentUserId useEffect에서 자동으로 자리 배정 처리됨

  if (appLoading || sessionActive === null || entryPassword === null) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 rounded-full border-4 border-teal-500/30 border-t-teal-500 animate-spin" />
      <p className="text-sm text-slate-400">연결 중...</p>
    </div>
  );
  // 입장 코드 게이트: 설정되어 있고 아직 인증 안 됐으면 입력 화면 표시
  if (!!entryPassword && !entryVerified) return (
    <EntryGateScreen
      onVerified={() => {
        ls.setItem(ENTRY_VERIFIED_KEY, entryPassword);
        setEntryVerified(true);
      }}
      entryPassword={entryPassword}
    />
  );
  if (showWaiting) return <WaitingOverlay
    sessionActive={sessionActive}
    onEnter={() => setShownWaiting(true)}
  />;

  if (view === 'loading-main') return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 rounded-full border-4 border-teal-500/30 border-t-teal-500 animate-spin" />
      <p className="text-sm text-slate-400 font-semibold">프로필 저장 중...</p>
    </div>
  );

  if (view === 'entry-1') return (
    <>
      <NicknameSetupScreen onSubmit={handleNicknameSetup} loading={loading} onReset={reset} />
    </>
  );

  if (view === 'profile' && selectedProfile) return (
    <>
      {currentGame?.active && gameModalVisible && <GameAnnouncementModal game={currentGame} onDismiss={() => setGameModalVisible(false)} onVote={voteOnGame} onImageVote={voteOnImageGame} currentUserId={currentUserId} seats={seats} profiles={profiles} />}
      {currentGame?.active && !gameModalVisible && <GameActiveBanner game={currentGame} onClick={() => setGameModalVisible(true)} />}
      <ProfileDetail
        profile={selectedProfile}
        isMe={selectedProfile.id === currentUserId}
        isLiked={likedIds.has(selectedProfile.id)}
        heartType={sentHeartTypes.get(selectedProfile.id)}
        sentHeartsCount={sentHeartsPerPerson.get(selectedProfile.id)?.size ?? 0}
        onLike={() => { if (!seatingLocked) handleLike(selectedProfile.id); }}
        onChat={() => { if (!seatingLocked) openChat(selectedProfile); }}
        onBack={() => setView('main')}
        onReset={reset}
      />
      {likeConfirmTarget && (
        <LikeConfirmDialog
          target={likeConfirmTarget}
          likedByType={likedByTypeRecord()}
          sentTypesForTarget={sentHeartsPerPerson.get(likeConfirmTarget.id) ?? new Set()}
          onConfirm={executeLike}
          onCancel={() => setLikeConfirmTarget(null)}
        />
      )}
    </>
  );
  if (view === 'chat' && selectedProfile && !chatId) return (
    <div className="flex items-center justify-center h-screen bg-white">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-pink-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-400">채팅방 열는 중…</p>
      </div>
    </div>
  );
  if (view === 'chat' && selectedProfile && chatId) return (
    <>
      {currentGame?.active && gameModalVisible && <GameAnnouncementModal game={currentGame} onDismiss={() => setGameModalVisible(false)} onVote={voteOnGame} onImageVote={voteOnImageGame} currentUserId={currentUserId} seats={seats} profiles={profiles} />}
      <ChatScreen
        chatId={chatId}
        messages={messages}
        currentUserId={currentUserId!}
        otherProfile={selectedProfile}
        onSend={sendMessage}
        onSendImage={sendImage}
        onBack={() => { chatIdRef.current = null; setChatId(null); setView('main'); }}
        onReset={reset}
        onDeleteMessage={deleteMessage}
        currentUserProfile={profiles.find(p => p.id === currentUserId) ?? null}
        receivedContactShares={receivedContactShares}
        contactSharedWithIds={contactSharedWithIds}
        onGoToTab={(tab) => {
          chatIdRef.current = null;
          setChatId(null);
          setView('main');
          setMainTab(tab as MainTab);
        }}
      />
    </>
  );

  return (
    <>
      {/* Welcome notice for new registrations */}
      {showWelcomeNotice && (
        <WelcomeNoticeModal onClose={() => setShowWelcomeNotice(false)} />
      )}

      {/* Tutorial modal */}
      {showTutorialModal && (
        <TutorialModal
          page={tutorialPage}
          onChangePage={setTutorialPage}
          onClose={() => {
            setShowTutorialModal(false);
            // 튜토리얼 닫으면 접속 가이드도 함께 처리 (중복 팝업 방지)
            setShowGuide(false);
            ls.setItem(MATCHING_GUIDE_SHOWN_KEY, '1');
          }}
          darkMode={darkMode}
        />
      )}

      {/* Browser optimization guide — 튜토리얼·환영 모달이 없을 때만 표시 */}
      {showGuide && !showTutorialModal && !showWelcomeNotice && (
        <BrowserGuidePopup onClose={() => {
          setShowGuide(false);
          ls.setItem(MATCHING_GUIDE_SHOWN_KEY, '1');
        }} />
      )}

      {/* Reconnect overlay */}
      {connStatus !== 'ok' && (
        <ReconnectOverlay status={connStatus} onRetry={() => window.location.reload()} />
      )}
      {/* Broadcast notification modal */}
      {activeNotif && (
        <NotifModal notif={activeNotif} onClose={() => setActiveNotif(null)} />
      )}
      {/* Heart rejection notification */}
      {rejectionNotif && (
        <div className="fixed bottom-20 left-0 right-0 z-[150] flex justify-center px-4 pointer-events-none">
          <div className="bg-gray-800 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 pointer-events-auto animate-bounce">
            <span className="text-lg">💔</span>
            <div>
              <p className="text-sm font-bold">{rejectionNotif}님이 하트를 거절했습니다</p>
            </div>
            <button onClick={() => setRejectionNotif(null)} className="text-white/60 hover:text-white text-lg ml-2">×</button>
          </div>
        </div>
      )}
      {/* Bottom notification: new heart / chat */}
      {bottomNotif && (
        <div className="fixed bottom-20 left-0 right-0 z-[150] flex justify-center px-4 pointer-events-none">
          <div className={`px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 pointer-events-auto cursor-pointer ${bottomNotif.type === 'heart' ? 'bg-rose-500' : bottomNotif.type === 'contact' ? 'bg-emerald-500' : 'bg-cyan-600'}`}>
            <span className="text-lg">{bottomNotif.type === 'heart' ? (bottomNotif.heartType ? heartMeta(bottomNotif.heartType).emoji : '❤️') : bottomNotif.type === 'contact' ? '📱' : '💬'}</span>
            <div className="flex-1">
              {bottomNotif.type === 'heart' && (
                <>
                  <p className="text-sm font-bold text-white">{bottomNotif.nickname}님이 {bottomNotif.heartType ? heartMeta(bottomNotif.heartType).label : '하트'}를 보냈습니다!</p>
                  <button onClick={() => { setMainTab('status'); setBottomNotif(null); }} className="text-xs text-white/80 underline">내 상태 탭으로 이동</button>
                </>
              )}
              {bottomNotif.type === 'chat' && (
                <>
                  <p className="text-sm font-bold text-white">{bottomNotif.nickname}님과 채팅이 열렸습니다!</p>
                  <button onClick={() => { setMainTab('chats'); setBottomNotif(null); }} className="text-xs text-white/80 underline">채팅 탭으로 이동</button>
                </>
              )}
              {bottomNotif.type === 'message' && (
                <>
                  <p className="text-sm font-bold text-white">새로운 채팅이 왔습니다.</p>
                  <div className="flex gap-2 mt-0.5">
                    <button onClick={() => { setMainTab('chats'); setBottomNotif(null); }} className="text-xs text-white/90 bg-white/20 px-2 py-0.5 rounded-lg font-semibold">채팅탭</button>
                    <button onClick={() => { setMainTab('status'); setBottomNotif(null); }} className="text-xs text-white/90 bg-white/20 px-2 py-0.5 rounded-lg font-semibold">내 프로필</button>
                  </div>
                </>
              )}
              {bottomNotif.type === 'contact' && (
                <>
                  <p className="text-sm font-bold text-white">{bottomNotif.nickname}님이 연락처를 공유했습니다!</p>
                  <button onClick={() => { setMainTab('status'); setBottomNotif(null); }} className="text-xs text-white/80 underline">내 상태 탭에서 확인</button>
                </>
              )}
            </div>
            <button onClick={(e) => { e.stopPropagation(); setBottomNotif(null); }} className="text-white/60 hover:text-white text-lg ml-1">×</button>
          </div>
        </div>
      )}
      {/* Balance game result modal - appears on any tab when a game ends */}
      {gameEndResult && (
        <GameResultModal game={gameEndResult.game} counts={gameEndResult.counts} onClose={() => setGameEndResult(null)} />
      )}
      {/* Q&A Game Overlay (전체 공지) */}
      {activeQaGame && qaOverlayVisible && (
        <QaGameOverlay
          game={activeQaGame}
          currentUserId={currentUserId}
          currentUserNickname={profileMap.get(currentUserId ?? '')?.nickname ?? null}
          seats={seats}
          alreadySubmitted={qaSubmittedIds.has(activeQaGame.id)}
          onSubmitted={() => setQaSubmittedIds(prev => new Set([...prev, activeQaGame.id]))}
          onDismiss={() => setQaOverlayVisible(false)}
        />
      )}
      {/* Game Announcement Modal (전체 알림) */}
      {currentGame?.active && gameModalVisible && (
        <GameAnnouncementModal game={currentGame} onDismiss={() => setGameModalVisible(false)} onVote={voteOnGame} onImageVote={voteOnImageGame} currentUserId={currentUserId} seats={seats} profiles={profiles} />
      )}
      {/* Game Active Banner (모달 닫은 후 상단 표시) */}
      {currentGame?.active && !gameModalVisible && (
        <GameActiveBanner game={currentGame} onClick={() => setGameModalVisible(true)} />
      )}
      <MainScreen
        profiles={profiles}
        currentUserId={currentUserId}
        likedIds={likedIds}
        sentHeartsPerPerson={sentHeartsPerPerson}
        likeStatuses={likeStatuses}
        seats={seats}
        profileMap={profileMap}
        mainTab={mainTab}
        onTabChange={setMainTab}
        onLike={handleLike}
        onSelect={(p) => { setSelectedProfile(p); setView('profile'); }}
        onReset={reset}
        onProfileClickFromMap={(p) => { setSelectedProfile(p); setView('profile'); }}
        receivedLikers={receivedLikers}
        receivedHeartTypes={receivedHeartTypes}
        sentHeartTypes={sentHeartTypes}
        sentLikedProfiles={sentLikedProfiles}
        contactSharedWithIds={contactSharedWithIds}
        acknowledgedComplimentIds={acknowledgedComplimentIds}
        receivedContactShares={receivedContactShares}
        pendingHeartsCount={pendingHeartsCount}
        chatList={chatList}
        suggestions={suggestions}
        onContactShareOpen={(profile) => setContactShareTarget(profile)}
        onContactViewOpen={(share, profile) => setContactViewShare({ share, profile })}
        onHeartResponse={handleHeartResponse}
        onDeleteChat={deleteChat}
        onDeleteAllChats={deleteAllChats}
        onSubmitSuggestion={submitSuggestion}
        onOpenChat={openChat}
        balanceGames={balanceGames}
        voteCounts={voteCounts}
        myVotes={myVotes}
        onVote={voteOnGame}
        onCreateGame={createTableGame}
        onEndGame={endBalanceGame}
        onSubmitAnonymousReport={submitAnonymousReport}
        timerEndAt={timerEndAt}
        timerLabel={timerLabel}
        onRefreshStatus={refreshStatusTab}
        onRefreshChat={refreshChatTab}
        onUpdateProfile={(update) => setProfiles(prev => prev.map(p => p.id === (update as { id: string }).id ? { ...p, ...(update as object) } : p))}
        onRefreshProfiles={refreshProfilesTab}
        onRefreshSeating={refreshSeatingTab}
        darkMode={darkMode}
        onToggleDark={() => { const next = !darkMode; setDarkMode(next); ls.setItem('dark_mode', next ? '1' : '0'); }}
        onShowQr={() => setShowProfileQr(true)}
        seatingLocked={seatingLocked}
        activeTables={activeTables}
        tableLabels={tableLabels}
        onShowTutorial={() => { setTutorialPage(0); setShowTutorialModal(true); }}
        newMsgCount={newMsgCount}
        onClearMsgCount={() => setNewMsgCount(0)}
        unreadChatCounts={unreadChatCounts}
        onClearChatUnread={(chatId) => setUnreadChatCounts(prev => { const n = { ...prev }; delete n[chatId]; return n; })}
        resetPassword={resetPassword}
        onBroadcastGame={broadcastTableGame}
        setSeatDialog={setSeatDialog}
      />
      {/* Table Mini-Game Modal (테이블 동기 게임 결과) */}
      {incomingTableGame && (
        <TableMiniGameModal
          session={incomingTableGame}
          onClose={() => setIncomingTableGame(null)}
        />
      )}
      {seatDialog && (
        <SeatRegisterDialog
          seat={seatDialog}
          currentUserSeat={currentUserSeat}
          onConfirm={() => handleRegisterSeat(seatDialog, seatingLocked, currentUserSeat)}
          onCancel={() => setSeatDialog(null)}
        />
      )}
      {likeConfirmTarget && (
        <LikeConfirmDialog
          target={likeConfirmTarget}
          likedByType={likedByTypeRecord()}
          sentTypesForTarget={sentHeartsPerPerson.get(likeConfirmTarget.id) ?? new Set()}
          onConfirm={executeLike}
          onCancel={() => setLikeConfirmTarget(null)}
        />
      )}
      {shareEventNotif && (() => {
        const fromProfile = profiles.find(p => p.id === shareEventNotif.fromUserId);
        const name = fromProfile?.nickname ?? '상대방';
        return (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[400] w-80 max-w-[90vw]">
            <div className={`rounded-2xl shadow-2xl p-4 border-2 flex items-start gap-3 ${shareEventNotif.type === 'accepted' ? 'bg-teal-50 border-teal-300' : 'bg-gray-50 border-gray-300'}`}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${shareEventNotif.type === 'accepted' ? 'bg-teal-100' : 'bg-gray-200'}`}>
                {shareEventNotif.type === 'accepted' ? <CheckCircle className="w-5 h-5 text-teal-600" /> : <XCircle className="w-5 h-5 text-gray-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-black ${shareEventNotif.type === 'accepted' ? 'text-teal-800' : 'text-gray-700'}`}>
                  {shareEventNotif.type === 'accepted' ? '연락처 공유 완료' : '연락처 공유 거부'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {shareEventNotif.type === 'accepted'
                    ? `${name}님이 연락처를 공유했습니다. 프로필에서 확인하세요.`
                    : `${name}님이 연락처 공유를 거부하였습니다.`}
                </p>
              </div>
              <button onClick={() => setShareEventNotif(null)} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })()}
      {contactShareTarget && (
        <ContactShareModal
          liker={contactShareTarget}
          alreadyShared={contactSharedWithIds.has(contactShareTarget.id)}
          myProfile={currentUserId ? (profileMap.get(currentUserId) ?? null) : null}
          onSubmit={(kakao, instagram, phone) => handleContactShare(contactShareTarget.id, kakao, instagram, phone)}
          onReject={() => handleContactShareReject(contactShareTarget.id)}
          onClose={() => setContactShareTarget(null)}
        />
      )}
      {contactViewShare && (
        <ContactViewModal
          share={contactViewShare.share}
          likedProfile={contactViewShare.profile}
          onClose={() => setContactViewShare(null)}
        />
      )}
      {showProfileQr && currentUserId && (
        <ProfileQrModal
          profileId={currentUserId}
          pinCode={profileMap.get(currentUserId)?.pin_code ?? null}
          onClose={() => setShowProfileQr(false)}
          onPinGenerated={(pin) => setProfiles(prev => prev.map(p => p.id === currentUserId ? { ...p, pin_code: pin } : p))}
        />
      )}
    </>
  );
}




// ─── Profile Detail ───────────────────────────────────────────────────────────



export default App;
