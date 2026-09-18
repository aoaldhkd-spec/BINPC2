import { useEffect, useMemo, useRef, useState } from 'react';
import { Heart, Zap } from 'lucide-react';
import { HEART_TYPES } from '../lib/constants';
import {
  formatHeartOpsClock,
  heartLabel,
  HEART_OPS_AT_RE,
  HEART_OPS_ROW_KEYS,
  heartOpsHeartRows,
  parseHeartOps,
  parseHeartOpsClock,
  patchHeartOpsSlotAt,
  resetHeartUnlocks,
  serializeHeartOps,
  type HeartOpsConfig,
  type HeartOpsSlot,
  type HeartUnlockKey,
} from '../lib/heart-ops';
import type { AppSettings } from './shared';
import { ConfirmDialog } from './ConfirmDialog';
import {
  clearLocalDirectNoticeStorage,
  DIRECT_NOTICE_SLOT_COUNT,
  DIRECT_NOTICE_TEXT_MAX,
  hasServerDirectNoticePresets,
  liveDirectNoticeText,
  loadDirectNoticePresets,
  patchDirectNotice,
  QUICK_NOTICE_EMPTY_HINT,
  readLocalDirectNoticeFallback,
  serializeDirectNotices,
  withLiveNoticeEnabled,
  type DirectNoticeItem,
} from './event-schedule-apply';

const UNLOCK_ORDER: HeartUnlockKey[] = HEART_OPS_ROW_KEYS;

function heartRowMeta(key: HeartUnlockKey): { emoji: string; label: string } {
  if (key === 'rainbow') return { emoji: '🌈', label: '무지개' };
  const hit = HEART_TYPES.find(h => h.type === key);
  return { emoji: hit?.emoji ?? '', label: hit?.label ?? key };
}

function noticesFromSettings(settings: AppSettings | null): DirectNoticeItem[] {
  const live = parseHeartOps(settings?.event_schedule).direct_notice;
  if (hasServerDirectNoticePresets(settings?.direct_notice_presets)) {
    return withLiveNoticeEnabled(loadDirectNoticePresets(settings?.direct_notice_presets), live);
  }
  return withLiveNoticeEnabled(readLocalDirectNoticeFallback(), live);
}

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
      className="w-8 h-8 text-center text-[13px] font-black tabular-nums rounded-md border border-gray-200 bg-white"
    />
  );
}

function ClockPair({
  hourLabel,
  minuteLabel,
  at,
  onApply,
}: {
  hourLabel: string;
  minuteLabel: string;
  at: string;
  onApply: (hour: number, minute: number) => boolean;
}) {
  const clock = parseHeartOpsClock(at);
  return (
    <span className="inline-flex items-center gap-0.5 shrink-0">
      <ClockPartInput
        label={hourLabel}
        value={String(clock.hour).padStart(2, '0')}
        onCommit={(digits) => onApply(Number(digits), clock.minute)}
      />
      <span className="text-[12px] font-black text-gray-400">:</span>
      <ClockPartInput
        label={minuteLabel}
        value={String(clock.minute).padStart(2, '0')}
        onCommit={(digits) => onApply(clock.hour, Number(digits))}
      />
    </span>
  );
}

