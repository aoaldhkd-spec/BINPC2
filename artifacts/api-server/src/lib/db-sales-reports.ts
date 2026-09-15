/**
 * Safe aggregate sales snapshots. No identifiers, names, preference-style
 * ranking fields, or raw profile/signal text are ever included in a report.
 */

export const SALES_REPORT_TABLE = 'event_sales_reports';
export const SALES_REPORT_LIMIT = 100;

export type SalesReportMetrics = {
  participants: number;
  hearts: number;
  chatRooms: number;
  chatMessages: number;
  groupRooms: number;
  groupMessages: number;
  groupParticipants: number;
  mbtiDistribution: Record<string, number>;
  compatibilityProfiles: number;
  fortuneProfiles: number;
  realtime: { adminSseConnections: number };
  stability: { persistErrors: number };
};

export type SalesReport = {
  id: string;
  created_at: string;
  metrics: SalesReportMetrics;
};

type Row = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isSalesReport(value: unknown): value is SalesReport {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.created_at !== 'string') return false;
  const metrics = value.metrics;
  if (!isRecord(metrics)) return false;
  return [
    'participants', 'hearts', 'chatRooms', 'chatMessages', 'groupRooms',
    'groupMessages', 'groupParticipants', 'compatibilityProfiles', 'fortuneProfiles',
  ].every(key => typeof metrics[key] === 'number' && Number.isFinite(metrics[key]));
}

function hasBirthYear(row: Row): boolean {
  const year = Number(row.birth_year);
  return Number.isInteger(year) && year > 0;
}

function normalizedMbti(value: unknown): string | null {
  const mbti = String(value ?? '').trim().toUpperCase();
  return /^[EI][NS][FT][JP]$/.test(mbti) ? mbti : null;
}

function countDistribution(rows: Row[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const mbti = normalizedMbti(row.mbti);
    if (mbti) out[mbti] = (out[mbti] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

export type SalesReportInput = {
  profiles: Row[];
  likes: Row[];
  chats: Row[];
  messages: Row[];
  groupChats: Row[];
  groupMessages: Row[];
  groupParticipants: Row[];
  now: string;
  id: string;
  adminSseConnections: number;
  persistErrors: number;
  excludeProfile?: (row: Row) => boolean;
};

/** Build a PII-free, wipe-surviving aggregate from the server-side store. */
export function buildSalesReport(input: SalesReportInput): SalesReport {
  const profiles = input.profiles.filter(row => !input.excludeProfile?.(row));
  const compatibilityProfiles = profiles.filter(row => hasBirthYear(row) || Boolean(String(row.mbti ?? '').trim())).length;
  const fortuneProfiles = profiles.filter(hasBirthYear).length;
  return {
    id: String(input.id),
    created_at: input.now,
    metrics: {
      participants: profiles.length,
      hearts: input.likes.length,
      chatRooms: input.chats.length,
      chatMessages: input.messages.length,
      groupRooms: input.groupChats.length,
      groupMessages: input.groupMessages.length,
      groupParticipants: input.groupParticipants.length,
      mbtiDistribution: countDistribution(profiles),
      compatibilityProfiles,
      fortuneProfiles,
      realtime: { adminSseConnections: Math.max(0, Math.floor(input.adminSseConnections)) },
      stability: { persistErrors: Math.max(0, Math.floor(input.persistErrors)) },
    },
  };
}

/** Markdown download deliberately contains only aggregate values. */
export function salesReportMarkdown(report: SalesReport): string {
  const m = report.metrics;
  const mbti = Object.entries(m.mbtiDistribution)
    .map(([key, count]) => `${key} ${count}`)
    .join(' / ') || '집계 없음';
  return [
    '# BINPC2 판매용 성과 리포트',
    '',
    `- 생성 시각: ${report.created_at}`,
    '',
    '## 집계',
    `- 참여자: ${m.participants}`,
    `- 하트: ${m.hearts}`,
    `- 1:1 채팅방: ${m.chatRooms}`,
    `- 채팅 메시지: ${m.chatMessages}`,
    `- 단체방: ${m.groupRooms}`,
    `- 단체방 메시지: ${m.groupMessages}`,
    `- 단체방 참여자: ${m.groupParticipants}`,
    `- 실시간 관리자 연결: ${m.realtime.adminSseConnections}`,
    `- 안정성 persist 오류 누계: ${m.stability.persistErrors}`,
    '',
    '## MBTI·궁합·운세 집계',
    `- MBTI 분포: ${mbti}`,
    `- 궁합 가능 참여자: ${m.compatibilityProfiles}`,
    `- 운세 가능 참여자: ${m.fortuneProfiles}`,
    '',
  ].join('\n');
}
