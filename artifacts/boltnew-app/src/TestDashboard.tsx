import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import type { Database } from './types/database';
import {
  Users, Heart, MessageCircle, LayoutGrid,
  Trash2, RefreshCw, Play, UserPlus, X, CheckCircle,
  AlertTriangle, ChevronDown, ChevronRight,
} from 'lucide-react';
import { genAvatar } from './lib/profile';
import { MBTI_LIST, BIO_LIST, LETTERS } from './lib/constants';

type Profile = Database['public']['Tables']['profiles']['Row'];
type Seat = Database['public']['Tables']['seats']['Row'];
type Like = Database['public']['Tables']['likes']['Row'];
type Chat = Database['public']['Tables']['chats']['Row'];

// ── 더미 데이터 풀 ─────────────────────────────────────────────────────────
const DUMMY_ADJS = ['귀여운', '멋진', '신비한', '달콤한', '차가운', '따뜻한', '발랄한', '시크한', '느긋한', '엉뚱한', '섹시한', '상큼한', '로맨틱한', '도도한', '강렬한'];
const DUMMY_NOUNS = ['곰돌이', '여우', '고양이', '팬더', '토끼', '사자', '늑대', '펭귄', '호랑이', '부엉이', '코알라', '라쿤', '레서판다', '해달', '알파카'];
const DUMMY_LOCATIONS = [
  '부산 해운대', '부산 서면', '부산 남포동', '부산 광안리', '부산 동래',
  '서울 강남', '서울 홍대', '서울 이태원', '대구 반월당', '인천 부평',
  '대전 둔산', '광주 충장로', '울산 삼산', '수원 인계동', '성남 분당',
];
const DUMMY_INTERESTS_POOL = [
  '여행', '독서', '운동', '영화', '요리', '음악', '게임', '캠핑', '사진', '패션',
  '드라이브', '원예', '유튜브', 'OTT', '웹툰', '공연', '맛집탐방', '카페투어',
];

function randomBirth() {
  const year = 1985 + Math.floor(Math.random() * 20); // 1985~2004
  const month = Math.floor(Math.random() * 12) + 1;
  const day = Math.floor(Math.random() * 28) + 1;
  return { birth_year: year, birth_month: month, birth_day: day };
}

function randomLocation() {
  return DUMMY_LOCATIONS[Math.floor(Math.random() * DUMMY_LOCATIONS.length)];
}

function randomInterests(count = 3) {
  const shuffled = [...DUMMY_INTERESTS_POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).join(', ');
}

function randomPinCode(existing: Set<string>): string {
  let pin = String(Math.floor(1000 + Math.random() * 9000));
  while (existing.has(pin)) pin = String(Math.floor(1000 + Math.random() * 9000));
  return pin;
}

function randomKoreanNickname(existing: Set<string>): string {
  const maxTries = 50;
  for (let i = 0; i < maxTries; i++) {
    const adj = DUMMY_ADJS[Math.floor(Math.random() * DUMMY_ADJS.length)];
    const noun = DUMMY_NOUNS[Math.floor(Math.random() * DUMMY_NOUNS.length)];
    const nick = `${adj}${noun}`;
    if (!existing.has(nick)) return nick;
  }
  // 폴백: 영문+숫자
  const letters = [...LETTERS];
  const letter = letters[Math.floor(Math.random() * letters.length)];
  const num = Math.floor(Math.random() * 9) + 1;
  return `${letter}${num}`;
}

