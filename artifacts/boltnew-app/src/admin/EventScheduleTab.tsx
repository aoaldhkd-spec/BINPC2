import { useEffect, useMemo, useState } from 'react';
import type { AppSettings } from './shared';
import { HEART_TYPES } from '../lib/constants';
import { currentEventSlot, eventGrantedHeartTotal, eventHeartQuotas, parseEventSchedule, type EventScheduleSlot } from '../lib/event-schedule';

const NOTICE_PRESETS = [
  '지금은 프로필·설정만 이용할 수 있어요. 하트·채팅은 잠시 후 열립니다.',
  '잠금 유지 중이에요. 안내된 시각에 하트·채팅이 열립니다.',
  '5분 후 하트와 채팅을 이용할 수 있어요.',
  '하트·채팅이 열렸어요! 마음에 드는 상대에게 보내 보세요.',
] as const;

const EMPTY: EventScheduleSlot = { id: 'slot-1', at: '23:00', notice: '하트가 열렸어요!', functions_locked: false, heart_grants: {} };

export type ScheduleSaveExtras = { functions_locked?: boolean };

export function seoulNowHHMM(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
  const h = Number(parts.find(p => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find(p => p.type === 'minute')?.value ?? 0);
  return `${String(h === 24 ? 0 : h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Parse admin grant input. 0 if empty/invalid — never fall back to 4. */
export function parseHeartGrantAmount(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(100, n);
}

/** Immediate rainbow unlock patch: open functions, bump slot clock to now, grant shared pool. */
export function rainbowUnlockNowPatch(amount: number, now = new Date()): Partial<EventScheduleSlot> {
  const n = parseHeartGrantAmount(amount);
  return { at: seoulNowHHMM(now), functions_locked: false, ...(n > 0 ? { rainbow_pool: n } : {}) };
}

/** Add N more to a slot's existing rainbow_pool (admin "추가하는만큼"). */
export function nextRainbowPoolGrant(current: number | undefined, add: number): number {
  const cur = Math.max(0, Math.floor(Number(current) || 0));
  return Math.min(100, cur + parseHeartGrantAmount(add));
}

/** Apply slot now: bump clock + open functions (no pool change). */
export function applySlotNowPatch(now = new Date()): Partial<EventScheduleSlot> {
  return { at: seoulNowHHMM(now), functions_locked: false };
}

/** Time-only: never touches notice / pool. */
export function timeOnlyPatch(at: string): Partial<EventScheduleSlot> {
  return { at };
}

/** Notice-only: never touches at / pool / lock. */
export function noticeOnlyPatch(notice: string): Partial<EventScheduleSlot> {
  return { notice };
}

/** Hearts-only: add to pool and open functions; never touches notice / at. */
export function heartsOnlyPatch(currentPool: number | undefined, add: number): Partial<EventScheduleSlot> {
  return { rainbow_pool: nextRainbowPoolGrant(currentPool, add), functions_locked: false };
}

export const TIME_ONLY_APPLY_HINT = '공지나 하트도 같이 넣는 게 좋아요';

export type SlotApplyPick = { time?: boolean; notice?: boolean; hearts?: boolean };

/** Merge only the fields included in this apply. Omitted keys stay on the last-saved slot. */
export function selectedSlotApplyPatch(
  pick: SlotApplyPick,
  values: { at: string; notice: string; currentPool?: number; addHearts: number },
): Partial<EventScheduleSlot> {
  const patch: Partial<EventScheduleSlot> = {};
  if (pick.time) Object.assign(patch, timeOnlyPatch(values.at));
  if (pick.notice) Object.assign(patch, noticeOnlyPatch(values.notice));
  if (pick.hearts) Object.assign(patch, heartsOnlyPatch(values.currentPool, values.addHearts));
  return patch;
}

export function selectedApplyCount(pick: SlotApplyPick): number {
  return Number(!!pick.time) + Number(!!pick.notice) + Number(!!pick.hearts);
}

/** Time-only is allowed; warn. Notice-only / hearts-only / 2–3 field applies do not warn. */
export function shouldWarnTimeOnlyApply(pick: SlotApplyPick): boolean {
  return selectedApplyCount(pick) === 1 && !!pick.time;
}

/** Persist only the chosen field onto last-saved slots so dirty sibling edits are not broadcast. */
export function applySavedFieldPatch(
  saved: EventScheduleSlot[],
  local: EventScheduleSlot[],
  id: string,
  patch: Partial<EventScheduleSlot>,
): EventScheduleSlot[] {
  const base = saved.some(s => s.id === id) ? saved : local;
  return applySlotPatch(base, id, patch);
}

export function applySlotPatch(slots: EventScheduleSlot[], id: string, patch: Partial<EventScheduleSlot>): EventScheduleSlot[] {
  return slots.map(s => s.id === id ? { ...s, ...patch } : s);
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
  const [rainbowAmount, setRainbowAmount] = useState('');
  const [picks, setPicks] = useState<Record<string, SlotApplyPick>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<'notice' | 'hearts' | 'timeline' | 'selected' | false>(false);
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => { const id = window.setInterval(() => setClock(new Date()), 1000); return () => window.clearInterval(id); }, []);
  // Keep editor in sync when SSE/ready pushes a newer schedule after unlock/save.
  useEffect(() => {
    setSlots(initial.slots.length ? initial.slots : [EMPTY]);
  }, [initial]);
  const scheduleObj = useMemo(() => ({ timezone: 'Asia/Seoul' as const, slots }), [slots]);
  const cumulative = useMemo(() => eventHeartQuotas(scheduleObj, clock), [scheduleObj, clock]);
  const cumulativeRainbow = useMemo(() => eventGrantedHeartTotal(scheduleObj, clock), [scheduleObj, clock]);
  const active = useMemo(() => currentEventSlot(scheduleObj, clock), [scheduleObj, clock]);
  const nowHHMM = seoulNowHHMM(clock);
  const unlocked = active ? active.functions_locked !== true : !(settings?.functions_locked ?? false);
  const liveNotice = (active?.notice ?? '').trim();
  const update = (id: string, patch: Partial<EventScheduleSlot>) => setSlots(prev => applySlotPatch(prev, id, patch));
  const add = () => setSlots(prev => [...prev, { id: `slot-${Date.now()}`, at: '23:00', notice: '', functions_locked: false, heart_grants: {} }]);
  const persist = async (next: EventScheduleSlot[], extras?: ScheduleSaveExtras, kind: 'notice' | 'hearts' | 'timeline' | 'selected' = 'timeline') => {
    setSaving(true);
    try {
      await onSave(JSON.stringify({ timezone: 'Asia/Seoul', slots: next }), extras);
      setSaved(kind);
      setTimeout(() => setSaved(false), 1800);
    } finally { setSaving(false); }
  };
  const save = async () => { await persist(slots); };
  const savedSlots = initial.slots;
  const togglePick = (id: string, key: keyof SlotApplyPick) => {
    setPicks(prev => ({ ...prev, [id]: { ...prev[id], [key]: !prev[id]?.[key] } }));
  };
  const applyPicked = async (id: string, pick: SlotApplyPick, kind: 'notice' | 'hearts' | 'timeline' | 'selected') => {
    const addHearts = parseHeartGrantAmount(rainbowAmount);
    const effective: SlotApplyPick = { ...pick, hearts: Boolean(pick.hearts && addHearts > 0) };
    if (selectedApplyCount(effective) === 0) return;
    if (shouldWarnTimeOnlyApply(effective) && typeof window !== 'undefined'
      && !window.confirm(`${TIME_ONLY_APPLY_HINT}. 시간만 적용할까요?`)) return;
    const local = slots.find(s => s.id === id);
    const base = savedSlots.some(s => s.id === id) ? savedSlots : slots;
    const savedSlot = base.find(s => s.id === id);
    const next = applySavedFieldPatch(savedSlots, slots, id, selectedSlotApplyPatch(effective, {
      at: local?.at ?? seoulNowHHMM(),
      notice: local?.notice ?? '',
      currentPool: savedSlot?.rainbow_pool,
      addHearts,
    }));
    setSlots(next);
    await persist(next, effective.hearts ? { functions_locked: false } : undefined, kind);
  };
  /** Heart count only — last-saved notice/time stay. */
  const unlockRainbowNow = async (id: string) => { await applyPicked(id, { hearts: true }, 'hearts'); };
  /** Notice text only — do not bump the clock or change pool. */
  const applyNoticeNow = async (id: string) => { await applyPicked(id, { notice: true }, 'notice'); };
  /** Time only — last-saved notice/pool stay. */
  const applyTimeOnly = async (id: string) => { await applyPicked(id, { time: true }, 'timeline'); };
  const applySelected = async (id: string) => { await applyPicked(id, picks[id] ?? {}, 'selected'); };
  const poolLabel = cumulativeRainbow > 0 ? `${cumulativeRainbow}개` : '0개 (잠김)';
  return <div className="p-3 min-[390px]:p-4 space-y-4">
    <div className={`rounded-2xl border p-3 ${unlocked ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-black text-sm text-gray-900">⏱ 행사 시계</p>
        <span className="ml-auto text-[10px] font-bold tabular-nums text-gray-500">Seoul {nowHHMM}</span>
      </div>
      <div className="mt-2 grid grid-cols-1 min-[390px]:grid-cols-2 gap-2">
        <div className={`rounded-xl border p-2 ${liveNotice ? 'border-cyan-300 bg-white/80' : 'border-white/70 bg-white/60'}`}>
          <p className="text-[10px] font-black text-cyan-800">📢 공지 라이브</p>
          <p className="mt-1 text-[11px] font-bold leading-snug text-gray-800 line-clamp-3">{liveNotice || '라이브 공지 없음'}</p>
          <p className="mt-1 text-[10px] font-bold text-gray-500">{active ? `활성 ${active.at}` : '활성 슬롯 없음'} · {unlocked ? '💖 열림' : '🔒 잠김'}</p>
        </div>
        <div className={`rounded-xl border p-2 ${cumulativeRainbow > 0 ? 'border-fuchsia-300 bg-white/80' : 'border-white/70 bg-white/60'}`}>
          <p className="text-[10px] font-black text-fuchsia-800">🌈 하트 라이브</p>
          <p className="mt-1 text-[13px] font-black text-gray-900">pool {poolLabel}</p>
          <p className="mt-1 text-[10px] font-bold text-gray-500">누적 · 🌈 {cumulativeRainbow} · 빨강 {cumulative.red} · 파랑 {cumulative.blue} · 분홍 {cumulative.pink} · 초록 {cumulative.green}</p>
        </div>
      </div>
      <p className="mt-2 text-[11px] font-semibold leading-relaxed text-gray-700">
        시간·공지·하트는 따로 방송해요. 고른 칸만 나가고, 비운 칸은 라이브 값을 덮지 않아요. 시간만 보낼 때는 「{TIME_ONLY_APPLY_HINT}」.
      </p>
    </div>
    <div className="space-y-3">
      {slots.map((slot, index) => {
        const phase = slotPhase(slot, active?.id ?? null, nowHHMM);
        const locked = slot.functions_locked === true;
        const pick = picks[slot.id] ?? {};
        const pickCount = selectedApplyCount(pick);
        return <div key={slot.id} className={`rounded-2xl border bg-white p-3 shadow-sm ${phase === 'active' ? 'border-cyan-400 ring-2 ring-cyan-100' : 'border-gray-200'}`}>
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-black text-gray-500">#{index + 1}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${phase === 'active' ? 'bg-cyan-600 text-white' : phase === 'past' ? 'bg-gray-200 text-gray-600' : 'bg-violet-100 text-violet-700'}`}>
              {phase === 'active' ? '● 활성' : phase === 'past' ? '지남' : '대기'}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${locked ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
              {locked ? '🔒 잠김' : '💖 열림'}
            </span>
            {typeof slot.rainbow_pool === 'number' && slot.rainbow_pool > 0 && (
              <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-[10px] font-black text-fuchsia-800">pool {slot.rainbow_pool}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input aria-label={`슬롯 ${index + 1} 시각`} type="time" value={slot.at} onChange={e => update(slot.id, { at: e.target.value })} className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm font-black" />
            <button type="button" disabled={saving} onClick={() => update(slot.id, { at: seoulNowHHMM() })} className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] font-black text-amber-800">지금</button>
            <button type="button" disabled={saving} onClick={() => void applyTimeOnly(slot.id)} className="rounded-lg bg-amber-500 px-2.5 py-1.5 text-[10px] font-black text-white hover:bg-amber-600 disabled:opacity-40" title={TIME_ONLY_APPLY_HINT}>시간만 적용</button>
            <select aria-label={`슬롯 ${index + 1} 잠금`} value={locked ? 'locked' : 'open'} onChange={e => update(slot.id, { functions_locked: e.target.value === 'locked' })} className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-bold">
              <option value="locked">🔒 프로필·설정만</option><option value="open">💖 하트·채팅 열림</option>
            </select>
            <button type="button" aria-label={`${index + 1}번 슬롯 삭제`} onClick={() => setSlots(prev => prev.filter(s => s.id !== slot.id))} className="px-2 py-1 text-xs font-black text-rose-500">삭제</button>
          </div>
          <div className="mt-2 rounded-xl border border-cyan-100 bg-cyan-50/50 p-2">
            <input aria-label={`슬롯 ${index + 1} 공지`} value={slot.notice} onChange={e => update(slot.id, { notice: e.target.value })} placeholder="참여자에게 보여줄 공지 (선택)" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs" maxLength={240} />
            <div className="mt-2">
              <p className="mb-1 text-[10px] font-black text-gray-400">빠른 공지</p>
              <div className="flex flex-wrap gap-1.5">
                {NOTICE_PRESETS.map((preset) => <button key={preset} type="button" onClick={() => update(slot.id, { notice: preset })} className={`rounded-full border px-2 py-1 text-[10px] font-bold transition-colors ${slot.notice === preset ? 'border-cyan-500 bg-cyan-50 text-cyan-700' : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-cyan-300 hover:bg-cyan-50'}`}>{preset.startsWith('5분') ? '5분 후 오픈' : preset.includes('열렸어요') ? '하트·채팅 오픈' : preset.startsWith('잠금') ? '잠금 안내' : '프로필·설정만'}</button>)}
              </div>
            </div>
            <button type="button" disabled={saving} onClick={() => void applyNoticeNow(slot.id)} className="mt-2 w-full rounded-lg bg-cyan-600 px-3 py-2 text-[11px] font-black text-white hover:bg-cyan-700 disabled:opacity-40">공지만 적용</button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-fuchsia-200 bg-fuchsia-50/70 p-2">
            <label className="flex items-center gap-1 text-[11px] font-black text-fuchsia-800">🌈 <input aria-label={`${index + 1}번 하트 해금 수`} type="number" min="1" max="100" placeholder="N" value={rainbowAmount} onChange={e => setRainbowAmount(e.target.value)} className="w-12 rounded border border-fuchsia-200 bg-white px-1 py-1 text-center" />개</label>
            <button type="button" disabled={saving || parseHeartGrantAmount(rainbowAmount) <= 0} onClick={() => void unlockRainbowNow(slot.id)} className="rounded-lg bg-fuchsia-600 px-3 py-2 text-[11px] font-black text-white shadow-sm hover:bg-fuchsia-700 disabled:opacity-40">
              하트만 해금·적용 {parseHeartGrantAmount(rainbowAmount) > 0 ? `${parseHeartGrantAmount(rainbowAmount)}개` : '개수 입력'}
            </button>
            <div className="w-full flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] font-black text-gray-400">같이 적용</span>
              {([['time', '시간'], ['notice', '공지'], ['hearts', '하트']] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={!!pick[key]}
                  onClick={() => togglePick(slot.id, key)}
                  className={`rounded-full border px-2 py-1 text-[10px] font-black ${pick[key] ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-gray-200 bg-white text-gray-500'}`}
                >{label}</button>
              ))}
              <button type="button" disabled={saving || pickCount === 0} onClick={() => void applySelected(slot.id)} className="rounded-lg bg-teal-600 px-2.5 py-1.5 text-[10px] font-black text-white hover:bg-teal-700 disabled:opacity-40">
                선택 {pickCount}개 적용
              </button>
            </div>
            <details className="w-full">
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
      {saved && <span className="text-xs font-bold text-teal-700">{saved === 'notice' ? '공지 적용됨 · 실시간 반영' : saved === 'hearts' ? '하트 해금됨 · 실시간 반영' : saved === 'selected' ? '선택한 항목 적용됨 · 실시간 반영' : '저장됐어요 · 실시간 반영'}</span>}
    </div>
  </div>;
}
