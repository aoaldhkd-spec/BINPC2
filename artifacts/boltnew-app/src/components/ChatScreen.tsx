import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  ArrowLeft, Send, MessageCircle, Smile, ImageIcon, Phone,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';
import { genAvatar } from '../lib/profile';
import { getCompatibility, getOhaengCompat, getNumerologyCompat, getMbtiCompat, getTodayFortune } from '../lib/fortune';
import { hasBannedWord } from '../lib/utils';
import type { Message, Profile, ContactShare } from '../types/app';
import { computeMyUnreadIds } from '../lib/chat-reducers';
import {
  LONG_PRESS_MS,
  MENU_CLICK_GUARD_MS,
  SWIPE_ACTIVATE_PX,
  clampSwipeOffset,
  shouldCancelLongPress,
  shouldCommitSwipeReply,
  shouldTreatAsHorizontalSwipe,
} from '../lib/chat-msg-gestures';
import { SIGNAL_FIRST_CHIPS } from '../lib/signal-match';
import { diag } from '../lib/diag';
import {
  QUICK_REACTIONS,
  THEME_CYCLE,
  THEME_EMOJI,
} from '../lib/chat-picker-data';
import {
  buildMessageMetaMap,
  collectInfoResponseTypes,
  isContactCard,
  isInfoAck,
  isInfoDecline,
} from '../lib/chat-message-format';
import ChatCompatModal from './ChatCompatModal';
import ChatEmojiPanel from './ChatEmojiPanel';
import ChatMessageRow from './ChatMessageRow';
import ChatQuickMsgsPanel from './ChatQuickMsgsPanel';
import ChatSajuModal from './ChatSajuModal';
import ChatStickerPanel from './ChatStickerPanel';
import { NavLayer } from '../hooks/useParticipantNav';
import {
  BIRTH_MD_EDIT_MAX,
  birthMdEditsRemaining,
  birthMdWouldChange,
  isBirthMdEditLocked,
  nextBirthMdEditCount,
} from '../lib/birth-md-edit';

// ─── ChatScreen ───────────────────────────────────────────────────────────────
// 1:1 채팅 화면. 스티커·이모지·이미지·연락처 공유·궁합·사주 기능 포함.

// ── 채팅방별 스크롤 위치 캐시 ────────────────────────────────────────────────
// 뒤로가기 후 재진입 시 마지막 스크롤 위치를 복원한다.
// React ref가 아닌 모듈 스코프 Map을 사용하므로 컴포넌트 언마운트 이후에도 유지된다.
const _scrollPositionCache = new Map<string, number>();

