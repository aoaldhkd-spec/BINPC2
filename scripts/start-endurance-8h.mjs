#!/usr/bin/env node
/**
 * Detach an 8h endurance watchdog so it survives Cursor/terminal session end.
 *
 * Usage:
 *   node scripts/start-endurance-8h.mjs
 *   ENDURANCE_HOURS=8 ENDURANCE_INTERVAL_MS=300000 node scripts/start-endurance-8h.mjs
 *
 * Monitor:
 *   Get-Content scripts/.soak-results/endurance-watchdog.log -Wait -Tail 20
 *   Get-Content scripts/.soak-results/endurance-live.log -Wait -Tail 30
 *   Get-Content scripts/.soak-results/endurance.lock
 */
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const HOURS = Number(process.env.ENDURANCE_HOURS || 8);
const INTERVAL_MS = Number(process.env.ENDURANCE_INTERVAL_MS || 5 * 60 * 1000);
const WATCHDOG = resolve(ROOT, 'scripts/endurance-watchdog.mjs');
const WATCH_LOG = resolve(ROOT, 'scripts/.soak-results/endurance-watchdog.log');
const LAUNCH_META = resolve(ROOT, 'scripts/.soak-results/endurance-launch.json');
const LOCK_PATH = resolve(ROOT, 'scripts/.soak-results/endurance.lock');
const WATCHDOG_PID_FILE = resolve(ROOT, 'scripts/.soak-results/endurance-watchdog.pid');

function isPidAlive(pid) {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

mkdirSync(dirname(WATCH_LOG), { recursive: true });

// Refuse if soak already active
if (existsSync(LOCK_PATH)) {
  try {
    const lock = JSON.parse(readFileSync(LOCK_PATH, 'utf8'));
    if (isPidAlive(lock.pid)) {
      console.error(`Active endurance already running: runId=${lock.runId} pid=${lock.pid}`);
      console.error(`Lock: ${LOCK_PATH}`);
      process.exit(3);
    }
  } catch { /* stale lock ok */ }
}
if (existsSync(WATCHDOG_PID_FILE)) {
  try {
    const prev = JSON.parse(readFileSync(WATCHDOG_PID_FILE, 'utf8'));
    if (isPidAlive(prev.pid)) {
      console.error(`Active watchdog already running: pid=${prev.pid}`);
      process.exit(3);
    }
  } catch { /* stale */ }
}

const sessionDeadline = Date.now() + HOURS * 60 * 60 * 1000;
const outFd = openSync(WATCH_LOG, 'a');
const env = {
  ...process.env,
  ENDURANCE_HOURS: String(HOURS),
  ENDURANCE_INTERVAL_MS: String(INTERVAL_MS),
  ENDURANCE_SESSION_DEADLINE: String(sessionDeadline),
};

const child = spawn(process.execPath, [WATCHDOG], {
  cwd: ROOT,
  env,
  stdio: ['ignore', outFd, outFd],
  detached: true,
  windowsHide: true,
});
child.unref();

const meta = {
  launchedAt: new Date().toISOString(),
  watchdogPid: child.pid,
  sessionDeadline,
  sessionDeadlineIso: new Date(sessionDeadline).toISOString(),
  hours: HOURS,
  intervalMs: INTERVAL_MS,
  watchLog: WATCH_LOG,
  liveLog: resolve(ROOT, 'scripts/.soak-results/endurance-live.log'),
  lock: LOCK_PATH,
};
writeFileSync(LAUNCH_META, JSON.stringify(meta, null, 2), 'utf8');

console.log(`Detached 8h endurance watchdog pid=${child.pid}`);
console.log(`Session deadline: ${meta.sessionDeadlineIso}`);
console.log(`Watch: ${WATCH_LOG}`);
console.log(`Live:  ${meta.liveLog}`);
console.log(`Meta:  ${LAUNCH_META}`);
console.log('Launcher exiting — soak continues in background.');
process.exit(0);
