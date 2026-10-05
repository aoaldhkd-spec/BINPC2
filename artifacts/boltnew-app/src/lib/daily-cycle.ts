const SEOUL = 'Asia/Seoul';

type Ymd = { y: number; m: number; d: number };

function pad2(v: number): string {
  return String(v).padStart(2, '0');
}

function parts(now: Date): Ymd & { hour: number; minute: number; second: number } {
  const ps = new Intl.DateTimeFormat('en-US', {
    timeZone: SEOUL,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const n = (type: Intl.DateTimeFormatPartTypes) =>
    Number(ps.find(p => p.type === type)?.value ?? 0);
  const rawHour = n('hour');
  return {
    y: n('year'), m: n('month'), d: n('day'),
    hour: rawHour === 24 ? 0 : rawHour,
    minute: n('minute'), second: n('second'),
  };
}

function addDay(ymd: Ymd): Ymd {
  const d = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d + 1, 12));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

function wall(ymd: Ymd, hour: number): Date {
  return new Date(`${ymd.y}-${pad2(ymd.m)}-${pad2(ymd.d)}T${pad2(hour)}:00:00+09:00`);
}

export type DailyCycleBannerState = {
  phase: 'rainbow-open' | 'ended' | 'waiting-hearts' | 'grant-open';
  message: string;
  countdownSec: number;
};

export function dailyCycleBannerState(now = new Date()): DailyCycleBannerState {
  const p = parts(now);
  const today: Ymd = { y: p.y, m: p.m, d: p.d };
  let target: Date;
  let phase: DailyCycleBannerState['phase'];
  let message: string;

  if (p.hour < 1) {
    phase = 'rainbow-open';
    message = '🌈 무지개하트가 풀렸습니다 · 01시에 술번개가 종료됩니다';
    target = wall(today, 1);
  } else if (p.hour < 17) {
    phase = 'ended';
    message = '🌙 술번개가 종료됐습니다 · 17시에 전체 초기화됩니다';
    target = wall(today, 17);
  } else if (p.hour < 23) {
    phase = 'waiting-hearts';
    message = '❤️💙💗💚 23시에 일반 하트가 풀립니다';
    target = wall(today, 23);
  } else {
    phase = 'grant-open';
    message = '❤️💙💗💚 일반 하트가 풀렸습니다 · 24시에 무지개하트가 풀립니다';
    target = wall(addDay(today), 0);
  }

  return {
    phase,
    message,
    countdownSec: Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 1000)),
  };
}
