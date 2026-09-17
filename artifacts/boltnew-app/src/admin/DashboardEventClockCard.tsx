import { useEffect, useMemo, useState } from 'react';
import { BellRing, Clock, Heart, Send, CheckCircle } from 'lucide-react';
import type { HeartType } from '../lib/constants';
import {
  currentEventSlot, eventHeartQuotas, eventRainbowQuota, parseEventSchedule,
} from '../lib/event-schedule';
import type { AppSettings } from './shared';
import {
  EMPTY_EVENT_SLOT,
  QUICK_NOTICE_STORAGE_KEY,
  TIME_ONLY_APPLY_HINT,
  applyRainbowPoolOverwrite,
  applySavedFieldPatch,
  draftToApplyPick,
  loadQuickNotices,
  parseColorGrantsDraft,
  parseHeartGrantAmount,
  selectedApplyCount,
  selectedSlotApplyPatch,
  seoulNowHHMM,
  shouldWarnTimeOnlyApply,
  type QuickNoticePreset,
  type ScheduleSaveExtras,
} from './event-schedule-apply';

const COLOR_GRANT_FIELDS: { type: HeartType; emoji: string; label: string }[] = [
  { type: 'red', emoji: '❤️', label: '빨강' },
  { type: 'pink', emoji: '💗', label: '핑크' },
  { type: 'blue', emoji: '🧡', label: '주황' },
  { type: 'green', emoji: '💚', label: '초록' },
];

const EMPTY_COLORS: Record<HeartType, string> = { red: '', blue: '', pink: '', green: '' };

