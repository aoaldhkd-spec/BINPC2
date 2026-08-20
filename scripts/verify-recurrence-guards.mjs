#!/usr/bin/env node
/**
 * Quick sweep — all known failure/delay modes must stay fixed + guarded in repo.
 * Usage: node scripts/verify-recurrence-guards.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

/** @type {{ id: string, ok: boolean, detail?: string }[]} */
const results = [];

function mustExist(rel, id) {
  const ok = existsSync(resolve(ROOT, rel));
  results.push({ id, ok, detail: ok ? rel : `missing ${rel}` });
  return ok;
}

function mustMatch(rel, id, patterns) {
  const src = read(rel);
  for (const re of patterns) {
    if (!re.test(src)) {
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
    if (re.test(src)) {
      results.push({ id, ok: false, detail: `${rel} must not match ${re}` });
      return false;
    }
  }
  results.push({ id, ok: true, detail: rel });
  return true;
}

// 1. SSE 401 @ 1h — localdb 80% refresh + endurance reconnect/refresh
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

// 2. Netlify SSE buffering — VITE_SSE_ORIGIN + Render-direct E2E
mustMatch('artifacts/boltnew-app/src/lib/localdb.ts', '02_sse_origin_localdb', [/VITE_SSE_ORIGIN/, /SSE_ORIGIN/]);
mustMatch('netlify.toml', '02_sse_origin_netlify', [/VITE_SSE_ORIGIN\s*=\s*"https:\/\/binpc2\.onrender\.com"/]);
mustMatch('scripts/test-realtime-two-user.mjs', '02_sse_render_e2e', [
  /SSE_ORIGIN|SSE_API/,
  /`\$\{SSE_API\}\/events/,
  /binpc2\.onrender\.com/,
]);
mustNotMatch('scripts/test-realtime-two-user.mjs', '02_sse_not_netlify', [/\$\{API\}\/events/]);

// 3. functions_locked — SSE live toggle, mid-run SKIP, unlock resume
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

// 4. SSE idle drop between cycles
mustMatch('scripts/endurance-5h.mjs', '04_sse_ensure_connected', [/await sseB\.ensureConnected\(\)|ensureConnected\(\)/]);

// 5. Render cold start — keep-api-warm + CI
mustExist('scripts/keep-api-warm.mjs', '05_keep_api_warm_script');
mustExist('.github/workflows/keep-api-warm.yml', '05_keep_api_warm_ci');
mustMatch('render.yaml', '05_single_render_instance', [/numInstances:\s*1/]);

// 6. Rate limit 429 — single instance note in endurance header
mustMatch('scripts/endurance-5h.mjs', '06_rate_limit_single_instance', [
  /429|Rate limit/i,
  /numInstances:1|ONE endurance/i,
]);

// 7. admin event reset — auto re-provision soak users mid-run
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

// 8. Photo upload sessionToken — uploadStorageDataUrl, no raw fetch
mustMatch('artifacts/boltnew-app/src/lib/localdb.ts', '08_upload_session_token', [
  /uploadStorageDataUrl/,
  /storage-upload[\s\S]*sessionToken/,
]);
mustMatch('artifacts/boltnew-app/src/components/MainScreen.tsx', '08_main_upload_helper', [/uploadStorageDataUrl/]);
mustNotMatch('artifacts/boltnew-app/src/components/MainScreen.tsx', '08_no_raw_storage_fetch', [
  /fetch\([^)]*['"]\/api\/db\/storage-upload/,
]);

// 9. CI load-venue flake — p95 3500 register / 1500 ready
mustMatch('artifacts/api-server/src/__tests__/load-venue-150.test.ts', '09_load_venue_p95', [
  /pct\(lat, 95\)\)\.toBeLessThan\(3_500\)/,
  /pct\(readyLat, 95\)\)\.toBeLessThan\(1_500\)/,
]);

// 10. Admin password mismatch — SKIP not FAIL
mustMatch('scripts/verify-all-features.mjs', '10_admin_pw_skip', [/SKIP \(local password mismatch/]);

// 11. Parallel endurance — lock file + RUN_ID warning
mustMatch('scripts/endurance-5h.mjs', '11_parallel_endurance_lock', [
  /acquireEnduranceLock/,
  /releaseEnduranceLock/,
  /RUN_ID=/,
  /Parallel endurance|ENDURANCE_FORCE_LOCK/,
]);

// 12. Mobile — tabbar safe-area, toast, ProfileCard, HEIC
mustMatch('artifacts/boltnew-app/index.html', '12_mobile_viewport', [/viewport-fit=cover/]);
mustMatch('artifacts/boltnew-app/src/index.css', '12_mobile_safe_area', [
  /--tabbar-safe-bottom/,
  /\.participant-tabbar/,
  /font-size:\s*max\(16px/,
]);
mustMatch('artifacts/boltnew-app/src/components/BottomNotification.tsx', '12_toast_tabbar', [
  /var\(--participant-tabbar/,
]);
mustNotMatch('artifacts/boltnew-app/src/components/BottomNotification.tsx', '12_toast_no_double_stack', [
  /4\.5rem\+var\(--participant-tabbar/,
]);
mustNotMatch('artifacts/boltnew-app/src/components/ProfileCard.tsx', '12_profile_card_sizes', [/min-h-11/, /\bw-8 h-8\b/]);
// Flip must keep ticker + nick bars; only middle flips; ideal inset under ticker (not hide bars)
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
]);
mustMatch('artifacts/boltnew-app/src/lib/profile-photo.ts', '12_heic_reject', [/HEIC|heic/, /JPG, PNG, WebP/]);

// 13. heart_balances removed — BANNED_REGRESSION in audit
mustMatch('scripts/full-code-audit.mjs', '13_heart_balances_banned', [
  /heart_balances/,
  /BANNED_REGRESSION/,
]);

// 14. Signal 📡 vs heart 💕, no SignalNudgeBanner
{
  const db = read('artifacts/api-server/src/routes/db.ts');
  const sigIdx = db.indexOf("table === 'signal_sends'");
  const sigBlock = sigIdx >= 0 ? db.slice(sigIdx, sigIdx + 400) : '';
  const ok = sigIdx >= 0 && sigBlock.includes('📡') && !sigBlock.includes('💕');
  results.push({
    id: '14_signal_emoji',
    ok,
    detail: ok ? 'signal_sends uses 📡 not 💕' : 'signal_sends push emoji guard failed',
  });
}
mustNotMatch('artifacts/boltnew-app/src/App.tsx', '14_no_signal_nudge_banner', [/SignalNudgeBanner/]);

// 15. GitHub CI — test:unit + audit:code
mustMatch('.github/workflows/verify.yml', '15_ci_unit_audit', [/pnpm run audit:code/, /test:unit/]);

// 16. Korean age (+1) — centralized korean-age.ts, no intl age in profile/group/db
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
mustMatch('artifacts/boltnew-app/src/lib/profile.ts', '16_profile_uses_korean_age', [/from '\.\/korean-age'/]);
mustMatch('artifacts/boltnew-app/src/lib/group-rooms.ts', '16_group_rooms_korean_age', [/from '\.\/korean-age'/]);
mustMatch('artifacts/api-server/src/routes/db.ts', '16_db_group_age', [/groupAgeDecadeBand/]);
mustNotMatch('artifacts/boltnew-app/src/lib/group-rooms.ts', '16_no_hardcoded_2026_age', [/2026\s*-\s*y\s*\+\s*1/]);
mustNotMatch('artifacts/api-server/src/routes/db.ts', '16_db_no_inline_age', [
  /getFullYear\(\)\s*-\s*y\s*\+\s*1/,
]);

// 17. Supabase RLS — public tables not exposed via anon REST
mustMatch('artifacts/api-server/src/routes/db.ts', '17_supabase_rls_startup', [
  /ensurePublicTableRls/,
  /ENABLE ROW LEVEL SECURITY/,
  /REVOKE ALL ON public/,
]);
mustExist('scripts/sql/enable-rls-public-tables.sql', '17_supabase_rls_sql');

// 18. Status signal/contact pills — center popup modal (not bottom sheet)
mustMatch('artifacts/boltnew-app/src/components/MainScreen.tsx', '18_status_center_modal', [
  /status-quick-modal-title/,
  /items-center justify-center/,
  /safe-overlay fixed inset-0/,
]);
mustNotMatch('artifacts/boltnew-app/src/components/MainScreen.tsx', '18_not_bottom_sheet', [
  /statusQuickSheet[\s\S]{0,400}items-end/,
  /statusQuickSheet[\s\S]{0,400}rounded-t-3xl/,
]);

// 19. Sent hearts 2-column grid on My Status
mustMatch('artifacts/boltnew-app/src/components/MainScreen.tsx', '19_sent_hearts_2col', [
  /grid grid-cols-2 gap-2\.5/,
]);

// 20. Profile card grid density modes
mustExist('artifacts/boltnew-app/src/lib/profile-card-grid.ts', '20_profile_card_grid');
mustMatch('artifacts/boltnew-app/src/components/MainScreen.tsx', '20_main_uses_card_grid', [
  /profile-card-grid/,
  /ProfileCardGridMode|cardGridMode/,
]);

// 21. E2E disconnect/reconnect scripts wired into smoke + unit guards
mustExist('scripts/test-chat-disconnect-recovery.mjs', '21_chat_disconnect_recovery');
mustExist('scripts/e2e-heart-sse-consistency.mjs', '21_e2e_heart_consistency_script');
mustExist('scripts/test-mutual-chat-hearts.mjs', '21_mutual_chat_hearts');
mustExist('scripts/lib/e2e-realtime.mjs', '21_e2e_realtime_lib');
mustMatch('scripts/test-mutual-chat-hearts.mjs', '21_mutual_sse_render', [
  /SSE_API/,
  /binpc2\.onrender\.com/,
  /createPersonaPair/,
]);
mustMatch('scripts/verify-all-features.mjs', '21_verify_all_e2e', [
  /test-chat-disconnect-recovery\.mjs/,
  /e2e-heart-sse-consistency\.mjs/,
  /test-mutual-chat-hearts\.mjs/,
]);
mustExist('artifacts/boltnew-app/src/lib/chat-pending-queue.ts', '21_chat_pending_queue');
mustExist('artifacts/boltnew-app/src/lib/chat-pending-queue.test.ts', '21_chat_pending_queue_test');
mustExist('artifacts/boltnew-app/src/__tests__/e2e-reconnect-guards.test.ts', '21_e2e_vitest_guards');

// 22. Legacy KV cleanup — startup purge + /op blocklist (seating, heart_drain, heart_balances)
mustExist('artifacts/api-server/src/lib/db-legacy-cleanup.ts', '22_legacy_cleanup_lib');
mustExist('artifacts/api-server/src/__tests__/db-legacy-cleanup.test.ts', '22_legacy_cleanup_test');
mustMatch('artifacts/api-server/src/routes/db.ts', '22_cleanup_on_startup', [
  /cleanupLegacyTables\(\)/,
  /dbReadyPromise[\s\S]{0,120}\.then\(\(\) => cleanupLegacyTables\(\)\)/,
  /DELETE FROM app_kv_rows WHERE table_name = \$1/,
  /data - 'heart_drain_enabled'/,
  /legacy_leftovers/,
]);
mustExist('scripts/lib/entry-burst.mjs', '22_entry_burst_lib');
mustMatch('scripts/sim-concurrent-users.mjs', '22_entry_only_flag', [
  /--entry-only/,
  /runEntryBurst/,
]);
mustExist('artifacts/boltnew-app/src/components/FortuneTab.lazy.tsx', '22_fortune_lazy_shared');
mustMatch('artifacts/boltnew-app/src/App.tsx', '22_fortune_lazy_import', [
  /FortuneTabLazy/,
  /FortuneTab\.lazy/,
]);
mustMatch('artifacts/api-server/src/lib/db-legacy-cleanup.ts', '22_legacy_blocklist', [
  /heart_balances/,
  /heart_drain_enabled/,
  /seats_snapshot/,
]);
mustMatch('artifacts/api-server/src/__tests__/db-security.test.ts', '22_legacy_op_block', [
  /legacy removed-feature tables stay blocked/,
  /heart_balances/,
  /seats/,
]);

// 23. Test/dummy nicknames — Korean names only, no trailing digit suffixes
mustMatch('scripts/lib/test-personas.mjs', '23_persona_no_digit_suffix_doc', [
  /NO numeric suffixes/,
  /nicknameEndsWithDigit/,
  /NICK_MODIFIERS/,
]);
mustNotMatch('scripts/lib/test-personas.mjs', '23_persona_no_padStart_digits', [
  /padStart\(/,
  /\$\{base\}\$\{suffix\}/,
  /2–4 digit suffix/,
  /base \(2–3\) \+ 2–4 digit/,
]);
mustMatch('scripts/sim-concurrent-users.mjs', '23_sim_names_only_comment', [
  /no digit suffixes/i,
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

console.log('\n=== verify-recurrence-guards ===\n');
for (const r of results) {
  console.log(`  ${r.ok ? 'OK' : 'FAIL'}  ${r.id}${r.detail && !r.ok ? ` — ${r.detail}` : ''}`);
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.error(`\n${failed.length} guard(s) missing — recurrence risk.\n`);
  process.exit(1);
}
console.log('\nAll recurrence guards present.\n');
