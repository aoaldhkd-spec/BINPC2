import React, { useRef, useState } from 'react';
import { Heart } from 'lucide-react';
import type { Profile } from '../types/app';
import type { HeartType } from '../lib/constants';
import { HEART_TYPES, heartMeta } from '../lib/constants';
import {
  grantRemaining,
  parseHeartOps,
  rainbowRemaining,
  type HeartOpsConfig,
  type HeartUsage,
  unlockedHeartKeys,
} from '../lib/heart-ops';
import { bindMobileTap } from '../lib/mobile-tap';
import ProfileAvatar from './ProfileAvatar';

export function LikeConfirmDialog({
  target,
  sentTypesForTarget,
  heartOps,
  heartUsage,
  onConfirm,
  onCancel,
}: {
  target: Profile;
  sentTypesForTarget: Set<HeartType>;
  heartOps: HeartOpsConfig;
  heartUsage: HeartUsage;
  onConfirm: (type: HeartType, source?: 'rainbow') => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<HeartType | null>(null);
  const [rainbowOpen, setRainbowOpen] = useState(false);
  const selectedRef = useRef<HeartType | null>(null);
  const sourceRef = useRef<'grant' | 'rainbow'>('grant');

  const now = new Date();
  const unlocked = unlockedHeartKeys(heartOps, now);
  const rainbowLeft = rainbowRemaining(heartOps, heartUsage, now);
  const rainbowAvailable = unlocked.has('rainbow') && rainbowLeft > 0;

  const pickType = (type: HeartType, disabled: boolean, source: 'grant' | 'rainbow') => {
    if (disabled) return;
    selectedRef.current = type;
    sourceRef.current = source;
    setSelected(type);
  };

  const handleConfirm = () => {
    const type = selectedRef.current ?? selected;
    if (!type) return;
    onConfirm(type, sourceRef.current === 'rainbow' ? 'rainbow' : undefined);
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
          {sentTypesForTarget.size > 0 && (
            <p className="text-xs text-gray-400 mt-1">
              이미 보낸 하트: {[...sentTypesForTarget].map(t => heartMeta(t).emoji).join(' ')}
            </p>
          )}
        </div>

        <div className="space-y-2 mb-5">
          {HEART_TYPES.map(h => {
            const alreadySent = sentTypesForTarget.has(h.type);
            const remaining = grantRemaining(heartOps, heartUsage, h.type, now);
            const unlockedType = remaining > 0;
            const disabled = !unlockedType || alreadySent;
            const isSel = selected === h.type && !rainbowOpen;
            return (
              <button
                key={h.type}
                type="button"
                data-testid={`like-heart-${h.type}`}
                disabled={disabled}
                {...bindMobileTap(() => pickType(h.type, disabled, 'grant'))}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                  disabled ? 'opacity-40 cursor-not-allowed border-gray-100 bg-gray-50'
                  : isSel ? `${h.bg} ${h.border} ring-2 ${h.ring}`
                  : `border-gray-200 hover:${h.border} hover:${h.bg}`
                }`}
              >
                <span className={`text-2xl transition-all ${unlockedType ? '' : 'grayscale opacity-35'}`}>{h.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold ${isSel ? h.text : 'text-gray-800'}`}>{h.label}</p>
                  <p className="text-xs text-gray-400">
                    {alreadySent ? '이미 보낸 하트' : h.desc}
                  </p>
                </div>
                <span className="text-[10px] font-black flex-shrink-0" data-testid={`like-heart-${h.type}-remaining`}>
                  {alreadySent ? '전송됨' : unlockedType ? '🔓' : '🔒'}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mb-4 flex justify-center">
          <button
            type="button"
            data-testid="like-rainbow-btn"
            aria-disabled={!rainbowAvailable}
            {...bindMobileTap(() => { if (rainbowAvailable) setRainbowOpen(true); })}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border-2 text-sm font-bold ${
              rainbowAvailable
                ? 'border-fuchsia-300 bg-fuchsia-50 text-fuchsia-800'
                : 'border-gray-100 bg-gray-50 text-gray-400 opacity-50'
            }`}
          >
            <span>🌈</span>
            <span>무지개하트</span>
            {rainbowAvailable && (
              <span className="tabular-nums text-fuchsia-700" data-testid="like-rainbow-remaining">{rainbowLeft}</span>
            )}
          </button>
        </div>

        <div className="mb-3 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
          <span className="text-sm flex-shrink-0">⚠️</span>
          <p className="text-xs text-amber-700 font-semibold leading-relaxed">칭찬 하트는 상대방에게 칭찬만 전달됩니다. <span className="underline">연락처가 공유되지 않습니다.</span></p>
        </div>
        <div className="flex gap-3">
          <button type="button" {...bindMobileTap(onCancel)} className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl">
            취소
          </button>
          <button
            type="button"
            aria-disabled={!selected || rainbowOpen}
            {...bindMobileTap(handleConfirm)}
            className={`flex-1 py-3 text-white font-semibold rounded-xl flex items-center justify-center gap-1.5 ${
              selected && !rainbowOpen ? `${heartMeta(selected).solidBg}` : 'bg-gray-300 opacity-40'
            }`}
          >
            <Heart className="w-4 h-4" />
            보내기
          </button>
        </div>
      </div>

      {rainbowOpen && (
        <div className="absolute inset-0 z-[1] flex items-center justify-center bg-black/50 p-4" data-testid="rainbow-color-dialog">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-4">
            <p className="text-center text-sm font-bold text-gray-900">무지개 — 보낼 하트 선택</p>
            <p className="text-center text-[11px] font-semibold text-gray-500 mt-1">일반 하트는 줄지 않아요</p>
            <div className="grid grid-cols-2 gap-2 mt-4 mb-4">
              {HEART_TYPES.map(h => {
                const disabled = !rainbowAvailable || sentTypesForTarget.has(h.type);
                const isSel = selected === h.type;
                return (
                  <button
                    key={h.type}
                    type="button"
                    data-testid={`rainbow-pick-${h.type}`}
                    disabled={disabled}
                    {...bindMobileTap(() => pickType(h.type, disabled, 'rainbow'))}
                    className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 ${
                      disabled ? 'opacity-40 border-gray-100' : isSel ? `${h.border} ${h.bg}` : 'border-gray-200'
                    }`}
                  >
                    <span className="text-xl">{h.emoji}</span>
                    <span className="text-xs font-bold">{h.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button type="button" {...bindMobileTap(() => setRainbowOpen(false))} className="flex-1 py-2.5 bg-gray-100 rounded-xl text-sm font-semibold">
                뒤로
              </button>
              <button
                type="button"
                aria-disabled={!selected}
                {...bindMobileTap(handleConfirm)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white ${
                  selected ? heartMeta(selected).solidBg : 'bg-gray-300 opacity-40'
                }`}
              >
                보내기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** @deprecated tests — build config from legacy props */
export function likeDialogHeartOps(quotas: Record<HeartType, number>, rainbowPool: number): HeartOpsConfig {
  const unlock: HeartOpsConfig['slots'][0]['unlock'] = [];
  if (rainbowPool > 0) {
    return parseHeartOps(JSON.stringify({
      version: 2,
      timezone: 'Asia/Seoul',
      slots: [{ id: 't', at: '00:00', unlock: ['rainbow', ...(['red', 'blue', 'pink', 'green'] as HeartType[]).filter(t => (quotas[t] ?? 0) > 0)] }],
      instant_unlock: ['rainbow', ...(['red', 'blue', 'pink', 'green'] as HeartType[]).filter(t => (quotas[t] ?? 0) > 0)],
    }));
  }
  (['red', 'blue', 'pink', 'green'] as HeartType[]).forEach(t => {
    if ((quotas[t] ?? 0) > 0) unlock.push(t);
  });
  return parseHeartOps(JSON.stringify({
    version: 2, timezone: 'Asia/Seoul',
    slots: unlock.length ? [{ id: 't', at: '00:00', unlock }] : [],
    instant_unlock: unlock,
  }));
}
