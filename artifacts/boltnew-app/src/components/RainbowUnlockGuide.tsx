import { useState } from 'react';
import { InfoDialog } from './InfoDialog';
import { ls } from '../lib/storage';
import { rainbowGuideKey, RAINBOW_GUIDE_LINES } from '../lib/rainbow-guide';

export function RainbowUnlockGuide({ userId, available, now, remaining, dark }: {
  userId: string | null; available: boolean; now: Date; remaining: number; dark: boolean;
}) {
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  const key = userId ? rainbowGuideKey(userId, now) : '';
  const open = Boolean(key && available && !dismissed[key] && ls.getItem(key) !== '1');
  const close = () => {
    if (!key) return;
    ls.setItem(key, '1');
    setDismissed(prev => ({ ...prev, [key]: true }));
  };
  return <InfoDialog open={open} title="🌈 무지개하트가 열렸어요" onClose={close} dark={dark}>
    <p className="font-bold text-teal-600">현재 남은 무지개하트 {remaining}회</p>
    {RAINBOW_GUIDE_LINES.map(line => <p key={line}>{line}</p>)}
    <p className="text-xs">사용 가능 시간과 기능 잠금은 기존 행사 운영 규칙을 따릅니다.</p>
  </InfoDialog>;
}
