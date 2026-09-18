import { useEffect, useMemo, useState } from 'react';
import { Heart, Send, CheckCircle, Zap } from 'lucide-react';
import { HEART_TYPES } from '../lib/constants';
import {
  adminHeartStatusLine,
  DEFAULT_HEART_OPS,
  formatHeartOpsClock,
  formatHeartOpsTime,
  heartLabel,
  HEART_OPS_AT_RE,
  parseHeartOps,
  parseHeartOpsClock,
  patchHeartOpsSlotAt,
  serializeHeartOps,
  type HeartOpsConfig,
  type HeartOpsSlot,
  type HeartUnlockKey,
} from '../lib/heart-ops';
import type { AppSettings } from './shared';
import { loadQuickNotices, QUICK_NOTICE_STORAGE_KEY, type QuickNoticePreset } from './event-schedule-apply';

const UNLOCK_ORDER: HeartUnlockKey[] = ['red', 'blue', 'pink', 'green', 'rainbow'];

function toggleUnlock(list: HeartUnlockKey[], key: HeartUnlockKey): HeartUnlockKey[] {
  return list.includes(key) ? list.filter(k => k !== key) : [...list, key];
}

function digitsOnly(raw: string, max = 2): string {
  return raw.replace(/\D/g, '').slice(0, max);
}

