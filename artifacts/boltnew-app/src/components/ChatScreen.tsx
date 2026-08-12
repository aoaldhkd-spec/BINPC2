import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  ArrowLeft, Send, MessageCircle, Smile, ImageIcon, Phone,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTheme, type ThemeMode } from '../lib/theme';
import { genAvatar } from '../lib/profile';
import { getZodiac, getOhaeng, getCompatibility, getOhaengCompat, getNumerologyCompat, getMbtiCompat, getTodayFortune } from '../lib/fortune';
import { StickerSVG, STICKER_LABELS, STICKER_BG, STICKER_COUNT, STICKER_PACKS } from '../stickers';
import { hasBannedWord } from '../lib/utils';
import type { Message, Profile, ContactShare } from '../types/app';

// ─── ChatScreen ───────────────────────────────────────────────────────────────
// 1:1 채팅 화면. 스티커·이모지·이미지·연락처 공유·궁합·사주 기능 포함.

// ── 채팅방별 스크롤 위치 캐시 ────────────────────────────────────────────────
// 뒤로가기 후 재진입 시 마지막 스크롤 위치를 복원한다.
// React ref가 아닌 모듈 스코프 Map을 사용하므로 컴포넌트 언마운트 이후에도 유지된다.
const _scrollPositionCache = new Map<string, number>();

// ── 이모지 카테고리 (총 ~105개) ───────────────────────────────────────────────
const EMOJI_CATEGORIES = [
  {
    id: 'face', label: '😄', name: '표정',
    emojis: [
      '😀','😃','😄','😁','😆','😅','🤣','😂','🥹','😊',
      '😇','🥰','😍','🤩','😘','😗','😋','😛','😜','🤪',
      '😏','😒','🙄','😬','🤐','😯','😮','😱','🤯','😴',
      '🥺','😭','😤','😠','🤔','🫠','🥴','🤗','🤭','😎',
    ],
  },
  {
    id: 'love', label: '❤️', name: '사랑',
    emojis: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','🩷',
      '💕','💞','💓','💗','💖','💘','💝','💟','❣️','💔',
      '😻','🥰','😘','💏','💑','🫶','💌','💋','🫦','🩸',
    ],
  },
  {
    id: 'gesture', label: '🙌', name: '제스처',
    emojis: [
      '👍','👎','👋','🤚','✋','🖐️','🖖','🤙','💪','🦾',
      '🙏','🤲','👐','🤝','🤜','🤛','✊','👊','🫳','🫴',
      '🙌','👏','🤞','🫰','🤟','🤘','✌️','🖕','☝️','👆',
    ],
  },
  {
    id: 'party', label: '🎉', name: '축하',
    emojis: [
      '🎉','🎊','🎈','🥳','🎂','🎁','🎀','🎆','🎇','🧨',
      '🏆','🥇','🥈','🥉','🎖️','👑','💯','🔥','✨','🌟',
      '⭐','💫','🌈','🎯','🎪','🎭','🎨','🎬','🎤','🎸',
    ],
  },
  {
    id: 'drink', label: '🍺', name: '술자리',
    emojis: [
      '🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🍾','🥤',
      '🍜','🍖','🍗','🍕','🍔','🥓','🍣','🍱','🥘','🫕',
      '🍿','🧆','🥗','🍤','🦞','🦀','🍙','🍛','🥩','🍡',
    ],
  },
  {
    id: 'animal', label: '🐾', name: '동물',
    emojis: [
      '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯',
      '🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧',
      '🐦','🦆','🦋','🐝','🐛','🦎','🐢','🐙','🦑','🐡',
    ],
  },
] as const;

const THEME_CYCLE: ThemeMode[] = ['default', 'y2k', 'dark-neon', 'minimal'];
const THEME_EMOJI: Record<ThemeMode, string> = { default: '🌙', y2k: '💖', 'dark-neon': '🔥', minimal: '☕' };

// ── 컴포넌트 외부 상수 — 렌더마다 배열 재생성 방지 ──────────────────────────────
const QUICK_MSGS = [
  '오늘 즐거웠어요 ☺️', '술 한 잔 더 할래요? 🍺', '번호 교환해요! 📱', '이따가 연락해요 ☎️',
  '오늘 인연인 것 같아요 💕', '어디서 오셨어요?', '맥주 VS 소주 어느 쪽이에요?',
  '오늘 처음 나오셨어요?', '자주 이런 모임 나오세요?', '카카오 아이디 알려줘도 돼요? 🐣',
  '잠깐 밖에 나갈래요? 🌙', '오늘 정말 재미있었어요! 또 봐요 👋', '밥은 드셨어요? 🍚',
  '다음에 또 만나요 ✨', '저 마음에 드세요? (◕‿◕✿)', '같이 사진 찍어요! 📸',
  '인스타 팔로우해도 될까요?', '오늘 처음 뵙는데 반가워요!',
];
const QUICK_REACTIONS = ['❤️', '😂', '👍', '🔥', '😮', '😢'];

