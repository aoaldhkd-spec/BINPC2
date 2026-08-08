import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  CheckCircle, X, XCircle,
} from 'lucide-react';
import { supabase, setLocalDbUserId, getSseToken, fetchAndSetSseToken, getDeviceSecret, onSseReconnect, onSseDisconnect } from './lib/supabase';
import { genAvatar } from './lib/profile';
import { HeartType } from './lib/constants';
// ─── 분리된 타입·유틸·컴포넌트 imports ────────────────────────────────────────
import type {
  Profile, Seat, ContactShare, Suggestion, BalanceGame, BalanceVote,
  Chat, View, MainTab, GameState,
} from './types/app';
export type { GameState } from './types/app';
import { heartMeta } from './lib/constants';
import ChatScreen from './components/ChatScreen';
import { ChatErrorBoundary } from './components/ChatErrorBoundary';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import ProfileDetail from './components/ProfileDetail';
import ReconnectOverlay from './components/ReconnectOverlay';
import { SeatRegisterDialog } from './components/SeatRegisterDialog';
import { GameResultModal } from './components/games/GameResultModal';
import { GameActiveBanner } from './components/games/GameActiveBanner';
import { GameAnnouncementModal } from './components/games/GameAnnouncementModal';
import { QaGameOverlay } from './components/games/QaGameOverlay';
import { TableMiniGameModal } from './components/games/TableMiniGameModal';
import { NotifModal } from './components/NotifModal';
import { ConfettiOverlay } from './components/ConfettiOverlay';
import { ContactDisplayModal } from './components/ContactDisplayModal';
import { LikeConfirmDialog } from './components/LikeConfirmDialog';
import { ContactShareModal } from './components/ContactShareModal';
import { ContactViewModal } from './components/ContactViewModal';
import { WaitingOverlay } from './components/WaitingOverlay';
import { NicknameSetupScreen } from './components/NicknameSetupScreen';
import { EntryGateScreen } from './components/EntryGateScreen';
import { ProfileRecoveryScreen } from './components/ProfileRecoveryScreen';
import { TutorialModal } from './components/TutorialModal';
import { ProfileQrModal } from './components/ProfileQrModal';
import { QrScannerModal } from './components/QrScannerModal';
import { ContactRevealModal } from './components/ContactRevealModal';
import {
  MATCHING_USER_KEY, MATCHING_DRAFT_KEY, MATCHING_LAST_RESET_KEY,
  MATCHING_PROFILES_CACHE_KEY,
  ENTRY_VERIFIED_KEY, SCANNED_CONTACTS_KEY,
} from './lib/constants';
import { ls } from './lib/storage';
import { MainScreen } from './components/MainScreen';
import { useSeating } from './hooks/useSeating';
import { useGames } from './hooks/useGames';
import { useHearts } from './hooks/useHearts';
import { useChat } from './hooks/useChat';

