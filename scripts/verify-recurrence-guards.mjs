#!/usr/bin/env node
/**
 * Recurrence guards ? CI invariants only (high-value wiring that must not drift).
 *
 * - Guards: minimal regex/file checks for ops wiring, verify:ci parity, SSE/auth cores.
 * - Behavior & UI copy: covered by vitest (product-invariants, signal-match, profile-card-theme, ?).
 * - Single CI entry: `pnpm run verify:ci` = verify:guards + audit:code + test:unit (= GitHub Verify job).
 *
 * Usage: node scripts/verify-recurrence-guards.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

// GUARD_ENCODING_SELFCHECK: refuse mojibake regex literals (question-mark placeholders).
// Strip this block before scanning so the checker cannot false-positive on itself.
{
  const selfSrc = readFileSync(resolve(ROOT, 'scripts/verify-recurrence-guards.mjs'), 'utf8');
  const body = selfSrc.replace(/\/\/ GUARD_ENCODING_SELFCHECK[\s\S]*?\r?\n\}\r?\n/, '');
  if (/\/'\?{2,}/.test(body)) {
    console.error('FATAL: verify-recurrence-guards.mjs encoding corruption detected. Restore UTF-8.');
    process.exit(2);
  }
}

/** @type {{ id: string, ok: boolean, detail?: string }[]} */
const results = [];

function mustExist(rel, id) {
  const ok = existsSync(resolve(ROOT, rel));
  results.push({ id, ok, detail: ok ? rel : `missing ${rel}` });
  return ok;
}

function withUnicode(re) {
  return re.flags.includes('u') ? re : new RegExp(re.source, re.flags + 'u');
}

function mustMatch(rel, id, patterns) {
  const src = read(rel);
  for (const re of patterns) {
    if (!withUnicode(re).test(src)) {
      results.push({ id, ok: false, detail: `${rel} missing ${re}` });
      return false;
    }
  }
  results.push({ id, ok: true, detail: rel });
  return true;
}

function mustNotMatch(rel, id, patterns) {
  const src = read(rel);
  for (const re of patterns) {
    if (withUnicode(re).test(src)) {
      results.push({ id, ok: false, detail: `${rel} must not match ${re}` });
      return false;
    }
  }
  results.push({ id, ok: true, detail: rel });
  return true;
}

// ?? 01?03 SSE / reconnect / session core ?????????????????????????????????????

mustMatch('artifacts/boltnew-app/src/lib/localdb.ts', '01_sse_localdb_core', [
  /SSE_TOKEN_REFRESH_LEAD_SEC/,
  /scheduleSseTokenRefresh/,
  /closeSse\('expired-token-close'\)/,
  /VITE_SSE_ORIGIN/,
  /SSE_ORIGIN/,
]);
mustMatch('scripts/endurance-5h.mjs', '01_sse_endurance_core', [
  /SSE_TOKEN_REFRESH_LEAD_SEC/,
  /ensureConnected/,
  /401/,
  /expiresAt/,
]);
mustMatch('netlify.toml', '02_sse_origin_netlify', [/VITE_SSE_ORIGIN\s*=\s*"https:\/\/binpc2\.onrender\.com"/]);

mustMatch('scripts/endurance-5h.mjs', '03_functions_locked_skip', [
  /isOpFunctionsLocked/,
  /process\.exit\(2\)/,
  /result\.locked|locked: true/,
]);
mustMatch('artifacts/boltnew-app/src/hooks/useChat.ts', '03_unlock_flush_chat_queue', [
  /functionsLocked/,
  /flushPendingQueue/,
  /isFunctionsLockedOpError/,
]);

// ?? 05 Render / warm / single instance ???????????????????????????????????????

mustExist('scripts/keep-api-warm.mjs', '05_keep_api_warm_script');
mustExist('.github/workflows/keep-api-warm.yml', '05_keep_api_warm_ci');
mustMatch('render.yaml', '05_single_render_instance', [/numInstances:\s*1/]);

// ?? 07 Endurance recovery (minimal ? details in product-invariants) ????????

