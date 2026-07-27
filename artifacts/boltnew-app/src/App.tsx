import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import {
  Heart, MessageCircle, Users, ChevronRight, ChevronDown,
  LayoutGrid, CheckCircle,
  Eye, UserCheck, Gamepad2, X, RefreshCw, Info, BookOpen,
  BarChart3, Lock, XCircle, QrCode, Camera,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import SeatingMap from './components/SeatingMap';
import { StatsTab, RankingTab } from './components/StatsTabs';
import ProfileAvatar from './components/ProfileAvatar';
import { StickerSVG, STICKER_LABELS, STICKER_BG, STICKER_COUNT } from './stickers';
import { getPositionLabel, getPositionBg, getDomSubLabel, getDomSubBg, genAvatar, getKoreanAge } from './lib/profile';
import { getZodiac, getOhaeng, getCompatibility, getOhaengCompat, getNumerologyCompat, getMbtiCompat, getTodayFortune } from './lib/fortune';
const FortuneTab = lazy(() => import('./components/FortuneTab'));
import { HEART_TYPES, HeartType } from './lib/constants';
// ─── 분리된 타입·유틸·컴포넌트 imports ────────────────────────────────────────
import type {
  Profile, Message, Seat, ContactShare, Suggestion, BalanceGame, BalanceVote,
  AnonymousReport, Chat, View, MainTab, TableMiniGameSession, GameState,
} from './types/app';
export type { GameState } from './types/app';
import { hasBannedWord, koreanMatch, getMbtiStyle, MBTI_COLORS, domSubLabel } from './lib/utils';
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
import { NotifModal } from './components/NotifModal';
import { WelcomeNoticeModal } from './components/WelcomeNoticeModal';
import { ProfileInfoBadges } from './components/ProfileInfoBadges';
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

// ─── QaGameOverlay → ./components/games/QaGameOverlay ────────────────────────
// ─── GameAnnouncementModal → ./components/games/GameAnnouncementModal ─────────
// ─── BalanceGameCard → ./components/games/BalanceGameCard ────────────────────
// ─── CreateGameModal → ./components/games/CreateGameModal ────────────────────
// ─── MiniGameTips → ./components/games/MiniGameTips ──────────────────────────
// ─── ParticipantSelector → ./components/games/ParticipantSelector ────────────
// ─── HowToPlayCard → ./components/games/HowToPlayCard ────────────────────────
// ─── RouletteGame → ./components/games/RouletteGame ──────────────────────────
// ─── LadderGame → ./components/games/LadderGame ──────────────────────────────
// ─── UserGameTab → ./components/games/UserGameTab ────────────────────────────
// ─── TableMiniGameModal → ./components/games/TableMiniGameModal ──────────────
// ─── EntryGateScreen → ./components/EntryGateScreen ──────────────────────────
// ─── WaitingOverlay → ./components/WaitingOverlay ────────────────────────────
// ─── NicknameSetupScreen → ./components/NicknameSetupScreen ──────────────────
// ─── TutorialModal → ./components/TutorialModal ──────────────────────────────
// ─── ResetButton → ./components/ResetButton ──────────────────────────────────
// ─── ProfileQrModal → ./components/ProfileQrModal ────────────────────────────

// ─── Nickname generator → ./lib/nicknameGenerator ────────────────────────────
// BIO_CATEGORIES, EMOJIS, POSITION_OPTIONS, DOM_SUB_OPTIONS → NicknameSetupScreen
// MBTI_TYPES, DECADE_GROUPS, LOCATION_GROUPS → NicknameSetupScreen


// ─── Seat Register Dialog → ./components/SeatRegisterDialog ─────────────────

// ─── Game display components → ./components/games/GameDisplays ───────────────

// ─── Like Confirm Dialog ──────────────────────────────────────────────────────

// heartMeta → lib/constants | MBTI_COLORS, domSubLabel → lib/utils
// ProfileInfoBadges → ./components/ProfileInfoBadges

// LikeConfirmDialog  → ./components/LikeConfirmDialog
// ContactShareModal  → ./components/ContactShareModal
// ContactViewModal   → ./components/ContactViewModal

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

    const reg = await navigator.serviceWorker.register('/sw.js');
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
    const existingId = ls.getItem(MATCHING_USER_KEY);
    if (existingId) return existingId;
    if (new URLSearchParams(window.location.search).get('table')) {
      ls.removeItem(MATCHING_DRAFT_KEY);
    }
    return null;
  });
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = currentUserId;

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
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [sentHeartTypes, setSentHeartTypes] = useState<Map<string, HeartType>>(new Map());
  // 한 사람에게 여러 종류 하트를 보낼 수 있게: profileId → Set<HeartType>
  const [sentHeartsPerPerson, setSentHeartsPerPerson] = useState<Map<string, Set<HeartType>>>(new Map());
  const [receivedHeartTypes, setReceivedHeartTypes] = useState<Map<string, HeartType>>(new Map());
  const [likeStatuses, setLikeStatuses] = useState<Map<string, string>>(new Map());
  const [receivedLikers, setReceivedLikers] = useState<Profile[]>([]);
  const [contactSharedWithIds, setContactSharedWithIds] = useState<Set<string>>(new Set());
  const [acknowledgedComplimentIds, setAcknowledgedComplimentIds] = useState<Set<string>>(new Set());
  const [receivedContactShares, setReceivedContactShares] = useState<ContactShare[]>([]);
  const [newMsgCount, setNewMsgCount] = useState(0);
  const [unreadChatCounts, setUnreadChatCounts] = useState<Record<string, number>>({});
  const [likeConfirmTarget, setLikeConfirmTarget] = useState<Profile | null>(null);
  const [contactShareTarget, setContactShareTarget] = useState<Profile | null>(null);
  const [shareEventNotif, setShareEventNotif] = useState<{ type: 'accepted' | 'rejected'; fromUserId: string } | null>(null);
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
  const shouldShowStatusAfterSeat = useRef(false);
  const isNewRegistration = useRef(false);
  const prevUserSeatId = useRef<string | null>(null);
  // 항상 최신 profiles를 가리키는 ref (stale 클로저 방지)
  const profilesRef = useRef<Profile[]>([]);
  // ?share=<profileId> URL 파라미터 — 프로필 QR 스캔 시 연락처 자동 수신
  const [pendingShareId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('share'));

  const [chatId, setChatId] = useState<string | null>(null);
  const chatIdRef = useRef<string | null>(null);
  chatIdRef.current = chatId;
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatList, setChatList] = useState<Chat[]>([]);
  const chatListRef = useRef<Chat[]>([]);
  chatListRef.current = chatList;
  // 채팅방별 개별 메시지 구독 채널 (서버 사이드 필터 적용)
  const perChatChannelsRef = useRef<Map<string, ReturnType<typeof supabase.channel>>>(new Map());
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [seats, setSeats] = useState<Seat[]>(() => {
    try {
      const cached = ls.getItem(MATCHING_SEATS_CACHE_KEY);
      return cached ? (JSON.parse(cached) as Seat[]) : [];
    } catch { return []; }
  });
  const [seatDialog, setSeatDialog] = useState<Seat | null>(null);
  const [autoRegisterSeat, setAutoRegisterSeat] = useState<Seat | null>(null);
  const [currentGame, setCurrentGame] = useState<GameState | null>(null);
  const [gameModalVisible, setGameModalVisible] = useState(false);
  const [activeQaGame, setActiveQaGame] = useState<{ id: string; question: string; correct_answer: string | null } | null>(null);
  const [qaOverlayVisible, setQaOverlayVisible] = useState(false);
  const [qaSubmittedIds, setQaSubmittedIds] = useState<Set<string>>(new Set());
  const [balanceGames, setBalanceGames] = useState<BalanceGame[]>([]);
  const [voteCounts, setVoteCounts] = useState<Map<string, { a: number; b: number }>>(new Map());
  const [myVotes, setMyVotes] = useState<Map<string, 'a' | 'b'>>(new Map());
  const [gameEndResult, setGameEndResult] = useState<{ game: BalanceGame; counts: { a: number; b: number } } | null>(null);
  const [activeNotif, setActiveNotif] = useState<{ id: string; message: string; type: string; target: string } | null>(null);
  const [showWelcomeNotice, setShowWelcomeNotice] = useState(false);
  const [incomingTableGame, setIncomingTableGame] = useState<TableMiniGameSession | null>(null);
  const tableMinigameChRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
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

  const pendingTableNum = useRef<number | null>(
    (() => { const t = new URLSearchParams(window.location.search).get('table'); return t ? parseInt(t, 10) : null; })()
  );
  // Track user's current table number for notification targeting (ref for stable access in channel callbacks)
  const userTableNumRef = useRef<number | null>(null);

  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  // 렌더마다 최신 profiles를 ref에 동기화 (stale 클로저 방지)
  profilesRef.current = profiles;
  const currentUserSeat = seats.find((s) => s.profile_id === currentUserId) ?? null;
  // Keep ref updated so notification channel can check user's table without stale closure
  userTableNumRef.current = currentUserSeat?.table_number ?? null;

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled) setAppLoading(false);
    }, 6000);
    supabase.from('app_settings').select('session_active, game_state, timer_end_at, timer_label, seating_locked, active_tables, reset_signal, table_labels, reset_password, entry_password').eq('id', 1).single().then(({ data }) => {
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
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'app_settings' }, (payload) => {
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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'image_games' }, (payload) => {
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
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'image_games' }, (payload) => {
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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'contact_share_events' }, (payload) => {
        const row = payload.new as { from_user_id: string; to_user_id: string; event_type: string };
        const myId = userIdRef.current;
        if (!myId || row.to_user_id !== myId) return;
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

  // ── 테이블 미니게임 브로드캐스트 채널 ────────────────────────────────────────
  // seats 또는 currentUserId 변경(자리 배정·변경) 시 해당 테이블 채널 재구독
  useEffect(() => {
    if (!currentUserId) return;
    const tableNum = seats.find(s => s.profile_id === currentUserId)?.table_number ?? null;

    if (tableMinigameChRef.current) {
      supabase.removeChannel(tableMinigameChRef.current);
      tableMinigameChRef.current = null;
    }
    if (tableNum === null) return;

    const ch = supabase
      .channel(`table-minigame-${tableNum}`)
      .on('broadcast', { event: 'game_start' }, ({ payload }) => {
        setIncomingTableGame(payload as TableMiniGameSession);
      })
      .subscribe();
    tableMinigameChRef.current = ch;

    return () => {
      if (tableMinigameChRef.current) {
        supabase.removeChannel(tableMinigameChRef.current);
        tableMinigameChRef.current = null;
      }
    };
  }, [currentUserId, seats]);

  // 호스트가 게임을 시작할 때 호출 → 채널 브로드캐스트 + 본인도 모달 표시
  const broadcastTableGame = useCallback((session: TableMiniGameSession) => {
    tableMinigameChRef.current?.send({
      type: 'broadcast',
      event: 'game_start',
      payload: session,
    });
    setIncomingTableGame(session);
  }, []);

  const loadProfiles = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (data) {
      setProfiles(data);
      try { ls.setItem(MATCHING_PROFILES_CACHE_KEY, JSON.stringify(data)); } catch { /* quota */ }
    }
    return data ?? [];
  }, []);

  const loadLikes = useCallback(async (userId: string) => {
    const { data } = await supabase.from('likes').select('liked_id, status, heart_type').eq('liker_id', userId);
    if (data) {
      setLikedIds(new Set(data.map((l) => l.liked_id)));
      // 마지막 타입만 display용으로 유지 (최신 순 보장)
      setSentHeartTypes(new Map(data.map((l) => [l.liked_id, (l.heart_type ?? 'red') as HeartType])));
      setLikeStatuses(new Map(data.map((l) => [l.liked_id, l.status])));
      // 사람별 보낸 하트 타입 Set 구축
      const hmap = new Map<string, Set<HeartType>>();
      data.forEach(l => {
        const s = hmap.get(l.liked_id) ?? new Set<HeartType>();
        s.add((l.heart_type ?? 'red') as HeartType);
        hmap.set(l.liked_id, s);
      });
      setSentHeartsPerPerson(hmap);
    }
  }, []);

  const loadReceivedLikes = useCallback(async (userId: string) => {
    const { data } = await supabase.from('likes').select('liker_id, status, heart_type').eq('liked_id', userId);
    if (!data?.length) { setReceivedLikers([]); setReceivedHeartTypes(new Map()); setAcknowledgedComplimentIds(new Set()); return; }
    const rejected = new Set(data.filter(l => l.status === 'rejected').map(l => l.liker_id));
    setReceivedHeartTypes(new Map(data.map(l => [l.liker_id, (l.heart_type ?? 'red') as HeartType])));
    setAcknowledgedComplimentIds(new Set(data.filter(l => l.status === 'accepted' && (l.heart_type ?? 'red') === 'green').map(l => l.liker_id)));
    const activeLikerIds = data.filter(l => l.status !== 'rejected').map(l => l.liker_id);
    if (!activeLikerIds.length) { setReceivedLikers([]); return; }
    const { data: ps } = await supabase.from('profiles').select('*').in('id', activeLikerIds);
    if (ps) setReceivedLikers(ps);
  }, []);

  const loadContactShareData = useCallback(async (userId: string) => {
    const { data: shared } = await supabase.from('contact_shares').select('liker_id').eq('liked_id', userId);
    if (shared) setContactSharedWithIds(new Set(shared.map((s) => s.liker_id)));
    const { data: received } = await supabase.from('contact_shares').select('*').eq('liker_id', userId);
    if (received) setReceivedContactShares(received as ContactShare[]);
  }, []);

  const loadChatList = useCallback(async (userId: string) => {
    const { data } = await supabase.from('chats').select('*')
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .order('created_at', { ascending: false });
    if (!data) return;
    if (data.length === 0) { setChatList([]); return; }
    // Batch: 한 번의 메시지 조회로 모든 채팅의 최근 메시지를 채운다 (N+1 방지)
    const chatIds = data.map(c => c.id);
    // limit: 채팅방당 최신 1개만 필요하므로 chatIds.length * 2 로 제한 (전체 조회 방지)
    const { data: allMsgs } = await supabase.from('messages').select('chat_id, content, created_at')
      .in('chat_id', chatIds).order('created_at', { ascending: false }).limit(Math.max(chatIds.length * 2, 40));
    const latestByChat = new Map<string, { content: string; created_at: string }>();
    if (allMsgs) {
      for (const m of allMsgs) {
        if (!latestByChat.has(m.chat_id)) latestByChat.set(m.chat_id, { content: m.content, created_at: m.created_at });
      }
    }
    const enriched: Chat[] = data.map(c => ({
      ...c,
      lastMessage: latestByChat.get(c.id)?.content || '',
      messageCount: 0,
    }));
    setChatList(enriched);
  }, []);

  const loadSuggestions = useCallback(async (userId: string) => {
    const { data } = await supabase.from('suggestions').select('*').eq('profile_id', userId).order('created_at', { ascending: false });
    if (data) setSuggestions(data as Suggestion[]);
  }, []);

  const loadBalanceGames = useCallback(async () => {
    const { data: games } = await supabase.from('balance_games').select('*').order('created_at', { ascending: false }).limit(30);
    if (!games) return;
    setBalanceGames(games as BalanceGame[]);
    const activeIds = games.filter(g => g.status === 'active').map(g => g.id);
    if (activeIds.length > 0) {
      const { data: votes } = await supabase.from('balance_votes').select('game_id, option').in('game_id', activeIds);
      if (votes) {
        const counts = new Map<string, { a: number; b: number }>();
        votes.forEach(v => {
          const c = counts.get(v.game_id) || { a: 0, b: 0 };
          counts.set(v.game_id, { ...c, [v.option]: c[v.option as 'a' | 'b'] + 1 });
        });
        setVoteCounts(counts);
      }
    }
  }, []);

  const loadMyVotes = useCallback(async (userId: string) => {
    const { data } = await supabase.from('balance_votes').select('game_id, option').eq('voter_id', userId);
    if (data) setMyVotes(new Map(data.map(v => [v.game_id, v.option as 'a' | 'b'])));
  }, []);

  const voteOnGame = async (gameId: string, option: 'a' | 'b') => {
    if (!currentUserId || myVotes.has(gameId)) return;
    setMyVotes(prev => new Map(prev).set(gameId, option));
    setVoteCounts(prev => {
      const copy = new Map(prev);
      const c = copy.get(gameId) || { a: 0, b: 0 };
      copy.set(gameId, { ...c, [option]: c[option] + 1 });
      return copy;
    });
    await supabase.from('balance_votes').insert({ game_id: gameId, voter_id: currentUserId, option });
  };

  const voteOnImageGame = async (gameId: string, votedProfileId: string) => {
    if (!currentUserId) return;
    await supabase.from('image_votes').insert({ game_id: gameId, voter_id: currentUserId, voted_profile_id: votedProfileId });
  };

  const createTableGame = async (question: string, optA: string, optB: string, scope: 'global' | 'table') => {
    if (!currentUserId) return;
    const currentProfile = profiles.find(p => p.id === currentUserId);
    const tableNumber = seats.find(s => s.profile_id === currentUserId)?.table_number ?? null;
    const { data } = await supabase.from('balance_games').insert({
      creator_id: currentUserId,
      creator_nickname: currentProfile?.nickname ?? null,
      scope,
      table_number: scope === 'table' ? tableNumber : null,
      question, option_a: optA, option_b: optB,
    }).select().single();
    if (data) setBalanceGames(prev => prev.some(g => g.id === (data as BalanceGame).id) ? prev : [data as BalanceGame, ...prev]);
  };

  const endBalanceGame = async (gameId: string) => {
    await supabase.from('balance_games').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', gameId);
    setBalanceGames(prev => prev.map(g => {
      if (g.id !== gameId) return g;
      const updated = { ...g, status: 'ended' as const };
      const counts = voteCounts.get(gameId) || { a: 0, b: 0 };
      setGameEndResult({ game: updated, counts });
      return updated;
    }));
  };

  const submitAnonymousReport = async (content: string, tableNumber: number | null) => {
    if (!content.trim()) return;
    await supabase.from('anonymous_reports').insert({ content: content.trim(), table_number: tableNumber });
  };

  const loadSeats = useCallback(async () => {
    const { data } = await supabase.from('seats').select('*').order('table_number').order('seat_position');
    if (data) {
      setSeats(data);
      try { ls.setItem(MATCHING_SEATS_CACHE_KEY, JSON.stringify(data)); } catch { /* quota */ }
    }
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    loadProfiles().then((allProfiles) => {
      // 프로필 목록이 비어있으면 서버 기동 중이거나 네트워크 오류 — 세션 유지
      // 실제 프로필 삭제는 reset_signal SSE로 처리되므로 여기서 aggressive하게 지우지 않음
      if (allProfiles.length === 0) return;
      // If the profile no longer exists (e.g. admin reset the session), clear stale state
      if (!allProfiles.some(p => p.id === currentUserId)) {
        ls.removeItem(MATCHING_USER_KEY);
        ls.removeItem(MATCHING_DRAFT_KEY);
        setCurrentUserId(null);
        setShownWaiting(false);
        setView('entry-1');
        return;
      }
      setView('main');
      if (isNewRegistration.current) {
        isNewRegistration.current = false;
        setMainTab('status');
        // WelcomeNoticeModal은 튜토리얼에 통합되어 별도 팝업 없음
      }
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

    if (pendingTableNum.current !== null) {
      const tableNum = pendingTableNum.current;
      pendingTableNum.current = null;
      window.history.replaceState({}, '', window.location.pathname);
      supabase.from('seats').select('*').eq('profile_id', currentUserId).maybeSingle().then(({ data: myCurrentSeat }) => {
        if (myCurrentSeat) { return; }
        supabase.from('seats').select('*').eq('table_number', tableNum).eq('status', 'empty').order('seat_position', { ascending: true }).then(({ data, error }) => {
          if (error) { alert('좌석 정보를 불러오지 못했습니다. 다시 QR을 스캔해 주세요.'); return; }
          if (data && data.length > 0) {
            setAutoRegisterSeat(data[0]);
          } else {
            alert(`${tableNum}번 테이블에 빈 자리가 없습니다. 관리자에게 문의해 주세요.`);
          }
        });
      });
    }

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
            const alreadySent = existingMsgs?.some(m => m.content?.startsWith('__contact__'));
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
        (payload) => setProfiles((prev) => {
          if (prev.find((p) => p.id === (payload.new as Profile).id)) return prev;
          return [payload.new as Profile, ...prev];
        }))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'profiles' },
        (payload) => setProfiles((prev) => prev.filter((p) => p.id !== (payload.old as Profile).id)))
      .subscribe();

    const likesChannel = supabase
      .channel('realtime:likes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'likes', filter: `liker_id=eq.${currentUserId}` },
        (payload) => {
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
        (payload) => {
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
        async (payload) => {
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
        async (payload) => {
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
        (payload) => {
          const share = payload.new as ContactShare;
          setReceivedContactShares(prev => prev.map(s => s.liked_id === share.liked_id ? share : s));
        })
      .subscribe();

    // chats 생성만 감지 — messages 구독은 별도 perChatChannels 로 분리 (서버 사이드 필터 적용)
    const chatChannel = supabase
      .channel('realtime:chats-user')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chats' }, (payload) => {
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
        const iMadeThis = chatIdRef.current === c.id;
        if (otherProfile && !iMadeThis) setBottomNotif({ type: 'chat', nickname: otherProfile.nickname });
      })
      .subscribe();

    // 자리 변경: 증분 업데이트 + 디바운스된 전체 리프레시 (thundering herd 방지)
    let seatsRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleSeatsRefresh = () => {
      if (seatsRefreshTimer) return;
      seatsRefreshTimer = setTimeout(() => {
        seatsRefreshTimer = null;
        supabase.from('seats').select('*').order('table_number').order('seat_position').then(({ data }) => {
          if (data) setSeats(data);
        });
      }, 400);
    };
    const seatsChannel = supabase
      .channel('realtime:seats')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'seats' }, (payload) => {
        const s = payload.new as Seat;
        setSeats(prev => prev.some(x => x.id === s.id) ? prev.map(x => x.id === s.id ? s : x) : [...prev, s]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'seats' }, (payload) => {
        const s = payload.new as Seat;
        setSeats(prev => prev.map(x => x.id === s.id ? s : x));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'seats' }, () => {
        scheduleSeatsRefresh();
      })
      .subscribe();

    const balanceChannel = supabase
      .channel('realtime:balance')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'balance_votes' }, (payload) => {
        const v = payload.new as BalanceVote;
        setVoteCounts(prev => {
          const copy = new Map(prev);
          const c = copy.get(v.game_id) || { a: 0, b: 0 };
          copy.set(v.game_id, { ...c, [v.option]: c[v.option] + 1 });
          return copy;
        });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'balance_games' }, (payload) => {
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
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'balance_games' }, (payload) => {
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
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'suggestions', filter: `profile_id=eq.${currentUserId}` }, (payload) => {
        const s = payload.new as Suggestion;
        setSuggestions(prev => prev.map(x => x.id === s.id ? s : x));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'suggestions', filter: `profile_id=eq.${currentUserId}` }, (payload) => {
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
        if (allProfiles.length > 0 && !allProfiles.some(p => p.id === storedId)) {
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

  // ── 채팅방별 메시지 구독 (서버 사이드 필터) ─────────────────────────────────
  // chatList가 바뀔 때마다 새 채팅방에만 구독 추가, 사라진 방은 해제
  // 기존 전역 messages 구독(필터 없음) 대신 이 방식으로 남의 메시지 수신 차단
  useEffect(() => {
    if (!currentUserId || chatList.length === 0) return;
    const channels = perChatChannelsRef.current;
    const currentIds = new Set(chatList.map(c => c.id));

    // 목록에서 사라진 채팅방 채널 해제
    for (const [cid, ch] of channels) {
      if (!currentIds.has(cid)) {
        supabase.removeChannel(ch);
        channels.delete(cid);
      }
    }

    // 신규 채팅방만 구독
    for (const chat of chatList) {
      if (channels.has(chat.id)) continue;
      const ch = supabase
        .channel(`msgs:${chat.id}`)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'messages',
          filter: `chat_id=eq.${chat.id}`,   // ← 서버 사이드 필터: 이 방 메시지만 수신
        }, (payload) => {
          try {
            const m = payload.new as { chat_id: string; sender_id: string; content: string };
            if (m.sender_id === currentUserId) return;
            setChatList(prev => prev.map(c => c.id === m.chat_id ? { ...c, lastMessage: m.content } : c));
            if (chatIdRef.current !== m.chat_id) {
              setUnreadChatCounts(prev => ({ ...prev, [m.chat_id]: (prev[m.chat_id] ?? 0) + 1 }));
              const senderProfile = profilesRef.current.find(p => p.id === m.sender_id);
              setNewMsgCount(n => n + 1);
              setBottomNotif({ type: 'message', nickname: senderProfile?.nickname ?? '' });
              playCuteSound();
            }
          } catch (e) { console.warn('[msgs-ch]', e); }
        })
        .subscribe();
      channels.set(chat.id, ch);
    }

    return () => {
      // 유저 로그아웃/변경 시 전체 해제
      if (!currentUserId) {
        for (const ch of channels.values()) supabase.removeChannel(ch);
        channels.clear();
      }
    };
  }, [chatList, currentUserId]);


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
      setView('loading-main');
      setCurrentUserId(profile.id);
    }
    setLoading(false);
  };

  const handleLike = (profileId: string) => {
    if (!currentUserId) return;
    const target = profiles.find((p) => p.id === profileId);
    if (!target) return;
    // 이미 4가지 타입 전부 보냈으면 더 이상 보낼 수 없음
    const sent = sentHeartsPerPerson.get(profileId);
    if (sent && sent.size >= 4) return;
    setLikeConfirmTarget(target);
  };

  const heartCountByType = (type: HeartType) => {
    // 이 타입의 하트를 받은 사람 수 (사람별로 중복 없이 카운트)
    let c = 0;
    sentHeartsPerPerson.forEach(types => { if (types.has(type)) c++; });
    return c;
  };

  const likedByTypeRecord = (): Record<HeartType, number> => ({
    red: heartCountByType('red'),
    blue: heartCountByType('blue'),
    pink: heartCountByType('pink'),
    green: heartCountByType('green'),
  });


  const executeLike = async (heartType: HeartType) => {
    if (!currentUserId || !likeConfirmTarget) return;
    // 타입별 전체 한도 (2명까지)
    if (heartCountByType(heartType) >= 2) return;
    // 이 사람에게 이미 이 타입 보낸 경우 중복 차단
    if (sentHeartsPerPerson.get(likeConfirmTarget.id)?.has(heartType)) return;
    const { error } = await supabase.from('likes').insert({ liker_id: currentUserId, liked_id: likeConfirmTarget.id, heart_type: heartType });
    if (!error) {
      setLikedIds((prev) => new Set([...prev, likeConfirmTarget.id]));
      setSentHeartTypes((prev) => new Map(prev).set(likeConfirmTarget.id, heartType));
      setSentHeartsPerPerson(prev => {
        const next = new Map(prev);
        const s = new Set(next.get(likeConfirmTarget.id) ?? []);
        s.add(heartType);
        next.set(likeConfirmTarget.id, s);
        return next;
      });
    }
    setLikeConfirmTarget(null);
  };

  const handleContactShare = async (likerId: string, kakao: string, instagram: string, phone: string) => {
    if (!currentUserId) return;
    const { error } = await supabase.from('contact_shares').upsert({
      liker_id: likerId,
      liked_id: currentUserId,
      kakao: kakao || null,
      instagram: instagram || null,
      phone: phone || null,
    }, { onConflict: 'liker_id,liked_id' });
    if (!error) {
      await supabase.from('contact_share_events').insert({
        from_user_id: currentUserId,
        to_user_id: likerId,
        event_type: 'accepted',
      });
      setContactSharedWithIds((prev) => new Set([...prev, likerId]));
      setContactShareTarget(null);
      const likerProfile = profileMap.get(likerId);
      if (likerProfile) openChat(likerProfile);
    } else {
      alert(`연락처 공유 실패: ${error.message}`);
    }
  };

  const handleContactShareReject = async (likerId: string) => {
    if (!currentUserId) return;
    await supabase.from('contact_share_events').insert({
      from_user_id: currentUserId,
      to_user_id: likerId,
      event_type: 'rejected',
    });
    setContactShareTarget(null);
  };

  const openChat = async (otherProfile: Profile) => {
    if (!currentUserId) return;
    // 즉시 채팅 뷰로 전환 — chatId가 null인 동안 로딩 스피너 표시
    setMessages([]);
    setSelectedProfile(otherProfile);
    chatIdRef.current = null;
    setChatId(null);
    setView('chat');

    const user1Id = currentUserId < otherProfile.id ? currentUserId : otherProfile.id;
    const user2Id = currentUserId < otherProfile.id ? otherProfile.id : currentUserId;

    // 기존 채팅방 먼저 조회
    const { data: existingChat } = await supabase
      .from('chats').select('*').eq('user1_id', user1Id).eq('user2_id', user2Id).maybeSingle();

    let resolvedChatId: string | null = null;
    if (existingChat) {
      resolvedChatId = existingChat.id;
    } else {
      // 없으면 생성 (서버에서 중복 체크 후 기존 것 반환 가능)
      const { data: newChat, error: createErr } = await supabase
        .from('chats').insert({ user1_id: user1Id, user2_id: user2Id }).select().single();
      if (newChat) {
        resolvedChatId = newChat.id;
      } else {
        console.error('[openChat] 채팅방 생성 실패:', createErr?.message);
        // 레이스 컨디션 대비: 생성 실패 시 재조회
        const { data: retryChat } = await supabase
          .from('chats').select('*').eq('user1_id', user1Id).eq('user2_id', user2Id).maybeSingle();
        if (retryChat) resolvedChatId = retryChat.id;
      }
    }

    if (!resolvedChatId) {
      console.error('[openChat] 채팅방 ID 결정 불가 — 메인으로 복귀');
      setView('main');
      return;
    }

    chatIdRef.current = resolvedChatId;
    setChatId(resolvedChatId);
    setUnreadChatCounts(prev => { const n = { ...prev }; delete n[resolvedChatId!]; return n; });
  };

  const loadMessages = useCallback(async (cid: string) => {
    const { data } = await supabase.from('messages').select('*').eq('chat_id', cid).order('created_at', { ascending: true });
    if (data) setMessages(prev => {
      // DB가 source of truth. 단, 아직 서버에 없는 낙관적 메시지(__opt_)는 유지
      const dbIds = new Set(data.map(m => m.id));
      const optimistic = prev.filter(m => m.id.startsWith('__opt_') && !dbIds.has(m.id));
      return [...data, ...optimistic];
    });
  }, []);

  useEffect(() => {
    // chatId가 바뀌면(다른 채팅방으로 이동하거나 채팅방에서 나갈 때) 메시지 초기화
    setMessages([]);
    if (!chatId) return;
    // chatIdRef 즉시 동기화 (openChat 경쟁 조건의 2차 안전장치)
    chatIdRef.current = chatId;
    // 채팅방 진입 시 이 채팅의 unread 카운트 확실히 초기화
    setUnreadChatCounts(prev => { const n = { ...prev }; delete n[chatId]; return n; });
    // 읽음 처리: 내가 이 채팅방을 열었음을 서버에 알림
    if (currentUserId) {
      supabase.from('chat_reads').upsert({
        id: `${chatId}__${currentUserId}`,
        chat_id: chatId,
        reader_id: currentUserId,
        read_at: new Date().toISOString(),
      }, { onConflict: 'id' }).then(() => {});
    }
    // ⚠️ 구독을 먼저 걸고 loadMessages 호출 — 구독 전에 도착한 메시지를 loadMessages가 커버
    // loadMessages는 setMessages를 merge 방식으로 처리하므로 이벤트 중복도 안전
    const channel = supabase
      .channel(`chat:${chatId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages(prev => {
            // 중복 방지: 같은 ID가 이미 있으면 무시
            if (prev.some(m => m.id === newMsg.id)) return prev;
            // 낙관적 메시지 교체: __opt_ 접두사 + 같은 sender·content 항목을 실제 서버 메시지로 교체
            const optIdx = prev.findIndex(m =>
              m.id.startsWith('__opt_') &&
              m.sender_id === newMsg.sender_id &&
              m.content === newMsg.content
            );
            if (optIdx !== -1) {
              const next = [...prev];
              next[optIdx] = newMsg;
              return next;
            }
            return [...prev, newMsg];
          });
        })
      .subscribe();
    loadMessages(chatId);
    return () => { supabase.removeChannel(channel); };
  }, [chatId, loadMessages, currentUserId]);

  const sendMessage = async (content: string) => {
    if (!chatId || !currentUserId || !content.trim()) return;
    // 낙관적 업데이트: 전송 즉시 화면에 표시 (SSE 왕복 대기 없이 반응성 확보)
    const optimisticId = `__opt_${Date.now()}`;
    const optimisticMsg = {
      id: optimisticId,
      chat_id: chatId,
      sender_id: currentUserId,
      content: content.trim(),
      created_at: new Date().toISOString(),
    } as Message;
    setMessages(prev => [...prev, optimisticMsg]);
    // 채팅 목록 최근 메시지 즉시 갱신
    setChatList(prev => prev.map(c => c.id === chatId ? { ...c, lastMessage: content.trim() } : c));
    const { error } = await supabase.from('messages').insert({
      chat_id: chatId, sender_id: currentUserId, content: content.trim()
    });
    if (error) {
      // 전송 실패 시 낙관적 메시지 롤백
      setMessages(prev => prev.filter(m => m.id !== optimisticId));
    }
  };

  const sendImage = async (file: File): Promise<string | null> => {
    if (!chatId || !currentUserId) return null;
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${chatId}/${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage.from('chat-images').upload(path, file, { contentType: file.type || 'image/jpeg' });
    if (error) return error.message;
    if (!data) return '업로드 실패';
    const { data: { publicUrl } } = supabase.storage.from('chat-images').getPublicUrl(data.path);
    const { error: msgErr } = await supabase.from('messages').insert({ chat_id: chatId, sender_id: currentUserId, content: '', image_url: publicUrl });
    if (msgErr) return msgErr.message;
    return null;
  };

  const handleRegisterSeat = async (seat: Seat) => {
    if (!currentUserId) return;
    if (seatingLocked) {
      alert('자리 배치가 잠겼습니다. 관리자 안내에 따라 자리를 배정받으세요.');
      setSeatDialog(null);
      return;
    }
    const { data: fresh } = await supabase.from('seats').select('*').eq('id', seat.id).single();
    if (fresh?.status === 'occupied' && fresh.profile_id !== currentUserId) {
      alert('방금 다른 사람이 이 자리를 등록했습니다.');
      setSeatDialog(null);
      return;
    }
    // 현재 자리가 있으면 먼저 비워주고 새 자리로 이동
    if (currentUserSeat && currentUserSeat.id !== seat.id) {
      await supabase.from('seats').update({ profile_id: null, status: 'empty', registered_at: null }).eq('id', currentUserSeat.id);
    }
    const { error } = await supabase.from('seats').update({ profile_id: currentUserId, status: 'occupied', registered_at: new Date().toISOString() }).eq('id', seat.id);
    if (error) {
      alert('자리 등록에 실패했습니다. 다시 시도해 주세요.');
      return;
    }
    setSeatDialog(null);
    await loadSeats();
  };

  // Auto-register seat from entry QR (no confirmation dialog)
  useEffect(() => {
    if (!autoRegisterSeat) return;
    const seat = autoRegisterSeat;
    setAutoRegisterSeat(null);
    shouldShowStatusAfterSeat.current = true;
    handleRegisterSeat(seat);
  }, [autoRegisterSeat]); // eslint-disable-line react-hooks/exhaustive-deps

  // Navigate to '내 상태' tab after first seat is assigned via entry QR
  useEffect(() => {
    const newId = currentUserSeat?.id ?? null;
    if (!prevUserSeatId.current && newId && shouldShowStatusAfterSeat.current) {
      setMainTab('profiles');
      shouldShowStatusAfterSeat.current = false;
    }
    prevUserSeatId.current = newId;
  }, [currentUserSeat]);

  const reset = () => {
    ls.removeItem(MATCHING_USER_KEY);
    ls.removeItem(MATCHING_DRAFT_KEY);
    setCurrentUserId(null);
    setShownWaiting(false);
    setView('entry-1');
  };

  const handleHeartResponse = async (likerId: string, response: 'accepted' | 'rejected') => {
    if (!currentUserId) return;
    const ht = receivedHeartTypes.get(likerId) ?? 'red';
    await supabase.from('likes').update({ status: response }).eq('liker_id', likerId).eq('liked_id', currentUserId);
    if (response === 'rejected') {
      setReceivedLikers(prev => prev.filter(p => p.id !== likerId));
    } else {
      if (ht === 'green') {
        setAcknowledgedComplimentIds(prev => new Set([...prev, likerId]));
      } else {
        const target = receivedLikers.find(p => p.id === likerId);
        if (target) setContactShareTarget(target);
      }
    }
  };

  const deleteChat = async (chatToDelete: Chat) => {
    if (!confirm('이 채팅방을 삭제하시겠습니까?')) return;
    await supabase.from('messages').delete().eq('chat_id', chatToDelete.id);
    await supabase.from('chats').delete().eq('id', chatToDelete.id);
    setChatList(prev => prev.filter(c => c.id !== chatToDelete.id));
  };

  const deleteAllChats = async () => {
    if (chatList.length === 0) return;
    if (!confirm(`채팅 ${chatList.length}개를 모두 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    for (const chat of chatList) {
      await supabase.from('messages').delete().eq('chat_id', chat.id);
      await supabase.from('chats').delete().eq('id', chat.id);
    }
    setChatList([]);
  };

  const deleteMessage = async (msgId: string) => {
    await supabase.from('messages').delete().eq('id', msgId);
    setMessages(prev => prev.filter(m => m.id !== msgId));
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
          setMainTab(tab === 'fortune' ? 'fortune' : tab === 'status' ? 'status' : tab);
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
          onConfirm={() => handleRegisterSeat(seatDialog)}
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
