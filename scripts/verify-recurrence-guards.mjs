#!/usr/bin/env node
/**
 * Quick sweep — all 15 known failure/delay modes must stay fixed + guarded in repo.
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

// 3. functions_locked 403 — endurance mid-run SKIP (exit 2 at start)
mustMatch('scripts/endurance-5h.mjs', '03_functions_locked_skip', [
  /isOpFunctionsLocked/,
  /process\.exit\(2\)/,
  /return 'locked'|result === 'locked'/,
]);
mustMatch('scripts/lib/functions-lock.mjs', '03_functions_lock_helper', [/isOpFunctionsLocked/]);

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

// 7. admin event reset — documented in endurance (cannot fix mid-run)
mustMatch('scripts/endurance-5h.mjs', '07_admin_event_reset_doc', [/admin_event_end_reset/]);

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