mustMatch('scripts/endurance-5h.mjs', '07_admin_event_reset_recover', [
  /admin_event_end_reset/,
  /recoverContext|re-provisioning soak users/,
]);
mustMatch('scripts/endurance-5h.mjs', '07_endurance_recover_core', [
  /isRecoverableOpFailure/,
  /recoverContext/,
  /acquireEnduranceLock/,
  /429|Rate limit/i,
]);

// ?? 09 Load-venue p95 budgets (CI flake guard) ?????????????????????????????

mustMatch('artifacts/api-server/src/__tests__/load-venue-150.test.ts', '09_load_venue_p95', [
  /pct\(lat, 95\)\)\.toBeLessThan\(8_000\)/,
  /pct\(readyLat, 95\)\)\.toBeLessThan\(8_000\)/,
  /Warm \/ready once/,
]);
mustNotMatch('artifacts/api-server/src/__tests__/load-venue-150.test.ts', '09_load_venue_no_tight_budgets', [
  /pct\(lat, 95\)\)\.toBeLessThan\(3_500\)/,
  /pct\(readyLat, 95\)\)\.toBeLessThan\(3_500\)/,
  /pct\(readyLat, 95\)\)\.toBeLessThan\(1_500\)/,
  /pct\(lat, 95\)\)\.toBeLessThan\(5_000\)/,
  /pct\(readyLat, 95\)\)\.toBeLessThan\(5_000\)/,
]);

// ?? 10?11 Ops smoke helpers ??????????????????????????????????????????????????

mustMatch('scripts/verify-all-features.mjs', '10_admin_pw_skip', [/SKIP \(local password mismatch/]);
mustMatch('scripts/endurance-5h.mjs', '11_parallel_endurance_lock', [
  /acquireEnduranceLock/,
  /releaseEnduranceLock/,
  /RUN_ID=/,
  /Parallel endurance|ENDURANCE_FORCE_LOCK/,
]);

// ?? 12 ProfileCard flip (core ? sizing/mobile in profile-card-lock.test) ?????

mustMatch('artifacts/boltnew-app/src/components/ProfileCard.tsx', '12_profile_card_flip_bars_stay', [
  /showTopBar = hasTicker/,
  /showBottomBar = true/,
  /profile-card-photo-frame/,
]);
mustNotMatch('artifacts/boltnew-app/src/components/ProfileCard.tsx', '12_profile_card_no_hide_bars_on_flip', [
  /showTopBar = hasTicker && !isFlipped/,
  /showBottomBar = !isFlipped/,
]);

// ?? 13 Banned regressions (audit script hook) ????????????????????????????????

mustMatch('scripts/full-code-audit.mjs', '13_heart_balances_banned', [
  /heart_balances/,
  /BANNED_REGRESSION/,
]);

// ?? 15 verify:ci single entry (local ? GitHub parity) ???????????????????????

mustMatch('package.json', '15_verify_ci_script', [
  /"verify:ci":\s*"corepack pnpm run verify:guards && corepack pnpm run audit:code && corepack pnpm run test:unit"/,
]);
mustMatch('.github/workflows/verify.yml', '15_ci_runs_verify_ci', [/pnpm run verify:ci/]);
mustNotMatch('.github/workflows/verify.yml', '15_ci_no_split_step_drift', [
  /pnpm run verify:guards/,
  /pnpm run audit:code/,
  /pnpm -r --filter/,
]);
mustMatch('package.json', '15_verify_guards_alias', [/"verify:guards":\s*"node scripts\/verify-recurrence-guards\.mjs"/]);
mustMatch('package.json', '15_test_unit_alias', [
  /"test:unit":\s*"corepack pnpm -r --filter \\"\.\/artifacts\/\*\*\\" --if-present run test:unit"/,
]);

// ?? 21 Chat reconnect wiring (existence only) ????????????????????????????????

mustExist('artifacts/boltnew-app/src/lib/chat-pending-queue.ts', '21_chat_pending_queue');
mustExist('artifacts/boltnew-app/src/lib/signal-pending-queue.ts', '21_signal_pending_queue');
mustExist('artifacts/boltnew-app/src/__tests__/e2e-reconnect-guards.test.ts', '21_e2e_vitest_guards');

// ?? 22 Legacy KV cleanup on startup ??????????????????????????????????????????

mustMatch('artifacts/api-server/src/routes/db.ts', '22_cleanup_on_startup', [
  /cleanupLegacyTables\(\)/,
  /dbReadyPromise[\s\S]{0,120}\.then\(\(\) => cleanupLegacyTables\(\)\)/,
  /legacy_leftovers/,
]);

// ?? 27 Default white ProfileCards + isDarkTheme dark-neon only ???????????????

mustMatch('artifacts/boltnew-app/src/lib/theme.tsx', '27_isDarkTheme_dark_neon_only', [
  /export function isDarkTheme/,
  /return theme === 'dark-neon'/,
]);
mustMatch('artifacts/boltnew-app/src/lib/profile-card-theme.ts', '27_default_cards_stay_white', [
  /export function isProfileCardDark/,
  /theme === 'default'\) return false/,
  /theme === 'dark-neon'\) return true/,
  /bg-white border-gray-100/,
]);

