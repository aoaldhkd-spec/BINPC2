import { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, Send, MessageCircle, Smile, ImageIcon, Phone,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getZodiac, getOhaeng, getCompatibility, getOhaengCompat, getNumerologyCompat, getMbtiCompat, getTodayFortune } from '../lib/fortune';
import { StickerSVG, STICKER_LABELS, STICKER_BG, STICKER_COUNT } from '../stickers';
import { hasBannedWord } from '../lib/utils';
import type { Message, Profile, ContactShare } from '../types/app';

// ─── ChatScreen ───────────────────────────────────────────────────────────────
// 1:1 채팅 화면. 스티커·이모지·이미지·연락처 공유·궁합·사주 기능 포함.

const EMOJIS = [
  '😀','😂','🥰','😍','🤩','😎','🥳','😜','😏','🙄',
  '❤️','💕','💖','💗','🔥','✨','🌟','💯','👍','🙏',
  '🎉','🎊','🤣','😭','😅','😆','🤗','😋','😊','🥹',
  '👋','🫶','🤝','💪','🫠','🤔','😮','😱','🤯','😴',
  '🍺','🍻','🥂','🍷','🎶','🎵','🎸','⚡','🌈','🌙',
  '🐶','🐱','🐼','🦊','🦁','🐻','🐨','🐸','🦋','🌸',
];

