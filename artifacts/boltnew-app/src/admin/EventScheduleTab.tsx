import { useEffect, useMemo, useState } from 'react';
import type { AppSettings } from './shared';
import { HEART_TYPES } from '../lib/constants';
import { currentEventSlot, eventHeartQuotas, eventRainbowQuota, parseEventSchedule, type EventScheduleSlot } from '../lib/event-schedule';

const NOTICE_PRESETS = [
  '지금은 프로필·설정만 이용할 수 있어요. 하트·채팅은 잠시 후 열립니다.',
  '잠금 유지 중이에요. 안내된 시각에 하트·채팅이 열립니다.',
  '5분 후 하트와 채팅을 이용할 수 있어요.',
  '하트·채팅이 열렸어요! 마음에 드는 상대에게 보내 보세요.',
] as const;

const EMPTY: EventScheduleSlot = { id: 'slot-1', at: '23:00', notice: '하트가 열렸어요!', functions_locked: false, heart_grants: {} };

export const LIVE_NOTICE_ID = 'live-notice';
export const LIVE_HEARTS_ID = 'live-hearts';

export type ScheduleSaveExtras = { functions_locked?: boolean };

export function seoulNowHHMM(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
  const h = Number(parts.find(p => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find(p => p.type === 'minute')?.value ?? 0);
  return `${String(h === 24 ? 0 : h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Immediate rainbow unlock patch: open functions, bump slot clock to now, grant shared pool. */
export function rainbowUnlockNowPatch(amount: number, now = new Date()): Partial<EventScheduleSlot> {
  const n = Math.max(1, Math.min(100, Math.floor(Number(amount) || 4)));
  return { at: seoulNowHHMM(now), functions_locked: false, rainbow_pool: n };
}

/** Apply slot now: bump clock + open functions (no pool change). */
export function applySlotNowPatch(now = new Date()): Partial<EventScheduleSlot> {
  return { at: seoulNowHHMM(now), functions_locked: false };
}

export function applySlotPatch(slots: EventScheduleSlot[], id: string, patch: Partial<EventScheduleSlot>): EventScheduleSlot[] {
  return slots.map(s => s.id === id ? { ...s, ...patch } : s);
}

/** Persist notice/timer only — does not change rainbow_pool on any slot. */
export function applyNoticeIndependently(
  slots: EventScheduleSlot[],
  notice: string,
  functionsLocked: boolean,
  now = new Date(),
): EventScheduleSlot[] {
  const at = seoulNowHHMM(now);
  const next: EventScheduleSlot = { id: LIVE_NOTICE_ID, at, notice, functions_locked: functionsLocked };
  return [...slots.filter(s => s.id !== LIVE_NOTICE_ID), next];
}

/** Persist heart unlock only — keeps existing notice text on the live hearts slot. */
export function applyHeartsIndependently(
  slots: EventScheduleSlot[],
  amount: number,
  now = new Date(),
): EventScheduleSlot[] {
  const at = seoulNowHHMM(now);
  const n = Math.max(1, Math.min(100, Math.floor(Number(amount) || 4)));
  const existing = slots.find(s => s.id === LIVE_HEARTS_ID);
  const liveNotice = slots.find(s => s.id === LIVE_NOTICE_ID);
  const active = currentEventSlot({ timezone: 'Asia/Seoul', slots }, now);
  const notice = existing?.notice || liveNotice?.notice || active?.notice || '';
  const next: EventScheduleSlot = {
    id: LIVE_HEARTS_ID,
    at,
    notice,
    functions_locked: false,
    rainbow_pool: n,
    ...(existing?.heart_grants ? { heart_grants: existing.heart_grants } : {}),
  };
  return [...slots.filter(s => s.id !== LIVE_HEARTS_ID), next];
}

function slotPhase(slot: EventScheduleSlot, activeId: string | null, nowHHMM: string): 'active' | 'past' | 'upcoming' {
  if (activeId && slot.id === activeId) return 'active';
  return slot.at <= nowHHMM ? 'past' : 'upcoming';
}

export function EventScheduleTab({ settings, onSave }: {
  settings: AppSettings | null;
  onSave: (raw: string, extras?: ScheduleSaveExtras) => Promise<void>;
}) {
  const initial = useMemo(() => parseEventSchedule(settings?.event_schedule), [settings?.event_schedule]);
  const [slots, setSlots] = useState<EventScheduleSlot[]>(initial.slots.length ? initial.slots : [EMPTY]);
  const [rainbowAmount, setRainbowAmount] = useState('4');
  const [liveNotice, setLiveNotice] = useState('');
  const [liveNoticeLocked, setLiveNoticeLocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<'notice' | 'hearts' | 'timeline' | false>(false);
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => { const id = window.setInterval(() => setClock(new Date()), 1000); return () => window.clearInterval(id); }, []);
  // Keep editor in sync when SSE/ready pushes a newer schedule after unlock/save.
  useEffect(() => {
    const nextSlots = initial.slots.length ? initial.slots : [EMPTY];
    setSlots(nextSlots);
    const active = currentEventSlot({ timezone: 'Asia/Seoul', slots: nextSlots });
    const live = nextSlots.find(s => s.id === LIVE_NOTICE_ID);
    setLiveNotice(live?.notice ?? active?.notice ?? '');
    setLiveNoticeLocked((live ?? active)?.functions_locked === true);
  }, [initial]);
  const scheduleObj = useMemo(() => ({ timezone: 'Asia/Seoul' as const, slots }), [slots]);
  const cumulative = useMemo(() => eventHeartQuotas(scheduleObj, clock), [scheduleObj, clock]);
  const cumulativeRainbow = useMemo(() => eventRainbowQuota(scheduleObj, clock), [scheduleObj, clock]);
  const active = useMemo(() => currentEventSlot(scheduleObj, clock), [scheduleObj, clock]);
  const nowHHMM = seoulNowHHMM(clock);
  const unlocked = active ? active.functions_locked !== true : !(settings?.functions_locked ?? false);
  const liveNoticeText = (slots.find(s => s.id === LIVE_NOTICE_ID)?.notice || active?.notice || '').trim();
  const update = (id: string, patch: Partial<EventScheduleSlot>) => setSlots(prev => applySlotPatch(prev, id, patch));
  const add = () => setSlots(prev => [...prev, { id: `slot-${Date.now()}`, at: '23:00', notice: '', functions_locked: false, heart_grants: {} }]);
  const persist = async (next: EventScheduleSlot[], extras?: ScheduleSaveExtras, kind: 'notice' | 'hearts' | 'timeline' = 'timeline') => {
    setSaving(true);
    try {
      await onSave(JSON.stringify({ timezone: 'Asia/Seoul', slots: next }), extras);
      setSaved(kind);
      setTimeout(() => setSaved(false), 1800);
    } finally { setSaving(false); }
  };
  const save = async () => { await persist(slots, undefined, 'timeline'); };
  const applyNoticeOnly = async (notice: string, locked: boolean) => {
    const next = applyNoticeIndependently(slots, notice, locked);
    setSlots(next);
    await persist(next, { functions_locked: locked }, 'notice');
  };
  const applyHeartsOnly = async (amount: number, slotId?: string) => {
    const next = slotId
      ? applySlotPatch(slots, slotId, rainbowUnlockNowPatch(amount))
      : applyHeartsIndependently(slots, amount);
    setSlots(next);
    await persist(next, { functions_locked: false }, 'hearts');
  };
  const poolLabel = cumulativeRainbow > 0 ? `${cumulativeRainbow}개 해금` : '잠김 · 0개';
  return <div className="p-3 min-[390px]:p-4 space-y-4">
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-black text-sm text-gray-900">⏱ 지금 라이브</p>
        <span className="ml-auto text-[10px] font-bold tabular-nums text-gray-500">Seoul {nowHHMM}</span>
      </div>
      <div className="mt-2 grid grid-cols-1 min-[390px]:grid-cols-2 gap-2">
        <div className={`rounded-xl border p-2.5 ${liveNoticeText ? 'border-cyan-300 bg-cyan-50' : 'border-gray-200 bg-white'}`}>
          <p className="text-[10px] font-black text-cyan-800">📢 공지</p>
          <p className="mt-1 text-[11px] font-bold leading-snug text-gray-800 line-clamp-3">
            {liveNoticeText || '라이브 공지 없음'}
          </p>
          <p className="mt-1 text-[10px] font-bold text-gray-500">
            {active ? `활성 ${active.at}` : '활성 슬롯 없음'} · {unlocked ? '기능 열림' : '기능 잠김'}
          </p>
        </div>
        <div className={`rounded-xl border p-2.5 ${cumulativeRainbow > 0 ? 'border-fuchsia-300 bg-fuchsia-50' : 'border-gray-200 bg-white'}`}>
          <p className="text-[10px] font-black text-fuchsia-800">🌈 하트 해금</p>
          <p className="mt-1 text-[13px] font-black text-gray-900">무지개하트 {poolLabel}</p>
          <p className="mt-1 text-[10px] font-bold text-gray-500">
            누적 · 🌈 {cumulativeRainbow} · 빨강 {cumulative.red} · 파랑 {cumulative.blue} · 분홍 {cumulative.pink} · 초록 {cumulative.green}
          </p>
        </div>
      </div>
      <p className="mt-2 text-[10px] font-semibold text-gray-500">공지와 하트 해금은 따로 적용됩니다. 각각 저장 즉시 SSE/ready로 방송됩니다.</p>
    </div>

    <div className="grid grid-cols-1 min-[520px]:grid-cols-2 gap-3">
      <div className="rounded-2xl border border-cyan-200 bg-white p-3 shadow-sm">
        <p className="text-sm font-black text-gray-900">📢 공지만</p>
        <p className="mt-0.5 text-[10px] font-bold text-gray-400">하트 pool은 건드리지 않아요</p>
        <textarea
          aria-label="지금 보낼 공지"
          value={liveNotice}
          onChange={e => setLiveNotice(e.target.value)}
          placeholder="참여자에게 보여줄 공지"
          maxLength={240}
          rows={3}
          className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-xs"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {NOTICE_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setLiveNotice(preset)}
              className={`rounded-full border px-2 py-1 text-[10px] font-bold ${liveNotice === preset ? 'border-cyan-500 bg-cyan-50 text-cyan-700' : 'border-gray-200 bg-gray-50 text-gray-600'}`}
            >
              {preset.startsWith('5분') ? '5분 후 오픈' : preset.includes('열렸어요') ? '하트·채팅 오픈' : preset.startsWith('잠금') ? '잠금 안내' : '프로필·설정만'}
            </button>
          ))}
        </div>
        <select
          aria-label="공지와 함께 보낼 잠금"
          value={liveNoticeLocked ? 'locked' : 'open'}
          onChange={e => setLiveNoticeLocked(e.target.value === 'locked')}
          className="mt-2 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-bold"
        >
          <option value="open">💖 하트·채팅 열림 유지</option>
          <option value="locked">🔒 프로필·설정만 (공지 타이머)</option>
        </select>
        <button
          type="button"
          disabled={saving}
          onClick={() => void applyNoticeOnly(liveNotice, liveNoticeLocked)}
          className="mt-2 w-full rounded-xl bg-cyan-600 px-3 py-2.5 text-[12px] font-black text-white hover:bg-cyan-700 disabled:opacity-40"
        >
          {saving && saved === 'notice' ? '적용 중…' : '공지만 적용'}
        </button>
      </div>

      <div className="rounded-2xl border border-fuchsia-200 bg-white p-3 shadow-sm">
        <p className="text-sm font-black text-gray-900">🌈 하트만</p>
        <p className="mt-0.5 text-[10px] font-bold text-gray-400">공지 문구는 그대로 두고 pool만 해금</p>
        <label className="mt-3 flex items-center gap-2 text-[12px] font-black text-fuchsia-800">
          해금 수
          <input
            aria-label="지금 해금할 무지개하트 수"
            type="number"
            min="1"
            max="100"
            value={rainbowAmount}
            onChange={e => setRainbowAmount(e.target.value)}
            className="w-16 rounded-lg border border-fuchsia-200 bg-fuchsia-50 px-2 py-1.5 text-center"
          />
          개
        </label>
        <button
          type="button"
          disabled={saving}
          onClick={() => void applyHeartsOnly(Number(rainbowAmount) || 4)}
          className="mt-3 w-full rounded-xl bg-fuchsia-600 px-3 py-2.5 text-[12px] font-black text-white hover:bg-fuchsia-700 disabled:opacity-40"
        >
          {saving && saved === 'hearts' ? '적용 중…' : `하트만 해금·적용 ${Math.max(1, Number(rainbowAmount) || 4)}개`}
        </button>
      </div>
    </div>
    {saved && (
      <p className="text-xs font-bold text-teal-700">
        {saved === 'notice' ? '공지 적용됨 · 실시간 반영' : saved === 'hearts' ? '하트 해금됨 · 실시간 반영' : '저장됐어요 · 실시간 반영'}
      </p>
    )}

    <div className="space-y-3">
      <p className="text-[11px] font-black text-gray-500">예약 타임라인</p>
      {slots.map((slot, index) => {
        const phase = slotPhase(slot, active?.id ?? null, nowHHMM);
        const locked = slot.functions_locked === true;
        const liveTag = slot.id === LIVE_NOTICE_ID ? '지금 공지' : slot.id === LIVE_HEARTS_ID ? '지금 하트' : null;
        return <div key={slot.id} className={`rounded-2xl border bg-white p-3 shadow-sm ${phase === 'active' ? 'border-cyan-400 ring-2 ring-cyan-100' : 'border-gray-200'}`}>
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-black text-gray-500">#{index + 1}</span>
            {liveTag && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">{liveTag}</span>}
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${phase === 'active' ? 'bg-cyan-600 text-white' : phase === 'past' ? 'bg-gray-200 text-gray-600' : 'bg-violet-100 text-violet-700'}`}>
              {phase === 'active' ? '● 활성' : phase === 'past' ? '지남' : '대기'}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${locked ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
              {locked ? '🔒 잠김' : '💖 열림'}
            </span>
            {typeof slot.rainbow_pool === 'number' && slot.rainbow_pool > 0 && (
              <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-[10px] font-black text-fuchsia-800">pool {slot.rainbow_pool}</span>
            )}
            <button type="button" aria-label={`${index + 1}번 슬롯 삭제`} onClick={() => setSlots(prev => prev.filter(s => s.id !== slot.id))} className="ml-auto px-2 py-1 text-xs font-black text-rose-500">삭제</button>
          </div>
          <input aria-label={`슬롯 ${index + 1} 시각`} type="time" value={slot.at} onChange={e => update(slot.id, { at: e.target.value })} className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm font-black" />

          <div className="mt-2 rounded-xl border border-cyan-100 bg-cyan-50/60 p-2">
            <p className="mb-1 text-[10px] font-black text-cyan-800">공지</p>
            <input aria-label={`슬롯 ${index + 1} 공지`} value={slot.notice} onChange={e => update(slot.id, { notice: e.target.value })} placeholder="참여자에게 보여줄 공지 (선택)" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs" maxLength={240} />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {NOTICE_PRESETS.map((preset) => <button key={preset} type="button" onClick={() => update(slot.id, { notice: preset })} className={`rounded-full border px-2 py-1 text-[10px] font-bold transition-colors ${slot.notice === preset ? 'border-cyan-500 bg-cyan-50 text-cyan-700' : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-cyan-300 hover:bg-cyan-50'}`}>{preset.startsWith('5분') ? '5분 후 오픈' : preset.includes('열렸어요') ? '하트·채팅 오픈' : preset.startsWith('잠금') ? '잠금 안내' : '프로필·설정만'}</button>)}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select aria-label={`슬롯 ${index + 1} 잠금`} value={locked ? 'locked' : 'open'} onChange={e => update(slot.id, { functions_locked: e.target.value === 'locked' })} className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-bold">
                <option value="locked">🔒 프로필·설정만</option><option value="open">💖 하트·채팅 열림</option>
              </select>
              <button type="button" disabled={saving} onClick={() => void applyNoticeOnly(slot.notice, locked)} className="shrink-0 rounded-lg bg-cyan-600 px-3 py-1.5 text-[11px] font-black text-white hover:bg-cyan-700 disabled:opacity-40">공지만 적용</button>
            </div>
          </div>

          <div className="mt-2 rounded-xl border border-fuchsia-200 bg-fuchsia-50/70 p-2">
            <p className="mb-1 text-[10px] font-black text-fuchsia-800">하트 해금</p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1 text-[11px] font-black text-fuchsia-800">🌈 <input aria-label={`${index + 1}번 무지개하트 해금 수`} type="number" min="1" max="100" value={slot.rainbow_pool ?? rainbowAmount} onChange={e => {
                const n = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                update(slot.id, n > 0 ? { rainbow_pool: n } : { rainbow_pool: undefined });
                setRainbowAmount(e.target.value);
              }} className="w-12 rounded border border-fuchsia-200 bg-white px-1 py-1 text-center" />개</label>
              <button type="button" disabled={saving} onClick={() => void applyHeartsOnly(Number(slot.rainbow_pool ?? rainbowAmount) || 4, slot.id)} className="rounded-lg bg-fuchsia-600 px-3 py-2 text-[11px] font-black text-white shadow-sm hover:bg-fuchsia-700 disabled:opacity-40">
                하트만 해금·적용
              </button>
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer text-[10px] font-bold text-gray-400">고급 · 색상별 지급 (선택)</summary>
              <div className="mt-2 grid grid-cols-2 min-[390px]:grid-cols-4 gap-2">
                {HEART_TYPES.map(h => <label key={h.type} className="flex items-center gap-1 rounded-lg bg-gray-50 px-2 py-1.5 text-[10px] font-bold text-gray-600"><span>{h.emoji}</span><span className="truncate">{h.label}</span><input aria-label={`${index + 1}번 ${h.label} 지급`} type="number" min="0" max="20" value={slot.heart_grants?.[h.type] ?? 0} onChange={e => update(slot.id, { heart_grants: { ...(slot.heart_grants ?? {}), [h.type]: Math.max(0, Math.min(20, Number(e.target.value) || 0)) } })} className="ml-auto w-10 rounded border border-gray-200 bg-white px-1 py-1 text-center" /></label>)}
              </div>
            </details>
          </div>
        </div>;
      })}
      <button type="button" onClick={add} className="w-full rounded-xl border-2 border-dashed border-gray-300 py-2.5 text-xs font-black text-gray-500">+ 슬롯 추가</button>
    </div>
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => void save()} disabled={saving || slots.length === 0} className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-black text-white disabled:opacity-40">{saving ? '저장 중…' : '타임라인 저장'}</button>
      {saved === 'timeline' && <span className="text-xs font-bold text-teal-700">저장됐어요 · 실시간 반영</span>}
    </div>
  </div>;
}