function ChatScreen({ chatId, messages, currentUserId, otherProfile, onSend, onSendImage, onBack, onDeleteMessage, currentUserProfile, receivedContactShares, contactSharedWithIds, onGoToTab, onUpdateProfile, initialInput, onInputChange }: {
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
  const messagesRef = useRef(messages); // 항상 최신 messages를 가리키는 ref
  messagesRef.current = messages;
  const [myUnreadIds, setMyUnreadIds] = useState<Set<string>>(new Set());

  // chatId 변경 시 채팅방별 로컬 상태를 전부 초기화한다.
  // 이전 방의 initialMsgIds·reactions·replyTo 등이 새 방에 잔류하면
  // "새 메시지" 마킹 오작동, 엉뚱한 답장 UI 잔존 등의 버그가 발생한다.
  useEffect(() => {
    initialMsgIds.current = new Set(messages.map(m => m.id));
    setMyUnreadIds(new Set());
    setReplyTo(null);
    setContextMenu(null);
    setSwipeState(null);
    setReactions({});
    setImageViewer(null);
  }, [chatId]); // eslint-disable-line react-hooks/exhaustive-deps

  const [contextMenu, setContextMenu] = useState<{ msgId: string; content: string; isMine: boolean; imgUrl?: string; x: number; y: number } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [replyTo, setReplyTo] = useState<{ id: string; snippet: string; isMe: boolean } | null>(null);

  // ── 내 정보 인라인 등록 ────────────────────────────────────────────────────────
  const [showMyInfoEdit, setShowMyInfoEdit] = useState(false);
  const [myInfoForm, setMyInfoForm] = useState({ birthMonth: '', birthDay: '', phone: '', kakao: '', instagram: '' });
  const [myInfoSaving, setMyInfoSaving] = useState(false);

  const [swipeState, setSwipeState] = useState<{ msgId: string; offsetX: number } | null>(null);
  const swipeTouchRef = useRef<{ msgId: string; startX: number; startY: number; swiping: boolean } | null>(null);

  const [imageViewer, setImageViewer] = useState<string | null>(null);
  const [reactions, setReactions] = useState<Record<string, string>>({});

  // ── DiceBear 투명 SVG → genAvatar 강제 치환 ─────────────────────────────────
  // DiceBear URL은 200 OK 반환하므로 onerror 미발화. URL 내 'dicebear' 포함 여부로 판별.
  // backgroundColor 파라미터가 있는 URL(프리셋 아바타)은 배경이 있으므로 그대로 유지.
  const avatarSrc = (url: string | null | undefined, nick: string): string => {
    if (!url) return genAvatar(nick);
    if (url.includes('dicebear') && !url.includes('backgroundColor')) return genAvatar(nick);
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
    const newMyMsgs = messages.filter(m => m.sender_id === currentUserId && !initialMsgIds.current.has(m.id));
    if (newMyMsgs.length > 0) {
      setMyUnreadIds(prev => new Set([...prev, ...newMyMsgs.map(m => m.id)]));
    }
  }, [messages, currentUserId]);

  useEffect(() => {
    if (!chatId) return;
    const ch = supabase
      .channel(`chat_reads:${chatId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_reads', filter: `chat_id=eq.${chatId}` },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          const row = (payload as { new?: { reader_id?: string; read_at?: string } }).new;
          if (row?.reader_id && row.reader_id !== currentUserId) {
            // [Fix-2] read_at 타임스탬프 비교: 파트너의 read_at이 내 최신 메시지 created_at 이후여야만 읽음 처리
            // 이전 세션의 오래된 read_at으로 "1"이 잘못 사라지는 버그 방지
            if (row.read_at) {
              const readTime = new Date(row.read_at as string).getTime();
              const myMsgs = messagesRef.current.filter(m => m.sender_id === currentUserId && !m.id.startsWith('__opt_'));
              const latestMsgTime = myMsgs.reduce((max, m) => Math.max(max, new Date(m.created_at).getTime()), 0);
              if (latestMsgTime === 0 || readTime >= latestMsgTime) {
                messagesRef.current.forEach(m => initialMsgIds.current.add(m.id));
                setMyUnreadIds(new Set());
              }
            } else {
              // read_at 없이 이벤트 도착: 안전하게 전부 읽음 처리
              messagesRef.current.forEach(m => initialMsgIds.current.add(m.id));
              setMyUnreadIds(new Set());
            }
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [chatId, currentUserId]);

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
          .select('read_at')
          .eq('chat_id', chatId)
          .eq('reader_id', partnerId)
          .maybeSingle();
        if (data?.read_at) {
          // [Fix-2] 타임스탬프 비교: 파트너의 read_at >= 내 최신 메시지 created_at 이어야만 읽음 처리
          const readTime = new Date(data.read_at).getTime();
          const myMsgs = messagesRef.current.filter(m => m.sender_id === currentUserId && !m.id.startsWith('__opt_'));
          const latestMsgTime = myMsgs.reduce((max, m) => Math.max(max, new Date(m.created_at).getTime()), 0);
          if (latestMsgTime === 0 || readTime >= latestMsgTime) {
            messagesRef.current.forEach(m => initialMsgIds.current.add(m.id));
            setMyUnreadIds(new Set());
          }
        }
      } catch (_) { /* 네트워크 오류는 무시 */ }
    };
    checkPartnerRead();
    const interval = setInterval(checkPartnerRead, 5000);
    return () => clearInterval(interval);
  }, [chatId, otherProfile?.id, myUnreadIds.size]); // eslint-disable-line react-hooks/exhaustive-deps

  const isContactCard = (content: string | null) => !!content?.startsWith('__contact__');
  const parseContactCard = (content: string) => content.replace(/^__contact__\n?/, '').split('\n').filter(Boolean);
  const isReplyMsg = (content: string | null) => !!content?.startsWith('__reply__');
  const parseReply = (content: string): { quote: string; text: string } => {
    const body = content.replace(/^__reply__/, '');
    const nl = body.indexOf('\n');
    return nl === -1 ? { quote: body, text: '' } : { quote: body.slice(0, nl), text: body.slice(nl + 1) };
  };
  const isStickerMsg = (content: string | null) => !!content?.startsWith('__sticker__');
  const parseStickerIdx = (content: string) => parseInt(content.replace('__sticker__', ''), 10);

  // ── 정보 요청/수락/거절 메시지 타입 ──────────────────────────────────────────
  const isInfoReq     = (c: string | null) => !!c?.startsWith('__inforeq__:');
  const isInfoAck     = (c: string | null) => !!c?.startsWith('__infoack__:');
  const isInfoDecline = (c: string | null) => !!c?.startsWith('__infodecline__:');
  const parseInfoReqType = (c: string): 'birthday' | 'phone' =>
    c.includes('birthday') ? 'birthday' : 'phone';
  const parseInfoAckData = (c: string): { type: 'birthday' | 'phone'; value: string } => {
    const body = c.replace('__infoack__:', '');
    const ci = body.indexOf(':');
    return { type: body.slice(0, ci) as 'birthday' | 'phone', value: body.slice(ci + 1) };
  };

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

  const handleEmojiClick = (emoji: string) => { setInput((prev) => prev + emoji); inputRef.current?.focus(); };

  // ── 내 정보 저장 ──────────────────────────────────────────────────────────────
  const handleSaveMyInfo = async () => {
    if (!currentUserProfile) return;
    const update: Record<string, unknown> = { id: currentUserProfile.id };
    const bm = parseInt(myInfoForm.birthMonth);
    const bd = parseInt(myInfoForm.birthDay);
    // 월별 최대 일수 cross-validation (2월 30일 같은 불가능한 날짜 방지)
    const maxDayForMonth = (m: number) => new Date(2000, m, 0).getDate();
    if (!isNaN(bm) && bm >= 1 && bm <= 12) {
      update.birth_month = bm;
      if (!isNaN(bd) && bd >= 1 && bd <= maxDayForMonth(bm)) update.birth_day = bd;
    } else if (!isNaN(bd) && bd >= 1 && bd <= 31) {
      update.birth_day = bd; // 월 없이 일만 수정하는 경우
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
        setChatError('정보 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.');
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
    };
  }, []);

  const cancelLP = () => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } };

  // 메시지 핸들러를 useCallback으로 안정화 — messages 리스트 렌더 시 불필요한 자식 재렌더 방지
  const onMsgTouchStart = useCallback((e: React.TouchEvent, msg: Message) => {
    if (!e.touches.length) return;
    const t = e.touches[0];
    swipeTouchRef.current = { msgId: msg.id, startX: t.clientX, startY: t.clientY, swiping: false };
    longPressTimer.current = setTimeout(() => {
      if (!swipeTouchRef.current?.swiping) {
        setContextMenu({ msgId: msg.id, content: msg.content ?? '', isMine: msg.sender_id === currentUserId, imgUrl: msg.image_url ?? undefined, x: t.clientX, y: t.clientY });
      }
    }, 500);
  }, [currentUserId]);

  const onMsgTouchMove = useCallback((e: React.TouchEvent, msg: Message) => {
    const ref = swipeTouchRef.current;
    if (!ref || ref.msgId !== msg.id) return;
    if (!e.touches.length) return;
    const t = e.touches[0];
    const dx = t.clientX - ref.startX;
    const dy = t.clientY - ref.startY;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) cancelLP();
    if (!ref.swiping && Math.abs(dy) > Math.abs(dx) + 4) return;
    if (Math.abs(dx) > 10) {
      ref.swiping = true;
      const clamped = Math.sign(dx) * Math.min(Math.abs(dx), 72);
      setSwipeState({ msgId: msg.id, offsetX: clamped });
    }
  }, []);

  const onMsgTouchEnd = useCallback((_e: React.TouchEvent, msg: Message) => {
    cancelLP();
    if (swipeTouchRef.current?.swiping === false &&
        swipeState?.msgId === msg.id && Math.abs(swipeState.offsetX) >= 55) {
      const snippet = msg.image_url ? '[이미지]' : (msg.content ?? '').slice(0, 40);
      setReplyTo({ id: msg.id, snippet, isMe: msg.sender_id === currentUserId });
      // focusTimerRef로 관리 — 언마운트 시 clearTimeout 가능
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      focusTimerRef.current = setTimeout(() => { focusTimerRef.current = null; inputRef.current?.focus(); }, 100);
    }
    swipeTouchRef.current = null;
    setSwipeState(null);
  }, [swipeState, currentUserId]);

  const handleMsgContextMenu = useCallback((e: React.MouseEvent, msg: Message) => {
    e.preventDefault();
    setContextMenu({ msgId: msg.id, content: msg.content ?? '', isMine: msg.sender_id === currentUserId, imgUrl: msg.image_url ?? undefined, x: e.clientX, y: e.clientY });
  }, [currentUserId]);

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
  const ackedReqTypes = useMemo(() => new Set(
    messages.filter(m => isInfoAck(m.content)).map(m => parseInfoReqType(m.content!))
  ), [messages]);
  const declinedReqTypes = useMemo(() => new Set(
    messages.filter(m => isInfoDecline(m.content)).map(m => parseInfoReqType(m.content!))
  ), [messages]);

  const hasContact = !!(currentUserProfile?.kakao_id || currentUserProfile?.instagram_id || currentUserProfile?.phone_number);

  return (
    <div className="fixed left-0 right-0 bg-gray-100 flex flex-col z-[9999]" style={{ ...vpStyle, paddingTop: 'env(safe-area-inset-top)' }}>

      {/* 상대방 연락처 보기 모달 */}
      {showTheirContact && theirShare && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowTheirContact(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
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
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowNoContactModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6 text-center" onClick={e => e.stopPropagation()}>
            <p className="text-3xl mb-3">📱</p>
            <h3 className="font-black text-gray-900 text-base mb-1">연락처가 등록되어 있지 않아요</h3>
            <p className="text-xs text-gray-500 leading-relaxed mb-5">
              카카오톡·인스타그램·전화번호 중<br/>하나 이상을 등록해야 공유할 수 있어요.
            </p>
            <div className="space-y-2">
              <button
                onClick={() => { setShowNoContactModal(false); onGoToTab?.('status'); onBack(); }}
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
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowSajuModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-4 text-center text-white flex-shrink-0">
              <p className="text-2xl mb-1">📅</p>
              <h3 className="font-black text-lg">오늘의 사주</h3>
              <p className="text-xs text-amber-100 mt-0.5">생년월일 기반 · 오늘 하루 운세</p>
            </div>
            <div className="overflow-y-auto p-5 space-y-4">
              {!myBirth && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-center">
                  <p className="text-2xl mb-1">⚠️</p>
                  <p className="text-sm font-black text-amber-800 mb-0.5">내 생월·생일이 없어요</p>
                  <p className="text-xs text-amber-600 mb-3 leading-relaxed">운세·사주 탭에서 생월·생일을 등록하면<br/>내 사주를 확인할 수 있어요.</p>
                  <button
                    onClick={() => { setShowSajuModal(false); onGoToTab?.('fortune'); onBack(); }}
                    className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-sm active:scale-95 transition-all">
                    🔮 운세 탭에서 등록하러 가기
                  </button>
                </div>
              )}
              {[
                { label: currentUserProfile?.nickname ?? '나', birth: myBirth, fortune: myFortune, color: 'cyan' },
                { label: otherProfile.nickname, birth: theirBirth, fortune: theirFortune, color: 'pink' },
              ].map(({ label, birth, fortune }) => (
                <div key={label} className="rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                  <div className="bg-gray-50 px-4 py-2 flex items-center gap-2">
                    <span className="font-black text-sm text-gray-800">{label}</span>
                    {birth ? (
                      <span className="text-xs text-gray-400">{birth.y}년생 · {getZodiac(birth.y).emoji}{getZodiac(birth.y).name}띠 · {getOhaeng(birth.y)}</span>
                    ) : (
                      <span className="text-xs text-red-400 font-semibold">생년월일 미등록</span>
                    )}
                  </div>
                  {!birth || !fortune ? (
                    <div className="px-4 py-3 text-xs text-gray-400 italic">
                      {birth ? '사주 계산 중...' : '생년월일 등록 후 확인 가능해요'}
                    </div>
                  ) : (
                    <div className="px-4 py-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">에너지 지수</span>
                        <span className="text-sm font-black text-purple-600">{fortune.energyLevel}%</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-purple-400 to-violet-500 rounded-full transition-all" style={{ width: `${fortune.energyLevel}%` }} />
                      </div>
                      <p className="text-xs text-gray-600 leading-relaxed">{fortune.message}</p>
                      <div className="flex gap-1.5 flex-wrap">
                        <span className="text-[10px] bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 rounded-full font-bold">🎨 {fortune.luckyColor}</span>
                        <span className="text-[10px] bg-blue-50 border border-blue-200 text-blue-700 px-2 py-0.5 rounded-full font-bold">🔢 {fortune.luckyNumber}</span>
                        <span className="text-[10px] bg-teal-50 border border-teal-200 text-teal-700 px-2 py-0.5 rounded-full font-bold">✨ {fortune.luckyItem}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="px-5 pb-5 flex-shrink-0">
              <button onClick={() => setShowSajuModal(false)}
                className="w-full py-3 bg-amber-500 text-white font-semibold rounded-xl hover:bg-amber-600 transition-all">닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* 궁합 모달 — 4가지 계산법 */}
      {showCompatModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowCompatModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-violet-500 to-purple-600 px-5 py-4 text-center text-white flex-shrink-0">
              <p className="text-2xl mb-1">🔮</p>
              <h3 className="font-black text-lg">{currentUserProfile?.nickname ?? '나'} × {otherProfile.nickname}</h3>
              <p className="text-xs text-violet-200 mt-0.5">궁합 보기</p>
            </div>
            <div className="overflow-y-auto p-5 space-y-4">
              {!hasBothBirthdays ? (
                <div className="text-center py-4">
                  <p className="text-3xl mb-2">😔</p>
                  <p className="text-gray-700 font-semibold mb-1">생년월일 정보가 부족해요</p>
                  {!myBirth && (
                    <div className="rounded-xl bg-purple-50 border border-purple-200 p-3 mb-3 text-left">
                      <p className="text-xs font-black text-purple-700 mb-0.5">내 생월·생일이 미등록</p>
                      <p className="text-[11px] text-purple-600 leading-relaxed mb-2">운세 탭에서 생월·생일을 등록해야 궁합을 볼 수 있어요.</p>
                      <button
                        onClick={() => { setShowCompatModal(false); onGoToTab?.('fortune'); onBack(); }}
                        className="w-full py-2 bg-gradient-to-r from-purple-500 to-violet-500 text-white font-bold rounded-lg text-xs active:scale-95 transition-all">
                        🔮 운세 탭에서 등록하러 가기
                      </button>
                    </div>
                  )}
                  {myBirth && !theirBirth && (
                    <p className="text-xs text-gray-400 mt-1">{otherProfile.nickname}님의 생년월일이 등록되지 않았어요</p>
                  )}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { id: 'saju' as const, label: '🐯 전통 사주', desc: '12지신 기반' },
                      { id: 'numerology' as const, label: '🔢 수비학', desc: '생년월일 숫자' },
                      { id: 'ohaeng' as const, label: '🌊 오행 상성', desc: '5원소 기운' },
                      { id: 'mbti' as const, label: '🧠 MBTI', desc: (currentUserProfile?.mbti && otherProfile.mbti) ? '' : '둘 다 MBTI 필요', disabled: !(currentUserProfile?.mbti && otherProfile.mbti) },
                    ] as Array<{ id: typeof activeCompatMethod; label: string; desc: string; disabled?: boolean }>).map(m => (
                      <button key={m.id} onClick={() => !m.disabled && setActiveCompatMethod(m.id)} disabled={!!m.disabled}
                        className={`py-2 px-3 rounded-xl text-xs font-bold border-2 transition-all text-left ${
                          activeCompatMethod === m.id ? 'bg-violet-100 border-violet-400 text-violet-700' : m.disabled ? 'border-gray-100 text-gray-300 cursor-not-allowed bg-gray-50' : 'border-gray-200 text-gray-600 hover:border-violet-300 hover:text-violet-600'
                        }`}>
                        <p>{m.label}</p>
                        <p className="text-[9px] opacity-70 mt-0.5">{m.desc}</p>
                      </button>
                    ))}
                  </div>

                  {activeCompatMethod === 'saju' && compatResult && (
                    <div className="bg-violet-50 rounded-xl p-4 border border-violet-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-violet-600">12지신 궁합</span>
                        <span className="text-xl font-black text-violet-700">{compatResult.emoji} {compatResult.score}점</span>
                      </div>
                      <p className="text-sm font-bold text-gray-800">{compatResult.relation}</p>
                      <p className="text-xs text-gray-600 leading-relaxed">{compatResult.summary}</p>
                      <p className="text-xs text-violet-500 leading-relaxed">{compatResult.advice}</p>
                      <p className="text-[10px] text-gray-400 bg-white rounded-lg px-3 py-2 leading-relaxed">💡 태어난 해의 동물(띠)로 보는 전통 방식. 삼합·육합·상충 관계로 궁합을 읽어요.</p>
                    </div>
                  )}

                  {activeCompatMethod === 'numerology' && numerologyResult && (
                    <div className="bg-blue-50 rounded-xl p-4 border border-blue-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-blue-600">수비학 궁합</span>
                        <span className="text-xl font-black text-blue-700">🔢 {numerologyResult.score}점</span>
                      </div>
                      <div className="flex gap-3">
                        <div className="flex-1 bg-white rounded-xl p-3 text-center border border-blue-100">
                          <p className="text-[10px] text-gray-400">내 운명수</p>
                          <p className="text-2xl font-black text-purple-500 mt-0.5">{numerologyResult.num1}</p>
                        </div>
                        <div className="flex items-center text-gray-400 font-black">💕</div>
                        <div className="flex-1 bg-white rounded-xl p-3 text-center border border-blue-100">
                          <p className="text-[10px] text-gray-400">상대 운명수</p>
                          <p className="text-2xl font-black text-pink-500 mt-0.5">{numerologyResult.num2}</p>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600 leading-relaxed">{numerologyResult.desc}</p>
                      <p className="text-[10px] text-gray-400 bg-white rounded-lg px-3 py-2 leading-relaxed">💡 생년월일 숫자를 모두 더해 1자리로 줄인 '운명수'로 성격과 궁합을 봐요.</p>
                    </div>
                  )}

                  {activeCompatMethod === 'ohaeng' && ohaengCompatResult && (
                    <div className="bg-amber-50 rounded-xl p-4 border border-amber-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-amber-600">오행 상성</span>
                        <span className="text-xl font-black text-amber-700">{ohaengCompatResult.emoji} {ohaengCompatResult.score}점</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-bold">{currentUserProfile?.nickname ?? '나'}: {getOhaeng(myBirth!.y)}</span>
                        <span className="text-xs text-gray-400">×</span>
                        <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-bold">{otherProfile.nickname}: {getOhaeng(theirBirth!.y)}</span>
                      </div>
                      <p className="text-sm font-bold text-gray-800">{ohaengCompatResult.relation}</p>
                      <p className="text-xs text-gray-600 leading-relaxed">{ohaengCompatResult.summary}</p>
                      <p className="text-[10px] text-gray-400 bg-white rounded-lg px-3 py-2 leading-relaxed">💡 목·화·토·금·수 5가지 기운의 관계. 상생은 최고, 상극도 자극이 돼요.</p>
                    </div>
                  )}

                  {activeCompatMethod === 'mbti' && mbtiResult && (
                    <div className="bg-teal-50 rounded-xl p-4 border border-teal-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-teal-600">MBTI 궁합</span>
                        <span className="text-xl font-black text-teal-700">🧠 {mbtiResult.score}점</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 bg-teal-200 text-teal-800 text-xs font-black rounded-lg">{currentUserProfile?.mbti}</span>
                        <span className="text-gray-400">+</span>
                        <span className="px-2.5 py-1 bg-pink-200 text-pink-800 text-xs font-black rounded-lg">{otherProfile.mbti}</span>
                        <span className="text-[10px] text-gray-400 ml-1">{mbtiResult.overlap}/4 일치</span>
                      </div>
                      <p className="text-xs text-gray-600 leading-relaxed">{mbtiResult.note}</p>
                      <p className="text-[10px] text-gray-400 bg-white rounded-lg px-3 py-2 leading-relaxed">💡 4가지 성격 축이 얼마나 겹치는지. 반드시 많이 겹쳐야 좋은 건 아니에요!</p>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="px-5 pb-5 flex-shrink-0">
              <button onClick={() => setShowCompatModal(false)}
                className="w-full py-3 bg-violet-500 text-white font-semibold rounded-xl hover:bg-violet-600 transition-all">닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* 이미지 전체화면 뷰어 */}
      {imageViewer && (
        <div className="fixed inset-0 z-[200] bg-black flex items-center justify-center"
          onClick={() => setImageViewer(null)}>
          <img src={imageViewer} alt="이미지" className="max-w-full max-h-full object-contain select-none" />
          <button className="absolute top-4 right-4 w-10 h-10 bg-white/20 hover:bg-white/40 rounded-full flex items-center justify-center text-white text-xl transition-all"
            onClick={() => setImageViewer(null)}>✕</button>
        </div>
      )}

      {/* 롱프레스 컨텍스트 메뉴 */}
      {contextMenu && (
        <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)}>
          <div
            className="absolute bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden min-w-[170px]"
            style={{
              top: Math.min(contextMenu.y, window.innerHeight - 260),
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
          <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0">
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
          {messages.map((msg) => {
            const isMe = msg.sender_id === currentUserId;
            const time = new Date(msg.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
            const isCard = isContactCard(msg.content);
            const isSticker = !isCard && isStickerMsg(msg.content);
            const stickerIdx = isSticker ? parseStickerIdx(msg.content!) : -1;
            const isReply = !isCard && !isSticker && isReplyMsg(msg.content);
            const replyData = isReply ? parseReply(msg.content!) : null;
            const isInfoReqMsg     = !isCard && !isSticker && !isReply && isInfoReq(msg.content);
            const isInfoAckMsg     = !isCard && !isSticker && !isReply && !isInfoReqMsg && isInfoAck(msg.content);
            const isInfoDeclineMsg = !isCard && !isSticker && !isReply && !isInfoReqMsg && !isInfoAckMsg && isInfoDecline(msg.content);
            const reaction = reactions[msg.id];
            const isSwiping = swipeState?.msgId === msg.id;
            const swipeX = isSwiping ? swipeState!.offsetX : 0;
            const arrowVisible = isSwiping && Math.abs(swipeX) > 15;
            const arrowOpacity = Math.min(Math.abs(swipeX) / 55, 1);
            return (
              <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} relative`}>
                {arrowVisible && (
                  <div className="absolute inset-y-0 flex items-center pointer-events-none z-10"
                    style={{ [swipeX > 0 ? 'left' : 'right']: 0, opacity: arrowOpacity }}>
                    <span className="text-2xl select-none">↩️</span>
                  </div>
                )}
                <div
                  className={`flex items-end gap-1 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}
                  style={{ transform: `translateX(${swipeX}px)`, transition: isSwiping ? 'none' : 'transform 0.2s ease-out' }}
                  onTouchStart={(e) => onMsgTouchStart(e, msg)}
                  onTouchMove={(e) => onMsgTouchMove(e, msg)}
                  onTouchEnd={(e) => onMsgTouchEnd(e, msg)}
                  onContextMenu={(e) => handleMsgContextMenu(e, msg)}
                  onClick={() => handleTap(msg)}>

                  {isSticker && stickerIdx >= 0 && stickerIdx < STICKER_COUNT ? (
                    <div className="flex flex-col items-center select-none">
                      <StickerSVG idx={stickerIdx} size={160} />
                      <span className="text-[10px] text-gray-400 mt-0.5">{STICKER_LABELS[stickerIdx]}</span>
                    </div>
                  ) : (
                  <div className={`max-w-[72%] rounded-2xl overflow-hidden chat-bubble ${isMe ? 'chat-bubble-me bg-cyan-500 text-white rounded-br-md' : 'chat-bubble-other bg-white text-gray-900 rounded-bl-md shadow-sm'}`}>
                    {isCard ? (
                      <div className="px-4 py-3">
                        <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${isMe ? 'text-cyan-100' : 'text-cyan-600'}`}>📱 연락처</p>
                        {parseContactCard(msg.content!).map((line, i) => {
                          const val = line.split(': ').slice(1).join(': ');
                          return (
                            <div key={line || String(i)} className="flex items-center gap-1.5">
                              <p className="text-sm font-semibold flex-1">{line}</p>
                              <button onClick={() => navigator.clipboard?.writeText(val)}
                                className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold transition-all ${isMe ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                                복사
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : isReply && replyData ? (
                      <div className="pt-2 pb-0 px-0">
                        <div className={`mx-2 mb-1 rounded-xl px-3 py-1.5 text-[11px] leading-snug border-l-[3px] ${isMe ? 'bg-white/15 border-white/50 text-white/80' : 'bg-gray-100 border-cyan-400 text-gray-500'}`}>
                          {replyData.quote}
                        </div>
                        <p className="px-4 pb-2 text-sm leading-relaxed">{replyData.text}</p>
                      </div>
                    ) : isInfoReqMsg ? (() => {
                      const reqType = parseInfoReqType(msg.content!);
                      // O(1) 룩업 — 외부 useMemo Set 재활용 (map 내부 messages.some() O(n²) 차단)
                      const alreadyAcked    = ackedReqTypes.has(reqType);
                      const alreadyDeclined = declinedReqTypes.has(reqType);
                      const responded = alreadyAcked || alreadyDeclined;
                      return (
                        <div className="px-4 py-3 space-y-2">
                          <p className={`text-[10px] font-black uppercase tracking-wide ${isMe ? 'text-cyan-100' : 'text-amber-600'}`}>
                            {reqType === 'birthday' ? '🎂 생일 요청' : '📱 전화번호 요청'}
                          </p>
                          <p className="text-xs leading-relaxed">
                            {isMe
                              ? (reqType === 'birthday' ? '생일을 알려달라고 요청했어요' : '전화번호를 알려달라고 요청했어요')
                              : (reqType === 'birthday' ? '상대방이 생일을 알고 싶어해요' : '상대방이 전화번호를 알고 싶어해요')}
                          </p>
                          {!isMe && !responded && (
                            <div className="flex gap-2 pt-0.5">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleAcceptInfoReq(reqType); }}
                                className="flex-1 py-1.5 bg-cyan-500 text-white rounded-xl text-xs font-bold hover:bg-cyan-600 active:scale-95 transition-all">
                                ✓ 수락
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeclineInfoReq(reqType); }}
                                className="flex-1 py-1.5 bg-gray-200 text-gray-600 rounded-xl text-xs font-bold hover:bg-gray-300 active:scale-95 transition-all">
                                ✕ 거절
                              </button>
                            </div>
                          )}
                          {!isMe && alreadyAcked    && <p className="text-[10px] text-cyan-400 font-bold">✓ 수락했습니다</p>}
                          {!isMe && alreadyDeclined && <p className="text-[10px] text-gray-400">거절했습니다</p>}
                          {isMe  && alreadyAcked    && <p className="text-[10px] text-cyan-400 font-bold">✓ 상대방이 수락했어요</p>}
                          {isMe  && alreadyDeclined && <p className="text-[10px] text-gray-400">상대방이 거절했어요</p>}
                          {isMe  && !responded      && <p className="text-[10px] text-gray-400 italic">답변 대기 중…</p>}
                        </div>
                      );
                    })() : isInfoAckMsg ? (() => {
                      const { type, value } = parseInfoAckData(msg.content!);
                      return (
                        <div className="px-4 py-3 space-y-1.5">
                          <p className={`text-[10px] font-black uppercase tracking-widest ${isMe ? 'text-cyan-100' : 'text-cyan-600'}`}>
                            {type === 'birthday' ? '🎂 생일 공유' : '📱 전화번호 공유'}
                          </p>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold flex-1">{value}</p>
                            <button
                              onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(value); }}
                              className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold transition-all ${isMe ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                              복사
                            </button>
                          </div>
                        </div>
                      );
                    })() : isInfoDeclineMsg ? (
                      <div className="px-4 py-3">
                        <p className="text-xs text-center opacity-60">
                          {isMe
                            ? (parseInfoReqType(msg.content!) === 'birthday' ? '생일 공유를 거절했습니다' : '전화번호 공유를 거절했습니다')
                            : (parseInfoReqType(msg.content!) === 'birthday' ? '상대방이 생일 공유를 거절했어요' : '상대방이 전화번호 공유를 거절했어요')}
                        </p>
                      </div>
                    ) : msg.image_url ? (
                      <img
                        src={msg.image_url} alt="이미지"
                        loading="lazy"
                        className="max-w-[240px] w-full object-contain cursor-pointer active:opacity-80"
                        onClick={(e) => { e.stopPropagation(); setImageViewer(msg.image_url!); }} />
                    ) : (
                      <p className="px-4 py-2 text-sm leading-relaxed">{msg.content}</p>
                    )}
                  </div>
                  )}
                  <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} self-end mb-0.5 shrink-0`}>
                    {isMe && myUnreadIds.has(msg.id) && (
                      <span className="text-[11px] font-black text-yellow-400 leading-none mb-0.5">1</span>
                    )}
                    <span className="text-[10px] text-gray-400 whitespace-nowrap">{time}</span>
                  </div>
                </div>
                {reaction && (
                  <button
                    onClick={() => setReactions(prev => { const n = { ...prev }; delete n[msg.id]; return n; })}
                    className={`mt-0.5 text-base px-2 py-0.5 rounded-full border shadow-sm bg-white transition-all active:scale-95 ${isMe ? 'mr-8' : 'ml-8'}`}>
                    {reaction}
                  </button>
                )}
              </div>
            );
          })}
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
        <div className="bg-white border-t border-gray-200 max-w-3xl w-full mx-auto">
          {/* 카테고리 탭 */}
          <div className="flex border-b border-gray-100 px-1 bg-gray-50">
            {EMOJI_CATEGORIES.map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setEmojiCat(cat.id)}
                className={`flex-1 flex flex-col items-center pt-1.5 pb-1 gap-0 transition-all relative ${
                  emojiCat === cat.id
                    ? 'opacity-100'
                    : 'opacity-40 hover:opacity-70'
                }`}
              >
                <span className="text-lg leading-tight">{cat.label}</span>
                <span className="text-[8px] font-bold text-gray-500 leading-tight">{cat.name}</span>
                {emojiCat === cat.id && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-cyan-500" />
                )}
              </button>
            ))}
          </div>
          {/* 이모지 그리드 */}
          <div className="grid grid-cols-10 gap-0 p-1.5 max-h-44 overflow-y-auto">
            {(EMOJI_CATEGORIES.find(c => c.id === emojiCat)?.emojis ?? []).map(emoji => (
              <button key={emoji} type="button" onClick={() => handleEmojiClick(emoji)}
                className="h-9 flex items-center justify-center text-xl hover:bg-gray-100 active:scale-90 rounded-lg transition-all">
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 스티커 패널 — 분류 탭 */}
      {showStickers && (() => {
        const pack = STICKER_PACKS[stickerCat] ?? STICKER_PACKS[0];
        return (
          <div className="bg-white border-t border-gray-200 max-w-3xl w-full mx-auto">
            {/* 헤더 */}
            <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2">
              <span className="text-xs font-black text-rose-500">🎨 이모티콘</span>
              <span className="text-[10px] text-gray-400 flex-1">탭하면 바로 전송</span>
              <span className="text-[10px] text-gray-300">{pack.count}개</span>
            </div>
            {/* 분류 탭 */}
            <div className="flex gap-1 px-2 pt-2 pb-1 overflow-x-auto scrollbar-none border-b border-gray-100">
              {STICKER_PACKS.map((p, idx) => {
                const active = stickerCat === idx;
                // 라벨에서 이모지만 추출 (첫 번째 '공백' 이전 부분)
                const emoji = p.label.split(' ')[0];
                const shortName = p.label.split(' ').slice(1).join('');
                return (
                  <button key={p.label} type="button"
                    onClick={() => setStickerCat(idx)}
                    className={`flex-shrink-0 flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-xl transition-all ${active ? 'bg-rose-50' : 'hover:bg-gray-50'}`}
                  >
                    <span className="text-base leading-none">{emoji}</span>
                    <span className={`text-[9px] font-bold leading-none whitespace-nowrap ${active ? 'text-rose-500' : 'text-gray-400'}`}>{shortName}</span>
                    {active && <div className="w-4 h-0.5 bg-rose-400 rounded-full mt-0.5" />}
                  </button>
                );
              })}
            </div>
            {/* 스티커 그리드 — 선택된 팩만 표시 */}
            <div className="grid grid-cols-4 gap-1.5 p-2.5 max-h-52 overflow-y-auto">
              {Array.from({ length: pack.count }, (_, i) => {
                const idx = pack.start + i;
                return (
                  <button key={idx} type="button"
                    onClick={() => { onSend(`__sticker__${idx}`); setShowStickers(false); }}
                    style={{ backgroundColor: STICKER_BG[idx] }}
                    className="flex flex-col items-center justify-center gap-0.5 p-1.5 rounded-2xl active:scale-90 transition-transform hover:opacity-90">
                    <StickerSVG idx={idx} size={72} />
                    <span className="text-[9px] font-bold text-gray-500 text-center leading-tight truncate w-full px-0.5">{STICKER_LABELS[idx]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* 빠른 메시지 패널 */}
      {showQuickMsgs && (
        <div className="bg-white border-t border-gray-200 max-w-3xl w-full mx-auto">
          <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2">
            <span className="text-xs font-black text-violet-500">⚡ 빠른 메시지</span>
            <span className="text-[10px] text-gray-400 flex-1">탭하면 바로 전송</span>
          </div>
          <div className="max-h-52 overflow-y-auto p-2 space-y-1">
            {QUICK_MSGS.map((qm) => (
              <button key={qm} type="button"
                onClick={() => { onSend(qm); setShowQuickMsgs(false); }}
                className="w-full text-left text-sm px-3 py-2.5 rounded-xl hover:bg-violet-50 active:bg-violet-100 transition-colors text-gray-700 font-medium leading-relaxed border border-transparent hover:border-violet-100">
                {qm}
              </button>
            ))}
          </div>
        </div>
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
                <div className="flex gap-2">
                  <div className="flex-1">
                    <input
                      type="number" min="1" max="12" placeholder="월 (1~12)"
                      value={myInfoForm.birthMonth}
                      onChange={e => setMyInfoForm(f => ({ ...f, birthMonth: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-emerald-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                    />
                  </div>
                  <div className="flex-1">
                    <input
                      type="number" min="1" max="31" placeholder="일 (1~31)"
                      value={myInfoForm.birthDay}
                      onChange={e => setMyInfoForm(f => ({ ...f, birthDay: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-emerald-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
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

      <footer className="bg-white border-t border-gray-200 shrink-0">
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
        {chatError && (
          <div className="max-w-3xl mx-auto px-3 pt-2">
            <p className="text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-lg border border-red-200">{chatError}</p>
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
            onChange={(e) => { setInput(e.target.value); onInputChange?.(e.target.value); autoResizeTextarea(); }}
            onInput={autoResizeTextarea}
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
