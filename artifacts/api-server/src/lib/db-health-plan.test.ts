import { describe, expect, it } from 'vitest';
import {
  HEALTH_LOSS_ALARM_THRESHOLD,
  planPinPoolStats,
  buildHealthAlarms,
  buildHealthBody,
  shouldWarnPinPool,
  buildPinPoolWarningPush,
  buildAdminDbFailurePush,
  resolveAdminPushRecipient,
  shouldThrottleEvent,
  buildHealthRecentCountSql,
} from './db-health-plan.js';

describe('db-health-plan', () => {
  it('planPinPoolStats switches at 8000 profiles', () => {
    const small = planPinPoolStats([{ pin_code: '1234' }, { pin_code: '1234' }, {}]);
    expect(small.total).toBe(9000);
    expect(small.remaining).toBe(9000 - 1);
    const many = planPinPoolStats(Array.from({ length: 8001 }, (_, i) => ({ pin_code: String(i) })));
    expect(many.total).toBe(90_000);
  });

  it('buildHealthAlarms matches prior wording', () => {
    const alarms = buildHealthAlarms({
      recentPersistErrors: 2,
      dbQueryError: 'boom'.repeat(50),
      inMemMessages: 10,
      dbMessages: 1,
      inMemLikes: 5,
      dbLikes: 0,
      messageLag: 9,
      likeLag: 5,
      pinRemaining: 10,
      pinAlarmThreshold: 50,
      pinPoolTotal: 9000,
    });
    expect(alarms[0]).toContain('2 DB persist error');
    expect(alarms.some(a => a.startsWith('DB query failed:'))).toBe(true);
    expect(alarms.some(a => a.includes('message lag: inMem=10 db=1'))).toBe(true);
    expect(alarms.some(a => a.includes('PIN pool nearly full'))).toBe(true);
  });

  it('buildHealthBody ok flag follows alarms', () => {
    const body = buildHealthBody({
      persistErrors: 0,
      recentErrors: [],
      inMemMessages: 0,
      inMemLikes: 0,
      dbMessages: 0,
      dbLikes: 0,
      messageLag: 0,
      likeLag: 0,
      pinRemaining: 100,
      pinTotal: 9000,
      alarms: [],
      sseConnections: 1,
      likesMinIntervalMs: 500,
      integrity: null,
      httpMetrics: {},
      checkedAt: 't',
      lossAlarmThreshold: HEALTH_LOSS_ALARM_THRESHOLD,
    });
    expect(body.ok).toBe(true);
    expect((body.thresholds as { lossAlarm: number }).lossAlarm).toBe(5);
  });

  it('pin warn + admin failure push payloads', () => {
    const stats = planPinPoolStats(Array.from({ length: 8000 }, (_, i) => ({ pin_code: String(i) })));
    // 8000 unique pins on 9000 pool => ~88.8%
    expect(shouldWarnPinPool(stats)).toBe(true);
    const push = buildPinPoolWarningPush(stats);
    expect(push.title).toContain('PIN');
    expect(push.body).toContain('잔여');
    const fail = buildAdminDbFailurePush('messages', 'x'.repeat(100));
    expect(fail.body).toContain('…');
    expect(fail.tag).toBe('db-persist-error');
  });
});

describe('admin push recipient + throttle + health count SQL (74)', () => {
  it('resolveAdminPushRecipient matches phone_number exactly', () => {
    expect(resolveAdminPushRecipient(null, [])).toBeNull();
    expect(resolveAdminPushRecipient({ admin_phone: '010' }, [{ phone_number: '011', id: 'x' }])).toBeNull();
    expect(resolveAdminPushRecipient({ admin_phone: '010' }, [{ phone_number: '010', id: 'adm' }])).toEqual({ adminId: 'adm' });
  });

  it('shouldThrottleEvent and health COUNT SQL', () => {
    expect(shouldThrottleEvent(1000, 500, 600)).toBe(true);
    expect(shouldThrottleEvent(1000, 500, 400)).toBe(false);
    expect(buildHealthRecentCountSql('messages')).toContain("table_name='messages'");
    expect(buildHealthRecentCountSql('likes')).toContain("table_name='likes'");
  });
});
