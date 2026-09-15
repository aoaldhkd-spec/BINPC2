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
mustMatch('artifacts/api-server/src/routes/db.ts', '07_admin_wipe_reset_signal', [
  /admin_clear_profiles/,
  /bumpResetSignalAndBroadcast/,
  /test_wipe_all/,
]);
mustMatch('artifacts/boltnew-app/src/App.tsx', '07_reset_signal_reload_profiles', [
  /applyResetSignal/,
  /loadProfilesRef\.current\(\)/,
  /MATCHING_PROFILES_CACHE_KEY/,
]);
mustMatch('artifacts/boltnew-app/src/TestDashboard.tsx', '07_test_dashboard_reset_sse', [
  /test_wipe_all/,
  /reset_signal/,
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
mustExist('artifacts/boltnew-app/src/__tests__/e2e-reconnect-guards.test.ts', '21_e2e_vitest_guards');

// ?? 22 Legacy KV cleanup on startup ??????????????????????????????????????????

mustMatch('artifacts/api-server/src/routes/db.ts', '22_cleanup_on_startup', [
  /cleanupLegacyTables\(\)/,
  /dbReadyPromise[\s\S]{0,120}\.then\(\(\) => cleanupLegacyTables\(\)\)/,
  /legacy_leftovers/,
]);

// ?? 27 Default white ProfileCards + isDarkTheme dark-neon only ???????????????

mustMatch('artifacts/boltnew-app/src/lib/theme.tsx', '27_legacy_theme_cleanup_only', [
  /export function clearLegacyThemeArtifacts/,
  /app_theme_mode_v1/,
]);
mustNotMatch('artifacts/boltnew-app/src/lib/theme.tsx', '27_no_multi_theme_provider', [
  /ThemeProvider/,
  /isDarkTheme/,
]);
mustMatch('artifacts/boltnew-app/src/lib/profile-card-theme.ts', '27_profile_cards_follow_darkMode', [
  /export function isProfileCardDark/,
  /return darkMode/,
  /bg-white border-gray-100/,
]);
mustNotMatch('artifacts/boltnew-app/src/main.tsx', '27_no_theme_switcher_mount', [
  /ThemeSwitcher/,
  /ThemeProvider/,
]);

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

// ?? 34 ??NPC seed + NPC relationship reset ???????????????????????????????

mustMatch('artifacts/api-server/src/routes/db.ts', '34_ensure_admin_npc_profile', [
  /ensureAdminProfile/,
  /clearAdminNpcRelationships/,
  /deterministicAdminProfileId/,
]);
mustMatch('artifacts/api-server/src/lib/db-chat-ids.ts', '34_deterministic_admin_profile_id', [
  /deterministicAdminProfileId/,
]);
mustMatch('artifacts/boltnew-app/src/hooks/useHearts.ts', '34_handle_like_profile_hint', [
  /_profileMap\.get\(profileId\)/,
  /hint\?: Profile/,
]);

// ?? 35 Mobile heart confirm overlay (ThemeSwitcher z-9998 must not block taps) ??????

mustMatch('artifacts/boltnew-app/src/components/LikeConfirmDialog.tsx', '35_like_confirm_above_fabs', [
  /z-\[10070\]/,
  /bindMobileTap/,
  /selectedRef/,
]);
mustMatch('artifacts/boltnew-app/src/hooks/useHearts.ts', '35_ensure_write_session_before_like', [
  /ensureWriteSession/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '35_bearer_over_stale_cookie', [
  /verifySessionToken\(claimed, token\)/,
  /Verified bearer wins over connect\.sid/,
]);
mustMatch('artifacts/boltnew-app/src/lib/localdb.ts', '35_auth_retry_403_forbidden', [
  /requesterId must match/,
  /FUNCTIONS_LOCKED/,
]);
mustMatch('artifacts/boltnew-app/src/App.tsx', '35_like_confirm_body_overlay', [
  /dataset\.overlay = 'like-confirm'/,
]);
mustMatch('artifacts/boltnew-app/src/index.css', '35_like_confirm_hide_fabs', [
  /data-overlay="like-confirm"/,
  /\.participant-fab-my/,
]);
mustNotMatch('artifacts/boltnew-app/src/index.css', '35_no_theme_switcher_css', [
  /theme-switcher/,
]);
mustMatch('artifacts/boltnew-app/src/components/ProfileCard.tsx', '35_profile_card_mobile_tap', [
  /bindMobileTap/,
  /profile-card-heart-btn/,
  /onLike\(profile\.id, profile\)/,
]);
mustMatch('artifacts/boltnew-app/src/components/ProfileCard.tsx', '37_card_menu_mobile_tap', [
  /profile-card-menu-btn/,
  /data-profile-card-menu-trigger/,
  /bindMobileTap\(\(e\) => openMenuFromButton/,
  /runMenuAction/,
  /openMenuFromButton/,
  /closeCardMenu/,
]);
mustMatch('artifacts/boltnew-app/src/components/ProfileCard.tsx', '39_card_menu_absolute_dropdown', [
  /profile-card-menu/,
  /top-full/,
  /mt-0\.5/,
  /mt-1/,
  /right-0/,
  /z-\[99999\]/,
  /overflow-visible/,
  /renderMenuDropdown/,
  /menuAnchorId/,
]);
mustNotMatch('artifacts/boltnew-app/src/components/ProfileCard.tsx', '39_card_menu_no_portal', [
  /createPortal/,
  /getBoundingClientRect/,
  /pendingMenuPos/,
  /cardMenuBox/,
]);
mustMatch('artifacts/boltnew-app/src/hooks/useChat.ts', '37_chat_ensure_write_session', [
  /ensureWriteSession/,
]);
mustMatch('artifacts/boltnew-app/src/App.tsx', '37_block_ensure_write_session', [
  /handleBlock[\s\S]*ensureWriteSession/,
  /handleUnblock[\s\S]*ensureWriteSession/,
]);
mustMatch('artifacts/boltnew-app/src/hooks/useHearts.ts', '37_contact_share_ensure_write_session', [
  /handleContactShare[\s\S]*ensureWriteSession/,
]);
mustMatch('artifacts/boltnew-app/src/components/ProfileDeckGrid.tsx', '37_fortune_menu_birth_gate', [
  /hasProfileFortuneCompatData/,
  /onViewFortune/,
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

mustMatch('artifacts/boltnew-app/src/lib/panel-password.ts', '36_panel_pin_input_props', [
  /export const PANEL_PIN_INPUT_PROPS/,
  /export const PANEL_PIN_INPUT_PROPS/,
  /export const PIN_DIGIT_INPUT_PROPS/,
  /inputMode:\s*'numeric'/,
  /pattern:\s*'\[0-9\]\*'/,
]);
mustMatch('artifacts/boltnew-app/src/components/ResetButton.tsx', '36_reset_gate_numeric_keyboard', [
  /PANEL_PIN_INPUT_PROPS/,
]);
mustMatch('artifacts/boltnew-app/src/components/WaitingOverlay.tsx', '36_waiting_gate_numeric_keyboard', [
  /PANEL_PIN_INPUT_PROPS/,
  /PIN_DIGIT_INPUT_PROPS/,
]);
mustMatch('artifacts/boltnew-app/src/components/EntryGateScreen.tsx', '36_entry_gate_numeric_keyboard', [
  /type=\{showPw \? 'text' : 'password'\}[\s\S]{0,80}PANEL_PIN_INPUT_PROPS/,
  /PANEL_PIN_INPUT_PROPS/,
]);
mustMatch('artifacts/boltnew-app/src/components/ProfileRecoveryScreen.tsx', '36_profile_recovery_numeric_keyboard', [
  /PIN_DIGIT_INPUT_PROPS/,
]);

// ?? 37 Entry avatar ? server-side unique preset assign on profile INSERT ?????
mustMatch('artifacts/api-server/src/routes/db.ts', '37_entry_avatar_assign', [
  /resolveEntryAvatar/,
  /entry_avatar_assign/,
  /collectUsedPresetAvatarIds/,
]);
mustMatch('artifacts/boltnew-app/src/lib/nickname-registration.ts', '37_entry_no_client_avatar', [
  /server assigns a unique preset avatar/,
]);
mustNotMatch('artifacts/boltnew-app/src/hooks/useNicknameRegistration.ts', '37_entry_no_client_photo_url_stamp', [
  /photo_url:\s*['"]/,
  /genNpcTextAvatar/,
]);

// ?? 38 Parallel-push integration atomicity (db.ts import <-> module, ProfileCard <-> profile.ts) ?

mustExist('artifacts/api-server/src/lib/avatar-pool.ts', '38_avatar_pool_module');
mustExist('artifacts/api-server/src/lib/avatar-pool.test.ts', '38_avatar_pool_tests');
mustMatch('artifacts/api-server/src/routes/db.ts', '38_db_imports_avatar_pool', [
  /from '\.\.\/lib\/avatar-pool'/,
  /resolveEntryAvatar/,
]);
mustMatch('artifacts/boltnew-app/src/lib/profile.ts', '38_avatar_gradient_export', [
  /export function getAvatarGradientCssForProfile/,
]);
mustMatch('artifacts/boltnew-app/src/components/ProfileCard.tsx', '38_profile_card_uses_gradient', [
  /getAvatarGradientCssForProfile\(profile\)/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '38_db_single_router_export', [
  /export default router;\s*$/,
]);
mustNotMatch('artifacts/api-server/src/routes/db.ts', '38_db_no_duplicate_router_export', [
  /export default router[\s\S]*export default router/,
]);
mustMatch('artifacts/boltnew-app/src/hooks/useChat.ts', '40_load_chat_list_hide_empty', [
  /messageCount \?\? 0\) > 0/,
  /withMessages/,
]);
mustMatch('artifacts/boltnew-app/src/AdminApp.tsx', '40_admin_chats_with_messages', [
  /directChatsWithMessages/,
  /chatIdsWithMsgs/,
]);

// ?? 41 Participant received-likes UPDATE incremental (no full refetch storm) ???
mustExist('artifacts/boltnew-app/src/lib/received-like-update.ts', '41_received_like_update_module');
mustExist('artifacts/boltnew-app/src/lib/received-like-update.test.ts', '41_received_like_update_tests');
mustMatch('artifacts/boltnew-app/src/hooks/useHeartsRealtimeApply.ts', '41_received_likes_update_incremental', [
  /planReceivedLikeUpdate/,
  /preferReceivedHeartType/,
]);
mustNotMatch('artifacts/boltnew-app/src/App.tsx', '41_no_received_likes_update_blind_refetch', [
  /liked_id=eq\.\$\{currentUserId\}` \},\s*\(\) => \{ loadReceivedLikesRef/,
]);
mustMatch('artifacts/boltnew-app/src/lib/sse-fallback-poll.ts', '41_fallback_poll_skips_when_sse_healthy', [
  /skipReason:\s*'sse-healthy'/,
  /if \(input\.sseHealthy\) return/,
]);
mustMatch('artifacts/boltnew-app/src/hooks/useSseFallbackPoll.ts', '41_fallback_poll_hook_uses_health_plan', [
  /planSseFallbackTick/,
  /isSseHealthy\(\)/,
  /loadReceivedLikes/,
]);


// ?? 42 Open-room message page bound + participant SoT coalesce ???????????????
mustExist('artifacts/boltnew-app/src/lib/chat-message-page.ts', '42_chat_message_page_module');
mustExist('artifacts/boltnew-app/src/lib/chat-message-page.test.ts', '42_chat_message_page_tests');
mustExist('artifacts/boltnew-app/src/lib/participant-sot-resync.ts', '42_participant_sot_resync_module');
mustExist('artifacts/boltnew-app/src/lib/participant-sot-resync.test.ts', '42_participant_sot_resync_tests');
mustMatch('artifacts/boltnew-app/src/hooks/useChat.ts', '42_messages_bounded_initial_page', [
  /MESSAGE_PAGE_SIZE/,
  /normalizeDescMessagePage/,
  /\.order\('created_at',\s*\{\s*ascending:\s*false\s*\}\)/,
  /\.limit\(MESSAGE_PAGE_SIZE\)/,
]);
mustNotMatch('artifacts/boltnew-app/src/hooks/useChat.ts', '42_no_blind_full_history_asc_select', [
  /from\('messages'\)\.select\('\*'\)[\s\S]{0,220}\.order\('created_at',\s*\{\s*ascending:\s*true\s*\}\)\s*;/,
]);
mustMatch('artifacts/boltnew-app/src/hooks/useParticipantSoTResync.ts', '42_participant_sot_plan_on_reconnect', [
  /planParticipantSoTReload/,
  /trigger:\s*'sse-reconnect'/,
  /trigger:\s*'visibility'/,
]);
mustMatch('artifacts/boltnew-app/src/lib/localdb.ts', '42_localdb_lt_filter', [
  /type:\s*'lt'/,
  /lt\(col: string, val: unknown\)/,
]);
mustMatch('artifacts/api-server/src/lib/db-op-filters.ts', '42_server_lt_filter', [
  /type:\s*'lt'/,
  /f\.type === 'lt' \|\| f\.type === 'gt'/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '42_db_imports_op_filters', [
  /from '\.\.\/lib\/db-op-filters'/,
  /applyFilters/,
]);


// ?? 43 Whole-app SoT peel + chat-list select bound + session-ready planner ????
mustExist('artifacts/boltnew-app/src/hooks/useParticipantSoTResync.ts', '43_use_participant_sot_resync_hook');
mustExist('artifacts/boltnew-app/src/lib/session-ready-settings.ts', '43_session_ready_settings_module');
mustExist('artifacts/boltnew-app/src/lib/session-ready-settings.test.ts', '43_session_ready_settings_tests');
mustMatch('artifacts/boltnew-app/src/lib/participant-sot-resync.ts', '43_participant_sot_domains_runner', [
  /planParticipantSoTDomains/,
  /runParticipantSoTReload/,
  /'contactShares'/,
  /'sessionReady'/,
]);
mustMatch('artifacts/boltnew-app/src/App.tsx', '43_app_wires_sot_hook_callbacks_only', [
  /useParticipantSoTResync/,
  /applySessionReady/,
]);
mustNotMatch('artifacts/boltnew-app/src/App.tsx', '43_app_no_inline_sot_visibility_effect', [
  /handleVisibilityChange/,
  /lastParticipantSoTAtRef/,
]);
mustMatch('artifacts/boltnew-app/src/hooks/useChat.ts', '43_chat_list_bounded_select', [
  /CHAT_LIST_SELECT/,
  /from\('chats'\)\.select\(CHAT_LIST_SELECT\)/,
]);
mustNotMatch('artifacts/boltnew-app/src/hooks/useChat.ts', '43_chat_list_no_select_star', [
  /from\('chats'\)\.select\('\*'\)/,
]);
mustMatch('ARCHITECTURE.md', '43_architecture_whole_app_skeleton', [
  /Whole-app attach \/ detach skeleton/,
  /NOT chat-only/,
  /useParticipantSoTResync/,
  /session-ready-settings/,
]);




// ?? 44 App peel wave: SSE fallback + heart/contact planners + lock/signal helpers ??
mustExist('artifacts/boltnew-app/src/hooks/useSseFallbackPoll.ts', '44_use_sse_fallback_poll_hook');
mustExist('artifacts/boltnew-app/src/lib/sse-fallback-poll.ts', '44_sse_fallback_poll_module');
mustExist('artifacts/boltnew-app/src/lib/sse-fallback-poll.test.ts', '44_sse_fallback_poll_tests');
mustExist('artifacts/boltnew-app/src/lib/sent-like-insert.ts', '44_sent_like_insert_module');
mustExist('artifacts/boltnew-app/src/lib/sent-like-insert.test.ts', '44_sent_like_insert_tests');
mustExist('artifacts/boltnew-app/src/lib/contact-share-event.ts', '44_contact_share_event_module');
mustExist('artifacts/boltnew-app/src/lib/contact-share-event.test.ts', '44_contact_share_event_tests');
mustExist('artifacts/boltnew-app/src/lib/pending-hearts.ts', '44_pending_hearts_module');
mustExist('artifacts/boltnew-app/src/lib/pending-hearts.test.ts', '44_pending_hearts_tests');
mustExist('artifacts/boltnew-app/src/lib/user-signal-merge.ts', '44_user_signal_merge_module');
mustExist('artifacts/boltnew-app/src/lib/realtime-row-upsert.ts', '44_realtime_row_upsert_module');
mustExist('artifacts/boltnew-app/src/lib/settings-ready-poll.ts', '44_settings_ready_poll_module');
mustExist('artifacts/boltnew-app/src/lib/profile-view-record.ts', '44_profile_view_record_module');
mustExist('artifacts/boltnew-app/src/lib/notification-active.ts', '44_notification_active_module');
mustMatch('artifacts/boltnew-app/src/App.tsx', '44_app_wires_sse_fallback_hook', [
  /useSseFallbackPoll/,
  /useHeartsRealtimeApply/,
  /planContactShareEvent/,
  /countPendingHearts/,
  /planFunctionsLockTransition/,
  /mergeUserSignalRow/,
]);
mustMatch('artifacts/boltnew-app/src/hooks/useHeartsRealtimeApply.ts', '44_hearts_apply_owns_sent_like_planner', [
  /planSentLikeInsert/,
]);
mustNotMatch('artifacts/boltnew-app/src/App.tsx', '44_app_no_inline_sse_fallback_interval', [
  /setInterval\(tick,\s*connStatus === 'error' \? 5_000 : 8_000\)/,
]);
mustMatch('artifacts/boltnew-app/src/lib/heart-toast.ts', '44_incoming_heart_notif_planner', [
  /planIncomingHeartBottomNotif/,
]);
mustMatch('artifacts/boltnew-app/src/lib/functions-lock.ts', '44_functions_lock_transition_planner', [
  /planFunctionsLockTransition/,
]);
mustMatch('artifacts/boltnew-app/src/lib/entry-gate.ts', '44_entry_password_reset_planners', [
  /planEntryPasswordState/,
  /shouldApplyAdminResetSignal/,
]);
mustExist('artifacts/boltnew-app/src/hooks/useDarkModeStorageSync.ts', '44_use_dark_mode_storage_sync');
mustMatch('artifacts/boltnew-app/src/App.tsx', '44_app_wires_dark_mode_sync_hook', [
  /useDarkModeStorageSync/,
]);
mustMatch('ARCHITECTURE.md', '44_architecture_app_peel_progress', [
  /App peel progress/,
  /useSseFallbackPoll/,
  /sent-like-insert/,
]);

// ?? 45 App peel: useUserRealtimeChannel fan-in + profile/block planners ??????????
mustExist('artifacts/boltnew-app/src/hooks/useUserRealtimeChannel.ts', '45_use_user_realtime_channel_hook');
mustExist('artifacts/boltnew-app/src/lib/profile-realtime-apply.ts', '45_profile_realtime_apply_module');
mustExist('artifacts/boltnew-app/src/lib/profile-realtime-apply.test.ts', '45_profile_realtime_apply_tests');
mustExist('artifacts/boltnew-app/src/lib/block-action.ts', '45_block_action_module');
mustExist('artifacts/boltnew-app/src/lib/block-action.test.ts', '45_block_action_tests');
mustMatch('artifacts/boltnew-app/src/hooks/useUserRealtimeChannel.ts', '45_hook_subscribes_profiles_and_user_bundle', [
  /realtime:profiles/,
  /realtime:user-bundle:/,
  /onSentLikeInsert/,
  /onContactShareInsert/,
]);
mustMatch('artifacts/boltnew-app/src/App.tsx', '45_app_wires_user_realtime_apply_callbacks', [
  /useUserRealtimeChannel/,
  /planProfilesAfterInsert/,
  /useHeartsRealtimeApply/,
  /\.\.\.heartsRealtimeApply/,
  /shouldSkipBlock/,
  /buildBlockedUserRow/,
]);
mustNotMatch('artifacts/boltnew-app/src/App.tsx', '45_app_no_inline_profiles_or_user_bundle_channel', [
  /channel\('realtime:profiles'\)/,
  /realtime:user-bundle:/,
]);
mustMatch('ARCHITECTURE.md', '45_architecture_user_realtime_peel', [
  /useUserRealtimeChannel/,
  /incremental/,
]);



// ?? 46 App peel: shell + privacy/signals realtime channels + settings planner ??????????
mustExist('artifacts/boltnew-app/src/hooks/useAppShellRealtimeChannels.ts', '46_use_app_shell_realtime_channels_hook');
mustExist('artifacts/boltnew-app/src/lib/app-settings-realtime.ts', '46_app_settings_realtime_module');
mustExist('artifacts/boltnew-app/src/lib/app-settings-realtime.test.ts', '46_app_settings_realtime_tests');
mustMatch('artifacts/boltnew-app/src/hooks/useAppShellRealtimeChannels.ts', '46_hook_subscribes_settings_notif_contact_events', [
  /app-settings-user/,
  /notifications-user/,
  /contact-share-events-user/,
  /onAppSettingsUpdate/,
  /onBroadcastNotifInsert/,
  /onContactShareEventInsert/,
]);
mustMatch('artifacts/boltnew-app/src/hooks/useUserRealtimeChannel.ts', '46_hook_subscribes_privacy_and_signals', [
  /privacy-\$\{uid\}/,
  /user-signals-all/,
  /onBlockedUserInsert/,
  /onUserSignalInsert/,
]);
mustMatch('artifacts/boltnew-app/src/App.tsx', '46_app_wires_shell_and_privacy_apply_callbacks', [
  /useAppShellRealtimeChannels/,
  /planAppSettingsRealtimeUpdate/,
  /onBlockedUserInsert/,
  /onUserSignalInsert/,
  /onBroadcastNotifInsert/,
]);
mustNotMatch('artifacts/boltnew-app/src/App.tsx', '46_app_no_inline_shell_privacy_signals_channels', [
  /channel\('app-settings-user'\)/,
  /channel\('notifications-user'\)/,
  /channel\('contact-share-events-user'\)/,
  /channel\(`privacy-\$\{/,
  /channel\('user-signals-all'\)/,
]);
mustMatch('ARCHITECTURE.md', '46_architecture_shell_realtime_peel', [
  /useAppShellRealtimeChannels/,
  /app-settings-realtime/,
  /incremental/,
]);




// --- 47 App peel: admin wipe + /ready bootstrap + profile boot + entry gates ---
mustExist('artifacts/boltnew-app/src/lib/admin-reset-wipe.ts', '47_admin_reset_wipe_module');
mustExist('artifacts/boltnew-app/src/lib/admin-reset-wipe.test.ts', '47_admin_reset_wipe_tests');
mustExist('artifacts/boltnew-app/src/lib/ready-bootstrap-settings.ts', '47_ready_bootstrap_settings_module');
mustExist('artifacts/boltnew-app/src/lib/ready-bootstrap-settings.test.ts', '47_ready_bootstrap_settings_tests');
mustExist('artifacts/boltnew-app/src/lib/profile-boot-machine.ts', '47_profile_boot_machine_module');
mustExist('artifacts/boltnew-app/src/lib/profile-boot-machine.test.ts', '47_profile_boot_machine_tests');
mustExist('artifacts/boltnew-app/src/hooks/useSessionReadyBootstrap.ts', '47_use_session_ready_bootstrap_hook');
mustExist('artifacts/boltnew-app/src/hooks/useProfileBootMachine.ts', '47_use_profile_boot_machine_hook');
mustExist('artifacts/boltnew-app/src/components/AppEntryGates.tsx', '47_app_entry_gates_module');
mustMatch('artifacts/boltnew-app/src/lib/admin-reset-wipe.ts', '47_admin_reset_wipe_plan_run', [
  /planAdminResetWipe/,
  /runAdminResetWipe/,
  /MATCHING_USER_KEY/,
  /MATCHING_PROFILES_CACHE_KEY/,
]);
mustMatch('artifacts/boltnew-app/src/lib/ready-bootstrap-settings.ts', '47_ready_bootstrap_planners', [
  /planReadyBootstrapApply/,
  /planReadyBootstrapSafety/,
  /planReadyBootstrapRetry/,
  /pickReadyBootstrapSettings/,
]);
mustMatch('artifacts/boltnew-app/src/lib/profile-boot-machine.ts', '47_profile_boot_decisions', [
  /planProfileBootCacheHit/,
  /planProfileBootFetchResult/,
  /recover-cleared/,
  /recover-exhausted/,
]);
mustMatch('artifacts/boltnew-app/src/App.tsx', '47_app_wires_bootstrap_boot_wipe_gates', [
  /useSessionReadyBootstrap/,
  /useProfileBootMachine/,
  /planAdminResetWipe/,
  /runAdminResetWipe/,
  /applyResetSignal/,
  /renderAppEntryGates/,
  /loadProfilesRef\.current\(\)/,
]);
mustNotMatch('artifacts/boltnew-app/src/App.tsx', '47_app_no_inline_ready_poll_or_profile_boot_effect', [
  /shouldRunSettingsReadyPoll/,
  /setInterval\(\(\) => \{\s*if \(pollTick\(\)\)/,
  /MAX_ATTEMPTS = 8/,
]);
mustMatch('ARCHITECTURE.md', '47_architecture_path_to_9_5', [
  /useSessionReadyBootstrap/,
  /useProfileBootMachine/,
  /admin-reset-wipe/,
  /AppEntryGates/,
  /~9\.5/,
  /db\.ts/,
]);



// --- 48 App main/overlay JSX fan-in + api-server db.ts start peel ---
mustExist('artifacts/boltnew-app/src/components/AppMainShell.tsx', '48_app_main_shell_module');
mustExist('artifacts/boltnew-app/src/components/AppOverlays.tsx', '48_app_overlays_module');
mustExist('artifacts/api-server/src/lib/db-op-filters.ts', '48_db_op_filters_module');
mustExist('artifacts/api-server/src/lib/db-op-filters.test.ts', '48_db_op_filters_tests');
mustExist('artifacts/api-server/src/lib/db-panel-secrets.ts', '48_db_panel_secrets_module');
mustExist('artifacts/api-server/src/lib/db-panel-secrets.test.ts', '48_db_panel_secrets_tests');
mustMatch('artifacts/boltnew-app/src/App.tsx', '48_app_wires_main_shell_and_overlays', [
  /AppMainShell/,
  /AppOverlays/,
  /renderAppEntryGates/,
]);
mustNotMatch('artifacts/boltnew-app/src/App.tsx', '48_app_no_inline_mainscreen_jsx', [
  /<MainScreen\b/,
]);
mustNotMatch('artifacts/boltnew-app/src/App.tsx', '48_app_no_inline_reconnect_or_notif_modal', [
  /<ReconnectOverlay\b/,
  /<NotifModal\b/,
  /<ProfileDetail\b/,
  /<ChatScreen\b/,
]);
mustMatch('artifacts/boltnew-app/src/components/AppMainShell.tsx', '48_main_shell_keeps_inert_mainscreen', [
  /inert=\{isSubScreen/,
  /<MainScreen/,
  /pointer-events-none/,
]);
mustMatch('artifacts/boltnew-app/src/components/AppOverlays.tsx', '48_overlays_keep_korean_and_modals', [
  /하트를 거절했습니다/,
  /채팅방 열는 중/,
  /LikeConfirmDialog/,
  /FortuneTabLazy/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '48_db_reexports_stable_via_import', [
  /from '\.\.\/lib\/db-op-filters'/,
  /from '\.\.\/lib\/db-panel-secrets'/,
  /PANEL_DEFAULT_PASSWORD/,
  /applyFilters/,
  /panelSecretsForRuntime/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '48_db_still_single_router_export', [
  /export default router;\s*$/,
]);
mustNotMatch('artifacts/api-server/src/routes/db.ts', '48_db_no_inline_filter_or_collect_secrets', [
  /function applyFilters\(/,
  /function collectSecrets\(/,
  /function matchFilter\(/,
]);
mustMatch('ARCHITECTURE.md', '48_architecture_path_after_shell_db_peel', [
  /AppMainShell/,
  /AppOverlays/,
  /db-op-filters/,
  /db-panel-secrets/,
  /~9\.5/,
  /8\.[567]/,
]);


// --- 49 Hearts/group apply+guards + db sse-ring/merged-id/table-policy ---
mustExist('artifacts/boltnew-app/src/hooks/useHeartsRealtimeApply.ts', '49_hearts_realtime_apply_hook');
mustExist('artifacts/boltnew-app/src/hooks/useSocialLockGuards.ts', '49_social_lock_guards_hook');
mustExist('artifacts/api-server/src/lib/db-sse-ring.ts', '49_db_sse_ring_module');
mustExist('artifacts/api-server/src/lib/db-sse-ring.test.ts', '49_db_sse_ring_tests');
mustExist('artifacts/api-server/src/lib/db-merged-id-map.ts', '49_db_merged_id_map_module');
mustExist('artifacts/api-server/src/lib/db-merged-id-map.test.ts', '49_db_merged_id_map_tests');
mustExist('artifacts/api-server/src/lib/db-table-policy.ts', '49_db_table_policy_module');
mustExist('artifacts/api-server/src/lib/db-table-policy.test.ts', '49_db_table_policy_tests');
mustMatch('artifacts/boltnew-app/src/App.tsx', '49_app_wires_hearts_apply_and_social_guards', [
  /useHeartsRealtimeApply/,
  /useSocialLockGuards/,
  /\.\.\.heartsRealtimeApply/,
  /handleMainJoinGroupChat/,
  /execLikeGuarded/,
]);
mustNotMatch('artifacts/boltnew-app/src/App.tsx', '49_app_no_inline_hearts_sse_planners', [
  /planSentLikeInsert/,
  /planReceivedLikeUpdate/,
  /planIncomingHeartBottomNotif/,
  /MUTUAL_HEART_TOAST/,
  /traceRealtimeStateMerge/,
]);
mustMatch('artifacts/boltnew-app/src/hooks/useHeartsRealtimeApply.ts', '49_hearts_apply_keeps_mutual_and_incoming', [
  /MUTUAL_HEART_TOAST/,
  /planIncomingHeartBottomNotif/,
  /planSentLikeInsert/,
  /planReceivedLikeUpdate/,
]);
mustMatch('artifacts/boltnew-app/src/hooks/useSocialLockGuards.ts', '49_social_guards_gate_group_join', [
  /joinGroupChatGuarded/,
  /functionsLockedRef/,
  /openGroupChat/,
  /setView\('group-chat'\)/,
]);
mustMatch('artifacts/boltnew-app/src/hooks/useChat.ts', '49_chat_message_row_select_narrowed', [
  /MESSAGE_ROW_SELECT/,
  /\.select\(MESSAGE_ROW_SELECT\)/,
]);
mustNotMatch('artifacts/boltnew-app/src/hooks/useChat.ts', '49_chat_no_messages_select_star', [
  /from\('messages'\)\.select\('\*'\)/,
]);
mustMatch('artifacts/boltnew-app/src/hooks/useGroupChat.ts', '49_group_selects_narrowed', [
  /GROUP_MESSAGE_ROW_SELECT/,
  /GROUP_PARTICIPANT_SELECT/,
  /GROUP_CHAT_LIST_SELECT/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '49_db_reimports_ring_map_policy', [
  /from '\.\.\/lib\/db-sse-ring'/,
  /from '\.\.\/lib\/db-merged-id-map'/,
  /from '\.\.\/lib\/db-table-policy'/,
  /createSseRing/,
  /createMergedIdMap/,
  /ALLOWED_OP_TABLES/,
  /CRITICAL_PERSIST_TABLES/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '49_db_still_single_router_export', [
  /export default router;\s*$/,
]);
mustNotMatch('artifacts/api-server/src/routes/db.ts', '49_db_no_inline_ring_or_allowed_set', [
  /function _ringAdd\(/,
  /const ALLOWED_OP_TABLES = new Set\(/,
  /const CRITICAL_PERSIST_TABLES = new Set\(/,
  /const _sseRingBuffer/,
]);
mustMatch('ARCHITECTURE.md', '49_architecture_path_after_hearts_db_peel', [
  /useHeartsRealtimeApply/,
  /useSocialLockGuards/,
  /db-sse-ring/,
  /db-merged-id-map/,
  /db-table-policy/,
  /~9\.0/,
  /~9\.5/,
]);


// --- 50 Nickname/registration + profile/privacy loaders + db fanout/op-request ---
mustExist('artifacts/boltnew-app/src/hooks/useNicknameRegistration.ts', '50_nickname_registration_hook');
mustExist('artifacts/boltnew-app/src/hooks/useProfilePrivacyLoaders.ts', '50_profile_privacy_loaders_hook');
mustExist('artifacts/boltnew-app/src/lib/nickname-registration.ts', '50_nickname_registration_planners');
mustExist('artifacts/boltnew-app/src/lib/nickname-registration.test.ts', '50_nickname_registration_tests');
mustExist('artifacts/boltnew-app/src/lib/profile-select.ts', '50_profile_select_columns');
mustExist('artifacts/api-server/src/lib/db-sse-fanout-policy.ts', '50_db_sse_fanout_policy_module');
mustExist('artifacts/api-server/src/lib/db-sse-fanout-policy.test.ts', '50_db_sse_fanout_policy_tests');
mustExist('artifacts/api-server/src/lib/db-op-request.ts', '50_db_op_request_module');
mustExist('artifacts/api-server/src/lib/db-op-request.test.ts', '50_db_op_request_tests');
mustMatch('artifacts/boltnew-app/src/App.tsx', '50_app_wires_registration_and_privacy_loaders', [
  /useNicknameRegistration/,
  /useProfilePrivacyLoaders/,
  /handleNicknameSetup/,
  /handleProfileRecovery/,
  /refreshProfilesTab/,
  /PROFILE_ROW_SELECT/,
]);
mustNotMatch('artifacts/boltnew-app/src/App.tsx', '50_app_no_inline_registration_insert', [
  /from\('profiles'\)\s*\.insert\(/,
  /이미 사용 중인 닉네임입니다/,
  /PIN_EXHAUSTED/,
]);
mustNotMatch('artifacts/boltnew-app/src/App.tsx', '50_app_no_profiles_select_star', [
  /from\('profiles'\)\.select\('\*'\)/,
]);
mustMatch('artifacts/boltnew-app/src/hooks/useProfilePrivacyLoaders.ts', '50_privacy_loaders_use_column_lists', [
  /PROFILE_ROW_SELECT/,
  /USER_SIGNAL_ROW_SELECT/,
  /BLOCKED_USER_ROW_SELECT/,
  /PROFILE_VIEW_ROW_SELECT/,
  /mergeProfilesPreserveOrder/,
]);
mustMatch('artifacts/boltnew-app/src/hooks/useNicknameRegistration.ts', '50_registration_uses_planners', [
  /buildRegistrationProfileInsert/,
  /mapRegistrationErrorMessage/,
  /buildRegistrationSignalRow/,
  /PROFILE_ROW_SELECT/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '50_db_reimports_fanout_and_op_request', [
  /from '\.\.\/lib\/db-sse-fanout-policy'/,
  /from '\.\.\/lib\/db-op-request'/,
  /planSmartBroadcastLocal/,
  /normalizeOpFilters/,
  /validateOpScalars/,
  /sanitizeOpOrders/,
  /sanitizeConflictCols/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '50_db_still_single_router_export', [
  /export default router;\s*$/,
]);
mustNotMatch('artifacts/api-server/src/routes/db.ts', '50_db_no_inline_private_tables_or_allowed_ops', [
  /const PRIVATE_TABLES = new Set\(/,
  /const ADMIN_ONLY_PRIVATE_TABLES = new Set\(/,
  /const ALLOWED_OPS = new Set\(\['select'/,
  /function _stripInternalBroadcastFields\(/,
]);
mustMatch('ARCHITECTURE.md', '50_architecture_path_after_registration_fanout_peel', [
  /useNicknameRegistration/,
  /useProfilePrivacyLoaders/,
  /db-sse-fanout-policy/,
  /db-op-request/,
  /~9\.2/,
  /~9\.5/,
]);


// --- 51 Participant session-init peel ---
mustExist('artifacts/boltnew-app/src/hooks/useSessionInit.ts', '51_use_session_init_hook');
mustExist('artifacts/boltnew-app/src/lib/session-init.ts', '51_session_init_planners');
mustExist('artifacts/boltnew-app/src/lib/session-init.test.ts', '51_session_init_tests');
mustMatch('artifacts/boltnew-app/src/App.tsx', '51_app_wires_session_init', [
  /useSessionInit/,
  /clearHeartsState/,
  /saveScannedContact/,
]);
mustNotMatch('artifacts/boltnew-app/src/App.tsx', '51_app_no_inline_session_init_effect', [
  /\/\/ #52: 계정 전환 시 이전 유저의 하트 상태가 잠깐 보이는 현상 방지/,
  /pendingShareId && pendingShareId !== currentUserId/,
  /\[share-profile\] QR 스캔 프로필 로드 실패/,
]);
mustMatch('artifacts/boltnew-app/src/hooks/useSessionInit.ts', '51_session_init_uses_planners', [
  /planSessionInitAfterProfiles/,
  /planSessionInitMissingRetry/,
  /shouldProcessPendingShare/,
  /SESSION_INIT_CONTACT_DELAY_MS/,
  /SESSION_INIT_MISSING_RETRY_MS/,
  /PROFILE_ROW_SELECT/,
]);
mustMatch('artifacts/boltnew-app/src/lib/session-init.ts', '51_session_init_planner_exports', [
  /export function planSessionInitAfterProfiles/,
  /export function planSessionInitMissingRetry/,
  /export function shouldForceMainOnExistingComplete/,
  /export function shouldProcessPendingShare/,
]);
mustMatch('ARCHITECTURE.md', '51_architecture_path_after_session_init_peel', [
  /useSessionInit/,
  /session-init/,
  /~9\.35/,
  /~9\.5/,
]);

// ── 52: db admin identity/wipe-plan + admin/test select('*') narrow ───────────
mustExist('artifacts/api-server/src/lib/db-admin-identity.ts', '52_db_admin_identity_module');
mustExist('artifacts/api-server/src/lib/db-admin-identity.test.ts', '52_db_admin_identity_tests');
mustExist('artifacts/api-server/src/lib/db-admin-wipe-plan.ts', '52_db_admin_wipe_plan_module');
mustExist('artifacts/api-server/src/lib/db-admin-wipe-plan.test.ts', '52_db_admin_wipe_plan_tests');
mustMatch('artifacts/api-server/src/lib/db-admin-identity.ts', '52_admin_identity_exports', [
  /export const ADMIN_FIXED_NICKNAME/,
  /export const BIRTH_MD_EDIT_MAX/,
  /export function birthMdWouldChangeRow/,
  /export function normalizePhoneDigits/,
  /export function isAdminProfilePhone/,
  /export function withFixedAdminNickname/,
  /export function findAdminProfileInRows/,
]);
mustMatch('artifacts/api-server/src/lib/db-admin-wipe-plan.ts', '52_admin_wipe_plan_exports', [
  /export function planClearAdminNpcRelationships/,
  /export function likeRateKeyTouchesAdmin/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '52_db_reimports_admin_identity_wipe', [
  /from '\.\.\/lib\/db-admin-identity'/,
  /from '\.\.\/lib\/db-admin-wipe-plan'/,
  /planClearAdminNpcRelationships/,
  /ADMIN_FIXED_NICKNAME/,
  /BIRTH_MD_EDIT_MAX/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '52_db_still_single_router_export', [
  /export default router/,
]);
mustNotMatch('artifacts/api-server/src/routes/db.ts', '52_db_no_inline_admin_fixed_nickname_const', [
  /const ADMIN_FIXED_NICKNAME = /,
  /const BIRTH_MD_EDIT_MAX = /,
  /function birthMdWouldChangeRow\(/,
  /function normalizePhoneDigits\(/,
]);
mustMatch('artifacts/boltnew-app/src/lib/profile-select.ts', '52_profile_select_admin_columns', [
  /export const LIKE_ROW_SELECT/,
  /export const CHAT_ROW_SELECT/,
  /export const SESSION_HISTORY_ROW_SELECT/,
  /export const NOTIFICATION_ROW_SELECT/,
  /export const APP_SETTINGS_ADMIN_SELECT/,
]);
mustNotMatch('artifacts/boltnew-app/src/AdminApp.tsx', '52_admin_app_no_select_star', [
  /\.select\('\*'\)/,
]);
mustNotMatch('artifacts/boltnew-app/src/TestDashboard.tsx', '52_test_dashboard_no_select_star', [
  /\.select\('\*'\)/,
]);
mustNotMatch('artifacts/boltnew-app/src/admin/NotificationTab.tsx', '52_notification_tab_no_select_star', [
  /\.select\('\*'\)/,
]);
mustMatch('artifacts/boltnew-app/src/AdminApp.tsx', '52_admin_app_uses_column_lists', [
  /APP_SETTINGS_ADMIN_SELECT/,
  /PROFILE_ROW_SELECT/,
  /SESSION_HISTORY_ROW_SELECT/,
  /NOTIFICATION_ROW_SELECT/,
]);
mustMatch('artifacts/boltnew-app/src/TestDashboard.tsx', '52_test_dashboard_uses_column_lists', [
  /PROFILE_ROW_SELECT/,
  /LIKE_ROW_SELECT/,
  /CHAT_ROW_SELECT/,
]);
mustMatch('ARCHITECTURE.md', '52_architecture_path_after_admin_identity_peel', [
  /db-admin-identity/,
  /db-admin-wipe-plan/,
  /~9\.4/,
  /~9\.5/,
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
