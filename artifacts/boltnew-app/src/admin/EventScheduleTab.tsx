import { useEffect, useMemo, useState } from 'react';
import type { AppSettings } from './shared';
import { HEART_TYPES } from '../lib/constants';
import { eventHeartQuotas, eventRainbowQuota, parseEventSchedule, type EventScheduleSlot } from '../lib/event-schedule';

const NOTICE_PRESETS = [
  '지금은 프로필·설정만 이용할 수 있어요. 하트·채팅은 잠시 후 열립니다.',
  '잠금 유지 중이에요. 안내된 시각에 하트·채팅이 열립니다.',
  '5분 후 하트와 채팅을 이용할 수 있어요.',
  '하트·채팅이 열렸어요! 마음에 드는 상대에게 보내 보세요.',
] as const;

const EMPTY: EventScheduleSlot = { id: 'slot-1', at: '23:00', notice: '하트가 열렸어요!', functions_locked: false, heart_grants: {} };

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

export function applySlotPatch(slots: EventScheduleSlot[], id: string, patch: Partial<EventScheduleSlot>): EventScheduleSlot[] {
  return slots.map(s => s.id === id ? { ...s, ...patch } : s);
}

export function EventScheduleTab({ settings, onSave }: { settings: AppSettings | null; onSave: (raw: string) => Promise<void> }) {
  const initial = useMemo(() => parseEventSchedule(settings?.event_schedule), [settings?.event_schedule]);
  const [slots, setSlots] = useState<EventScheduleSlot[]>(initial.slots.length ? initial.slots : [EMPTY]);
  const [rainbowAmount, setRainbowAmount] = useState('4');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => { const id = window.setInterval(() => setClock(new Date()), 1000); return () => window.clearInterval(id); }, []);
  // Keep editor in sync when SSE/ready pushes a newer schedule after unlock/save.
  useEffect(() => {
    setSlots(initial.slots.length ? initial.slots : [EMPTY]);
  }, [initial]);
  const cumulative = useMemo(() => eventHeartQuotas({ timezone: 'Asia/Seoul', slots }, clock), [slots, clock]);
  const cumulativeRainbow = useMemo(() => eventRainbowQuota({ timezone: 'Asia/Seoul', slots }, clock), [slots, clock]);
  const update = (id: string, patch: Partial<EventScheduleSlot>) => setSlots(prev => applySlotPatch(prev, id, patch));
  const add = () => setSlots(prev => [...prev, { id: `slot-${Date.now()}`, at: '23:00', notice: '', functions_locked: false, heart_grants: {} }]);
  const persist = async (next: EventScheduleSlot[]) => {
    setSaving(true);
    try {
      await onSave(JSON.stringify({ timezone: 'Asia/Seoul', slots: next }));
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } finally { setSaving(false); }
  };
  const save = async () => { await persist(slots); };
  /** Unlock rainbow immediately and broadcast — no separate Save click required. */
  const unlockRainbowNow = async (id: string) => {
    const next = applySlotPatch(slots, id, rainbowUnlockNowPatch(Number(rainbowAmount) || 4));
    setSlots(next);
    await persist(next);
  };
  return <div className="p-3 min-[390px]:p-4 space-y-4">
    <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-3">
      <p className="font-black text-cyan-900 text-sm">⏱ 행사 시계 타임라인</p>
      <p className="text-[11px] text-cyan-800 mt-1 leading-relaxed">무지개하트는 빨강·파랑·분홍·초록 4종의 선택 하트예요. 해금 버튼은 즉시 저장·실시간 반영돼요. 서버 시간(Asia/Seoul)으로 적용돼요. 슬롯이 열리면 공지·잠금·하트 지급이 모든 사용자에게 실시간 반영됩니다. 기존 상대 시간 타이머는 그대로 유지됩니다.</p>
      <p className="mt-2 text-[11px] font-bold leading-relaxed text-cyan-800">슬롯을 직접 추가하고 시각을 편집하세요. 무지개하트는 색상별 지급이 아니라, 원하는 색을 매번 골라 쓸 수 있는 하나의 누적 pool입니다.</p>
      <p className="mt-2 rounded-lg border border-cyan-200 bg-white/70 px-2.5 py-2 text-[11px] font-black text-cyan-900">현재까지 누적 해금: 🌈 무지개하트 {cumulativeRainbow}개 · 고급 색상별 지급: 빨강 {cumulative.red} · 파랑 {cumulative.blue} · 분홍 {cumulative.pink} · 초록 {cumulative.green} <span className="font-medium text-cyan-700">(현재 시각 이전 슬롯 합산)</span></p>
    </div>
    <div className="space-y-3">
      {slots.map((slot, index) => <div key={slot.id} className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-black text-gray-500">{index + 1}</span>
          <input aria-label={`슬롯 ${index + 1} 시각`} type="time" value={slot.at} onChange={e => update(slot.id, { at: e.target.value })} className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm font-black" />
          <button type="button" onClick={() => update(slot.id, { at: seoulNowHHMM(), functions_locked: false })} className="shrink-0 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-[10px] font-black text-amber-700 hover:bg-amber-100">지금 적용</button>
          <select aria-label={`슬롯 ${index + 1} 잠금`} value={slot.functions_locked ? 'locked' : 'open'} onChange={e => update(slot.id, { functions_locked: e.target.value === 'locked' })} className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-bold">
            <option value="locked">🔒 프로필·설정만</option><option value="open">💖 하트·채팅 열림</option>
          </select>
          <button type="button" aria-label={`${index + 1}번 슬롯 삭제`} onClick={() => setSlots(prev => prev.filter(s => s.id !== slot.id))} className="px-2 py-1 text-xs font-black text-rose-500">삭제</button>
        </div>
        <input aria-label={`슬롯 ${index + 1} 공지`} value={slot.notice} onChange={e => update(slot.id, { notice: e.target.value })} placeholder="참여자에게 보여줄 공지 (선택)" className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-xs" maxLength={240} />
        <div className="mt-2">
          <p className="mb-1 text-[10px] font-black text-gray-400">빠른 공지</p>
          <div className="flex flex-wrap gap-1.5">
            {NOTICE_PRESETS.map((preset) => <button key={preset} type="button" onClick={() => update(slot.id, { notice: preset })} className={`rounded-full border px-2 py-1 text-[10px] font-bold transition-colors ${slot.notice === preset ? 'border-cyan-500 bg-cyan-50 text-cyan-700' : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-cyan-300 hover:bg-cyan-50'}`}>{preset.startsWith('5분') ? '5분 후 오픈' : preset.includes('열렸어요') ? '하트·채팅 오픈' : preset.startsWith('잠금') ? '잠금 안내' : '프로필·설정만'}</button>)}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <label className="flex items-center gap-1 rounded-lg border border-fuchsia-200 bg-fuchsia-50 px-2 py-1.5 text-[10px] font-black text-fuchsia-700">🌈 <input aria-label={`${index + 1}번 무지개하트 해금 수`} type="number" min="1" max="100" value={rainbowAmount} onChange={e => setRainbowAmount(e.target.value)} className="w-10 rounded border border-fuchsia-200 bg-white px-1 py-1 text-center" />개</label>
          <button type="button" disabled={saving} onClick={() => void unlockRainbowNow(slot.id)} className="rounded-lg border border-fuchsia-300 bg-fuchsia-50 px-2.5 py-1.5 text-[10px] font-black text-fuchsia-700 hover:bg-fuchsia-100 disabled:opacity-40">무지개하트 {Math.max(1, Number(rainbowAmount) || 4)}개 해금·저장</button>
          {typeof slot.rainbow_pool === 'number' && slot.rainbow_pool > 0 && (
            <span className="rounded-full bg-fuchsia-100 px-2 py-1 text-[10px] font-black text-fuchsia-800">슬롯 pool {slot.rainbow_pool}개</span>
          )}
        </div>
        <p className="mt-2 text-[10px] font-semibold text-gray-400">해금·저장은 슬롯 시각을 지금으로 맞추고 기능을 연 뒤 무지개 pool을 즉시 방송합니다. 아래 색상별 지급은 선택적인 고급 설정입니다.</p>
        <div className="mt-2 grid grid-cols-2 min-[390px]:grid-cols-4 gap-2">
          {HEART_TYPES.map(h => <label key={h.type} className="flex items-center gap-1 rounded-lg bg-gray-50 px-2 py-1.5 text-[10px] font-bold text-gray-600"><span>{h.emoji}</span><span className="truncate">{h.label}</span><input aria-label={`${index + 1}번 ${h.label} 지급`} type="number" min="0" max="20" value={slot.heart_grants?.[h.type] ?? 0} onChange={e => update(slot.id, { heart_grants: { ...(slot.heart_grants ?? {}), [h.type]: Math.max(0, Math.min(20, Number(e.target.value) || 0)) } })} className="ml-auto w-10 rounded border border-gray-200 bg-white px-1 py-1 text-center" /></label>)}
        </div>
      </div>)}
      <button type="button" onClick={add} className="w-full rounded-xl border-2 border-dashed border-gray-300 py-2.5 text-xs font-black text-gray-500">+ 슬롯 추가</button>
    </div>
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => void save()} disabled={saving || slots.length === 0} className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-black text-white disabled:opacity-40">{saving ? '저장 중…' : '타임라인 저장'}</button>
      {saved && <span className="text-xs font-bold text-teal-700">저장됐어요 · 실시간 반영</span>}
    </div>
    <p className="text-[10px] leading-relaxed text-gray-400">하트는 처음에는 0개이고, 무지개 해금·저장 시 pool이 바로 열립니다. 사용자는 pool 안에서 매번 빨강·파랑·분홍·초록 중 원하는 색을 고를 수 있습니다. 서버가 현재 시각과 남은 pool을 최종 검증합니다.</p>
  </div>;
}
