import { useEffect, useState } from 'react';
import { dailyCycleBannerState } from '../lib/daily-cycle';

function formatCountdown(totalSec: number): string {
  const sec = String(totalSec % 60).padStart(2, '0');
  const min = Math.floor(totalSec / 60);
  if (min < 60) return `${min}:${sec}`;
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}:${sec}`;
}

export function EventScheduleBanner({
  raw: _raw,
  functionsLocked = false,
  heartsLocked: heartsLockedProp,
  showStatus = true,
}: {
  raw: string | null;
  functionsLocked?: boolean;
  heartsLocked?: boolean;
  showStatus?: boolean;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const state = dailyCycleBannerState(now);
  const heartsLocked = heartsLockedProp ?? functionsLocked;

  return (
    <div
      data-testid="daily-cycle-banner"
      className="mx-3 mb-1 rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-center text-[10px] font-bold text-violet-800"
    >
      <span data-testid="daily-cycle-notice">{state.message}</span>
      <span className="ml-1 text-fuchsia-700" data-testid="daily-cycle-countdown">
        · 남은시간 {formatCountdown(state.countdownSec)}
      </span>
      {showStatus && (
        <>
          {functionsLocked
            ? <span className="ml-2 text-amber-800" data-testid="banner-chat-lock">🔒 채팅 잠금</span>
            : <span className="ml-2 text-emerald-800" data-testid="banner-chat-lock">💬 채팅 열림</span>}
          {heartsLocked
            ? <span className="ml-2 text-amber-800" data-testid="banner-heart-lock">🔒 하트 잠금</span>
            : <span className="ml-2 text-emerald-800" data-testid="banner-heart-lock">💖 하트 열림</span>}
        </>
      )}
    </div>
  );
}
