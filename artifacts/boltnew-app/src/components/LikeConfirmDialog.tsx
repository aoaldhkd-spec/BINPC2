import React, { useRef, useState } from 'react';
import { Heart } from 'lucide-react';
import type { Profile } from '../types/app';
import type { HeartType } from '../lib/constants';
import { HEART_TYPES, HEART_TYPE_META, heartMeta } from '../lib/constants';
import { rainbowPoolPickState } from '../lib/event-schedule';
import { bindMobileTap } from '../lib/mobile-tap';
import ProfileAvatar from './ProfileAvatar';

const SHORT_LABEL: Record<HeartType, string> = {
  red: HEART_TYPE_META.red.label,
  blue: HEART_TYPE_META.blue.label,
  pink: HEART_TYPE_META.pink.label,
  green: HEART_TYPE_META.green.label,
};

function HeartChip({
  emoji,
  label,
  hint,
  locked,
  selected,
  alreadySent,
  onPick,
  testId,
  extraClass,
}: {
  emoji: string;
  label: string;
  hint: string;
  locked: boolean;
  selected: boolean;
  alreadySent: boolean;
  onPick: () => void;
  testId?: string;
  extraClass?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-disabled={locked}
      aria-pressed={selected}
      {...bindMobileTap(() => { if (!locked) onPick(); })}
      className={`min-w-0 flex-1 flex flex-col items-center gap-0.5 px-0.5 py-1.5 rounded-xl border-2 transition-all ${
        locked ? 'opacity-40 cursor-not-allowed border-gray-100 bg-gray-50'
        : selected ? 'border-teal-400 bg-teal-50 ring-2 ring-teal-100'
        : extraClass ?? 'border-gray-200 bg-white'
      }`}
    >
      <span className={`text-lg leading-none transition-all ${locked || alreadySent ? 'grayscale opacity-40' : ''}`} aria-hidden="true">{emoji}</span>
      <span className={`text-[9px] font-black leading-tight ${selected ? 'text-teal-800' : 'text-gray-700'}`}>{label}</span>
      <span className="text-[8px] font-bold leading-tight text-gray-400 truncate max-w-full">{hint}</span>
    </button>
  );
}

