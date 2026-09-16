import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase, setLocalDbUserId, fetchAndSetSseToken, ensureWriteSession } from './lib/supabase';
import { useParticipantSoTResync } from './hooks/useParticipantSoTResync';
import { useSseFallbackPoll } from './hooks/useSseFallbackPoll';
import { useDarkModeStorageSync } from './hooks/useDarkModeStorageSync';
import { useUserRealtimeChannel } from './hooks/useUserRealtimeChannel';
import { useAppShellRealtimeChannels } from './hooks/useAppShellRealtimeChannels';
import { useSessionReadyBootstrap } from './hooks/useSessionReadyBootstrap';
import { useProfileBootMachine } from './hooks/useProfileBootMachine';
import { useHeartsRealtimeApply } from './hooks/useHeartsRealtimeApply';
import { useProfilesRealtimeApply } from './hooks/useProfilesRealtimeApply';
import { usePrivacySignalsRealtimeApply } from './hooks/usePrivacySignalsRealtimeApply';
import { useAppShellRealtimeApply } from './hooks/useAppShellRealtimeApply';
import { useSocialLockGuards } from './hooks/useSocialLockGuards';
import { useNicknameRegistration } from './hooks/useNicknameRegistration';
import { useProfilePrivacyLoaders } from './hooks/useProfilePrivacyLoaders';
import { useSessionInit } from './hooks/useSessionInit';
import { planAdminResetWipe, runAdminResetWipe } from './lib/admin-reset-wipe';
import type { SessionReadySettingsPatch } from './lib/session-ready-settings';
import { eventHeartQuotas, eventRainbowQuota, currentEventSlot } from './lib/event-schedule';
import { subscribeNetUi, resetNetUiForRetry, type NetUiStatus } from './lib/net-health';
import { excludeSwipeGestureVerifyProfiles } from './lib/profile';
import { mergeProfilesPreserveOrder } from './lib/profile-list-order';
import { PROFILE_ROW_SELECT } from './lib/profile-select';
import {
  BLOCK_SESSION_EXPIRED_MESSAGE,
  blockFailureMessage,
  buildBlockedUserRow,
  shouldSkipBlock,
  unblockFailureMessage,
} from './lib/block-action';
import { isCompleteProfile } from './lib/profile-session';
import {
  shouldShowWaitingOverlay,
  shouldShowEntryGate,
  shouldShowNicknameSetup,
  shouldShowRecoveryScreen,
} from './lib/entry-gate';
import { countPendingHearts } from './lib/pending-hearts';
import {
  filterBlockedUsersForMe,
} from './lib/realtime-row-upsert';
import { shouldRecordProfileView } from './lib/profile-view-record';
import { FUNCTIONS_LOCK_KICK_TOAST, FUNCTIONS_LOCK_TOAST, FUNCTIONS_UNLOCK_TOAST, parseFunctionsLocked, planFunctionsLockTransition } from './lib/functions-lock';
// ─── 분리된 타입·유틸·컴포넌트 imports ────────────────────────────────────────
import type {
  Profile, ContactShare,
  View, MainTab, BlockedUser, ProfileView, UserSignal,
} from './types/app';
import { useGroupChat } from './hooks/useGroupChat';
import { renderAppEntryGates } from './components/AppEntryGates';
import { AppMainShell } from './components/AppMainShell';
import { AppOverlays } from './components/AppOverlays';
import {
  MATCHING_USER_KEY, MATCHING_DRAFT_KEY,
  MATCHING_PROFILES_CACHE_KEY,
  SCANNED_CONTACTS_KEY,
} from './lib/constants';
import { ls } from './lib/storage';
import { clearAllGroupLastReads } from './lib/group-rooms';
import { useHearts } from './hooks/useHearts';
import { useChat } from './hooks/useChat';
import { createParticipantNav, isParticipantAppPath } from './lib/participant-nav-history';
import { ParticipantNavProvider } from './hooks/useParticipantNav';
import { registerPushSub } from './lib/webPush';
import {
  type BottomNotificationData,
} from './components/BottomNotification';
import {
  type ShareEventNotificationData,
} from './components/ShareEventNotification';
import {
  derivePrivacyProfileIds,
  upsertScannedContact,
  type ScannedContact,
} from './lib/profile-contact-helpers';

const loadMainScreen = () => import('./components/MainScreen').then(m => ({ default: m.MainScreen }));
const loadChatScreen = () => import('./components/ChatScreen');

// ─── App ──────────────────────────────────────────────────────────────────────