export function HeartOpsCard({ settings, onSave, onSaveNotices }: {
  settings: AppSettings | null;
  onSave: (raw: string) => Promise<void>;
  onSaveNotices: (raw: string) => Promise<void>;
}) {
  const saved = useMemo(() => parseHeartOps(settings?.event_schedule), [settings?.event_schedule]);
  const [slots, setSlots] = useState<HeartOpsSlot[]>(() => heartOpsHeartRows(saved));
  const [notices, setNotices] = useState<DirectNoticeItem[]>(() => noticesFromSettings(settings));
  const [confirmResetUnlocks, setConfirmResetUnlocks] = useState(false);
  const [instantPick, setInstantPick] = useState<HeartUnlockKey[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setSlots(heartOpsHeartRows(saved));
  }, [saved]);

  const onSaveNoticesRef = useRef(onSaveNotices);
  onSaveNoticesRef.current = onSaveNotices;
  const migratedRef = useRef(false);

  useEffect(() => {
    const live = parseHeartOps(settings?.event_schedule).direct_notice;
    if (hasServerDirectNoticePresets(settings?.direct_notice_presets)) {
      setNotices(withLiveNoticeEnabled(loadDirectNoticePresets(settings?.direct_notice_presets), live));
      clearLocalDirectNoticeStorage();
      return;
    }
    if (migratedRef.current) return;
    const local = readLocalDirectNoticeFallback();
    if (!local.length) {
      setNotices(withLiveNoticeEnabled([], live));
      return;
    }
    migratedRef.current = true;
    const padded = withLiveNoticeEnabled(local, live);
    setNotices(padded);
    void onSaveNoticesRef.current(serializeDirectNotices(padded)).then(() => clearLocalDirectNoticeStorage());
  }, [settings?.direct_notice_presets]);

  const buildConfig = (patch: Partial<HeartOpsConfig>): HeartOpsConfig => ({
    timezone: 'Asia/Seoul',
    version: 2,
    slots,
    instant_unlock: saved.instant_unlock ?? [],
    direct_notice: saved.direct_notice ?? '',
    ...(saved.auto_unlock_from != null ? { auto_unlock_from: saved.auto_unlock_from } : {}),
    ...(saved.show_notice_time ? { show_notice_time: true } : {}),
    ...(saved.show_unlock_time === false ? { show_unlock_time: false } : {}),
    ...(saved.show_countdown === false ? { show_countdown: false } : {}),
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

  const saveSchedule = async () => {
    setSaving(true);
    try {
      await onSaveNotices(serializeDirectNotices(notices));
      clearLocalDirectNoticeStorage();
      await onSave(serializeHeartOps(buildConfig({
        slots,
        direct_notice: liveDirectNoticeText(notices),
      })));
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1800);
    } finally {
      setSaving(false);
    }
  };

  const resetUnlocks = () => {
    setConfirmResetUnlocks(false);
    void saveConfig(resetHeartUnlocks(buildConfig({ slots }), new Date()));
  };

  const instantUnlock = () => {
    if (!instantPick.length) return;
    const merged = [...new Set([...(saved.instant_unlock ?? []), ...instantPick])];
    void saveConfig(buildConfig({ instant_unlock: merged, slots }));
    setInstantPick([]);
  };

  const applyNoticeClock = (id: string, hour: number, minute: number) => {
    const nextAt = formatHeartOpsClock(hour, minute);
    if (!nextAt || !HEART_OPS_AT_RE.test(nextAt)) return false;
    setNotices(prev => patchDirectNotice(prev, id, { at: nextAt }));
    return true;
  };

  const rowClass = 'flex items-center gap-1.5 min-h-10 px-2 py-1 border-b border-gray-100 last:border-b-0 flex-nowrap';

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-3.5 pt-3.5 pb-2 flex items-center gap-2">
        <Heart className="w-3.5 h-3.5 text-fuchsia-500" />
        <h3 className="font-black text-gray-800 text-xs">하트 운영</h3>
      </div>

      <div className="px-3.5 pb-3.5 space-y-3">
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="border-b border-gray-200">
            <p className="px-2 pt-2 pb-1 text-[10px] font-black text-gray-600">하트 해금</p>
            {slots.map((slot, idx) => {
              const key = HEART_OPS_ROW_KEYS[idx];
              const meta = heartRowMeta(key);
              const unlockOn = slot.unlock.includes(key);
              const applyUnlock = (hour: number, minute: number) => {
                const nextAt = formatHeartOpsClock(hour, minute);
                if (!nextAt || !HEART_OPS_AT_RE.test(nextAt)) return false;
                setSlots(prev => patchHeartOpsSlotAt(prev, idx, hour, minute));
                return true;
              };
              return (
                <div key={slot.id} className={rowClass}>
                  <label className="inline-flex items-center gap-1 shrink-0 text-[10px] font-black text-gray-700">
                    <input
                      type="checkbox"
                      aria-label={`${meta.label} 해금`}
                      checked={unlockOn}
                      onChange={e => setSlots(prev => prev.map((s, i) => i === idx
                        ? { ...s, unlock: e.target.checked ? [key] : [] }
                        : s))}
                    />
                    해금
                  </label>
                  <span className="text-[10px] font-black text-gray-300">|</span>
                  <span className="text-[9px] font-black text-gray-500 shrink-0">해금시간</span>
                  <ClockPair
                    hourLabel={`${meta.label} 해금 시`}
                    minuteLabel={`${meta.label} 해금 분`}
                    at={slot.at}
                    onApply={applyUnlock}
                  />
                  <span className="text-[10px] font-black text-gray-300">|</span>
                  <span className="ml-auto text-[11px] font-black text-gray-800 shrink-0">
                    {meta.emoji} {meta.label}
                  </span>
                </div>
              );
            })}
          </div>

          <div>
            <p className="px-2 pt-2 pb-1 text-[10px] font-black text-gray-600">직접 공지</p>
            {notices.slice(0, DIRECT_NOTICE_SLOT_COUNT).map((notice, idx) => {
              const n = idx + 1;
              return (
                <div key={notice.id} className={rowClass}>
                  <input
                    type="checkbox"
                    aria-label={`공지 ${n} 표시`}
                    checked={notice.enabled === true}
                    onChange={e => setNotices(prev => patchDirectNotice(prev, notice.id, { enabled: e.target.checked }))}
                    className="shrink-0"
                  />
                  <span className="text-[10px] font-black text-gray-300">|</span>
                  <span className="text-[9px] font-black text-gray-500 shrink-0">공지시간</span>
                  <ClockPair
                    hourLabel={`공지 ${n} 시`}
                    minuteLabel={`공지 ${n} 분`}
                    at={notice.at ?? '23:00'}
                    onApply={(hour, minute) => applyNoticeClock(notice.id, hour, minute)}
                  />
                  <span className="text-[10px] font-black text-gray-300">|</span>
                  <input
                    type="text"
                    aria-label={`직접 공지 ${n}`}
                    value={notice.text}
                    onChange={e => setNotices(prev => patchDirectNotice(prev, notice.id, {
                      text: e.target.value.slice(0, DIRECT_NOTICE_TEXT_MAX),
                    }))}
                    placeholder={QUICK_NOTICE_EMPTY_HINT}
                    maxLength={DIRECT_NOTICE_TEXT_MAX}
                    className="min-w-0 flex-1 h-8 rounded-md border border-gray-200 bg-white px-2 text-[11px]"
                  />
                </div>
              );
            })}
          </div>

          <div className="flex items-stretch gap-1.5 p-2 bg-gray-50">
            <button
              type="button"
              aria-label="스케줄 저장"
              onClick={() => void saveSchedule()}
              disabled={saving}
              className="flex-[7] min-w-0 py-2 rounded-xl font-black text-xs bg-gradient-to-r from-teal-500 to-cyan-500 text-white disabled:opacity-40"
            >
              {savedFlash ? '적용됨 · 실시간 반영' : saving ? '저장 중…' : '스케줄 저장'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmResetUnlocks(true)}
              disabled={saving}
              className="flex-[3] min-w-0 py-2 rounded-xl text-[10px] font-black text-amber-800 bg-amber-50 border border-amber-200 disabled:opacity-40"
            >
              해금 초기화
            </button>
          </div>
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

      </div>

      {confirmResetUnlocks && (
        <ConfirmDialog
          title="해금 초기화"
          message={'5종 하트를 다시 미해금 상태로 돌립니다.\n시간·슬롯·unlock·공지·좋아요 기록은 그대로입니다.'}
          confirmText={undefined}
          onConfirm={resetUnlocks}
          onCancel={() => setConfirmResetUnlocks(false)}
        />
      )}
    </div>
  );
}