// ?? 28 Tag catalog ? shared CORE groups, no cat face in picker ???????????????

mustMatch('artifacts/boltnew-app/src/lib/signal-match.ts', '28_ideal_feature_shared_core', [
  /export const IDEAL_TAG_GROUPS = \[\.\.\.CORE_TAG_GROUPS\]/,
  /export const FEATURE_TAG_GROUPS = \[\.\.\.CORE_TAG_GROUPS\]/,
]);
mustNotMatch('artifacts/boltnew-app/src/lib/signal-match.ts', '28_no_cat_face_in_core', [
  /label:\s*'\u{c5bc}\u{ad74}\u{c0c1} \u{1f440}',\s*tags:\s*\[[^\]]*'\u{ace0}\u{c591}\u{c774}\u{c0c1}'/u,
]);

// ?? 32 Chat image sessionToken auth (server route) ???????????????????????????

mustMatch('artifacts/api-server/src/routes/db.ts', '32_storage_image_session_query', [
  /req\.query\.sessionToken/,
  /verifySessionToken\(qUserId,\s*qSessionToken\)/,
]);

// ?? 33 Entry / waiting / main gate mapping (minimal) ?????????????????????????

mustMatch('artifacts/boltnew-app/src/components/EntryGateScreen.tsx', '33_entry_logo_tester', [
  /data-gate="entry-logo-tester"/,
  /verifyPanelPassword\('test'/,
  /navigateToAppPath\('test'\)/,
]);
mustNotMatch('artifacts/boltnew-app/src/components/EntryGateScreen.tsx', '33_entry_logo_not_direct', [
  /data-gate="entry-logo-tester"[\s\S]{0,200}onClick=\{\(\) => navigateToAppPath\('test'\)\}/,
]);
mustMatch('artifacts/boltnew-app/src/components/WaitingOverlay.tsx', '33_waiting_logo_tester', [
  /data-gate="waiting-logo-tester"/,
  /verifyPanelPassword\('test'/,
  /navigateToAppPath\('test'\)/,
]);
mustNotMatch('artifacts/boltnew-app/src/components/WaitingOverlay.tsx', '33_waiting_logo_not_direct', [
  /data-gate="waiting-logo-tester"[\s\S]{0,200}onClick=\{\(\) => navigateToAppPath\('test'\)\}/,
]);
mustNotMatch('artifacts/boltnew-app/src/components/ResetButton.tsx', '33_main_logo_not_tester', [
  /data-gate="logo-reset"[\s\S]{0,200}navigateToAppPath\('test'\)/,
  /openResetGate[\s\S]{0,80}navigateToAppPath\('test'\)/,
]);

console.log('\n=== verify-recurrence-guards ===\n');
for (const r of results) {
  console.log(`  ${r.ok ? 'OK' : 'FAIL'}  ${r.id}${r.detail && !r.ok ? ` ? ${r.detail}` : ''}`);
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.error(`\n${failed.length} guard(s) missing ? recurrence risk.\n`);
  process.exit(1);
}
console.log('\nAll recurrence guards present.\n');
