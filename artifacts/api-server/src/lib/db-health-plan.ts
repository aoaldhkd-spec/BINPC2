/**
 * /health alarm + pin-pool planners — extracted from routes/db.ts.
 * Pure given counts/lags; Express / DB queries / cache stay in db.ts.
 */

export const HEALTH_LOSS_ALARM_THRESHOLD = 5;

export type PinPoolStats = {
  remaining: number;
  total: number;
  alarmThreshold: number;
};

/** PIN pool remaining vs 15% alarm threshold (same math as prior /health). */
export function planPinPoolStats(profiles: Record<string, unknown>[]): PinPoolStats {
  const use5Digit = profiles.length > 8000;
  const total = use5Digit ? 90_000 : 9000;
  const used = new Set(profiles.map(p => p.pin_code).filter(Boolean)).size;
  const remaining = total - used;
  const alarmThreshold = Math.max(50, Math.floor(total * 0.15));
  return { remaining, total, alarmThreshold };
}

/** Build alarm strings with exact prior /health wording. */
export function buildHealthAlarms(input: {
  recentPersistErrors: number;
  dbQueryError: string | null;
  inMemMessages: number;
  dbMessages: number;
  inMemLikes: number;
  dbLikes: number;
  messageLag: number | null;
  likeLag: number | null;
  lossAlarmThreshold?: number;
  pinRemaining: number;
  pinAlarmThreshold: number;
  pinPoolTotal: number;
}): string[] {
  const loss = input.lossAlarmThreshold ?? HEALTH_LOSS_ALARM_THRESHOLD;
  const alarms: string[] = [];
  if (input.recentPersistErrors > 0) {
    alarms.push(`${input.recentPersistErrors} DB persist error(s) in last 5 min`);
  }
  if (input.dbQueryError) {
    alarms.push(`DB query failed: ${input.dbQueryError.slice(0, 120)}`);
  }
  if (input.messageLag !== null && input.messageLag > loss) {
    alarms.push(
      `message lag: inMem=${input.inMemMessages} db=${input.dbMessages} (>${loss})`,
    );
  }
  if (input.likeLag !== null && input.likeLag > loss) {
    alarms.push(
      `like lag: inMem=${input.inMemLikes} db=${input.dbLikes} (>${loss})`,
    );
  }
  if (input.pinRemaining <= input.pinAlarmThreshold) {
    alarms.push(
      `PIN pool nearly full: ${input.pinRemaining} slot(s) remaining of ${input.pinPoolTotal}`,
    );
  }
  return alarms;
}

export function healthUnauthorizedReject(): { status: number; body: { ok: false; error: string } } {
  return { status: 401, body: { ok: false, error: 'Admin authentication required' } };
}

export function healthInternalReject(): { status: number; body: { ok: false; error: string } } {
  return { status: 500, body: { ok: false, error: 'Health check failed' } };
}


export type HealthBodyInput = {
  persistErrors: number;
  recentErrors: unknown[];
  inMemMessages: number;
  inMemLikes: number;
  dbMessages: number;
  dbLikes: number;
  messageLag: number | null;
  likeLag: number | null;
  pinRemaining: number;
  pinTotal: number;
  alarms: string[];
  sseConnections: number;
  likesMinIntervalMs: number;
  integrity: unknown;
  httpMetrics: unknown;
  checkedAt: string;
  lossAlarmThreshold?: number;
};

/** Assemble /health JSON body (same shape as prior db.ts). */
export function buildHealthBody(input: HealthBodyInput): Record<string, unknown> {
  const loss = input.lossAlarmThreshold ?? HEALTH_LOSS_ALARM_THRESHOLD;
  return {
    persistErrors: input.persistErrors,
    recentErrors: input.recentErrors,
    inMemory: { messages: input.inMemMessages, likes: input.inMemLikes },
    db: { messages: input.dbMessages, likes: input.dbLikes },
    lag: { messages: input.messageLag, likes: input.likeLag },
    pinPool: { remaining: input.pinRemaining, total: input.pinTotal },
    alarms: input.alarms,
    ok: input.alarms.length === 0,
    sseConnections: input.sseConnections,
    thresholds: { lossAlarm: loss, likesMinIntervalMs: input.likesMinIntervalMs },
    integrity: input.integrity,
    httpMetrics: input.httpMetrics,
    checkedAt: input.checkedAt,
  };
}

export const PIN_WARN_USED_RATIO_DEFAULT = 0.85;

export function shouldWarnPinPool(
  stats: PinPoolStats,
  warnRatio: number = PIN_WARN_USED_RATIO_DEFAULT,
): boolean {
  const used = stats.total - stats.remaining;
  return used / stats.total >= warnRatio;
}

export function buildPinPoolWarningPush(stats: PinPoolStats): {
  title: string;
  body: string;
  tag: string;
  url: string;
  pct: number;
} {
  const used = stats.total - stats.remaining;
  const pct = Math.round((used / stats.total) * 100);
  return {
    title: '🔔 PIN 풀 거의 소진',
    body: `PIN ${pct}% 사용됨 — 잔여 ${stats.remaining}개 (총 ${stats.total}개). 빠른 조치가 필요합니다.`,
    tag: 'pin-pool-warning',
    url: '/',
    pct,
  };
}

export function buildAdminDbFailurePush(tableName: string, errMsg: string): {
  title: string;
  body: string;
  tag: string;
  url: string;
} {
  const shortErr = errMsg.length > 80 ? errMsg.slice(0, 80) + '…' : errMsg;
  return {
    title: '⚠️ DB 저장 오류 발생',
    body: `[${tableName}] ${shortErr}`,
    tag: 'db-persist-error',
    url: '/',
  };
}
