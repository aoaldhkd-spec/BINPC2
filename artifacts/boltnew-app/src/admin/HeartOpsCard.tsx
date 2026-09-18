import { useEffect, useMemo, useRef, useState } from 'react';
import { Heart, Send, CheckCircle, Zap } from 'lucide-react';
import { HEART_TYPES } from '../lib/constants';
import {
  adminHeartStatusLine,
  DEFAULT_HEART_OPS,
  formatHeartOpsClock,
  heartLabel,
  HEART_OPS_AT_RE,
  HEART_OPS_ROW_KEYS,
  heartOpsHeartRows,
  parseHeartOps,
  parseHeartOpsClock,
  patchHeartOpsSlotAt,
  patchHeartOpsSlotNoticeAt,
  resetHeartUnlocks,
  serializeHeartOps,
  slotNoticeAt,
  type HeartOpsConfig,
  type HeartOpsSlot,
  type HeartUnlockKey,
} from '../lib/heart-ops';
import type { AppSettings } from './shared';
import { ConfirmDialog } from './ConfirmDialog';
import {
  clearLocalDirectNoticeStorage,
  createDirectNoticeItem,
  DIRECT_NOTICES_MAX,
  DIRECT_NOTICE_TEXT_MAX,
  hasServerDirectNoticePresets,
  loadDirectNoticePresets,
  QUICK_NOTICE_EMPTY_HINT,
  readLocalDirectNoticeFallback,
  removeDirectNotice,
  serializeDirectNotices,
  upsertDirectNotice,
  type DirectNoticeItem,
} from './event-schedule-apply';

const UNLOCK_ORDER: HeartUnlockKey[] = HEART_OPS_ROW_KEYS;

function heartRowMeta(key: HeartUnlockKey): { emoji: string; label: string } {
  if (key === 'rainbow') return { emoji: '🌈', label: '무지개' };
  const hit = HEART_TYPES.find(h => h.type === key);
  return { emoji: hit?.emoji ?? '', label: hit?.label ?? key };
}

function initialDirectNotices(settings: AppSettings | null): DirectNoticeItem[] {
  if (hasServerDirectNoticePresets(settings?.direct_notice_presets)) {
    return loadDirectNoticePresets(settings?.direct_notice_presets);
  }
  return readLocalDirectNoticeFallback();
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
      className="w-9 h-8 text-center text-[13px] font-black tabular-nums rounded-md border border-gray-200 bg-white"
    />
  );
}

