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

/** Global heart pool feature tokens — must not reappear in live server paths. */
const HEART_POOL_FEATURE_BANNED = ['myHeartCount', 'heart_initial_count', 'admin_reset_heart'] as const;

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
    for (const token of HEART_POOL_FEATURE_BANNED) {
      expect(dbTs).not.toContain(token);
      expect(broadcastTargetsTs).not.toContain(token);
      expect(dbSecurityTest).not.toContain(token);
    }
    // heart_balances may appear only in legacy block/cleanup — never as live table logic.
    expect(dbTs).not.toContain('heart_balances');
    expect(broadcastTargetsTs).not.toContain('heart_balances');
    expect(dbSecurityTest).toMatch(/legacy removed-feature tables stay blocked/);
    expect(dbSecurityTest).toMatch(/heart_balances/);
    const lib = readFileSync(join(here, '../lib/db-legacy-cleanup.ts'), 'utf8');
    expect(lib).toMatch(/heart_balances/);
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

  it('signal push title uses 📡 emoji not 💕', () => {
    const sigIdx = dbTs.indexOf("table === 'signal_sends'");
    expect(sigIdx).toBeGreaterThan(0);
    const block = dbTs.slice(sigIdx, sigIdx + 400);
    expect(block).toContain('📡');
    expect(block).not.toContain('💕');
  });

  it('persist-before-broadcast and legacy seating/heart_drain stay out of active op tables', () => {
    const allowedStart = dbTs.indexOf('const ALLOWED_OP_TABLES');
    expect(allowedStart).toBeGreaterThan(0);
    const allowedBlock = dbTs.slice(allowedStart, allowedStart + 900);
    expect(allowedBlock).not.toContain("'seats'");
    expect(allowedBlock).not.toContain("'seating'");
    expect(allowedBlock).not.toContain('heart_balances');
    expect(dbTs).toMatch(/await dbPersistRow\(/);
    expect(dbTs).toMatch(/resolveAuthUserId\(req, body\)/);
    expect(dbTs).toMatch(/isPublicProfilePhoto|profile-photos\/[\w-]+/);
  });

  it('cleanupLegacyTables runs after seed and on 5-minute interval (startup PG purge)', () => {
    expect(dbTs).toMatch(/cleanupLegacyTables\(\)/);
    expect(dbTs).toMatch(/dbReadyPromise[\s\S]{0,120}\.then\(\(\) => cleanupLegacyTables\(\)\)/);
    expect(dbTs).toMatch(/ensureAppSettingsSecrets\(\)[\s\S]{0,120}\.then\(\(\) => cleanupLegacyTables\(\)\)/);
    expect(dbTs).toMatch(/LEGACY_KV_TABLES/);
    expect(dbTs).toMatch(/DELETE FROM app_kv_rows WHERE table_name = \$1/);
    expect(dbTs).toMatch(/data - 'heart_drain_enabled'/);
  });

  it('legacy strip helpers live in db-legacy-cleanup.ts (testable, idempotent)', () => {
    const lib = readFileSync(join(here, '../lib/db-legacy-cleanup.ts'), 'utf8');
    expect(lib).toMatch(/stripLegacySettingsKeys/);
    expect(lib).toMatch(/LEGACY_OP_BLOCKLIST/);
    expect(lib).toMatch(/heart_balances/);
  });

  it('load-venue-150 p95 thresholds stay CI-realistic (not flaky-tight)', () => {
    const loadTest = readFileSync(join(here, 'load-venue-150.test.ts'), 'utf8');
    expect(loadTest).toMatch(/pct\(lat, 95\)\)\.toBeLessThan\(5_000\)/);
    expect(loadTest).toMatch(/pct\(readyLat, 95\)\)\.toBeLessThan\(5_000\)/);
    // 1.5s / 3.5s p95 flakes on shared GHA + busy hosts under 150 concurrent bursts
    expect(loadTest).not.toMatch(/pct\(lat, 95\)\)\.toBeLessThan\(3_500\)/);
    expect(loadTest).not.toMatch(/pct\(readyLat, 95\)\)\.toBeLessThan\(3_500\)/);
    expect(loadTest).not.toMatch(/pct\(readyLat, 95\)\)\.toBeLessThan\(1_500\)/);
  });

  it('keep-api-warm script and scheduled CI exist (Render cold-start)', () => {
    const warmScript = readFileSync(join(here, '../../../../scripts/keep-api-warm.mjs'), 'utf8');
    const warmCi = readFileSync(join(here, '../../../../.github/workflows/keep-api-warm.yml'), 'utf8');
    expect(warmScript).toContain('/api/healthz');
    expect(warmCi).toMatch(/keep-api-warm\.mjs/);
  });

  it('Supabase public schema RLS on startup (rls_disabled_in_public)', () => {
    expect(dbTs).toContain('ensurePublicTableRls');
    expect(dbTs).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(dbTs).toMatch(/REVOKE ALL ON public/);
    const sql = readFileSync(join(here, '../../../../scripts/sql/enable-rls-public-tables.sql'), 'utf8');
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
  });

  it('endurance auto-recovers after admin reset 403 (not FUNCTIONS_LOCKED)', () => {
    const endurance = readFileSync(join(here, '../../../../scripts/endurance-5h.mjs'), 'utf8');
    expect(endurance).toMatch(/isRecoverableOpFailure/);
    expect(endurance).toMatch(/recoverContext/);
    expect(endurance).toMatch(/FORBIDDEN/);
    expect(readFileSync(join(here, '../../../../scripts/endurance-watchdog.mjs'), 'utf8'))
      .toMatch(/spawnEndurance/);
  });
});
