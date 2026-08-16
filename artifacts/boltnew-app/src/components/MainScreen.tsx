import { useState, useEffect, useRef, useCallback, useMemo, Suspense, lazy, Component, ReactNode, memo } from 'react';
/**
 * Main user shell UI (tabs: profiles/chats/status/…).
 * State/realtime: App.tsx + hooks (useChat/useHearts). See ARCHITECTURE.md.
 */
import {
  Heart, MessageCircle, Users, ChevronDown, CheckCircle,
  Eye, X, HelpCircle,
  QrCode, Camera, Search, MoreHorizontal,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';
import type { Profile, ContactShare, Chat, MainTab, GroupChat, ProfileView, UserSignal } from '../types/app';
import { groupRoomVisual, MAX_GROUPS_PER_USER, sumUnreadCounts, unreadForGroup } from '../lib/group-rooms';
import { unreadForChat } from '../lib/chat-unread';
import { BIO_CATEGORIES, parseProfileInterests } from '../lib/interests';
import { InterestPicker } from './InterestPicker';
import { HeartType, HEART_TYPES, heartMeta } from '../lib/constants';
import { getPositionLabel, getPositionBg, getPositionStyle, getDomSubLabel, getDomSubBg, getKoreanAge, genAvatar, getAvatarSrc, getAvatarGradientCss, hasUploadedPhoto, isSwipeGestureVerifyProfile } from '../lib/profile';
import { containsBannedNicknameWord } from '../lib/bannedWords';
import { getMbtiStyle, koreanMatch } from '../lib/utils';
import { ls } from '../lib/storage';
import ProfileAvatar from './ProfileAvatar';
import { StatsTab, RankingTab } from './StatsTabs';
import { ProfileInfoBadges } from './ProfileInfoBadges';
import { TimerBanner } from './TimerBanner';
import { RefreshBtn } from './RefreshBtn';

import { AVATAR_CATEGORIES } from '../lib/avatar-catalog';
import { IDEAL_TAG_GROUPS, FEATURE_TAG_GROUPS, encodeSignalMsg } from '../lib/signal-match';
import { ProfileCard } from './ProfileCard';
import { ResetButton } from './ResetButton';
import { SignalTab } from './SignalTab';
import { FUNCTIONS_LOCK_TOAST, SOCIAL_LOCKED_TABS } from '../lib/functions-lock';
const FortuneTab = lazy(() => import('./FortuneTab'));

export { ProfileCard };

// ─── StatusErrorBoundary ──────────────────────────────────────────────────────

class StatusErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[StatusErrorBoundary]', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <p className="text-red-500 font-bold text-sm">내 상태 탭 오류가 발생했습니다.</p>
          <p className="text-gray-400 text-xs">{this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 bg-cyan-500 text-white text-xs font-bold rounded-xl"
          >다시 시도</button>
        </div>
      );
    }
    return this.props.children;
  }
}


// ─── MainScreen ───────────────────────────────────────────────────────────────

