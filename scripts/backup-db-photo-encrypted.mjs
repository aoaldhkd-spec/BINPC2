#!/usr/bin/env node
/**
 * MANUAL ONLY: pipe public-schema PostgreSQL app data and in-DB image rows
 * straight into age encryption. No plaintext dump files or cloud uploads.
 * Default is DRY_RUN_ONLY; production read requires --run and explicit approval.
 */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, openSync, closeSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PROJECT = 'dlliqqlqdtdkfakdtwyw';
const EXPECTED_HOST = 'db.' + PROJECT + '.supabase.co';

export function validateManualBackupConfig(env, outputDir) {
  if (!outputDir || !isAbsolute(outputDir)) throw new Error('Output directory must be an absolute local path');
  if (/onedrive/i.test(outputDir)) throw new Error('OneDrive paths are prohibited');
  const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const withinSource = relative(sourceRoot, resolve(outputDir));
  if (withinSource === '' || (!withinSource.startsWith('..') && !isAbsolute(withinSource))) {
    throw new Error('Never write private backups inside the Git source tree');
  }
  if (env.PGHOST !== EXPECTED_HOST) throw new Error('Database host is not the approved BINPC2 project');
  if (!['require', 'verify-ca', 'verify-full'].includes(env.PGSSLMODE)) throw new Error('Explicit PostgreSQL TLS protection is required');
  if (!env.PGDATABASE || !env.PGUSER) throw new Error('Missing explicit PostgreSQL database/user');
  if (!env.PGPASSWORD && !env.PGPASSFILE) throw new Error('Provide a PostgreSQL password or passfile privately');
  if (!/^age1[023456789acdefghjklmnpqrstuvwxyz]{50,90}$/.test(env.BINPC2_AGE_RECIPIENT || '')) {
    throw new Error('Invalid age public encryption recipient');
  }
  return { project: PROJECT, outputDir: resolve(outputDir) };
}

function waitFor(child) {
  return new Promise((resolvePromise, reject) => {
    child.once('error', reject);
    child.once('close', code => code === 0
      ? resolvePromise()
      : reject(new Error('Backup subprocess returned code ' + code)));
  });
}

async function digestFile(path) {
  const hash = createHash('sha256');
  for await (const block of createReadStream(path)) hash.update(block);
  return hash.digest('hex');
}

export async function executeEncryptedBackup(env, outputDir) {
  const planned = validateManualBackupConfig(env, outputDir);
  if (env.BINPC2_DB_BACKUP_APPROVED !== 'YES') throw new Error('Explicit manual backup approval is missing');
  for (const [command, flag] of [['pg_dump', '--version'], ['age', '--version']]) {
    const check = spawnSync(command, [flag], { encoding: 'utf8', timeout: 5_000 });
    if (check.error || check.status !== 0) throw new Error('Required tool unavailable: ' + command);
  }
  const label = new Date().toISOString().replace(/[.:]/g, '-');
  const name = 'BINPC2_PRIVATE_DB_PHOTOS_' + label + '.pgdump.age';
  const path = join(planned.outputDir, name);
  const receiptPath = path + '.receipt.json';
  if (existsSync(path) || existsSync(receiptPath)) throw new Error('Refusing to overwrite existing backup');

  const oldUmask = process.umask(0o077);
  let fd;
  try {
    fd = openSync(path, 'wx', 0o600);
    // Exclude all PostgreSQL credentials from the encryption child process.
    const ageEnv = { PATH: env.PATH || '', HOME: env.HOME || '', TMPDIR: env.TMPDIR || '' };
    const encryption = spawn('age', ['-r', env.BINPC2_AGE_RECIPIENT], {
      stdio: ['pipe', fd, 'pipe'], env: ageEnv,
    });
    closeSync(fd);
    fd = undefined;
    // Public schema contains the app's app_kv_rows and app_image_store tables.
    // Its SQL rows never touch disk in plaintext.
    const dump = spawn('pg_dump', [
      '--format=custom', '--schema=public', '--no-owner', '--no-privileges',
    ], { stdio: ['ignore', 'pipe', 'pipe'], env });
    dump.stderr.on('data', () => {}); // Never print private connection information.
    encryption.stderr.on('data', () => {});
    encryption.stdin.on('error', () => {});
    dump.stdout.pipe(encryption.stdin);
    await Promise.all([waitFor(dump), waitFor(encryption)]);
    const bytes = statSync(path).size;
    if (!bytes) throw new Error('Empty encrypted archive');
    const receipt = {
      kind: 'BINPC2-ENCRYPTED-DB-AND-IN-DB-IMAGES', version: 1,
      project: PROJECT, created_at_utc: new Date().toISOString(),
      cipher: 'age-x25519', filename: name, bytes, sha256: await digestFile(path),
      includes: 'public PostgreSQL schema (including in-DB image table if present)',
      excluded: 'Supabase auth/storage external objects; secrets not in DB',
      restore_verified: false, offsite_uploaded: false,
    };
    writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return receipt;
  } catch (error) {
    if (fd !== undefined) closeSync(fd);
    if (existsSync(path)) unlinkSync(path); // Only the newly created incomplete file.
    throw new Error('Encrypted backup failed; no valid snapshot retained: ' + String(error.message).slice(0, 300));
  } finally {
    process.umask(oldUmask);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes('--run')) {
    console.log('DRY_RUN_ONLY: no database access, encryption, files or uploads.');
    console.log('Manual owner-PC use: --run --out <local non-OneDrive folder> plus exact host, age recipient and explicit approval.');
  } else {
    const idx = process.argv.indexOf('--out');
    executeEncryptedBackup(process.env, idx >= 0 ? process.argv[idx + 1] : null)
      .then(result => console.log('Encrypted local snapshot SHA256=' + result.sha256 + '; remote restore/upload UNVERIFIED.'))
      .catch(error => { console.error(error.message); process.exitCode = 1; });
  }
}