function ChatScreen({ chatId, messages, currentUserId, otherProfile, onSend, onSendImage, onBack, onDeleteMessage, currentUserProfile, receivedContactShares, contactSharedWithIds, onGoToTab, onUpdateProfile, initialInput, onInputChange, showSignalOpeners }: {
  chatId: string;
  messages: Message[]; currentUserId: string; otherProfile: Profile;
  onSend: (content: string) => Promise<void> | void;
  onSendImage: (file: File) => Promise<string | null>;
  onBack: () => void;
  onDeleteMessage: (msgId: string) => void;
  currentUserProfile: Profile | null;
  receivedContactShares?: ContactShare[];
  contactSharedWithIds?: Set<string>;
  onGoToTab?: (tab: string) => void;
  onUpdateProfile?: (update: Partial<Profile> & { id: string }) => void;
  /** 뒤로가기 후 다시 열 때 초안 복원용 */
  initialInput?: string;
  /** 부모가 초안을 보존하도록 변경 시 호출 */
  onInputChange?: (v: string) => void;
  /** 서로 하트 첫 1:1 — 칩은 입력만 채움 (자동 전송 없음) */
  showSignalOpeners?: boolean;
}) {
  const { theme, setTheme } = useTheme();
  const handleCycleTheme = () => {
    const idx = THEME_CYCLE.indexOf(theme);
    setTheme(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]);
  };

  // initialInput은 마운트 시 한 번만 적용 — lazy initializer로 처리
  const [input, setInput] = useState(() => initialInput ?? '');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [emojiCat, setEmojiCat] = useState<string>('face');
  const [stickerCat, setStickerCat] = useState(0);
  const [showQuickMsgs, setShowQuickMsgs] = useState(false);
  const [showInfoReqMenu, setShowInfoReqMenu] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [chatError, setChatError] = useState('');
  const [showTheirContact, setShowTheirContact] = useState(false);
  const [showCompatModal, setShowCompatModal] = useState(false);
  const [showSajuModal, setShowSajuModal] = useState(false);
  const [activeCompatMethod, setActiveCompatMethod] = useState<'saju' | 'numerology' | 'ohaeng' | 'mbti'>('saju');

  const theirShare = receivedContactShares?.find(s => s.liker_id === otherProfile.id) ?? null;
  const iSharedMine = contactSharedWithIds?.has(otherProfile.id) ?? false;

  // 생년월일 원시값 추출 — useMemo deps에 사용 (Object 참조 불안정 방지)
  const myBY = currentUserProfile?.birth_year ?? 0;
  const myBM = currentUserProfile?.birth_month ?? 0;
  const myBD = currentUserProfile?.birth_day ?? 0;
  const birthMdLocked = isBirthMdEditLocked(currentUserProfile ?? undefined);
  const birthMdRemaining = birthMdEditsRemaining(currentUserProfile ?? undefined);
  const thBY = otherProfile.birth_year ?? 0;
  const thBM = otherProfile.birth_month ?? 0;
  const thBD = otherProfile.birth_day ?? 0;

  const myBirth = (myBY && myBM && myBD) ? { y: myBY, m: myBM, d: myBD } : null;
  const theirBirth = (thBY && thBM && thBD) ? { y: thBY, m: thBM, d: thBD } : null;
  const hasBothBirthdays = !!(myBirth && theirBirth);

  // 궁합·사주·운세 계산 — 생년월일·MBTI 변경 시에만 재계산 (렌더마다 반복 차단)
  const compatResult = useMemo(() =>
    hasBothBirthdays ? getCompatibility(myBY, myBM, myBD, thBY, thBM, thBD) : null,
  [hasBothBirthdays, myBY, myBM, myBD, thBY, thBM, thBD]);

  const ohaengCompatResult = useMemo(() =>
    hasBothBirthdays ? getOhaengCompat(myBY, thBY) : null,
  [hasBothBirthdays, myBY, thBY]);

  const numerologyResult = useMemo(() =>
    hasBothBirthdays ? getNumerologyCompat(myBY, myBM, myBD, thBY, thBM, thBD) : null,
  [hasBothBirthdays, myBY, myBM, myBD, thBY, thBM, thBD]);

  const mbtiResult = useMemo(() => {
    const myMbti = currentUserProfile?.mbti;
    const theirMbti = otherProfile.mbti;
    return (myMbti && theirMbti) ? getMbtiCompat(myMbti, theirMbti) : null;
  }, [currentUserProfile?.mbti, otherProfile.mbti]);

  const myFortune = useMemo(() =>
    (myBY && myBM && myBD) ? getTodayFortune(myBY, myBM, myBD) : null,
  [myBY, myBM, myBD]);

  const theirFortune = useMemo(() =>
    (thBY && thBM && thBD) ? getTodayFortune(thBY, thBM, thBD) : null,
  [thBY, thBM, thBD]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLElement>(null); // 스크롤 컨테이너 ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // unmount 시 취소용
  const [showMoreBtns, setShowMoreBtns] = useState(false);
  // containerRef 제거 — vpStyle(React state)로 교체됨

  const initialMsgIds = useRef(new Set(messages.map(m => m.id)));
  const openedAtRef = useRef(Date.now());
  const messagesRef = useRef(messages); // 항상 최신 messages를 가리키는 ref
  messagesRef.current = messages;
  const lastRenderedMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || lastRenderedMessageIdRef.current === last.id) return;
    lastRenderedMessageIdRef.current = last.id;
    diag('debug', 'chat', 'render', {
      corr: last.id,
      data: {
        messageId: last.id,
        roomId: chatId,
        createdAt: last.created_at,
        count: messages.length,
      },
    });
  }, [chatId, messages]);
  const partnerIdRef = useRef(otherProfile?.id);
  partnerIdRef.current = otherProfile?.id;
  const [myUnreadIds, setMyUnreadIds] = useState<Set<string>>(new Set());
  // undefined = 상대 read_at 미조회. null = 조회됨·기록 없음. string = 마지막 읽은 시각.
  const [partnerReadAt, setPartnerReadAt] = useState<string | null | undefined>(undefined);
  const partnerReadAtRef = useRef<string | null | undefined>(undefined);
  partnerReadAtRef.current = partnerReadAt;

  const applyPartnerReadToUi = useCallback((readerId: string | undefined, readAt: string | undefined) => {
    if (!readerId || readerId === currentUserId) return;
    if (partnerIdRef.current && readerId !== partnerIdRef.current) return;
    if (!readAt) return;
    setPartnerReadAt(prev => {
      if (prev === undefined || prev === null) return readAt;
      return readAt > prev ? readAt : prev;
    });
  }, [currentUserId]);

  // chatId 변경 시 채팅방별 로컬 상태를 전부 초기화한다.
  // 이전 방의 initialMsgIds·reactions·replyTo 등이 새 방에 잔류하면
  // "새 메시지" 마킹 오작동, 엉뚱한 답장 UI 잔존 등의 버그가 발생한다.
  useEffect(() => {
    openedAtRef.current = Date.now();
    initialMsgIds.current = new Set();
    setPartnerReadAt(undefined);
    setMyUnreadIds(new Set());
    setReplyTo(null);
    setContextMenu(null);
    setSwipeState(null);
    setReactions({});
    setImageViewer(null);
  }, [chatId]);

  const [contextMenu, setContextMenu] = useState<{ msgId: string; content: string; isMine: boolean; imgUrl?: string; x: number; y: number } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [replyTo, setReplyTo] = useState<{ id: string; snippet: string; isMe: boolean } | null>(null);

  // ── 내 정보 인라인 등록 ────────────────────────────────────────────────────────
  const [showMyInfoEdit, setShowMyInfoEdit] = useState(false);
  const [myInfoForm, setMyInfoForm] = useState({ birthMonth: '', birthDay: '', phone: '', kakao: '', instagram: '' });
  const [myInfoSaving, setMyInfoSaving] = useState(false);

  const [swipeState, setSwipeState] = useState<{ msgId: string; offsetX: number } | null>(null);
  const swipeTouchRef = useRef<{ msgId: string; startX: number; startY: number; swiping: boolean; offsetX: number } | null>(null);
  const lastTouchAt = useRef(0);
  const menuIgnoreClickUntil = useRef(0);
  const mouseGestureCleanup = useRef<(() => void) | null>(null);

  const [imageViewer, setImageViewer] = useState<string | null>(null);
  const [reactions, setReactions] = useState<Record<string, string>>({});

  // ── DiceBear 투명 SVG → genAvatar 강제 치환 ─────────────────────────────────
  // DiceBear URL은 200 OK 반환하므로 onerror 미발화. URL 내 'dicebear' 포함 여부로 판별.
  // backgroundColor 파라미터가 있는 URL(프리셋 아바타)은 배경이 있으므로 그대로 유지.
  const avatarSrc = (url: string | null | undefined, nick: string): string => {
    if (!url) return genAvatar(nick);
    if (url.includes('dicebear')) return genAvatar(nick);
    if (url.startsWith('data:image/svg')) return genAvatar(nick);
    return url;
  };

  // ── 뷰포트 스타일 (React state) — JS가 직접 style을 건드리면 React 재렌더 시 덮어씌워짐
  const [vpStyle, setVpStyle] = useState<React.CSSProperties>({ top: 0, height: '100dvh' });
  const lastTapRef = useRef<{ id: string; time: number } | null>(null);

  // ── 스크롤 자동 이동 ──────────────────────────────────────────────────────────
  // - 방 입장(초기 로드): instant — 긴 대화도 즉시 이동, 애니메이션 없음
  // - 내 메시지 전송: smooth — 항상 하단으로
  // - 상대방 메시지: 스크롤이 하단 근처(100px)일 때만 smooth 이동 (위 읽는 중 강제 이동 방지)
  const prevMsgCountRef = useRef(0);

  // ── 언마운트 시 스크롤 위치 저장 ──────────────────────────────────────────
  useEffect(() => {
    const el = messagesContainerRef.current; // 캡처: cleanup 시점의 stale ref 방지
    return () => {
      if (el) _scrollPositionCache.set(chatId, el.scrollTop);
    };
  }, [chatId]);

  useEffect(() => {
    const prev = prevMsgCountRef.current;
    const cur = messages.length;
    prevMsgCountRef.current = cur;
    if (cur === 0) return;

    const isInitialLoad = prev === 0 && cur > 1;
    if (isInitialLoad) {
      // 이전에 저장한 스크롤 위치가 있으면 복원 (뒤로가기 후 재진입 시)
      const cached = _scrollPositionCache.get(chatId);
      if (cached !== undefined && messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = cached;
        _scrollPositionCache.delete(chatId);
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
      }
      return;
    }

    const latestMsg = messages[cur - 1];
    const isMyMsg = latestMsg?.sender_id === currentUserId;

    if (isMyMsg) {
      // 내 메시지: 항상 smooth 이동
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      // 상대 메시지: 하단 근처일 때만 이동 (100px 여유)
      const el = messagesContainerRef.current;
      const nearBottom = !el || (el.scrollHeight - el.scrollTop - el.clientHeight < 100);
      if (nearBottom) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, currentUserId, chatId]);

  // ── visualViewport: iOS 키보드 올라올 때 컨테이너가 위로 밀리지 않도록 ─────────
  // JS로 el.style을 직접 건드리면 React 재렌더 시 style props가 덮어씌워 원복됨.
  // 해결: React state(vpStyle)로 관리 → 재렌더 시에도 최신 viewport 값 유지.
  //   top    = vv.offsetTop  (iOS가 레이아웃 뷰포트를 스크롤한 만큼 따라감)
  //   height = vv.height     (키보드를 제외한 시각적 뷰포트 높이)
  useEffect(() => {
    const vv = window.visualViewport;
    const apply = (top: number, height: number) => setVpStyle({ top, height });
    if (!vv) { apply(0, window.innerHeight); return; }
    const update = () => apply(vv.offsetTop, vv.height);
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); };
  }, []);

  // ── 채팅 중 전역 ThemeSwitcher FAB 숨김 ──────────────────────────────────────
  useEffect(() => {
    document.body.dataset.view = 'chat';
    return () => { delete document.body.dataset.view; };
  }, []);

  // ── 내 정보 등록 폼 동기화 ─────────────────────────────────────────────────────
  // currentUserProfile도 deps에 포함: 모달이 열려있는 동안 프로필이 변경되면 폼도 즉시 갱신
  useEffect(() => {
    if (showMyInfoEdit && currentUserProfile) {
      setMyInfoForm({
        birthMonth: currentUserProfile.birth_month ? String(currentUserProfile.birth_month) : '',
        birthDay:   currentUserProfile.birth_day   ? String(currentUserProfile.birth_day)   : '',
        phone:     currentUserProfile.phone_number  ?? '',
        kakao:     currentUserProfile.kakao_id      ?? '',
        instagram: currentUserProfile.instagram_id  ?? '',
      });
    }
  }, [showMyInfoEdit, currentUserProfile]);

  useEffect(() => {
    const next = computeMyUnreadIds(
      messages,
      currentUserId,
      partnerReadAt,
      openedAtRef.current,
    );
    setMyUnreadIds(prev => {
      if (prev.size === next.size && [...prev].every(id => next.has(id))) return prev;
      return next;
    });
  }, [messages, currentUserId, partnerReadAt]);

  // 방 입장 즉시 상대 read_at 조회 — 재입장 때도 '1'이 맞게 남거나 지워지게.
  useEffect(() => {
    if (!chatId || !otherProfile?.id) return;
    const partnerId = otherProfile.id;
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await supabase
          .from('chat_reads')
          .select('read_at, chat_id')
          .eq('reader_id', partnerId)
          .eq('chat_id', chatId);
        if (cancelled) return;
        const rows = Array.isArray(data) ? data : (data ? [data] : []);
        let best: string | undefined;
        for (const r of rows as { read_at?: string }[]) {
          if (r?.read_at && (!best || r.read_at > best)) best = r.read_at;
        }
        if (best) applyPartnerReadToUi(partnerId, best);
        else setPartnerReadAt(prev => (prev === undefined ? null : prev));
      } catch {
        if (!cancelled) setPartnerReadAt(prev => (prev === undefined ? null : prev));
      }
    })();
    return () => { cancelled = true; };
  }, [chatId, otherProfile?.id, applyPartnerReadToUi]);

  useEffect(() => {
    if (!chatId) return;
    const ch = supabase
      .channel(`chat_reads:${chatId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_reads' },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          try {
            const row = (payload as { new?: { reader_id?: string; read_at?: string; chat_id?: string } }).new;
            if (!row?.reader_id) return;
            // sibling 방 id 로 온 read_at 도 같은 1:1 쌍이면 반영
            applyPartnerReadToUi(row.reader_id, row.read_at);
          } catch (e) {
            console.warn('[chat_reads/sse]', e);
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [chatId, currentUserId, applyPartnerReadToUi]);

  // ── 읽음 폴링 폴백 ────────────────────────────────────────────────────────────
  // SSE 이벤트가 유실됐을 때를 대비해, "1"이 표시 중인 동안만 5초마다 chat_reads를
  // 직접 조회해 상대방이 이미 읽었는지 확인한다.
  useEffect(() => {
    if (!chatId || !otherProfile?.id || myUnreadIds.size === 0) return;
    const partnerId = otherProfile.id;
    const checkPartnerRead = async () => {
      try {
        const { data } = await supabase
          .from('chat_reads')
          .select('read_at, chat_id')
          .eq('reader_id', partnerId)
          .eq('chat_id', chatId);
        const rows = Array.isArray(data) ? data : (data ? [data] : []);
        let best: string | undefined;
        for (const r of rows as { read_at?: string }[]) {
          if (r?.read_at && (!best || r.read_at > best)) best = r.read_at;
        }
        if (best) applyPartnerReadToUi(partnerId, best);
        else if (partnerReadAtRef.current === undefined) setPartnerReadAt(null);
      } catch (_) { /* 네트워크 오류는 무시 */ }
    };
    checkPartnerRead();
    const interval = setInterval(checkPartnerRead, 5000);
    return () => clearInterval(interval);
  }, [chatId, otherProfile?.id, myUnreadIds.size, applyPartnerReadToUi]);

  // textarea 높이 자동 조절
  const autoResizeTextarea = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  const handleSend = async () => {
    if (!input.trim()) { setShowEmoji(false); return; }
    if (hasBannedWord(input.trim())) {
      setChatError('부적절한 표현이 포함되어 있어 전송할 수 없습니다.');
      return;
    }
    setChatError('');
    const text = replyTo ? `__reply__${replyTo.snippet}\n${input.trim()}` : input.trim();
    const savedInput = input; // ✅ 전송 실패 시 복원용으로 미리 저장
    setInput('');
    setReplyTo(null);
    setShowEmoji(false);
    // textarea 높이 초기화
    requestAnimationFrame(() => {
      if (inputRef.current) inputRef.current.style.height = 'auto';
    });
    try {
      await onSend(text);
      // 카톡처럼 전송 후에도 키보드 유지 — 연속 입력 편의
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch {
      // 전송 실패 시 입력창 원상복구 — 사용자가 다시 시도할 수 있도록
      setInput(savedInput);
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.style.height = 'auto';
          inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px';
          inputRef.current.focus();
        }
      });
    }
  };

  const handleEmojiClick = useCallback((emoji: string) => { setInput((prev) => prev + emoji); inputRef.current?.focus(); }, []);

  // 추출된 패널·모달에 넘기는 콜백은 useCallback으로 고정 — 인라인이었을 때와 동일한 동작 유지
  const handleSendSticker = useCallback((idx: number) => { onSend(`__sticker__${idx}`); setShowStickers(false); }, [onSend]);
  const handleSendQuickMsg = useCallback((qm: string) => { onSend(qm); setShowQuickMsgs(false); }, [onSend]);
  const closeSajuModal = useCallback(() => setShowSajuModal(false), []);
  const closeCompatModal = useCallback(() => setShowCompatModal(false), []);
  const goRegisterBirthFromSaju = useCallback(() => { setShowSajuModal(false); onGoToTab?.('fortune'); }, [onGoToTab]);
  const goRegisterBirthFromCompat = useCallback(() => { setShowCompatModal(false); onGoToTab?.('fortune'); }, [onGoToTab]);

  // ── 내 정보 저장 ──────────────────────────────────────────────────────────────
  const handleSaveMyInfo = async () => {
    if (!currentUserProfile) return;
    const update: Record<string, unknown> = { id: currentUserProfile.id };
    const bm = parseInt(myInfoForm.birthMonth);
    const bd = parseInt(myInfoForm.birthDay);
    // 월별 최대 일수 cross-validation (2월 30일 같은 불가능한 날짜 방지)
    const maxDayForMonth = (m: number) => new Date(2000, m, 0).getDate();
    let nextMonth: number | null = null;
    let nextDay: number | null = null;
    if (!isNaN(bm) && bm >= 1 && bm <= 12) {
      nextMonth = bm;
      update.birth_month = bm;
      if (!isNaN(bd) && bd >= 1 && bd <= maxDayForMonth(bm)) {
        nextDay = bd;
        update.birth_day = bd;
      }
    } else if (!isNaN(bd) && bd >= 1 && bd <= 31) {
      nextDay = bd;
      update.birth_day = bd; // 월 없이 일만 수정하는 경우
    }
    const touchesBirthMd = 'birth_month' in update || 'birth_day' in update;
    if (touchesBirthMd) {
      const wouldChange = birthMdWouldChange(currentUserProfile, nextMonth, nextDay);
      if (wouldChange && isBirthMdEditLocked(currentUserProfile)) {
        setChatError(`생월·생일은 ${BIRTH_MD_EDIT_MAX}회까지만 변경할 수 있어요.`);
        return;
      }
      if (wouldChange) {
        update.birth_md_edit_count = nextBirthMdEditCount(currentUserProfile, nextMonth, nextDay);
      }
    }
    const phone = myInfoForm.phone.trim();
    const kakao = myInfoForm.kakao.trim();
    const insta = myInfoForm.instagram.trim();
    if (phone) update.phone_number  = phone;
    if (kakao) update.kakao_id      = kakao;
    if (insta) update.instagram_id  = insta;
    setMyInfoSaving(true);
    try {
      const { id: _id, ...patch } = update;
      const { error } = await supabase.from('profiles').update(patch).eq('id', currentUserProfile.id);
      if (error) {
        if (error.code === 'BIRTH_MD_LIMIT') {
          setChatError(`생월·생일은 ${BIRTH_MD_EDIT_MAX}회까지만 변경할 수 있어요.`);
        } else {
          setChatError('정보 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.');
        }
        return; // 저장 실패 시 편집창 유지 — 변경사항 손실 방지
      }
      onUpdateProfile?.(update as Partial<Profile> & { id: string });
      setShowMyInfoEdit(false);
      setShowInfoReqMenu(false);
    } finally {
      setMyInfoSaving(false);
    }
  };

  const handleSendInfoReq = (type: 'birthday' | 'phone') => {
    onSend(`__inforeq__:${type}`);
    setShowInfoReqMenu(false);
  };
  const handleAcceptInfoReq = (type: 'birthday' | 'phone') => {
    let value = '정보 없음';
    if (type === 'birthday') {
      const p = currentUserProfile;
      if (p?.birth_month && p?.birth_day) value = `${p.birth_month}월 ${p.birth_day}일`;
    } else {
      value = currentUserProfile?.phone_number ?? '정보 없음';
    }
    onSend(`__infoack__:${type}:${value}`);
  };
  const handleDeclineInfoReq = (type: 'birthday' | 'phone') => {
    onSend(`__infodecline__:${type}`);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setChatError('');
    try {
      const err = await onSendImage(file);
      if (err) setChatError(`사진 전송 실패: ${err}`);
    } catch (ex) {
      setChatError('사진 전송 중 오류가 발생했습니다. 다시 시도해 주세요.');
      console.error('[ChatScreen] handleFileChange error:', ex);
    } finally {
      // 예외가 발생해도 반드시 해제 — 영구 disabled 방지
      setUploading(false);
      e.target.value = '';
      setShowEmoji(false);
    }
  };

  // 언마운트 시 대기 중인 타이머 전부 취소 — unmount 후 setState 방지
  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      mouseGestureCleanup.current?.();
    };
  }, []);

  const cancelLP = () => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } };

  const openMsgMenu = useCallback((msg: Message, x: number, y: number, fromLongPress: boolean) => {
    if (fromLongPress) menuIgnoreClickUntil.current = Date.now() + MENU_CLICK_GUARD_MS;
    setContextMenu({
      msgId: msg.id,
      content: msg.content ?? '',
      isMine: msg.sender_id === currentUserId,
      imgUrl: msg.image_url ?? undefined,
      x,
      y,
    });
  }, [currentUserId]);

  const startMsgGesture = useCallback((msg: Message, x: number, y: number) => {
    swipeTouchRef.current = { msgId: msg.id, startX: x, startY: y, swiping: false, offsetX: 0 };
    cancelLP();
    longPressTimer.current = setTimeout(() => {
      if (!swipeTouchRef.current?.swiping) openMsgMenu(msg, x, y, true);
    }, LONG_PRESS_MS);
  }, [openMsgMenu]);

  const moveMsgGesture = useCallback((msg: Message, x: number, y: number) => {
    const ref = swipeTouchRef.current;
    if (!ref || ref.msgId !== msg.id) return;
    const dx = x - ref.startX;
    const dy = y - ref.startY;
    if (shouldCancelLongPress(dx, dy)) cancelLP();
    if (!shouldTreatAsHorizontalSwipe(dx, dy, ref.swiping)) return;
    if (ref.swiping || Math.abs(dx) > SWIPE_ACTIVATE_PX) {
      ref.swiping = true;
      ref.offsetX = clampSwipeOffset(dx);
      setSwipeState({ msgId: msg.id, offsetX: ref.offsetX });
    }
  }, []);

  const endMsgGesture = useCallback((msg: Message) => {
    cancelLP();
    const ref = swipeTouchRef.current;
    if (ref?.msgId === msg.id && shouldCommitSwipeReply(ref.swiping, ref.offsetX)) {
      const snippet = msg.image_url ? '[이미지]' : (msg.content ?? '').slice(0, 40);
      setReplyTo({ id: msg.id, snippet, isMe: msg.sender_id === currentUserId });
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      focusTimerRef.current = setTimeout(() => { focusTimerRef.current = null; inputRef.current?.focus(); }, 100);
    }
    swipeTouchRef.current = null;
    setSwipeState(null);
  }, [currentUserId]);

  // 메시지 핸들러를 useCallback으로 안정화 — messages 리스트 렌더 시 불필요한 자식 재렌더 방지
  const onMsgTouchStart = useCallback((e: React.TouchEvent, msg: Message) => {
    lastTouchAt.current = Date.now();
    if (!e.touches.length) return;
    const t = e.touches[0];
    startMsgGesture(msg, t.clientX, t.clientY);
  }, [startMsgGesture]);

  const onMsgTouchMove = useCallback((e: React.TouchEvent, msg: Message) => {
    if (!e.touches.length) return;
    const t = e.touches[0];
    moveMsgGesture(msg, t.clientX, t.clientY);
  }, [moveMsgGesture]);

  const onMsgTouchEnd = useCallback((_e: React.TouchEvent, msg: Message) => {
    lastTouchAt.current = Date.now();
    endMsgGesture(msg);
  }, [endMsgGesture]);

  const onMsgMouseDown = useCallback((e: React.MouseEvent, msg: Message) => {
    if (e.button !== 0) return;
    if (Date.now() - lastTouchAt.current < 800) return;
    startMsgGesture(msg, e.clientX, e.clientY);
    const onMove = (ev: MouseEvent) => moveMsgGesture(msg, ev.clientX, ev.clientY);
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      mouseGestureCleanup.current = null;
      endMsgGesture(msg);
    };
    mouseGestureCleanup.current?.();
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    mouseGestureCleanup.current = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [startMsgGesture, moveMsgGesture, endMsgGesture]);

  const handleMsgContextMenu = useCallback((e: React.MouseEvent, msg: Message) => {
    e.preventDefault();
    cancelLP();
    openMsgMenu(msg, e.clientX, e.clientY, false);
  }, [openMsgMenu]);

  const handleTap = useCallback((msg: Message) => {
    const now = Date.now();
    if (lastTapRef.current?.id === msg.id && now - lastTapRef.current.time < 350) {
      setReactions(prev => {
        const cur = prev[msg.id];
        if (cur === '❤️') { const n = { ...prev }; delete n[msg.id]; return n; }
        return { ...prev, [msg.id]: '❤️' };
      });
      lastTapRef.current = null;
    } else {
      lastTapRef.current = { id: msg.id, time: now };
    }
  }, []);

  const [showNoContactModal, setShowNoContactModal] = useState(false);
  const handleShareContact = () => {
    if (!currentUserProfile) return;
    const { kakao_id, instagram_id, phone_number } = currentUserProfile;
    if (!kakao_id && !instagram_id && !phone_number) {
      setShowNoContactModal(true);
      return;
    }
    const parts: string[] = [];
    if (kakao_id) parts.push(`카카오: ${kakao_id}`);
    if (instagram_id) parts.push(`인스타: @${instagram_id}`);
    if (phone_number) parts.push(`전화: ${phone_number}`);
    onSend(`__contact__\n${parts.join('\n')}`);
  };

  // ── O(n) infoReq 응답 집합 — map 내부 messages.some() O(n²) 차단 ─────────────
  const ackedReqTypes = useMemo(
    () => collectInfoResponseTypes(messages, isInfoAck),
    [messages],
  );
  const declinedReqTypes = useMemo(
    () => collectInfoResponseTypes(messages, isInfoDecline),
    [messages],
  );
  // 입력·스와이프 같은 로컬 상태가 바뀔 때 500개 메시지의 날짜/특수 포맷을
  // 매번 다시 파싱하지 않는다. 메시지 배열이 실제로 바뀔 때만 계산한다.
  const messageMeta = useMemo(() => buildMessageMetaMap(messages), [messages]);

  const hasContact = !!(currentUserProfile?.kakao_id || currentUserProfile?.instagram_id || currentUserProfile?.phone_number);

  return (
    <div
      className="fixed left-0 right-0 min-w-0 bg-gray-100 flex flex-col z-[9999]"
      style={{
        ...vpStyle,
        paddingTop: 'env(safe-area-inset-top)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      <NavLayer id="chat-my-info" open={showMyInfoEdit} onClose={() => setShowMyInfoEdit(false)} />
      <NavLayer id="chat-contact" open={showTheirContact} onClose={() => setShowTheirContact(false)} />
      <NavLayer id="chat-no-contact" open={showNoContactModal} onClose={() => setShowNoContactModal(false)} />
      <NavLayer id="chat-saju" open={showSajuModal} onClose={() => setShowSajuModal(false)} />
      <NavLayer id="chat-compat" open={showCompatModal} onClose={() => setShowCompatModal(false)} />
      <NavLayer id="chat-photo" open={!!imageViewer} onClose={() => setImageViewer(null)} />
      <NavLayer id="chat-context" open={!!contextMenu} onClose={() => setContextMenu(null)} />

      {/* 상대방 연락처 보기 모달 */}
      {showTheirContact && theirShare && (
        <div className="safe-overlay fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowTheirContact(false)}>
          <div className="mobile-flow-card overflow-y-auto bg-white rounded-2xl shadow-2xl w-full max-w-sm p-4 min-[360px]:p-6" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-4">
              <div className="w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-2">
                <span className="text-2xl">📱</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900">{otherProfile.nickname}님의 연락처</h3>
              <p className="text-xs text-teal-600 font-semibold mt-1">공유 완료된 연락처입니다</p>
            </div>
            <div className="space-y-3 mb-5">
              {theirShare.kakao && (
                <div className="flex items-center gap-3 px-4 py-3 bg-yellow-50 rounded-xl border border-yellow-200">
                  <span className="text-yellow-600 font-black text-base w-6 text-center">K</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-yellow-600 font-medium">카카오톡</p>
                    <p className="text-sm font-bold text-gray-800 break-all">{theirShare.kakao}</p>
                  </div>
                  <button onClick={() => navigator.clipboard?.writeText(theirShare.kakao!)}
                    className="flex-shrink-0 px-3 py-1.5 bg-yellow-500 text-white text-xs font-bold rounded-lg active:scale-95">복사</button>
                </div>
              )}
              {theirShare.instagram && (
                <div className="flex items-center gap-3 px-4 py-3 bg-pink-50 rounded-xl border border-pink-200">
                  <span className="text-pink-500 font-black text-base w-6 text-center">@</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-pink-600 font-medium">인스타그램</p>
                    <p className="text-sm font-bold text-gray-800 break-all">{theirShare.instagram}</p>
                  </div>
                  <button onClick={() => navigator.clipboard?.writeText(theirShare.instagram!)}
                    className="flex-shrink-0 px-3 py-1.5 bg-pink-500 text-white text-xs font-bold rounded-lg active:scale-95">복사</button>
                </div>
              )}
              {theirShare.phone && (
                <div className="flex items-center gap-3 px-4 py-3 bg-green-50 rounded-xl border border-green-200">
                  <Phone className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-green-600 font-medium">전화번호</p>
                    <p className="text-sm font-bold text-gray-800 break-all">{theirShare.phone}</p>
                  </div>
                  <button onClick={() => navigator.clipboard?.writeText(theirShare.phone!)}
                    className="flex-shrink-0 px-3 py-1.5 bg-green-500 text-white text-xs font-bold rounded-lg active:scale-95">복사</button>
                </div>
              )}
              {!theirShare.kakao && !theirShare.instagram && !theirShare.phone && (
                <p className="text-center text-gray-400 text-sm py-3">공유된 연락처 정보가 없습니다.</p>
              )}
            </div>
            <button onClick={() => setShowTheirContact(false)}
              className="w-full py-3 bg-teal-500 text-white font-semibold rounded-xl hover:bg-teal-600 transition-all">확인</button>
          </div>
        </div>
      )}

      {/* 연락처 미등록 안내 모달 */}
      {showNoContactModal && (
        <div className="safe-overlay fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowNoContactModal(false)}>
          <div className="mobile-flow-card overflow-y-auto bg-white rounded-2xl shadow-2xl w-full max-w-xs p-5 min-[360px]:p-6 text-center" onClick={e => e.stopPropagation()}>
            <p className="text-3xl mb-3">📱</p>
            <h3 className="font-black text-gray-900 text-base mb-1">연락처가 등록되어 있지 않아요</h3>
            <p className="text-xs text-gray-500 leading-relaxed mb-5">
              카카오톡·인스타그램·전화번호 중<br/>하나 이상을 등록해야 공유할 수 있어요.
            </p>
            <div className="space-y-2">
              <button
                onClick={() => { setShowNoContactModal(false); onGoToTab?.('status'); }}
                className="w-full py-3 bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold rounded-xl text-sm active:scale-95 transition-all">
                📋 내 상태 탭에서 등록하러 가기
              </button>
              <button onClick={() => setShowNoContactModal(false)}
                className="w-full py-2.5 text-gray-500 text-sm font-semibold">취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 사주 모달 */}
      {showSajuModal && (
        <ChatSajuModal
          myNickname={currentUserProfile?.nickname}
          otherNickname={otherProfile.nickname}
          myBirth={myBirth}
          theirBirth={theirBirth}
          myFortune={myFortune}
          theirFortune={theirFortune}
          onClose={closeSajuModal}
          onGoRegisterBirth={goRegisterBirthFromSaju}
        />
      )}

      {/* 궁합 모달 — 4가지 계산법 */}
      {showCompatModal && (
        <ChatCompatModal
          myNickname={currentUserProfile?.nickname}
          otherNickname={otherProfile.nickname}
          myMbti={currentUserProfile?.mbti}
          otherMbti={otherProfile.mbti}
          hasBothBirthdays={hasBothBirthdays}
          myBirth={myBirth}
          theirBirth={theirBirth}
          activeCompatMethod={activeCompatMethod}
          onSelectMethod={setActiveCompatMethod}
          compatResult={compatResult}
          numerologyResult={numerologyResult}
          ohaengCompatResult={ohaengCompatResult}
          mbtiResult={mbtiResult}
          onClose={closeCompatModal}
          onGoRegisterBirth={goRegisterBirthFromCompat}
        />
      )}

      {/* 이미지 전체화면 뷰어 */}
      {imageViewer && (
        <div className="safe-fullscreen fixed inset-0 z-[200] bg-black flex items-center justify-center"
          onClick={() => setImageViewer(null)}>
          <img src={imageViewer} alt="이미지" className="max-w-full max-h-full object-contain select-none" />
          <button className="touch-target absolute top-[max(1rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))] bg-white/20 hover:bg-white/40 rounded-full flex items-center justify-center text-white text-xl transition-all"
            onClick={() => setImageViewer(null)}>✕</button>
        </div>
      )}

      {/* 롱프레스 컨텍스트 메뉴 */}
      {contextMenu && (
        <div className="fixed inset-0 z-50" onClick={() => {
          if (Date.now() < menuIgnoreClickUntil.current) return;
          setContextMenu(null);
        }}>
          <div
            className="absolute bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-x-hidden overflow-y-auto min-w-[170px] max-w-[calc(100vw-1rem)] max-h-[calc(100dvh-1rem)]"
            style={{
              top: Math.max(8, Math.min(contextMenu.y, window.innerHeight - 260)),
              left: Math.min(Math.max(contextMenu.x - 85, 8), window.innerWidth - 185),
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-around px-3 py-2.5 border-b border-gray-100">
              {QUICK_REACTIONS.map(em => (
                <button key={em}
                  onClick={() => {
                    setReactions(prev => {
                      const cur = prev[contextMenu.msgId];
                      if (cur === em) { const n = { ...prev }; delete n[contextMenu.msgId]; return n; }
                      return { ...prev, [contextMenu.msgId]: em };
                    });
                    setContextMenu(null);
                  }}
                  className={`text-xl hover:scale-125 transition-transform active:scale-95 ${reactions[contextMenu.msgId] === em ? 'opacity-100 scale-125' : 'opacity-70'}`}>
                  {em}
                </button>
              ))}
            </div>
            {!isContactCard(contextMenu.content) && (
              <button
                onClick={() => {
                  const snippet = contextMenu.imgUrl ? '[이미지]' : (contextMenu.content?.slice(0, 40) ?? '');
                  setReplyTo({ id: contextMenu.msgId, snippet, isMe: contextMenu.isMine });
                  setContextMenu(null);
                  setTimeout(() => inputRef.current?.focus(), 100);
                }}
                className="flex items-center gap-3 w-full px-5 py-3 text-sm text-gray-700 hover:bg-gray-50 text-left">
                ↩️ 답장
              </button>
            )}
            {!isContactCard(contextMenu.content) && !contextMenu.imgUrl && contextMenu.content && (
              <button
                onClick={() => { navigator.clipboard?.writeText(contextMenu.content); setContextMenu(null); }}
                className="flex items-center gap-3 w-full px-5 py-3 text-sm text-gray-700 hover:bg-gray-50 border-t border-gray-100 text-left">
                📋 복사
              </button>
            )}
            {/* XSS 방어: javascript:/data: URL 차단 — https?:// 만 허용 */}
            {contextMenu.imgUrl && /^https?:\/\//i.test(contextMenu.imgUrl) && (
              <a href={contextMenu.imgUrl} download target="_blank" rel="noreferrer"
                onClick={() => setContextMenu(null)}
                className="flex items-center gap-3 w-full px-5 py-3 text-sm text-gray-700 hover:bg-gray-50 border-t border-gray-100 text-left">
                💾 이미지 저장
              </a>
            )}
            {contextMenu.isMine && (
              <button
                onClick={() => {
                  onDeleteMessage(contextMenu.msgId);
                  setMyUnreadIds(p => { const n = new Set(p); n.delete(contextMenu.msgId); return n; });
                  setContextMenu(null);
                }}
                className="flex items-center gap-3 w-full px-5 py-3 text-sm text-red-500 hover:bg-red-50 border-t border-gray-100 text-left">
                🗑️ 삭제 (모두에게)
              </button>
            )}
          </div>
        </div>
      )}

      <header className="bg-white shadow-sm shrink-0 z-10">
        {/* 행 1: 뒤로가기 + 아바타 + 닉네임 */}
        <div className="max-w-3xl mx-auto px-3 pt-2.5 pb-1 flex items-center gap-2">
          <button onClick={onBack} className="touch-target hover:bg-gray-100 rounded-full transition-colors flex-shrink-0 flex items-center justify-center">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-gray-200 bg-gray-200">
            <img
              src={avatarSrc(otherProfile.photo_url, otherProfile.nickname)}
              alt={otherProfile.nickname}
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).src = genAvatar(otherProfile.nickname); }}
            />
          </div>
          <h2 className="font-semibold text-gray-900 flex-1 min-w-0 truncate text-sm">{otherProfile.nickname}</h2>
        </div>
        {/* 행 2: 액션 버튼 (가로 스크롤) — 320px 이하도 잘리지 않도록 */}
        <div className="max-w-3xl mx-auto px-3 pb-2 flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
          {/* 미니 테마 순환 버튼 */}
          <button
            onClick={handleCycleTheme}
            title="테마 변경"
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 active:scale-90 transition-all flex-shrink-0 text-base"
          >
            {THEME_EMOJI[theme]}
          </button>
          <button
            onClick={() => setShowSajuModal(true)}
            className="flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-600 text-xs font-bold rounded-xl border border-amber-200 hover:bg-amber-100 transition-all active:scale-95 flex-shrink-0">
            📅 사주
          </button>
          <button
            onClick={() => { setActiveCompatMethod('saju'); setShowCompatModal(true); }}
            className="flex items-center gap-1 px-2 py-1 bg-violet-50 text-violet-600 text-xs font-bold rounded-xl border border-violet-200 hover:bg-violet-100 transition-all active:scale-95 flex-shrink-0">
            🔮 궁합
          </button>
          {theirShare && (
            <button onClick={() => setShowTheirContact(true)}
              className="flex items-center gap-1 px-2 py-1 bg-teal-50 text-teal-600 text-xs font-bold rounded-xl border border-teal-200 hover:bg-teal-100 transition-all active:scale-95 flex-shrink-0">
              ✓ 공유완료
            </button>
          )}
          {iSharedMine ? (
            <span className="text-xs text-gray-400 flex-shrink-0">📤 공유함</span>
          ) : (
            <button onClick={handleShareContact}
              className={`flex items-center gap-1 px-2 py-1 text-xs font-bold rounded-xl border transition-all active:scale-95 flex-shrink-0 ${
                hasContact
                  ? 'bg-cyan-50 text-cyan-600 border-cyan-200 hover:bg-cyan-100'
                  : 'bg-gray-50 text-gray-400 border-gray-200'
              }`}>
              📱 공유
            </button>
          )}
        </div>
      </header>

      <main
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto min-h-0"
        onClick={(e) => {
          // 빈 채팅 영역 클릭 → 키보드 내리기 + 열린 패널 전부 닫기
          const target = e.target as HTMLElement;
          if (!target.closest('button, a, textarea, input, [role="button"]')) {
            inputRef.current?.blur();
            setShowEmoji(false);
            setShowStickers(false);
            setShowQuickMsgs(false);
            setShowInfoReqMenu(false);
            setShowMoreBtns(false);
            setShowMyInfoEdit(false);
          }
        }}
      >
        <div className="max-w-3xl mx-auto px-4 py-4 space-y-1">
          {messages.map((msg) => (
            <ChatMessageRow
              key={msg.id}
              msg={msg}
              currentUserId={currentUserId}
              meta={messageMeta.get(msg.id)!}
              reaction={reactions[msg.id]}
              swipeOffsetX={swipeState?.msgId === msg.id ? swipeState.offsetX : 0}
              isSwiping={swipeState?.msgId === msg.id}
              myUnread={myUnreadIds.has(msg.id)}
              ackedReqTypes={ackedReqTypes}
              declinedReqTypes={declinedReqTypes}
              onMsgTouchStart={onMsgTouchStart}
              onMsgTouchMove={onMsgTouchMove}
              onMsgTouchEnd={onMsgTouchEnd}
              onMsgMouseDown={onMsgMouseDown}
              onContextMenu={handleMsgContextMenu}
              onTap={handleTap}
              onAcceptInfoReq={handleAcceptInfoReq}
              onDeclineInfoReq={handleDeclineInfoReq}
              onOpenImage={setImageViewer}
              onClearReaction={(msgId) => setReactions(prev => { const n = { ...prev }; delete n[msgId]; return n; })}
            />
          ))}
          <div ref={messagesEndRef} />
          {messages.length === 0 && (
            <div className="text-center py-20">
              <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">대화를 시작해보세요!</p>
            </div>
          )}
        </div>
      </main>

      {/* 이모지 패널 */}
      {showEmoji && (
        <ChatEmojiPanel
          emojiCat={emojiCat}
          onSelectCategory={setEmojiCat}
          onEmojiClick={handleEmojiClick}
        />
      )}

      {/* 스티커 패널 — 분류 탭 */}
      {showStickers && (
        <ChatStickerPanel
          stickerCat={stickerCat}
          onSelectCategory={setStickerCat}
          onSelectSticker={handleSendSticker}
        />
      )}

      {/* 빠른 메시지 패널 */}
      {showQuickMsgs && (
        <ChatQuickMsgsPanel onSelectMessage={handleSendQuickMsg} />
      )}

      {/* ── 정보 요청 메뉴 패널 ── */}
      {showInfoReqMenu && (
        <div className="bg-white border-t border-gray-100 shrink-0 max-h-[60vh] overflow-y-auto">
          <div className="max-w-3xl mx-auto px-3 py-2.5 space-y-1">

            {/* ── 내 정보 바로 등록 ── */}
            <button type="button"
              onClick={() => setShowMyInfoEdit(p => !p)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all text-left border ${showMyInfoEdit ? 'bg-emerald-50 border-emerald-200' : 'border-transparent hover:bg-emerald-50 hover:border-emerald-100'}`}>
              <span className="text-2xl shrink-0">✏️</span>
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-800">내 정보 등록하기</p>
                <p className="text-[10px] text-gray-400">생월·생일·연락처를 채팅에서 바로 저장</p>
              </div>
              <span className="text-gray-400 text-xs">{showMyInfoEdit ? '▲' : '▼'}</span>
            </button>

            {showMyInfoEdit && (
              <div className="bg-emerald-50 rounded-2xl p-3 space-y-2 border border-emerald-100">
                {/* 생월·생일 */}
                <p className="text-[10px] font-black text-emerald-600 px-1">🎂 생월 · 생일</p>
                {birthMdLocked ? (
                  <p className="text-[10px] text-amber-700 px-1">생월·생일 변경은 {BIRTH_MD_EDIT_MAX}회만 가능해요.</p>
                ) : birthMdRemaining < BIRTH_MD_EDIT_MAX ? (
                  <p className="text-[10px] text-purple-700 px-1">{birthMdRemaining}회 남음 · 최대 {BIRTH_MD_EDIT_MAX}회 변경</p>
                ) : null}
                <div className="flex gap-2">
                  <div className="flex-1">
                    <input
                      type="number" min="1" max="12" placeholder="월 (1~12)"
                      value={myInfoForm.birthMonth}
                      onChange={e => setMyInfoForm(f => ({ ...f, birthMonth: e.target.value }))}
                      disabled={birthMdLocked}
                      className="w-full px-3 py-2 text-sm border border-emerald-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white disabled:opacity-50"
                    />
                  </div>
                  <div className="flex-1">
                    <input
                      type="number" min="1" max="31" placeholder="일 (1~31)"
                      value={myInfoForm.birthDay}
                      onChange={e => setMyInfoForm(f => ({ ...f, birthDay: e.target.value }))}
                      disabled={birthMdLocked}
                      className="w-full px-3 py-2 text-sm border border-emerald-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white disabled:opacity-50"
                    />
                  </div>
                </div>

                {/* 연락처 */}
                <p className="text-[10px] font-black text-emerald-600 px-1 pt-1">📱 연락처</p>
                <input
                  type="tel" placeholder="전화번호 (010-xxxx-xxxx)"
                  value={myInfoForm.phone}
                  onChange={e => setMyInfoForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-emerald-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                />
                <input
                  type="text" placeholder="카카오톡 ID"
                  value={myInfoForm.kakao}
                  onChange={e => setMyInfoForm(f => ({ ...f, kakao: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-emerald-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                />
                <input
                  type="text" placeholder="인스타그램 ID (@없이)"
                  value={myInfoForm.instagram}
                  onChange={e => setMyInfoForm(f => ({ ...f, instagram: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-emerald-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                />

                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setShowMyInfoEdit(false)}
                    className="flex-1 py-2 text-sm text-gray-500 font-semibold rounded-xl border border-gray-200 bg-white active:scale-95 transition-all">
                    취소
                  </button>
                  <button type="button" onClick={handleSaveMyInfo} disabled={myInfoSaving}
                    className="flex-1 py-2 text-sm text-white font-bold rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 active:scale-95 transition-all">
                    {myInfoSaving ? '저장 중…' : '저장하기'}
                  </button>
                </div>
              </div>
            )}

            <div className="border-t border-gray-100 my-1" />
            <p className="text-[10px] font-black text-gray-400 px-2 pb-1">📋 상대방에게 요청하기</p>
            <button type="button"
              onClick={() => handleSendInfoReq('birthday')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-amber-50 active:bg-amber-100 transition-all text-left border border-transparent hover:border-amber-100">
              <span className="text-2xl shrink-0">🎂</span>
              <div>
                <p className="text-sm font-bold text-gray-800">생일 요청</p>
                <p className="text-[10px] text-gray-400">상대방의 생일(월/일)을 물어봅니다</p>
              </div>
            </button>
            <button type="button"
              onClick={() => handleSendInfoReq('phone')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-cyan-50 active:bg-cyan-100 transition-all text-left border border-transparent hover:border-cyan-100">
              <span className="text-2xl shrink-0">📱</span>
              <div>
                <p className="text-sm font-bold text-gray-800">전화번호 요청</p>
                <p className="text-[10px] text-gray-400">상대방의 전화번호를 물어봅니다</p>
              </div>
            </button>
          </div>
        </div>
      )}

      <footer className="safe-bottom-panel bg-white border-t border-gray-200 shrink-0">
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
        {chatError && (
          <div className="max-w-3xl mx-auto px-3 pt-2">
            <p className="text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-lg border border-red-200">{chatError}</p>
          </div>
        )}
        {showSignalOpeners && messages.length === 0 && (
          <div className="max-w-3xl mx-auto px-3 pt-2 flex flex-wrap gap-1.5">
            {SIGNAL_FIRST_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => {
                  setInput(chip);
                  onInputChange?.(chip);
                  requestAnimationFrame(() => {
                    if (inputRef.current) {
                      inputRef.current.style.height = 'auto';
                      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px';
                      inputRef.current.focus();
                    }
                  });
                }}
                className="text-[11px] font-bold px-2.5 py-1.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 active:scale-95 transition-all"
              >
                {chip}
              </button>
            ))}
          </div>
        )}
        {replyTo && (
          <div className="max-w-3xl mx-auto px-3 pt-2 flex items-center gap-2">
            <div className="flex-1 min-w-0 bg-cyan-50 border-l-4 border-cyan-400 rounded-r-xl px-3 py-1.5 text-xs text-gray-600">
              <span className="font-bold text-cyan-600 mr-1">{replyTo.isMe ? '내 메시지' : otherProfile.nickname}에 답장</span>
              <span className="line-clamp-1">{replyTo.snippet}</span>
            </div>
            <button onClick={() => setReplyTo(null)}
              className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-300 text-xs shrink-0">✕</button>
          </div>
        )}
        {/* 더보기 버튼 펼쳐지면 보조 버튼 한 줄 표시 */}
        {showMoreBtns && (
          <div className="max-w-3xl mx-auto px-3 pt-2 pb-0 flex items-center gap-1">
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
              className="p-2 text-gray-400 hover:text-cyan-500 hover:bg-cyan-50 rounded-full transition-all disabled:opacity-50 shrink-0" title="이미지 전송">
              <ImageIcon className="w-5 h-5" />
            </button>
            <button type="button"
              onClick={() => { setShowStickers(p => !p); setShowEmoji(false); setShowQuickMsgs(false); }}
              className={`p-1.5 rounded-full transition-all text-lg leading-none shrink-0 ${showStickers ? 'bg-rose-100' : 'hover:bg-rose-50'}`}
              title="이모티콘">🎨</button>
            <button type="button"
              onClick={() => { setShowQuickMsgs(p => !p); setShowEmoji(false); setShowStickers(false); setShowInfoReqMenu(false); }}
              className={`p-1.5 rounded-full transition-all text-lg leading-none shrink-0 ${showQuickMsgs ? 'bg-violet-100' : 'hover:bg-violet-50'}`}
              title="빠른 메시지">⚡</button>
            <button type="button"
              onClick={() => { setShowInfoReqMenu(p => !p); setShowEmoji(false); setShowStickers(false); setShowQuickMsgs(false); }}
              className={`p-1.5 rounded-full transition-all text-lg leading-none shrink-0 ${showInfoReqMenu ? 'bg-amber-100' : 'hover:bg-amber-50'}`}
              title="생일·전화번호 요청">📋</button>
          </div>
        )}
        {/* 기본 입력 행: [+] [😊] [textarea] [➤] */}
        <div className="max-w-3xl mx-auto px-3 py-2 flex items-end gap-2">
          {/* + 더보기 토글 */}
          <button type="button"
            onClick={() => setShowMoreBtns(p => !p)}
            className={`p-2 rounded-full transition-all shrink-0 text-base leading-none ${showMoreBtns ? 'bg-gray-200 text-gray-600' : 'text-gray-400 hover:bg-gray-100'}`}
            title="더보기">
            {showMoreBtns ? '✕' : '+'}
          </button>
          {/* 이모지 */}
          <button type="button"
            onClick={() => { setShowEmoji(p => !p); setShowStickers(false); setShowQuickMsgs(false); }}
            className={`p-2 rounded-full transition-all shrink-0 ${showEmoji ? 'text-cyan-500 bg-cyan-50' : 'text-gray-400 hover:text-cyan-500 hover:bg-cyan-50'}`}>
            <Smile className="w-5 h-5" />
          </button>
          {/* 멀티라인 입력창 — Enter=줄바꿈, 버튼만 전송 */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => { if (e.target.value.length <= 1000) { setInput(e.target.value); onInputChange?.(e.target.value); autoResizeTextarea(); } }}
            onInput={autoResizeTextarea}
            maxLength={1000}
            placeholder={uploading ? '업로드 중...' : replyTo ? '답장 입력...' : '메시지를 입력하세요...'}
            disabled={uploading}
            rows={1}
            onFocus={() => {
              setTimeout(() => {
                messagesEndRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
              }, 350);
            }}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition-all text-sm disabled:opacity-60 min-w-0 resize-none overflow-y-auto leading-relaxed"
            style={{ maxHeight: '120px' }}
          />
          {/* 전송 버튼 — onClick만, 폼 submit 없음 */}
          <button type="button" onClick={handleSend} disabled={!input.trim() || uploading}
            className="p-2 bg-cyan-500 text-white rounded-full hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shrink-0">
            <Send className="w-5 h-5" />
          </button>
        </div>
      </footer>
    </div>
  );
}

export default ChatScreen;
