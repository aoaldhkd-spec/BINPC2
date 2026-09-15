import { describe, expect, it } from 'vitest';
import { buildSalesReport, salesReportMarkdown } from './db-sales-reports.js';

describe('db-sales-reports', () => {
  it('creates only aggregate metrics and excludes the admin profile', () => {
    const report = buildSalesReport({
      id: 'report-1',
      now: '2026-09-15T00:00:00.000Z',
      profiles: [
        { id: 'admin-id', nickname: '범일NPC', mbti: 'ISTJ', birth_year: 1990 },
        { id: 'private-id', nickname: '참가자A', mbti: 'enfp', birth_year: 1998 },
        { id: 'private-id-2', nickname: '참가자B', mbti: null, birth_year: null },
      ],
      likes: [{ id: 'like-1' }],
      chats: [{ id: 'chat-1' }],
      messages: [{ id: 'message-1' }, { id: 'message-2' }],
      groupChats: [{ id: 'group-1' }],
      groupMessages: [{ id: 'group-message-1' }],
      groupParticipants: [{ id: 'group-participant-1' }],
      adminSseConnections: 2,
      persistErrors: 1,
      excludeProfile: row => row.nickname === '범일NPC',
    });

    expect(report.metrics.participants).toBe(2);
    expect(report.metrics.mbtiDistribution).toEqual({ ENFP: 1 });
    expect(report.metrics.compatibilityProfiles).toBe(1);
    expect(report.metrics.fortuneProfiles).toBe(1);
    expect(report.metrics.hearts).toBe(1);
    expect(report.metrics.chatMessages).toBe(2);
    expect(report.metrics.groupMessages).toBe(1);
    expect(JSON.stringify(report)).not.toContain('private-id');
    expect(JSON.stringify(report)).not.toContain('범일NPC');
    expect(JSON.stringify(report)).not.toMatch(/탑|비선호|텀|올/);
  });

  it('renders a short aggregate markdown report', () => {
    const report = buildSalesReport({
      id: 'report-2', now: '2026-09-15T00:00:00.000Z',
      profiles: [{ mbti: 'INFP', birth_year: 2000 }],
      likes: [], chats: [], messages: [], groupChats: [], groupMessages: [], groupParticipants: [],
      adminSseConnections: 0, persistErrors: 0,
    });
    const markdown = salesReportMarkdown(report);
    expect(markdown).toContain('MBTI 분포: INFP 1');
    expect(markdown).toContain('궁합 가능 참여자: 1');
    expect(markdown).not.toMatch(/탑|비선호|텀|올/);
  });
});