export function DashboardEventClockCard({ settings, onSave }: {
  settings: AppSettings | null;
  onSave: (raw: string, extras?: ScheduleSaveExtras) => Promise<void>;
}) {
  const parsed = useMemo(() => parseEventSchedule(settings?.event_schedule), [settings?.event_schedule]);
  const [clock, setClock] = useState(() => new Date());
  const [notice, setNotice] = useState('');
  const [at, setAt] = useState('');
  const [rainbowAmount, setRainbowAmount] = useState('');
  const [rainbowMode, setRainbowMode] = useState<'set' | 'add'>('set');
  const [colorGrants, setColorGrants] = useState<Record<HeartType, string>>(EMPTY_COLORS);
  const [quickNotices, setQuickNotices] = useState<QuickNoticePreset[]>(() => {
    try { return loadQuickNotices(localStorage.getItem(QUICK_NOTICE_STORAGE_KEY)); }
    catch { return loadQuickNotices(null); }
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const persistQuick = (next: QuickNoticePreset[]) => {
    setQuickNotices(next);
    try { localStorage.setItem(QUICK_NOTICE_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const nowHHMM = seoulNowHHMM(clock);
  const savedSlots = parsed.slots.length ? parsed.slots : [EMPTY_EVENT_SLOT];
  const scheduleObj = useMemo(() => ({ timezone: 'Asia/Seoul' as const, slots: savedSlots }), [savedSlots]);
  const active = useMemo(() => currentEventSlot(scheduleObj, clock), [scheduleObj, clock]);
  const cumulative = useMemo(() => eventHeartQuotas(scheduleObj, clock), [scheduleObj, clock]);
  const cumulativeRainbow = useMemo(() => eventRainbowQuota(scheduleObj, clock), [scheduleObj, clock]);
  const unlocked = active ? active.functions_locked !== true : !(settings?.functions_locked ?? false);
  const target = active ?? savedSlots[0];
  const liveNotice = (active?.notice ?? '').trim();
  const pick = draftToApplyPick({ at, notice, rainbowAmount, colorGrants });
  const pickCount = selectedApplyCount(pick);

  const apply = async () => {
    if (pickCount === 0 || !target) return;
    let effectivePick = pick;
    let effectiveAt = at.trim();
    // Empty/future-only schedule: hearts must attach to a live Seoul clock slot.
    if (pick.hearts && !pick.time && !active) {
      effectivePick = { ...pick, time: true };
      effectiveAt = seoulNowHHMM();
    }
    if (shouldWarnTimeOnlyApply(effectivePick) && !window.confirm(`${TIME_ONLY_APPLY_HINT}. 시간만 적용할까요?`)) return;
    const colors = parseColorGrantsDraft(colorGrants);
    const rainbowN = parseHeartGrantAmount(rainbowAmount);
    const patch = selectedSlotApplyPatch(effectivePick, {
      at: effectiveAt || seoulNowHHMM(),
      notice: notice.trim(),
      currentPool: target.rainbow_pool,
      addHearts: rainbowN,
      heartsMode: rainbowMode,
      colorGrants: colors,
      currentColorGrants: target.heart_grants,
    });
    let next = applySavedFieldPatch(savedSlots, savedSlots, target.id, patch);
    // Primary SET: leftover rainbow_pool 4 on other slots must not keep 남음 stuck.
    if (effectivePick.hearts && rainbowMode === 'set' && rainbowN > 0) {
      next = applyRainbowPoolOverwrite(next, target.id, rainbowN);
    }
    setSaving(true);
    try {
      await onSave(JSON.stringify({ timezone: 'Asia/Seoul', slots: next }), effectivePick.hearts ? { functions_locked: false } : undefined);
      if (effectivePick.notice) setNotice('');
      if (pick.time) setAt('');
      if (effectivePick.hearts) {
        setRainbowAmount('');
        setColorGrants(EMPTY_COLORS);
      }
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } finally {
      setSaving(false);
    }
  };

  const applyLabel = pickCount === 0
    ? '설정한 항목 적용'
    : pickCount === 1 && pick.notice ? '공지 적용'
    : pickCount === 1 && pick.time ? '시간 적용'
    : pickCount === 1 && pick.hearts ? '하트 적용'
    : `${['공지', '시간', '하트'].filter((_, i) => [pick.notice, pick.time, pick.hearts][i]).join('·')} 적용`;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-3.5 pt-3.5 pb-0 flex items-center gap-2 mb-3">
        <Clock className="w-3.5 h-3.5 text-teal-500" />
        <h3 className="font-black text-gray-800 text-xs">행사 적용</h3>
        <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${unlocked ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
          {unlocked ? '💖 열림' : '🔒 잠김'}
        </span>
        <span className="ml-auto text-[10px] font-bold tabular-nums text-gray-400">Seoul {nowHHMM}</span>
      </div>

      <div className="px-3.5 pb-3.5 space-y-3">
        <div className={`rounded-xl border px-2.5 py-2 ${unlocked ? 'border-emerald-200 bg-emerald-50/70' : 'border-amber-200 bg-amber-50/70'}`}>
          <p className="text-[10px] font-black text-gray-500">라이브 · 설정한 칸만 나가고 빈 칸은 덮지 않아요</p>
          <p className="mt-0.5 text-[11px] font-bold text-gray-800 leading-snug line-clamp-2">{liveNotice || '라이브 공지 없음'}</p>
          <p className="mt-1 text-[10px] font-bold text-gray-500">
            {active ? `활성 ${active.at}` : '활성 슬롯 없음'}
            {' · '}🌈 {cumulativeRainbow} · ❤️ {cumulative.red} · 💗 {cumulative.pink} · 🧡 {cumulative.blue} · 💚 {cumulative.green}
          </p>
        </div>

        <div>
          <label className="flex items-center gap-1 text-[10px] font-black text-gray-500 mb-1">
            <BellRing className="w-3 h-3 text-teal-500" />공지
          </label>
          <textarea
            value={notice}
            onChange={e => setNotice(e.target.value)}
            placeholder="참여자에게 보여줄 공지 (비우면 기존 공지 유지)"
            rows={2}
            maxLength={240}
            aria-label="행사 공지"
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
          />
          <p className="mt-1.5 mb-1 text-[10px] font-semibold text-gray-500">빠른 공지 · 문구를 고친 뒤 넣기</p>
          <div className="space-y-1.5">
            {quickNotices.map((preset) => (
              <div key={preset.id} className="flex items-center gap-1.5">
                <span className="w-16 shrink-0 text-[9px] font-black text-cyan-700 leading-tight">{preset.label}</span>
                <input
                  aria-label={`${preset.label} 빠른 공지 편집`}
                  value={preset.text}
                  onChange={e => persistQuick(quickNotices.map(p => p.id === preset.id ? { ...p, text: e.target.value.slice(0, 240) } : p))}
                  className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-[10px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                />
                <button
                  type="button"
                  onClick={() => setNotice(preset.text)}
                  className="shrink-0 rounded-lg border border-cyan-200 bg-cyan-50 px-2 py-1 text-[10px] font-black text-cyan-700 active:scale-95"
                >
                  넣기
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="flex items-center gap-1 text-[10px] font-black text-gray-500 mb-1">
            <Clock className="w-3 h-3 text-amber-500" />시간
          </label>
          <div className="flex items-center gap-1.5">
            <input
              aria-label="행사 시각"
              type="time"
              value={at}
              onChange={e => setAt(e.target.value)}
              className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm font-black"
            />
            <button
              type="button"
              onClick={() => setAt(seoulNowHHMM())}
              className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10px] font-black text-amber-800 active:scale-95"
            >
              지금
            </button>
            <span className="text-[10px] font-bold text-gray-400">비우면 기존 시각 유지</span>
          </div>
        </div>

        <div>
          <label className="flex items-center gap-1 text-[10px] font-black text-gray-500 mb-1">
            <Heart className="w-3 h-3 text-fuchsia-500" />하트개수
          </label>
          <div className="rounded-xl border border-fuchsia-100 bg-fuchsia-50/50 p-2 space-y-2">
            <label className="flex items-center gap-1.5 text-[11px] font-black text-fuchsia-800">
              🌈 무지개
              <input
                aria-label="무지개하트 해금 수"
                type="number"
                min="1"
                max="100"
                placeholder="N"
                value={rainbowAmount}
                onChange={e => setRainbowAmount(e.target.value)}
                className="w-12 rounded border border-fuchsia-200 bg-white px-1 py-1 text-center"
              />
              개
              <span className="ml-auto text-[10px] font-bold text-fuchsia-700">지금 {cumulativeRainbow}</span>
            </label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                data-testid="rainbow-mode-set"
                onClick={() => setRainbowMode('set')}
                className={`rounded-lg px-2 py-1 text-[10px] font-black active:scale-95 ${
                  rainbowMode === 'set'
                    ? 'bg-fuchsia-600 text-white'
                    : 'border border-fuchsia-200 bg-white text-fuchsia-700'
                }`}
              >
                설정 (덮어쓰기)
              </button>
              <button
                type="button"
                data-testid="rainbow-mode-add"
                onClick={() => setRainbowMode('add')}
                className={`rounded-lg px-2 py-1 text-[10px] font-black active:scale-95 ${
                  rainbowMode === 'add'
                    ? 'bg-fuchsia-600 text-white'
                    : 'border border-fuchsia-200 bg-white text-fuchsia-700'
                }`}
              >
                추가 +N
              </button>
            </div>
            <div className="grid grid-cols-2 min-[390px]:grid-cols-4 gap-1.5">
              {COLOR_GRANT_FIELDS.map(h => (
                <label key={h.type} className="flex items-center gap-1 rounded-lg bg-white/80 px-1.5 py-1 text-[10px] font-bold text-gray-600">
                  <span>{h.emoji}</span>
                  <span className="truncate">{h.label}</span>
                  <input
                    aria-label={`${h.label}하트 지급`}
                    type="number"
                    min="0"
                    max="20"
                    placeholder="—"
                    value={colorGrants[h.type]}
                    onChange={e => setColorGrants(prev => ({ ...prev, [h.type]: e.target.value }))}
                    className="ml-auto w-9 rounded border border-gray-200 bg-white px-1 py-0.5 text-center"
                  />
                </label>
              ))}
            </div>
            <p className="text-[9px] font-bold text-gray-400">빈 칸은 기존 지급량을 지우지 않아요 · 무지개는 기본 설정(덮어쓰기) · 색 하트와 섞지 않아요</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void apply()}
          disabled={saving || pickCount === 0}
          className="w-full py-2.5 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-40 shadow-md bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-white shadow-teal-500/20"
        >
          {saved
            ? <><CheckCircle className="w-3.5 h-3.5" />적용됨 · 실시간 반영</>
            : saving ? '적용 중...'
            : <><Send className="w-3.5 h-3.5" />{applyLabel}</>}
        </button>
      </div>
    </div>
  );
}