// ─── App ──────────────────────────────────────────────────────────────────────




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
    let keyRes: Response | null = null;
    try {
      keyRes = await fetch('/api/db/push/vapid-key', { signal: ctrl.signal }).catch(() => null);
    } finally {
      clearTimeout(timer); // fetch reject/throw 시에도 반드시 타이머 해제
    }
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

    const sseToken = getSseToken();
    if (!sseToken) {
      console.warn('[push] SSE 토큰 없음 — 구독 등록 건너뜀');
      return;
    }
    await fetch('/api/db/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-sse-token': sseToken },
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
  // userId 변경 시 SSE 인증 토큰을 새로 발급받아 연결
  useEffect(() => {
    setLocalDbUserId(currentUserId);
    if (currentUserId) {
      fetchAndSetSseToken(currentUserId).catch((err: unknown) => {
        console.warn('[SSE] token fetch failed — running anonymous SSE', err);
      });
    }
  }, [currentUserId]);

  const _handleChannelStatus = useCallback((status: string) => {
    if (status === 'SUBSCRIBED') {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
      setConnStatus('ok');
    } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      if (reconnectTimerRef.current) return;
      reconnectTimerRef.current = setTimeout(() => {
        setConnStatus('error');
        reconnectTimerRef.current = null;
      }, 800);
      setConnStatus('reconnecting');
    }
  }, []);
  const [appLoading, setAppLoading] = useState(true);
  const [connStatus, setConnStatus] = useState<'ok' | 'reconnecting' | 'error'>('ok');
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sessionActive, setSessionActive] = useState<boolean | null>(null);
  // Existing users skip the waiting overlay entirely and go straight to main.
  // New users go straight to nickname setup — no waiting overlay.
  const [shownWaiting, setShownWaiting] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>(() => {
    try {
      const cached = ls.getItem(MATCHING_PROFILES_CACHE_KEY);
      if (!cached) return [];
      const parsed = JSON.parse(cached);
      return Array.isArray(parsed) ? (parsed as Profile[]) : [];
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
  const [fortuneCompatTarget, setFortuneCompatTarget] = useState<string | undefined>(undefined);
  const [showTutorialModal, setShowTutorialModal] = useState(false);
  const [tutorialPage, setTutorialPage] = useState(0);
  const [showProfileQr, setShowProfileQr] = useState(false);
  const [showContactQr, setShowContactQr] = useState(false);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [scannedContactProfile, setScannedContactProfile] = useState<import('./types/app').Profile | null>(null);

  // ── 스캔한 연락처 (localStorage 영구 보관) ─────────────────────────────────
  type ScannedContact = {
    id: string; nickname: string; mbti?: string | null; photo_url?: string | null;
    kakao_id?: string | null; instagram_id?: string | null; phone_number?: string | null;
    contact_private?: boolean | null; scanned_at: string;
  };
  const [scannedContacts, setScannedContacts] = useState<ScannedContact[]>(() => {
    try { return JSON.parse(ls.getItem(SCANNED_CONTACTS_KEY) ?? '[]') as ScannedContact[]; } catch { return []; }
  });
  const saveScannedContact = (profile: import('./types/app').Profile) => {
    if (!profile.id) return;
    const entry: ScannedContact = {
      id: profile.id,
      nickname: (profile as { nickname?: string }).nickname ?? '?',
      mbti: profile.mbti,
      photo_url: profile.photo_url,
      kakao_id: (profile as { kakao_id?: string | null }).kakao_id,
      instagram_id: (profile as { instagram_id?: string | null }).instagram_id,
      phone_number: (profile as { phone_number?: string | null }).phone_number,
      contact_private: (profile as { contact_private?: boolean | null }).contact_private,
      scanned_at: new Date().toISOString(),
    };
    setScannedContacts(prev => {
      const filtered = prev.filter(c => c.id !== entry.id);
      const next = [entry, ...filtered].slice(0, 50);
      try { ls.setItem(SCANNED_CONTACTS_KEY, JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  };
  const isNewRegistration = useRef(false);
  // 항상 최신 profiles를 가리키는 ref (stale 클로저 방지)
  const profilesRef = useRef<Profile[]>([]);
  // loadProfiles 최신 참조 — loading-main 지수 백오프에서 stale 클로저 없이 사용
  const loadProfilesRef = useRef<() => Promise<Profile[]>>(async () => []);
  // SSE fallback polling refs — SSE 끊김 중 채팅·하트 polling에 사용 (stale 클로저 방지)
  const loadChatListRef = useRef<((userId: string) => Promise<void>) | null>(null);
  // 채팅방별 미전송 초안 보존 — 뒤로가기 후 재진입 시 복원
  const chatDraftRef = useRef<Map<string, string>>(new Map());
  const loadReceivedLikesRef = useRef<((userId: string) => Promise<void>) | null>(null);
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
  const [timerEndAt, setTimerEndAt] = useState<string | null>(null);
  const [timerLabel, setTimerLabel] = useState<string | null>(null);
  const [rejectionNotif, setRejectionNotif] = useState<string | null>(null); // nickname of person who rejected
  const [bottomNotif, setBottomNotif] = useState<{ type: 'heart' | 'chat' | 'message' | 'contact'; nickname: string; heartType?: HeartType } | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const confettiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confettiInnerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerConfetti = useCallback(() => {
    // 뷰 전환 시 이전 타이머 취소 가능하도록 ref에 저장
    if (confettiTimerRef.current) clearTimeout(confettiTimerRef.current);
    if (confettiInnerTimerRef.current) clearTimeout(confettiInnerTimerRef.current);
    setShowConfetti(false);
    confettiTimerRef.current = setTimeout(() => {
      setShowConfetti(true);
      confettiTimerRef.current = null;
      // 애니메이션 완료 후 반드시 false로 리셋:
      // ConfettiOverlay가 view 전환(profile↔main)으로 언마운트→재마운트될 때
      // show=true 잔류 상태로 인해 폭죽이 재발사되는 버그를 방지한다.
      confettiInnerTimerRef.current = setTimeout(() => {
        confettiInnerTimerRef.current = null;
        setShowConfetti(false);
      }, 2100);
    }, 30);
  }, []);
  const [seatingLocked, setSeatingLocked] = useState(false);
  const [functionsLocked, setFunctionsLocked] = useState(false);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState<string | null>(null);
  const [entryPassword, setEntryPassword] = useState<string | null>(null); // null = 아직 로드 전
  const [entryVerified, setEntryVerified] = useState(false);
  const [darkMode, setDarkMode] = useState(() => ls.getItem('dark_mode') === '1');
  // 테마 전환 시 dark_mode 동기화 (theme.tsx에서 storage 이벤트 발화)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'dark_mode') setDarkMode(e.newValue === '1');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // loading-main 무한 갇힘 방지 — 지수 백오프 재시도(최대 3회) + 강제 전환
  // ※ Rules of Hooks: 모든 useEffect는 조건부 return 이전에 위치해야 함
  useEffect(() => {
    if (view !== 'loading-main') return;
    let cancelled = false;

    // 빠른 경로: 프로필이 이미 로드돼 있으면 200ms 내 main 전환
    const pollId = setInterval(() => {
      if (cancelled) { clearInterval(pollId); return; }
      if ((profilesRef.current?.length ?? 0) > 0) {
        clearInterval(pollId);
        setView('main');
      }
    }, 200);

    // 지수 백오프 재시도 — 고부하(100명 동시 진입)로 서버 응답이 늦어도 재시도로 극복
    // 첫 재시도: 1초, 두 번째: 2초, 세 번째: 4초 후 최종 강제 전환
    let attempt = 0;
    const MAX_ATTEMPTS = 3;
    const BASE_DELAY_MS = 1_000;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRetry = (delay: number) => {
      retryTimer = setTimeout(async () => {
        if (cancelled) return;
        attempt++;
        try {
          const loaded = await loadProfilesRef.current();
          if (cancelled) return;
          if ((loaded?.length ?? 0) > 0) {
            clearInterval(pollId);
            setView('main');
            return;
          }
        } catch {
          // 네트워크 오류 → 다음 재시도로 계속
        }
        if (!cancelled) {
          if (attempt < MAX_ATTEMPTS) {
            scheduleRetry(BASE_DELAY_MS * Math.pow(2, attempt));
          } else {
            // 최대 재시도 소진 → 강제 전환 (프로필 없어도 main으로)
            clearInterval(pollId);
            setView('main');
          }
        }
      }, delay);
    };

    scheduleRetry(BASE_DELAY_MS); // 1초 후 첫 재시도

    return () => {
      cancelled = true;
      clearInterval(pollId);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [view]); // loadProfilesRef는 ref이므로 deps 불필요

  // SSE 연결 실패 시 polling fallback — SSE 없이도 프로필·채팅·하트 최소 기능 유지
  // connStatus가 'error'로 전환되면 5초마다 재로드 (SSE 복구 시 자동 정지, 중복 없음)
  useEffect(() => {
    if (connStatus !== 'error' || !currentUserId) return;
    const uid = currentUserId;
    const pollId = setInterval(() => {
      loadProfilesRef.current().catch(() => {});
      loadChatListRef.current?.(uid).catch(() => {});
      loadReceivedLikesRef.current?.(uid).catch(() => {});
    }, 5_000);
    return () => { clearInterval(pollId); };
  }, [connStatus, currentUserId]);

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
    balanceGames, setBalanceGames, voteCounts, setVoteCounts, myVotes,
    gameEndResult, setGameEndResult, incomingTableGame, setIncomingTableGame,
    loadBalanceGames, loadMyVotes, voteOnGame, voteOnImageGame,
    createTableGame, endBalanceGame, broadcastTableGame,
  } = useGames(currentUserId, seats, profiles);

  const {
    chatId, setChatId, chatIdRef, selfInitiatedPairRef, messages, chatList, setChatList, chatListRef,
    unreadChatCounts, setUnreadChatCounts, newMsgCount, setNewMsgCount,
    loadChatList, openChat, sendMessage, sendImage,
    deleteChat, deleteAllChats, deleteMessage,
  } = useChat({ currentUserId, profilesRef, setSelectedProfile, setView, setBottomNotif });

  const {
    likedIds, setLikedIds, sentHeartTypes, setSentHeartTypes, sentHeartsPerPerson, setSentHeartsPerPerson,
    receivedHeartTypes, setReceivedHeartTypes, likeStatuses, setLikeStatuses,
    receivedLikers, setReceivedLikers, contactSharedWithIds,
    acknowledgedComplimentIds, setAcknowledgedComplimentIds, receivedContactShares, setReceivedContactShares,
    likeConfirmTarget, setLikeConfirmTarget, contactShareTarget, setContactShareTarget,
    loadLikes, loadReceivedLikes, loadContactShareData, likedByTypeRecord,
    handleLike, executeLike, handleHeartResponse, handleContactShare, handleContactShareReject,
    likeError, setLikeError,
  } = useHearts(currentUserId, profiles, profileMap, openChat);

  // 하트 전송 실패 알림 — executeLike가 error를 set하면 바텀 토스트로 표시
  useEffect(() => {
    if (!likeError) return;
    setBottomNotif({ type: 'chat', nickname: likeError });
    const t = setTimeout(() => { setBottomNotif(null); setLikeError(null); }, 4_000);
    return () => clearTimeout(t);
  }, [likeError, setLikeError]);

  // SSE fallback polling refs 동기화 — 렌더마다 최신 함수를 가리키도록 (stale 클로저 방지)
  loadChatListRef.current = loadChatList;
  loadReceivedLikesRef.current = loadReceivedLikes;

  // 하트 보내는 쪽도 폭죽 🎊
  const execLikeWithConfetti = useCallback((...args: Parameters<typeof executeLike>) => {
    executeLike(...args);
    triggerConfetti();
  }, [executeLike, triggerConfetti]);

  // 기능 잠금 중에는 하트 전송 차단 (LOCKED_TABS와 동일한 보호 수준)
  const handleLikeGuarded = useCallback((profileId: string) => {
    if (functionsLocked) return;
    handleLike(profileId);
  }, [functionsLocked, handleLike]);

  const currentUserSeat = seats.find((s) => s.profile_id === currentUserId) ?? null;
  // Keep ref updated so notification channel can check user's table without stale closure
  userTableNumRef.current = currentUserSeat?.table_number ?? null;

  useEffect(() => {
    let cancelled = false;
    // 네트워크 지연 시 fallback — 세 조건 모두 해제해야 로딩 스피너가 사라짐
    // 300ms: Vite 콜드컴파일·서버 기동 후 충분한 여유, 체감 대기 최소화
    const timeout = setTimeout(() => {
      if (!cancelled) {
        setAppLoading(false);
        setSessionActive(prev => prev ?? true);
        setEntryPassword(prev => prev ?? '');
      }
    }, 300);
    supabase.from('app_settings').select('session_active, game_state, timer_end_at, timer_label, seating_locked, active_tables, reset_signal, table_labels, reset_password, entry_password').eq('id', 1).single().then(({ data }: { data: any }) => {
      if (cancelled) return;
      clearTimeout(timeout);
      setAppLoading(false);
      // loading 게이트 해제는 reset 분기보다 먼저 — early return 시에도 앱이 멈추지 않도록
      const ep = (data as { entry_password?: string | null })?.entry_password ?? '';
      setSessionActive(data?.session_active ?? false);
      setEntryPassword(ep);
      setEntryVerified(!ep || ls.getItem(ENTRY_VERIFIED_KEY) === ep);
      const localReset = ls.getItem(MATCHING_LAST_RESET_KEY);
      const serverReset = data?.reset_signal ?? null;
      if (serverReset && serverReset !== localReset) {
        // 신규 브라우저(localStorage 없음)에서는 reset_signal이 항상 다름 →
        // 기존: early return 전에 sessionActive/entryPassword 미설정 → 무한 로딩
        // 수정: 이미 위에서 설정 완료 후 reset 처리 진행
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
      setTimerEndAt(data?.timer_end_at ?? null);
      setTimerLabel(data?.timer_label ?? null);
      if (data?.seating_locked != null) setSeatingLocked(data.seating_locked);
      if (data?.functions_locked != null) setFunctionsLocked(data.functions_locked);
      setResetPassword((data as { reset_password?: string | null })?.reset_password ?? null);
      const gs = data?.game_state as GameState | null;
      if (gs?.active) { setCurrentGame(gs); setGameModalVisible(true); }
    }).catch(() => {});
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
          // 추가 상태 초기화 — 하트·알림·게임이 리셋 후에도 남아있는 버그 방지
          setSentHeartTypes(new Map());
          setSentHeartsPerPerson(new Map());
          setActiveNotif(null);
          setCurrentGame(null);
          setGameModalVisible(false);
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
        if ((p as any).functions_locked != null) setFunctionsLocked((p as any).functions_locked);
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
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        // 관리자가 알림을 비활성화 시 현재 표시 중인 알림 즉시 닫기
        const n = payload.new as { id: string; is_active: boolean };
        if (!n.is_active) setActiveNotif(prev => prev?.id === n.id ? null : prev);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'notifications' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        // 관리자가 알림을 삭제 시 표시 중이면 즉시 닫기
        const n = payload.old as { id: string };
        setActiveNotif(prev => prev?.id === n.id ? null : prev);
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
    // 알림 자동소거 타이머 ID 추적 — 언마운트 시 clearTimeout으로 누수 방지
    const shareNotifTimerIds: ReturnType<typeof setTimeout>[] = [];
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
          shareNotifTimerIds.push(setTimeout(() => setShareEventNotif(null), 5000));
          loadContactShareData(myId);
        } else if (row.event_type === 'rejected') {
          setShareEventNotif({ type: 'rejected', fromUserId: row.from_user_id });
          shareNotifTimerIds.push(setTimeout(() => setShareEventNotif(null), 5000));
        }
      })
      .subscribe();

    return () => {
      cancelled = true;
      clearTimeout(timeout); // 언마운트 시 타임아웃 정리 (메모리 누수 방지)
      shareNotifTimerIds.forEach(clearTimeout);
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
  // loading-main 지수 백오프 재시도에서 항상 최신 함수 참조 유지
  loadProfilesRef.current = loadProfiles;


  const loadSuggestions = useCallback(async (userId: string) => {
    const { data } = await supabase.from('suggestions').select('*').eq('profile_id', userId).order('created_at', { ascending: false });
    if (data) setSuggestions(data as Suggestion[]);
  }, []);


  const submitAnonymousReport = async (content: string, tableNumber: number | null) => {
    if (!content.trim()) return;
    const { error } = await supabase.from('anonymous_reports').insert({ content: content.trim(), table_number: tableNumber });
    if (error) throw new Error(error.message ?? '전송 실패');
  };


  useEffect(() => {
    if (!currentUserId) return;
    // #52: 계정 전환 시 이전 유저의 하트 상태가 잠깐 보이는 현상 방지
    // 새 userId로 로드하기 전에 상태를 즉시 비움
    setLikedIds(new Set());
    setSentHeartTypes(new Map());
    setSentHeartsPerPerson(new Map());
    setReceivedHeartTypes(new Map());
    setLikeStatuses(new Map());
    setReceivedLikers([]);
    // 타이머 ID 추적 — 언마운트 시 clearTimeout으로 stale setState 방지
    let retryTimerId: ReturnType<typeof setTimeout> | null = null;
    let initTimerId1: ReturnType<typeof setTimeout> | null = null;
    let initTimerId2: ReturnType<typeof setTimeout> | null = null;
    const rejNotifTimerIds: ReturnType<typeof setTimeout>[] = [];
    // cancelled 플래그 — 언마운트 후 비동기 콜백이 setState를 호출하는 것을 방지
    let cancelled = false;
    loadProfiles().catch(() => []).then((allProfiles) => {
      if (cancelled) return;
      // 프로필 목록이 비어있으면 서버 기동 중이거나 네트워크 오류 — 세션 유지
      // 실제 프로필 삭제는 reset_signal SSE로 처리되므로 여기서 aggressive하게 지우지 않음
      if (!allProfiles || allProfiles.length === 0) return;
      // 신규 가입 직후: DB 반영 지연으로 인한 false-positive 세션 삭제 방지
      // isNewRegistration이 true이면 방금 insert한 프로필이므로 삭제하지 않고 바로 main으로 이동
      if (isNewRegistration.current) {
        isNewRegistration.current = false;
        setView('main');
        setMainTab('status');
        return;
      }
      // If the profile no longer exists (e.g. admin reset the session), clear stale state
      // 안정성: DB 전파 지연으로 인한 false-positive 방지 — 2초 후 한 번 더 확인
      if (!allProfiles.some((p: { id: string }) => p.id === currentUserId)) {
        retryTimerId = setTimeout(async () => {
          const retry = await loadProfiles();
          if (retry.length > 0 && !retry.some((p: { id: string }) => p.id === currentUserId)) {
            ls.removeItem(MATCHING_USER_KEY);
            ls.removeItem(MATCHING_DRAFT_KEY);
            setCurrentUserId(null);
            setShownWaiting(false);
            setView('entry-1');
          }
        }, 2000);
        return;
      }
      setView('main');
      // 고유번호 없는 기존 사용자 자동 생성
      const me = allProfiles.find((p: { id: string }) => p.id === currentUserId);
      if (me && !(me as { pin_code?: string | null }).pin_code) {
        (async () => {
          try {
            const { data: existingPins } = await supabase.from('profiles').select('pin_code');
            const usedPins = new Set((existingPins ?? []).map((p: { pin_code: string | null }) => p.pin_code).filter(Boolean));
            let newPin = String(Math.floor(1000 + Math.random() * 9000));
            while (usedPins.has(newPin)) newPin = String(Math.floor(1000 + Math.random() * 9000));
            await supabase.from('profiles').update({ pin_code: newPin }).eq('id', currentUserId);
            setProfiles(prev => prev.map(p => p.id === currentUserId ? { ...p, pin_code: newPin } : p));
          } catch (err) {
            console.warn('[pin-gen] 고유번호 자동 생성 실패:', err);
          }
        })();
      }
    });
    loadSeats();
    loadLikes(currentUserId);
    loadReceivedLikes(currentUserId);
    initTimerId1 = setTimeout(() => {
      loadContactShareData(currentUserId);
      loadChatList(currentUserId);
    }, 300);
    initTimerId2 = setTimeout(() => {
      loadSuggestions(currentUserId);
      loadBalanceGames();
      loadMyVotes(currentUserId);
    }, 600);

    // ── ?share=<profileId> 처리: 연락처 QR 스캔 → 연락처 모달 표시 ──
    if (pendingShareId && pendingShareId !== currentUserId) {
      window.history.replaceState({}, '', window.location.pathname);
      (async () => {
        try {
          const { data: shareProfile } = await supabase.from('profiles').select('*').eq('id', pendingShareId).maybeSingle();
          if (!shareProfile) return;
          const p = shareProfile as import('./types/app').Profile;
          saveScannedContact(p);
          setScannedContactProfile(p);
        } catch (err) {
          console.warn('[share-profile] QR 스캔 프로필 로드 실패:', err);
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
            rejNotifTimerIds.push(setTimeout(() => setRejectionNotif(null), 5000));
          } else if (updated.status === 'accepted') {
            loadContactShareData(currentUserId);
            // 수락 알림: 보낸 사람에게도 피드백 제공
            const acceptedProfile = profilesRef.current.find(p => p.id === updated.liked_id);
            const nick = acceptedProfile?.nickname ?? '상대방';
            setBottomNotif({ type: 'chat', nickname: `💚 ${nick}님이 하트를 수락했어요` });
            rejNotifTimerIds.push(setTimeout(() => setBottomNotif(prev => prev?.nickname === `💚 ${nick}님이 하트를 수락했어요` ? null : prev), 5000));
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
              triggerConfetti();
            }
          } catch (e) { console.warn('[realtime:likes]', e); }
        })
      // 받은 하트의 상태 변경(수락/거절)을 실시간 반영 — INSERT 전용이면 다른 기기에서 처리한 수락이 누락됨
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'likes', filter: `liked_id=eq.${currentUserId}` },
        () => { loadReceivedLikesRef.current?.(currentUserId).catch(() => {}); })
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

    // chats 생성/삭제 감지 — messages 구독은 별도 perChatChannels 로 분리 (서버 사이드 필터 적용)
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
      // Bug fix: 상대방이 채팅방을 삭제해도 내 목록에서 즉시 제거
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chats' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        const c = payload.old as { id?: string };
        if (!c.id) return;
        setChatList(prev => {
          const next = prev.filter(x => x.id !== c.id);
          chatListRef.current = next;
          return next;
        });
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
        }).catch(() => {});
      }, 150);
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
          // setState 중첩 금지: queueMicrotask로 updater 밖에서 setGameEndResult 호출
          setVoteCounts(prev => {
            const counts = prev.get(updated.id) || { a: 0, b: 0 };
            queueMicrotask(() => setGameEndResult({ game: updated, counts }));
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
      cancelled = true;
      if (retryTimerId) clearTimeout(retryTimerId);
      if (initTimerId1) clearTimeout(initTimerId1);
      if (initTimerId2) clearTimeout(initTimerId2);
      rejNotifTimerIds.forEach(clearTimeout);
      if (seatsRefreshTimer) clearTimeout(seatsRefreshTimer);
      // reconnectTimerRef는 effect 외부 ref이므로 여기서도 정리
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
      if (confettiTimerRef.current) { clearTimeout(confettiTimerRef.current); confettiTimerRef.current = null; }
      if (confettiInnerTimerRef.current) { clearTimeout(confettiInnerTimerRef.current); confettiInnerTimerRef.current = null; }
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

  // #24: SSE 연결 상태 변화 → connStatus 동기화 + 재연결 시 채팅목록·받은하트 즉시 리로드
  // onSseDisconnect: SSE 오류 첫 감지 시 'reconnecting' → 1.5s 후 'error' (fallback polling 시작)
  // onSseReconnect:  재연결 성공 시 'ok'로 복귀 (fallback polling 자동 정지) + 놓친 데이터 리로드
  useEffect(() => {
    const unsubDisconnect = onSseDisconnect(() => {
      _handleChannelStatus('CLOSED');
    });
    return unsubDisconnect;
  }, [_handleChannelStatus]);

  useEffect(() => {
    if (!currentUserId) return;
    const unsubReconnect = onSseReconnect(() => {
      _handleChannelStatus('SUBSCRIBED');
      loadChatList(currentUserId);
      loadReceivedLikes(currentUserId);
      loadLikes(currentUserId);          // 보낸 하트 상태도 재동기화
      // SSE 재연결 시 누락된 시트·프로필·설정 변경도 동기화
      loadSeats();
      loadProfiles();
      // 재연결 중 바뀐 타이머·게임·잠금 상태 재동기화
      supabase.from('app_settings').select('session_active, game_state, timer_end_at, timer_label, seating_locked, active_tables, reset_signal, table_labels').eq('id', 1).single().then(({ data }: { data: any }) => {
        if (!data) return;
        setSessionActive(data.session_active);
        setTimerEndAt(data.timer_end_at ?? null);
        setTimerLabel(data.timer_label ?? null);
        if (data.seating_locked != null) setSeatingLocked(data.seating_locked);
        const gs = data.game_state as GameState | null;
        if (gs?.active) {
          setCurrentGame(gs);
          setGameModalVisible(true);
        } else {
          setCurrentGame(null);
          setGameModalVisible(false);
        }
      }).catch(() => {});
    });
    return unsubReconnect;
  // [Part1-Fix5] loadLikes·loadSeats·loadProfiles deps 추가 — stale closure 차단
  }, [currentUserId, loadChatList, loadReceivedLikes, loadLikes, loadSeats, loadProfiles, _handleChannelStatus]);


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
    setRegistrationError(null);
    // Generate unique PIN code (4-digit normally; 5-digit when >8000 profiles)
    const { data: existingPins } = await supabase.from('profiles').select('pin_code');
    const usedPins = new Set((existingPins ?? []).map((p: { pin_code: string | null }) => p.pin_code).filter(Boolean));
    const use5Digit = usedPins.size > 8000;
    const poolSize = use5Digit ? 90000 : 9000;
    if (usedPins.size >= poolSize) {
      setRegistrationError('현재 정원이 가득 찼습니다. 운영진에 문의하세요.');
      setLoading(false);
      return;
    }
    const genPin = () => use5Digit
      ? String(Math.floor(10000 + Math.random() * 90000))
      : String(Math.floor(1000 + Math.random() * 9000));
    let pinCode = genPin();
    let pinTries = 0;
    while (usedPins.has(pinCode) && pinTries++ < 100) pinCode = genPin();

    // 프로필 ID를 클라이언트에서 미리 생성 — SSE 기기 secret을 INSERT와 원자적으로 바인딩하기 위함
    const newProfileId = crypto.randomUUID();
    const { data: profile, error } = await supabase
      .from('profiles')
      .insert({
        id: newProfileId,
        _device_secret: getDeviceSecret(newProfileId), // 서버가 HMAC 저장 후 필드 제거
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
        setRegistrationError('이미 사용 중인 닉네임입니다. 다른 닉네임을 선택해 주세요.');
      } else if (error.code === 'PIN_EXHAUSTED') {
        setRegistrationError('현재 정원이 가득 찼습니다. 운영진에 문의하세요.');
      } else {
        setRegistrationError(`오류가 발생했습니다: ${error.message}`);
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

  const handleProfileRecovery = async (profileId: string) => {
    setLoading(true);
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', profileId)
      .single();
    if (profile) {
      ls.setItem(MATCHING_USER_KEY, profile.id);
      ls.removeItem(MATCHING_DRAFT_KEY);
      // isNewRegistration = true → useEffect가 false-positive 체크(setView('entry-1') 타임아웃)를
      // 건너뛰고 바로 setView('main')으로 이동 (handleNicknameSetup과 동일 패턴)
      isNewRegistration.current = true;
      setProfiles(prev => prev.some(p => p.id === profile.id) ? prev : [profile as Profile, ...prev]);
      setCurrentUserId(profile.id);
      setView('loading-main'); // 복구 확인 중 spinner 표시
    } else {
      alert('프로필을 찾을 수 없습니다. 관리자에게 문의하세요.');
      setView('entry-1');
    }
    setLoading(false);
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

  // showWaiting: WaitingOverlay를 표시할 조건
  //   - 프로필 없음(신규 접속자) → 항상 대기 화면
  //   - 프로필 있어도 sessionActive=false → 회의 시작 전이면 차단
  //   - shownWaiting: 입장하기 클릭 or 회의 시작 감지 후 true
  const showWaiting = !shownWaiting && (!currentUserId || sessionActive === false);
  // QR 스캔 후 미등록 사용자: 자리 QR URL 파라미터는 pendingSeatId/pendingSeatPath에 보존됨.
  // 등록 완료 후 currentUserId useEffect에서 자동으로 자리 배정 처리됨

  if (appLoading || sessionActive === null || entryPassword === null) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="w-12 h-12 rounded-full border-4 border-teal-500/30 border-t-teal-500 animate-spin" />
      <p className="text-base font-black text-white">서버랑 X스 중입니다...</p>
      <p className="text-sm font-bold text-slate-400">조ㄹ라 잠시만 기다려주세요! 🍺</p>
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
    onRecover={handleProfileRecovery}
  />;

  if (view === 'loading-main') return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 rounded-full border-4 border-teal-500/30 border-t-teal-500 animate-spin" />
      <p className="text-sm text-slate-400 font-semibold">프로필 저장 중...</p>
    </div>
  );

  if (view === 'entry-recover') return (
    <ProfileRecoveryScreen
      onRecover={handleProfileRecovery}
      onBack={() => setView('entry-1')}
    />
  );

  if (view === 'entry-1') return (
    <NicknameSetupScreen
      onSubmit={handleNicknameSetup}
      loading={loading}
      registrationError={registrationError}
      onReset={reset}
      onShowRecovery={() => setView('entry-recover')}
    />
  );

  if (view === 'profile' && selectedProfile) return (
    <AppErrorBoundary screenName="프로필" onReset={() => setView('main')}>
    <>
      {currentGame?.active && gameModalVisible && <GameAnnouncementModal game={currentGame} onDismiss={() => setGameModalVisible(false)} onVote={voteOnGame} onImageVote={voteOnImageGame} currentUserId={currentUserId} seats={seats} profiles={profiles} />}
      {currentGame?.active && !gameModalVisible && <GameActiveBanner game={currentGame} onClick={() => setGameModalVisible(true)} />}
      <ProfileDetail
        profile={selectedProfile}
        isMe={selectedProfile.id === currentUserId}
        isLiked={likedIds.has(selectedProfile.id)}
        heartType={sentHeartTypes.get(selectedProfile.id)}
        sentHeartsCount={sentHeartsPerPerson.get(selectedProfile.id)?.size ?? 0}
        locked={seatingLocked || functionsLocked}
        onLike={() => { if (!seatingLocked && !functionsLocked) handleLike(selectedProfile.id); }}
        onChat={() => { openChat(selectedProfile); }}
        onBack={() => { setLikeConfirmTarget(null); setView('main'); }}
        onViewFortune={selectedProfile.birth_year && selectedProfile.birth_month && selectedProfile.birth_day ? () => {
          setFortuneCompatTarget(selectedProfile.id);
          setMainTab('fortune');
          setLikeConfirmTarget(null);
          setView('main');
        } : undefined}
      />
      {likeConfirmTarget && (
        <LikeConfirmDialog
          target={likeConfirmTarget}
          likedByType={likedByTypeRecord()}
          sentTypesForTarget={sentHeartsPerPerson.get(likeConfirmTarget.id) ?? new Set()}
          onConfirm={execLikeWithConfetti}
          onCancel={() => setLikeConfirmTarget(null)}
        />
      )}
      <ConfettiOverlay show={showConfetti} />
    </>
    </AppErrorBoundary>
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
    <ChatErrorBoundary onReset={() => { chatIdRef.current = null; setChatId(null); setView('main'); }}>
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
          onUpdateProfile={(update) => setProfiles(prev => prev.map(p => p.id === update.id ? { ...p, ...update } : p))}
          initialInput={chatDraftRef.current.get(chatId) ?? ''}
          onInputChange={(v) => chatDraftRef.current.set(chatId, v)}
        />
      </>
    </ChatErrorBoundary>
  );

  return (
    <>
      {/* Tutorial modal */}
      {showTutorialModal && (
        <TutorialModal
          page={tutorialPage}
          onChangePage={setTutorialPage}
          onClose={() => {
            setShowTutorialModal(false);
          }}
          darkMode={darkMode}
        />
      )}

      {/* Reconnect overlay */}
      {connStatus !== 'ok' && (
        <ReconnectOverlay status={connStatus} onRetry={() => window.location.reload()} />
      )}
      {/* Broadcast notification modal */}
      {activeNotif && (
        <AppErrorBoundary screenName="공지 알림" onReset={() => setActiveNotif(null)}>
          <NotifModal notif={activeNotif} onClose={() => setActiveNotif(null)} />
        </AppErrorBoundary>
      )}
      {/* Heart rejection notification */}
      {rejectionNotif && (
        <AppErrorBoundary screenName="거절 알림" onReset={() => setRejectionNotif(null)}>
          <div className="fixed bottom-20 left-0 right-0 z-[150] flex justify-center px-4 pointer-events-none">
            <div className="bg-gray-800 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 pointer-events-auto animate-bounce">
              <span className="text-lg">💔</span>
              <div>
                <p className="text-sm font-bold">{rejectionNotif}님이 하트를 거절했습니다</p>
              </div>
              <button onClick={() => setRejectionNotif(null)} className="text-white/60 hover:text-white text-lg ml-2">×</button>
            </div>
          </div>
        </AppErrorBoundary>
      )}
      {/* Bottom notification: new heart / chat */}
      {bottomNotif && (
        <AppErrorBoundary screenName="하단 알림" onReset={() => setBottomNotif(null)}>
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
                    <button onClick={() => { setMainTab('chats'); setBottomNotif(null); }} className="text-xs text-white/90 bg-white/20 px-2 py-0.5 rounded-lg font-semibond mt-0.5">채팅탭</button>
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
        </AppErrorBoundary>
      )}
      {/* Balance game result modal - appears on any tab when a game ends */}
      {gameEndResult && (
        <AppErrorBoundary screenName="게임 결과" onReset={() => setGameEndResult(null)}>
          <GameResultModal game={gameEndResult.game} counts={gameEndResult.counts} onClose={() => setGameEndResult(null)} />
        </AppErrorBoundary>
      )}
      {/* Q&A Game Overlay (전체 공지) */}
      {activeQaGame && qaOverlayVisible && (
        <AppErrorBoundary screenName="Q&A 게임" onReset={() => setQaOverlayVisible(false)}>
          <QaGameOverlay
            game={activeQaGame}
            currentUserId={currentUserId}
            currentUserNickname={profileMap.get(currentUserId ?? '')?.nickname ?? null}
            seats={seats}
            alreadySubmitted={qaSubmittedIds.has(activeQaGame.id)}
            onSubmitted={() => setQaSubmittedIds(prev => new Set([...prev, activeQaGame.id]))}
            onDismiss={() => setQaOverlayVisible(false)}
          />
        </AppErrorBoundary>
      )}
      {/* Game Announcement Modal (전체 알림) */}
      {currentGame?.active && gameModalVisible && (
        <AppErrorBoundary screenName="게임 공지" onReset={() => setGameModalVisible(false)}>
          <GameAnnouncementModal game={currentGame} onDismiss={() => setGameModalVisible(false)} onVote={voteOnGame} onImageVote={voteOnImageGame} currentUserId={currentUserId} seats={seats} profiles={profiles} />
        </AppErrorBoundary>
      )}
      {/* Game Active Banner (모달 닫은 후 상단 표시) */}
      {currentGame?.active && !gameModalVisible && (
        <AppErrorBoundary screenName="게임 배너" onReset={() => setGameModalVisible(false)}>
          <GameActiveBanner game={currentGame} onClick={() => setGameModalVisible(true)} />
        </AppErrorBoundary>
      )}
      <AppErrorBoundary screenName="메인 화면" onReset={() => { setView('main'); setMainTab('profiles'); }}>
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
        onLike={handleLikeGuarded}
        onSelect={(p) => { setLikeConfirmTarget(null); setSelectedProfile(p); setView('profile'); }}
        onReset={reset}
        onProfileClickFromMap={(p) => { setLikeConfirmTarget(null); setSelectedProfile(p); setView('profile'); }}
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
        darkMode={darkMode}
        onToggleDark={() => { const next = !darkMode; setDarkMode(next); ls.setItem('dark_mode', next ? '1' : '0'); }}
        onShowQr={() => setShowProfileQr(true)}
        onShowContactQr={() => setShowContactQr(true)}
        onScanQr={() => setShowQrScanner(true)}
        scannedContacts={scannedContacts}
        onClearScannedContact={(id) => setScannedContacts(prev => {
          const next = prev.filter(c => c.id !== id);
          try { ls.setItem(SCANNED_CONTACTS_KEY, JSON.stringify(next)); } catch {}
          return next;
        })}
        seatingLocked={seatingLocked}
        functionsLocked={functionsLocked}
        onShowTutorial={() => { setTutorialPage(0); setShowTutorialModal(true); }}
        newMsgCount={newMsgCount}
        onClearMsgCount={() => setNewMsgCount(0)}
        unreadChatCounts={unreadChatCounts}
        onClearChatUnread={(chatId) => setUnreadChatCounts(prev => { const n = { ...prev }; delete n[chatId]; return n; })}
        resetPassword={resetPassword}
        onBroadcastGame={broadcastTableGame}
        fortuneCompatTarget={fortuneCompatTarget}
      />
      </AppErrorBoundary>
      {/* Table Mini-Game Modal (테이블 동기 게임 결과) */}
      {incomingTableGame && (
        <AppErrorBoundary screenName="테이블 게임" onReset={() => setIncomingTableGame(null)}>
          <TableMiniGameModal
            session={incomingTableGame}
            onClose={() => setIncomingTableGame(null)}
          />
        </AppErrorBoundary>
      )}
      {seatDialog && (
        <AppErrorBoundary screenName="자리 등록" onReset={() => setSeatDialog(null)}>
          <SeatRegisterDialog
            seat={seatDialog}
            currentUserSeat={currentUserSeat}
            onConfirm={() => handleRegisterSeat(seatDialog, seatingLocked, currentUserSeat)}
            onCancel={() => setSeatDialog(null)}
          />
        </AppErrorBoundary>
      )}
      {likeConfirmTarget && (
        <LikeConfirmDialog
          target={likeConfirmTarget}
          likedByType={likedByTypeRecord()}
          sentTypesForTarget={sentHeartsPerPerson.get(likeConfirmTarget.id) ?? new Set()}
          onConfirm={execLikeWithConfetti}
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
      {showContactQr && currentUserId && profileMap.get(currentUserId) && (
        <ContactDisplayModal
          profile={profileMap.get(currentUserId)!}
          onClose={() => setShowContactQr(false)}
        />
      )}
      {/* QR 카메라 스캐너 */}
      {showQrScanner && (
        <QrScannerModal
          darkMode={darkMode}
          onClose={() => setShowQrScanner(false)}
          onDetected={async (profileId) => {
            setShowQrScanner(false);
            const cached = profiles.find(p => p.id === profileId);
            if (cached) { saveScannedContact(cached); setScannedContactProfile(cached); return; }
            const { data } = await supabase.from('profiles').select('*').eq('id', profileId).maybeSingle();
            if (data) { saveScannedContact(data as import('./types/app').Profile); setScannedContactProfile(data as import('./types/app').Profile); }
          }}
        />
      )}
      {/* 연락처 스캔 결과 모달 */}
      {scannedContactProfile && (
        <ContactRevealModal
          profile={scannedContactProfile}
          darkMode={darkMode}
          onClose={() => setScannedContactProfile(null)}
        />
      )}
      <ConfettiOverlay show={showConfetti} />
    </>
  );
}


// ─── Profile Detail ───────────────────────────────────────────────────────────


export default App;