function App() {
  const participantNavRef = useRef<ReturnType<typeof createParticipantNav> | null>(null);
  if (!participantNavRef.current) participantNavRef.current = createParticipantNav();
  const participantNav = participantNavRef.current;

  const [currentUserId, setCurrentUserId] = useState<string | null>(() => {
    return ls.getItem(MATCHING_USER_KEY) ?? null;
  });
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = currentUserId;

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

  // Participant-only History trap: Android Back / iOS swipe close overlays, not the SPA.
  useEffect(() => {
    const nav = participantNav;
    nav.install();
    const onPop = () => {
      if (!isParticipantAppPath(window.location.pathname, import.meta.env.BASE_URL.replace(/\/$/, ''))) return;
      nav.handlePopState();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
    };
  }, [participantNav]);
  const [sessionActive, setSessionActive] = useState<boolean | null>(null);
  const sessionActiveRef = useRef<boolean | null>(null);
  // Existing users skip the waiting overlay entirely and go straight to main.
  // New users go straight to nickname setup — no waiting overlay.
  const [shownWaiting, setShownWaiting] = useState(() => {
    try {
      return Boolean(ls.getItem(MATCHING_USER_KEY) || localStorage.getItem('test_token_v1'));
    } catch {
      return Boolean(ls.getItem(MATCHING_USER_KEY));
    }
  });
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
  const [contactViewShare, setContactViewShare] = useState<{ share: ContactShare; profile: Profile } | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [view, setView] = useState<View>(() => {
    // localStorage UUID만으로 main 진입 금지 — 서버 프로필 검증 후 전환
    if (ls.getItem(MATCHING_USER_KEY)) return 'loading-main';
    return 'entry-1';
  });
  const viewRef = useRef(view);
  viewRef.current = view;
  /** 프로필 부트스트랩: checking=검증 중, ok=완료, recover=복구번호 필요, register=신규 등록 필요 */
  const [profileBoot, setProfileBoot] = useState<'checking' | 'ok' | 'recover' | 'register'>(
    () => (ls.getItem(MATCHING_USER_KEY) ? 'checking' : 'register'),
  );
  const [mainTab, setMainTab] = useState<MainTab>('profiles');
  const [coachReplayToken, setCoachReplayToken] = useState(0);
  const [fortuneModalTarget, setFortuneModalTarget] = useState<Profile | null>(null);
  const [showTutorialModal, setShowTutorialModal] = useState(false);
  const [showContactQr, setShowContactQr] = useState(false);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [scannedContactProfile, setScannedContactProfile] = useState<import('./types/app').Profile | null>(null);

  // ── 스캔한 연락처 (localStorage 영구 보관) ─────────────────────────────────
  const [scannedContacts, setScannedContacts] = useState<ScannedContact[]>(() => {
    try { return JSON.parse(ls.getItem(SCANNED_CONTACTS_KEY) ?? '[]') as ScannedContact[]; } catch { return []; }
  });
  const saveScannedContact = (profile: Profile) => {
    if (!profile.id) return;
    setScannedContacts(prev => {
      const next = upsertScannedContact(prev, profile, new Date().toISOString());
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
  const loadGroupChatsRef = useRef<((userId: string) => Promise<void>) | null>(null);
  /** 채팅 탭·단톡 화면 밖이면 group catalog SSE reload 생략 */
  const groupCatalogHotRef = useRef(true);
  // 채팅방별 미전송 초안 보존 — 뒤로가기 후 재진입 시 복원
  const chatDraftRef = useRef<Map<string, string>>(new Map());
  const loadReceivedLikesRef = useRef<((userId: string) => Promise<void>) | null>(null);
  const loadLikesRef = useRef<((userId: string) => Promise<void>) | null>(null);
  const loadContactShareDataRef = useRef<((userId: string) => Promise<void>) | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeNotif, setActiveNotif] = useState<{ id: string; message: string; type: string; target: string } | null>(null);
  const [timerEndAt, setTimerEndAt] = useState<string | null>(null);
  const [timerLabel, setTimerLabel] = useState<string | null>(null);
  const [eventScheduleRaw, setEventScheduleRaw] = useState<string | null>(null);
  // Quotas change at clock-slot boundaries even when the schedule JSON is unchanged.
  const [eventScheduleMinute, setEventScheduleMinute] = useState(0);
  const [rejectionNotif, setRejectionNotif] = useState<string | null>(null); // nickname of person who rejected
  const [bottomNotif, setBottomNotif] = useState<BottomNotificationData | null>(null);
  const [showResetPassword, setShowResetPassword] = useState(false);
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
  const [mySubTabHint, setMySubTabHint] = useState<'status' | 'chats' | null>(null);
  const [functionsLocked, setFunctionsLocked] = useState(false);
  const functionsLockedRef = useRef(false);
  functionsLockedRef.current = functionsLocked;
  const functionsLockedPrevRef = useRef(false);
  const [functionsLockToast, setFunctionsLockToast] = useState<string | null>(null);
  const functionsLockToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showFunctionsLockToast = useCallback((msg: string = FUNCTIONS_LOCK_TOAST) => {
    if (functionsLockToastTimerRef.current) clearTimeout(functionsLockToastTimerRef.current);
    setFunctionsLockToast(msg);
    functionsLockToastTimerRef.current = setTimeout(() => {
      functionsLockToastTimerRef.current = null;
      setFunctionsLockToast(null);
    }, 1800);
  }, []);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [entryPassword, setEntryPassword] = useState<string | null>(null); // null = 아직 로드 전
  const [entryVerified, setEntryVerified] = useState(false);
  const [darkMode, setDarkMode] = useState(() => ls.getItem('dark_mode') === '1');
  // 테마 전환 시 dark_mode 동기화 (theme.tsx에서 storage 이벤트 발화)
  useDarkModeStorageSync(setDarkMode);

  // profile/privacy loaders + nickname/registration — App wires setState only
  const {
    loadProfiles,
    handleUserSignalUpdate,
    refreshProfilesTab,
  } = useProfilePrivacyLoaders({
    currentUserId,
    userIdRef,
    loadProfilesRef,
    setProfiles,
    setUserSignals,
    setBlockedUsers,
    setProfileVisitors,
  });

  const { handleNicknameSetup, handleProfileRecovery, reset } = useNicknameRegistration({
    isNewRegistration,
    setLoading,
    setRegistrationError,
    setProfiles,
    setUserSignals,
    setCurrentUserId,
    setProfileBoot,
    setView,
    setShownWaiting,
    setEntryVerified,
  });

  // loading-main profile boot / backoff — pure machine + thin hook; App applies results
  useProfileBootMachine({
    view,
    getUserId: () => userIdRef.current,
    getProfiles: () => profilesRef.current,
    loadProfiles: () => loadProfilesRef.current(),
    fetchProfileById: async (uid) => {
      const { data: direct } = await supabase.from('profiles').select(PROFILE_ROW_SELECT).eq('id', uid).maybeSingle();
      return (direct as Profile | null) ?? null;
    },
    mergeFetchedProfile: (me) => {
      setProfiles(prev => prev.some(p => p.id === me.id)
        ? prev.map(p => (p.id === me.id ? me : p))
        : mergeProfilesPreserveOrder(prev, [...prev, me]));
    },
    onEnterMain: () => {
      setProfileBoot('ok');
      setView('main');
    },
    onRegister: () => {
      setProfileBoot('register');
      setView('entry-1');
    },
    onRecoverCleared: () => {
      ls.removeItem(MATCHING_USER_KEY);
      ls.removeItem(MATCHING_DRAFT_KEY);
      setCurrentUserId(null);
      setProfileBoot('recover');
      setView('entry-recover');
    },
    onRecoverExhausted: () => {
      // A transient profile read failure is not a logout. Keep the stored
      // identity and let useProfileBootMachine retry in the background.
      setProfileBoot('checking');
      setView('loading-main');
    },
  });

  // SSE fallback poll: useSseFallbackPoll (wired after loaders below)

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
    unreadChatCounts, setUnreadChatCounts,
    loadChatList, openChat, sendMessage, sendImage,
    deleteChat, deleteAllChats, deleteMessage,
    hasMoreOlderMessages, loadingOlderMessages, loadOlderMessages,
  } = useChat({ currentUserId, profilesRef, setSelectedProfile, setView, setBottomNotif, functionsLocked });

  const {
    groupChats,
    activeGroupId,
    groupMessages,
    groupParticipants,
    unreadGroupCounts,
    openGroupChat,
    joinGroupChat,
    joiningGroupId,
    closeGroupChat,
    sendGroupMessage,
    leaveGroupChat,
    loadGroupChats,
  } = useGroupChat({ currentUserId, profilesRef, setBottomNotif, groupCatalogHotRef });

  groupCatalogHotRef.current = mainTab === 'my' || view === 'group-chat' || !!activeGroupId;

  const {
    likedIds, setLikedIds, sentHeartTypes, setSentHeartTypes, sentHeartsPerPerson, setSentHeartsPerPerson,
    receivedHeartTypes, setReceivedHeartTypes, likeStatuses, setLikeStatuses,
    receivedLikers, setReceivedLikers, contactSharedWithIds,
    acknowledgedComplimentIds, setAcknowledgedComplimentIds, receivedContactShares, setReceivedContactShares,
    likeConfirmTarget, setLikeConfirmTarget, contactShareTarget, setContactShareTarget,
    loadLikes, loadReceivedLikes, loadContactShareData, likedByTypeRecord,
    handleLike, executeLike, handleHeartResponse, handleContactShare,
    likeError, setLikeError,
  } = useHearts(currentUserId, profiles, profileMap, openChat, eventScheduleRaw);
  useEffect(() => {
    if (!eventScheduleRaw) { setEventScheduleMinute(0); return; }
    let timer: number | undefined;
    const refresh = () => setEventScheduleMinute(Math.floor(Date.now() / 60_000));
    const schedule = () => {
      timer = window.setTimeout(() => { refresh(); schedule(); }, 60_000 - (Date.now() % 60_000) + 50);
    };
    refresh();
    schedule();
    return () => { if (timer !== undefined) window.clearTimeout(timer); };
  }, [eventScheduleRaw]);
  const scheduleNow = useMemo(() => new Date(eventScheduleMinute * 60_000), [eventScheduleMinute]);
  const heartQuotas = useMemo(
    () => eventHeartQuotas(eventScheduleRaw, scheduleNow),
    [eventScheduleRaw, scheduleNow],
  );
  const rainbowPool = useMemo(
    () => eventRainbowQuota(eventScheduleRaw, scheduleNow),
    [eventScheduleRaw, scheduleNow],
  );
  // The schedule is also evaluated locally between SSE/ready heartbeats so a slot
  // boundary does not leave the buttons visually stale. The server remains authoritative.
  useEffect(() => {
    if (!eventScheduleRaw) return;
    const applySlotLock = () => {
      const lock = currentEventSlot(eventScheduleRaw)?.functions_locked;
      if (typeof lock === 'boolean') setFunctionsLocked(lock);
    };
    applySlotLock();
    const id = window.setInterval(applySlotLock, 1000);
    return () => window.clearInterval(id);
  }, [eventScheduleRaw]);

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
  loadGroupChatsRef.current = loadGroupChats;
  loadReceivedLikesRef.current = loadReceivedLikes;
  loadLikesRef.current = loadLikes;
  loadContactShareDataRef.current = loadContactShareData;
  const heartsRealtimeApply = useHeartsRealtimeApply({
    currentUserId,
    userIdRef,
    profilesRef,
    loadReceivedLikesRef,
    loadContactShareData,
    triggerConfetti,
    setLikedIds,
    setSentHeartTypes,
    setLikeStatuses,
    setSentHeartsPerPerson,
    setReceivedHeartTypes,
    setReceivedLikers,
    setAcknowledgedComplimentIds,
    setReceivedContactShares,
    setBottomNotif,
    setRejectionNotif,
    likedIds,
    likeStatuses,
    receivedContactShares,
    receivedHeartTypes,
    sentHeartsPerPerson,
  });

  const profilesRealtimeApply = useProfilesRealtimeApply({
    userIdRef,
    setProfiles,
  });

  const privacySignalsRealtimeApply = usePrivacySignalsRealtimeApply({
    userIdRef,
    setBlockedUsers,
    setProfileVisitors,
    setUserSignals,
  });

  const {
    handleLikeGuarded,
    handleHeartResponseGuarded,
    handleContactShareGuarded,
    openChatGuarded,
    sendMessageGuarded,
    sendImageGuarded,
    leaveGroupChatGuarded,
    handleMainOpenGroupChat,
    handleMainJoinGroupChat,
    handleMainLeaveGroupChat,
    sendGroupMessageGuarded,
    handleMainTabChange,
    execLikeGuarded,
    handleContactShareOpen,
  } = useSocialLockGuards({
    functionsLocked,
    functionsLockedRef,
    showFunctionsLockToast,
    handleLike,
    handleHeartResponse,
    handleContactShare,
    executeLike,
    triggerConfetti,
    setLikeConfirmTarget,
    setContactShareTarget,
    openChat,
    sendMessage,
    sendImage,
    openGroupChat,
    joinGroupChat,
    leaveGroupChat,
    closeGroupChat,
    sendGroupMessage,
    setView,
    setMainTab,
  });

  // 채팅 탭 진입 시 단톡 목록 로드
  useEffect(() => {
    if (mainTab === 'my' && currentUserId) {
      void loadGroupChats(currentUserId);
    }
  }, [mainTab, currentUserId, loadGroupChats]);

  const screenStackRef = useRef<Array<'profile' | 'chat' | 'group-chat'>>([]);
  const navDrivenViewRef = useRef(false);
  const closeChatLayerRef = useRef(() => {});
  const closeProfileLayerRef = useRef(() => {});
  const closeGroupLayerRef = useRef(() => {});

  closeChatLayerRef.current = () => {
    navDrivenViewRef.current = true;
    chatIdRef.current = null;
    setChatId(null);
    if (screenStackRef.current.at(-1) === 'chat') screenStackRef.current.pop();
    const prev = screenStackRef.current.at(-1);
    setView(prev === 'profile' ? 'profile' : 'main');
  };
  closeProfileLayerRef.current = () => {
    navDrivenViewRef.current = true;
    setLikeConfirmTarget(null);
    if (screenStackRef.current.at(-1) === 'profile') screenStackRef.current.pop();
    setView('main');
  };
  closeGroupLayerRef.current = () => {
    navDrivenViewRef.current = true;
    if (screenStackRef.current.at(-1) === 'group-chat') screenStackRef.current.pop();
    closeGroupChat();
    setView('main');
  };

  const goParticipantBack = useCallback(() => {
    if (participantNav.depth() > 0) participantNav.requestBack();
    else if (view === 'chat') closeChatLayerRef.current();
    else if (view === 'profile') closeProfileLayerRef.current();
    else if (view === 'group-chat') closeGroupLayerRef.current();
  }, [participantNav, view]);

  useEffect(() => {
    if (view === 'profile' || view === 'chat' || view === 'group-chat') {
      if (screenStackRef.current.at(-1) !== view) {
        screenStackRef.current.push(view);
        const close = view === 'chat'
          ? () => closeChatLayerRef.current()
          : view === 'profile'
            ? () => closeProfileLayerRef.current()
            : () => closeGroupLayerRef.current();
        participantNav.push(`screen:${view}`, close);
      }
      navDrivenViewRef.current = false;
      return;
    }
    if (navDrivenViewRef.current) {
      navDrivenViewRef.current = false;
      return;
    }
    const drop: string[] = [];
    while (true) {
      const top = screenStackRef.current.at(-1);
      if (top !== 'profile' && top !== 'chat' && top !== 'group-chat') break;
      screenStackRef.current.pop();
      drop.push(`screen:${top}`);
    }
    const extra = participantNav.layers().filter(id =>
      drop.includes(id) || id.startsWith('chat-') || id === 'group-leave',
    );
    const ids = [...new Set([...drop, ...extra])];
    if (ids.length) participantNav.dropMatching(ids);
  }, [view, participantNav]);

  // 오버레이를 display:none 으로 메인을 접지 않으므로, 뒤 스크롤만 잠근다.
  useEffect(() => {
    const sub = view === 'profile' || view === 'chat' || view === 'group-chat';
    if (!sub) return;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => { html.style.overflow = prev; };
  }, [view]);

  // 잠금이 켜지는 순간에만 채팅·단톡·궁합 모달에서 참여자 탭으로 되돌림. 통계·랭킹·설정은 유지.
  useEffect(() => {
    const wasLocked = functionsLockedPrevRef.current;
    functionsLockedPrevRef.current = functionsLocked;
    const plan = planFunctionsLockTransition({
      wasLocked,
      nowLocked: functionsLocked,
      view,
      mainTab,
      hasFortuneModal: Boolean(fortuneModalTarget),
      hasLikeConfirm: Boolean(likeConfirmTarget),
      hasContactShare: Boolean(contactShareTarget),
    });
    if (plan.showUnlockToast) {
      showFunctionsLockToast(FUNCTIONS_UNLOCK_TOAST);
      return;
    }
    if (plan.closeChatOrGroup) {
      chatIdRef.current = null;
      setChatId(null);
      closeGroupChat();
      setView('main');
    }
    if (plan.resetMainTabToProfiles) setMainTab('profiles');
    if (plan.clearFortune) setFortuneModalTarget(null);
    if (plan.clearLikeConfirm) setLikeConfirmTarget(null);
    if (plan.clearContactShare) setContactShareTarget(null);
    if (plan.showKickToast) showFunctionsLockToast(FUNCTIONS_LOCK_KICK_TOAST);
  }, [functionsLocked, view, mainTab, fortuneModalTarget, likeConfirmTarget, contactShareTarget, chatIdRef, closeGroupChat, setChatId, setContactShareTarget, setLikeConfirmTarget, showFunctionsLockToast]);

  // ─── 차단·숨기기 처리 (pure planners + thin async wire) ───────────────────
  const handleBlock = useCallback(async (targetId: string, type: 'block' | 'hide') => {
    if (shouldSkipBlock({ currentUserId, targetId, type, blockedUsers })) return;
    const sessionOk = await ensureWriteSession();
    if (!sessionOk) {
      setBottomNotif({ type: 'system', message: BLOCK_SESSION_EXPIRED_MESSAGE });
      return;
    }
    const id = crypto.randomUUID();
    const row = buildBlockedUserRow({
      id,
      currentUserId: currentUserId!,
      targetId,
      type,
      createdAt: new Date().toISOString(),
    });
    // 낙관적 업데이트
    setBlockedUsers(prev => [...prev, row]);
    const { error } = await supabase.from('blocked_users').insert(row as never);
    if (error) {
      console.error('[handleBlock]', error);
      setBlockedUsers(prev => prev.filter(b => b.id !== id));
      setBottomNotif({ type: 'system', message: blockFailureMessage(type) });
    }
  }, [currentUserId, blockedUsers, setBottomNotif]);

  // ─── 차단·숨기기 해제 ────────────────────────────────────────────────────
  const handleUnblock = useCallback(async (blockId: string) => {
    const sessionOk = await ensureWriteSession();
    if (!sessionOk) {
      setBottomNotif({ type: 'system', message: BLOCK_SESSION_EXPIRED_MESSAGE });
      return;
    }
    setBlockedUsers(prev => prev.filter(b => b.id !== blockId));
    const { error } = await supabase.from('blocked_users').delete().eq('id', blockId as never);
    if (error) {
      console.error('[handleUnblock]', error);
      setBottomNotif({ type: 'system', message: unblockFailureMessage() });
      // 실패 시 재로드
      supabase.from('blocked_users').select('id, user_id, target_id, block_type, created_at').then(({ data }: { data: unknown }) => {
        if (Array.isArray(data) && currentUserId) {
          setBlockedUsers(filterBlockedUsersForMe(data as BlockedUser[], currentUserId));
        }
      }).catch(() => {});
    }
  }, [currentUserId, setBottomNotif]);

  // ─── 프로필 열 때 방문 기록 ───────────────────────────────────────────────
  // 카드 사진 탭(뒤집기)과 상세/사주 오픈이 연속되면 같은 상대에 대해 중복 INSERT 방지
  const recentProfileViewsRef = useRef<Map<string, number>>(new Map());
  const recordProfileView = useCallback(async (viewedId: string) => {
    const now = Date.now();
    const last = recentProfileViewsRef.current.get(viewedId) ?? 0;
    if (!shouldRecordProfileView({
      viewerId: currentUserId,
      viewedId,
      lastRecordedAt: last,
      now,
    })) return;
    recentProfileViewsRef.current.set(viewedId, now);
    const row: ProfileView = { id: crypto.randomUUID(), viewer_id: currentUserId!, viewed_id: viewedId, viewed_at: new Date().toISOString() };
    try { await supabase.from('profile_views').insert(row as never); } catch {}
  }, [currentUserId]);

  const handleSelectProfile = useCallback((p: Profile) => {
    setLikeConfirmTarget(null);
    setSelectedProfile(p);
    setView('profile');
    void recordProfileView(p.id);
  }, [recordProfileView, setLikeConfirmTarget]);

  const handleUpdateProfile = useCallback((update: Record<string, unknown> & { id: string }) => {
    setProfiles(prev => prev.map(p => p.id === update.id ? { ...p, ...update } : p));
  }, []);

  const handleToggleDark = useCallback(() => {
    setDarkMode(prev => {
      const next = !prev;
      ls.setItem('dark_mode', next ? '1' : '0');
      return next;
    });
  }, []);

  const handleClearScannedContact = useCallback((id: string) => {
    setScannedContacts(prev => {
      const next = prev.filter(c => c.id !== id);
      try { ls.setItem(SCANNED_CONTACTS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const handleShowTutorial = useCallback(() => {
    setShowTutorialModal(true);
  }, []);

  const handleClearChatUnread = useCallback((chatId: string) => {
    setUnreadChatCounts(prev => { const n = { ...prev }; delete n[chatId]; return n; });
  }, [setUnreadChatCounts]);

  const handleContactViewOpen = useCallback((share: ContactShare, profile: Profile) => {
    setContactViewShare({ share, profile });
  }, []);

  const handleViewFortuneFromCard = useCallback((p: Profile) => {
    if (functionsLockedRef.current) { showFunctionsLockToast(); return; }
    setFortuneModalTarget(p);
    void recordProfileView(p.id);
  }, [recordProfileView, showFunctionsLockToast]);

  const handleViewProfileCard = useCallback((p: Profile) => {
    void recordProfileView(p.id);
  }, [recordProfileView]);


  // Admin reset wipe — planner/runner; shared by /ready bootstrap + settings SSE apply.
  const applyResetSignal = useCallback((serverReset: string) => {
    runAdminResetWipe(planAdminResetWipe(serverReset), {
      setItem: (k, v) => ls.setItem(k, v),
      removeItem: (k) => ls.removeItem(k),
      clearAllGroupLastReads,
      setCurrentUserId,
      setShownWaiting,
      setProfilesEmpty: () => setProfiles([]),
      clearHeartsAndChats: () => {
        setLikedIds(new Set());
        setSentHeartTypes(new Map());
        setSentHeartsPerPerson(new Map());
        setAcknowledgedComplimentIds(new Set());
        setReceivedLikers([]);
        setChatList([]);
      },
      setActiveNotif,
      reloadProfiles: () => { void loadProfilesRef.current().catch(() => {}); },
      setView,
    });
  }, [setLikedIds, setSentHeartTypes, setSentHeartsPerPerson, setAcknowledgedComplimentIds, setReceivedLikers, setChatList]);

  useSessionReadyBootstrap({
    applyResetSignal,
    setAppLoading,
    setSessionActive,
    setSessionActiveRef: (v) => { sessionActiveRef.current = v; },
    setEntryPassword,
    setEntryVerified,
    setTimerEndAt,
    setTimerLabel,
    setEventSchedule: setEventScheduleRaw,
    setFunctionsLocked,
  });

  // participant session-init — hearts clear, profile resolve, deferred loads, ?share= QR
  useSessionInit({
    currentUserId,
    isNewRegistration,
    viewRef,
    loadProfiles,
    loadLikes,
    loadReceivedLikes,
    loadContactShareData,
    loadChatList,
    clearHeartsState: () => {
      setLikedIds(new Set());
      setSentHeartTypes(new Map());
      setSentHeartsPerPerson(new Map());
      setReceivedHeartTypes(new Map());
      setLikeStatuses(new Map());
      setReceivedLikers([]);
    },
    setProfileBoot,
    setView,
    setMainTab,
    setMySubTabHint,
    setCurrentUserId,
    setShownWaiting,
    setProfiles,
    saveScannedContact,
    setScannedContactProfile,
    confettiTimerRef,
    confettiInnerTimerRef,
  });


  // Participant SoT: visibility + SSE reconnect live in useParticipantSoTResync.
  // App only wires loaders + applySessionReady (no new useState for this peel).
  const applySessionReady = useCallback((patch: SessionReadySettingsPatch, source: 'visibility' | 'sse-reconnect') => {
    if (typeof patch.sessionActive === 'boolean') {
      sessionActiveRef.current = patch.sessionActive;
      setSessionActive(patch.sessionActive);
      if (source === 'sse-reconnect' && !patch.sessionActive && userIdRef.current) {
        setShownWaiting(false);
      }
    }
    if (patch.hasFunctionsLocked) {
      setFunctionsLocked(parseFunctionsLocked(patch.functionsLockedRaw));
    }
    if (patch.includeTimers) {
      setTimerEndAt(patch.timerEndAt ?? null);
      setTimerLabel(patch.timerLabel ?? null);
      if (patch.eventScheduleRaw !== undefined) setEventScheduleRaw(patch.eventScheduleRaw ?? null);
    }
  }, []);

  useParticipantSoTResync({
    currentUserId,
    getStoredUserId: () => ls.getItem(MATCHING_USER_KEY),
    loadProfiles,
    loadChatList,
    loadLikes,
    loadReceivedLikes,
    loadContactShareData,
    applySessionReady,
  });

  // profiles + likes/contact_shares + privacy + signals fan-in — App wires apply hooks; channel only routes.
  useUserRealtimeChannel({
    currentUserId,
    ...profilesRealtimeApply,
    ...heartsRealtimeApply,
    ...privacySignalsRealtimeApply,
  });

  // app_settings + notifications + contact_share_events — App wires apply; channel only routes.
  const appShellRealtimeApply = useAppShellRealtimeApply({
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
    setEntryPassword,
    setEntryVerified,
    setActiveNotif,
    setShareEventNotif,
  });
  useAppShellRealtimeChannels(appShellRealtimeApply);

  // SSE unhealthy poll — App only wires loaders (mirrors SoT peel; no new useState).
  useSseFallbackPoll({
    connStatus,
    currentUserId,
    loadProfiles,
    loadChatList,
    loadGroupChats,
    loadReceivedLikes,
    loadLikes,
    loadContactShareData,
  });

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


  // useMemo: 매 렌더마다 filter 재계산 방지 — 모든 early return 전에 선언 (Rules of Hooks 준수)
  const sentLikedProfiles = useMemo(
    () => profiles.filter((p) => likedIds.has(p.id)),
    [profiles, likedIds],
  );
  const pendingHeartsCount = useMemo(
    () => countPendingHearts(
      receivedLikers,
      receivedHeartTypes,
      acknowledgedComplimentIds,
      contactSharedWithIds,
    ),
    [receivedLikers, receivedHeartTypes, acknowledgedComplimentIds, contactSharedWithIds],
  );

  const privacyProfileIds = useMemo(
    () => derivePrivacyProfileIds(blockedUsers, currentUserId),
    [blockedUsers, currentUserId],
  );

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
    shownWaiting,
  });

  // 테마 FAB: 프로필 설정 완료 후 메인에서만 (입장/대기/닉네임 화면 숨김)
  useEffect(() => {
    const ready = Boolean(
      currentUserId
      && hasValidProfile
      && profileBoot === 'ok'
      && !showEntryGate
      && !showWaiting
      && !showNicknameSetup,
    );
    if (ready) document.body.dataset.appReady = '1';
    else delete document.body.dataset.appReady;
    return () => { delete document.body.dataset.appReady; };
  }, [currentUserId, hasValidProfile, profileBoot, showEntryGate, showWaiting, showNicknameSetup]);

  // 하트 확인 모달: MY FAB가 모바일에서 터치를 가로채지 않도록 overlay 표시
  useEffect(() => {
    if (!likeConfirmTarget) return;
    document.body.dataset.overlay = 'like-confirm';
    return () => { delete document.body.dataset.overlay; };
  }, [likeConfirmTarget]);

  const entryGate = renderAppEntryGates({
    appLoading,
    sessionActive,
    entryPassword,
    showEntryGate,
    showWaiting,
    showRecovery,
    showNicknameSetup,
    currentUserId,
    hasValidProfile,
    profileBoot,
    view,
    loading,
    registrationError,
    onEntryVerified: () => { setMainTab('profiles'); setEntryVerified(true); },
    onWaitingEnter: () => { setMainTab('profiles'); setShownWaiting(true); },
    onRecover: handleProfileRecovery,
    onRecoveryBackToRegister: () => { setProfileBoot('register'); setView('entry-1'); },
    onRecoveryBackToEntry: () => setView('entry-1'),
    onNicknameSubmit: handleNicknameSetup,
    onReset: reset,
    onShowRecovery: () => setView('entry-recover'),
  });
  if (entryGate) return entryGate;

    const isSubScreen = view === 'profile' || view === 'chat' || view === 'group-chat';

  return (
    <ParticipantNavProvider nav={participantNav}>
      <AppOverlays
        isSubScreen={isSubScreen}
        mainTab={mainTab}
        showTutorialModal={showTutorialModal}
        setShowTutorialModal={setShowTutorialModal}
        activeNotif={activeNotif}
        setActiveNotif={setActiveNotif}
        showResetPassword={showResetPassword}
        setShowResetPassword={setShowResetPassword}
        likeConfirmTarget={likeConfirmTarget}
        setLikeConfirmTarget={setLikeConfirmTarget}
        contactShareTarget={contactShareTarget}
        setContactShareTarget={setContactShareTarget}
        contactViewShare={contactViewShare}
        setContactViewShare={setContactViewShare}
        showContactQr={showContactQr}
        setShowContactQr={setShowContactQr}
        showQrScanner={showQrScanner}
        setShowQrScanner={setShowQrScanner}
        scannedContactProfile={scannedContactProfile}
        setScannedContactProfile={setScannedContactProfile}
        fortuneModalTarget={fortuneModalTarget}
        setFortuneModalTarget={setFortuneModalTarget}
        connStatus={connStatus}
        onReconnectRetry={() => {
          resetNetUiForRetry();
          const uid = userIdRef.current;
          if (uid) {
            fetchAndSetSseToken(uid).catch(() => {});
            loadChatListRef.current?.(uid).catch(() => {});
            loadReceivedLikesRef.current?.(uid).catch(() => {});
            loadLikesRef.current?.(uid).catch(() => {});
            loadContactShareDataRef.current?.(uid).catch(() => {});
            loadGroupChatsRef.current?.(uid).catch(() => {});
            loadProfilesRef.current().catch(() => {});
          } else {
            window.location.reload();
          }
        }}
        rejectionNotif={rejectionNotif}
        setRejectionNotif={setRejectionNotif}
        functionsLockToast={functionsLockToast}
        bottomNotif={bottomNotif}
        setBottomNotif={setBottomNotif}
        setMySubTabHint={setMySubTabHint}
        handleMainTabChange={handleMainTabChange}
        coachReplayToken={coachReplayToken}
        onForceCoachParticipants={() => setMainTab('profiles')}
        profiles={profiles}
        receivedLikers={receivedLikers}
        setSelectedProfile={setSelectedProfile}
        setView={setView}
        openChatGuarded={openChatGuarded}
        reset={reset}
        view={view}
        selectedProfile={selectedProfile}
        currentUserId={currentUserId}
        likedIds={likedIds}
        sentHeartTypes={sentHeartTypes}
        sentHeartsPerPerson={sentHeartsPerPerson}
        receivedHeartTypes={receivedHeartTypes}
        functionsLocked={functionsLocked}
        userSignals={userSignals}
        handleLike={handleLike}
        goParticipantBack={goParticipantBack}
        showFunctionsLockToast={showFunctionsLockToast}
        activeGroupId={activeGroupId}
        groupChats={groupChats}
        groupMessages={groupMessages}
        groupParticipants={groupParticipants}
        profileMap={profileMap}
        darkMode={darkMode}
        sendGroupMessageGuarded={sendGroupMessageGuarded}
        leaveGroupChatGuarded={leaveGroupChatGuarded}
        chatId={chatId}
        setChatId={setChatId}
        chatIdRef={chatIdRef}
        messages={messages}
        sendMessageGuarded={sendMessageGuarded}
        sendImageGuarded={sendImageGuarded}
        deleteMessage={deleteMessage}
        hasMoreOlderMessages={hasMoreOlderMessages}
        loadingOlderMessages={loadingOlderMessages}
        loadOlderMessages={loadOlderMessages}
        receivedContactShares={receivedContactShares}
        contactSharedWithIds={contactSharedWithIds}
        setProfiles={setProfiles}
        chatDraftRef={chatDraftRef}
        likedByTypeRecord={likedByTypeRecord}
        execLikeGuarded={execLikeGuarded}
        showConfetti={showConfetti}
        shareEventNotif={shareEventNotif}
        setShareEventNotif={setShareEventNotif}
        handleContactShareGuarded={handleContactShareGuarded}
        saveScannedContact={saveScannedContact}
        privacyProfileIds={privacyProfileIds}
        heartQuotas={heartQuotas}
        rainbowPool={rainbowPool}
      >
        <AppMainShell
          isSubScreen={isSubScreen}
          onBoundaryReset={() => { setView('main'); setMainTab('profiles'); }}
          profiles={profiles}
          currentUserId={currentUserId}
          likedIds={likedIds}
          sentHeartsPerPerson={sentHeartsPerPerson}
          likeStatuses={likeStatuses}
          profileMap={profileMap}
          mainTab={mainTab}
          onTabChange={handleMainTabChange}
          onReplayCoach={() => { setMainTab('profiles'); setCoachReplayToken(value => value + 1); }}
          onLike={handleLikeGuarded}
          onSelect={handleSelectProfile}
          onReset={reset}
          onOpenResetPassword={() => setShowResetPassword(true)}
          receivedLikers={receivedLikers}
          receivedHeartTypes={receivedHeartTypes}
          sentHeartTypes={sentHeartTypes}
          sentLikedProfiles={sentLikedProfiles}
          contactSharedWithIds={contactSharedWithIds}
          acknowledgedComplimentIds={acknowledgedComplimentIds}
          receivedContactShares={receivedContactShares}
          pendingHeartsCount={pendingHeartsCount}
          chatList={chatList}
          onContactShareOpen={handleContactShareOpen}
          onContactViewOpen={handleContactViewOpen}
          onHeartResponse={handleHeartResponseGuarded}
          onDeleteChat={deleteChat}
          onDeleteAllChats={deleteAllChats}
          onOpenChat={openChatGuarded}
          timerEndAt={timerEndAt}
          timerLabel={timerLabel}
          heartQuotas={heartQuotas}
          rainbowPool={rainbowPool}
          eventScheduleRaw={eventScheduleRaw}
          onRefreshStatus={refreshStatusTab}
          onRefreshChat={refreshChatTab}
          onUpdateProfile={handleUpdateProfile}
          onRefreshProfiles={refreshProfilesTab}
          darkMode={darkMode}
          onToggleDark={handleToggleDark}
          scannedContacts={scannedContacts}
          onClearScannedContact={handleClearScannedContact}
          functionsLocked={functionsLocked}
          onShowTutorial={handleShowTutorial}
          unreadChatCounts={unreadChatCounts}
          onClearChatUnread={handleClearChatUnread}
          onViewFortune={handleViewFortuneFromCard}
          onViewProfile={handleViewProfileCard}
          groupChats={groupChats}
          unreadGroupCounts={unreadGroupCounts}
          onOpenGroupChat={handleMainOpenGroupChat}
          onJoinGroupChat={handleMainJoinGroupChat}
          onLeaveGroupChat={handleMainLeaveGroupChat}
          joiningGroupId={joiningGroupId}
          userSignals={userSignals}
          onUserSignalUpdate={handleUserSignalUpdate}
          mySubTabHint={mySubTabHint}
          onMySubTabHintConsumed={() => setMySubTabHint(null)}
          blockedUserIds={privacyProfileIds.blockedUserIds}
          hiddenByIds={privacyProfileIds.hiddenByIds}
          profileVisitors={profileVisitors}
          newVisitCount={newVisitCount}
          onClearVisitCount={() => setNewVisitCount(0)}
          onBlock={handleBlock}
          myBlockList={blockedUsers.filter(b => b.user_id === currentUserId)}
          onUnblock={handleUnblock}
        />
      </AppOverlays>
    </ParticipantNavProvider>
  );
}



// ─── Profile Detail ───────────────────────────────────────────────────────────


export default App;
