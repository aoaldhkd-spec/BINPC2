import { useState, useEffect, useRef, useCallback, useMemo, Suspense, lazy, Component, ReactNode, memo } from 'react';
import {
  Heart, MessageCircle, Users, ChevronDown, LayoutGrid, CheckCircle,
  Eye, UserCheck, Gamepad2, X, BookOpen,
  BarChart3, XCircle, QrCode, Camera, Search,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Profile, Seat, ContactShare, Suggestion, BalanceGame, Chat, MainTab, TableMiniGameSession } from '../types/app';
import { HeartType, HEART_TYPES, heartMeta } from '../lib/constants';
import { getPositionLabel, getPositionBg, getPositionStyle, getDomSubLabel, getDomSubBg, getKoreanAge } from '../lib/profile';
import { getZodiac, getOhaeng } from '../lib/fortune';
import { getMbtiStyle, koreanMatch } from '../lib/utils';
import { ls } from '../lib/storage';
import SeatingMap from './SeatingMap';
import ProfileAvatar from './ProfileAvatar';
import { StatsTab, RankingTab } from './StatsTabs';
import { ProfileInfoBadges } from './ProfileInfoBadges';
import { TimerBanner } from './TimerBanner';
import { RefreshBtn } from './RefreshBtn';
import { ResetButton } from './ResetButton';
import { UserGameTab } from './games/UserGameTab';
const FortuneTab = lazy(() => import('./FortuneTab'));

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

// ─── ProfileCard (memoized — 하트/채팅 상태 변경 시 해당 카드만 재렌더) ────────

const ProfileCard = memo(function ProfileCard({
  profile, isLiked, sentHeartType, heartCount, canLike, onLike, onSelect, onOpenChat,
}: {
  profile: Profile;
  isLiked: boolean;
  sentHeartType: HeartType | undefined;
  heartCount: number;
  canLike: boolean;
  onLike: (id: string) => void;
  onSelect: (p: Profile) => void;
  onOpenChat: (p: Profile) => void;
}) {
  const posLabel = getPositionLabel(profile.personality_score ?? 50);
  const posStyle = getPositionStyle(profile.personality_score ?? 50);
  const bioTags = profile.bio ? profile.bio.split(',').map(t => t.trim()).filter(Boolean).slice(0, 2) : [];
  const age = getKoreanAge(profile.birth_year);
  const msStyle = profile.mbti ? getMbtiStyle(profile.mbti) : null;

  return (
    <div
      className="group relative bg-white rounded-2xl overflow-hidden shadow-sm active:scale-[0.97] cursor-pointer border border-gray-100 transition-transform duration-150"
      onClick={() => onSelect(profile)}
    >
      {/* ── 사진 (3:4 세로형) ── */}
      <div className="relative bg-gray-100" style={{ aspectRatio: '3/4' }}>
        <img src={profile.photo_url} alt={profile.nickname} className="w-full h-full object-cover" />
        {/* 하단 그라데이션 — 어떤 사진이든 텍스트 가독성 보장 */}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />
        {/* 우상단 버튼 뒤 어두운 스크림 */}
        {canLike && (
          <div className="absolute top-0 right-0 w-12 h-24 bg-gradient-to-bl from-black/30 to-transparent pointer-events-none rounded-tr-2xl" />
        )}
        {/* MBTI 배지 — 좌상단 */}
        {msStyle && (
          <span
            className="absolute top-1.5 left-1.5 text-[8px] font-black px-1.5 py-0.5 rounded-lg border leading-tight shadow-sm backdrop-blur-sm"
            style={{ backgroundColor: msStyle.bg + 'ee', color: msStyle.color, borderColor: msStyle.border }}
          >
            {profile.mbti}
          </span>
        )}
        {/* 하트 버튼 — 우상단 */}
        {canLike && (
          <button
            onClick={(e) => { e.stopPropagation(); onLike(profile.id); }}
            disabled={isLiked && heartCount >= 4}
            className="absolute top-1.5 right-1.5 w-8 h-8 bg-white/95 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-transform"
          >
            {isLiked && sentHeartType
              ? <span className="text-sm leading-none relative">
                  {heartMeta(sentHeartType).emoji}
                  {heartCount > 1 && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 text-white text-[7px] font-black rounded-full flex items-center justify-center">{heartCount}</span>
                  )}
                </span>
              : isLiked
                ? <Heart className="w-4 h-4" style={{ fill: '#e11d48', stroke: '#9f0a28', strokeWidth: 1.5 }} />
                : <Heart className="w-4 h-4" style={{ fill: 'rgba(255,255,255,0.9)', stroke: '#be123c', strokeWidth: 2 }} />
            }
          </button>
        )}
        {/* 채팅 버튼 — 하트 아래 */}
        {canLike && (
          <button
            onClick={(e) => { e.stopPropagation(); onOpenChat(profile); }}
            className="absolute top-11 right-1.5 w-8 h-8 bg-white/95 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-transform"
          >
            <MessageCircle className="w-4 h-4 text-sky-500" strokeWidth={2} />
          </button>
        )}
        {/* 닉네임+나이 오버레이 */}
        <div className="absolute inset-x-0 bottom-0 px-2.5 pb-2.5">
          <p className="font-black text-white text-[14px] leading-tight truncate tracking-widest" style={{ textShadow: '0 0 3px #000, 0 0 6px #000, 0 1px 4px rgba(0,0,0,1), 0 2px 10px rgba(0,0,0,0.95), 0 4px 20px rgba(0,0,0,0.8)' }}>{profile.nickname}</p>
          {profile.birth_year && <p className="text-[11px] text-white/90 leading-none mt-0.5 font-medium" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}>{age}</p>}
        </div>
      </div>
      {/* ── 배지 영역 ── */}
      <div className="px-2.5 py-2.5 flex flex-wrap items-center gap-1.5">
        <span
          className="text-[11px] font-bold px-2 py-0.5 rounded-lg leading-tight border"
          style={{ backgroundColor: posStyle.bg, color: posStyle.text, borderColor: posStyle.border }}
        >
          {posLabel}
        </span>
        {bioTags.map(tag => (
          <span key={tag} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-pink-50 text-pink-500 border border-pink-100">#{tag}</span>
        ))}
      </div>
    </div>
  );
});

// ─── MainScreen ───────────────────────────────────────────────────────────────

