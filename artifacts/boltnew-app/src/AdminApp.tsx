import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Shield, LogOut, ToggleLeft, ToggleRight, Trash2, Users,
  LayoutGrid, History, X, AlertTriangle, ChevronDown,
  Heart, MessageCircle, QrCode, Send, CheckCircle, Gamepad2, BellRing, Eye, EyeOff,
  PlayCircle, StopCircle, RotateCcw, Clock, Timer, RefreshCw, Copy, Check, Sparkles,
  Lock, Unlock, Search, Database as DatabaseIcon, Activity,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import type { Database, Json } from './types/database';
import SeatingMap from './components/SeatingMap';
import SeatManagementMode from './components/SeatManagementMode';
import type { GameState } from './App';
import { getPositionLabel, getDomSubLabel, getKoreanAge } from './lib/profile';
import { HEART_TYPE_META, TABLE_POSITIONS } from './lib/constants';

type Seat = Database['public']['Tables']['seats']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];
type AppSettings = Database['public']['Tables']['app_settings']['Row'];
type SessionHistory = Database['public']['Tables']['session_history']['Row'];
type Like = Database['public']['Tables']['likes']['Row'];
type Chat = Database['public']['Tables']['chats']['Row'];
type Message = Database['public']['Tables']['messages']['Row'];
type Suggestion = Database['public']['Tables']['suggestions']['Row'];
type AnonymousReport = Database['public']['Tables']['anonymous_reports']['Row'];
type BalanceGame = Database['public']['Tables']['balance_games']['Row'];

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

  // Normalize phone for comparison: strip non-digits, convert +82 prefix → 0
  const normalizePhone = (s: string) => {
    const d = s.replace(/\D/g, '');
    if (d.startsWith('82') && d.length === 11) return '0' + d.slice(2);
    return d;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { data, error: fetchErr } = await adminSupabase.from('app_settings').select('admin_phone, admin_password').eq('id', 1).maybeSingle();
    if (fetchErr) { setError(`서버 오류: ${fetchErr.message}`); setLoading(false); return; }
    if (!data) { setError('설정 데이터를 찾을 수 없습니다. 관리자에게 문의하세요.'); setLoading(false); return; }
    const phoneMatch = normalizePhone(data.admin_phone ?? '') === normalizePhone(phone);
    const passMatch = (data.admin_password ?? '').trim() === password.trim();
    if (!phoneMatch || !passMatch) {
      setError('전화번호 또는 비밀번호가 올바르지 않습니다.');
      setLoading(false);
      return;
    }
    localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({ phone, authedAt: Date.now() }));
    try {
      const { data: token } = await supabase.rpc('admin_create_session', { p_phone: phone, p_admin_password: password });
      setAdminToken(token ?? null);
    } catch { /* session token creation failed, admin will work without header (rpcs still have password fallback) */ }
    onLogin();
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
  { id: 'game',   label: '🎮 진행·게임', color: 'bg-violet-50 border-violet-200 text-violet-800' },
];

