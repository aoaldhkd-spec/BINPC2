import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import type { Database } from './types/database';
import {
  Users, Heart, MessageCircle, LayoutGrid, Gamepad2, Send,
  Trash2, RefreshCw, Play, Square, QrCode, UserPlus, X, CheckCircle,
  AlertTriangle, ChevronDown, ChevronRight,
} from 'lucide-react';
import { genAvatar } from './lib/profile';
import { MBTI_LIST, BIO_LIST, LETTERS } from './lib/constants';

type Profile = Database['public']['Tables']['profiles']['Row'];
type Seat = Database['public']['Tables']['seats']['Row'];
type Like = Database['public']['Tables']['likes']['Row'];
type Chat = Database['public']['Tables']['chats']['Row'];

// ─── Section wrapper ──────────────────────────────────────────────────────────
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
    <button
      onClick={onClick}
      disabled={disabled}
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

// ─── Main TestDashboard ───────────────────────────────────────────────────────
export default function TestDashboard() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [likes, setLikes] = useState<Like[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [sessionActive, setSessionActive] = useState<boolean | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(() => localStorage.getItem('matching_app_user_id'));

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
      supabase.from('app_settings').select('session_active').eq('id', 1).single(),
    ]);
    if (p.data) setProfiles(p.data);
    if (s.data) setSeats(s.data);
    if (l.data) setLikes(l.data);
    if (c.data) setChats(c.data);
    if (settings.data) setSessionActive(settings.data.session_active);
  };

  useEffect(() => { load(); }, []);

  const myProfile = profiles.find(p => p.id === myUserId);
  const occupied = seats.filter(s => s.status === 'occupied').length;
  const mySeat = seats.find(s => s.profile_id === myUserId);

  // ── Session ────────────────────────────────────────────────────────────────
  const toggleSession = async () => {
    const next = !sessionActive;
    setLoading('session');
    await supabase.from('app_settings').update({ session_active: next, updated_at: new Date().toISOString() }).eq('id', 1);
    setSessionActive(next);
    notify(next ? '세션 시작됨' : '세션 종료됨', next);
    setLoading(null);
  };

  // ── Profiles ───────────────────────────────────────────────────────────────
  const createTestUser = async (letter = 'T', num = Math.floor(Math.random() * 9) + 1) => {
    setLoading('profile');
    const nick = `${letter}${num}`;
    const mbti = MBTI_LIST[Math.floor(Math.random() * MBTI_LIST.length)];
    const bio = BIO_LIST[Math.floor(Math.random() * BIO_LIST.length)];
    const score = Math.floor(Math.random() * 100);
    const { data, error } = await supabase.from('profiles').insert({
      nickname: nick, bio, photo_url: genAvatar(nick),
      personality_score: score, dom_sub_score: null, mbti,
    }).select().single();
    if (error) { notify('닉네임 중복 - 다시 시도', false); }
    else {
      notify(`프로필 생성: ${nick} (${mbti})`);
      if (!myUserId && data) { localStorage.setItem('matching_app_user_id', data.id); setMyUserId(data.id); }
    }
    await load();
    setLoading(null);
  };

  const createManyDummies = async () => {
    setLoading('dummies');
    const entries = LETTERS.flatMap(l =>
      [1,2,3,4,5,6,7,8,9,0].map(n => ({
        nickname: `${l}${n}`,
        bio: BIO_LIST[Math.floor(Math.random() * BIO_LIST.length)],
        photo_url: genAvatar(`${l}${n}`),
        personality_score: Math.floor(Math.random() * 100),
        dom_sub_score: null,
        mbti: MBTI_LIST[Math.floor(Math.random() * MBTI_LIST.length)],
      }))
    ).slice(0, 20);
    await supabase.from('profiles').upsert(entries, { onConflict: 'nickname', ignoreDuplicates: true });
    await load();
    notify(`더미 ${entries.length}개 생성 완료`);
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
    if (!confirm('모든 프로필과 자리를 초기화할까요?')) return;
    setLoading('deleteAll');
    await supabase.from('seats').update({ profile_id: null, status: 'empty', registered_at: null }).neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('likes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('chats').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    localStorage.removeItem('matching_app_user_id');
    setMyUserId(null);
    await load();
    notify('전체 초기화 완료');
    setLoading(null);
  };

  // ── Seats ──────────────────────────────────────────────────────────────────
  const assignSeat = async (profileId: string, seatId: string) => {
    setLoading(`seat-${seatId}`);
    const prevSeat = seats.find(s => s.profile_id === profileId);
    if (prevSeat) await supabase.from('seats').update({ profile_id: null, status: 'empty', registered_at: null }).eq('id', prevSeat.id);
    await supabase.from('seats').update({ profile_id: profileId, status: 'occupied', registered_at: new Date().toISOString() }).eq('id', seatId);
    await load();
    setLoading(null);
    notify('자리 배정됨');
  };

  const clearSeat = async (seatId: string) => {
    await supabase.from('seats').update({ profile_id: null, status: 'empty', registered_at: null }).eq('id', seatId);
    await load();
    notify('자리 비움');
  };

  const randomlyFillSeats = async () => {
    setLoading('fillSeats');
    const unassigned = profiles.filter(p => !seats.find(s => s.profile_id === p.id));
    const emptySeats = seats.filter(s => s.status === 'empty');
    const shuffled = [...emptySeats].sort(() => Math.random() - 0.5);
    for (let i = 0; i < Math.min(unassigned.length, shuffled.length); i++) {
      await supabase.from('seats').update({ profile_id: unassigned[i].id, status: 'occupied', registered_at: new Date().toISOString() }).eq('id', shuffled[i].id);
    }
    await load();
    notify(`${Math.min(unassigned.length, shuffled.length)}명 자리 배정 완료`);
    setLoading(null);
  };

  const clearAllSeats = async () => {
    setLoading('clearSeats');
    await supabase.from('seats').update({ profile_id: null, status: 'empty', registered_at: null }).neq('id', '00000000-0000-0000-0000-000000000000');
    await load();
    notify('모든 자리 비움');
    setLoading(null);
  };

  // ── Hearts ─────────────────────────────────────────────────────────────────
  const sendHeart = async (fromId: string, toId: string) => {
    if (fromId === toId) return;
    setLoading('heart');
    const existing = await supabase.from('likes').select('id').eq('liker_id', fromId).eq('liked_id', toId).maybeSingle();
    if (existing.data) { notify('이미 하트를 보냈습니다', false); setLoading(null); return; }
    await supabase.from('likes').insert({ liker_id: fromId, liked_id: toId, status: 'pending' });
    await load();
    notify('하트 전송됨');
    setLoading(null);
  };

  const acceptHeart = async (likeId: string) => {
    await supabase.from('likes').update({ status: 'accepted' }).eq('id', likeId);
    await load();
    notify('하트 수락됨');
  };

  const deleteHeart = async (likeId: string) => {
    await supabase.from('likes').delete().eq('id', likeId);
    await load();
    notify('하트 삭제됨');
  };

  const clearAllHearts = async () => {
    setLoading('clearHearts');
    await supabase.from('likes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await load();
    notify('모든 하트 삭제됨');
    setLoading(null);
  };

  // ── Chat ───────────────────────────────────────────────────────────────────
  const createChat = async (user1: string, user2: string) => {
    if (user1 === user2) return;
    setLoading('chat');
    const existing = await supabase.from('chats').select('id')
      .or(`and(user1_id.eq.${user1},user2_id.eq.${user2}),and(user1_id.eq.${user2},user2_id.eq.${user1})`)
      .maybeSingle();
    if (existing.data) { notify('채팅방이 이미 있습니다', false); setLoading(null); return; }
    const { data } = await supabase.from('chats').insert({ user1_id: user1, user2_id: user2 }).select().single();
    if (data) {
      await supabase.from('messages').insert({ chat_id: data.id, sender_id: user2, content: '안녕하세요! 테스트 메시지입니다.' });
      await supabase.from('messages').insert({ chat_id: data.id, sender_id: user1, content: '반갑습니다~' });
    }
    await load();
    notify('채팅방 + 메시지 2개 생성됨');
    setLoading(null);
  };

  const deleteChat = async (chatId: string) => {
    await supabase.from('messages').delete().eq('chat_id', chatId);
    await supabase.from('chats').delete().eq('id', chatId);
    await load();
    notify('채팅 삭제됨');
  };

  // ── Game ───────────────────────────────────────────────────────────────────
  const createBalanceGame = async () => {
    if (!myUserId) { notify('먼저 내 유저를 설정하세요', false); return; }
    setLoading('game');
    const questions = [
      { q: '솔직히 나는 어느 쪽?', a: '아이스 아메리카노', b: '따뜻한 라떼' },
      { q: '주말 이상형은?', a: '집콕 휴식', b: '밖에서 놀기' },
      { q: '연애 스타일은?', a: '먼저 고백하는 편', b: '기다리는 편' },
      { q: '음식 취향', a: '한식', b: '양식' },
    ];
    const pick = questions[Math.floor(Math.random() * questions.length)];
    const p = profiles.find(x => x.id === myUserId);
    await supabase.from('balance_games').insert({
      creator_id: myUserId,
      creator_nickname: p?.nickname ?? '테스터',
      question: pick.q,
      option_a: pick.a,
      option_b: pick.b,
      scope: 'global',
      table_number: null,
    });
    await supabase.from('app_settings').update({ game_state: { active: true, question: pick.q, option_a: pick.a, option_b: pick.b, scope: 'global', table_number: null } as unknown as import('./types/database').Json, updated_at: new Date().toISOString() }).eq('id', 1);
    notify(`밸런스 게임 생성: "${pick.q}"`);
    setLoading(null);
  };

  const endGame = async () => {
    await supabase.from('app_settings').update({ game_state: null, updated_at: new Date().toISOString() }).eq('id', 1);
    notify('게임 종료됨');
  };

  // ── QR ─────────────────────────────────────────────────────────────────────
  const makeQrUrl = (seatId: string) => `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(`${window.location.origin.replace('/test', '')}/?seat=${seatId}`)}&size=120x120&margin=6`;

  // ── Select helpers ─────────────────────────────────────────────────────────
  const [fromUser, setFromUser] = useState('');
  const [toUser, setToUser] = useState('');
  const [chatU1, setChatU1] = useState('');
  const [chatU2, setChatU2] = useState('');
  const [seatProfile, setSeatProfile] = useState('');
  const [seatTarget, setSeatTarget] = useState('');

  const profileSel = (val: string, set: (v: string) => void) => (
    <select value={val} onChange={e => set(e.target.value)} className="flex-1 bg-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1.5 border border-slate-600 min-w-0">
      <option value="">-- 유저 선택 --</option>
      {profiles.map(p => <option key={p.id} value={p.id}>{p.nickname} {p.id === myUserId ? '(나)' : ''}</option>)}
    </select>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-amber-900" />
            </div>
            <div>
              <h1 className="font-black text-white text-base">테스트 대시보드</h1>
              <p className="text-[10px] text-slate-400">모든 기능을 여기서 테스트하세요</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 transition-all">
              <RefreshCw className="w-4 h-4 text-slate-300" />
            </button>
            <a href="/" className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-lg transition-all">
              앱으로
            </a>
            <a href="/admin" className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold rounded-lg transition-all">
              관리자
            </a>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl shadow-2xl text-sm font-bold flex items-center gap-2 transition-all ${toast.ok ? 'bg-teal-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.ok ? <CheckCircle className="w-4 h-4" /> : <X className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      <div className="max-w-2xl mx-auto p-4 space-y-4 pb-16">
        {/* Status bar */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: '프로필', val: profiles.length, color: 'text-cyan-400' },
            { label: '착석', val: `${occupied}/${seats.length}`, color: 'text-teal-400' },
            { label: '하트', val: likes.length, color: 'text-rose-400' },
            { label: '채팅', val: chats.length, color: 'text-violet-400' },
          ].map(s => (
            <div key={s.label} className="bg-slate-800/60 rounded-xl p-3 text-center border border-slate-700/50">
              <div className={`text-xl font-black ${s.color}`}>{s.val}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* 내 계정 */}
        <Section title="내 테스트 계정" icon={<Users className="w-4 h-4" />}>
          <div className="flex items-center gap-3 p-3 bg-slate-700/40 rounded-xl border border-slate-600/50">
            {myProfile ? (
              <>
                <img src={myProfile.photo_url} className="w-10 h-10 rounded-full" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white text-sm">{myProfile.nickname}</p>
                  <p className="text-xs text-slate-400">{myProfile.mbti} · {myProfile.bio} · {mySeat ? `${mySeat.seat_label}` : '자리 없음'}</p>
                </div>
                <Btn label="초기화" onClick={() => { localStorage.removeItem('matching_app_user_id'); setMyUserId(null); notify('계정 초기화됨'); }} color="red" small />
              </>
            ) : (
              <p className="text-slate-400 text-sm">선택된 계정 없음 — 아래에서 생성하거나 선택하세요</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {LETTERS.slice(0, 5).map(l => (
              <Btn key={l} label={`테스터 ${l}1 생성`} onClick={() => createTestUser(l, 1)} color="teal" disabled={loading === 'profile'} />
            ))}
            <Btn label="랜덤 테스터 생성" onClick={() => createTestUser(LETTERS[Math.floor(Math.random() * LETTERS.length)], Math.floor(Math.random() * 9) + 1)} color="amber" disabled={loading === 'profile'} />
          </div>
          {profiles.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 mb-1">기존 프로필을 내 계정으로 선택:</p>
              <select onChange={e => setMyUser(e.target.value)} value={myUserId ?? ''} className="w-full bg-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2 border border-slate-600">
                <option value="">-- 선택 --</option>
                {profiles.map(p => <option key={p.id} value={p.id}>{p.nickname} ({p.mbti})</option>)}
              </select>
            </div>
          )}
        </Section>

        {/* 세션 제어 */}
        <Section title="세션 제어" icon={<Play className="w-4 h-4" />}>
          <div className="flex items-center gap-3 p-3 bg-slate-700/40 rounded-xl border border-slate-600/50">
            <div className={`w-3 h-3 rounded-full ${sessionActive ? 'bg-teal-400 animate-pulse' : 'bg-amber-400 animate-pulse'}`} />
            <span className="font-bold text-sm flex-1">세션 상태: {sessionActive === null ? '확인 중...' : sessionActive ? '진행 중 (Active)' : '대기 중 (Waiting)'}</span>
            <Btn
              label={sessionActive ? '세션 종료' : '세션 시작'}
              onClick={toggleSession}
              color={sessionActive ? 'red' : 'green'}
              disabled={loading === 'session'}
            />
          </div>
          <p className="text-xs text-slate-500">세션을 시작해야 유저가 대기 화면에서 "입장하기" 버튼을 볼 수 있습니다.</p>
          <div className="flex gap-2">
            <a href="/" className="flex-1 text-center text-xs py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold rounded-xl border border-slate-600 transition-all">
              유저 화면 열기 →
            </a>
            <a href="/admin" className="flex-1 text-center text-xs py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold rounded-xl border border-slate-600 transition-all">
              관리자 화면 열기 →
            </a>
          </div>
        </Section>

        {/* 더미 프로필 */}
        <Section title="더미 프로필 대량 생성" icon={<UserPlus className="w-4 h-4" />} defaultOpen={false}>
          <p className="text-xs text-slate-400">하트/채팅/게임 기능 테스트에 필요한 다른 유저들을 생성합니다.</p>
          <div className="grid grid-cols-2 gap-2">
            <Btn label="더미 5명 생성" onClick={() => Promise.all([0,1,2,3,4].map(i => createTestUser(LETTERS[i], Math.floor(Math.random()*9)+1)))} color="cyan" disabled={!!loading} />
            <Btn label="더미 20명 생성 (A0~J9)" onClick={createManyDummies} color="violet" disabled={loading === 'dummies'} />
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1.5 mt-1">
            {profiles.map(p => (
              <div key={p.id} className="flex items-center gap-2 px-3 py-1.5 bg-slate-700/40 rounded-lg">
                <img src={p.photo_url} className="w-7 h-7 rounded-full flex-shrink-0" />
                <span className="text-xs font-semibold text-slate-200 flex-1">{p.nickname}</span>
                <Tag text={p.mbti ?? '?'} color="slate" />
                {p.id === myUserId && <Tag text="나" color="teal" />}
                <button onClick={() => setMyUser(p.id)} className="text-[10px] px-2 py-0.5 bg-teal-500/20 hover:bg-teal-500/40 text-teal-300 rounded-full border border-teal-500/30 transition-all">내꺼로</button>
                <button onClick={() => deleteProfile(p.id)} disabled={loading === `del-${p.id}`} className="text-[10px] px-2 py-0.5 bg-red-500/20 hover:bg-red-500/40 text-red-300 rounded-full border border-red-500/30 transition-all">삭제</button>
              </div>
            ))}
          </div>
          <Btn label="모든 프로필 + 데이터 초기화" onClick={deleteAllProfiles} color="red" disabled={loading === 'deleteAll'} />
        </Section>

        {/* 자리 배치 */}
        <Section title="자리 배치" icon={<LayoutGrid className="w-4 h-4" />}>
          <div className="grid grid-cols-2 gap-2">
            <Btn label="전체 랜덤 배치" onClick={randomlyFillSeats} color="teal" disabled={loading === 'fillSeats'} />
            <Btn label="모든 자리 비우기" onClick={clearAllSeats} color="red" disabled={loading === 'clearSeats'} />
          </div>
          <div className="flex gap-2 items-center">
            {profileSel(seatProfile, setSeatProfile)}
            <select value={seatTarget} onChange={e => setSeatTarget(e.target.value)} className="flex-1 bg-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1.5 border border-slate-600 min-w-0">
              <option value="">-- 자리 선택 --</option>
              {seats.filter(s => s.status === 'empty').map(s => <option key={s.id} value={s.id}>{s.seat_label}</option>)}
            </select>
            <Btn label="배정" onClick={() => { if (seatProfile && seatTarget) assignSeat(seatProfile, seatTarget); }} color="violet" small disabled={!seatProfile || !seatTarget} />
          </div>
          {/* Occupied seats */}
          <div className="max-h-40 overflow-y-auto space-y-1">
            {seats.filter(s => s.status === 'occupied').map(s => {
              const p = profiles.find(x => x.id === s.profile_id);
              return (
                <div key={s.id} className="flex items-center gap-2 px-3 py-1.5 bg-teal-500/10 border border-teal-500/20 rounded-lg">
                  {p && <img src={p.photo_url} className="w-6 h-6 rounded-full flex-shrink-0" />}
                  <span className="text-xs text-teal-300 flex-1">{s.seat_label}</span>
                  <span className="text-xs text-slate-400">{p?.nickname ?? '?'}</span>
                  <button onClick={() => clearSeat(s.id)} className="text-[10px] px-2 py-0.5 bg-red-500/20 hover:bg-red-500/40 text-red-300 rounded-full border border-red-500/30">비움</button>
                </div>
              );
            })}
            {seats.filter(s => s.status === 'occupied').length === 0 && (
              <p className="text-xs text-slate-500 text-center py-2">착석된 자리 없음</p>
            )}
          </div>
        </Section>

        {/* 하트 테스트 */}
        <Section title="하트 (좋아요) 테스트" icon={<Heart className="w-4 h-4" />}>
          <div className="flex gap-2 items-center flex-wrap">
            {profileSel(fromUser, setFromUser)}
            <span className="text-rose-400 text-sm font-bold flex-shrink-0">→ 하트 →</span>
            {profileSel(toUser, setToUser)}
            <Btn label="전송" onClick={() => { if (fromUser && toUser) sendHeart(fromUser, toUser); }} color="rose" small disabled={!fromUser || !toUser || loading === 'heart'} />
          </div>
          {myUserId && profiles.length > 1 && (
            <div className="grid grid-cols-2 gap-2">
              <Btn
                label="랜덤 유저 → 나 하트"
                onClick={() => {
                  const others = profiles.filter(p => p.id !== myUserId);
                  if (others.length) sendHeart(others[Math.floor(Math.random() * others.length)].id, myUserId);
                }}
                color="pink"
                disabled={loading === 'heart'}
              />
              <Btn
                label="나 → 랜덤 유저 하트"
                onClick={() => {
                  const others = profiles.filter(p => p.id !== myUserId);
                  if (others.length) sendHeart(myUserId, others[Math.floor(Math.random() * others.length)].id);
                }}
                color="rose"
                disabled={loading === 'heart'}
              />
            </div>
          )}
          <div className="max-h-48 overflow-y-auto space-y-1">
            {likes.slice(0, 15).map(l => {
              const from = profiles.find(p => p.id === l.liker_id);
              const to = profiles.find(p => p.id === l.liked_id);
              return (
                <div key={l.id} className="flex items-center gap-2 px-3 py-1.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs">
                  <span className="font-semibold text-rose-300 flex-1">{from?.nickname ?? '?'} → {to?.nickname ?? '?'}</span>
                  <Tag text={l.status ?? 'pending'} color={l.status === 'accepted' ? 'teal' : l.status === 'rejected' ? 'red' : 'amber'} />
                  {l.status === 'pending' && <button onClick={() => acceptHeart(l.id)} className="text-[10px] px-2 py-0.5 bg-teal-500/20 hover:bg-teal-500/40 text-teal-300 rounded-full border border-teal-500/30">수락</button>}
                  <button onClick={() => deleteHeart(l.id)} className="text-[10px] px-2 py-0.5 bg-red-500/20 hover:bg-red-500/40 text-red-300 rounded-full border border-red-500/30">삭제</button>
                </div>
              );
            })}
            {likes.length === 0 && <p className="text-xs text-slate-500 text-center py-2">하트 없음</p>}
          </div>
          <Btn label="모든 하트 삭제" onClick={clearAllHearts} color="red" disabled={loading === 'clearHearts'} />
        </Section>

        {/* 채팅 테스트 */}
        <Section title="채팅 테스트" icon={<MessageCircle className="w-4 h-4" />}>
          <div className="flex gap-2 items-center flex-wrap">
            {profileSel(chatU1, setChatU1)}
            <span className="text-violet-400 text-sm font-bold flex-shrink-0">↔</span>
            {profileSel(chatU2, setChatU2)}
            <Btn label="채팅 생성" onClick={() => { if (chatU1 && chatU2) createChat(chatU1, chatU2); }} color="violet" small disabled={!chatU1 || !chatU2 || loading === 'chat'} />
          </div>
          {myUserId && profiles.length > 1 && (
            <Btn
              label="나 ↔ 랜덤 유저 채팅 생성"
              onClick={() => {
                const others = profiles.filter(p => p.id !== myUserId);
                if (others.length) createChat(myUserId, others[Math.floor(Math.random() * others.length)].id);
              }}
              color="violet"
              disabled={loading === 'chat'}
            />
          )}
          <div className="max-h-36 overflow-y-auto space-y-1">
            {chats.map(c => {
              const u1 = profiles.find(p => p.id === c.user1_id);
              const u2 = profiles.find(p => p.id === c.user2_id);
              return (
                <div key={c.id} className="flex items-center gap-2 px-3 py-1.5 bg-violet-500/10 border border-violet-500/20 rounded-lg text-xs">
                  <span className="flex-1 text-violet-300 font-semibold">{u1?.nickname ?? '?'} ↔ {u2?.nickname ?? '?'}</span>
                  <button onClick={() => deleteChat(c.id)} className="text-[10px] px-2 py-0.5 bg-red-500/20 hover:bg-red-500/40 text-red-300 rounded-full border border-red-500/30">삭제</button>
                </div>
              );
            })}
            {chats.length === 0 && <p className="text-xs text-slate-500 text-center py-2">채팅 없음</p>}
          </div>
        </Section>

        {/* 밸런스 게임 */}
        <Section title="밸런스 게임" icon={<Gamepad2 className="w-4 h-4" />}>
          <p className="text-xs text-slate-400">게임을 생성하면 모든 유저 화면에 공지가 뜹니다.</p>
          <div className="grid grid-cols-2 gap-2">
            <Btn label="게임 생성 (랜덤 질문)" onClick={createBalanceGame} color="amber" disabled={loading === 'game' || !myUserId} />
            <Btn label="게임 종료" onClick={endGame} color="red" />
          </div>
          {!myUserId && <p className="text-xs text-red-400">내 계정을 먼저 설정하세요</p>}
        </Section>

        {/* QR 코드 */}
        <Section title="QR 코드 미리보기" icon={<QrCode className="w-4 h-4" />} defaultOpen={false}>
          <p className="text-xs text-slate-400">자리 QR을 스캔하면 해당 자리에 자동 등록됩니다.</p>
          <div className="grid grid-cols-4 gap-2 max-h-64 overflow-y-auto">
            {seats.filter(s => s.status === 'empty').slice(0, 16).map(s => (
              <div key={s.id} className="flex flex-col items-center gap-1 p-1.5 bg-slate-700/40 rounded-xl border border-slate-600/50">
                <img src={makeQrUrl(s.id)} className="w-14 h-14 rounded-lg" />
                <span className="text-[9px] font-bold text-slate-400 text-center">{s.seat_label.split(' ').slice(1).join(' ')}</span>
              </div>
            ))}
          </div>
          <a href="/admin#qr" className="text-xs text-teal-400 hover:text-teal-300 underline">관리자 QR 탭에서 전체 보기 →</a>
        </Section>

        {/* 건의사항 테스트 */}
        <Section title="건의사항 테스트" icon={<Send className="w-4 h-4" />} defaultOpen={false}>
          <p className="text-xs text-slate-400">유저 화면 "건의함" 탭에서 제출한 내용이 관리자에 표시됩니다.</p>
          <Btn
            label="테스트 건의 전송"
            onClick={async () => {
              if (!myUserId) { notify('먼저 내 계정을 설정하세요', false); return; }
              const p = profiles.find(x => x.id === myUserId);
              await supabase.from('suggestions').insert({ profile_id: myUserId, nickname: p?.nickname ?? null, content: '테스트 건의사항입니다. 기능이 잘 작동하는지 확인 중입니다.', contact_info: null });
              notify('건의사항 전송됨');
            }}
            color="cyan"
            disabled={!myUserId}
          />
        </Section>

        {/* 전체 초기화 */}
        <Section title="전체 초기화" icon={<Trash2 className="w-4 h-4" />} defaultOpen={false}>
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
            <p className="text-xs text-red-300 mb-3">모든 테스트 데이터를 삭제합니다. 실제 운영 중에는 사용하지 마세요.</p>
            <Btn label="모든 데이터 초기화" onClick={deleteAllProfiles} color="red" disabled={loading === 'deleteAll'} />
          </div>
        </Section>
      </div>
    </div>
  );
}