export function HeartOpsCard({ settings, onSave, onSaveNotices }: {
  settings: AppSettings | null;
  onSave: (raw: string) => Promise<void>;
  onSaveNotices: (raw: string) => Promise<void>;
}) {
  const saved = useMemo(() => parseHeartOps(settings?.event_schedule), [settings?.event_schedule]);
  const [slots, setSlots] = useState<HeartOpsSlot[]>(() => heartOpsHeartRows(saved));
  const [savedNotices, setSavedNotices] = useState<DirectNoticeItem[]>(() => initialDirectNotices(settings));
  const [noticeDrafts, setNoticeDrafts] = useState<Record<string, string>>(() => (
    Object.fromEntries(initialDirectNotices(settings).map(n => [n.id, n.text]))
  ));
  const [savedFlashId, setSavedFlashId] = useState<string | null>(null);
  const [emptyHintId, setEmptyHintId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmResetUnlocks, setConfirmResetUnlocks] = useState(false);
  const [instantPick, setInstantPick] = useState<HeartUnlockKey[]>([]);
  const [clock, setClock] = useState(() => new Date());
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setSlots(heartOpsHeartRows(saved));
  }, [saved]);

  const savedNoticesRef = useRef(savedNotices);
  savedNoticesRef.current = savedNotices;
  const onSaveNoticesRef = useRef(onSaveNotices);
  onSaveNoticesRef.current = onSaveNotices;
  const migratedRef = useRef(false);
  const noticeSaveChain = useRef(Promise.resolve());

  useEffect(() => {
    if (hasServerDirectNoticePresets(settings?.direct_notice_presets)) {
      const items = loadDirectNoticePresets(settings?.direct_notice_presets);
      const prevSaved = savedNoticesRef.current;
      setSavedNotices(items);
      setNoticeDrafts(prev => {
        const next: Record<string, string> = {};
        for (const n of items) {
          const oldSaved = prevSaved.find(s => s.id === n.id)?.text;
          const draft = prev[n.id];
          const dirty = draft != null && oldSaved != null && draft !== oldSaved;
          next[n.id] = dirty ? draft : n.text;
        }
        return next;
      });
      clearLocalDirectNoticeStorage();
      return;
    }
    if (migratedRef.current) return;
    const local = readLocalDirectNoticeFallback();
    if (!local.length) return;
    migratedRef.current = true;
    setSavedNotices(local);
    setNoticeDrafts(Object.fromEntries(local.map(n => [n.id, n.text])));
    void onSaveNoticesRef.current(serializeDirectNotices(local)).then(() => clearLocalDirectNoticeStorage());
  }, [settings?.direct_notice_presets]);

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

  const persistNoticeList = (items: DirectNoticeItem[]) => {
    setSavedNotices(items);
    savedNoticesRef.current = items;
    noticeSaveChain.current = noticeSaveChain.current
      .then(() => onSaveNoticesRef.current(serializeDirectNotices(savedNoticesRef.current)))
      .then(() => clearLocalDirectNoticeStorage())
      .catch(() => undefined);
  };

  const buildConfig = (patch: Partial<HeartOpsConfig>): HeartOpsConfig => ({
    timezone: 'Asia/Seoul',
    version: 2,
    slots,
    instant_unlock: saved.instant_unlock ?? [],
    direct_notice: saved.direct_notice ?? '',
    ...(saved.auto_unlock_from != null ? { auto_unlock_from: saved.auto_unlock_from } : {}),
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

  const saveNoticeDraft = (id: string) => {
    persistNoticeList(upsertDirectNotice(savedNotices, id, noticeDrafts[id] ?? ''));
    setEmptyHintId(prev => (prev === id ? null : prev));
    setSavedFlashId(id);
    window.setTimeout(() => setSavedFlashId(prev => (prev === id ? null : prev)), 1800);
  };

  const putNoticeDraft = (id: string) => {
    const text = (noticeDrafts[id] ?? '').trim();
    if (!text) {
      setEmptyHintId(id);
      return;
    }
    setEmptyHintId(prev => (prev === id ? null : prev));
    void saveConfig(buildConfig({ direct_notice: text, slots }));
  };

  const addNotice = () => {
    if (savedNotices.length >= DIRECT_NOTICES_MAX) return;
    const item = createDirectNoticeItem('');
    persistNoticeList([...savedNotices, item]);
    setNoticeDrafts(prev => ({ ...prev, [item.id]: '' }));
    setEmptyHintId(null);
  };

  const deleteNotice = (id: string) => {
    persistNoticeList(removeDirectNotice(savedNotices, id));
    setNoticeDrafts(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setEmptyHintId(prev => (prev === id ? null : prev));
    setSavedFlashId(prev => (prev === id ? null : prev));
    setConfirmDeleteId(null);
  };

  const resetUnlocks = () => {
    setConfirmResetUnlocks(false);
    void saveConfig(resetHeartUnlocks(buildConfig({ slots }), clock));
  };

  const instantUnlock = () => {
    if (!instantPick.length) return;
    const merged = [...new Set([...(saved.instant_unlock ?? []), ...instantPick])];
    void saveConfig(buildConfig({ instant_unlock: merged, slots }));
    setInstantPick([]);
  };

  const resetDefaults = () => {
    setSlots(heartOpsHeartRows(DEFAULT_HEART_OPS));
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

        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          {slots.map((slot, idx) => {
            const key = HEART_OPS_ROW_KEYS[idx];
            const meta = heartRowMeta(key);
            const unlockOn = slot.unlock.includes(key);
            const noticeOn = slot.show_notice === true;
            const unlockClock = parseHeartOpsClock(slot.at);
            const noticeClock = parseHeartOpsClock(slotNoticeAt(slot));
            const applyUnlock = (hour: number, minute: number) => {
              const nextAt = formatHeartOpsClock(hour, minute);
              if (!nextAt || !HEART_OPS_AT_RE.test(nextAt)) return false;
              setSlots(prev => patchHeartOpsSlotAt(prev, idx, hour, minute));
              return true;
            };
            const applyNotice = (hour: number, minute: number) => {
              const nextAt = formatHeartOpsClock(hour, minute);
              if (!nextAt || !HEART_OPS_AT_RE.test(nextAt)) return false;
              setSlots(prev => patchHeartOpsSlotNoticeAt(prev, idx, hour, minute));
              return true;
            };
            return (
              <div
                key={slot.id}
                className="flex flex-wrap items-center gap-x-1.5 gap-y-1 px-2 py-1.5 border-b border-gray-100 last:border-b-0"
              >
                <span className="w-[4.5rem] shrink-0 text-[11px] font-black text-gray-800">
                  {meta.emoji} {meta.label}
                </span>
                <span className="text-[10px] font-black text-gray-400">|</span>
                <span className="text-[9px] font-black text-gray-500">공지시간</span>
                <span className="inline-flex items-center gap-0.5">
                  <ClockPartInput
                    label={`${meta.label} 공지 시`}
                    value={String(noticeClock.hour).padStart(2, '0')}
                    onCommit={(digits) => applyNotice(Number(digits), noticeClock.minute)}
                  />
                  <span className="text-[12px] font-black text-gray-400">:</span>
                  <ClockPartInput
                    label={`${meta.label} 공지 분`}
                    value={String(noticeClock.minute).padStart(2, '0')}
                    onCommit={(digits) => applyNotice(noticeClock.hour, Number(digits))}
                  />
                </span>
                <label className="inline-flex items-center gap-0.5 text-[9px] font-black text-gray-600">
                  <input
                    type="checkbox"
                    aria-label={`${meta.label} 공지`}
                    checked={noticeOn}
                    onChange={e => setSlots(prev => prev.map((s, i) => i === idx
                      ? { ...s, show_notice: e.target.checked }
                      : s))}
                  />
                  공지
                </label>
                <span className="text-[10px] font-black text-gray-400">|</span>
                <span className="text-[9px] font-black text-gray-500">해금시간</span>
                <span className="inline-flex items-center gap-0.5">
                  <ClockPartInput
                    label={`${meta.label} 해금 시`}
                    value={String(unlockClock.hour).padStart(2, '0')}
                    onCommit={(digits) => applyUnlock(Number(digits), unlockClock.minute)}
                  />
                  <span className="text-[12px] font-black text-gray-400">:</span>
                  <ClockPartInput
                    label={`${meta.label} 해금 분`}
                    value={String(unlockClock.minute).padStart(2, '0')}
                    onCommit={(digits) => applyUnlock(unlockClock.hour, Number(digits))}
                  />
                </span>
                <label className="inline-flex items-center gap-0.5 text-[9px] font-black text-gray-600">
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
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 bg-gray-50">
            <button type="button" onClick={resetDefaults} className="text-[9px] font-bold text-gray-400 underline">
              기본값(23:00·23:30·24:00·24:30)
            </button>
            <button
              type="button"
              onClick={() => setConfirmResetUnlocks(true)}
              disabled={saving}
              className="ml-auto text-[9px] font-black text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 disabled:opacity-40"
            >
              해금 초기화
            </button>
          </div>
          <div className="px-2 pb-2 bg-gray-50">
            <button
              type="button"
              onClick={() => void saveSchedule()}
              disabled={saving}
              className="w-full py-2 rounded-xl font-black text-xs bg-gradient-to-r from-teal-500 to-cyan-500 text-white disabled:opacity-40"
            >
              {savedFlash ? '적용됨 · 실시간 반영' : saving ? '저장 중…' : '스케줄 저장'}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-2 space-y-2">
          <p className="text-[10px] font-black text-amber-800">직접 공지</p>
          {savedNotices.map((notice, idx) => {
            const n = idx + 1;
            const draft = noticeDrafts[notice.id] ?? '';
            return (
              <div key={notice.id} className="space-y-1.5 rounded-lg border border-amber-100 bg-white/70 p-1.5">
                <textarea
                  aria-label={`직접 공지 ${n}`}
                  value={draft}
                  onChange={e => {
                    const text = e.target.value.slice(0, DIRECT_NOTICE_TEXT_MAX);
                    setNoticeDrafts(prev => ({ ...prev, [notice.id]: text }));
                    if (emptyHintId === notice.id) setEmptyHintId(null);
                  }}
                  placeholder="현장 공지 (저장만 하면 참여자에게 안 보여요)"
                  rows={2}
                  maxLength={DIRECT_NOTICE_TEXT_MAX}
                  className="w-full min-h-[2.25rem] rounded-lg border border-amber-200 bg-white px-2 py-1 text-[11px] resize-y"
                />
                {emptyHintId === notice.id && (
                  <p className="text-[9px] font-bold text-amber-700">{QUICK_NOTICE_EMPTY_HINT}</p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    aria-label={`공지 ${n} 저장`}
                    onClick={() => saveNoticeDraft(notice.id)}
                    className="flex-1 min-w-[4.5rem] py-1.5 rounded-lg text-[10px] font-black bg-white border border-amber-200 text-amber-800"
                  >
                    {savedFlashId === notice.id ? '저장됨' : '저장'}
                  </button>
                  <button
                    type="button"
                    aria-label={`공지 ${n} 넣기`}
                    onClick={() => putNoticeDraft(notice.id)}
                    disabled={saving}
                    className="flex-1 min-w-[4.5rem] py-1.5 rounded-lg text-[10px] font-black bg-amber-500 text-white disabled:opacity-40 flex items-center justify-center gap-1"
                  >
                    <Send className="w-3 h-3" />넣기
                  </button>
                  <button
                    type="button"
                    aria-label={`공지 ${n} 삭제`}
                    onClick={() => setConfirmDeleteId(notice.id)}
                    className="flex-1 min-w-[4.5rem] py-1.5 rounded-lg text-[10px] font-black bg-white border border-red-200 text-red-600"
                  >
                    삭제
                  </button>
                </div>
              </div>
            );
          })}
          <button
            type="button"
            onClick={addNotice}
            disabled={savedNotices.length >= DIRECT_NOTICES_MAX}
            className="w-full py-1.5 rounded-lg text-[10px] font-black bg-white border border-amber-200 text-amber-800 disabled:opacity-40"
          >
            + 공지 추가
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

      {confirmResetUnlocks && (
        <ConfirmDialog
          title="해금 초기화"
          message={'5종 하트를 다시 미해금 상태로 돌립니다.\n시간·슬롯·unlock·공지·좋아요 기록은 그대로입니다.'}
          confirmText={undefined}
          onConfirm={resetUnlocks}
          onCancel={() => setConfirmResetUnlocks(false)}
        />
      )}
      {confirmDeleteId && (
        <ConfirmDialog
          title="공지 삭제"
          message={'이 저장 공지만 삭제합니다.\n참여자에게 이미 표시된 공지는 그대로입니다.'}
          confirmText={undefined}
          onConfirm={() => deleteNotice(confirmDeleteId)}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}
