import { useState, useEffect, useRef, useCallback, useMemo, Component, ReactNode } from 'react';
import {
  Heart, MessageCircle, Send, ArrowLeft, Users, ChevronRight, ChevronDown,
  LayoutGrid, Clock, Smile, ImageIcon, Phone, CheckCircle, Copy,
  Eye, UserCheck, Gamepad2, X, MapPin, RefreshCw, Info, BookOpen,
  BarChart3, Trophy, Lock, XCircle, Wifi, WifiOff, QrCode, AlertTriangle, ShieldAlert, Maximize2,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import type { Database } from './types/database';
import SeatingMap from './components/SeatingMap';
import { StatsTab, RankingTab } from './components/StatsTabs';
import ProfileAvatar from './components/ProfileAvatar';
import QRCode from 'qrcode';
import { getPositionLabel, getPositionBg, getDomSubLabel, getDomSubBg, genAvatar, getKoreanAge } from './lib/profile';
import { HEART_TYPES, HeartType } from './lib/constants';

// ── Korean 초성 search utility ─────────────────────────────────────────────
const CHOSUNG_LIST = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
function getKoreanChosung(str: string): string {
  return str.split('').map(ch => {
    const code = ch.charCodeAt(0) - 0xAC00;
    if (code < 0 || code > 11171) return ch;
    return CHOSUNG_LIST[Math.floor(code / 588)];
  }).join('');
}
function koreanMatch(text: string, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (text.toLowerCase().includes(q)) return true;
  const isChosung = [...q].every(c => CHOSUNG_LIST.includes(c));
  if (isChosung) return getKoreanChosung(text).includes(q);
  return false;
}

type Profile = Database['public']['Tables']['profiles']['Row'];
type Message = Database['public']['Tables']['messages']['Row'];
type Seat = Database['public']['Tables']['seats']['Row'];
type ContactShare = Database['public']['Tables']['contact_shares']['Row'];
type Suggestion = Database['public']['Tables']['suggestions']['Row'];
type BalanceGame = Database['public']['Tables']['balance_games']['Row'];
type BalanceVote = Database['public']['Tables']['balance_votes']['Row'];
type AnonymousReport = Database['public']['Tables']['anonymous_reports']['Row'];

type Chat = {
  id: string;
  user1_id: string;
  user2_id: string;
  created_at: string;
  lastMessage?: string;
  messageCount?: number;
};

const BIO_CATEGORIES = [
  {
    label: '뜨밤 & 기타',
    tags: ['뜨밤', '기타'],
    color: {
      label: 'text-pink-500',
      normal: 'bg-pink-50 border-pink-200 text-pink-600 hover:bg-pink-500 hover:border-pink-500 hover:text-white',
      selected: 'bg-pink-500 border-pink-500 text-white shadow-sm',
    },
  },
  {
    label: '스포츠/활동',
    tags: ['운동', '헬스', '필라테스/요가', '골프', '테니스', '자전거', '등산', '낚시', '수영', '클라이밍', '축구/풋살', '배드민턴', '볼링', '스키/보드'],
    color: {
      label: 'text-green-500',
      normal: 'bg-green-50 border-green-200 text-green-700 hover:bg-green-500 hover:border-green-500 hover:text-white',
      selected: 'bg-green-500 border-green-500 text-white shadow-sm',
    },
  },
  {
    label: '음식/음주',
    tags: ['카페', '맛집탐방', '술자리', '요리', '디저트', '와인', '위스키', '브런치'],
    color: {
      label: 'text-amber-500',
      normal: 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-500 hover:border-amber-500 hover:text-white',
      selected: 'bg-amber-500 border-amber-500 text-white shadow-sm',
    },
  },
  {
    label: '취미/라이프',
    tags: ['여행', '쇼핑', '반려동물', '사진찍기', '독서', '드라이브', '인테리어', '원예/식물', '자기계발', '명상/요가'],
    color: {
      label: 'text-sky-500',
      normal: 'bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-500 hover:border-sky-500 hover:text-white',
      selected: 'bg-sky-500 border-sky-500 text-white shadow-sm',
    },
  },
  {
    label: '엔터/미디어',
    tags: ['영화/드라마', '음악감상', 'OTT', '유튜브', '게임', '웹툰', '공연/전시', '라이브방송', '팝/힙합', '재즈/클래식'],
    color: {
      label: 'text-rose-500',
      normal: 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-500 hover:border-rose-500 hover:text-white',
      selected: 'bg-rose-500 border-rose-500 text-white shadow-sm',
    },
  },
  {
    label: '여가/사교',
    tags: ['보드게임', '노래방', '방탈출', '클럽/바', '독서모임', '소모임', '봉사활동', '맥주축제', '야구직관', '페스티벌'],
    color: {
      label: 'text-orange-500',
      normal: 'bg-orange-50 border-orange-200 text-orange-600 hover:bg-orange-500 hover:border-orange-500 hover:text-white',
      selected: 'bg-orange-500 border-orange-500 text-white shadow-sm',
    },
  },
];

const BANNED_WORDS = [
  // 욕설
  '씨발','시발','씨팔','ㅆㅂ','개새끼','씹새','병신','ㅂㅅ','찐따','꼴통',
  '닥쳐','꺼져','지랄','ㅈㄹ','개소리','보지','자지','창녀','창남',
  // 패드립
  '니미','니맘','느그엄마','느그아빠','니애미','니애비','네미','니어미',
  // 정치적 발언
  '문재인','윤석열','이재명','한동훈','박근혜','홍준표',
  '국민의힘','더불어민주당','민주당','공산당','좌빨','빨갱이',
];

function hasBannedWord(text: string): boolean {
  const t = text.replace(/\s/g, '');
  return BANNED_WORDS.some((w) => t.includes(w));
}

const EMOJIS = [
  '😀','😂','🥰','😍','🤩','😎','🥳','😜','😏','🙄',
  '❤️','💕','💖','💗','🔥','✨','🌟','💯','👍','🙏',
  '🎉','🎊','🤣','😭','😅','😆','🤗','😋','😊','🥹',
  '👋','🫶','🤝','💪','🫠','🤔','😮','😱','🤯','😴',
  '🍺','🍻','🥂','🍷','🎶','🎵','🎸','⚡','🌈','🌙',
  '🐶','🐱','🐼','🦊','🦁','🐻','🐨','🐸','🦋','🌸',
];

const POSITION_OPTIONS: { label: string; val: number }[] = [
  { label: '비선호', val: -1 },
  { label: '개바텀', val: 0 },
  { label: '바텀', val: 15 },
  { label: '올텀', val: 35 },
  { label: '올', val: 50 },
  { label: '올탑', val: 70 },
  { label: '탑', val: 90 },
  { label: '퓨어탑', val: 100 },
];

const DOM_SUB_OPTIONS: { label: string; val: number }[] = [
  { label: '완전섭', val: 0 },
  { label: '섭', val: 25 },
  { label: '스위치', val: 50 },
  { label: '돔', val: 75 },
  { label: '완전돔', val: 100 },
];

type View = 'entry-1' | 'loading-main' | 'main' | 'profile' | 'chat';
type MainTab = 'profiles' | 'seating' | 'status' | 'chats' | 'suggestions' | 'game' | 'tutorial' | 'stats' | 'ranking';

// ─── Seat Register Dialog ─────────────────────────────────────────────────────

function SeatRegisterDialog({
  seat, currentUserSeat, onConfirm, onCancel,
}: {
  seat: Seat; currentUserSeat: Seat | null; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-cyan-50 border-2 border-dashed border-cyan-300 flex items-center justify-center mx-auto mb-3">
            <span className="text-cyan-500 text-2xl font-light">+</span>
          </div>
          <h3 className="text-lg font-bold text-gray-900">{seat.seat_label}</h3>
          {currentUserSeat ? (
            <p className="text-sm text-amber-600 mt-1.5">
              현재 <strong>{currentUserSeat.seat_label}</strong>에 있습니다.<br />자리를 변경하시겠습니까?
            </p>
          ) : (
            <p className="text-sm text-gray-500 mt-1.5">이 자리에 등록하시겠습니까?</p>
          )}
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-all">취소</button>
          <button onClick={onConfirm} className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-semibold rounded-xl hover:from-cyan-600 hover:to-teal-600 transition-all">등록</button>
        </div>
      </div>
    </div>
  );
}

// ─── Game Types ───────────────────────────────────────────────────────────────

export interface GameState {
  active: boolean;
  type: 'balance' | 'image' | 'custom' | 'dice' | 'roulette' | 'ladder';
  title: string;
  description: string;
  rules: string;
  penalty: string;
  option_a?: string;
  option_b?: string;
  game_id?: string;
  image_url?: string;
  started_at?: string;
  table_number?: number;
  result?: string;
  roulette_options?: string[];
  ladder_participants?: string[];
  ladder_prizes?: string[];
}

const GAME_TYPE_LABELS: Record<GameState['type'], string> = {
  balance: '밸런스 게임',
  image: '이미지 게임',
  custom: '커스텀 게임',
  dice: '주사위 게임',
  roulette: '룰렛',
  ladder: '사다리타기',
};

const GAME_TYPE_ICONS: Record<GameState['type'], string> = {
  balance: '⚖️',
  image: '🖼️',
  custom: '🎯',
  dice: '🎲',
  roulette: '🎡',
  ladder: '🪜',
};

// ─── Game Announcement Modal ──────────────────────────────────────────────────

function DiceDisplay({ result }: { result?: string }) {
  const diceFaces: Record<string, string> = { '1':'⚀','2':'⚁','3':'⚂','4':'⚃','5':'⚄','6':'⚅' };
  const face = result ? (diceFaces[result] ?? result) : null;
  return (
    <div className="flex flex-col items-center py-4">
      {face ? (
        <div className="text-center">
          <div className="text-9xl mb-2 animate-bounce">{face}</div>
          <p className="text-2xl font-black text-white">{result}이 나왔습니다!</p>
        </div>
      ) : (
        <div className="text-center">
          <div className="text-7xl mb-3 opacity-50">🎲</div>
          <p className="text-sm text-slate-400">관리자가 주사위를 굴리는 중...</p>
        </div>
      )}
    </div>
  );
}

function RouletteDisplay({ result, options }: { result?: string; options?: string[] }) {
  const [spinning, setSpinning] = useState(!result);
  const [displayResult, setDisplayResult] = useState(result);
  useEffect(() => {
    if (result && !displayResult) {
      setSpinning(true);
      const t = setTimeout(() => { setSpinning(false); setDisplayResult(result); }, 1500);
      return () => clearTimeout(t);
    }
    setDisplayResult(result);
    return undefined;
  }, [result]);
  return (
    <div className="flex flex-col items-center py-4">
      {spinning ? (
        <div className="text-center">
          <div className="text-7xl mb-3 animate-spin" style={{ animationDuration: '0.3s' }}>🎡</div>
          <p className="text-sm text-slate-400">룰렛이 돌아가는 중...</p>
        </div>
      ) : displayResult ? (
        <div className="text-center">
          <div className="text-5xl mb-3">🏆</div>
          <p className="text-xs font-bold text-violet-300 uppercase tracking-widest mb-2">당첨!</p>
          <div className="bg-gradient-to-r from-violet-600 to-purple-600 rounded-2xl px-6 py-4">
            <p className="text-2xl font-black text-white">{displayResult}</p>
          </div>
        </div>
      ) : (
        <div className="text-center">
          {options && options.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2 mb-3">
              {options.map((opt, i) => (
                <span key={i} className="px-3 py-1 bg-violet-500/20 border border-violet-500/40 rounded-full text-sm text-violet-200">{opt}</span>
              ))}
            </div>
          )}
          <div className="text-7xl mb-2 opacity-50">🎡</div>
          <p className="text-sm text-slate-400">관리자가 룰렛을 돌리는 중...</p>
        </div>
      )}
    </div>
  );
}

