import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GIB, DEFAULT_REMOTE_MAX_GIB, SINGLE_SNAPSHOT_MAX_BYTES,
  checkBackupQuota, checkQuotaJson, maxRemoteBytesFromGiB,
} from './drive-backup-quota.mjs';

const safe = { remoteBytes: GIB, freeBytes: 20 * GIB, snapshotBytes: 500_000_000, maxRemoteBytes: 10 * GIB };

test('accepts a verified bounded backup', () => {
  assert.equal(checkBackupQuota(safe).projectedBytes, safe.remoteBytes + safe.snapshotBytes);
  assert.equal(maxRemoteBytesFromGiB(''), DEFAULT_REMOTE_MAX_GIB * GIB);
  assert.equal(maxRemoteBytesFromGiB('15'), 15 * GIB);
});

test('rejects invalid snapshots (zero, too large, unknown)', () => {
  for (const size of [0, SINGLE_SNAPSHOT_MAX_BYTES + 1, -1, NaN, Infinity, 0.4]) {
    assert.throws(() => checkBackupQuota({ ...safe, snapshotBytes: size }));
  }
});

test('rejects insufficient account free space and unknown quota', () => {
  assert.throws(() => checkBackupQuota({ ...safe, freeBytes: 2 * GIB + safe.snapshotBytes - 1 }));
  assert.throws(() => checkBackupQuota({ ...safe, freeBytes: undefined }));
  assert.throws(() => checkBackupQuota({ ...safe, remoteBytes: undefined }));
});

test('stops before cumulative size exceeds selected limit', () => {
  assert.throws(() => checkBackupQuota({ ...safe, remoteBytes: 10 * GIB - safe.snapshotBytes + 1 }), /Cumulative/);
  assert.doesNotThrow(() => checkBackupQuota({ ...safe, remoteBytes: 10 * GIB - safe.snapshotBytes }));
});

test('invalid cap cannot silently disable the bound', () => {
  for (const setting of ['0', '-1', '10.5', '0x10', 'Infinity', '100000', ' 12', '12 ']) {
    assert.throws(() => maxRemoteBytesFromGiB(setting));
  }
});

test('accepts actual rclone JSON structure and fails closed on unknowns', () => {
  const input = { remoteSizeJson: '{"count":2,"bytes":1048576}', accountQuotaJson: '{"free":21474836480}', snapshotBytes: '52428800' };
  assert.equal(checkQuotaJson(input).remoteBytes, 1048576);
  assert.throws(() => checkQuotaJson({ ...input, accountQuotaJson: '{"used":1}' }), /known/);
  assert.throws(() => checkQuotaJson({ ...input, remoteSizeJson: '{}' }), /known/);
  assert.throws(() => checkQuotaJson({ ...input, remoteSizeJson: 'not JSON' }), /JSON/);
});
