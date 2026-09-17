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
  /planEnsureAdminProfile/,
]);
mustMatch('artifacts/api-server/src/lib/db-chat-ids.ts', '34_deterministic_admin_profile_id', [
  /deterministicAdminProfileId/,
]);
mustMatch('artifacts/api-server/src/lib/db-admin-ensure-plan.ts', '34_ensure_plan_uses_deterministic_admin_id', [
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
  /like-rainbow-btn/,
  /어떤 거 보내실래요\?/,
  /aria-disabled/,
  /h\.label/,
  /space-y-2 mb-5/,
]);
mustMatch('artifacts/boltnew-app/src/admin/event-schedule-apply.ts', '35_schedule_notice_hearts_separate', [
  /applySlotNowPatch/,
  /rainbowUnlockNowPatch/,
  /nextRainbowPoolGrant/,
  /parseHeartGrantAmount/,
  /rainbowPoolApplyPreview/,
  /heartsSetPatch/,
  /noticeOnlyPatch/,
  /heartsOnlyPatch/,
  /timeOnlyPatch/,
  /selectedSlotApplyPatch/,
  /shouldWarnTimeOnlyApply/,
  /공지나 하트도 같이 넣는 게 좋아요/,
  /draftToApplyPick/,
  /parseColorGrantsDraft/,
]);
mustMatch('artifacts/boltnew-app/src/admin/DashboardEventClockCard.tsx', '35_dashboard_event_clock_card', [
  /행사 적용/,
  /빠른 공지/,
  /하트개수/,
  /draftToApplyPick/,
  /selectedSlotApplyPatch/,
  /seoulNowHHMM/,
  /넣기/,
  /지금/,
]);
mustMatch('artifacts/boltnew-app/src/admin/DashboardTab.tsx', '35_dashboard_hosts_event_clock', [
  /DashboardEventClockCard/,
  /onSaveSchedule/,
]);
mustNotMatch('artifacts/boltnew-app/src/AdminApp.tsx', '35_no_event_schedule_tab', [
  /EventScheduleTab/,
  /label: '행사 시계'/,
  /settingsSubTab === 'schedule'/,
]);
mustMatch('artifacts/boltnew-app/src/lib/event-schedule.ts', '35_upcoming_heart_preview', [
  /upcomingHeartGrantPreview/,
  /upcomingHeartText/,
  /participantHeartChatLock/,
  /eventRainbowQuota/,
  /cumulativeRainbow: eventRainbowQuota/,
]);
mustMatch('artifacts/boltnew-app/src/App.tsx', '35_rainbow_pool_only_display', [
  /rainbowPool = useMemo/,
  /eventRainbowQuota\(eventScheduleRaw/,
]);
mustNotMatch('artifacts/boltnew-app/src/App.tsx', '35_no_granted_total_as_rainbow', [
  /eventGrantedHeartTotal/,
]);
mustNotMatch('artifacts/boltnew-app/src/hooks/useHearts.ts', '35_like_spend_rainbow_pool_only', [
  /eventGrantedHeartTotal/,
]);
mustMatch('artifacts/boltnew-app/src/components/MainScreen.tsx', '35_heart_chat_lock_count', [
  /home-heart-remaining-total/,
  /home-heart-lock/,
  /남음 \{heartChatLock\.remaining\}/,
  /headerHeartRemainings/,
]);
mustMatch('artifacts/boltnew-app/src/lib/event-schedule.ts', '35_header_five_heart_remainings', [
  /headerHeartRemainings/,
  /home-heart-remaining-rainbow/,
  /home-heart-remaining-red/,
  /home-heart-remaining-pink/,
  /home-heart-remaining-orange/,
  /home-heart-remaining-green/,
]);
mustNotMatch('artifacts/boltnew-app/src/components/MainScreen.tsx', '35_header_no_type_ticks_or_heart_chat_label', [
  /💖하트/,
  /💬채팅/,
  /home-chat-lock/,
]);
mustNotMatch('artifacts/boltnew-app/src/admin/event-schedule-apply.ts', '35_no_hardcoded_heart_qty_4', [
  /\|\| 4/,
  /useState\('4'\)/,
]);
mustNotMatch('artifacts/boltnew-app/src/admin/DashboardEventClockCard.tsx', '35_dashboard_no_hardcoded_heart_qty_4', [
  /\|\| 4/,
  /useState\('4'\)/,
]);
mustNotMatch('artifacts/boltnew-app/src/components/LikeConfirmDialog.tsx', '35_no_hardcoded_like_qty_4', [
  /Math\.max\(4/,
  /unlockedRainbowCount \|\| 4/,
]);
mustMatch('artifacts/boltnew-app/src/components/FirstEntryCoachMarks.tsx', '35_coach_tip_readable_type', [
  /text-base font-black text-cyan-700/,
  /text-sm font-semibold leading-relaxed/,
  /first-entry-coach-tip/,
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
mustMatch('artifacts/boltnew-app/src/components/ProfileCard.tsx', '39_card_menu_fixed_portal', [
  /profile-card-menu/,
  /fixed z-\[99999\]/,
  /createPortal/,
  /getBoundingClientRect/,
  /maxHeight/,
  /overflow-visible/,
  /renderMenuDropdown/,
  /menuAnchorId/,
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
  /usePrivacySignalsRealtimeApply/,
  /useAppShellRealtimeApply/,
  /countPendingHearts/,
  /planFunctionsLockTransition/,
]);
mustMatch('artifacts/boltnew-app/src/hooks/useAppShellRealtimeApply.ts', '44_shell_apply_owns_contact_share_event', [
  /planContactShareEvent/,
]);
mustMatch('artifacts/boltnew-app/src/hooks/usePrivacySignalsRealtimeApply.ts', '44_privacy_apply_owns_signal_merge', [
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
  /useProfilesRealtimeApply/,
  /\.\.\.profilesRealtimeApply/,
  /useHeartsRealtimeApply/,
  /\.\.\.heartsRealtimeApply/,
  /shouldSkipBlock/,
  /buildBlockedUserRow/,
]);
mustMatch('artifacts/boltnew-app/src/hooks/useProfilesRealtimeApply.ts', '45_profiles_apply_uses_planners', [
  /planProfilesAfterInsert/,
  /planProfilesAfterUpdate/,
  /planProfilesAfterDelete/,
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
  /useAppShellRealtimeApply/,
  /usePrivacySignalsRealtimeApply/,
  /\.\.\.privacySignalsRealtimeApply/,
  /appShellRealtimeApply/,
]);
mustMatch('artifacts/boltnew-app/src/hooks/useAppShellRealtimeApply.ts', '46_shell_apply_uses_settings_planner', [
  /planAppSettingsRealtimeUpdate/,
  /onBroadcastNotifInsert/,
  /planContactShareEvent/,
]);
mustMatch('artifacts/boltnew-app/src/hooks/usePrivacySignalsRealtimeApply.ts', '46_privacy_apply_handlers', [
  /onBlockedUserInsert/,
  /onUserSignalInsert/,
  /mergeUserSignalRow/,
  /isBlockedRowForMe/,
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






// ── 53: db app-settings-merge/panel-tokens + participant select('*') narrow ───
mustExist('artifacts/api-server/src/lib/db-app-settings-merge.ts', '53_db_app_settings_merge_module');
mustExist('artifacts/api-server/src/lib/db-app-settings-merge.test.ts', '53_db_app_settings_merge_tests');
mustExist('artifacts/api-server/src/lib/db-panel-tokens.ts', '53_db_panel_tokens_module');
mustExist('artifacts/api-server/src/lib/db-panel-tokens.test.ts', '53_db_panel_tokens_tests');
mustMatch('artifacts/api-server/src/lib/db-app-settings-merge.ts', '53_app_settings_merge_exports', [
  /export const PRODUCTION_QR_BASE/,
  /export const SECRET_SETTING_KEYS/,
  /export function isLocalQrUrl/,
  /export function explicitSecretKeys/,
  /export function mergeAppSettings/,
]);
mustMatch('artifacts/api-server/src/lib/db-panel-tokens.ts', '53_panel_tokens_exports', [
  /export function deriveAdminToken/,
  /export function deriveTestToken/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '53_db_reimports_settings_merge_tokens', [
  /from '\.\.\/lib\/db-app-settings-merge'/,
  /from '\.\.\/lib\/db-panel-tokens'/,
  /mergeAppSettingsPure/,
  /deriveAdminToken/,
  /deriveTestToken/,
  /SECRET_SETTING_KEYS/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '53_db_still_single_router_export', [
  /export default router/,
]);
mustNotMatch('artifacts/api-server/src/routes/db.ts', '53_db_no_inline_settings_merge_tokens', [
  /const PRODUCTION_QR_BASE = /,
  /const SECRET_SETTING_KEYS = /,
  /function koreanDateMMDD\(/,
  /function isLocalQrUrl\(/,
  /function explicitSecretKeys\(/,
  /function deriveAdminToken\(/,
  /function deriveTestToken\(/,
]);
mustMatch('artifacts/boltnew-app/src/lib/profile-select.ts', '53_profile_select_contact_share', [
  /export const CONTACT_SHARE_ROW_SELECT/,
  /export const PROFILE_ROW_SELECT/,
]);
mustNotMatch('artifacts/boltnew-app/src/hooks/useHearts.ts', '53_hearts_no_select_star', [
  /\.select\('\*'\)/,
]);
mustNotMatch('artifacts/boltnew-app/src/hooks/useHeartsRealtimeApply.ts', '53_hearts_realtime_no_select_star', [
  /\.select\('\*'\)/,
]);
mustNotMatch('artifacts/boltnew-app/src/components/AppOverlays.tsx', '53_overlays_no_select_star', [
  /\.select\('\*'\)/,
]);
mustNotMatch('artifacts/boltnew-app/src/components/StatsTabs.tsx', '53_stats_tabs_no_select_star', [
  /\.select\('\*'\)/,
]);
mustMatch('artifacts/boltnew-app/src/hooks/useHearts.ts', '53_hearts_uses_column_lists', [
  /PROFILE_ROW_SELECT/,
  /CONTACT_SHARE_ROW_SELECT/,
]);
mustMatch('artifacts/boltnew-app/src/hooks/useHeartsRealtimeApply.ts', '53_hearts_realtime_uses_profile_select', [
  /PROFILE_ROW_SELECT/,
]);
mustMatch('artifacts/boltnew-app/src/components/AppOverlays.tsx', '53_overlays_uses_profile_select', [
  /PROFILE_ROW_SELECT/,
]);
mustMatch('artifacts/boltnew-app/src/components/StatsTabs.tsx', '53_stats_tabs_uses_profile_select', [
  /PROFILE_ROW_SELECT/,
]);
mustMatch('ARCHITECTURE.md', '53_architecture_path_after_settings_merge_peel', [
  /db-app-settings-merge/,
  /db-panel-tokens/,
  /CONTACT_SHARE_ROW_SELECT/,
  /~9\.45/,
  /~9\.5/,
]);





// ── 54: App privacy/signal/profile/shell apply + db-image-store ───────────────
mustExist('artifacts/boltnew-app/src/hooks/usePrivacySignalsRealtimeApply.ts', '54_privacy_signals_realtime_apply_hook');
mustExist('artifacts/boltnew-app/src/hooks/useProfilesRealtimeApply.ts', '54_profiles_realtime_apply_hook');
mustExist('artifacts/boltnew-app/src/hooks/useAppShellRealtimeApply.ts', '54_app_shell_realtime_apply_hook');
mustExist('artifacts/api-server/src/lib/db-image-store.ts', '54_db_image_store_module');
mustExist('artifacts/api-server/src/lib/db-image-store.test.ts', '54_db_image_store_tests');
mustMatch('artifacts/boltnew-app/src/hooks/usePrivacySignalsRealtimeApply.ts', '54_privacy_apply_exports', [
  /export function usePrivacySignalsRealtimeApply/,
  /onBlockedUserInsert/,
  /onProfileViewInsert/,
  /onUserSignalInsert/,
  /onUserSignalUpdate/,
  /mergeUserSignalRow/,
]);
mustMatch('artifacts/boltnew-app/src/hooks/useProfilesRealtimeApply.ts', '54_profiles_apply_exports', [
  /export function useProfilesRealtimeApply/,
  /planProfilesAfterInsert/,
  /planProfilesAfterUpdate/,
  /planProfilesAfterDelete/,
]);
mustMatch('artifacts/boltnew-app/src/hooks/useAppShellRealtimeApply.ts', '54_shell_apply_exports', [
  /export function useAppShellRealtimeApply/,
  /planAppSettingsRealtimeUpdate/,
  /shouldShowBroadcastNotif/,
  /planContactShareEvent/,
  /applyResetSignal/,
]);
mustMatch('artifacts/boltnew-app/src/App.tsx', '54_app_wires_apply_hooks_only', [
  /usePrivacySignalsRealtimeApply/,
  /useProfilesRealtimeApply/,
  /useAppShellRealtimeApply/,
  /\.\.\.profilesRealtimeApply/,
  /\.\.\.privacySignalsRealtimeApply/,
  /useAppShellRealtimeChannels\(appShellRealtimeApply\)/,
]);
mustNotMatch('artifacts/boltnew-app/src/App.tsx', '54_app_no_inline_privacy_signal_shell_apply', [
  /mergeUserSignalRow/,
  /isBlockedRowForMe/,
  /planAppSettingsRealtimeUpdate/,
  /planContactShareEvent/,
  /planProfilesAfterInsert/,
  /shouldShowBroadcastNotif/,
]);
mustMatch('artifacts/api-server/src/lib/db-image-store.ts', '54_image_store_exports', [
  /export function createImageStore/,
  /export const IMAGE_STORE_MAX_ENTRIES_DEFAULT/,
  /export const IMAGE_STORE_MAX_CHARS_DEFAULT/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '54_db_reimports_image_store', [
  /from '\.\.\/lib\/db-image-store'/,
  /createImageStore/,
  /imageStoreGet/,
  /imageStoreSet/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '54_db_still_single_router_export', [
  /export default router/,
]);
mustNotMatch('artifacts/api-server/src/routes/db.ts', '54_db_no_inline_image_store_impl', [
  /function pruneImageStore\(/,
  /function imageStoreSet\(/,
  /function imageStoreGet\(/,
  /const imageStore = new Map/,
]);
mustMatch('ARCHITECTURE.md', '54_architecture_path_after_privacy_apply_peel', [
  /usePrivacySignalsRealtimeApply/,
  /useAppShellRealtimeApply/,
  /db-image-store/,
  /~9\.5/,
]);


// ── 55: db-group-room-plan (match/merge/opt-in pure planners) ─────────────────
mustExist('artifacts/api-server/src/lib/db-group-room-plan.ts', '55_db_group_room_plan_module');
mustExist('artifacts/api-server/src/lib/db-group-room-plan.test.ts', '55_db_group_room_plan_tests');
mustMatch('artifacts/api-server/src/lib/db-group-room-plan.ts', '55_group_room_plan_exports', [
  /export function compactGroupName/,
  /export function matchesAfterpartySpec/,
  /export function matchesVisibleAgeBand/,
  /export function birthYearOfGroup/,
  /export function isRetiredAgeRoom/,
  /export function optKeyForGroup/,
  /export function groupLimitSlotKey/,
  /export const OPT_IN_GROUP_ROOMS/,
  /export const GROUP_LIMIT_MESSAGE/,
  /단체 채팅은 최대 4개까지 입장할 수 있어요/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '55_db_reimports_group_room_plan', [
  /from '\.\.\/lib\/db-group-room-plan'/,
  /optKeyForGroup as optKeyForGroupPure/,
  /matchesAfterpartySpec/,
  /groupLimitSlotKey/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '55_db_still_single_router_export', [
  /export default router/,
]);
mustNotMatch('artifacts/api-server/src/routes/db.ts', '55_db_no_inline_group_room_plan_impl', [
  /function compactGroupName\(/,
  /function matchesAfterpartySpec\(/,
  /function isRetiredAgeRoom\(/,
  /function groupLimitSlotKey\(/,
  /const OPT_IN_GROUP_ROOMS/,
  /const GROUP_LIMIT_MESSAGE =/,
]);
mustMatch('ARCHITECTURE.md', '55_architecture_path_after_group_room_plan_peel', [
  /db-group-room-plan/,
  /~9\.5/,
]);


// ── 56: db-chat-pair-plan (pair/dedupe/message-merge pure planners) ───────────
mustExist('artifacts/api-server/src/lib/db-chat-pair-plan.ts', '56_db_chat_pair_plan_module');
mustExist('artifacts/api-server/src/lib/db-chat-pair-plan.test.ts', '56_db_chat_pair_plan_tests');
mustMatch('artifacts/api-server/src/lib/db-chat-pair-plan.ts', '56_chat_pair_plan_exports', [
  /export function isChatParticipant/,
  /export function countMessagesForChat/,
  /export function chatIdsForPair/,
  /export function pickCanonicalChatRow/,
  /export function groupChatsByPair/,
  /export function messageMergeAction/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '56_db_reimports_chat_pair_plan', [
  /from '\.\.\/lib\/db-chat-pair-plan'/,
  /isChatParticipant as isChatParticipantPure/,
  /chatIdsForPair as chatIdsForPairPure/,
  /pickCanonicalChatRow as pickCanonicalChatRowPure/,
  /groupChatsByPair/,
  /messageMergeAction/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '56_db_still_single_router_export', [
  /export default router/,
]);
mustNotMatch('artifacts/api-server/src/routes/db.ts', '56_db_no_inline_chat_pair_plan_impl', [
  /function groupChatsByPair\(/,
  /function messageMergeAction\(/,
  /const diff = countMessagesForChat\(String\(b\.id\)\) - countMessagesForChat\(String\(a\.id\)\)/,
  /messages\.filter\(m => String\(m\.chat_id\) === String\(chatId\)\)\.length/,
]);
mustMatch('ARCHITECTURE.md', '56_architecture_path_after_chat_pair_plan_peel', [
  /db-chat-pair-plan/,
  /~9\.5/,
]);


// ── 57: db-app-settings-view (public view / functions-lock / resync planners) ─
mustExist('artifacts/api-server/src/lib/db-app-settings-view.ts', '57_db_app_settings_view_module');
mustExist('artifacts/api-server/src/lib/db-app-settings-view.test.ts', '57_db_app_settings_view_tests');
mustMatch('artifacts/api-server/src/lib/db-app-settings-view.ts', '57_app_settings_view_exports', [
  /export const FUNCTIONS_LOCKED_INSERT_TABLES/,
  /export const FUNCTIONS_LOCKED_UPDATE_TABLES/,
  /export const FUNCTIONS_LOCKED_ERROR/,
  /export function settingsFunctionsLocked/,
  /export function publicAppSettingsView/,
  /export function tableFingerprint/,
  /export function pickLatestAppSettingsRow/,
  /export function planAppSettingsFromDbRows/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '57_db_reimports_app_settings_view', [
  /from '\.\.\/lib\/db-app-settings-view'/,
  /FUNCTIONS_LOCKED_INSERT_TABLES/,
  /FUNCTIONS_LOCKED_UPDATE_TABLES/,
  /FUNCTIONS_LOCKED_ERROR/,
  /publicAppSettingsView/,
  /settingsFunctionsLocked/,
  /tableFingerprint/,
  /planAppSettingsFromDbRows/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '57_db_still_single_router_export', [
  /export default router/,
]);
mustNotMatch('artifacts/api-server/src/routes/db.ts', '57_db_no_inline_app_settings_view_impl', [
  /function publicAppSettingsView\(/,
  /function settingsFunctionsLocked\(/,
  /function tableFingerprint\(/,
  /function pickLatestAppSettingsRow\(/,
  /const FUNCTIONS_LOCKED_INSERT_TABLES = new Set/,
  /const FUNCTIONS_LOCKED_UPDATE_TABLES = new Set/,
]);
mustMatch('ARCHITECTURE.md', '57_architecture_path_after_app_settings_view_peel', [
  /db-app-settings-view/,
  /~9\.5/,
]);


// ── 58: db-group-leave-plan (opt-out / leave-slot / slot-count planners) ──────
mustExist('artifacts/api-server/src/lib/db-group-leave-plan.ts', '58_db_group_leave_plan_module');
mustExist('artifacts/api-server/src/lib/db-group-leave-plan.test.ts', '58_db_group_leave_plan_tests');
mustMatch('artifacts/api-server/src/lib/db-group-leave-plan.ts', '58_group_leave_plan_exports', [
  /export function hasGroupOptOut/,
  /export function groupIdsInSameLeaveSlot/,
  /export function participantRowsToLeave/,
  /export function countUserGroupSlots/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '58_db_reimports_group_leave_plan', [
  /from '\.\.\/lib\/db-group-leave-plan'/,
  /hasGroupOptOut as hasGroupOptOutPure/,
  /participantRowsToLeave as participantRowsToLeavePure/,
  /countUserGroupSlots as countUserGroupSlotsPure/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '58_db_still_single_router_export', [
  /export default router/,
]);
mustNotMatch('artifacts/api-server/src/routes/db.ts', '58_db_no_inline_group_leave_plan_impl', [
  /const yearOrAge = \/\^\\d\{4\}년생 모임\$/,
  /function groupIdsInSameLeaveSlot\(/,
  /function countUserGroupSlots\(userId: string\): number \{\s*const keys = new Set/,
]);
mustMatch('ARCHITECTURE.md', '58_architecture_path_after_group_leave_plan_peel', [
  /db-group-leave-plan/,
  /~9\.5/,
]);


// ── 59: db-profile-reject + db-chat-read-block ───────────────────────────────
mustExist('artifacts/api-server/src/lib/db-profile-reject.ts', '59_db_profile_reject_module');
mustExist('artifacts/api-server/src/lib/db-profile-reject.test.ts', '59_db_profile_reject_tests');
mustExist('artifacts/api-server/src/lib/db-chat-read-block.ts', '59_db_chat_read_block_module');
mustExist('artifacts/api-server/src/lib/db-chat-read-block.test.ts', '59_db_chat_read_block_tests');
mustMatch('artifacts/api-server/src/lib/db-profile-reject.ts', '59_profile_reject_exports', [
  /export function profileBirthYearRejected/,
  /export function profileAvatarColorRejected/,
  /export function profileNpcAvatarRejected/,
  /ADULT_BIRTH_YEAR_ERROR/,
]);
mustMatch('artifacts/api-server/src/lib/db-chat-read-block.ts', '59_chat_read_block_exports', [
  /export function stampChatReadAt/,
  /export function isChatPairBlocked/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '59_db_reimports_profile_reject_and_chat_read_block', [
  /from '\.\.\/lib\/db-profile-reject'/,
  /profileBirthYearRejected as profileBirthYearRejectedPure/,
  /profileAvatarColorRejected as profileAvatarColorRejectedPure/,
  /profileNpcAvatarRejected as profileNpcAvatarRejectedPure/,
  /from '\.\.\/lib\/db-chat-read-block'/,
  /stampChatReadAt as stampChatReadAtPure/,
  /isChatPairBlocked as isChatPairBlockedPure/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '59_db_still_single_router_export', [
  /export default router/,
]);
mustNotMatch('artifacts/api-server/src/routes/db.ts', '59_db_no_inline_profile_reject_or_chat_read_block_impl', [
  /const ADULT_BIRTH_YEAR_ERROR = \{/,
  /const AVATAR_COLOR_COUNT = 12/,
  /row\.read_at = provided > now \? provided : now/,
  /row\.block_type === 'block' && \(/,
]);
mustMatch('ARCHITECTURE.md', '59_architecture_path_after_profile_reject_peel', [
  /db-profile-reject/,
  /db-chat-read-block/,
  /~9\.5/,
]);






// ── 60: db-reference-check + db-kv-hydrate (+ realtimeTraceMeta in fanout) ───
mustExist('artifacts/api-server/src/lib/db-reference-check.ts', '60_db_reference_check_module');
mustExist('artifacts/api-server/src/lib/db-reference-check.test.ts', '60_db_reference_check_tests');
mustExist('artifacts/api-server/src/lib/db-kv-hydrate.ts', '60_db_kv_hydrate_module');
mustExist('artifacts/api-server/src/lib/db-kv-hydrate.test.ts', '60_db_kv_hydrate_tests');
mustMatch('artifacts/api-server/src/lib/db-reference-check.ts', '60_reference_check_exports', [
  /export type ReferenceCheck/,
  /export function sendReferenceFailure/,
  /export function mergeRefreshedRows/,
  /export function missingWriteRefsByTable/,
  /export function evaluateWriteReferences/,
]);
mustMatch('artifacts/api-server/src/lib/db-kv-hydrate.ts', '60_kv_hydrate_exports', [
  /export const SYSTEM_KV_TABLES/,
  /export function mergeKvRowsIntoStore/,
  /export function seedLikesLastInsertMap/,
]);
mustMatch('artifacts/api-server/src/lib/db-sse-fanout-policy.ts', '60_fanout_realtime_trace_exports', [
  /export const REALTIME_TRACE_TABLES/,
  /export function realtimeTraceMeta/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '60_db_reimports_reference_check_and_kv_hydrate', [
  /from '\.\.\/lib\/db-reference-check'/,
  /sendReferenceFailure/,
  /mergeRefreshedRows as mergeRefreshedRowsPure/,
  /missingWriteRefsByTable/,
  /evaluateWriteReferences/,
  /from '\.\.\/lib\/db-kv-hydrate'/,
  /mergeKvRowsIntoStore as mergeKvRowsIntoStorePure/,
  /seedLikesLastInsertMap as seedLikesLastInsertMapPure/,
  /SYSTEM_KV_TABLES/,
  /REALTIME_TRACE_TABLES/,
  /realtimeTraceMeta/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '60_db_still_single_router_export', [
  /export default router/,
]);
mustNotMatch('artifacts/api-server/src/routes/db.ts', '60_db_no_inline_reference_or_kv_hydrate_impl', [
  /type ReferenceCheck = \{ ok: true \}/,
  /code: 'REFERENCE_REFRESH_FAILED'/,
  /code: 'INVALID_REFERENCE'/,
  /function realtimeTraceMeta\(/,
  /const REALTIME_TRACE_TABLES = new Set/,
  /const SYSTEM_KV_TABLES = new Set\(\['rate_limits'/,
  /function seedLikesLastInsertFromStore\(\): void \{\s*const cutoff/,
]);
mustMatch('ARCHITECTURE.md', '60_architecture_path_after_reference_kv_peel', [
  /db-reference-check/,
  /db-kv-hydrate/,
  /~9\.5/,
]);



// ── 61: db-session-tokens + pin-bucket + db-image-magic ───────────────────────
mustExist('artifacts/api-server/src/lib/db-session-tokens.ts', '61_db_session_tokens_module');
mustExist('artifacts/api-server/src/lib/db-session-tokens.test.ts', '61_db_session_tokens_tests');
mustExist('artifacts/api-server/src/lib/db-image-magic.ts', '61_db_image_magic_module');
mustExist('artifacts/api-server/src/lib/db-image-magic.test.ts', '61_db_image_magic_tests');
mustMatch('artifacts/api-server/src/lib/db-session-tokens.ts', '61_session_tokens_exports', [
  /export const SSE_TOKEN_EXPIRY_SEC/,
  /export const SESSION_TOKEN_EXPIRY_SEC/,
  /export type SseTokenState/,
  /export function issueSessionToken/,
  /export function verifySessionToken/,
  /export function issueSseToken/,
  /export function classifySseToken/,
  /export function verifySseToken/,
]);
mustMatch('artifacts/api-server/src/lib/db-rate-limit.ts', '61_rate_limit_pin_bucket_export', [
  /export function consumePinBucket/,
  /export const PIN_WINDOW_MS_DEFAULT/,
]);
mustMatch('artifacts/api-server/src/lib/db-image-magic.ts', '61_image_magic_exports', [
  /export const IMAGE_MAGIC/,
  /export const ALLOWED_IMAGE_MIMES/,
  /export const MAX_IMAGE_DATAURL_BYTES/,
  /export function dataUrlMimeAndMagic/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '61_db_reimports_session_tokens_pin_image_magic', [
  /from '\.\.\/lib\/db-session-tokens'/,
  /issueSessionToken as issueSessionTokenPure/,
  /verifySessionToken as verifySessionTokenPure/,
  /issueSseToken as issueSseTokenPure/,
  /classifySseToken as classifySseTokenPure/,
  /verifySseToken as verifySseTokenPure/,
  /consumePinBucket as consumePinBucketPure/,
  /from '\.\.\/lib\/db-image-magic'/,
  /dataUrlMimeAndMagic/,
  /MAX_IMAGE_DATAURL_BYTES/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '61_db_still_single_router_export', [
  /export default router/,
]);
mustNotMatch('artifacts/api-server/src/routes/db.ts', '61_db_no_inline_session_token_or_image_magic_impl', [
  /const SSE_TOKEN_EXPIRY_SEC = 3600/,
  /const SESSION_TOKEN_EXPIRY_SEC = 7 \* 24 \* 60 \* 60/,
  /type SseTokenState = 'valid' \| 'expired' \| 'invalid'/,
  /\.update\(`session:\$\{userId\}:\$\{exp\}`\)/,
  /const IMAGE_MAGIC: Record<string/,
  /const ALLOWED_IMAGE_MIMES = new Set\(\['image\/jpeg'/,
]);
mustMatch('ARCHITECTURE.md', '61_architecture_path_after_session_tokens_peel', [
  /db-session-tokens/,
  /db-image-magic/,
  /~9\.5/,
]);


// ── 62: db-unread-counts + db-push-plan + panel-token verify ──────────────────
mustExist('artifacts/api-server/src/lib/db-unread-counts.ts', '62_db_unread_counts_module');
mustExist('artifacts/api-server/src/lib/db-unread-counts.test.ts', '62_db_unread_counts_tests');
mustExist('artifacts/api-server/src/lib/db-push-plan.ts', '62_db_push_plan_module');
mustExist('artifacts/api-server/src/lib/db-push-plan.test.ts', '62_db_push_plan_tests');
mustMatch('artifacts/api-server/src/lib/db-unread-counts.ts', '62_unread_counts_exports', [
  /export function computeUnreadCountsForUser/,
]);
mustMatch('artifacts/api-server/src/lib/db-push-plan.ts', '62_push_plan_exports', [
  /export function planPushForEvent/,
  /export type PushPlan/,
]);
mustMatch('artifacts/api-server/src/lib/db-panel-tokens.ts', '62_panel_tokens_verify_exports', [
  /export function verifyPanelTokenAgainstSecrets/,
  /export function verifyAdminPanelToken/,
  /export function verifyTestPanelToken/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '62_db_reimports_unread_push_panel_verify', [
  /from '\.\.\/lib\/db-unread-counts'/,
  /computeUnreadCountsForUser/,
  /from '\.\.\/lib\/db-push-plan'/,
  /planPushForEvent/,
  /verifyAdminPanelToken/,
  /verifyTestPanelToken/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '62_db_still_single_router_export', [
  /export default router/,
]);
mustNotMatch('artifacts/api-server/src/routes/db.ts', '62_db_no_inline_unread_or_push_plan_impl', [
  /const msgsByChatId = new Map<string, typeof store\[string\]>/,
  /body = '\[이미지\]'/,
  /body: '하트를 보냈어요!'/,
  /timingSafeEqual\(Buffer\.from\(provided, 'hex'\), Buffer\.from\(expected, 'hex'\)\)/,
]);
mustMatch('ARCHITECTURE.md', '62_architecture_path_after_unread_push_peel', [
  /db-unread-counts/,
  /db-push-plan/,
  /~9\.5/,
]);





// ── 63: db-admin-ensure-plan + db-app-settings-boot ───────────────────────────
mustExist('artifacts/api-server/src/lib/db-admin-ensure-plan.ts', '63_db_admin_ensure_plan_module');
mustExist('artifacts/api-server/src/lib/db-admin-ensure-plan.test.ts', '63_db_admin_ensure_plan_tests');
mustExist('artifacts/api-server/src/lib/db-app-settings-boot.ts', '63_db_app_settings_boot_module');
mustExist('artifacts/api-server/src/lib/db-app-settings-boot.test.ts', '63_db_app_settings_boot_tests');
mustMatch('artifacts/api-server/src/lib/db-admin-ensure-plan.ts', '63_admin_ensure_plan_exports', [
  /export function planEnsureAdminProfile/,
  /export function buildAdminSeedProfile/,
  /export function planRestoreAdminProfileAfterWipe/,
]);
mustMatch('artifacts/api-server/src/lib/db-app-settings-boot.ts', '63_app_settings_boot_exports', [
  /export function buildDefaultAppSettings/,
  /export function appSettingsCoreFieldsBroken/,
  /export function planAppSettingsSecretsPatch/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '63_db_reimports_admin_ensure_and_settings_boot', [
  /from '\.\.\/lib\/db-admin-ensure-plan'/,
  /planEnsureAdminProfile/,
  /buildAdminSeedProfile/,
  /planRestoreAdminProfileAfterWipe/,
  /from '\.\.\/lib\/db-app-settings-boot'/,
  /buildDefaultAppSettings/,
  /appSettingsCoreFieldsBroken/,
  /planAppSettingsSecretsPatch/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '63_db_still_single_router_export', [
  /export default router/,
]);
mustNotMatch('artifacts/api-server/src/routes/db.ts', '63_db_no_inline_ensure_or_settings_boot_impl', [
  /avatarNeedsRepair = String\(existing\['photo_url'\]/,
  /personality_score: 50,/,
  /admin_phone: '010-3878-6740',/,
  /const targetAdmin = bootstrapAdmin \|\| PANEL_DEFAULT_PASSWORD/,
]);
mustMatch('ARCHITECTURE.md', '63_architecture_path_after_admin_ensure_peel', [
  /db-admin-ensure-plan/,
  /db-app-settings-boot/,
  /~9\.5/,
]);


// ── 64: db-op-result-shape + db-op-select-scope ────────────────────────────────
mustExist('artifacts/api-server/src/lib/db-op-result-shape.ts', '64_db_op_result_shape_module');
mustExist('artifacts/api-server/src/lib/db-op-result-shape.test.ts', '64_db_op_result_shape_tests');
mustExist('artifacts/api-server/src/lib/db-op-select-scope.ts', '64_db_op_select_scope_module');
mustExist('artifacts/api-server/src/lib/db-op-select-scope.test.ts', '64_db_op_select_scope_tests');
mustMatch('artifacts/api-server/src/lib/db-op-result-shape.ts', '64_op_result_shape_exports', [
  /export function sortRowsByOrders/,
  /export function shapeSelectData/,
  /export function orderLimitShape/,
  /export function sanitizeBroadcastValue/,
]);
mustMatch('artifacts/api-server/src/lib/db-op-select-scope.ts', '64_op_select_scope_exports', [
  /export function scopeSignalSendsRows/,
  /export function dedupeParticipantChatRows/,
  /export function contactSharesSelectSource/,
  /export function likesSelectKeepsLikerId/,
  /export function attachGroupMemberCounts/,
  /export function collapseRowsById/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '64_db_reimports_op_result_and_select_scope', [
  /from '\.\.\/lib\/db-op-result-shape'/,
  /orderLimitShape/,
  /sanitizeBroadcastValue/,
  /from '\.\.\/lib\/db-op-select-scope'/,
  /scopeSignalSendsRows/,
  /dedupeParticipantChatRows/,
  /likesSelectKeepsLikerId/,
  /collapseRowsById/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '64_db_still_single_router_export', [
  /export default router/,
]);
mustNotMatch('artifacts/api-server/src/routes/db.ts', '64_db_no_inline_op_shape_or_scope_impl', [
  /function sanitizeBroadcastValue\(val: unknown, depth = 0\)/,
  /const seenPairs = new Set<string>\(\);/,
  /counts\.set\(gid, \(counts\.get\(gid\) \?\? 0\) \+ 1\)/,
  /delete s\['liker_id'\];/,
]);
mustMatch('ARCHITECTURE.md', '64_architecture_path_after_op_select_peel', [
  /db-op-result-shape/,
  /db-op-select-scope/,
  /~9\.5/,
]);


// ── 65: db-op-update-ownership + db-op-delete-ownership ───────────────────────
mustExist('artifacts/api-server/src/lib/db-op-update-ownership.ts', '65_db_op_update_ownership_module');
mustExist('artifacts/api-server/src/lib/db-op-update-ownership.test.ts', '65_db_op_update_ownership_tests');
mustExist('artifacts/api-server/src/lib/db-op-delete-ownership.ts', '65_db_op_delete_ownership_module');
mustExist('artifacts/api-server/src/lib/db-op-delete-ownership.test.ts', '65_db_op_delete_ownership_tests');
mustMatch('artifacts/api-server/src/lib/db-op-update-ownership.ts', '65_op_update_ownership_exports', [
  /export function updateMissingRequesterReject/,
  /export function forceUpdateOwnershipPatch/,
  /export function planGroupParticipantsUpdate/,
  /export function checkUpdateRowOwnership/,
  /export function signalSendsUpdateReject/,
]);
mustMatch('artifacts/api-server/src/lib/db-op-delete-ownership.ts', '65_op_delete_ownership_exports', [
  /export const DELETE_AUTH_REQUIRED_TABLES/,
  /export function deleteMissingRequesterReject/,
  /export function checkDeleteRowOwnership/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '65_db_reimports_op_update_and_delete_ownership', [
  /from '\.\.\/lib\/db-op-update-ownership'/,
  /updateMissingRequesterReject/,
  /forceUpdateOwnershipPatch/,
  /checkUpdateRowOwnership/,
  /from '\.\.\/lib\/db-op-delete-ownership'/,
  /deleteMissingRequesterReject/,
  /checkDeleteRowOwnership/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '65_db_still_single_router_export', [
  /export default router/,
]);
mustNotMatch('artifacts/api-server/src/routes/db.ts', '65_db_no_inline_update_or_delete_ownership_impl', [
  /IDOR: messages UPDATE without requesterId blocked/,
  /IDOR: DELETE likes blocked/,
  /Forbidden: 자신이 보낸 하트만 취소할 수 있습니다\./,
  /Forbidden: 자신의 프로필만 수정할 수 있습니다\./,
]);
mustMatch('ARCHITECTURE.md', '65_architecture_path_after_op_write_ownership_peel', [
  /db-op-update-ownership/,
  /db-op-delete-ownership/,
  /~9\.5/,
]);




// ── 66: db-op-insert-ownership + db-op-upsert-ownership ───────────────────────
mustExist('artifacts/api-server/src/lib/db-op-insert-ownership.ts', '66_db_op_insert_ownership_module');
mustExist('artifacts/api-server/src/lib/db-op-insert-ownership.test.ts', '66_db_op_insert_ownership_tests');
mustExist('artifacts/api-server/src/lib/db-op-upsert-ownership.ts', '66_db_op_upsert_ownership_module');
mustExist('artifacts/api-server/src/lib/db-op-upsert-ownership.test.ts', '66_db_op_upsert_ownership_tests');
mustMatch('artifacts/api-server/src/lib/db-op-insert-ownership.ts', '66_op_insert_ownership_exports', [
  /export function planMessagesInsertOwnership/,
  /export function planChatsInsertOwnership/,
  /export function planLikesInsertOwnership/,
  /export function planNormalizeChatPairRow/,
  /export function groupChatsInsertReject/,
]);
mustMatch('artifacts/api-server/src/lib/db-op-upsert-ownership.ts', '66_op_upsert_ownership_exports', [
  /export function signalSendsUpsertReject/,
  /export function planUpsertRelationshipRow/,
  /export function planChatReadsUpsertOwnership/,
  /export function checkUpsertConflictOwner/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '66_db_reimports_op_insert_and_upsert_ownership', [
  /from '\.\.\/lib\/db-op-insert-ownership'/,
  /planMessagesInsertOwnership/,
  /planLikesInsertOwnership/,
  /planNormalizeChatPairRow/,
  /from '\.\.\/lib\/db-op-upsert-ownership'/,
  /planUpsertRelationshipRow/,
  /signalSendsUpsertReject/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '66_db_still_single_router_export', [
  /export default router/,
]);
mustNotMatch('artifacts/api-server/src/routes/db.ts', '66_db_no_inline_insert_or_upsert_ownership_impl', [
  /IDOR: messages INSERT without requesterId blocked/,
  /Forbidden: use insert for signal actions/,
  /cannot share contact with yourself/,
  /자신의 읽음 기록만 생성할 수 있습니다/,
]);
mustMatch('ARCHITECTURE.md', '66_architecture_path_after_op_insert_upsert_peel', [
  /db-op-insert-ownership/,
  /db-op-upsert-ownership/,
  /~9\.5/,
]);




// ── 67: db-op-select-access + likes-limits + pin/storage/broadcast/rpc ─────────
mustExist('artifacts/api-server/src/lib/db-op-select-access.ts', '67_db_op_select_access_module');
mustExist('artifacts/api-server/src/lib/db-op-select-access.test.ts', '67_db_op_select_access_tests');
mustExist('artifacts/api-server/src/lib/db-op-likes-limits.ts', '67_db_op_likes_limits_module');
mustExist('artifacts/api-server/src/lib/db-op-likes-limits.test.ts', '67_db_op_likes_limits_tests');
mustExist('artifacts/api-server/src/lib/db-pin-lookup.ts', '67_db_pin_lookup_module');
mustExist('artifacts/api-server/src/lib/db-pin-lookup.test.ts', '67_db_pin_lookup_tests');
mustExist('artifacts/api-server/src/lib/db-storage-path.ts', '67_db_storage_path_module');
mustExist('artifacts/api-server/src/lib/db-storage-path.test.ts', '67_db_storage_path_tests');
mustExist('artifacts/api-server/src/lib/db-broadcast-validate.ts', '67_db_broadcast_validate_module');
mustExist('artifacts/api-server/src/lib/db-broadcast-validate.test.ts', '67_db_broadcast_validate_tests');
mustExist('artifacts/api-server/src/lib/db-rpc-allowlist.ts', '67_db_rpc_allowlist_module');
mustExist('artifacts/api-server/src/lib/db-rpc-allowlist.test.ts', '67_db_rpc_allowlist_tests');
mustMatch('artifacts/api-server/src/lib/db-op-select-access.ts', '67_op_select_access_exports', [
  /export function mapMessagesOntoCanonicalChatId/,
  /export function collectMyGroupIds/,
  /export function scopeChatReadsForRequester/,
  /export function remapGroupIdFilters/,
]);
mustMatch('artifacts/api-server/src/lib/db-op-likes-limits.ts', '67_op_likes_limits_exports', [
  /export function likesHeartLimitReject/,
  /export function likesRateLimitReject/,
  /export function likesSameTypeLimitReached/,
  /export function matchesLikeTriple/,
]);
mustMatch('artifacts/api-server/src/lib/db-pin-lookup.ts', '67_pin_lookup_exports', [
  /export function validateByPinBody/,
  /export function maskNicknameForPinConfirm/,
]);
mustMatch('artifacts/api-server/src/lib/db-storage-path.ts', '67_storage_path_exports', [
  /export function isValidStoragePath/,
  /export function isValidStoragePathList/,
  /export function isPublicProfilePhotoPath/,
]);
mustMatch('artifacts/api-server/src/lib/db-broadcast-validate.ts', '67_broadcast_validate_exports', [
  /export function validateBroadcastBody/,
]);
mustMatch('artifacts/api-server/src/lib/db-rpc-allowlist.ts', '67_rpc_allowlist_exports', [
  /export const ALLOWED_RPCS/,
]);
mustMatch('artifacts/api-server/src/lib/db-admin-wipe-plan.ts', '67_wipe_plan_event_end_exports', [
  /export const ADMIN_EVENT_END_CLEAR_TABLES/,
  /export function planWipeTableBroadcast/,
  /export const TEST_WIPE_ALL_TABLES/,
]);
mustMatch('artifacts/api-server/src/lib/db-app-settings-merge.ts', '67_settings_sanitize_exports', [
  /export function sanitizeAdminSettingsPayload/,
  /export function filterTestSettingsPayload/,
]);
mustMatch('artifacts/api-server/src/lib/db-admin-identity.ts', '67_birth_md_edit_plan_export', [
  /export function planBirthMdEditPatch/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '67_db_reimports_select_access_likes_pin_storage', [
  /from '\.\.\/lib\/db-op-select-access'/,
  /mapMessagesOntoCanonicalChatId/,
  /collectMyGroupIds/,
  /from '\.\.\/lib\/db-op-likes-limits'/,
  /likesHeartLimitReject/,
  /from '\.\.\/lib\/db-pin-lookup'/,
  /from '\.\.\/lib\/db-storage-path'/,
  /from '\.\.\/lib\/db-broadcast-validate'/,
  /from '\.\.\/lib\/db-rpc-allowlist'/,
  /ALLOWED_RPCS/,
  /planWipeTableBroadcast/,
  /sanitizeAdminSettingsPayload/,
  /planBirthMdEditPatch/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '67_db_still_single_router_export', [
  /export default router/,
]);
mustNotMatch('artifacts/api-server/src/routes/db.ts', '67_db_no_inline_select_access_likes_rpc_impl', [
  /같은 종류의 하트는 최대 2명에게만 보낼 수 있습니다/,
  /const ALLOWED_RPCS = new Set/,
  /nick\.length > 1\s*\?[\s\S]*\*\.repeat/,
  /IDOR: messages SELECT without chat_id filter blocked/,
]);
mustMatch('ARCHITECTURE.md', '67_architecture_path_after_select_access_peel', [
  /db-op-select-access/,
  /db-op-likes-limits/,
  /~9\.5/,
]);




// ── 68: auth-login + op-gate + rpc-auth + push-subscribe + insert follow-up + SSE admit ─
mustMatch('artifacts/api-server/src/lib/db-session-tokens.ts', '68_auth_login_exports', [
  /export function validateAuthLoginBody/,
  /export function planAuthLoginDecision/,
  /export function authLoginDeviceMismatchReject/,
  /AUTH_DEVICE_MISMATCH_MESSAGE/,
]);
mustMatch('artifacts/api-server/src/lib/db-op-request.ts', '68_op_gate_exports', [
  /export function opBusyReject/,
  /export function planBindRequesterId/,
  /export function opPersistFailedReject/,
  /export function opPinExhaustedReject/,
  /OP_PERSIST_FAILED_MESSAGE/,
]);
mustMatch('artifacts/api-server/src/lib/db-rpc-allowlist.ts', '68_rpc_auth_exports', [
  /export function validateRpcName/,
  /export function planVerifyPanelPasswordArgs/,
  /export function planCheckAdminPassword/,
  /export function buildAdminProfilePatchFromArgs/,
  /RPC_ADMIN_PHONE_MISMATCH_MESSAGE/,
]);
mustMatch('artifacts/api-server/src/lib/db-push-plan.ts', '68_push_subscribe_exports', [
  /export function validatePushSubscribeBody/,
  /export function pushSubscribeUnauthorizedReject/,
]);
mustMatch('artifacts/api-server/src/lib/db-op-insert-ownership.ts', '68_insert_followup_exports', [
  /export function findRowByClientId/,
  /export function findExistingChatPairRow/,
  /export function buildInsertedRow/,
  /export function messageReceiverIdFromChat/,
]);
mustMatch('artifacts/api-server/src/lib/db-op-likes-limits.ts', '68_likes_minute_bucket_export', [
  /export function planLikesMinuteBucketConsume/,
]);
mustMatch('artifacts/api-server/src/lib/db-sse-fanout-policy.ts', '68_sse_admit_exports', [
  /export function sseCapacityReject/,
  /export function planSseIpCount/,
  /export function shouldRejectAnonSse/,
]);
mustMatch('artifacts/api-server/src/lib/db-app-settings-view.ts', '68_ready_payload_export', [
  /export function buildReadyPayload/,
]);
mustMatch('artifacts/api-server/src/lib/db-group-room-plan.ts', '68_auto_room_builder_exports', [
  /export function buildAutoRoomRow/,
  /export function shouldSkipAutoRoomJoin/,
]);
mustExist('artifacts/api-server/src/lib/db-session-tokens.test.ts', '68_session_tokens_auth_tests');
mustExist('artifacts/api-server/src/lib/db-op-request.test.ts', '68_op_request_gate_tests');
mustExist('artifacts/api-server/src/lib/db-rpc-allowlist.test.ts', '68_rpc_allowlist_auth_tests');
mustExist('artifacts/api-server/src/lib/db-push-plan.test.ts', '68_push_plan_subscribe_tests');
mustMatch('artifacts/api-server/src/routes/db.ts', '68_db_reimports_auth_op_gate_rpc_push', [
  /from '\.\.\/lib\/db-session-tokens'/,
  /validateAuthLoginBody/,
  /planAuthLoginDecision/,
  /from '\.\.\/lib\/db-op-request'/,
  /opBusyReject/,
  /planBindRequesterId/,
  /from '\.\.\/lib\/db-rpc-allowlist'/,
  /validateRpcName/,
  /planVerifyPanelPasswordArgs/,
  /from '\.\.\/lib\/db-push-plan'/,
  /validatePushSubscribeBody/,
  /buildInsertedRow/,
  /planLikesMinuteBucketConsume/,
  /sseCapacityReject/,
  /buildReadyPayload/,
  /buildAutoRoomRow/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '68_db_still_single_router_export', [
  /export default router/,
]);
mustNotMatch('artifacts/api-server/src/routes/db.ts', '68_db_no_inline_auth_gate_rpc_impl', [
  /이미 다른 기기에서 등록된 계정입니다\. 고유번호\(PIN\)로 프로필 복구를 이용해 주세요/,
  /Server busy — retry in 1s/,
  /PIN pool exhausted — no available PIN slots/,
  /저장에 실패했습니다\. 잠시 후 다시 시도해 주세요/,
  /전화번호 또는 비밀번호가 올바르지 않습니다/,
  /Server at SSE capacity/,
]);
mustMatch('ARCHITECTURE.md', '68_architecture_path_after_auth_op_gate_peel', [
  /auth-login/,
  /op-gate/,
  /~9\.5/,
]);



// ── 69: storage-upload + health-plan + push-subscribe-store + notify/autoMatch ─
mustExist('artifacts/api-server/src/lib/db-health-plan.ts', '69_health_plan_module');
mustExist('artifacts/api-server/src/lib/db-health-plan.test.ts', '69_health_plan_tests');
mustMatch('artifacts/api-server/src/lib/db-storage-path.ts', '69_storage_upload_exports', [
  /export function planStorageUploadAuthPath/,
  /export function planStorageUploadContent/,
  /export function planStorageRemove/,
  /export function planStorageImageAuth/,
  /이미지를 너무 자주 업로드하고 있습니다/,
]);
mustMatch('artifacts/api-server/src/lib/db-health-plan.ts', '69_health_plan_exports', [
  /export function planPinPoolStats/,
  /export function buildHealthAlarms/,
  /export function buildHealthBody/,
  /export function shouldWarnPinPool/,
  /PIN pool nearly full/,
]);
mustMatch('artifacts/api-server/src/lib/db-push-plan.ts', '69_push_subscribe_store_export', [
  /export function planPushSubscribeStore/,
  /USER_MAX_PUSH_SUBS/,
]);
mustMatch('artifacts/api-server/src/lib/db-sse-fanout-policy.ts', '69_notify_ring_exports', [
  /export function planNotifyOtherInstances/,
  /export function planSseRingReplay/,
  /export function shouldEvictOldestSseConn/,
]);
mustMatch('artifacts/api-server/src/lib/db-group-room-plan.ts', '69_automatch_specs_export', [
  /export function planAutoMatchJoinSpecs/,
]);
mustMatch('artifacts/api-server/src/lib/db-op-insert-ownership.ts', '69_signal_upgrade_exports', [
  /export function planSignalSendsExistingRow/,
  /export function withMessageChatPairFields/,
  /export function buildGroupParticipantInsertRow/,
]);
mustMatch('artifacts/api-server/src/lib/db-rpc-allowlist.ts', '69_rpc_persist_exports', [
  /export function rpcSessionPersistFailedReject/,
  /export function shouldPersistBootstrapPanelPassword/,
  /회의 상태 저장 실패/,
]);
mustMatch('artifacts/api-server/src/lib/db-op-request.ts', '69_op_write_gate_exports', [
  /export function opAdminOnlyReject/,
  /export function opFunctionsLockedReject/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '69_db_reimports_storage_health_push_notify', [
  /from '\.\.\/lib\/db-storage-path'/,
  /planStorageUploadAuthPath/,
  /planStorageUploadContent/,
  /from '\.\.\/lib\/db-health-plan'/,
  /buildHealthAlarms/,
  /planPushSubscribeStore/,
  /planNotifyOtherInstances/,
  /planAutoMatchJoinSpecs/,
  /planSignalSendsExistingRow/,
  /opAdminOnlyReject/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '69_db_still_single_router_export', [
  /export default router/,
]);
mustNotMatch('artifacts/api-server/src/routes/db.ts', '69_db_no_inline_storage_health_korean', [
  /이미지를 너무 자주 업로드하고 있습니다\. 잠시 후 다시 시도해 주세요/,
  /회의 상태 저장 실패 — 잠시 후 다시 시도해 주세요/,
  /설정 저장 실패 — 잠시 후 다시 시도해 주세요/,
  /PIN pool nearly full:/,
]);
mustMatch('ARCHITECTURE.md', '69_architecture_path_after_storage_health_peel', [
  /storage-upload/,
  /health-plan/,
  /~9\.5/,
]);




// ── 70: auth-resolve + unread/push-notify + leave-expand + sse-gate + notify-queue ─
mustMatch('artifacts/api-server/src/lib/db-session-tokens.ts', '70_auth_resolve_exports', [
  /export function resolveAuthUserIdFromParts/,
  /export function buildLoginSuccessBody/,
]);
mustMatch('artifacts/api-server/src/lib/db-unread-counts.ts', '70_unread_rejects_cache', [
  /export function unreadCountsUnauthorizedReject/,
  /export function readUnreadCountsCache/,
  /안읽은 메시지 수 조회 중 오류가 발생했습니다/,
]);
mustMatch('artifacts/api-server/src/lib/db-push-plan.ts', '70_push_notify_exports', [
  /export function validatePushNotifyRequest/,
  /범일NPC 술번개/,
]);
mustMatch('artifacts/api-server/src/lib/db-group-leave-plan.ts', '70_leave_expand_exports', [
  /export function planGroupParticipantsDeleteExpand/,
  /export function buildGroupOptOutRow/,
  /export function planClearGroupOptOutRows/,
]);
mustMatch('artifacts/api-server/src/lib/db-merged-id-map.ts', '70_merged_via_rows', [
  /export function resolveMergedIdViaRows/,
]);
mustMatch('artifacts/api-server/src/lib/db-sse-fanout-policy.ts', '70_sse_gate_queue_counts', [
  /export function planSseUserTokenGate/,
  /export function planNotifyQueueEnqueue/,
  /export function countSseLiveConnections/,
]);
mustMatch('artifacts/api-server/src/lib/db-broadcast-validate.ts', '70_broadcast_rejects_ip', [
  /export function broadcastForbiddenReject/,
  /export function clientIpFromXForwardedFor/,
]);
mustMatch('artifacts/api-server/src/lib/db-panel-tokens.ts', '70_clear_db_errors_auth', [
  /export function planClearDbErrorsAuth/,
]);
mustMatch('artifacts/api-server/src/lib/db-admin-wipe-plan.ts', '70_admin_npc_store_patch', [
  /export function planApplyAdminNpcRelStore/,
]);
mustMatch('artifacts/api-server/src/lib/db-chat-pair-plan.ts', '70_canonical_message_chat', [
  /export function planCanonicalMessageChatId/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '70_db_reimports_auth_unread_push_sse', [
  /resolveAuthUserIdFromParts/,
  /validatePushNotifyRequest/,
  /planGroupParticipantsDeleteExpand/,
  /planSseUserTokenGate/,
  /planNotifyQueueEnqueue/,
  /planApplyAdminNpcRelStore/,
  /unreadCountsUnauthorizedReject/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '70_db_still_single_router_export', [
  /export default router/,
]);
mustNotMatch('artifacts/api-server/src/routes/db.ts', '70_db_no_inline_unread_push_korean', [
  /안읽은 메시지 수 조회 중 오류가 발생했습니다/,
  /서버 내부 오류가 발생했습니다/,
]);
mustMatch('ARCHITECTURE.md', '70_architecture_path_after_auth_unread_peel', [
  /auth-resolve|unread|push-notify|leave-expand|sse-gate/,
  /~9\.5/,
]);



// ── 71: chat-dedupe + group-merge/catalog; date-entry renewal removed ─────────
mustMatch('artifacts/api-server/src/lib/db-chat-pair-plan.ts', '71_chat_dedupe_exports', [
  /export function planChatDedupeMergeSteps/,
  /export function planChatReadsForDedupe/,
  /export function messagesToRemapOnDedupe/,
  /export function applyIncomingMessageRows/,
]);
mustMatch('artifacts/api-server/src/lib/db-group-room-plan.ts', '71_group_merge_catalog_exports', [
  /export function planGroupParticipantMerge/,
  /export function filterRowsByGroupId/,
  /export function groupNeedsUnlimitedMaxMembers/,
  /export function planVisibleAgeBandRoomSpec/,
  /export function planBirthYearRoomSpec/,
  /export function collectBirthYearRoomGroups/,
]);
mustNotMatch('artifacts/api-server/src/lib/db-app-settings-boot.ts', '71_no_date_entry_renewal_export', [
  /export function planDailyEntryPasswordRenewal/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '71_db_reimports_dedupe_merge_renewal', [
  /planChatDedupeMergeSteps/,
  /planChatReadsForDedupe/,
  /applyIncomingMessageRows/,
  /planGroupParticipantMerge/,
  /planVisibleAgeBandRoomSpec/,
  /planBirthYearRoomSpec/,
  /collectBirthYearRoomGroups/,
]);
mustNotMatch('artifacts/api-server/src/routes/db.ts', '71_db_no_date_entry_renewal', [
  /planDailyEntryPasswordRenewal/,
  /startDailyEntryPasswordRenewal/,
  /koreanDateMMDD/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '71_db_still_single_router_export', [
  /export default router/,
]);
mustNotMatch('artifacts/api-server/src/routes/db.ts', '71_db_no_inline_birth_year_map_loop', [
  /const byYear = new Map<number, Record<string, unknown>\[\]>\(\);/,
]);
mustMatch('ARCHITECTURE.md', '71_architecture_path_after_dedupe_merge_peel', [
  /chat-dedupe|group-merge/,
  /~9\.5/,
]);




// ── 72: resync-policy + notify-inbound + ACTIVE_KV ────────────────────────────
mustMatch('artifacts/api-server/src/lib/db-store-merge.ts', '72_resync_policy_exports', [
  /export const HOT_TABLES/,
  /export const REALTIME_MERGE_TABLES/,
  /export const FULL_RESYNC_TABLES/,
  /export const RESYNC_TABLE_LIMIT/,
  /export function buildFullResyncUnionSql/,
  /export function groupKvDataRowsByTable/,
  /export function shouldThrottleDbMerge/,
]);
mustMatch('artifacts/api-server/src/lib/db-sse-fanout-policy.ts', '72_notify_inbound_exports', [
  /export function planNotifyInboundApply/,
  /export function applyNotifyMemoryUpsert/,
  /export function applyNotifyMemoryDelete/,
  /export function applyNotifyTombstoneDelete/,
  /export function applyNotifyRefetchedRow/,
]);
mustMatch('artifacts/api-server/src/lib/db-table-policy.ts', '72_active_kv_export', [
  /export const ACTIVE_KV_TABLES/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '72_db_reimports_resync_notify_active', [
  /planNotifyInboundApply/,
  /buildFullResyncUnionSql/,
  /groupKvDataRowsByTable/,
  /ACTIVE_KV_TABLES/,
  /HOT_RESYNC_TABLES/,
  /shouldThrottleDbMerge/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '72_db_still_single_router_export', [
  /export default router/,
]);
mustNotMatch('artifacts/api-server/src/routes/db.ts', '72_db_no_inline_full_resync_limit', [
  /const FULL_RESYNC_TABLES: Array/,
  /const RESYNC_TABLE_LIMIT: Record/,
  /const ACTIVE_KV_TABLES = new Set\(/,
]);
mustMatch('ARCHITECTURE.md', '72_architecture_path_after_resync_notify_peel', [
  /resync-policy|notify-inbound|ACTIVE_KV/,
  /~9\.5/,
]);



// ── 73: overlay-secrets + pin-collect + integrity-clamp + dedupe/merge apply + critical-write-log ──
mustMatch('artifacts/api-server/src/lib/db-app-settings-merge.ts', '73_overlay_secrets_export', [
  /export function overlaySecretsFromDbRow/,
]);
mustMatch('artifacts/api-server/src/lib/pin.ts', '73_collect_used_pins_export', [
  /export function collectUsedPinCodes/,
]);
mustMatch('artifacts/api-server/src/lib/db-integrity.ts', '73_integrity_clamp_exports', [
  /export function clampIntegrityScanMaxRows/,
  /export function clampIntegrityScanIntervalMs/,
]);
mustMatch('artifacts/api-server/src/lib/db-chat-pair-plan.ts', '73_chat_read_dedupe_apply_export', [
  /export function applyChatReadDedupeAction/,
]);
mustMatch('artifacts/api-server/src/lib/db-group-room-plan.ts', '73_group_merge_apply_exports', [
  /export function applyGroupParticipantMergeAction/,
  /export function remapRowsGroupId/,
]);
mustMatch('artifacts/api-server/src/lib/db-table-policy.ts', '73_critical_write_log_export', [
  /export function isCriticalWriteLog/,
  /export const CRITICAL_WRITE_LOG_TABLES/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '73_db_reimports_overlay_pin_apply_critical', [
  /overlaySecretsFromDbRow/,
  /collectUsedPinCodes/,
  /clampIntegrityScanMaxRows/,
  /applyChatReadDedupeAction/,
  /applyGroupParticipantMergeAction/,
  /remapRowsGroupId/,
  /isCriticalWriteLog/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '73_db_still_single_router_export', [
  /export default router/,
]);
mustNotMatch('artifacts/api-server/src/routes/db.ts', '73_db_no_inline_critical_write_table_list', [
  /table === 'messages' \|\| table === 'chats' \|\| table === 'likes' \|\| table === 'contact_shares' \|\| table === 'signal_sends'/,
]);
mustNotMatch('artifacts/api-server/src/routes/db.ts', '73_db_no_inline_integrity_scan_clamp', [
  /Number\.isFinite\(_integrityScanMaxRaw\)/,
]);
mustMatch('ARCHITECTURE.md', '73_architecture_path_after_overlay_pin_apply_peel', [
  /overlay-secrets|pin-collect|integrity-clamp|dedupe\/merge-apply|critical-write-log/,
  /~9\.5/,
]);



// ── 74: legacy-sql + device-secret-hash + admin-push-recipient/throttle + health-count-sql ──
mustMatch('artifacts/api-server/src/lib/db-legacy-cleanup.ts', '74_legacy_sql_builders_export', [
  /export function buildLegacyKvLeftoverCountSql/,
  /export function buildLegacySettingsStripSql/,
  /export function buildLegacyHistoryStripSql/,
  /export function parseLegacyLeftoverCounts/,
  /export const UNKNOWN_LEGACY_LEFTOVERS/,
]);
mustMatch('artifacts/api-server/src/lib/db-session-tokens.ts', '74_hash_device_secret_export', [
  /export function hashDeviceSecret/,
  /export function deviceSecretHashesEqual/,
]);
mustMatch('artifacts/api-server/src/lib/db-health-plan.ts', '74_admin_push_throttle_health_sql_export', [
  /export function resolveAdminPushRecipient/,
  /export function shouldThrottleEvent/,
  /export function buildHealthRecentCountSql/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '74_db_reimports_legacy_hash_admin_push', [
  /hashDeviceSecret/,
  /deviceSecretHashesEqual/,
  /resolveAdminPushRecipient/,
  /shouldThrottleEvent/,
  /buildHealthRecentCountSql/,
  /buildLegacySettingsStripSql/,
  /buildLegacyKvLeftoverCountSql/,
  /UNKNOWN_LEGACY_LEFTOVERS/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '74_db_still_single_router_export', [
  /export default router/,
]);
mustNotMatch('artifacts/api-server/src/routes/db.ts', '74_db_no_inline_legacy_strip_sql', [
  /data - 'heart_drain_enabled'/,
]);
mustNotMatch('artifacts/api-server/src/routes/db.ts', '74_db_no_inline_device_hmac', [
  /createHmac\('sha256', SSE_TOKEN_SECRET\)/,
]);
mustMatch('ARCHITECTURE.md', '74_architecture_path_after_legacy_hash_admin_peel', [
  /legacy-sql|device-secret-hash|admin-push-recipient|health-count-sql/,
  /~9\.5/,
]);


// ── 75: distributed-rate-sql + kv-persist-sql + schema/rls-sql ──
mustMatch('artifacts/api-server/src/lib/db-rate-limit.ts', '75_distributed_rate_sql_export', [
  /export function buildDistributedRateSlotSql/,
  /export function buildDistributedMinuteQuotaSql/,
  /export function buildRateLimitsPruneSql/,
]);
mustMatch('artifacts/api-server/src/lib/db-table-policy.ts', '75_kv_schema_sql_export', [
  /export function buildKvUpsertSql/,
  /export function buildKvDeleteRowSql/,
  /export function buildKvDeleteRowsSql/,
  /export function buildKvDeleteTableSql/,
  /export function buildImageUpsertSql/,
  /export function buildErrorLogCounterUpsertSql/,
  /export function buildEnsureKvRowsTableSql/,
  /export function buildEnsureImageStoreTableSql/,
  /export function buildKvTableUpdatedIndexSql/,
  /export function buildPublicTableRlsSql/,
  /export function buildLoadImagesSql/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '75_db_reimports_rate_kv_schema_sql', [
  /buildDistributedRateSlotSql/,
  /buildDistributedMinuteQuotaSql/,
  /buildRateLimitsPruneSql/,
  /buildKvUpsertSql/,
  /buildKvDeleteRowSql/,
  /buildImageUpsertSql/,
  /buildErrorLogCounterUpsertSql/,
  /buildPublicTableRlsSql/,
  /buildEnsureKvRowsTableSql/,
  /buildLoadImagesSql/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '75_db_still_single_router_export', [
  /export default router/,
]);
mustNotMatch('artifacts/api-server/src/routes/db.ts', '75_db_no_inline_rate_slot_sql', [
  /VALUES \('rate_limits', \$1, '\{\}'::jsonb/,
]);
mustNotMatch('artifacts/api-server/src/routes/db.ts', '75_db_no_inline_schema_rls_sql', [
  /CREATE TABLE IF NOT EXISTS app_kv_rows/,
  /ENABLE ROW LEVEL SECURITY/,
]);
mustMatch('ARCHITECTURE.md', '75_architecture_path_after_rate_kv_schema_peel', [
  /distributed-rate-sql|kv-persist-sql|schema\/rls-sql/,
  /~9\.5/,
]);





// ── 76: kv-select/load-sql + image-path-sql + error/audit-sql ──
mustMatch('artifacts/api-server/src/lib/db-table-policy.ts', '76_kv_select_image_audit_sql_export', [
  /export function buildKvSelectByRowIdsSql/,
  /export function buildKvSelectByTableRowIdSql/,
  /export function buildKvSelectLatestLimitedSql/,
  /export function buildAppSettingsLatestSql/,
  /export function buildGroupParticipantLookupSql/,
  /export function buildMessagesByChatIdsSql/,
  /export function buildErrorLogCounterDeleteSql/,
  /export function buildAuditLogUpsertSql/,
  /export function buildImageDeleteByPathsSql/,
  /export function buildImageSelectByPathSql/,
]);
mustMatch('artifacts/api-server/src/lib/db-store-merge.ts', '76_boot_load_sql_export', [
  /export function buildLoadHotKvTablesSql/,
  /export function buildLoadRemainingKvTablesSql/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '76_db_reimports_kv_select_image_load_sql', [
  /buildKvSelectByRowIdsSql/,
  /buildKvSelectByTableRowIdSql/,
  /buildKvSelectLatestLimitedSql/,
  /buildAppSettingsLatestSql/,
  /buildGroupParticipantLookupSql/,
  /buildMessagesByChatIdsSql/,
  /buildLoadHotKvTablesSql/,
  /buildLoadRemainingKvTablesSql/,
  /buildImageDeleteByPathsSql/,
  /buildImageSelectByPathSql/,
  /buildErrorLogCounterDeleteSql/,
  /buildAuditLogUpsertSql/,
  /buildKvDeleteTableSql/,
]);
mustMatch('artifacts/api-server/src/routes/db.ts', '76_db_still_single_router_export', [
  /export default router/,
]);
mustNotMatch('artifacts/api-server/src/routes/db.ts', '76_db_no_inline_image_path_sql', [
  /DELETE FROM app_image_store WHERE path = ANY/,
  /SELECT data_url FROM app_image_store WHERE path = \$1/,
]);
mustNotMatch('artifacts/api-server/src/routes/db.ts', '76_db_no_inline_error_log_delete_sql', [
  /table_name = 'db_error_log' AND row_id = 'counter'/,
]);
mustNotMatch('artifacts/api-server/src/routes/db.ts', '76_db_no_inline_boot_load_sql', [
  /table_name = ANY\(\$1::text\[\]\) ORDER BY updated_at ASC/,
  /table_name <> ALL\(\$1::text\[\]\) ORDER BY updated_at ASC/,
]);
mustMatch('ARCHITECTURE.md', '76_architecture_path_after_kv_select_image_peel', [
  /kv-select\/load-sql|image-path-sql|error\/audit-sql/,
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