// ── Section wrapper ────────────────────────────────────────────────────────
function Section({ title, icon, children, defaultOpen = true }: { title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-slate-800/60 rounded-2xl border border-slate-700/50 overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-4 py-3 hover:bg-slate-700/30 transition-all">
        <span className="text-slate-400">{icon}</span>
        <span className="font-black text-slate-200 text-sm flex-1 text-left">{title}</span>
        {open ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

function Btn({ label, onClick, color = 'slate', disabled = false, small = false }: { label: string; onClick: () => void; color?: string; disabled?: boolean; small?: boolean }) {
  const colors: Record<string, string> = {
    teal: 'bg-teal-500/20 hover:bg-teal-500/40 text-teal-300 border-teal-500/30',
    rose: 'bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 border-rose-500/30',
    amber: 'bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 border-amber-500/30',
    cyan: 'bg-cyan-500/20 hover:bg-cyan-500/40 text-cyan-300 border-cyan-500/30',
    violet: 'bg-violet-500/20 hover:bg-violet-500/40 text-violet-300 border-violet-500/30',
    pink: 'bg-pink-500/20 hover:bg-pink-500/40 text-pink-300 border-pink-500/30',
    slate: 'bg-slate-600/50 hover:bg-slate-600 text-slate-300 border-slate-600',
    red: 'bg-red-500/20 hover:bg-red-500/40 text-red-300 border-red-500/30',
    green: 'bg-green-500/20 hover:bg-green-500/40 text-green-300 border-green-500/30',
  };
  return (
    <button onClick={onClick} disabled={disabled}
      className={`${small ? 'text-xs py-1.5 px-3' : 'text-sm py-2 px-4'} font-semibold rounded-xl border transition-all disabled:opacity-40 ${colors[color] ?? colors.slate}`}
    >{label}</button>
  );
}

function Tag({ text, color = 'slate' }: { text: string; color?: string }) {
  const colors: Record<string, string> = {
    teal: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
    rose: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    amber: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    slate: 'bg-slate-700 text-slate-300 border-slate-600',
    green: 'bg-green-500/20 text-green-300 border-green-500/30',
    red: 'bg-red-500/20 text-red-300 border-red-500/30',
  };
  return <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${colors[color] ?? colors.slate}`}>{text}</span>;
}

// ── Main TestDashboard ────────────────────────────────────────────────────
export default function TestDashboard() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [likes, setLikes] = useState<Like[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [sessionActive, setSessionActive] = useState<boolean | null>(null);
  const [activeTables, setActiveTables] = useState<number[] | null>(null);
  const [pendingActiveTables, setPendingActiveTables] = useState<number[] | null | undefined>(undefined);
  const [loading, setLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(() => localStorage.getItem('matching_app_user_id'));
  const [bulkCount, setBulkCount] = useState(20);

  const notify = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2800);
  };

  const load = async () => {
    const [p, s, l, c, settings] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('seats').select('*').order('table_number').order('seat_position'),
      supabase.from('likes').select('*').order('created_at', { ascending: false }),
      supabase.from('chats').select('*').order('created_at', { ascending: false }),
      supabase.from('app_settings').select('session_active, active_tables').eq('id', 1).single(),
    ]);
    if (p.data) setProfiles(p.data);
    if (s.data) setSeats(s.data);
    if (l.data) setLikes(l.data);
    if (c.data) setChats(c.data);
    if (settings.data) {
      setSessionActive(settings.data.session_active);
      setActiveTables((settings.data.active_tables as number[] | null) ?? null);
    }
  };

  useEffect(() => { load(); }, []);

  const myProfile = profiles.find(p => p.id === myUserId);
  const occupied = seats.filter(s => s.status === 'occupied').length;
  const mySeat = seats.find(s => s.profile_id === myUserId);

  // ── Session ───────────────────────────────────────────────────────────────
  const toggleSession = async () => {
    const next = !sessionActive;
    setLoading('session');
    await supabase.from('app_settings').update({ session_active: next, updated_at: new Date().toISOString() }).eq('id', 1);
    setSessionActive(next);
    notify(next ? '세션 시작됨' : '세션 종료됨', next);
    setLoading(null);
  };

  // ── Profiles ──────────────────────────────────────────────────────────────
  const createTestUser = async () => {
    setLoading('profile');
    const existingNicks = new Set(profiles.map(p => p.nickname));
    const existingPins = new Set(profiles.map(p => p.pin_code).filter(Boolean) as string[]);
    const nick = randomKoreanNickname(existingNicks);
    const mbti = MBTI_LIST[Math.floor(Math.random() * MBTI_LIST.length)];
    const bio = randomInterests(Math.floor(Math.random() * 3) + 2);
    const score = Math.floor(Math.random() * 100);
    const domScore = Math.random() > 0.3 ? Math.floor(Math.random() * 100) : null;
    const birth = randomBirth();
    const location = randomLocation();
    const pin = randomPinCode(existingPins);
    const { data, error } = await supabase.from('profiles').insert({
      nickname: nick, bio, photo_url: genAvatar(nick),
      personality_score: score, dom_sub_score: domScore, mbti,
      ...birth, location,
      interests: bio,
      pin_code: pin,
    }).select().single();
    if (error) { notify('생성 실패: ' + error.message, false); }
    else {
      notify(`프로필 생성: ${nick} (${mbti}, ${birth.birth_year}년생)`);
      if (!myUserId && data) { localStorage.setItem('matching_app_user_id', data.id); setMyUserId(data.id); }
    }
    await load();
    setLoading(null);
  };

  const createManyDummies = async (count: number) => {
    setLoading('dummies');
    const existingNicks = new Set(profiles.map(p => p.nickname));
    const existingPins = new Set(profiles.map(p => p.pin_code).filter(Boolean) as string[]);
    const entries = [];
    for (let i = 0; i < count; i++) {
      const nick = randomKoreanNickname(existingNicks);
      existingNicks.add(nick);
      const mbti = MBTI_LIST[Math.floor(Math.random() * MBTI_LIST.length)];
      const interestList = randomInterests(Math.floor(Math.random() * 3) + 2);
      const birth = randomBirth();
      const location = randomLocation();
      const pin = randomPinCode(existingPins);
      existingPins.add(pin);
      const domScore = Math.random() > 0.3 ? Math.floor(Math.random() * 100) : null;
      entries.push({
        nickname: nick,
        bio: interestList,
        photo_url: genAvatar(nick),
        personality_score: Math.floor(Math.random() * 100),
        dom_sub_score: domScore,
        mbti,
        ...birth,
        location,
        interests: interestList,
        pin_code: pin,
      });
    }
    if (entries.length === 0) { notify('생성 실패', false); setLoading(null); return; }
    const { error } = await supabase.from('profiles').upsert(entries, { onConflict: 'nickname', ignoreDuplicates: true });
    await load();
    if (error) notify('일부 생성 실패: ' + error.message, false);
    else notify(`더미 ${entries.length}명 생성 완료 (운세 기능 포함)`);
    setLoading(null);
  };

  const setMyUser = async (id: string) => {
    localStorage.setItem('matching_app_user_id', id);
    setMyUserId(id);
    notify('내 유저 변경됨');
  };

  const deleteProfile = async (id: string) => {
    setLoading(`del-${id}`);
    await supabase.from('seats').update({ profile_id: null, status: 'empty', registered_at: null }).eq('profile_id', id);
    await supabase.from('likes').delete().or(`liker_id.eq.${id},liked_id.eq.${id}`);
    await supabase.from('profiles').delete().eq('id', id);
    if (myUserId === id) { localStorage.removeItem('matching_app_user_id'); setMyUserId(null); }
    await load();
    notify('프로필 삭제됨');
    setLoading(null);
  };

  const deleteAllProfiles = async () => {
    if (!confirm('모든 프로필을 삭제하시겠습니까?')) return;
    setLoading('del-all');
    await supabase.from('likes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('seats').update({ profile_id: null, status: 'empty', registered_at: null }).neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    localStorage.removeItem('matching_app_user_id');
    setMyUserId(null);
    await load();
    notify('모든 프로필 삭제됨');
    setLoading(null);
  };

  // ── Seats ─────────────────────────────────────────────────────────────────
  const assignRandomSeat = async (profileId: string) => {
    setLoading(`seat-${profileId}`);
    const empty = seats.filter(s => s.status === 'empty');
    if (empty.length === 0) { notify('빈 자리 없음', false); setLoading(null); return; }
    const seat = empty[Math.floor(Math.random() * empty.length)];
    await supabase.from('seats').update({ profile_id: profileId, status: 'occupied', registered_at: new Date().toISOString() }).eq('id', seat.id);
    await load();
    notify(`자리 배정: ${seat.table_number}번 테이블 ${seat.seat_position}번`);
    setLoading(null);
  };

  const clearSeat = async (seatId: string) => {
    setLoading(`clear-${seatId}`);
    await supabase.from('seats').update({ profile_id: null, status: 'empty', registered_at: null }).eq('id', seatId);
    await load();
    notify('자리 비움');
    setLoading(null);
  };

  // ── Active tables ─────────────────────────────────────────────────────────
  const allTableNums = Array.from(new Set(seats.map(s => s.table_number))).sort((a, b) => a - b);

  const toggleActiveTable = (tableNum: number) => {
    const current = pendingActiveTables === undefined ? (activeTables ?? allTableNums) : (pendingActiveTables ?? allTableNums);
    const next = current.includes(tableNum) ? current.filter(t => t !== tableNum) : [...current, tableNum];
    setPendingActiveTables(next);
  };

  const setAllTables = (allActive: boolean) => {
    setPendingActiveTables(allActive ? null : []);
  };

  const confirmActiveTables = async () => {
    setLoading('active-tables');
    await supabase.from('app_settings').update({ active_tables: pendingActiveTables, updated_at: new Date().toISOString() }).eq('id', 1);
    setActiveTables(pendingActiveTables ?? null);
    setPendingActiveTables(undefined);
    notify('활성 테이블 저장됨');
    setLoading(null);
  };

  // ── Likes ─────────────────────────────────────────────────────────────────
  const createRandomLike = async () => {
    if (profiles.length < 2) { notify('프로필이 2명 이상 필요', false); return; }
    setLoading('like');
    const shuffled = [...profiles].sort(() => Math.random() - 0.5);
    const liker = shuffled[0]; const liked = shuffled[1];
    const { error } = await supabase.from('likes').insert({ liker_id: liker.id, liked_id: liked.id });
    if (error) notify('하트 중복', false);
    else { await load(); notify(`${liker.nickname} → ${liked.nickname} 하트`); }
    setLoading(null);
  };

  const deleteAllLikes = async () => {
    setLoading('del-likes');
    await supabase.from('likes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await load();
    notify('모든 하트 삭제됨');
    setLoading(null);
  };

  // ── Chats ─────────────────────────────────────────────────────────────────
  const createRandomChat = async () => {
    if (profiles.length < 2) { notify('프로필이 2명 이상 필요', false); return; }
    setLoading('chat');
    const shuffled = [...profiles].sort(() => Math.random() - 0.5);
    const u1 = shuffled[0]; const u2 = shuffled[1];
    const { error } = await supabase.from('chats').insert({ user1_id: u1.id, user2_id: u2.id });
    if (error) notify('채팅 생성 실패: ' + error.message, false);
    else { await load(); notify(`채팅: ${u1.nickname} ↔ ${u2.nickname}`); }
    setLoading(null);
  };

  const deleteAllChats = async () => {
    setLoading('del-chats');
    await supabase.from('chats').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await load();
    notify('모든 채팅 삭제됨');
    setLoading(null);
  };

  const currentActiveTables = pendingActiveTables === undefined ? (activeTables ?? allTableNums) : (pendingActiveTables ?? allTableNums);
  const hasActiveTableChanges = pendingActiveTables !== undefined;

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 pb-20 space-y-4" style={{ WebkitOverflowScrolling: 'touch' }}>
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-white">🧪 테스트 대시보드</h1>
          <p className="text-slate-400 text-xs mt-0.5">개발·테스트 전용</p>
        </div>
        <button onClick={load} className="p-2 rounded-xl bg-slate-700 text-slate-300 hover:bg-slate-600 transition-all active:scale-95">
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* 상태 */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: '프로필', value: profiles.length, icon: <Users className="w-4 h-4" />, color: 'teal' },
          { label: '착석', value: `${occupied}/${seats.length}`, icon: <LayoutGrid className="w-4 h-4" />, color: 'cyan' },
          { label: '하트', value: likes.length, icon: <Heart className="w-4 h-4" />, color: 'rose' },
          { label: '채팅', value: chats.length, icon: <MessageCircle className="w-4 h-4" />, color: 'violet' },
        ].map(s => (
          <div key={s.label} className="bg-slate-800 rounded-2xl p-4 border border-slate-700">
            <div className={`flex items-center gap-2 text-${s.color}-400 mb-1`}>{s.icon}<span className="text-xs font-bold">{s.label}</span></div>
            <p className="text-2xl font-black text-white">{s.value}</p>
          </div>
        ))}
      </div>

      {/* 세션 */}
      <Section title="세션 제어" icon={<Play className="w-4 h-4" />}>
        <div className="flex items-center gap-3">
          <Tag text={sessionActive ? '세션 활성' : '세션 비활성'} color={sessionActive ? 'teal' : 'rose'} />
          <Btn label={sessionActive ? '세션 종료' : '세션 시작'} onClick={toggleSession} color={sessionActive ? 'rose' : 'teal'} disabled={loading === 'session'} />
        </div>
      </Section>

      {/* 더미 프로필 */}
      <Section title="더미 프로필 생성" icon={<UserPlus className="w-4 h-4" />} defaultOpen={false}>
        <p className="text-xs text-slate-400">생년월일·지역·관심사·운세 기능 포함한 풀 프로필이 생성됩니다.</p>
        <Btn label="테스트 유저 1명 생성" onClick={createTestUser} color="teal" disabled={loading === 'profile'} />
        <div className="flex items-center gap-3">
          <input type="number" value={bulkCount} onChange={e => setBulkCount(Math.max(1, Math.min(50, Number(e.target.value))))}
            className="w-20 bg-slate-700 border border-slate-600 text-white rounded-xl px-3 py-2 text-sm text-center" min={1} max={50} />
          <Btn label={`더미 ${bulkCount}명 생성`} onClick={() => createManyDummies(bulkCount)} color="violet" disabled={loading === 'dummies'} />
        </div>
        <Btn label="모든 프로필 삭제" onClick={deleteAllProfiles} color="red" disabled={!!loading} />
      </Section>

      {/* 활성 테이블 */}
      <Section title="활성 테이블 설정" icon={<LayoutGrid className="w-4 h-4" />} defaultOpen={false}>
        {allTableNums.length === 0 ? (
          <p className="text-xs text-slate-400">테이블이 없습니다</p>
        ) : (
          <>
            <div className="flex gap-2">
              <Btn label="전체 활성" onClick={() => setAllTables(true)} color="teal" small />
              <Btn label="전체 비활성" onClick={() => setAllTables(false)} color="rose" small />
            </div>
            <div className="grid grid-cols-5 gap-2">
              {allTableNums.map(t => {
                const active = currentActiveTables.includes(t);
                return (
                  <button key={t} onClick={() => toggleActiveTable(t)}
                    className={`py-2 rounded-xl text-xs font-black border-2 transition-all ${active ? 'bg-teal-500/20 border-teal-500 text-teal-300' : 'bg-slate-700 border-slate-600 text-slate-400'}`}>
                    T{t}
                  </button>
                );
              })}
            </div>
            {hasActiveTableChanges && (
              <p className="text-amber-400 text-xs font-semibold">
                → 미저장: {pendingActiveTables === null ? '전체' : (pendingActiveTables?.join(', ') || '없음')}
              </p>
            )}
            <button onClick={confirmActiveTables} disabled={!hasActiveTableChanges || loading === 'active-tables'}
              className={`w-full py-2.5 rounded-xl text-sm font-black border-2 transition-all ${hasActiveTableChanges ? 'bg-teal-500/20 border-teal-500 text-teal-300 hover:bg-teal-500/30' : 'bg-slate-700 border-slate-600 text-slate-500 cursor-not-allowed'}`}>
              {hasActiveTableChanges ? '✓ 활성 테이블 저장' : '저장됨'}
            </button>
          </>
        )}
      </Section>

      {/* 프로필 목록 */}
      <Section title={`프로필 목록 (${profiles.length}명)`} icon={<Users className="w-4 h-4" />} defaultOpen={false}>
        <div className="flex gap-2 flex-wrap mb-2">
          <Btn label="내 유저 없음" onClick={() => { localStorage.removeItem('matching_app_user_id'); setMyUserId(null); notify('내 유저 해제됨'); }} color="slate" small />
        </div>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {profiles.map(p => {
            const seat = seats.find(s => s.profile_id === p.id);
            const isMe = p.id === myUserId;
            const hasBirthday = !!(p.birth_year && p.birth_month && p.birth_day);
            return (
              <div key={p.id} className={`flex items-center gap-3 p-3 rounded-xl border ${isMe ? 'border-cyan-500/50 bg-cyan-500/10' : 'border-slate-700 bg-slate-800/50'}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-white">{p.nickname}</p>
                    {isMe && <Tag text="나" color="teal" />}
                    {p.mbti && <Tag text={p.mbti} color="slate" />}
                    {hasBirthday ? <Tag text={`${p.birth_year?.toString().slice(2)}년생`} color="teal" /> : <Tag text="생일없음" color="rose" />}
                  </div>
                  <p className="text-slate-400 text-[10px] mt-0.5 truncate">
                    {p.location ?? '지역없음'} · {p.bio ?? '관심사없음'}
                  </p>
                  {seat && <Tag text={`${seat.table_number}번 테이블`} color="amber" />}
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  {!isMe && <Btn label="나로" onClick={() => setMyUser(p.id)} color="cyan" small />}
                  {!seat && <Btn label="자리" onClick={() => assignRandomSeat(p.id)} color="amber" small disabled={!!loading} />}
                  {seat && <Btn label="비움" onClick={() => clearSeat(seat.id)} color="slate" small disabled={!!loading} />}
                  <button onClick={() => deleteProfile(p.id)} disabled={loading === `del-${p.id}`}
                    className="p-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all border border-red-500/30">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
          {profiles.length === 0 && <p className="text-slate-400 text-sm text-center py-4">프로필이 없습니다</p>}
        </div>
      </Section>

      {/* 하트 */}
      <Section title={`하트 (${likes.length}개)`} icon={<Heart className="w-4 h-4" />} defaultOpen={false}>
        <div className="flex gap-2">
          <Btn label="랜덤 하트 생성" onClick={createRandomLike} color="rose" disabled={loading === 'like'} />
          <Btn label="전체 삭제" onClick={deleteAllLikes} color="red" disabled={!!loading} />
        </div>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {likes.slice(0, 30).map(l => {
            const liker = profiles.find(p => p.id === l.liker_id);
            const liked = profiles.find(p => p.id === l.liked_id);
            return (
              <div key={l.id} className="flex items-center gap-2 text-xs text-slate-300 bg-slate-800 rounded-lg px-3 py-1.5">
                <span className="font-bold">{liker?.nickname ?? '?'}</span>
                <Heart className="w-3 h-3 fill-rose-500 text-rose-500" />
                <span className="font-bold">{liked?.nickname ?? '?'}</span>
              </div>
            );
          })}
        </div>
      </Section>

      {/* 채팅 */}
      <Section title={`채팅 (${chats.length}개)`} icon={<MessageCircle className="w-4 h-4" />} defaultOpen={false}>
        <div className="flex gap-2">
          <Btn label="랜덤 채팅 생성" onClick={createRandomChat} color="cyan" disabled={loading === 'chat'} />
          <Btn label="전체 삭제" onClick={deleteAllChats} color="red" disabled={!!loading} />
        </div>
      </Section>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-5 py-3 rounded-2xl shadow-2xl text-sm font-bold text-white transition-all ${toast.ok ? 'bg-teal-600' : 'bg-red-600'}`}>
          {toast.ok ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {toast.msg}
          <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      )}
    </div>
  );
}
