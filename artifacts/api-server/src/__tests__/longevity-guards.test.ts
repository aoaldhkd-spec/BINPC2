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
    // Planner peeled to db-push-plan.ts; db.ts only re-imports planPushForEvent.
    expect(dbTs).toContain("from '../lib/db-push-plan'");
    expect(dbTs).toContain('planPushForEvent');
    const pushPlan = readFileSync(join(here, '../lib/db-push-plan.ts'), 'utf8');
    const sigIdx = pushPlan.indexOf("table === 'signal_sends'");
    expect(sigIdx).toBeGreaterThan(0);
    const block = pushPlan.slice(sigIdx, sigIdx + 400);
    expect(block).toContain('📡');
    expect(block).not.toContain('💕');
  });

  it('SSE fanout policy + /op request helpers stay extracted from db.ts', () => {
    expect(dbTs).toContain("from '../lib/db-sse-fanout-policy'");
    expect(dbTs).toContain("from '../lib/db-op-request'");
    expect(dbTs).toContain('planSmartBroadcastLocal');
    expect(dbTs).toContain('normalizeOpFilters');
    expect(dbTs).toContain('validateOpScalars');
    expect(dbTs).not.toMatch(/const PRIVATE_TABLES = new Set\(/);
    expect(dbTs).not.toMatch(/const ALLOWED_OPS = new Set\(\['select'/);
    const fanout = readFileSync(join(here, '../lib/db-sse-fanout-policy.ts'), 'utf8');
    const opReq = readFileSync(join(here, '../lib/db-op-request.ts'), 'utf8');
    expect(fanout).toContain('PRIVATE_TABLES');
    expect(fanout).toContain('planSmartBroadcastLocal');
    expect(opReq).toContain('ALLOWED_OPS');
    expect(opReq).toContain('normalizeOpFilters');
  });

  it('admin identity + wipe-plan stay extracted from db.ts', () => {
    expect(dbTs).toContain("from '../lib/db-admin-identity'");
    expect(dbTs).toContain("from '../lib/db-admin-wipe-plan'");
    expect(dbTs).toContain('planClearAdminNpcRelationships');
    expect(dbTs).toContain('ADMIN_FIXED_NICKNAME');
    expect(dbTs).not.toMatch(/const ADMIN_FIXED_NICKNAME = /);
    expect(dbTs).not.toMatch(/function birthMdWouldChangeRow\(/);
    const ident = readFileSync(join(here, '../lib/db-admin-identity.ts'), 'utf8');
    const wipe = readFileSync(join(here, '../lib/db-admin-wipe-plan.ts'), 'utf8');
    expect(ident).toContain('ADMIN_FIXED_NICKNAME');
    expect(ident).toContain('withFixedAdminNickname');
    expect(wipe).toContain('planClearAdminNpcRelationships');
  });

  it('admin ensure-plan + app-settings-boot stay extracted from db.ts', () => {
    expect(dbTs).toContain("from '../lib/db-admin-ensure-plan'");
    expect(dbTs).toContain('planEnsureAdminProfile');
    expect(dbTs).toContain('planRestoreAdminProfileAfterWipe');
    expect(dbTs).toContain("from '../lib/db-app-settings-boot'");
    expect(dbTs).toContain('buildDefaultAppSettings');
    expect(dbTs).toContain('planAppSettingsSecretsPatch');
    expect(dbTs).not.toMatch(/personality_score: 50,/);
    expect(dbTs).not.toMatch(/admin_phone: '010-3878-6740',/);
    const ensure = readFileSync(join(here, '../lib/db-admin-ensure-plan.ts'), 'utf8');
    const boot = readFileSync(join(here, '../lib/db-app-settings-boot.ts'), 'utf8');
    expect(ensure).toContain('planEnsureAdminProfile');
    expect(boot).toContain('buildDefaultAppSettings');
  });

  it('op result-shape + select-scope stay extracted from db.ts', () => {
    expect(dbTs).toContain("from '../lib/db-op-result-shape'");
    expect(dbTs).toContain('orderLimitShape');
    expect(dbTs).toContain('sanitizeBroadcastValue');
    expect(dbTs).toContain("from '../lib/db-op-select-scope'");
    expect(dbTs).toContain('scopeSignalSendsRows');
    expect(dbTs).toContain('dedupeParticipantChatRows');
    expect(dbTs).toContain('likesSelectKeepsLikerId');
    expect(dbTs).not.toMatch(/function sanitizeBroadcastValue\(val: unknown, depth = 0\)/);
    expect(dbTs).not.toMatch(/const seenPairs = new Set<string>\(\);/);
    const shape = readFileSync(join(here, '../lib/db-op-result-shape.ts'), 'utf8');
    const scope = readFileSync(join(here, '../lib/db-op-select-scope.ts'), 'utf8');
    expect(shape).toContain('orderLimitShape');
    expect(scope).toContain('scopeSignalSendsRows');
  });

  it('op update/delete ownership stay extracted from db.ts', () => {
    expect(dbTs).toContain("from '../lib/db-op-update-ownership'");
    expect(dbTs).toContain('updateMissingRequesterReject');
    expect(dbTs).toContain('forceUpdateOwnershipPatch');
    expect(dbTs).toContain('checkUpdateRowOwnership');
    expect(dbTs).toContain("from '../lib/db-op-delete-ownership'");
    expect(dbTs).toContain('deleteMissingRequesterReject');
    expect(dbTs).toContain('checkDeleteRowOwnership');
    expect(dbTs).not.toMatch(/IDOR: messages UPDATE without requesterId blocked/);
    expect(dbTs).not.toMatch(/IDOR: DELETE likes blocked/);
    const upd = readFileSync(join(here, '../lib/db-op-update-ownership.ts'), 'utf8');
    const del = readFileSync(join(here, '../lib/db-op-delete-ownership.ts'), 'utf8');
    expect(upd).toContain('checkUpdateRowOwnership');
    expect(del).toContain('checkDeleteRowOwnership');
  });

  it('op insert/upsert ownership stay extracted from db.ts', () => {
    expect(dbTs).toContain("from '../lib/db-op-insert-ownership'");
    expect(dbTs).toContain('planMessagesInsertOwnership');
    expect(dbTs).toContain('planLikesInsertOwnership');
    expect(dbTs).toContain('planNormalizeChatPairRow');
    expect(dbTs).toContain("from '../lib/db-op-upsert-ownership'");
    expect(dbTs).toContain('planUpsertRelationshipRow');
    expect(dbTs).toContain('signalSendsUpsertReject');
    expect(dbTs).not.toMatch(/IDOR: messages INSERT without requesterId blocked/);
    expect(dbTs).not.toMatch(/Forbidden: use insert for signal actions/);
    const ins = readFileSync(join(here, '../lib/db-op-insert-ownership.ts'), 'utf8');
    const ups = readFileSync(join(here, '../lib/db-op-upsert-ownership.ts'), 'utf8');
    expect(ins).toContain('planMessagesInsertOwnership');
    expect(ups).toContain('planUpsertRelationshipRow');
  });

  it('op select-access + likes-limits + pin/storage/broadcast/rpc stay extracted', () => {
    expect(dbTs).toContain("from '../lib/db-op-select-access'");
    expect(dbTs).toContain('mapMessagesOntoCanonicalChatId');
    expect(dbTs).toContain('collectMyGroupIds');
    expect(dbTs).toContain("from '../lib/db-op-likes-limits'");
    expect(dbTs).toContain('likesHeartLimitReject');
    expect(dbTs).toContain("from '../lib/db-pin-lookup'");
    expect(dbTs).toContain('maskNicknameForPinConfirm');
    expect(dbTs).toContain("from '../lib/db-storage-path'");
    expect(dbTs).toContain('planStorageUploadAuthPath');
    const storagePath = readFileSync(join(here, '../lib/db-storage-path.ts'), 'utf8');
    expect(storagePath).toContain('isValidStoragePath');
    expect(dbTs).toContain("from '../lib/db-broadcast-validate'");
    expect(dbTs).toContain('validateBroadcastBody');
    expect(dbTs).toContain("from '../lib/db-rpc-allowlist'");
    expect(dbTs).toContain('ALLOWED_RPCS');
    expect(dbTs).not.toMatch(/같은 종류의 하트는 최대 2명에게만 보낼 수 있습니다/);
    expect(dbTs).not.toMatch(/const ALLOWED_RPCS = new Set/);
    const sel = readFileSync(join(here, '../lib/db-op-select-access.ts'), 'utf8');
    const likes = readFileSync(join(here, '../lib/db-op-likes-limits.ts'), 'utf8');
    expect(sel).toContain('mapMessagesOntoCanonicalChatId');
    expect(likes).toContain('likesHeartLimitReject');
  });

  it('auth-login + op-gate + rpc-auth + push-subscribe + insert follow-up stay extracted', () => {
    expect(dbTs).toContain("from '../lib/db-session-tokens'");
    expect(dbTs).toContain('validateAuthLoginBody');
    expect(dbTs).toContain('planAuthLoginDecision');
    expect(dbTs).toContain("from '../lib/db-op-request'");
    expect(dbTs).toContain('opBusyReject');
    expect(dbTs).toContain('planBindRequesterId');
    expect(dbTs).toContain("from '../lib/db-rpc-allowlist'");
    expect(dbTs).toContain('validateRpcName');
    expect(dbTs).toContain('planVerifyPanelPasswordArgs');
    expect(dbTs).toContain("from '../lib/db-push-plan'");
    expect(dbTs).toContain('validatePushSubscribeBody');
    expect(dbTs).toContain('buildInsertedRow');
    expect(dbTs).toContain('planLikesMinuteBucketConsume');
    expect(dbTs).toContain('sseCapacityReject');
    expect(dbTs).toContain('buildReadyPayload');
    expect(dbTs).toContain('buildAutoRoomRow');
    expect(dbTs).not.toMatch(/이미 다른 기기에서 등록된 계정입니다/);
    expect(dbTs).not.toMatch(/Server busy — retry in 1s/);
    expect(dbTs).not.toMatch(/Server at SSE capacity/);
    const sess = readFileSync(join(here, '../lib/db-session-tokens.ts'), 'utf8');
    const opReq = readFileSync(join(here, '../lib/db-op-request.ts'), 'utf8');
    expect(sess).toContain('validateAuthLoginBody');
    expect(opReq).toContain('opBusyReject');
  });

  it('storage-upload + health-plan + push-subscribe-store + notify/autoMatch stay extracted', () => {
    expect(dbTs).toContain("from '../lib/db-storage-path'");
    expect(dbTs).toContain('planStorageUploadAuthPath');
    expect(dbTs).toContain('planStorageUploadContent');
    expect(dbTs).toContain("from '../lib/db-health-plan'");
    expect(dbTs).toContain('buildHealthAlarms');
    expect(dbTs).toContain('planPinPoolStats');
    expect(dbTs).toContain('planPushSubscribeStore');
    expect(dbTs).toContain('planNotifyOtherInstances');
    expect(dbTs).toContain('planAutoMatchJoinSpecs');
    expect(dbTs).toContain('planSignalSendsExistingRow');
    expect(dbTs).toContain('opAdminOnlyReject');
    expect(dbTs).not.toMatch(/이미지를 너무 자주 업로드하고 있습니다/);
    expect(dbTs).not.toMatch(/회의 상태 저장 실패/);
    expect(dbTs).not.toMatch(/PIN pool nearly full:/);
    const storage = readFileSync(join(here, '../lib/db-storage-path.ts'), 'utf8');
    const health = readFileSync(join(here, '../lib/db-health-plan.ts'), 'utf8');
    expect(storage).toContain('planStorageUploadAuthPath');
    expect(health).toContain('buildHealthAlarms');
  });

  it('app-settings-merge + panel-tokens stay extracted from db.ts', () => {
    expect(dbTs).toContain("from '../lib/db-app-settings-merge'");
    expect(dbTs).toContain("from '../lib/db-panel-tokens'");
    expect(dbTs).toContain('mergeAppSettingsPure');
    expect(dbTs).toContain('deriveAdminToken');
    expect(dbTs).not.toMatch(/const PRODUCTION_QR_BASE = /);
    expect(dbTs).not.toMatch(/function koreanDateMMDD\(/);
    expect(dbTs).not.toMatch(/function deriveAdminToken\(/);
    const merge = readFileSync(join(here, '../lib/db-app-settings-merge.ts'), 'utf8');
    const tokens = readFileSync(join(here, '../lib/db-panel-tokens.ts'), 'utf8');
    expect(merge).toContain('mergeAppSettings');
    expect(merge).toContain('SECRET_SETTING_KEYS');
    expect(tokens).toContain('deriveAdminToken');
    expect(tokens).toContain('deriveTestToken');
  });

  it('image-store stays extracted from db.ts', () => {
    expect(dbTs).toContain("from '../lib/db-image-store'");
    expect(dbTs).toContain('createImageStore');
    expect(dbTs).toContain('imageStoreGet');
    expect(dbTs).toContain('imageStoreSet');
    expect(dbTs).not.toMatch(/function pruneImageStore\(/);
    expect(dbTs).not.toMatch(/const imageStore = new Map/);
    const imageStore = readFileSync(join(here, '../lib/db-image-store.ts'), 'utf8');
    expect(imageStore).toContain('createImageStore');
    expect(imageStore).toContain('IMAGE_STORE_MAX_ENTRIES_DEFAULT');
  });

  it('persist-before-broadcast and legacy seating/heart_drain stay out of active op tables', () => {
    expect(dbTs).toContain("from '../lib/db-table-policy'");
    expect(dbTs).toContain('ALLOWED_OP_TABLES');
    const policy = readFileSync(join(here, '../lib/db-table-policy.ts'), 'utf8');
    expect(policy).toContain('ALLOWED_OP_TABLES');
    expect(policy).not.toContain("'seats'");
    expect(policy).not.toContain("'seating'");
    expect(policy).not.toContain('heart_balances');
    expect(dbTs).toMatch(/await dbPersistRow\(/);
    expect(dbTs).toMatch(/resolveAuthUserId\(req, body\)/);
    const storagePath2 = readFileSync(join(here, '../lib/db-storage-path.ts'), 'utf8');
    expect(storagePath2).toMatch(/isPublicProfilePhoto|profile-photos\/[\w-]+/);
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
    expect(loadTest).toMatch(/pct\(lat, 95\)\)\.toBeLessThan\(8_000\)/);
    expect(loadTest).toMatch(/pct\(readyLat, 95\)\)\.toBeLessThan\(8_000\)/);
    // 1.5s / 3.5s / 5s p95 flakes on shared GHA + busy hosts under 150 concurrent bursts
    expect(loadTest).not.toMatch(/pct\(lat, 95\)\)\.toBeLessThan\(5_000\)/);
    expect(loadTest).not.toMatch(/pct\(readyLat, 95\)\)\.toBeLessThan\(5_000\)/);
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
  it('pg pool hard-caps max and handles idle errors; LISTEN shutdown bumps gen', () => {
    const poolTs = readFileSync(join(here, '../lib/pg-pool.ts'), 'utf8');
    expect(poolTs).toMatch(/PG_POOL_HARD_CAP\s*=\s*10/);
    expect(poolTs).toMatch(/resolvePgPoolMax/);
    expect(poolTs).toMatch(/pgPool\.on\(\s*'error'/);
    expect(dbTs).toMatch(/_listenSetupGen\s*\+=\s*1/);
    expect(dbTs).toMatch(/_listenSetupInFlight\s*=\s*null/);
  });

});
