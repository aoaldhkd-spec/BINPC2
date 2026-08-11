import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Shield, LogOut, Trash2, Users,
  LayoutGrid, X, AlertTriangle, ChevronDown,
  Heart, MessageCircle, Send, CheckCircle, BellRing, Eye, EyeOff,
  PlayCircle, StopCircle, Timer, RefreshCw, Sparkles,
  Lock, Unlock, Search, Database as DatabaseIcon, Activity,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { setLocalDbUserId, supabase as ldbSupabase } from './lib/localdb';
import type { Database } from './types/database';
import { getPositionLabel, getDomSubLabel, getKoreanAge } from './lib/profile';
import { HEART_TYPE_META } from './lib/constants';

type Profile = Database['public']['Tables']['profiles']['Row'];
type AppSettings = Database['public']['Tables']['app_settings']['Row'];
type SessionHistory = Database['public']['Tables']['session_history']['Row'];
type Like = Database['public']['Tables']['likes']['Row'];
type Chat = Database['public']['Tables']['chats']['Row'];
type Message = Database['public']['Tables']['messages']['Row'];
type Suggestion = Database['public']['Tables']['suggestions']['Row'];
type AnonymousReport = Database['public']['Tables']['anonymous_reports']['Row'];

const ADMIN_SESSION_KEY = 'admin_session_v1';
const ADMIN_TOKEN_KEY = 'admin_token_v1';

// ─── api-server 직접 호출 헬퍼 ───────────────────────────────────────────────
// Supabase 직접 업데이트는 api-server 인메모리 스토어를 갱신하지 않음 →
// 회식시작·잠금제어·전체초기화 등 유저에게 즉시 반영돼야 하는 작업은
// Supabase 업데이트 후 api-server RPC도 함께 호출해야 함.
const ADMIN_API = '/api/db';

async function adminApiRpc(name: string, args: Record<string, unknown>): Promise<void> {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY) ?? '';
  const res = await fetch(`${ADMIN_API}/rpc/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...args, adminToken: token }),
  });
  if (!res.ok) throw new Error(`api-server RPC ${name} 오류: HTTP ${res.status}`);
  const json = (await res.json()) as { data: unknown; error: { message: string } | null };
  if (json.error) throw new Error(json.error.message);
}

/** api-server /op SELECT — 인메모리 데이터 직접 조회 (Supabase KV가 아닌 api-server 스토어) */
async function adminApiSelect<T>(
  table: string,
  orderBy?: Array<{ column: string; ascending: boolean }>,
): Promise<{ data: T[] | null }> {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY) ?? '';
  const body: Record<string, unknown> = { table, op: 'select', adminToken: token };
  if (orderBy) body.orderBy = orderBy;
  try {
    const res = await fetch(`${ADMIN_API}/op`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { data: null };
    const json = await res.json() as { data: T[] | null; error: unknown };
    return { data: json.data ?? [] };
  } catch {
    return { data: null };
  }
}

/** api-server /op 호출 — INSERT/UPDATE/DELETE를 인메모리 + SSE broadcast + 영속화 */
async function adminApiOp(
  table: string,
  op: 'insert' | 'update' | 'delete',
  payload: Record<string, unknown>,
  filters?: Array<{ col: string; type: string; value: unknown }>,
): Promise<void> {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY) ?? '';
  const body: Record<string, unknown> = { table, op, payload, adminToken: token };
  if (filters) body.filters = filters;
  const res = await fetch(`${ADMIN_API}/op`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`api-server /op ${op}:${table} 오류: HTTP ${res.status}`);
  const json = (await res.json()) as { data: unknown; error: { message: string } | null };
  if (json.error) throw new Error(json.error.message);
}

// Local mock: admin client is the same as the regular client
const adminSupabase = supabase;

function setAdminToken(token: string | null) {
  // Local mock: token is not needed; just update localStorage for session tracking
  if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
  else localStorage.removeItem(ADMIN_TOKEN_KEY);
}

interface AdminSession { phone: string; authedAt: number; }

function loadAdminSession(): AdminSession | null {
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as AdminSession;
    if (Date.now() - s.authedAt > 86400000 * 30) { localStorage.removeItem(ADMIN_SESSION_KEY); return null; }
    return s;
  } catch { return null; }
}

// ─── Login Screen ─────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const formatPhone = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // 전화번호·비밀번호 검증은 서버 사이드에서만 처리
      // (이전에는 app_settings.admin_password를 클라이언트에서 직접 읽었으나
      //  보안 강화로 비관리자 응답에서 admin_password가 제거돼 로그인 불가 문제 발생)
      const { data: token, error: rpcErr } = await supabase.rpc('admin_create_session', { p_phone: phone, p_admin_password: password });
      if (rpcErr) {
        setError('전화번호 또는 비밀번호가 올바르지 않습니다.');
        setLoading(false);
        return;
      }
      setAdminToken(token ?? null);
      localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({ phone, authedAt: Date.now() }));
      onLogin();
    } catch {
      setError('전화번호 또는 비밀번호가 올바르지 않습니다.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-slate-700 to-slate-900 px-8 py-7 text-center">
            <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-3">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-xl font-bold text-white">관리자 로그인</h1>
            <p className="text-slate-300 text-sm mt-1">관리자 전용 페이지입니다</p>
          </div>
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">전화번호</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))}
                placeholder="010-0000-0000"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-slate-500 focus:border-transparent outline-none transition-all text-gray-800" required />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">비밀번호</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호 입력"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-slate-500 focus:border-transparent outline-none transition-all text-gray-800" required />
            </div>
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}
            <button type="submit" disabled={loading}
              className="w-full py-3 bg-slate-800 text-white font-semibold rounded-xl hover:bg-slate-700 disabled:opacity-50 transition-all">
              {loading ? '확인 중...' : '로그인'}
            </button>
            <a href="/"
              className="w-full py-2.5 flex items-center justify-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all">
              ← 입장 대기 화면으로
            </a>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({ title, message, danger, confirmText, onConfirm, onCancel }: {
  title: string; message: string; danger?: boolean; confirmText?: string; onConfirm: () => void; onCancel: () => void;
}) {
  const [typed, setTyped] = useState('');
  const canConfirm = !confirmText || typed === confirmText;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto ${danger ? 'bg-red-100' : 'bg-amber-100'}`}>
          <AlertTriangle className={`w-6 h-6 ${danger ? 'text-red-600' : 'text-amber-600'}`} />
        </div>
        <div className="text-center">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-600 mt-1.5 leading-relaxed whitespace-pre-line">{message}</p>
        </div>
        {confirmText && (
          <div>
            <p className="text-xs text-red-600 font-bold mb-1.5 text-center">확인을 위해 <span className="bg-red-100 px-1.5 py-0.5 rounded font-black">{confirmText}</span> 를 입력하세요</p>
            <input
              value={typed}
              onChange={e => setTyped(e.target.value)}
              placeholder={confirmText}
              className="w-full border-2 border-red-200 rounded-xl px-3 py-2 text-sm font-bold text-center focus:outline-none focus:border-red-400"
            />
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-all">취소</button>
          <button onClick={onConfirm} disabled={!canConfirm} className={`flex-1 py-3 font-semibold rounded-xl transition-all text-white ${danger ? 'bg-red-500 hover:bg-red-600 disabled:bg-red-200 disabled:cursor-not-allowed' : 'bg-amber-500 hover:bg-amber-600'}`}>확인</button>
        </div>
      </div>
    </div>
  );
}

// ─── Notification Tab ─────────────────────────────────────────────────────────

type Notification = { id: string; message: string; type: string; target: string; is_active: boolean; created_at: string };

const NOTIF_TYPES = [
  { id: 'info',   label: '📢 일반공지', color: 'bg-blue-50 border-blue-200 text-blue-800' },
  { id: 'urgent', label: '🚨 긴급',     color: 'bg-red-50 border-red-200 text-red-800' },
  { id: 'event',  label: '🎉 이벤트',   color: 'bg-amber-50 border-amber-200 text-amber-800' },
];

