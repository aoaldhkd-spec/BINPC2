#!/usr/bin/env node
/** Fail-closed, read-only quota planning for private source backups. */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const GIB = 1024 ** 3;
export const FREE_RESERVE_BYTES = 2 * GIB;
export const DEFAULT_REMOTE_MAX_GIB = 10;
export const SINGLE_SNAPSHOT_MAX_BYTES = 750 * 1024 ** 2;

function safeBytes(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(field + ' must be a known non-negative integer number of bytes');
  }
  return value;
}

export function maxRemoteBytesFromGiB(setting = '') {
  if (setting === '') return DEFAULT_REMOTE_MAX_GIB * GIB;
  if (typeof setting !== 'string' || !/^[1-9][0-9]{0,4}$/.test(setting)) {
    throw new Error('BINPC2_DRIVE_MAX_TOTAL_GIB must be a positive whole GiB value');
  }
  return safeBytes(Number(setting) * GIB, 'Remote maximum');
}

export function checkBackupQuota({ remoteBytes, freeBytes, snapshotBytes, maxRemoteBytes }) {
  const existing = safeBytes(remoteBytes, 'Drive BINPC2 folder size');
  const available = safeBytes(freeBytes, 'Drive available capacity');
  const next = safeBytes(snapshotBytes, 'New snapshot size');
  const maximum = safeBytes(maxRemoteBytes, 'Configured backup ceiling');
  if (!next || next > SINGLE_SNAPSHOT_MAX_BYTES) {
    throw new Error('Snapshot must be non-empty and at most 750 MiB');
  }
  if (available < next + FREE_RESERVE_BYTES) {
    throw new Error('Drive free space below new snapshot plus mandatory 2 GiB reserve');
  }
  // Conservative: even an existing immutable snapshot is counted as new.
  if (existing + next > maximum) {
    throw new Error('Cumulative BINPC2 Drive backup size would exceed configured cap');
  }
  return { remoteBytes: existing, snapshotBytes: next, projectedBytes: existing + next, maxRemoteBytes: maximum };
}

export function checkQuotaJson({ remoteSizeJson, accountQuotaJson, snapshotBytes, maxGiB = '' }) {
  const folder = JSON.parse(remoteSizeJson);
  const account = JSON.parse(accountQuotaJson);
  if (!folder || !account || typeof folder !== 'object' || typeof account !== 'object') {
    throw new Error('Malformed rclone quota JSON');
  }
  return checkBackupQuota({
    remoteBytes: folder.bytes,
    freeBytes: account.free,
    snapshotBytes: Number(snapshotBytes),
    maxRemoteBytes: maxRemoteBytesFromGiB(maxGiB),
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = checkQuotaJson({
      remoteSizeJson: process.env.BINPC2_DRIVE_BACKUP_SIZE_JSON,
      accountQuotaJson: process.env.BINPC2_DRIVE_QUOTA_JSON,
      snapshotBytes: process.env.BINPC2_DRIVE_NEW_SNAPSHOT_BYTES,
      maxGiB: process.env.BINPC2_DRIVE_MAX_TOTAL_GIB || '',
    });
    console.log('Drive cumulative backup budget OK (' + result.projectedBytes + ' / ' + result.maxRemoteBytes + ' bytes).');
  } catch (error) {
    console.error('::error::Offsite backup safely STOPPED: ' + error.message);
    process.exitCode = 1;
  }
}
