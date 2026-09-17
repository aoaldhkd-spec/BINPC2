import React, { useRef, useState } from 'react';
import { Heart } from 'lucide-react';
import type { Profile } from '../types/app';
import type { HeartType } from '../lib/constants';
import { HEART_TYPES, heartMeta } from '../lib/constants';
import { rainbowPoolPickState } from '../lib/event-schedule';
import { bindMobileTap } from '../lib/mobile-tap';
import ProfileAvatar from './ProfileAvatar';

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
  const rainbowLocked = !rainbowUnlocked || poolRemaining <= 0 || sentTypesForTarget.size >= HEART_TYPES.length;
  const rainbowIcons = Math.min(12, Math.max(unlockedRainbowCount, 1));

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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 max-h-[min(90dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem))] overflow-y-auto overscroll-contain">
        <div className="text-center mb-5">
          <div className="mx-auto mb-3">
            <ProfileAvatar profile={target} size="lg" rounded="xl" />
          </div>
          <p className="text-lg font-bold text-gray-900">{target.nickname}</p>
          <p className="text-xs text-teal-600 font-semibold mt-1">
            💡 한 사람에게도 종류별로 하트를 보낼 수 있어요
          </p>
          <div className="mt-2 flex items-center justify-center gap-1.5" aria-label={`무지개하트 ${unlockedRainbowCount}개 선택 가능`}>
            <span className="text-[10px] font-bold text-gray-400">무지개하트</span>
            {Array.from({ length: rainbowIcons }, (_, i) => (
              <span key={i} className={`text-lg leading-none transition-all ${i < unlockedRainbowCount ? '' : 'grayscale opacity-30'}`} aria-hidden="true">🌈</span>
            ))}
            <span className="text-[10px] font-black text-gray-500" data-testid="like-rainbow-remaining">{unlockedRainbowCount}개</span>
          </div>
          {sentTypesForTarget.size > 0 && (
            <p className="text-xs text-gray-400 mt-1">
              이미 보낸 하트: {[...sentTypesForTarget].map(t => heartMeta(t).emoji).join(' ')}
              {sentTypesForTarget.size < HEART_TYPES.length && (
                <span className="ml-1 text-teal-700 font-bold">· {HEART_TYPES.length - sentTypesForTarget.size}종류 더 보낼 수 있어요</span>
              )}
            </p>
          )}
        </div>

        <div className="space-y-2 mb-5">
          {HEART_TYPES.map(h => {
            // Spendable only after rainbow_pool grant; any of the 4 colors consumes one pool slot.
            const alreadySentToThisPerson = sentTypesForTarget.has(h.type);
            const pick = rainbowPoolPickState({
              rainbowPool, totalUsed, alreadySentThisType: alreadySentToThisPerson,
            });
            const remaining = pick.poolRemaining;
            const disabled = pick.disabled;
            const isSel = selected === h.type && !rainbowPickerOpen;
            return (
              <button
                key={h.type}
                type="button"
                data-testid={`like-heart-${h.type}`}
                disabled={disabled}
                {...bindMobileTap(() => pickType(h.type, disabled))}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                  disabled ? 'opacity-40 cursor-not-allowed border-gray-100 bg-gray-50'
                  : isSel ? `${h.bg} ${h.border} ring-2 ${h.ring}`
                  : `border-gray-200 hover:${h.border} hover:${h.bg}`
                }`}
              >
                <span className={`text-2xl transition-all ${remaining > 0 ? '' : 'grayscale opacity-35'}`}>{h.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold ${isSel ? h.text : 'text-gray-800'}`}>{h.label}</p>
                  <p className="text-xs text-gray-400">
                    {alreadySentToThisPerson ? '이미 보낸 하트' : pick.unlocked ? `무지개하트 ${remaining}개 중 선택` : '관리자 해금 후 사용할 수 있어요'}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {alreadySentToThisPerson ? (
                    <span className="text-[10px] text-gray-400 font-bold">전송됨</span>
                  ) : (
                    <span className={`text-[10px] font-black tabular-nums ${pick.unlocked ? h.text : 'text-gray-300'}`} data-testid={`like-heart-${h.type}-remaining`}>
                      {pick.unlocked ? `${remaining}개` : '0개'}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
          <button
            type="button"
            data-testid="like-rainbow-btn"
            aria-disabled={rainbowLocked}
            aria-label={`무지개하트 ${unlockedRainbowCount}개`}
            {...bindMobileTap(() => { if (!rainbowLocked) setRainbowPickerOpen(true); })}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
              rainbowLocked ? 'opacity-40 cursor-not-allowed border-gray-100 bg-gray-50'
              : rainbowPickerOpen ? 'border-fuchsia-400 bg-fuchsia-50 ring-2 ring-fuchsia-100'
              : 'border-fuchsia-200 bg-gradient-to-b from-fuchsia-50 to-amber-50'
            }`}
          >
            <span className={`text-2xl leading-none transition-all ${rainbowLocked ? 'grayscale opacity-35' : ''}`}>🌈</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-fuchsia-800">무지개하트</p>
              <p className="text-xs text-gray-400">
                {rainbowLocked
                  ? (rainbowUnlocked ? '남은 무지개하트가 없어요' : '관리자 해금 후 사용할 수 있어요')
                  : `해금 ${rainbowPool}개 · 남음 ${unlockedRainbowCount}개 · 아무 색이나`}
              </p>
            </div>
            <span className="text-[10px] font-black text-fuchsia-700 flex-shrink-0">{rainbowLocked ? '🔒잠금' : `${unlockedRainbowCount}개`}</span>
          </button>
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <p className="text-center text-lg font-bold text-gray-900">어떤 거 보내실래요?</p>
            <p className="mt-1 text-center text-xs text-fuchsia-700 font-semibold">🌈 무지개하트 {unlockedRainbowCount}개 · 아무 색이나 pool에서 사용</p>
            <div className="space-y-2 mt-5 mb-5">
              {HEART_TYPES.map(h => {
                const alreadySentToThisPerson = sentTypesForTarget.has(h.type);
                const pick = rainbowPoolPickState({
                  rainbowPool, totalUsed, alreadySentThisType: alreadySentToThisPerson,
                });
                const remaining = pick.poolRemaining;
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
                    <span className={`text-2xl transition-all ${remaining > 0 ? '' : 'grayscale opacity-35'}`}>{h.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold ${isSel ? h.text : 'text-gray-800'}`}>{h.label}</p>
                      <p className="text-xs text-gray-400">
                        {alreadySentToThisPerson ? '이미 보낸 하트' : pick.unlocked ? `무지개하트 ${remaining}개 중 선택` : '관리자 해금 후 사용할 수 있어요'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                    {alreadySentToThisPerson ? (
                      <span className="text-[10px] text-gray-400 font-bold">전송됨</span>
                    ) : (
                      <span className={`text-[10px] font-black tabular-nums ${pick.unlocked ? h.text : 'text-gray-300'}`}>
                        {pick.unlocked ? `${remaining}개` : '0개'}
                      </span>
                    )}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                {...bindMobileTap(() => setRainbowPickerOpen(false))}
                className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-all"
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