function NotificationTab({ tableCount, settings, onSetTimer }: {
  tableCount: number;
  settings: AppSettings | null;
  onSetTimer: (endAt: string | null, label: string | null) => Promise<void>;
}) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [message, setMessage] = useState('');
  const [type, setType] = useState('info');
  const [target, setTarget] = useState('all');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshDone, setRefreshDone] = useState(false);
  const [withTimer, setWithTimer] = useState(false);
  const [showStandaloneTimer, setShowStandaloneTimer] = useState(false);

  const [timerMinutes, setTimerMinutes] = useState('10');
  const [timerLabelInput, setTimerLabelInput] = useState('');
  const [timerCountdown, setTimerCountdown] = useState('');
  const autoCleared = useRef(false);

  useEffect(() => {
    if (!settings?.timer_end_at) { setTimerCountdown(''); autoCleared.current = false; return; }
    autoCleared.current = false;
    const update = () => {
      const diff = Math.max(0, Math.round((new Date(settings.timer_end_at!).getTime() - Date.now()) / 1000));
      const m = Math.floor(diff / 60);
      const s = diff % 60;
      setTimerCountdown(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
      if (diff === 0 && !autoCleared.current) { autoCleared.current = true; setTimeout(() => onSetTimer(null, null), 1500); }
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [settings?.timer_end_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const startTimer = async (mins?: number, label?: string) => {
    const m = mins ?? parseInt(timerMinutes, 10);
    if (isNaN(m) || m <= 0) return;
    await onSetTimer(new Date(Date.now() + m * 60 * 1000).toISOString(), (label ?? timerLabelInput.trim()) || null);
  };

  const load = async () => {
    const { data } = await adminSupabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(30);
    if (data) setNotifications(data as Notification[]);
  };
  useEffect(() => { load(); }, []);

  const handleRefresh = async () => {
    setRefreshing(true); await load(); setRefreshing(false);
    setRefreshDone(true); setTimeout(() => setRefreshDone(false), 2000);
  };

  const send = async () => {
    if (!message.trim()) return;
    setSending(true);
    const fullMsg = message.trim();
    // Supabase insert + 삽입된 행 반환
    const { data: inserted, error: insertErr } = await adminSupabase
      .from('notifications').insert({ message: fullMsg, type, target, is_active: true }).select().single();
    if (insertErr) {
      alert(`알림 전송 실패: ${insertErr.message}`);
      setSending(false);
      return;
    }
    // api-server 동기화 → SSE로 모든 유저에게 즉시 전송
    // (Supabase 직접 insert는 api-server 인메모리/SSE를 거치지 않아 유저에게 도달 안 함)
    if (inserted) {
      adminApiOp('notifications', 'insert', inserted as Record<string, unknown>)
        .catch(e => console.warn('[admin] api-server 알림 동기화 실패:', e));
    }
    if (withTimer) {
      const mins = parseInt(timerMinutes, 10);
      if (!isNaN(mins) && mins > 0) {
        await onSetTimer(new Date(Date.now() + mins * 60 * 1000).toISOString(), timerLabelInput.trim() || fullMsg.slice(0, 20) || null);
      }
    }
    setMessage('');
    setSent(true); setTimeout(() => setSent(false), 2500);
    await load(); setSending(false);
  };

  const toggle = async (n: Notification) => {
    await adminSupabase.from('notifications').update({ is_active: !n.is_active }).eq('id', n.id);
    setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_active: !n.is_active } : x));
  };
  const del = async (id: string) => {
    await adminSupabase.from('notifications').delete().eq('id', id);
    setNotifications(prev => prev.filter(x => x.id !== id));
  };
  const typeCfg = (t: string) => NOTIF_TYPES.find(x => x.id === t) ?? NOTIF_TYPES[0];

  const INFO_QUICK = [
    { label: '진행 시작', msg: '곧 진행을 시작합니다. 대기해주세요.' },
    { label: '집중 요청', msg: '잠시 집중해 주세요! 중요한 안내가 있습니다.' },
    { label: '대화 시간', msg: '대화 시간입니다. 자유롭게 대화 나눠주세요!' },
    { label: '화장실·담배', msg: '화장실, 담배 시간입니다. 10분 후 다시 시작합니다.' },
    { label: '자리 이동', msg: '자리 이동 시간입니다. 지정 자리로 이동해 주세요.' },
    { label: '종료 임박', msg: '행사가 곧 마무리됩니다. 연락처 교환 해 주세요!' },
  ];
  const URGENT_QUICK = [
    { label: '⚙️ 시스템\n안정화', msg: '⚙️ 시스템 안정화 작업 중입니다. 잠시 불편하시더라도 양해 부탁드립니다.' },
  ];
  const LOST_ITEMS = ['카드', '지갑', '민증', '가방', '우산', '열쇠', '핸드폰', '안경'];
  const LOST_COLORS = [
    { label: '빨간색', cls: 'bg-red-500' }, { label: '파란색', cls: 'bg-blue-500' },
    { label: '검은색', cls: 'bg-gray-900' }, { label: '흰색', cls: 'bg-white border border-gray-300' },
    { label: '갈색', cls: 'bg-amber-800' }, { label: '노란색', cls: 'bg-yellow-400' },
    { label: '초록색', cls: 'bg-green-500' }, { label: '분홍색', cls: 'bg-pink-400' },
    { label: '회색', cls: 'bg-gray-400' }, { label: '남색', cls: 'bg-indigo-800' },
  ];
  const EVENT_AWARDS = [
    { label: '🏆 하트최다상', msg: (prize: string) => `🏆 [하트 최다 수신] 수상자를 발표합니다! 상금: ${prize} 🎉 축하드립니다!` },
    { label: '🥰 칭찬 많이 받은 사람', msg: (prize: string) => `🥰 [칭찬 최다 수신] 수상자를 발표합니다! 상금: ${prize} 🎉 축하드립니다!` },
  ];
  const PRIZE_AMOUNTS = ['1,000원', '2,000원', '3,000원', '5,000원', '10,000원', '15,000원', '20,000원'];
  const [lostItem, setLostItem] = useState<string|null>(null);
  const [lostColor, setLostColor] = useState<string|null>(null);
  const [showLostPicker, setShowLostPicker] = useState(false);
  const [awardType, setAwardType] = useState<number|null>(null);
  const [prizeAmount, setPrizeAmount] = useState<string>('5,000원');

  const TIMER_QUICK = [5, 10, 15, 20, 30];

  const timerActive = !!settings?.timer_end_at;

  return (
    <div className="p-4 space-y-4">

      {/* ── 타이머 활성 스트립 ────────────────────────────────────────────── */}
      {timerActive && (
        <div className="rounded-2xl border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="w-9 h-9 rounded-2xl bg-amber-500 flex items-center justify-center flex-shrink-0 shadow-md shadow-amber-500/30">
              <Timer className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-3xl font-black tabular-nums tracking-tight leading-none ${timerCountdown === '00:00' ? 'text-gray-300' : 'text-amber-600'}`}>
                  {timerCountdown || '00:00'}
                </span>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${timerCountdown === '00:00' ? 'bg-gray-200 text-gray-500' : 'bg-amber-500 text-white animate-pulse'}`}>
                  {timerCountdown === '00:00' ? '종료됨' : '진행 중'}
                </span>
              </div>
              {settings?.timer_label && <p className="text-xs text-amber-700 font-semibold mt-0.5 truncate">{settings.timer_label}</p>}
            </div>
            <button onClick={() => onSetTimer(null, null)}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-xl text-xs font-bold transition-all active:scale-95">
              <X className="w-3.5 h-3.5" />종료
            </button>
          </div>
          {/* 빠른 재설정 */}
          <div className="flex gap-1.5 px-4 pb-3">
            {TIMER_QUICK.map(m => (
              <button key={m} onClick={() => startTimer(m)}
                className="flex-1 py-1.5 bg-white/80 border border-amber-200 rounded-xl text-[11px] font-bold text-amber-700 hover:bg-amber-100 transition-all active:scale-95">
                +{m}분
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── 공지 작성 ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 pt-5 pb-0 flex items-center gap-2 mb-4">
          <BellRing className="w-4 h-4 text-teal-500" />
          <h3 className="font-black text-gray-800 text-sm">공지 작성</h3>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {/* Type selector */}
          <div className="grid grid-cols-4 gap-1.5">
            {NOTIF_TYPES.map(t => (
              <button key={t.id} onClick={() => { setType(t.id); setMessage(''); }}
                className={`text-xs font-bold px-2 py-2 rounded-xl border-2 transition-all text-center leading-tight ${type === t.id ? t.color + ' border-current' : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-400'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Quick templates — type별 */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500">빠른 메시지</p>

            {/* 일반공지 */}
            {type === 'info' && (
              <div className="grid grid-cols-3 gap-1.5">
                {INFO_QUICK.map(t => (
                  <button key={t.label} onClick={() => setMessage(t.msg)}
                    className="text-xs font-semibold px-2 py-2 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 transition-all text-center leading-snug active:scale-95">
                    {t.label}
                  </button>
                ))}
              </div>
            )}

            {/* 긴급 */}
            {type === 'urgent' && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-1.5">
                  {/* 시스템안정화 — 클릭 시 메시지 바로 적용 */}
                  {URGENT_QUICK.map(t => (
                    <button key={t.label} onClick={() => { setMessage(t.msg); setShowLostPicker(false); }}
                      className="text-xs font-semibold px-2 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 transition-all text-center whitespace-pre-line leading-snug active:scale-95">
                      {t.label}
                    </button>
                  ))}
                  {/* 분실물 탭 버튼 */}
                  <button
                    onClick={() => setShowLostPicker(v => !v)}
                    className={`text-xs font-semibold px-2 py-2.5 rounded-xl border transition-all text-center leading-snug active:scale-95 ${showLostPicker ? 'bg-red-500 border-red-500 text-white' : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'}`}>
                    📦 분실물
                  </button>
                </div>
                {/* 분실물 picker — 분실물 탭 선택 시만 표시 */}
                {showLostPicker && (
                  <div className="bg-red-50 border border-red-200 rounded-2xl p-3 space-y-2">
                    <p className="text-xs font-black text-red-700">📦 분실물 안내 생성기</p>
                    <div className="flex flex-wrap gap-1">
                      {LOST_ITEMS.map(item => (
                        <button key={item} onClick={() => setLostItem(lostItem === item ? null : item)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold border-2 transition-all active:scale-95 ${lostItem === item ? 'bg-red-500 border-red-500 text-white' : 'bg-white border-red-200 text-red-700 hover:border-red-400'}`}>
                          {item}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {LOST_COLORS.map(c => (
                        <button key={c.label} onClick={() => setLostColor(lostColor === c.label ? null : c.label)}
                          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold border-2 transition-all active:scale-95 ${lostColor === c.label ? 'border-red-500 bg-red-50' : 'border-gray-200 bg-white hover:border-red-300'}`}>
                          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${c.cls}`} />
                          {c.label}
                        </button>
                      ))}
                    </div>
                    <button
                      disabled={!lostItem && !lostColor}
                      onClick={() => {
                        const colorPart = lostColor ? lostColor + ' ' : '';
                        const itemPart = lostItem ?? '물건';
                        setMessage(`🚨 분실물 안내: ${colorPart}${itemPart}이(가) 발견되었습니다. 분실하신 분은 관리자에게 문의해 주세요.`);
                      }}
                      className="w-full py-2 bg-red-500 disabled:opacity-40 text-white text-xs font-black rounded-xl active:scale-95 transition-all">
                      메시지 적용
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 이벤트 */}
            {type === 'event' && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-1.5">
                  {EVENT_AWARDS.map((a, i) => (
                    <button key={a.label} onClick={() => {
                      const next = awardType === i ? null : i;
                      setAwardType(next);
                      if (next !== null) setMessage(a.msg(prizeAmount));
                      else setMessage('');
                    }}
                      className={`py-2.5 rounded-xl text-xs font-black border-2 transition-all active:scale-95 ${awardType === i ? 'bg-amber-500 border-amber-500 text-white' : 'bg-amber-50 border-amber-200 text-amber-700 hover:border-amber-400'}`}>
                      {a.label}
                    </button>
                  ))}
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-500 mb-1">상금 선택 (자동 적용)</p>
                  <div className="flex flex-wrap gap-1">
                    {PRIZE_AMOUNTS.map(p => (
                      <button key={p} onClick={() => {
                        setPrizeAmount(p);
                        if (awardType !== null) setMessage(EVENT_AWARDS[awardType].msg(p));
                      }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-black border-2 transition-all active:scale-95 ${prizeAmount === p ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-amber-200 text-amber-700 hover:border-amber-400'}`}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Target */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">대상</label>
            <select value={target} onChange={e => setTarget(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-400">
              <option value="all">전체 참가자</option>
              {Array.from({ length: tableCount }, (_, i) => i + 1).map(n => (
                <option key={n} value={`table_${n}`}>{TABLE_LABELS[n] ?? n}테이블 ({n}번)</option>
              ))}
            </select>
          </div>

          {/* Message */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">메시지</label>
            <textarea value={message} onChange={e => setMessage(e.target.value)}
              placeholder="예) 지금부터 자리 이동 시간입니다!" rows={3}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
            />
          </div>


          {/* ⏱ 타이머 함께 시작 토글 */}
          <div className={`rounded-2xl border-2 transition-all overflow-hidden ${withTimer ? 'border-amber-300 bg-amber-50' : 'border-gray-100 bg-gray-50'}`}>
            <button onClick={() => setWithTimer(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 transition-all">
              <div className="flex items-center gap-2.5">
                <Timer className={`w-4 h-4 flex-shrink-0 ${withTimer ? 'text-amber-500' : 'text-gray-400'}`} />
                <div className="text-left">
                  <p className={`text-sm font-bold leading-tight ${withTimer ? 'text-amber-700' : 'text-gray-500'}`}>타이머 함께 시작</p>
                  <p className="text-[10px] text-gray-400 leading-none mt-0.5">공지 전송과 동시에 타이머 실행</p>
                </div>
              </div>
              <div className={`w-10 h-6 rounded-full flex items-center px-0.5 transition-all flex-shrink-0 ${withTimer ? 'bg-amber-500' : 'bg-gray-300'}`}>
                <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${withTimer ? 'translate-x-4' : 'translate-x-0'}`} />
              </div>
            </button>
            {withTimer && (
              <div className="px-4 pb-4 space-y-2">
                <div className="flex gap-1.5 mb-1">
                  {TIMER_QUICK.map(m => (
                    <button key={m} onClick={() => setTimerMinutes(String(m))}
                      className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold border-2 transition-all ${timerMinutes === String(m) ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-amber-200 text-amber-700 hover:bg-amber-50'}`}>
                      {m}분
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 items-center">
                  <div className="flex items-center gap-1 bg-white border-2 border-amber-300 rounded-xl px-2 focus-within:border-amber-500 transition-all">
                    <input type="number" value={timerMinutes} onChange={e => setTimerMinutes(e.target.value)}
                      min="1" max="999" placeholder="10"
                      className="w-14 py-2 text-sm text-center font-black text-amber-700 focus:outline-none bg-transparent" />
                    <span className="text-xs font-bold text-amber-500 pr-1">분</span>
                  </div>
                  <input type="text" value={timerLabelInput} onChange={e => setTimerLabelInput(e.target.value)}
                    placeholder="타이머 라벨 (선택)"
                    className="flex-1 px-3 py-2.5 bg-white border-2 border-amber-200 rounded-xl text-sm focus:outline-none focus:border-amber-400 transition-all" />
                </div>
              </div>
            )}
          </div>

          <button onClick={send} disabled={sending || !message.trim()}
            className={`w-full py-3 rounded-xl font-black text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-40 shadow-lg
              ${withTimer
                ? 'bg-gradient-to-r from-teal-500 via-cyan-500 to-amber-500 hover:opacity-90 shadow-teal-500/20 text-white'
                : 'bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-white shadow-teal-500/20'}`}>
            {sent
              ? <><CheckCircle className="w-4 h-4" />전송됨!</>
              : sending ? '전송 중...'
              : withTimer
              ? <><Send className="w-4 h-4" />공지 전송 + 타이머 시작 ⏱</>
              : <><Send className="w-4 h-4" />공지 전송</>}
          </button>
        </div>
      </div>

      {/* ── 타이머 단독 설정 (타이머 없을 때만) ─────────────────────────── */}
      {!timerActive && (
        <div className={`rounded-2xl border-2 overflow-hidden transition-all ${showStandaloneTimer ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'}`}>
          <button onClick={() => setShowStandaloneTimer(v => !v)}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
            <div className="w-8 h-8 rounded-xl bg-amber-500 flex items-center justify-center flex-shrink-0">
              <Timer className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-black text-amber-800">타이머 단독 설정</p>
              <p className="text-[10px] text-amber-600/70 font-medium">공지 없이 타이머만 실행</p>
            </div>
            <ChevronDown className={`w-4 h-4 text-amber-600 transition-transform flex-shrink-0 ${showStandaloneTimer ? 'rotate-180' : ''}`} />
          </button>
          {showStandaloneTimer && (
            <div className="px-4 pb-4 space-y-3">
              <div className="flex gap-1.5">
                {TIMER_QUICK.map(m => (
                  <button key={m} onClick={() => setTimerMinutes(String(m))}
                    className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold border-2 transition-all ${timerMinutes === String(m) ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-amber-200 text-amber-700 hover:bg-amber-50'}`}>
                    {m}분
                  </button>
                ))}
              </div>
              <div className="flex gap-2 items-center">
                <div className="flex items-center gap-1 bg-white border-2 border-amber-200 rounded-xl px-2 focus-within:border-amber-400 transition-all">
                  <input type="number" value={timerMinutes} onChange={e => setTimerMinutes(e.target.value)}
                    min="1" max="999" placeholder="10"
                    className="w-14 py-2 text-sm text-center font-black text-amber-700 focus:outline-none bg-transparent" />
                  <span className="text-xs font-bold text-amber-500 pr-1">분</span>
                </div>
                <input type="text" value={timerLabelInput} onChange={e => setTimerLabelInput(e.target.value)}
                  placeholder="라벨 (예: 자리 이동 시간)"
                  className="flex-1 px-3 py-2.5 bg-white border-2 border-amber-200 rounded-xl text-sm focus:outline-none focus:border-amber-400 transition-all" />
              </div>
              <button onClick={() => startTimer()}
                className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white rounded-xl text-sm font-black transition-all active:scale-[0.98] shadow-md shadow-amber-500/20 flex items-center justify-center gap-2">
                <Timer className="w-4 h-4" />타이머 시작
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── 전송 이력 ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-black text-gray-800 text-sm">전송 이력</h3>
            <p className="text-xs text-gray-400 mt-0.5">활성 공지는 유저 화면 중앙에 팝업으로 표시됩니다</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleRefresh} disabled={refreshing}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition-all disabled:opacity-50 ${refreshDone ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'bg-gray-100 hover:bg-teal-50 hover:text-teal-700 text-gray-600'}`}>
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />{refreshDone ? '완료!' : refreshing ? '로딩...' : '새로고침'}
            </button>
            {notifications.some(n => n.is_active) && (
              <button onClick={() => notifications.filter(n => n.is_active).forEach(n => toggle(n))}
                className="px-3 py-1.5 bg-red-50 border border-red-200 text-red-600 text-xs font-bold rounded-xl hover:bg-red-100 transition-all">
                전체 종료
              </button>
            )}
          </div>
        </div>
        {notifications.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">전송된 공지가 없습니다</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {notifications.map(n => {
              const cfg = typeCfg(n.type);
              return (
                <div key={n.id} className={`flex items-start gap-3 px-4 py-3 transition-all ${n.is_active ? '' : 'opacity-40'}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${cfg.color}`}>{cfg.label}</span>
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                        {n.target === 'all' ? '전체' : (() => { const num = parseInt(n.target.replace('table_', '')); return `${TABLE_LABELS[num] ?? num}테이블`; })()}
                      </span>
                      {n.is_active && <span className="text-[10px] text-teal-600 font-bold flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse inline-block" />활성</span>}
                    </div>
                    <p className="text-sm text-gray-700 font-medium leading-snug">{n.message}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{new Date(n.created_at).toLocaleString('ko-KR')}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => toggle(n)}
                      className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-all ${n.is_active ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100' : 'bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100'}`}>
                      {n.is_active ? '숨기기' : '활성화'}
                    </button>
                    <button onClick={() => del(n.id)} className="p-1.5 text-gray-300 hover:text-red-400 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// 테이블 번호 표시용 (알림 타겟 표시에서 사용)
const TABLE_LABELS: Record<number, string> = {
  1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: '11', 12: '12',
  13: '13', 14: '14', 15: '15', 16: '16', 17: '17', 18: '18', 19: '19', 20: '20', 21: '21', 22: '22',
};

// ─── Admin QR Tab ─────────────────────────────────────────────────────────────

function AdminQrTab({ settings, onSaveQrBase }: { settings: AppSettings | null; onSaveQrBase: (url: string) => Promise<void> }) {
  const normalizeBase = (url: string) => {
    const trimmed = url.trim().replace(/\/$/, '');
    if (!trimmed) return trimmed;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
    return 'https://' + trimmed;
  };

  // DB 우선, localStorage 폴백 (기존 설정 마이그레이션용)
  const [customBase, setCustomBase] = useState(() => {
    const dbVal = (settings as Record<string, unknown> | null)?.qr_base_url as string | null | undefined;
    return normalizeBase(dbVal ?? localStorage.getItem('qr_base_url') ?? window.location.origin);
  });
  const [editingBase, setEditingBase] = useState(false);
  const [baseInput, setBaseInput] = useState(customBase);
  const [saving, setSaving] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // settings가 로드되면 DB 값으로 동기화
  useEffect(() => {
    const dbVal = (settings as Record<string, unknown> | null)?.qr_base_url as string | null | undefined;
    if (dbVal) {
      const normalized = normalizeBase(dbVal);
      setCustomBase(normalized);
      setBaseInput(normalized);
    }
  }, [settings]);

  const saveBase = async () => {
    let val = baseInput.trim().replace(/\/$/, '');
    if (val && !val.startsWith('http://') && !val.startsWith('https://')) {
      val = 'https://' + val;
    }
    setCustomBase(val);
    setBaseInput(val);
    localStorage.setItem('qr_base_url', val); // 폴백 백업
    setSaving(true);
    await onSaveQrBase(val);
    setSaving(false);
    setEditingBase(false);
  };

  const getEntryUrl = () => {
    return `${customBase}/`;
  };

  const makeQr = (url: string, size = 160) =>
    `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(url)}&size=${size}x${size}&margin=8`;

  const copyUrl = (url: string) => navigator.clipboard.writeText(url);

  const isDefaultUrl = customBase.includes('localhost') || customBase.includes('127.0.0.1') || !customBase.startsWith('https://');
  const entryUrl = getEntryUrl();

  return (
    <div className="p-4 space-y-6">
      {/* Base URL 설정 */}
      <div className={`rounded-xl border px-4 py-3 ${isDefaultUrl ? 'bg-red-950/40 border-red-500/50' : 'bg-green-950/40 border-green-500/50'}`}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <p className={`text-xs font-black ${isDefaultUrl ? 'text-red-400' : 'text-green-400'}`}>
              {isDefaultUrl ? '!! QR 도메인 미설정 — 핸드폰에서 작동 안 됩니다' : 'QR 도메인 설정됨'}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5 break-all">{customBase}</p>
          </div>
          <button
            onClick={() => { setBaseInput(customBase); setEditingBase(true); }}
            className="flex-shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition-all"
          >수정</button>
        </div>
        {editingBase && (
          <div className="flex gap-2 mt-2">
            <input
              type="url"
              value={baseInput}
              onChange={e => setBaseInput(e.target.value)}
              placeholder="https://your-app.netlify.app"
              className="flex-1 text-xs px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              autoFocus
            />
            <button onClick={saveBase} disabled={saving} className="text-xs font-bold px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition-all disabled:opacity-60">{saving ? '저장중…' : '저장'}</button>
            <button onClick={() => setEditingBase(false)} className="text-xs px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-all">취소</button>
          </div>
        )}
        {isDefaultUrl && !editingBase && (
          <p className="text-[10px] text-red-400/80 mt-1">
            Netlify 배포 후 받은 주소 (예: https://xxx.netlify.app)를 위 수정 버튼으로 입력해주세요.
          </p>
        )}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700 font-medium">
        QR 하나로 모든 참가자가 접속합니다. 스캔 즉시 닉네임 설정 또는 메인 화면으로 진입합니다.
      </div>

      {/* 단일 접속 QR */}
      {!isDefaultUrl && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 bg-gradient-to-r from-teal-500 to-cyan-500 text-white">
            <p className="font-black text-sm">접속 QR (전체 공용)</p>
            <p className="text-xs text-white/90 mt-0.5">이 QR 하나만 인쇄/전시하면 됩니다</p>
          </div>
          <div className="p-5">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setFullscreen(true)}
                className="flex-shrink-0 p-2 bg-slate-50 rounded-2xl border-2 border-slate-200 hover:border-teal-400 transition-all"
              >
                <img src={makeQr(entryUrl, 320)} alt="접속 QR" className="w-40 h-40 rounded-xl" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-600 mb-2 leading-relaxed">
                  이 QR을 스캔하면 앱 메인으로 접속합니다.<br />
                  기존 참가자는 즉시 메인 화면, 신규 참가자는 닉네임 설정 화면으로 진입합니다.
                </p>
                <p className="text-[10px] font-mono text-gray-400 break-all bg-gray-50 rounded-lg px-2 py-1 mb-2">{entryUrl}</p>
                <div className="flex gap-2">
                  <button onClick={() => copyUrl(entryUrl)} className="text-xs px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-all">링크 복사</button>
                  <button onClick={() => setFullscreen(true)} className="text-xs px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-all">크게 보기</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 관리자 패널 QR */}
      {!isDefaultUrl && (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
          <p className="text-xs font-black text-slate-300 mb-3">관리자 패널 QR (내 핸드폰용)</p>
          <div className="flex items-center gap-4">
            <img
              src={makeQr(`${customBase}/admin`, 240)}
              alt="admin QR"
              className="w-32 h-32 rounded-xl bg-white p-1"
            />
            <div className="flex-1">
              <p className="text-[10px] text-slate-400 leading-relaxed">이 QR을 스캔하면 관리자 패널로 바로 이동합니다. 처음 접속 시 로그인 1회 필요, 이후 30일간 자동 유지됩니다.</p>
              <button
                onClick={() => copyUrl(`${customBase}/admin`)}
                className="mt-2 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition-all"
              >링크 복사</button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen QR */}
      {fullscreen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
          onClick={() => setFullscreen(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-xs text-center"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-black text-gray-900">접속 QR</h3>
              <button onClick={() => setFullscreen(false)} className="p-1.5 rounded-xl hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-white rounded-2xl border-2 border-gray-100 shadow-inner">
                <img src={makeQr(entryUrl, 480)} alt="QR" className="w-80 h-80 rounded-xl" />
              </div>
            </div>
            <div className="mb-3 px-3 py-2 bg-teal-50 border border-teal-200 rounded-xl text-xs text-teal-700">
              스캔 즉시 닉네임 설정 또는 메인 화면으로 진입
            </div>
            <button
              onClick={() => copyUrl(entryUrl)}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold rounded-xl transition-all"
            >링크 복사</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DB Health Tab ────────────────────────────────────────────────────────────
function DbHealthTab({ health, loading, onRefresh, onClearErrors }: { health: DbHealthData | null; loading: boolean; onRefresh: () => void; onClearErrors?: () => Promise<void> }) {
  const hasErrors = (health?.persistErrors ?? 0) > 0;
  const dbUnavailable = health?.db.messages === -1;
  const [clearing, setClearing] = useState(false);

  const CountBox = ({ label, value, sub, warn }: { label: string; value: string | number; sub?: string; warn?: boolean }) => (
    <div className={`rounded-xl border p-3 flex flex-col gap-0.5 ${warn ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</span>
      <span className={`text-2xl font-black tabular-nums ${warn ? 'text-red-600' : 'text-gray-800'}`}>{value}</span>
      {sub && <span className="text-[10px] text-gray-400">{sub}</span>}
    </div>
  );

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DatabaseIcon className="w-4 h-4 text-teal-600" />
          <h2 className="text-sm font-bold text-gray-700">DB 헬스 모니터</h2>
          {hasErrors && (
            <span className="px-2 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full">
              오류 {health!.persistErrors}건
            </span>
          )}
          {!hasErrors && health && (
            <span className="px-2 py-0.5 bg-teal-100 text-teal-700 text-[10px] font-bold rounded-full">정상</span>
          )}
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-gray-100 hover:bg-teal-50 hover:text-teal-700 text-gray-600 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      {/* Error alert banner */}
      {hasErrors && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-red-700">DB 저장 오류 감지</p>
            <p className="text-xs text-red-600 mt-0.5">
              {health!.persistErrors}건의 DB 저장 실패가 누적되어 있습니다.
              In-memory 데이터와 PostgreSQL 간 불일치가 발생했을 수 있습니다.
            </p>
          </div>
          {onClearErrors && (
            <button
              onClick={async () => { setClearing(true); await onClearErrors(); setClearing(false); }}
              disabled={clearing}
              className="flex-shrink-0 px-2.5 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-[11px] font-bold rounded-lg transition-all disabled:opacity-50"
            >
              {clearing ? '초기화 중…' : '초기화'}
            </button>
          )}
        </div>
      )}

      {/* PIN Pool utilization */}
      {health && (() => {
        const { remaining, total } = health.pinPool ?? { remaining: null, total: null };
        if (remaining == null || total == null) return null;
        const used = total - remaining;
        const pct = Math.round((used / total) * 100);
        const isWarn = pct >= 85;
        const barColor = pct >= 95 ? 'bg-red-500' : pct >= 85 ? 'bg-amber-400' : 'bg-teal-400';
        return (
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">PIN 풀 사용량</p>
            {isWarn && (
              <div className="mb-2 bg-amber-50 border border-amber-300 rounded-xl p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-amber-700">PIN 풀 {pct}% 소진 — 즉시 조치 필요</p>
                  <p className="text-xs text-amber-600 mt-0.5">잔여 PIN: {remaining.toLocaleString()}개 / {total.toLocaleString()}개. 새 참가자 등록이 곧 불가능해집니다.</p>
                </div>
              </div>
            )}
            <div className="rounded-xl border bg-white border-gray-200 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>사용 {used.toLocaleString()} / {total.toLocaleString()}개</span>
                <span className={`font-bold ${isWarn ? 'text-amber-600' : 'text-teal-600'}`}>{pct}%</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-gray-100 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
              </div>
              <p className="text-[10px] text-gray-400">잔여: {remaining.toLocaleString()}개</p>
            </div>
          </div>
        );
      })()}

      {/* Last 5-min comparison */}
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-2">최근 5분 활동 (in-memory vs DB)</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border bg-white border-gray-200 p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <MessageCircle className="w-3.5 h-3.5 text-teal-500" />
              <span className="text-xs font-semibold text-gray-600">채팅 메시지</span>
            </div>
            <div className="flex items-end gap-2">
              <div className="text-center">
                <div className="text-xl font-black text-gray-800 tabular-nums">{health?.inMemory.messages ?? '—'}</div>
                <div className="text-[9px] text-gray-400">메모리</div>
              </div>
              <div className="text-gray-300 text-sm mb-0.5">vs</div>
              <div className="text-center">
                <div className={`text-xl font-black tabular-nums ${dbUnavailable ? 'text-gray-400' : 'text-gray-800'}`}>
                  {dbUnavailable ? '—' : (health?.db.messages ?? '—')}
                </div>
                <div className="text-[9px] text-gray-400">DB</div>
              </div>
              {!dbUnavailable && health && health.inMemory.messages !== health.db.messages && (
                <span className="ml-auto text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                  불일치
                </span>
              )}
            </div>
          </div>

          <div className="rounded-xl border bg-white border-gray-200 p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <Heart className="w-3.5 h-3.5 text-rose-500" />
              <span className="text-xs font-semibold text-gray-600">하트</span>
            </div>
            <div className="flex items-end gap-2">
              <div className="text-center">
                <div className="text-xl font-black text-gray-800 tabular-nums">{health?.inMemory.likes ?? '—'}</div>
                <div className="text-[9px] text-gray-400">메모리</div>
              </div>
              <div className="text-gray-300 text-sm mb-0.5">vs</div>
              <div className="text-center">
                <div className={`text-xl font-black tabular-nums ${dbUnavailable ? 'text-gray-400' : 'text-gray-800'}`}>
                  {dbUnavailable ? '—' : (health?.db.likes ?? '—')}
                </div>
                <div className="text-[9px] text-gray-400">DB</div>
              </div>
              {!dbUnavailable && health && health.inMemory.likes !== health.db.likes && (
                <span className="ml-auto text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                  불일치
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <CountBox
          label="누적 오류"
          value={health?.persistErrors ?? '—'}
          sub="DB에 영구 저장됨"
          warn={hasErrors}
        />
        <CountBox
          label="SSE 연결"
          value={health?.sseConnections ?? '—'}
          sub="현재 연결된 클라이언트"
        />
        <CountBox
          label="DB 상태"
          value={dbUnavailable ? '오류' : '정상'}
          sub={dbUnavailable ? 'DB 쿼리 실패' : '쿼리 성공'}
          warn={dbUnavailable}
        />
      </div>

      {/* Recent error log */}
      {hasErrors && health!.recentErrors.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2">최근 오류 로그 (최대 10건)</p>
          <div className="rounded-xl border border-red-200 bg-red-50 divide-y divide-red-100 overflow-hidden">
            {health!.recentErrors.map((e, i) => (
              <div key={i} className="px-3 py-2">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">{e.table}</span>
                  <span className="text-[10px] text-gray-400">{new Date(e.time).toLocaleTimeString('ko-KR')}</span>
                </div>
                <p className="text-[10px] text-red-600 break-all">{e.msg}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      {health && (
        <p className="text-[10px] text-gray-400 text-center flex items-center justify-center gap-1">
          <Activity className="w-3 h-3" />
          마지막 확인: {new Date(health.checkedAt).toLocaleTimeString('ko-KR')} · 30초마다 자동 갱신
        </p>
      )}
      {!health && !loading && (
        <p className="text-sm text-gray-400 text-center py-4">데이터를 불러오지 못했습니다. 새로고침을 눌러주세요.</p>
      )}
    </div>
  );
}


// ─── Dashboard Tab ────────────────────────────────────────────────────────────

function DashboardTab({ settings, profiles, onToggleSession, onEventEndReset, onToggleFunctionsLock,
  onClearLikes, onClearChats, onClearProfiles, onClearHistory,
  restoreMap, onDrainUnusedHearts }: {
  settings: AppSettings | null; profiles: Profile[];
  onToggleSession: () => void; onEventEndReset: () => void;
  onToggleFunctionsLock: () => void;
  onClearLikes: () => Promise<void>;
  onClearChats: () => Promise<void>;
  onClearProfiles: () => Promise<void>;
  onClearHistory: () => Promise<void>;
  restoreMap: Map<string, () => Promise<void>>;
  onDrainUnusedHearts: () => Promise<{ nickname: string; count: number }[]>;
}) {
  const [confirmToggle, setConfirmToggle] = useState(false);
  const [confirmEventEnd, setConfirmEventEnd] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [drainResult, setDrainResult] = useState<{ nickname: string; count: number }[] | null>(null);
  const [draining, setDraining] = useState(false);
  const isActive = settings?.session_active ?? false;
  const isFunctionsLocked = (settings as any)?.functions_locked ?? false;

  return (
    <div className="space-y-5 p-5">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '참여자', value: profiles.length, color: 'bg-cyan-50 text-cyan-700' },
        ].map((stat) => (
          <div key={stat.label} className={`${stat.color} rounded-2xl p-5 text-center`}>
            <div className="text-2xl font-black">{stat.value}</div>
            <div className="text-xs font-semibold mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Session control */}
      <div>
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 px-1">회식 세션</h3>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => !isActive && setConfirmToggle(true)}
            disabled={isActive}
            className={`rounded-2xl p-4 border-2 flex flex-col items-center gap-2 transition-all ${
              !isActive
                ? 'bg-teal-50 border-teal-300 hover:bg-teal-100 active:scale-95 cursor-pointer shadow-sm'
                : 'bg-slate-50 border-slate-200 opacity-35 cursor-not-allowed'
            }`}
          >
            <PlayCircle className={`w-7 h-7 ${!isActive ? 'text-teal-500' : 'text-slate-400'}`} />
            <span className={`text-sm font-black ${!isActive ? 'text-teal-700' : 'text-slate-400'}`}>회식 시작</span>
            <span className={`text-[10px] font-medium ${!isActive ? 'text-teal-500' : 'text-slate-400'}`}>
              {isActive ? '진행 중' : '클릭하여 세션 열기'}
            </span>
          </button>
          <button
            onClick={() => isActive && setConfirmToggle(true)}
            disabled={!isActive}
            className={`rounded-2xl p-4 border-2 flex flex-col items-center gap-2 transition-all ${
              isActive
                ? 'bg-red-50 border-red-300 hover:bg-red-100 active:scale-95 cursor-pointer shadow-sm'
                : 'bg-slate-50 border-slate-200 opacity-35 cursor-not-allowed'
            }`}
          >
            <StopCircle className={`w-7 h-7 ${isActive ? 'text-red-500' : 'text-slate-400'}`} />
            <span className={`text-sm font-black ${isActive ? 'text-red-700' : 'text-slate-400'}`}>회식 종료</span>
            <span className={`text-[10px] font-medium ${isActive ? 'text-red-500' : 'text-slate-400'}`}>
              {isActive ? '클릭하여 세션 닫기' : '대기 중'}
            </span>
          </button>
        </div>
      </div>

      {/* 잠금 제어 */}
      <div>
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 px-1">잠금 제어</h3>
        <div className="space-y-2">
          {/* 기능 잠금 (functions_locked) */}
          <button
            onClick={onToggleFunctionsLock}
            className={`w-full rounded-2xl p-4 border-2 flex items-center gap-3 transition-all active:scale-[0.98] shadow-sm ${
              isFunctionsLocked ? 'bg-red-50 border-red-300 hover:bg-red-100' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isFunctionsLocked ? 'bg-red-500' : 'bg-slate-400'}`}>
              {isFunctionsLocked ? <Lock className="w-5 h-5 text-white" /> : <Unlock className="w-5 h-5 text-white" />}
            </div>
            <div className="flex-1 text-left">
              <p className={`font-black text-sm ${isFunctionsLocked ? 'text-red-700' : 'text-slate-700'}`}>
                {isFunctionsLocked ? '🔒 채팅·기능 잠금 중' : '💬 채팅·기능 열려있음'}
              </p>
              <p className={`text-[10px] mt-0.5 ${isFunctionsLocked ? 'text-red-500' : 'text-slate-400'}`}>
                {isFunctionsLocked ? '하트·채팅·요청·게임 사용 불가 — 탭하여 해제' : '하트·채팅·요청·게임·운세 모두 사용 가능 — 탭하여 잠금'}
              </p>
            </div>
            <div className={`relative w-10 h-6 rounded-full transition-all flex-shrink-0 ${isFunctionsLocked ? 'bg-red-500' : 'bg-slate-300'}`}>
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${isFunctionsLocked ? 'left-4' : 'left-0.5'}`} />
            </div>
          </button>
        </div>
      </div>


      {/* 💛 하트 드레인 시스템 */}
      <div>
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 px-1">💛 하트 차감</h3>
        <div className="rounded-2xl border-2 border-yellow-200 bg-yellow-50 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-yellow-800">하트 개수 자동 차감</p>
              <p className="text-[10px] text-yellow-600 mt-0.5 leading-relaxed">
                {(settings as any)?.heart_drain_enabled
                  ? `✅ 활성 — ${(settings as any)?.heart_drain_minutes ?? 5}분마다 하트 1개 차감`
                  : '⏸️ 비활성 — 하트 개수가 줄지 않음'}
              </p>
            </div>
            <button
              onClick={async () => {
                const newVal = !((settings as any)?.heart_drain_enabled ?? false);
                await adminApiRpc('admin_update_settings', {
                  p_admin_password: settings?.admin_password ?? '',
                  p_payload: { heart_drain_enabled: newVal },
                }).catch(console.error);
              }}
              className={`relative w-10 h-6 rounded-full transition-all flex-shrink-0 ${(settings as any)?.heart_drain_enabled ? 'bg-yellow-500' : 'bg-slate-300'}`}
            >
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${(settings as any)?.heart_drain_enabled ? 'left-4' : 'left-0.5'}`} />
            </button>
          </div>

          <div>
            <label className="text-[10px] font-black text-yellow-700 block mb-1">차감 간격 (분)</label>
            <input
              type="number" min={1} max={60}
              defaultValue={(settings as any)?.heart_drain_minutes ?? 5}
              onBlur={async (e) => {
                const v = Math.max(1, Math.min(60, parseInt(e.target.value) || 5));
                e.target.value = String(v);
                await adminApiRpc('admin_update_settings', {
                  p_admin_password: settings?.admin_password ?? '',
                  p_payload: { heart_drain_minutes: v },
                }).catch(console.error);
              }}
              className="w-full rounded-xl border border-yellow-300 bg-white px-3 py-1.5 text-sm font-bold text-yellow-900 focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
          </div>

          {/* 미사용 하트 회수 */}
          <button
            disabled={draining}
            onClick={async () => {
              setDraining(true);
              setDrainResult(null);
              try {
                const result = await onDrainUnusedHearts();
                setDrainResult(result);
              } finally { setDraining(false); }
            }}
            className="w-full rounded-xl py-2 px-3 bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-black active:scale-95 transition-all shadow-sm disabled:opacity-50"
          >{draining ? '회수 중…' : '💸 미사용 하트 회수'}</button>

          {/* 회수 결과 */}
          {drainResult !== null && (
            <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-3 max-h-40 overflow-y-auto">
              {drainResult.length === 0
                ? <p className="text-xs text-yellow-700 font-bold">✅ 회수 대상 없음 (모두 하트 사용했거나 이미 0개)</p>
                : <>
                    <p className="text-[10px] font-black text-yellow-800 mb-2">🗂 {drainResult.length}명 회수됨</p>
                    {drainResult.map((r, i) => (
                      <div key={i} className="flex justify-between text-[10px] text-yellow-900">
                        <span>{r.nickname}</span><span className="font-bold">−{r.count}개</span>
                      </div>
                    ))}
                  </>
              }
            </div>
          )}
        </div>
      </div>

      {/* 데이터 초기화 */}
      <div>
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 px-1">데이터 초기화 / 복구</h3>
        <div className="space-y-2.5">
          {([
            { key: 'likes', emoji: '❤️', label: '하트', desc: '모든 하트 기록 삭제', bg: 'bg-pink-50 border-pink-200 hover:bg-pink-100', title: '하트 초기화', msg: '모든 하트(좋아요) 기록을 삭제합니다.', fn: onClearLikes },
            { key: 'chats', emoji: '💬', label: '채팅', desc: '채팅·메시지 전체 삭제', bg: 'bg-teal-50 border-teal-200 hover:bg-teal-100', title: '채팅 초기화', msg: '모든 채팅방과 메시지를 삭제합니다.', fn: onClearChats },
            { key: 'profiles', emoji: '👤', label: '참여자', desc: '모든 프로필 삭제', bg: 'bg-indigo-50 border-indigo-200 hover:bg-indigo-100', title: '참여자 초기화', msg: '모든 참여자 프로필을 삭제합니다. 좌석도 함께 비워집니다.', fn: onClearProfiles },
            { key: 'history', emoji: '📋', label: '이력', desc: '회식 이력 모두 삭제', bg: 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100', title: '이력 초기화', msg: '저장된 회식 이력을 모두 삭제합니다.', fn: onClearHistory },
          ] as const).map(item => {
            const hasRestore = restoreMap.has(item.key);
            return (
              <div key={item.label} className="flex gap-1.5">
                <button
                  onClick={() => setConfirmAction({ title: item.title, message: item.msg, onConfirm: item.fn })}
                  className={`flex-1 rounded-2xl px-3 py-2.5 border-2 flex items-center gap-2.5 transition-all active:scale-[0.97] text-left ${item.bg}`}
                >
                  <span className="text-lg leading-none flex-shrink-0">{item.emoji}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-gray-800 leading-tight">{item.label} 초기화</p>
                    <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{item.desc}</p>
                  </div>
                </button>
                <button
                  onClick={() => hasRestore && restoreMap.get(item.key)!()}
                  disabled={!hasRestore}
                  className={`flex-shrink-0 w-14 rounded-2xl border-2 flex flex-col items-center justify-center gap-0.5 transition-all text-center ${
                    hasRestore
                      ? 'bg-teal-50 border-teal-300 text-teal-700 hover:bg-teal-100 active:scale-95 cursor-pointer'
                      : 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed opacity-50'
                  }`}
                >
                  <span className="text-base leading-none">↩</span>
                  <span className="text-[9px] font-black leading-tight">복구</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 회식 종료 전체 초기화 */}
      <div className="rounded-2xl p-5 border-2 border-red-300 bg-red-50">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-xs font-black text-red-600 bg-red-100 border border-red-300 px-2 py-0.5 rounded-full">위험</span>
              <h3 className="font-bold text-red-900 text-sm">회식 종료 전체 초기화</h3>
            </div>
            <p className="text-xs text-red-600 mt-0.5 font-semibold">좌석·참여자·하트·채팅·공지·게임·건의·이력 모두 삭제 — 복구 불가</p>
          </div>
          <button onClick={() => setConfirmEventEnd(true)}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-xl font-semibold text-sm hover:bg-red-700 transition-all border-2 border-red-800">
            <Trash2 className="w-4 h-4" />
            전체 초기화
          </button>
        </div>
      </div>

      {confirmToggle && (
        <ConfirmDialog
          title={isActive ? '회식을 종료하시겠습니까?' : '회식을 시작하시겠습니까?'}
          message={isActive ? '종료 시 모든 유저 화면이 "회식 종료 대기 화면"으로 전환됩니다.' : '시작 시 유저들이 앱에 입장할 수 있습니다.'}
          onConfirm={() => { setConfirmToggle(false); onToggleSession(); }}
          onCancel={() => setConfirmToggle(false)}
        />
      )}
      {confirmAction && (
        <ConfirmDialog
          title={confirmAction.title}
          message={confirmAction.message}
          danger
          onConfirm={() => { confirmAction.onConfirm(); setConfirmAction(null); }}
          onCancel={() => setConfirmAction(null)}
        />
      )}
      {confirmEventEnd && (
        <ConfirmDialog title="회식 종료 전체 초기화"
          message={`좌석 · 참여자 · 하트 · 채팅 · 공지 · 게임 · 건의 · 이력\n모든 데이터를 초기화합니다.\n\n진짜로 전체 초기화하시겠습니까?`}
          danger
          onConfirm={() => { setConfirmEventEnd(false); onEventEndReset(); }}
          onCancel={() => setConfirmEventEnd(false)}
        />
      )}
    </div>
  );
}

// ─── Hearts Tab ───────────────────────────────────────────────────────────────

function HeartsTab({ likes, profileMap, onClear, onRefresh }: { likes: Like[]; profileMap: Map<string, Profile>; onClear: () => void; onRefresh: () => Promise<void> }) {
  const [confirm, setConfirm] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshDone, setRefreshDone] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
    setRefreshDone(true);
    setTimeout(() => setRefreshDone(false), 2000);
  };

  if (likes.length === 0) {
    return (
      <div className="p-8 text-center">
        <Heart className="w-12 h-12 mx-auto mb-3 text-gray-200" />
        <p className="text-sm text-gray-400 mb-4">아직 하트 기록이 없습니다.</p>
        <button onClick={handleRefresh} disabled={refreshing}
          className={`flex items-center gap-1.5 mx-auto px-4 py-2 text-xs font-bold rounded-xl transition-all disabled:opacity-50 ${refreshDone ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}>
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />{refreshDone ? '완료!' : refreshing ? '로딩...' : '새로고침'}
        </button>
      </div>
    );
  }
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between px-1 mb-2">
        <div className="flex items-center gap-2">
          <Heart className="w-4 h-4 text-rose-400 fill-rose-400" />
          <span className="text-sm font-bold text-gray-700">총 {likes.length}개의 하트</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleRefresh} disabled={refreshing}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition-all disabled:opacity-50 ${refreshDone ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'bg-gray-100 hover:bg-teal-50 hover:text-teal-700 text-gray-600'}`}>
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />{refreshDone ? '완료!' : refreshing ? '로딩...' : '새로고침'}
          </button>
          <button onClick={() => setConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl hover:bg-rose-100 transition-all">
            <Trash2 className="w-3 h-3" />이력 삭제
          </button>
        </div>
      </div>
      <div className="bg-white rounded-xl overflow-hidden border border-gray-100 shadow-sm">
        <div className="grid grid-cols-3 px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
          <span>보낸 사람</span>
          <span className="text-center">→</span>
          <span className="text-right">받은 사람</span>
        </div>
        {likes.map((like) => {
          const liker = profileMap.get(like.liker_id);
          const liked = profileMap.get(like.liked_id);
          const ht = like.heart_type ?? 'red';
          const htMeta = ht === 'blue' ? { emoji: '💙', color: 'text-blue-400 fill-blue-400', label: '친구' }
            : ht === 'pink' ? { emoji: '💗', color: 'text-pink-400 fill-pink-400', label: '뜨밤' }
            : ht === 'green' ? { emoji: '💚', color: 'text-emerald-400 fill-emerald-400', label: '칭찬' }
            : { emoji: '❤️', color: 'text-rose-400 fill-rose-400', label: '호감' };
          return (
            <div key={like.id} className="grid grid-cols-3 items-center px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-2">
                {liker && (
                  <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0">
                    <img src={liker.photo_url} alt={liker.nickname} className="w-full h-full object-cover" />
                  </div>
                )}
                <span className="text-sm font-semibold text-gray-800 truncate">{liker?.nickname ?? '알 수 없음'}</span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <Heart className={`w-4 h-4 ${htMeta.color}`} />
                <span className="text-[9px] font-bold text-gray-400">{htMeta.label}</span>
              </div>
              <div className="flex items-center gap-2 justify-end">
                <span className="text-sm font-semibold text-gray-800 truncate">{liked?.nickname ?? '알 수 없음'}</span>
                {liked && (
                  <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0">
                    <img src={liked.photo_url} alt={liked.nickname} className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-400 px-1">하트 현황은 실시간으로 갱신됩니다.</p>
      {confirm && (
        <ConfirmDialog title="하트 이력 삭제"
          message="모든 하트 기록을 삭제합니다. 이 작업은 되돌릴 수 없습니다."
          danger
          onConfirm={() => { setConfirm(false); onClear(); }}
          onCancel={() => setConfirm(false)}
        />
      )}
    </div>
  );
}

// ─── Popularity Tab ───────────────────────────────────────────────────────────


function PopularityTab({ likes, profileMap }: { likes: Like[]; profileMap: Map<string, Profile> }) {
  const stats = new Map<string, { total: number; byType: Record<string, number> }>();
  for (const like of likes) {
    const ht = like.heart_type ?? 'red';
    const cur = stats.get(like.liked_id) ?? { total: 0, byType: {} };
    cur.total++;
    cur.byType[ht] = (cur.byType[ht] ?? 0) + 1;
    stats.set(like.liked_id, cur);
  }
  const ranked = [...stats.entries()]
    .map(([id, s]) => ({ profile: profileMap.get(id), ...s }))
    .filter(r => r.profile)
    .sort((a, b) => b.total - a.total);
  const maxTotal = ranked.length > 0 ? ranked[0].total : 1;
  const allTypes = ['red', 'blue', 'pink', 'green'];

  if (ranked.length === 0) {
    return (
      <div className="p-8 text-center">
        <Sparkles className="w-12 h-12 mx-auto mb-3 text-gray-200" />
        <p className="text-sm text-gray-400">아직 하트가 없습니다. 하트가 오가면 여기에 실시간 인기 순위가 표시됩니다.</p>
      </div>
    );
  }
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 px-1 mb-2">
        <Sparkles className="w-4 h-4 text-amber-400" />
        <span className="text-sm font-bold text-gray-700">하트 많이 받은 사람 TOP {ranked.length}</span>
      </div>
      <p className="text-xs text-gray-400 px-1 -mt-2">누가 보냈는지는 공개되지 않습니다. 받은 하트 종류별 통계만 표시됩니다.</p>
      <div className="space-y-2">
        {ranked.map((r, i) => {
          const rank = i + 1;
          const pct = Math.round((r.total / maxTotal) * 100);
          const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`;
          return (
            <div key={r.profile!.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
              <div className="flex items-center gap-3 mb-2">
                <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-black ${rank <= 3 ? 'bg-amber-50' : 'bg-gray-100 text-gray-500'}`}>{medal}</span>
                <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0">
                  <img src={r.profile!.photo_url} alt={r.profile!.nickname} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{r.profile!.nickname}</p>
                  <p className="text-xs text-gray-400">총 {r.total}개</p>
                </div>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden mb-2">
                <div className="h-full bg-gradient-to-r from-rose-400 via-pink-400 to-amber-400 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {allTypes.map(t => {
                  const c = r.byType[t] ?? 0;
                  if (c === 0) return null;
                  const m = HEART_TYPE_META[t];
                  return (
                    <span key={t} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${m.bg} ${m.color}`}>
                      <span>{m.emoji}</span>{c}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-400 px-1">실시간으로 갱신됩니다.</p>
    </div>
  );
}

// ─── Chats Tab ────────────────────────────────────────────────────────────────

function ChatsTab({ chats, messages, profileMap, onDeleteChat, onClearAll, onRefresh }: {
  chats: Chat[]; messages: Message[]; profileMap: Map<string, Profile>;
  onDeleteChat: (chatId: string) => Promise<void>;
  onClearAll: () => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshDone, setRefreshDone] = useState(false);
  const [_deleting, setDeleting] = useState(false);

  const messagesByChat = new Map<string, Message[]>();
  for (const msg of messages) {
    if (!messagesByChat.has(msg.chat_id)) messagesByChat.set(msg.chat_id, []);
    messagesByChat.get(msg.chat_id)!.push(msg);
  }

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
    setRefreshDone(true);
    setTimeout(() => setRefreshDone(false), 2000);
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    await onDeleteChat(confirmDelete);
    setDeleting(false);
    setConfirmDelete(null);
    setExpandedId(null);
  };

  const doClearAll = async () => {
    setClearingAll(true);
    await onClearAll();
    setClearingAll(false);
    setConfirmClearAll(false);
    setExpandedId(null);
  };

  if (chats.length === 0) {
    return (
      <div className="p-8 text-center">
        <MessageCircle className="w-12 h-12 mx-auto mb-3 text-gray-200" />
        <p className="text-sm text-gray-400 mb-4">아직 채팅 기록이 없습니다.</p>
        <button onClick={handleRefresh} disabled={refreshing}
          className={`flex items-center gap-1.5 mx-auto px-4 py-2 text-xs font-bold rounded-xl transition-all disabled:opacity-50 ${refreshDone ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}>
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />{refreshDone ? '완료!' : refreshing ? '로딩...' : '새로고침'}
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between px-1 mb-2">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-cyan-500" />
          <span className="text-sm font-bold text-gray-700">총 {chats.length}개의 채팅방 · {messages.length}개 메시지</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleRefresh} disabled={refreshing}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition-all disabled:opacity-50 ${refreshDone ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'bg-gray-100 hover:bg-teal-50 hover:text-teal-700 text-gray-600'}`}>
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />{refreshDone ? '완료!' : refreshing ? '로딩...' : '새로고침'}
          </button>
          <button onClick={() => setConfirmClearAll(true)} disabled={clearingAll || chats.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl hover:bg-rose-100 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            <Trash2 className="w-3 h-3" />{clearingAll ? '삭제 중...' : '전체 이력 삭제'}
          </button>
        </div>
      </div>
      {chats.map((chat) => {
        const u1 = profileMap.get(chat.user1_id);
        const u2 = profileMap.get(chat.user2_id);
        const chatMessages = messagesByChat.get(chat.id) ?? [];
        const lastMsg = chatMessages[chatMessages.length - 1];
        const isOpen = expandedId === chat.id;
        return (
          <div key={chat.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {/* ⚠️ 버튼 중첩 방지: 외부 클릭 영역(div)과 삭제 버튼을 분리 */}
            <div className="flex items-center">
              <div
                role="button"
                tabIndex={0}
                className="flex-1 flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left cursor-pointer min-w-0"
                onClick={() => setExpandedId(isOpen ? null : chat.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpandedId(isOpen ? null : chat.id); }}
              >
                <div className="flex -space-x-2 flex-shrink-0">
                  {u1 && <div className="w-8 h-8 rounded-full overflow-hidden ring-2 ring-white"><img src={u1.photo_url} alt={u1.nickname} className="w-full h-full object-cover" /></div>}
                  {u2 && <div className="w-8 h-8 rounded-full overflow-hidden ring-2 ring-white"><img src={u2.photo_url} alt={u2.nickname} className="w-full h-full object-cover" /></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900">
                    {u1?.nickname ?? '?'} ↔ {u2?.nickname ?? '?'}
                  </p>
                  {lastMsg && (
                    <p className="text-xs text-gray-400 truncate">
                      {lastMsg.image_url ? '[이미지]' : lastMsg.content} · {chatMessages.length}개 메시지
                    </p>
                  )}
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
              </div>
              <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(chat.id); }}
                className="flex-shrink-0 p-1.5 mr-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            {isOpen && (
              <div className="border-t border-gray-100 max-h-80 overflow-y-auto">
                {chatMessages.length === 0 ? (
                  <p className="text-center text-xs text-gray-400 py-4">메시지가 없습니다.</p>
                ) : (
                  <div className="p-3 space-y-2">
                    {chatMessages.map((msg) => {
                      const sender = profileMap.get(msg.sender_id);
                      return (
                        <div key={msg.id} className="flex items-start gap-2">
                          {sender && (
                            <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0 mt-0.5">
                              <img src={sender.photo_url} alt={sender.nickname} className="w-full h-full object-cover" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-bold text-gray-600">{sender?.nickname ?? '?'}</span>
                            <span className="text-xs text-gray-400 ml-1.5">
                              {new Date(msg.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {msg.image_url ? (
                              <img src={msg.image_url} alt="이미지" className="mt-1 max-w-[120px] rounded-lg border border-gray-200" />
                            ) : (
                              <p className="text-sm text-gray-800 break-words">{msg.content}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      {confirmDelete && (
        <ConfirmDialog title="채팅방 삭제"
          message="이 채팅방과 모든 메시지가 삭제됩니다. 되돌릴 수 없습니다."
          danger
          onConfirm={doDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
      {confirmClearAll && (
        <ConfirmDialog title="채팅 전체 이력 삭제"
          message="모든 채팅방과 메시지를 영구 삭제합니다. 이 작업은 되돌릴 수 없습니다."
          danger
          confirmText="전체삭제"
          onConfirm={doClearAll}
          onCancel={() => setConfirmClearAll(false)}
        />
      )}
    </div>
  );
}

// ─── Game Tab ─────────────────────────────────────────────────────────────────

function ProfilesTabSection({ profiles, settings: _settings, onClear, onDeleteProfile }: {
  profiles: Profile[];
  settings: AppSettings | null;
  onClear: () => void;
  onDeleteProfile: (id: string) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [search, setSearch] = useState('');

  const q = search.trim().toLowerCase();
  const filtered = q
    ? profiles.filter(p => {
        return (
          p.nickname?.toLowerCase().includes(q) ||
          (p.mbti ?? '').toLowerCase().includes(q) ||
          (p.location ?? '').toLowerCase().includes(q) ||
          ((p as any).bio ?? '').toLowerCase().includes(q) ||
          ((p as any).pin_code ?? '').includes(q)
        );
      })
    : profiles;

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-cyan-500" />
          <span className="text-sm font-bold text-gray-700">
            참여자 {q ? <>{filtered.length}<span className="font-normal text-gray-400">/{profiles.length}</span></> : profiles.length}명
          </span>
        </div>
        {profiles.length > 0 && (
          <button onClick={() => setConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition-all">
            <Trash2 className="w-3 h-3" />전체 초기화
          </button>
        )}
      </div>
      {/* 검색 */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="닉네임, MBTI, 지역, 관심사, 좌석, 고유번호 검색…"
          className="w-full pl-8 pr-8 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-cyan-400 focus:bg-white transition-all"
        />
        {search && (
          <button onClick={() => setSearch('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="space-y-2.5">
        {filtered.map((p) => {
          const posLabel = getPositionLabel(p.personality_score ?? 50);
          const domLabel = p.dom_sub_score !== null ? getDomSubLabel(p.dom_sub_score) : null;
          const age = p.birth_year ? getKoreanAge(p.birth_year) : null;
          const bioTags = (p.bio ?? '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 3);
          const initial = (p.nickname ?? '?')[0];
          return (
            <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3">
              {/* 원형 아바타 */}
              <div className="relative flex-shrink-0 w-10 h-10">
                {p.photo_url ? (
                  <img
                    src={p.photo_url}
                    alt={p.nickname ?? ''}
                    onError={e => {
                      e.currentTarget.style.display = 'none';
                      const fb = e.currentTarget.nextElementSibling as HTMLElement | null;
                      if (fb) fb.style.display = 'flex';
                    }}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : null}
                <div
                  className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-teal-500 items-center justify-center"
                  style={{ display: p.photo_url ? 'none' : 'flex' }}
                >
                  <span className="text-white text-sm font-black leading-none">{initial}</span>
                </div>
                <button
                  onClick={() => setDeleteTarget(p)}
                  className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow transition-all"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>

              {/* 닉네임 + 태그 2행 */}
              <div className="flex-1 min-w-0">
                <p className="font-black text-[13px] text-gray-900 leading-tight truncate mb-1.5">
                  {p.nickname ?? '(이름 없음)'}
                </p>
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[9px] font-bold bg-cyan-50 text-cyan-700 border border-cyan-100 px-1.5 py-0.5 rounded-full">{posLabel}</span>
                  {p.mbti && <span className="text-[9px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100 px-1.5 py-0.5 rounded-full">{p.mbti}</span>}
                  {domLabel && <span className="text-[9px] font-bold bg-rose-50 text-rose-600 border border-rose-100 px-1.5 py-0.5 rounded-full">{domLabel}</span>}
                  {age && <span className="text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-100 px-1.5 py-0.5 rounded-full">{age}</span>}
                  {p.location && <span className="text-[9px] font-bold bg-green-50 text-green-700 border border-green-100 px-1.5 py-0.5 rounded-full">{p.location}</span>}
                  {bioTags.map(tag => (
                    <span key={tag} className="text-[9px] text-gray-500 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded-full">{tag}</span>
                  ))}
                </div>
              </div>

              {/* 고유번호 + 차단 해제 */}
              <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
                <div className="bg-teal-50 border border-teal-200 rounded-xl px-3 py-1.5">
                  <span className="text-teal-700 font-black text-sm tabular-nums tracking-widest">{p.pin_code ?? '—'}</span>
                </div>
              </div>
            </div>
          );
        })}
        {profiles.length === 0 && (
          <div className="py-12 text-center text-gray-400 text-sm">참여자가 없습니다.</div>
        )}
      </div>
      {confirm && (
        <ConfirmDialog title="참여자 초기화"
          message="모든 참여자 프로필을 삭제합니다."
          danger
          onConfirm={() => { setConfirm(false); onClear(); }}
          onCancel={() => setConfirm(false)}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog title="참여자 삭제"
          message={`"${deleteTarget.nickname}" 프로필을 삭제합니다.`}
          danger
          onConfirm={() => { onDeleteProfile(deleteTarget.id); setDeleteTarget(null); }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function CredentialsTab({ settings, onSave, onSaveEntry, onSaveReset, onSaveTest }: {
  settings: AppSettings | null;
  onSave: (phone: string, password: string) => void;
  onSaveEntry: (entryPassword: string) => void;
  onSaveReset: (resetPassword: string) => void;
  onSaveTest: (pw: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<'admin' | 'entry' | 'reset' | 'test'>('admin');
  // Admin tab state
  const [phone, setPhone] = useState(settings?.admin_phone ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [savedAdmin, setSavedAdmin] = useState(false);
  const [errAdmin, setErrAdmin] = useState('');
  // Entry password tab state
  const [entryPw, setEntryPw] = useState('');
  const [entryConfirm, setEntryConfirm] = useState('');
  const [showEntryPw, setShowEntryPw] = useState(false);
  const [savedEntry, setSavedEntry] = useState(false);
  const [errEntry, setErrEntry] = useState('');
  // Reset password tab state
  const [resetPw, setResetPw] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [showResetPw, setShowResetPw] = useState(false);
  const [savedReset, setSavedReset] = useState(false);
  const [errReset, setErrReset] = useState('');
  // Test password tab state
  const [testPw, setTestPw] = useState('');
  const [testConfirm, setTestConfirm] = useState('');
  const [showTestPw, setShowTestPw] = useState(false);
  const [savedTest, setSavedTest] = useState(false);
  const [errTest, setErrTest] = useState('');

  const formatPhone = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  };

  const handleSaveAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrAdmin('');
    if (password.length < 4) { setErrAdmin('비밀번호는 4자 이상이어야 합니다.'); return; }
    if (password !== confirm) { setErrAdmin('비밀번호 확인이 일치하지 않습니다.'); return; }
    onSave(phone, password);
    setSavedAdmin(true);
    setPassword(''); setConfirm('');
    setTimeout(() => setSavedAdmin(false), 2500);
  };

  const handleSaveEntryPw = (e: React.FormEvent) => {
    e.preventDefault();
    setErrEntry('');
    if (entryPw.length < 4) { setErrEntry('입장 코드는 4자 이상이어야 합니다.'); return; }
    if (entryPw !== entryConfirm) { setErrEntry('입장 코드 확인이 일치하지 않습니다.'); return; }
    onSaveEntry(entryPw);
    setSavedEntry(true);
    setEntryPw(''); setEntryConfirm('');
    setTimeout(() => setSavedEntry(false), 2500);
  };

  return (
    <div className="p-4 space-y-4 max-w-md">
      {/* 탭 선택 */}
      <div className="grid grid-cols-2 gap-2">
        {([
          { id: 'admin' as const, label: '🔑 관리자 설정', desc: '전화번호·비밀번호' },
          { id: 'entry' as const, label: '🚪 입장 코드', desc: '참여자 입장 코드' },
          { id: 'reset' as const, label: '🔄 처음으로', desc: '술번개 재시작 코드' },
          { id: 'test' as const, label: '🧪 테스트 코드', desc: '테스트 전용 접속 코드' },
        ]).map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`rounded-2xl p-3 border-2 text-left transition-all active:scale-[0.98] ${activeTab === t.id ? 'border-slate-700 bg-slate-800 text-white' : 'border-gray-200 bg-gray-50 hover:border-gray-300'}`}>
            <p className={`text-xs font-black ${activeTab === t.id ? 'text-white' : 'text-gray-700'}`}>{t.label}</p>
            <p className={`text-[10px] mt-0.5 ${activeTab === t.id ? 'text-slate-300' : 'text-gray-400'}`}>{t.desc}</p>
          </button>
        ))}
      </div>

      {activeTab === 'admin' && (
        <form onSubmit={handleSaveAdmin} className="space-y-4">
          <div className="bg-amber-50 rounded-xl p-3 border border-amber-200 text-xs text-amber-700 leading-relaxed">
            관리자 접속 정보를 변경합니다. 저장 후 자동 로그아웃되지 않으므로 기억해 두세요.
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">관리자 전화번호</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-slate-500 outline-none" required />
            <p className="text-[11px] text-gray-400 mt-1">현재: {settings?.admin_phone ?? '–'}</p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">새 관리자 비밀번호</label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="새 비밀번호 입력 (4자 이상)"
                className="w-full px-4 py-3 pr-11 border border-gray-200 rounded-xl focus:ring-2 focus:ring-slate-500 outline-none" required minLength={4} />
              <button type="button" onClick={() => setShowPw(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">비밀번호 확인</label>
            <input type={showPw ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)}
              placeholder="비밀번호 재입력"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-slate-500 outline-none" required />
          </div>
          {errAdmin && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />{errAdmin}
            </div>
          )}
          <button type="submit"
            className={`w-full py-3 font-semibold rounded-xl transition-all ${savedAdmin ? 'bg-teal-500 text-white' : 'bg-slate-800 text-white hover:bg-slate-700'}`}>
            {savedAdmin ? '✓ 저장 완료!' : '변경 저장'}
          </button>
        </form>
      )}

      {activeTab === 'entry' && (
        <form onSubmit={handleSaveEntryPw} className="space-y-4">
          <div className="bg-sky-50 rounded-xl p-3 border border-sky-200 text-xs text-sky-700 leading-relaxed">
            참여자가 앱 입장 시 입력해야 하는 코드입니다. 설정하면 코드 없이는 프로필 등록이 불가합니다.
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">현재 입장 코드</label>
            <p className="text-sm font-black text-gray-800 bg-gray-50 rounded-xl px-4 py-3 border border-gray-200 tracking-widest">
              {settings?.entry_password ? settings.entry_password : '(설정 없음 — 누구나 입장 가능)'}
            </p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">새 입장 코드</label>
            <div className="relative">
              <input type={showEntryPw ? 'text' : 'password'} value={entryPw} onChange={(e) => setEntryPw(e.target.value)}
                placeholder="새 입장 코드 입력 (4자 이상)"
                className="w-full px-4 py-3 pr-11 border border-gray-200 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none" required minLength={4} />
              <button type="button" onClick={() => setShowEntryPw(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showEntryPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">코드 확인</label>
            <input type={showEntryPw ? 'text' : 'password'} value={entryConfirm} onChange={(e) => setEntryConfirm(e.target.value)}
              placeholder="입장 코드 재입력"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none" required />
          </div>
          {errEntry && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />{errEntry}
            </div>
          )}
          <div className="flex gap-2">
            <button type="submit"
              className={`flex-1 py-3 font-semibold rounded-xl transition-all ${savedEntry ? 'bg-teal-500 text-white' : 'bg-sky-600 text-white hover:bg-sky-700'}`}>
              {savedEntry ? '✓ 저장 완료!' : '코드 저장'}
            </button>
            {settings?.entry_password && (
              <button type="button"
                onClick={() => { onSaveEntry(''); setSavedEntry(true); setTimeout(() => setSavedEntry(false), 2500); }}
                className="px-4 py-3 font-semibold rounded-xl bg-red-100 text-red-600 hover:bg-red-200 transition-all text-sm">
                해제
              </button>
            )}
          </div>
        </form>
      )}

      {activeTab === 'reset' && (
        <form onSubmit={(e) => {
          e.preventDefault();
          setErrReset('');
          if (resetPw.length < 4) { setErrReset('비밀번호는 4자 이상이어야 합니다.'); return; }
          if (resetPw !== resetConfirm) { setErrReset('비밀번호 확인이 일치하지 않습니다.'); return; }
          onSaveReset(resetPw);
          setSavedReset(true);
          setResetPw(''); setResetConfirm('');
          setTimeout(() => setSavedReset(false), 2500);
        }} className="space-y-4">
          <div className="bg-amber-50 rounded-xl p-3 border border-amber-200 text-xs text-amber-700 leading-relaxed">
            유저가 술번개 로고를 탭하면 뜨는 <strong>처음으로 돌아가기</strong> 비밀번호입니다.<br />
            미설정 시 기본값(116606)이 사용됩니다.
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">현재 비밀번호</label>
            <p className="text-sm font-black text-gray-800 bg-gray-50 rounded-xl px-4 py-3 border border-gray-200 tracking-widest">
              {settings?.reset_password ? settings.reset_password : '(기본값 116606)'}
            </p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">새 비밀번호</label>
            <div className="relative">
              <input type={showResetPw ? 'text' : 'password'} value={resetPw} onChange={(e) => setResetPw(e.target.value)}
                placeholder="새 비밀번호 입력 (4자 이상)"
                className="w-full px-4 py-3 pr-11 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none" required minLength={4} />
              <button type="button" onClick={() => setShowResetPw(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showResetPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">비밀번호 확인</label>
            <input type={showResetPw ? 'text' : 'password'} value={resetConfirm} onChange={(e) => setResetConfirm(e.target.value)}
              placeholder="비밀번호 재입력"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none" required />
          </div>
          {errReset && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />{errReset}
            </div>
          )}
          <div className="flex gap-2">
            <button type="submit"
              className={`flex-1 py-3 font-semibold rounded-xl transition-all ${savedReset ? 'bg-teal-500 text-white' : 'bg-amber-500 text-white hover:bg-amber-600'}`}>
              {savedReset ? '✓ 저장 완료!' : '비밀번호 저장'}
            </button>
            {settings?.reset_password && (
              <button type="button"
                onClick={() => { onSaveReset(''); setSavedReset(true); setTimeout(() => setSavedReset(false), 2500); }}
                className="px-4 py-3 font-semibold rounded-xl bg-red-100 text-red-600 hover:bg-red-200 transition-all text-sm">
                초기화
              </button>
            )}
          </div>
        </form>
      )}

      {activeTab === 'test' && (
        <form onSubmit={(e) => {
          e.preventDefault();
          setErrTest('');
          if (testPw.length < 4) { setErrTest('비밀번호는 4자 이상이어야 합니다.'); return; }
          if (testPw !== testConfirm) { setErrTest('비밀번호 확인이 일치하지 않습니다.'); return; }
          onSaveTest(testPw);
          setSavedTest(true);
          setTestPw(''); setTestConfirm('');
          setTimeout(() => setSavedTest(false), 2500);
        }} className="space-y-4">
          <div className="bg-violet-50 rounded-xl p-3 border border-violet-200 text-xs text-violet-700 leading-relaxed">
            <strong>테스트 전용 접속 코드</strong>입니다. 이 코드로 접속하면 테스트 대시보드로 이동합니다.<br />
            미설정 시 기본값 <span className="font-black text-violet-700">116606</span>이 사용됩니다.
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">현재 테스트 코드</label>
            <p className="text-sm font-black text-gray-800 bg-gray-50 rounded-xl px-4 py-3 border border-gray-200 tracking-widest">
              {(settings as any)?.test_password ? (settings as any).test_password : '116606 (기본값)'}
            </p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">새 테스트 코드</label>
            <div className="relative">
              <input type={showTestPw ? 'text' : 'password'} value={testPw} onChange={(e) => setTestPw(e.target.value)}
                placeholder="새 테스트 코드 입력 (4자 이상)"
                className="w-full px-4 py-3 pr-11 border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-500 outline-none" required minLength={4} />
              <button type="button" onClick={() => setShowTestPw(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showTestPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">코드 확인</label>
            <input type={showTestPw ? 'text' : 'password'} value={testConfirm} onChange={(e) => setTestConfirm(e.target.value)}
              placeholder="테스트 코드 재입력"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-500 outline-none" required />
          </div>
          {errTest && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />{errTest}
            </div>
          )}
          <div className="flex gap-2">
            <button type="submit"
              className={`flex-1 py-3 font-semibold rounded-xl transition-all ${savedTest ? 'bg-teal-500 text-white' : 'bg-violet-600 text-white hover:bg-violet-700'}`}>
              {savedTest ? '✓ 저장 완료!' : '코드 저장'}
            </button>
            {(settings as any)?.test_password && (
              <button type="button"
                onClick={() => { onSaveTest(''); setSavedTest(true); setTimeout(() => setSavedTest(false), 2500); }}
                className="px-4 py-3 font-semibold rounded-xl bg-red-100 text-red-600 hover:bg-red-200 transition-all text-sm">
                해제
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────────

type AdminTab = 'settings' | 'profiles' | 'hearts' | 'chats' | 'notify';
type SettingsSubTab = 'control' | 'qr' | 'admin' | 'db';

// ─── DB Health types ──────────────────────────────────────────────────────────
interface DbHealthData {
  persistErrors: number;
  recentErrors: { table: string; time: number; msg: string }[];
  inMemory: { messages: number; likes: number };
  db: { messages: number; likes: number };
  sseConnections: number;
  pinPool: { remaining: number; total: number };
  alarms: string[];
  ok: boolean;
  checkedAt: string;
}
type HeartSubTab = 'hearts' | 'popularity';

function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<AdminTab>('settings');
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsSubTab>('control');
  const [heartSubTab, setHeartSubTab] = useState<HeartSubTab>('hearts');
  const [dbHealth, setDbHealth] = useState<DbHealthData | null>(null);
  const [dbHealthLoading, setDbHealthLoading] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [histories, setHistories] = useState<SessionHistory[]>([]);
  const [likes, setLikes] = useState<Like[]>([]);
  const [allChats, setAllChats] = useState<Chat[]>([]);
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [_anonymousReports, setAnonymousReports] = useState<AnonymousReport[]>([]);
  const [newReportPopup, setNewReportPopup] = useState<AnonymousReport | null>(null);
  const [drinkPopup, setDrinkPopup] = useState(false);
  // 관리자 팝업 — TTS 알림
  useEffect(() => {
    if (!drinkPopup) return;
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const lines = ['손님이 술을 요청하고 있어요! 빨리 가져다 드리세요!', '아저씨!! 술 주세요!!'];
    let i = 0;
    const say = () => {
      const utter = new SpeechSynthesisUtterance(lines[i] ?? lines[0]);
      utter.lang = 'ko-KR'; utter.rate = 0.85; utter.pitch = 1.6; utter.volume = 1;
      utter.onend = () => { i++; if (i < lines.length) say(); };
      window.speechSynthesis.speak(utter);
    };
    say();
  }, [drinkPopup]);

  // Recovery banner (floating top)
  const [recovery, setRecovery] = useState<{ label: string; emoji: string; restore: (() => Promise<void>) | null; timerId: ReturnType<typeof setTimeout> } | null>(null);
  // Persistent restore map — key → restore function (shown as buttons in DashboardTab)
  const [restoreMap, setRestoreMap] = useState<Map<string, () => Promise<void>>>(new Map());
  // Table label editing panel
  const [seenHeartsCount, setSeenHeartsCountRaw] = useState(() => parseInt(localStorage.getItem('admin_seen_hearts') ?? '0', 10));
  const [seenMessagesCount, setSeenMessagesCountRaw] = useState(() => parseInt(localStorage.getItem('admin_seen_messages') ?? '0', 10));
  const [seenProfilesCount, setSeenProfilesCountRaw] = useState(() => parseInt(localStorage.getItem('admin_seen_profiles') ?? '0', 10));

  const setSeenHeartsCount = (n: number) => { localStorage.setItem('admin_seen_hearts', String(n)); setSeenHeartsCountRaw(n); };
  const setSeenMessagesCount = (n: number) => { localStorage.setItem('admin_seen_messages', String(n)); setSeenMessagesCountRaw(n); };
  const setSeenProfilesCount = (n: number) => { localStorage.setItem('admin_seen_profiles', String(n)); setSeenProfilesCountRaw(n); };

  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  const loadAll = useCallback(async () => {
    const [{ data: s }, { data: pr }, { data: hi }, { data: li }, { data: ch }, { data: msgs }, { data: sug }, { data: anon }] = await Promise.all([
      adminSupabase.from('app_settings').select('*').eq('id', 1).single(),
      adminSupabase.from('profiles').select('*').order('created_at', { ascending: false }),
      adminSupabase.from('session_history').select('*').order('ended_at', { ascending: false }),
      adminApiSelect<Like>('likes', [{ column: 'created_at', ascending: false }]),
      adminApiSelect<Chat>('chats', [{ column: 'created_at', ascending: false }]),
      adminApiSelect<Message>('messages', [{ column: 'created_at', ascending: true }]),
      adminSupabase.from('suggestions').select('*').order('created_at', { ascending: false }),
      adminSupabase.from('anonymous_reports').select('*').order('created_at', { ascending: false }),
    ]);
    if (s) setSettings(s);
    if (pr) setProfiles(pr);
    if (hi) setHistories(hi);
    if (li) setLikes(li);
    if (ch) setAllChats(ch);
    if (msgs) setAllMessages(msgs);
    if (sug) setSuggestions(sug as Suggestion[]);
    if (anon) setAnonymousReports(anon as AnonymousReport[]);
  }, []);

  useEffect(() => {
    // 관리자 SSE 핵심 수정: 일반 유저 userId가 localStorage에 남아 있으면
    // localdb가 adminToken 조건(userId===null)을 만족 못해 admin SSE가 아닌 user SSE로 연결됨.
    // → setLocalDbUserId(null)로 userId를 초기화하여 adminToken이 SSE URL에 포함되도록 강제.
    setLocalDbUserId(null);
    loadAll();
    const channel = supabase
      .channel('admin-realtime')
      // ── profiles: 페이로드 기반 증분 업데이트 ───────────────────────
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profiles' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        const p = payload.new as Profile;
        setProfiles(prev => prev.some(x => x.id === p.id) ? prev : [p, ...prev]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        const p = payload.new as Profile;
        setProfiles(prev => prev.map(x => x.id === p.id ? p : x));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'profiles' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        setProfiles(prev => prev.filter(x => x.id !== (payload.old as Profile).id));
      })
      // ── app_settings ─────────────────────────────────────────────────
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        setSettings(payload.new as AppSettings);
      })
      // ── anonymous_reports ────────────────────────────────────────────
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'anonymous_reports' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        const report = payload.new as AnonymousReport;
        setAnonymousReports(prev => [report, ...prev]);
        setNewReportPopup(report);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'anonymous_reports' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        setAnonymousReports(prev => prev.map(r => r.id === (payload.new as AnonymousReport).id ? payload.new as AnonymousReport : r));
      })
      // ── suggestions: 페이로드 기반 증분 업데이트 ─────────────────────
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'suggestions' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        const s = payload.new as Suggestion;
        if (s.content === '__술주세요__') {
          setDrinkPopup(true);
        } else {
          setSuggestions(prev => [s, ...prev]);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'suggestions' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        setSuggestions(prev => prev.map(s => s.id === (payload.new as Suggestion).id ? payload.new as Suggestion : s));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'suggestions' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        setSuggestions(prev => prev.filter(s => s.id !== (payload.old as Suggestion).id));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadAll]);

  // ── api-server SSE 실시간 동기화: likes · messages · chats ──────────────────
  // api-server는 이 세 테이블을 app_kv_rows에 저장하므로 Supabase Realtime이 아닌
  // localdb SSE 채널을 써야 실시간 변경을 받을 수 있다.
  useEffect(() => {
    const ch = ldbSupabase
      .channel('admin-ldb-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'likes' },
        (payload: { new: Record<string, unknown> }) => {
          setLikes(prev => [payload.new as Like, ...prev]);
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'likes' },
        (payload: { old: Record<string, unknown> }) => {
          setLikes(prev => prev.filter(l => l.id !== (payload.old as Like).id));
        })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload: { new: Record<string, unknown> }) => {
          setAllMessages(prev => [...prev, payload.new as Message]);
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' },
        (payload: { old: Record<string, unknown> }) => {
          setAllMessages(prev => prev.filter(m => m.id !== (payload.old as Message).id));
        })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chats' },
        (payload: { new: Record<string, unknown> }) => {
          setAllChats(prev => [payload.new as Chat, ...prev]);
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chats' },
        (payload: { old: Record<string, unknown> }) => {
          setAllChats(prev => prev.filter(c => c.id !== (payload.old as Chat).id));
        })
      .subscribe();
    return () => { ldbSupabase.removeChannel(ch); };
  }, []);

  // ─── DB health polling (30s interval) ──────────────────────────────────────
  const fetchDbHealth = useCallback(async () => {
    setDbHealthLoading(true);
    try {
      const resp = await fetch('/api/db/health');
      if (resp.ok) {
        const data = await resp.json() as DbHealthData;
        setDbHealth(data);
      }
    } catch { /* network error — ignore */ }
    finally { setDbHealthLoading(false); }
  }, []);

  const handleClearDbErrors = useCallback(async () => {
    const adminPassword = (settings as Record<string, unknown> | null)?.admin_password as string ?? '';
    try {
      await fetch('/api/db/admin/clear-db-errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword }),
      });
    } catch { /* ignore */ }
    await fetchDbHealth();
  }, [settings, fetchDbHealth]);

  useEffect(() => {
    fetchDbHealth();
    // 5초 주기로 SSE 연결 수 갱신 (기존 30초는 실시간성이 너무 낮음)
    const id = setInterval(fetchDbHealth, 5_000);
    return () => clearInterval(id);
  }, [fetchDbHealth]);

  const handleToggleSession = async () => {
    // ✅ Fix #4a: 빠른 더블클릭·동시 관리자 race 방지 — 낙관적 즉시 반영 후 저장
    if (!settings) return;
    const newVal = !(settings.session_active ?? false);
    setSettings(prev => prev ? { ...prev, session_active: newVal } : prev); // 낙관적 업데이트
    const { error } = await adminSupabase.from('app_settings').update({ session_active: newVal, updated_at: new Date().toISOString() }).eq('id', 1);
    if (error) {
      // 실패 시 롤백
      setSettings(prev => prev ? { ...prev, session_active: !newVal } : prev);
      console.error('[admin] 세션 토글 실패:', error.message);
      return;
    }
    // api-server 인메모리 동기화 → 모든 유저에게 SSE로 즉시 반영
    adminApiRpc('admin_update_settings', { p_admin_password: settings.admin_password ?? '', p_payload: { session_active: newVal } })
      .catch(e => console.warn('[admin] api-server 세션 동기화 실패 (5분 내 자동 복구):', e));
  };

  const handleSetTimer = async (endAt: string | null, label: string | null) => {
    const { error } = await adminSupabase.from('app_settings').update({ timer_end_at: endAt, timer_label: label, updated_at: new Date().toISOString() }).eq('id', 1);
    if (error) { alert(`타이머 설정 실패: ${error.message}`); return; }
    setSettings(prev => prev ? { ...prev, timer_end_at: endAt, timer_label: label } : prev);
    adminApiRpc('admin_update_settings', { p_admin_password: settings?.admin_password ?? '', p_payload: { timer_end_at: endAt, timer_label: label } })
      .catch(e => console.warn('[admin] api-server 타이머 동기화 실패:', e));
  };

  const handleEventEndReset = async () => {
    const backupProfiles = [...profiles];
    const backupLikes = [...likes];
    const backupChats = [...allChats];
    const backupMsgs = [...allMessages];
    const backupSuggestions = [...suggestions];
    const backupHistories = [...histories];
    // 백업 데이터 수집 — 실패해도 초기화 진행
    const [notifRes] = await Promise.allSettled([
      adminSupabase.from('notifications').select('*'),
    ]);
    const safeData = (r: PromiseSettledResult<{ data: unknown[] | null }>) =>
      r.status === 'fulfilled' ? (r.value as { data: unknown[] | null }).data : null;
    try {
      await adminSupabase.from('session_history').insert({ seats_snapshot: [] });
      // api-server 전체 초기화 (인메모리 스토어 + SSE broadcast → 모든 유저에게 즉시 반영)
      // Supabase 직접 삭제만으로는 api-server 인메모리가 그대로 남아 유저에게 반영 안 됨
      await adminApiRpc('admin_event_end_reset', { p_admin_password: settings?.admin_password ?? '' });
      // 병렬 삭제 (Supabase 네이티브 테이블 — 관리자 화면용)
      await Promise.all([
        adminSupabase.from('profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
        adminSupabase.from('likes').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
        adminSupabase.from('anonymous_reports').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
        adminSupabase.from('messages').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
        adminSupabase.from('chats').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
        adminSupabase.from('notifications').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
        adminSupabase.from('suggestions').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      ]);
      const { error: sigErr } = await adminSupabase.from('app_settings').update({ reset_signal: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', 1);
      if (sigErr) throw new Error(sigErr.message);
      // api-server reset_signal 동기화
      adminApiRpc('admin_update_settings', { p_admin_password: settings?.admin_password ?? '', p_payload: { reset_signal: new Date().toISOString() } })
        .catch(() => null);
      const hasData = backupProfiles.length > 0 || backupLikes.length > 0 || backupChats.length > 0 || backupSuggestions.length > 0;
      showRecovery('전체 초기화', '🗑️', hasData ? async () => {
        // 복구 upsert — 개별 실패는 로그만
        await Promise.allSettled([
          ...backupProfiles.map(p => adminSupabase.from('profiles').upsert(p)),
          ...backupLikes.map(l => adminSupabase.from('likes').upsert({ id: l.id, liker_id: l.liker_id, liked_id: l.liked_id, heart_type: l.heart_type, status: l.status, created_at: l.created_at })),
          ...backupChats.map(c => adminSupabase.from('chats').upsert(c)),
          ...backupMsgs.map(m => adminSupabase.from('messages').upsert(m)),
          ...backupSuggestions.map(s => adminSupabase.from('suggestions').upsert({ id: s.id, content: s.content, created_at: s.created_at })),
          ...backupHistories.map(h => adminSupabase.from('session_history').upsert({ id: h.id, seats_snapshot: [], created_at: (h as { created_at?: string }).created_at })),
          ...(safeData(notifRes) ?? []).map((n: unknown) => adminSupabase.from('notifications').upsert(n)),
        ]);
        await loadAll();
        setRecovery(null);
      } : null, 'eventEnd');
    } catch (e: unknown) {
      alert(`전체 초기화 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      await loadAll();
    }
  };

  const showRecovery = useCallback((label: string, emoji: string, restore: (() => Promise<void>) | null, mapKey?: string) => {
    setRecovery(prev => {
      if (prev?.timerId) clearTimeout(prev.timerId);
      const timerId = setTimeout(() => setRecovery(null), 30000);
      return { label, emoji, restore, timerId };
    });
    if (restore && mapKey) {
      setRestoreMap(prev => new Map(prev).set(mapKey, async () => {
        await restore();
        setRestoreMap(prev2 => { const m = new Map(prev2); m.delete(mapKey); return m; });
      }));
    } else if (!restore && mapKey) {
      setRestoreMap(prev => { const m = new Map(prev); m.delete(mapKey); return m; });
    }
  }, []);

  const handleClearLikes = async () => {
    const backup = [...likes];
    await adminSupabase.from('likes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    setLikes([]);
    adminApiRpc('admin_force_resync_all', {}).catch(e => console.warn('[admin] resync:', e));
    showRecovery('하트 기록', '❤️', backup.length > 0 ? async () => {
      for (const l of backup) {
        await adminSupabase.from('likes').upsert({ id: l.id, liker_id: l.liker_id, liked_id: l.liked_id, heart_type: l.heart_type, status: l.status, created_at: l.created_at });
      }
      await loadAll();
      setRecovery(null);
    } : null, 'likes');
  };

  const handleClearProfiles = async () => {
    const backupProfiles = [...profiles];
    await adminSupabase.from('profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    adminApiRpc('admin_force_resync_all', {}).catch(e => console.warn('[admin] resync:', e));
    showRecovery('참여자 프로필', '👤', backupProfiles.length > 0 ? async () => {
      for (const p of backupProfiles) await adminSupabase.from('profiles').upsert(p);
      await loadAll();
      setRecovery(null);
    } : null, 'profiles');
    await loadAll();
  };

  const handleDeleteChat = async (chatId: string) => {
    await adminSupabase.from('messages').delete().eq('chat_id', chatId);
    await adminSupabase.from('chats').delete().eq('id', chatId);
    adminApiRpc('admin_force_resync_all', {}).catch(e => console.warn('[admin] resync:', e));
    await loadAll();
  };

  const handleClearAllChats = async () => {
    const backupChats = [...allChats];
    const backupMsgs = [...allMessages];
    await adminSupabase.from('messages').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await adminSupabase.from('chats').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    adminApiRpc('admin_force_resync_all', {}).catch(e => console.warn('[admin] resync:', e));
    showRecovery('채팅', '💬', (backupChats.length > 0 || backupMsgs.length > 0) ? async () => {
      for (const c of backupChats) await adminSupabase.from('chats').upsert(c);
      for (const m of backupMsgs) await adminSupabase.from('messages').upsert(m);
      await loadAll();
      setRecovery(null);
    } : null, 'chats');
    await loadAll();
  };

  const handleClearHistory = async () => {
    const backup = [...histories];
    await adminSupabase.from('session_history').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    setHistories([]);
    adminApiRpc('admin_force_resync_all', {}).catch(e => console.warn('[admin] resync:', e));
    showRecovery('회식 이력', '📋', backup.length > 0 ? async () => {
      for (const h of backup) {
        await adminSupabase.from('session_history').upsert({ id: h.id, seats_snapshot: [], ended_at: (h as Record<string, unknown>)['ended_at'] as string ?? h.ended_at });
      }
      await loadAll();
      setRecovery(null);
    } : null, 'history');
  };

  const handleSaveCredentials = async (phone: string, password: string) => {
    await adminSupabase.from('app_settings').update({ admin_phone: phone, admin_password: password, updated_at: new Date().toISOString() }).eq('id', 1);
    const { data } = await adminSupabase.from('app_settings').select('*').eq('id', 1).single();
    if (data) setSettings(data);
    // api-server 동기화: checkPassword()가 새 비밀번호를 즉시 인식하도록
    adminApiRpc('admin_update_settings', { p_admin_password: settings?.admin_password ?? '', p_payload: { admin_phone: phone, admin_password: password } })
      .catch(e => console.warn('[admin] api-server 자격증명 동기화 실패:', e));
  };

  const handleSaveEntryPassword = async (entryPassword: string) => {
    await adminSupabase.from('app_settings').update({ entry_password: entryPassword || null, updated_at: new Date().toISOString() }).eq('id', 1);
    const { data } = await adminSupabase.from('app_settings').select('*').eq('id', 1).single();
    if (data) setSettings(data);
    adminApiRpc('admin_update_settings', { p_admin_password: settings?.admin_password ?? '', p_payload: { entry_password: entryPassword || null } })
      .catch(e => console.warn('[admin] api-server 입장비밀번호 동기화 실패:', e));
  };

  const handleSaveResetPassword = async (resetPassword: string) => {
    await adminSupabase.from('app_settings').update({ reset_password: resetPassword || null, updated_at: new Date().toISOString() }).eq('id', 1);
    const { data } = await adminSupabase.from('app_settings').select('*').eq('id', 1).single();
    if (data) setSettings(data);
    adminApiRpc('admin_update_settings', { p_admin_password: settings?.admin_password ?? '', p_payload: { reset_password: resetPassword || null } })
      .catch(e => console.warn('[admin] api-server 리셋비밀번호 동기화 실패:', e));
  };

  const handleSaveTestPassword = async (testPassword: string) => {
    await adminSupabase.from('app_settings').update({ test_password: testPassword || null, updated_at: new Date().toISOString() }).eq('id', 1);
    const { data } = await adminSupabase.from('app_settings').select('*').eq('id', 1).single();
    if (data) setSettings(data);
    adminApiRpc('admin_update_settings', { p_admin_password: settings?.admin_password ?? '', p_payload: { test_password: testPassword || null } })
      .catch(e => console.warn('[admin] api-server 테스트비밀번호 동기화 실패:', e));
  };

  const handleToggleFunctionsLock = async () => {
    // 기능 잠금 토글 (functions_locked) — 채팅·건의·게임 등
    if (!settings) return;
    const newVal = !((settings as any).functions_locked ?? false);
    setSettings(prev => prev ? { ...prev, functions_locked: newVal } as any : prev);
    const { error } = await adminSupabase.from('app_settings').update({ functions_locked: newVal, updated_at: new Date().toISOString() }).eq('id', 1);
    if (error) {
      setSettings(prev => prev ? { ...prev, functions_locked: !newVal } as any : prev);
      console.error('[admin] 기능 잠금 토글 실패:', error.message);
      return;
    }
    adminApiRpc('admin_update_settings', { p_admin_password: settings.admin_password ?? '', p_payload: { functions_locked: newVal } })
      .catch(e => console.warn('[admin] api-server 기능잠금 동기화 실패:', e));
  };

  const handleDrainUnusedHearts = async (): Promise<{ nickname: string; count: number }[]> => {
    if (!settings) return [];
    try {
      const token = localStorage.getItem(ADMIN_TOKEN_KEY) ?? '';
      const res = await fetch(`${ADMIN_API}/rpc/admin_drain_unused_hearts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_admin_password: settings.admin_password ?? '', adminToken: token }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: { drained: { nickname: string; count: number }[] } | null; error: { message: string } | null };
      if (json.error) throw new Error(json.error.message);
      return json.data?.drained ?? [];
    } catch (e) {
      console.warn('[admin] 미사용 하트 회수 실패:', e);
      return [];
    }
  };

  const handleDeleteProfile = async (profileId: string) => {
    await adminSupabase.from('profiles').delete().eq('id', profileId);
    setProfiles(prev => prev.filter(p => p.id !== profileId));
    // api-server 인메모리 동기화
    adminApiRpc('admin_force_resync_all', {}).catch(e => console.warn('[admin] resync:', e));
  };


  const handleTabChange = (t: AdminTab) => {
    if (t === 'profiles') setSeenProfilesCount(profiles.length);
    if (t === 'hearts') setSeenHeartsCount(likes.length);
    if (t === 'chats') setSeenMessagesCount(allMessages.length);
    setTab(t);
  };

  const TABS: { id: AdminTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'settings', label: '설정', icon: <LayoutGrid className="w-4 h-4" /> },
    { id: 'profiles', label: '참여자', icon: <Users className="w-4 h-4" />, badge: Math.max(0, profiles.length - seenProfilesCount) || undefined },
    { id: 'hearts', label: '하트', icon: <Heart className="w-4 h-4" />, badge: Math.max(0, likes.length - seenHeartsCount) || undefined },
    { id: 'chats', label: '채팅', icon: <MessageCircle className="w-4 h-4" />, badge: Math.max(0, allMessages.length - seenMessagesCount) || undefined },
    { id: 'notify', label: '공지', icon: <BellRing className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 text-white sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-3 py-2.5 flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <Shield className="w-4 h-4 text-slate-300 flex-shrink-0" />
            <h1 className="font-bold text-sm truncate">관리자 대시보드</h1>
            <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 ${settings?.session_active ? 'bg-teal-500 text-white' : 'bg-slate-700 text-slate-300'}`}>
              {settings?.session_active ? '진행 중' : '대기 중'}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <a href="/test"
              className="flex items-center gap-1 text-xs text-violet-300 hover:text-violet-100 transition-colors px-2 py-1 rounded-lg bg-violet-700/40 hover:bg-violet-700/60 border border-violet-600/40">
              🧪 테스터
            </a>
            <button onClick={onLogout} className="flex items-center gap-1 text-xs text-slate-300 hover:text-white transition-colors">
              <LogOut className="w-3.5 h-3.5" />
              로그아웃
            </button>
          </div>
        </div>
        <div className="max-w-4xl mx-auto px-2 grid grid-cols-5 pb-0">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => handleTabChange(t.id)}
              className={`relative flex items-center justify-center gap-1 px-1 py-2 text-[11px] font-semibold border-b-2 transition-all ${
                tab === t.id ? 'border-teal-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}>
              {t.icon}
              <span className="truncate">{t.label}</span>
              {t.badge !== undefined && t.badge > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 bg-rose-500 text-white text-[10px] font-bold rounded-full leading-none">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-4xl mx-auto">
        {tab === 'settings' && (
          <div>
            <div className="flex border-b border-gray-200 bg-white px-4">
              {([
                { id: 'control' as SettingsSubTab, label: '대시보드' },
                { id: 'qr' as SettingsSubTab, label: 'QR코드' },
                { id: 'admin' as SettingsSubTab, label: '관리자 설정' },
                { id: 'db' as SettingsSubTab, label: 'DB헬스', errorBadge: (dbHealth?.persistErrors ?? 0) > 0 },
              ]).map(st => (
                <button key={st.id} onClick={() => setSettingsSubTab(st.id)}
                  className={`relative px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${settingsSubTab === st.id ? 'border-teal-500 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  {st.label}
                  {'errorBadge' in st && st.errorBadge && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />
                  )}
                </button>
              ))}
            </div>
            {settingsSubTab === 'control' && (
              <DashboardTab settings={settings} profiles={profiles}
                onToggleSession={handleToggleSession} onEventEndReset={handleEventEndReset}
                onToggleFunctionsLock={handleToggleFunctionsLock}
                onClearLikes={handleClearLikes} onClearChats={handleClearAllChats}
                onClearProfiles={handleClearProfiles}
                onClearHistory={handleClearHistory} restoreMap={restoreMap}
                onDrainUnusedHearts={handleDrainUnusedHearts} />
            )}
            {settingsSubTab === 'qr' && <AdminQrTab settings={settings} onSaveQrBase={async (url) => {
  const { error } = await adminSupabase.from('app_settings').update({ qr_base_url: url, updated_at: new Date().toISOString() } as never).eq('id', 1);
  if (error) { alert(`QR URL 저장 실패: ${error.message}`); return; }
  setSettings(prev => prev ? { ...prev, qr_base_url: url } as never : prev);
  adminApiRpc('admin_update_settings', { p_admin_password: settings?.admin_password ?? '', p_payload: { qr_base_url: url } })
    .catch(e => console.warn('[admin] api-server QR URL 동기화 실패:', e));
}} />}
            {settingsSubTab === 'admin' && <CredentialsTab settings={settings} onSave={handleSaveCredentials} onSaveEntry={handleSaveEntryPassword} onSaveReset={handleSaveResetPassword} onSaveTest={handleSaveTestPassword} />}
            {settingsSubTab === 'db' && <DbHealthTab health={dbHealth} loading={dbHealthLoading} onRefresh={fetchDbHealth} onClearErrors={handleClearDbErrors} />}
          </div>
        )}
        {tab === 'profiles' && (
          <ProfilesTabSection profiles={profiles} settings={settings} onClear={async () => {
            await adminSupabase.from('profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            await loadAll();
          }} onDeleteProfile={handleDeleteProfile} />
        )}
        {tab === 'hearts' && (
          <div>
            <div className="flex border-b border-gray-200 bg-gray-50 px-4">
              {([
                { id: 'hearts' as HeartSubTab, label: '하트 현황' },
                { id: 'popularity' as HeartSubTab, label: '인기도 랭킹' },
              ]).map(st => (
                <button key={st.id} onClick={() => setHeartSubTab(st.id)}
                  className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${heartSubTab === st.id ? 'border-rose-500 text-rose-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  {st.label}
                </button>
              ))}
            </div>
            {heartSubTab === 'hearts' && <HeartsTab likes={likes} profileMap={profileMap} onClear={handleClearLikes} onRefresh={loadAll} />}
            {heartSubTab === 'popularity' && <PopularityTab likes={likes} profileMap={profileMap} />}
          </div>
        )}
        {tab === 'chats' && <ChatsTab chats={allChats} messages={allMessages} profileMap={profileMap} onDeleteChat={handleDeleteChat} onClearAll={handleClearAllChats} onRefresh={loadAll} />}
        {tab === 'notify' && <NotificationTab tableCount={0} settings={settings} onSetTimer={handleSetTimer} />}
      </main>

      {/* 초기화 복구 배너 (non-blocking) */}
      {recovery && (
        <div className={`fixed top-0 left-0 right-0 z-[400] flex items-center gap-3 px-4 py-3 shadow-lg transition-all ${recovery.restore ? 'bg-teal-600' : 'bg-gray-700'}`}>
          <span className="text-2xl flex-shrink-0">{recovery.emoji}</span>
          <div className="flex-1 min-w-0">
            <p className="text-white font-black text-sm leading-tight">{recovery.label} 초기화 완료</p>
            {recovery.restore
              ? <p className="text-teal-200 text-[10px] font-semibold leading-none mt-0.5">30초 안에 복구 가능</p>
              : <p className="text-gray-400 text-[10px] font-semibold leading-none mt-0.5">데이터 없음 — 복구 불가</p>
            }
          </div>
          {recovery.restore && (
            <button
              onClick={() => recovery.restore!()}
              className="flex-shrink-0 px-4 py-2 bg-white text-teal-700 font-black text-sm rounded-xl active:scale-95 transition-all shadow">
              ↩ 복구
            </button>
          )}
          <button
            onClick={() => { clearTimeout(recovery.timerId); setRecovery(null); }}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-xl bg-white/20 hover:bg-white/30 text-white font-black text-base transition-all">
            ×
          </button>
        </div>
      )}

      {/* 🍻 아저씨 술주세요 이스터에그 팝업 — 풀스크린 임팩트 */}
      {drinkPopup && (
        <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-amber-400 p-6 text-center" style={{ animation: 'drinkShake 0.4s ease-in-out' }}>
          <style>{`
            @keyframes drinkShake {
              0%,100%{transform:rotate(0deg)}
              20%{transform:rotate(-4deg) scale(1.04)}
              40%{transform:rotate(4deg) scale(1.06)}
              60%{transform:rotate(-3deg) scale(1.03)}
              80%{transform:rotate(3deg) scale(1.05)}
            }
            @keyframes beerBounce {
              0%,100%{transform:translateY(0) scale(1)}
              30%{transform:translateY(-24px) scale(1.15)}
              60%{transform:translateY(-10px) scale(1.08)}
            }
            @keyframes textPulse {
              0%,100%{opacity:1;transform:scale(1)}
              50%{opacity:0.85;transform:scale(1.06)}
            }
          `}</style>

          <div style={{ animation: 'beerBounce 0.7s ease-in-out infinite' }} className="text-[120px] leading-none select-none">🍺</div>

          <p className="mt-6 text-white font-black leading-tight select-none"
            style={{ fontSize: 'clamp(2.2rem, 10vw, 4rem)', textShadow: '0 3px 12px rgba(0,0,0,0.25)', animation: 'textPulse 0.9s ease-in-out infinite' }}>
            아저씨!!<br />술 주세요!!
          </p>

          <p className="mt-4 text-amber-100 font-bold text-lg select-none">손님이 술을 요청하고 있어요 🙏</p>

          <button
            onClick={() => setDrinkPopup(false)}
            className="mt-10 px-12 py-5 bg-white text-amber-500 font-black text-xl rounded-3xl shadow-2xl active:scale-95 transition-transform"
            style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}
          >
            넵! 바로 드릴게요 🫡
          </button>
        </div>
      )}

      {/* 익명 건의 실시간 팝업 */}
      {newReportPopup && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setNewReportPopup(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-orange-100 flex items-center justify-center flex-shrink-0">
                <span className="text-xl">📩</span>
              </div>
              <div>
                <p className="text-xs font-bold text-orange-500 uppercase tracking-widest">새 익명 건의</p>
                {newReportPopup.table_number && (
                  <p className="text-xs text-gray-500 font-semibold">{newReportPopup.table_number}번 테이블</p>
                )}
              </div>
            </div>
            <div className="bg-orange-50 rounded-2xl px-4 py-3 border border-orange-100">
              <p className="text-sm font-semibold text-gray-800 leading-relaxed">{newReportPopup.content}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setTab('chats'); setNewReportPopup(null); }} className="flex-1 py-2.5 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 transition-all text-sm">채팅으로 이동</button>
              <button onClick={() => setNewReportPopup(null)} className="flex-1 py-2.5 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-all text-sm">확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AdminApp Root ────────────────────────────────────────────────────────────

export default function AdminApp() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => loadAdminSession() !== null);
  return isLoggedIn ? (
    <AdminDashboard onLogout={async () => {
      const token = localStorage.getItem(ADMIN_TOKEN_KEY);
      if (token) { try { await supabase.rpc('admin_invalidate_session', { p_token: token }); } catch {} }
      localStorage.removeItem(ADMIN_SESSION_KEY);
      setAdminToken(null);
      setIsLoggedIn(false);
      window.location.href = '/';
    }} />
  ) : (
    <LoginScreen onLogin={() => setIsLoggedIn(true)} />
  );
}
