import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { validateManualBackupConfig } from './backup-db-photo-encrypted.mjs';

const fake = {
  PGHOST: 'db.dlliqqlqdtdkfakdtwyw.supabase.co',
  PGDATABASE: 'postgres', PGUSER: 'postgres',
  PGPASSWORD: 'FAKE_TEST_ONLY',
  BINPC2_AGE_RECIPIENT: 'age1' + 'q'.repeat(58),
};

test('accepts only the known BINPC2 project hostname', () => {
  assert.equal(validateManualBackupConfig(fake, '/tmp/binpc2-private').project, 'dlliqqlqdtdkfakdtwyw');
  assert.throws(() => validateManualBackupConfig({ ...fake, PGHOST: 'db.some-other.supabase.co' }, '/tmp/backup'), /approved/);
});

test('rejects OneDrive, relative paths, source paths and missing encryption/password', () => {
  assert.throws(() => validateManualBackupConfig(fake, 'relative/path'), /absolute/);
  assert.throws(() => validateManualBackupConfig(fake, '/home/user/OneDrive/Documents'), /OneDrive/);
  assert.throws(() => validateManualBackupConfig(fake, new URL('..', import.meta.url).pathname), /Git source/);
  assert.throws(() => validateManualBackupConfig({ ...fake, BINPC2_AGE_RECIPIENT: '' }, '/tmp/safe'), /age/);
  assert.throws(() => validateManualBackupConfig({ ...fake, PGPASSWORD: '', PGPASSFILE: '' }, '/tmp/safe'), /password/);
});

test('default CLI invocation is no-op without credentials or database access', () => {
  const run = spawnSync(process.execPath, ['scripts/backup-db-photo-encrypted.mjs'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { PATH: process.env.PATH }, encoding: 'utf8',
  });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /DRY_RUN_ONLY/);
});
