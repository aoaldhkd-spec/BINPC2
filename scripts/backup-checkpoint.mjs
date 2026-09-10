#!/usr/bin/env node
/**
 * BINPC2 checkpoint backup — git tag + push to GitHub.
 * Usage:
 *   node scripts/backup-checkpoint.mjs          # tag only (local)
 *   node scripts/backup-checkpoint.mjs --push   # tag + push main + tag
 *   pnpm run backup                             # same as --push
 */
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const push = process.argv.includes('--push');
const allowDirty = process.argv.includes('--allow-dirty');

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: opts.silent ? 'pipe' : 'inherit', ...opts });
}

function runQuiet(cmd) {
  return run(cmd, { silent: true }).trim();
}

function kstStamp() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}-${get('hour')}${get('minute')}`;
}

function main() {
  const branch = runQuiet('git rev-parse --abbrev-ref HEAD');
  if (branch !== 'main') {
    console.error(`❌ main 브랜치에서 실행해 주세요 (현재: ${branch})`);
    process.exit(1);
  }

  const porcelain = runQuiet('git status --porcelain').split('\n').filter(Boolean);
  const dirty = porcelain.filter((line) => !line.endsWith('menu-fix-local.png')
    && !line.includes('menu-live-screenshot.png')
    && !line.includes('menu-test-page.png'));

  if (dirty.length > 0 && !allowDirty) {
    console.error('❌ 커밋되지 않은 변경이 있습니다. 먼저 커밋하거나 --allow-dirty 를 사용하세요.');
    console.error(dirty.join('\n'));
    process.exit(1);
  }

  const head = runQuiet('git rev-parse --short HEAD');
  const tag = `checkpoint/${kstStamp()}`;

  try {
    runQuiet(`git rev-parse --verify refs/tags/${tag}`);
    console.error(`❌ 태그 ${tag} 가 이미 있습니다. 1분 후 다시 실행하세요.`);
    process.exit(1);
  } catch {
    /* new tag ok */
  }

  const msg = `Checkpoint backup ${tag} @ ${head}`;
  run(`git tag -a "${tag}" -m "${msg}"`);
  console.log(`\n✅ 로컬 백업 태그 생성: ${tag} (${head})`);

  if (!push) {
    console.log('\nGitHub에 올리려면:');
    console.log(`  git push origin main`);
    console.log(`  git push origin "${tag}"`);
    console.log('또는: pnpm run backup');
    return;
  }

  const ahead = runQuiet('git rev-list --count origin/main..HEAD');
  if (Number(ahead) > 0) {
    run('git push origin main');
  } else {
    console.log('ℹ️  origin/main 과 동기화됨 — main 푸시 생략');
  }
  run(`git push origin "${tag}"`);
  console.log(`\n✅ GitHub 백업 완료: ${tag}`);
  console.log('   복원: git checkout <태그> 또는 git checkout -b restore-<날짜> <태그>');
}

main();
