import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import {
  X,
} from 'lucide-react';
import { supabase, setLocalDbUserId, setDeviceRecoveryPin, fetchAndSetSseToken, getDeviceSecret, onSseReconnect } from './lib/supabase';
import { subscribeNetUi, resetNetUiForRetry, type NetUiStatus } from './lib/net-health';
import { excludeSwipeGestureVerifyProfiles, genAvatar, isSwipeGestureVerifyProfile } from './lib/profile';
import { findProfileById, isCompleteProfile } from './lib/profile-session';
import {
  shouldShowWaitingOverlay,
  shouldShowEntryGate,
  shouldShowNicknameSetup,
  shouldShowRecoveryScreen,
} from './lib/entry-gate';
import { HeartType } from './lib/constants';
import {
  NUDGE_MAX,
  NUDGE_MESSAGES,
  hasInterestHeart,
  isInterestHeart,
  isNudgeEligible,
  readNudgeCount,
  writeNudgeCount,
} from './lib/signal-match';
import { isIncomingHeartToastTarget, MUTUAL_SIGNAL_TOAST } from './lib/heart-toast';
import { SignalNudgeBanner } from './components/SignalNudgeBanner';
// ─── 분리된 타입·유틸·컴포넌트 imports ────────────────────────────────────────
import type {
  Profile, ContactShare,
  Chat, View, MainTab, GroupChat, BlockedUser, ProfileView, UserSignal,
} from './types/app';
import { useGroupChat } from './hooks/useGroupChat';
import { GroupChatScreen } from './components/GroupChatScreen';
import { ChatErrorBoundary } from './components/ChatErrorBoundary';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import ProfileDetail from './components/ProfileDetail';
import ReconnectOverlay from './components/ReconnectOverlay';
import { NotifModal } from './components/NotifModal';
import { ConfettiOverlay } from './components/ConfettiOverlay';
import { ContactDisplayModal } from './components/ContactDisplayModal';
import { LikeConfirmDialog } from './components/LikeConfirmDialog';
import { ContactShareModal } from './components/ContactShareModal';
import { ContactViewModal } from './components/ContactViewModal';
const FortuneTabLazy = lazy(() => import('./components/FortuneTab'));
import { WaitingOverlay } from './components/WaitingOverlay';
import { NicknameSetupScreen } from './components/NicknameSetupScreen';
import { EntryGateScreen } from './components/EntryGateScreen';
import { ProfileRecoveryScreen } from './components/ProfileRecoveryScreen';
import { TutorialModal } from './components/TutorialModal';
import { QrScannerModal } from './components/QrScannerModal';
import { ContactRevealModal } from './components/ContactRevealModal';
import {
  MATCHING_USER_KEY, MATCHING_DRAFT_KEY, MATCHING_LAST_RESET_KEY,
  MATCHING_PROFILES_CACHE_KEY,
  ENTRY_VERIFIED_KEY, SCANNED_CONTACTS_KEY,
} from './lib/constants';
import { ls } from './lib/storage';
import { useHearts } from './hooks/useHearts';
import { useChat } from './hooks/useChat';
import { registerPushSub } from './lib/webPush';
import {
  BottomNotification,
  type BottomNotificationData,
} from './components/BottomNotification';
import {
  ShareEventNotification,
  type ShareEventNotificationData,
} from './components/ShareEventNotification';

const loadChatScreen = () => import('./components/ChatScreen');
const loadMainScreen = () => import('./components/MainScreen').then(m => ({ default: m.MainScreen }));
const ChatScreen = lazy(loadChatScreen);
const MainScreen = lazy(loadMainScreen);

