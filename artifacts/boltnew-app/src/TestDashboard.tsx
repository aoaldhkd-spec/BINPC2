import { useState, useEffect } from 'react';
import { supabase, getDeviceSecret, setDeviceRecoveryPin } from './lib/supabase';
import type { Database } from './types/database';
import {
  Users, Heart, MessageCircle,
  RefreshCw, Play, UserPlus, X, CheckCircle,
  AlertTriangle, ChevronDown, ChevronRight,
} from 'lucide-react';
import { genAvatar } from './lib/profile';
import { buildDummyProfileInsert } from './lib/dummy-persona';

type Profile = Database['public']['Tables']['profiles']['Row'];
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

// ─── api-server 동기화 헬퍼 ──────────────────────────────────────────────────
const API_BASE = '/api/db';
const TEST_PASSWORD_KEY = 'test_pw_v1';

async function testApiRpc(rpcName: string, payload: Record<string, unknown>): Promise<void> {
  const testPw = localStorage.getItem(TEST_PASSWORD_KEY) ?? '';
  const res = await fetch(`${API_BASE}/rpc/${rpcName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_test_password: testPw, ...payload }),
  });
  if (!res.ok) throw new Error(`api-server RPC 오류: HTTP ${res.status}`);
  const json = (await res.json()) as { data: unknown; error: { message: string } | null };
  if (json.error) throw new Error(json.error.message);
}

/** 더미/프로필 생성·삭제 후 api-server 인메모리를 DB에서 강제 리싱크 */
async function testResync(): Promise<void> {
  return testApiRpc('test_resync', {}).catch(e => console.warn('[test] api-server resync 실패:', e));
}

// ─── Main TestDashboard ───────────────────────────────────────────────────────
export default function TestDashboard() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [likes, setLikes] = useState<Like[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [sessionActive, setSessionActive] = useState<boolean | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(() => localStorage.getItem('matching_app_user_id'));
  const [bulkCount, setBulkCount] = useState(20);

  const notify = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2800);
  };

  const load = async () => {
    const [p, l, c, settings] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('likes').select('*').order('created_at', { ascending: false }),
      supabase.from('chats').select('*').order('created_at', { ascending: false }),
      supabase.from('app_settings').select('session_active').eq('id', 1).single(),
    ]);
    if (p.data) setProfiles(p.data);
    if (l.data) setLikes(l.data);
    if (c.data) setChats(c.data);
    if (settings.data) {
      setSessionActive(settings.data.session_active);
    }
  };

  useEffect(() => { load().catch(e => console.error('[TestDashboard] load 실패:', e)); }, []);

  const myProfile = profiles.find(p => p.id === myUserId);

  // ── Session ────────────────────────────────────────────────────────────────
  const _toggleSession = async () => {
    const next = !sessionActive;
    setLoading('session');
    const { error } = await supabase.from('app_settings').update({ session_active: next, updated_at: new Date().toISOString() }).eq('id', 1);
    if (error) { notify(`세션 변경 실패: ${error.message}`, false); setLoading(null); return; }
    setSessionActive(next);
    // api-server 동기화 → SSE로 모든 유저에게 즉시 반영
    testApiRpc('test_update_settings', { p_payload: { session_active: next } })
      .catch(e => console.warn('[test] api-server 세션 동기화 실패:', e));
    notify(next ? '세션 시작됨' : '세션 종료됨', next);
    setLoading(null);
  };

  // ── Profiles ───────────────────────────────────────────────────────────────
  const createTestUser = async () => {
    setLoading('profile');
    const id = crypto.randomUUID();
    const existing = new Set(profiles.map((p) => p.nickname));
    const row = buildDummyProfileInsert({
      id,
      deviceSecret: getDeviceSecret(id),
      existingNicknames: existing,
    });
    row.photo_url = genAvatar(row.nickname);
    const { data, error } = await supabase.from('profiles').insert(row).select().single();
    if (error) { notify('닉네임 중복 - 다시 시도', false); }
    else {
      notify(`프로필 생성: ${row.nickname} (${row.mbti})`);
      if (!myUserId && data) { localStorage.setItem('matching_app_user_id', data.id); setMyUserId(data.id); }
      testResync();
    }
    await load();
    setLoading(null);
  };

  const createManyDummies = async (count: number) => {
    setLoading('dummies');
    const existing = new Set(profiles.map((p) => p.nickname));
    const entries = Array.from({ length: count }, (_, i) => {
      const id = crypto.randomUUID();
      const row = buildDummyProfileInsert({
        id,
        deviceSecret: getDeviceSecret(id),
        index: i,
        existingNicknames: existing,
      });
      existing.add(row.nickname);
      row.photo_url = genAvatar(row.nickname);
      return row;
    });
    const { error: insertErr } = await supabase.from('profiles').insert(entries);
    if (insertErr) { notify(`더미 생성 실패: ${insertErr.message}`, false); setLoading(null); return; }
    // api-server 인메모리 동기화 → 메인 앱에 즉시 반영
    await testResync();
    await load();
    notify(`더미 ${entries.length}명 생성 완료`);
    setLoading(null);
  };

  const setMyUser = async (id: string) => {
    localStorage.setItem('matching_app_user_id', id);
    setMyUserId(id);
    notify('내 유저 변경됨');
  };

  const enterAsUser = async (id: string) => {
    setLoading('enter');
    let p = profiles.find(x => x.id === id) ?? null;
    if (p && !String(p.pin_code ?? '').trim()) {
      const { data } = await supabase
        .from('profiles')
        .update({ pin_code: String(1000 + Math.floor(Math.random() * 9000)) })
        .eq('id', id)
        .select()
        .single();
      if (data) p = data as Profile;
    }
    localStorage.setItem('matching_app_user_id', id);
    setMyUserId(id);
    const pin = String(p?.pin_code ?? '').trim();
    if (pin) setDeviceRecoveryPin(pin);
    notify(`${p?.nickname ?? '더미'}로 입장합니다`);
    window.location.href = '/';
  };

  const deleteProfile = async (id: string) => {
    setLoading(`del-${id}`);
    await supabase.from('likes').delete().or(`liker_id.eq.${id},liked_id.eq.${id}`);
    await supabase.from('profiles').delete().eq('id', id);
    if (myUserId === id) { localStorage.removeItem('matching_app_user_id'); setMyUserId(null); }
    testResync();
    await load();
    notify('프로필 삭제됨');
    setLoading(null);
  };

  const deleteAllProfiles = async () => {
    if (!confirm('모든 프로필을 초기화할까요?')) return;
    setLoading('deleteAll');
    await supabase.from('likes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('chats').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    localStorage.removeItem('matching_app_user_id');
    setMyUserId(null);
    await testResync(); // 즉시 api-server 인메모리 초기화 → 메인 앱에 즉시 반영
    await load();
    notify('전체 초기화 완료');
    setLoading(null);
  };

  // ── Hearts ─────────────────────────────────────────────────────────────────
  const sendHeart = async (fromId: string, toId: string) => {
    if (fromId === toId) return;
    setLoading('heart');
    const existing = await supabase.from('likes').select('id').eq('liker_id', fromId).eq('liked_id', toId).maybeSingle();
    if (existing.data) { notify('이미 하트를 보냈습니다', false); setLoading(null); return; }
    await supabase.from('likes').insert({ liker_id: fromId, liked_id: toId, status: 'pending' });
    testResync();
    await load();
    notify('하트 전송됨');
    setLoading(null);
  };

  const acceptHeart = async (likeId: string) => {
    await supabase.from('likes').update({ status: 'accepted' }).eq('id', likeId);
    testResync();
    await load();
    notify('하트 수락됨');
  };

  const deleteHeart = async (likeId: string) => {
    await supabase.from('likes').delete().eq('id', likeId);
    testResync();
    await load();
    notify('하트 삭제됨');
  };

  const clearAllHearts = async () => {
    setLoading('clearHearts');
    try {
      await testApiRpc('test_clear_hearts', {});
      await load();
      notify('모든 하트 삭제됨');
    } catch (e) {
      notify(`하트 삭제 실패: ${e instanceof Error ? e.message : String(e)}`, false);
    }
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
    testResync();
    await load();
    notify('채팅방 + 메시지 2개 생성됨');
    setLoading(null);
  };

  const deleteChat = async (chatId: string) => {
    await supabase.from('messages').delete().eq('chat_id', chatId);
    await supabase.from('chats').delete().eq('id', chatId);
    testResync();
    await load();
    notify('채팅 삭제됨');
  };

  // ── Select helpers ─────────────────────────────────────────────────────────
  const [fromUser, setFromUser] = useState('');
  const [toUser, setToUser] = useState('');
  const [chatU1, setChatU1] = useState('');
  const [chatU2, setChatU2] = useState('');
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
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: '프로필', val: profiles.length, color: 'text-cyan-400' },
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
                  <p className="text-xs text-slate-400">{myProfile.mbti} · {myProfile.bio}</p>
                </div>
                <Btn label="이 계정으로 입장" onClick={() => enterAsUser(myProfile.id)} color="teal" small disabled={loading === 'enter'} />
                <Btn label="초기화" onClick={() => { localStorage.removeItem('matching_app_user_id'); setMyUserId(null); notify('계정 초기화됨'); }} color="red" small />
              </>
            ) : (
              <p className="text-slate-400 text-sm">선택된 계정 없음 — 아래에서 생성하거나 선택하세요</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Btn label="테스터 A1 생성" onClick={() => createTestUser('A', 1)} color="teal" disabled={loading === 'profile'} />
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
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { if (myUserId) void enterAsUser(myUserId); else window.location.href = '/'; }}
              className="flex-1 text-center text-sm py-3 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl border border-teal-500 transition-all"
            >
              {myUserId ? '선택한 더미로 유저 화면 입장 →' : '유저 화면 열기 →'}
            </button>
            <a href="/admin" className="flex-1 text-center text-sm py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold rounded-xl border border-slate-600 transition-all">
              관리자 화면 열기 →
            </a>
          </div>
        </Section>

        {/* 더미 프로필 대량 생성 */}
        <Section title="더미 프로필 대량 생성" icon={<UserPlus className="w-4 h-4" />} defaultOpen={false}>
          <p className="text-xs text-slate-400">한글 닉네임·지역·출생연도가 랜덤으로 채워진 더미 유저를 생성합니다.</p>

          {/* 슬라이더 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">생성 인원</span>
              <span className="text-sm font-black text-violet-300">{bulkCount}명</span>
            </div>
            <input type="range" min={10} max={50} step={5} value={bulkCount}
              onChange={e => setBulkCount(Number(e.target.value))}
              className="w-full accent-violet-500" />
            <div className="flex justify-between text-[10px] text-slate-500">
              {[10,15,20,25,30,35,40,45,50].map(v => <span key={v}>{v}</span>)}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Btn label={`더미 ${bulkCount}명 생성`} onClick={() => createManyDummies(bulkCount)} color="violet" disabled={loading === 'dummies'} />
            <Btn label="랜덤 1명 생성" onClick={() => createTestUser()} color="cyan" disabled={!!loading} />
          </div>

          {/* 프로필 목록 */}
          <div className="max-h-48 overflow-y-auto space-y-1.5 mt-1">
            {profiles.length === 0 && <p className="text-xs text-slate-500 text-center py-3">프로필 없음</p>}
            {profiles.map(p => (
              <div key={p.id} className="flex items-center gap-2 px-3 py-1.5 bg-slate-700/40 rounded-lg">
                <img src={p.photo_url} className="w-7 h-7 rounded-full flex-shrink-0" />
                <span className="text-xs font-semibold text-slate-200 flex-1 truncate">{p.nickname}</span>
                <Tag text={p.mbti ?? '?'} color="slate" />
                {p.pin_code && <Tag text={`PIN ${p.pin_code}`} color="teal" />}
                {p.id === myUserId && <Tag text="나" color="teal" />}
                <button onClick={() => void enterAsUser(p.id)} className="text-[10px] px-2 py-0.5 bg-teal-500/20 hover:bg-teal-500/40 text-teal-300 rounded-full border border-teal-500/30 transition-all shrink-0">입장</button>
                <button onClick={() => setMyUser(p.id)} className="text-[10px] px-2 py-0.5 bg-slate-500/20 hover:bg-slate-500/40 text-slate-300 rounded-full border border-slate-500/30 transition-all shrink-0">선택</button>
                <button onClick={() => deleteProfile(p.id)} disabled={loading === `del-${p.id}`} className="text-[10px] px-2 py-0.5 bg-red-500/20 hover:bg-red-500/40 text-red-300 rounded-full border border-red-500/30 transition-all shrink-0">삭제</button>
              </div>
            ))}
          </div>
          <Btn label="모든 프로필 + 데이터 초기화" onClick={deleteAllProfiles} color="red" disabled={loading === 'deleteAll'} />
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
              <Btn label="랜덤 → 나 하트" onClick={() => { const others = profiles.filter(p => p.id !== myUserId); if (others.length) sendHeart(others[Math.floor(Math.random() * others.length)].id, myUserId!); }} color="pink" disabled={loading === 'heart'} />
              <Btn label="나 → 랜덤 하트" onClick={() => { const others = profiles.filter(p => p.id !== myUserId); if (others.length) sendHeart(myUserId!, others[Math.floor(Math.random() * others.length)].id); }} color="rose" disabled={loading === 'heart'} />
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
            <Btn label="나 ↔ 랜덤 채팅 생성" onClick={() => { const others = profiles.filter(p => p.id !== myUserId); if (others.length) createChat(myUserId!, others[Math.floor(Math.random() * others.length)].id); }} color="violet" disabled={loading === 'chat'} />
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

      </div>
    </div>
  );
}
