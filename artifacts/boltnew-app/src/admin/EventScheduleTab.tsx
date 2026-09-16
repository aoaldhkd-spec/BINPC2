import { useMemo, useState } from 'react';
import type { AppSettings } from './shared';
import type { HeartType } from '../lib/constants';
import { HEART_TYPES } from '../lib/constants';
import { parseEventSchedule, type EventScheduleSlot } from '../lib/event-schedule';

const NOTICE_PRESETS = [
  '지금은 프로필·설정만 이용할 수 있어요. 하트·채팅은 잠시 후 열립니다.',
  '잠금 유지 중이에요. 안내된 시각에 하트·채팅이 열립니다.',
  '5분 후 하트와 채팅을 이용할 수 있어요.',
  '하트·채팅이 열렸어요! 마음에 드는 상대에게 보내 보세요.',
] as const;

const EMPTY: EventScheduleSlot = { id: 'slot-1', at: '23:00', notice: '하트가 열렸어요!', functions_locked: false, heart_grants: {} };
const TIMES = (start: string, count: number) => {
  const [h, m] = start.split(':').map(Number); const base = h * 60 + m;
  return Array.from({ length: count }, (_, i) => { const n = (base + i * 5) % (24 * 60); return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`; });
};

function seoulNowHHMM(): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const h = Number(parts.find(p => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find(p => p.type === 'minute')?.value ?? 0);
  return `${String(h === 24 ? 0 : h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function EventScheduleTab({ settings, onSave }: { settings: AppSettings | null; onSave: (raw: string) => Promise<void> }) {
  const initial = useMemo(() => parseEventSchedule(settings?.event_schedule), [settings?.event_schedule]);
  const [slots, setSlots] = useState<EventScheduleSlot[]>(initial.slots.length ? initial.slots : [EMPTY]);
  const [start, setStart] = useState(slots[0]?.at ?? '23:00');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const update = (id: string, patch: Partial<EventScheduleSlot>) => setSlots(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  const add = () => setSlots(prev => [...prev, { id: `slot-${Date.now()}`, at: '23:00', notice: '', functions_locked: false, heart_grants: {} }]);
  const generate = () => setSlots(TIMES(start, 6).map((at, i) => ({ id: `slot-${i + 1}`, at, notice: i === 0 ? '행사 시작' : `${i * 5}분 경과 — 하트가 추가됩니다`, functions_locked: i < 2, heart_grants: i === 2 ? { red: 1, blue: 1, pink: 1, green: 1 } : {} })));
  const save = async () => {
    setSaving(true);
    try { await onSave(JSON.stringify({ timezone: 'Asia/Seoul', slots })); setSaved(true); setTimeout(() => setSaved(false), 1800); } finally { setSaving(false); }
  };
  return <div className="p-3 min-[390px]:p-4 space-y-4">
    <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-3">
      <p className="font-black text-cyan-900 text-sm">⏱ 행사 시계 타임라인</p>
      <p className="text-[11px] text-cyan-800 mt-1 leading-relaxed">서버 시간(Asia/Seoul)으로 적용돼요. 슬롯이 열리면 공지·잠금·하트 지급이 모든 사용자에게 실시간 반영됩니다. 기존 상대 시간 타이머는 그대로 유지됩니다.</p>
      <div className="mt-3 flex items-center gap-2">
        <label className="text-xs font-bold text-cyan-900">시작</label>
        <input type="time" value={start} onChange={e => setStart(e.target.value)} className="rounded-lg border border-cyan-200 bg-white px-2 py-1.5 text-sm" />
        <button type="button" onClick={generate} className="rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-black text-white">+5분 6칸 만들기</button>
      </div>
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
    <p className="text-[10px] leading-relaxed text-gray-400">하트는 처음에는 0개이고, 슬롯이 열릴 때 지급량이 추가돼요. 같은 종류도 여러 슬롯에서 추가할 수 있고, 서버가 현재 시각과 남은 quota를 최종 검증합니다. 미래 시각의 grant는 시각이 될 때 열리고, 즉시 열려면 해당 슬롯에서 ‘지금 적용’을 누르세요.</p>
  </div>;
}