// ─── App ──────────────────────────────────────────────────────────────────────




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

  const [appLoading, setAppLoading] = useState(true);
  const [connStatus, setConnStatus] = useState<NetUiStatus>('ok');
  // 네트워크 UI는 net-health 단일 소스 — 순간 단절 모달 폭풍 방지
  useEffect(() => subscribeNetUi(setConnStatus), []);
  // 스플래시 동안 메인/채팅 청크 미리 받아 화면 넘김 지연 제거
  useEffect(() => {
    void loadMainScreen();
    void loadChatScreen();
  }, []);
  const [sessionActive, setSessionActive] = useState<boolean | null>(null);
  // Existing users skip the waiting overlay entirely and go straight to main.
  // New users go straight to nickname setup — no waiting overlay.
  const [shownWaiting, setShownWaiting] = useState(() => Boolean(ls.getItem(MATCHING_USER_KEY)));
  const [profiles, setProfiles] = useState<Profile[]>(() => {
    try {
      const cached = ls.getItem(MATCHING_PROFILES_CACHE_KEY);
      if (!cached) return [];
      const parsed = JSON.parse(cached);
      return Array.isArray(parsed)
        ? excludeSwipeGestureVerifyProfiles(parsed as Profile[], ls.getItem(MATCHING_USER_KEY))
        : [];
    } catch { return []; }
  });
  const [shareEventNotif, setShareEventNotif] = useState<ShareEventNotificationData | null>(null);
  const seenContactEventIdsRef = useRef<Set<string>>(new Set());
  const [contactViewShare, setContactViewShare] = useState<{ share: ContactShare; profile: Profile } | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [view, setView] = useState<View>(() => {
    // localStorage UUID만으로 main 진입 금지 — 서버 프로필 검증 후 전환
    if (ls.getItem(MATCHING_USER_KEY)) return 'loading-main';
    return 'entry-1';
  });
  /** 프로필 부트스트랩: checking=검증 중, ok=완료, recover=복구번호 필요, register=신규 등록 필요 */
  const [profileBoot, setProfileBoot] = useState<'checking' | 'ok' | 'recover' | 'register'>(
    () => (ls.getItem(MATCHING_USER_KEY) ? 'checking' : 'register'),
  );
  const [mainTab, setMainTab] = useState<MainTab>('profiles');
  const [fortuneCompatTarget, setFortuneCompatTarget] = useState<string | undefined>(undefined);
  const [fortuneModalTarget, setFortuneModalTarget] = useState<Profile | null>(null);
  const [showTutorialModal, setShowTutorialModal] = useState(false);
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
  const loadLikesRef = useRef<((userId: string) => Promise<void>) | null>(null);
  // ?share=<profileId> URL 파라미터 — 프로필 QR 스캔 시 연락처 자동 수신
  const [pendingShareId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('share'));

  const [loading, setLoading] = useState(false);
  const [activeNotif, setActiveNotif] = useState<{ id: string; message: string; type: string; target: string } | null>(null);
  const [timerEndAt, setTimerEndAt] = useState<string | null>(null);
  const [timerLabel, setTimerLabel] = useState<string | null>(null);
  const [rejectionNotif, setRejectionNotif] = useState<string | null>(null); // nickname of person who rejected
  const [bottomNotif, setBottomNotif] = useState<BottomNotificationData | null>(null);
  const [signalNudge, setSignalNudge] = useState<string | null>(null);
  const signalNudgeSessionRef = useRef(false);
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
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [profileVisitors, setProfileVisitors] = useState<ProfileView[]>([]);
  const [newVisitCount, setNewVisitCount] = useState(0);
  const [userSignals, setUserSignals] = useState<UserSignal[]>([]);
  const [myHeartCount, setMyHeartCount] = useState<number | null>(null);
  const myHeartCountRef = useRef<number | null>(null);
  myHeartCountRef.current = myHeartCount;
  const [functionsLocked, setFunctionsLocked] = useState(false);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
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

  // loading-main: 내 프로필(닉네임+고유번호) 확인될 때만 main — 없으면 복구/등록 화면
  useEffect(() => {
    if (view !== 'loading-main') return;
    let cancelled = false;

    const tryEnterMain = (myProfile: Profile | undefined | null): boolean => {
      if (!myProfile || !isCompleteProfile(myProfile)) return false;
      setProfileBoot('ok');
      setView('main');
      return true;
    };

    const pollTick = () => {
      if (cancelled) return false;
      const me = findProfileById(profilesRef.current, userIdRef.current);
      return tryEnterMain(me);
    };
    pollTick();
    const pollId = setInterval(() => {
      if (pollTick()) clearInterval(pollId);
    }, 200);

    let attempt = 0;
    const MAX_ATTEMPTS = 8;
    const BASE_DELAY_MS = 1_000;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRetry = (delay: number) => {
      retryTimer = setTimeout(async () => {
        if (cancelled) return;
        attempt++;
        try {
          const uid = userIdRef.current;
          if (!uid) {
            clearInterval(pollId);
            setProfileBoot('register');
            setView('entry-1');
            return;
          }
          const allProfiles = await loadProfilesRef.current();
          if (cancelled) return;
          let me = findProfileById(allProfiles, uid);
          if (!me) {
            const { data: direct } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
            if (direct) {
              me = direct as Profile;
              setProfiles(prev => prev.some(p => p.id === me!.id) ? prev.map(p => p.id === me!.id ? me! : p) : [me!, ...prev]);
            }
          }
          if (tryEnterMain(me)) {
            clearInterval(pollId);
            return;
          }
          // 다른 참가자는 있는데 내 프로필만 없음 → 관리자 리셋·기기 변경 — 복구번호로
          if (allProfiles.length > 0 && !me) {
            clearInterval(pollId);
            ls.removeItem(MATCHING_USER_KEY);
            ls.removeItem(MATCHING_DRAFT_KEY);
            setCurrentUserId(null);
            setProfileBoot('recover');
            setView('entry-recover');
            return;
          }
        } catch {
          // 네트워크 오류 — 재시도
        }
        if (!cancelled) {
          if (attempt < MAX_ATTEMPTS) {
            scheduleRetry(BASE_DELAY_MS * Math.pow(2, Math.min(attempt, 4)));
          } else {
            // 서버 기동 중일 수 있음 — 기존 유저를 entry-1로 팅기지 않고 복구 화면 안내
            clearInterval(pollId);
            setProfileBoot('recover');
            setView('entry-recover');
          }
        }
      }, delay);
    };

    // 첫 조회는 즉시 — 닉네임 저장 직후·돌아오는 유저가 1초를 기다리지 않음. 실패 시에만 지수 백오프.
    scheduleRetry(0);

    return () => {
      cancelled = true;
      clearInterval(pollId);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [view]);

  // SSE 연결 실패 시 polling fallback — SSE 없이도 프로필·채팅·하트 최소 기능 유지
  // reconnecting/error 동안 주기적 DB 재동기화 (모달은 error일 때만 강하게 표시)
  useEffect(() => {
    if (connStatus === 'ok' || !currentUserId) return;
    const uid = currentUserId;
    const tick = () => {
      loadProfilesRef.current().catch(() => {});
      loadChatListRef.current?.(uid).catch(() => {});
      loadReceivedLikesRef.current?.(uid).catch(() => {});
      loadLikesRef.current?.(uid).catch(() => {});
    };
    tick();
    const pollId = setInterval(tick, connStatus === 'error' ? 5_000 : 8_000);
    return () => { clearInterval(pollId); };
  }, [connStatus, currentUserId]);

  // Track user's current table number for notification targeting (ref for stable access in channel callbacks)

  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  // 렌더마다 최신 profiles를 ref에 동기화 (stale 클로저 방지)
  profilesRef.current = profiles;

  // selectedProfile(= ChatScreen의 otherProfile) 동기화
  // 채팅 화면에 있는 동안 상대방이 프로필을 수정하면 profileMap이 갱신되므로
  // selectedProfile도 최신 데이터로 교체한다.
  useEffect(() => {
    if (!selectedProfile) return;
    const updated = profileMap.get(selectedProfile.id);
    if (updated && updated !== selectedProfile) setSelectedProfile(updated);
  }, [profileMap]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 커스텀 훅 호출 ────────────────────────────────────────────────────────────

  const {
    chatId, setChatId, chatIdRef, messages, chatList, setChatList,
    unreadChatCounts, setUnreadChatCounts, newMsgCount, setNewMsgCount,
    loadChatList, openChat, sendMessage, sendImage,
    deleteChat, deleteAllChats, deleteMessage,
  } = useChat({ currentUserId, profilesRef, setSelectedProfile, setView, setBottomNotif });

  const {
    groupChats,
    activeGroupId,
    groupMessages,
    unreadGroupCounts,
    newGroupMsgCount, setNewGroupMsgCount,
    openGroupChat,
    joinGroupChat,
    joiningGroupId,
    closeGroupChat,
    sendGroupMessage,
    leaveGroupChat,
  } = useGroupChat({ currentUserId, profilesRef, setBottomNotif });

  const {
    likedIds, setLikedIds, sentHeartTypes, setSentHeartTypes, sentHeartsPerPerson, setSentHeartsPerPerson,
    receivedHeartTypes, setReceivedHeartTypes, likeStatuses, setLikeStatuses,
    receivedLikers, setReceivedLikers, contactSharedWithIds,
    acknowledgedComplimentIds, setAcknowledgedComplimentIds, receivedContactShares, setReceivedContactShares,
    likeConfirmTarget, setLikeConfirmTarget, contactShareTarget, setContactShareTarget,
    loadLikes, loadReceivedLikes, loadContactShareData, likedByTypeRecord,
    handleLike, executeLike, handleHeartResponse, handleContactShare,
    likeError, setLikeError,
  } = useHearts(currentUserId, profiles, profileMap, openChat);

  // 하트 전송 실패 알림 — executeLike가 error를 set하면 바텀 토스트로 표시
  useEffect(() => {
    if (!likeError) return;
    setBottomNotif({ type: 'chat', nickname: '', message: likeError });
    const t = setTimeout(() => {
      setBottomNotif(prev => prev?.message === likeError ? null : prev);
      setLikeError(null);
    }, 4_000);
    return () => clearTimeout(t);
  }, [likeError, setLikeError]);

  // SSE fallback polling refs 동기화 — 렌더마다 최신 함수를 가리키도록 (stale 클로저 방지)
  loadChatListRef.current = loadChatList;
  loadReceivedLikesRef.current = loadReceivedLikes;
  loadLikesRef.current = loadLikes;
  const sentHeartsPerPersonRef = useRef(sentHeartsPerPerson);
  sentHeartsPerPersonRef.current = sentHeartsPerPerson;
  const receivedHeartTypesRef = useRef(receivedHeartTypes);
  receivedHeartTypesRef.current = receivedHeartTypes;

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

  // ─── 차단·숨기기 처리 ─────────────────────────────────────────────────────
  const handleBlock = useCallback(async (targetId: string, type: 'block' | 'hide') => {
    if (!currentUserId || targetId === currentUserId) return;
    // 이미 차단/숨기기한 경우 중복 방지
    if (blockedUsers.some(b => b.user_id === currentUserId && b.target_id === targetId && b.block_type === type)) return;
    const id = crypto.randomUUID();
    const row: BlockedUser = { id, user_id: currentUserId, target_id: targetId, block_type: type, created_at: new Date().toISOString() };
    // 낙관적 업데이트
    setBlockedUsers(prev => [...prev, row]);
    try {
      await supabase.from('blocked_users').insert(row as never);
    } catch (e) {
      console.error('[handleBlock]', e);
      setBlockedUsers(prev => prev.filter(b => b.id !== id));
    }
  }, [currentUserId, blockedUsers]);

  // ─── 차단·숨기기 해제 ────────────────────────────────────────────────────
  const handleUnblock = useCallback(async (blockId: string) => {
    setBlockedUsers(prev => prev.filter(b => b.id !== blockId));
    try {
      await supabase.from('blocked_users').delete().eq('id', blockId as never);
    } catch (e) {
      console.error('[handleUnblock]', e);
      // 실패 시 재로드
      supabase.from('blocked_users').select('*').then(({ data }: { data: unknown }) => {
        if (Array.isArray(data) && currentUserId) {
          setBlockedUsers((data as BlockedUser[]).filter(b => b.user_id === currentUserId || b.target_id === currentUserId));
        }
      }).catch(() => {});
    }
  }, [currentUserId]);

  // ─── 프로필 열 때 방문 기록 ───────────────────────────────────────────────
  // 카드 사진 탭(뒤집기)과 상세/사주 오픈이 연속되면 같은 상대에 대해 중복 INSERT 방지
  const recentProfileViewsRef = useRef<Map<string, number>>(new Map());
  const recordProfileView = useCallback(async (viewedId: string) => {
    if (!currentUserId || viewedId === currentUserId) return;
    const now = Date.now();
    const last = recentProfileViewsRef.current.get(viewedId) ?? 0;
    if (now - last < 60_000) return;
    recentProfileViewsRef.current.set(viewedId, now);
    const row: ProfileView = { id: crypto.randomUUID(), viewer_id: currentUserId, viewed_id: viewedId, viewed_at: new Date().toISOString() };
    try { await supabase.from('profile_views').insert(row as never); } catch {}
  }, [currentUserId]);


  useEffect(() => {
    let cancelled = false;
    // API 콜드스타트·재시도 중에도 2.5초 후에는 스피너만 해제.
    // entryPassword는 비우지 않음 — 빈 값으로 강제하면 대기 랜딩이 먼저 뜨고
    // /ready 이후 입장 코드 화면으로 한 번 더 바뀐다.
    const safetyTimer = setTimeout(() => {
      if (!cancelled) {
        setAppLoading(false);
        // 더미/복구 재입장: sessionActive를 false로 강제하면 대기 랜딩이 한 프레임 깜빡인다
        if (!ls.getItem(MATCHING_USER_KEY)) {
          setSessionActive(prev => (prev === null ? false : prev));
        }
      }
    }, 2_500);

    const applySettings = (data: Record<string, unknown> | null) => {
      if (cancelled || !data) return;
      const ep = (data.entry_password as string | null | undefined) ?? '';
      setSessionActive(Boolean(data.session_active));
      setEntryPassword(ep);
      setEntryVerified(!ep || ls.getItem(ENTRY_VERIFIED_KEY) === ep);
      const localReset = ls.getItem(MATCHING_LAST_RESET_KEY);
      const serverReset = (data.reset_signal as string | null | undefined) ?? null;
      if (serverReset && serverReset !== localReset) {
        ls.setItem(MATCHING_LAST_RESET_KEY, serverReset);
        ls.removeItem(MATCHING_USER_KEY);
        ls.removeItem(MATCHING_DRAFT_KEY);
        setCurrentUserId(null);
        setShownWaiting(false);
        setProfiles([]);
        setLikedIds(new Set());
        setSentHeartTypes(new Map());
        setAcknowledgedComplimentIds(new Set());
        setReceivedLikers([]);
        setView('entry-1');
        return;
      }
      setTimerEndAt((data.timer_end_at as string | null | undefined) ?? null);
      setTimerLabel((data.timer_label as string | null | undefined) ?? null);
      if (data.functions_locked != null) setFunctionsLocked(Boolean(data.functions_locked));
    };

    async function loadSettings(attempt = 0): Promise<void> {
      try {
        const resp = await fetch('/api/db/ready', { signal: AbortSignal.timeout(8_000) });
        if (resp.ok) {
          const json = await resp.json() as {
            ready?: boolean;
            settings?: Record<string, unknown>;
          };
          if (json.ready && json.settings) {
            setAppLoading(false);
            applySettings(json.settings);
            return;
          }
        }
      } catch {
        // fall through to Supabase-compatible fetch
      }

      const { data, error } = await supabase
        .from('app_settings')
        .select('session_active, timer_end_at, timer_label, reset_signal, entry_password, functions_locked')
        .eq('id', 1)
        .single();
      if (cancelled) return;
      if (error || !data) {
        if (attempt < 5) {
          await new Promise(r => setTimeout(r, Math.min(400 * Math.pow(2, attempt), 3200)));
          return loadSettings(attempt + 1);
        }
        setAppLoading(false);
        setSessionActive(false);
        setEntryPassword('');
        return;
      }
      setAppLoading(false);
      applySettings(data as Record<string, unknown>);
    }

    void loadSettings();
    const settingsChannel = supabase
      .channel('app-settings-user')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'app_settings' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        const p = payload.new as { session_active: boolean; timer_end_at: string | null; timer_label: string | null; reset_signal: string | null; entry_password: string | null };
        // Admin triggered a full reset: wipe local user identity and force back to nickname setup
        if (p.reset_signal && p.reset_signal !== ls.getItem(MATCHING_LAST_RESET_KEY)) {
          ls.setItem(MATCHING_LAST_RESET_KEY, p.reset_signal);
          ls.removeItem(MATCHING_USER_KEY);
          ls.removeItem(MATCHING_DRAFT_KEY);
          setCurrentUserId(null);
          setShownWaiting(false);
          setProfiles([]);
          setLikedIds(new Set());
          setReceivedLikers([]);
          setChatList([]);
          // 추가 상태 초기화 — 하트·알림이 리셋 후에도 남아있는 버그 방지
          setSentHeartTypes(new Map());
          setSentHeartsPerPerson(new Map());
          setActiveNotif(null);
          setView('entry-1');
          return;
        }
        if (typeof p.session_active === 'boolean') {
          setSessionActive(p.session_active);
          // 관리자 '회식 시작' → session_active=true 감지 시
          // 대기 중인 신규 접속자 자동으로 닉네임 설정 화면으로 이동
          if (p.session_active && !ls.getItem(MATCHING_USER_KEY)) {
            setShownWaiting(true);
            setView('entry-1');
          }
          // 회의 종료 시 대기 화면으로 복귀 (관리자가 종료 누르지 않아도 SSE로 반영)
          if (!p.session_active && userIdRef.current) {
            setShownWaiting(false);
          }
        }
        setTimerEndAt(p.timer_end_at ?? null);
        setTimerLabel(p.timer_label ?? null);
        if ((p as any).functions_locked != null) setFunctionsLocked((p as any).functions_locked);
        if (p.entry_password !== undefined) {
          const ep = p.entry_password ?? '';
          setEntryPassword(ep);
          setEntryVerified(!ep || ls.getItem(ENTRY_VERIFIED_KEY) === ep);
        }
      })
      .subscribe();
    const notifChannel = supabase
      .channel('notifications-user')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        const n = payload.new as { id: string; message: string; type: string; target: string; is_active: boolean };
        if (!n.is_active) return;
        if (n.target === 'all') setActiveNotif(n);
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
      clearTimeout(safetyTimer);
      shareNotifTimerIds.forEach(clearTimeout);
      supabase.removeChannel(settingsChannel);
      supabase.removeChannel(notifChannel);
      supabase.removeChannel(contactEventsChannel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only; adding deps causes reconnect loop
  }, []);


  const loadProfiles = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (data) {
      const visible = excludeSwipeGestureVerifyProfiles(data as Profile[], userIdRef.current);
      setProfiles(visible);
      try { ls.setItem(MATCHING_PROFILES_CACHE_KEY, JSON.stringify(visible)); } catch { /* quota */ }
      return visible;
    }
    return [];
  }, []);
  // loading-main 지수 백오프 재시도에서 항상 최신 함수 참조 유지
  loadProfilesRef.current = loadProfiles;

  const loadUserSignals = useCallback(() => {
    supabase.from('user_signals').select('*')
      .then(({ data }: { data: unknown }) => {
        if (Array.isArray(data)) setUserSignals(data as UserSignal[]);
      }).catch(() => {});
  }, []);

  const handleUserSignalUpdate = useCallback((row: UserSignal) => {
    setUserSignals(prev => {
      const idx = prev.findIndex(s => s.user_id === row.user_id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = row;
        return next;
      }
      return [...prev, row];
    });
  }, []);

  const refreshProfilesTab = useCallback(() => {
    loadProfiles();
    loadUserSignals();
  }, [loadProfiles, loadUserSignals]);


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
    const rejNotifTimerIds: ReturnType<typeof setTimeout>[] = [];
    // cancelled 플래그 — 언마운트 후 비동기 콜백이 setState를 호출하는 것을 방지
    let cancelled = false;
    loadProfiles().catch(() => []).then(async (allProfiles) => {
      if (cancelled) return;
      if (!allProfiles || allProfiles.length === 0) return;
      if (isNewRegistration.current) {
        isNewRegistration.current = false;
        const me = findProfileById(allProfiles, currentUserId);
        if (isCompleteProfile(me)) {
          setProfileBoot('ok');
          setView('main');
          setMainTab('status');
        } else {
          setView('loading-main');
        }
        return;
      }
      let me = findProfileById(allProfiles, currentUserId);
      if (!me) {
        retryTimerId = setTimeout(async () => {
          const retry = await loadProfiles();
          me = findProfileById(retry, currentUserId);
          if (!me) {
            const { data: direct } = await supabase.from('profiles').select('*').eq('id', currentUserId).maybeSingle();
            if (direct) me = direct as Profile;
          }
          if (me && isCompleteProfile(me)) {
            setProfileBoot('ok');
            if (view !== 'chat' && view !== 'profile' && view !== 'group-chat') setView('main');
            return;
          }
          if (retry.length > 0 && !me) {
            ls.removeItem(MATCHING_USER_KEY);
            ls.removeItem(MATCHING_DRAFT_KEY);
            setCurrentUserId(null);
            setShownWaiting(false);
            setProfileBoot('recover');
            setView('entry-recover');
          }
        }, 2000);
        return;
      }
      if (isCompleteProfile(me)) {
        setProfileBoot('ok');
        if (view !== 'chat' && view !== 'profile' && view !== 'group-chat' && view !== 'loading-main') {
          setView('main');
        }
      } else {
        setView('loading-main');
      }
      // 고유번호 없으면 서버에서 직접 재조회 (클라이언트 임의 PIN 생성 금지)
      if (me && !me.pin_code) {
        (async () => {
          try {
            const { data: refreshed } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', currentUserId)
              .maybeSingle();
            if (refreshed && (refreshed as Profile).pin_code) {
              setProfiles(prev => prev.map(p => p.id === currentUserId ? (refreshed as Profile) : p));
              setProfileBoot('ok');
            }
          } catch (err) {
            console.warn('[pin] 고유번호 재조회 실패:', err);
          }
        })();
      }
    });
    loadLikes(currentUserId);
    loadReceivedLikes(currentUserId);
    initTimerId1 = setTimeout(() => {
      loadContactShareData(currentUserId);
      loadChatList(currentUserId);
    }, 300);

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
          const incoming = payload.new as Profile;
          if (isSwipeGestureVerifyProfile(incoming) && incoming.id !== userIdRef.current) return prev;
          if (prev.find((p) => p.id === incoming.id)) return prev;
          return [incoming, ...prev];
        }))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) =>
          setProfiles((prev) => prev.map((p) => p.id === (payload.new as Profile).id ? { ...p, ...(payload.new as Profile) } : p)))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'profiles' },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => setProfiles((prev) => prev.filter((p) => p.id !== (payload.old as Profile).id)))
      .subscribe();

    // 하트/연락처/제안/잔여하트 — 단일 채널로 묶어 SSE 리스너 수 감소 (EventSource는 공유)
    const userRealtimeChannel = supabase
      .channel(`realtime:user-bundle:${currentUserId}`)
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
          // 내가 관심을 보냈고 상대도 이미 관심을 보냈으면 서로 시그널 (수신자 전용 토스트와 대칭)
          if (isInterestHeart(row.heart_type) && isInterestHeart(receivedHeartTypesRef.current.get(row.liked_id))) {
            const nick = profilesRef.current.find(p => p.id === row.liked_id)?.nickname ?? '상대방';
            setBottomNotif({ type: 'signal', signalKind: 'mutual', nickname: nick, profileId: row.liked_id, message: MUTUAL_SIGNAL_TOAST });
          }
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'likes', filter: `liker_id=eq.${currentUserId}` },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          const updated = payload.new as { liked_id: string; status: string };
          setLikeStatuses(prev => new Map(prev).set(updated.liked_id, updated.status));
          if (updated.status === 'rejected') {
            const rejectedProfile = profilesRef.current.find(p => p.id === updated.liked_id);
            const nick = rejectedProfile?.nickname ?? '상대방';
            setRejectionNotif(nick);
            rejNotifTimerIds.push(setTimeout(() => setRejectionNotif(null), 5000));
          } else if (updated.status === 'accepted') {
            loadContactShareData(currentUserId);
            const acceptedProfile = profilesRef.current.find(p => p.id === updated.liked_id);
            const nick = acceptedProfile?.nickname ?? '상대방';
            setBottomNotif({ type: 'chat', nickname: nick, message: `💚 ${nick}님이 하트를 수락했어요` });
            rejNotifTimerIds.push(setTimeout(() => setBottomNotif(prev => prev?.message === `💚 ${nick}님이 하트를 수락했어요` ? null : prev), 5000));
          }
        })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'likes', filter: `liked_id=eq.${currentUserId}` },
        async (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          try {
            const row = payload.new as { liker_id?: string; liked_id?: string; heart_type: HeartType };
            const likerId = row.liker_id;
            // 수신자 전용 — 보낸 사람·제3자 토스트 방지 (필터가 깨져도 가드)
            if (!isIncomingHeartToastTarget(currentUserId, { liker_id: likerId, liked_id: row.liked_id ?? currentUserId })) return;
            if (likerId) {
              setReceivedHeartTypes(prev => new Map(prev).set(likerId, row.heart_type ?? 'red'));
              const { data } = await supabase.from('profiles').select('*').eq('id', likerId).maybeSingle();
              if (data) {
                setReceivedLikers((prev) => {
                  if (prev.find((p) => p.id === data.id)) return prev;
                  return [data, ...prev];
                });
              }
              const heartNick = data?.nickname ?? '누군가';
              const ht = row.heart_type ?? 'red';
              if (isInterestHeart(ht) && hasInterestHeart(sentHeartsPerPersonRef.current.get(likerId))) {
                setBottomNotif({ type: 'signal', signalKind: 'mutual', nickname: heartNick, profileId: likerId, message: MUTUAL_SIGNAL_TOAST });
              } else if (isInterestHeart(ht)) {
                setBottomNotif({ type: 'signal', signalKind: 'received', nickname: heartNick, profileId: likerId, message: `💕 ${heartNick}님이 회원님에게 관심을 보냈어요.` });
              } else {
                setBottomNotif({ type: 'heart', nickname: heartNick, heartType: ht });
              }
            } else {
              setBottomNotif({ type: 'heart', nickname: '누군가', heartType: row.heart_type ?? 'red' });
            }
            triggerConfetti();
            rejNotifTimerIds.push(setTimeout(() => setBottomNotif(prev => (prev?.type === 'heart' || prev?.type === 'signal') ? null : prev), 5000));
          } catch (e) { console.warn('[realtime:likes]', e); }
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'likes', filter: `liked_id=eq.${currentUserId}` },
        () => { loadReceivedLikesRef.current?.(currentUserId).catch(() => {}); })
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'heart_balances', filter: `id=eq.${currentUserId}` },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          const row = payload.new as { heart_count?: number };
          if (typeof row?.heart_count === 'number') {
            const prev = myHeartCountRef.current;
            setMyHeartCount(row.heart_count);
            if (prev !== null && row.heart_count < prev) {
              setBottomNotif({ type: 'like', message: `💛 하트가 ${row.heart_count}개 남았어요!` } as any);
            }
          }
        })
      .subscribe();
    // chats INSERT/DELETE는 useChat의 user-events-${uid} 통합 채널이 처리 — 중복 구독 제거됨

    supabase.from('heart_balances').select('heart_count').eq('id', currentUserId).maybeSingle()
      .then(({ data }: { data: any }) => {
        if (data && typeof data.heart_count === 'number') setMyHeartCount(data.heart_count);
      }).catch(() => {});

    return () => {
      cancelled = true;
      if (retryTimerId) clearTimeout(retryTimerId);
      if (initTimerId1) clearTimeout(initTimerId1);
      rejNotifTimerIds.forEach(clearTimeout);
      if (confettiTimerRef.current) { clearTimeout(confettiTimerRef.current); confettiTimerRef.current = null; }
      if (confettiInnerTimerRef.current) { clearTimeout(confettiInnerTimerRef.current); confettiInnerTimerRef.current = null; }
      supabase.removeChannel(profileChannel);
      supabase.removeChannel(userRealtimeChannel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loadXxx are stable useCallbacks; setState/refs are stable
  }, [currentUserId, loadProfiles, loadLikes, loadReceivedLikes, loadContactShareData, loadChatList]);

  // ─── 차단·숨기기 / 방문자 기록 로드 ─────────────────────────────────────────
  useEffect(() => {
    if (!currentUserId) {
      setBlockedUsers([]);
      setProfileVisitors([]);
      return;
    }
    const uid = currentUserId;
    // 차단·숨기기 목록 로드 (내가 한 것 + 나에게 한 것)
    supabase.from('blocked_users').select('*')
      .then(({ data }: { data: unknown }) => {
        if (Array.isArray(data)) {
          setBlockedUsers((data as BlockedUser[]).filter(b => b.user_id === uid || b.target_id === uid));
        }
      }).catch(() => {});
    // 내 프로필 방문자 로드
    supabase.from('profile_views').select('*').eq('viewed_id', uid)
      .then(({ data }: { data: unknown }) => {
        if (Array.isArray(data)) setProfileVisitors(data as ProfileView[]);
      }).catch(() => {});

    // SSE: blocked_users / profile_views — 단일 채널
    const privacyCh = supabase
      .channel(`privacy-${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'blocked_users' },
        (payload: { new: Record<string, unknown> }) => {
          try {
            const b = payload.new as BlockedUser;
            if (b.user_id === uid || b.target_id === uid) {
              setBlockedUsers(prev => prev.some(x => x.id === b.id) ? prev : [...prev, b]);
            }
          } catch (e) { console.warn('[blocked_users SSE]', e); }
        })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profile_views' },
        (payload: { new: Record<string, unknown> }) => {
          try {
            const v = payload.new as ProfileView;
            if (v.viewed_id === uid) {
              setProfileVisitors(prev => prev.some(x => x.id === v.id) ? prev : [...prev, v]);
              if (localStorage.getItem('visitor_notification') !== '0') {
                setNewVisitCount(prev => prev + 1);
              }
            }
          } catch (e) { console.warn('[profile_views SSE]', e); }
        })
      .subscribe();
    // user_signals 전체 로드 (전광판 + 카드 뒤면용)
    loadUserSignals();
    // SSE: user_signals INSERT/UPDATE 구독 (전원 공개 — PRIVATE_TABLES 미포함)
    const signalsCh = supabase
      .channel('user-signals-all')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_signals' },
        (payload: { new: Record<string, unknown> }) => {
          try {
            const s = payload.new as UserSignal;
            setUserSignals(prev => prev.some(x => x.user_id === s.user_id) ? prev.map(x => x.user_id === s.user_id ? s : x) : [...prev, s]);
          } catch (e) { console.warn('[user_signals SSE INSERT]', e); }
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_signals' },
        (payload: { new: Record<string, unknown> }) => {
          try {
            const s = payload.new as UserSignal;
            setUserSignals(prev => prev.map(x => x.user_id === s.user_id ? s : x));
          } catch (e) { console.warn('[user_signals SSE UPDATE]', e); }
        })
      .subscribe();
    return () => { supabase.removeChannel(privacyCh); supabase.removeChannel(signalsCh); };
  }, [currentUserId, loadUserSignals]);

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
          ls.removeItem(MATCHING_USER_KEY);
          ls.removeItem(MATCHING_DRAFT_KEY);
          setCurrentUserId(null);
          setShownWaiting(false);
          setProfileBoot('recover');
          setView('entry-recover');
        } else {
          // Refresh data on returning to app
          loadReceivedLikes(storedId);
          loadLikes(storedId);
          loadChatList(storedId);
          loadContactShareData(storedId);
        }
      }).catch(() => { /* 네트워크 오류 → 세션 유지, 데이터는 다음 리프레시 때 갱신 */ });
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [loadProfiles, loadReceivedLikes, loadLikes, loadChatList, loadContactShareData]);

  // Web push 구독 — 로그인 완료 후 알림 권한 요청 및 구독 등록
  useEffect(() => {
    if (!currentUserId) return;
    registerPushSub(currentUserId);
  }, [currentUserId]);

  // SSE 재연결 시 DB Source-of-Truth 재동기화 (UI 모달은 net-health가 담당)
  useEffect(() => {
    if (!currentUserId) return;
    const unsubReconnect = onSseReconnect(() => {
      loadChatList(currentUserId);
      loadReceivedLikes(currentUserId);
      loadLikes(currentUserId);
      loadProfiles();
      fetch('/api/db/ready', { signal: AbortSignal.timeout(8_000) })
        .then(r => r.ok ? r.json() : null)
        .then((json: { settings?: Record<string, unknown> } | null) => {
          const data = json?.settings;
          if (!data) return;
          if (typeof data.session_active === 'boolean') {
            setSessionActive(data.session_active);
            if (!data.session_active && userIdRef.current) setShownWaiting(false);
          }
          setTimerEndAt((data.timer_end_at as string | null | undefined) ?? null);
          setTimerLabel((data.timer_label as string | null | undefined) ?? null);
          if (data.functions_locked != null) setFunctionsLocked(Boolean(data.functions_locked));
        })
        .catch(() => {});
    });
    return unsubReconnect;
  }, [currentUserId, loadChatList, loadReceivedLikes, loadLikes, loadProfiles]);


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
    try {
    const newProfileId = crypto.randomUUID();
    const { data: profile, error } = await supabase
      .from('profiles')
      .insert({
        id: newProfileId,
        _device_secret: getDeviceSecret(newProfileId),
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
      setProfiles(prev => prev.some(p => p.id === profile.id) ? prev : [profile as Profile, ...prev]);
      setCurrentUserId(profile.id);
      setProfileBoot('checking');
      setView('loading-main');
    }
    } catch (e) {
      console.error('[handleNicknameSetup] 오류:', e);
      setRegistrationError('오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };


  const reset = () => {
    ls.removeItem(MATCHING_USER_KEY);
    ls.removeItem(MATCHING_DRAFT_KEY);
    setCurrentUserId(null);
    setShownWaiting(false);
    setProfileBoot('register');
    setView('entry-1');
  };

  const handleProfileRecovery = async (profileId: string, pinCode: string) => {
    setLoading(true);
    setShownWaiting(true);
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', profileId)
        .single();
      if (profile) {
        ls.setItem(MATCHING_USER_KEY, profile.id);
        ls.removeItem(MATCHING_DRAFT_KEY);
        setDeviceRecoveryPin(pinCode);
        isNewRegistration.current = true;
        setProfiles(prev => prev.some(p => p.id === profile.id) ? prev : [profile as Profile, ...prev]);
        setCurrentUserId(profile.id);
        setProfileBoot('checking');
        setEntryVerified(true);
        void fetchAndSetSseToken(profile.id as string);
        setView('loading-main');
      } else {
        alert('프로필을 찾을 수 없습니다. 관리자에게 문의하세요.');
        setView('entry-1');
      }
    } catch (e) {
      console.error('[handleProfileRecovery] 오류:', e);
      alert('프로필 복구 중 오류가 발생했습니다. 다시 시도해 주세요.');
      setView('entry-1');
    } finally {
      setLoading(false);
    }
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

  const heartSendTotal = useMemo(() => {
    let n = 0;
    sentHeartsPerPerson.forEach((types) => { n += types.size; });
    return n;
  }, [sentHeartsPerPerson]);

  useEffect(() => {
    if (!currentUserId || view !== 'main' || mainTab === 'signal') return;
    if (signalNudgeSessionRef.current) return;
    if (!isNudgeEligible(heartSendTotal, likedIds.size)) return;
    const shown = readNudgeCount(currentUserId);
    if (shown >= NUDGE_MAX) return;
    const t = setTimeout(() => {
      if (signalNudgeSessionRef.current) return;
      if (view !== 'main') return;
      setSignalNudge(NUDGE_MESSAGES[shown % NUDGE_MESSAGES.length]);
    }, 8_000);
    return () => clearTimeout(t);
  }, [currentUserId, view, mainTab, heartSendTotal, likedIds.size]);

  const dismissSignalNudge = useCallback((goToTab: boolean) => {
    setSignalNudge(null);
    signalNudgeSessionRef.current = true;
    if (currentUserId) writeNudgeCount(currentUserId, readNudgeCount(currentUserId) + 1);
    if (goToTab) setMainTab('signal');
  }, [currentUserId]);

  const handleMissionComplete = useCallback(() => {
    setBottomNotif({
      type: 'signal',
      signalKind: 'mission',
      message: '🎉 미션 완료! 새로운 추천 상대를 확인해보세요.',
    });
  }, []);

  const myProfile = currentUserId ? profileMap.get(currentUserId) : null;
  const hasValidProfile = isCompleteProfile(myProfile ?? undefined);

  // 신규 방문자만 참여자 대기 랜딩. 더미/복구/재방문(userId 있음)은 loading-main → 메인
  const isTester = (() => {
    try { return Boolean(localStorage.getItem('test_token_v1')); } catch { return false; }
  })();
  const showWaiting = shouldShowWaitingOverlay({
    shownWaiting,
    currentUserId,
    hasValidProfile,
    isTester,
  });
  const showEntryGate = shouldShowEntryGate({
    entryPassword,
    entryVerified,
    currentUserId,
    isTester,
  });
  const showRecovery = shouldShowRecoveryScreen({
    hasValidProfile,
    profileBoot,
    view,
  });
  const showNicknameSetup = shouldShowNicknameSetup({
    currentUserId,
    hasValidProfile,
    view,
  });
  if (appLoading || sessionActive === null || entryPassword === null) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="w-12 h-12 rounded-full border-4 border-teal-500/30 border-t-teal-500 animate-spin" />
      <p className="text-base font-black text-white">서버랑 X스 중입니다...</p>
      <p className="text-sm font-bold text-slate-400">조ㄹ라 잠시만 기다려주세요! 🍺</p>
    </div>
  );
  // 입장 코드 게이트: 미식별 방문자만. 더미/복구/재방문은 스킵
  if (showEntryGate && entryPassword) return (
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

  // 프로필 미완료·미검증 — 메인 진입 차단 (신규 → 등록, 기존 → 복구번호)
  if (currentUserId && !hasValidProfile && profileBoot !== 'ok') {
    if (showRecovery) {
      return (
        <ProfileRecoveryScreen
          onRecover={handleProfileRecovery}
          onBack={() => { setProfileBoot('register'); setView('entry-1'); }}
        />
      );
    }
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 rounded-full border-4 border-teal-500/30 border-t-teal-500 animate-spin" />
        <p className="text-sm text-slate-400 font-semibold">프로필 확인 중...</p>
      </div>
    );
  }

  if (view === 'loading-main') return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 rounded-full border-4 border-teal-500/30 border-t-teal-500 animate-spin" />
      <p className="text-sm text-slate-400 font-semibold">프로필 저장 중...</p>
    </div>
  );

  if (showRecovery) return (
    <ProfileRecoveryScreen
      onRecover={handleProfileRecovery}
      onBack={() => setView('entry-1')}
    />
  );

  if (showNicknameSetup) return (
    <NicknameSetupScreen
      onSubmit={handleNicknameSetup}
      loading={loading}
      registrationError={registrationError}
      onReset={reset}
      onShowRecovery={() => setView('entry-recover')}
    />
  );

  // 식별된 유저인데 view가 아직 첫 방문 화면이면 잘못된 페이지 대신 로딩
  if (currentUserId && (view === 'entry-1' || view === 'entry-recover')) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 rounded-full border-4 border-teal-500/30 border-t-teal-500 animate-spin" />
        <p className="text-sm text-slate-400 font-semibold">프로필 확인 중...</p>
      </div>
    );
  }

  const isSubScreen = view === 'profile' || view === 'chat' || view === 'group-chat';

  return (
    <>
      {/* Tutorial modal */}
      {showTutorialModal && (
        <TutorialModal
          onClose={() => {
            setShowTutorialModal(false);
          }}
          darkMode={darkMode}
        />
      )}

      {connStatus !== 'ok' && (
        <ReconnectOverlay
          status={connStatus}
          onRetry={() => {
            resetNetUiForRetry();
            const uid = userIdRef.current;
            if (uid) {
              fetchAndSetSseToken(uid).catch(() => {});
              loadChatListRef.current?.(uid).catch(() => {});
              loadReceivedLikesRef.current?.(uid).catch(() => {});
              loadLikesRef.current?.(uid).catch(() => {});
              loadProfilesRef.current().catch(() => {});
            } else {
              window.location.reload();
            }
          }}
        />
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
          <BottomNotification
            notification={bottomNotif}
            onClose={() => setBottomNotif(null)}
            onGoToStatus={() => { setMainTab('status'); setBottomNotif(null); }}
            onGoToChats={() => { setMainTab('chats'); setBottomNotif(null); }}
            onGoToSignal={() => { setMainTab('signal'); setBottomNotif(null); }}
            onViewProfile={() => {
              const id = bottomNotif.profileId;
              const p = (id && (profiles.find(x => x.id === id) ?? receivedLikers.find(x => x.id === id))) || null;
              if (p) { setSelectedProfile(p); setView('profile'); }
              setBottomNotif(null);
            }}
            onStartChat={() => {
              const id = bottomNotif.profileId;
              const p = (id && (profiles.find(x => x.id === id) ?? receivedLikers.find(x => x.id === id))) || null;
              if (p) void openChat(p);
              setBottomNotif(null);
            }}
          />
        </AppErrorBoundary>
      )}
      {signalNudge && view === 'main' && mainTab !== 'signal' && (
        <SignalNudgeBanner
          message={signalNudge}
          onOpen={() => dismissSignalNudge(true)}
          onClose={() => dismissSignalNudge(false)}
        />
      )}
      <div className={isSubScreen ? 'hidden' : undefined} aria-hidden={isSubScreen}>
      <AppErrorBoundary screenName="메인 화면" onReset={() => { setView('main'); setMainTab('profiles'); }}>
      <Suspense fallback={<div className="min-h-screen bg-slate-900" />}>
        <MainScreen
        profiles={profiles}
        currentUserId={currentUserId}
        likedIds={likedIds}
        sentHeartsPerPerson={sentHeartsPerPerson}
        likeStatuses={likeStatuses}
        profileMap={profileMap}
        mainTab={mainTab}
        onTabChange={setMainTab}
        onLike={handleLikeGuarded}
        onSelect={(p) => { setLikeConfirmTarget(null); setSelectedProfile(p); setView('profile'); recordProfileView(p.id); }}
        onReset={reset}
        onProfileClickFromMap={(p) => { setLikeConfirmTarget(null); setSelectedProfile(p); setView('profile'); recordProfileView(p.id); }}
        receivedLikers={receivedLikers}
        receivedHeartTypes={receivedHeartTypes}
        sentHeartTypes={sentHeartTypes}
        sentLikedProfiles={sentLikedProfiles}
        contactSharedWithIds={contactSharedWithIds}
        acknowledgedComplimentIds={acknowledgedComplimentIds}
        receivedContactShares={receivedContactShares}
        pendingHeartsCount={pendingHeartsCount}
        chatList={chatList}
        onContactShareOpen={(profile) => setContactShareTarget(profile)}
        onContactViewOpen={(share, profile) => setContactViewShare({ share, profile })}
        onHeartResponse={handleHeartResponse}
        onDeleteChat={deleteChat}
        onDeleteAllChats={deleteAllChats}
        onOpenChat={openChat}
        timerEndAt={timerEndAt}
        timerLabel={timerLabel}
        onRefreshStatus={refreshStatusTab}
        onRefreshChat={refreshChatTab}
        onUpdateProfile={(update) => setProfiles(prev => prev.map(p => p.id === (update as { id: string }).id ? { ...p, ...(update as object) } : p))}
        onRefreshProfiles={refreshProfilesTab}
        darkMode={darkMode}
        onToggleDark={() => { const next = !darkMode; setDarkMode(next); ls.setItem('dark_mode', next ? '1' : '0'); }}
        onShowContactQr={() => setShowContactQr(true)}
        onScanQr={() => setShowQrScanner(true)}
        scannedContacts={scannedContacts}
        onClearScannedContact={(id) => setScannedContacts(prev => {
          const next = prev.filter(c => c.id !== id);
          try { ls.setItem(SCANNED_CONTACTS_KEY, JSON.stringify(next)); } catch {}
          return next;
        })}
        functionsLocked={functionsLocked}
        onShowTutorial={() => { setShowTutorialModal(true); }}
        newMsgCount={newMsgCount}
        onClearMsgCount={() => setNewMsgCount(0)}
        unreadChatCounts={unreadChatCounts}
        onClearChatUnread={(chatId) => setUnreadChatCounts(prev => { const n = { ...prev }; delete n[chatId]; return n; })}
        onViewFortune={(p) => { setFortuneModalTarget(p); void recordProfileView(p.id); }}
        onViewProfile={(p) => { void recordProfileView(p.id); }}
        fortuneCompatTarget={fortuneCompatTarget}
        myHeartCount={myHeartCount}
        groupChats={groupChats}
        unreadGroupCounts={unreadGroupCounts}
        newGroupMsgCount={newGroupMsgCount}
        onClearGroupMsgCount={() => setNewGroupMsgCount(0)}
        onOpenGroupChat={(groupId) => { void openGroupChat(groupId).then(() => setView('group-chat')).catch(e => console.error('[openGroupChat]', e)); }}
        onJoinGroupChat={(groupId) => { void joinGroupChat(groupId); }}
        joiningGroupId={joiningGroupId}
        userSignals={userSignals}
        onUserSignalUpdate={handleUserSignalUpdate}
        onMissionComplete={handleMissionComplete}
        blockedUserIds={(() => {
          const s = new Set<string>();
          blockedUsers.forEach(b => {
            if (b.block_type === 'block') {
              if (b.user_id === currentUserId) s.add(b.target_id);
              else if (b.target_id === currentUserId) s.add(b.user_id);
            }
          });
          return s;
        })()}
        hiddenByIds={(() => {
          const s = new Set<string>();
          blockedUsers.forEach(b => {
            if (b.block_type === 'hide' && b.target_id === currentUserId) s.add(b.user_id);
          });
          return s;
        })()}
        profileVisitors={profileVisitors}
        newVisitCount={newVisitCount}
        onClearVisitCount={() => setNewVisitCount(0)}
        onBlock={handleBlock}
        myBlockList={blockedUsers.filter(b => b.user_id === currentUserId)}
        onUnblock={handleUnblock}
        />
      </Suspense>
      </AppErrorBoundary>
      </div>
      {view === 'profile' && selectedProfile && (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-white">
          <AppErrorBoundary screenName="프로필" onReset={() => setView('main')}>
            <ProfileDetail
              profile={selectedProfile}
              isMe={selectedProfile.id === currentUserId}
              isLiked={likedIds.has(selectedProfile.id)}
              heartType={sentHeartTypes.get(selectedProfile.id)}
              sentHeartsCount={sentHeartsPerPerson.get(selectedProfile.id)?.size ?? 0}
              locked={functionsLocked}
              onLike={() => { if (!functionsLocked) handleLike(selectedProfile.id); }}
              onChat={() => { openChat(selectedProfile); }}
              onBack={() => { setLikeConfirmTarget(null); setView('main'); }}
              onViewFortune={selectedProfile.birth_year && selectedProfile.birth_month && selectedProfile.birth_day ? () => {
                setFortuneCompatTarget(selectedProfile.id);
                setMainTab('fortune');
                setLikeConfirmTarget(null);
                setView('main');
              } : undefined}
            />
          </AppErrorBoundary>
        </div>
      )}
      {view === 'group-chat' && activeGroupId && (
        <div className="fixed inset-0 z-40">
          <GroupChatScreen
            group={groupChats.find(g => g.id === activeGroupId) ?? null}
            messages={groupMessages}
            currentUserId={currentUserId}
            profileMap={profileMap}
            darkMode={darkMode}
            onBack={() => { closeGroupChat(); setView('main'); }}
            onSendMessage={sendGroupMessage}
            onLeave={async () => { if (activeGroupId) await leaveGroupChat(activeGroupId); setView('main'); }}
          />
        </div>
      )}
      {view === 'chat' && selectedProfile && !chatId && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-white">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-pink-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-400">채팅방 열는 중…</p>
          </div>
        </div>
      )}
      {view === 'chat' && selectedProfile && chatId && (
        <div className="fixed inset-0 z-40">
          <ChatErrorBoundary onReset={() => { chatIdRef.current = null; setChatId(null); setView('main'); }}>
            <Suspense fallback={<div className="h-screen bg-white" />}>
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
                showSignalOpeners={
                  !!(selectedProfile
                    && hasInterestHeart(sentHeartsPerPerson.get(selectedProfile.id))
                    && isInterestHeart(receivedHeartTypes.get(selectedProfile.id)))
                }
              />
            </Suspense>
          </ChatErrorBoundary>
        </div>
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
      <ConfettiOverlay show={showConfetti} />
      <div className={isSubScreen ? 'hidden' : undefined} aria-hidden={isSubScreen}>
      {shareEventNotif && (() => {
        const fromProfile = profiles.find(p => p.id === shareEventNotif.fromUserId);
        const name = fromProfile?.nickname ?? '상대방';
        return (
          <ShareEventNotification
            notification={shareEventNotif}
            nickname={name}
            onClose={() => setShareEventNotif(null)}
          />
        );
      })()}
      {contactShareTarget && (
        <ContactShareModal
          liker={contactShareTarget}
          alreadyShared={contactSharedWithIds.has(contactShareTarget.id)}
          myProfile={currentUserId ? (profileMap.get(currentUserId) ?? null) : null}
          onSubmit={(kakao, instagram, phone) => handleContactShare(contactShareTarget.id, kakao, instagram, phone)}
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
      {/* ── 사주 궁합 팝업 모달 ── */}
      {fortuneModalTarget && (
        <div className="fixed inset-0 z-[200] flex flex-col bg-slate-900/95 backdrop-blur-sm overflow-y-auto">
          <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
            <p className="text-white font-black text-sm">🔮 {fortuneModalTarget.nickname}님과의 궁합</p>
            <button
              onClick={() => setFortuneModalTarget(null)}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center active:scale-90 transition-transform"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <Suspense fallback={<div className="flex items-center justify-center py-20 text-slate-400 text-sm">불러오는 중...</div>}>
              <FortuneTabLazy
                currentUserId={currentUserId}
                myProfile={currentUserId ? (profileMap.get(currentUserId) ?? null) : null}
                profiles={profiles}
                likedIds={likedIds}
                initialCompatProfileId={fortuneModalTarget.id}
              />
            </Suspense>
          </div>
        </div>
      )}
      </div>
    </>
  );
}


// ─── Profile Detail ───────────────────────────────────────────────────────────


export default App;
