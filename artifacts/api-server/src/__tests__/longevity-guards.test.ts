/**
 * 5시간 행사 재발 방지 — 소스/순수함수 가드.
 * 이 테스트가 실패하면 2분 전체 리로드 폭풍 또는 NAT 로그인 429 가 다시 열린 것이다.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { consumeRateLimit, LOGIN_RATE_MAX, LOGIN_RATE_MAX_PER_IP, venueLoginRateKeys } from '../lib/db-rate-limit.js';
import { shouldBroadcastBulkResync } from '../lib/db-store-merge.js';

const here = dirname(fileURLToPath(import.meta.url));
const dbTs = readFileSync(join(here, '../routes/db.ts'), 'utf8');
const broadcastTargetsTs = readFileSync(join(here, '../lib/db-broadcast-targets.ts'), 'utf8');
const dbSecurityTest = readFileSync(join(here, 'db-security.test.ts'), 'utf8');

/** Global heart pool (heart_balances) was removed — per-type / per-person limits stay. */
const HEART_BALANCE_BANNED = [
  'heart_balances',
  'myHeartCount',
  'heart_initial_count',
  'admin_reset_heart',
] as const;

describe('longevity recurrence guards (server)', () => {
  it('120s periodic path must call resyncAllFromNativeDb("periodic"), never "forced"', () => {
    expect(dbTs).toMatch(/resyncAllFromNativeDb\('periodic'\)/);
    expect(dbTs).not.toMatch(/setInterval\(\(\) => \{ resyncAllFromNativeDb\('forced'\)/);
    expect(dbTs).toMatch(/const notifyClients = shouldBroadcastBulkResync\(reason\)/);
    expect(dbTs).toMatch(/if \(notifyClients && prevFp !== nextFp\)/);
    expect(dbTs).toMatch(/RING_REPLAY_MAX/);
    expect(dbTs).toMatch(/type: 'catchup'/);
  });

  it('periodic sync must not emit _bulk_resync to all clients', () => {
    expect(shouldBroadcastBulkResync('periodic')).toBe(false);
    expect(shouldBroadcastBulkResync('forced')).toBe(true);
  });

  it('rate_limits prune interval stays on the 5-minute path', () => {
    expect(dbTs).toMatch(/pruneDistributedRateLimits\(\)/);
    expect(dbTs).toMatch(/table_name = 'rate_limits'/);
  });

  it('admin RPC hydrates app_settings from DB before password checks', () => {
    const rpcStart = dbTs.indexOf("router.post('/rpc/:name'");
    const hydrateAt = dbTs.indexOf('await hydrateAppSettingsFromDb()', rpcStart);
    const createSession = dbTs.indexOf("case 'admin_create_session'", rpcStart);
    const updateSettings = dbTs.indexOf("case 'admin_update_settings'", rpcStart);
    expect(rpcStart).toBeGreaterThan(0);
    expect(hydrateAt).toBeGreaterThan(rpcStart);
    expect(createSession).toBeGreaterThan(hydrateAt);
    expect(updateSettings).toBeGreaterThan(hydrateAt);
    expect(dbTs).toMatch(/store\['app_settings'\] = \[updated\]/);
    expect(dbTs).toMatch(/await dbPersistRow\('app_settings', updated\)/);
    expect(dbTs).toMatch(/resetPanelLoginLimiter\(req\)/);
  });

  it('heart_balances global pool stays removed from server (recurrence guard)', () => {
    for (const token of HEART_BALANCE_BANNED) {
      expect(dbTs).not.toContain(token);
      expect(broadcastTargetsTs).not.toContain(token);
    }
    for (const token of HEART_BALANCE_BANNED) {
      expect(dbSecurityTest).not.toContain(token);
    }
  });

  it('150 distinct venue logins on one NAT IP stay under the IP burst cap', () => {
    const map = new Map();
    const ip = '203.0.113.10';
    for (let i = 0; i < 150; i++) {
      const keys = venueLoginRateKeys(`user-${i}`, ip);
      expect(consumeRateLimit(map, keys.userKey, { now: 1, windowMs: 60_000, max: LOGIN_RATE_MAX })).toBe('ok');
      expect(consumeRateLimit(map, keys.ipBurstKey, { now: 1, windowMs: 60_000, max: LOGIN_RATE_MAX_PER_IP })).toBe('ok');
    }
    expect(LOGIN_RATE_MAX_PER_IP).toBeGreaterThanOrEqual(150);
    const brute = venueLoginRateKeys('same-user', ip);
    for (let i = 0; i < LOGIN_RATE_MAX; i++) {
      consumeRateLimit(map, brute.userKey, { now: 2, windowMs: 60_000, max: LOGIN_RATE_MAX });
    }
    expect(consumeRateLimit(map, brute.userKey, { now: 2, windowMs: 60_000, max: LOGIN_RATE_MAX })).toBe('limited');
  });
});
