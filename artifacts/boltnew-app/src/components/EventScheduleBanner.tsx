import { useEffect, useState } from 'react';
import { heartOpsBannerState, parseHeartOps } from '../lib/heart-ops';

/** 해금이 한 시간 넘게 남으면 분만 쓰면 「120:00」처럼 읽혀서 시:분:초로 끊어 준다. */
function formatCountdown(totalSec: number): string {
  const sec = String(totalSec % 60).padStart(2, '0');
  const min = Math.floor(totalSec / 60);
  if (min < 60) return `${min}:${sec}`;
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}:${sec}`;
}

export function EventScheduleBanner({ raw, functionsLocked = false, heartsLocked: heartsLockedProp }: {
  raw: string | null;
  functionsLocked?: boolean;
  heartsLocked?: boolean;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  const config = parseHeartOps(raw);
  const state = heartOpsBannerState(config, now);
  if (!state.show) return null;

  const heartsLocked = heartsLockedProp ?? functionsLocked;
  const countdown = state.countdownSec == null ? '' : formatCountdown(state.countdownSec);

  return (
    <div className="mx-3 mb-1 rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-center text-[10px] font-bold text-violet-800">
      {state.directNotice && <span>{state.directNotice}</span>}
      {state.justUnlocked && (
        <span className={state.directNotice ? 'ml-2' : ''}>{state.justUnlocked}</span>
      )}
      {!state.justUnlocked && (state.autoLine || (state.countdownSec != null && state.countdownSec > 0)) && (
        <span className={state.directNotice ? 'ml-2' : ''} data-testid="heart-ops-auto-notice">
          {state.autoLine}
          {state.countdownSec != null && state.countdownSec > 0 && (
            <span className={`${state.autoLine ? 'ml-1' : ''} text-fuchsia-700`}>
              {state.autoLine ? '· ' : ''}해금까지 {countdown}
            </span>
          )}
        </span>
      )}
      {functionsLocked
        ? <span className="ml-2 text-amber-800" data-testid="banner-chat-lock">🔒 채팅 잠금</span>
        : <span className="ml-2 text-emerald-800" data-testid="banner-chat-lock">💬 채팅 열림</span>}
      {heartsLocked
        ? <span className="ml-2 text-amber-800" data-testid="banner-heart-lock">🔒 하트 잠금</span>
        : <span className="ml-2 text-emerald-800" data-testid="banner-heart-lock">💖 하트 열림</span>}
    </div>
  );
}