function NotificationTab({ tableCount, settings, onSetTimer }: {
  tableCount: number;
  settings: AppSettings | null;
  onSetTimer: (endAt: string | null, label: string | null) => Promise<void>;
}) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [message, setMessage] = useState('');
  const [penalty, setPenalty] = useState('');
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
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = async () => {
    setRefreshing(true); await load(); setRefreshing(false);
    setRefreshDone(true); setTimeout(() => setRefreshDone(false), 2000);
  };

  const send = async () => {
    if (!message.trim()) return;
    setSending(true);
    const fullMsg = type === 'game' && penalty.trim()
      ? `${message.trim()}\n🎯 벌칙: ${penalty.trim()}`
      : message.trim();
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
    setMessage(''); setPenalty('');
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
  const WHO_TARGETS = ['테이블 전체', '지목 2~3명', '탑오빠한테만', '텀동생한테만'];
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
  const GAME_QUICK = [
    '가장 ~한 사람은?', '가장 ~큰 사람은?', '가장 작은 사람은?', '가장 ~일 것 같은 사람은?',
  ];
  const PENALTY_QUICK = ['일반 질문', '19금 질문 🔞', '앞잔 (원샷 X)'];

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

            {/* 진행·게임 */}
            {type === 'game' && (
              <div className="grid grid-cols-2 gap-1.5">
                {GAME_QUICK.map(msg => (
                  <button key={msg} onClick={() => setMessage(msg)}
                    className="text-xs font-semibold px-2 py-2 rounded-xl bg-violet-50 border border-violet-200 text-violet-700 hover:bg-violet-100 transition-all text-center leading-snug active:scale-95">
                    {msg}
                  </button>
                ))}
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

          {type === 'game' && (
            <div className="space-y-3">
              {/* 누구? */}
              <div>
                <label className="text-xs font-semibold text-violet-600 mb-1.5 block">누구?</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {WHO_TARGETS.map(w => (
                    <button key={w} type="button"
                      onClick={() => setMessage(prev => `${prev.replace(/ → .+$/, '')} → ${w}`)}
                      className="py-2 rounded-xl text-xs font-bold border-2 bg-white border-violet-200 text-violet-700 hover:bg-violet-50 active:scale-95 transition-all">
                      {w}
                    </button>
                  ))}
                </div>
              </div>
              {/* 벌칙 */}
              <div>
                <label className="text-xs font-semibold text-violet-600 mb-1 block">벌칙 (선택)</label>
                <input type="text" value={penalty} onChange={e => setPenalty(e.target.value)}
                  placeholder="예: 원샷, 건배사 하기"
                  className="w-full bg-gray-50 border border-violet-200 rounded-xl px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
                <div className="flex gap-1.5 mt-1.5">
                  {PENALTY_QUICK.map(v => (
                    <button key={v} type="button" onClick={() => setPenalty(v)}
                      className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold border-2 transition-all ${penalty === v ? 'bg-violet-500 border-violet-500 text-white' : 'bg-white border-violet-200 text-violet-700 hover:bg-violet-50'}`}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

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

// ─── Admin QR Tab ─────────────────────────────────────────────────────────────

const TABLE_LABELS: Record<number, string> = {
  1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: '11', 12: '12',
  13: '13', 14: '14', 15: '15', 16: '16', 17: '17', 18: '18', 19: '19', 20: '20', 21: '21', 22: '22',
};

// Resolve a table's display label: admin-configured table_labels overrides the default.
const tableLabel = (tableNum: number, labels?: Record<string, string> | null) =>
  labels?.[String(tableNum)] ?? TABLE_LABELS[tableNum] ?? String(tableNum);

function AdminQrTab({ seats, settings, onSaveQrBase }: { seats: Seat[]; settings: AppSettings | null; onSaveQrBase: (url: string) => Promise<void> }) {
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
  const tableNumbers = [...new Set(seats.map(s => s.table_number))].sort((a, b) => a - b);

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

function DashboardTab({ settings, seats, profiles, onToggleSession, onFullReset, onEventEndReset, onToggleFeatureLock, onToggleFunctionsLock,
  onClearLikes, onClearChats, onClearNotifications, onClearGames, onClearSuggestions, onClearProfiles, onClearHistory,
  restoreMap }: {
  settings: AppSettings | null; seats: Seat[]; profiles: Profile[];
  onToggleSession: () => void; onFullReset: () => void; onEventEndReset: () => void;
  onToggleFeatureLock: () => void;
  onToggleFunctionsLock: () => void;
  onClearLikes: () => Promise<void>;
  onClearChats: () => Promise<void>;
  onClearNotifications: () => Promise<void>;
  onClearGames: () => Promise<void>;
  onClearSuggestions: () => Promise<void>;
  onClearProfiles: () => Promise<void>;
  onClearHistory: () => Promise<void>;
  restoreMap: Map<string, () => Promise<void>>;
}) {
  const [confirmToggle, setConfirmToggle] = useState(false);
  const [confirmEventEnd, setConfirmEventEnd] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const activeTables = settings?.active_tables ?? null;
  const activeSeats = activeTables ? seats.filter(s => activeTables.includes(s.table_number)) : seats;
  const occupied = activeSeats.filter((s) => s.status === 'occupied').length;
  const isActive = settings?.session_active ?? false;
  const isSeatingLocked = settings?.seating_locked ?? false;
  const isFunctionsLocked = (settings as any)?.functions_locked ?? false;

  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '참여자', value: profiles.length, color: 'bg-cyan-50 text-cyan-700' },
          { label: '착석', value: occupied, color: 'bg-teal-50 text-teal-700' },
          { label: activeTables ? '빈 자리 (활성)' : '빈 자리', value: activeSeats.length - occupied, color: 'bg-gray-50 text-gray-600' },
        ].map((stat) => (
          <div key={stat.label} className={`${stat.color} rounded-2xl p-4 text-center`}>
            <div className="text-2xl font-black">{stat.value}</div>
            <div className="text-xs font-semibold mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Session control */}
      <div>
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 px-1">회식 세션</h3>
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

      {/* 잠금 제어 — 자리 잠금 / 기능 잠금 분리 */}
      <div>
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 px-1">잠금 제어</h3>
        <div className="space-y-2">
          {/* 자리 잠금 (seating_locked) */}
          <button
            onClick={onToggleFeatureLock}
            className={`w-full rounded-2xl p-3.5 border-2 flex items-center gap-3 transition-all active:scale-[0.98] shadow-sm ${
              isSeatingLocked ? 'bg-amber-50 border-amber-300 hover:bg-amber-100' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isSeatingLocked ? 'bg-amber-500' : 'bg-slate-400'}`}>
              {isSeatingLocked ? <Lock className="w-5 h-5 text-white" /> : <Unlock className="w-5 h-5 text-white" />}
            </div>
            <div className="flex-1 text-left">
              <p className={`font-black text-sm ${isSeatingLocked ? 'text-amber-700' : 'text-slate-700'}`}>
                {isSeatingLocked ? '🔒 자리 선택 잠금 중' : '🪑 자리 선택 열려있음'}
              </p>
              <p className={`text-[10px] mt-0.5 ${isSeatingLocked ? 'text-amber-500' : 'text-slate-400'}`}>
                {isSeatingLocked ? '유저가 자리를 바꿀 수 없음 — 탭하여 해제' : '유저가 자리를 직접 선택 가능 — 탭하여 잠금'}
              </p>
            </div>
            <div className={`relative w-10 h-6 rounded-full transition-all flex-shrink-0 ${isSeatingLocked ? 'bg-amber-500' : 'bg-slate-300'}`}>
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${isSeatingLocked ? 'left-4' : 'left-0.5'}`} />
            </div>
          </button>
          {/* 기능 잠금 (functions_locked) */}
          <button
            onClick={onToggleFunctionsLock}
            className={`w-full rounded-2xl p-3.5 border-2 flex items-center gap-3 transition-all active:scale-[0.98] shadow-sm ${
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


      {/* 데이터 초기화 */}
      <div>
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 px-1">데이터 초기화 / 복구</h3>
        <div className="space-y-1.5">
          {([
            { key: 'seats', emoji: '🪑', label: '좌석', desc: '이력 백업 후 초기화', bg: 'bg-orange-50 border-orange-200 hover:bg-orange-100', title: '좌석 초기화', msg: '이력 백업 후 모든 좌석을 초기화합니다. 참여자 프로필은 유지됩니다.', fn: onFullReset },
            { key: 'likes', emoji: '❤️', label: '하트', desc: '모든 하트 기록 삭제', bg: 'bg-pink-50 border-pink-200 hover:bg-pink-100', title: '하트 초기화', msg: '모든 하트(좋아요) 기록을 삭제합니다.', fn: onClearLikes },
            { key: 'chats', emoji: '💬', label: '채팅', desc: '채팅·메시지 전체 삭제', bg: 'bg-teal-50 border-teal-200 hover:bg-teal-100', title: '채팅 초기화', msg: '모든 채팅방과 메시지를 삭제합니다.', fn: onClearChats },
            { key: 'notifications', emoji: '🔔', label: '공지', desc: '전송 공지 모두 삭제', bg: 'bg-amber-50 border-amber-200 hover:bg-amber-100', title: '공지 초기화', msg: '전송된 모든 공지를 삭제합니다.', fn: onClearNotifications },
            { key: 'games', emoji: '🎮', label: '게임', desc: '게임·투표 기록 삭제', bg: 'bg-violet-50 border-violet-200 hover:bg-violet-100', title: '게임 초기화', msg: '밸런스·OX·이미지 게임 기록과 투표 데이터를 모두 삭제합니다.', fn: onClearGames },
            { key: 'suggestions', emoji: '💡', label: '건의', desc: '익명 건의 모두 삭제', bg: 'bg-sky-50 border-sky-200 hover:bg-sky-100', title: '건의 초기화', msg: '모든 익명 건의 내용을 삭제합니다.', fn: onClearSuggestions },
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
  const [deleting, setDeleting] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshDone, setRefreshDone] = useState(false);

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

const BALANCE_QUICK: { label: string; a: string; b: string; hot?: boolean }[] = [
  // 일상
  { label: '치킨 vs 피자', a: '치킨파', b: '피자파' },
  { label: '아침형 vs 야행성', a: '아침형', b: '야행성' },
  { label: '여름 vs 겨울', a: '여름', b: '겨울' },
  { label: '내향인 vs 외향인', a: '내향인', b: '외향인' },
  { label: '노래방 vs 클럽', a: '노래방', b: '클럽' },
  { label: '솔로 vs 만남 중', a: '솔로', b: '만남 중' },
  { label: '술 vs 안술', a: '술 마심', b: '안 마심' },
  { label: '맥주 vs 소주', a: '맥주파', b: '소주파' },
  { label: '집순이 vs 외출파', a: '집순이', b: '외출파' },
  { label: '카카오톡 vs 인스타 DM', a: '카카오톡', b: '인스타 DM' },
  // 연애
  { label: '밀당 vs 직진', a: '밀당파', b: '직진파' },
  { label: '썸 vs 바로 고백', a: '썸 탐', b: '바로 고백' },
  { label: '연상 vs 연하', a: '연상', b: '연하' },
  { label: '불 같은 연애 vs 잔잔한 연애', a: '불 같은 연애', b: '잔잔한 연애' },
  { label: '나이차 5살+ vs 비슷한 나이', a: '나이차 5살+', b: '비슷한 나이' },
  { label: '애교 vs 쿨함', a: '애교 있음', b: '쿨함' },
  { label: '잘생김 vs 잘 맞음', a: '잘생김 우선', b: '잘 맞음 우선' },
  { label: '진지한 관계 vs 가벼운 만남', a: '진지한 관계', b: '가벼운 만남' },
  // 19금 🔞
  { label: '돔 vs 섭 🔞', a: '돔', b: '섭', hot: true },
  { label: '집 vs 모텔 🔞', a: '집', b: '모텔', hot: true },
  { label: '같이 살기 vs 각자 집 🔞', a: '같이 살기 선호', b: '각자 집 선호', hot: true },
  { label: '첫날 vs 100일 후 🔞', a: '첫날밤', b: '100일 후', hot: true },
  { label: '리드 vs 리드받기 🔞', a: '내가 리드', b: '리드 받기', hot: true },
  { label: '소리 있게 vs 조용히 🔞', a: '소리 있게', b: '조용히', hot: true },
  { label: '불 끄고 vs 켜고 🔞', a: '불 끄고', b: '불 켜고', hot: true },
  { label: '빠르게 vs 천천히 🔞', a: '빠르게', b: '천천히', hot: true },
  { label: '원나잇 vs 사귀고 🔞', a: '원나잇 OK', b: '사귀고 나서', hot: true },
  { label: '키스만 vs 그 이상 🔞', a: '키스까지', b: '그 이상까지', hot: true },
  { label: '내가 공격 vs 내가 수비 🔞', a: '내가 공격', b: '내가 수비', hot: true },
  { label: '야하게 vs 다정하게 🔞', a: '야하게', b: '다정하게', hot: true },
  { label: '침대 vs 소파도 OK 🔞', a: '침대만', b: '소파도 OK', hot: true },
];

// ── 게임 공통 벌칙 빠른 선택 ───────────────────────────────────────────────
const GAME_PENALTY_QUICK = ['꽝 💀', '술 앞잔(원샷X) 🍺', '질문 받기 ❓', '19금 질문받기 🔞'];


// ─── Admin Balance Game Tab ───────────────────────────────────────────────────

function AdminBalanceGameCard({ game, counts, myVote, onVote, onEnd }: {
  game: BalanceGame;
  counts: { a: number; b: number };
  myVote: 'a' | 'b' | null;
  onVote?: (gameId: string, option: 'a' | 'b') => void;
  onEnd?: (id: string) => void;
}) {
  const total = counts.a + counts.b;
  const pctA = total > 0 ? Math.round((counts.a / total) * 100) : 50;
  const pctB = 100 - pctA;
  const ended = game.status === 'ended';
  return (
    <div className={`bg-white rounded-2xl shadow-sm border overflow-hidden ${ended ? 'opacity-70 border-gray-200' : 'border-violet-200 shadow-violet-100'}`}>
      <div className={`px-4 py-3 flex items-center justify-between ${ended ? 'bg-gray-50' : 'bg-gradient-to-r from-violet-50 to-purple-50'}`}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-violet-500 bg-violet-100 px-2 py-0.5 rounded-full">
            {game.scope === 'table' ? `${game.table_number}번 테이블` : '전체'}
          </span>
          {game.creator_nickname && <span className="text-xs text-gray-400">by {game.creator_nickname}</span>}
        </div>
        <div className="flex items-center gap-2">
          {ended ? (
            <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">종료됨</span>
          ) : (
            <span className="flex items-center gap-1 text-xs font-bold text-violet-500">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse inline-block" />
              투표 중 · {total}명
            </span>
          )}
          {onEnd && !ended && (
            <button onClick={() => onEnd(game.id)} className="text-[10px] font-bold text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100 px-2 py-0.5 rounded-full border border-red-200 transition-colors">게임 종료</button>
          )}
        </div>
      </div>
      <div className="px-4 py-4">
        <p className="text-base font-black text-gray-900 text-center mb-4 leading-snug">{game.question}</p>
        <div className="space-y-2.5">
          {(['a', 'b'] as const).map(opt => {
            const label = opt === 'a' ? game.option_a : game.option_b;
            const pct = opt === 'a' ? pctA : pctB;
            const count = opt === 'a' ? counts.a : counts.b;
            const isMyVote = myVote === opt;
            const isWinner = ended && count > (opt === 'a' ? counts.b : counts.a);
            const colorFill = opt === 'a' ? 'bg-blue-500/25' : 'bg-rose-500/25';
            const colorBar = opt === 'a' ? 'bg-blue-500' : 'bg-rose-500';
            const colorLabel = opt === 'a' ? 'text-blue-700' : 'text-rose-700';
            const colorCount = opt === 'a' ? 'text-blue-600' : 'text-rose-600';
            const borderColor = isMyVote ? (opt === 'a' ? 'border-blue-400 ring-2 ring-blue-200' : 'border-rose-400 ring-2 ring-rose-200') : 'border-gray-100';
            return (
              <button key={opt} onClick={() => !ended && onVote?.(game.id, opt)}
                className={`w-full rounded-xl overflow-hidden border-2 transition-all ${borderColor} ${!ended ? 'hover:opacity-90 active:scale-[0.99] cursor-pointer' : 'cursor-default'}`}>
                <div className="relative h-14 bg-gray-50">
                  <div className={`absolute inset-y-0 left-0 transition-all duration-700 ease-out ${colorFill}`} style={{ width: `${pct}%` }} />
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
                <div className={`h-1 ${colorBar} transition-all duration-700 ease-out`} style={{ width: `${pct}%` }} />
              </button>
            );
          })}
          <p className="text-center text-xs text-gray-400 mt-1">
            총 {total}명 참여{!ended && myVote && <span className="ml-1 text-violet-400 font-bold">· 내 선택: {myVote === 'a' ? game.option_a : game.option_b}</span>}
          </p>
        </div>
      </div>
    </div>
  );
}

function AdminBalanceGameTab({ balanceGames, voteCounts, myVotes, onVote }: {
  balanceGames: BalanceGame[];
  voteCounts: Map<string, { a: number; b: number }>;
  myVotes: Map<string, 'a' | 'b'>;
  onVote: (gameId: string, option: 'a' | 'b') => void;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshDone, setRefreshDone] = useState(false);
  const [localGames, setLocalGames] = useState<BalanceGame[]>(balanceGames);
  const [localCounts, setLocalCounts] = useState<Map<string, { a: number; b: number }>>(voteCounts);

  useEffect(() => { setLocalGames(balanceGames); }, [balanceGames]);
  useEffect(() => { setLocalCounts(voteCounts); }, [voteCounts]);

  const refresh = async () => {
    setRefreshing(true);
    const { data: games } = await adminSupabase.from('balance_games').select('*').order('created_at', { ascending: false }).limit(30);
    if (games) {
      setLocalGames(games as BalanceGame[]);
      const activeIds = (games as BalanceGame[]).filter(g => g.status === 'active').map(g => g.id);
      if (activeIds.length > 0) {
        const { data: votes } = await adminSupabase.from('balance_votes').select('game_id, option').in('game_id', activeIds);
        if (votes) {
          const counts = new Map<string, { a: number; b: number }>();
          votes.forEach((v: { game_id: string; option: string }) => {
            const c = counts.get(v.game_id) || { a: 0, b: 0 };
            counts.set(v.game_id, { ...c, [v.option]: c[v.option as 'a' | 'b'] + 1 });
          });
          setLocalCounts(counts);
        }
      }
    }
    setRefreshing(false);
    setRefreshDone(true);
    setTimeout(() => setRefreshDone(false), 2000);
  };

  const endGame = async (gameId: string) => {
    await adminSupabase.from('balance_games').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', gameId);
    // also clear app_settings game_state so clients see termination in real-time
    await adminSupabase.from('app_settings').update({
      game_state: { active: false } as unknown as Json,
      updated_at: new Date().toISOString(),
    } as never).eq('id', 1);
    setLocalGames(prev => prev.map(g => g.id === gameId ? { ...g, status: 'ended' as const } : g));
  };

  const clearAllEnded = async () => {
    const endedIds = localGames.filter(g => g.status === 'ended').map(g => g.id);
    if (endedIds.length === 0) return;
    await adminSupabase.from('balance_games').delete().in('id', endedIds);
    setLocalGames(prev => prev.filter(g => g.status !== 'ended'));
  };

  const active = localGames.filter(g => g.status === 'active');
  const ended = localGames.filter(g => g.status === 'ended').slice(0, 10);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">밸런스 게임 현황</h2>
        <div className="flex items-center gap-2">
          {ended.length > 0 && (
            <button onClick={clearAllEnded} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-700/30 hover:bg-red-700/50 text-red-300 text-xs font-bold rounded-xl transition-all border border-red-700/30">
              <Trash2 className="w-3.5 h-3.5" />종료 게임 삭제
            </button>
          )}
          <button onClick={refresh} disabled={refreshing}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all disabled:opacity-50 ${refreshDone ? 'bg-teal-700 border border-teal-600 text-teal-300' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}>
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />{refreshDone ? '완료!' : refreshing ? '로딩...' : '새로고침'}
          </button>
        </div>
      </div>

      {active.length === 0 && ended.length === 0 && (
        <div className="text-center py-10 text-slate-400">
          <Gamepad2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">진행 중인 밸런스 게임이 없습니다.</p>
        </div>
      )}

      {active.length > 0 && (
        <div>
          <p className="text-xs font-bold text-violet-400 uppercase tracking-wider mb-3">진행 중 ({active.length})</p>
          <div className="space-y-4">
            {active.map(g => (
              <AdminBalanceGameCard key={g.id} game={g} counts={localCounts.get(g.id) ?? { a: 0, b: 0 }} myVote={myVotes.get(g.id) ?? null} onVote={onVote} onEnd={endGame} />
            ))}
          </div>
        </div>
      )}

      {ended.length > 0 && (
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">종료된 게임 (최근 10개)</p>
          <div className="space-y-3">
            {ended.map(g => (
              <AdminBalanceGameCard key={g.id} game={g} counts={localCounts.get(g.id) ?? { a: 0, b: 0 }} myVote={myVotes.get(g.id) ?? null} onVote={onVote} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BalanceGameCreate({ currentGame, onGameUpdate, seats, settings, onRefresh }: { currentGame: GameState | null; onGameUpdate: (g: GameState | null) => void; seats: Seat[]; settings: AppSettings | null; onRefresh?: () => Promise<void> }) {
  const [optA, setOptA] = useState('');
  const [optB, setOptB] = useState('');
  const [balancePenalty, setBalancePenalty] = useState('');
  const [targetTable, setTargetTable] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshDone, setRefreshDone] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [batchConfig, setBatchConfig] = useState<Map<number, { a: string; b: string } | null>>(new Map());
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchSentTables, setBatchSentTables] = useState<Set<number>>(new Set());
  const [batchPickerTable, setBatchPickerTable] = useState<number | null>(null);
  const [batchBalancePenalties, setBatchBalancePenalties] = useState<Map<number, string>>(new Map());
  const [batchBalancePenaltyPickerTable, setBatchBalancePenaltyPickerTable] = useState<number | null>(null);

  const handleRefresh = async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
    setRefreshDone(true);
    setTimeout(() => setRefreshDone(false), 2000);
  };

  const allTableNumbers = [...new Set(seats.map(s => s.table_number))].sort((a, b) => a - b);
  const activeTables = settings?.active_tables ?? null;
  const tableNumbers = activeTables ? allTableNumbers.filter(n => activeTables.includes(n)) : allTableNumbers;

  const applyQuick = (q: typeof BALANCE_QUICK[0]) => { setOptA(q.a); setOptB(q.b); };

  const startGame = async () => {
    if (!optA.trim() || !optB.trim()) return;
    setSaving(true);
    const { data: gameRow } = await adminSupabase.from('balance_games').insert({
      creator_nickname: '관리자',
      scope: targetTable !== null ? 'table' : 'global',
      table_number: targetTable ?? null,
      question: `${optA.trim()} vs ${optB.trim()}`,
      option_a: optA.trim(),
      option_b: optB.trim(),
    }).select().single();
    const gameState: GameState = {
      active: true, type: 'balance', title: `${optA.trim()} vs ${optB.trim()}`,
      description: '두 가지 중 하나를 선택하세요!', rules: '', penalty: balancePenalty.trim(),
      option_a: optA.trim(), option_b: optB.trim(),
      game_id: (gameRow as { id: string } | null)?.id,
      started_at: new Date().toISOString(), table_number: targetTable ?? undefined,
    };
    await adminSupabase.from('app_settings').update({ game_state: gameState as unknown as Json, updated_at: new Date().toISOString() }).eq('id', 1);
    onGameUpdate(gameState);
    setSaving(false);
  };

  const stopGame = async () => {
    setSaving(true);
    await adminSupabase.from('app_settings').update({ game_state: { active: false } as unknown as Json, updated_at: new Date().toISOString() }).eq('id', 1);
    onGameUpdate(null);
    setSaving(false);
  };

  const updateBatchField = (tableNum: number, field: 'a' | 'b', value: string) => {
    setBatchConfig(prev => {
      const next = new Map(prev);
      const cur = next.get(tableNum) ?? { a: '', b: '' };
      next.set(tableNum, { ...cur, [field]: value });
      return next;
    });
  };

  const startBatchGames = async () => {
    const entries = tableNumbers
      .map(n => ({ n, config: batchConfig.get(n) }))
      .filter(({ config }) => !!config && config.a.trim() && config.b.trim()) as { n: number; config: { a: string; b: string } }[];
    if (!entries.length) return;
    setBatchSaving(true);
    for (const { n, config } of entries) {
      await adminSupabase.from('balance_games').insert({
        creator_nickname: '관리자',
        scope: 'table',
        table_number: n,
        question: `${config.a.trim()} vs ${config.b.trim()}`,
        option_a: config.a.trim(),
        option_b: config.b.trim(),
      });
      setBatchSentTables(prev => new Set([...prev, n]));
    }
    setBatchConfig(new Map());
    setBatchSentTables(new Set());
    setBatchSaving(false);
  };

  const sendSingleBalanceTable = async (n: number) => {
    const config = batchConfig.get(n);
    if (!config || !config.a.trim() || !config.b.trim()) return;
    setBatchSentTables(prev => new Set([...prev, n]));
    await adminSupabase.from('balance_games').insert({
      creator_nickname: '관리자',
      scope: 'table',
      table_number: n,
      question: `${config.a.trim()} vs ${config.b.trim()}`,
      option_a: config.a.trim(),
      option_b: config.b.trim(),
    });
    setBatchConfig(prev => { const m = new Map(prev); m.set(n, { a: '', b: '' }); return m; });
    setTimeout(() => setBatchSentTables(prev => { const s = new Set(prev); s.delete(n); return s; }), 2000);
  };

  const batchCount = tableNumbers.filter(n => {
    const c = batchConfig.get(n);
    return c && c.a.trim() && c.b.trim();
  }).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Gamepad2 className="w-5 h-5 text-violet-500" />밸런스 게임 만들기
        </h2>
        <div className="flex items-center gap-2">
          {currentGame?.active && (
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-100 border border-violet-200 rounded-full text-xs font-bold text-violet-700 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-violet-500" />진행 중: {currentGame.title}
              </span>
              <button onClick={stopGame} disabled={saving} className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold rounded-xl border border-red-200 transition-all disabled:opacity-50">
                게임 종료
              </button>
            </div>
          )}
          <button onClick={handleRefresh} disabled={refreshing || !onRefresh}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-xl transition-all border disabled:opacity-40 ${refreshDone ? 'bg-teal-50 border-teal-300 text-teal-600' : 'bg-gray-100 hover:bg-gray-200 text-gray-600 border-gray-200'}`}>
            <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshDone ? '완료!' : '새로고침'}
          </button>
          <div className="flex bg-gray-100 rounded-xl border border-gray-200 overflow-hidden">
            <button onClick={() => setBatchMode(false)} className={`px-3 py-1.5 text-xs font-bold transition-colors ${!batchMode ? 'bg-violet-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}>단일</button>
            <button onClick={() => setBatchMode(true)} className={`px-3 py-1.5 text-xs font-bold transition-colors ${batchMode ? 'bg-violet-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}>일괄</button>
          </div>
        </div>
      </div>

      {!batchMode ? (
        <>
          {/* 빠른 선택 */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2.5">빠른 선택</p>
            <div className="flex flex-wrap gap-2">
              {BALANCE_QUICK.map(q => (
                <button key={q.label} onClick={() => applyQuick(q)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-all ${optA === q.a && optB === q.b ? 'bg-violet-500 border-violet-500 text-white' : q.hot ? 'bg-rose-50 border-rose-200 text-rose-600 hover:border-rose-400' : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-violet-400 hover:text-violet-600'}`}>
                  {q.label}
                </button>
              ))}
            </div>
          </div>

          {/* 선택지 입력 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-violet-600 block mb-1.5">선택지 A *</label>
              <input type="text" value={optA} onChange={e => setOptA(e.target.value)} placeholder="예: 치킨"
                className="w-full bg-white border-2 border-violet-200 text-gray-900 text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-violet-500 placeholder-gray-400" />
            </div>
            <div>
              <label className="text-xs font-bold text-rose-500 block mb-1.5">선택지 B *</label>
              <input type="text" value={optB} onChange={e => setOptB(e.target.value)} placeholder="예: 피자"
                className="w-full bg-white border-2 border-rose-200 text-gray-900 text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-rose-400 placeholder-gray-400" />
            </div>
          </div>

          {/* 벌칙 */}
          <div>
            <label className="text-xs font-bold text-red-500 uppercase tracking-wider block mb-1.5">벌칙 (선택)</label>
            <input type="text" value={balancePenalty} onChange={e => setBalancePenalty(e.target.value)}
              placeholder="예: 원샷, 건배사 하기"
              className="w-full bg-gray-50 border border-red-200 text-gray-900 text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-300 mb-2" />
            <div className="flex flex-wrap gap-1.5">
              {GAME_PENALTY_QUICK.map(v => (
                <button key={v} type="button" onClick={() => setBalancePenalty(v)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold border-2 transition-all ${balancePenalty === v ? 'bg-red-500 border-red-500 text-white' : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'}`}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* 대상 테이블 선택 */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">대상 테이블</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setTargetTable(null)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${targetTable === null ? 'bg-violet-500 border-violet-500 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}>전체</button>
              {tableNumbers.map(n => (
                <button key={n} onClick={() => setTargetTable(n)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${targetTable === n ? 'bg-cyan-500 border-cyan-500 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}>{TABLE_LABELS[n] ?? n}</button>
              ))}
            </div>
          </div>

          <button onClick={startGame} disabled={!optA.trim() || !optB.trim() || saving}
            className="w-full py-4 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-400 hover:to-purple-500 text-white font-black text-base rounded-2xl transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-violet-500/20 active:scale-[0.98]">
            {saving ? '게임 시작 중...' : targetTable !== null ? `${TABLE_LABELS[targetTable] ?? targetTable}번 테이블 게임 시작!` : '전체 게임 시작!'}
          </button>
          {(optA.trim() || optB.trim()) && (
            <p className="text-xs text-gray-400 text-center -mt-2">
              {targetTable !== null ? `${TABLE_LABELS[targetTable] ?? targetTable}번 테이블에만 전파됩니다` : '전체 참여자에게 즉시 전파됩니다'}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-xs text-gray-500">활성 테이블별로 다른 게임을 동시에 시작합니다. A, B 선택지를 입력하세요.</p>
          {/* 일괄 빠른 선택 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">빠른 선택</p>
              <button onClick={() => {
                const shuffled = [...BALANCE_QUICK].sort(() => Math.random() - 0.5);
                const m = new Map<number, { a: string; b: string }>();
                tableNumbers.forEach((n, i) => m.set(n, { a: shuffled[i % shuffled.length].a, b: shuffled[i % shuffled.length].b }));
                setBatchConfig(m);
                setBatchSentTables(new Set());
              }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-violet-50 border border-violet-200 text-violet-600 hover:bg-violet-100 transition-all active:scale-95">
                🎲 테이블별 랜덤 배분
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {BALANCE_QUICK.map(q => (
                <button key={q.label} onClick={() => {
                  const m = new Map<number, { a: string; b: string }>();
                  tableNumbers.forEach(n => m.set(n, { a: q.a, b: q.b }));
                  setBatchConfig(m);
                  setBatchSentTables(new Set());
                }}
                  className={`px-2.5 py-1.5 rounded-full text-xs font-bold border-2 transition-all ${q.hot ? 'bg-rose-50 border-rose-200 text-rose-600 hover:border-rose-400' : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-violet-400 hover:text-violet-600'}`}>
                  {q.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5">🎲 버튼: 각 테이블에 다른 문제 무작위 배분 / 개별 버튼: 전 테이블 동일 문제</p>
          </div>
          {tableNumbers.length === 0 && <p className="text-sm text-gray-400 text-center py-4">활성 테이블이 없습니다. 먼저 테이블 설정에서 활성 테이블을 선택하세요.</p>}
          <div className="space-y-2">
            {tableNumbers.map(n => {
              const config = batchConfig.get(n) ?? { a: '', b: '' };
              const filled = config.a.trim() && config.b.trim();
              const sent = batchSentTables.has(n);
              const pickerOpen = batchPickerTable === n;
              const penaltyPickerOpen = batchBalancePenaltyPickerTable === n;
              const penalty = batchBalancePenalties.get(n) ?? '';
              return (
                <div key={n} className={`rounded-xl border-2 p-3 transition-all ${filled ? 'border-violet-400 bg-violet-50' : 'border-gray-200 bg-gray-50'}`}>
                  {/* 헤더 행: 테이블명 + 버튼들 */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs font-black flex-1 ${filled ? 'text-violet-700' : 'text-gray-500'}`}>{TABLE_LABELS[n] ?? n}번</span>
                    <button
                      onClick={() => { setBatchPickerTable(pickerOpen ? null : n); setBatchBalancePenaltyPickerTable(null); }}
                      className={`flex-shrink-0 px-2 py-1.5 rounded-lg text-xs font-bold transition-all border ${pickerOpen ? 'bg-violet-200 text-violet-700 border-violet-300' : 'bg-white text-violet-500 border-violet-200 hover:bg-violet-50'}`}
                    >
                      {pickerOpen ? '닫기' : '고르기'}
                    </button>
                    <button
                      onClick={() => sendSingleBalanceTable(n)}
                      disabled={!filled || sent}
                      className={`flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-40 ${sent ? 'bg-teal-500 text-white' : 'bg-violet-500 hover:bg-violet-600 text-white'}`}
                    >
                      {sent ? '완료!' : '전송'}
                    </button>
                  </div>
                  {/* 선택지 행 */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={config.a}
                      onChange={e => updateBatchField(n, 'a', e.target.value)}
                      placeholder="선택지 A"
                      className="flex-1 bg-white border border-violet-200 text-gray-900 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-400 placeholder-gray-400"
                    />
                    <span className="text-gray-400 text-xs font-bold flex-shrink-0">vs</span>
                    <input
                      type="text"
                      value={config.b}
                      onChange={e => updateBatchField(n, 'b', e.target.value)}
                      placeholder="선택지 B"
                      className="flex-1 bg-white border border-rose-200 text-gray-900 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-rose-400 placeholder-gray-400"
                    />
                  </div>
                  {/* 선택지 고르기 패널 */}
                  {pickerOpen && (
                    <div className="mt-2 flex flex-wrap gap-1.5 pt-2 border-t border-violet-200">
                      {BALANCE_QUICK.map(q => (
                        <button key={q.label}
                          onClick={() => {
                            const m = new Map(batchConfig);
                            m.set(n, { a: q.a, b: q.b });
                            setBatchConfig(m);
                            setBatchSentTables(prev => { const s = new Set(prev); s.delete(n); return s; });
                            setBatchPickerTable(null);
                          }}
                          className={`px-2.5 py-1.5 rounded-full text-xs font-bold border-2 transition-all active:scale-95 ${q.hot ? 'bg-rose-50 border-rose-200 text-rose-600 hover:border-rose-400' : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-violet-400 hover:text-violet-600'}`}>
                          {q.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* 벌칙 행 */}
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[10px] font-black text-red-400 w-14 flex-shrink-0">벌칙</span>
                    <input
                      type="text"
                      value={penalty}
                      onChange={e => { const m = new Map(batchBalancePenalties); m.set(n, e.target.value); setBatchBalancePenalties(m); }}
                      placeholder="벌칙 (선택)"
                      className="flex-1 bg-white border border-red-200 text-gray-900 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-red-400 placeholder-gray-400"
                    />
                    <button
                      onClick={() => { setBatchBalancePenaltyPickerTable(penaltyPickerOpen ? null : n); setBatchPickerTable(null); }}
                      className={`flex-shrink-0 px-2 py-1.5 rounded-lg text-xs font-bold transition-all border ${penaltyPickerOpen ? 'bg-red-200 text-red-700 border-red-300' : 'bg-white text-red-500 border-red-200 hover:bg-red-50'}`}
                    >
                      {penaltyPickerOpen ? '닫기' : '고르기'}
                    </button>
                  </div>
                  {/* 벌칙 고르기 패널 */}
                  {penaltyPickerOpen && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5 pt-2 border-t border-red-100">
                      {GAME_PENALTY_QUICK.map(v => (
                        <button key={v}
                          onClick={() => {
                            const m = new Map(batchBalancePenalties);
                            m.set(n, v);
                            setBatchBalancePenalties(m);
                            setBatchBalancePenaltyPickerTable(null);
                          }}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-bold border-2 transition-all active:scale-95 ${penalty === v ? 'bg-red-500 border-red-500 text-white' : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'}`}>
                          {v}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button onClick={startBatchGames} disabled={batchCount === 0 || batchSaving}
            className="w-full py-3 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-400 hover:to-purple-500 text-white font-bold text-sm rounded-2xl transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-violet-500/20 active:scale-[0.98]">
            {batchSaving ? '시작 중...' : batchCount > 0 ? `입력된 ${batchCount}개 테이블 일괄 전송` : '테이블별 선택지를 입력하세요'}
          </button>
        </>
      )}
    </div>
  );
}

function QaGameSection({ seats }: { seats: Seat[] }) {
  const [qaQuestion, setQaQuestion] = useState('');
  const [qaCorrectAnswer, setQaCorrectAnswer] = useState('');
  const [qaPenalty, setQaPenalty] = useState('');
  const [qaTargetTable, setQaTargetTable] = useState<number | null>(null);
  const [qaSaving, setQaSaving] = useState(false);
  const [activeQaGame, setActiveQaGame] = useState<QaGame | null>(null);
  const [qaAnswers, setQaAnswers] = useState<QaAnswer[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshDone, setRefreshDone] = useState(false);
  // Keep a ref to always access latest game inside async channel callbacks
  const activeQaGameRef = useRef<QaGame | null>(null);

  const loadActiveQa = useCallback(async () => {
    const { data } = await adminSupabase.from('qa_games').select('*').eq('status', 'active').eq('scope', 'qa_global').order('created_at', { ascending: false }).limit(1);
    const game = data?.[0] as QaGame | undefined ?? null;
    activeQaGameRef.current = game;
    setActiveQaGame(game);
    if (game) {
      const { data: ans } = await adminSupabase.from('qa_answers').select('*').eq('game_id', game.id).order('submitted_at', { ascending: true });
      setQaAnswers((ans ?? []) as QaAnswer[]);
    } else { setQaAnswers([]); }
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadActiveQa();
    setRefreshing(false);
    setRefreshDone(true);
    setTimeout(() => setRefreshDone(false), 2000);
  };

  useEffect(() => {
    loadActiveQa();
    // Use unique channel name to avoid conflicts when tab switches cause remount
    const chName = `qa-admin-${Date.now()}`;
    const ch = supabase.channel(chName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'qa_answers' }, async (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        const newAnswer = payload.new as QaAnswer;
        const currentGame = activeQaGameRef.current;
        if (currentGame && newAnswer.game_id === currentGame.id) {
          setQaAnswers(prev => prev.some(a => a.id === newAnswer.id) ? prev : [...prev, newAnswer]);
        } else {
          await loadActiveQa();
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'qa_answers' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        const updated = payload.new as QaAnswer;
        setQaAnswers(prev => prev.map(a => a.id === updated.id ? updated : a));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'qa_games' }, () => loadActiveQa())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'qa_games' }, () => loadActiveQa())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loadActiveQa]);

  const startQa = async () => {
    if (!qaQuestion.trim()) return;
    setQaSaving(true);
    const fullQuestion = qaQuestion.trim() + (qaPenalty.trim() ? `\n🎯 벌칙: ${qaPenalty.trim()}` : '');
    const { data } = await adminSupabase.from('qa_games').insert({
      question: fullQuestion, correct_answer: qaCorrectAnswer.trim() || null, status: 'active',
      scope: qaTargetTable !== null ? 'qa_table' : 'qa_global',
      table_number: qaTargetTable ?? null,
    }).select().single();
    if (data) {
      activeQaGameRef.current = data as QaGame;
      setActiveQaGame(data as QaGame);
    }
    setQaAnswers([]);
    setQaQuestion('');
    setQaCorrectAnswer('');
    setQaPenalty('');
    setQaTargetTable(null);
    setQaSaving(false);
  };

  const endQa = async () => {
    if (!activeQaGame) return;
    setQaSaving(true);
    await adminSupabase.from('qa_games').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', activeQaGame.id);
    activeQaGameRef.current = null;
    setActiveQaGame(null);
    setQaAnswers([]);
    setQaSaving(false);
  };

  const markCorrect = async (answerId: string, correct: boolean) => {
    await adminSupabase.from('qa_answers').update({ is_correct: correct }).eq('id', answerId);
    setQaAnswers(prev => prev.map(a => a.id === answerId ? { ...a, is_correct: correct } : a));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Gamepad2 className="w-5 h-5 text-teal-500" />
        <h2 className="text-lg font-bold text-gray-900">Q&A 게임</h2>
        <div className="ml-auto flex items-center gap-2">
          {activeQaGame && (
            <span className="px-2 py-0.5 bg-teal-100 text-teal-700 text-[10px] font-black rounded-full uppercase tracking-wider border border-teal-300 animate-pulse">진행 중</span>
          )}
          <button onClick={handleRefresh} disabled={refreshing}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-xl transition-all border disabled:opacity-50 ${refreshDone ? 'bg-teal-50 border-teal-300 text-teal-600' : 'bg-gray-100 hover:bg-gray-200 text-gray-600 border-gray-200'}`}>
            <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshDone ? '완료!' : refreshing ? '로딩...' : '새로고침'}
          </button>
        </div>
      </div>

      {activeQaGame ? (
        <>
          <div className="flex items-start justify-between gap-3 flex-wrap bg-teal-50 rounded-xl border border-teal-200 p-4">
            <div>
              <p className="text-[10px] text-teal-600 font-bold uppercase tracking-wider mb-1">진행 중인 질문</p>
              <p className="text-sm font-bold text-gray-900 leading-snug">{activeQaGame.question}</p>
              {activeQaGame.correct_answer && <p className="text-xs text-teal-600 mt-1">정답: {activeQaGame.correct_answer}</p>}
            </div>
            <button onClick={endQa} disabled={qaSaving}
              className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold rounded-xl border border-red-200 transition-all flex-shrink-0">
              {qaSaving ? '종료 중...' : 'Q&A 종료'}
            </button>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">답변 {qaAnswers.length}개</p>
            {qaAnswers.length === 0 && <p className="text-sm text-gray-400 text-center py-6">아직 답변이 없습니다</p>}
            {qaAnswers.map((a, idx) => {
              const seat = seats.find(s => s.profile_id === a.user_id);
              return (
                <div key={a.id} className={`flex items-start gap-2.5 bg-white rounded-xl border p-3 ${a.is_correct ? 'border-teal-400 bg-teal-50/50' : 'border-gray-200'}`}>
                  <span className="flex-shrink-0 w-5 h-5 mt-0.5 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-black text-gray-400">{idx + 1}</span>
                  <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex flex-col items-center justify-center font-black text-center leading-tight ${a.table_number != null ? 'bg-cyan-100 text-cyan-700 border border-cyan-200' : 'bg-gray-100 text-gray-500'}`}>
                    {a.table_number != null ? (
                      <>
                        <span className="text-sm font-black">{TABLE_LABELS[a.table_number] ?? a.table_number}</span>
                        <span className="text-[8px] opacity-70">번</span>
                      </>
                    ) : '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                      <span className="text-xs font-bold text-gray-800">{a.nickname ?? '익명'}</span>
                      {seat && (
                        <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full leading-none">
                          {seat.seat_label}석
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-900 leading-relaxed">{a.answer}</p>
                  </div>
                  {activeQaGame.correct_answer && (
                    <button onClick={() => markCorrect(a.id, !a.is_correct)}
                      className={`flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${a.is_correct ? 'bg-teal-100 text-teal-700 border border-teal-300' : 'bg-gray-100 text-gray-500 border border-gray-200 hover:border-teal-300 hover:text-teal-600'}`}>
                      {a.is_correct ? '✓ 정답' : '정답?'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-gray-500">질문을 입력하고 시작하면 유저들에게 화면 중앙에 공지됩니다</p>
          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-1.5">질문 *</label>
            <textarea value={qaQuestion} onChange={e => setQaQuestion(e.target.value)}
              placeholder="예: 오늘 이 자리에서 제일 많이 웃게 해준 사람은?" rows={3}
              className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-1.5">정답 (선택)</label>
            <input type="text" value={qaCorrectAnswer} onChange={e => setQaCorrectAnswer(e.target.value)}
              placeholder="정답이 있는 경우 입력 (없으면 빈칸)"
              className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-400" />
          </div>
          {/* 대상 테이블 */}
          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-1.5">대상</label>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setQaTargetTable(null)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all active:scale-95 ${qaTargetTable === null ? 'bg-teal-500 border-teal-500 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-teal-300'}`}>
                전체
              </button>
              {[...new Set(seats.map(s => s.table_number))].sort((a, b) => a - b).map(n => (
                <button key={n} onClick={() => setQaTargetTable(qaTargetTable === n ? null : n)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all active:scale-95 ${qaTargetTable === n ? 'bg-teal-500 border-teal-500 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-teal-300'}`}>
                  {TABLE_LABELS[n] ?? n}번
                </button>
              ))}
            </div>
          </div>
          <button onClick={startQa} disabled={!qaQuestion.trim() || qaSaving}
            className="w-full py-3.5 bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-400 hover:to-cyan-500 text-white font-bold rounded-xl transition-all disabled:opacity-40 shadow-lg shadow-teal-500/20 flex items-center justify-center gap-2">
            <Gamepad2 className="w-4 h-4" />{qaSaving ? 'Q&A 시작 중...' : qaTargetTable !== null ? `${TABLE_LABELS[qaTargetTable] ?? qaTargetTable}번 테이블 Q&A 시작` : 'Q&A 시작'}
          </button>
        </>
      )}
    </div>
  );
}

type QaGame = Database['public']['Tables']['qa_games']['Row'];
type QaAnswer = Database['public']['Tables']['qa_answers']['Row'];
type ImageGame = Database['public']['Tables']['image_games']['Row'];

// ─── OX Game Section ───────────────────────────────────────────────────────────
const OX_A = '⭕ O';
const OX_B = '❌ X';
const isOxGame = (g: BalanceGame) => g.option_a === OX_A && g.option_b === OX_B;

const OX_QUICK_GENERAL = [
  '오늘 처음 온 술번개다',
  '지금 누군가에게 번호 받고 싶다',
  '오늘 맘에 드는 사람이 생겼다',
  '술을 더 마실 수 있다',
  '지금 이 순간 연애하고 싶다',
  '다음 술번개도 반드시 나온다',
  '오늘 내가 이 자리 분위기 메이커다',
  '오늘 새 친구가 생겼다',
  '술 게임에 자신 있다',
  '오늘 처음 보는 사람이 있다',
  '오늘 밸런스 게임 가장 솔직하게 했다',
  '범일NPC 이용약관을 읽었다',
];
const OX_QUICK_HOT = [
  '지금 옆 사람이 매력적으로 느껴진다',
  '오늘 자고 가고 싶은 분위기다',
  '첫 만남에도 집 갈 의향이 있다',
  '지금 이 자리에서 데려가고 싶은 사람이 있다',
  '오늘 번호 교환 이상을 원하는 사람이 있다',
  '돔보다 섭이 더 편하다',
  '오늘 리드하고 싶은 사람이 생겼다',
  '야한 농담도 괜찮다',
];

function OxGameSection({ balanceGames, voteCounts, currentGame, onGameUpdate, seats, settings, onRefresh }: {
  balanceGames: BalanceGame[];
  voteCounts: Map<string, { a: number; b: number }>;
  currentGame: GameState | null;
  onGameUpdate: (g: GameState | null) => void;
  seats: Seat[];
  settings: AppSettings | null;
  onRefresh?: () => Promise<void>;
}) {
  const [question, setQuestion] = useState('');
  const [oxPenalty, setOxPenalty] = useState('');
  const [targetTable, setTargetTable] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshDone, setRefreshDone] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [batchOxQuestions, setBatchOxQuestions] = useState<Map<number, string>>(new Map());
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchSentTables, setBatchSentTables] = useState<Set<number>>(new Set());
  const [oxQuickCat, setOxQuickCat] = useState<'general' | 'hot'>('general');
  const [batchOxPickerTable, setBatchOxPickerTable] = useState<number | null>(null);
  const [batchOxPenalties, setBatchOxPenalties] = useState<Map<number, string>>(new Map());
  const [batchOxPenaltyPickerTable, setBatchOxPenaltyPickerTable] = useState<number | null>(null);

  const handleRefresh = async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
    setRefreshDone(true);
    setTimeout(() => setRefreshDone(false), 2000);
  };

  const oxGames = balanceGames.filter(isOxGame);
  const activeOxGame = oxGames.find(g => g.status === 'active');
  const isOxActive = !!(currentGame?.active && currentGame.option_a === OX_A);

  const allNums = [...new Set(seats.map(s => s.table_number))].sort((a, b) => a - b);
  const active = settings?.active_tables ?? null;
  const tableNumbers = active ? allNums.filter(n => active.includes(n)) : allNums;

  const startOx = async () => {
    if (!question.trim()) return;
    setSaving(true);
    const { data: row } = await adminSupabase.from('balance_games').insert({
      creator_nickname: '관리자',
      scope: targetTable !== null ? 'table' : 'global',
      table_number: targetTable ?? null,
      question: question.trim(),
      option_a: OX_A,
      option_b: OX_B,
    }).select().single();
    const gs: GameState = {
      active: true, type: 'balance',
      title: question.trim(),
      description: 'O 또는 X를 선택하세요!',
      rules: '', penalty: oxPenalty.trim(),
      option_a: OX_A, option_b: OX_B,
      game_id: (row as { id: string } | null)?.id,
      started_at: new Date().toISOString(),
      table_number: targetTable ?? undefined,
    };
    await adminSupabase.from('app_settings').update({ game_state: gs as unknown as Json, updated_at: new Date().toISOString() }).eq('id', 1);
    onGameUpdate(gs);
    setQuestion('');
    setOxPenalty('');
    setSaving(false);
  };

  const stopOx = async () => {
    setSaving(true);
    await adminSupabase.from('app_settings').update({ game_state: { active: false } as unknown as Json, updated_at: new Date().toISOString() }).eq('id', 1);
    onGameUpdate(null);
    setSaving(false);
  };

  const sendBatchOx = async () => {
    const entries = [...batchOxQuestions.entries()].filter(([, q]) => q.trim());
    if (entries.length === 0) return;
    setBatchSaving(true);
    for (const [n, q] of entries) {
      await adminSupabase.from('balance_games').insert({
        creator_nickname: '관리자', scope: 'table', table_number: n,
        question: q.trim(), option_a: OX_A, option_b: OX_B,
      });
    }
    setBatchSentTables(new Set(entries.map(([n]) => n)));
    setBatchOxQuestions(new Map());
    setBatchSaving(false);
  };

  const batchFilledCount = tableNumbers.filter(n => (batchOxQuestions.get(n) ?? '').trim()).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <span className="text-xl">⭕❌</span> OX 게임 만들기
        </h2>
        <div className="flex items-center gap-2">
          {isOxActive && (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 px-2.5 py-1 bg-orange-100 border border-orange-200 rounded-full text-[10px] font-bold text-orange-700 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />진행 중
              </span>
              <button onClick={stopOx} disabled={saving}
                className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold rounded-xl border border-red-200 transition-all disabled:opacity-50">
                종료
              </button>
            </div>
          )}
          <button onClick={handleRefresh} disabled={refreshing || !onRefresh}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-xl transition-all border disabled:opacity-40 ${refreshDone ? 'bg-teal-50 border-teal-300 text-teal-600' : 'bg-gray-100 hover:bg-gray-200 text-gray-600 border-gray-200'}`}>
            <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshDone ? '완료!' : '새로고침'}
          </button>
          <div className="flex bg-gray-100 rounded-xl border border-gray-200 overflow-hidden">
            <button onClick={() => setBatchMode(false)} className={`px-3 py-1.5 text-xs font-bold transition-colors ${!batchMode ? 'bg-orange-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}>단일</button>
            <button onClick={() => setBatchMode(true)} className={`px-3 py-1.5 text-xs font-bold transition-colors ${batchMode ? 'bg-orange-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}>일괄</button>
          </div>
        </div>
      </div>

      {!batchMode ? (
        <>
          {/* 빠른 문제 */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">빠른 문제</p>
              <div className="flex bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
                <button onClick={() => setOxQuickCat('general')} className={`px-2.5 py-1 text-[11px] font-bold transition-colors ${oxQuickCat === 'general' ? 'bg-orange-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}>일반</button>
                <button onClick={() => setOxQuickCat('hot')} className={`px-2.5 py-1 text-[11px] font-bold transition-colors ${oxQuickCat === 'hot' ? 'bg-rose-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}>🔞 19금</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {(oxQuickCat === 'general' ? OX_QUICK_GENERAL : OX_QUICK_HOT).map(q => (
                <button key={q} onClick={() => setQuestion(q)}
                  className={`text-xs font-semibold px-2 py-2 rounded-xl border transition-all text-left leading-snug active:scale-95 ${question === q ? (oxQuickCat === 'hot' ? 'bg-rose-500 border-rose-500 text-white' : 'bg-orange-500 border-orange-500 text-white') : oxQuickCat === 'hot' ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100' : 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100'}`}>
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* 문제 입력 */}
          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-1.5">OX 문제 *</label>
            <textarea value={question} onChange={e => setQuestion(e.target.value)}
              placeholder="예: 오늘 이 자리가 즐겁다" rows={2}
              className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none" />
          </div>

          {/* 벌칙 */}
          <div>
            <label className="text-xs font-bold text-red-500 uppercase tracking-wider block mb-1.5">벌칙 (선택)</label>
            <input type="text" value={oxPenalty} onChange={e => setOxPenalty(e.target.value)}
              placeholder="예: 원샷, 건배사 하기"
              className="w-full bg-gray-50 border border-red-200 text-gray-900 text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-300 mb-2" />
            <div className="flex flex-wrap gap-1.5">
              {GAME_PENALTY_QUICK.map(v => (
                <button key={v} type="button" onClick={() => setOxPenalty(v)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold border-2 transition-all ${oxPenalty === v ? 'bg-red-500 border-red-500 text-white' : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'}`}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* 대상 */}
          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-1.5">대상</label>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setTargetTable(null)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all active:scale-95 ${targetTable === null ? 'bg-orange-500 border-orange-500 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-orange-300'}`}>
                전체
              </button>
              {tableNumbers.map(n => (
                <button key={n} onClick={() => setTargetTable(targetTable === n ? null : n)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all active:scale-95 ${targetTable === n ? 'bg-orange-500 border-orange-500 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-orange-300'}`}>
                  {TABLE_LABELS[n] ?? n}번
                </button>
              ))}
            </div>
          </div>

          <button onClick={startOx} disabled={!question.trim() || saving}
            className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 text-white font-bold rounded-xl transition-all disabled:opacity-40 shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2">
            <span className="text-lg">⭕❌</span>{saving ? 'OX 시작 중...' : targetTable !== null ? `${TABLE_LABELS[targetTable] ?? targetTable}번 테이블 OX 시작` : 'OX 게임 시작'}
          </button>
        </>
      ) : (
        <>
          <p className="text-xs text-gray-500">테이블별로 다른 OX 문제를 동시에 전송합니다.</p>
          {/* 일괄 빠른 선택 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">빠른 문제</p>
              <button onClick={() => {
                const pool = [...OX_QUICK_GENERAL, ...OX_QUICK_HOT].sort(() => Math.random() - 0.5);
                const m = new Map<number, string>();
                tableNumbers.forEach((n, i) => m.set(n, pool[i % pool.length]));
                setBatchOxQuestions(m);
              }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-orange-50 border border-orange-200 text-orange-600 hover:bg-orange-100 transition-all active:scale-95">
                🎲 테이블별 랜덤 배분
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {OX_QUICK_GENERAL.slice(0, 8).map(q => (
                <button key={q} onClick={() => {
                  const m = new Map<number, string>();
                  tableNumbers.forEach(n => m.set(n, q));
                  setBatchOxQuestions(m);
                }}
                  className="text-xs font-semibold px-2 py-2 rounded-xl bg-orange-50 border border-orange-200 text-orange-700 hover:bg-orange-100 transition-all text-left leading-snug active:scale-95">
                  {q}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5">🎲 버튼: 각 테이블에 다른 문제 무작위 배분 / 개별 버튼: 전 테이블 동일 문제</p>
          </div>
          {tableNumbers.length === 0 && <p className="text-sm text-gray-400 text-center py-4">활성 테이블이 없습니다.</p>}
          <div className="space-y-2">
            {tableNumbers.map(n => {
              const q = batchOxQuestions.get(n) ?? '';
              const filled = q.trim().length > 0;
              const sent = batchSentTables.has(n);
              const oxPickerOpen = batchOxPickerTable === n;
              const oxPenaltyPickerOpen = batchOxPenaltyPickerTable === n;
              const oxPenalty = batchOxPenalties.get(n) ?? '';
              return (
                <div key={n} className={`rounded-xl border-2 p-3 transition-all ${filled ? 'border-orange-400 bg-orange-50' : 'border-gray-200 bg-gray-50'}`}>
                  {/* 문제 행 */}
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-black w-14 flex-shrink-0 ${filled ? 'text-orange-700' : 'text-gray-500'}`}>{TABLE_LABELS[n] ?? n}번</span>
                    <input type="text" value={q} onChange={e => {
                      const m = new Map(batchOxQuestions);
                      m.set(n, e.target.value);
                      setBatchOxQuestions(m);
                    }}
                      placeholder="OX 문제 입력"
                      className="flex-1 bg-white border border-orange-200 text-gray-900 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-orange-400 placeholder-gray-400" />
                    <button
                      onClick={() => { setBatchOxPickerTable(oxPickerOpen ? null : n); setBatchOxPenaltyPickerTable(null); }}
                      className={`flex-shrink-0 px-2 py-1.5 rounded-lg text-xs font-bold transition-all border ${oxPickerOpen ? 'bg-orange-200 text-orange-700 border-orange-300' : 'bg-white text-orange-500 border-orange-200 hover:bg-orange-50'}`}
                    >
                      {oxPickerOpen ? '닫기' : '고르기'}
                    </button>
                    <span className="text-[10px] font-bold text-gray-400 flex-shrink-0">⭕❌</span>
                    {sent && <span className="text-xs text-teal-600 font-bold flex-shrink-0">✓</span>}
                  </div>
                  {/* 문제 고르기 패널 */}
                  {oxPickerOpen && (
                    <div className="mt-2 pt-2 border-t border-orange-200 space-y-1.5">
                      <div className="flex gap-1 mb-1.5">
                        <button onClick={() => setOxQuickCat('general')}
                          className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors ${oxQuickCat === 'general' ? 'bg-orange-500 text-white' : 'text-gray-500 hover:text-gray-700 bg-gray-100'}`}>일반</button>
                        <button onClick={() => setOxQuickCat('hot')}
                          className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors ${oxQuickCat === 'hot' ? 'bg-rose-500 text-white' : 'text-gray-500 hover:text-gray-700 bg-gray-100'}`}>🔞 19금</button>
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        {(oxQuickCat === 'general' ? OX_QUICK_GENERAL : OX_QUICK_HOT).map(preset => (
                          <button key={preset}
                            onClick={() => {
                              const m = new Map(batchOxQuestions);
                              m.set(n, preset);
                              setBatchOxQuestions(m);
                              setBatchOxPickerTable(null);
                            }}
                            className={`text-xs font-semibold px-2 py-2 rounded-xl border text-left leading-snug active:scale-95 transition-all ${
                              oxQuickCat === 'hot'
                                ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                                : 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100'
                            }`}>
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* 벌칙 행 */}
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[10px] font-black text-red-400 w-14 flex-shrink-0">벌칙</span>
                    <input
                      type="text"
                      value={oxPenalty}
                      onChange={e => { const m = new Map(batchOxPenalties); m.set(n, e.target.value); setBatchOxPenalties(m); }}
                      placeholder="벌칙 (선택)"
                      className="flex-1 bg-white border border-red-200 text-gray-900 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-red-400 placeholder-gray-400"
                    />
                    <button
                      onClick={() => { setBatchOxPenaltyPickerTable(oxPenaltyPickerOpen ? null : n); setBatchOxPickerTable(null); }}
                      className={`flex-shrink-0 px-2 py-1.5 rounded-lg text-xs font-bold transition-all border ${oxPenaltyPickerOpen ? 'bg-red-200 text-red-700 border-red-300' : 'bg-white text-red-500 border-red-200 hover:bg-red-50'}`}
                    >
                      {oxPenaltyPickerOpen ? '닫기' : '고르기'}
                    </button>
                  </div>
                  {/* 벌칙 고르기 패널 */}
                  {oxPenaltyPickerOpen && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5 pt-2 border-t border-red-100">
                      {GAME_PENALTY_QUICK.map(v => (
                        <button key={v}
                          onClick={() => {
                            const m = new Map(batchOxPenalties);
                            m.set(n, v);
                            setBatchOxPenalties(m);
                            setBatchOxPenaltyPickerTable(null);
                          }}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-bold border-2 transition-all active:scale-95 ${oxPenalty === v ? 'bg-red-500 border-red-500 text-white' : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'}`}>
                          {v}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button onClick={sendBatchOx} disabled={batchFilledCount === 0 || batchSaving}
            className="w-full py-3 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 text-white font-bold text-sm rounded-2xl transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-orange-500/20 active:scale-[0.98]">
            {batchSaving ? '전송 중...' : batchFilledCount > 0 ? `${batchFilledCount}개 테이블 OX 일괄 전송` : '문제를 입력하세요'}
          </button>
        </>
      )}

      {/* 실시간 결과 */}
      {activeOxGame && (() => {
        const counts = voteCounts.get(activeOxGame.id) ?? { a: 0, b: 0 };
        const total = counts.a + counts.b;
        const pctA = total > 0 ? Math.round((counts.a / total) * 100) : 0;
        const pctB = 100 - pctA;
        return (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 space-y-3">
            <p className="text-xs font-bold text-orange-700 uppercase tracking-wider">실시간 결과 — {activeOxGame.question}</p>
            <div className="flex gap-2">
              <div className="flex-1 bg-white rounded-2xl border-2 border-emerald-300 p-4 text-center shadow-sm">
                <div className="text-4xl mb-1">⭕</div>
                <div className="text-3xl font-black text-emerald-600">{counts.a}</div>
                <div className="text-sm font-bold text-emerald-500">{pctA}%</div>
              </div>
              <div className="flex-1 bg-white rounded-2xl border-2 border-red-300 p-4 text-center shadow-sm">
                <div className="text-4xl mb-1">❌</div>
                <div className="text-3xl font-black text-red-600">{counts.b}</div>
                <div className="text-sm font-bold text-red-500">{pctB}%</div>
              </div>
            </div>
            <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
              <div className="bg-emerald-400 transition-all duration-500" style={{ width: `${pctA}%` }} />
              <div className="bg-red-400 transition-all duration-500" style={{ width: `${pctB}%` }} />
            </div>
            <p className="text-center text-xs text-gray-500 font-semibold">총 {total}명 참여</p>
          </div>
        );
      })()}

      {/* 종료된 게임 목록 */}
      {oxGames.filter(g => g.status === 'ended').length > 0 && (
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">종료된 OX 게임</p>
          <div className="space-y-1.5">
            {oxGames.filter(g => g.status === 'ended').slice(0, 8).map(g => {
              const c = voteCounts.get(g.id) ?? { a: 0, b: 0 };
              return (
                <div key={g.id} className="bg-white rounded-xl border border-gray-200 px-3 py-2 flex items-center gap-3">
                  <p className="flex-1 text-xs font-semibold text-gray-700 truncate">{g.question}</p>
                  <span className="text-xs font-black text-emerald-600 flex-shrink-0">O {c.a}</span>
                  <span className="text-gray-300 text-xs">|</span>
                  <span className="text-xs font-black text-red-500 flex-shrink-0">X {c.b}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 초성 Game Section ─────────────────────────────────────────────────────────
const CHOSUNG_QUICK = [
  { hint: 'ㅅㅂ', answer: '사부' },       { hint: 'ㅊㅅ', answer: '초성' },
  { hint: 'ㄱㅅ', answer: '감사' },       { hint: 'ㅎㄱ', answer: '합격' },
  { hint: 'ㅇㄱ', answer: '연기' },       { hint: 'ㅅㄹ', answer: '사랑' },
  { hint: 'ㅁㅈ', answer: '마지' },       { hint: 'ㅂㄹ', answer: '바람' },
  { hint: 'ㄴㄱ', answer: '남자' },       { hint: 'ㅇㅈ', answer: '여자' },
  { hint: 'ㅅㅈ', answer: '소주' },       { hint: 'ㅁㄱ', answer: '맥주' },
  { hint: 'ㅂㄴ', answer: '번호' },       { hint: 'ㄱㄱ', answer: '고기' },
  { hint: 'ㄷㅅ', answer: '다시' },       { hint: 'ㅇㅁ', answer: '언제' },
];

function ChosungGameSection({ seats }: { seats: Seat[] }) {
  const [hint, setHint] = useState('');
  const [answer, setAnswer] = useState('');
  const [chosungPenalty, setChosungPenalty] = useState('');
  const [targetTable, setTargetTable] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeGame, setActiveGame] = useState<QaGame | null>(null);
  const [answers, setAnswers] = useState<QaAnswer[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshDone, setRefreshDone] = useState(false);
  const activeGameRef = useRef<QaGame | null>(null);

  const loadActive = useCallback(async () => {
    const { data } = await adminSupabase.from('qa_games').select('*')
      .eq('status', 'active').eq('scope', 'chosung')
      .order('created_at', { ascending: false }).limit(1);
    const game = data?.[0] as QaGame | undefined ?? null;
    activeGameRef.current = game;
    setActiveGame(game);
    if (game) {
      const { data: ans } = await adminSupabase.from('qa_answers').select('*')
        .eq('game_id', game.id).order('submitted_at', { ascending: true });
      setAnswers((ans ?? []) as QaAnswer[]);
    } else { setAnswers([]); }
  }, []);

  useEffect(() => {
    loadActive();
    const chName = `chosung-admin-${Date.now()}`;
    const ch = supabase.channel(chName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'qa_answers' }, async (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        const a = payload.new as QaAnswer;
        if (activeGameRef.current && a.game_id === activeGameRef.current.id) {
          setAnswers(prev => prev.some(x => x.id === a.id) ? prev : [...prev, a]);
        } else { await loadActive(); }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'qa_answers' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        setAnswers(prev => prev.map(a => a.id === (payload.new as QaAnswer).id ? payload.new as QaAnswer : a));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'qa_games' }, () => loadActive())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'qa_games' }, () => loadActive())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loadActive]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadActive();
    setRefreshing(false);
    setRefreshDone(true);
    setTimeout(() => setRefreshDone(false), 2000);
  };

  const startGame = async () => {
    if (!hint.trim()) return;
    setSaving(true);
    const q = `초성: ${hint.trim()}` + (chosungPenalty.trim() ? `\n🎯 벌칙: ${chosungPenalty.trim()}` : '');
    const { data } = await adminSupabase.from('qa_games').insert({
      question: q,
      correct_answer: answer.trim() || null,
      status: 'active',
      scope: targetTable !== null ? 'chosung_table' : 'chosung',
      table_number: targetTable ?? null,
    }).select().single();
    if (data) { activeGameRef.current = data as QaGame; setActiveGame(data as QaGame); }
    setAnswers([]);
    setHint('');
    setAnswer('');
    setChosungPenalty('');
    setSaving(false);
  };

  const endGame = async () => {
    if (!activeGame) return;
    setSaving(true);
    await adminSupabase.from('qa_games').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', activeGame.id);
    activeGameRef.current = null;
    setActiveGame(null);
    setAnswers([]);
    setSaving(false);
  };

  const markCorrect = async (answerId: string, correct: boolean) => {
    await adminSupabase.from('qa_answers').update({ is_correct: correct }).eq('id', answerId);
    setAnswers(prev => prev.map(a => a.id === answerId ? { ...a, is_correct: correct } : a));
  };

  const correctCount = answers.filter(a => a.is_correct).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-xl">🔤</span>
        <h2 className="text-lg font-bold text-gray-900">초성 게임</h2>
        <div className="ml-auto flex items-center gap-2">
          {activeGame && (
            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-black rounded-full uppercase tracking-wider border border-indigo-300 animate-pulse">진행 중</span>
          )}
          <button onClick={handleRefresh} disabled={refreshing}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-xl transition-all border disabled:opacity-50 ${refreshDone ? 'bg-teal-50 border-teal-300 text-teal-600' : 'bg-gray-100 hover:bg-gray-200 text-gray-600 border-gray-200'}`}>
            <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshDone ? '완료!' : '새로고침'}
          </button>
        </div>
      </div>

      {activeGame ? (
        <>
          <div className="flex items-start justify-between gap-3 flex-wrap bg-indigo-50 rounded-xl border border-indigo-200 p-4">
            <div>
              <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider mb-1">진행 중인 초성</p>
              <p className="text-2xl font-black text-gray-900 tracking-widest">{activeGame.question.replace('초성: ', '')}</p>
              {activeGame.correct_answer && (
                <p className="text-xs text-indigo-600 mt-1.5 font-bold">정답: <span className="text-indigo-800">{activeGame.correct_answer}</span></p>
              )}
              {correctCount > 0 && (
                <p className="text-xs text-emerald-600 font-bold mt-0.5">✅ 정답자 {correctCount}명</p>
              )}
            </div>
            <button onClick={endGame} disabled={saving}
              className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold rounded-xl border border-red-200 transition-all flex-shrink-0">
              {saving ? '종료 중...' : '초성 게임 종료'}
            </button>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">답변 {answers.length}개</p>
            {answers.length === 0 && <p className="text-sm text-gray-400 text-center py-6">아직 답변이 없습니다</p>}
            {answers.map((a, idx) => {
              const seat = seats.find(s => s.profile_id === a.user_id);
              return (
                <div key={a.id} className={`flex items-center gap-2.5 bg-white rounded-xl border p-3 ${a.is_correct ? 'border-emerald-400 bg-emerald-50/50' : 'border-gray-200'}`}>
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-black text-gray-400">{idx + 1}</span>
                  <div className={`flex-shrink-0 w-9 h-9 rounded-xl flex flex-col items-center justify-center font-black text-center leading-tight ${a.table_number != null ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' : 'bg-gray-100 text-gray-500'}`}>
                    {a.table_number != null ? (
                      <><span className="text-xs font-black">{TABLE_LABELS[a.table_number] ?? a.table_number}</span><span className="text-[7px] opacity-70">번</span></>
                    ) : '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-bold text-gray-700">{a.nickname ?? '익명'}</span>
                    {seat && <span className="text-[10px] text-gray-400 ml-1.5">{seat.seat_label}석</span>}
                    <p className="text-sm font-black text-gray-900 mt-0.5">{a.answer}</p>
                  </div>
                  {activeGame.correct_answer && (
                    <button onClick={() => markCorrect(a.id, !a.is_correct)}
                      className={`flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${a.is_correct ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' : 'bg-gray-100 text-gray-500 border border-gray-200 hover:border-emerald-300 hover:text-emerald-600'}`}>
                      {a.is_correct ? '✓ 정답' : '정답?'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <>
          {/* 빠른 초성 */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">빠른 초성</p>
            <div className="grid grid-cols-4 gap-1.5">
              {CHOSUNG_QUICK.map(({ hint: h, answer: a }) => (
                <button key={h} onClick={() => { setHint(h); setAnswer(a); }}
                  className="py-2 rounded-xl bg-indigo-50 border border-indigo-200 text-center transition-all hover:bg-indigo-100 active:scale-95">
                  <div className="text-base font-black text-indigo-700">{h}</div>
                  <div className="text-[9px] text-indigo-400 font-semibold">{a}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-1.5">초성 힌트 *</label>
            <input type="text" value={hint} onChange={e => setHint(e.target.value)}
              placeholder="예: ㅅㅂ  (자음만 입력)"
              className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-2xl font-black text-center rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-400 tracking-widest" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-1.5">정답 (선택)</label>
            <input type="text" value={answer} onChange={e => setAnswer(e.target.value)}
              placeholder="정답이 있으면 입력 — 없으면 자유 답변"
              className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          {/* 벌칙 */}
          <div>
            <label className="text-xs font-bold text-red-500 uppercase tracking-wider block mb-1.5">벌칙 (선택)</label>
            <input type="text" value={chosungPenalty} onChange={e => setChosungPenalty(e.target.value)}
              placeholder="예: 원샷, 건배사 하기"
              className="w-full bg-gray-50 border border-red-200 text-gray-900 text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-300 mb-2" />
            <div className="flex flex-wrap gap-1.5">
              {GAME_PENALTY_QUICK.map(v => (
                <button key={v} type="button" onClick={() => setChosungPenalty(v)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold border-2 transition-all ${chosungPenalty === v ? 'bg-red-500 border-red-500 text-white' : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'}`}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* 대상 테이블 */}
          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-1.5">대상</label>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setTargetTable(null)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all active:scale-95 ${targetTable === null ? 'bg-indigo-500 border-indigo-500 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300'}`}>
                전체
              </button>
              {[...new Set(seats.map(s => s.table_number))].sort((a, b) => a - b).map(n => (
                <button key={n} onClick={() => setTargetTable(targetTable === n ? null : n)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all active:scale-95 ${targetTable === n ? 'bg-indigo-500 border-indigo-500 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300'}`}>
                  {TABLE_LABELS[n] ?? n}번
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-gray-400">💡 게임 시작 후 공지탭에서 초성 힌트를 공지로 전송하면 유저들이 답변합니다</p>
          <button onClick={startGame} disabled={!hint.trim() || saving}
            className="w-full py-3.5 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white font-bold rounded-xl transition-all disabled:opacity-40 shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2">
            <span className="text-lg">🔤</span>{saving ? '초성 게임 시작 중...' : targetTable !== null ? `${TABLE_LABELS[targetTable] ?? targetTable}번 테이블 초성 시작` : '초성 게임 시작'}
          </button>
        </>
      )}
    </div>
  );
}
type ImageVote = Database['public']['Tables']['image_votes']['Row'];

// ─── Image Game Section ────────────────────────────────────────────────────────

function ImageGameSection({ seats, settings, profiles }: { seats: Seat[]; settings: AppSettings | null; profiles: Profile[] }) {
  const [question, setQuestion] = useState('');
  const [penalty, setPenalty] = useState('');
  const [targetTable, setTargetTable] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeGames, setActiveGames] = useState<ImageGame[]>([]);
  const [votesByGame, setVotesByGame] = useState<Map<string, ImageVote[]>>(new Map());
  const [refreshing, setRefreshing] = useState(false);
  const [refreshDone, setRefreshDone] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [batchPenalties, setBatchPenalties] = useState<Map<number, string>>(new Map());
  const [batchQuestions, setBatchQuestions] = useState<Map<number, string>>(new Map());
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchSentTables, setBatchSentTables] = useState<Set<number>>(new Set());
  const [endingGameId, setEndingGameId] = useState<string | null>(null);
  const [batchImagePickerTable, setBatchImagePickerTable] = useState<number | null>(null);
  const [batchPenaltyPickerTable, setBatchPenaltyPickerTable] = useState<number | null>(null);
  const [batchImageQuickCat, setBatchImageQuickCat] = useState<'general' | 'hot'>('general');

  const allTableNumbers = [...new Set(seats.map(s => s.table_number))].sort((a, b) => a - b);
  const activeTables = settings?.active_tables ?? null;
  const tableNumbers = activeTables ? allTableNumbers.filter(n => activeTables.includes(n)) : allTableNumbers;

  const loadActiveGames = async () => {
    const { data } = await adminSupabase.from('image_games').select('*').eq('status', 'active').order('created_at', { ascending: false });
    const games = (data ?? []) as ImageGame[];
    setActiveGames(games);
    if (games.length > 0) {
      const { data: vs } = await adminSupabase.from('image_votes').select('*').in('game_id', games.map(g => g.id));
      const grouped = new Map<string, ImageVote[]>();
      (vs ?? []).forEach((v: { game_id: string } & ImageVote) => {
        const arr = grouped.get(v.game_id) ?? [];
        arr.push(v as ImageVote);
        grouped.set(v.game_id, arr);
      });
      setVotesByGame(grouped);
    } else {
      setVotesByGame(new Map());
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadActiveGames();
    setRefreshing(false);
    setRefreshDone(true);
    setTimeout(() => setRefreshDone(false), 2000);
  };

  useEffect(() => {
    loadActiveGames();
    const chName = `image-admin-${Date.now()}`;
    const ch = supabase.channel(chName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'image_votes' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        const v = payload.new as ImageVote;
        setVotesByGame(prev => {
          const arr = prev.get(v.game_id) ?? [];
          if (arr.some(x => x.id === v.id)) return prev;
          const next = new Map(prev);
          next.set(v.game_id, [...arr, v]);
          return next;
        });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'image_games' }, () => loadActiveGames())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'image_games' }, () => loadActiveGames())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const startGame = async () => {
    if (!question.trim() || !penalty.trim()) return;
    setSaving(true);
    const { data: gameRow } = await adminSupabase.from('image_games').insert({
      question: question.trim(),
      penalty: penalty.trim(),
      scope: targetTable !== null ? 'table' : 'global',
      table_number: targetTable ?? null,
    }).select().single();
    if (gameRow) {
      const gs = {
        active: true, type: 'image' as const,
        title: question.trim(),
        description: '',
        rules: '',
        penalty: penalty.trim(),
        game_id: (gameRow as ImageGame).id,
        started_at: new Date().toISOString(),
        table_number: targetTable ?? undefined,
      };
      await adminSupabase.from('app_settings').update({ game_state: gs as unknown as Json, updated_at: new Date().toISOString() }).eq('id', 1);
    }
    setQuestion('');
    setPenalty('');
    setTargetTable(null);
    setSaving(false);
    await loadActiveGames();
  };

  const startBatchGames = async () => {
    const entries = tableNumbers
      .map(n => ({ n, q: (batchQuestions.get(n) ?? '').trim(), p: (batchPenalties.get(n) ?? '').trim() }))
      .filter(({ q, p }) => !!q && !!p);
    if (!entries.length) return;
    setBatchSaving(true);
    for (const { n, q, p } of entries) {
      await adminSupabase.from('image_games').insert({
        question: q,
        penalty: p,
        scope: 'table',
        table_number: n,
      });
      setBatchSentTables(prev => new Set([...prev, n]));
    }
    setBatchQuestions(new Map());
    setBatchPenalties(new Map());
    setBatchSentTables(new Set());
    setBatchSaving(false);
    await loadActiveGames();
  };

  const sendSingleImageTable = async (n: number) => {
    const q = (batchQuestions.get(n) ?? '').trim();
    const p = (batchPenalties.get(n) ?? '').trim();
    if (!q || !p) return;
    setBatchSentTables(prev => new Set([...prev, n]));
    await adminSupabase.from('image_games').insert({ question: q, penalty: p, scope: 'table', table_number: n });
    setBatchQuestions(prev => { const m = new Map(prev); m.set(n, ''); return m; });
    setBatchPenalties(prev => { const m = new Map(prev); m.set(n, ''); return m; });
    setTimeout(() => setBatchSentTables(prev => { const s = new Set(prev); s.delete(n); return s; }), 2000);
    await loadActiveGames();
  };

  const sendWinnerNotification = async (game: ImageGame, gameVotes: ImageVote[]) => {
    if (!gameVotes.length) return;
    const tally = gameVotes.reduce<Record<string, number>>((acc, v) => {
      acc[v.voted_profile_id] = (acc[v.voted_profile_id] ?? 0) + 1;
      return acc;
    }, {});
    const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    if (!sorted.length) return;
    const [winnerId, voteCount] = sorted[0];
    const winnerProfile = profiles.find(p => p.id === winnerId);
    const winnerName = winnerProfile?.nickname ?? '알 수 없음';
    const gameScopeLabel = game.scope === 'table' ? `${TABLE_LABELS[game.table_number!] ?? game.table_number}번 테이블` : '전체';
    const msg = `🖼️ 이미지 게임 결과\n${game.question}\n👑 ${winnerName}님이 가장 많이 뽑히셨습니다! (${voteCount}표)`;
    const target = game.scope === 'table' ? `table_${game.table_number}` : 'all';
    await adminSupabase.from('notifications').insert({
      message: msg,
      type: 'game',
      target,
      is_active: true,
    });
  };

  const endGame = async (gameId: string) => {
    setEndingGameId(gameId);
    const game = activeGames.find(g => g.id === gameId);
    const gameVotes = votesByGame.get(gameId) ?? [];
    await adminSupabase.from('image_games').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', gameId);
    if (game) await sendWinnerNotification(game, gameVotes);
    if (activeGames.length <= 1) {
      await adminSupabase.from('app_settings').update({ game_state: { active: false } as unknown as Json, updated_at: new Date().toISOString() }).eq('id', 1);
    }
    setActiveGames(prev => prev.filter(g => g.id !== gameId));
    setVotesByGame(prev => { const next = new Map(prev); next.delete(gameId); return next; });
    setEndingGameId(null);
  };

  const endAllGames = async () => {
    setSaving(true);
    for (const g of activeGames) {
      await adminSupabase.from('image_games').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', g.id);
      const gv = votesByGame.get(g.id) ?? [];
      await sendWinnerNotification(g, gv);
    }
    await adminSupabase.from('app_settings').update({ game_state: { active: false } as unknown as Json, updated_at: new Date().toISOString() }).eq('id', 1);
    setActiveGames([]);
    setVotesByGame(new Map());
    setSaving(false);
  };

  const IMAGE_QUICK = {
    general: [
      '오늘 가장 분위기 메이커',
      '가장 다시 만나고 싶은 사람',
      '가장 술을 잘 마실 것 같은 사람',
      '오늘 가장 웃긴 사람',
      '오늘 가장 기억에 남는 사람',
      '가장 인생 조언 해줄 것 같은 사람',
      '가장 다음 회식에 오고 싶은 사람',
      '처음 만났을 때 가장 인상적이었던 사람',
      '오늘 가장 친해지고 싶은 사람',
    ],
    hot: [
      '오늘 가장 섹시한 사람',
      '오늘 자고 싶은 사람',
      '오늘 데려가고 싶은 사람',
      '오늘 키스하고 싶은 사람',
      '오늘 같이 집 가고 싶은 사람',
      '번호 받고 싶은 사람',
      '오늘 가장 핫한 사람',
      '오늘 한 번쯤 사귀어보고 싶은 사람',
      '오늘 가장 매력적인 사람',
      '오늘 야한 농담 같이 나누고 싶은 사람',
    ],
  };
  const [imageQuickCategory, setImageQuickCategory] = useState<'general' | 'hot'>('general');

  const batchFilledCount = tableNumbers.filter(n => (batchQuestions.get(n) ?? '').trim() && (batchPenalties.get(n) ?? '').trim()).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <span className="text-xl">🖼️</span>이미지 게임
        </h2>
        <div className="flex items-center gap-2">
          {activeGames.length > 0 && (
            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-black rounded-full border border-amber-300 animate-pulse">진행 중 {activeGames.length}개</span>
          )}
          <button onClick={handleRefresh} disabled={refreshing}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-xl transition-all border disabled:opacity-50 ${refreshDone ? 'bg-teal-50 border-teal-300 text-teal-600' : 'bg-gray-100 hover:bg-gray-200 text-gray-600 border-gray-200'}`}>
            <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshDone ? '완료!' : refreshing ? '로딩...' : '새로고침'}
          </button>
          <div className="flex bg-gray-100 rounded-xl border border-gray-200 overflow-hidden">
            <button onClick={() => setBatchMode(false)} className={`px-3 py-1.5 text-xs font-bold transition-colors ${!batchMode ? 'bg-amber-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}>단일</button>
            <button onClick={() => setBatchMode(true)} className={`px-3 py-1.5 text-xs font-bold transition-colors ${batchMode ? 'bg-amber-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}>일괄</button>
          </div>
        </div>
      </div>

      {activeGames.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-amber-600 uppercase tracking-wider">진행 중인 게임 ({activeGames.length})</p>
            <button onClick={endAllGames} disabled={saving}
              className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold rounded-xl border border-red-200 transition-all disabled:opacity-50">
              {saving ? '종료 중...' : '전체 종료'}
            </button>
          </div>
          {activeGames.map(game => {
            const gameVotes = votesByGame.get(game.id) ?? [];
            const tally = gameVotes.reduce<Record<string, number>>((acc, v) => {
              acc[v.voted_profile_id] = (acc[v.voted_profile_id] ?? 0) + 1;
              return acc;
            }, {});
            const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
            return (
              <div key={game.id} className="bg-amber-50 rounded-xl border border-amber-200 p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                  <div>
                    <p className="text-[10px] text-amber-600 font-bold uppercase tracking-wider mb-1">
                      {game.scope === 'table' ? `${TABLE_LABELS[game.table_number!] ?? game.table_number}번 테이블` : '전체'}
                    </p>
                    <p className="text-sm font-bold text-gray-900 leading-snug">{game.question}</p>
                    {game.penalty && <p className="text-xs text-red-600 mt-1 font-medium">벌칙: {game.penalty}</p>}
                  </div>
                  <button onClick={() => endGame(game.id)} disabled={endingGameId === game.id}
                    className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold rounded-xl border border-red-200 transition-all flex-shrink-0 disabled:opacity-50">
                    {endingGameId === game.id ? '종료 중...' : '게임 종료'}
                  </button>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">투표 결과 · {gameVotes.length}표</p>
                  {sorted.length === 0 && <p className="text-sm text-gray-400 text-center py-3">아직 투표가 없습니다</p>}
                  {sorted.map(([profileId, count], idx) => {
                    const profile = profiles.find(p => p.id === profileId);
                    const pct = gameVotes.length > 0 ? Math.round((count / gameVotes.length) * 100) : 0;
                    return (
                      <div key={profileId} className={`flex items-center gap-3 rounded-xl border p-3 transition-all ${idx === 0 ? 'border-amber-300 bg-white' : 'border-gray-200 bg-white'}`}>
                        <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${idx === 0 ? 'bg-amber-400 text-white' : 'bg-gray-100 text-gray-500'}`}>
                          {idx === 0 ? '👑' : idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-bold truncate ${idx === 0 ? 'text-amber-900' : 'text-gray-900'}`}>{profile?.nickname ?? '알 수 없음'}</p>
                          <div className="mt-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-500 ${idx === 0 ? 'bg-amber-400' : 'bg-gray-400'}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <div className={`flex-shrink-0 text-right ${idx === 0 ? 'text-amber-700' : 'text-gray-500'}`}>
                          <span className="text-base font-black">{count}</span>
                          <span className="text-[10px] ml-0.5 opacity-70">표 ({pct}%)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!batchMode ? (
        <>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">빠른 주제</p>
              <div className="flex bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
                <button onClick={() => setImageQuickCategory('general')}
                  className={`px-2.5 py-1 text-[11px] font-bold transition-colors ${imageQuickCategory === 'general' ? 'bg-amber-400 text-white' : 'text-gray-500 hover:text-gray-700'}`}>일반</button>
                <button onClick={() => setImageQuickCategory('hot')}
                  className={`px-2.5 py-1 text-[11px] font-bold transition-colors ${imageQuickCategory === 'hot' ? 'bg-rose-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}>🔞 19금</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {IMAGE_QUICK[imageQuickCategory].map(q => (
                <button key={q} onClick={() => setQuestion(q.replace(' 🔞', ''))}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-all ${question === q.replace(' 🔞', '') ? (imageQuickCategory === 'hot' ? 'bg-rose-500 border-rose-500 text-white' : 'bg-amber-400 border-amber-400 text-white') : imageQuickCategory === 'hot' ? 'bg-rose-50 border-rose-200 text-rose-600 hover:border-rose-400' : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-amber-300 hover:text-amber-700'}`}>
                  {q}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-1.5">게임 주제 *</label>
            <input type="text" value={question} onChange={e => setQuestion(e.target.value)}
              placeholder="예: 오늘 가장 분위기 메이커인 사람은?"
              className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400" />
          </div>

          <div>
            <label className="text-xs font-bold text-red-600 uppercase tracking-wider block mb-1.5">벌칙 *</label>
            <input type="text" value={penalty} onChange={e => setPenalty(e.target.value)}
              placeholder="예: 원샷, 건배사 하기"
              className="w-full bg-gray-50 border border-red-200 text-gray-900 text-sm rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-red-400 mb-2" />
            <div className="flex flex-wrap gap-1.5">
              {GAME_PENALTY_QUICK.map(v => (
                <button key={v} type="button" onClick={() => setPenalty(v)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold border-2 transition-all ${penalty === v ? 'bg-red-500 border-red-500 text-white' : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'}`}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">대상 테이블</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setTargetTable(null)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${targetTable === null ? 'bg-amber-400 border-amber-400 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}>전체</button>
              {tableNumbers.map(n => (
                <button key={n} onClick={() => setTargetTable(n)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${targetTable === n ? 'bg-cyan-500 border-cyan-500 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}>{TABLE_LABELS[n] ?? n}번</button>
              ))}
            </div>
          </div>

          <button onClick={startGame} disabled={!question.trim() || !penalty.trim() || saving}
            className="w-full py-4 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-white font-black text-base rounded-2xl transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-amber-500/20 active:scale-[0.98]">
            {saving ? '게임 시작 중...' : targetTable !== null ? `${TABLE_LABELS[targetTable] ?? targetTable}번 테이블 이미지 게임 시작!` : '전체 이미지 게임 시작!'}
          </button>
          {question.trim() && (
            <p className="text-xs text-gray-400 text-center -mt-2">
              {targetTable !== null ? `${TABLE_LABELS[targetTable] ?? targetTable}번 테이블에만 전파됩니다` : '전체 참여자에게 즉시 전파됩니다'}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-xs text-gray-500">활성 테이블별로 다른 이미지 게임을 동시에 시작합니다. 주제와 벌칙을 모두 입력하세요.</p>

          {/* 빠른 주제 — 전 테이블 일괄 적용 */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-xs font-black text-amber-700">빠른 주제</p>
              <span className="text-[10px] text-amber-500">클릭 시 전 테이블 동일 적용</span>
              <div className="ml-auto flex bg-white rounded-lg overflow-hidden border border-amber-200">
                <button onClick={() => setBatchImageQuickCat('general')}
                  className={`px-2.5 py-1 text-[11px] font-bold transition-colors ${batchImageQuickCat === 'general' ? 'bg-amber-400 text-white' : 'text-gray-500'}`}>일반</button>
                <button onClick={() => setBatchImageQuickCat('hot')}
                  className={`px-2.5 py-1 text-[11px] font-bold transition-colors ${batchImageQuickCat === 'hot' ? 'bg-rose-500 text-white' : 'text-gray-500'}`}>🔞 19금</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {IMAGE_QUICK[batchImageQuickCat].map(q => (
                <button key={q}
                  onClick={() => { const m = new Map<number, string>(); tableNumbers.forEach(n => m.set(n, q)); setBatchQuestions(m); }}
                  className={`px-2.5 py-1.5 rounded-full text-xs font-bold border-2 transition-all ${
                    batchImageQuickCat === 'hot' ? 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100' : 'bg-white border-amber-200 text-amber-700 hover:border-amber-400'
                  }`}>
                  {q}
                </button>
              ))}
            </div>
          </div>

          {tableNumbers.length === 0 && <p className="text-sm text-gray-400 text-center py-4">활성 테이블이 없습니다.</p>}
          <div className="space-y-2">
            {tableNumbers.map(n => {
              const q = batchQuestions.get(n) ?? '';
              const p = batchPenalties.get(n) ?? '';
              const filled = q.trim() && p.trim();
              const sent = batchSentTables.has(n);
              const imgPickerOpen = batchImagePickerTable === n;
              const penPickerOpen = batchPenaltyPickerTable === n;
              return (
                <div key={n} className={`rounded-xl border-2 p-3 space-y-2 transition-all ${filled ? 'border-amber-400 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}>
                  {/* 테이블 헤더 + 전송 버튼 */}
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-black ${filled ? 'text-amber-700' : 'text-gray-500'}`}>{TABLE_LABELS[n] ?? n}번 테이블</span>
                    <button
                      onClick={() => sendSingleImageTable(n)}
                      disabled={!filled || sent}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all disabled:opacity-40 ${sent ? 'bg-teal-500 text-white' : 'bg-amber-500 hover:bg-amber-600 text-white'}`}
                    >
                      {sent ? '완료!' : '전송'}
                    </button>
                  </div>

                  {/* 주제 입력 + 고르기 */}
                  <div className="flex gap-1.5">
                    <input
                      type="text" value={q}
                      onChange={e => setBatchQuestions(prev => { const m = new Map(prev); m.set(n, e.target.value); return m; })}
                      placeholder="게임 주제"
                      className="flex-1 bg-white border border-amber-200 text-gray-900 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-amber-400 placeholder-gray-400"
                    />
                    <button
                      onClick={() => { setBatchImagePickerTable(imgPickerOpen ? null : n); setBatchPenaltyPickerTable(null); }}
                      className={`flex-shrink-0 px-2 py-1.5 rounded-lg text-xs font-bold border transition-all ${imgPickerOpen ? 'bg-amber-200 text-amber-700 border-amber-300' : 'bg-white text-amber-500 border-amber-200 hover:bg-amber-50'}`}>
                      {imgPickerOpen ? '닫기' : '고르기'}
                    </button>
                  </div>

                  {/* 주제 빠른 선택 패널 */}
                  {imgPickerOpen && (
                    <div className="pt-2 border-t border-amber-200 space-y-1.5">
                      <div className="flex gap-1">
                        <button onClick={() => setBatchImageQuickCat('general')}
                          className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors ${batchImageQuickCat === 'general' ? 'bg-amber-400 text-white' : 'bg-gray-100 text-gray-500'}`}>일반</button>
                        <button onClick={() => setBatchImageQuickCat('hot')}
                          className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors ${batchImageQuickCat === 'hot' ? 'bg-rose-500 text-white' : 'bg-gray-100 text-gray-500'}`}>🔞 19금</button>
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        {IMAGE_QUICK[batchImageQuickCat].map(preset => (
                          <button key={preset}
                            onClick={() => { setBatchQuestions(prev => { const m = new Map(prev); m.set(n, preset); return m; }); setBatchImagePickerTable(null); }}
                            className={`text-xs font-semibold px-2 py-2 rounded-xl border text-left leading-snug active:scale-95 transition-all ${
                              batchImageQuickCat === 'hot' ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100' : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                            }`}>
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 벌칙 입력 + 고르기 */}
                  <div className="flex gap-1.5">
                    <input
                      type="text" value={p}
                      onChange={e => setBatchPenalties(prev => { const m = new Map(prev); m.set(n, e.target.value); return m; })}
                      placeholder="벌칙 (필수)"
                      className="flex-1 bg-white border border-red-200 text-gray-900 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-red-400 placeholder-gray-400"
                    />
                    <button
                      onClick={() => { setBatchPenaltyPickerTable(penPickerOpen ? null : n); setBatchImagePickerTable(null); }}
                      className={`flex-shrink-0 px-2 py-1.5 rounded-lg text-xs font-bold border transition-all ${penPickerOpen ? 'bg-red-200 text-red-700 border-red-300' : 'bg-white text-red-500 border-red-200 hover:bg-red-50'}`}>
                      {penPickerOpen ? '닫기' : '고르기'}
                    </button>
                  </div>

                  {/* 벌칙 빠른 선택 패널 */}
                  {penPickerOpen && (
                    <div className="pt-2 border-t border-red-200">
                      <div className="flex flex-wrap gap-1.5">
                        {GAME_PENALTY_QUICK.map(v => (
                          <button key={v}
                            onClick={() => { setBatchPenalties(prev => { const m = new Map(prev); m.set(n, v); return m; }); setBatchPenaltyPickerTable(null); }}
                            className="px-2.5 py-1 rounded-full text-[11px] font-bold border-2 bg-red-50 border-red-200 text-red-600 hover:bg-red-100 active:scale-95 transition-all">
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button onClick={startBatchGames} disabled={batchFilledCount === 0 || batchSaving}
            className="w-full py-3 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-white font-bold text-sm rounded-2xl transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-amber-500/20 active:scale-[0.98]">
            {batchSaving ? '시작 중...' : batchFilledCount > 0 ? `입력된 ${batchFilledCount}개 테이블 일괄 전송` : '테이블별 주제·벌칙을 입력하세요'}
          </button>
        </>
      )}
    </div>
  );
}

function SuggestionsTab({ suggestions, onUpdate }: { suggestions: Suggestion[]; onUpdate: (s: Suggestion) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const handleDecision = async (s: Suggestion, status: 'accepted' | 'rejected') => {
    setSaving(true);
    const { data } = await adminSupabase.from('suggestions').update({ status, admin_reason: reason.trim() || null }).eq('id', s.id).select().single();
    if (data) onUpdate(data as Suggestion);
    setSelectedId(null);
    setReason('');
    setSaving(false);
  };

  const pending = suggestions.filter(s => s.status === 'pending');
  const decided = suggestions.filter(s => s.status !== 'pending');

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">건의사항 관리</h2>
        <div className="flex gap-2 text-xs">
          <span className="px-2.5 py-1 bg-amber-500/20 text-amber-300 rounded-full font-bold">검토 중 {pending.length}</span>
          <span className="px-2.5 py-1 bg-teal-500/20 text-teal-300 rounded-full font-bold">채택 {suggestions.filter(s => s.status === 'accepted').length}</span>
        </div>
      </div>

      {suggestions.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <Send className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">아직 건의사항이 없습니다.</p>
        </div>
      )}

      {pending.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-amber-400 mb-3 uppercase tracking-wider">검토 대기 ({pending.length})</h3>
          <div className="space-y-3">
            {pending.map((s) => (
              <div key={s.id} className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1">
                      <p className="text-xs text-slate-400 mb-1">{s.nickname ?? '익명'} · {new Date(s.created_at).toLocaleDateString('ko-KR')}</p>
                      <p className="text-sm text-white leading-relaxed">{s.content}</p>
                    </div>
                  </div>
                  {s.contact_info && (
                    <div className="mt-2 px-3 py-2 bg-slate-700/50 rounded-lg">
                      <p className="text-xs text-slate-400">연락처: <span className="text-slate-200 font-medium">{s.contact_info}</span></p>
                    </div>
                  )}
                </div>
                {selectedId === s.id ? (
                  <div className="px-4 pb-4 space-y-2">
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="채택/거절 사유를 입력하세요 (선택)"
                      className="w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <button onClick={() => { setSelectedId(null); setReason(''); }} className="flex-1 py-2 text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl transition-all">취소</button>
                      <button onClick={() => handleDecision(s, 'rejected')} disabled={saving} className="flex-1 py-2 text-xs font-semibold bg-red-500/20 hover:bg-red-500/40 text-red-300 rounded-xl border border-red-500/30 transition-all disabled:opacity-50">미채택</button>
                      <button onClick={() => handleDecision(s, 'accepted')} disabled={saving} className="flex-1 py-2 text-xs font-semibold bg-teal-500/20 hover:bg-teal-500/40 text-teal-300 rounded-xl border border-teal-500/30 transition-all disabled:opacity-50">
                        <CheckCircle className="w-3 h-3 inline mr-1" />채택
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="px-4 pb-4">
                    <button onClick={() => setSelectedId(s.id)} className="w-full py-2 text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl transition-all">결정하기</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {decided.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-400 mb-3 uppercase tracking-wider">결정 완료 ({decided.length})</h3>
          <div className="space-y-3">
            {decided.map((s) => (
              <div key={s.id} className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1">
                    <p className="text-xs text-slate-500 mb-1">{s.nickname ?? '익명'} · {new Date(s.created_at).toLocaleDateString('ko-KR')}</p>
                    <p className="text-sm text-slate-300 leading-relaxed">{s.content}</p>
                  </div>
                  <span className={`flex-shrink-0 px-2.5 py-1 text-xs font-bold rounded-full ${
                    s.status === 'accepted' ? 'bg-teal-500/20 text-teal-300' : 'bg-red-500/20 text-red-300'
                  }`}>{s.status === 'accepted' ? '채택' : '미채택'}</span>
                </div>
                {s.contact_info && (
                  <div className="mb-2 px-3 py-1.5 bg-slate-700/40 rounded-lg">
                    <p className="text-xs text-slate-400">연락처: <span className="text-slate-200 font-medium">{s.contact_info}</span></p>
                  </div>
                )}
                {s.admin_reason && (
                  <div className={`text-xs px-3 py-2 rounded-lg ${
                    s.status === 'accepted' ? 'bg-teal-500/10 text-teal-300 border border-teal-500/20' : 'bg-red-500/10 text-red-300 border border-red-500/20'
                  }`}>
                    관리자 사유: {s.admin_reason}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Anonymous Reports Tab ────────────────────────────────────────────────────

function AnonymousReportsTab({ reports, onClear, onAck, onRefresh }: { reports: AnonymousReport[]; onClear: () => void; onAck: (id: string, msg: string) => void; onRefresh: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [ackInputs, setAckInputs] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [refreshDone, setRefreshDone] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
    setRefreshDone(true);
    setTimeout(() => setRefreshDone(false), 2000);
  };

  if (reports.length === 0) {
    return (
      <div className="p-8 text-center text-slate-400">
        <Send className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm mb-4">익명 건의가 없습니다.</p>
        <button onClick={handleRefresh} disabled={refreshing}
          className={`flex items-center gap-1.5 mx-auto px-4 py-2 text-xs font-bold rounded-xl transition-all disabled:opacity-50 ${refreshDone ? 'bg-teal-700 text-teal-300' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}>
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />{refreshDone ? '완료!' : refreshing ? '로딩...' : '새로고침'}
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">익명 건의함</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2.5 py-1 bg-orange-500/20 text-orange-300 rounded-full font-bold">미확인 {reports.filter(r => !r.ack_at).length}건</span>
          <button onClick={handleRefresh} disabled={refreshing}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border rounded-xl transition-all disabled:opacity-50 ${refreshDone ? 'bg-teal-700 border-teal-600 text-teal-300' : 'text-slate-300 bg-slate-700 border-slate-600 hover:bg-slate-600'}`}>
            <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />{refreshDone ? '완료!' : refreshing ? '로딩...' : '새로고침'}
          </button>
          <button onClick={() => setConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-orange-300 bg-orange-500/15 border border-orange-500/30 rounded-xl hover:bg-orange-500/25 transition-all">
            <Trash2 className="w-3 h-3" />이력 삭제
          </button>
        </div>
      </div>
      <div className="space-y-2">
        {reports.map((r) => (
          <div key={r.id} className={`flex flex-col gap-2 rounded-xl border p-3.5 transition-all ${r.ack_at ? 'bg-slate-800/30 border-slate-700 opacity-50' : 'bg-slate-800 border-orange-500/50'}`}>
            <div className="flex items-start gap-3">
              <div className={`flex-shrink-0 w-11 h-11 rounded-xl flex flex-col items-center justify-center font-black text-center leading-tight ${
                r.table_number != null ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-slate-700 text-slate-400'
              }`}>
                {r.table_number != null ? (
                  <><span className="text-sm font-black">{TABLE_LABELS[r.table_number] ?? r.table_number}</span><span className="text-[9px] font-semibold opacity-70">테이블</span></>
                ) : '?'}
              </div>
              <div className="flex-1 min-w-0">
                {r.table_number != null && (
                  <p className="text-[10px] text-cyan-400 font-bold mb-0.5">{TABLE_LABELS[r.table_number] ?? r.table_number}테이블 ({r.table_number}번)</p>
                )}
                <p className="text-sm text-white leading-relaxed">{r.content}</p>
                <p className="text-[10px] text-slate-500 mt-1">{new Date(r.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</p>
                {r.ack_at && <p className="text-[10px] text-green-400 mt-0.5">✓ 확인됨: {r.ack_message}</p>}
              </div>
            </div>
            {!r.ack_at && (
              <div className="flex gap-2 ml-14">
                <input type="text" value={ackInputs[r.id] ?? ''} onChange={e => setAckInputs(prev => ({ ...prev, [r.id]: e.target.value }))}
                  placeholder="답변 (생략 가능)" className="flex-1 bg-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 border border-slate-600 focus:outline-none focus:border-teal-500" />
                <button onClick={() => onAck(r.id, ackInputs[r.id] ?? '')}
                  className="px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />OK
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {confirm && (
        <ConfirmDialog title="익명건의 이력 삭제"
          message="모든 익명건의 기록을 삭제합니다. 이 작업은 되돌릴 수 없습니다."
          danger
          onConfirm={() => { setConfirm(false); onClear(); }}
          onCancel={() => setConfirm(false)}
        />
      )}
    </div>
  );
}

// ─── Profiles Tab Section ─────────────────────────────────────────────────────

function ProfilesTabSection({ profiles, seats, settings, onClear, onDeleteProfile, onForceSeat }: {
  profiles: Profile[];
  seats: Seat[];
  settings: AppSettings | null;
  onClear: () => void;
  onDeleteProfile: (id: string) => void;
  onForceSeat: (profileId: string, seatId: string) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [forceSeatTarget, setForceSeatTarget] = useState<Profile | null>(null);
  const [selectedSeatId, setSelectedSeatId] = useState('');
  const [search, setSearch] = useState('');

  const allTableNums = Array.from(new Set(seats.map(s => s.table_number))).sort((a, b) => a - b);
  // Force seat shows ALL tables (admin needs full access regardless of active_tables setting)
  const visibleTableNums = allTableNums;

  const q = search.trim().toLowerCase();
  const filtered = q
    ? profiles.filter(p => {
        const seat = seats.find(s => s.profile_id === p.id);
        return (
          p.nickname?.toLowerCase().includes(q) ||
          (p.mbti ?? '').toLowerCase().includes(q) ||
          (p.location ?? '').toLowerCase().includes(q) ||
          ((p as any).bio ?? '').toLowerCase().includes(q) ||
          (seat ? `${seat.table_number}번 ${seat.seat_label}`.includes(q) : false) ||
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
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {filtered.map((p) => {
          const seat = seats.find(s => s.profile_id === p.id);
          const posLabel = getPositionLabel(p.personality_score ?? 50);
          const domLabel = p.dom_sub_score !== null ? getDomSubLabel(p.dom_sub_score) : null;
          const age = p.birth_year ? getKoreanAge(p.birth_year) : null;
          const bioTags = p.bio ? p.bio.split(',').map(t => t.trim()).filter(Boolean).slice(0, 3) : [];
          return (
            <div key={p.id} className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
              <div className="aspect-[4/3] overflow-hidden relative">
                <img src={p.photo_url} alt={p.nickname} className="w-full h-full object-cover" />
                <button onClick={() => setDeleteTarget(p)}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-red-500/90 hover:bg-red-600 text-white flex items-center justify-center shadow transition-all">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="p-3 space-y-1.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="font-bold text-gray-900 text-sm">{p.nickname}</p>
                  {p.mbti && <span className="text-[9px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100 px-1.5 py-0.5 rounded-full">{p.mbti}</span>}
                </div>
                <div className="flex flex-wrap gap-1">
                  <span className="text-[9px] font-bold bg-cyan-50 text-cyan-700 border border-cyan-100 px-1.5 py-0.5 rounded-full">{posLabel}</span>
                  {domLabel && <span className="text-[9px] font-bold bg-rose-50 text-rose-600 border border-rose-100 px-1.5 py-0.5 rounded-full">{domLabel}</span>}
                  {age && <span className="text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-100 px-1.5 py-0.5 rounded-full">{age}</span>}
                  {p.location && <span className="text-[9px] font-bold bg-green-50 text-green-700 border border-green-100 px-1.5 py-0.5 rounded-full">{p.location}</span>}
                </div>
                {bioTags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {bioTags.map(tag => (
                      <span key={tag} className="text-[9px] text-gray-500 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded-full">{tag}</span>
                    ))}
                  </div>
                )}
                {seat ? (
                  <p className="text-[10px] text-teal-600 font-bold bg-teal-50 px-1.5 py-0.5 rounded-md inline-block">
                    {seat.table_number}번 {seat.seat_label}
                  </p>
                ) : (
                  <p className="text-[10px] text-gray-400">좌석 없음</p>
                )}
                <button onClick={() => { setForceSeatTarget(p); setSelectedSeatId(''); }}
                  className="w-full text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-1 rounded-lg hover:bg-blue-100 transition-all">
                  강제 자리배치
                </button>
              </div>
            </div>
          );
        })}
        {profiles.length === 0 && <div className="col-span-3 py-12 text-center text-gray-400 text-sm">참여자가 없습니다.</div>}
      </div>
      {confirm && (
        <ConfirmDialog title="참여자 초기화"
          message="모든 참여자 프로필을 삭제합니다. 연결된 좌석도 자동으로 초기화됩니다."
          danger
          onConfirm={() => { setConfirm(false); onClear(); }}
          onCancel={() => setConfirm(false)}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog title="참여자 삭제"
          message={`"${deleteTarget.nickname}" 프로필을 삭제합니다. 연결된 좌석도 해제됩니다.`}
          danger
          onConfirm={() => { onDeleteProfile(deleteTarget.id); setDeleteTarget(null); }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {forceSeatTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-5 space-y-4 max-h-[90vh] flex flex-col">
            <div className="text-center flex-shrink-0">
              <h3 className="text-lg font-bold text-gray-900">강제 자리배치 / 교환</h3>
              <p className="text-sm text-gray-500 mt-1">
                <span className="font-bold text-gray-700">{forceSeatTarget.nickname}</span> — 이동할 자리를 선택하세요
              </p>
              {selectedSeatId && (() => {
                const targetSeat = seats.find(s => s.id === selectedSeatId);
                const targetOccupant = targetSeat && targetSeat.status === 'occupied'
                  ? profiles.find(p => p.id === targetSeat.profile_id)
                  : null;
                if (targetOccupant) {
                  return (
                    <div className="mt-2 flex items-center justify-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 font-semibold">
                      <span>{forceSeatTarget.nickname}</span>
                      <span className="text-amber-500">⇄</span>
                      <span>{targetOccupant.nickname}</span>
                      <span className="text-amber-500 font-normal">교환됩니다</span>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
            {visibleTableNums.length === 0 ? (
              <p className="text-sm text-center text-gray-400 py-4 flex-shrink-0">표시할 테이블이 없습니다</p>
            ) : (
              <div className="overflow-y-auto flex-1 min-h-0 space-y-4">
                {visibleTableNums.map(tableNum => {
                  const tableSeats = seats.filter(s => s.table_number === tableNum).sort((a, b) => a.seat_position - b.seat_position);
                  const cfg = TABLE_POSITIONS[tableNum];
                  const get = (pos: number) => tableSeats.find(s => s.seat_position === pos) ?? null;

                  const SeatBtn = ({ pos }: { pos: number }) => {
                    const s = get(pos);
                    if (!s) return <div className="w-12 h-10 rounded-lg bg-gray-100 border border-dashed border-gray-200" />;
                    const isEmpty = s.status === 'empty';
                    const isCurrentSeat = s.profile_id === forceSeatTarget!.id;
                    const isSelected = selectedSeatId === s.id;
                    const occupant = !isEmpty && !isCurrentSeat ? profiles.find(p => p.id === s.profile_id) : null;
                    const posLabel = s.seat_label.split(' ').pop() ?? String(s.seat_position);
                    return (
                      <button
                        key={s.id}
                        disabled={isCurrentSeat}
                        onClick={() => setSelectedSeatId(isSelected ? '' : s.id)}
                        title={occupant ? `${occupant.nickname} 와 교환` : posLabel}
                        className={`w-12 h-10 rounded-lg text-[10px] font-bold transition-all border-2 flex flex-col items-center justify-center gap-0.5 ${
                          isCurrentSeat
                            ? 'bg-amber-100 border-amber-400 text-amber-700 cursor-not-allowed'
                            : isSelected
                            ? 'bg-blue-500 border-blue-600 text-white shadow-md scale-105'
                            : isEmpty
                            ? 'bg-teal-50 border-teal-300 text-teal-700 hover:bg-teal-100 hover:border-teal-500'
                            : 'bg-rose-50 border-rose-300 text-rose-600 hover:bg-rose-100'
                        }`}
                      >
                        <span className="leading-none">{isCurrentSeat ? '현위' : posLabel}</span>
                        {occupant && <span className="text-[8px] leading-none opacity-70 max-w-full truncate px-0.5">{occupant.nickname.slice(0,4)}</span>}
                      </button>
                    );
                  };

                  const TableBlock = ({ vertical }: { vertical?: boolean }) => (
                    <div className={`rounded-lg bg-amber-100 border-2 border-amber-300 flex flex-col items-center justify-center ${vertical ? 'w-8 self-stretch' : 'h-7 w-full'}`}>
                      <span className="text-[10px] font-black text-amber-700">{tableNum}</span>
                    </div>
                  );

                  const renderLayout = () => {
                    if (!cfg) {
                      return (
                        <div className="flex flex-wrap gap-1.5">
                          {tableSeats.map(s => <SeatBtn key={s.id} pos={s.seat_position} />)}
                        </div>
                      );
                    }
                    if (cfg.type === 'row1') {
                      return (
                        <div className="flex gap-2 items-start">
                          <div className="flex flex-col gap-1">{cfg.leftCol.map(p => <SeatBtn key={p} pos={p} />)}</div>
                          <div className="flex flex-col gap-2 flex-1">
                            <TableBlock />
                            <div className="flex gap-1 justify-center">{cfg.bottomRow?.map(p => <SeatBtn key={p} pos={p} />)}</div>
                          </div>
                          <div className="flex flex-col gap-1">{cfg.rightCol.map(p => <SeatBtn key={p} pos={p} />)}</div>
                        </div>
                      );
                    }
                    // sofa
                    const inner = (
                      <div className="flex gap-2 items-start">
                        <div className="flex flex-col gap-1">{cfg.leftCol.map(p => <SeatBtn key={p} pos={p} />)}</div>
                        <TableBlock vertical />
                        <div className="flex flex-col gap-1">{cfg.rightCol.map(p => <SeatBtn key={p} pos={p} />)}</div>
                      </div>
                    );
                    const sofaBar = <div className="h-5 w-10 rounded-md bg-sky-200 border-2 border-sky-400 flex items-center justify-center text-[9px] font-black text-sky-700">소파</div>;
                    return (
                      <div className="flex flex-col gap-1">
                        {cfg.topRow && (
                          <div className="flex gap-1 items-center">
                            {cfg.sofaOnLeft && sofaBar}
                            {cfg.topRow.map(p => <SeatBtn key={p} pos={p} />)}
                            {!cfg.sofaOnLeft && sofaBar}
                          </div>
                        )}
                        {inner}
                        {cfg.bottomRow && (
                          <div className="flex gap-1 items-center">
                            {cfg.sofaOnLeft && sofaBar}
                            {cfg.bottomRow.map(p => <SeatBtn key={p} pos={p} />)}
                            {!cfg.sofaOnLeft && sofaBar}
                          </div>
                        )}
                      </div>
                    );
                  };

                  return (
                    <div key={tableNum} className="bg-gray-50 rounded-xl border border-gray-200 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-black text-gray-700">{tableNum}번 테이블 ({tableLabel(tableNum, settings?.table_labels as Record<string,string>|null)})</span>
                        <span className="text-[10px] text-gray-400">{tableSeats.filter(s => s.status === 'empty').length}빈 / {tableSeats.length}</span>
                      </div>
                      {renderLayout()}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex gap-3 flex-shrink-0">
              <button onClick={() => setForceSeatTarget(null)} className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-all">취소</button>
              <button
                disabled={!selectedSeatId}
                onClick={() => { if (selectedSeatId) { onForceSeat(forceSeatTarget.id, selectedSeatId); setForceSeatTarget(null); } }}
                className="flex-1 py-3 bg-blue-500 text-white font-semibold rounded-xl hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                {selectedSeatId && seats.find(s => s.id === selectedSeatId)?.status === 'occupied' ? '교환' : '배치'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HistoryTab({ histories, onClear }: { histories: SessionHistory[]; onClear: () => void }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  if (histories.length === 0) {
    return (
      <div className="p-8 text-center text-gray-400">
        <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm">저장된 회식 이력이 없습니다.</p>
      </div>
    );
  }
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between px-1 mb-1">
        <span className="text-sm font-bold text-gray-700">총 {histories.length}개의 이력</span>
        <button onClick={() => setConfirm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition-all">
          <Trash2 className="w-3 h-3" />이력 전체 삭제
        </button>
      </div>
      {confirm && (
        <ConfirmDialog title="이력 전체 삭제"
          message="저장된 모든 회식 이력을 삭제합니다. 이 작업은 되돌릴 수 없습니다."
          danger
          onConfirm={() => { setConfirm(false); onClear(); }}
          onCancel={() => setConfirm(false)}
        />
      )}
      {histories.map((h) => {
        const snapshot = h.seats_snapshot as Array<{ seat_label: string; nickname: string | null; status: string }>;
        const occupied = snapshot.filter((s) => s.status === 'occupied');
        const isOpen = expandedId === h.id;
        return (
          <div key={h.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
              onClick={() => setExpandedId(isOpen ? null : h.id)}>
              <div className="text-left">
                <p className="text-sm font-bold text-gray-800">
                  {new Date(h.ended_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {new Date(h.ended_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 종료 · {occupied.length}명 착석
                </p>
              </div>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
              <div className="px-4 pb-4 border-t border-gray-100 pt-3 grid grid-cols-2 gap-2">
                {occupied.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                    <div className="w-5 h-5 rounded-full bg-cyan-200 flex items-center justify-center flex-shrink-0">
                      <span className="text-cyan-700 text-xs font-bold">{s.nickname?.[0] ?? '?'}</span>
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-xs font-semibold text-gray-800 truncate">{s.nickname}</p>
                      <p className="text-xs text-gray-500 truncate">{s.seat_label}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Participants Tab ──────────────────────────────────────────────────────────

function ParticipantsTab({ profiles }: { profiles: Profile[] }) {
  const [query, setQuery] = useState('');
  const sorted = [...profiles]
    .filter(p =>
      !query ||
      (p.nickname ?? '').toLowerCase().includes(query.toLowerCase()) ||
      (p.pin_code ?? '').includes(query)
    )
    .sort((a, b) => Number(a.pin_code ?? '9999') - Number(b.pin_code ?? '9999'));

  if (profiles.length === 0) {
    return (
      <div className="p-8 text-center text-gray-400">
        <span className="text-4xl block mb-3">👥</span>
        <p className="text-sm">등록된 참여자가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-gray-700">총 {profiles.length}명</span>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="이름 또는 고유번호 검색"
          className="text-xs px-3 py-1.5 border border-gray-200 rounded-xl bg-white w-44 focus:outline-none focus:border-teal-400"
        />
      </div>
      <div className="space-y-1.5">
        {sorted.map(p => (
          <div key={p.id} className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 px-3 py-2.5 shadow-sm">
            <div className="w-8 h-8 rounded-full bg-cyan-100 flex items-center justify-center flex-shrink-0">
              <span className="text-cyan-700 text-sm font-black">{(p.nickname ?? '?')[0]}</span>
            </div>
            <p className="flex-1 min-w-0 text-sm font-bold text-gray-800 truncate">{p.nickname ?? '(이름 없음)'}</p>
            <div className="flex-shrink-0 bg-teal-50 border border-teal-200 rounded-lg px-2.5 py-1">
              <span className="text-teal-700 font-black text-sm tabular-nums tracking-widest">{p.pin_code ?? '—'}</span>
            </div>
          </div>
        ))}
        {sorted.length === 0 && query && (
          <p className="text-center text-gray-400 text-sm py-8">"{query}"에 해당하는 참여자가 없습니다.</p>
        )}
      </div>
    </div>
  );
}

// ─── Credentials Tab ──────────────────────────────────────────────────────────

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

type AdminTab = 'settings' | 'seating' | 'profiles' | 'notify' | 'game' | 'history';
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
type HistorySubTab = 'hearts' | 'chats' | 'session' | 'feedback' | 'participants';
type HeartSubTab = 'hearts' | 'popularity';
type FeedbackSubTab = 'suggestions' | 'reports';
type GameSubTab = 'balance' | 'ox' | 'chosung' | 'qa' | 'image';

function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<AdminTab>('settings');
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsSubTab>('control');
  const [historySubTab, setHistorySubTab] = useState<HistorySubTab>('hearts');
  const [feedbackSubTab, setFeedbackSubTab] = useState<FeedbackSubTab>('reports');
  const [gameSubTab, setGameSubTab] = useState<GameSubTab>('balance');
  const [heartSubTab, setHeartSubTab] = useState<HeartSubTab>('hearts');
  const [dbHealth, setDbHealth] = useState<DbHealthData | null>(null);
  const [dbHealthLoading, setDbHealthLoading] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [histories, setHistories] = useState<SessionHistory[]>([]);
  const [likes, setLikes] = useState<Like[]>([]);
  const [allChats, setAllChats] = useState<Chat[]>([]);
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [anonymousReports, setAnonymousReports] = useState<AnonymousReport[]>([]);
  const [currentGame, setCurrentGame] = useState<GameState | null>(null);
  const [balanceGames, setBalanceGames] = useState<BalanceGame[]>([]);
  const [adminVoteCounts, setAdminVoteCounts] = useState<Map<string, { a: number; b: number }>>(new Map());
  const [adminGameEndResult, setAdminGameEndResult] = useState<{ game: BalanceGame; counts: { a: number; b: number } } | null>(null);
  const [adminMyVotes, setAdminMyVotes] = useState<Map<string, 'a' | 'b'>>(new Map());

  const handleAdminVote = (gameId: string, option: 'a' | 'b') => {
    setAdminMyVotes(prev => new Map(prev).set(gameId, option));
  };
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
  const [seatingRefreshing, setSeatingRefreshing] = useState(false);
  const [seatingRefreshDone, setSeatingRefreshDone] = useState(false);
  const [seatingViewMode, setSeatingViewMode] = useState<'map' | 'manage'>('map');
  const [pendingActiveTables, setPendingActiveTables] = useState<number[] | null | undefined>(undefined);
  // Recovery banner (floating top)
  const [recovery, setRecovery] = useState<{ label: string; emoji: string; restore: (() => Promise<void>) | null; timerId: ReturnType<typeof setTimeout> } | null>(null);
  // Persistent restore map — key → restore function (shown as buttons in DashboardTab)
  const [restoreMap, setRestoreMap] = useState<Map<string, () => Promise<void>>>(new Map());
  // Table label editing panel
  const [showLabelPanel, setShowLabelPanel] = useState(false);
  const [editingLabelNum, setEditingLabelNum] = useState<number | null>(null);
  const [labelDraft, setLabelDraft] = useState('');
  const [savingLabel, setSavingLabel] = useState(false);
  const [seenHeartsCount, setSeenHeartsCountRaw] = useState(() => parseInt(localStorage.getItem('admin_seen_hearts') ?? '0', 10));
  const [seenMessagesCount, setSeenMessagesCountRaw] = useState(() => parseInt(localStorage.getItem('admin_seen_messages') ?? '0', 10));
  const [seenFeedbackCount, setSeenFeedbackCountRaw] = useState(() => parseInt(localStorage.getItem('admin_seen_feedback') ?? '0', 10));
  const [seenProfilesCount, setSeenProfilesCountRaw] = useState(() => parseInt(localStorage.getItem('admin_seen_profiles') ?? '0', 10));
  const [seenGameActive, setSeenGameActiveRaw] = useState(() => localStorage.getItem('admin_seen_game') === 'true');

  const setSeenHeartsCount = (n: number) => { localStorage.setItem('admin_seen_hearts', String(n)); setSeenHeartsCountRaw(n); };
  const setSeenMessagesCount = (n: number) => { localStorage.setItem('admin_seen_messages', String(n)); setSeenMessagesCountRaw(n); };
  const setSeenFeedbackCount = (n: number) => { localStorage.setItem('admin_seen_feedback', String(n)); setSeenFeedbackCountRaw(n); };
  const setSeenProfilesCount = (n: number) => { localStorage.setItem('admin_seen_profiles', String(n)); setSeenProfilesCountRaw(n); };
  const setSeenGameActive = (v: boolean) => { localStorage.setItem('admin_seen_game', String(v)); setSeenGameActiveRaw(v); };

  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  const loadAll = useCallback(async () => {
    const [{ data: s }, { data: se }, { data: pr }, { data: hi }, { data: li }, { data: ch }, { data: msgs }, { data: sug }, { data: anon }, { data: bg }] = await Promise.all([
      adminSupabase.from('app_settings').select('*').eq('id', 1).single(),
      adminSupabase.from('seats').select('*').order('table_number').order('seat_position'),
      adminSupabase.from('profiles').select('*').order('created_at', { ascending: false }),
      adminSupabase.from('session_history').select('*').order('ended_at', { ascending: false }),
      adminSupabase.from('likes').select('*').order('created_at', { ascending: false }),
      adminSupabase.from('chats').select('*').order('created_at', { ascending: false }),
      adminSupabase.from('messages').select('*').order('created_at', { ascending: true }),
      adminSupabase.from('suggestions').select('*').order('created_at', { ascending: false }),
      adminSupabase.from('anonymous_reports').select('*').order('created_at', { ascending: false }),
      adminSupabase.from('balance_games').select('*').order('created_at', { ascending: false }).limit(30),
    ]);
    if (s) setSettings(s);
    if (se) setSeats(se);
    if (pr) setProfiles(pr);
    if (hi) setHistories(hi);
    if (li) setLikes(li);
    if (ch) setAllChats(ch);
    if (msgs) setAllMessages(msgs);
    if (sug) setSuggestions(sug as Suggestion[]);
    if (anon) setAnonymousReports(anon as AnonymousReport[]);
    if (s) setCurrentGame((s as unknown as { game_state: GameState | null }).game_state);
    if (bg) {
      setBalanceGames(bg as BalanceGame[]);
      const activeIds = (bg as BalanceGame[]).filter(g => g.status === 'active').map(g => g.id);
      if (activeIds.length > 0) {
        const { data: votes } = await adminSupabase.from('balance_votes').select('game_id, option').in('game_id', activeIds);
        if (votes) {
          const counts = new Map<string, { a: number; b: number }>();
          votes.forEach((v: { game_id: string; option: string }) => {
            const c = counts.get(v.game_id) || { a: 0, b: 0 };
            counts.set(v.game_id, { ...c, [v.option]: c[v.option as 'a' | 'b'] + 1 });
          });
          setAdminVoteCounts(counts);
        }
      }
    }
  }, []);

  useEffect(() => {
    loadAll();
    const channel = supabase
      .channel('admin-realtime')
      // ── seats: 페이로드 기반 증분 업데이트 (풀 리패치 제거) ───────────
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'seats' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        const s = payload.new as Seat;
        setSeats(prev => prev.some(x => x.id === s.id) ? prev.map(x => x.id === s.id ? s : x) : [...prev, s]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'seats' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        const s = payload.new as Seat;
        setSeats(prev => prev.map(x => x.id === s.id ? s : x));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'seats' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        setSeats(prev => prev.filter(x => x.id !== (payload.old as Seat).id));
      })
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
      // ── likes ────────────────────────────────────────────────────────
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'likes' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        setLikes(prev => [payload.new as Like, ...prev]);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'likes' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        setLikes(prev => prev.filter(l => l.id !== (payload.old as Like).id));
      })
      // ── messages ─────────────────────────────────────────────────────
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        setAllMessages(prev => [...prev, payload.new as Message]);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        setAllMessages(prev => prev.filter(m => m.id !== (payload.old as Message).id));
      })
      // ── chats ────────────────────────────────────────────────────────
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chats' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        setAllChats(prev => [payload.new as Chat, ...prev]);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chats' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        setAllChats(prev => prev.filter(c => c.id !== (payload.old as Chat).id));
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
      // ── balance_games: INSERT/UPDATE 페이로드 기반 ───────────────────
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'balance_games' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        const g = payload.new as BalanceGame;
        setBalanceGames(prev => prev.some(x => x.id === g.id) ? prev : [g, ...prev]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'balance_games' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        const updated = payload.new as BalanceGame;
        setBalanceGames(prev => prev.map(x => x.id === updated.id ? updated : x));
        if (updated.status === 'ended') {
          setAdminVoteCounts(prev => {
            const counts = prev.get(updated.id) || { a: 0, b: 0 };
            setAdminGameEndResult({ game: updated, counts });
            return prev;
          });
        }
      })
      // ── balance_votes ────────────────────────────────────────────────
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'balance_votes' }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        const v = payload.new as { game_id: string; option: 'a' | 'b' };
        setAdminVoteCounts(prev => {
          const copy = new Map(prev);
          const c = copy.get(v.game_id) || { a: 0, b: 0 };
          copy.set(v.game_id, { ...c, [v.option]: c[v.option] + 1 });
          return copy;
        });
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
    const id = setInterval(fetchDbHealth, 30_000);
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

  const handleFullReset = async () => {
    const snapshot = seats.map((s) => ({
      seat_label: s.seat_label, table_number: s.table_number,
      seat_position: s.seat_position, status: s.status,
      nickname: s.profile_id ? (profileMap.get(s.profile_id)?.nickname ?? null) : null,
      registered_at: s.registered_at,
    }));
    const seatAssignments = seats.filter(s => s.profile_id).map(s => ({ seat_id: s.id, profile_id: s.profile_id! }));
    try {
      await adminSupabase.from('session_history').insert({ seats_snapshot: snapshot });
      const { error: resetErr } = await adminSupabase.rpc('admin_reset_all_seats', { p_admin_password: settings?.admin_password ?? '' });
      if (resetErr) throw new Error(resetErr.message);
      // api-server 인메모리 좌석 초기화 → 유저 화면 즉시 갱신
      await adminApiRpc('admin_reset_all_seats', { p_admin_password: settings?.admin_password ?? '' }).catch(() => null);
      const { error: sigErr } = await adminSupabase.from('app_settings').update({ reset_signal: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', 1);
      if (sigErr) throw new Error(sigErr.message);
      // api-server reset_signal 동기화
      adminApiRpc('admin_update_settings', { p_admin_password: settings?.admin_password ?? '', p_payload: { reset_signal: new Date().toISOString() } })
        .catch(() => null);
      showRecovery('좌석 배치', '🪑', seatAssignments.length > 0 ? async () => {
        const results = await Promise.allSettled(
          seatAssignments.map(({ seat_id, profile_id }) =>
            adminSupabase.rpc('admin_force_seat', { p_profile_id: profile_id, p_seat_id: seat_id, p_admin_password: settings?.admin_password ?? '' })
          )
        );
        const failed = results.filter(r => r.status === 'rejected').length;
        if (failed > 0) console.error(`[admin] 좌석 복구 중 ${failed}개 실패`);
        await loadAll();
        setRecovery(null);
      } : null, 'seats');
    } catch (e: unknown) {
      alert(`좌석 초기화 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      await loadAll();
    }
  };

  const handleEventEndReset = async () => {
    const snapshot = seats.map((s) => ({
      seat_label: s.seat_label, table_number: s.table_number,
      seat_position: s.seat_position, status: s.status,
      nickname: s.profile_id ? (profileMap.get(s.profile_id)?.nickname ?? null) : null,
      registered_at: s.registered_at,
    }));
    const seatAssignments = seats.filter(s => s.profile_id).map(s => ({ seat_id: s.id, profile_id: s.profile_id! }));
    const backupProfiles = [...profiles];
    const backupLikes = [...likes];
    const backupChats = [...allChats];
    const backupMsgs = [...allMessages];
    const backupSuggestions = [...suggestions];
    const backupHistories = [...histories];
    const gsBackup = settings?.game_state ?? null;
    // 백업 데이터 수집 — 실패해도 초기화 진행
    const [notifRes, bgRes, bvRes, qgRes, qaRes, igRes, ivRes] = await Promise.allSettled([
      adminSupabase.from('notifications').select('*'),
      adminSupabase.from('balance_games').select('*'),
      adminSupabase.from('balance_votes').select('*'),
      adminSupabase.from('qa_games').select('*'),
      adminSupabase.from('qa_answers').select('*'),
      adminSupabase.from('image_games').select('*'),
      adminSupabase.from('image_votes').select('*'),
    ]);
    const safeData = (r: PromiseSettledResult<{ data: unknown[] | null }>) =>
      r.status === 'fulfilled' ? (r.value as { data: unknown[] | null }).data : null;
    try {
      await adminSupabase.from('session_history').insert({ seats_snapshot: snapshot });
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
        adminSupabase.from('balance_games').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
        adminSupabase.from('qa_games').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
        adminSupabase.from('image_games').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
        adminSupabase.from('balance_votes').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
        adminSupabase.from('qa_answers').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
        adminSupabase.from('image_votes').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
        adminSupabase.from('suggestions').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      ]);
      const { error: sigErr } = await adminSupabase.from('app_settings').update({ reset_signal: new Date().toISOString(), game_state: null, updated_at: new Date().toISOString() }).eq('id', 1);
      if (sigErr) throw new Error(sigErr.message);
      // api-server reset_signal/game_state 동기화
      adminApiRpc('admin_update_settings', { p_admin_password: settings?.admin_password ?? '', p_payload: { reset_signal: new Date().toISOString(), game_state: null } })
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
          ...backupHistories.map(h => adminSupabase.from('session_history').upsert({ id: h.id, seats_snapshot: h.seats_snapshot, created_at: (h as { created_at?: string }).created_at })),
          ...(safeData(notifRes) ?? []).map((n: unknown) => adminSupabase.from('notifications').upsert(n)),
          ...(safeData(bgRes) ?? []).map((r: unknown) => adminSupabase.from('balance_games').upsert(r)),
          ...(safeData(bvRes) ?? []).map((r: unknown) => adminSupabase.from('balance_votes').upsert(r)),
          ...(safeData(qgRes) ?? []).map((r: unknown) => adminSupabase.from('qa_games').upsert(r)),
          ...(safeData(qaRes) ?? []).map((r: unknown) => adminSupabase.from('qa_answers').upsert(r)),
          ...(safeData(igRes) ?? []).map((r: unknown) => adminSupabase.from('image_games').upsert(r)),
          ...(safeData(ivRes) ?? []).map((r: unknown) => adminSupabase.from('image_votes').upsert(r)),
        ]);
        if (gsBackup) await adminSupabase.from('app_settings').update({ game_state: gsBackup, updated_at: new Date().toISOString() }).eq('id', 1);
        await Promise.allSettled(
          seatAssignments.map(({ seat_id, profile_id }) =>
            adminSupabase.rpc('admin_force_seat', { p_profile_id: profile_id, p_seat_id: seat_id, p_admin_password: settings?.admin_password ?? '' })
          )
        );
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

  const handleClearNotifications = async () => {
    const { data: backup } = await adminSupabase.from('notifications').select('*');
    await adminSupabase.from('notifications').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    adminApiRpc('admin_force_resync_all', {}).catch(e => console.warn('[admin] resync:', e));
    showRecovery('공지', '🔔', backup && backup.length > 0 ? async () => {
      for (const n of backup) await adminSupabase.from('notifications').upsert(n);
      setRecovery(null);
    } : null, 'notifications');
  };

  const handleClearGames = async () => {
    const gsBackup = settings?.game_state ?? null;
    const [bgRes, bvRes, qgRes, qaRes, igRes, ivRes] = await Promise.all([
      adminSupabase.from('balance_games').select('*'),
      adminSupabase.from('balance_votes').select('*'),
      adminSupabase.from('qa_games').select('*'),
      adminSupabase.from('qa_answers').select('*'),
      adminSupabase.from('image_games').select('*'),
      adminSupabase.from('image_votes').select('*'),
    ]);
    for (const t of ['balance_games', 'qa_games', 'image_games', 'balance_votes', 'qa_answers', 'image_votes']) {
      await adminSupabase.from(t).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    }
    await adminSupabase.from('app_settings').update({ game_state: null, updated_at: new Date().toISOString() }).eq('id', 1);
    adminApiRpc('admin_force_resync_all', {}).catch(e => console.warn('[admin] resync:', e));
    const hasData = [bgRes.data, bvRes.data, qgRes.data, qaRes.data, igRes.data, ivRes.data].some(d => d && d.length > 0) || !!gsBackup;
    showRecovery('게임 기록', '🎮', hasData ? async () => {
      if (bgRes.data) for (const r of bgRes.data) await adminSupabase.from('balance_games').upsert(r);
      if (bvRes.data) for (const r of bvRes.data) await adminSupabase.from('balance_votes').upsert(r);
      if (qgRes.data) for (const r of qgRes.data) await adminSupabase.from('qa_games').upsert(r);
      if (qaRes.data) for (const r of qaRes.data) await adminSupabase.from('qa_answers').upsert(r);
      if (igRes.data) for (const r of igRes.data) await adminSupabase.from('image_games').upsert(r);
      if (ivRes.data) for (const r of ivRes.data) await adminSupabase.from('image_votes').upsert(r);
      if (gsBackup) await adminSupabase.from('app_settings').update({ game_state: gsBackup, updated_at: new Date().toISOString() }).eq('id', 1);
      await loadAll();
      setRecovery(null);
    } : null, 'games');
    await loadAll();
  };

  const handleClearSuggestions = async () => {
    const backup = [...suggestions];
    await adminSupabase.from('suggestions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    setSuggestions([]);
    adminApiRpc('admin_force_resync_all', {}).catch(e => console.warn('[admin] resync:', e));
    showRecovery('익명 건의', '💡', backup.length > 0 ? async () => {
      for (const s of backup) {
        await adminSupabase.from('suggestions').upsert({ id: s.id, content: s.content, created_at: s.created_at });
      }
      await loadAll();
      setRecovery(null);
    } : null, 'suggestions');
  };

  const handleClearProfiles = async () => {
    const backupProfiles = [...profiles];
    const seatAssignments = seats.filter(s => s.profile_id).map(s => ({ seat_id: s.id, profile_id: s.profile_id! }));
    await adminSupabase.from('profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await adminSupabase.rpc('admin_reset_all_seats', { p_admin_password: settings?.admin_password ?? '' });
    adminApiRpc('admin_force_resync_all', {}).catch(e => console.warn('[admin] resync:', e));
    showRecovery('참여자 프로필', '👤', backupProfiles.length > 0 ? async () => {
      for (const p of backupProfiles) await adminSupabase.from('profiles').upsert(p);
      for (const { seat_id, profile_id } of seatAssignments) {
        await adminSupabase.rpc('admin_force_seat', { p_profile_id: profile_id, p_seat_id: seat_id, p_admin_password: settings?.admin_password ?? '' });
      }
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

  const handleClearReports = async () => {
    await adminSupabase.from('anonymous_reports').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    setAnonymousReports([]);
    adminApiRpc('admin_force_resync_all', {}).catch(e => console.warn('[admin] resync:', e));
  };

  const handleRefreshReports = async () => {
    const { data } = await adminSupabase.from('anonymous_reports').select('*').order('created_at', { ascending: false });
    if (data) setAnonymousReports(data as AnonymousReport[]);
  };

  const handleClearHistory = async () => {
    const backup = [...histories];
    await adminSupabase.from('session_history').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    setHistories([]);
    adminApiRpc('admin_force_resync_all', {}).catch(e => console.warn('[admin] resync:', e));
    showRecovery('회식 이력', '📋', backup.length > 0 ? async () => {
      for (const h of backup) {
        await adminSupabase.from('session_history').upsert({ id: h.id, seats_snapshot: h.seats_snapshot, ended_at: (h as Record<string, unknown>)['ended_at'] as string ?? h.ended_at });
      }
      await loadAll();
      setRecovery(null);
    } : null, 'history');
  };

  const handleClearSeat = async (seat: Seat) => {
    await adminSupabase.rpc('admin_clear_seat', { p_seat_id: seat.id, p_admin_password: settings?.admin_password ?? '' });
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

  const handleToggleFeatureLock = async () => {
    // 자리 잠금 토글 (seating_locked)
    if (!settings) return;
    const newVal = !(settings.seating_locked ?? false);
    setSettings(prev => prev ? { ...prev, seating_locked: newVal } : prev);
    const { error } = await adminSupabase.from('app_settings').update({ seating_locked: newVal, updated_at: new Date().toISOString() }).eq('id', 1);
    if (error) {
      setSettings(prev => prev ? { ...prev, seating_locked: !newVal } : prev);
      console.error('[admin] 자리 잠금 토글 실패:', error.message);
      return;
    }
    adminApiRpc('admin_update_settings', { p_admin_password: settings.admin_password ?? '', p_payload: { seating_locked: newVal } })
      .catch(e => console.warn('[admin] api-server 자리잠금 동기화 실패:', e));
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

  const handleSetActiveTables = async (tables: number[] | null) => {
    await adminSupabase.from('app_settings').update({ active_tables: tables, updated_at: new Date().toISOString() }).eq('id', 1);
    setSettings(prev => prev ? { ...prev, active_tables: tables } : prev);
    adminApiRpc('admin_update_settings', { p_admin_password: settings?.admin_password ?? '', p_payload: { active_tables: tables } })
      .catch(e => console.warn('[admin] api-server 활성테이블 동기화 실패:', e));
  };

  const handleSetTableLabels = async (labels: Record<string, string> | null) => {
    await adminSupabase.from('app_settings').update({ table_labels: labels, updated_at: new Date().toISOString() }).eq('id', 1);
    setSettings(prev => prev ? { ...prev, table_labels: labels } : prev);
    adminApiRpc('admin_update_settings', { p_admin_password: settings?.admin_password ?? '', p_payload: { table_labels: labels } })
      .catch(e => console.warn('[admin] api-server 테이블라벨 동기화 실패:', e));
  };

  const handleAckReport = async (reportId: string, ackMessage: string) => {
    await adminSupabase.from('anonymous_reports').update({ ack_at: new Date().toISOString(), ack_message: ackMessage || '확인했습니다' }).eq('id', reportId);
    setAnonymousReports(prev => prev.map(r => r.id === reportId ? { ...r, ack_at: new Date().toISOString(), ack_message: ackMessage || '확인했습니다' } : r));
  };

  const handleDeleteProfile = async (profileId: string) => {
    await adminSupabase.rpc('admin_clear_profile_seat', { p_profile_id: profileId, p_admin_password: settings?.admin_password ?? '' });
    await adminSupabase.from('profiles').delete().eq('id', profileId);
    setProfiles(prev => prev.filter(p => p.id !== profileId));
    // api-server 인메모리 동기화 → 유저 화면에서 프로필 즉시 제거
    adminApiRpc('admin_clear_profile_seat', { p_profile_id: profileId, p_admin_password: settings?.admin_password ?? '' })
      .catch(e => console.warn('[admin] api-server 프로필좌석 동기화 실패:', e));
  };

  const handleForceSeat = async (profileId: string, seatId: string) => {
    const { error } = await adminSupabase.rpc('admin_force_seat', { p_profile_id: profileId, p_seat_id: seatId, p_admin_password: settings?.admin_password ?? '' });
    if (error) {
      alert(`자리배치 실패: ${error.message}`);
      return;
    }
    const { data } = await adminSupabase.from('seats').select('*').order('table_number').order('seat_position');
    if (data) setSeats(data);
    // api-server 인메모리 좌석 동기화 → 유저 화면 즉시 갱신
    adminApiRpc('admin_force_seat', { p_profile_id: profileId, p_seat_id: seatId, p_admin_password: settings?.admin_password ?? '' })
      .catch(e => console.warn('[admin] api-server 강제배치 동기화 실패:', e));
  };

  const feedbackTotal = suggestions.filter(s => s.status === 'pending').length + anonymousReports.filter(r => !r.ack_at).length;
  const gameActive = currentGame?.active ? 1 : 0;

  // Auto-update seenFeedbackCount when admin is on the feedback sub-tab
  useEffect(() => {
    if (tab === 'history' && historySubTab === 'feedback') {
      setSeenFeedbackCount(feedbackTotal);
    }
  }, [feedbackTotal, tab, historySubTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTabChange = (t: AdminTab) => {
    if (t === 'game') setSeenGameActive(!!currentGame?.active);
    if (t === 'profiles') setSeenProfilesCount(profiles.length);
    setTab(t);
  };

  const handleHistorySubTabChange = (t: HistorySubTab) => {
    if (t === 'hearts') setSeenHeartsCount(likes.length);
    if (t === 'chats') setSeenMessagesCount(allMessages.length);
    if (t === 'feedback') setSeenFeedbackCount(feedbackTotal);
    setHistorySubTab(t);
  };

  const historyBadge = Math.max(0, likes.length - seenHeartsCount) + Math.max(0, allMessages.length - seenMessagesCount) + Math.max(0, feedbackTotal - seenFeedbackCount);
  const TABS: { id: AdminTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'settings', label: '설정', icon: <LayoutGrid className="w-4 h-4" /> },
    { id: 'seating', label: '배치도', icon: <LayoutGrid className="w-4 h-4" /> },
    { id: 'profiles', label: '참여자', icon: <Users className="w-4 h-4" />, badge: Math.max(0, profiles.length - seenProfilesCount) || undefined },
    { id: 'notify', label: '공지', icon: <BellRing className="w-4 h-4" /> },
    { id: 'game', label: '게임', icon: <Gamepad2 className="w-4 h-4" />, badge: !seenGameActive && currentGame?.active ? 1 : 0 },
    { id: 'history', label: '이력', icon: <History className="w-4 h-4" />, badge: historyBadge > 0 ? historyBadge : undefined },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 text-white sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-slate-300" />
            <h1 className="font-bold text-base">관리자 대시보드</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${settings?.session_active ? 'bg-teal-500 text-white' : 'bg-slate-700 text-slate-300'}`}>
              {settings?.session_active ? '진행 중' : '대기 중'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <a href="/test"
              className="flex items-center gap-1.5 text-sm text-violet-300 hover:text-violet-100 transition-colors px-2.5 py-1 rounded-lg bg-violet-700/40 hover:bg-violet-700/60 border border-violet-600/40">
              🧪 테스터
            </a>
            <button onClick={onLogout} className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-white transition-colors">
              <LogOut className="w-4 h-4" />
              로그아웃
            </button>
          </div>
        </div>
        <div className="max-w-4xl mx-auto px-2 grid grid-cols-6 pb-0">
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
              <DashboardTab settings={settings} seats={seats} profiles={profiles}
                onToggleSession={handleToggleSession} onFullReset={handleFullReset} onEventEndReset={handleEventEndReset}
                onToggleFeatureLock={handleToggleFeatureLock}
                onToggleFunctionsLock={handleToggleFunctionsLock}
                onClearLikes={handleClearLikes} onClearChats={handleClearAllChats}
                onClearNotifications={handleClearNotifications} onClearGames={handleClearGames}
                onClearSuggestions={handleClearSuggestions} onClearProfiles={handleClearProfiles}
                onClearHistory={handleClearHistory} restoreMap={restoreMap} />
            )}
            {settingsSubTab === 'qr' && <AdminQrTab seats={seats} settings={settings} onSaveQrBase={async (url) => {
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
        {tab === 'seating' && (
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-gray-700">배치도</h2>
                <div className="flex rounded-lg bg-gray-100 p-0.5">
                  <button onClick={() => setSeatingViewMode('map')}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${seatingViewMode === 'map' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500'}`}>
                    배치도
                  </button>
                  <button onClick={() => setSeatingViewMode('manage')}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${seatingViewMode === 'manage' ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500'}`}>
                    만능 관리
                  </button>
                </div>
              </div>
              <button
                onClick={async () => {
                  setSeatingRefreshing(true);
                  setSeatingRefreshDone(false);
                  await loadAll();
                  setSeatingRefreshing(false);
                  setSeatingRefreshDone(true);
                  setTimeout(() => setSeatingRefreshDone(false), 2000);
                }}
                disabled={seatingRefreshing}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all disabled:cursor-not-allowed ${
                  seatingRefreshDone
                    ? 'bg-teal-50 text-teal-700 border border-teal-200'
                    : 'bg-gray-100 hover:bg-teal-50 hover:text-teal-700 text-gray-600'
                }`}
              >
                {seatingRefreshDone ? (
                  <CheckCircle className="w-3.5 h-3.5" />
                ) : (
                  <RefreshCw className={`w-3.5 h-3.5 ${seatingRefreshing ? 'animate-spin' : ''}`} />
                )}
                {seatingRefreshDone ? '완료!' : seatingRefreshing ? '불러오는 중...' : '새로고침'}
              </button>
            </div>

            {/* 활성 테이블 설정 */}
            {(() => {
              const allNums = Array.from(new Set(seats.map(s => s.table_number)));
              // 공간 배치 순서 (배치도와 동일: 왼→오, 위→아래)
              const SPATIAL_ORDER = [7, 5, 6, 8, 9, 4, 2, 11, 10, 3, 1, 12];
              const orderedNums = SPATIAL_ORDER.filter(n => allNums.includes(n));
              const extra = allNums.filter(n => !SPATIAL_ORDER.includes(n));
              const displayNums = [...orderedNums, ...extra];
              const current = pendingActiveTables !== undefined ? pendingActiveTables : (settings?.active_tables ?? null);
              const posNum = (n: number) => { const i = SPATIAL_ORDER.indexOf(n); return i >= 0 ? i + 1 : null; };
              const rows = [displayNums.slice(0, 4), displayNums.slice(4, 8), displayNums.slice(8, 12)].filter(r => r.length > 0);
              return (
                <div className="mb-2">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">활성 테이블</p>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setPendingActiveTables(null)}
                        className="text-[9px] text-teal-600 font-bold px-1.5 py-0.5 rounded hover:bg-teal-50 transition-all">전체</button>
                      <button onClick={() => { handleSetActiveTables(current); setPendingActiveTables(undefined); }}
                        className="text-[9px] font-black px-2 py-0.5 bg-teal-500 hover:bg-teal-600 text-white rounded active:scale-95 transition-all">적용</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-8 gap-1 mb-2">
                    {displayNums.map(n => {
                      const isOn = !current || current.includes(n);
                      const pos = posNum(n);
                      return (
                        <button key={n} onClick={() => {
                          let next: number[];
                          if (!current) { next = allNums.filter(x => x !== n); }
                          else if (current.includes(n)) { next = current.filter(x => x !== n); }
                          else { next = [...current, n].sort((a, b) => a - b); }
                          setPendingActiveTables(next.length === allNums.length ? null : next);
                        }}
                          className={`h-9 rounded-lg border-2 flex flex-col items-center justify-center gap-0 transition-all active:scale-95 ${isOn ? 'bg-teal-500 border-teal-500' : 'bg-gray-50 border-gray-200'}`}>
                          <span className={`text-[9px] leading-none font-bold ${isOn ? 'text-teal-100' : 'text-gray-400'}`}>{pos ?? n}</span>
                          <span className={`text-[10px] font-black leading-tight text-center px-0.5 break-all ${isOn ? 'text-white' : 'text-gray-700'}`}>{tableLabel(n, settings?.table_labels)}</span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => { handleSetActiveTables(current); setPendingActiveTables(undefined); }}
                    disabled={pendingActiveTables === undefined}
                    className={`w-full py-2.5 rounded-xl font-black text-sm transition-all active:scale-[0.98] ${
                      pendingActiveTables !== undefined
                        ? 'bg-teal-500 hover:bg-teal-600 text-white shadow shadow-teal-200'
                        : 'bg-gray-100 text-gray-400 cursor-default'
                    }`}>
                    {pendingActiveTables !== undefined ? '✓ 활성 테이블 저장' : '저장됨'}
                  </button>
                </div>
              );
            })()}

            {/* 테이블 이름 변경 패널 */}
            {(() => {
              const allNums = Array.from(new Set(seats.map(s => s.table_number)));
              const SPATIAL_ORDER = [7, 5, 6, 8, 9, 4, 2, 11, 10, 3, 1, 12];
              const orderedNums = SPATIAL_ORDER.filter(n => allNums.includes(n));
              const extra = allNums.filter(n => !SPATIAL_ORDER.includes(n));
              const displayNums = [...orderedNums, ...extra];
              const posNum = (n: number) => { const i = SPATIAL_ORDER.indexOf(n); return i >= 0 ? i + 1 : null; };
              return (
                <div className="mb-3">
                  <button
                    onClick={() => { setShowLabelPanel(v => !v); setEditingLabelNum(null); }}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border-2 transition-all active:scale-[0.98] ${showLabelPanel ? 'border-violet-300 bg-violet-50' : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-base">✏️</span>
                      <span className={`text-sm font-black ${showLabelPanel ? 'text-violet-700' : 'text-gray-700'}`}>테이블 이름 변경</span>
                      <span className="text-[10px] text-gray-400 font-medium">배치도 순서 · 탭해서 수정</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showLabelPanel ? 'rotate-180' : ''}`} />
                  </button>
                  {showLabelPanel && (
                    <div className="mt-2 bg-white rounded-2xl border border-gray-200 p-3 space-y-2">
                      {/* 4-column button grid — spatial order, 크게 표시 */}
                      <div className="grid grid-cols-4 gap-1.5">
                        {displayNums.map(n => {
                          const curLabel = tableLabel(n, settings?.table_labels);
                          const isSelected = editingLabelNum === n;
                          const hasCustom = curLabel !== String(n);
                          const pos = posNum(n);
                          return (
                            <button key={n}
                              onClick={() => { setEditingLabelNum(isSelected ? null : n); setLabelDraft(hasCustom ? curLabel : ''); }}
                              className={`rounded-xl border-2 py-2.5 px-1 flex flex-col items-center gap-0.5 transition-all active:scale-95 ${isSelected ? 'border-violet-500 bg-violet-50' : 'border-gray-200 bg-gray-50 hover:border-violet-300 hover:bg-violet-50'}`}>
                              <span className={`text-[11px] leading-none font-semibold ${isSelected ? 'text-violet-400' : 'text-gray-400'}`}>{pos ?? n}</span>
                              <span className={`text-base font-black leading-tight text-center break-all ${isSelected ? 'text-violet-700' : hasCustom ? 'text-teal-600' : 'text-gray-700'}`}>{curLabel}</span>
                            </button>
                          );
                        })}
                      </div>
                      {/* Inline editor — shown below grid when a table is selected */}
                      {editingLabelNum !== null && (
                        <div className="rounded-xl border-2 border-violet-400 bg-violet-50 p-3 space-y-2">
                          <p className="text-xs text-violet-600 font-black">{editingLabelNum}번 테이블 이름 수정</p>
                          <input
                            autoFocus
                            value={labelDraft}
                            onChange={e => setLabelDraft(e.target.value)}
                            onKeyDown={async e => {
                              if (e.key === 'Enter' && !savingLabel) {
                                setSavingLabel(true);
                                const base = { ...((settings?.table_labels as Record<string, string>) ?? {}) };
                                const t = labelDraft.trim();
                                if (t && t !== String(editingLabelNum)) base[String(editingLabelNum)] = t;
                                else delete base[String(editingLabelNum)];
                                await handleSetTableLabels(Object.keys(base).length ? base : null);
                                setSavingLabel(false); setEditingLabelNum(null);
                              }
                              if (e.key === 'Escape') setEditingLabelNum(null);
                            }}
                            placeholder={`${editingLabelNum}번 표시명 (비우면 숫자로 표시)`}
                            maxLength={6}
                            className="w-full text-center text-base font-bold px-3 py-2.5 rounded-xl border-2 border-violet-300 focus:outline-none focus:border-violet-500 bg-white"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={async () => {
                                setSavingLabel(true);
                                const base = { ...((settings?.table_labels as Record<string, string>) ?? {}) };
                                const t = labelDraft.trim();
                                if (t && t !== String(editingLabelNum)) base[String(editingLabelNum)] = t;
                                else delete base[String(editingLabelNum)];
                                await handleSetTableLabels(Object.keys(base).length ? base : null);
                                setSavingLabel(false); setEditingLabelNum(null);
                              }}
                              disabled={savingLabel}
                              className="flex-1 py-2 bg-violet-500 text-white text-xs font-black rounded-xl disabled:opacity-50 active:scale-95 transition-all">
                              {savingLabel ? '저장 중...' : '✓ 저장'}
                            </button>
                            <button onClick={() => setEditingLabelNum(null)}
                              className="px-4 py-2 bg-gray-100 text-gray-600 text-xs font-bold rounded-xl active:scale-95 transition-all">
                              취소
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {seatingViewMode === 'manage' ? (
              <SeatManagementMode
                seats={settings?.active_tables ? seats.filter(s => settings.active_tables!.includes(s.table_number)) : seats}
                profileMap={profileMap}
                adminPassword={settings?.admin_password ?? ''}
                tableLabels={settings?.table_labels ?? null}
                onReload={loadAll} />
            ) : (
              <SeatingMap
                seats={seats}
                profileMap={profileMap} currentUserId={null} isAdmin
                activeTables={settings?.active_tables ?? null}
                tableLabels={settings?.table_labels ?? null}
                onClearSeat={handleClearSeat}
                onForceSeat={handleForceSeat}
                onSetTableLabel={async (tableNum, label) => {
                  const base = { ...((settings?.table_labels as Record<string, string>) ?? {}) };
                  if (label && label !== String(tableNum)) base[String(tableNum)] = label;
                  else delete base[String(tableNum)];
                  await handleSetTableLabels(Object.keys(base).length ? base : null);
                }} />
            )}
          </div>
        )}
        {tab === 'profiles' && (
          <ProfilesTabSection profiles={profiles} seats={seats} settings={settings} onClear={async () => {
            await adminSupabase.from('profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            await loadAll();
          }} onDeleteProfile={handleDeleteProfile} onForceSeat={handleForceSeat} />
        )}
        {tab === 'history' && (
          <div>
            <div className="flex border-b border-gray-200 bg-white px-4 overflow-x-auto">
              {([
                { id: 'hearts' as HistorySubTab, label: '하트', badge: Math.max(0, likes.length - seenHeartsCount) },
                { id: 'chats' as HistorySubTab, label: '채팅', badge: Math.max(0, allMessages.length - seenMessagesCount) },
                { id: 'session' as HistorySubTab, label: '회식', badge: 0 },
                { id: 'participants' as HistorySubTab, label: '참여자', badge: 0 },
                { id: 'feedback' as HistorySubTab, label: '건의', badge: Math.max(0, feedbackTotal - seenFeedbackCount) },
              ]).map(st => (
                <button key={st.id} onClick={() => handleHistorySubTabChange(st.id)}
                  className={`flex items-center gap-1.5 flex-shrink-0 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${historySubTab === st.id ? 'border-teal-500 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  {st.label}
                  {st.badge > 0 && <span className="px-1.5 py-0.5 bg-rose-500 text-white text-[10px] font-bold rounded-full leading-none">{st.badge}</span>}
                </button>
              ))}
            </div>
            {historySubTab === 'hearts' && (
              <div>
                <div className="flex border-b border-gray-200 bg-gray-50 px-4">
                  {([
                    { id: 'hearts' as HeartSubTab, label: '하트 현황' },
                    { id: 'popularity' as HeartSubTab, label: '인기도 랭킹' },
                  ]).map(st => (
                    <button key={st.id} onClick={() => setHeartSubTab(st.id)}
                      className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all ${heartSubTab === st.id ? 'border-rose-500 text-rose-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                      {st.label}
                    </button>
                  ))}
                </div>
                {heartSubTab === 'hearts' && <HeartsTab likes={likes} profileMap={profileMap} onClear={handleClearLikes} onRefresh={loadAll} />}
                {heartSubTab === 'popularity' && <PopularityTab likes={likes} profileMap={profileMap} />}
              </div>
            )}
            {historySubTab === 'chats' && <ChatsTab chats={allChats} messages={allMessages} profileMap={profileMap} onDeleteChat={handleDeleteChat} onClearAll={handleClearAllChats} onRefresh={loadAll} />}
            {historySubTab === 'session' && <HistoryTab histories={histories} onClear={handleClearHistory} />}
            {historySubTab === 'participants' && <ParticipantsTab profiles={profiles} />}
            {historySubTab === 'feedback' && (
              <div>
                <div className="flex border-b border-gray-200 bg-gray-50 px-4">
                  {([
                    { id: 'reports' as FeedbackSubTab, label: '익명건의', badge: anonymousReports.filter(r => !r.ack_at).length },
                    { id: 'suggestions' as FeedbackSubTab, label: '건의사항', badge: suggestions.filter(s => s.status === 'pending').length },
                  ]).map(st => (
                    <button key={st.id} onClick={() => setFeedbackSubTab(st.id)}
                      className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 transition-all ${feedbackSubTab === st.id ? 'border-teal-500 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                      {st.label}
                      {st.badge > 0 && <span className="px-1.5 py-0.5 bg-rose-500 text-white text-[10px] font-bold rounded-full">{st.badge}</span>}
                    </button>
                  ))}
                </div>
                {feedbackSubTab === 'reports' && (
                  <div className="p-4">
                    <AnonymousReportsTab reports={anonymousReports} onClear={handleClearReports} onAck={handleAckReport} onRefresh={handleRefreshReports} />
                  </div>
                )}
                {feedbackSubTab === 'suggestions' && (
                  <div className="p-4">
                    <SuggestionsTab suggestions={suggestions} onUpdate={(updated) => setSuggestions(prev => prev.map(s => s.id === updated.id ? updated : s))} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {tab === 'game' && (
          <div>
            <div className="flex border-b border-gray-200 bg-white px-2 overflow-x-auto">
              {([
                { id: 'balance' as GameSubTab, label: '밸런스', icon: '⚡' },
                { id: 'ox'      as GameSubTab, label: 'OX',     icon: '⭕' },
                { id: 'chosung' as GameSubTab, label: '초성',   icon: '🔤' },
                { id: 'qa'      as GameSubTab, label: 'Q&A',    icon: '💬' },
                { id: 'image'   as GameSubTab, label: '이미지', icon: '🖼️' },
              ]).map(st => (
                <button key={st.id} onClick={() => setGameSubTab(st.id)}
                  className={`flex items-center gap-1 px-3 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap flex-shrink-0 ${gameSubTab === st.id ? 'border-violet-500 text-violet-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  <span>{st.icon}</span>{st.label}
                </button>
              ))}
            </div>
            <div className="p-4 bg-gray-50 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
              {gameSubTab === 'balance' && (
                <div className="space-y-5">
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                    <BalanceGameCreate currentGame={currentGame} onGameUpdate={setCurrentGame} seats={seats} settings={settings} onRefresh={loadAll} />
                  </div>
                  <AdminBalanceGameTab balanceGames={balanceGames.filter(g => !isOxGame(g))} voteCounts={adminVoteCounts} myVotes={adminMyVotes} onVote={handleAdminVote} />
                </div>
              )}
              {gameSubTab === 'ox' && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                  <OxGameSection balanceGames={balanceGames} voteCounts={adminVoteCounts} currentGame={currentGame} onGameUpdate={setCurrentGame} seats={seats} settings={settings} onRefresh={loadAll} />
                </div>
              )}
              {gameSubTab === 'chosung' && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                  <ChosungGameSection seats={seats} />
                </div>
              )}
              {gameSubTab === 'qa' && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                  <QaGameSection seats={seats} />
                </div>
              )}
              {gameSubTab === 'image' && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                  <ImageGameSection seats={seats} settings={settings} profiles={profiles} />
                </div>
              )}
            </div>
          </div>
        )}
        {tab === 'notify' && <NotificationTab tableCount={[...new Set(seats.map(s => s.table_number))].length} settings={settings} onSetTimer={handleSetTimer} />}
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

      {/* 밸런스 게임 결과 모달 (어느 탭에서도 표시) */}
      {adminGameEndResult && (() => {
        const { game, counts } = adminGameEndResult;
        const total = counts.a + counts.b;
        const pctA = total > 0 ? Math.round((counts.a / total) * 100) : 50;
        const pctB = 100 - pctA;
        const winnerA = counts.a >= counts.b;
        return (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">
              <div className="bg-gradient-to-r from-violet-600 to-purple-700 px-5 py-4 text-center">
                <div className="text-2xl mb-1">🏆</div>
                <div className="text-[10px] font-black text-violet-200 uppercase tracking-widest mb-1">밸런스 게임 결과</div>
                <h2 className="text-base font-black text-white leading-snug">{game.question}</h2>
              </div>
              <div className="p-5 space-y-3">
                {(['a', 'b'] as const).map(opt => {
                  const label = opt === 'a' ? game.option_a : game.option_b;
                  const pct = opt === 'a' ? pctA : pctB;
                  const count = opt === 'a' ? counts.a : counts.b;
                  const isWinner = opt === 'a' ? winnerA : !winnerA;
                  return (
                    <div key={opt} className={`rounded-xl overflow-hidden border-2 ${isWinner ? 'border-violet-300' : 'border-gray-100'}`}>
                      <div className={`px-4 py-3 flex items-center justify-between ${isWinner ? 'bg-violet-50' : 'bg-gray-50'}`}>
                        <div className="flex items-center gap-2">
                          {isWinner && <span className="text-base">🥇</span>}
                          <span className={`text-sm font-black ${isWinner ? 'text-violet-700' : 'text-gray-400'}`}>{label}</span>
                        </div>
                        <span className={`text-lg font-black ${isWinner ? 'text-violet-600' : 'text-gray-400'}`}>{pct}%</span>
                      </div>
                      <div className={`h-1 ${isWinner ? 'bg-violet-500' : 'bg-gray-200'}`} style={{ width: `${pct}%` }} />
                      <div className="px-4 py-1.5 text-xs text-gray-400">{count}명 선택</div>
                    </div>
                  );
                })}
                <p className="text-center text-gray-400 text-xs">총 {total}명 참여</p>
              </div>
              <div className="px-5 pb-5">
                <button onClick={() => setAdminGameEndResult(null)} className="w-full py-3 bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold rounded-xl transition-all">확인</button>
              </div>
            </div>
          </div>
        );
      })()}

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
              <button onClick={() => { setTab('history'); setHistorySubTab('feedback'); setFeedbackSubTab('reports'); setNewReportPopup(null); }} className="flex-1 py-2.5 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 transition-all text-sm">건의함으로 이동</button>
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