export function MainScreen({
  profiles, currentUserId, likedIds, sentHeartTypes, sentHeartsPerPerson, likeStatuses, seats, profileMap, mainTab,
  onTabChange, onLike, onSelect, onReset, onProfileClickFromMap,
  receivedLikers, receivedHeartTypes, sentLikedProfiles, contactSharedWithIds, acknowledgedComplimentIds,
  receivedContactShares, pendingHeartsCount, chatList, suggestions,
  balanceGames, voteCounts, myVotes,
  onContactShareOpen, onContactViewOpen, onHeartResponse, onDeleteChat, onDeleteAllChats, onSubmitSuggestion, onOpenChat,
  onVote, onCreateGame, onEndGame, onSubmitAnonymousReport,
  timerEndAt, timerLabel, onRefreshStatus, onRefreshChat, onRefreshProfiles, onRefreshSeating, darkMode, onToggleDark, onShowQr, seatingLocked, activeTables, tableLabels, onShowTutorial,
  newMsgCount, onClearMsgCount, unreadChatCounts, onClearChatUnread, resetPassword, onBroadcastGame,
  setSeatDialog, onUpdateProfile,
}: {
  profiles: Profile[]; currentUserId: string | null; likedIds: Set<string>; sentHeartTypes: Map<string, HeartType>; sentHeartsPerPerson: Map<string, Set<HeartType>>; likeStatuses: Map<string, string>;
  seats: Seat[]; profileMap: Map<string, Profile>; mainTab: MainTab;
  onTabChange: (t: MainTab) => void; onLike: (id: string) => void;
  onSelect: (p: Profile) => void; onReset: () => void;
  onProfileClickFromMap: (profile: Profile) => void;
  receivedLikers: Profile[]; receivedHeartTypes: Map<string, HeartType>; sentLikedProfiles: Profile[];
  contactSharedWithIds: Set<string>; acknowledgedComplimentIds: Set<string>; receivedContactShares: ContactShare[];
  pendingHeartsCount: number; chatList: Chat[]; suggestions: Suggestion[];
  balanceGames: BalanceGame[]; voteCounts: Map<string, { a: number; b: number }>; myVotes: Map<string, 'a' | 'b'>;
  onContactShareOpen: (profile: Profile) => void;
  onContactViewOpen: (share: ContactShare, profile: Profile) => void;
  onHeartResponse: (likerId: string, response: 'accepted' | 'rejected') => void;
  onDeleteChat: (chat: Chat) => void;
  onDeleteAllChats: () => void;
  onSubmitSuggestion: (content: string, contactInfo: string) => Promise<void>;
  onOpenChat: (profile: Profile) => void;
  onVote: (gameId: string, option: 'a' | 'b') => void;
  onCreateGame: (question: string, optA: string, optB: string, scope: 'global' | 'table') => void;
  onEndGame: (gameId: string) => void;
  onSubmitAnonymousReport: (content: string, tableNumber: number | null) => Promise<void>;
  timerEndAt: string | null;
  timerLabel: string | null;
  onRefreshStatus: () => void;
  onRefreshChat: () => void;
  onRefreshProfiles: () => void;
  onRefreshSeating: () => void;
  darkMode: boolean;
  onToggleDark: () => void;
  onShowQr: () => void;
  seatingLocked: boolean;
  activeTables: number[] | null;
  tableLabels: Record<string, string> | null;
  onShowTutorial: () => void;
  newMsgCount: number;
  onClearMsgCount: () => void;
  unreadChatCounts: Record<string, number>;
  onClearChatUnread: (chatId: string) => void;
  resetPassword: string | null;
  onBroadcastGame: (s: TableMiniGameSession) => void;
  setSeatDialog: (s: Seat | null) => void;
  onUpdateProfile: (update: Record<string, unknown> & { id: string }) => void;
}) {
  const heartCount = useCallback((t: HeartType) => { let c = 0; sentHeartsPerPerson.forEach(types => { if (types.has(t)) c++; }); return c; }, [sentHeartsPerPerson]);
  const currentUserSeat = useMemo(() => seats.find(s => s.profile_id === currentUserId) ?? null, [seats, currentUserId]);
  const tableNumber = currentUserSeat?.table_number ?? null;
  const visibleSeats = useMemo(() => activeTables ? seats.filter(s => activeTables.includes(s.table_number)) : seats, [seats, activeTables]);
  const currentUserNickname = useMemo(() => profiles.find(p => p.id === currentUserId)?.nickname ?? '', [profiles, currentUserId]);
  const [profileSearch, setProfileSearch] = useState('');
  const [profilePersonalityFilter, setProfilePersonalityFilter] = useState<string | null>(null);
  const [profileMbtiFilter, setProfileMbtiFilter] = useState<string | null>(null);

  // 참여자 목록 — 필터·정렬을 매 렌더마다 재계산하지 않도록 메모이제이션
  const filteredProfiles = useMemo(() => {
    return [...profiles]
      .filter(p => {
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
  }, [profiles, profileSearch, profilePersonalityFilter, profileMbtiFilter, currentUserId]);

  const [suggestionContent, setSuggestionContent] = useState('');
  const [suggestionContact, setSuggestionContact] = useState('');
  const [suggestionSubmitting, setSuggestionSubmitting] = useState(false);
  const [reportText, setReportText] = useState('');
  const reportSentKey = `reportSent_${currentUserId}`;
  const [reportSent, setReportSentRaw] = useState(() => ls.getItem(reportSentKey) === '1');
  const setReportSent = (v: boolean) => { if (v) ls.setItem(reportSentKey, '1'); else ls.removeItem(reportSentKey); setReportSentRaw(v); };
  const [drinkPicker, setDrinkPicker] = useState<string | null>(null);
  const [refreshedTab, setRefreshedTab] = useState<string | null>(null);

  const doRefresh = (tabId: string, fn: () => void) => {
    fn();
    setRefreshedTab(tabId);
    setTimeout(() => setRefreshedTab(null), 2000);
  };
  const heartsKey = `seen_hearts_${currentUserId ?? 'x'}`;
  const gameKey = `seen_game_${currentUserId ?? 'x'}`;
  const contactsKey = `seen_contacts_${currentUserId ?? 'x'}`;
  const profilesKey = `seen_profiles_${currentUserId ?? 'x'}`;
  const [seenHeartsCount, setSeenHeartsCountRaw] = useState(() => {
    const v = ls.getItem(heartsKey); return v !== null ? parseInt(v, 10) : 0;
  });
  const [seenProfilesCount, setSeenProfilesCountRaw] = useState(() => {
    const v = ls.getItem(profilesKey); return v !== null ? parseInt(v, 10) : -1;
  });
  const activeGameCount = useMemo(() => balanceGames.filter(g =>
    g.status === 'active' && (
      g.scope === 'global' ||
      (tableNumber != null && g.table_number === tableNumber)
    )
  ).length, [balanceGames, tableNumber]);
  const [seenGameCount, setSeenGameCountRaw] = useState(() => {
    const v = ls.getItem(gameKey); return v !== null ? parseInt(v, 10) : 0;
  });
  const [seenContactsCount, setSeenContactsCountRaw] = useState(() => {
    const v = ls.getItem(contactsKey); return v !== null ? parseInt(v, 10) : 0;
  });

  const setSeenHeartsCount = (n: number) => { ls.setItem(heartsKey, String(n)); setSeenHeartsCountRaw(n); };
  const setSeenProfilesCount = (n: number) => { ls.setItem(profilesKey, String(n)); setSeenProfilesCountRaw(n); };
  const setSeenGameCount = (n: number) => { ls.setItem(gameKey, String(n)); setSeenGameCountRaw(n); };
  const setSeenContactsCount = (n: number) => { ls.setItem(contactsKey, String(n)); setSeenContactsCountRaw(n); };

  const newContactsCount = Math.max(0, receivedContactShares.length - seenContactsCount);

  // On initial data load, set baseline seen counts so pre-existing data doesn't show as unread
  const baselineSetRef = useRef(false);
  useEffect(() => {
    if (baselineSetRef.current) return;
    // Always set baseline on first render so existing hearts/contacts don't badge
    baselineSetRef.current = true;
    setSeenHeartsCount(pendingHeartsCount);
    setSeenContactsCount(receivedContactShares.length);
    setSeenProfilesCount(profiles.length);
    if (activeGameCount > 0) setSeenGameCount(activeGameCount);
  }, []);

  const handleTabChange = (t: MainTab) => {
    if (t === 'status') { setSeenHeartsCount(pendingHeartsCount); setSeenContactsCount(receivedContactShares.length); }
    if (t === 'profiles') setSeenProfilesCount(profiles.length);
    if (t === 'chats' || t === 'suggestions') { onClearMsgCount(); }
    if (t === 'game' || t === 'fortune') setSeenGameCount(activeGameCount);
    onTabChange(t);
  };

  const QUICK_REPORTS = [
    { label: '화장실이 급해요 🚽', text: '화장실이 급해요' },
    { label: '물 주세요 💧', text: '물 주세요' },
    { label: '소주잔 주세요', text: '소주잔 주세요' },
    { label: '맥주잔 주세요', text: '맥주잔 주세요' },
    { label: '종이컵 주세요', text: '종이컵 주세요' },
    { label: '젓가락 주세요', text: '젓가락 주세요' },
    { label: '휴지 주세요', text: '휴지 주세요' },
    { label: '물티슈 주세요', text: '물티슈 주세요' },
    { label: '너무 더워요 🥵', text: '너무 더워요' },
    { label: '너무 추워요 🥶', text: '너무 추워요' },
    { label: '음악 너무 커요 🔊', text: '음악 너무 커요' },
  ];

  const DRINK_OPTIONS: Record<string, { label: string; choices: string[] }> = {
    '맥주': { label: '맥주 종류 선택', choices: ['카스', '켈리', '테라'] },
    '소주': { label: '소주 종류 선택', choices: ['진로', '대선', '참이슬', '좋은데이'] },
    '음료수': { label: '음료수 종류 선택', choices: ['코카콜라제로', '펩시제로', '웰치스', '스프라이트'] },
  };

  const sendReport = async (text: string) => {
    await onSubmitAnonymousReport(text, tableNumber);
    setDrinkPicker(null);
    setReportSent(true);
    setReportText('');
  };

  // ── 사주 탭 생월·생일 편집 상태 ─────────────────────────────────────────────
  const [chatSearch, setChatSearch] = useState('');
  const [showBirthEdit, setShowBirthEdit] = useState(false);
  const [showContactEdit, setShowContactEdit] = useState(false);
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
    // 운세탭 생월생일 섹션: 미설정 상태면 자동으로 펼치기 (최초 1회)
    if (!fortuneBirthAutoOpenedRef.current) {
      fortuneBirthAutoOpenedRef.current = true;
      if (!me.birth_month || !me.birth_day) setShowFortuneBirthEdit(true);
    }
  }, [profiles, currentUserId]);

  const saveSajuBirthDate = async () => {
    if (!currentUserId) return;
    setSajuSaving(true);
    try {
      await supabase.from('profiles').update({
        birth_month: sajuBirthMonth,
        birth_day: sajuBirthDay,
      } as never).eq('id', currentUserId);
      onUpdateProfile({ id: currentUserId, birth_month: sajuBirthMonth, birth_day: sajuBirthDay });
      sajuInitRef.current = false;
      setShowBirthEdit(false);
      setShowFortuneBirthEdit(false);
      onRefreshProfiles();
    } catch (e) { console.error('[saju] 저장 실패:', e); }
    setSajuSaving(false);
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
      setShowContactEdit(false);
      onRefreshProfiles();
    } catch (e) { console.error('[contact] 저장 실패:', e); }
    setStatusContactSaving(false);
  };

  // ── 프로필 사진 업로드 ────────────────────────────────────────────────────────
  const [photoUploading, setPhotoUploading] = useState(false);
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
      reader.onload = async (ev) => {
        const dataUrl = ev.target?.result as string;
        if (!dataUrl) { setPhotoUploading(false); return; }
        const compressed = await compressImage(dataUrl);
        const path = `profile-photos/${currentUserId}`;
        await fetch('/api/db/storage-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path, dataUrl: compressed }),
        });
        const photoUrl = `/api/db/storage-image?p=${encodeURIComponent(path)}&t=${Date.now()}`;
        await supabase.from('profiles').update({ photo_url: photoUrl } as never).eq('id', currentUserId);
        onUpdateProfile({ id: currentUserId, photo_url: photoUrl });
        onRefreshProfiles();
        setPhotoUploading(false);
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
          {/* 좌: 튜토리얼 + 다크모드 */}
          <div className="justify-self-start flex items-center gap-1">
            <button
              onClick={() => onShowTutorial()}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-all active:scale-95 ${darkMode ? 'text-slate-400 hover:text-cyan-400 hover:bg-slate-800' : 'text-gray-500 hover:text-cyan-600 hover:bg-cyan-50'}`}
            >
              <BookOpen className="w-5 h-5" />
              <span className="text-[9px] font-semibold">튜토리얼</span>
            </button>
            <button onClick={onToggleDark}
              className={`p-2 rounded-xl transition-all ${darkMode ? 'bg-slate-700 text-amber-400 hover:bg-slate-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
              title={darkMode ? '라이트 모드' : '다크 모드'}>
              {darkMode ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd"/></svg>
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/></svg>
              )}
            </button>
          </div>
          {/* 중앙: 타이틀 */}
          <div className="justify-self-center">
            <ResetButton onReset={onReset} darkMode={darkMode} resetPassword={resetPassword} onEasterEgg={() => onSubmitSuggestion('__술주세요__', '')} />
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
        {/* Bottom Tab Bar */}
        <div className={`max-w-7xl mx-auto flex border-t-2 overflow-x-auto scrollbar-hide safe-area-pb ${darkMode ? 'bg-slate-900 border-slate-700' : 'bg-gray-50 border-gray-200'}`} style={{ WebkitOverflowScrolling: 'touch' }}>
          {([
            { id: 'status' as MainTab, label: '나·참여자', icon: <UserCheck className="w-5 h-5" />, badge: Math.max(0, pendingHeartsCount - seenHeartsCount) + newContactsCount + (seenProfilesCount < 0 ? 0 : Math.max(0, profiles.length - seenProfilesCount)) },
            { id: 'seating' as MainTab, label: '배치도', icon: <LayoutGrid className="w-5 h-5" /> },
            { id: 'chats' as MainTab, label: '채팅·건의', icon: <MessageCircle className="w-5 h-5" />, badge: newMsgCount },
            { id: 'game' as MainTab, label: '게임·운세', icon: <Gamepad2 className="w-5 h-5" />, badge: Math.max(0, activeGameCount - seenGameCount) },
            { id: 'stats' as MainTab, label: '통계·랭킹', icon: <BarChart3 className="w-5 h-5" /> },
          ]).map((t) => (
            <button key={t.id} onClick={() => handleTabChange(t.id)}
              className={`relative flex-1 min-w-[56px] flex flex-col items-center gap-1 px-2 py-2.5 text-[10px] font-semibold border-b-2 transition-all active:scale-95 ${
                mainTab === t.id || (t.id === 'status' && mainTab === 'profiles') || (t.id === 'chats' && mainTab === 'suggestions') || (t.id === 'stats' && mainTab === 'ranking') || (t.id === 'game' && mainTab === 'fortune')
                  ? darkMode ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10' : 'border-cyan-500 text-cyan-600 bg-cyan-50'
                  : darkMode ? 'border-transparent text-slate-400 active:text-slate-100' : 'border-transparent text-gray-500 active:text-gray-700'
              }`}>
              <span className="relative">
                {t.icon}
                {'badge' in t && (t as { badge: number }).badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {t.badge}
                  </span>
                )}
              </span>
              <span className="leading-none whitespace-nowrap">{t.label}</span>
            </button>
          ))}
        </div>
        {/* Sub Tab — 나·참여자 */}
        {(mainTab === 'status' || mainTab === 'profiles') && (
          <div className={`max-w-7xl mx-auto flex p-1 ${darkMode ? 'bg-slate-800' : 'bg-gray-200/80'}`}>
            {([
              { id: 'status' as MainTab, label: '내 상태', badge: Math.max(0, pendingHeartsCount - seenHeartsCount) + newContactsCount },
              { id: 'profiles' as MainTab, label: '참여자', badge: seenProfilesCount < 0 ? 0 : Math.max(0, profiles.length - seenProfilesCount) },
            ]).map(sub => (
              <button key={sub.id} onClick={() => handleTabChange(sub.id)}
                className={`relative flex-1 py-2 rounded-lg text-[11px] font-bold transition-all ${
                  mainTab === sub.id
                    ? darkMode ? 'bg-slate-700 text-cyan-400 shadow-sm' : 'bg-white text-gray-800 shadow-sm'
                    : darkMode ? 'text-slate-500' : 'text-gray-500'
                }`}>
                {sub.label}
                {sub.badge > 0 && (
                  <span className="absolute top-1 right-3 min-w-[16px] h-[16px] px-0.5 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
                    {sub.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        {/* Sub Tab — 채팅·건의 */}
        {(mainTab === 'chats' || mainTab === 'suggestions') && (
          <div className={`max-w-7xl mx-auto flex p-1 ${darkMode ? 'bg-slate-800' : 'bg-gray-200/80'}`}>
            {([
              { id: 'chats' as MainTab, label: '채팅', badge: newMsgCount },
              { id: 'suggestions' as MainTab, label: '건의함', badge: 0 },
            ]).map(sub => (
              <button key={sub.id} onClick={() => handleTabChange(sub.id)}
                className={`relative flex-1 py-2 rounded-lg text-[11px] font-bold transition-all ${
                  mainTab === sub.id
                    ? darkMode ? 'bg-slate-700 text-cyan-400 shadow-sm' : 'bg-white text-gray-800 shadow-sm'
                    : darkMode ? 'text-slate-500' : 'text-gray-500'
                }`}>
                {sub.label}
                {sub.badge > 0 && (
                  <span className="absolute top-1 right-3 min-w-[16px] h-[16px] px-0.5 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
                    {sub.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        {/* Sub Tab — 통계·랭킹 */}
        {(mainTab === 'stats' || mainTab === 'ranking') && (
          <div className={`max-w-7xl mx-auto flex p-1 ${darkMode ? 'bg-slate-800' : 'bg-gray-200/80'}`}>
            {[{ id: 'stats' as MainTab, label: '통계' }, { id: 'ranking' as MainTab, label: '랭킹' }].map(sub => (
              <button key={sub.id} onClick={() => handleTabChange(sub.id)}
                className={`flex-1 py-2 rounded-lg text-[11px] font-bold transition-all ${
                  mainTab === sub.id
                    ? darkMode ? 'bg-slate-700 text-cyan-400 shadow-sm' : 'bg-white text-gray-800 shadow-sm'
                    : darkMode ? 'text-slate-500' : 'text-gray-500'
                }`}>
                {sub.label}
              </button>
            ))}
          </div>
        )}
        {/* Sub Tab — 게임·운세 */}
        {(mainTab === 'game' || mainTab === 'fortune') && (
          <div className={`max-w-7xl mx-auto flex p-1 ${darkMode ? 'bg-slate-800' : 'bg-gray-200/80'}`}>
            {[{ id: 'game' as MainTab, label: '🎮 게임' }, { id: 'fortune' as MainTab, label: '🔮 운세' }].map(sub => (
              <button key={sub.id} onClick={() => handleTabChange(sub.id)}
                className={`flex-1 py-2 rounded-lg text-[11px] font-bold transition-all ${
                  mainTab === sub.id
                    ? darkMode ? 'bg-slate-700 text-cyan-400 shadow-sm' : 'bg-white text-gray-800 shadow-sm'
                    : darkMode ? 'text-slate-500' : 'text-gray-500'
                }`}>
                {sub.label}
              </button>
            ))}
          </div>
        )}

      </header>

      <main className={`max-w-7xl mx-auto px-4 py-6 ${mainTab === 'seating' ? '' : 'scrollbar-styled-light'}`}>
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
              {/* MBTI 필터 */}
              <div className={`flex gap-1 overflow-x-auto pb-1 scrollbar-styled-light`}>
                {[null,...['INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP','ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP']].map(m => {
                  const active = profileMbtiFilter === m;
                  return (
                    <button key={String(m)} onClick={() => setProfileMbtiFilter(active ? null : m)}
                      className={`flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-bold border transition-all ${active ? 'bg-cyan-500 text-white border-cyan-500' : 'bg-white text-gray-500 border-gray-200 hover:border-cyan-300'}`}>
                      {m ?? '전체'}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── 내 카드 (고정 위치, sticky 없음) ───────────────── */}
            {(() => {
              const myProfile = profiles.find(p => p.id === currentUserId);
              if (!myProfile) return null;
              const posColor = getPositionBg(myProfile.personality_score ?? 50);
              const posLabel = getPositionLabel(myProfile.personality_score ?? 50);
              const posStyle = getPositionStyle(myProfile.personality_score ?? 50);
              const bioTags = myProfile.bio ? myProfile.bio.split(',').map(t => t.trim()).filter(Boolean).slice(0, 3) : [];
              const age = getKoreanAge(myProfile.birth_year);
              return (
                <div className="mb-3">
                  <p className={`text-[10px] font-black uppercase tracking-widest mb-1.5 ${darkMode ? 'text-amber-400' : 'text-amber-500'}`}>내 카드 👤</p>
                  <div
                    className="group relative bg-white rounded-2xl overflow-hidden shadow-md border-2 border-amber-400 ring-2 ring-amber-200/60 cursor-pointer active:scale-[0.98] transition-all"
                    onClick={() => onSelect(myProfile)}>
                    <div className="flex gap-3 p-3">
                      {/* 프로필 사진 */}
                      <div className="relative flex-shrink-0">
                        <div className="w-[72px] h-[72px] rounded-2xl overflow-hidden border border-gray-200 shadow-sm bg-gray-100">
                          <img src={myProfile.photo_url} alt={myProfile.nickname} className="w-full h-full object-cover" />
                        </div>
                        <div className="absolute -top-1.5 -left-1.5 z-10 px-1.5 py-0.5 bg-amber-400 rounded-full shadow text-[9px] font-black text-white leading-none">나</div>
                      </div>
                      {/* 텍스트 정보 */}
                      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                        <p className="font-black text-gray-900 text-base leading-tight truncate">{myProfile.nickname}</p>
                        {myProfile.birth_year && (
                          <p className="text-[11px] text-gray-400 leading-none">{age}</p>
                        )}
                        <div className="flex items-center gap-1 flex-wrap mt-0.5">
                          {myProfile.mbti && (() => {
                            const ms = getMbtiStyle(myProfile.mbti);
                            return <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md border" style={{ backgroundColor: ms.bg, color: ms.color, borderColor: ms.border }}>{myProfile.mbti}</span>;
                          })()}
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md leading-tight border" style={{ backgroundColor: posStyle.bg, color: posStyle.text, borderColor: posStyle.border }}>{posLabel}</span>
                        </div>
                        {bioTags.length > 0 && (
                          <div className="flex flex-wrap gap-0.5 mt-0.5">
                            {bioTags.slice(0, 3).map(tag => (
                              <span key={tag} className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-pink-50 text-pink-500 border border-pink-100">#{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* ── 다른 참여자 그리드 (이 영역만 스크롤) ───────── */}
            <div className="overflow-y-auto -mx-4 px-4 pb-6" style={{ maxHeight: 'calc(100dvh - 420px)', minHeight: 160 }}>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {filteredProfiles.filter(p => p.id !== currentUserId).map((profile) => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                isLiked={likedIds.has(profile.id)}
                sentHeartType={sentHeartTypes.get(profile.id)}
                heartCount={sentHeartsPerPerson.get(profile.id)?.size ?? 0}
                canLike={!!(currentUserId && profile.id !== currentUserId)}
                onLike={onLike}
                onSelect={onSelect}
                onOpenChat={onOpenChat}
              />
            ))}
            {filteredProfiles.filter(p => p.id !== currentUserId).length === 0 && (
              <div className="col-span-2 sm:col-span-3 lg:col-span-4 text-center py-20">
                <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">{profileSearch || profilePersonalityFilter || profileMbtiFilter ? '검색 결과가 없습니다.' : '아직 다른 참가자가 없습니다.'}</p>
              </div>
            )}
          </div>
          </div>{/* /scroll-wrapper */}
          </>
        )}

        {mainTab === 'seating' && (
            <div>
              <div className="flex justify-end px-2 pt-1 pb-2">
                <RefreshBtn onRefresh={() => doRefresh('seating', onRefreshSeating)} refreshed={refreshedTab === 'seating'} dark />
              </div>
              <div className={`rounded-2xl border p-3 sm:p-4 transition-colors duration-300 ${darkMode ? 'bg-slate-900 border-slate-600' : 'bg-white border-gray-200 shadow-sm'}`}>
                <SeatingMap seats={visibleSeats} profileMap={profileMap} currentUserId={currentUserId} isAdmin={false} seatingLocked={true} darkMode={darkMode} tableLabels={tableLabels} onProfileClick={onProfileClickFromMap} onChatClick={onOpenChat} onSeatClick={undefined} />
              </div>
              <p className={`text-center text-xs mt-2 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>
                ↔↕ 상하좌우 + 대각선 스크롤 가능 &middot; 테이블 탭하면 확대됩니다
              </p>
            </div>
        )}

        {mainTab === 'status' && (
          <StatusErrorBoundary>
          <div className="max-w-lg mx-auto space-y-4">
            <div className="flex justify-end">
              <RefreshBtn onRefresh={() => doRefresh('status', onRefreshStatus)} refreshed={refreshedTab === 'status'} />
            </div>

            {/* ── 내 프로필 카드 ── */}
            {(() => {
              const me = profiles.find(p => p.id === currentUserId);
              if (!me) return null;
              const posLabel = getPositionLabel(me.personality_score ?? 50);
              const posColor = getPositionBg(me.personality_score ?? 50);
              const domLabel = getDomSubLabel(me.dom_sub_score ?? null);
              const domColor = getDomSubBg(me.dom_sub_score ?? null);
              const tableLetter = currentUserSeat ? String.fromCharCode(64 + currentUserSeat.table_number) : null;
              const bioTags = me.bio ? me.bio.split(',').map(t => t.trim()).filter(Boolean) : [];
              return (
                <div className={`rounded-3xl p-5 border shadow-xl transition-colors duration-300 ${darkMode ? 'bg-gradient-to-br from-slate-800 to-slate-900 border-slate-600' : 'bg-white border-gray-100'}`}>
                  <p className={`text-[10px] font-black uppercase tracking-widest mb-3 ${darkMode ? 'text-slate-300' : 'text-gray-400'}`}>내 프로필</p>
                  <div className="flex gap-4">
                    {/* 프로필 사진 + 업로드 + QR */}
                    <div className="flex-shrink-0">
                      <div className="relative w-24 h-24">
                        <label className={`block w-full h-full rounded-2xl overflow-hidden border-2 border-cyan-500/50 shadow-lg shadow-cyan-500/20 cursor-pointer group ${photoUploading ? 'cursor-wait' : ''}`}>
                          <img src={me.photo_url} alt={me.nickname} className="w-full h-full object-cover" />
                          {/* 호버/업로드 오버레이 */}
                          <div className={`absolute inset-0 flex flex-col items-center justify-center rounded-2xl transition-all ${photoUploading ? 'bg-black/60' : 'bg-black/0 group-hover:bg-black/50'}`}>
                            {photoUploading ? (
                              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <div className="opacity-0 group-hover:opacity-100 flex flex-col items-center gap-0.5 transition-opacity">
                                <Camera className="w-5 h-5 text-white drop-shadow" />
                                <span className="text-[10px] font-black text-white drop-shadow">사진 변경</span>
                              </div>
                            )}
                          </div>
                          <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={photoUploading} />
                        </label>
                        {/* 카메라 뱃지 */}
                        {!photoUploading && (
                          <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-cyan-500 border-2 border-slate-900 flex items-center justify-center pointer-events-none shadow">
                            <Camera className="w-3 h-3 text-white" />
                          </span>
                        )}
                      </div>
                      {currentUserSeat && (
                        <div className="mt-2 text-center">
                          <span className="text-[10px] font-black text-amber-400">{currentUserSeat.table_number}번 {tableLetter}테이블</span>
                        </div>
                      )}
                      <button
                        onClick={onShowQr}
                        className={`mt-2 w-20 flex items-center justify-center gap-1 py-1.5 rounded-xl text-[10px] font-bold transition-all ${darkMode ? 'bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/25' : 'bg-cyan-50 border border-cyan-200 text-cyan-600 hover:bg-cyan-100'}`}
                      >
                        <QrCode className="w-3 h-3" />
                        <span>QR 보기</span>
                      </button>
                    </div>
                    {/* 텍스트 정보 */}
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-lg font-black leading-none ${darkMode ? 'text-white' : 'text-gray-900'}`}>{me.nickname}</span>
                        {me.mbti && (
                          <span className="px-2 py-0.5 bg-teal-500/20 border border-teal-500/40 text-teal-300 text-xs font-bold rounded-lg">{me.mbti}</span>
                        )}
                      </div>
                      {/* 성향 배지들 */}
                      <div className="flex flex-wrap gap-1.5">
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold text-white border border-white/20" style={{ backgroundColor: posColor + '33', borderColor: posColor + '66', color: posColor }}>{posLabel}</span>
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold border" style={{ backgroundColor: domColor + '22', borderColor: domColor + '55', color: domColor }}>{domLabel}</span>
                      </div>
                      {/* 관심사 태그 */}
                      {bioTags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {bioTags.map(tag => (
                            <span key={tag} className="px-2 py-0.5 bg-teal-500/15 border border-teal-500/30 text-teal-300 text-[11px] font-semibold rounded-md">#{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {/* 성향 바 */}
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className={`text-[10px] font-bold ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>포지션</span>
                        <span className="text-[10px] font-bold" style={{ color: posColor }}>{(me.personality_score ?? 50) < 0 ? '비선호' : `${me.personality_score ?? 50}점`}</span>
                      </div>
                      <div className={`h-1.5 rounded-full overflow-hidden ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, me.personality_score ?? 50)}%`, backgroundColor: posColor }} />
                      </div>
                      <div className={`flex justify-between text-[9px] mt-0.5 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>
                        <span>바텀</span><span>탑</span>
                      </div>
                    </div>
                    {me.dom_sub_score !== null && (
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <span className={`text-[10px] font-bold ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>돔/섭</span>
                          <span className="text-[10px] font-bold" style={{ color: domColor }}>{me.dom_sub_score}점</span>
                        </div>
                        <div className={`h-1.5 rounded-full overflow-hidden ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${me.dom_sub_score}%`, backgroundColor: domColor }} />
                        </div>
                        <div className={`flex justify-between text-[9px] mt-0.5 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>
                          <span>섭</span><span>돔</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
            {/* ── 오늘의 운세 미니카드 ── */}
            {(() => {
              const me = profiles.find(p => p.id === currentUserId);
              const hasBd = !!(me?.birth_year && me?.birth_month && me?.birth_day);
              return (
                <button
                  onClick={() => onTabChange('fortune')}
                  className={`w-full rounded-2xl p-4 border text-left transition-all active:scale-98 ${darkMode ? 'bg-gradient-to-r from-purple-900/40 to-slate-800 border-purple-500/30 hover:border-purple-500/60' : 'bg-gradient-to-r from-purple-50 to-white border-purple-200 hover:border-purple-300'}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{hasBd ? getZodiac(me!.birth_year!).emoji : '🔮'}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-black uppercase tracking-widest ${darkMode ? 'text-purple-300' : 'text-purple-600'}`}>오늘의 운세</p>
                      {hasBd ? (
                        <p className={`text-sm font-semibold truncate ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                          {getZodiac(me!.birth_year!).name}띠 · {getOhaeng(me!.birth_year!)} · 타로·사주·궁합 보기 →
                        </p>
                      ) : (
                        <p className="text-amber-500 text-xs font-semibold">생년월일 미등록 — 운세 기능을 사용할 수 없어요 ⚠️</p>
                      )}
                    </div>
                    <span className={`text-lg ${darkMode ? 'text-purple-400' : 'text-purple-500'}`}>›</span>
                  </div>
                </button>
              );
            })()}

            {/* ── 생월·생일 설정 (내 상태 탭) — 접기/펼치기 ── */}
            {(() => {
              const me = profiles.find(p => p.id === currentUserId);
              if (!me) return null;
              const hasBd = !!(me.birth_month && me.birth_day);
              return (
                <div className={`rounded-2xl border transition-colors duration-300 ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-gradient-to-br from-purple-50 to-white border-purple-200'}`}>
                  <button onClick={() => setShowBirthEdit(v => !v)} className="w-full flex items-center gap-2 p-4 text-left">
                    <span className="text-xl flex-shrink-0">🔮</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>생월·생일 설정</p>
                      <p className={`text-[11px] ${darkMode ? 'text-slate-400' : 'text-purple-600'}`}>사주·운세·궁합에 반영돼요</p>
                    </div>
                    {hasBd ? (
                      <span className="text-[10px] font-black px-2 py-0.5 bg-purple-500 text-white rounded-full flex-shrink-0">
                        {me.birth_month}월 {me.birth_day}일 ✓
                      </span>
                    ) : (
                      <span className={`text-[10px] font-bold flex-shrink-0 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>미설정</span>
                    )}
                    <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${showBirthEdit ? 'rotate-180' : ''} ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
                  </button>
                  {showBirthEdit && (
                    <div className="px-4 pb-4">
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

            {/* ── 연락처 설정 — 접기/펼치기 ── */}
            <div className={`rounded-2xl border transition-colors duration-300 ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-100'}`}>
              <button onClick={() => setShowContactEdit(v => !v)} className="w-full flex items-center gap-2 p-4 text-left">
                <span className="text-xl flex-shrink-0">📋</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>연락처 설정</p>
                  {(statusKakao || statusInstagram || statusPhone) ? (
                    <p className={`text-[11px] truncate ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                      {[statusKakao && `K: ${statusKakao}`, statusInstagram && `@${statusInstagram}`, statusPhone && `📞 ${statusPhone}`].filter(Boolean).join(' · ')}
                    </p>
                  ) : (
                    <p className={`text-[11px] ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>미설정</p>
                  )}
                </div>
                {statusContactPrivate && (
                  <span className="text-[9px] font-black px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full flex-shrink-0">비공개</span>
                )}
                <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${showContactEdit ? 'rotate-180' : ''} ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
              </button>
              {showContactEdit && (
                <div className="px-4 pb-4">
                  {/* 안내 */}
                  <div className={`rounded-xl p-3 mb-3 flex items-start gap-2 ${darkMode ? 'bg-amber-900/30 border border-amber-600/40' : 'bg-amber-50 border border-amber-300'}`}>
                    <span className="text-amber-500 text-sm mt-0.5 flex-shrink-0">⚠️</span>
                    <p className={`text-[11px] leading-relaxed ${darkMode ? 'text-amber-400' : 'text-amber-700'}`}>
                      연락처는 상대방이 <span className="font-bold">연락처 공유를 수락했을 때만</span> 전달됩니다.
                    </p>
                  </div>
                  {/* 비공개 토글 */}
                  <label className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer mb-3 select-none border ${statusContactPrivate ? (darkMode ? 'bg-red-900/30 border-red-700' : 'bg-red-50 border-red-200') : (darkMode ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-200')}`}>
                    <div
                      onClick={() => setStatusContactPrivate(v => !v)}
                      className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${statusContactPrivate ? 'bg-red-500' : 'bg-gray-300'}`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${statusContactPrivate ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </div>
                    <div>
                      <p className={`text-xs font-bold ${statusContactPrivate ? (darkMode ? 'text-red-400' : 'text-red-600') : (darkMode ? 'text-slate-300' : 'text-gray-700')}`}>연락처 비공개</p>
                      {statusContactPrivate && <p className={`text-[10px] ${darkMode ? 'text-red-500' : 'text-red-500'}`}>매칭 상대에게 연락처가 전달되지 않습니다</p>}
                    </div>
                  </label>
                  {/* 입력 필드들 */}
                  <div className={`space-y-2 transition-opacity ${statusContactPrivate ? 'opacity-40 pointer-events-none' : ''}`}>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center text-[11px] font-black text-white bg-yellow-400">K</div>
                      <input value={statusKakao} onChange={e => setStatusKakao(e.target.value)} placeholder="카카오톡 ID"
                        className={`w-full pl-10 pr-3 py-2.5 rounded-xl border-2 text-sm focus:outline-none transition-colors ${darkMode ? 'bg-slate-700 border-slate-500 text-white placeholder-slate-500 focus:border-yellow-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-yellow-400'}`} />
                    </div>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center text-[11px] font-black text-white bg-gradient-to-br from-pink-500 to-orange-400">@</div>
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

            <div className="contents">
            <div className={`rounded-2xl shadow-sm p-5 transition-colors duration-300 ${darkMode ? 'bg-slate-800 border border-slate-600' : 'bg-white'}`}>
              <h3 className={`text-sm font-bold uppercase tracking-wider mb-4 ${darkMode ? 'text-slate-200' : 'text-gray-500'}`}>하트 사용 현황</h3>
              <div className="space-y-3">
                {HEART_TYPES.map(h => {
                  const used = heartCount(h.type);
                  return (
                    <div key={h.type} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{h.emoji}</span>
                        <div>
                          <p className={`text-xs font-bold ${h.text}`}>{h.label}</p>
                          <p className={`text-[10px] ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>{h.desc}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {[0, 1].map(i => (
                          <Heart key={i} className={`w-5 h-5 ${i < (2 - used) ? h.fillText : darkMode ? 'fill-slate-600 text-slate-600' : 'fill-gray-200 text-gray-200'}`} />
                        ))}
                        <span className={`text-xs font-bold ml-1 ${darkMode ? 'text-slate-200' : 'text-gray-400'}`}>{2-used}/2</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 받은 하트 */}
            <div className={`rounded-2xl shadow-sm p-5 transition-colors duration-300 ${darkMode ? 'bg-slate-800 border border-slate-600' : 'bg-white'}`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-sm font-bold uppercase tracking-wider ${darkMode ? 'text-slate-200' : 'text-gray-500'}`}>받은 하트</h3>
                {pendingHeartsCount > 0 && (
                  <span className="px-2 py-0.5 bg-rose-100 text-rose-600 text-xs font-bold rounded-full">
                    {pendingHeartsCount}개 미응답
                  </span>
                )}
              </div>
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
                              onClick={() => onHeartResponse(liker.id, 'accepted')}
                              className={`w-full py-2 mt-2.5 text-xs font-bold text-white rounded-xl transition-all ${hm.solidBg} ${hm.solidHover}`}
                            >확인</button>
                          )
                        ) : (
                          !shared && (
                            <div className="flex gap-2 mt-2.5">
                              <button
                                onClick={() => onHeartResponse(liker.id, 'rejected')}
                                className="flex-1 py-2 text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl transition-all"
                              >거절</button>
                              <button
                                onClick={() => onHeartResponse(liker.id, 'accepted')}
                                className={`flex-2 flex-grow py-2 text-xs font-bold text-white rounded-xl transition-all ${hm.solidBg} ${hm.solidHover}`}
                              >수락 + 연락처 공유</button>
                            </div>
                          )
                        )}
                      </div>
                    );
                  })}
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
            <div className={`rounded-2xl shadow-sm p-5 transition-colors duration-300 ${darkMode ? 'bg-slate-800 border border-slate-600' : 'bg-white'}`}>
              <h3 className={`text-sm font-bold uppercase tracking-wider mb-4 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>보낸 하트</h3>
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
                                <button onClick={() => navigator.clipboard.writeText(share.kakao!)} className="text-[10px] text-gray-400 hover:text-teal-600 transition-all">복사</button>
                              </div>
                            )}
                            {share.instagram && (
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-lg bg-gradient-to-br from-pink-500 to-orange-400 text-white flex items-center justify-center text-[10px] font-black flex-shrink-0">@</span>
                                <span className="text-xs font-bold text-gray-800 flex-1">@{share.instagram}</span>
                                <button onClick={() => navigator.clipboard.writeText(share.instagram!)} className="text-[10px] text-gray-400 hover:text-teal-600 transition-all">복사</button>
                              </div>
                            )}
                            {share.phone && (
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-lg bg-green-500 text-white flex items-center justify-center text-[10px] font-black flex-shrink-0">#</span>
                                <span className="text-xs font-bold text-gray-800 flex-1">{share.phone}</span>
                                <button onClick={() => navigator.clipboard.writeText(share.phone!)} className="text-[10px] text-gray-400 hover:text-teal-600 transition-all">복사</button>
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
            </div>
          </div>
          </StatusErrorBoundary>
        )}

        {/* ─── 채팅 탭 ─── */}
        {mainTab === 'chats' && (
          <div className="max-w-lg mx-auto space-y-3">
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
            {/* 검색 결과 */}
            {chatSearch.trim() && (() => {
              const results = profiles.filter(p => p.id !== currentUserId && (
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
                        onClick={() => { onOpenChat(p); setChatSearch(''); }}
                        className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${darkMode ? 'bg-slate-800 hover:bg-slate-700 border border-slate-700' : 'bg-white hover:bg-gray-50 border border-gray-100'}`}>
                        <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 bg-gray-100">
                          <img src={p.photo_url} alt={p.nickname} className="w-full h-full object-cover" />
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
                return (
                  <div key={chat.id}
                    onClick={() => otherProfile && onOpenChat(otherProfile)}
                    className={`rounded-2xl shadow-sm p-4 flex items-center gap-3 cursor-pointer transition-colors duration-300 active:scale-[0.98] ${darkMode ? 'bg-slate-800 border border-slate-600 hover:bg-slate-700' : 'bg-white hover:bg-gray-50'}`}>
                    <div className="relative w-12 h-12 rounded-full overflow-hidden flex-shrink-0">
                      {otherProfile ? (
                        <img src={otherProfile.photo_url} alt={otherProfile.nickname} className="w-full h-full object-cover" />
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
                      {unreadChatCounts[chat.id] > 0 && (
                        <span className="min-w-[22px] h-[22px] px-1.5 bg-rose-500 text-white text-[11px] font-black rounded-full flex items-center justify-center shadow-sm">
                          {unreadChatCounts[chat.id] > 99 ? '99+' : unreadChatCounts[chat.id]}
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
          </div>
        )}

        {/* ─── 게임 탭 ─── */}
        {mainTab === 'game' && (
            <UserGameTab
              currentUserId={currentUserId}
              tableNumber={tableNumber}
              currentUserNickname={currentUserNickname}
              balanceGames={balanceGames}
              voteCounts={voteCounts}
              myVotes={myVotes}
              seats={seats}
              profileMap={profileMap}
              onVote={onVote}
              onCreateGame={onCreateGame}
              onEndGame={onEndGame}
              onBroadcastGame={tableNumber !== null ? onBroadcastGame : undefined}
            />
        )}

        {/* ─── 건의함 탭 (익명 건의함) ─── */}
        {mainTab === 'suggestions' && (
          <div className="max-w-lg mx-auto space-y-4">
            <div className={`rounded-2xl shadow-sm p-5 transition-colors duration-300 ${darkMode ? 'bg-slate-800 border border-slate-600' : 'bg-white'}`}>
              <h3 className={`text-base font-black mb-1 ${darkMode ? 'text-white' : 'text-gray-800'}`}>익명 건의함</h3>
              <p className={`text-xs mb-4 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>
                익명으로 전송되며, 관리자에게 어느 테이블에서 보냈는지 함께 전달됩니다.
                {tableNumber && <span className="ml-1 font-bold text-teal-600">({tableNumber}번 테이블)</span>}
              </p>

              {reportSent ? (
                <div className="flex flex-col items-center gap-3 py-4">
                  <div className="w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center">
                    <CheckCircle className="w-6 h-6 text-teal-500" />
                  </div>
                  <p className="text-sm font-bold text-teal-700">이미 전달됐습니다!</p>
                  <p className="text-xs text-gray-400 text-center">관리자에게 내용이 전달되었습니다.<br/>추가 건의가 필요하시면 아래 버튼을 눌러주세요.</p>
                  <button onClick={() => setReportSent(false)}
                    className="px-4 py-2 text-xs font-bold text-gray-500 border border-gray-200 rounded-xl hover:border-gray-400 hover:text-gray-700 transition-all">
                    다시 보내기
                  </button>
                </div>
              ) : (
                <>
                  {/* 음료 종류 선택 picker */}
                  {drinkPicker && DRINK_OPTIONS[drinkPicker] && (
                    <div className="mb-4 p-4 bg-cyan-50 border border-cyan-200 rounded-2xl">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-black text-cyan-700">{DRINK_OPTIONS[drinkPicker].label}</p>
                        <button onClick={() => setDrinkPicker(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {DRINK_OPTIONS[drinkPicker].choices.map(c => (
                          <button key={c} onClick={() => sendReport(`${drinkPicker} 주세요 (${c})`)}
                            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-bold rounded-xl transition-all active:scale-95">
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Quick buttons */}
                  {!drinkPicker && (
                    <>
                      {/* 음료 버튼 */}
                      <div className="flex flex-wrap gap-2 mb-3">
                        {(['맥주', '소주', '음료수'] as const).map(d => (
                          <button key={d} onClick={() => setDrinkPicker(d)}
                            className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-bold rounded-xl border border-amber-200 hover:border-amber-400 transition-all active:scale-95">
                            {d} 주세요 🍺
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2 mb-4">
                        {QUICK_REPORTS.map((r) => (
                          <button key={r.text} onClick={() => sendReport(r.text)}
                            className="px-3 py-2 bg-gray-50 hover:bg-cyan-50 text-gray-700 hover:text-cyan-700 text-xs font-semibold rounded-xl border border-gray-200 hover:border-cyan-300 transition-all active:scale-95">
                            {r.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Custom message */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={reportText}
                      onChange={e => setReportText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && reportText.trim()) sendReport(reportText); }}
                      placeholder="직접 입력..."
                      maxLength={100}
                      className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
                    />
                    <button
                      disabled={!reportText.trim()}
                      onClick={() => sendReport(reportText)}
                      className="px-4 py-2.5 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-40 text-white font-bold rounded-xl transition-all text-sm"
                    >전송</button>
                  </div>
                </>
              )}
            </div>

            {/* 공식 건의사항 (스타벅스 이벤트) */}
            <details className="group">
              <summary className="list-none flex items-center gap-2 cursor-pointer py-2">
                <ChevronDown className="w-4 h-4 text-amber-500 transition-transform group-open:rotate-180" />
                <span className="text-sm font-bold text-amber-600">공식 건의사항 (채택 시 스타벅스 ☕)</span>
              </summary>
              <div className={`rounded-2xl shadow-sm p-5 mt-2 space-y-3 transition-colors duration-300 ${darkMode ? 'bg-slate-800 border border-slate-600' : 'bg-white'}`}>
                <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-xl border border-amber-200">
                  채택된 분께는 <span className="font-black">스타벅스 아이스 아메리카노</span>가 지급됩니다!
                </p>
                <textarea value={suggestionContent} onChange={e => setSuggestionContent(e.target.value)}
                  placeholder="앱 개선 건의사항을 작성해주세요..." maxLength={500}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-300 min-h-[80px]" />
                <div>
                  <input type="text" value={suggestionContact} onChange={e => setSuggestionContact(e.target.value)}
                    placeholder="연락처 (채택 시 선물 발송용)"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  <p className="text-[11px] text-red-500 mt-1">※ 본인 연락처가 아닐 경우 지급이 제한될 수 있습니다.</p>
                </div>
                <button disabled={!suggestionContent.trim() || suggestionSubmitting}
                  onClick={async () => { setSuggestionSubmitting(true); await onSubmitSuggestion(suggestionContent, suggestionContact); setSuggestionContent(''); setSuggestionContact(''); setSuggestionSubmitting(false); }}
                  className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold rounded-xl disabled:opacity-40 transition-all">
                  {suggestionSubmitting ? '제출 중...' : '건의사항 제출'}
                </button>
                {suggestions.length > 0 && (
                  <div className="space-y-2 pt-2">
                    {suggestions.map(s => (
                      <div key={s.id} className="p-3 bg-gray-50 rounded-xl space-y-1">
                        <div className="flex items-start gap-2">
                          <p className="text-sm text-gray-700 flex-1">{s.content}</p>
                          <span className={`flex-shrink-0 px-2 py-0.5 text-[10px] font-bold rounded-full ${
                            s.status === 'accepted' ? 'bg-teal-100 text-teal-700' : s.status === 'rejected' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'
                          }`}>{s.status === 'accepted' ? '채택' : s.status === 'rejected' ? '미채택' : '검토 중'}</span>
                        </div>
                        {s.admin_reason && (
                          <p className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">관리자: {s.admin_reason}</p>
                        )}
                        {s.admin_response && (
                          <p className="text-xs text-teal-700 bg-teal-50 border border-teal-200 px-2 py-1.5 rounded-lg font-medium">💬 답변: {s.admin_response}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </details>
          </div>
        )}

        {/* ─── 통계 탭 ─── */}
        {mainTab === 'stats' && (
            <StatsTab profiles={profiles} seats={seats} darkMode={darkMode} />
        )}

        {/* ─── 랭킹 탭 ─── */}
        {mainTab === 'ranking' && (
            <RankingTab seats={seats} darkMode={darkMode} profiles={profiles} />
        )}

        {/* ─── 운세 탭 (게임·운세 하위) ─── */}
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
              />
            </Suspense>
          </div>
        )}

      </main>
    </div>
  );
}
