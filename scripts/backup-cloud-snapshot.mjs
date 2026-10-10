#!/usr/bin/env node
/**
 * Read-only Git source snapshot for offsite disaster recovery.
 * - No database connections or user data reads.
 * - No git push/tag/branch mutations.
 * - Includes full locally fetched git refs/history, and current tracked files.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputFlag = process.argv.indexOf('--out');
if (outputFlag < 0 || !process.argv[outputFlag + 1]) {
  console.error('Usage: node scripts/backup-cloud-snapshot.mjs --out <destination-directory>');
  process.exit(2);
}
const OUT = resolve(process.argv[outputFlag + 1]);
function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function gitFile(...args) {
  execFileSync('git', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
}
function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}
function shaFile(file) {
  return sha256(readFileSync(file));
}

const head = git('rev-parse', 'HEAD');
if (!/^[a-f0-9]{40}$/.test(head)) throw new Error('Invalid HEAD commit');
const listedFiles = git('ls-tree', '-r', '--name-only', 'HEAD').split('\n').filter(Boolean);
if (!listedFiles.length) throw new Error('Refusing empty source snapshot');
const refs = git('for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads', 'refs/remotes/origin', 'refs/tags')
  .split('\n').filter(Boolean).sort();
if (!refs.some(line => line.endsWith(` ${head}`))) {
  throw new Error('HEAD is not available in fetched branches/tags; full history cannot be guaranteed');
}
const refsHash = sha256(refs.join('\n') + '\n');
mkdirSync(OUT, { recursive: true });
const zipPath = join(OUT, 'source.zip');
const bundlePath = join(OUT, 'repository.bundle');
const manifestPath = join(OUT, 'manifest.json');
for (const path of [zipPath, bundlePath, manifestPath]) {
  if (existsSync(path)) throw new Error(`Refusing to overwrite an existing snapshot file: ${path}`);
}

gitFile('archive', '--format=zip', `--output=${zipPath}`, head);
gitFile('bundle', 'create', bundlePath, '--all');
gitFile('bundle', 'verify', bundlePath);
const bundleHeads = git('bundle', 'list-heads', bundlePath).split('\n').filter(Boolean);
if (!bundleHeads.some(line => line.startsWith(head + ' '))) {
  throw new Error('The Git bundle has no ref pointing to the main source commit');
}
const manifest = {
  project: 'BINPC2',
  repository: 'aoaldhkd-spec/BINPC2',
  head,
  git_refs_sha256: refsHash,
  git_ref_count: refs.length,
  source_file_count: listedFiles.length,
  bundle_head_count: bundleHeads.length,
  files: {
    'source.zip': { bytes: statSync(zipPath).size, sha256: shaFile(zipPath) },
    'repository.bundle': { bytes: statSync(bundlePath).size, sha256: shaFile(bundlePath) },
  },
  included: 'Tracked HEAD source + local Git history/branches/tags fetched by the workflow',
  excluded: 'Live Supabase data, deployed settings, environment variables, credentials, secrets',
};
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(`Backup ready: HEAD ${head.slice(0, 12)}, ${listedFiles.length} files, ${refs.length} refs`);
console.log(`Git refs fingerprint: ${refsHash.slice(0, 12)}`);
console.log(`Output location: ${OUT}`);