export function MainScreen({
  profiles, currentUserId, likedIds, sentHeartTypes, sentHeartsPerPerson, likeStatuses, profileMap, mainTab,
  onTabChange, onLike, onSelect, onReset, onProfileClickFromMap: _onProfileClickFromMap,
  receivedLikers, receivedHeartTypes, sentLikedProfiles, contactSharedWithIds, acknowledgedComplimentIds,
  receivedContactShares, pendingHeartsCount, chatList,
  onContactShareOpen: _onContactShareOpen, onContactViewOpen, onHeartResponse, onDeleteChat, onDeleteAllChats, onOpenChat,
  timerEndAt, timerLabel, onRefreshStatus, onRefreshChat, onRefreshProfiles, darkMode, onToggleDark, onShowContactQr, onScanQr, scannedContacts, onClearScannedContact, functionsLocked = false, onShowTutorial,
  newMsgCount: _newMsgCount, onClearMsgCount: _onClearMsgCount, unreadChatCounts, onClearChatUnread: _onClearChatUnread,
  onUpdateProfile, fortuneCompatTarget, myHeartCount,
  groupChats = [], unreadGroupCounts = {}, newGroupMsgCount: _newGroupMsgCount = 0, onClearGroupMsgCount: _onClearGroupMsgCount, onOpenGroupChat, onJoinGroupChat, onLeaveGroupChat, joiningGroupId = null,
  blockedUserIds = new Set<string>(), hiddenByIds = new Set<string>(),
  profileVisitors = [] as ProfileView[],
  newVisitCount = 0,
  onClearVisitCount,
  onBlock,
  myBlockList = [] as import('../types/app').BlockedUser[],
  onUnblock,
  onViewFortune,
  onViewProfile,
  userSignals = [] as UserSignal[],
  onUserSignalUpdate,
  onMissionComplete,
  onOpenResetPassword,
}: {
  profiles: Profile[]; currentUserId: string | null; likedIds: Set<string>; sentHeartTypes: Map<string, HeartType>; sentHeartsPerPerson: Map<string, Set<HeartType>>; likeStatuses: Map<string, string>;
  profileMap: Map<string, Profile>; mainTab: MainTab;
  onTabChange: (t: MainTab) => void; onLike: (id: string) => void;
  onSelect: (p: Profile) => void; onReset: () => void;
  onProfileClickFromMap: (profile: Profile) => void;
  receivedLikers: Profile[]; receivedHeartTypes: Map<string, HeartType>; sentLikedProfiles: Profile[];
  contactSharedWithIds: Set<string>; acknowledgedComplimentIds: Set<string>; receivedContactShares: ContactShare[];
  pendingHeartsCount: number; chatList: Chat[];
  onContactShareOpen: (profile: Profile) => void;
  onContactViewOpen: (share: ContactShare, profile: Profile) => void;
  onHeartResponse: (likerId: string, response: 'accepted' | 'rejected') => void;
  onDeleteChat: (chat: Chat) => void;
  onDeleteAllChats: () => void;
  onOpenChat: (profile: Profile) => void;
  timerEndAt: string | null;
  timerLabel: string | null;
  onRefreshStatus: () => void;
  onRefreshChat: () => void;
  onRefreshProfiles: () => void;
  darkMode: boolean;
  onToggleDark: () => void;
  onShowContactQr: () => void;
  onScanQr: () => void;
  scannedContacts: Array<{ id: string; nickname: string; mbti?: string | null; photo_url?: string | null; kakao_id?: string | null; instagram_id?: string | null; phone_number?: string | null; contact_private?: boolean | null; scanned_at: string }>;
  onClearScannedContact: (id: string) => void;
  functionsLocked?: boolean;
  onShowTutorial: () => void;
  newMsgCount: number;
  onClearMsgCount: () => void;
  unreadChatCounts: Record<string, number>;
  onClearChatUnread: (chatId: string) => void;
  onUpdateProfile: (update: Record<string, unknown> & { id: string }) => void;
  fortuneCompatTarget?: string;
  myHeartCount?: number | null;
  groupChats?: GroupChat[];
  unreadGroupCounts?: Record<string, number>;
  newGroupMsgCount?: number;
  onClearGroupMsgCount?: () => void;
  onOpenGroupChat?: (groupId: string) => void;
  onJoinGroupChat?: (groupId: string) => void;
  onLeaveGroupChat?: (groupId: string) => void | Promise<void>;
  joiningGroupId?: string | null;
  blockedUserIds?: Set<string>;
  hiddenByIds?: Set<string>;
  profileVisitors?: ProfileView[];
  newVisitCount?: number;
  onClearVisitCount?: () => void;
  onBlock?: (targetId: string, type: 'block' | 'hide') => void;
  myBlockList?: import('../types/app').BlockedUser[];
  onUnblock?: (blockId: string) => void;
  onViewFortune?: (p: Profile) => void;
  onViewProfile?: (p: Profile) => void;
  userSignals?: UserSignal[];
  onUserSignalUpdate?: (row: UserSignal) => void;
  onMissionComplete?: () => void;
  onOpenResetPassword?: () => void;
}) {
  const heartCount = useCallback((t: HeartType) => { let c = 0; sentHeartsPerPerson.forEach(types => { if (types.has(t)) c++; }); return c; }, [sentHeartsPerPerson]);

  const _currentUserNickname = useMemo(() => profiles.find(p => p.id === currentUserId)?.nickname ?? '', [profiles, currentUserId]);
  const [profileSearch, setProfileSearch] = useState('');
  const [profilePersonalityFilter, setProfilePersonalityFilter] = useState<string | null>(null);
  const [showVisitors, setShowVisitors] = useState(false);
  const [profileMbtiFilter, setProfileMbtiFilter] = useState<string | null>(null);
  // 채팅 탭 내 서브탭: 1:1 채팅 / 단체 채팅
  const [chatSubTab, setChatSubTab] = useState<'direct' | 'group'>('direct');

  // ── 상태·이상형·나의 특징 입력 상태 ────────────────────────────────────────────
  const [signalStatusMsg, setSignalStatusMsg] = useState('');
  const [idealTags, setIdealTags] = useState<string[]>([]);
  const [idealFreeText, setIdealFreeText] = useState('');
  const [featureTags, setFeatureTags] = useState<string[]>([]);
  const [featureFreeText, setFeatureFreeText] = useState('');
  const [signalSaving, setSignalSaving] = useState(false);
  // 내 user_signals 초기값 동기화
  // ideal_msg / feature_msg 형식: "태그1,태그2\n기타자유텍스트" (줄바꿈으로 구분)
  useEffect(() => {
    const my = userSignals.find(s => s.user_id === currentUserId);
    if (my) {
      setSignalStatusMsg(my.status_msg ?? '');
      const parts = (my.ideal_msg ?? '').split('\n');
      setIdealTags(parts[0] ? parts[0].split(',').map(t => t.trim()).filter(Boolean) : []);
      setIdealFreeText(parts[1] ?? '');
      const featParts = (my.feature_msg ?? '').split('\n');
      setFeatureTags(featParts[0] ? featParts[0].split(',').map(t => t.trim()).filter(Boolean) : []);
      setFeatureFreeText(featParts[1] ?? '');
    }
  }, [userSignals, currentUserId]);

  // 참여자 목록 — 필터·정렬을 매 렌더마다 재계산하지 않도록 메모이제이션
  const filteredProfiles = useMemo(() => {
    return [...profiles]
      .filter(p => {
        // Playwright swipe-gesture fixtures must never appear in the live 3-col deck
        if (isSwipeGestureVerifyProfile(p) && p.id !== currentUserId) return false;
        // 차단·숨기기 필터 (상호 차단 or 상대방이 나를 숨긴 경우 제외)
        if (blockedUserIds.has(p.id) || hiddenByIds.has(p.id)) return false;
        if (profileSearch) {
          const matchNick = koreanMatch(p.nickname, profileSearch);
          const matchMbti = !!p.mbti && koreanMatch(p.mbti, profileSearch);
          const matchPos = koreanMatch(getPositionLabel(p.personality_score ?? 50), profileSearch);
          if (!matchNick && !matchMbti && !matchPos) return false;
        }
        if (profilePersonalityFilter) {
          const score = p.personality_score ?? 50;
          if (profilePersonalityFilter === '비선호' && score >= 0) return false;
          if (profilePersonalityFilter === '바텀계열' && (score < 0 || score > 49)) return false;
          if (profilePersonalityFilter === '올계열' && (score < 50 || score > 55)) return false;
          if (profilePersonalityFilter === '탑계열' && score < 56) return false;
        }
        if (profileMbtiFilter && p.mbti !== profileMbtiFilter) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.id === currentUserId) return -1;
        if (b.id === currentUserId) return 1;
        return 0;
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles, profileSearch, profilePersonalityFilter, profileMbtiFilter, currentUserId, blockedUserIds, hiddenByIds]);

  const [refreshedTab, setRefreshedTab] = useState<string | null>(null);

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 언마운트 시 대기 중인 타이머 취소
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);
  const doRefresh = (tabId: string, fn: () => void) => {
    fn();
    setRefreshedTab(tabId);
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      setRefreshedTab(null);
    }, 2000);
  };
  const heartsKey = `seen_hearts_${currentUserId ?? 'x'}`;
  const contactsKey = `seen_contacts_${currentUserId ?? 'x'}`;
  const profilesKey = `seen_profiles_${currentUserId ?? 'x'}`;
  const [seenHeartsCount, setSeenHeartsCountRaw] = useState(() => {
    const v = ls.getItem(heartsKey); return v !== null ? parseInt(v, 10) : 0;
  });
  const [seenProfilesCount, setSeenProfilesCountRaw] = useState(() => {
    const v = ls.getItem(profilesKey); return v !== null ? parseInt(v, 10) : -1;
  });
  const [seenContactsCount, setSeenContactsCountRaw] = useState(() => {
    const v = ls.getItem(contactsKey); return v !== null ? parseInt(v, 10) : 0;
  });

  const setSeenHeartsCount = (n: number) => { ls.setItem(heartsKey, String(n)); setSeenHeartsCountRaw(n); };
  const setSeenProfilesCount = (n: number) => { ls.setItem(profilesKey, String(n)); setSeenProfilesCountRaw(n); };
  const setSeenContactsCount = (n: number) => { ls.setItem(contactsKey, String(n)); setSeenContactsCountRaw(n); };

  const newContactsCount = Math.max(0, receivedContactShares.length - seenContactsCount);

  // 방문자 알림 ON/OFF 설정 (localStorage)
  const [visitorNotif, setVisitorNotif] = useState(() => localStorage.getItem('visitor_notification') !== '0');

  // On initial data load, baseline profiles/contacts so pre-existing rows don't look "new".
  // Hearts: do NOT auto-baseline. seen=0 (no localStorage / never opened 내 상태) must
  // keep showing MY(n) for unread hearts already present on login.
  const baselineSetRef = useRef(false);
  useEffect(() => {
    if (baselineSetRef.current) return;
    // 데이터가 아직 하나도 로드되지 않은 초기 상태면 대기 (빈 값으로 baseline 설정 방지)
    const hasAnyData = profiles.length > 0 || pendingHeartsCount > 0 || receivedContactShares.length > 0;
    if (!hasAnyData) return;
    baselineSetRef.current = true;
    if (seenContactsCount === 0) setSeenContactsCount(receivedContactShares.length);
    if (seenProfilesCount === -1 || seenProfilesCount === 0) setSeenProfilesCount(profiles.length);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingHeartsCount, receivedContactShares.length, profiles.length]);

  // 하향 동기화: 하트/연락처 수가 줄어들었으면(상대방 취소 등) seen 카운트를 낮춰 고스트 배지 제거
  useEffect(() => {
    if (pendingHeartsCount < seenHeartsCount) setSeenHeartsCount(pendingHeartsCount);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingHeartsCount]);
  useEffect(() => {
    if (receivedContactShares.length < seenContactsCount) setSeenContactsCount(receivedContactShares.length);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receivedContactShares.length]);

  // 이미 💝 탭에 있는 동안 새 연락처/하트가 도착해도 즉시 배지 클리어
  // (탭 버튼을 다시 클릭하지 않아도 보고 있으면 읽은 것으로 처리)
  useEffect(() => {
    if (mainTab === 'status') {
      setSeenContactsCount(receivedContactShares.length);
      setSeenHeartsCount(pendingHeartsCount);
      onClearVisitCount?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainTab, receivedContactShares.length, pendingHeartsCount]);

  // 채팅 탭만 열었다고 미읽음 숫자를 지우지 않는다. 방별 unread는 openChat이 처리.

  // visibility 핸들러에서 stale closure 없이 최신 값 참조 (useEffect deps에 넣지 않아도 항상 최신)
  const pendingHeartsCountRef = useRef(pendingHeartsCount);
  pendingHeartsCountRef.current = pendingHeartsCount;
  const receivedContactSharesLenRef = useRef(receivedContactShares.length);
  receivedContactSharesLenRef.current = receivedContactShares.length;
  const seenHeartsCountRef = useRef(seenHeartsCount);
  seenHeartsCountRef.current = seenHeartsCount;
  const seenContactsCountRef = useRef(seenContactsCount);
  seenContactsCountRef.current = seenContactsCount;

  // 앱 재방문(페이지 포커스) 시 새로 온 게 없으면 배지 자동 클리어
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      // seen보다 pending이 적으면 seen을 낮춰 고스트 배지 해소 (취소된 하트/연락처 처리)
      if (pendingHeartsCountRef.current < seenHeartsCountRef.current)
        setSeenHeartsCount(pendingHeartsCountRef.current);
      if (receivedContactSharesLenRef.current < seenContactsCountRef.current)
        setSeenContactsCount(receivedContactSharesLenRef.current);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 기능 잠금(functionsLocked) 시 이동 불가 탭 — 시그널·채팅·운세 (통계·랭킹은 열림)
  const LOCKED_TABS = SOCIAL_LOCKED_TABS;

  // MY 버튼 팝업 열림 상태
  const [myMenuOpen, setMyMenuOpen] = useState(false);

  const handleTabChange = (t: MainTab) => {
    if (functionsLocked && LOCKED_TABS.has(t)) { showChatSearchLockToast(); return; }
    if (t === 'status') { setSeenHeartsCount(pendingHeartsCount); setSeenContactsCount(receivedContactShares.length); onClearVisitCount?.(); }
    if (t === 'profiles') setSeenProfilesCount(profiles.length);
    onTabChange(t);
  };

  // ── 사주 탭 생월·생일 편집 상태 ─────────────────────────────────────────────
  const [chatSearch, setChatSearch] = useState('');
  const [chatSearchLockToast, setChatSearchLockToast] = useState(false);
  const showChatSearchLockToast = () => { setChatSearchLockToast(true); setTimeout(() => setChatSearchLockToast(false), 1400); };
  const guardLockedAction = (): boolean => {
    if (!functionsLocked) return false;
    showChatSearchLockToast();
    return true;
  };
  // ── 내 상태 탭 카드 접기/펼치기 ────────────────────────────────────────────
  const [profileEditOpen, setProfileEditOpen] = useState(true);
  const [receivedHeartsOpen, setReceivedHeartsOpen] = useState(true);
  const [sentHeartsOpen, setSentHeartsOpen] = useState(true);

  // ── 프로필 편집 통합 상태 (한 섹션만 열림) ──────────────────────────────────
  const [profileEditSection, setProfileEditSection] = useState<'avatar' | 'nickname' | 'birth' | 'interests' | 'statusMsg' | 'ideal' | 'features' | 'contact' | 'blocklist' | null>(null);
  const showBirthEdit = profileEditSection === 'birth';
  const showInterestEdit = profileEditSection === 'interests';
  const showAvatarPicker = profileEditSection === 'avatar';
  const showNicknameEdit = profileEditSection === 'nickname';
  const showStatusMsgEdit = profileEditSection === 'statusMsg';
  const showIdealEdit = profileEditSection === 'ideal';
  const showFeaturesEdit = profileEditSection === 'features';
  const showContactInEdit = profileEditSection === 'contact';
  const showBlockInEdit = profileEditSection === 'blocklist';
  const [showFortuneBirthEdit, setShowFortuneBirthEdit] = useState(false);
  const fortuneBirthAutoOpenedRef = useRef(false);
  const [sajuBirthMonth, setSajuBirthMonth] = useState<number | null>(null);
  const [sajuBirthDay, setSajuBirthDay] = useState<number | null>(null);
  const [sajuSaving, setSajuSaving] = useState(false);
  const sajuInitRef = useRef(false);

  // ── 내 상태 탭 연락처 편집 상태 ─────────────────────────────────────────────
  const [statusKakao, setStatusKakao] = useState('');
  const [statusInstagram, setStatusInstagram] = useState('');
  const [statusPhone, setStatusPhone] = useState('');
  const [statusContactPrivate, setStatusContactPrivate] = useState(false);
  const [statusContactSaving, setStatusContactSaving] = useState(false);
  const statusContactInitRef = useRef(false);

  // ── 닉네임 변경 상태 ────────────────────────────────────────────────────────
  const [nicknameEditInput, setNicknameEditInput] = useState('');
  const [nicknameEditError, setNicknameEditError] = useState<string | null>(null);
  const [nicknameEditChecking, setNicknameEditChecking] = useState(false);
  const [nicknameEditDupOk, setNicknameEditDupOk] = useState(false);
  const [nicknameEditSaving, setNicknameEditSaving] = useState(false);
  const nickEditTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 언마운트 시 닉네임 디바운스 타이머 취소
  useEffect(() => {
    return () => { if (nickEditTimerRef.current) clearTimeout(nickEditTimerRef.current); };
  }, []);

  // ── 관심사 편집 상태 ────────────────────────────────────────────────────────
  const [editInterests, setEditInterests] = useState<string[]>([]);
  const [interestFilter, setInterestFilter] = useState<string | null>(BIO_CATEGORIES[0].label);
  const [interestSaving, setInterestSaving] = useState(false);
  const interestInitRef = useRef(false);
  const [leaveGroupTarget, setLeaveGroupTarget] = useState<GroupChat | null>(null);
  const [leavingGroupId, setLeavingGroupId] = useState<string | null>(null);

  // 프로필 로드 시 편집 상태 초기화 (최초 1회)
  useEffect(() => {
    if (!currentUserId) {
      sajuInitRef.current = false;
      statusContactInitRef.current = false;
      return;
    }
    const me = profiles.find(p => p.id === currentUserId);
    if (!me) return;
    if (!sajuInitRef.current) {
      sajuInitRef.current = true;
      setSajuBirthMonth(me.birth_month ?? null);
      setSajuBirthDay(me.birth_day ?? null);
    }
    if (!statusContactInitRef.current) {
      statusContactInitRef.current = true;
      setStatusKakao((me as { kakao_id?: string | null }).kakao_id ?? '');
      setStatusInstagram((me as { instagram_id?: string | null }).instagram_id ?? '');
      setStatusPhone((me as { phone_number?: string | null }).phone_number ?? '');
      setStatusContactPrivate((me as { contact_private?: boolean | null }).contact_private ?? false);
    }
    if (!interestInitRef.current) {
      interestInitRef.current = true;
      setEditInterests(parseProfileInterests(me));
    }
    // 운세탭 생월생일 섹션: 미설정 상태면 자동으로 펼치기 (최초 1회)
    if (!fortuneBirthAutoOpenedRef.current) {
      fortuneBirthAutoOpenedRef.current = true;
      if (!me.birth_month || !me.birth_day) setShowFortuneBirthEdit(true);
    }
  }, [profiles, currentUserId]);

  const saveSajuBirthDate = async () => {
    if (!currentUserId) return;
    setSajuSaving(true);
    // 월별 최대 일수 cross-validation (버튼 UI에서도 2월 30일 같은 날짜 저장 방지)
    const maxDayForMonth = (m: number | null) => m ? new Date(2000, m, 0).getDate() : 31;
    const clampedDay = (sajuBirthDay && sajuBirthMonth && sajuBirthDay > maxDayForMonth(sajuBirthMonth))
      ? maxDayForMonth(sajuBirthMonth)
      : sajuBirthDay;
    try {
      await supabase.from('profiles').update({
        birth_month: sajuBirthMonth,
        birth_day: clampedDay,
      } as never).eq('id', currentUserId);
      onUpdateProfile({ id: currentUserId, birth_month: sajuBirthMonth, birth_day: clampedDay });
      sajuInitRef.current = false;
      setProfileEditSection(null);
      setShowFortuneBirthEdit(false);
      onRefreshProfiles();
    } catch (e) { console.error('[saju] 저장 실패:', e); }
    setSajuSaving(false);
  };

  const saveInterests = async () => {
    if (!currentUserId) return;
    setInterestSaving(true);
    try {
      const bioStr = editInterests.join(', ');
      await supabase.from('profiles').update({ bio: bioStr, interests: bioStr } as never).eq('id', currentUserId);
      onUpdateProfile({ id: currentUserId, bio: bioStr, interests: bioStr });
      interestInitRef.current = false;
      setProfileEditSection(null);
      onRefreshProfiles();
    } catch (e) { console.error('[interests] 저장 실패:', e); }
    setInterestSaving(false);
  };

  const validateNicknameEdit = useCallback(async (val: string, currentNick: string) => {
    const t = val.trim();
    if (!t) { setNicknameEditError(null); setNicknameEditDupOk(false); return; }
    if (t.length < 2) { setNicknameEditError('최소 2글자 이상 입력하세요'); setNicknameEditDupOk(false); return; }
    if (t.length > 6) { setNicknameEditError('최대 6글자까지 입력할 수 있어요'); setNicknameEditDupOk(false); return; }
    if (containsBannedNicknameWord(t)) { setNicknameEditError('사용할 수 없는 단어가 포함되어 있어요'); setNicknameEditDupOk(false); return; }
    if (t === currentNick) { setNicknameEditError('현재 닉네임과 동일해요'); setNicknameEditDupOk(false); return; }
    setNicknameEditChecking(true);
    setNicknameEditDupOk(false);
    try {
      const { data } = await supabase.from('profiles').select('id').eq('nickname', t).limit(1);
      if (data && data.length > 0) { setNicknameEditError('이미 사용 중인 닉네임이에요'); setNicknameEditDupOk(false); }
      else { setNicknameEditError(null); setNicknameEditDupOk(true); }
    } catch { setNicknameEditError(null); setNicknameEditDupOk(true); }
    setNicknameEditChecking(false);
  }, []);

  const handleNicknameEditChange = (val: string, currentNick: string) => {
    const sliced = [...val].slice(0, 6).join('');
    setNicknameEditInput(sliced);
    setNicknameEditDupOk(false);
    setNicknameEditError(null);
    if (nickEditTimerRef.current) clearTimeout(nickEditTimerRef.current);
    nickEditTimerRef.current = setTimeout(() => validateNicknameEdit(sliced, currentNick), 500);
  };

  const saveNickname = async (currentNick: string) => {
    if (!currentUserId || !nicknameEditDupOk || nicknameEditError) return;
    const trimmed = nicknameEditInput.trim();
    if (!trimmed || trimmed === currentNick) return;
    setNicknameEditSaving(true);
    try {
      await supabase.from('profiles').update({ nickname: trimmed, nickname_changed: true } as never).eq('id', currentUserId);
      onUpdateProfile({ id: currentUserId, nickname: trimmed, nickname_changed: true });
      setProfileEditSection(null);
      setNicknameEditInput('');
      setNicknameEditDupOk(false);
      onRefreshProfiles();
    } catch (e) { console.error('[nickname] 저장 실패:', e); setNicknameEditError('저장에 실패했어요. 다시 시도해주세요.'); }
    setNicknameEditSaving(false);
  };

  const saveStatusContact = async () => {
    if (!currentUserId) return;
    setStatusContactSaving(true);
    try {
      await supabase.from('profiles').update({
        kakao_id: statusKakao.trim() || null,
        instagram_id: statusInstagram.trim() || null,
        phone_number: statusPhone.trim() || null,
        contact_private: statusContactPrivate,
      } as never).eq('id', currentUserId);
      onUpdateProfile({ id: currentUserId, kakao_id: statusKakao.trim() || null, instagram_id: statusInstagram.trim() || null, phone_number: statusPhone.trim() || null, contact_private: statusContactPrivate });
      statusContactInitRef.current = false;
      setProfileEditSection(null);
      onRefreshProfiles();
    } catch (e) { console.error('[contact] 저장 실패:', e); }
    setStatusContactSaving(false);
  };

  // ── 프로필 사진 업로드 + 기본 아바타 피커 ────────────────────────────────────
  const [photoUploading, setPhotoUploading] = useState(false);
  const [avatarCatIdx, setAvatarCatIdx] = useState(0);

  const handleSelectPresetAvatar = async (avatarUrl: string) => {
    if (!currentUserId) return;
    await supabase.from('profiles').update({ photo_url: avatarUrl } as never).eq('id', currentUserId);
    onUpdateProfile({ id: currentUserId, photo_url: avatarUrl });
    onRefreshProfiles();
    setProfileEditSection(null);
  };
  // 이미지 압축: 최대 1200px, JPEG 품질 0.92 — 화질 유지 + 메모리/DB 과부하 방지
  const compressImage = (dataUrl: string, maxPx = 1200, quality = 0.92): Promise<string> =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(dataUrl); // 압축 실패 시 원본 사용
      img.src = dataUrl;
    });

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUserId) return;
    setPhotoUploading(true);
    try {
      const reader = new FileReader();
      reader.onerror = () => {
        console.error('[MainScreen] FileReader 오류');
        alert('파일을 읽는 중 오류가 발생했습니다. 다시 시도해 주세요.');
        setPhotoUploading(false);
      };
      reader.onload = async (ev) => {
        try {
          const dataUrl = ev.target?.result as string;
          if (!dataUrl) { setPhotoUploading(false); return; }
          const compressed = await compressImage(dataUrl);
          const path = `profile-photos/${currentUserId}`;
          const uploadResponse = await fetch('/api/db/storage-upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, dataUrl: compressed }),
          });
          if (!uploadResponse.ok) {
            throw new Error(`사진 업로드 실패 (${uploadResponse.status})`);
          }
          const photoUrl = `/api/db/storage-image?p=${encodeURIComponent(path)}&t=${Date.now()}`;
          await supabase.from('profiles').update({ photo_url: photoUrl } as never).eq('id', currentUserId);
          onUpdateProfile({ id: currentUserId, photo_url: photoUrl });
          onRefreshProfiles();
        } catch (e) {
          console.error('[MainScreen] 사진 업로드 실패:', e);
          alert('사진 업로드 중 오류가 발생했습니다. 다시 시도해 주세요.');
        } finally {
          setPhotoUploading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch { setPhotoUploading(false); }
    // 같은 파일 재선택 허용
    e.target.value = '';
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'bg-slate-950' : 'bg-gray-50'}`}>
      <header className={`sticky top-0 z-10 transition-colors duration-300 ${darkMode ? 'bg-slate-900 border-b-2 border-slate-700 shadow-slate-950/50' : 'bg-white shadow-sm'}`}>
        <div className="max-w-7xl mx-auto px-4 py-3 grid grid-cols-3 items-center">
          {/* 좌: 튜토리얼 + 다크모드 + 배경음악 */}
          <div className="justify-self-start flex items-center gap-1">
            <button
              onClick={() => onShowTutorial()}
              title="도움말"
              className={`p-2 rounded-xl transition-all ${darkMode ? 'bg-slate-700 text-cyan-300 hover:bg-slate-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
            >
              <HelpCircle className="w-4 h-4" />
            </button>
            <button onClick={onToggleDark}
              className={`p-2 rounded-xl transition-all ${darkMode ? 'bg-slate-700 text-amber-400 hover:bg-slate-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
              title={darkMode ? '라이트 모드' : '다크 모드'}>
              {darkMode ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd"/></svg>
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/></svg>
              )}
            </button>
          </div>
          {/* 중앙: 타이틀 */}
          <div className="justify-self-center">
            <ResetButton onReset={onReset} darkMode={darkMode} onOpenResetPassword={onOpenResetPassword} />
          </div>
          {/* 우: 하트 */}
          <div className="justify-self-end flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              {HEART_TYPES.map(h => {
                const used = heartCount(h.type);
                return (
                  <div key={h.type} className="flex items-center gap-0.5" title={`${h.label} (${2-used}개 남음)`}>
                    <span className="text-sm leading-none">{h.emoji}</span>
                    <span className={`text-[10px] font-bold ${used >= 2 ? 'text-gray-400 line-through' : darkMode ? 'text-gray-300' : 'text-gray-500'}`}>{2-used}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {timerEndAt && <TimerBanner endAt={timerEndAt} label={timerLabel ?? ''} />}
        {/* ── 탭 바 (1행 × 4열: 참여자 | 시그널 | 통계 | 랭킹) ── */}
        <div className={`max-w-7xl mx-auto border-t-2 ${darkMode ? 'bg-slate-900 border-slate-700' : 'bg-gray-50 border-gray-200'}`}>
          <div className="flex">
            {([
              { id: 'profiles' as MainTab, icon: '👥', label: '참여자', badge: seenProfilesCount < 0 ? 0 : Math.max(0, profiles.length - seenProfilesCount) },
              { id: 'signal' as MainTab, icon: '💕', label: '시그널' },
              { id: 'stats' as MainTab, icon: '📊', label: '통계' },
              { id: 'ranking' as MainTab, icon: '🏆', label: '랭킹' },
            ] as Array<{ id: MainTab; icon: string; label: string; badge?: number }>).map((t, ci, arr) => {
              const locked = functionsLocked && LOCKED_TABS.has(t.id);
              const active = mainTab === t.id;
              return (
                <button key={t.id} onClick={() => handleTabChange(t.id)} disabled={locked}
                  className={`relative flex-1 py-3 flex flex-col items-center gap-1 transition-all active:scale-95 border-b-2 ${ci < arr.length - 1 ? (darkMode ? 'border-r border-slate-700/30' : 'border-r border-gray-200/70') : ''} ${
                    locked ? `opacity-35 cursor-not-allowed border-b-transparent ${darkMode ? 'text-slate-500' : 'text-gray-400'}` :
                    active ? darkMode ? 'border-b-cyan-500 text-cyan-400 bg-cyan-500/10' : 'border-b-cyan-500 text-cyan-700 bg-cyan-50' :
                    darkMode ? 'border-b-transparent text-slate-400' : 'border-b-transparent text-gray-500'
                  }`}>
                  <span className="text-lg leading-none">{locked ? '🔒' : t.icon}</span>
                  <span className="relative inline-flex text-[10px] font-bold leading-tight">
                    {t.label}
                    {!locked && (t.badge ?? 0) > 0 && (
                      <span className="absolute -top-1 -right-3 min-w-[13px] h-[13px] px-0.5 bg-rose-500 text-white text-[8px] font-black rounded-full flex items-center justify-center">
                        {t.badge}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 scrollbar-styled-light">
        {chatSearchLockToast && (
          <div className="fixed top-24 left-0 right-0 z-[80] flex justify-center pointer-events-none">
            <div className="text-center text-[11px] font-bold text-white bg-gray-800/90 rounded-full px-3 py-1">
              {FUNCTIONS_LOCK_TOAST}
            </div>
          </div>
        )}
        {mainTab === 'profiles' && (
          <>
            {/* 검색 + 필터 바 */}
            <div className="space-y-2 mb-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    value={profileSearch}
                    onChange={e => setProfileSearch(e.target.value)}
                    placeholder="닉네임 · MBTI · 성향 · 초성 검색"
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:border-teal-400 focus:outline-none shadow-sm"
                  />
                </div>
                <RefreshBtn onRefresh={() => doRefresh('profiles', onRefreshProfiles)} refreshed={refreshedTab === 'profiles'} />
              </div>
              {/* 검색 힌트 */}
              <p className="text-[10px] text-gray-400 px-1 -mt-0.5">
                💡 닉네임·MBTI·성향(탑/바텀/올)·초성으로 검색할 수 있어요
              </p>
              {/* 성향 필터 */}
              <div className={`flex gap-1.5 overflow-x-auto pb-1 scrollbar-styled-light`}>
                {[null,'바텀계열','올계열','탑계열','비선호'].map(f => {
                  const colorMap: Record<string, string> = {
                    '바텀계열': 'bg-green-500 text-white border-green-500',
                    '올계열':   'bg-amber-500 text-white border-amber-500',
                    '탑계열':   'bg-blue-500 text-white border-blue-500',
                    '비선호':   'bg-gray-500 text-white border-gray-500',
                  };
                  const active = profilePersonalityFilter === f;
                  return (
                    <button key={String(f)} onClick={() => setProfilePersonalityFilter(active ? null : f)}
                      className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-bold border transition-all ${active ? (f ? colorMap[f] : 'bg-teal-500 text-white border-teal-500') : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                      {f ?? '전체'}
                    </button>
                  );
                })}
              </div>
              {/* MBTI 필터 — 8열 2행 고정 그리드 (스크롤 없음, 전체 버튼 없음) */}
              <div className="grid grid-cols-8 gap-1">
                {['INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP','ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP'].map(m => {
                  const active = profileMbtiFilter === m;
                  return (
                    <button key={m} onClick={() => setProfileMbtiFilter(active ? null : m)}
                      className={`px-1 py-1.5 rounded-md text-[10px] font-bold border transition-all text-center ${active ? 'bg-cyan-500 text-white border-cyan-500' : 'bg-white text-gray-500 border-gray-200 hover:border-cyan-300'}`}>
                      {m}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── 참여자 그리드 (이 영역만 스크롤) ───────── */}
            <div className="overflow-y-auto -mx-4 px-4 pb-0" style={{ maxHeight: 'calc(100dvh - 330px)', minHeight: 160 }}>
            <div className="grid grid-cols-3 gap-1 sm:gap-1.5 items-start">
            {filteredProfiles.filter(p => p.id !== currentUserId).map((profile) => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                isLiked={likedIds.has(profile.id)}
                sentHeartType={sentHeartTypes.get(profile.id)}
                heartCount={sentHeartsPerPerson.get(profile.id)?.size ?? 0}
                canLike={!!(currentUserId && profile.id !== currentUserId)}
                locked={functionsLocked}
                onLike={onLike}
                onSelect={onSelect}
                onView={onViewProfile}
                onOpenChat={onOpenChat}
                onBlock={onBlock}
                onContactShare={_onContactShareOpen}
                onViewFortune={onViewFortune}
                idealMsg={userSignals.find(s => s.user_id === profile.id)?.ideal_msg}
                statusMsg={userSignals.find(s => s.user_id === profile.id)?.status_msg}
              />
            ))}
            {filteredProfiles.filter(p => p.id !== currentUserId).length === 0 && (
              <div className="col-span-3 text-center py-20">
                <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">{profileSearch || profilePersonalityFilter || profileMbtiFilter ? '검색 결과가 없습니다.' : '아직 다른 참가자가 없습니다.'}</p>
              </div>
            )}
          </div>
          </div>{/* /scroll-wrapper */}
          </>
        )}

        {mainTab === 'status' && (
          <StatusErrorBoundary>
          <div className="max-w-lg mx-auto space-y-4">
            {/* ── 내 프로필 카드 ── */}
            {(() => {
              const me = profiles.find(p => p.id === currentUserId);
              if (!me) return null;
              const posLabel = getPositionLabel(me.personality_score ?? 50);
              const posColor = getPositionBg(me.personality_score ?? 50);
              const domLabel = getDomSubLabel(me.dom_sub_score ?? null);
              const domColor = getDomSubBg(me.dom_sub_score ?? null);
              const bioTags = parseProfileInterests(me);
              const hidePersonality = (me as { hide_personality?: boolean }).hide_personality ?? true;
              const handleToggleHidePersonality = async () => {
                const next = !hidePersonality;
                if (!currentUserId) return;
                try {
                  await supabase.from('profiles').update({ hide_personality: next } as never).eq('id', currentUserId);
                  onUpdateProfile({ id: currentUserId, hide_personality: next } as never);
                } catch (e) { console.error('[hide_personality]', e); }
              };
              return (
                <div className={`rounded-3xl p-5 border shadow-xl transition-colors duration-300 ${darkMode ? 'bg-gradient-to-br from-slate-800 to-slate-900 border-slate-600' : 'bg-white border-gray-100'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <p className={`text-xs font-black uppercase tracking-widest ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>내 프로필</p>
                    <RefreshBtn onRefresh={() => doRefresh('status', onRefreshStatus)} refreshed={refreshedTab === 'status'} />
                  </div>

                  {/* ── 닉네임 (사진 위) ── */}
                  <div className="mb-2">
                    <p className={`text-xl font-black leading-tight truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>{me.nickname}</p>
                  </div>

                  {/* ── 사진(왼쪽) + 박스(오른쪽) — 상단 정렬 ── */}
                  <div className="flex gap-3 items-start">
                    {/* 사진 — MBTI 레이블 높이(약 17px)만큼 내려서 박스 상단과 정렬 */}
                    <div className="flex-shrink-0 flex flex-col items-center gap-1 pt-[17px]">
                      <div className="relative w-32 h-32">
                        <label className={`block w-full h-full rounded-2xl overflow-hidden border-2 border-cyan-500/50 shadow-lg shadow-cyan-500/20 cursor-pointer group ${photoUploading ? 'cursor-wait' : ''}`}>
                          <img src={getAvatarSrc(me.photo_url, me.nickname)} alt={me.nickname} className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).src = genAvatar(me.nickname); }} />
                          <div className={`absolute inset-0 flex flex-col items-center justify-center photo-overlay transition-all ${photoUploading ? 'bg-black/60' : 'bg-black/0 group-hover:bg-black/50'}`}>
                            {photoUploading ? (
                              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <div className="opacity-0 group-hover:opacity-100 flex flex-col items-center gap-0.5 transition-opacity">
                                <Camera className="w-5 h-5 text-white drop-shadow" />
                                <span className="text-[9px] font-black text-white drop-shadow">변경</span>
                              </div>
                            )}
                          </div>
                          <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={photoUploading} />
                        </label>
                        {!photoUploading && (
                          <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-cyan-500 border-2 border-slate-900 flex items-center justify-center pointer-events-none shadow">
                            <Camera className="w-2.5 h-2.5 text-white" />
                          </span>
                        )}
                      </div>
                      {(() => {
                        const avLabel = AVATAR_CATEGORIES.flatMap(c => c.avatars).find(a => a.src === me.photo_url)?.label;
                        return avLabel ? <span className={`text-[9px] font-bold text-center leading-tight ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>{avLabel}</span> : null;
                      })()}
                    </div>

                    {/* 오른쪽: 2×2 박스 */}
                    <div className="flex-1 min-w-0 flex flex-col">
                      {/* 2×2 정보 박스 — 레이블 외부 상단, 폰트 통일 */}
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 ml-auto">
                        {/* MBTI */}
                        <div className="flex flex-col items-center gap-1">
                          <span className={`text-[10px] font-black tracking-wide ${darkMode ? 'text-white' : 'text-gray-800'}`}>MBTI</span>
                          <div className="w-16 h-14 rounded-2xl flex items-center justify-center" style={{
                            background: darkMode ? 'linear-gradient(135deg,rgba(13,148,136,.85),rgba(6,182,212,.60))' : 'linear-gradient(135deg,rgba(13,148,136,.70),rgba(6,182,212,.50))',
                            border: '1.5px solid rgba(20,184,166,.70)',
                            boxShadow: darkMode ? '0 0 14px rgba(20,184,166,.30)' : 'none'
                          }}>
                            <span className="text-xs font-black text-white drop-shadow">{me.mbti || '—'}</span>
                          </div>
                        </div>

                        {/* 성향 */}
                        <div className="flex flex-col items-center gap-1">
                          <span className={`text-[10px] font-black tracking-wide ${darkMode ? 'text-white' : 'text-gray-800'}`}>성향</span>
                          <div className="w-16 h-14 rounded-2xl flex items-center justify-center" style={{
                            background: `linear-gradient(135deg,${posColor}cc,${posColor}88)`,
                            border: `1.5px solid ${posColor}`,
                            boxShadow: darkMode ? `0 0 14px ${posColor}44` : 'none'
                          }}>
                            <span className="text-xs font-black text-white drop-shadow">{posLabel}</span>
                          </div>
                        </div>

                        {/* 돔/섭 */}
                        <div className="flex flex-col items-center gap-1">
                          <span className={`text-[10px] font-black tracking-wide ${darkMode ? 'text-white' : 'text-gray-800'}`}>돔/섭</span>
                          <div className="w-16 h-14 rounded-2xl flex items-center justify-center" style={{
                            background: `linear-gradient(135deg,${domColor}cc,${domColor}88)`,
                            border: `1.5px solid ${domColor}`,
                            boxShadow: darkMode ? `0 0 14px ${domColor}44` : 'none'
                          }}>
                            <span className="text-xs font-black text-white drop-shadow">{domLabel}</span>
                          </div>
                        </div>

                        {/* 관심사 */}
                        <div className="flex flex-col items-center gap-1">
                          <span className={`text-[10px] font-black tracking-wide ${darkMode ? 'text-white' : 'text-gray-800'}`}>관심사</span>
                          <div className="w-16 h-14 rounded-2xl flex flex-col items-center justify-center gap-px" style={{
                            background: darkMode ? 'linear-gradient(135deg,rgba(219,39,119,.80),rgba(236,72,153,.55))' : 'linear-gradient(135deg,rgba(219,39,119,.65),rgba(236,72,153,.45))',
                            border: '1.5px solid rgba(236,72,153,.80)',
                            boxShadow: darkMode ? '0 0 14px rgba(236,72,153,.30)' : 'none'
                          }}>
                            {bioTags.length > 0 ? bioTags.slice(0, 2).map(tag => (
                              <span key={tag} className="text-[10px] font-black text-white drop-shadow leading-tight">#{tag}</span>
                            )) : (
                              <span className="text-xs text-white/60">—</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* ── QR / 고유번호 ── */}
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <button
                      onClick={onShowContactQr}
                      className={`flex flex-col items-center justify-center gap-1 py-2.5 rounded-2xl font-bold transition-all active:scale-95 border ${darkMode ? 'bg-violet-500/15 border-violet-500/30 text-violet-400 hover:bg-violet-500/25' : 'bg-violet-50 border-violet-200 text-violet-600 hover:bg-violet-100'}`}
                    >
                      <QrCode className="w-5 h-5" />
                      <span className="text-[10px] leading-tight text-center">연락처<br/>QR</span>
                    </button>
                    <button
                      onClick={onScanQr}
                      className={`flex flex-col items-center justify-center gap-1 py-2.5 rounded-2xl font-bold transition-all active:scale-95 border ${darkMode ? 'bg-amber-500/15 border-amber-500/30 text-amber-400 hover:bg-amber-500/25' : 'bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100'}`}
                    >
                      <Camera className="w-5 h-5" />
                      <span className="text-[10px] leading-tight text-center">QR<br/>찍기</span>
                    </button>
                    {me.pin_code ? (
                      <div className={`flex flex-col items-center justify-center gap-0.5 py-2.5 rounded-2xl border-2 ${darkMode ? 'bg-amber-500/15 border-amber-500/40' : 'bg-amber-50 border-amber-300'}`}>
                        <span className={`text-[8px] font-black uppercase tracking-widest ${darkMode ? 'text-amber-400' : 'text-amber-500'}`}>🔑 고유번호</span>
                        <span className={`text-xl font-black tracking-[0.25em] ${darkMode ? 'text-amber-300' : 'text-amber-700'}`}>{me.pin_code}</span>
                      </div>
                    ) : (
                      <div className={`flex flex-col items-center justify-center gap-0.5 py-2.5 rounded-2xl border ${darkMode ? 'bg-slate-700/60 border-slate-600 text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                        <span className="text-[9px] font-semibold text-center leading-tight">고유번호<br/>없음</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}


            {/* ── 스캔한 연락처 ── */}
            {scannedContacts.length > 0 && (
              <div className={`rounded-2xl border transition-colors duration-300 ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-100'}`}>
                <div className="p-4 pb-2">
                  <p className={`text-[10px] font-black uppercase tracking-widest mb-3 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>📋 스캔한 연락처 ({scannedContacts.length})</p>
                  <div className="space-y-2">
                    {scannedContacts.map(c => (
                      <div key={c.id} className={`rounded-xl p-3 border flex items-start gap-3 ${darkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-gray-50 border-gray-100'}`}>
                        {/* 아바타 */}
                        <div className="flex-shrink-0">
                          {c.photo_url ? (
                            <img src={c.photo_url} alt={c.nickname} loading="lazy" className="w-10 h-10 rounded-xl object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-teal-500 flex items-center justify-center text-white font-black text-sm">{c.nickname?.[0] ?? '?'}</div>
                          )}
                        </div>
                        {/* 정보 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>{c.nickname}</span>
                            {c.mbti && <span className="px-1.5 py-0.5 bg-teal-500/20 text-teal-400 text-[10px] font-bold rounded-md border border-teal-500/30">{c.mbti}</span>}
                          </div>
                          {c.contact_private ? (
                            <p className={`text-[11px] ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>🔒 연락처 비공개</p>
                          ) : (
                            <div className="space-y-0.5">
                              {c.kakao_id && <p className={`text-[11px] font-medium ${darkMode ? 'text-yellow-400' : 'text-yellow-600'}`}>🟡 카카오: {c.kakao_id}</p>}
                              {c.instagram_id && <p className={`text-[11px] font-medium ${darkMode ? 'text-pink-400' : 'text-pink-600'}`}>📸 인스타: @{c.instagram_id}</p>}
                              {c.phone_number && <p className={`text-[11px] font-medium ${darkMode ? 'text-green-400' : 'text-green-600'}`}>📞 전화: {c.phone_number}</p>}
                              {!c.kakao_id && !c.instagram_id && !c.phone_number && (
                                <p className={`text-[11px] ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>연락처 미등록</p>
                              )}
                            </div>
                          )}
                        </div>
                        {/* 삭제 */}
                        <button
                          onClick={() => onClearScannedContact(c.id)}
                          className={`flex-shrink-0 p-1.5 rounded-lg transition-all active:scale-90 ${darkMode ? 'text-slate-500 hover:text-slate-300 hover:bg-slate-600' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-200'}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="px-4 pb-3">
                  <button onClick={() => scannedContacts.forEach(c => onClearScannedContact(c.id))}
                    className={`text-[11px] font-semibold transition-all ${darkMode ? 'text-slate-500 hover:text-slate-400' : 'text-gray-300 hover:text-gray-400'}`}>
                    전체 삭제
                  </button>
                </div>
              </div>
            )}


            {/* ── 방문자 기록 (접기/펼치기) ── */}
            {(() => {
              const visitors = [...profileVisitors]
                .sort((a, b) => b.viewed_at.localeCompare(a.viewed_at))
                .filter((v, i, arr) => arr.findIndex(x => x.viewer_id === v.viewer_id) === i);
              return (
                <div className={`rounded-3xl border shadow-xl transition-colors duration-300 overflow-hidden ${darkMode ? 'bg-gradient-to-br from-slate-800 to-slate-900 border-slate-600' : 'bg-white border-gray-100'}`}>
                  <button onClick={() => setShowVisitors(v => !v)} className="w-full flex items-center justify-between px-5 py-4">
                    <span className={`text-xs font-black uppercase tracking-widest ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>
                      👁 내 프로필 방문자 {visitors.length > 0 ? `(${visitors.length})` : ''}
                    </span>
                    <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showVisitors ? 'rotate-180' : ''} ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
                  </button>
                  {showVisitors && (
                    <div className="px-5 pb-5">
                      {visitors.length === 0 ? (
                        <p className={`text-xs text-center py-4 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>아직 방문자가 없어요</p>
                      ) : (
                        <div className="space-y-2">
                          {visitors.slice(0, 20).map(v => {
                            const vp = profiles.find(p => p.id === v.viewer_id);
                            if (!vp) return null;
                            const ago = (() => {
                              const ms = Date.now() - new Date(v.viewed_at).getTime();
                              if (ms < 60_000) return '방금 전';
                              if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}분 전`;
                              if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}시간 전`;
                              return `${Math.floor(ms / 86_400_000)}일 전`;
                            })();
                            return (
                              <button key={v.id} type="button" onClick={() => onSelect(vp)} className={`w-full flex items-center gap-3 p-2 rounded-xl text-left cursor-pointer active:scale-[0.98] transition-transform ${darkMode ? 'bg-slate-700/40 hover:bg-slate-700/70' : 'bg-gray-50 hover:bg-gray-100'}`}>
                                <img src={getAvatarSrc(vp.photo_url, vp.nickname)} alt={vp.nickname}
                                  className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                                  onError={(e) => { (e.target as HTMLImageElement).src = genAvatar(vp.nickname); }} />
                                <div className="flex-1 min-w-0">
                                  <p className={`text-xs font-black truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>{vp.nickname}</p>
                                  {vp.mbti && <p className={`text-[10px] ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>{vp.mbti}</p>}
                                </div>
                                <span className={`text-[10px] flex-shrink-0 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>{ago}</span>
                              </button>
                            );
                          })}
                          {visitors.length > 20 && <p className={`text-[10px] text-center mt-2 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>+{visitors.length - 20}명 더</p>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="contents">
            {/* 받은 하트 */}
            <div className={`rounded-2xl shadow-sm transition-colors duration-300 overflow-hidden ${darkMode ? 'bg-slate-800 border border-slate-600' : 'bg-white'}`}>
              <button
                onClick={() => setReceivedHeartsOpen(o => !o)}
                className={`w-full flex items-center justify-between px-5 py-4 ${darkMode ? 'hover:bg-slate-700/40' : 'hover:bg-gray-50'}`}
              >
                <h3 className={`text-sm font-bold uppercase tracking-wider ${darkMode ? 'text-slate-200' : 'text-gray-500'}`}>💕 받은 하트</h3>
                <div className="flex items-center gap-2">
                  {pendingHeartsCount > 0 && (
                    <span className="px-2 py-0.5 bg-rose-100 text-rose-600 text-xs font-bold rounded-full">
                      {pendingHeartsCount}개 미응답
                    </span>
                  )}
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${receivedHeartsOpen ? 'rotate-180' : ''} ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
                </div>
              </button>
              {receivedHeartsOpen && (
              <div className="px-5 pb-5">
              {receivedLikers.length === 0 ? (
                <div className="text-center py-8">
                  <Heart className={`w-10 h-10 mx-auto mb-2 ${darkMode ? 'text-slate-500' : 'text-gray-200'}`} />
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>아직 받은 하트가 없습니다.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {receivedLikers.map((liker) => {
                    const shared = contactSharedWithIds.has(liker.id);
                    const ht = receivedHeartTypes.get(liker.id) ?? 'red';
                    const hm = heartMeta(ht);
                    const isGreen = ht === 'green';
                    const isAcked = acknowledgedComplimentIds.has(liker.id);
                    return (
                      <div key={liker.id} className={`p-3 rounded-xl ${darkMode ? 'bg-slate-700/70' : 'bg-gray-50'}`}>
                        <div className="flex items-center gap-3">
                          <ProfileAvatar profile={liker} size="sm" rounded="xl" />
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{liker.nickname}</p>
                            <p className={`text-xs ${hm.text}`}>{hm.emoji} {hm.label} 하트를 보냈습니다</p>
                          </div>
                          {shared && (
                            <button
                              onClick={() => {
                                const share = receivedContactShares.find(s => s.liker_id === liker.id);
                                if (share) onContactViewOpen(share, liker);
                              }}
                              className="flex items-center gap-1 px-2.5 py-1 bg-teal-50 text-teal-600 text-xs font-bold rounded-full border border-teal-200 hover:bg-teal-100 transition-all">
                              <CheckCircle className="w-3 h-3" />연락처 공유 완료</button>
                          )}
                          {isGreen && isAcked && (
                            <span className="flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-600 text-xs font-bold rounded-full border border-emerald-200">
                              <CheckCircle className="w-3 h-3" />확인 완료
                            </span>
                          )}
                        </div>
                        <ProfileInfoBadges profile={liker} />
                        {isGreen ? (
                          !isAcked && (
                            <button
                              onClick={() => { if (guardLockedAction()) return; onHeartResponse(liker.id, 'accepted'); }}
                              className={`w-full py-2 mt-2.5 text-xs font-bold text-white rounded-xl transition-all ${hm.solidBg} ${hm.solidHover}`}
                            >{'확인'}</button>
                          )
                        ) : (
                          !shared && (
                            <div className="flex gap-2 mt-2.5">
                              <button
                                onClick={() => { if (guardLockedAction()) return; onHeartResponse(liker.id, 'rejected'); }}
                                className="flex-1 py-2 text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                              >거절</button>
                              <button
                                onClick={() => { if (guardLockedAction()) return; onHeartResponse(liker.id, 'accepted'); }}
                                className={`flex-2 flex-grow py-2 text-xs font-bold text-white rounded-xl transition-all ${hm.solidBg} ${hm.solidHover}`}
                              >{'수락 + 연락처 공유'}</button>
                            </div>
                          )
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              </div>
              )}
            </div>

            {/* 교환된 연락처 */}
            {receivedContactShares.length > 0 && (
              <div className={`rounded-2xl shadow-sm p-5 transition-colors duration-300 ${darkMode ? 'bg-slate-800 border border-slate-600' : 'bg-white'}`}>
                <div className="flex items-center gap-2 mb-4">
                  <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${darkMode ? 'bg-teal-900/60' : 'bg-teal-50'}`}>
                    <span className="text-sm">📱</span>
                  </div>
                  <h3 className={`text-sm font-bold uppercase tracking-wider ${darkMode ? 'text-slate-200' : 'text-gray-700'}`}>교환된 연락처</h3>
                  <span className="ml-auto px-2 py-0.5 bg-teal-100 text-teal-700 text-xs font-bold rounded-full">{receivedContactShares.length}개</span>
                </div>
                <div className="space-y-2">
                  {receivedContactShares.map((share) => {
                    const sharedProfile = profileMap.get(share.liked_id);
                    return (
                      <div key={share.id} className={`rounded-xl p-3 ${darkMode ? 'bg-teal-900/30 border border-teal-800' : 'bg-teal-50 border border-teal-100'}`}>
                        <div className="flex items-center gap-2 mb-2">
                          {sharedProfile && <ProfileAvatar profile={sharedProfile} size="xs" rounded="lg" />}
                          <p className={`text-xs font-bold ${darkMode ? 'text-teal-300' : 'text-teal-800'}`}>
                            {sharedProfile?.nickname ?? '알 수 없음'}
                          </p>
                          <button
                            onClick={() => sharedProfile && onContactViewOpen(share, sharedProfile)}
                            className={`ml-auto flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold border transition-all ${darkMode ? 'bg-teal-800 border-teal-700 text-teal-200 hover:bg-teal-700' : 'bg-white border-teal-200 text-teal-600 hover:bg-teal-100'}`}
                          >
                            <Eye className="w-3 h-3" />보기
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {share.kakao && (
                            <span className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold ${darkMode ? 'bg-yellow-900/40 text-yellow-300' : 'bg-yellow-50 text-yellow-700'}`}>
                              <span className="text-[10px]">K</span>{share.kakao}
                            </span>
                          )}
                          {share.instagram && (
                            <span className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold ${darkMode ? 'bg-pink-900/40 text-pink-300' : 'bg-pink-50 text-pink-700'}`}>
                              IG {share.instagram}
                            </span>
                          )}
                          {share.phone && (
                            <span className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold ${darkMode ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-50 text-blue-700'}`}>
                              📞 {share.phone}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              )}

            {/* 보낸 하트 */}
            <div className={`rounded-2xl shadow-sm transition-colors duration-300 overflow-hidden ${darkMode ? 'bg-slate-800 border border-slate-600' : 'bg-white'}`}>
              <button
                onClick={() => setSentHeartsOpen(o => !o)}
                className={`w-full flex items-center justify-between px-5 py-4 ${darkMode ? 'hover:bg-slate-700/40' : 'hover:bg-gray-50'}`}
              >
                <h3 className={`text-sm font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>💌 보낸 하트</h3>
                <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${sentHeartsOpen ? 'rotate-180' : ''} ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
              </button>
              {sentHeartsOpen && (
              <div className="px-5 pb-5">
              {sentLikedProfiles.length === 0 ? (
                <div className="text-center py-8">
                  <Heart className={`w-10 h-10 mx-auto mb-2 ${darkMode ? 'text-slate-500' : 'text-gray-200'}`} />
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>아직 보낸 하트가 없습니다.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sentLikedProfiles.map((liked) => {
                    const share = receivedContactShares.find((s) => s.liked_id === liked.id);
                    const ht = sentHeartTypes.get(liked.id) ?? 'red';
                    const hm = heartMeta(ht);
                    return (
                      <div key={liked.id}
                        className={`flex flex-col p-3 rounded-xl transition-all ${darkMode ? 'bg-slate-700/70' : 'bg-gray-50'}`}>
                        <div className="flex items-center gap-3">
                          <ProfileAvatar profile={liked} size="sm" rounded="xl" />
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{liked.nickname}</p>
                            <p className={`text-xs ${hm.text}`}>{hm.emoji} {hm.label}</p>
                          </div>
                          {share ? (
                            <span className="flex items-center gap-1 px-2.5 py-1 bg-teal-50 text-teal-600 text-xs font-bold rounded-full border border-teal-200 cursor-pointer" onClick={() => onContactViewOpen(share, liked)}>
                              <Eye className="w-3 h-3" />
                              연락처 확인
                            </span>
                          ) : ht === 'green' ? (
                            <span className="px-2.5 py-1 bg-emerald-50 text-emerald-500 text-xs rounded-full">
                              전달 완료
                            </span>
                          ) : likeStatuses.get(liked.id) === 'rejected' ? (
                            <span className="px-2.5 py-1 bg-red-50 text-red-400 text-xs rounded-full">
                              💔 거부됨
                            </span>
                          ) : likeStatuses.get(liked.id) === 'accepted' ? (
                            <span className="px-2.5 py-1 bg-teal-50 text-teal-500 text-xs rounded-full">
                              ✓ 수락됨
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 bg-gray-100 text-gray-400 text-xs rounded-full">
                              대기 중
                            </span>
                          )}
                        </div>
                        <ProfileInfoBadges profile={liked} />
                        {share && (share.kakao || share.instagram || share.phone) && (
                          <div className="mt-2.5 bg-teal-50 border border-teal-200 rounded-xl p-3 space-y-1.5">
                            <p className={`text-[10px] font-black uppercase tracking-widest ${darkMode ? 'text-teal-300' : 'text-teal-600'} mb-1`}>{liked.nickname}님이 공유한 연락처</p>
                            {share.kakao && (
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-lg bg-yellow-400 text-white flex items-center justify-center text-[10px] font-black flex-shrink-0">K</span>
                                <span className="text-xs font-bold text-gray-800 flex-1">{share.kakao}</span>
                                <button onClick={() => navigator.clipboard?.writeText(share.kakao!).catch(() => {})} className="text-[10px] text-gray-400 hover:text-teal-600 transition-all">복사</button>
                              </div>
                            )}
                            {share.instagram && (
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-lg bg-pink-500 text-white flex items-center justify-center text-[10px] font-black flex-shrink-0">@</span>
                                <span className="text-xs font-bold text-gray-800 flex-1">@{share.instagram}</span>
                                <button onClick={() => navigator.clipboard?.writeText(share.instagram!).catch(() => {})} className="text-[10px] text-gray-400 hover:text-teal-600 transition-all">복사</button>
                              </div>
                            )}
                            {share.phone && (
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-lg bg-green-500 text-white flex items-center justify-center text-[10px] font-black flex-shrink-0">#</span>
                                <span className="text-xs font-bold text-gray-800 flex-1">{share.phone}</span>
                                <button onClick={() => navigator.clipboard?.writeText(share.phone!).catch(() => {})} className="text-[10px] text-gray-400 hover:text-teal-600 transition-all">복사</button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              </div>
              )}
            </div>

            </div>
          </div>
          </StatusErrorBoundary>
        )}

        {/* ─── 내 설정 탭 ─── */}
        {mainTab === 'settings' && (
          <StatusErrorBoundary>
          <div className="max-w-lg mx-auto space-y-4 pb-24">

            {/* ── 고유번호 ── */}
            {(() => {
              const pinCode = profiles.find(p => p.id === currentUserId)?.pin_code;
              return (
                <div className={`rounded-3xl border shadow-xl overflow-hidden ${darkMode ? 'bg-gradient-to-br from-slate-800 to-slate-900 border-slate-600' : 'bg-white border-gray-100'}`}>
                  <div className="px-5 py-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 text-lg ${darkMode ? 'bg-amber-500/20' : 'bg-amber-50'}`}>🔑</div>
                      <div className="min-w-0">
                        <p className={`text-[10px] font-black uppercase tracking-widest mb-0.5 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>내 고유번호</p>
                        {pinCode ? (
                          <p className={`text-2xl font-black tracking-[0.3em] leading-none ${darkMode ? 'text-amber-300' : 'text-amber-600'}`}>{pinCode}</p>
                        ) : (
                          <p className={`text-sm font-bold ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>번호 없음</p>
                        )}
                      </div>
                    </div>
                    {pinCode && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(pinCode).catch(() => {});
                        }}
                        className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black border transition-all active:scale-95 ${darkMode ? 'bg-amber-500/15 border-amber-500/30 text-amber-400 hover:bg-amber-500/25' : 'bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100'}`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                        </svg>
                        복사
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ── 프로필 편집 (통합) ── */}
            {(() => {
              const me = profiles.find(p => p.id === currentUserId);
              if (!me) return null;
              const currentTags = me.bio ? me.bio.split(',').map(t => t.trim()).filter(Boolean) : [];
              const hasBd = !!(me.birth_month && me.birth_day);
              const toggleTag = (tag: string) => {
                // 함수형 업데이트 대신 직접 계산 — setTimeout 클로저 stale 문제 방지
                const next = editInterests.includes(tag)
                  ? editInterests.filter(t => t !== tag)
                  : editInterests.length < 5 ? [...editInterests, tag] : editInterests;
                setEditInterests(next);
                // 2번째 관심사를 막 선택한 순간 → 즉시 저장 + 닫기
                if (next.length >= 2 && editInterests.length < 2 && currentUserId) {
                  const bioStr = next.join(', ');
                  setInterestSaving(true);
                  supabase.from('profiles').update({ bio: bioStr, interests: bioStr } as never).eq('id', currentUserId)
                    .then(() => {
                      onUpdateProfile({ id: currentUserId!, bio: bioStr, interests: bioStr });
                      interestInitRef.current = false;
                      setInterestSaving(false);
                      onRefreshProfiles();
                    })
                    .catch((e: unknown) => { console.error('[interests auto]', e); setInterestSaving(false); });
                  setProfileEditSection(null);
                }
              };
              const toggleSection = (s: 'avatar' | 'nickname' | 'birth' | 'interests' | 'statusMsg' | 'ideal' | 'features' | 'contact' | 'blocklist') => {
                if (s === 'nickname') {
                  // 이미 1회 변경한 경우 열기 차단
                  if ((me as { nickname_changed?: boolean }).nickname_changed) return;
                  if (profileEditSection !== 'nickname') {
                    setNicknameEditInput('');
                    setNicknameEditError(null);
                    setNicknameEditDupOk(false);
                  }
                }
                if (s === 'interests' && profileEditSection !== 'interests') {
                  interestInitRef.current = false;
                  setEditInterests(currentTags);
                }
                setProfileEditSection(p => p === s ? null : s);
              };
              return (
                <div className={`rounded-2xl border overflow-hidden transition-colors duration-300 ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-100'}`}>
                  <button
                    onClick={() => setProfileEditOpen(o => !o)}
                    className={`w-full flex items-center justify-between px-4 py-3 border-b transition-colors ${darkMode ? 'border-slate-700 hover:bg-slate-700/40' : 'border-gray-100 hover:bg-gray-50'}`}
                  >
                    <p className={`text-xs font-black uppercase tracking-widest ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>✏️ 프로필 편집</p>
                    <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${profileEditOpen ? 'rotate-180' : ''} ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
                  </button>
                  {profileEditOpen && (
                  <>

                  {/* ── 사진·아바타 ── */}
                  <div className={`border-b ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
                    <button onClick={() => toggleSection('avatar')} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                      {me.photo_url ? (
                        <img src={me.photo_url} alt="" className="w-9 h-9 rounded-xl object-cover flex-shrink-0 border border-white/10" />
                      ) : (
                        <div className="w-9 h-9 rounded-xl bg-teal-500 flex items-center justify-center text-white font-black text-sm flex-shrink-0">{me.nickname?.[0] ?? '?'}</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>사진 · 아바타</p>
                        <p className={`text-[11px] ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>탭하여 사진 또는 아바타 변경</p>
                      </div>
                      <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${showAvatarPicker ? 'rotate-180' : ''} ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
                    </button>
                    {showAvatarPicker && (
                      <div className={`px-4 pb-4 ${darkMode ? 'bg-slate-700/20' : 'bg-gray-50/50'}`}>
                        <label className={`flex items-center gap-3 p-3 mb-3 rounded-xl border-2 border-dashed cursor-pointer transition-all ${darkMode ? 'border-slate-600 hover:border-cyan-500 bg-slate-800/60' : 'border-gray-200 hover:border-cyan-400 bg-white'}`}>
                          <Camera className={`w-5 h-5 flex-shrink-0 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
                          <div className="flex-1">
                            <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-700'}`}>내 사진 업로드</p>
                            <p className={`text-[11px] ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>JPG/PNG · 자동 압축</p>
                          </div>
                          {photoUploading && <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />}
                          <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={photoUploading} />
                        </label>
                        <p className={`text-[11px] font-black mb-1 ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>🎨 기본 아바타 선택</p>
                        <p className={`text-[9px] mb-2 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>⚠️ 저작권으로 인하여 아래와 같은 아바타 밖에 만들지 못합니다.</p>
                        <div className={`flex flex-wrap gap-1 mb-2 pb-2 border-b ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
                          {AVATAR_CATEGORIES.map((cat, idx) => (
                            <button key={cat.label} type="button" onClick={() => setAvatarCatIdx(idx)}
                              className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap ${
                                avatarCatIdx === idx ? 'bg-cyan-500 text-white shadow-sm' :
                                darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-white text-gray-600 border border-gray-200 hover:border-cyan-300'
                              }`}>{cat.label}</button>
                          ))}
                        </div>
                        <div className="grid grid-cols-5 gap-2">
                          {AVATAR_CATEGORIES[avatarCatIdx]?.avatars.map((av) => {
                            const isSel = me.photo_url === av.src;
                            return (
                              <button key={av.id} type="button" onClick={() => handleSelectPresetAvatar(av.src)}
                                className={`relative flex flex-col items-center gap-1 py-2 px-1 rounded-xl border-2 shadow-sm transition-all active:scale-95 ${
                                  isSel ? 'border-cyan-500 bg-cyan-50' :
                                  darkMode ? 'border-slate-600 bg-slate-700/70 hover:border-cyan-400' : 'border-gray-200 bg-white hover:border-cyan-300 hover:shadow-md'
                                }`}>
                                <img src={av.src} alt={av.label} className="w-12 h-12 rounded-full object-cover block"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                <span className={`text-[10px] font-bold leading-tight text-center w-full truncate ${isSel ? 'text-cyan-600' : darkMode ? 'text-slate-300' : 'text-gray-600'}`}>{av.label}</span>
                                {isSel && <span className="absolute top-1 right-1 w-4 h-4 bg-cyan-500 rounded-full flex items-center justify-center shadow"><CheckCircle className="w-2.5 h-2.5 text-white" /></span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── 닉네임 ── */}
                  {(() => {
                    const nicknameAlreadyChanged = !!(me as { nickname_changed?: boolean }).nickname_changed;
                    return (
                      <div className={`border-b ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
                        <button
                          onClick={() => toggleSection('nickname')}
                          disabled={nicknameAlreadyChanged}
                          className={`w-full flex items-center gap-3 px-4 py-3 text-left ${nicknameAlreadyChanged ? 'cursor-not-allowed' : ''}`}
                        >
                          <span className="text-xl flex-shrink-0">{nicknameAlreadyChanged ? '🔒' : '🏷️'}</span>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>닉네임</p>
                            <p className={`text-[11px] font-semibold break-all ${darkMode ? 'text-cyan-400' : 'text-cyan-600'}`}>{me.nickname}</p>
                            {nicknameAlreadyChanged && (
                              <p className={`text-[10px] mt-0.5 font-medium ${darkMode ? 'text-amber-400/80' : 'text-amber-600'}`}>닉네임 변경은 1회만 가능해요</p>
                            )}
                          </div>
                          {nicknameAlreadyChanged
                            ? <span className={`text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0 ${darkMode ? 'bg-slate-700 text-slate-400' : 'bg-gray-100 text-gray-400'}`}>변경 완료</span>
                            : <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${showNicknameEdit ? 'rotate-180' : ''} ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
                          }
                        </button>
                        {showNicknameEdit && !nicknameAlreadyChanged && (
                          <div className={`px-4 pb-4 space-y-2 ${darkMode ? 'bg-slate-700/20' : 'bg-gray-50/50'}`}>
                            {/* 1회 변경 경고 배너 */}
                            <div className={`flex items-start gap-2 px-3 py-2 rounded-xl ${darkMode ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-amber-50 border border-amber-200'}`}>
                              <span className="text-sm flex-shrink-0">⚠️</span>
                              <p className={`text-[11px] font-bold leading-snug ${darkMode ? 'text-amber-300' : 'text-amber-700'}`}>
                                닉네임은 <span className="underline">단 1회만</span> 변경할 수 있어요.<br />
                                변경 후에는 되돌릴 수 없으니 신중하게 입력해 주세요.
                              </p>
                            </div>
                            <div className="relative">
                              <input type="text" value={nicknameEditInput}
                                onChange={(e) => handleNicknameEditChange(e.target.value, me.nickname)}
                                maxLength={6} autoFocus placeholder="새 닉네임 (2~6글자)"
                                className={`w-full px-3 py-2 rounded-lg border-2 text-sm font-bold transition-all outline-none ${
                                  darkMode ? 'bg-slate-800 text-white placeholder-slate-500' : 'bg-white text-gray-900'
                                } ${nicknameEditError ? 'border-rose-400' : nicknameEditDupOk ? 'border-emerald-400' : darkMode ? 'border-slate-500 focus:border-cyan-500' : 'border-gray-300 focus:border-cyan-400'}`}
                              />
                              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold">
                                {nicknameEditChecking && <span className={darkMode ? 'text-slate-400' : 'text-gray-400'}>확인 중…</span>}
                                {!nicknameEditChecking && nicknameEditDupOk && !nicknameEditError && <span className="text-emerald-500">사용 가능 ✓</span>}
                              </div>
                            </div>
                            {nicknameEditError && <p className="text-[11px] text-rose-500 font-medium">⚠ {nicknameEditError}</p>}
                            <p className={`text-[10px] ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>최소 2글자 · 최대 6글자 · 욕설·지역감정·패드립 불가</p>
                            <p className={`text-[10px] mt-0.5 ${darkMode ? 'text-teal-400/70' : 'text-teal-600/70'}`}>💡 예시: 음식이름, 패션스타일, 직업 등 나를 나타낼 수 있는 거 아무거나 설정해 주세요!</p>
                            <div className="flex gap-2">
                              <button type="button" onClick={() => setProfileEditSection(null)}
                                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${darkMode ? 'bg-slate-600 text-slate-300 hover:bg-slate-500' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}>취소</button>
                              <button type="button" onClick={() => saveNickname(me.nickname)}
                                disabled={!nicknameEditDupOk || !!nicknameEditError || nicknameEditSaving}
                                className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-cyan-500 to-teal-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                                {nicknameEditSaving ? '저장 중…' : '저장'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* ── 관심사 ── */}
                  <div className={`border-t ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
                    <button onClick={() => toggleSection('interests')} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                      <span className="text-xl flex-shrink-0">🎯</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>관심사</p>
                        {currentTags.length > 0
                          ? <p className={`text-[11px] leading-snug ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>{currentTags.join(' · ')}</p>
                          : <p className={`text-[11px] ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>미설정</p>}
                      </div>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0 ${currentTags.length >= 2 ? 'bg-teal-500 text-white' : darkMode ? 'bg-slate-700 text-slate-500' : 'bg-gray-100 text-gray-400'}`}>{currentTags.length}/5</span>
                      <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${showInterestEdit ? 'rotate-180' : ''} ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
                    </button>
                    {showInterestEdit && (
                      <div className={`px-4 pb-4 space-y-3 ${darkMode ? 'bg-slate-700/20' : 'bg-gray-50/50'}`}>
                        <InterestPicker
                          selected={editInterests}
                          onToggle={toggleTag}
                          filter={interestFilter ?? BIO_CATEGORIES[0].label}
                          onFilter={(label) => setInterestFilter(label)}
                          darkMode={darkMode}
                        />
                        <button onClick={saveInterests} disabled={interestSaving || editInterests.length < 2}
                          className="w-full py-2.5 bg-teal-500 hover:bg-teal-600 text-white font-bold rounded-xl text-sm active:scale-[0.98] transition-all disabled:opacity-40">
                          {interestSaving ? '저장 중...' : `관심사 저장 (${editInterests.length}개 선택됨)`}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ── 연락처 설정 ── */}
                  <div className={`border-t ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
                    <button onClick={() => toggleSection('contact')} className="w-full flex items-center gap-2 px-4 py-3 text-left">
                      <span className="text-xl flex-shrink-0">📋</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>연락처 설정</p>
                        {(statusKakao || statusInstagram || statusPhone) ? (
                          <p className={`text-[11px] leading-snug ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                            {[statusKakao && `K: ${statusKakao}`, statusInstagram && `@${statusInstagram}`, statusPhone && `📞 ${statusPhone}`].filter(Boolean).join(' · ')}
                          </p>
                        ) : (
                          <p className={`text-[11px] ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>미설정</p>
                        )}
                      </div>
                      {statusContactPrivate && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full flex-shrink-0">비공개</span>
                      )}
                      <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${showContactInEdit ? 'rotate-180' : ''} ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
                    </button>
                    {showContactInEdit && (
                      <div className={`px-4 pb-4 ${darkMode ? 'bg-slate-700/20' : 'bg-gray-50/50'}`}>
                        <div className={`rounded-xl p-3 mb-3 flex items-start gap-2 ${darkMode ? 'bg-amber-900/30 border border-amber-600/40' : 'bg-amber-50 border border-amber-300'}`}>
                          <span className="text-amber-500 text-sm mt-0.5 flex-shrink-0">⚠️</span>
                          <p className={`text-[11px] leading-relaxed ${darkMode ? 'text-amber-400' : 'text-amber-700'}`}>연락처는 상대방이 <span className="font-bold">연락처 공유를 수락했을 때만</span> 전달됩니다.</p>
                        </div>
                        <label className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer mb-3 select-none border ${statusContactPrivate ? (darkMode ? 'bg-red-900/30 border-red-700' : 'bg-red-50 border-red-200') : (darkMode ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-200')}`}>
                          <div onClick={() => setStatusContactPrivate(v => !v)}
                            className={`toggle-track relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${statusContactPrivate ? 'bg-red-500' : 'bg-gray-300'}`}>
                            <span className={`toggle-thumb absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${statusContactPrivate ? 'translate-x-5' : 'translate-x-0.5'}`} />
                          </div>
                          <div>
                            <p className={`text-xs font-bold ${statusContactPrivate ? (darkMode ? 'text-red-400' : 'text-red-600') : (darkMode ? 'text-slate-300' : 'text-gray-700')}`}>연락처 비공개</p>
                            {statusContactPrivate && <p className={`text-[10px] ${darkMode ? 'text-red-500' : 'text-red-500'}`}>매칭 상대에게 연락처가 전달되지 않습니다</p>}
                          </div>
                        </label>
                        <div className={`space-y-2 transition-opacity ${statusContactPrivate ? 'opacity-40 pointer-events-none' : ''}`}>
                          <div className="relative">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center text-[11px] font-black text-white bg-yellow-400">K</div>
                            <input value={statusKakao} onChange={e => setStatusKakao(e.target.value)} placeholder="카카오톡 ID"
                              className={`w-full pl-10 pr-3 py-2.5 rounded-xl border-2 text-sm focus:outline-none transition-colors ${darkMode ? 'bg-slate-700 border-slate-500 text-white placeholder-slate-500 focus:border-yellow-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-yellow-400'}`} />
                          </div>
                          <div className="relative">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center text-[11px] font-black text-white bg-pink-500">@</div>
                            <input value={statusInstagram} onChange={e => setStatusInstagram(e.target.value.replace(/^@/, ''))} placeholder="인스타그램 ID (@제외)"
                              className={`w-full pl-10 pr-3 py-2.5 rounded-xl border-2 text-sm focus:outline-none transition-colors ${darkMode ? 'bg-slate-700 border-slate-500 text-white placeholder-slate-500 focus:border-pink-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-pink-400'}`} />
                          </div>
                          <div className="relative">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center text-[11px] font-black text-white bg-green-500">📞</div>
                            <input value={statusPhone} onChange={e => setStatusPhone(e.target.value.replace(/\D/g, '').slice(0, 11))} placeholder="전화번호 (숫자만)" inputMode="tel"
                              className={`w-full pl-10 pr-3 py-2.5 rounded-xl border-2 text-sm focus:outline-none transition-colors ${darkMode ? 'bg-slate-700 border-slate-500 text-white placeholder-slate-500 focus:border-green-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-green-400'}`} />
                          </div>
                        </div>
                        <button onClick={saveStatusContact} disabled={statusContactSaving}
                          className="mt-3 w-full py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white font-bold rounded-xl text-sm active:scale-95 transition-all disabled:opacity-40">
                          {statusContactSaving ? '저장 중...' : '연락처 저장'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ── 생월·생일 ── */}
                  <div className={`border-t ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
                    <button onClick={() => toggleSection('birth')} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                      <span className="text-xl flex-shrink-0">🔮</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>생월 · 생일</p>
                        <p className={`text-[11px] ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>{hasBd ? `${me.birth_month}월 ${me.birth_day}일` : '미설정 — 사주·운세·궁합에 반영돼요'}</p>
                      </div>
                      {hasBd && <span className="text-[10px] font-black px-2 py-0.5 bg-purple-500 text-white rounded-full flex-shrink-0">{me.birth_month}월 {me.birth_day}일 ✓</span>}
                      <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${showBirthEdit ? 'rotate-180' : ''} ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
                    </button>
                    {showBirthEdit && (
                      <div className={`px-4 pb-4 ${darkMode ? 'bg-slate-700/20' : 'bg-gray-50/50'}`}>
                        <div>
                          <p className={`text-xs font-bold mb-2 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>월</p>
                          <div className="grid grid-cols-4 gap-1.5">
                            {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                              <button key={m} type="button" onClick={() => setSajuBirthMonth(m)}
                                className={`py-2 rounded-xl text-sm font-bold transition-all active:scale-95 ${
                                  sajuBirthMonth === m ? 'bg-purple-500 text-white shadow-sm' :
                                  darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                                }`}>{m}월</button>
                            ))}
                          </div>
                        </div>
                        <div className="mt-3">
                          <p className={`text-xs font-bold mb-2 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>일</p>
                          <div className="grid grid-cols-7 gap-1">
                            {Array.from({length: 31}, (_, i) => i + 1).map(d => (
                              <button key={d} type="button" onClick={() => setSajuBirthDay(d)}
                                className={`py-1.5 rounded-lg text-[11px] font-bold transition-all active:scale-95 ${
                                  sajuBirthDay === d ? 'bg-purple-500 text-white shadow-sm' :
                                  darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-purple-50 text-purple-600 hover:bg-purple-100'
                                }`}>{d}</button>
                            ))}
                          </div>
                        </div>
                        <button onClick={saveSajuBirthDate} disabled={sajuSaving || sajuBirthMonth === null || sajuBirthDay === null}
                          className="mt-3 w-full py-2.5 bg-gradient-to-r from-purple-500 to-violet-500 hover:from-purple-600 hover:to-violet-600 text-white font-bold rounded-xl text-sm disabled:opacity-40 active:scale-[0.98] transition-all">
                          {sajuSaving ? '저장 중...' : '생월·생일 저장하기'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ── 오늘의 한마디 ── */}
                  <div className={`border-t ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
                    <button onClick={() => toggleSection('statusMsg')} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                      <span className="text-xl flex-shrink-0">💬</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>오늘의 한마디</p>
                        <p className={`text-[11px] truncate ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>{signalStatusMsg.trim() || '미설정'}</p>
                      </div>
                      <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${showStatusMsgEdit ? 'rotate-180' : ''} ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
                    </button>
                    {showStatusMsgEdit && (
                      <div className={`px-4 pb-4 ${darkMode ? 'bg-slate-700/20' : 'bg-gray-50/50'}`}>
                        <input type="text" value={signalStatusMsg} onChange={(e) => setSignalStatusMsg(e.target.value.slice(0, 30))}
                          placeholder="예: 퇴근 후 맥주 한잔 같이해요 🍺" maxLength={30}
                          className={`w-full px-3 py-2.5 rounded-xl text-sm border focus:outline-none focus:border-cyan-400 transition-colors ${darkMode ? 'bg-slate-700 border-slate-500 text-white placeholder:text-slate-500' : 'bg-gray-50 border-gray-200 text-gray-800 placeholder:text-gray-400'}`} />
                        <p className={`text-[10px] mt-0.5 mb-3 text-right ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>{signalStatusMsg.length}/30</p>
                        <button
                          onClick={async () => {
                            if (!currentUserId || signalSaving) return;
                            setSignalSaving(true);
                            try {
                              const existing = userSignals.find(s => s.user_id === currentUserId);
                              const row = { id: existing?.id ?? crypto.randomUUID(), user_id: currentUserId, status_msg: signalStatusMsg.trim() || null, ideal_msg: encodeSignalMsg(idealTags, idealFreeText), feature_msg: encodeSignalMsg(featureTags, featureFreeText), created_at: existing?.created_at ?? new Date().toISOString() };
                              await supabase.from('user_signals').upsert(row as never, { onConflict: 'user_id' });
                              onUserSignalUpdate?.(row as UserSignal);
                              // [Fix-6] 저장 완료 후 섹션 자동 닫기
                              setProfileEditSection(null);
                            } catch (e) { console.error('[statusMsg save]', e); }
                            finally { setSignalSaving(false); }
                          }}
                          disabled={signalSaving}
                          className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white font-bold rounded-xl text-sm active:scale-[0.98] transition-all disabled:opacity-40">
                          {signalSaving ? '저장 중...' : '저장'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ── 이상형 ── */}
                  <div className={`border-t ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
                    <button onClick={() => toggleSection('ideal')} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                      <span className="text-xl flex-shrink-0">💘</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>이상형</p>
                        <p className={`text-[11px] truncate ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>
                          {idealTags.length > 0 ? idealTags.slice(0, 3).join(' · ') + (idealTags.length > 3 ? ' …' : '') : idealFreeText.trim() || '미설정'}
                        </p>
                      </div>
                      <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${showIdealEdit ? 'rotate-180' : ''} ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
                    </button>
                    {showIdealEdit && (
                      <div className={`px-4 pb-4 space-y-3 ${darkMode ? 'bg-slate-700/20' : 'bg-gray-50/50'}`}>
                        {IDEAL_TAG_GROUPS.map(group => (
                          <div key={group.label}>
                            <p className={`text-[9px] font-black uppercase tracking-widest mb-1.5 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>{group.label}</p>
                            <div className="flex flex-wrap gap-1.5">
                              {group.tags.map(tag => {
                                const selected = idealTags.includes(tag);
                                return (
                                  <button key={tag}
                                    onClick={() => setIdealTags(prev => selected ? prev.filter(t => t !== tag) : [...prev, tag])}
                                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all active:scale-90 ${selected ? 'text-white border-transparent' : darkMode ? 'text-slate-400 border-slate-600 bg-slate-700/50 hover:border-rose-500/50' : 'text-gray-500 border-gray-200 bg-gray-50 hover:border-rose-300'}`}
                                    style={selected ? { background: 'linear-gradient(135deg,#e11d48,#be185d)' } : {}}
                                  >{tag}</button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                        <div>
                          <p className={`text-[9px] font-black uppercase tracking-widest mb-1.5 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>기타 ✏️</p>
                          <input type="text" value={idealFreeText} onChange={(e) => setIdealFreeText(e.target.value.slice(0, 30))}
                            placeholder="예: 다정하고 티키타카 잘 맞는 분" maxLength={30}
                            className={`w-full px-3 py-2.5 rounded-xl text-sm border focus:outline-none focus:border-rose-400 transition-colors ${darkMode ? 'bg-slate-700 border-slate-500 text-white placeholder:text-slate-500' : 'bg-gray-50 border-gray-200 text-gray-800 placeholder:text-gray-400'}`} />
                          <p className={`text-[10px] mt-0.5 text-right ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>{idealFreeText.length}/30</p>
                        </div>
                        <button
                          onClick={async () => {
                            if (!currentUserId || signalSaving) return;
                            setSignalSaving(true);
                            try {
                              const existing = userSignals.find(s => s.user_id === currentUserId);
                              const row = { id: existing?.id ?? crypto.randomUUID(), user_id: currentUserId, status_msg: signalStatusMsg.trim() || null, ideal_msg: encodeSignalMsg(idealTags, idealFreeText), feature_msg: encodeSignalMsg(featureTags, featureFreeText), created_at: existing?.created_at ?? new Date().toISOString() };
                              await supabase.from('user_signals').upsert(row as never, { onConflict: 'user_id' });
                              onUserSignalUpdate?.(row as UserSignal);
                              // [Fix-6] 저장 완료 후 섹션 자동 닫기
                              setProfileEditSection(null);
                            } catch (e) { console.error('[ideal save]', e); }
                            finally { setSignalSaving(false); }
                          }}
                          disabled={signalSaving}
                          className="w-full py-2.5 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl text-sm active:scale-[0.98] transition-all disabled:opacity-40">
                          {signalSaving ? '저장 중...' : '이상형 저장'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ── 나의 특징 ── */}
                  <div className={`border-t ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
                    <button onClick={() => toggleSection('features')} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                      <span className="text-xl flex-shrink-0">🌟</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>나의 특징</p>
                        <p className={`text-[11px] truncate ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>
                          {featureTags.length > 0 ? featureTags.slice(0, 3).join(' · ') + (featureTags.length > 3 ? ' …' : '') : featureFreeText.trim() || '미설정'}
                        </p>
                      </div>
                      <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${showFeaturesEdit ? 'rotate-180' : ''} ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
                    </button>
                    {showFeaturesEdit && (
                      <div className={`px-4 pb-4 space-y-3 ${darkMode ? 'bg-slate-700/20' : 'bg-gray-50/50'}`}>
                        {FEATURE_TAG_GROUPS.map(group => (
                          <div key={group.label}>
                            <p className={`text-[9px] font-black uppercase tracking-widest mb-1.5 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>{group.label}</p>
                            <div className="flex flex-wrap gap-1.5">
                              {group.tags.map(tag => {
                                const selected = featureTags.includes(tag);
                                return (
                                  <button key={tag}
                                    onClick={() => setFeatureTags(prev => selected ? prev.filter(t => t !== tag) : [...prev, tag])}
                                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all active:scale-90 ${selected ? 'text-white border-transparent' : darkMode ? 'text-slate-400 border-slate-600 bg-slate-700/50 hover:border-violet-500/50' : 'text-gray-500 border-gray-200 bg-gray-50 hover:border-violet-300'}`}
                                    style={selected ? { background: 'linear-gradient(135deg,#7c3aed,#6d28d9)' } : {}}
                                  >{tag}</button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                        <div>
                          <p className={`text-[9px] font-black uppercase tracking-widest mb-1.5 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>기타 ✏️</p>
                          <input type="text" value={featureFreeText} onChange={(e) => setFeatureFreeText(e.target.value.slice(0, 30))}
                            placeholder="예: 말 걸기 쉬운 편, 텐션 중간" maxLength={30}
                            className={`w-full px-3 py-2.5 rounded-xl text-sm border focus:outline-none focus:border-violet-400 transition-colors ${darkMode ? 'bg-slate-700 border-slate-500 text-white placeholder:text-slate-500' : 'bg-gray-50 border-gray-200 text-gray-800 placeholder:text-gray-400'}`} />
                          <p className={`text-[10px] mt-0.5 text-right ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>{featureFreeText.length}/30</p>
                        </div>
                        <button
                          onClick={async () => {
                            if (!currentUserId || signalSaving) return;
                            setSignalSaving(true);
                            try {
                              const existing = userSignals.find(s => s.user_id === currentUserId);
                              const row = { id: existing?.id ?? crypto.randomUUID(), user_id: currentUserId, status_msg: signalStatusMsg.trim() || null, ideal_msg: encodeSignalMsg(idealTags, idealFreeText), feature_msg: encodeSignalMsg(featureTags, featureFreeText), created_at: existing?.created_at ?? new Date().toISOString() };
                              await supabase.from('user_signals').upsert(row as never, { onConflict: 'user_id' });
                              onUserSignalUpdate?.(row as UserSignal);
                              setProfileEditSection(null);
                            } catch (e) { console.error('[feature save]', e); }
                            finally { setSignalSaving(false); }
                          }}
                          disabled={signalSaving}
                          className="w-full py-2.5 bg-violet-500 hover:bg-violet-600 text-white font-bold rounded-xl text-sm active:scale-[0.98] transition-all disabled:opacity-40">
                          {signalSaving ? '저장 중...' : '특징 저장'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ── 성향(돔/섭) 공개 ── */}
                  {(() => {
                    const hidePersonality = (me as { hide_personality?: boolean }).hide_personality ?? true;
                    return (
                      <div className={`border-t ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
                        <div className="flex items-center justify-between px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="text-xl flex-shrink-0">👁</span>
                            <div>
                              <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>성향(돔/섭) 공개</p>
                              <p className={`text-[10px] ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>{hidePersonality ? '🔒 다른 참여자에게 숨김' : '👁 다른 참여자에게 보임'}</p>
                            </div>
                          </div>
                          <button
                            onClick={async () => {
                              const next = !hidePersonality;
                              if (!currentUserId) return;
                              try {
                                await supabase.from('profiles').update({ hide_personality: next } as never).eq('id', currentUserId);
                                onUpdateProfile({ id: currentUserId, hide_personality: next } as never);
                              } catch (e) { console.error('[hide_personality]', e); }
                            }}
                            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${hidePersonality ? (darkMode ? 'bg-slate-600' : 'bg-gray-300') : 'bg-teal-500'}`}
                            aria-label="성향 공개 토글"
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${hidePersonality ? 'translate-x-1' : 'translate-x-6'}`} />
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── 방문자 알림 ── */}
                  <div className={`border-t ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
                    <div className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="text-xl flex-shrink-0">👁</span>
                        <div>
                          <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>방문자 알림</p>
                          <p className={`text-[10px] ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>
                            {visitorNotif ? '🔔 누군가 내 프로필을 보면 MY에 표시' : '🔕 방문 알림 끔'}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          const next = !visitorNotif;
                          setVisitorNotif(next);
                          localStorage.setItem('visitor_notification', next ? '1' : '0');
                          if (!next) onClearVisitCount?.();
                        }}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${visitorNotif ? 'bg-teal-500' : (darkMode ? 'bg-slate-600' : 'bg-gray-300')}`}
                        aria-label="방문자 알림 토글"
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${visitorNotif ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  </div>

                  {/* ── 차단·숨기기 ── */}
                  <div className={`border-t ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
                    <button onClick={() => toggleSection('blocklist')} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                      <span className="text-xl flex-shrink-0">🚫</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>차단·숨기기 목록</p>
                        <p className={`text-[11px] ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>{myBlockList.length > 0 ? `${myBlockList.length}명` : '없음'}</p>
                      </div>
                      <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${showBlockInEdit ? 'rotate-180' : ''} ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
                    </button>
                    {showBlockInEdit && (
                      <div className={`px-4 pb-4 ${darkMode ? 'bg-slate-700/20' : 'bg-gray-50/50'}`}>
                        {myBlockList.length === 0 ? (
                          <p className={`text-xs text-center py-4 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>차단하거나 숨긴 사람이 없어요</p>
                        ) : (
                          <div className="space-y-2">
                            {myBlockList.map(b => {
                              const bp = profiles.find(p => p.id === b.target_id);
                              if (!bp) return null;
                              return (
                                <div key={b.id} className={`flex items-center gap-3 p-2 rounded-xl ${darkMode ? 'bg-slate-700/40' : 'bg-gray-50'}`}>
                                  <img src={getAvatarSrc(bp.photo_url, bp.nickname)} alt={bp.nickname}
                                    className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                                    onError={(e) => { (e.target as HTMLImageElement).src = genAvatar(bp.nickname); }} />
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-xs font-black truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>{bp.nickname}</p>
                                    <p className={`text-[10px] ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>{b.block_type === 'block' ? '🚫 차단됨' : '👻 나를 못 보게 함'}</p>
                                  </div>
                                  {onUnblock && (
                                    <button onClick={() => onUnblock(b.id)}
                                      className={`text-[10px] font-black px-2.5 py-1 rounded-xl border transition-all active:scale-95 flex-shrink-0 ${darkMode ? 'border-slate-500 text-slate-300 hover:bg-slate-600' : 'border-gray-200 text-gray-500 hover:bg-gray-100'}`}
                                    >풀기</button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  </>
                  )}
                </div>
              );
            })()}
          </div>
          </StatusErrorBoundary>
        )}

        {/* ─── 채팅 탭 ─── */}
        {mainTab === 'chats' && (
          <div className="max-w-lg mx-auto space-y-3">
            {/* ── 1:1 / 단체 채팅 전환 서브탭 ── */}
            <div className={`flex rounded-xl p-0.5 ${darkMode ? 'bg-slate-700' : 'bg-gray-100'}`}>
              <button
                onClick={() => setChatSubTab('direct')}
                className={`flex-1 py-1.5 text-xs font-black rounded-lg transition-all ${
                  chatSubTab === 'direct'
                    ? (darkMode ? 'bg-slate-600 text-white shadow-sm' : 'bg-white text-gray-900 shadow-sm')
                    : (darkMode ? 'text-slate-400' : 'text-gray-500')
                }`}
              >
                💬 내 채팅 (1:1)
                {sumUnreadCounts(unreadChatCounts) > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-black bg-rose-500 text-white rounded-full">
                    {sumUnreadCounts(unreadChatCounts)}
                  </span>
                )}
              </button>
              <button
                onClick={() => setChatSubTab('group')}
                className={`flex-1 py-1.5 text-xs font-black rounded-lg transition-all ${
                  chatSubTab === 'group'
                    ? (darkMode ? 'bg-slate-600 text-white shadow-sm' : 'bg-white text-gray-900 shadow-sm')
                    : (darkMode ? 'text-slate-400' : 'text-gray-500')
                }`}
              >
                👥 단체 채팅
                {sumUnreadCounts(unreadGroupCounts) > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-black bg-rose-500 text-white rounded-full">
                    {sumUnreadCounts(unreadGroupCounts)}
                  </span>
                )}
              </button>
            </div>

            {/* ── 단체 채팅 목록 ── */}
            {chatSubTab === 'group' && (
              <>
                <p className={`text-[11px] font-bold px-1 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                  참여 {groupChats.filter(g => g.joined).length}/{MAX_GROUPS_PER_USER} · 년생·N대 자동, 2차는 들락날락
                </p>
                {groupChats.length === 0 ? (
                  <div className="text-center py-16">
                    <span className="text-5xl block mb-3 opacity-30">👥</span>
                    <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>
                      아직 열린 단톡방이 없어요
                    </p>
                    <p className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-gray-300'}`}>
                      년생·나이대 방은 자동이에요. 2차 클럽·술은 눌러서 입장!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {groupChats.map(group => {
                      const unread = unreadForGroup(unreadGroupCounts, group.id, groupChats);
                      const visual = groupRoomVisual(group);
                      const joined = !!group.joined;
                      const joining = joiningGroupId === group.id;
                      return (
                        <div
                          key={group.id}
                          onClick={() => { if (joined) { if (guardLockedAction()) return; onOpenGroupChat?.(group.id); } }}
                          className={`rounded-2xl shadow-sm p-4 flex items-center gap-3 transition-colors duration-300 ${
                            joined ? 'cursor-pointer active:scale-[0.98]' : ''
                          } ${
                            visual.afterparty
                              ? (darkMode ? 'bg-violet-950/40 border border-violet-500/40' : 'bg-violet-50 border border-violet-200')
                              : (darkMode ? 'bg-slate-800 border border-slate-600' : 'bg-white')
                          } ${joined && !visual.afterparty ? (darkMode ? 'hover:bg-slate-700' : 'hover:bg-gray-50') : ''}`}
                        >
                          <div className={`w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center text-2xl ${
                            visual.afterparty
                              ? (darkMode ? 'bg-violet-500/20' : 'bg-violet-100')
                              : (darkMode ? 'bg-teal-500/20' : 'bg-teal-50')
                          }`}>
                            {visual.emoji}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              {visual.afterparty && (
                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                                  darkMode ? 'bg-violet-500/30 text-violet-200' : 'bg-violet-200 text-violet-800'
                                }`}>
                                  2차
                                </span>
                              )}
                              <p className={`text-sm font-bold truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                                {group.name}
                              </p>
                            </div>
                            <p className={`text-xs truncate ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>
                              {joined
                                ? (group.lastMessage || '메시지 없음')
                                : '입장하면 대화에 참여할 수 있어요'}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                              darkMode ? 'bg-teal-500/20 text-teal-400' : 'bg-teal-50 text-teal-600'
                            }`}>
                              {group.memberCount ?? 0}명
                            </span>
                            {joined ? (
                              <>
                                {unread > 0 ? (
                                  <span className="min-w-[22px] h-[22px] px-1.5 bg-rose-500 text-white text-[11px] font-black rounded-full flex items-center justify-center shadow-sm">
                                    {unread > 99 ? '99+' : unread}
                                  </span>
                                ) : (
                                  <span className={`text-[10px] font-bold ${darkMode ? 'text-teal-400' : 'text-teal-600'}`}>참여 중</span>
                                )}
                                <button
                                  type="button"
                                  disabled={leavingGroupId === group.id}
                                  onClick={e => {
                                    e.stopPropagation();
                                    setLeaveGroupTarget(group);
                                  }}
                                  className={`text-[10px] font-black px-2 py-1 rounded-full active:scale-95 disabled:opacity-50 ${
                                    darkMode ? 'bg-slate-700 text-slate-200' : 'bg-gray-100 text-gray-600'
                                  }`}
                                >
                                  {leavingGroupId === group.id ? '나가는 중…' : '나가기'}
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                disabled={joining}
                                onClick={e => {
                                  e.stopPropagation();
                                  if (guardLockedAction()) return;
                                  onJoinGroupChat?.(group.id);
                                }}
                                className={`text-[11px] font-black px-3 py-1.5 rounded-full active:scale-95 disabled:opacity-50 ${
                                  visual.afterparty
                                    ? 'bg-violet-500 text-white'
                                    : 'bg-teal-500 text-white'
                                }`}
                              >
                                {joining ? '입장 중…' : '입장'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
            {leaveGroupTarget && (
              <div className="fixed inset-x-0 bottom-0 z-50 flex items-end justify-center px-4 pb-8 pointer-events-none">
                <div
                  className={`pointer-events-auto w-full max-w-sm rounded-2xl p-4 shadow-2xl border ${
                    darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-200'
                  }`}
                  onClick={e => e.stopPropagation()}
                >
                  <p className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>이 방에서 나갈까요?</p>
                  <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                    방은 그대로예요. 나만 빠지고, 나중에 다시 들어올 수 있어요.
                  </p>
                  <div className="flex gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => setLeaveGroupTarget(null)}
                      className={`flex-1 py-2 rounded-xl text-sm font-bold ${darkMode ? 'bg-slate-700 text-white' : 'bg-gray-100 text-gray-700'}`}
                    >취소</button>
                    <button
                      type="button"
                      disabled={!!leavingGroupId}
                      onClick={async () => {
                        if (guardLockedAction()) { setLeaveGroupTarget(null); return; }
                        const id = leaveGroupTarget.id;
                        setLeavingGroupId(id);
                        try { await onLeaveGroupChat?.(id); } finally {
                          setLeavingGroupId(null);
                          setLeaveGroupTarget(null);
                        }
                      }}
                      className="flex-1 py-2 rounded-xl text-sm font-bold bg-red-500 text-white disabled:opacity-50"
                    >나가기</button>
                  </div>
                </div>
              </div>
            )}

            {/* ── 1:1 채팅 섹션 (기존) ── */}
            {chatSubTab === 'direct' && <>
            {/* ── 닉네임 검색으로 채팅 시작 ── */}
            <div className={`relative rounded-xl border overflow-hidden transition-colors ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-200'}`}>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                value={chatSearch}
                onChange={e => setChatSearch(e.target.value)}
                placeholder="닉네임 · MBTI · 성향 · 초성 검색"
                className={`w-full pl-9 pr-9 py-2.5 text-sm bg-transparent focus:outline-none ${darkMode ? 'text-white placeholder-slate-500' : 'text-gray-900 placeholder-gray-400'}`}
              />
              {chatSearch && (
                <button onClick={() => setChatSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm leading-none">✕</button>
              )}
            </div>
            {/* 채팅 검색 잠금 토스트 */}
            {chatSearchLockToast && (
              <div className="text-center text-[11px] font-bold text-white bg-gray-800/90 rounded-full px-3 py-1 pointer-events-none">
                {FUNCTIONS_LOCK_TOAST}
              </div>
            )}
            {/* 검색 결과 */}
            {chatSearch.trim() && (() => {
              const results = profiles.filter(p => p.id !== currentUserId && !isSwipeGestureVerifyProfile(p) && (
                koreanMatch(p.nickname, chatSearch) ||
                (!!p.mbti && koreanMatch(p.mbti, chatSearch)) ||
                koreanMatch(getPositionLabel(p.personality_score ?? 50), chatSearch)
              ));
              return results.length > 0 ? (
                <div className="space-y-1">
                  {results.map(p => {
                    const hasChat = chatList.some(c => c.user1_id === p.id || c.user2_id === p.id);
                    return (
                      <div key={p.id}
                        onClick={() => { if (functionsLocked) { showChatSearchLockToast(); return; } onOpenChat(p); setChatSearch(''); }}
                        className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${darkMode ? 'bg-slate-800 hover:bg-slate-700 border border-slate-700' : 'bg-white hover:bg-gray-50 border border-gray-100'}`}>
                        <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 bg-gray-200">
                          <img src={getAvatarSrc(p.photo_url, p.nickname)} alt={p.nickname} className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).src = genAvatar(p.nickname); }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-bold truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>{p.nickname}</p>
                          {p.mbti && <p className={`text-[10px] ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>{p.mbti}</p>}
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${hasChat ? (darkMode ? 'bg-teal-500/20 text-teal-400' : 'bg-teal-50 text-teal-600') : (darkMode ? 'bg-cyan-500/20 text-cyan-400' : 'bg-cyan-50 text-cyan-600')}`}>
                          {hasChat ? '채팅 있음' : '대화 시작 →'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className={`text-center text-sm py-3 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>"{chatSearch}" 검색 결과 없음</p>
              );
            })()}
            <div className="flex items-center justify-between">
              <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>수락한 상대방과의 채팅 내역</p>
              <div className="flex items-center gap-2">
                {chatList.length > 0 && (
                  <button
                    onClick={onDeleteAllChats}
                    className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-500 text-[11px] font-bold rounded-lg border border-red-200 transition-all active:scale-95"
                  >전체 삭제</button>
                )}
                <RefreshBtn onRefresh={() => doRefresh('chats', onRefreshChat)} refreshed={refreshedTab === 'chats'} />
              </div>
            </div>
            {chatList.length === 0 ? (
              <div className="text-center py-16">
                <MessageCircle className={`w-12 h-12 mx-auto mb-3 ${darkMode ? 'text-slate-500' : 'text-gray-200'}`} />
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>아직 채팅 내역이 없습니다.</p>
              </div>
            ) : (
              chatList.map((chat) => {
                const otherId = chat.user1_id === currentUserId ? chat.user2_id : chat.user1_id;
                const otherProfile = profileMap.get(otherId);
                const chatUnread = unreadForChat(unreadChatCounts, chat.id);
                return (
                  <div key={chat.id}
                    onClick={() => { if (guardLockedAction()) return; otherProfile && onOpenChat(otherProfile); }}
                    className={`rounded-2xl shadow-sm p-4 flex items-center gap-3 cursor-pointer transition-colors duration-300 active:scale-[0.98] ${darkMode ? 'bg-slate-800 border border-slate-600 hover:bg-slate-700' : 'bg-white hover:bg-gray-50'}`}>
                    <div className="relative w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-gray-200">
                      {otherProfile ? (
                        <img src={getAvatarSrc(otherProfile.photo_url, otherProfile.nickname)} alt={otherProfile.nickname} className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).src = genAvatar(otherProfile.nickname); }} />
                      ) : (
                        <div className={`w-full h-full flex items-center justify-center text-xs ${darkMode ? 'bg-slate-700 text-slate-400' : 'bg-gray-200 text-gray-400'}`}>?</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{otherProfile?.nickname ?? '알 수 없음'}</p>
                      <p className={`text-xs truncate ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>
                        {(() => {
                          const lm = chat.lastMessage || '';
                          if (lm.startsWith('__contact__')) return '📱 연락처 공유';
                          if (lm.startsWith('__reply__')) return '↩️ ' + lm.replace(/^__reply__[^\n]*\n?/, '').slice(0, 30);
                          return lm || '메시지 없음';
                        })()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      {chatUnread > 0 && (
                        <span className="min-w-[22px] h-[22px] px-1.5 bg-rose-500 text-white text-[11px] font-black rounded-full flex items-center justify-center shadow-sm">
                          {chatUnread > 99 ? '99+' : chatUnread}
                        </span>
                      )}
                      <button
                        onClick={() => onDeleteChat(chat)}
                        className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-500 text-xs font-bold rounded-xl border border-red-200 transition-all"
                      >삭제</button>
                    </div>
                  </div>
                );
              })
            )}
            </>}
          </div>
        )}

        {/* ─── 시그널 탭 ─── */}
        {mainTab === 'signal' && (
          <SignalTab
            profiles={profiles}
            currentUserId={currentUserId}
            userSignals={userSignals}
            sentHeartsPerPerson={sentHeartsPerPerson}
            blockedUserIds={blockedUserIds}
            hiddenByIds={hiddenByIds}
            functionsLocked={functionsLocked}
            darkMode={darkMode}
            onLike={onLike}
            onSelect={onSelect}
            onGoProfiles={() => onTabChange('profiles')}
            onMissionComplete={onMissionComplete}
          />
        )}

        {/* ─── 통계 탭 ─── */}
        {mainTab === 'stats' && (
          <StatsTab profiles={profiles} darkMode={darkMode} />
        )}

        {/* ─── 랭킹 탭 ─── */}
        {mainTab === 'ranking' && (
          <RankingTab darkMode={darkMode} profiles={profiles} />
        )}

        {/* ─── 운세 탭 ─── */}
        {mainTab === 'fortune' && (
          <div className="min-h-[60vh] w-full overflow-x-hidden">
            {/* ── 생월·생일 설정 카드 ── */}
            {currentUserId && (() => {
              const me = profiles.find(p => p.id === currentUserId);
              if (!me) return null;
              const hasBd = !!(me.birth_month && me.birth_day);
              return (
                <div className={`rounded-2xl mb-4 border transition-colors duration-300 ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-gradient-to-br from-purple-50 to-white border-purple-200'}`}>
                  {/* 접기/펼치기 토글 */}
                  <button onClick={() => setShowFortuneBirthEdit(v => !v)} className="w-full flex items-center gap-2 p-4 text-left">
                    <span className="text-xl flex-shrink-0">🔮</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>생월·생일 설정</p>
                      <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-purple-600'}`}>사주·운세·궁합 기능에 필요해요</p>
                    </div>
                    {hasBd ? (
                      <span className="text-[10px] font-black px-2 py-0.5 bg-purple-500 text-white rounded-full flex-shrink-0">
                        {me.birth_month}월 {me.birth_day}일 ✓
                      </span>
                    ) : (
                      <span className={`text-[10px] font-bold flex-shrink-0 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>미설정</span>
                    )}
                    <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${showFortuneBirthEdit ? 'rotate-180' : ''} ${darkMode ? 'text-slate-400' : 'text-purple-400'}`} />
                  </button>
                  {showFortuneBirthEdit && (
                  <div className="px-4 pb-4">
                  {/* 생월 탭 그리드 */}
                  <div>
                    <p className={`text-xs font-bold mb-2 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>월</p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                        <button key={m} type="button" onClick={() => setSajuBirthMonth(m)}
                          className={`py-2 rounded-xl text-sm font-bold transition-all active:scale-95 ${
                            sajuBirthMonth === m
                              ? 'bg-purple-500 text-white shadow-sm'
                              : darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                          }`}>
                          {m}월
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* 생일 탭 그리드 */}
                  <div className="mt-3">
                    <p className={`text-xs font-bold mb-2 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>일</p>
                    <div className="grid grid-cols-7 gap-1">
                      {Array.from({length: 31}, (_, i) => i + 1).map(d => (
                        <button key={d} type="button" onClick={() => setSajuBirthDay(d)}
                          className={`py-1.5 rounded-lg text-[11px] font-bold transition-all active:scale-95 ${
                            sajuBirthDay === d
                              ? 'bg-purple-500 text-white shadow-sm'
                              : darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-purple-50 text-purple-600 hover:bg-purple-100'
                          }`}>
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={saveSajuBirthDate}
                    disabled={sajuSaving || (sajuBirthMonth === null || sajuBirthDay === null)}
                    className="mt-3 w-full py-2.5 bg-gradient-to-r from-purple-500 to-violet-500 hover:from-purple-600 hover:to-violet-600 text-white font-bold rounded-xl text-sm disabled:opacity-40 active:scale-[0.98] transition-all">
                    {sajuSaving ? '저장 중...' : '생월·생일 저장하기'}
                  </button>
                </div>
                  )}
                </div>
              );
            })()}
            <Suspense fallback={
              <div className="flex items-center justify-center py-12">
                <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>🔮 운세 불러오는 중...</span>
              </div>
            }>
              <FortuneTab
                currentUserId={currentUserId}
                myProfile={profiles.find(p => p.id === currentUserId) ?? null}
                profiles={profiles}
                likedIds={likedIds}
                initialCompatProfileId={fortuneCompatTarget}
              />
            </Suspense>
          </div>
        )}

      </main>

      {/* ── MY 버튼 (우하단 고정 원형) + 팝업 ── */}
      {(() => {
        const myTabActive = mainTab === 'status' || mainTab === 'chats' || mainTab === 'fortune' || mainTab === 'settings';
        const heartsBadge = Math.max(0, pendingHeartsCount - seenHeartsCount) + newContactsCount + newVisitCount;
        const chatUnreadTotal = sumUnreadCounts(unreadChatCounts);
        const groupUnreadTotal = sumUnreadCounts(unreadGroupCounts);
        const myBadgeTotal = heartsBadge + chatUnreadTotal + groupUnreadTotal;

        const MY_ITEMS: Array<{ id: MainTab; icon: string; label: string; badge?: number }> = [
          { id: 'status',   icon: '💝', label: '내 상태',  badge: heartsBadge },
          { id: 'chats',    icon: '💬', label: '내 채팅',  badge: chatUnreadTotal + groupUnreadTotal },
          { id: 'fortune',  icon: '🔮', label: '내 운세' },
          { id: 'settings', icon: '⚙️', label: '내 설정' },
        ];

        return (
          <>
            {/* 팝업 닫기용 배경 */}
            {myMenuOpen && (
              <div className="fixed inset-0 z-40" onClick={() => setMyMenuOpen(false)} />
            )}

            {/* 팝업 메뉴 */}
            {myMenuOpen && (
              <div className={`fixed bottom-24 right-4 z-50 rounded-2xl shadow-2xl border overflow-hidden min-w-[160px] transition-all ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-200'}`}>
                {MY_ITEMS.map((item, idx) => {
                  const locked = functionsLocked && LOCKED_TABS.has(item.id);
                  const active = mainTab === item.id;
                  return (
                    <button
                      key={item.id}
                      disabled={locked}
                      onClick={() => { if (locked) return; setMyMenuOpen(false); handleTabChange(item.id); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 transition-all active:scale-95 ${idx > 0 ? (darkMode ? 'border-t border-slate-700' : 'border-t border-gray-100') : ''} ${
                        active
                          ? darkMode ? 'bg-cyan-500/20 text-cyan-400' : 'bg-cyan-50 text-cyan-700'
                          : locked
                            ? `opacity-40 cursor-not-allowed ${darkMode ? 'text-slate-400' : 'text-gray-400'}`
                            : darkMode ? 'text-slate-200 hover:bg-slate-700' : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <span className="text-lg leading-none">{locked ? '🔒' : item.icon}</span>
                      <span className="text-sm font-bold flex-1 text-left">{item.label}</span>
                      {!locked && (item.badge ?? 0) > 0 && (
                        <span className="min-w-[18px] h-[18px] px-1 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* MY 원형 버튼 */}
            <button
              onClick={() => setMyMenuOpen(v => !v)}
              className={`fixed bottom-6 right-4 z-50 w-14 h-14 rounded-full shadow-xl flex flex-col items-center justify-center gap-0 transition-all active:scale-90 select-none ${
                myTabActive || myMenuOpen
                  ? 'bg-gradient-to-br from-cyan-500 to-teal-500 text-white border-2 border-white/40'
                  : darkMode
                    ? 'bg-slate-700 text-slate-200 border-2 border-teal-400/70'
                    : 'bg-white text-gray-700 border-2 border-gray-400'
              }`}
              style={{ boxShadow: (myTabActive || myMenuOpen) ? '0 4px 20px rgba(6,182,212,0.45)' : darkMode ? '0 4px 16px rgba(0,0,0,0.5)' : '0 4px 16px rgba(0,0,0,0.15)' }}
            >
              <span className="text-[15px] font-black leading-none tracking-widest">MY</span>
              {myBadgeTotal > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center shadow-sm">
                  {myBadgeTotal > 99 ? '99+' : myBadgeTotal}
                </span>
              )}
            </button>
          </>
        );
      })()}

    </div>
  );
}