function ChatScreen({ chatId, messages, currentUserId, otherProfile, onSend, onSendImage, onBack, onReset, onDeleteMessage, currentUserProfile, receivedContactShares, contactSharedWithIds, onGoToTab }: {
  chatId: string;
  messages: Message[]; currentUserId: string; otherProfile: Profile;
  onSend: (content: string) => void;
  onSendImage: (file: File) => Promise<string | null>;
  onBack: () => void; onReset: () => void;
  onDeleteMessage: (msgId: string) => void;
  currentUserProfile: Profile | null;
  receivedContactShares?: ContactShare[];
  contactSharedWithIds?: Set<string>;
  onGoToTab?: (tab: string) => void;
}) {
  const [input, setInput] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [showQuickMsgs, setShowQuickMsgs] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [chatError, setChatError] = useState('');
  const [showTheirContact, setShowTheirContact] = useState(false);
  const [showCompatModal, setShowCompatModal] = useState(false);
  const [showSajuModal, setShowSajuModal] = useState(false);
  const [activeCompatMethod, setActiveCompatMethod] = useState<'saju' | 'numerology' | 'ohaeng' | 'mbti'>('saju');

  const theirShare = receivedContactShares?.find(s => s.liker_id === otherProfile.id) ?? null;
  const iSharedMine = contactSharedWithIds?.has(otherProfile.id) ?? false;

  const myBirth = currentUserProfile?.birth_year && currentUserProfile?.birth_month && currentUserProfile?.birth_day
    ? { y: currentUserProfile.birth_year, m: currentUserProfile.birth_month, d: currentUserProfile.birth_day } : null;
  const theirBirth = otherProfile.birth_year && otherProfile.birth_month && otherProfile.birth_day
    ? { y: otherProfile.birth_year, m: otherProfile.birth_month, d: otherProfile.birth_day } : null;
  const hasBothBirthdays = !!(myBirth && theirBirth);

  const compatResult = hasBothBirthdays
    ? getCompatibility(myBirth!.y, myBirth!.m, myBirth!.d, theirBirth!.y, theirBirth!.m, theirBirth!.d) : null;
  const ohaengCompatResult = hasBothBirthdays
    ? getOhaengCompat(myBirth!.y, theirBirth!.y) : null;
  const numerologyResult = hasBothBirthdays
    ? getNumerologyCompat(myBirth!.y, myBirth!.m, myBirth!.d, theirBirth!.y, theirBirth!.m, theirBirth!.d) : null;
  const mbtiResult = (currentUserProfile?.mbti && otherProfile.mbti)
    ? getMbtiCompat(currentUserProfile.mbti, otherProfile.mbti) : null;

  const myFortune = myBirth ? getTodayFortune(myBirth.y, myBirth.m, myBirth.d) : null;
  const theirFortune = theirBirth ? getTodayFortune(theirBirth.y, theirBirth.m, theirBirth.d) : null;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const initialMsgIds = useRef(new Set(messages.map(m => m.id)));
  const [myUnreadIds, setMyUnreadIds] = useState<Set<string>>(new Set());

  const [contextMenu, setContextMenu] = useState<{ msgId: string; content: string; isMine: boolean; imgUrl?: string; x: number; y: number } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [replyTo, setReplyTo] = useState<{ id: string; snippet: string; isMe: boolean } | null>(null);

  const [swipeState, setSwipeState] = useState<{ msgId: string; offsetX: number } | null>(null);
  const swipeTouchRef = useRef<{ msgId: string; startX: number; startY: number; swiping: boolean } | null>(null);

  const [imageViewer, setImageViewer] = useState<string | null>(null);
  const [reactions, setReactions] = useState<Record<string, string>>({});
  const lastTapRef = useRef<{ id: string; time: number } | null>(null);

  const QUICK_MSGS = [
    '오늘 즐거웠어요 ☺️', '술 한 잔 더 할래요? 🍺', '번호 교환해요! 📱', '이따가 연락해요 ☎️',
    '오늘 인연인 것 같아요 💕', '어디서 오셨어요?', '맥주 VS 소주 어느 쪽이에요?',
    '오늘 처음 나오셨어요?', '자주 이런 모임 나오세요?', '카카오 아이디 알려줘도 돼요? 🐣',
    '잠깐 밖에 나갈래요? 🌙', '오늘 정말 재미있었어요! 또 봐요 👋', '밥은 드셨어요? 🍚',
    '다음에 또 만나요 ✨', '저 마음에 드세요? (◕‿◕✿)', '같이 사진 찍어요! 📸',
    '인스타 팔로우해도 될까요?', '오늘 처음 뵙는데 반가워요!',
  ];

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

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
          const row = (payload as { new?: { reader_id?: string } }).new;
          if (row?.reader_id && row.reader_id !== currentUserId) {
            setMyUnreadIds(new Set());
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [chatId, currentUserId]);

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

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) { setShowEmoji(false); return; }
    if (hasBannedWord(input.trim())) {
      setChatError('부적절한 표현이 포함되어 있어 전송할 수 없습니다.');
      return;
    }
    setChatError('');
    const text = replyTo ? `__reply__${replyTo.snippet}\n${input.trim()}` : input.trim();
    onSend(text);
    setInput('');
    setReplyTo(null);
    setShowEmoji(false);
  };

  const handleEmojiClick = (emoji: string) => { setInput((prev) => prev + emoji); inputRef.current?.focus(); };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setChatError('');
    const err = await onSendImage(file);
    if (err) setChatError(`사진 전송 실패: ${err}`);
    setUploading(false);
    e.target.value = '';
    setShowEmoji(false);
  };

  const cancelLP = () => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } };

  const onMsgTouchStart = (e: React.TouchEvent, msg: Message) => {
    const t = e.touches[0];
    swipeTouchRef.current = { msgId: msg.id, startX: t.clientX, startY: t.clientY, swiping: false };
    longPressTimer.current = setTimeout(() => {
      if (!swipeTouchRef.current?.swiping) {
        setContextMenu({ msgId: msg.id, content: msg.content ?? '', isMine: msg.sender_id === currentUserId, imgUrl: msg.image_url ?? undefined, x: t.clientX, y: t.clientY });
      }
    }, 500);
  };

  const onMsgTouchMove = (e: React.TouchEvent, msg: Message) => {
    const ref = swipeTouchRef.current;
    if (!ref || ref.msgId !== msg.id) return;
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
  };

  const onMsgTouchEnd = (_e: React.TouchEvent, msg: Message) => {
    cancelLP();
    if (swipeState?.msgId === msg.id && Math.abs(swipeState.offsetX) >= 55) {
      const snippet = msg.image_url ? '[이미지]' : (msg.content ?? '').slice(0, 40);
      setReplyTo({ id: msg.id, snippet, isMe: msg.sender_id === currentUserId });
      setTimeout(() => inputRef.current?.focus(), 100);
    }
    swipeTouchRef.current = null;
    setSwipeState(null);
  };

  const handleMsgContextMenu = (e: React.MouseEvent, msg: Message) => {
    e.preventDefault();
    setContextMenu({ msgId: msg.id, content: msg.content ?? '', isMine: msg.sender_id === currentUserId, imgUrl: msg.image_url ?? undefined, x: e.clientX, y: e.clientY });
  };

  const handleTap = (msg: Message) => {
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
  };

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

  const QUICK_REACTIONS = ['❤️', '😂', '👍', '🔥', '😮', '😢'];
  const hasContact = !!(currentUserProfile?.kakao_id || currentUserProfile?.instagram_id || currentUserProfile?.phone_number);

  return (
    <div className="fixed inset-0 bg-gray-100 flex flex-col" style={{ height: '100dvh', paddingTop: 'env(safe-area-inset-top)' }}>

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
                    <p className="text-sm font-bold text-gray-800 truncate">{theirShare.kakao}</p>
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
                    <p className="text-sm font-bold text-gray-800 truncate">{theirShare.instagram}</p>
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
                    <p className="text-sm font-bold text-gray-800 truncate">{theirShare.phone}</p>
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
            {contextMenu.imgUrl && (
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
        <div className="max-w-3xl mx-auto px-3 py-2.5 flex items-center gap-2">
          <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0">
            <img src={otherProfile.photo_url} alt={otherProfile.nickname} className="w-full h-full object-cover" />
          </div>
          <h2 className="font-semibold text-gray-900 flex-1 truncate text-sm">{otherProfile.nickname}</h2>
          <button
            onClick={() => setShowSajuModal(true)}
            className="flex items-center gap-1 px-2 py-1.5 bg-amber-50 text-amber-600 text-xs font-bold rounded-xl border border-amber-200 hover:bg-amber-100 transition-all active:scale-95 flex-shrink-0">
            📅 사주
          </button>
          <button
            onClick={() => { setActiveCompatMethod('saju'); setShowCompatModal(true); }}
            className="flex items-center gap-1 px-2 py-1.5 bg-violet-50 text-violet-600 text-xs font-bold rounded-xl border border-violet-200 hover:bg-violet-100 transition-all active:scale-95 flex-shrink-0">
            🔮 궁합
          </button>
          {theirShare && (
            <button onClick={() => setShowTheirContact(true)}
              className="flex items-center gap-1 px-2 py-1.5 bg-teal-50 text-teal-600 text-xs font-bold rounded-xl border border-teal-200 hover:bg-teal-100 transition-all active:scale-95 flex-shrink-0">
              ✓ 공유완료
            </button>
          )}
          {iSharedMine ? (
            <span className="text-xs text-gray-400 flex-shrink-0">📤 공유함</span>
          ) : (
            <button onClick={handleShareContact}
              className={`flex items-center gap-1 px-2 py-1.5 text-xs font-bold rounded-xl border transition-all active:scale-95 flex-shrink-0 ${
                hasContact
                  ? 'bg-cyan-50 text-cyan-600 border-cyan-200 hover:bg-cyan-100'
                  : 'bg-gray-50 text-gray-400 border-gray-200'
              }`}>
              📱 공유
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-3xl mx-auto px-4 py-4 space-y-1">
          {messages.map((msg) => {
            const isMe = msg.sender_id === currentUserId;
            const time = new Date(msg.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
            const isCard = isContactCard(msg.content);
            const isSticker = !isCard && isStickerMsg(msg.content);
            const stickerIdx = isSticker ? parseStickerIdx(msg.content!) : -1;
            const isReply = !isCard && !isSticker && isReplyMsg(msg.content);
            const replyData = isReply ? parseReply(msg.content!) : null;
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
                  <div className={`max-w-[72%] rounded-2xl overflow-hidden ${isMe ? 'bg-cyan-500 text-white rounded-br-md' : 'bg-white text-gray-900 rounded-bl-md shadow-sm'}`}>
                    {isCard ? (
                      <div className="px-4 py-3">
                        <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${isMe ? 'text-cyan-100' : 'text-cyan-600'}`}>📱 연락처</p>
                        {parseContactCard(msg.content!).map((line, i) => {
                          const val = line.split(': ').slice(1).join(': ');
                          return (
                            <div key={i} className="flex items-center gap-1.5">
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
                    ) : msg.image_url ? (
                      <img
                        src={msg.image_url} alt="이미지"
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
          <div className="grid grid-cols-10 gap-1 p-3">
            {EMOJIS.map((emoji) => (
              <button key={emoji} type="button" onClick={() => handleEmojiClick(emoji)}
                className="h-9 flex items-center justify-center text-xl hover:bg-gray-100 rounded-lg transition-colors">
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 스티커 패널 */}
      {showStickers && (
        <div className="bg-white border-t border-gray-200 max-w-3xl w-full mx-auto">
          <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2">
            <span className="text-xs font-black text-rose-500">🎨 이모티콘</span>
            <span className="text-[10px] text-gray-400 flex-1">탭하면 바로 전송</span>
            <span className="text-[10px] text-gray-300">{STICKER_COUNT}개</span>
          </div>
          <div className="max-h-72 overflow-y-auto pb-2">
            {[
              { label: '🐻‍❄️ 술이', color: 'violet', start: 0, count: 8 },
              { label: '🔥 MZ밈', color: 'yellow', start: 8, count: 8 },
              { label: '🟢 젤리', color: 'teal', start: 16, count: 8 },
            ].map(({ label, color, start, count }) => (
              <div key={label}>
                <div className={`px-3 pt-2 pb-1 flex items-center gap-1.5`}>
                  <span className={`text-[10px] font-black text-${color}-500`}>{label}</span>
                  <div className={`flex-1 h-px bg-${color}-100`}/>
                </div>
                <div className="grid grid-cols-4 gap-1.5 px-2.5">
                  {Array.from({ length: count }, (_, i) => (
                    <button key={start + i} type="button"
                      onClick={() => { onSend(`__sticker__${start + i}`); setShowStickers(false); }}
                      style={{ backgroundColor: STICKER_BG[start + i] }}
                      className="flex flex-col items-center justify-center gap-0.5 p-1.5 rounded-2xl active:scale-90 transition-transform hover:opacity-90">
                      <StickerSVG idx={start + i} size={72} />
                      <span className="text-[9px] font-bold text-gray-500 text-center leading-tight truncate w-full px-0.5">{STICKER_LABELS[start + i]}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 빠른 메시지 패널 */}
      {showQuickMsgs && (
        <div className="bg-white border-t border-gray-200 max-w-3xl w-full mx-auto">
          <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2">
            <span className="text-xs font-black text-violet-500">⚡ 빠른 메시지</span>
            <span className="text-[10px] text-gray-400 flex-1">탭하면 바로 전송</span>
          </div>
          <div className="max-h-52 overflow-y-auto p-2 space-y-1">
            {QUICK_MSGS.map((qm, i) => (
              <button key={i} type="button"
                onClick={() => { onSend(qm); setShowQuickMsgs(false); }}
                className="w-full text-left text-sm px-3 py-2.5 rounded-xl hover:bg-violet-50 active:bg-violet-100 transition-colors text-gray-700 font-medium leading-relaxed border border-transparent hover:border-violet-100">
                {qm}
              </button>
            ))}
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
            <div className="flex-1 bg-cyan-50 border-l-4 border-cyan-400 rounded-r-xl px-3 py-1.5 text-xs text-gray-600 truncate">
              <span className="font-bold text-cyan-600 mr-1">{replyTo.isMe ? '내 메시지' : otherProfile.nickname}에 답장</span>
              {replyTo.snippet}
            </div>
            <button onClick={() => setReplyTo(null)}
              className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-300 text-xs shrink-0">✕</button>
          </div>
        )}
        <form onSubmit={handleSend} className="max-w-3xl mx-auto px-3 py-2.5 flex items-center gap-2">
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="p-2 text-gray-400 hover:text-cyan-500 hover:bg-cyan-50 rounded-full transition-all disabled:opacity-50 shrink-0">
            <ImageIcon className="w-5 h-5" />
          </button>
          <button type="button"
            onClick={() => { setShowEmoji(p => !p); setShowStickers(false); setShowQuickMsgs(false); }}
            className={`p-2 rounded-full transition-all shrink-0 ${showEmoji ? 'text-cyan-500 bg-cyan-50' : 'text-gray-400 hover:text-cyan-500 hover:bg-cyan-50'}`}>
            <Smile className="w-5 h-5" />
          </button>
          <button type="button"
            onClick={() => { setShowStickers(p => !p); setShowEmoji(false); setShowQuickMsgs(false); }}
            className={`p-1.5 rounded-full transition-all text-lg leading-none shrink-0 ${showStickers ? 'bg-rose-100' : 'hover:bg-rose-50'}`}
            title="이모티콘">
            🎨
          </button>
          <button type="button"
            onClick={() => { setShowQuickMsgs(p => !p); setShowEmoji(false); setShowStickers(false); }}
            className={`p-1.5 rounded-full transition-all text-lg leading-none shrink-0 ${showQuickMsgs ? 'bg-violet-100' : 'hover:bg-violet-50'}`}
            title="빠른 메시지">
            ⚡
          </button>
          <input ref={inputRef} type="text" value={input} onChange={(e) => setInput(e.target.value)}
            placeholder={uploading ? '업로드 중...' : replyTo ? '답장 입력...' : '메시지를 입력하세요...'}
            disabled={uploading}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-full focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition-all text-sm disabled:opacity-60 min-w-0" />
          <button type="submit" disabled={!input.trim() || uploading}
            className="p-2 bg-cyan-500 text-white rounded-full hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shrink-0">
            <Send className="w-5 h-5" />
          </button>
        </form>
      </footer>
    </div>
  );
}

export default ChatScreen;