function ClockPartInput({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (digits: string) => boolean;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const tryCommit = (raw: string) => {
    const digits = digitsOnly(raw);
    if (!digits) {
      setDraft(value);
      return;
    }
    if (onCommit(digits)) return;
    setDraft(value);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={2}
      aria-label={label}
      value={draft}
      onChange={(e) => {
        const digits = digitsOnly(e.target.value);
        setDraft(digits);
        if (digits.length === 2) tryCommit(digits);
      }}
      onBlur={() => tryCommit(draft)}
      className="w-9 h-8 text-center text-[13px] font-black tabular-nums rounded-md border border-gray-200 bg-white"
    />
  );
}

export function HeartOpsCard({ settings, onSave }: {
  settings: AppSettings | null;
  onSave: (raw: string) => Promise<void>;
}) {
  const saved = useMemo(() => parseHeartOps(settings?.event_schedule), [settings?.event_schedule]);
  const [slots, setSlots] = useState<HeartOpsSlot[]>(() => saved.slots.map(s => ({ ...s, unlock: [...s.unlock] })));
  const [directNotice, setDirectNotice] = useState('');
  const [instantPick, setInstantPick] = useState<HeartUnlockKey[]>([]);
  const [clock, setClock] = useState(() => new Date());
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [quickNotices, setQuickNotices] = useState<QuickNoticePreset[]>(() => {
    try { return loadQuickNotices(localStorage.getItem(QUICK_NOTICE_STORAGE_KEY)); }
    catch { return loadQuickNotices(null); }
  });

  useEffect(() => {
    setSlots(saved.slots.map(s => ({ ...s, unlock: [...s.unlock] })));
  }, [saved]);

  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const liveConfig: HeartOpsConfig = useMemo(() => ({
    ...saved,
    slots: saved.slots,
    direct_notice: saved.direct_notice,
  }), [saved]);

  const status = useMemo(() => adminHeartStatusLine(liveConfig, clock), [liveConfig, clock]);

  const persistQuick = (next: QuickNoticePreset[]) => {
    setQuickNotices(next);
    try { localStorage.setItem(QUICK_NOTICE_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const buildConfig = (patch: Partial<HeartOpsConfig>): HeartOpsConfig => ({
    timezone: 'Asia/Seoul',
    version: 2,
    slots,
    instant_unlock: saved.instant_unlock ?? [],
    direct_notice: saved.direct_notice ?? '',
    ...patch,
  });

  const saveConfig = async (config: HeartOpsConfig) => {
    setSaving(true);
    try {
      await onSave(serializeHeartOps(config));
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1800);
    } finally {
      setSaving(false);
    }
  };

  const saveSchedule = () => void saveConfig(buildConfig({ slots }));

  const sendDirectNotice = () => {
    const text = directNotice.trim();
    if (!text) return;
    void saveConfig(buildConfig({ direct_notice: text, slots }));
    setDirectNotice('');
  };

  const instantUnlock = () => {
    if (!instantPick.length) return;
    const merged = [...new Set([...(saved.instant_unlock ?? []), ...instantPick])];
    void saveConfig(buildConfig({ instant_unlock: merged, slots }));
    setInstantPick([]);
  };

  const resetDefaults = () => {
    setSlots(DEFAULT_HEART_OPS.slots.map(s => ({ ...s, unlock: [...s.unlock] })));
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-3.5 pt-3.5 pb-2 flex items-center gap-2">
        <Heart className="w-3.5 h-3.5 text-fuchsia-500" />
        <h3 className="font-black text-gray-800 text-xs">하트 운영</h3>
      </div>

      <div className="px-3.5 pb-3.5 space-y-3">
        <div className="rounded-xl border border-gray-100 bg-gray-50/80 px-2.5 py-2">
          <p className="text-[10px] font-black text-gray-500 mb-1.5">현재 하트 상태</p>
          <div className="flex flex-wrap gap-1.5">
            {status.map(({ key, locked }) => (
              <span
                key={key}
                className={`rounded-lg px-2 py-1 text-[10px] font-black ${
                  locked ? 'bg-gray-200 text-gray-500' : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {heartLabel(key)} {locked ? '🔒' : '🔓'}
              </span>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[10px] font-black text-gray-500 mb-1.5">시간별 자동 해금</p>
          <p className="text-[9px] text-gray-400 mb-1.5">시·분 숫자 입력 · 24:00·24:30 가능</p>
          <div className="space-y-1.5">
            {slots.map((slot, idx) => (
              <div key={slot.id} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-gray-100 bg-white px-2 py-1.5">
                {(() => {
                  const clock = parseHeartOpsClock(slot.at);
                  const applyClock = (hour: number, minute: number) => {
                    const nextAt = formatHeartOpsClock(hour, minute);
                    if (!nextAt || !HEART_OPS_AT_RE.test(nextAt)) return false;
                    setSlots(prev => patchHeartOpsSlotAt(prev, idx, hour, minute));
                    return true;
                  };
                  return (
                    <span className="inline-flex items-center gap-1">
                      <ClockPartInput
                        label={`해금 시 ${idx + 1}`}
                        value={String(clock.hour).padStart(2, '0')}
                        onCommit={(digits) => applyClock(Number(digits), clock.minute)}
                      />
                      <span className="text-[12px] font-black text-gray-400">:</span>
                      <ClockPartInput
                        label={`해금 분 ${idx + 1}`}
                        value={String(clock.minute).padStart(2, '0')}
                        onCommit={(digits) => applyClock(clock.hour, Number(digits))}
                      />
                    </span>
                  );
                })()}
                <span className="text-[9px] text-gray-400 tabular-nums">{formatHeartOpsTime(slot.at)}</span>
                <div className="flex flex-wrap gap-1 min-w-0 flex-1">
                  {UNLOCK_ORDER.map(key => {
                    const on = slot.unlock.includes(key);
                    const label = key === 'rainbow' ? '🌈' : HEART_TYPES.find(h => h.type === key)?.label ?? key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSlots(prev => prev.map((s, i) => i === idx
                          ? { ...s, unlock: toggleUnlock(s.unlock, key) }
                          : s))}
                        className={`rounded px-1.5 py-0.5 text-[9px] font-black ${
                          on ? 'bg-fuchsia-600 text-white' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-1.5">
            <button type="button" onClick={resetDefaults} className="text-[9px] font-bold text-gray-400 underline">
              기본값(23:00·23:30·24:00·24:30)
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void saveSchedule()}
          disabled={saving}
          className="w-full py-2 rounded-xl font-black text-xs bg-gradient-to-r from-teal-500 to-cyan-500 text-white disabled:opacity-40"
        >
          {savedFlash ? '적용됨 · 실시간 반영' : saving ? '저장 중…' : '스케줄 저장'}
        </button>

        <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-2 space-y-1.5">
          <p className="text-[10px] font-black text-amber-800">직접 공지</p>
          <textarea
            value={directNotice}
            onChange={e => setDirectNotice(e.target.value)}
            placeholder="현장 공지 (하트 자동 공지와 함께 표시)"
            rows={2}
            maxLength={240}
            className="w-full rounded-lg border border-amber-200 bg-white px-2 py-1 text-[11px] resize-none"
          />
          <p className="text-[9px] font-semibold text-gray-500">빠른 공지 · 수정 후 넣기</p>
          {quickNotices.map(preset => (
            <div key={preset.id} className="flex items-center gap-1">
              <input
                value={preset.text}
                onChange={e => persistQuick(quickNotices.map(p => p.id === preset.id
                  ? { ...p, text: e.target.value.slice(0, 240) }
                  : p))}
                className="flex-1 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px]"
              />
              <button type="button" onClick={() => setDirectNotice(preset.text)} className="text-[9px] font-black text-cyan-700 px-1.5">
                넣기
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={sendDirectNotice}
            disabled={saving || !directNotice.trim()}
            className="w-full py-1.5 rounded-lg text-[10px] font-black bg-amber-500 text-white disabled:opacity-40 flex items-center justify-center gap-1"
          >
            <Send className="w-3 h-3" />공지 전송
          </button>
        </div>

        <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-2 space-y-1.5">
          <p className="text-[10px] font-black text-violet-800 flex items-center gap-1">
            <Zap className="w-3 h-3" />지금 해금
          </p>
          <div className="flex flex-wrap gap-1">
            {UNLOCK_ORDER.map(key => {
              const on = instantPick.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setInstantPick(prev => toggleUnlock(prev, key))}
                  className={`rounded px-2 py-1 text-[9px] font-black ${
                    on ? 'bg-violet-600 text-white' : 'bg-white text-gray-600 border border-violet-200'
                  }`}
                >
                  {heartLabel(key)}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={instantUnlock}
            disabled={saving || !instantPick.length}
            className="w-full py-1.5 rounded-lg text-[10px] font-black bg-violet-600 text-white disabled:opacity-40"
          >
            선택한 하트 지금 해금
          </button>
        </div>

        {savedFlash && (
          <p className="text-[10px] font-bold text-emerald-600 flex items-center gap-1 justify-center">
            <CheckCircle className="w-3.5 h-3.5" />실시간 반영됨
          </p>
        )}
      </div>
    </div>
  );
}
