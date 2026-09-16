import { useEffect, useState } from 'react';
import { currentEventSlot, eventRainbowQuota, parseEventSchedule } from '../lib/event-schedule';

function minute(at: string): number { return Number(at.slice(0, 2)) * 60 + Number(at.slice(3)); }
function seoulMinute(now = new Date()): number {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
  const h = Number(p.find(x => x.type === 'hour')?.value ?? 0); const m = Number(p.find(x => x.type === 'minute')?.value ?? 0);
  return (h === 24 ? 0 : h) * 60 + m;
}
export function EventScheduleBanner({ raw }: { raw: string | null }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  const schedule = parseEventSchedule(raw);
  if (!schedule.slots.length) return null;
  const active = currentEventSlot(raw, now);
  const current = seoulMinute(now);
  const next = schedule.slots.find(s => minute(s.at) > current) ?? null;
  const nextSeconds = next ? (minute(next.at) - current) * 60 - now.getSeconds() : null;
  const countdown = nextSeconds == null ? '' : `${Math.floor(nextSeconds / 60)}:${String(Math.max(0, nextSeconds % 60)).padStart(2, '0')}`;
  const cumulativeRainbow = eventRainbowQuota(raw, now);
  return <div className="mx-3 mb-1 rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-center text-[10px] font-bold text-violet-800">
    {active?.notice ? <span>{active.notice}</span> : <span>행사 진행 중</span>}
    {cumulativeRainbow > 0 && <span className="ml-2 text-violet-700">🌈 무지개하트{cumulativeRainbow}개 적용</span>}
    {next && <span className="ml-2 text-violet-500">다음 {next.at} · {countdown}</span>}
  </div>;
}