export function LikeConfirmDialog({
  target, likedByType, sentTypesForTarget, quotas: _quotas, rainbowPool, onConfirm, onCancel,
}: {
  target: Profile;
  likedByType: Record<HeartType, number>;
  sentTypesForTarget: Set<HeartType>;
  quotas: Record<HeartType, number>;
  rainbowPool: number;
  onConfirm: (type: HeartType) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<HeartType | null>(null);
  const [rainbowPickerOpen, setRainbowPickerOpen] = useState(false);
  // iOS pointerup can fire before React re-renders after setSelected — ref stays synchronous.
  const selectedRef = useRef<HeartType | null>(null);

  const pickType = (type: HeartType, disabled: boolean) => {
    if (disabled) return;
    selectedRef.current = type;
    setSelected(type);
  };

  const totalUsed = HEART_TYPES.reduce((sum, h) => sum + (likedByType[h.type] ?? 0), 0);
  // 무지개하트 UI unlocks only via rainbow_pool grant — never via leftover per-color quotas.
  const { poolRemaining, unlocked: rainbowUnlocked } = rainbowPoolPickState({
    rainbowPool, totalUsed, alreadySentThisType: false,
  });
  const unlockedRainbowCount = rainbowUnlocked ? poolRemaining : 0;
  const allTypesSent = sentTypesForTarget.size >= 4;
  const rainbowLocked = !rainbowUnlocked || poolRemaining <= 0 || allTypesSent;

  const handleConfirm = () => {
    const type = selectedRef.current ?? selected;
    if (!type) return;
    onConfirm(type);
  };

  return (
    <div
      className="fixed inset-0 z-[10070] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      data-testid="like-confirm-dialog"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 max-h-[min(90dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem))] overflow-y-auto overscroll-contain">
        <div className="text-center mb-4">
          <div className="mx-auto mb-3">
            <ProfileAvatar profile={target} size="lg" rounded="xl" />
          </div>
          <p className="text-lg font-bold text-gray-900">{target.nickname}</p>
          <p className="text-xs text-teal-600 font-semibold mt-1">
            💡 한 사람에게도 종류별로 하트를 보낼 수 있어요
          </p>
          {sentTypesForTarget.size > 0 && (
            <p className="text-xs text-gray-400 mt-1">
              이미 보낸 하트: {[...sentTypesForTarget].map(t => heartMeta(t).emoji).join(' ')}
              {sentTypesForTarget.size < 4 && (
                <span className="ml-1 text-teal-700 font-bold">· {4 - sentTypesForTarget.size}종류 더 보낼 수 있어요</span>
              )}
            </p>
          )}
        </div>

        <div className="mb-4" data-testid="like-heart-row">
          <p className="mb-2 text-center text-[11px] font-black text-gray-500">보낼 하트를 골라 주세요</p>
          <div className="flex items-stretch gap-1">
            {HEART_TYPES.map(h => {
              // Spendable only after rainbow_pool grant; any of the 4 colors consumes one pool slot.
              const alreadySentToThisPerson = sentTypesForTarget.has(h.type);
              const pick = rainbowPoolPickState({
                rainbowPool, totalUsed, alreadySentThisType: alreadySentToThisPerson,
              });
              const disabled = pick.disabled;
              return (
                <HeartChip
                  key={h.type}
                  emoji={h.emoji}
                  label={SHORT_LABEL[h.type]}
                  hint={alreadySentToThisPerson ? '보냄' : pick.unlocked ? h.desc : '잠금'}
                  locked={disabled}
                  selected={selected === h.type && !rainbowPickerOpen}
                  alreadySent={alreadySentToThisPerson}
                  onPick={() => pickType(h.type, disabled)}
                  testId={`like-heart-${h.type}`}
                />
              );
            })}
            <HeartChip
              emoji="🌈"
              label="무지개"
              hint={rainbowLocked ? (allTypesSent ? '완료' : '잠금') : `${unlockedRainbowCount}개`}
              locked={rainbowLocked}
              selected={rainbowPickerOpen}
              alreadySent={false}
              onPick={() => setRainbowPickerOpen(true)}
              testId="like-rainbow-btn"
              extraClass="border-fuchsia-200 bg-gradient-to-b from-fuchsia-50 to-amber-50"
            />
          </div>
          <p className="mt-1.5 text-center text-[10px] font-bold text-gray-400" aria-label={`무지개하트 ${unlockedRainbowCount}개 선택 가능`}>
            {rainbowUnlocked
              ? `무지개하트 ${unlockedRainbowCount}개 · 아무 색이나 쓸 수 있어요`
              : '무지개하트는 관리자 해금 후 사용할 수 있어요'}
          </p>
        </div>

        <div className="mb-3 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
          <span className="text-sm flex-shrink-0">⚠️</span>
          <p className="text-xs text-amber-700 font-semibold leading-relaxed">칭찬 하트는 상대방에게 칭찬만 전달됩니다. <span className="underline">연락처가 공유되지 않습니다.</span></p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            {...bindMobileTap(onCancel)}
            className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-all"
          >
            취소
          </button>
          <button
            type="button"
            aria-disabled={!selected}
            {...bindMobileTap(handleConfirm)}
            className={`flex-1 py-3 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              selected ? `${heartMeta(selected).solidBg} ${heartMeta(selected).solidHover}` : 'bg-gray-300 opacity-40 cursor-not-allowed'
            }`}
          >
            <Heart className={`w-4 h-4 ${selected ? 'fill-current' : ''}`} />
            보내기
          </button>
        </div>
      </div>

      {rainbowPickerOpen && (
        <div
          className="absolute inset-0 z-[1] flex items-center justify-center bg-black/50 p-4"
          data-testid="rainbow-color-dialog"
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
            <p className="text-center text-base font-black text-gray-900">어떤 거 보내실래요?</p>
            <p className="mt-1 text-center text-[11px] font-bold text-fuchsia-700">
              🌈 무지개하트 {unlockedRainbowCount}개 · 색을 고르면 pool에서 1개 사용
            </p>
            <div className="mt-4 space-y-2">
              {HEART_TYPES.map(h => {
                const alreadySentToThisPerson = sentTypesForTarget.has(h.type);
                const pick = rainbowPoolPickState({
                  rainbowPool, totalUsed, alreadySentThisType: alreadySentToThisPerson,
                });
                const disabled = pick.disabled;
                const isSel = selected === h.type;
                return (
                  <button
                    key={h.type}
                    type="button"
                    aria-disabled={disabled}
                    {...bindMobileTap(() => pickType(h.type, disabled))}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                      disabled ? 'opacity-40 cursor-not-allowed border-gray-100 bg-gray-50'
                      : isSel ? `${h.bg} ${h.border} ring-2 ${h.ring}`
                      : `border-gray-200 hover:${h.border} hover:${h.bg}`
                    }`}
                  >
                    <span className={`text-2xl transition-all ${pick.poolRemaining > 0 ? '' : 'grayscale opacity-35'}`}>{h.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold ${isSel ? h.text : 'text-gray-800'}`}>{h.label}</p>
                      <p className="text-xs text-gray-400">
                        {alreadySentToThisPerson ? '이미 보낸 하트' : pick.unlocked ? `무지개하트 ${pick.poolRemaining}개 중 선택` : '관리자 해금 후 사용할 수 있어요'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                {...bindMobileTap(() => setRainbowPickerOpen(false))}
                className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl"
              >
                뒤로
              </button>
              <button
                type="button"
                aria-disabled={!selected}
                {...bindMobileTap(handleConfirm)}
                className={`flex-1 py-3 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                  selected ? `${heartMeta(selected).solidBg} ${heartMeta(selected).solidHover}` : 'bg-gray-300 opacity-40 cursor-not-allowed'
                }`}
              >
                <Heart className={`w-4 h-4 ${selected ? 'fill-current' : ''}`} />
                보내기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
