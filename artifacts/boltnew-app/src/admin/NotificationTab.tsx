import { useState, useEffect, useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import {
  Shield, LogOut, Trash2, Users,
  LayoutGrid, X, AlertTriangle, ChevronDown,
  Heart, MessageCircle, Send, CheckCircle, BellRing, Eye, EyeOff,
  PlayCircle, StopCircle, Timer, RefreshCw, Sparkles,
  Lock, Unlock, Search, Database as DatabaseIcon, Activity,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getPositionLabel, getDomSubLabel, getKoreanAge } from '../lib/profile';
import { HEART_TYPE_META } from '../lib/constants';
import {
  withAdminImageToken, setAdminToken, loadAdminSession, getAdminPassword, refreshAdminToken,
  adminApiRpc, patchAdminSettings, adminApiSelect, adminApiOp, adminSupabase,
  ADMIN_TOKEN_KEY, ADMIN_PW_KEY, ADMIN_SESSION_KEY, ADMIN_API, MAX_ADMIN_MESSAGES,
  type Profile, type AppSettings, type SessionHistory, type Like, type Chat, type Message, type Suggestion, type AnonymousReport, type DbHealthData, type AdminSession,
} from './shared';

// ─── Notification Tab ─────────────────────────────────────────────────────────

type Notification = { id: string; message: string; type: string; target: string; is_active: boolean; created_at: string };

const NOTIF_TYPES = [
  { id: 'info',   label: '📢 일반공지', color: 'bg-blue-50 border-blue-200 text-blue-800' },
  { id: 'urgent', label: '🚨 긴급',     color: 'bg-red-50 border-red-200 text-red-800' },
  { id: 'event',  label: '🎉 이벤트',   color: 'bg-amber-50 border-amber-200 text-amber-800' },
];

export function NotificationTab({ tableCount, settings, onSetTimer }: {
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
    const { error: insertErr } = await adminSupabase
      .from('notifications').insert({ message: fullMsg, type, target, is_active: true }).select().single();
    if (insertErr) {
      alert(`알림 전송 실패: ${insertErr.message}`);
      setSending(false);
      return;
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