function LadderDisplay({ result, participants, prizes }: { result?: string; participants?: string[]; prizes?: string[] }) {
  const pairs: { participant: string; prize: string }[] = [];
  if (result) {
    try { const parsed = JSON.parse(result); if (Array.isArray(parsed)) pairs.push(...parsed); } catch {}
  }
  return (
    <div className="flex flex-col items-center py-3 w-full">
      {pairs.length > 0 ? (
        <div className="w-full space-y-2">
          <p className="text-xs font-bold text-violet-300 uppercase tracking-widest text-center mb-3">사다리 결과!</p>
          {pairs.map((p, i) => (
            <div key={i} className="flex items-center justify-between bg-slate-700/60 rounded-xl px-4 py-2.5 border border-slate-600/40">
              <span className="font-bold text-white text-sm">{p.participant}</span>
              <span className="text-violet-300 font-black text-sm">{p.prize}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center">
          <div className="text-7xl mb-2 opacity-50">🪜</div>
          {participants && participants.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5 mb-3">
              {participants.map((p, i) => <span key={i} className="px-2 py-0.5 bg-slate-700 rounded-full text-xs text-slate-300">{p}</span>)}
            </div>
          )}
          <p className="text-sm text-slate-400">관리자가 사다리를 진행 중...</p>
        </div>
      )}
    </div>
  );
}

function QaGameOverlay({
  game,
  currentUserId,
  currentUserNickname,
  seats,
  alreadySubmitted,
  onSubmitted,
  onDismiss,
}: {
  game: { id: string; question: string; correct_answer: string | null };
  currentUserId: string | null;
  currentUserNickname: string | null;
  seats: Seat[];
  alreadySubmitted: boolean;
  onSubmitted: () => void;
  onDismiss: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(alreadySubmitted);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  const submit = async () => {
    if (!answer.trim() || !currentUserId) return;
    setSubmitting(true);
    const seatRow = seats.find(s => s.profile_id === currentUserId);
    const { error: insertError } = await supabase.from('qa_answers').insert({
      game_id: game.id,
      user_id: currentUserId,
      nickname: currentUserNickname,
      answer: answer.trim(),
      table_number: seatRow?.table_number ?? null,
    });
    if (insertError) {
      console.error('Q&A 답변 제출 실패:', insertError);
      setSubmitting(false);
      return;
    }
    setSubmitted(true);
    onSubmitted();
    setSubmitting(false);
  };

  return (
    <div className={`fixed inset-0 z-[110] flex items-center justify-center p-4 transition-all duration-300 ${visible ? 'bg-black/70 backdrop-blur-sm' : 'bg-transparent'}`}>
      <div className={`w-full max-w-sm transition-all duration-500 ${visible ? 'scale-100 opacity-100 translate-y-0' : 'scale-90 opacity-0 translate-y-8'}`}>
        {/* Pulse ring */}
        <div className="relative mb-4 flex justify-center">
          <div className="absolute w-24 h-24 rounded-full bg-teal-500/30 animate-ping" />
          <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-2xl shadow-teal-500/50">
            <span className="text-4xl">📣</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl border border-teal-500/40 shadow-2xl shadow-teal-500/20 overflow-hidden">
          <div className="bg-gradient-to-r from-teal-600 to-cyan-700 px-5 py-4 text-center">
            <div className="text-[10px] font-black text-teal-200 uppercase tracking-widest mb-1">관리자가 Q&A를 시작합니다!</div>
            <h2 className="text-lg font-black text-white leading-snug">{game.question}</h2>
          </div>

          <div className="p-5 space-y-4">
            {submitted ? (
              <div className="flex items-center gap-3 bg-teal-500/20 rounded-2xl border border-teal-500/30 px-4 py-4">
                <CheckCircle className="w-6 h-6 text-teal-400 flex-shrink-0" />
                <p className="text-sm font-bold text-teal-200">답변을 제출했습니다!</p>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={answer}
                    onChange={e => setAnswer(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && answer.trim()) submit(); }}
                    placeholder="답변을 입력하세요..."
                    className="flex-1 bg-slate-700 text-white placeholder-slate-400 text-sm rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-teal-500 border border-slate-600"
                    autoFocus
                  />
                  <button
                    onClick={submit}
                    disabled={!answer.trim() || submitting || !currentUserId}
                    className="px-4 py-3 bg-teal-500 hover:bg-teal-400 text-white font-black text-sm rounded-xl disabled:opacity-40 transition-all"
                  >
                    {submitting ? '...' : '제출'}
                  </button>
                </div>
                {!currentUserId && (
                  <p className="text-xs text-slate-400 text-center">프로필을 등록해야 답변할 수 있습니다</p>
                )}
              </>
            )}
          </div>

          <div className="px-5 pb-5">
            <button
              onClick={onDismiss}
              className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold rounded-xl transition-all text-sm"
            >
              {submitted ? '닫기' : '나중에 답변하기'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GameAnnouncementModal({ game, onDismiss, onVote, onImageVote, currentUserId, seats, profiles }: {
  game: GameState;
  onDismiss: () => void;
  onVote?: (gameId: string, option: 'a' | 'b') => void;
  onImageVote?: (gameId: string, votedProfileId: string) => void;
  currentUserId?: string | null;
  seats?: Seat[];
  profiles?: Profile[];
}) {
  const [visible, setVisible] = useState(false);
  const [voted, setVoted] = useState<'a' | 'b' | null>(null);
  const [imageVoted, setImageVoted] = useState<string | null>(null);
  const [imageVoteCounts, setImageVoteCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  // For image game: load vote counts in real-time
  useEffect(() => {
    if (game.type !== 'image' || !game.game_id) return;
    const loadCounts = async () => {
      const { data } = await supabase.from('image_votes').select('voted_profile_id').eq('game_id', game.game_id!);
      if (data) {
        const tally = data.reduce<Record<string, number>>((acc, v) => {
          acc[v.voted_profile_id] = (acc[v.voted_profile_id] ?? 0) + 1;
          return acc;
        }, {});
        setImageVoteCounts(tally);
      }
      // Check if already voted
      if (currentUserId) {
        const { data: myVote } = await supabase.from('image_votes').select('voted_profile_id').eq('game_id', game.game_id!).eq('voter_id', currentUserId).maybeSingle();
        if (myVote) setImageVoted(myVote.voted_profile_id);
      }
    };
    loadCounts();
    const ch = supabase.channel(`image-votes-modal-${game.game_id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'image_votes', filter: `game_id=eq.${game.game_id}` }, (payload) => {
        const v = payload.new as { voted_profile_id: string };
        setImageVoteCounts(prev => ({ ...prev, [v.voted_profile_id]: (prev[v.voted_profile_id] ?? 0) + 1 }));
      })
      .subscribe(() => {});
    return () => { supabase.removeChannel(ch); };
  }, [game.type, game.game_id, currentUserId]);

  const handleImageVote = (profileId: string) => {
    if (imageVoted || !game.game_id || !onImageVote) return;
    setImageVoted(profileId);
    setImageVoteCounts(prev => ({ ...prev, [profileId]: (prev[profileId] ?? 0) + 1 }));
    onImageVote(game.game_id, profileId);
  };

  // Determine candidates: people at the same table, excluding self
  const userTableNum = seats?.find(s => s.profile_id === currentUserId)?.table_number ?? null;
  const tableScope = game.table_number ?? userTableNum;
  const candidateIds = seats
    ?.filter(s => s.status === 'occupied' && s.profile_id && s.profile_id !== currentUserId && (!tableScope || s.table_number === tableScope))
    .map(s => s.profile_id!) ?? [];
  const candidates = profiles?.filter(p => candidateIds.includes(p.id)) ?? [];
  const totalImageVotes = Object.values(imageVoteCounts).reduce((a, b) => a + b, 0);

  const isInteractive = game.type === 'dice' || game.type === 'roulette' || game.type === 'ladder';
  const isBalance = game.type === 'balance' && game.option_a && game.option_b;

  const handleVote = (option: 'a' | 'b') => {
    if (voted || !game.game_id || !onVote) return;
    setVoted(option);
    onVote(game.game_id, option);
    setTimeout(() => onDismiss(), 800);
  };

  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center p-4 transition-all duration-300 ${visible ? 'bg-black/70 backdrop-blur-sm' : 'bg-transparent'}`}>
      <div className={`w-full max-w-sm transition-all duration-500 ${visible ? 'scale-100 opacity-100 translate-y-0' : 'scale-90 opacity-0 translate-y-8'}`}>
        {/* Animated pulse ring */}
        <div className="relative mb-4 flex justify-center">
          <div className="absolute w-24 h-24 rounded-full bg-violet-500/30 animate-ping" />
          <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-2xl shadow-violet-500/50">
            <span className="text-4xl">{GAME_TYPE_ICONS[game.type]}</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl border border-violet-500/40 shadow-2xl shadow-violet-500/20 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-violet-600 to-purple-700 px-5 py-4 text-center">
            <div className="text-[10px] font-black text-violet-200 uppercase tracking-widest mb-1">관리자가 게임을 시작합니다!</div>
            <h2 className="text-xl font-black text-white">{game.title}</h2>
            <span className="inline-block mt-1 px-3 py-0.5 bg-white/20 text-white text-xs font-bold rounded-full">
              {GAME_TYPE_LABELS[game.type]}
            </span>
          </div>

          {/* Content */}
          <div className="p-5 space-y-3">
            {/* Balance game: clickable A vs B vote cards */}
            {isBalance && (
              <>
                {!voted && (
                  <p className="text-center text-xs font-bold text-slate-400 -mb-1">하나를 선택하세요!</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleVote('a')}
                    disabled={!!voted}
                    className={`flex-1 rounded-2xl border-2 p-4 text-center transition-all active:scale-[0.97] ${voted === 'a' ? 'bg-violet-500/40 border-violet-400 scale-[1.02]' : voted ? 'bg-slate-800/50 border-slate-700 opacity-50' : 'bg-gradient-to-br from-violet-500/20 to-violet-600/10 border-violet-500/40 hover:border-violet-400 hover:bg-violet-500/30 cursor-pointer'}`}>
                    <p className="text-[10px] font-black text-violet-400 uppercase tracking-wider mb-2">A</p>
                    <p className="text-base font-black text-white leading-snug">{game.option_a}</p>
                    {voted === 'a' && <p className="text-[10px] font-black text-violet-300 mt-2">선택!</p>}
                  </button>
                  <div className="flex items-center justify-center w-8 flex-shrink-0">
                    <span className="text-base font-black text-slate-400">vs</span>
                  </div>
                  <button
                    onClick={() => handleVote('b')}
                    disabled={!!voted}
                    className={`flex-1 rounded-2xl border-2 p-4 text-center transition-all active:scale-[0.97] ${voted === 'b' ? 'bg-pink-500/40 border-pink-400 scale-[1.02]' : voted ? 'bg-slate-800/50 border-slate-700 opacity-50' : 'bg-gradient-to-br from-pink-500/20 to-pink-600/10 border-pink-500/40 hover:border-pink-400 hover:bg-pink-500/30 cursor-pointer'}`}>
                    <p className="text-[10px] font-black text-pink-400 uppercase tracking-wider mb-2">B</p>
                    <p className="text-base font-black text-white leading-snug">{game.option_b}</p>
                    {voted === 'b' && <p className="text-[10px] font-black text-pink-300 mt-2">선택!</p>}
                  </button>
                </div>
              </>
            )}

            {/* Interactive game results */}
            {game.type === 'dice' && <DiceDisplay result={game.result} />}
            {game.type === 'roulette' && <RouletteDisplay result={game.result} options={game.roulette_options} />}
            {game.type === 'ladder' && <LadderDisplay result={game.result} participants={game.ladder_participants} prizes={game.ladder_prizes} />}

            {/* Image game: vote for a person */}
            {game.type === 'image' && (
              <div className="space-y-2">
                {game.penalty && (
                  <div className="p-3 bg-red-500/10 rounded-xl border border-red-500/30 mb-1">
                    <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-0.5">벌칙</p>
                    <p className="text-sm text-red-200">{game.penalty}</p>
                  </div>
                )}
                {!imageVoted && candidates.length > 0 && (
                  <p className="text-center text-xs font-bold text-slate-400">한 명을 선택하세요!</p>
                )}
                {candidates.length === 0 && !imageVoted && (
                  <p className="text-center text-xs text-slate-400 py-2">같은 테이블에 참여자가 없습니다</p>
                )}
                <div className="space-y-1.5 max-h-52 overflow-y-auto">
                  {candidates.map(p => {
                    const count = imageVoteCounts[p.id] ?? 0;
                    const pct = totalImageVotes > 0 ? Math.round((count / totalImageVotes) * 100) : 0;
                    const isMyVote = imageVoted === p.id;
                    return (
                      <button key={p.id}
                        disabled={!!imageVoted}
                        onClick={() => handleImageVote(p.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all text-left ${
                          isMyVote ? 'border-amber-400 bg-amber-500/20 scale-[1.01]'
                          : imageVoted ? 'border-slate-700 bg-slate-800/30 opacity-60 cursor-default'
                          : 'border-slate-700 bg-slate-800/50 hover:border-amber-400/60 hover:bg-amber-500/10 cursor-pointer'
                        }`}>
                        <ProfileAvatar profile={p} size="xs" rounded="lg" />
                        <span className={`flex-1 text-sm font-bold truncate ${isMyVote ? 'text-amber-300' : 'text-white'}`}>{p.nickname}</span>
                        {imageVoted && (
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all duration-500 ${isMyVote ? 'bg-amber-400' : 'bg-slate-500'}`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className={`text-xs font-bold w-8 text-right ${isMyVote ? 'text-amber-300' : 'text-slate-400'}`}>{pct}%</span>
                          </div>
                        )}
                        {isMyVote && <span className="text-amber-400 text-xs font-black flex-shrink-0">✓</span>}
                      </button>
                    );
                  })}
                </div>
                {imageVoted && (
                  <p className="text-center text-xs text-slate-400 pt-1">총 {totalImageVotes}명 투표</p>
                )}
              </div>
            )}

            {game.image_url && (
              <div className="rounded-xl overflow-hidden border border-slate-700">
                <img src={game.image_url} alt="game" className="w-full max-h-40 object-cover" />
              </div>
            )}
            {game.description && !isInteractive && game.type !== 'balance' && (
              <div className="p-3.5 bg-slate-700/40 rounded-xl border border-slate-600/50">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">게임 설명</p>
                <p className="text-sm text-white leading-relaxed">{game.description}</p>
              </div>
            )}
            {game.rules && !isInteractive && (
              <div className="p-3.5 bg-slate-700/40 rounded-xl border border-slate-600/50">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">방법</p>
                <p className="text-sm text-slate-200 leading-relaxed">{game.rules}</p>
              </div>
            )}
            {game.penalty && !isInteractive && (
              <div className="p-3.5 bg-red-500/10 rounded-xl border border-red-500/30">
                <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-1">벌칙</p>
                <p className="text-sm text-red-200 leading-relaxed">{game.penalty}</p>
              </div>
            )}
          </div>

          {(!isBalance && game.type !== 'image') && (
            <div className="px-5 pb-5">
              <button
                onClick={onDismiss}
                className="w-full py-3 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-bold rounded-xl transition-all shadow-lg"
              >
                확인했습니다!
              </button>
            </div>
          )}
          {game.type === 'image' && (
            <div className="px-5 pb-5">
              <button
                onClick={onDismiss}
                className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-bold rounded-xl transition-all shadow-lg"
              >
                {imageVoted ? '확인했습니다!' : '나중에 투표할게요'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Game Result Modal ────────────────────────────────────────────────────────

function GameResultModal({ game, counts, onClose }: { game: BalanceGame; counts: { a: number; b: number }; onClose: () => void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), 50); return () => clearTimeout(t); }, []);
  const total = counts.a + counts.b;
  const pctA = total > 0 ? Math.round((counts.a / total) * 100) : 50;
  const pctB = 100 - pctA;
  const winnerA = counts.a >= counts.b;
  return (
    <div className={`fixed inset-0 z-[120] flex items-center justify-center p-4 transition-all duration-300 ${visible ? 'bg-black/75 backdrop-blur-sm' : 'bg-transparent'}`}>
      <div className={`w-full max-w-sm transition-all duration-500 ${visible ? 'scale-100 opacity-100 translate-y-0' : 'scale-90 opacity-0 translate-y-8'}`}>
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl border border-violet-500/40 shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-violet-600 to-purple-700 px-5 py-4 text-center">
            <div className="text-2xl mb-1">🏆</div>
            <div className="text-[10px] font-black text-violet-200 uppercase tracking-widest mb-1">밸런스 게임 결과</div>
            <h2 className="text-base font-black text-white leading-snug">{game.question}</h2>
          </div>
          <div className="p-5 space-y-3">
            {(['a', 'b'] as const).map((opt) => {
              const label = opt === 'a' ? game.option_a : game.option_b;
              const pct = opt === 'a' ? pctA : pctB;
              const count = opt === 'a' ? counts.a : counts.b;
              const isWinner = opt === 'a' ? winnerA : !winnerA;
              return (
                <div key={opt} className={`rounded-2xl overflow-hidden border ${isWinner ? 'border-violet-400/60' : 'border-slate-600/40'}`}>
                  <div className={`px-4 py-3 flex items-center justify-between ${isWinner ? 'bg-violet-500/20' : 'bg-slate-700/30'}`}>
                    <div className="flex items-center gap-2">
                      {isWinner && <span className="text-base">🥇</span>}
                      <span className={`text-sm font-black ${isWinner ? 'text-white' : 'text-slate-400'}`}>{label}</span>
                    </div>
                    <span className={`text-lg font-black ${isWinner ? 'text-violet-300' : 'text-slate-500'}`}>{pct}%</span>
                  </div>
                  <div className="h-2 bg-slate-700">
                    <div className={`h-full transition-all duration-700 ${isWinner ? 'bg-gradient-to-r from-violet-500 to-purple-500' : 'bg-slate-600'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className={`px-4 py-1.5 text-xs ${isWinner ? 'text-violet-400' : 'text-slate-500'}`}>{count}명 선택</div>
                </div>
              );
            })}
            <p className="text-center text-slate-500 text-xs pt-1">총 {total}명 참여</p>
          </div>
          <div className="px-5 pb-5">
            <button onClick={onClose} className="w-full py-3 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-bold rounded-xl transition-all shadow-lg">
              확인
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Game Active Banner ───────────────────────────────────────────────────────

function GameActiveBanner({ game, onClick }: { game: GameState; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-violet-600 to-purple-700 text-white px-4 py-2 flex items-center justify-between cursor-pointer shadow-lg animate-pulse"
    >
      <div className="flex items-center gap-2">
        <span className="text-base">{GAME_TYPE_ICONS[game.type]}</span>
        <span className="text-sm font-bold">게임 진행 중: {game.title}</span>
      </div>
      <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-bold">자세히 보기</span>
    </div>
  );
}

// ─── Waiting Screen ───────────────────────────────────────────────────────────

// ─── Notification Banner ─────────────────────────────────────────────────────

const NOTIF_STYLES: Record<string, { bar: string; icon: string; label: string }> = {
  info:   { bar: 'bg-blue-600',    icon: '📢', label: '공지' },
  urgent: { bar: 'bg-red-600',     icon: '🚨', label: '긴급' },
  event:  { bar: 'bg-amber-500',   icon: '🎉', label: '이벤트' },
  game:   { bar: 'bg-violet-600',  icon: '🎮', label: '진행·게임' },
};

function NotifModal({ notif, onClose }: { notif: { id: string; message: string; type: string; target: string }; onClose: () => void }) {
  const cfg = NOTIF_STYLES[notif.type] ?? NOTIF_STYLES.info;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-[scaleIn_0.25s_ease-out]">
        <div className={`${cfg.bar} px-6 py-5 text-white text-center`}>
          <div className="text-4xl mb-2">{cfg.icon}</div>
          <p className="text-xs font-black uppercase tracking-widest opacity-80">{cfg.label}</p>
        </div>
        <div className="px-6 py-5 text-center">
          <p className="text-gray-800 font-semibold text-base leading-relaxed whitespace-pre-line">{notif.message}</p>
        </div>
        <div className="px-6 pb-5">
          <button
            onClick={onClose}
            className={`w-full py-3 rounded-2xl font-black text-white text-sm transition-all ${cfg.bar} hover:opacity-90 active:scale-95`}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Welcome Notice Modal ─────────────────────────────────────────────────────

const WELCOME_NOTICE_ITEMS = [
  '술강요가 없는 자유로운 분위기입니다',
  '정치, 종교, 지역감정, 패드립은 허용되지 않습니다',
  '욕설, 반말 등은 영구밴이 될 수 있습니다',
  '화장실, 담배는 함께 이동해 주세요',
  '급하신 분은 먼저 허락을 받고 이동 부탁드립니다',
  '모든 저작권은 범일NPC에게 있습니다. 불법 복제 및 도용은 민형사상 책임을 질 수 있습니다',
];

function WelcomeNoticeModal({ onClose }: { onClose: () => void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), 50); return () => clearTimeout(t); }, []);
  return (
    <div className={`fixed inset-0 z-[90] flex items-center justify-center p-4 transition-all duration-300 ${visible ? 'bg-black/70 backdrop-blur-sm' : 'bg-transparent'}`}>
      <div className={`w-full max-w-sm transition-all duration-400 ${visible ? 'scale-100 opacity-100 translate-y-0' : 'scale-90 opacity-0 translate-y-6'}`}>
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-cyan-500 to-teal-500 px-6 py-5 text-center relative">
            <button onClick={onClose}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-black/20 text-white hover:bg-black/40 transition-all">
              <X className="w-4 h-4" />
            </button>
            <div className="text-3xl font-black text-white mb-1">범일NPC 술번개</div>
            <div className="text-4xl mb-2">🥂</div>
            <h2 className="text-xl font-black text-white">환영합니다!</h2>
            <p className="text-xs text-white/80 mt-1">오늘 즐거운 시간 보내세요</p>
          </div>
          {/* Notice */}
          <div className="px-6 py-5">
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-3">공지사항</p>
            <ol className="space-y-3">
              {WELCOME_NOTICE_ITEMS.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-500 text-white text-xs font-black flex items-center justify-center">{i + 1}</span>
                  <span className="text-sm text-gray-700 leading-snug pt-0.5">{item}</span>
                </li>
              ))}
            </ol>
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-xs text-amber-700 leading-relaxed">⚠️ 개발자가 아닌 제가 직접 만든 관계로 서버가 다소 불안정하거나 나갔다 다시 연결하면 초기상태로 돌아갈 수 있습니다. 양해 부탁드립니다.</p>
            </div>
          </div>
          <div className="px-6 pb-6">
            <button
              onClick={onClose}
              className="w-full py-3.5 bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-white font-black rounded-2xl transition-all shadow-lg shadow-cyan-500/30 active:scale-[0.98]"
            >
              확인했습니다!
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Balance Game Card ────────────────────────────────────────────────────────

function BalanceGameCard({
  game, myVote, voteCounts, currentUserId, eligibleCount, onVote, onEnd,
}: {
  game: BalanceGame;
  myVote: 'a' | 'b' | null;
  voteCounts: { a: number; b: number };
  currentUserId: string | null;
  eligibleCount: number;
  onVote: (gameId: string, option: 'a' | 'b') => void;
  onEnd?: (gameId: string) => void;
}) {
  const total = voteCounts.a + voteCounts.b;
  const pctA = total > 0 ? Math.round((voteCounts.a / total) * 100) : 50;
  const pctB = 100 - pctA;
  const ended = game.status === 'ended';
  const allVoted = eligibleCount > 0 && total >= eligibleCount;
  const showResult = ended || allVoted || !!myVote;

  return (
    <div className={`bg-white rounded-2xl shadow-sm border overflow-hidden transition-all ${ended ? 'opacity-70 border-gray-200' : 'border-violet-200 shadow-violet-100'}`}>
      {/* Header */}
      <div className={`px-4 py-3 flex items-center justify-between ${ended ? 'bg-gray-50' : 'bg-gradient-to-r from-violet-50 to-purple-50'}`}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-violet-500 bg-violet-100 px-2 py-0.5 rounded-full">
            {game.scope === 'table' ? `${game.table_number}번 테이블` : '전체'}
          </span>
          {game.creator_nickname && (
            <span className="text-xs text-gray-400">by {game.creator_nickname}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {ended ? (
            <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">종료됨</span>
          ) : (
            <span className="flex items-center gap-1 text-xs font-bold text-violet-500">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse inline-block" />
              투표 중 · {total}/{eligibleCount}명
            </span>
          )}
          {onEnd && !ended && currentUserId === game.creator_id && (
            <button onClick={() => onEnd(game.id)} className="text-[10px] font-bold text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100 px-2 py-0.5 rounded-full border border-red-200 transition-colors">게임 종료</button>
          )}
        </div>
      </div>

      {/* Question */}
      <div className="px-4 py-4">
        <p className="text-base font-black text-gray-900 text-center mb-4 leading-snug">{game.question}</p>

        {/* Vote bars */}
        {showResult ? (
          <div className="space-y-2.5 mb-3">
            {(['a', 'b'] as const).map((opt) => {
              const label = opt === 'a' ? game.option_a : game.option_b;
              const pct = opt === 'a' ? pctA : pctB;
              const count = opt === 'a' ? voteCounts.a : voteCounts.b;
              const isMyVote = myVote === opt;
              const isWinner = ended && count > (opt === 'a' ? voteCounts.b : voteCounts.a);
              const colorFill = opt === 'a' ? 'bg-blue-500/25' : 'bg-rose-500/25';
              const colorBar = opt === 'a' ? 'bg-blue-500' : 'bg-rose-500';
              const colorLabel = opt === 'a' ? 'text-blue-700' : 'text-rose-700';
              const colorCount = opt === 'a' ? 'text-blue-600' : 'text-rose-600';
              const borderColor = isMyVote ? (opt === 'a' ? 'border-blue-400' : 'border-rose-400') : 'border-gray-100';
              return (
                <div key={opt} className={`rounded-xl overflow-hidden border-2 transition-all ${borderColor}`}>
                  {/* Fill bar */}
                  <div className="relative h-14 bg-gray-50">
                    <div
                      className={`absolute inset-y-0 left-0 transition-all duration-700 ease-out ${colorFill}`}
                      style={{ width: `${pct}%` }}
                    />
                    <div className="absolute inset-0 flex items-center justify-between px-3">
                      <span className={`text-sm font-bold ${colorLabel} leading-tight`}>
                        {isMyVote && <span className="mr-1 text-xs">✓</span>}{label}
                        {isWinner && <span className="ml-1 text-base">🏆</span>}
                      </span>
                      <div className={`flex flex-col items-end ${colorCount}`}>
                        <span className="text-lg font-black leading-none">{pct}%</span>
                        <span className="text-[10px] font-semibold opacity-70">{count}명</span>
                      </div>
                    </div>
                  </div>
                  {/* Bottom progress line */}
                  <div className={`h-1 ${colorBar} transition-all duration-700 ease-out`} style={{ width: `${pct}%` }} />
                </div>
              );
            })}
            {/* Vote totals summary */}
            <div className="flex items-center justify-center gap-2 pt-1">
              {allVoted && !ended && (
                <span className="text-[11px] font-black text-violet-600 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full">전원 투표 완료!</span>
              )}
              <span className="text-[11px] text-gray-400 font-medium">총 {total}명 참여</span>
              {ended && total > 0 && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="text-[11px] font-bold text-blue-600">{game.option_a} {voteCounts.a}명</span>
                  <span className="text-gray-300">vs</span>
                  <span className="text-[11px] font-bold text-rose-600">{voteCounts.b}명 {game.option_b}</span>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 mb-3">
            <button
              onClick={() => onVote(game.id, 'a')}
              className="py-3 rounded-xl font-bold text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 border-2 border-blue-200 hover:border-blue-400 transition-all active:scale-95"
            >{game.option_a}</button>
            <button
              onClick={() => onVote(game.id, 'b')}
              className="py-3 rounded-xl font-bold text-sm bg-rose-50 hover:bg-rose-100 text-rose-700 border-2 border-rose-200 hover:border-rose-400 transition-all active:scale-95"
            >{game.option_b}</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Create Balance Game Modal ────────────────────────────────────────────────

function CreateGameModal({
  tableNumber, currentUserNickname, onSubmit, onClose,
}: {
  tableNumber: number | null;
  currentUserNickname: string;
  onSubmit: (question: string, optA: string, optB: string, scope: 'global' | 'table') => void;
  onClose: () => void;
}) {
  const [optA, setOptA] = useState('');
  const [optB, setOptB] = useState('');
  const scope: 'table' = 'table';

  const QUICK_TEMPLATES = [
    { q: '평생 치킨만 먹기 vs 피자만 먹기', a: '치킨파', b: '피자파' },
    { q: '아침형 인간 vs 야행성 인간', a: '아침형', b: '야행성' },
    { q: '여름 vs 겨울', a: '여름', b: '겨울' },
    { q: '내향인 vs 외향인', a: '내향인', b: '외향인' },
    { q: '술 vs 안술', a: '술', b: '안술' },
    { q: '연상 vs 연하', a: '연상', b: '연하' },
  ];

  const question = optA && optB ? `${optA} vs ${optB}` : '';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-black text-gray-900">밸런스 게임 만들기</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Quick templates */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">빠른 선택</p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_TEMPLATES.map((t, i) => (
                <button key={i} onClick={() => { setOptA(t.a); setOptB(t.b); }}
                  className="text-[11px] px-2.5 py-1 bg-violet-50 hover:bg-violet-100 text-violet-600 rounded-full border border-violet-200 transition-all"
                >{t.a} vs {t.b}</button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-bold text-blue-500 block mb-1">선택지 A *</label>
              <input type="text" value={optA} onChange={e => setOptA(e.target.value)}
                placeholder="예: 치킨"
                className="w-full border-2 border-blue-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
            <div>
              <label className="text-xs font-bold text-rose-500 block mb-1">선택지 B *</label>
              <input type="text" value={optB} onChange={e => setOptB(e.target.value)}
                placeholder="예: 피자"
                className="w-full border-2 border-rose-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300" />
            </div>
          </div>

          {tableNumber && (
            <div className="px-3 py-2 bg-violet-50 rounded-xl border border-violet-200 text-xs text-violet-600 font-semibold text-center">
              {tableNumber}번 테이블 전용 게임으로 생성됩니다
            </div>
          )}

          <button
            disabled={!optA.trim() || !optB.trim()}
            onClick={() => onSubmit(question, optA, optB, scope)}
            className="w-full py-3 bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:from-violet-500 hover:to-purple-500"
          >게임 시작!</button>
        </div>
      </div>
    </div>
  );
}

// ─── Mini Game Tips Panel ──────────────────────────────────────────────────────

const MINI_GAMES = [
  {
    name: '369 게임', emoji: '3️⃣',
    desc: '순서대로 1부터 숫자를 말하되 3, 6, 9가 포함된 숫자에서는 박수를 칩니다.',
    tip: '33은 박수 두 번! 숫자를 빠르게 이어가면 실수가 나옵니다.',
    penalty: '틀린 사람이 벌칙(술 한 잔, 벌금 등)',
  },
  {
    name: '베스킨라빈스 31', emoji: '🍦',
    desc: '1~3개 숫자를 차례로 말하며 31을 말하는 사람이 집니다.',
    tip: '31의 배수 주변 숫자가 핵심! 22, 25, 28 구간이 승부처입니다.',
    penalty: '31 말한 사람이 벌칙',
  },
  {
    name: '눈치게임', emoji: '👀',
    desc: '아무 순서 없이 1부터 인원 수까지 각자 하나씩 외칩니다. 동시에 외치면 OUT!',
    tip: '서로 눈치를 보다 마지막 번호를 외치는 사람이 지는 경우도 있습니다.',
    penalty: '동시에 외쳤거나 마지막 번호가 벌칙',
  },
  {
    name: '폭탄 돌리기', emoji: '💣',
    desc: '음악이 멈추면 폭탄(물건)을 들고 있는 사람이 집니다.',
    tip: '음악 속도나 길이를 랜덤하게 하면 더 재밌습니다.',
    penalty: '폭탄 든 사람이 벌칙',
  },
];

function MiniGameTips() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  return (
    <div className="bg-white rounded-2xl shadow-sm p-5">
      <h3 className="text-sm font-black text-gray-800 mb-1">게임 설명 & 팁</h3>
      <p className="text-xs text-gray-400 mb-3">클릭하면 자세한 방법을 확인할 수 있어요</p>
      <div className="grid grid-cols-2 gap-2">
        {MINI_GAMES.map((g, i) => (
          <div key={i}>
            <button
              onClick={() => setOpenIdx(openIdx === i ? null : i)}
              className={`w-full text-left px-3 py-2.5 rounded-xl border-2 transition-all ${
                openIdx === i ? 'border-violet-400 bg-violet-50' : 'border-gray-100 bg-gray-50 hover:border-violet-200 hover:bg-violet-50/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{g.emoji}</span>
                <span className="text-xs font-bold text-gray-800">{g.name}</span>
              </div>
            </button>
            {openIdx === i && (
              <div className="mt-1 p-3 bg-violet-50 border border-violet-200 rounded-xl space-y-2">
                <p className="text-xs text-gray-700 leading-relaxed"><span className="font-bold text-violet-700">방법:</span> {g.desc}</p>
                <p className="text-xs text-gray-600 leading-relaxed"><span className="font-bold text-amber-600">팁:</span> {g.tip}</p>
                <p className="text-xs text-gray-500 leading-relaxed"><span className="font-bold text-red-500">벌칙:</span> {g.penalty}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── User Game Tab ─────────────────────────────────────────────────────────────

function UserGameTab({
  currentUserId, tableNumber, currentUserNickname, balanceGames, voteCounts, myVotes,
  seats, onVote, onCreateGame, onEndGame,
}: {
  currentUserId: string | null;
  tableNumber: number | null;
  currentUserNickname: string;
  balanceGames: BalanceGame[];
  voteCounts: Map<string, { a: number; b: number }>;
  myVotes: Map<string, 'a' | 'b'>;
  seats: Seat[];
  onVote: (gameId: string, option: 'a' | 'b') => void;
  onCreateGame: (question: string, optA: string, optB: string, scope: 'global' | 'table') => void;
  onEndGame: (gameId: string) => void;
}) {
  const [showCreate, setShowCreate] = useState(false);

  const activeGlobal = balanceGames.filter(g => g.status === 'active' && g.scope === 'global');
  const activeTable = tableNumber != null
    ? balanceGames.filter(g => g.status === 'active' && g.scope === 'table' && g.table_number === tableNumber)
    : [];
  const allActive = balanceGames.filter(g => g.status === 'active' && !(g.scope === 'table' && tableNumber !== null && g.table_number !== tableNumber));
  const ended = balanceGames.filter(g => g.status === 'ended').slice(0, 5);

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3.5 flex items-start gap-2.5">
        <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-bold text-amber-800">게임 탭은 아직 미완성이니 양해 부탁드립니다.</p>
          <p className="text-[11px] text-amber-600 mt-0.5">추후 수정 예정입니다.</p>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-black text-gray-900">실시간 밸런스 게임</h2>
          <p className="text-xs text-gray-400 mt-0.5">투표 결과가 실시간으로 반영됩니다</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-violet-500 hover:bg-violet-600 text-white text-xs font-bold rounded-xl transition-all shadow-sm"
        >
          <Gamepad2 className="w-3.5 h-3.5" />게임 만들기
        </button>
      </div>

      {allActive.length === 0 && ended.length === 0 && (
        <div className="text-center py-16">
          <Gamepad2 className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-400">진행 중인 게임이 없습니다.</p>
          <p className="text-xs text-gray-300 mt-1">게임을 직접 만들어보세요!</p>
        </div>
      )}

      {activeGlobal.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] font-black text-violet-500 uppercase tracking-widest">전체 게임</p>
          {activeGlobal.map(g => (
            <BalanceGameCard key={g.id} game={g}
              myVote={myVotes.get(g.id) ?? null}
              voteCounts={voteCounts.get(g.id) ?? { a: 0, b: 0 }}
              currentUserId={currentUserId}
              eligibleCount={seats.filter(s => s.status === 'occupied').length}
              onVote={onVote} onEnd={onEndGame} />
          ))}
        </div>
      )}

      {activeTable.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{tableNumber}번 테이블 게임</p>
          {activeTable.map(g => (
            <BalanceGameCard key={g.id} game={g}
              myVote={myVotes.get(g.id) ?? null}
              voteCounts={voteCounts.get(g.id) ?? { a: 0, b: 0 }}
              currentUserId={currentUserId}
              eligibleCount={seats.filter(s => s.table_number === g.table_number && s.status === 'occupied').length}
              onVote={onVote} onEnd={onEndGame} />
          ))}
        </div>
      )}

      {ended.length > 0 && (
        <details className="group">
          <summary className="list-none flex items-center gap-2 cursor-pointer py-2 text-xs font-bold text-gray-400 hover:text-gray-500">
            <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />종료된 게임 ({ended.length})
          </summary>
          <div className="space-y-3 pt-2">
            {ended.map(g => (
              <BalanceGameCard key={g.id} game={g}
                myVote={myVotes.get(g.id) ?? null}
                voteCounts={voteCounts.get(g.id) ?? { a: 0, b: 0 }}
                currentUserId={currentUserId}
                eligibleCount={g.scope === 'table' ? seats.filter(s => s.table_number === g.table_number && s.status === 'occupied').length : seats.filter(s => s.status === 'occupied').length}
                onVote={onVote} />
            ))}
          </div>
        </details>
      )}

      {showCreate && (
        <CreateGameModal
          tableNumber={tableNumber}
          currentUserNickname={currentUserNickname}
          onSubmit={(q, a, b, scope) => {
            onCreateGame(q, a, b, scope);
            setShowCreate(false);
          }}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* 게임 설명 팁 */}
      <MiniGameTips />
    </div>
  );
}



function WaitingOverlay({ sessionActive, onEnter }: {
  sessionActive: boolean | null; onEnter: () => void;
}) {
  const isActive = sessionActive === true;
  const [showNotice, setShowNotice] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutPage, setTutPage] = useState(0);
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-teal-500/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-3xl" />
      </div>
      <div className="relative z-10 text-center max-w-sm w-full flex flex-col items-center">
        {/* 로고 + 아이콘 */}
        <div className="relative inline-flex items-center justify-center mb-6">
          <div className="w-28 h-28 rounded-3xl bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center shadow-2xl shadow-cyan-500/30">
            <Users className="w-14 h-14 text-white" />
          </div>
          <div className={`absolute -top-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center shadow-lg ${isActive ? 'bg-teal-400' : 'bg-amber-400 animate-bounce'}`}>
            {isActive ? <CheckCircle className="w-4 h-4 text-teal-900" /> : <Clock className="w-4 h-4 text-amber-900" />}
          </div>
        </div>
        {/* 타이틀: 범일NPC 술번개 중앙 */}
        <div className="mb-4 text-center">
          <p className="text-[22px] font-black tracking-[0.25em] uppercase mb-1"
             style={{
               background: 'linear-gradient(135deg, #ffffff 0%, #cffafe 45%, #99f6e4 100%)',
               WebkitBackgroundClip: 'text',
               WebkitTextFillColor: 'transparent',
               backgroundClip: 'text',
             }}>
            범일NPC
          </p>
          <h1 className="text-4xl font-black text-white tracking-tight leading-tight">술번개 🍻</h1>
        </div>
        {isActive ? (
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-teal-500/20 border border-teal-400/30 rounded-full mb-6">
            <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
            <span className="text-teal-300 text-sm font-semibold">모임이 시작되었습니다!</span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-amber-500/20 border border-amber-400/30 rounded-full mb-6">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-amber-300 text-sm font-semibold">모임 대기 중</span>
          </div>
        )}
        <p className="text-slate-300 text-base leading-relaxed mb-8">
          {isActive ? (
            <>모임이 시작되었습니다.<br /><span className="text-teal-400 font-semibold">입장 버튼</span>을 눌러 참여하세요.</>
          ) : (
            <>곧 회식이 시작합니다.<br /><span className="text-slate-400 font-semibold">미리 입장해서 닉네임을 설정하세요.</span></>
          )}
        </p>
        {/* 주의사항 미리보기 배너 */}
        <button
          onClick={() => setShowNotice(true)}
          className="w-full flex items-center gap-3 px-4 py-3 mb-4 rounded-2xl bg-amber-500/15 border border-amber-400/30 hover:bg-amber-500/25 transition-all text-left"
        >
          <div className="w-8 h-8 rounded-full bg-amber-500/30 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-amber-300 text-xs font-bold">입장 전 꼭 읽어주세요!</p>
            <p className="text-amber-400/70 text-[11px] truncate">절전 모드·시크릿 모드 사용 시 앱이 튕길 수 있어요</p>
          </div>
          <ChevronRight className="w-4 h-4 text-amber-400/60 flex-shrink-0" />
        </button>
        <button
          onClick={onEnter}
          className="w-full py-4 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-white font-black text-lg rounded-2xl shadow-2xl shadow-teal-500/30 transition-all active:scale-98 mb-3"
        >입장하기</button>
        <button
          onClick={() => { setTutPage(0); setShowTutorial(true); }}
          className="w-full py-3.5 bg-gradient-to-r from-orange-400 to-rose-500 hover:from-orange-300 hover:to-rose-400 text-white font-black text-sm rounded-2xl shadow-lg shadow-orange-500/25 transition-all active:scale-98 mb-3"
        >앱 사용법 보기</button>
        {/* 주의사항 전체 모달 */}
        {showNotice && (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setShowNotice(false)}>
            <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700 overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
              {/* 헤더 */}
              <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 border-b border-amber-500/20 px-5 py-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/30 flex items-center justify-center">
                  <ShieldAlert className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-white font-black text-base">입장 전 주의사항</h3>
                  <p className="text-amber-400/70 text-xs">앱이 튕기지 않으려면 꼭 확인하세요</p>
                </div>
                <button onClick={() => setShowNotice(false)} className="ml-auto w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
              <div className="px-5 py-5 space-y-4">
                {/* 절전 모드 */}
                <div className="flex gap-3">
                  <div className="w-9 h-9 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-lg">🔋</span>
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm mb-1">절전 모드 해제</p>
                    <p className="text-slate-400 text-xs leading-relaxed">아이폰·안드로이드 절전(저전력) 모드에서는 백그라운드 처리가 제한되어 앱이 갑자기 튕길 수 있습니다. <span className="text-amber-400 font-semibold">설정 → 배터리 → 저전력 모드 OFF</span> 후 사용해 주세요.</p>
                  </div>
                </div>
                {/* 시크릿 모드 */}
                <div className="flex gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-lg">🕵️</span>
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm mb-1">시크릿·개인정보 보호 모드 사용 금지</p>
                    <p className="text-slate-400 text-xs leading-relaxed">Safari/Chrome 시크릿 모드나 개인정보 보호 브라우저는 <span className="text-amber-400 font-semibold">로컬 저장소가 차단</span>되어 닉네임·프로필이 사라집니다. 일반 브라우저 탭으로 접속해 주세요.</p>
                  </div>
                </div>
                {/* 화면 꺼짐 */}
                <div className="flex gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-lg">📵</span>
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm mb-1">화면 자동 꺼짐 방지</p>
                    <p className="text-slate-400 text-xs leading-relaxed">자리를 비울 때 화면이 꺼지면 브라우저가 세션을 초기화할 수 있어요. <span className="text-amber-400 font-semibold">화면 자동 잠금 시간을 길게</span> 설정하거나 주기적으로 화면을 깨워주세요.</p>
                  </div>
                </div>
                {/* 북마크 */}
                <div className="flex gap-3">
                  <div className="w-9 h-9 rounded-xl bg-teal-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-lg">🔖</span>
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm mb-1">URL 북마크 추천</p>
                    <p className="text-slate-400 text-xs leading-relaxed">혹시 앱이 튕겨도 같은 URL로 재접속하면 <span className="text-teal-400 font-semibold">프로필이 자동으로 복구</span>됩니다. 브라우저 주소창에서 이 페이지를 북마크해 두세요.</p>
                  </div>
                </div>
              </div>
              <div className="px-5 pb-5">
                <button
                  onClick={() => setShowNotice(false)}
                  className="w-full py-3.5 bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-black rounded-2xl shadow-lg shadow-teal-500/25 text-sm"
                >확인했어요!</button>
              </div>
            </div>
          </div>
        )}
        {/* 앱 사용법 튜토리얼 모달 */}
        {showTutorial && (
          <TutorialModal
            page={tutPage}
            onChangePage={setTutPage}
            onClose={() => setShowTutorial(false)}
          />
        )}
        {/* 테스트/관리자 — 우측 하단 고정 */}
        <div className="fixed bottom-4 right-4 z-40 flex flex-row gap-2 items-end">
          <a href="/test" className="px-3 py-1.5 rounded-lg bg-violet-600/80 hover:bg-violet-500 text-white font-bold text-xs shadow-lg backdrop-blur-sm transition-all border border-violet-500/50 active:scale-95">테스트</a>
          <a href="/admin" className="px-3 py-1.5 rounded-lg bg-slate-700/90 hover:bg-slate-800 text-white font-bold text-xs shadow-lg backdrop-blur-sm transition-all border border-slate-600/50 active:scale-95">관리자</a>
        </div>
      </div>
      <style>{`
        @keyframes dotbounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ─── Like Confirm Dialog ──────────────────────────────────────────────────────

const heartMeta = (t: HeartType) => HEART_TYPES.find(h => h.type === t)!;

const MBTI_COLORS: Record<string, string> = {
  'INTJ': 'bg-violet-100 text-violet-700 border-violet-200', 'INTP': 'bg-violet-100 text-violet-700 border-violet-200',
  'ENTJ': 'bg-violet-100 text-violet-700 border-violet-200', 'ENTP': 'bg-violet-100 text-violet-700 border-violet-200',
  'INFJ': 'bg-teal-100 text-teal-700 border-teal-200', 'INFP': 'bg-teal-100 text-teal-700 border-teal-200',
  'ENFJ': 'bg-teal-100 text-teal-700 border-teal-200', 'ENFP': 'bg-teal-100 text-teal-700 border-teal-200',
  'ISTJ': 'bg-amber-100 text-amber-700 border-amber-200', 'ISFJ': 'bg-amber-100 text-amber-700 border-amber-200',
  'ESTJ': 'bg-amber-100 text-amber-700 border-amber-200', 'ESFJ': 'bg-amber-100 text-amber-700 border-amber-200',
  'ISTP': 'bg-sky-100 text-sky-700 border-sky-200', 'ISFP': 'bg-sky-100 text-sky-700 border-sky-200',
  'ESTP': 'bg-sky-100 text-sky-700 border-sky-200', 'ESFP': 'bg-sky-100 text-sky-700 border-sky-200',
};

const domSubLabel = (score: number | null): { label: string; color: string } | null => {
  if (score === null || score === undefined) return null;
  if (score <= 2) return { label: 'Dominant', color: 'bg-rose-100 text-rose-700 border-rose-200' };
  if (score <= 4) return { label: 'Dom 선호', color: 'bg-rose-50 text-rose-600 border-rose-100' };
  if (score <= 6) return { label: 'Switch', color: 'bg-gray-100 text-gray-600 border-gray-200' };
  if (score <= 8) return { label: 'Sub 선호', color: 'bg-sky-50 text-sky-600 border-sky-100' };
  return { label: 'Submissive', color: 'bg-sky-100 text-sky-700 border-sky-200' };
};

function ProfileInfoBadges({ profile }: { profile: Profile }) {
  const age = getKoreanAge(profile.birth_year);
  const ds = domSubLabel(profile.dom_sub_score ?? null);
  const rawInterests = profile.interests;
  const interests = Array.isArray(rawInterests)
    ? rawInterests.filter(Boolean).slice(0, 4)
    : rawInterests ? String(rawInterests).split(/[,，、\s]+/).filter(Boolean).slice(0, 4) : [];

  const posLabel = getPositionLabel(profile.personality_score ?? 50);
  const posColor = getPositionBg(profile.personality_score ?? 50);

  return (
    <div className="flex flex-wrap gap-1.5 mt-2.5 items-center">
      {profile.mbti && (
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${MBTI_COLORS[profile.mbti] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
          {profile.mbti}
        </span>
      )}
      {profile.birth_year && (
        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-600 border border-blue-100">
          {age}
        </span>
      )}
      {profile.location && (
        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100">
          {profile.location}
        </span>
      )}
      {profile.personality_score !== null && profile.personality_score !== undefined && (
        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold text-white border border-white/20" style={{ backgroundColor: posColor }}>
          {posLabel}
        </span>
      )}
      {ds && (
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${ds.color}`}>
          {ds.label}
        </span>
      )}
      {interests.map((it, i) => (
        <span key={i} className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-100">
          {it}
        </span>
      ))}
    </div>
  );
}

function LikeConfirmDialog({
  target, likedByType, onConfirm, onCancel,
}: {
  target: Profile; likedByType: Record<HeartType, number>; onConfirm: (type: HeartType) => void; onCancel: () => void;
}) {
  const [selected, setSelected] = useState<HeartType | null>(null);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="text-center mb-5">
          <div className="mx-auto mb-3">
            <ProfileAvatar profile={target} size="lg" rounded="xl" />
          </div>
          <p className="text-lg font-bold text-gray-900">{target.nickname}</p>
        </div>

        <div className="space-y-2 mb-5">
          {HEART_TYPES.map(h => {
            const used = likedByType[h.type] ?? 0;
            const remaining = 2 - used;
            const disabled = remaining <= 0;
            const isSel = selected === h.type;
            return (
              <button key={h.type} onClick={() => !disabled && setSelected(h.type)} disabled={disabled}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                  disabled ? 'opacity-40 cursor-not-allowed border-gray-100 bg-gray-50'
                  : isSel ? `${h.bg} ${h.border} ring-2 ${h.ring}`
                  : `border-gray-200 hover:${h.border} hover:${h.bg}`
                }`}>
                <span className="text-2xl">{h.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold ${isSel ? h.text : 'text-gray-800'}`}>{h.label}</p>
                  <p className="text-xs text-gray-400">{h.desc}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {[0, 1].map(i => (
                    <Heart key={i} className={`w-4 h-4 ${i < (2 - used) ? h.fillText : 'fill-gray-200 text-gray-200'}`} />
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mb-3 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
          <span className="text-sm flex-shrink-0">⚠️</span>
          <p className="text-xs text-amber-700 font-semibold leading-relaxed">칭찬 하트는 상대방에게 칭찬만 전달됩니다. <span className="underline">연락처가 공유되지 않습니다.</span></p>
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-all">
            취소
          </button>
          <button onClick={() => selected && onConfirm(selected)} disabled={!selected}
            className={`flex-1 py-3 text-white font-semibold rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 ${
              selected ? `${heartMeta(selected).solidBg} ${heartMeta(selected).solidHover}` : 'bg-gray-300'
            }`}>
            <Heart className={`w-4 h-4 ${selected ? 'fill-current' : ''}`} />
            보내기
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Contact Share Modal ──────────────────────────────────────────────────────

function ContactShareModal({
  liker, alreadyShared, myProfile, onSubmit, onReject, onClose,
}: {
  liker: Profile; alreadyShared: boolean; myProfile: Profile | null;
  onSubmit: (kakao: string, instagram: string, phone: string) => void;
  onReject: () => void; onClose: () => void;
}) {
  const [kakao, setKakao] = useState(myProfile?.kakao_id ?? '');
  const [instagram, setInstagram] = useState(myProfile?.instagram_id ?? '');
  const [phone, setPhone] = useState(myProfile?.phone_number ?? '');
  const [useKakao, setUseKakao] = useState(!!(myProfile?.kakao_id));
  const [useInstagram, setUseInstagram] = useState(!!(myProfile?.instagram_id));
  const [usePhone, setUsePhone] = useState(!!(myProfile?.phone_number));
  const [confirmReject, setConfirmReject] = useState(false);

  const isPrivate = myProfile?.contact_private ?? false;
  const canSubmit = !isPrivate && ((useKakao && kakao.trim()) || (useInstagram && instagram.trim()) || (usePhone && phone.trim()));

  if (alreadyShared) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
          <CheckCircle className="w-12 h-12 text-teal-500 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-gray-900 mb-1">연락처 공유 완료</h3>
          <p className="text-sm text-gray-500 mb-5">{liker.nickname}님에게 연락처를 이미 공유했습니다.</p>
          <button onClick={onClose} className="w-full py-3 bg-teal-500 text-white font-semibold rounded-xl hover:bg-teal-600 transition-all">확인</button>
        </div>
      </div>
    );
  }

  if (confirmReject) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <XCircle className="w-7 h-7 text-gray-500" />
          </div>
          <h3 className="text-base font-black text-gray-900 mb-1">공유를 거부하시겠습니까?</h3>
          <p className="text-sm text-gray-500 mb-5">
            {liker.nickname}님에게 <strong>"상대방이 연락처 공유를 거부하였습니다"</strong> 알림이 즉시 발송됩니다.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setConfirmReject(false)} className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-all">돌아가기</button>
            <button onClick={onReject} className="flex-1 py-3 bg-gray-800 text-white font-bold rounded-xl hover:bg-gray-900 transition-all">거부 확정</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="text-center mb-5">
          <div className="mx-auto mb-3">
            <ProfileAvatar profile={liker} size="md" rounded="xl" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 rounded-full mb-2">
            <Heart className="w-4 h-4 text-rose-400 fill-rose-400" />
            <span className="text-sm font-bold text-rose-700">{liker.nickname}님이 하트를 보냈습니다!</span>
          </div>
          <p className="text-sm text-gray-500">연락처를 공유하시겠습니까?</p>
        </div>

        {isPrivate ? (
          <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-4 text-center mb-5">
            <Lock className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm font-bold text-gray-600">연락처 비공개 설정됨</p>
            <p className="text-xs text-gray-400 mt-1">연락처 공유를 원하시면 프로필 설정에서 변경해 주세요.</p>
          </div>
        ) : (
          <div className="space-y-3 mb-5">
            {myProfile?.kakao_id && (
              <label className="flex items-center gap-2.5 cursor-pointer p-2.5 rounded-xl border-2 border-yellow-200 bg-yellow-50">
                <input type="checkbox" checked={useKakao} onChange={e => setUseKakao(e.target.checked)} className="w-4 h-4 accent-yellow-400" />
                <span className="text-xs font-black text-yellow-700">K</span>
                <span className="text-sm text-gray-700 flex-1">{myProfile.kakao_id}</span>
              </label>
            )}
            {!myProfile?.kakao_id && (
              <div>
                <label className="flex items-center gap-2.5 cursor-pointer mb-2">
                  <input type="checkbox" checked={useKakao} onChange={e => setUseKakao(e.target.checked)} className="w-4 h-4 rounded accent-yellow-400" />
                  <span className="text-sm font-semibold text-gray-700">카카오톡 ID</span>
                </label>
                {useKakao && (
                  <input type="text" value={kakao} onChange={e => setKakao(e.target.value)} placeholder="카카오톡 아이디 입력"
                    className="w-full px-3 py-2.5 border border-yellow-300 rounded-xl text-sm focus:ring-2 focus:ring-yellow-400 outline-none bg-yellow-50" />
                )}
              </div>
            )}
            {myProfile?.instagram_id && (
              <label className="flex items-center gap-2.5 cursor-pointer p-2.5 rounded-xl border-2 border-pink-200 bg-pink-50">
                <input type="checkbox" checked={useInstagram} onChange={e => setUseInstagram(e.target.checked)} className="w-4 h-4 accent-pink-500" />
                <span className="text-xs font-black text-pink-500">@</span>
                <span className="text-sm text-gray-700 flex-1">{myProfile.instagram_id}</span>
              </label>
            )}
            {!myProfile?.instagram_id && (
              <div>
                <label className="flex items-center gap-2.5 cursor-pointer mb-2">
                  <input type="checkbox" checked={useInstagram} onChange={e => setUseInstagram(e.target.checked)} className="w-4 h-4 rounded accent-pink-500" />
                  <span className="text-sm font-semibold text-gray-700">인스타그램</span>
                </label>
                {useInstagram && (
                  <input type="text" value={instagram} onChange={e => setInstagram(e.target.value)} placeholder="@인스타그램 아이디"
                    className="w-full px-3 py-2.5 border border-pink-300 rounded-xl text-sm focus:ring-2 focus:ring-pink-400 outline-none bg-pink-50" />
                )}
              </div>
            )}
            {myProfile?.phone_number && (
              <label className="flex items-center gap-2.5 cursor-pointer p-2.5 rounded-xl border-2 border-green-200 bg-green-50">
                <input type="checkbox" checked={usePhone} onChange={e => setUsePhone(e.target.checked)} className="w-4 h-4 accent-green-500" />
                <span className="text-xs font-black text-green-600">#</span>
                <span className="text-sm text-gray-700 flex-1">{myProfile.phone_number}</span>
              </label>
            )}
            {!myProfile?.phone_number && (
              <div>
                <label className="flex items-center gap-2.5 cursor-pointer mb-2">
                  <input type="checkbox" checked={usePhone} onChange={e => setUsePhone(e.target.checked)} className="w-4 h-4 rounded accent-green-500" />
                  <span className="text-sm font-semibold text-gray-700">전화번호</span>
                </label>
                {usePhone && (
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="010-0000-0000"
                    className="w-full px-3 py-2.5 border border-green-300 rounded-xl text-sm focus:ring-2 focus:ring-green-400 outline-none bg-green-50" />
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={() => setConfirmReject(true)}
            className="px-4 py-3 bg-gray-100 text-gray-600 font-semibold rounded-xl hover:bg-gray-200 transition-all text-sm">
            거부
          </button>
          <button onClick={onClose} className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-all text-sm">
            나중에
          </button>
          {!isPrivate && (
            <button onClick={() => canSubmit && onSubmit(useKakao ? kakao : '', useInstagram ? instagram : '', usePhone ? phone : '')} disabled={!canSubmit}
              className="flex-1 py-3 bg-rose-500 text-white font-semibold rounded-xl hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm">
              공유하기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Contact View Modal ───────────────────────────────────────────────────────

function ContactViewModal({
  share, likedProfile, onClose,
}: {
  share: ContactShare; likedProfile: Profile; onClose: () => void;
}) {
  const hasAny = share.kakao || share.instagram || share.phone;
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = async (text: string, label: string) => {
    try {
      (window as unknown as Record<string, unknown>).__clipboardActive = true;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      setCopied(label);
      setTimeout(() => { setCopied(null); (window as unknown as Record<string, unknown>).__clipboardActive = false; }, 1800);
    } catch {
      setCopied('복사 실패');
      setTimeout(() => { setCopied(null); (window as unknown as Record<string, unknown>).__clipboardActive = false; }, 1800);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="text-center mb-5">
          <div className="mx-auto mb-3">
            <ProfileAvatar profile={likedProfile} size="md" rounded="xl" />
          </div>
          <h3 className="text-lg font-bold text-gray-900">{likedProfile.nickname}</h3>
          <p className="text-xs text-teal-600 font-semibold mt-1">연락처를 공유했습니다!</p>
          <p className="text-[11px] text-gray-400 mt-1">항목을 확인하고 복사 버튼을 눌러 저장하세요</p>
        </div>
        {hasAny ? (
          <div className="space-y-2.5 mb-5">
            {share.kakao && (
              <div className="flex items-center gap-3 px-4 py-3 bg-yellow-50 rounded-xl border border-yellow-200">
                <span className="text-yellow-600 font-black text-base w-6 text-center">K</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-yellow-600 font-medium">카카오톡</p>
                  <p className="text-sm font-bold text-gray-800 truncate">{share.kakao}</p>
                </div>
                <button type="button" onClick={() => copyToClipboard(share.kakao!, '카카오톡 ID')}
                  className="flex-shrink-0 px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 active:scale-95 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1">
                  <Copy className="w-3.5 h-3.5" />복사
                </button>
              </div>
            )}
            {share.instagram && (
              <div className="flex items-center gap-3 px-4 py-3 bg-pink-50 rounded-xl border border-pink-200">
                <span className="text-pink-500 font-black text-base w-6 text-center">@</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-pink-600 font-medium">인스타그램</p>
                  <p className="text-sm font-bold text-gray-800 truncate">{share.instagram}</p>
                </div>
                <button type="button" onClick={() => copyToClipboard(share.instagram!, '인스타그램 아이디')}
                  className="flex-shrink-0 px-3 py-1.5 bg-pink-500 hover:bg-pink-600 active:scale-95 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1">
                  <Copy className="w-3.5 h-3.5" />복사
                </button>
              </div>
            )}
            {share.phone && (
              <div className="flex items-center gap-3 px-4 py-3 bg-green-50 rounded-xl border border-green-200">
                <Phone className="w-4 h-4 text-green-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-green-600 font-medium">전화번호</p>
                  <p className="text-sm font-bold text-gray-800 truncate">{share.phone}</p>
                </div>
                <button type="button" onClick={() => copyToClipboard(share.phone!, '전화번호')}
                  className="flex-shrink-0 px-3 py-1.5 bg-green-500 hover:bg-green-600 active:scale-95 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1">
                  <Copy className="w-3.5 h-3.5" />복사
                </button>
              </div>
            )}
          </div>
        ) : (
          <p className="text-center text-gray-400 text-sm mb-5">공유된 연락처가 없습니다.</p>
        )}
        <button onClick={onClose} className="w-full py-3 bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-semibold rounded-xl hover:from-cyan-600 hover:to-teal-600 transition-all">
          확인
        </button>
      </div>
      {copied && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 bg-slate-900/95 text-white text-sm font-semibold rounded-full shadow-2xl flex items-center gap-2 animate-[fadeIn_0.2s_ease-out]">
          <CheckCircle className="w-4 h-4 text-teal-400" />
          {copied === '복사 실패' ? copied : `${copied} 복사됨`}
        </div>
      )}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

const MATCHING_USER_KEY = 'matching_app_user_id';
const MATCHING_DRAFT_KEY = 'matching_app_draft_step1';
const MATCHING_LAST_RESET_KEY = 'matching_app_last_reset_signal';
const MATCHING_GUIDE_SHOWN_KEY = 'matching_guide_shown';
const MATCHING_PROFILES_CACHE_KEY = 'matching_profiles_cache';
const MATCHING_SEATS_CACHE_KEY = 'matching_seats_cache';

function safeLocalStorage() {
  try { localStorage.getItem('_test'); return localStorage; }
  catch { return { getItem: () => null, setItem: () => {}, removeItem: () => {} } as Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>; }
}
const ls = safeLocalStorage();

// ─── Nickname Generator ──────────────────────────────────────────────────────
// Combines birthYear + location + interests (excludes mbti and dom/sub position)
// to produce 5 witty, characterful nicknames (≤ 7 Korean characters).

const NICKNAME_PREFIXES: { word: string; concept: string }[] = [
  { word: '열정적인', concept: '{region} 태생 열정 폭발형' },
  { word: '반짝이는', concept: '{region}의 분위기 책임자' },
  { word: '느긋한', concept: '여유가 재산인 {region} 라이프' },
  { word: '배포 큰', concept: '배포 큰 {region} 인싸' },
  { word: '감성적인', concept: '감성 200% {region} 힐러' },
  { word: '스마일', concept: '웃음 후원자, 살아있는 😀' },
  { word: '도도한', concept: '츤데레 끝판왕' },
  { word: '상큼한', concept: '{region} 발 비타민C' },
  { word: '파란만남', concept: '{region} 콘텐츠 제조기' },
  { word: '유쾌한', concept: '개그 코드 장착 예능인' },
  { word: '뻔뻔한', concept: '당당함 끝판왕' },
  { word: '다정한', concept: '보따리 다정함' },
  { word: '호기심많은', concept: '호기심 체험단' },
  { word: '날라리', concept: '{region} 발 자유 영혼' },
  { word: '골목대장', concept: '동네 텐션 장인' },
  { word: '로맨틱', concept: '로맨스 장르 주인공' },
  { word: '직진', concept: '{region} 발 직진 로켓' },
  { word: '여유로운', concept: '힐링이 본업인 라이프' },
  { word: '전설의', concept: '{region} 전설의 주인공' },
  { word: '비밀스러운', concept: '미스터리 박스' },
  { word: '갓생', concept: '{region} 발 갓생 살이' },
  { word: '알잘딹', concept: '알잘딹깔센스 장인' },
  { word: '깔쌈', concept: '{region} 발 깔쌈함' },
  { word: '존버', concept: '존버 끝에 웃는 자' },
  { word: '맑눈광', concept: '맑은 눈의 광인' },
  { word: '폼 미쳤', concept: '폼 미친 {region} 예능인' },
  { word: '취향저격', concept: '{region} 발 취향 저격수' },
];
const INTEREST_CONCEPTS: Record<string, string> = {
  '운동': '근육으로 말해요', '헬스': '오운완 인증러', '필라테스/요가': '명상 모드',
  '골프': '그린 위의 힐러', '테니스': '서브에이스 요정', '자전거': '페달 위 자유인',
  '등산': '산신령 모험가', '낚시': '대물 사냥꾼', '수영': '아쿠아맨',
  '클라이밍': '바위 타는 거미', '축구/풋살': '드리블 영웅', '배드민턴': '스매셔',
  '볼링': '스트라이커', '스키/보드': '설산 라이더', '카페': '카페인 중독자',
  '맛집탐방': '미식 블로거', '술자리': '오운술 인증러', '요리': '자칭 셰프',
  '디저트': '단것 헌터', '와인': '소믈리에 지망생', '위스키': '싱글몰트 탐험가',
  '브런치': '모닝 라이프', '여행': '유목민 라이프', '쇼핑': '트렌드 세터',
  '반려동물': '냥이집사/견아빠', '사진찍기': '렌즈러버', '독서': '문학 청년',
  '드라이브': '나이트 드라이버', '인테리어': '홈 스타일러', '원예/식물': '식물 집사',
  '자기계발': '성장형 인간', '명상/요가': '마음 요가', '영화/드라마': '넷플릭스 정주행러',
  '음악감상': '멜로맨', 'OTT': '정주행 장인', '유튜브': '쇼츠 소비자',
  '게임': '하드캐리 랭커', '웹툰': '툰덕후', '공연/전시': '아트 러버',
  '라이브방송': '스트리머 견습', '팝/힙합': '비트 요정', '재즈/클래식': '선율 러버',
  '보드게임': '전략가', '노래방': '금콩 보컬', '방탈출': '단서 탐정',
  '클럽/바': '나이트 댄서', '독서모임': '북클럽 멤버', '소모임': '네트워커',
  '봉사활동': '선행 크루', '맥주축제': '크래프트 러버', '야구직관': '직관러',
  '페스티벌': '축제 헌터', '뜨밤': '설렘 수집가', '기타': '올라운더 매력',
};
const NICKNAME_SUFFIXES_BY_INTEREST: Record<string, string[]> = {
  '운동': ['근육맨','헬스왕','오운완','땀방울','바디빌더'],
  '헬스': ['근육맨','헬스왕','오운완','철인','벤치프레스'],
  '필라테스/요가': ['요가마스터','필라인','명상가','스트레처','플랭크'],
  '골프': ['골프왕','홀인원','드라이버','그린러버','샷메이커'],
  '테니스': ['테니스왕','서브에이스','라켓히어로','코트러버','발리왕'],
  '자전거': ['자전거왕','체인러버','페달러','래피드','크루저'],
  '등산': ['등산왕','산신령','정복자','트레커','능선러버'],
  '낚시': ['낚시왕','대물사냥꾼','조과왕','루어마니아','바다러버'],
  '수영': ['수영왕','자유형히어로','아쿠아맨','물개','파도러버'],
  '클라이밍': ['클라이머','바위왕','홀드러버','고도러버','짐왕'],
  '축구/풋살': ['축구왕','드리블러','골게터','풋살히어로','필드러버'],
  '배드민턴': ['스매셔','라켓왕','코트러버','셔틀히어로','발리왕'],
  '볼링': ['볼링왕','스트라이커','스페어히어로','레인러버','파울라인'],
  '스키/보드': ['스키왕','보더','설산러버','활강러버','카빙왕'],
  '카페': ['카페러버','커피홀릭','바리스타','라떼러버','드립러버'],
  '맛집탐방': ['미식가','맛집헌터','식도락','푸드러버','미각왕'],
  '술자리': ['술꾼','전주왕','칠링러버','오운술','건배러버'],
  '요리': ['요리사','셰프','쿡러버','한식왕','베이커리'],
  '디저트': ['디저트왕','단디','케이크러버','마카롱','단것러버'],
  '와인': ['와인러버','소믈리에','적와인','화이트러버','보틀러버'],
  '위스키': ['위스키러버','바텐더','싱글몰트','온더락','바럴러버'],
  '브런치': ['브런치러버','모닝러버','에그베네딕트','팬케이크','커피와함께'],
  '여행': ['여행러버','유목민','배낭러버','세계일주','탐험가'],
  '쇼핑': ['쇼핑러버','트렌드세터','할인헌터','백화러버','픽셔니스타'],
  '반려동물': ['반려러버','강아지아빠','냥이집사','펫러버','동물러버'],
  '사진찍기': ['포토그래퍼','렌즈러버','스냅왕','풍경러버','프레임러버'],
  '독서': ['독서러버','북러버','문학청년','도서러버','베스트셀러'],
  '드라이브': ['드라이브러버','카러버','해안도로','나이트드라이브','휠러버'],
  '인테리어': ['인테리어러버','홈스타일러','DIY왕','가구러버','플랫러버'],
  '원예/식물': ['식물러버','가드너','화훼왕','초록러버','잎러버'],
  '자기계발': ['자기계발러','그로우러버','성장왕','셀프리더','미션러버'],
  '명상/요가': ['명상러버','마음러버','요기','명상왕','텅빈마음'],
  '영화/드라마': ['영화광','드라마러버','시네필','넷플릭서','스크린러버'],
  '음악감상': ['음악러버','멜로맨','이어폰러버','플레이리스트','음표러버'],
  'OTT': ['OTT러버','정주행왕','시리즈러버','스크린러버','한입러버'],
  '유튜브': ['유튜버','구독러버','쇼츠왕','채널러버','조회러버'],
  '게임': ['게이머','하드캐리','랭커','콘솔러버','보스러버'],
  '웹툰': ['웹툰러버','툰러버','연재러버','일러스트러버','만화왕'],
  '공연/전시': ['공연러버','아트러버','갤러리러버','무대러버','전시러버'],
  '라이브방송': ['스트리머','라이브러버','시청왕','방송러버','채팅러버'],
  '팝/힙합': ['힙합러버','비트러버','래퍼','플로우왕','리듬러버'],
  '재즈/클래식': ['재즈러버','클래식러버','오케스트라','피아니스트','선율러버'],
  '보드게임': ['보드게이머','전략왕','주사위러버','팀러버','카드러버'],
  '노래방': ['노래방왕','금콩','보컬왕','노래러버','마이크히어로'],
  '방탈출': ['방탈출러버','단서왕','탈출러버','퍼즐러버','큐어러버'],
  '클럽/바': ['클럽러버','바러버','나이트러버','댄스러버','DJ러버'],
  '독서모임': ['독서모임러버','북클럽','토론왕','문학러버','북러버'],
  '소모임': ['소모임러버','동호회왕','모임러버','클럽러버','네트워커'],
  '봉사활동': ['봉사러버','선행왕','도움러버','기부러버','씨앗러버'],
  '맥주축제': ['맥주러버','축제왕','크래프트러버','홉러버','축제러버'],
  '야구직관': ['야구러버','직관왕','야구광','스탠드러버','챔피언'],
  '페스티벌': ['페스티벌러버','축제왕','라인업러버','뮤직러버','야외러버'],
  '뜨밤': ['뜨밤러버','핫템러버','알쏭달쏭','설렘왕','베일러버'],
  '기타': ['올라운더','다재다능','프리스타일','미스터리','올인'],
};

// 관심사별 동사/부정동사 — 문장형·위트 닉네임 생성용
const INTEREST_VERBS: Record<string, string[]> = {
  '낚시': ['월척을꿈꾸는','대물을노리는','입질기다리는','찌를바라는'],
  '등산': ['정상을노리는','능선을걷는','산을헤매는','야호를외치는'],
  '골프': ['홀인원꿈꾸는','드라이버쥔','그린을노리는','샷을날리는'],
  '게임': ['랭커를꿈꾸는','캐리하는','보스잡는','겜하는'],
  '방탈출': ['탈출을꿈꾸는','단서를찾는','방을헤매는','열쇠를찾는'],
  '요리': ['셰프를꿈꾸는','냉장고비우는','한그릇하는','프라이팬쥔'],
  '카페': ['커피를마시는','드립을하는','카페인투입','빈잔을보는'],
  '맛집탐방': ['미식을즐기는','맛집을찾는','식도락하는','줄서는'],
  '여행': ['세계를누비는','배낭을메는','유목하는','비행기태우는'],
  '헬스': ['근육을키우는','오운완하는','철을드는','땀흘리는'],
  '축구/풋살': ['골을넣는','드리블하는','풋살하는','패스하는'],
  '영화/드라마': ['정주행하는','넷플릭스하는','스크린보는','엔딩보는'],
  '와인': ['잔을기울이는','소믈리에꿈꾸는','코르크따는'],
  '위스키': ['잔을굴리는','싱글마시는','바를지키는'],
  '드라이브': ['바람타는','야간주행하는','핸들잡는','해안도로가는'],
  '사진찍기': ['셔터누르는','프레임잡는','렌즈바꾸는','구도잡는'],
  '독서': ['책을읽는','페이지넘기는','문학하는','책냄새맡는'],
  '수영': ['물을가르는','자유형하는','아쿠아맨꿈꾸는'],
  '음악감상': ['리듬타는','선율빠지는','이어폰낀','멜로맨'],
  '보드게임': ['전략짜는','주사위굴리는','한수앞보는'],
  '노래방': ['금콩부르는','마이크잡은','하이음도전'],
  '운동': ['몸을움직이는','땀흘리는','체력키우는','오운완하는'],
  '필라테스/요가': ['플랭크하는','요가매트펴는','코어잡는','스트레칭하는'],
  '테니스': ['서브날리는','라켓잡은','코트달리는','발리하는'],
  '자전거': ['페달밟는','라이딩하는','체인돌리는','언덕오르는'],
  '클라이밍': ['홀드잡는','벽을오르는','루트꿰는','짐통하는'],
  '배드민턴': ['셔틀치는','스매시하는','라켓날리는','코트뛰는'],
  '볼링': ['핀쓰러뜨리는','스트라이크꿈꾸는','레인달리는','볼굴리는'],
  '스키/보드': ['설산달리는','카빙하는','슬로프내려오는','보드타는'],
  '술자리': ['건배하는','같이마시는','분위기띄우는','술잔기울이는'],
  '디저트': ['단걸즐기는','케이크먹는','마카롱고르는','달달함찾는'],
  '브런치': ['모닝즐기는','에그베네딕트먹는','오전을즐기는','커피와함께하는'],
  '쇼핑': ['트렌드찾는','할인헌터하는','백화점도는','픽업하는'],
  '반려동물': ['강아지키우는','냥집사인','펫러버인','동물덕후인'],
  '인테리어': ['집꾸미는','DIY하는','가구고르는','공간꾸미는'],
  '원예/식물': ['식물키우는','화분채우는','물주는','가드닝하는'],
  '자기계발': ['성장하는','책읽고배우는','목표잡는','스터디하는'],
  '명상/요가': ['마음비우는','명상하는','호흡고르는','요가하는'],
  'OTT': ['정주행하는','시리즈보는','한입보는','밤새보는'],
  '유튜브': ['쇼츠보는','채널구독하는','영상찾는','댓글다는'],
  '웹툰': ['연재기다리는','툰읽는','최신화보는','결말기다리는'],
  '공연/전시': ['갤러리가는','공연보는','무대즐기는','전시탐방하는'],
  '라이브방송': ['라이브보는','채팅하는','스트리밍즐기는','방송보는'],
  '팝/힙합': ['비트타는','힙합즐기는','플레이리스트채우는','래퍼꿈꾸는'],
  '재즈/클래식': ['선율즐기는','재즈빠진','클래식듣는','오케스트라꿈꾸는'],
  '클럽/바': ['나이트즐기는','댄스하는','DJ따라다니는','바분위기즐기는'],
  '독서모임': ['책토론하는','북클럽가는','문학즐기는','독서모임나가는'],
  '소모임': ['동호회나가는','모임즐기는','네트워킹하는','같이노는'],
  '봉사활동': ['선행하는','봉사나가는','도움주는','씨앗심는'],
  '맥주축제': ['크래프트즐기는','축제가는','맥주홉마시는','부스돌리는'],
  '야구직관': ['직관가는','응원하는','스탠드에서외치는','야구보는'],
  '페스티벌': ['라인업기다리는','야외즐기는','뮤직페스가는','축제뛰는'],
  '뜨밤': ['설레는밤즐기는','뜨거운밤찾는','핫한밤나가는','오늘밤불태우는'],
  '기타': ['뭐든즐기는','올라운더인','다재다능한','자유로운'],
};

const INTEREST_NEG_VERBS: Record<string, string[]> = {
  '낚시': ['공치는','빈바구니든','입질없는','물고기없는'],
  '방탈출': ['탈출못하는','단서놓친','갇힌','못나가는'],
  '골프': ['홀인원못하는','샷놓친','페널티맞은','OB맞은'],
  '게임': ['랭크떨어진','캐리못하는','보스한테진','트롤인'],
  '요리': ['요리못하는','라면만끓는','냉장고방치','셰프아닌'],
  '카페': ['카페인중독','커피만마시는','드립못하는','물만마시는'],
  '맛집탐방': ['맛집못찾는','배달만시키는','줄못서는'],
  '여행': ['집콕하는','여행못가는','방구석인','배낭안메는'],
  '헬스': ['운동안하는','눕기만하는','체육관안가','근육없는'],
  '축구/풋살': ['골못넣는','드리블못하는','벤치인','패스못하는'],
  '영화/드라마': ['스포당한','정주행못하는','중간에끊긴','결말아는'],
  '와인': ['잔만만지는','소믈리에아닌','마시기만'],
  '위스키': ['잔만굴리는','바에만있는','마시기만'],
  '드라이브': ['주차만하는','막힌길인','핸들잡기만'],
  '사진찍기': ['구도못잡는','렌즈만바꾸는','찍기만하는'],
  '독서': ['책만사는','첫장만읽는','책장채우는'],
  '수영': ['물무서워하는','발만담근','아쿠아맨아닌'],
  '음악감상': ['노래못부르는','박자놓친','음정떠난'],
  '보드게임': ['전략없는','주사위만굴리는','한수뒤진'],
  '노래방': ['음정떠난','박자놓친','금콩아닌'],
  '운동': ['눈팅만하는','계획만세우는','작심삼일인'],
  '필라테스/요가': ['매트만편는','첫날만간','코어없는'],
  '테니스': ['서브안들어가는','코트못찾는','라켓만비싼'],
  '자전거': ['펑크난','체인빠진','언덕포기한'],
  '클라이밍': ['홀드놓친','벽에붙은','짐통못간'],
  '배드민턴': ['셔틀못치는','라켓만비싼','스매시빗나간'],
  '볼링': ['거터에빠진','핀못맞히는','볼만굴리는'],
  '스키/보드': ['리프트만타는','넘어지는','설산두려운'],
  '술자리': ['한잔만하는','일찍귀가하는','이구간에서'],
  '디저트': ['사진만찍는','한입만먹는','칼로리두려운'],
  '브런치': ['메뉴못고르는','늦잠자는','줄서기싫은'],
  '쇼핑': ['구경만하는','카드긁기무서운','장바구니채우기만'],
  '반려동물': ['알레르기있는','털알러지인','바라만보는'],
  '인테리어': ['계획만세우는','핀터레스트만보는','실행못하는'],
  '원예/식물': ['식물죽이는','물못주는','화분방치하는'],
  '자기계발': ['작심삼일인','유튜브만보는','플래너만사는'],
  '명상/요가': ['10분도못앉는','잡념많은','자꾸졸리는'],
  'OTT': ['결말스포당한','구독만하는','1화만보는'],
  '유튜브': ['추천알고리즘빠진','쇼츠중독인','시간가는줄모르는'],
  '웹툰': ['결말못보는','연재기다리는','정주행못하는'],
  '공연/전시': ['예매못한','티켓전쟁진','줄만선'],
  '라이브방송': ['방송끊기는','채팅놓치는','아이템쏘는'],
  '팝/힙합': ['가사못외우는','랩못하는','박자틀리는'],
  '재즈/클래식': ['이름모르는','졸린','음악틀리는'],
  '클럽/바': ['집가고싶은','음료만마시는','음악너무큰'],
  '독서모임': ['책못읽은','요약만보는','숙제안한'],
  '소모임': ['약속못지키는','모임빠지는','소모임탈퇴한'],
  '봉사활동': ['초보봉사자인','길을헤매는','첫날인'],
  '맥주축제': ['1잔에취한','부스못찾는','줄에지친'],
  '야구직관': ['규칙모르는','응원못외운','직관초보인'],
  '페스티벌': ['지도못보는','텐트못친','무대못찾는'],
  '뜨밤': ['일찍귀가하는','체력바닥인','다음엔나가는'],
  '기타': ['정체불명인','규정없는','자유로운척하는'],
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const BANNED_NICKNAME_WORDS = ['씨발','시발','병신','좆','보지','자지','섹스','색스','색기','정액','성기','개새','개년','창녀','남창','테러','암살','마약','자살','도박','사기','범죄','음란','외설','저격','학살','꼴통','찌질이','쓰레기','퇴폐','불법'];

function containsBannedNicknameWord(s: string): boolean {
  const lower = s.toLowerCase();
  return BANNED_NICKNAME_WORDS.some((w) => lower.includes(w.toLowerCase()));
}

function stripRegion(location: string): string {
  // Strip leading region prefix like '경기 수원' → '수원'
  const parts = location.split(' ');
  return parts.length > 1 ? parts[parts.length - 1] : location;
}

function koreanLength(s: string): number {
  return [...s].length;
}

// 관심사 정규화: 슬래시 포함 관심사를 자연스러운 짧은 형태로 변환
const INTEREST_NORMALIZE: Record<string, string> = {
  '공연/전시':    '공연',
  '필라테스/요가': '필라테스',
  '스키/보드':    '스키',
  '축구/풋살':    '축구',
  '팝/힙합':      '힙합',
  '재즈/클래식':  '재즈',
  '영화/드라마':  '영화',
  '맛집탐방':     '맛집',
  '음악감상':     '음악',
  '라이브방송':   '라이브',
  '사진찍기':     '사진',
  '자기계발':     '자기계발',
  '술자리':       '술',
};

function normalizeInterest(interest: string): string {
  return INTEREST_NORMALIZE[interest] ?? interest;
}

// 마지막 글자 받침 여부로 조사 선택 (이/가, 을/를, 은/는)
function hasJongseong(char: string): boolean {
  const code = char.charCodeAt(0) - 0xAC00;
  return code >= 0 && code < 11172 && code % 28 !== 0;
}

// 템플릿에서 조사 오류 자동 수정
// [관심사]가취미인 → 받침 있으면 이취미인
function fixParticle(s: string): string {
  return s.replace(/(\S)가취미인/g, (_, prev) =>
    hasJongseong(prev) ? `${prev}이취미인` : `${prev}가취미인`
  ).replace(/(\S)가전부인/g, (_, prev) =>
    hasJongseong(prev) ? `${prev}이전부인` : `${prev}가전부인`
  );
}

// ── 닉네임 생성 데이터셋 ──────────────────────────────────────────────────────

// 관심사 타입 분류
// action: 동사형으로 쓸 수 있는 활동 (게임하다, 낚시하다, 요리하다 등)
// lifestyle: 명사형 장소/취향 (카페, 여행, 맛집탐방 등) — 동사형 접미사와 충돌
const ACTION_INTERESTS = new Set([
  '운동', '헬스', '필라테스/요가', '골프', '테니스', '자전거', '등산', '낚시',
  '수영', '클라이밍', '축구/풋살', '배드민턴', '볼링', '스키/보드',
  '요리', '게임', '사진찍기', '독서', '드라이브', '원예/식물',
  '자기계발', '명상/요가', '보드게임', '방탈출', '봉사활동',
  '음악감상', '공연/전시', '라이브방송',
]);

// 어떤 관심사와도 자연스러운 "만능" 접미사를 포함한 템플릿
// type: 'any' = 모든 관심사, 'action' = 활동형 관심사만
type NickTpl = { template: string; label: string; type: 'any' | 'action' };

const NICKNAME_TEMPLATES: NickTpl[] = [
  // ── any (만능) ──────────────────────────────────────────────────────────────
  { template: '[나이]살[관심사]천재',           label: '랜덤', type: 'any' },
  { template: '[관심사]가취미인[지역]사람',     label: '랜덤', type: 'any' },
  { template: '[나이]살[관심사]박사',           label: '랜덤', type: 'any' },
  { template: '[관심사]없인못사는[지역]인',     label: '랜덤', type: 'any' },
  { template: '[나이]년생[관심사]지존',         label: '랜덤', type: 'any' },
  { template: '[관심사]바라기[지역]사람',       label: '랜덤', type: 'any' },
  { template: '[지역]의[관심사]요정',           label: '랜덤', type: 'any' },
  { template: '[나이]살[관심사]고수',           label: '랜덤', type: 'any' },
  { template: '[관심사]홀릭[지역]사람',         label: '랜덤', type: 'any' },
  { template: '[나이]년생[관심사]요정',         label: '랜덤', type: 'any' },
  { template: '[관심사]즐기는[지역]인',         label: '랜덤', type: 'any' },
  { template: '[나이]살[관심사]매니아',         label: '랜덤', type: 'any' },
  { template: '[관심사]러버[지역]사람',         label: '랜덤', type: 'any' },
  { template: '[지역]의[관심사]킹',             label: '랜덤', type: 'any' },
  { template: '[나이]살[관심사]쟁이',           label: '랜덤', type: 'any' },
  { template: '[관심사]덕후[지역]사람',         label: '랜덤', type: 'any' },
  { template: '[지역]의[관심사]장인',           label: '랜덤', type: 'any' },
  { template: '[나이]년생[관심사]퀸',           label: '랜덤', type: 'any' },
  { template: '[관심사]만보는[지역]인',         label: '랜덤', type: 'any' },
  { template: '[나이]살[관심사]천재',           label: '랜덤', type: 'any' },
  { template: '[관심사]에진심인[지역]인',       label: '랜덤', type: 'any' },
  { template: '[나이]년생[관심사]도사',         label: '랜덤', type: 'any' },
  { template: '[관심사]프로[지역]인',           label: '랜덤', type: 'any' },
  { template: '[지역]의[관심사]천사',           label: '랜덤', type: 'any' },
  { template: '[나이]살[관심사]대왕',           label: '랜덤', type: 'any' },
  { template: '[관심사]연구중인[지역]인',       label: '랜덤', type: 'any' },
  { template: '[지역]의[관심사]스타',           label: '랜덤', type: 'any' },
  { template: '[나이]살[관심사]지니어스',       label: '랜덤', type: 'any' },
  { template: '[나이]년생[관심사]신동',         label: '랜덤', type: 'any' },
  { template: '[지역]대표[관심사]꾼',           label: '랜덤', type: 'any' },
  { template: '[나이]년생[관심사]술사',         label: '랜덤', type: 'any' },
  { template: '[관심사]마스터[지역]인',         label: '랜덤', type: 'any' },
  // ── action 전용 (활동형 관심사만) ──────────────────────────────────────────
  { template: '[지역]의[관심사]괴물',           label: '랜덤', type: 'action' },
  { template: '[지역]대표[관심사]대장',         label: '랜덤', type: 'action' },
  { template: '[지역]에서[관심사]젤잘해',       label: '랜덤', type: 'action' },
  { template: '[지역]의[관심사]왕자',           label: '랜덤', type: 'action' },
  { template: '[지역]의[관심사]공주',           label: '랜덤', type: 'action' },
  { template: '[지역]의[관심사]킬러',           label: '랜덤', type: 'action' },
  { template: '[나이]년생[관심사]광인',         label: '랜덤', type: 'action' },
  { template: '[관심사]풀파워[지역]인',         label: '랜덤', type: 'action' },
  { template: '[지역]의[관심사]대통령',         label: '랜덤', type: 'action' },
  { template: '[나이]년생[관심사]악마',         label: '랜덤', type: 'action' },
  { template: '[관심사]에미친[지역]인',         label: '랜덤', type: 'action' },
  { template: '[지역]의[관심사]탐정',           label: '랜덤', type: 'action' },
  { template: '[지역]의[관심사]보스',           label: '랜덤', type: 'action' },
  { template: '[지역]의[관심사]영웅',           label: '랜덤', type: 'action' },
  { template: '[관심사]킬러[지역]인',           label: '랜덤', type: 'action' },
  { template: '[나이]살[관심사]천사',           label: '랜덤', type: 'action' },
];

const NICKNAME_CONCEPTS: NickTpl[] = [
  { template: '[관심사]에진심인[나이]살',       label: '열정형',   type: 'any' },
  { template: '[관심사]가취미인[지역]사람',     label: '동호회형', type: 'any' },
  { template: '[지역]대표[관심사]천재',         label: '능력자형', type: 'any' },
  { template: '[지역]의[관심사]요정님',         label: '요정형',   type: 'any' },
  { template: '[관심사]계의살아있는전설',       label: '독보적형', type: 'any' },
  { template: '[관심사]레벨[나이]마스터',       label: '레벨업형', type: 'any' },
  { template: '[지역]의기운받은[관심사]러',     label: '운세형',   type: 'any' },
  { template: '[관심사]하는[지역]댕댕이',       label: '반려동물형', type: 'any' },
  { template: '[관심사]에미쳐버린[나이]세상',   label: '과몰입형', type: 'action' },
  { template: '[관심사]쫓는[지역]탐정',        label: '탐정형',   type: 'action' },
];

function applyNicknameTemplate(tpl: string, region: string, age: string, interest: string): string {
  return tpl
    .replace(/\[지역\]/g, region || '우리동네')
    .replace(/\[나이\]/g, age || '20대')
    .replace(/\[관심사\]/g, interest || '게임');
}

function generateNicknameCandidates(birthYear: number, location: string, interests: string[]): { nickname: string; concept: string }[] {
  const region = stripRegion(location) || '우리동네';
  const age = String(birthYear).slice(-2);
  const safeInterests = interests.length > 0 ? interests : ['게임'];
  const LIMIT = 8;
  const seen = new Set<string>();
  const result: { nickname: string; concept: string }[] = [];
  let attempts = 0;

  const allTemplates = [...NICKNAME_TEMPLATES, ...NICKNAME_CONCEPTS];
  const shuffled = [...allTemplates].sort(() => Math.random() - 0.5);
  let idx = 0;

  while (result.length < 5 && attempts < 300) {
    attempts++;
    const tplEntry = shuffled[idx % shuffled.length];
    idx++;
    const interest = pickRandom(safeInterests);
    // action 전용 템플릿은 활동형 관심사와만 조합
    if (tplEntry.type === 'action' && !ACTION_INTERESTS.has(interest)) continue;
    const normalizedInterest = normalizeInterest(interest);
    let candidate = applyNicknameTemplate(tplEntry.template, region, age, normalizedInterest);
    candidate = fixParticle(candidate);
    // 절단 없이 길이 범위를 벗어나면 버림 (단어 중간 잘림 방지)
    const len = koreanLength(candidate);
    if (len < 3 || len > LIMIT) continue;
    if (!containsBannedNicknameWord(candidate) && !seen.has(candidate)) {
      seen.add(candidate);
      const concept = tplEntry.label === '랜덤'
        ? `${region} · ${interest}`
        : `[${tplEntry.label}] ${region} · ${interest}`;
      result.push({ nickname: candidate, concept });
    }
  }
  // 후보가 부족하면 LIMIT를 늘려서 재시도
  if (result.length < 5) {
    const RELAXED_LIMIT = 14;
    const reshuffled = [...allTemplates].sort(() => Math.random() - 0.5);
    for (const tplEntry of reshuffled) {
      if (result.length >= 5) break;
      const interest = pickRandom(safeInterests);
      if (tplEntry.type === 'action' && !ACTION_INTERESTS.has(interest)) continue;
      const normalizedInterest = normalizeInterest(interest);
      let candidate = applyNicknameTemplate(tplEntry.template, region, age, normalizedInterest);
      candidate = fixParticle(candidate);
      const len = koreanLength(candidate);
      if (len < 3 || len > RELAXED_LIMIT) continue;
      if (!containsBannedNicknameWord(candidate) && !seen.has(candidate)) {
        seen.add(candidate);
        const concept = tplEntry.label === '랜덤'
          ? `${region} · ${interest}`
          : `[${tplEntry.label}] ${region} · ${interest}`;
        result.push({ nickname: candidate, concept });
      }
    }
  }
  return result.slice(0, 5);
}

class StatusErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error('[StatusTab crash]', error); }
  render() {
    if (this.state.error) {
      return (
        <div className="p-6 text-center">
          <p className="text-sm font-bold text-red-500 mb-2">내 상태를 불러오는 중 오류가 발생했습니다.</p>
          <p className="text-xs text-gray-400 mb-4">{this.state.error.message}</p>
          <button onClick={() => this.setState({ error: null })} className="px-4 py-2 bg-gray-800 text-white text-xs font-bold rounded-xl">다시 시도</button>
        </div>
      );
    }
    return this.props.children;
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
  const [receivedHeartTypes, setReceivedHeartTypes] = useState<Map<string, HeartType>>(new Map());
  const [likeStatuses, setLikeStatuses] = useState<Map<string, string>>(new Map());
  const [receivedLikers, setReceivedLikers] = useState<Profile[]>([]);
  const [contactSharedWithIds, setContactSharedWithIds] = useState<Set<string>>(new Set());
  const [acknowledgedComplimentIds, setAcknowledgedComplimentIds] = useState<Set<string>>(new Set());
  const [receivedContactShares, setReceivedContactShares] = useState<ContactShare[]>([]);
  const [newMsgCount, setNewMsgCount] = useState(0);
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
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatList, setChatList] = useState<Chat[]>([]);
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
  const [timerEndAt, setTimerEndAt] = useState<string | null>(null);
  const [timerLabel, setTimerLabel] = useState<string | null>(null);
  const [rejectionNotif, setRejectionNotif] = useState<string | null>(null); // nickname of person who rejected
  const [bottomNotif, setBottomNotif] = useState<{ type: 'heart' | 'chat' | 'message' | 'contact'; nickname: string; heartType?: HeartType } | null>(null);
  const [seatingLocked, setSeatingLocked] = useState(false);
  const [activeTables, setActiveTables] = useState<number[] | null>(null);
  const [tableLabels, setTableLabels] = useState<Record<string, string> | null>(null);
  const [resetPassword, setResetPassword] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(() => ls.getItem('dark_mode') === '1');

  const pendingSeatId = useRef<string | null>(
    new URLSearchParams(window.location.search).get('seat')
  );
  // Clean path format: /s/{table}-{position}
  const pendingSeatPath = useRef<{ table: number; position: number } | null>(
    (() => {
      const m = window.location.pathname.match(/^\/s\/(\d+)-(\d+)$/);
      return m ? { table: parseInt(m[1], 10), position: parseInt(m[2], 10) } : null;
    })()
  );
  const pendingTableNum = useRef<number | null>(
    (() => { const t = new URLSearchParams(window.location.search).get('table'); return t ? parseInt(t, 10) : null; })()
  );
  // Track user's current table number for notification targeting (ref for stable access in channel callbacks)
  const userTableNumRef = useRef<number | null>(null);
  // True if user scanned a seat QR without having a profile - block and show error
  const seatQrWithoutSession = useRef(
    Boolean(new URLSearchParams(window.location.search).get('seat') || /^\/s\/\d+-\d+/.test(window.location.pathname)) && !ls.getItem(MATCHING_USER_KEY)
  ).current;

  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const currentUserSeat = seats.find((s) => s.profile_id === currentUserId) ?? null;
  // Keep ref updated so notification channel can check user's table without stale closure
  userTableNumRef.current = currentUserSeat?.table_number ?? null;

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled) setAppLoading(false);
    }, 6000);
    supabase.from('app_settings').select('session_active, game_state, timer_end_at, timer_label, seating_locked, active_tables, reset_signal, table_labels, reset_password').eq('id', 1).single().then(({ data }) => {
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
      const gs = data?.game_state as GameState | null;
      if (gs?.active) { setCurrentGame(gs); setGameModalVisible(true); }
    });
    const settingsChannel = supabase
      .channel('app-settings-user')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'app_settings' }, (payload) => {
        const p = payload.new as { session_active: boolean; game_state: GameState | null; timer_end_at: string | null; timer_label: string | null; seating_locked: boolean | null; active_tables: number[] | null; reset_signal: string | null; table_labels: Record<string, string> | null; reset_password: string | null };
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

  const loadLikes = useCallback(async (userId: string) => {
    const { data } = await supabase.from('likes').select('liked_id, status, heart_type').eq('liker_id', userId);
    if (data) {
      setLikedIds(new Set(data.map((l) => l.liked_id)));
      setSentHeartTypes(new Map(data.map((l) => [l.liked_id, (l.heart_type ?? 'red') as HeartType])));
      setLikeStatuses(new Map(data.map((l) => [l.liked_id, l.status])));
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
    const { data: allMsgs } = await supabase.from('messages').select('chat_id, content, created_at')
      .in('chat_id', chatIds).order('created_at', { ascending: false });
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
        setMainTab('profiles');
        setShowWelcomeNotice(true);
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

    if (pendingSeatId.current) {
      const seatId = pendingSeatId.current;
      pendingSeatId.current = null;
      window.history.replaceState({}, '', window.location.pathname);
      supabase.from('seats').select('*').eq('id', seatId).maybeSingle().then(({ data, error }) => {
        if (error || !data) { alert('좌석 정보를 불러오지 못했습니다. 다시 QR을 스캔해 주세요.'); return; }
        if (seatingLocked) { alert('자리 배치가 잠겼습니다. 관리자 안내에 따라 자리를 배정받으세요.'); return; }
        if (data.status === 'occupied' && data.profile_id !== currentUserId) {
          alert('이미 사용 중인 자리입니다.');
        } else {
          setSeatDialog(data);
        }
      });
    } else if (pendingSeatPath.current) {
      const { table, position } = pendingSeatPath.current;
      pendingSeatPath.current = null;
      window.history.replaceState({}, '', window.location.pathname);
      supabase.from('seats').select('*').eq('table_number', table).eq('seat_position', position).maybeSingle().then(({ data, error }) => {
        if (error || !data) { alert('좌석 정보를 불러오지 못했습니다. 다시 QR을 스캔해 주세요.'); return; }
        if (seatingLocked) { alert('자리 배치가 잠겼습니다. 관리자 안내에 따라 자리를 배정받으세요.'); return; }
        if (data.status === 'occupied' && data.profile_id !== currentUserId) {
          alert('이미 사용 중인 자리입니다.');
        } else {
          setSeatDialog(data);
        }
      });
    } else if (pendingTableNum.current !== null) {
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
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'likes', filter: `liker_id=eq.${currentUserId}` },
        (payload) => {
          const updated = payload.new as { liked_id: string; status: string };
          if (updated.status === 'rejected') {
            const rejectedProfile = profiles.find(p => p.id === updated.liked_id);
            if (rejectedProfile) setRejectionNotif(rejectedProfile.nickname);
          } else if (updated.status === 'accepted') {
            loadContactShareData(currentUserId);
          }
        })
      .subscribe();

    const receivedLikesChannel = supabase
      .channel('realtime:received-likes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'likes', filter: `liked_id=eq.${currentUserId}` },
        async (payload) => {
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
          }
        })
      .subscribe();

    const contactSharesChannel = supabase
      .channel('realtime:contact-shares')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'contact_shares', filter: `liker_id=eq.${currentUserId}` },
        async (payload) => {
          const share = payload.new as ContactShare;
          setReceivedContactShares(prev => {
            if (prev.find(s => s.liked_id === share.liked_id)) return prev.map(s => s.liked_id === share.liked_id ? share : s);
            return [share, ...prev];
          });
          const { data } = await supabase.from('profiles').select('nickname').eq('id', share.liked_id).maybeSingle();
          setBottomNotif({ type: 'contact', nickname: data?.nickname ?? '' });
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'contact_shares', filter: `liker_id=eq.${currentUserId}` },
        (payload) => {
          const share = payload.new as ContactShare;
          setReceivedContactShares(prev => prev.map(s => s.liked_id === share.liked_id ? share : s));
        })
      .subscribe();

    const chatChannel = supabase
      .channel('realtime:chats-user')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chats' }, (payload) => {
        const c = payload.new as { user1_id: string; user2_id: string; id: string; created_at: string };
        if (c.user1_id !== currentUserId && c.user2_id !== currentUserId) return;
        // 페이로드로 바로 추가 — 전체 리패치 불필요
        const newChat: Chat = { id: c.id, user1_id: c.user1_id, user2_id: c.user2_id, created_at: c.created_at, lastMessage: '', messageCount: 0 };
        setChatList(prev => prev.some(x => x.id === c.id) ? prev : [newChat, ...prev]);
        const otherId = c.user1_id === currentUserId ? c.user2_id : c.user1_id;
        const otherProfile = profiles.find(p => p.id === otherId);
        if (otherProfile) setBottomNotif({ type: 'chat', nickname: otherProfile.nickname });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const m = payload.new as { chat_id: string; sender_id: string; content: string };
        if (m.sender_id === currentUserId) return;
        setChatList(prev => prev.map(c => c.id === m.chat_id ? { ...c, lastMessage: m.content } : c));
        setNewMsgCount(n => n + 1);
        setBottomNotif({ type: 'message', nickname: '' });
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
      supabase.from('profiles').select('id').eq('id', storedId).maybeSingle().then(({ data }) => {
        if (!data) {
          ls.removeItem(MATCHING_USER_KEY);
          ls.removeItem(MATCHING_DRAFT_KEY);
          setCurrentUserId(null);
          setShownWaiting(false);
          setView('entry-1');
        } else {
          // Refresh data on returning to app (백그라운드→포그라운드 복귀 시 전체 리프레시)
          loadProfiles();
          loadSeats();
          loadReceivedLikes(storedId);
          loadLikes(storedId);
          loadChatList(storedId);
          loadContactShareData(storedId);
          loadBalanceGames();
          loadMyVotes(storedId);
          loadSuggestions(storedId);
        }
      });
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [loadProfiles, loadReceivedLikes, loadLikes, loadChatList, loadSeats]);

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
    if (!currentUserId || likedIds.has(profileId)) return;
    const target = profiles.find((p) => p.id === profileId);
    if (!target) return;
    setLikeConfirmTarget(target);
  };

  const heartCountByType = (type: HeartType) => {
    let c = 0;
    sentHeartTypes.forEach(t => { if (t === type) c++; });
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
    if (heartCountByType(heartType) >= 2) return;
    const { error } = await supabase.from('likes').insert({ liker_id: currentUserId, liked_id: likeConfirmTarget.id, heart_type: heartType });
    if (!error) {
      setLikedIds((prev) => new Set([...prev, likeConfirmTarget.id]));
      setSentHeartTypes((prev) => new Map(prev).set(likeConfirmTarget.id, heartType));
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
    const user1Id = currentUserId < otherProfile.id ? currentUserId : otherProfile.id;
    const user2Id = currentUserId < otherProfile.id ? otherProfile.id : currentUserId;
    const { data: existingChat } = await supabase
      .from('chats').select('*').eq('user1_id', user1Id).eq('user2_id', user2Id).maybeSingle();
    if (existingChat) {
      setChatId(existingChat.id);
    } else {
      const { data: newChat } = await supabase
        .from('chats').insert({ user1_id: user1Id, user2_id: user2Id }).select().single();
      if (newChat) setChatId(newChat.id);
    }
    setSelectedProfile(otherProfile);
    setView('chat');
  };

  const loadMessages = useCallback(async (cid: string) => {
    const { data } = await supabase.from('messages').select('*').eq('chat_id', cid).order('created_at', { ascending: true });
    if (data) setMessages(data);
  }, []);

  useEffect(() => {
    if (!chatId) return;
    loadMessages(chatId);
    const channel = supabase
      .channel(`chat:${chatId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        (payload) => setMessages((prev) => [...prev, payload.new as Message]))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [chatId, loadMessages]);

  const sendMessage = async (content: string) => {
    if (!chatId || !currentUserId || !content.trim()) return;
    await supabase.from('messages').insert({ chat_id: chatId, sender_id: currentUserId, content: content.trim() });
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
    // 일반 유저는 자리 변경 불가 (관리자만 배치 가능)
    if (currentUserSeat && currentUserSeat.id !== seat.id) {
      alert('자리 변경은 관리자만 가능합니다. 관리자에게 요청해 주세요.');
      setSeatDialog(null);
      return;
    }
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

  // 신규 접속자(localStorage에 userId 없음) → WaitingOverlay 표시
  // 기존 접속자(userId 있음) → 즉시 메인 화면 진입 (showWaiting = false)
  // shownWaiting: 대기 화면에서 '입장하기' 클릭 or 관리자 시작 감지 시 true
  const showWaiting = !currentUserId && !shownWaiting;
  if (seatQrWithoutSession) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">🪑</span>
        </div>
        <h2 className="text-xl font-bold text-white mb-2">입장 QR을 먼저 스캔해주세요</h2>
        <p className="text-sm text-slate-400 leading-relaxed">자리 QR은 입장 등록 후 사용할 수 있습니다.<br />테이블에 붙어있는 입장 QR을 먼저 스캔해 주세요.</p>
      </div>
    );
  }

  if (showWaiting) return <WaitingOverlay
    sessionActive={sessionActive}
    onEnter={() => setShownWaiting(true)}
  />;
  if (appLoading || sessionActive === null) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 rounded-full border-4 border-teal-500/30 border-t-teal-500 animate-spin" />
      <p className="text-sm text-slate-400">연결 중...</p>
    </div>
  );

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
        onLike={() => { if (!seatingLocked) handleLike(selectedProfile.id); }}
        onChat={() => { if (!seatingLocked) openChat(selectedProfile); }}
        onBack={() => setView('main')}
        onReset={reset}
      />
      {likeConfirmTarget && (
        <LikeConfirmDialog
          target={likeConfirmTarget}
          likedByType={likedByTypeRecord()}
          onConfirm={executeLike}
          onCancel={() => setLikeConfirmTarget(null)}
        />
      )}
    </>
  );
  if (view === 'chat' && selectedProfile && chatId) return (
    <>
      {currentGame?.active && gameModalVisible && <GameAnnouncementModal game={currentGame} onDismiss={() => setGameModalVisible(false)} onVote={voteOnGame} onImageVote={voteOnImageGame} currentUserId={currentUserId} seats={seats} profiles={profiles} />}
      {currentGame?.active && !gameModalVisible && <GameActiveBanner game={currentGame} onClick={() => setGameModalVisible(true)} />}
      <ChatScreen
        messages={messages}
        currentUserId={currentUserId!}
        otherProfile={selectedProfile}
        onSend={sendMessage}
        onSendImage={sendImage}
        onBack={() => setView('main')}
        onReset={reset}
      />
    </>
  );

  const sentLikedProfiles = profiles.filter((p) => likedIds.has(p.id));
  const pendingHeartsCount = receivedLikers.filter((l) => {
    const ht = receivedHeartTypes.get(l.id) ?? 'red';
    if (ht === 'green') return !acknowledgedComplimentIds.has(l.id);
    return !contactSharedWithIds.has(l.id);
  }).length;

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
          onClose={() => setShowTutorialModal(false)}
          darkMode={darkMode}
        />
      )}

      {/* Browser optimization guide — shown once on first visit */}
      {showGuide && (
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
        resetPassword={resetPassword}
      />
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

// ─── Step screens ─────────────────────────────────────────────────────────────

const MBTI_TYPES = [
  'INTJ','INTP','ENTJ','ENTP',
  'INFJ','INFP','ENFJ','ENFP',
  'ISTJ','ISFJ','ESTJ','ESFJ',
  'ISTP','ISFP','ESTP','ESFP',
];

const DECADE_GROUPS: Record<string, number[]> = {
  '80년대생': Array.from({ length: 5 }, (_, i) => 1989 - i),   // 1985~1989
  '90년대생': Array.from({ length: 10 }, (_, i) => 1999 - i),  // 1990~1999
  '00년대생': Array.from({ length: 8 }, (_, i) => 2007 - i),   // 2000~2007
};

const LOCATION_GROUPS: Record<string, string[]> = {
  '광역시': ['부산', '서울', '인천', '대구', '울산', '대전', '광주', '세종'],
  '경기': ['수원', '성남', '용인', '고양', '부천', '안산', '화성', '남양주', '평택', '안양', '의정부', '파주'],
  '경남': ['창원', '김해', '양산', '거제', '진주', '통영', '밀양', '사천', '고성', '남해', '하동', '산청', '함양', '거창', '합천'],
  '경북': ['포항', '구미', '경주', '안동', '김천', '영주', '문경', '상주', '칠곡'],
  '전북': ['전주', '익산', '군산', '정읍', '남원', '김제', '완주'],
  '전남': ['순천', '여수', '광양', '목포', '나주', '담양', '고흥'],
  '충남': ['천안', '아산', '공주', '논산', '서산', '당진', '계룡'],
  '충북': ['청주', '충주', '제천', '음성', '진천'],
  '강원': ['춘천', '원주', '강릉', '속초', '동해', '삼척', '횡성'],
  '기타': ['제주', '해외'],
};

// ─── Drum Roller ─────────────────────────────────────────────────────────────

function DrumRoller<T extends string | number>({
  items, selected, onSelect, renderItem, itemHeight = 36, visibleCount = 3,
}: {
  items: T[];
  selected: T | null;
  onSelect: (v: T) => void;
  renderItem?: (v: T) => string;
  itemHeight?: number;
  visibleCount?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startOffset = useRef(0);
  const [offset, setOffset] = useState(() => {
    const idx = selected !== null ? items.indexOf(selected) : 0;
    return idx >= 0 ? idx * itemHeight : 0;
  });

  const clamp = (v: number) => Math.max(0, Math.min(v, (items.length - 1) * itemHeight));

  const snapToNearest = (raw: number) => {
    const clamped = clamp(Math.round(raw / itemHeight) * itemHeight);
    setOffset(clamped);
    onSelect(items[Math.round(clamped / itemHeight)]);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    isDragging.current = true;
    startY.current = e.clientY;
    startOffset.current = offset;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    e.stopPropagation();
    setOffset(clamp(startOffset.current + (startY.current - e.clientY)));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    e.stopPropagation();
    isDragging.current = false;
    snapToNearest(offset);
  };
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    snapToNearest(clamp(offset + Math.sign(e.deltaY) * itemHeight));
  };

  const visH = visibleCount * itemHeight;
  const centerTop = Math.floor(visibleCount / 2) * itemHeight;

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden select-none cursor-grab active:cursor-grabbing"
      style={{ height: visH, touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      <div className="absolute inset-x-0 top-0 z-10 pointer-events-none" style={{ height: centerTop, background: 'linear-gradient(to bottom, white 0%, rgba(255,255,255,0) 100%)' }} />
      <div className="absolute inset-x-0 z-10 pointer-events-none border-y-2 border-cyan-400/40 bg-cyan-50/60" style={{ top: centerTop, height: itemHeight }} />
      <div className="absolute inset-x-0 bottom-0 z-10 pointer-events-none" style={{ height: centerTop, background: 'linear-gradient(to top, white 0%, rgba(255,255,255,0) 100%)' }} />
      <div className="absolute inset-x-0" style={{ top: centerTop - offset }}>
        {items.map((item, i) => {
          const dist = Math.abs(i - offset / itemHeight);
          return (
            <div
              key={String(item)}
              onClick={() => { setOffset(i * itemHeight); onSelect(item); }}
              className={`flex items-center justify-center font-bold transition-all duration-100 ${dist < 0.6 ? 'text-cyan-700 text-sm' : dist < 1.5 ? 'text-gray-400 text-xs' : 'text-gray-200 text-xs'}`}
              style={{ height: itemHeight }}
            >
              {renderItem ? renderItem(item) : String(item)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tutorial Modal ────────────────────────────────────────────────────────

const TUTORIAL_SLIDES = [
  {
    emoji: '🥂',
    title: '범일NPC 술번개에 오신 걸 환영해요!',
    desc: '이 앱을 통해 오늘 함께하는 분들과 하트를 보내고, 채팅하고, 연락처를 교환할 수 있어요.',
    color: 'from-cyan-500 to-teal-500',
  },
  {
    emoji: '❤️',
    title: '하트 보내기',
    desc: '참여자 탭에서 마음에 드는 분에게 하트를 보내세요.\n\n❤️ 맘에 드는 사람\n💙 친구하고 싶어요\n🧡 뜨밤\n💚 칭찬 하트\n\n각각 2개씩 총 8개의 하트가 있어요. ❤️💙🧡은 상대방이 수락하면 연락처가 교환됩니다!',
    color: 'from-pink-500 to-rose-500',
  },
  {
    emoji: '💬',
    title: '채팅',
    desc: '하트를 수락하면 채팅방이 열려요.\n\n채팅 탭에서 대화를 시작하고, 연락처를 공유할 수 있어요. 채팅 상대에게만 내 연락처가 공개됩니다.',
    color: 'from-blue-500 to-indigo-500',
  },
  {
    emoji: '🗺️',
    title: '배치도',
    desc: '배치도 탭에서 지금 어느 자리에 누가 앉아 있는지 확인할 수 있어요.\n\n자리를 이동하면 운영진이 직접 배치해 드립니다.',
    color: 'from-emerald-500 to-teal-500',
  },
  {
    emoji: '🎮',
    title: '게임',
    desc: '게임 탭에서 밸런스 게임, QA 게임, 이미지 투표 등 다양한 미니 게임을 즐길 수 있어요.\n\n운영진이 게임을 시작하면 알림이 와요!\n\n※ 현재 일부 게임은 미완성 상태입니다. 순차적으로 업데이트될 예정이에요.',
    color: 'from-violet-500 to-purple-500',
  },
  {
    emoji: '🍺',
    title: '음료 요청 & 건의함',
    desc: '채팅·건의 탭의 건의함에서 음료를 요청하거나 운영진에게 의견을 전달할 수 있어요.\n\n맥주, 소주, 음료수 버튼을 누르면 바로 전달됩니다!',
    color: 'from-amber-500 to-orange-500',
  },
  {
    emoji: '⚠️',
    title: '주의사항 (필독!)',
    desc: '① 술 강요가 없는 자유로운 분위기입니다\n② 정치, 종교, 지역감정, 패드립은 허용되지 않습니다\n③ 욕설, 반말 등은 영구밴이 될 수 있습니다\n④ 화장실, 담배는 함께 이동해 주세요\n⑤ 급하신 분은 먼저 허락을 받고 이동 부탁드립니다\n⑥ 모든 저작권은 범일NPC에게 있습니다. 불법 복제 및 도용은 민형사상 책임을 질 수 있습니다\n\n오늘 즐거운 시간 보내세요! 🎉',
    color: 'from-red-500 to-rose-600',
  },
];

function TutorialModal({ page, onChangePage, onClose, darkMode }: {
  page: number;
  onChangePage: (p: number) => void;
  onClose: () => void;
  darkMode?: boolean;
}) {
  const slide = TUTORIAL_SLIDES[page];
  const isLast = page === TUTORIAL_SLIDES.length - 1;

  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center sm:items-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}>
      <div
        className={`relative w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden transition-all ${darkMode ? 'bg-slate-900' : 'bg-white'}`}
        onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/20 text-white hover:bg-black/40 transition-all">
          <X className="w-4 h-4" />
        </button>
        {/* Slide header */}
        <div className={`bg-gradient-to-br ${slide.color} px-6 py-8 text-center`}>
          <div className="text-5xl mb-3">{slide.emoji}</div>
          <h2 className="text-lg font-black text-white leading-snug">{slide.title}</h2>
        </div>
        {/* Dots */}
        <div className="flex justify-center gap-1.5 pt-4 px-6">
          {TUTORIAL_SLIDES.map((_, i) => (
            <button key={i} onClick={() => onChangePage(i)}
              className={`rounded-full transition-all ${i === page ? 'w-5 h-2 bg-cyan-500' : `w-2 h-2 ${darkMode ? 'bg-slate-600' : 'bg-gray-200'}`}`} />
          ))}
        </div>
        {/* Body */}
        <div className={`px-6 py-4 text-sm leading-loose whitespace-pre-line ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>
          {slide.desc}
        </div>
        {/* Buttons */}
        <div className="px-6 pb-6 flex gap-2">
          {page > 0 && (
            <button onClick={() => onChangePage(page - 1)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${darkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              이전
            </button>
          )}
          <button onClick={isLast ? onClose : () => onChangePage(page + 1)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all bg-gradient-to-r ${slide.color} hover:opacity-90 active:scale-95`}>
            {isLast ? '시작하기 🎉' : '다음'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResetButton({ onReset, darkMode, resetPassword }: { onReset: () => void; variant?: string; darkMode?: boolean; resetPassword?: string | null }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [err, setErr] = useState(false);

  const confirm = () => {
    const correctPw = resetPassword ?? '116606';
    if (pw === correctPw) { setOpen(false); setPw(''); setErr(false); onReset(); }
    else { setErr(true); setPw(''); }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <button type="button"
          onClick={() => {
            const base = import.meta.env.BASE_URL;
            window.history.pushState({}, '', base + 'admin');
            window.dispatchEvent(new PopStateEvent('popstate'));
          }}
          title="관리자"
          className={`p-1 rounded-xl transition-all active:scale-95 hover:scale-110 ${darkMode ? 'text-cyan-400 hover:text-cyan-300' : 'text-cyan-500 hover:text-cyan-600'}`}>
          <Users className="w-7 h-7" />
        </button>
        <button type="button" onClick={() => setOpen(true)}
          className="text-left group cursor-pointer select-none"
          title="처음으로 돌아가기">
          <p className={`text-[10px] font-black tracking-widest uppercase leading-none transition-colors ${darkMode ? 'text-cyan-400 group-hover:text-cyan-300' : 'text-cyan-500 group-hover:text-cyan-600'}`}>범일NPC</p>
          <h1 className={`text-lg font-black leading-tight transition-colors ${darkMode ? 'text-white group-hover:text-cyan-200' : 'text-gray-900 group-hover:text-cyan-600'}`}>술번개 🍻</h1>
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setOpen(false); setPw(''); setErr(false); }}>
          <div className="bg-white rounded-2xl p-6 w-72 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-bold text-gray-800 mb-1">처음으로 돌아가기</p>
            <p className="text-xs text-gray-500 mb-4">비밀번호를 입력하세요</p>
            <input
              type="password"
              value={pw}
              onChange={(e) => { setPw(e.target.value); setErr(false); }}
              onKeyDown={(e) => e.key === 'Enter' && confirm()}
              placeholder="비밀번호"
              autoFocus
              className={`w-full px-3 py-2.5 rounded-xl border-2 text-sm text-center font-bold outline-none mb-3 ${err ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-200 focus:border-cyan-400'}`}
            />
            {err && <p className="text-xs text-red-500 text-center mb-3">비밀번호가 틀렸습니다</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => { setOpen(false); setPw(''); setErr(false); }}
                className="flex-1 py-2 rounded-xl border-2 border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-all">취소</button>
              <button type="button" onClick={confirm}
                className="flex-1 py-2 rounded-xl bg-cyan-500 text-white text-sm font-semibold hover:bg-cyan-600 transition-all">확인</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Profile QR Modal ─────────────────────────────────────────────────────────

function ProfileQrModal({ profileId, pinCode: pinCodeProp, onClose, onPinGenerated }: {
  profileId: string; pinCode: string | null; onClose: () => void; onPinGenerated?: (pin: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const largeCanvasRef = useRef<HTMLCanvasElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [pinCode, setPinCode] = useState<string | null>(pinCodeProp);

  // Auto-generate pin_code for existing users who don't have one yet
  useEffect(() => {
    if (pinCodeProp !== null) { setPinCode(pinCodeProp); return; }
    const generate = async () => {
      const { data: existingPins } = await supabase.from('profiles').select('pin_code');
      const usedPins = new Set((existingPins ?? []).map((p: { pin_code: string | null }) => p.pin_code).filter(Boolean));
      let pin = String(Math.floor(1000 + Math.random() * 9000));
      while (usedPins.has(pin)) pin = String(Math.floor(1000 + Math.random() * 9000));
      await supabase.from('profiles').update({ pin_code: pin }).eq('id', profileId);
      setPinCode(pin);
      onPinGenerated?.(pin);
    };
    generate();
  }, [profileId, pinCodeProp]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, `PROFID:${profileId}`, {
      width: 200,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    });
  }, [profileId]);

  useEffect(() => {
    if (!expanded || !largeCanvasRef.current) return;
    QRCode.toCanvas(largeCanvasRef.current, `PROFID:${profileId}`, {
      width: Math.min(window.innerWidth - 80, 280),
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    });
  }, [expanded, profileId]);

  return (
    <>
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xs p-6 text-center" onClick={e => e.stopPropagation()}>
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center mx-auto mb-4 shadow-lg">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </div>
          <h3 className="text-lg font-black text-gray-900 mb-1">내 프로필 QR</h3>
          <p className="text-xs text-gray-500 mb-3 leading-relaxed">관리자에게 이 QR을 보여주세요.<br />자리 배정 시 즉시 인식됩니다.</p>
          {pinCode && (
            <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3 mb-3 flex items-center justify-center gap-3">
              <span className="text-xs font-bold text-slate-500">나의 고유번호</span>
              <span className="text-3xl font-black tracking-[0.3em] text-slate-900">{pinCode}</span>
            </div>
          )}
          <button className="w-full relative flex justify-center mb-2 p-3 bg-gray-50 rounded-2xl border-2 border-dashed border-cyan-300 hover:border-cyan-500 active:scale-95 transition-all group" onClick={() => setExpanded(true)}>
            <canvas ref={canvasRef} className="rounded-lg" />
            <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/0 group-hover:bg-black/10 transition-all">
              <div className="opacity-0 group-hover:opacity-100 bg-white rounded-full px-2 py-1 shadow text-[10px] font-bold text-gray-700 flex items-center gap-1 transition-all">
                <Maximize2 className="w-3 h-3" /> 확대
              </div>
            </div>
          </button>
          <p className="text-[10px] text-gray-400 mb-3">QR 탭하면 확대됩니다</p>
          <button onClick={onClose}
            className="w-full py-3 bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold rounded-xl hover:from-cyan-600 hover:to-teal-600 transition-all">
            확인
          </button>
        </div>
      </div>
      {/* 확대 QR */}
      {expanded && (
        <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm" onClick={() => setExpanded(false)}>
          <p className="text-white text-sm font-bold mb-4 opacity-70">탭하면 닫힙니다</p>
          <div className="bg-white rounded-3xl p-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <canvas ref={largeCanvasRef} className="rounded-xl block" />
          </div>
          {pinCode && (
            <div className="mt-4 bg-white/10 border border-white/20 rounded-2xl px-6 py-3 flex items-center gap-3">
              <span className="text-white/60 text-sm font-bold">고유번호</span>
              <span className="text-white text-3xl font-black tracking-[0.4em]">{pinCode}</span>
            </div>
          )}
          <button onClick={() => setExpanded(false)} className="mt-4 px-6 py-2.5 bg-white/20 rounded-full text-white font-bold text-sm">닫기</button>
        </div>
      )}
    </>
  );
}

// ─── Nickname Setup (consolidated single screen) ─────────────────────────────
// 사용자가 [출생년도, 사는 곳, MBTI, 관심사, 성향] 5가지를 입력하면
// 시스템이 출생년도 + 사는 곳 + 관심사(성향·MBTI 제외)를 조합하여
// 재치 있고 캐릭터가 느껴지는 랜덤 닉네임 5개를 즉석에서 생성한다.
// 사용자가 하나를 선택하면 localStorage에 고정되며, 이후 변경 불가.

function NicknameSetupScreen({ onSubmit, loading, onReset }: {
  onSubmit: (data: {
    birthYear: number; location: string; mbti: string; interests: string[];
    personalityScore: number; domSubScore: number | null; nickname: string;
    kakaoId: string; instagramId: string; phoneNumber: string; contactPrivate: boolean;
  }) => void;
  loading: boolean; onReset: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  // contact fields
  const [kakaoId, setKakaoId] = useState('');
  const [instagramId, setInstagramId] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [contactPrivate, setContactPrivate] = useState(false);
  const [mbti, setMbti] = useState<string | null>(null);
  const [birthYear, setBirthYear] = useState<string>(String(DECADE_GROUPS['90년대생'][0]));
  const [location, setLocation] = useState<string>(LOCATION_GROUPS['광역시'][0]);
  const [selectedBio, setSelectedBio] = useState<string[]>([]);
  const [positionScore, setPositionScore] = useState<number | null>(null);
  const [domSubEnabled, setDomSubEnabled] = useState(false);
  const [domSubScore, setDomSubScore] = useState(50);

  const [decadeFilter, setDecadeFilter] = useState<string>('90년대생');
  const [regionFilter, setRegionFilter] = useState<string>('광역시');
  const [candidates, setCandidates] = useState<{ nickname: string; concept: string }[]>([]);
  const [selectedNickname, setSelectedNickname] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  // 닉네임 모드: 'random' | 'custom'
  const [nicknameMode, setNicknameMode] = useState<'random' | 'custom'>('random');
  const [customInput, setCustomInput] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  const [checkingDup, setCheckingDup] = useState(false);
  const [dupChecked, setDupChecked] = useState(false);
  const dupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleBio = (tag: string) => {
    if (selectedBio.includes(tag)) {
      setSelectedBio(selectedBio.filter((t) => t !== tag));
    } else if (selectedBio.length < 5) {
      setSelectedBio([...selectedBio, tag]);
    }
  };

  const atMaxBio = selectedBio.length >= 5;

  // Step 1 valid: mbti + birthYear + location
  const step1Valid = !!mbti && !!birthYear && !!location;
  // Step 2 valid: interests >= 2 + position
  const step2Valid = selectedBio.length >= 2 && positionScore !== null;
  const canGenerate = !!mbti && !!birthYear && !!location && selectedBio.length >= 2 && positionScore !== null;
  const customFinalNick = customInput.trim();
  const customValid = nicknameMode === 'custom'
    ? customFinalNick.length >= 2 && customFinalNick.length <= 6 && !customError && dupChecked
    : false;
  const canEnter = canGenerate && (nicknameMode === 'random' ? !!selectedNickname : customValid) && !loading;

  // 직접 입력 실시간 검증
  const validateCustom = useCallback(async (val: string) => {
    const trimmed = val.trim();
    if (trimmed.length === 0) { setCustomError(null); setDupChecked(false); return; }
    if (trimmed.length > 6) { setCustomError('최대 6글자까지 입력할 수 있어요'); setDupChecked(false); return; }
    if (containsBannedNicknameWord(trimmed)) { setCustomError('사용할 수 없는 단어가 포함되어 있어요'); setDupChecked(false); return; }
    if (trimmed.length < 2) { setCustomError('최소 2글자 이상 입력하세요'); setDupChecked(false); return; }
    setCustomError(null);
    setCheckingDup(true);
    setDupChecked(false);
    try {
      const { data } = await supabase.from('profiles').select('id').eq('nickname', trimmed).limit(1);
      if (data && data.length > 0) {
        setCustomError('이미 사용 중인 닉네임이에요');
        setDupChecked(false);
      } else {
        setCustomError(null);
        setDupChecked(true);
      }
    } catch { setCustomError(null); setDupChecked(true); }
    setCheckingDup(false);
  }, []);

  const handleCustomChange = (val: string) => {
    const sliced = [...val].slice(0, 6).join('');
    setCustomInput(sliced);
    setDupChecked(false);
    setCustomError(null);
    if (dupTimerRef.current) clearTimeout(dupTimerRef.current);
    dupTimerRef.current = setTimeout(() => validateCustom(sliced), 500);
  };

  const handleGenerate = () => {
    if (!canGenerate) return;
    setGenerating(true);
    setSelectedNickname(null);
    const year = parseInt(birthYear, 10);
    const next = generateNicknameCandidates(year, location, selectedBio);
    setTimeout(() => {
      setCandidates(next);
      setGenerating(false);
    }, 600);
  };

  const contactValid = contactPrivate || !!(kakaoId.trim() || instagramId.trim() || phoneNumber.trim());

  const handleSubmit = () => {
    if (!canEnter || !mbti || positionScore === null) return;
    if (!contactValid) return;
    const finalNick = nicknameMode === 'random' ? selectedNickname! : customFinalNick;
    if (!finalNick) return;
    onSubmit({
      birthYear: parseInt(birthYear, 10),
      location: location.trim(),
      mbti,
      interests: selectedBio,
      personalityScore: positionScore,
      domSubScore: domSubEnabled ? domSubScore : null,
      nickname: finalNick,
      kakaoId: kakaoId.trim(),
      instagramId: instagramId.trim(),
      phoneNumber: phoneNumber.trim(),
      contactPrivate,
    });
  };

  const stepLabels = ['기본 정보', '관심사·성향', '닉네임'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md max-h-[92vh] overflow-y-auto">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-cyan-500 to-teal-500 px-6 py-5">
            <p className="text-white/80 text-xs font-semibold mb-0.5">QR 접속 완료</p>
            <h2 className="text-white font-black text-xl">닉네임 설정</h2>
            <p className="text-white/90 text-xs mt-1">3단계로 나의 프로필을 완성해요</p>
          </div>
          <div className="px-5 pt-4">
          </div>

          {/* Step indicator */}
          <div className="px-6 pt-4 pb-2 flex items-center gap-2">
            {stepLabels.map((label, i) => {
              const idx = i + 1;
              const done = idx < step;
              const active = idx === step;
              return (
                <div key={label} className="flex items-center flex-1 last:flex-none">
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                      done ? 'bg-teal-500 text-white' : active ? 'bg-cyan-500 text-white ring-4 ring-cyan-100' : 'bg-gray-100 text-gray-400'
                    }`}>
                      {done ? <CheckCircle className="w-4 h-4" /> : idx}
                    </div>
                    <span className={`text-xs font-bold ${active ? 'text-gray-800' : done ? 'text-teal-500' : 'text-gray-400'}`}>{label}</span>
                  </div>
                  {idx < 3 && <div className={`flex-1 h-0.5 mx-2 rounded-full ${done ? 'bg-teal-400' : 'bg-gray-200'}`} />}
                </div>
              );
            })}
          </div>

          <div className="p-5 space-y-5">
            {/* ─── Step 1: 기본 정보 (MBTI + 년생 + 사는곳) ─── */}
            {step === 1 && (
              <>
                {/* MBTI */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <label className="text-sm font-semibold text-gray-800">MBTI</label>
                    <span className="text-xs font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">필수</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {MBTI_TYPES.map((type) => (
                      <button key={type} type="button" onClick={() => setMbti(type)}
                        className={`py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${
                          mbti === type ? 'bg-teal-500 border-teal-500 text-white shadow-md' : 'bg-white border-gray-200 text-gray-600 hover:border-teal-300 hover:bg-teal-50'
                        }`}>{type}</button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <label className="text-sm font-semibold text-gray-800">출생년도</label>
                      <span className="text-xs font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">필수</span>
                    </div>
                    <div className="flex gap-1 mb-1.5">
                      {Object.keys(DECADE_GROUPS).map((d) => (
                        <button key={d} type="button"
                          onClick={() => { setDecadeFilter(d); setBirthYear(String(DECADE_GROUPS[d][0])); }}
                          className={`flex-1 py-1 rounded-lg text-[11px] font-bold border transition-all ${decadeFilter === d ? 'bg-cyan-500 border-cyan-500 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-cyan-300'}`}>
                          {d}
                        </button>
                      ))}
                    </div>
                    <div className="border-2 border-gray-200 rounded-xl overflow-hidden bg-white">
                      <DrumRoller
                        key={decadeFilter}
                        items={DECADE_GROUPS[decadeFilter]}
                        selected={birthYear ? Number(birthYear) : null}
                        onSelect={(v) => setBirthYear(String(v))}
                        renderItem={(v) => `${String(v).slice(2)}년생`}
                        itemHeight={36}
                        visibleCount={3}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <label className="text-sm font-semibold text-gray-800">사는 곳</label>
                      <span className="text-xs font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">필수</span>
                    </div>
                    <div className="flex gap-1 mb-1.5 overflow-x-auto pb-0.5 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
                      {Object.keys(LOCATION_GROUPS).map((r) => (
                        <button key={r} type="button"
                          onClick={() => { setRegionFilter(r); setLocation(r === '광역시' || r === '기타' ? LOCATION_GROUPS[r][0] : `${r} ${LOCATION_GROUPS[r][0]}`); }}
                          className={`flex-shrink-0 px-2 py-1 rounded-lg text-[11px] font-bold border transition-all ${regionFilter === r ? 'bg-teal-500 border-teal-500 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-teal-300'}`}>
                          {r}
                        </button>
                      ))}
                    </div>
                    <div className="border-2 border-gray-200 rounded-xl overflow-hidden bg-white">
                      <DrumRoller
                        key={regionFilter}
                        items={LOCATION_GROUPS[regionFilter]}
                        selected={(() => {
                          const prefix = regionFilter === '광역시' || regionFilter === '기타' ? '' : `${regionFilter} `;
                          const stripped = location.startsWith(prefix) ? location.slice(prefix.length) : null;
                          return LOCATION_GROUPS[regionFilter].includes(stripped ?? '') ? stripped : null;
                        })()}
                        onSelect={(v) => setLocation(regionFilter === '광역시' || regionFilter === '기타' ? v : `${regionFilter} ${v}`)}
                        itemHeight={36}
                        visibleCount={3}
                      />
                    </div>
                  </div>
                </div>

                {/* Step 1 summary chips */}
                {(mbti || birthYear || location) && (
                  <div className="flex gap-2 flex-wrap">
                    {mbti && (
                      <span className="px-3 py-1.5 bg-teal-50 text-teal-700 text-sm font-bold rounded-full border border-teal-100">{mbti}</span>
                    )}
                    {birthYear && (
                      <span className="px-3 py-1.5 bg-cyan-50 text-cyan-700 text-sm font-bold rounded-full border border-cyan-100">
                        {String(birthYear).slice(2)}년생
                      </span>
                    )}
                    {location && (
                      <span className="px-3 py-1.5 bg-teal-50 text-teal-700 text-sm font-bold rounded-full border border-teal-100">
                        {location}
                      </span>
                    )}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={onReset}
                    className="flex items-center justify-center gap-1.5 px-5 py-3 bg-gray-100 text-gray-500 font-bold rounded-xl hover:bg-gray-200 transition-all">
                    <ArrowLeft className="w-4 h-4" /> 이전
                  </button>
                  <button type="button" onClick={() => setStep(2)} disabled={!step1Valid}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold rounded-xl hover:from-cyan-600 hover:to-teal-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                    다음 <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </>
            )}

            {/* ─── Step 2: 관심사·성향 (관심사 + 포지션 + 돔/섭) ─── */}
            {step === 2 && (
              <>
                {/* 관심사 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-semibold text-gray-800">관심사</label>
                      <span className="text-xs font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">필수</span>
                    </div>
                    <div className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full transition-all ${
                      atMaxBio ? 'bg-rose-500 text-white' : selectedBio.length >= 2 ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-500'
                    }`}>{selectedBio.length} / 5</div>
                  </div>
                  <p className="text-xs text-gray-400 mb-2">2개 이상 선택 — 닉네임 생성에 사용됩니다</p>
                  {selectedBio.length > 0 && (
                    <div className="flex gap-2 p-2.5 bg-cyan-50 rounded-xl border border-cyan-100 flex-wrap mb-2">
                      {selectedBio.map((tag) => (
                        <button key={tag} type="button" onClick={() => toggleBio(tag)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-cyan-500 text-white text-xs font-semibold rounded-lg hover:bg-cyan-600 transition-all">
                          {tag} <span className="opacity-70">×</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                    {BIO_CATEGORIES.map((cat) => (
                      <div key={cat.label}>
                        <p className={`text-xs font-bold uppercase tracking-wider mb-1.5 ${cat.color.label}`}>{cat.label}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {cat.tags.map((tag) => {
                            const selected = selectedBio.includes(tag);
                            const isHot = tag === '뜨밤';
                            const disabled = !selected && atMaxBio;
                            return (
                              <button key={tag} type="button" onClick={() => toggleBio(tag)}
                                disabled={disabled}
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                                  selected ? cat.color.selected : disabled ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed' : cat.color.normal
                                }`}>
                                {isHot && <span className="mr-1">🔥</span>}
                                {tag}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 성향 (포지션) */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <label className="text-sm font-semibold text-gray-800">성향 (포지션)</label>
                    <span className="text-xs font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">필수</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {POSITION_OPTIONS.map(({ label, val }) => {
                      const selected = positionScore === val;
                      const bg = getPositionBg(val);
                      return (
                        <button key={val} type="button" onClick={() => setPositionScore(val)}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 transition-all text-left ${
                            selected ? 'border-transparent shadow-md' : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                          style={selected ? { background: bg, borderColor: bg } : {}}>
                          <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border-2 transition-all ${
                            selected ? 'bg-white border-white' : 'border-gray-300'
                          }`}>
                            {selected && (
                              <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: bg }} />
                              </svg>
                            )}
                          </div>
                          <span className={`font-semibold text-xs ${selected ? 'text-white' : 'text-gray-700'}`}>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 성향 (돔/섭) — 선택 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-semibold text-gray-800">성향 (돔/섭)</label>
                    <div onClick={() => setDomSubEnabled(!domSubEnabled)}
                      className={`relative w-11 h-6 rounded-full transition-all cursor-pointer ${domSubEnabled ? 'bg-cyan-500' : 'bg-gray-200'}`}>
                      <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${domSubEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </div>
                  </div>
                  {!domSubEnabled ? (
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-200">
                      <div className="w-3 h-3 rounded-full bg-gray-400" />
                      <span className="text-gray-500 text-sm font-medium">일반/보통</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-1.5">
                      {DOM_SUB_OPTIONS.map(({ label, val }) => {
                        const selected = domSubScore === val;
                        const bg = getDomSubBg(val);
                        return (
                          <button key={val} type="button" onClick={() => setDomSubScore(val)}
                            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 transition-all text-left ${
                              selected ? 'border-transparent shadow-md' : 'border-gray-200 bg-white hover:border-gray-300'
                            }`}
                            style={selected ? { background: bg, borderColor: bg } : {}}>
                            <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border-2 ${selected ? 'bg-white border-white' : 'border-gray-300'}`}>
                              {selected && (
                                <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none">
                                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: bg }} />
                                </svg>
                              )}
                            </div>
                            <span className={`font-semibold text-sm ${selected ? 'text-white' : 'text-gray-700'}`}>{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setStep(1)}
                    className="flex items-center justify-center gap-1.5 px-5 py-3 bg-gray-100 text-gray-500 font-bold rounded-xl hover:bg-gray-200 transition-all">
                    <ArrowLeft className="w-4 h-4" /> 이전
                  </button>
                  <button type="button" onClick={() => setStep(3)} disabled={!step2Valid}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold rounded-xl hover:from-cyan-600 hover:to-teal-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                    다음 <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </>
            )}

            {/* ─── Step 3: 닉네임 생성 ─── */}
            {step === 3 && (
              <>
                {/* 입력 요약 */}
                <div className="flex gap-2 flex-wrap p-3 bg-gray-50 rounded-xl border border-gray-200">
                  {mbti && <span className="px-2.5 py-1 bg-teal-100 text-teal-700 text-xs font-bold rounded-full">{mbti}</span>}
                  {birthYear && <span className="px-2.5 py-1 bg-cyan-100 text-cyan-700 text-xs font-bold rounded-full">{String(birthYear).slice(2)}년생</span>}
                  {location && <span className="px-2.5 py-1 bg-teal-100 text-teal-700 text-xs font-bold rounded-full">{location}</span>}
                  {selectedBio.map((t) => <span key={t} className="px-2.5 py-1 bg-cyan-100 text-cyan-700 text-xs font-bold rounded-full">{t}</span>)}
                </div>

                {/* 모드 선택 탭 */}
                <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
                  <button type="button" onClick={() => { setNicknameMode('random'); setSelectedNickname(null); }}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${nicknameMode === 'random' ? 'bg-white text-cyan-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    ✨ 랜덤 생성
                  </button>
                  <button type="button" onClick={() => { setNicknameMode('custom'); setSelectedNickname(null); }}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${nicknameMode === 'custom' ? 'bg-white text-cyan-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    ✏️ 직접 입력
                  </button>
                </div>

                {/* 랜덤 생성 모드 */}
                {nicknameMode === 'random' && (
                  <div className="pt-1 space-y-3">
                    <button type="button" onClick={handleGenerate} disabled={!canGenerate || generating}
                      className="w-full py-3 px-4 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-bold rounded-xl hover:from-violet-600 hover:to-fuchsia-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
                      {generating ? (
                        <><RefreshCw className="w-4 h-4 animate-spin" />생성 중...</>
                      ) : candidates.length > 0 ? (
                        <><RefreshCw className="w-4 h-4" />다시 생성하기</>
                      ) : (
                        <>✨ 닉네임 5개 만들기</>
                      )}
                    </button>
                    <p className="text-[11px] text-gray-400 text-center">지역·나이·관심사를 조합해 자동으로 만들어드려요 · 최대 8글자</p>

                    {candidates.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-gray-500 text-center">마음에 드는 닉네임을 선택하세요</p>
                        {candidates.map(({ nickname, concept }) => {
                          const isSel = selectedNickname === nickname;
                          return (
                            <button key={nickname} type="button" onClick={() => setSelectedNickname(nickname)}
                              className={`w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl border-2 transition-all ${
                                isSel ? 'border-cyan-500 bg-cyan-50 shadow-md' : 'border-gray-200 bg-white hover:border-cyan-300'
                              }`}>
                              <div className="text-left min-w-0">
                                <span className={`font-black text-sm block ${isSel ? 'text-cyan-700' : 'text-gray-800'}`}>{nickname}</span>
                                <span className={`text-[11px] font-medium block mt-0.5 truncate ${isSel ? 'text-cyan-500' : 'text-gray-400'}`}>{concept}</span>
                              </div>
                              {isSel ? (
                                <span className="text-xs font-bold text-cyan-600 bg-cyan-100 px-2 py-1 rounded-full flex-shrink-0">선택됨</span>
                              ) : (
                                <span className="text-[11px] text-gray-300 flex-shrink-0">선택</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {selectedNickname && (
                      <div className="p-3 bg-gradient-to-r from-cyan-50 to-teal-50 rounded-xl border border-cyan-200">
                        <p className="text-xs text-gray-400 mb-0.5">선택된 닉네임 (입장 후 변경 불가)</p>
                        <p className="text-lg font-black text-cyan-700">{selectedNickname}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* 직접 입력 모드 */}
                {nicknameMode === 'custom' && (
                  <div className="pt-1 space-y-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-gray-600">닉네임 직접 입력</label>
                        <span className={`text-xs font-bold tabular-nums ${customInput.length >= 6 ? 'text-rose-500' : 'text-gray-400'}`}>
                          {customInput.length} / 6
                        </span>
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          value={customInput}
                          onChange={(e) => handleCustomChange(e.target.value)}
                          maxLength={6}
                          placeholder="예: 서울고수"
                          className={`w-full px-4 py-3 rounded-xl border-2 text-sm font-bold transition-all outline-none bg-white ${
                            customError ? 'border-rose-400 focus:border-rose-500' :
                            dupChecked ? 'border-emerald-400 focus:border-emerald-500' :
                            'border-gray-200 focus:border-cyan-400'
                          }`}
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          {checkingDup && <RefreshCw className="w-4 h-4 text-gray-400 animate-spin" />}
                          {!checkingDup && dupChecked && !customError && <span className="text-emerald-500 text-xs font-bold">사용 가능 ✓</span>}
                        </div>
                      </div>

                      {/* 에러 메시지 */}
                      {customError && (
                        <p className="text-xs text-rose-500 font-medium flex items-center gap-1">
                          <span>⚠</span> {customError}
                        </p>
                      )}

                      {/* 안내 문구 */}
                      <div className="p-3 bg-amber-50 rounded-lg border border-amber-100 space-y-1">
                        <p className="text-[11px] font-bold text-amber-700">입력 규칙</p>
                        <ul className="text-[11px] text-amber-600 space-y-0.5 list-none">
                          <li>· 공백 포함 최대 6글자</li>
                          <li>· 정치·종교·지역감정·욕설 포함 불가</li>
                          <li>· 이미 사용 중인 닉네임 불가</li>
                          <li>· 입장 후 변경이 불가능하니 신중히 선택하세요</li>
                        </ul>
                      </div>
                    </div>

                    {dupChecked && !customError && customInput.trim().length >= 2 && (
                      <div className="p-3 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-200">
                        <p className="text-xs text-gray-400 mb-0.5">사용할 닉네임 (입장 후 변경 불가)</p>
                        <p className="text-lg font-black text-emerald-700">{customInput.trim()}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── 연락처 입력 ── */}
                <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-4 space-y-3">
                  <div>
                    <p className="text-xs font-black text-blue-700 mb-0.5">연락처 입력</p>
                    <p className="text-[10px] text-blue-500">아래 중 하나 이상 필수 입력 (비공개 선택 시 제외)</p>
                  </div>
                  <div className="flex items-start gap-2 p-2.5 bg-white border border-blue-200 rounded-xl">
                    <svg className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <p className="text-[10px] text-blue-600 leading-relaxed">입력하신 정보는 프로필에 공개되지 않으며, 사용자 동의 시에만 매칭 상대방에게 전달됩니다.</p>
                  </div>
                  <div className="space-y-2">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-yellow-500 font-black text-xs">K</span>
                      <input value={kakaoId} onChange={e => setKakaoId(e.target.value)} disabled={contactPrivate}
                        placeholder="카카오톡 ID"
                        className="w-full pl-8 pr-3 py-2.5 rounded-xl border-2 border-blue-200 bg-white text-sm focus:border-blue-400 focus:outline-none disabled:opacity-40 disabled:bg-gray-100" />
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-pink-500 font-black text-xs">@</span>
                      <input value={instagramId} onChange={e => setInstagramId(e.target.value)} disabled={contactPrivate}
                        placeholder="인스타그램 ID"
                        className="w-full pl-8 pr-3 py-2.5 rounded-xl border-2 border-blue-200 bg-white text-sm focus:border-blue-400 focus:outline-none disabled:opacity-40 disabled:bg-gray-100" />
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-green-500 font-black text-xs">#</span>
                      <input value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} disabled={contactPrivate}
                        placeholder="전화번호 (숫자만)"
                        className="w-full pl-8 pr-3 py-2.5 rounded-xl border-2 border-blue-200 bg-white text-sm focus:border-blue-400 focus:outline-none disabled:opacity-40 disabled:bg-gray-100" />
                    </div>
                  </div>
                  <label className="flex items-start gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={contactPrivate} onChange={e => setContactPrivate(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-red-500 flex-shrink-0" />
                    <span className="text-xs font-bold text-gray-700">연락처 공유 안 함 (비공개)</span>
                  </label>
                  {contactPrivate && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-2.5">
                      <p className="text-[11px] text-red-600 font-medium leading-relaxed">
                        선택 시 연락처가 상대방에게 절대 공유되지 않으며, 행사 내 소통이 제한될 수 있습니다.
                      </p>
                    </div>
                  )}
                  {!contactPrivate && !contactValid && (
                    <p className="text-[11px] text-red-500 font-semibold">카카오, 인스타, 전화번호 중 하나 이상을 입력해 주세요.</p>
                  )}
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setStep(2)}
                    className="flex items-center justify-center gap-1.5 px-5 py-3 bg-gray-100 text-gray-500 font-bold rounded-xl hover:bg-gray-200 transition-all">
                    <ArrowLeft className="w-4 h-4" /> 이전
                  </button>
                  <button type="button" onClick={handleSubmit} disabled={!canEnter || !contactValid}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold rounded-xl hover:from-cyan-600 hover:to-teal-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                    {loading ? '입장 중...' : <>이 닉네임으로 입장하기 <ChevronRight className="w-5 h-5" /></>}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


// ─── TimerBanner ──────────────────────────────────────────────────────────────

function TimerBanner({ endAt, label }: { endAt: string; label: string }) {
  const calc = () => Math.max(0, Math.round((new Date(endAt).getTime() - Date.now()) / 1000));
  const [remaining, setRemaining] = useState(calc);
  const [showAlert, setShowAlert] = useState(false);
  // Only cross-from-above: track whether we started above the threshold
  const startedAbove60Ref = useRef(calc() > 60);
  const alertShownRef = useRef(false);

  useEffect(() => {
    startedAbove60Ref.current = calc() > 60;
    alertShownRef.current = false;
    const id = setInterval(() => {
      const r = calc();
      setRemaining(r);
      if (r <= 60 && startedAbove60Ref.current && !alertShownRef.current) {
        alertShownRef.current = true;
        setShowAlert(true);
      }
    }, 1000);
    return () => { clearInterval(id); setShowAlert(false); };
  }, [endAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  const expired = remaining === 0;
  const nearEnd = remaining <= 60;

  return (
    <>
      <div className={`px-4 py-1.5 flex items-center justify-end gap-2 ${
        expired ? 'bg-gray-50 border-gray-200'
        : nearEnd ? 'bg-red-50 border-red-200'
        : 'bg-amber-50 border-amber-100'
      } border-t`}>
        <span className={`text-sm font-black tabular-nums ${
          expired ? 'text-gray-400' : nearEnd ? 'text-red-600' : 'text-amber-700'
        }`}>{formatted}</span>
        {label && <span className={`text-xs font-medium ${
          expired ? 'text-gray-400' : nearEnd ? 'text-red-500' : 'text-amber-600'
        }`}>· {label}</span>}
      </div>
      {showAlert && (
        <div className="mx-4 my-1 px-4 py-2.5 bg-red-500 rounded-xl flex items-center gap-3 animate-pulse">
          <span className="text-lg">🔔</span>
          <span className="text-sm font-black text-white">
            곧 진행이 시작됩니다!
          </span>
        </div>
      )}
    </>
  );
}

// ─── RefreshBtn ───────────────────────────────────────────────────────────────

function RefreshBtn({ onRefresh, refreshed, dark = false }: { onRefresh: () => void; refreshed: boolean; dark?: boolean }) {
  return (
    <button
      onClick={onRefresh}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border shadow-sm transition-all active:scale-95 ${
        refreshed
          ? dark
            ? 'bg-teal-500/20 border-teal-500/40 text-teal-300'
            : 'bg-teal-50 border-teal-300 text-teal-600'
          : dark
            ? 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
            : 'bg-white hover:bg-gray-50 text-gray-500 border-gray-200'
      }`}
    >
      {refreshed ? (
        <CheckCircle className="w-3.5 h-3.5" />
      ) : (
        <RefreshCw className="w-3.5 h-3.5" />
      )}
      {refreshed ? '완료!' : '새로고침'}
    </button>
  );
}

// ─── MainScreen ───────────────────────────────────────────────────────────────

function MainScreen({
  profiles, currentUserId, likedIds, sentHeartTypes, likeStatuses, seats, profileMap, mainTab,
  onTabChange, onLike, onSelect, onReset, onProfileClickFromMap,
  receivedLikers, receivedHeartTypes, sentLikedProfiles, contactSharedWithIds, acknowledgedComplimentIds,
  receivedContactShares, pendingHeartsCount, chatList, suggestions,
  balanceGames, voteCounts, myVotes,
  onContactShareOpen, onContactViewOpen, onHeartResponse, onDeleteChat, onSubmitSuggestion, onOpenChat,
  onVote, onCreateGame, onEndGame, onSubmitAnonymousReport,
  timerEndAt, timerLabel, onRefreshStatus, onRefreshChat, onRefreshProfiles, onRefreshSeating, darkMode, onToggleDark, onShowQr, seatingLocked, activeTables, tableLabels, onShowTutorial,
  newMsgCount, onClearMsgCount, resetPassword,
}: {
  profiles: Profile[]; currentUserId: string | null; likedIds: Set<string>; sentHeartTypes: Map<string, HeartType>; likeStatuses: Map<string, string>;
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
  resetPassword: string | null;
}) {
  const heartCount = useCallback((t: HeartType) => { let c = 0; sentHeartTypes.forEach(v => { if (v === t) c++; }); return c; }, [sentHeartTypes]);
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
          const q = profileSearch.toLowerCase();
          if (!p.nickname.toLowerCase().includes(q)) return false;
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
    if (t === 'status') { setSeenHeartsCount(pendingHeartsCount); setSeenContactsCount(receivedContactShares.length); setSeenProfilesCount(profiles.length); }
    if (t === 'chats') onClearMsgCount();
    if (t === 'game') setSeenGameCount(activeGameCount);
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

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'bg-slate-950' : 'bg-gray-50'}`}>
      <header className={`sticky top-0 z-10 transition-colors duration-300 ${darkMode ? 'bg-slate-900 border-b-2 border-slate-700 shadow-slate-950/50' : 'bg-white shadow-sm'}`}>
        <div className="max-w-7xl mx-auto px-4 py-3 grid grid-cols-3 items-center">
          {/* 좌: 튜토리얼 버튼 */}
          <button
            onClick={() => onShowTutorial()}
            className={`justify-self-start flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-all active:scale-95 ${darkMode ? 'text-slate-400 hover:text-cyan-400 hover:bg-slate-800' : 'text-gray-500 hover:text-cyan-600 hover:bg-cyan-50'}`}
          >
            <BookOpen className="w-5 h-5" />
            <span className="text-[9px] font-semibold">튜토리얼</span>
          </button>
          {/* 중앙: 타이틀 */}
          <div className="justify-self-center">
            <ResetButton onReset={onReset} darkMode={darkMode} resetPassword={resetPassword} />
          </div>
          {/* 우: 다크모드 + 하트 */}
          <div className="justify-self-end flex items-center gap-2">
            <button onClick={onToggleDark}
              className={`p-2 rounded-xl transition-all ${darkMode ? 'bg-slate-700 text-amber-400 hover:bg-slate-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
              title={darkMode ? '라이트 모드' : '다크 모드'}>
              {darkMode ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd"/></svg>
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/></svg>
              )}
            </button>
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
            { id: 'game' as MainTab, label: '게임', icon: <Gamepad2 className="w-5 h-5" />, badge: Math.max(0, activeGameCount - seenGameCount) },
            { id: 'stats' as MainTab, label: '통계·랭킹', icon: <BarChart3 className="w-5 h-5" /> },
          ]).map((t) => (
            <button key={t.id} onClick={() => handleTabChange(t.id)}
              className={`relative flex-1 min-w-[56px] flex flex-col items-center gap-1 px-2 py-2.5 text-[10px] font-semibold border-b-2 transition-all active:scale-95 ${
                mainTab === t.id || (t.id === 'status' && mainTab === 'profiles') || (t.id === 'chats' && mainTab === 'suggestions') || (t.id === 'stats' && mainTab === 'ranking')
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
            {[{ id: 'status' as MainTab, label: '내 상태' }, { id: 'profiles' as MainTab, label: '참여자' }].map(sub => (
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
        {/* Sub Tab — 채팅·건의 */}
        {(mainTab === 'chats' || mainTab === 'suggestions') && (
          <div className={`max-w-7xl mx-auto flex p-1 ${darkMode ? 'bg-slate-800' : 'bg-gray-200/80'}`}>
            {[{ id: 'chats' as MainTab, label: '채팅' }, { id: 'suggestions' as MainTab, label: '건의함' }].map(sub => (
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

      </header>
      <main className={`max-w-7xl mx-auto px-4 py-6 ${mainTab === 'seating' ? '' : 'scrollbar-styled-light'}`}>
        {mainTab === 'profiles' && (
          seatingLocked ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${darkMode ? 'bg-slate-700' : 'bg-gray-100'}`}>
                <Lock className={`w-7 h-7 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
              </div>
              <p className={`font-bold text-sm ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>참여자가 잠겨 있습니다</p>
              <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>관리자 안내에 따라 이용하세요</p>
            </div>
          ) : (
          <>
            {/* 검색 + 필터 바 */}
            <div className="space-y-2 mb-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    value={profileSearch}
                    onChange={e => setProfileSearch(e.target.value)}
                    placeholder="닉네임 검색..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:border-teal-400 focus:outline-none shadow-sm"
                  />
                </div>
                <RefreshBtn onRefresh={() => doRefresh('profiles', onRefreshProfiles)} refreshed={refreshedTab === 'profiles'} />
              </div>
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

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 no-capture">
            {filteredProfiles.map((profile) => {
              const posColor = getPositionBg(profile.personality_score ?? 50);
              const posLabel = getPositionLabel(profile.personality_score ?? 50);
              const isLiked = likedIds.has(profile.id);
              const canLike = currentUserId && profile.id !== currentUserId;
              const bioTags = profile.bio ? profile.bio.split(',').map(t => t.trim()).filter(Boolean).slice(0, 3) : [];
              const isMe = profile.id === currentUserId;
              const age = getKoreanAge(profile.birth_year);
              return (
              <div key={profile.id}
                className={`group relative bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer active:scale-[0.98] ${
                  isMe ? 'border-2 border-amber-400 ring-2 ring-amber-300/50' : 'border border-gray-100'
                }`}
                onClick={() => onSelect(profile)}>
                {isMe && (
                  <div className="absolute top-1.5 left-1.5 z-10 px-1.5 py-0.5 bg-amber-400 rounded-full shadow text-[9px] font-black text-white">나</div>
                )}
                <div className="flex items-stretch min-h-[5rem]">
                  {/* 성향 색상 사각형 + MBTI — 고정 너비·높이, 텍스트 절대 겹침 없음 */}
                  <div className="w-14 flex-shrink-0 flex flex-col items-center justify-center gap-0.5 px-0.5 py-1"
                    style={{ backgroundColor: posColor }}>
                    <span className="text-[8px] font-black text-white leading-tight text-center w-full overflow-hidden" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{posLabel}</span>
                    {profile.mbti && (
                      <span className="text-[8px] font-bold text-white/85 leading-none block w-full text-center truncate">{profile.mbti}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 px-2 py-2 flex flex-col justify-center gap-0.5">
                    <p className="font-black text-gray-900 text-xs truncate leading-tight">{profile.nickname}</p>
                    {profile.birth_year && <p className="text-[9px] text-gray-400 truncate">{age}{profile.location ? ` · ${profile.location}` : ''}</p>}
                    {bioTags.length > 0 && (
                      <div className="flex flex-wrap gap-0.5">
                        {bioTags.map(tag => (
                          <span key={tag} className="text-[8px] font-semibold px-1 py-0.5 rounded-full bg-orange-50 text-orange-500 border border-orange-200">#{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {canLike && !seatingLocked && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onLike(profile.id); }}
                    disabled={isLiked}
                    className={`absolute top-1.5 right-1.5 w-7 h-7 rounded-full flex items-center justify-center shadow transition-all active:scale-90 ${
                      isLiked
                        ? `${sentHeartTypes.get(profile.id) ? heartMeta(sentHeartTypes.get(profile.id)!).solidBg : 'bg-rose-500'} text-white`
                        : 'bg-white/90 text-gray-400 hover:bg-rose-500 hover:text-white'
                    }`}>
                    <Heart className={`w-3 h-3 ${isLiked ? 'fill-current' : ''}`} />
                  </button>
                )}
              </div>
              );
            })}
            {profiles.filter(p => {
              if (profileSearch && !p.nickname.toLowerCase().includes(profileSearch.toLowerCase())) return false;
              if (profileMbtiFilter && p.mbti !== profileMbtiFilter) return false;
              return true;
            }).length === 0 && (
              <div className="col-span-2 sm:col-span-3 lg:col-span-4 text-center py-20">
                <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">{profileSearch || profilePersonalityFilter || profileMbtiFilter ? '검색 결과가 없습니다.' : '아직 참가자가 없습니다.'}</p>
              </div>
            )}
          </div>
          </>
          )
        )}

        {mainTab === 'seating' && (
          seatingLocked ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${darkMode ? 'bg-slate-700' : 'bg-gray-100'}`}>
                <Lock className={`w-7 h-7 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
              </div>
              <p className={`font-bold text-sm ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>배치도가 잠겨 있습니다</p>
              <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>관리자 안내에 따라 이용하세요</p>
            </div>
          ) : (
            <div>
              <div className="flex justify-end px-2 pt-1 pb-2">
                <RefreshBtn onRefresh={() => doRefresh('seating', onRefreshSeating)} refreshed={refreshedTab === 'seating'} dark />
              </div>
              <div className={`rounded-2xl border p-3 sm:p-4 transition-colors duration-300 ${darkMode ? 'bg-slate-900 border-slate-600' : 'bg-white border-gray-200 shadow-sm'}`}>
                <SeatingMap seats={visibleSeats} profileMap={profileMap} currentUserId={currentUserId} isAdmin={false} seatingLocked={seatingLocked} darkMode={darkMode} tableLabels={tableLabels} onProfileClick={onProfileClickFromMap} onChatClick={onOpenChat} />
              </div>
              <p className={`text-center text-xs mt-2 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>
                ↔↕ 상하좌우 + 대각선 스크롤 가능 &middot; 테이블 탭하면 확대됩니다
              </p>
            </div>
          )
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
                    {/* 프로필 이미지 + QR */}
                    <div className="flex-shrink-0">
                      <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-cyan-500/50 shadow-lg shadow-cyan-500/20">
                        <ProfileAvatar profile={me} size="lg" rounded="2xl" className="w-full h-full" />
                      </div>
                      {currentUserSeat && (
                        <div className="mt-1.5 text-center">
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
            {seatingLocked ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${darkMode ? 'bg-slate-700' : 'bg-gray-100'}`}>
                  <Lock className={`w-7 h-7 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
                </div>
                <p className={`font-bold text-sm ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>하트가 잠겨 있습니다</p>
                <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>관리자 안내에 따라 이용하세요</p>
              </div>
            ) : (
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
            )}
          </div>
          </StatusErrorBoundary>
        )}

        {/* ─── 채팅 탭 ─── */}
        {mainTab === 'chats' && (
          seatingLocked ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${darkMode ? 'bg-slate-700' : 'bg-gray-100'}`}>
                <Lock className={`w-7 h-7 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
              </div>
              <p className={`font-bold text-sm ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>채팅이 잠겨 있습니다</p>
              <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>관리자 안내에 따라 이용하세요</p>
            </div>
          ) : (
          <div className="max-w-lg mx-auto space-y-3">
            <div className="flex items-center justify-between">
              <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>수락한 상대방과의 채팅 내역입니다</p>
              <RefreshBtn onRefresh={() => doRefresh('chats', onRefreshChat)} refreshed={refreshedTab === 'chats'} />
            </div>
            <div className={`rounded-2xl p-3 flex items-start gap-2.5 ${darkMode ? 'bg-cyan-900/30 border border-cyan-800' : 'bg-cyan-50 border border-cyan-200'}`}>
              <MessageCircle className="w-5 h-5 text-cyan-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className={`text-xs font-semibold leading-relaxed ${darkMode ? 'text-cyan-300' : 'text-cyan-800'}`}>
                  매칭이 되지 않더라도 대화를 통하여 서로의 연락처 교환이 가능해집니다.
                </p>
                <p className={`text-[11px] mt-0.5 ${darkMode ? 'text-cyan-400' : 'text-cyan-600'}`}>채팅에서 자연스럽게 이야기 나누며 연락처를 주고받아 보세요.</p>
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
                  <div key={chat.id} className={`rounded-2xl shadow-sm p-4 flex items-center gap-3 transition-colors duration-300 ${darkMode ? 'bg-slate-800 border border-slate-600' : 'bg-white'}`}>
                    <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0">
                      {otherProfile ? (
                        <img src={otherProfile.photo_url} alt={otherProfile.nickname} className="w-full h-full object-cover" />
                      ) : (
                        <div className={`w-full h-full flex items-center justify-center text-xs ${darkMode ? 'bg-slate-700 text-slate-400' : 'bg-gray-200 text-gray-400'}`}>?</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{otherProfile?.nickname ?? '알 수 없음'}</p>
                      <p className={`text-xs truncate ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>{chat.lastMessage || '메시지 없음'}</p>
                    </div>
                    <div className="flex gap-2">
                      {otherProfile && (
                        <button
                          onClick={() => onOpenChat(otherProfile)}
                          className="px-3 py-1.5 bg-cyan-50 hover:bg-cyan-100 text-cyan-600 text-xs font-bold rounded-xl border border-cyan-200 transition-all"
                        >채팅</button>
                      )}
                      <button
                        onClick={() => onDeleteChat(chat)}
                        className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-500 text-xs font-bold rounded-xl border border-red-200 transition-all"
                      >삭제</button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          )
        )}

        {/* ─── 게임 탭 ─── */}
        {mainTab === 'game' && (
          seatingLocked ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${darkMode ? 'bg-slate-700' : 'bg-gray-100'}`}>
                <Lock className={`w-7 h-7 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
              </div>
              <p className={`font-bold text-sm ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>게임이 잠겨 있습니다</p>
              <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>관리자 안내에 따라 이용하세요</p>
            </div>
          ) : (
            <UserGameTab
              currentUserId={currentUserId}
              tableNumber={tableNumber}
              currentUserNickname={currentUserNickname}
              balanceGames={balanceGames}
              voteCounts={voteCounts}
              myVotes={myVotes}
              seats={seats}
              onVote={onVote}
              onCreateGame={onCreateGame}
              onEndGame={onEndGame}
            />
          )
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
          seatingLocked ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${darkMode ? 'bg-slate-700' : 'bg-gray-100'}`}>
                <Lock className={`w-7 h-7 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
              </div>
              <p className={`font-bold text-sm ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>통계가 잠겨 있습니다</p>
              <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>관리자 안내에 따라 이용하세요</p>
            </div>
          ) : (
            <StatsTab profiles={profiles} seats={seats} darkMode={darkMode} />
          )
        )}

        {/* ─── 랭킹 탭 ─── */}
        {mainTab === 'ranking' && (
          seatingLocked ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${darkMode ? 'bg-slate-700' : 'bg-gray-100'}`}>
                <Lock className={`w-7 h-7 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
              </div>
              <p className={`font-bold text-sm ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>랭킹이 잠겨 있습니다</p>
              <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>관리자 안내에 따라 이용하세요</p>
            </div>
          ) : (
            <RankingTab seats={seats} darkMode={darkMode} profiles={profiles} />
          )
        )}

      </main>
    </div>
  );
}

// ─── Profile Detail ───────────────────────────────────────────────────────────

function ProfileScoreBar({ label, score, getLabel, getBg, leftText, rightText }: {
  label: string; score: number | null;
  getLabel: (v: number | null) => string; getBg: (v: number | null) => string;
  leftText: string; rightText: string;
}) {
  const bg = getBg(score);
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
        <span className="px-2.5 py-0.5 rounded-full text-white font-bold text-xs" style={{ background: bg }}>{getLabel(score)}</span>
      </div>
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${score ?? 0}%`, background: bg }} />
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 mt-1 font-medium">
        <span>{leftText}</span>
        <span>{rightText}</span>
      </div>
    </div>
  );
}

function ProfileDetail({ profile, isMe, isLiked, heartType, onLike, onChat, onBack, onReset }: {
  profile: Profile; isMe: boolean; isLiked: boolean; heartType?: HeartType;
  onLike: () => void; onChat: () => void; onBack: () => void; onReset: () => void;
}) {
  const handleLike = () => {
    if (isLiked) return;
    onLike();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={onBack} className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-base font-semibold text-gray-900 flex-1">프로필</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        {/* Photo + name overlay */}
        <div className="relative rounded-2xl overflow-hidden shadow-md">
          <div className="aspect-[4/3] flex items-center justify-center" style={{ backgroundColor: getPositionBg(profile.personality_score ?? 50) }}>
            <div className="flex flex-col items-center gap-2">
              <span className="text-4xl font-black text-white">{getPositionLabel(profile.personality_score ?? 50)}</span>
              {profile.mbti && <span className="text-2xl font-bold text-white/80">{profile.mbti}</span>}
            </div>
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 px-5 pb-5">
            <div className="flex items-end gap-2">
              <h2 className="text-2xl font-bold text-white leading-tight">{profile.nickname}</h2>
              {isMe && (
                <span className="mb-0.5 px-3 py-1 bg-amber-400 text-white text-sm font-black rounded-full shadow-md border-2 border-amber-200">나</span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-1.5">
              {profile.mbti && (
                <span className="px-2.5 py-0.5 bg-white/20 backdrop-blur-sm text-white text-xs font-bold rounded-full border border-white/30">
                  {profile.mbti}
                </span>
              )}
              {profile.birth_year && (
                <span className="px-2.5 py-0.5 bg-white/20 backdrop-blur-sm text-white text-xs font-bold rounded-full border border-white/30">
                  {getKoreanAge(profile.birth_year)}
                </span>
              )}
              {profile.location && (
                <span className="px-2.5 py-0.5 bg-white/20 backdrop-blur-sm text-white text-xs font-bold rounded-full border border-white/30 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />{profile.location}
                </span>
              )}
            </div>
          </div>
          {!isMe && (
          <button
            onClick={handleLike}
            disabled={isLiked}
            className={`absolute top-4 right-4 p-2.5 rounded-full backdrop-blur-sm transition-all ${
              isLiked
                ? `${heartType ? heartMeta(heartType).solidBg : 'bg-rose-500'} text-white shadow-lg`
                : 'bg-white/30 text-white hover:bg-rose-500 hover:scale-110'
            }`}
          >
            <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
          </button>
          )}
        </div>

        {/* Bio tags */}
        {profile.bio && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">소개</p>
            <div className="flex flex-wrap gap-2">
              {profile.bio.split(', ').map((tag) => (
                <span key={tag} className="px-3 py-1.5 bg-teal-50 text-teal-700 text-sm font-medium rounded-full border border-teal-200">
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* MBTI */}
        {profile.mbti && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">MBTI</p>
            <span className="inline-block px-4 py-1.5 bg-teal-50 text-teal-700 text-sm font-bold rounded-full border border-teal-200">
              {profile.mbti}
            </span>
          </div>
        )}

        {/* Score section */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">성향</p>
          <ProfileScoreBar label="포지션" score={profile.personality_score}
            getLabel={(v) => getPositionLabel(v ?? 50)} getBg={(v) => getPositionBg(v ?? 50)}
            leftText="바텀" rightText="탑" />
          <div className="h-px bg-gray-100" />
          <ProfileScoreBar label="돔/섭" score={profile.dom_sub_score}
            getLabel={getDomSubLabel} getBg={getDomSubBg} leftText="섭" rightText="돔" />
        </div>

        {/* Chat button */}
        {!isMe && (
        <button onClick={onChat}
          className="w-full py-3.5 bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-semibold rounded-2xl hover:from-cyan-600 hover:to-teal-600 transition-all flex items-center justify-center gap-2 shadow-sm">
          <MessageCircle className="w-5 h-5" />
          채팅하기
        </button>
        )}
      </main>
    </div>
  );
}

// ─── Chat Screen ──────────────────────────────────────────────────────────────

function ChatScreen({ messages, currentUserId, otherProfile, onSend, onSendImage, onBack, onReset }: {
  messages: Message[]; currentUserId: string; otherProfile: Profile;
  onSend: (content: string) => void;
  onSendImage: (file: File) => Promise<string | null>;
  onBack: () => void; onReset: () => void;
}) {
  const [input, setInput] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [chatError, setChatError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      if (hasBannedWord(input.trim())) {
        setChatError('부적절한 표현이 포함되어 있어 전송할 수 없습니다.');
        return;
      }
      setChatError('');
      onSend(input.trim());
      setInput('');
    }
    setShowEmoji(false);
  };

  const handleEmojiClick = (emoji: string) => {
    setInput((prev) => prev + emoji);
  };

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

  return (
    <div className="fixed inset-0 bg-gray-100 flex flex-col" style={{ height: '100dvh' }}>
      <header className="bg-white shadow-sm shrink-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <div className="w-10 h-10 rounded-full overflow-hidden">
            <img src={otherProfile.photo_url} alt={otherProfile.nickname} className="w-full h-full object-cover" />
          </div>
          <h2 className="font-semibold text-gray-900 flex-1">{otherProfile.nickname}</h2>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-3xl mx-auto px-4 py-4 space-y-3">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.sender_id === currentUserId ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[72%] rounded-2xl overflow-hidden ${
                msg.sender_id === currentUserId
                  ? 'bg-cyan-500 text-white rounded-br-md'
                  : 'bg-white text-gray-900 rounded-bl-md shadow-sm'
              }`}>
                {msg.image_url ? (
                  <img src={msg.image_url} alt="이미지" className="max-w-[240px] w-full object-contain" />
                ) : (
                  <p className="px-4 py-2">{msg.content}</p>
                )}
                <p className={`text-xs px-3 pb-1.5 ${msg.sender_id === currentUserId ? 'text-cyan-100 text-right' : 'text-gray-400'}`}>
                  {new Date(msg.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
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

      <footer className="bg-white border-t border-gray-200 shrink-0">
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
        {chatError && (
          <div className="max-w-3xl mx-auto px-3 pt-2">
            <p className="text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-lg border border-red-200">{chatError}</p>
          </div>
        )}
        <form onSubmit={handleSend} className="max-w-3xl mx-auto px-3 py-2.5 flex items-center gap-2">
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="p-2 text-gray-400 hover:text-cyan-500 hover:bg-cyan-50 rounded-full transition-all disabled:opacity-50">
            <ImageIcon className="w-5 h-5" />
          </button>
          <button type="button" onClick={() => setShowEmoji(!showEmoji)}
            className={`p-2 rounded-full transition-all ${showEmoji ? 'text-cyan-500 bg-cyan-50' : 'text-gray-400 hover:text-cyan-500 hover:bg-cyan-50'}`}>
            <Smile className="w-5 h-5" />
          </button>
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)}
            placeholder={uploading ? '업로드 중...' : '메시지를 입력하세요...'}
            disabled={uploading}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition-all text-sm disabled:opacity-60" />
          <button type="submit" disabled={!input.trim() || uploading}
            className="p-2 bg-cyan-500 text-white rounded-full hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
            <Send className="w-5 h-5" />
          </button>
        </form>
      </footer>
    </div>
  );
}

export default App;

// ─── Browser Guide Popup ──────────────────────────────────────────────────────
function BrowserGuidePopup({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[500] flex items-end justify-center bg-black/50 backdrop-blur-sm p-4 pb-8">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
        <div className="bg-gradient-to-r from-teal-500 to-cyan-500 px-5 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <Wifi className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-black text-white text-base">원활한 접속을 위해</h3>
            <p className="text-white/80 text-xs mt-0.5">아래 사항을 확인해 주세요</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl bg-white/20 hover:bg-white/30 transition-all">
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          {[
            { icon: '🌐', title: '일반 모드로 접속하기', desc: '시크릿/인터넷 개인 정보 보호 모드에서는 저장 기능이 제한됩니다. 일반 모드로 접속해 주세요.' },
            { icon: '🔋', title: '절전 모드 해제', desc: 'iOS/안드로이드 절전 모드나 저전력 모드를 끄면 접속이 훨씬 안정적입니다.' },
            { icon: '📶', title: 'Wi-Fi 연결 권장', desc: '모바일 데이터보다 Wi-Fi를 사용하면 끊김 없이 이용할 수 있습니다.' },
            { icon: '🔄', title: '앱 전환 자제', desc: '앱을 백그라운드로 내리면 연결이 끊길 수 있습니다. 화면을 켜둬 주세요.' },
          ].map(item => (
            <div key={item.title} className="flex items-start gap-3 p-3 bg-gray-50 rounded-2xl">
              <span className="text-xl flex-shrink-0">{item.icon}</span>
              <div>
                <p className="text-sm font-black text-gray-900">{item.title}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 pb-5">
          <button onClick={onClose} className="w-full py-3.5 bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-black rounded-2xl hover:from-teal-600 hover:to-cyan-600 transition-all shadow-lg shadow-teal-200">
            확인했습니다
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Reconnect Overlay ────────────────────────────────────────────────────────
function ReconnectOverlay({ status, onRetry }: { status: 'reconnecting' | 'error'; onRetry: () => void }) {
  const [dots, setDots] = useState('');
  useEffect(() => {
    if (status !== 'reconnecting') return;
    const t = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 500);
    return () => clearInterval(t);
  }, [status]);

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xs p-7 text-center space-y-4">
        {status === 'reconnecting' ? (
          <>
            <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto">
              <WifiOff className="w-8 h-8 text-amber-500" />
            </div>
            <h3 className="font-black text-gray-900 text-lg">연결이 끊겼습니다</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              서버와 재연결을 시도하고 있습니다{dots}<br />
              <span className="text-xs text-gray-400">잠시만 기다려 주세요</span>
            </p>
            <div className="flex justify-center gap-1.5">
              {[0,1,2].map(i => (
                <span key={i} className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: `${i * 0.2}s` }} />
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto">
              <WifiOff className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="font-black text-gray-900 text-lg">연결 실패</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              서버 연결에 실패했습니다.<br />
              데이터는 안전하게 저장되어 있으니<br />
              새로고침 후 다시 시도해 주세요.
            </p>
            <button onClick={onRetry}
              className="w-full py-3.5 bg-gradient-to-r from-slate-800 to-slate-900 text-white font-black rounded-2xl hover:from-slate-700 hover:to-slate-800 transition-all">
              새로고침
            </button>
          </>
        )}
      </div>
    </div>
  );
}
