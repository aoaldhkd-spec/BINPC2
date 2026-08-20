#!/usr/bin/env node
/**
 * Recurrence guards ? high-value regressions only (CI smoke, not UI minutiae).
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

// ?? 01?04 SSE / reconnect / persist core ?????????????????????????????????????

mustMatch('artifacts/boltnew-app/src/lib/localdb.ts', '01_sse_localdb_80pct', [
  /SSE_TOKEN_REFRESH_LEAD_SEC/,
  /scheduleSseTokenRefresh/,
  /closeSse\('expired-token-close'\)/,
]);
mustMatch('scripts/endurance-5h.mjs', '01_sse_endurance_refresh', [
  /SSE_TOKEN_REFRESH_LEAD_SEC/,
  /ensureConnected/,
  /401/,
  /expiresAt/,
]);

mustMatch('artifacts/boltnew-app/src/lib/localdb.ts', '02_sse_origin_localdb', [/VITE_SSE_ORIGIN/, /SSE_ORIGIN/]);
mustMatch('netlify.toml', '02_sse_origin_netlify', [/VITE_SSE_ORIGIN\s*=\s*"https:\/\/binpc2\.onrender\.com"/]);
mustMatch('scripts/test-realtime-two-user.mjs', '02_sse_render_e2e', [
  /SSE_ORIGIN|SSE_API/,
  /`\$\{SSE_API\}\/events/,
  /binpc2\.onrender\.com/,
]);
mustNotMatch('scripts/test-realtime-two-user.mjs', '02_sse_not_netlify', [/\$\{API\}\/events/]);

mustMatch('scripts/endurance-5h.mjs', '03_functions_locked_skip', [
  /isOpFunctionsLocked/,
  /process\.exit\(2\)/,
  /result\.locked|locked: true/,
]);
mustMatch('scripts/lib/functions-lock.mjs', '03_functions_lock_helper', [/isOpFunctionsLocked/]);
mustMatch('artifacts/boltnew-app/src/lib/functions-lock.ts', '03_client_unlock_toast', [/FUNCTIONS_UNLOCK_TOAST/]);
mustMatch('artifacts/boltnew-app/src/App.tsx', '03_live_lock_sse', [
  /functions_locked/,
  /app-settings-user/,
  /functionsLockedPrevRef/,
]);
mustMatch('artifacts/boltnew-app/src/hooks/useChat.ts', '03_unlock_flush_chat_queue', [
  /functionsLocked/,
  /flushPendingQueue/,
  /isFunctionsLockedOpError/,
]);

mustMatch('scripts/endurance-5h.mjs', '04_sse_ensure_connected', [/await sseB\.ensureConnected\(\)|ensureConnected\(\)/]);

// ?? 05?07 Render / rate-limit / endurance recovery ???????????????????????????

mustExist('scripts/keep-api-warm.mjs', '05_keep_api_warm_script');
mustExist('.github/workflows/keep-api-warm.yml', '05_keep_api_warm_ci');
mustMatch('render.yaml', '05_single_render_instance', [/numInstances:\s*1/]);

mustMatch('scripts/endurance-5h.mjs', '06_rate_limit_single_instance', [
  /429|Rate limit/i,
  /numInstances:1|ONE endurance/i,
]);

mustMatch('scripts/endurance-5h.mjs', '07_admin_event_reset_recover', [
  /admin_event_end_reset/,
  /recoverContext|re-provisioning soak users/,
]);
mustExist('scripts/endurance-watchdog.mjs', '07b_endurance_watchdog');
mustMatch('scripts/endurance-5h.mjs', '07c_endurance_recover_403', [
  /isRecoverableOpFailure/,
  /recoverContext/,
  /FORBIDDEN/,
]);
mustMatch('scripts/endurance-5h.mjs', '07d_endurance_deadline_resume', [/ENDURANCE_DEADLINE_AT|deadlineAt/]);
mustMatch('scripts/endurance-5h.mjs', '07e_endurance_cycle_timeout', [
  /CYCLE_TIMEOUT_MS|ENDURANCE_CYCLE_TIMEOUT_MS/,
  /withTimeout/,
  /heartbeat/,
]);
mustMatch('scripts/endurance-watchdog.mjs', '07f_watchdog_detached_stall', [
  /detached:\s*true/,
  /STALL_MS|ENDURANCE_STALL_MS/,
  /heartbeatAt|heartbeatAge/,
]);
mustExist('scripts/start-endurance-8h.mjs', '07g_detached_8h_launcher');
mustMatch('scripts/start-endurance-8h.mjs', '07h_launcher_detached', [
  /detached:\s*true/,
  /ENDURANCE_SESSION_DEADLINE/,
]);

// ?? 08 Upload sessionToken (no raw fetch) ????????????????????????????????????

mustMatch('artifacts/boltnew-app/src/lib/localdb.ts', '08_upload_session_token', [
  /uploadStorageDataUrl/,
  /storage-upload[\s\S]*sessionToken/,
]);
mustMatch('artifacts/boltnew-app/src/components/MainScreen.tsx', '08_main_upload_helper', [/uploadStorageDataUrl/]);
mustNotMatch('artifacts/boltnew-app/src/components/MainScreen.tsx', '08_no_raw_storage_fetch', [
  /fetch\([^)]*['"]\/api\/db\/storage-upload/,
]);

// ?? 09 Load-venue p95 budgets (CI flake guard) ???????????????????????????????

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

// ?? 12 ProfileCard flip (core only ? sizing/mobile dropped) ??????????????????

mustMatch('artifacts/boltnew-app/src/components/ProfileCard.tsx', '12_profile_card_flip_bars_stay', [
  /showTopBar = hasTicker/,
  /showBottomBar = true/,
  /idealInsetTop = hasTicker \? 26 : 10/,
  /idealInsetBottom = 24/,
  /profile-card-photo-frame/,
  /profile-card-ticker-bar/,
  /profile-card-nick-bar/,
]);
mustNotMatch('artifacts/boltnew-app/src/components/ProfileCard.tsx', '12_profile_card_no_hide_bars_on_flip', [
  /showTopBar = hasTicker && !isFlipped/,
  /showBottomBar = !isFlipped/,
]);
mustMatch('artifacts/boltnew-app/src/__tests__/profile-card-lock.test.tsx', '12_profile_card_flip_tests', [
  /ticker \+ nick stay visible/,
  /paddingTop clears ticker/,
  /profile-card-photo-frame/,
  /from '\.\.\/components\/ProfileCard'/,
]);
mustNotMatch('artifacts/boltnew-app/src/__tests__/profile-card-lock.test.tsx', '12_profile_card_no_mainscreen_import', [
  /from '\.\.\/components\/MainScreen'/,
  /getBoundingClientRect\(\)\.height/,
]);

// ?? 13?14 Banned regressions / signal emoji ??????????????????????????????????

mustMatch('scripts/full-code-audit.mjs', '13_heart_balances_banned', [
  /heart_balances/,
  /BANNED_REGRESSION/,
]);
{
  const db = read('artifacts/api-server/src/routes/db.ts');
  const sigIdx = db.indexOf("table === 'signal_sends' && row.action === 'send'");
  const sigBlock = sigIdx >= 0 ? db.slice(sigIdx, sigIdx + 400) : '';
  const SIGNAL_PUSH = String.fromCodePoint(0x1f4e1);
  const HEART_PUSH = String.fromCodePoint(0x1f495);
  const GREEN_HEART = String.fromCodePoint(0x1f49a);
  const ok = sigIdx >= 0 && sigBlock.includes(SIGNAL_PUSH) && !sigBlock.includes(HEART_PUSH) && !sigBlock.includes(GREEN_HEART);
  results.push({
    id: '14_signal_emoji',
    ok,
    detail: ok ? 'signal_sends uses \u{1f4e1}' : 'signal_sends push emoji guard failed',
  });
}
mustNotMatch('artifacts/boltnew-app/src/App.tsx', '14_no_signal_nudge_banner', [/SignalNudgeBanner/]);

// ?? 15 verify:ci single entry (local ? GitHub parity) ????????????????????????

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

// ?? 16 Korean age (+1) ? lib + no inline reimplementation ?????????????????????

mustMatch('artifacts/boltnew-app/src/lib/korean-age.ts', '16_korean_age_client', [
  /koreanAgeFromBirthYear/,
  /\+\s*1/,
  /groupAgeDecadeBand/,
]);
mustMatch('artifacts/api-server/src/lib/korean-age.ts', '16_korean_age_server', [
  /koreanAgeFromBirthYear/,
  /\+\s*1/,
  /groupAgeDecadeBand/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '16_db_group_age', [/groupAgeDecadeBand/]);
mustNotMatch('artifacts/boltnew-app/src/lib/group-rooms.ts', '16_no_hardcoded_2026_age', [/2026\s*-\s*y\s*\+\s*1/]);
mustNotMatch('artifacts/api-server/src/routes/db.ts', '16_db_no_inline_age', [
  /getFullYear\(\)\s*-\s*y\s*\+\s*1/,
]);

// ?? 17 Supabase RLS startup ??????????????????????????????????????????????????

mustMatch('artifacts/api-server/src/routes/db.ts', '17_supabase_rls_startup', [
  /ensurePublicTableRls/,
  /ENABLE ROW LEVEL SECURITY/,
  /REVOKE ALL ON public/,
]);
mustExist('scripts/sql/enable-rls-public-tables.sql', '17_supabase_rls_sql');

// ?? 21 Chat disconnect / reconnect E2E wiring ????????????????????????????????

mustExist('scripts/test-chat-disconnect-recovery.mjs', '21_chat_disconnect_recovery');
mustExist('scripts/e2e-heart-sse-consistency.mjs', '21_e2e_heart_consistency_script');
mustExist('scripts/test-mutual-chat-hearts.mjs', '21_mutual_chat_hearts');
mustMatch('scripts/verify-all-features.mjs', '21_verify_all_e2e', [
  /test-chat-disconnect-recovery\.mjs/,
  /e2e-heart-sse-consistency\.mjs/,
  /test-mutual-chat-hearts\.mjs/,
]);
mustExist('artifacts/boltnew-app/src/lib/chat-pending-queue.ts', '21_chat_pending_queue');
mustExist('artifacts/boltnew-app/src/__tests__/e2e-reconnect-guards.test.ts', '21_e2e_vitest_guards');

// ?? 22 Legacy KV cleanup ?????????????????????????????????????????????????????

mustExist('artifacts/api-server/src/lib/db-legacy-cleanup.ts', '22_legacy_cleanup_lib');
mustMatch('artifacts/api-server/src/routes/db.ts', '22_cleanup_on_startup', [
  /cleanupLegacyTables\(\)/,
  /dbReadyPromise[\s\S]{0,120}\.then\(\(\) => cleanupLegacyTables\(\)\)/,
  /legacy_leftovers/,
]);
mustMatch('artifacts/api-server/src/lib/db-legacy-cleanup.ts', '22_legacy_blocklist', [
  /heart_balances/,
  /heart_drain_enabled/,
  /seats_snapshot/,
]);

// ?? 23 Test nicknames ? no trailing digit suffixes ???????????????????????????

mustMatch('scripts/lib/test-personas.mjs', '23_persona_no_digit_suffix_doc', [
  /NO numeric suffixes/,
  /nicknameEndsWithDigit/,
  /NICK_MODIFIERS/,
]);
mustNotMatch('scripts/lib/test-personas.mjs', '23_persona_no_padStart_digits', [
  /padStart\(/,
  /\$\{base\}\$\{suffix\}/,
]);
{
  const { makeNickname, reserveNickname, resetNicknameRegistry, nicknameEndsWithDigit } =
    await import('./lib/test-personas.mjs');
  resetNicknameRegistry();
  const samples = [];
  for (let i = 0; i < 80; i += 1) samples.push(makeNickname({ index: i, attempt: i % 5 }));
  for (let i = 0; i < 40; i += 1) samples.push(reserveNickname({ index: 1000 + i }));
  const bad = samples.filter((n) => nicknameEndsWithDigit(n) || /\d$/u.test(n));
  results.push({
    id: '23_persona_runtime_no_trailing_digits',
    ok: bad.length === 0,
    detail: bad.length ? `digit-tailed: ${bad.slice(0, 5).join(',')}` : '',
  });
}

// ?? 24 Participant list stable order (lib only ? unit tests cover details) ?????

mustExist('artifacts/boltnew-app/src/lib/profile-list-order.ts', '24_profile_list_order_lib');
mustMatch('artifacts/boltnew-app/src/lib/profile-list-order.ts', '24_profile_list_order_api', [
  /compareProfilesStable/,
  /sortProfilesStable/,
  /mergeProfilesPreserveOrder/,
  /patchProfileInPlace/,
]);
mustNotMatch('artifacts/boltnew-app/src/App.tsx', '24_app_no_blind_prepend', [
  /return \[incoming, \.\.\.prev\]/,
]);

// ?? 26 Tutorial ? hidden tips scroll only (controls/sizing dropped) ??????????

mustMatch('artifacts/boltnew-app/src/components/TutorialModal.tsx', '26_tutorial_hidden_tips_scroll', [
  /MODAL_SHELL_HIDDEN/,
  /scrollable: isHidden/,
  /overflow-y-auto overscroll-contain scrollbar-hide pb-\[max\(0\.75rem,var\(--safe-bottom/,
  /longDescTitle=/,
  /longDesc\?: boolean/,
]);

// ?? 27 Default theme ProfileCards stay white ?????????????????????????????????

mustExist('artifacts/boltnew-app/src/lib/profile-card-theme.ts', '27_profile_card_theme_lib');
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
mustNotMatch('artifacts/boltnew-app/src/lib/profile-card-theme.ts', '27_no_isDarkTheme_on_cards', [
  /isDarkTheme\(theme\) \|\| darkMode/,
]);
mustMatch('artifacts/boltnew-app/src/components/ProfileCard.tsx', '27_profile_card_uses_isProfileCardDark', [
  /isProfileCardDark\(theme, darkMode\)/,
  /profileCardSurfaces\(theme, darkMode\)/,
  /darkMode = false/,
]);

// ?? 28 Tag catalog ? banana/kiss core, no cat face, shared groups ????????????

mustMatch('artifacts/boltnew-app/src/lib/signal-match.ts', '28_talent_tag_catalog', [
  /label:\s*'\u{c7ac}\u{b2a5} \u{2b50}'/u,
  /'\u{d0a4}\u{c2a4}\u{c798}\u{d568}'/u,
  /'\u{1f34c} \u{bc14}\u{b098}\u{b098} \u{c798}\u{ba39}\u{c74c}'/u,
  /'\u{1f95b} \u{c6b0}\u{c720} \u{c798}\u{ba39}\u{c74c}'/u,
]);
mustNotMatch('artifacts/boltnew-app/src/lib/signal-match.ts', '28_no_cat_face_in_core', [
  /label:\s*'\u{c5bc}\u{ad74}\u{c0c1} \u{1f440}',\s*tags:\s*\[[^\]]*'\u{ace0}\u{c591}\u{c774}\u{c0c1}'/u,
]);
mustMatch('artifacts/boltnew-app/src/lib/signal-match.ts', '28_ideal_feature_shared_core', [
  /export const IDEAL_TAG_GROUPS = \[\.\.\.CORE_TAG_GROUPS\]/,
  /export const FEATURE_TAG_GROUPS = \[\.\.\.CORE_TAG_GROUPS\]/,
]);

// ?? 32 Chat image <img> sessionToken auth ????????????????????????????????????

mustMatch('artifacts/api-server/src/routes/db.ts', '32_storage_image_session_query', [
  /req\.query\.sessionToken/,
  /verifySessionToken\(qUserId,\s*qSessionToken\)/,
]);
mustMatch('artifacts/boltnew-app/src/lib/localdb.ts', '32_with_chat_image_auth', [
  /export function withChatImageAuth/,
  /sessionToken=/,
]);
mustMatch('artifacts/boltnew-app/src/components/ChatMessageRow.tsx', '32_chat_row_image_auth', [
  /withChatImageAuth/,
]);

// ?? 33 Entry / header gates (logo?test on entry only) ????????????????????????

mustMatch('artifacts/boltnew-app/src/components/EntryGateScreen.tsx', '33_entry_logo_tester', [
  /data-gate="entry-logo-tester"/,
  /navigateToAppPath\('test'\)/,
]);
mustMatch('artifacts/boltnew-app/src/components/WaitingOverlay.tsx', '33_waiting_logo_tester', [
  /data-gate="waiting-logo-tester"/,
  /navigateToAppPath\('test'\)/,
]);
mustNotMatch('artifacts/boltnew-app/src/components/WaitingOverlay.tsx', '33_waiting_logo_not_reset', [
  /data-gate="logo-reset"/,
]);
mustMatch('artifacts/boltnew-app/src/components/ResetButton.tsx', '33_user_header_gates', [
  /data-gate="logo-reset"/,
  /data-gate="npc-admin"/,
  /data-gate="sulbun-none"/,
  /openResetGate/,
  /openAdminGate/,
]);
mustNotMatch('artifacts/boltnew-app/src/components/ResetButton.tsx', '33_main_logo_not_tester', [
  /data-gate="logo-reset"[\s\S]{0,200}navigateToAppPath\('test'\)/,
  /openResetGate[\s\S]{0,80}navigateToAppPath\('test'\)/,
]);
mustMatch('artifacts/boltnew-app/src/components/ThemeSwitcher.tsx', '33_theme_after_profile', [
  /dataset\.appReady === '1'/,
  /if \(!appReady\) return null/,
]);
mustMatch('artifacts/boltnew-app/src/App.tsx', '33_app_ready_gate', [
  /dataset\.appReady = '1'/,
  /!showEntryGate/,
  /!showNicknameSetup/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '33_admin_fixed_nick_server', [
  /ADMIN_FIXED_NICKNAME/,
  /withFixedAdminNickname/,
  /admin_event_end_reset/,
]);
mustMatch('artifacts/boltnew-app/src/AdminApp.tsx', '33_admin_nick_restore_client', [
  /ADMIN_FIXED_NICKNAME/,
  /restoreAdminProfileAfterWipe/,
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
