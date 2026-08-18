#!/usr/bin/env node
/**
 * 전수조사 — 모든 소스 파일을 순회하며 정적 패턴·구조 이슈를 보고한다.
 * Usage: node scripts/full-code-audit.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const EXT = new Set(['.ts', '.tsx', '.js', '.mjs']);
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', '.vite']);

/** Removed features — must not reappear in app/server code (not guard tests). */
const BANNED_REGRESSION = [
  { id: 'heart_balances_table', re: /heart_balances/, sev: 'error' },
  { id: 'my_heart_count_state', re: /\bmyHeartCount\b/, sev: 'error' },
  { id: 'heart_initial_count', re: /heart_initial_count/, sev: 'error' },
  { id: 'admin_reset_heart', re: /admin_reset_heart/, sev: 'error' },
];
/** Removed features — participant app only (server keeps legacy cleanup SQL) */
const CLIENT_BANNED = [
  { id: 'seating_tables_client', re: /seating_locked|seats_snapshot|seating_map|\bseat_layout\b/, sev: 'error' },
  { id: 'heart_drain_client', re: /heart_drain/, sev: 'error' },
];
/** iPhone/Galaxy mobile UI regressions */
const MOBILE_BANNED = [
  { id: 'tabbar_toast_double_stack', re: /4\.5rem\+var\(--participant-tabbar/, sev: 'error' },
  { id: 'storage_upload_raw_fetch', re: /fetch\([^)]*['"]\/api\/db\/storage-upload/, sev: 'error' },
];
/** Per-file recurrence bans (path suffix match) */
const FILE_SCOPED_BANNED = [
  {
    fileSuffix: 'artifacts/boltnew-app/src/components/ProfileCard.tsx',
    id: 'profile_card_heart_chat_min_h_11',
    re: /min-h-11/,
    sev: 'error',
  },
  {
    fileSuffix: 'artifacts/boltnew-app/src/components/ProfileCard.tsx',
    id: 'profile_card_marquee_menu_w8',
    re: /\bw-8 h-8\b/,
    sev: 'error',
  },
  {
    fileSuffix: 'artifacts/boltnew-app/src/App.tsx',
    id: 'signal_nudge_banner_import',
    re: /SignalNudgeBanner/,
    sev: 'error',
  },
];
const BANNED_SKIP = /(?:__tests__|\.test\.(?:ts|tsx|mjs)$|longevity-guards|product-invariants|full-code-audit|verify-all-features)/;

const PATTERNS = [
  { id: 'ts_ignore', re: /@ts-ignore|@ts-expect-error/, sev: 'warn' },
  { id: 'empty_catch', re: /catch\s*\([^)]*\)\s*\{\s*\}/, sev: 'warn' },
  { id: 'eval_usage', re: /\beval\s*\(/, sev: 'error' },
  { id: 'duplicate_key', re: /^(\s+)(\w+)\??:\s*[^;]+;\s*$/m, sev: 'info' }, // handled separately
  { id: 'useEffect_string_return', re: /return\s*\(\)\s*=>\s*\w+\.style\.removeProperty/, sev: 'error' },
  { id: 'hardcoded_secret', re: /(?:password|secret|token|api_key)\s*[:=]\s*['"][^'"]{8,}['"]/i, sev: 'warn' },
  { id: 'any_cast', re: /as\s+any\b/, sev: 'info' },
  { id: 'console_log', re: /\bconsole\.log\s*\(/, sev: 'info' },
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (SKIP_DIRS.has(name)) continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (EXT.has(extname(name))) out.push(p);
  }
  return out;
}

function checkDuplicateInterfaceKeys(content, rel) {
  const issues = [];
  const ifaceRe = /interface\s+\w+\s*\{([^}]+)\}/g;
  let m;
  while ((m = ifaceRe.exec(content))) {
    const body = m[1];
    const keys = [...body.matchAll(/^\s*(\w+)\??\s*:/gm)].map(x => x[1]);
    const seen = new Set();
    for (const k of keys) {
      if (seen.has(k)) issues.push({ line: content.slice(0, m.index).split('\n').length, msg: `duplicate interface key: ${k}` });
      seen.add(k);
    }
  }
  return issues;
}

function auditFile(absPath) {
  const rel = relative(ROOT, absPath).replace(/\\/g, '/');
  const content = readFileSync(absPath, 'utf8');
  const lines = content.split('\n');
  const findings = [];

  const scanBanned = rel.startsWith('artifacts/') && !BANNED_SKIP.test(rel);
  const scanClientBanned = rel.startsWith('artifacts/boltnew-app/src/') && !BANNED_SKIP.test(rel);
  const scanMobile = rel.startsWith('artifacts/boltnew-app/src/') && !BANNED_SKIP.test(rel);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const n = i + 1;
    for (const { id, re, sev } of PATTERNS) {
      if (id === 'duplicate_key') continue;
      if (id === 'eval_usage' && /\/tests\/.*\.spec\.(ts|tsx)$/.test(rel)) continue;
      if (re.test(line)) {
        findings.push({ rel, line: n, id, sev, text: line.trim().slice(0, 120) });
      }
    }
    if (scanBanned) {
      for (const { id, re, sev } of BANNED_REGRESSION) {
        if (re.test(line)) {
          findings.push({ rel, line: n, id, sev, text: line.trim().slice(0, 120) });
        }
      }
    }
    if (scanClientBanned) {
      for (const { id, re, sev } of CLIENT_BANNED) {
        if (re.test(line)) {
          findings.push({ rel, line: n, id, sev, text: line.trim().slice(0, 120) });
        }
      }
    }
    if (scanMobile) {
      for (const { id, re, sev } of MOBILE_BANNED) {
        if (re.test(line)) {
          findings.push({ rel, line: n, id, sev, text: line.trim().slice(0, 120) });
        }
      }
    }
    for (const { fileSuffix, id, re, sev } of FILE_SCOPED_BANNED) {
      if (rel === fileSuffix && re.test(line)) {
        findings.push({ rel, line: n, id, sev, text: line.trim().slice(0, 120) });
      }
    }
  }

  for (const dup of checkDuplicateInterfaceKeys(content, rel)) {
    findings.push({ rel, line: dup.line, id: 'dup_iface_key', sev: 'error', text: dup.msg });
  }

  return { rel, lines: lines.length, findings };
}

const files = walk(ROOT).filter(f => !f.includes('node_modules'));
let totalLines = 0;
const allFindings = [];
const bySev = { error: 0, warn: 0, info: 0 };

console.log(`\n=== BINPC2 전수조사 ===`);
console.log(`Root: ${ROOT}`);
console.log(`Files: ${files.length}\n`);

for (const f of files.sort()) {
  const r = auditFile(f);
  totalLines += r.lines;
  for (const finding of r.findings) {
    allFindings.push(finding);
    bySev[finding.sev] = (bySev[finding.sev] ?? 0) + 1;
  }
}

console.log(`Total lines scanned: ${totalLines}`);
console.log(`Findings: error=${bySev.error} warn=${bySev.warn} info=${bySev.info}\n`);

const errors = allFindings.filter(f => f.sev === 'error');
const warns = allFindings.filter(f => f.sev === 'warn');

if (errors.length) {
  console.log('--- ERRORS ---');
  for (const f of errors) console.log(`  ${f.rel}:${f.line} [${f.id}] ${f.text}`);
}
if (warns.length) {
  console.log('\n--- WARNS (first 40) ---');
  for (const f of warns.slice(0, 40)) console.log(`  ${f.rel}:${f.line} [${f.id}] ${f.text}`);
  if (warns.length > 40) console.log(`  ... +${warns.length - 40} more`);
}

console.log('\n--- File inventory ---');
const byDir = {};
for (const f of files) {
  const rel = relative(ROOT, f).replace(/\\/g, '/');
  const dir = rel.split('/').slice(0, 3).join('/');
  byDir[dir] = (byDir[dir] ?? 0) + 1;
}
for (const [d, c] of Object.entries(byDir).sort()) console.log(`  ${d}: ${c} files`);

// 장시간 soak — SSE 1h TTL 만료로 401 나지 않도록 선제 갱신 필수 (재발방지)
const endurancePath = resolve(ROOT, 'scripts/endurance-5h.mjs');
try {
  const enduranceSrc = readFileSync(endurancePath, 'utf8');
  const enduranceGuards = [
    ['endurance_sse_expires_at', /expiresAt/],
    ['endurance_sse_proactive_refresh', /SSE_TOKEN_REFRESH_LEAD_SEC|sseNeedsRefresh/],
    ['endurance_sse_401_retry', /openSseWithRetry|401/],
    ['endurance_sse_ensure_connected', /ensureConnected/],
    ['endurance_functions_locked_mid_run', /isOpFunctionsLocked|FUNCTIONS_LOCKED mid-run/],
    ['endurance_parallel_lock', /acquireEnduranceLock/],
    ['endurance_admin_reset_doc', /admin_event_end_reset/],
    ['endurance_rate_limit_note', /429|Rate limit/i],
  ];
  for (const [id, re] of enduranceGuards) {
    if (!re.test(enduranceSrc)) {
      const f = { rel: 'scripts/endurance-5h.mjs', line: 1, id, sev: 'error', text: `missing ${id}` };
      allFindings.push(f);
      errors.push(f);
      console.log(`  ${f.rel}:${f.line} [${f.id}] ${f.text}`);
    }
  }
} catch { /* ignore */ }

// 2-user realtime — HTTP는 Netlify, SSE는 Render 직접 (Netlify event-stream 버퍼링 재발방지)
const realtimePath = resolve(ROOT, 'scripts/test-realtime-two-user.mjs');
try {
  const realtimeSrc = readFileSync(realtimePath, 'utf8');
  const realtimeGuards = [
    ['realtime_sse_origin_separate', /SSE_ORIGIN|SSE_API/],
    ['realtime_sse_not_netlify_api', /`\$\{SSE_API\}\/events/],
    ['realtime_sse_render_default', /binpc2\.onrender\.com/],
  ];
  for (const [id, re] of realtimeGuards) {
    if (!re.test(realtimeSrc)) {
      const f = { rel: 'scripts/test-realtime-two-user.mjs', line: 1, id, sev: 'error', text: `missing ${id}` };
      allFindings.push(f);
      errors.push(f);
      console.log(`  ${f.rel}:${f.line} [${f.id}] ${f.text}`);
    }
  }
  if (/\$\{API\}\/events/.test(realtimeSrc)) {
    const f = {
      rel: 'scripts/test-realtime-two-user.mjs',
      line: 1,
      id: 'realtime_sse_via_netlify_api',
      sev: 'error',
      text: 'SSE must not use ${API}/events (Netlify buffers event-stream)',
    };
    allFindings.push(f);
    errors.push(f);
    console.log(`  ${f.rel}:${f.line} [${f.id}] ${f.text}`);
  }
} catch { /* ignore */ }

// localdb.ts — 80% TTL 선제 SSE 갱신 (1h 401 재발방지)
const localdbPath = resolve(ROOT, 'artifacts/boltnew-app/src/lib/localdb.ts');
try {
  const localdbSrc = readFileSync(localdbPath, 'utf8');
  const localdbGuards = [
    ['localdb_sse_80pct_refresh', /80%|SSE_TOKEN_REFRESH_LEAD_SEC/],
    ['localdb_sse_expired_close', /closeSse\('expired-token-close'\)/],
    ['localdb_schedule_sse_refresh', /scheduleSseTokenRefresh/],
  ];
  for (const [id, re] of localdbGuards) {
    if (!re.test(localdbSrc)) {
      const f = { rel: 'artifacts/boltnew-app/src/lib/localdb.ts', line: 1, id, sev: 'error', text: `missing ${id}` };
      allFindings.push(f);
      errors.push(f);
      console.log(`  ${f.rel}:${f.line} [${f.id}] ${f.text}`);
    }
  }
} catch { /* ignore */ }

// signal_sends push — 📡 not 💕 (하트·시그널 이모지 혼동 재발방지)
const dbPath = resolve(ROOT, 'artifacts/api-server/src/routes/db.ts');
try {
  const dbSrc = readFileSync(dbPath, 'utf8');
  const sigIdx = dbSrc.indexOf("table === 'signal_sends'");
  if (sigIdx >= 0) {
    const sigBlock = dbSrc.slice(sigIdx, sigIdx + 400);
    if (sigBlock.includes('💕')) {
      const f = {
        rel: 'artifacts/api-server/src/routes/db.ts',
        line: 1,
        id: 'signal_push_uses_heart_emoji',
        sev: 'error',
        text: 'signal_sends push title must use 📡 not 💕',
      };
      allFindings.push(f);
      errors.push(f);
      console.log(`  ${f.rel}:${f.line} [${f.id}] ${f.text}`);
    }
    if (!sigBlock.includes('📡')) {
      const f = {
        rel: 'artifacts/api-server/src/routes/db.ts',
        line: 1,
        id: 'signal_push_missing_signal_emoji',
        sev: 'error',
        text: 'signal_sends push title must include 📡',
      };
      allFindings.push(f);
      errors.push(f);
      console.log(`  ${f.rel}:${f.line} [${f.id}] ${f.text}`);
    }
  }
} catch { /* ignore */ }

// functions-lock helper — endurance mid-run SKIP 공용
const lockPath = resolve(ROOT, 'scripts/lib/functions-lock.mjs');
try {
  const lockSrc = readFileSync(lockPath, 'utf8');
  if (!/isOpFunctionsLocked/.test(lockSrc)) {
    const f = {
      rel: 'scripts/lib/functions-lock.mjs',
      line: 1,
      id: 'functions_lock_op_helper',
      sev: 'error',
      text: 'missing isOpFunctionsLocked for mid-run SKIP',
    };
    allFindings.push(f);
    errors.push(f);
    console.log(`  ${f.rel}:${f.line} [${f.id}] ${f.text}`);
  }
} catch { /* ignore */ }

// Render cold-start mitigation — keep-api-warm script + scheduled CI
for (const [rel, id] of [
  ['scripts/keep-api-warm.mjs', 'keep_api_warm_script'],
  ['.github/workflows/keep-api-warm.yml', 'keep_api_warm_ci'],
]) {
  try {
    readFileSync(resolve(ROOT, rel), 'utf8');
  } catch {
    const f = { rel, line: 1, id, sev: 'error', text: `missing ${rel}` };
    allFindings.push(f);
    errors.push(f);
    console.log(`  ${f.rel}:${f.line} [${f.id}] ${f.text}`);
  }
}

process.exit(errors.length ? 1 : 0);
