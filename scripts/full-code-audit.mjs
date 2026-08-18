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

process.exit(errors.length ? 1 : 0);
