import { describe, expect, it } from 'vitest';
import {
  buildDistributedRateSlotSql,
  buildDistributedMinuteQuotaSql,
  buildRateLimitsPruneSql,
} from './db-rate-limit.js';

describe('db-rate-limit distributed SQL builders (75)', () => {
  it('rate slot / minute quota / prune SQL stay exact', () => {
    const slot = buildDistributedRateSlotSql();
    expect(slot).toContain("VALUES ('rate_limits', $1, '{}'::jsonb, NOW())");
    expect(slot).toContain("INTERVAL '1 millisecond'");
    expect(slot).toContain('RETURNING row_id');
    const minute = buildDistributedMinuteQuotaSql();
    expect(minute).toContain("jsonb_build_object('count', 1)");
    expect(minute).toContain("RETURNING (data->>'count')::int AS count");
    const prune = buildRateLimitsPruneSql();
    expect(prune).toContain("table_name = 'rate_limits'");
    expect(prune).toContain("INTERVAL '10 minutes'");
  });
});
