import { useEffect, useState } from 'react';
import { eventScheduleBannerState } from '../lib/event-schedule';

export function EventScheduleBanner({ raw }: { raw: string | null }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  const state = eventScheduleBannerState(raw, now);
  if (!state.show) return null;
  const countdown = state.nextSeconds == null
    ? ''
    : `${Math.floor(state.nextSeconds / 60)}:${String(Math.max(0, state.nextSeconds % 60)).padStart(2, '0')}`;
  return <div className="mx-3 mb-1 rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-center text-[10px] font-bold text-violet-800">
    {state.showNotice && state.active?.notice ? <span>{state.active.notice}</span> : null}
    {state.cumulativeRainbow > 0 && <span className={`${state.showNotice && state.active?.notice ? 'ml-2' : ''} text-violet-700`}>🌈 무지개하트{state.cumulativeRainbow}개 적용</span>}
    {state.upcomingHeartText && (
      <span className={`${state.showNotice || state.cumulativeRainbow > 0 ? 'ml-2' : ''} text-fuchsia-700`} data-testid="upcoming-heart-preview">
        {state.upcomingHeartText}
      </span>
    )}
    {!state.upcomingHeartText && state.next && <span className="ml-2 text-violet-500">다음 {state.next.at} · {countdown}</span>}
  </div>;
}
