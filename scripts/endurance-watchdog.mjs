#!/usr/bin/env node
/**
 * Monitors endurance soak — on crash/abort/stall, restarts with remaining deadline.
 * Child is spawned detached so Cursor/terminal exit does not kill the soak.
 *
 * Usage:
 *   ENDURANCE_HOURS=8 node scripts/endurance-watchdog.mjs
 *   Prefer: node scripts/start-endurance-8h.mjs  (detaches this watchdog too)
 *
 * Env:
 *   ENDURANCE_HOURS            total soak length (default 8)
 *   ENDURANCE_INTERVAL_MS      passed to endurance-5h.mjs
 *   ENDURANCE_LOCK_FILE        lock path (default scripts/.soak-results/endurance.lock)
 *   ENDURANCE_WATCH_LOG        watchdog log (default scripts/.soak-results/endurance-watchdog.log)
 *   ENDURANCE_WATCH_POLL_MS    poll interval (default 60s)
 *   ENDURANCE_STALL_MS         no-heartbeat → kill+restart (default interval + cycleTimeout + 60s)
 *   ENDURANCE_CYCLE_TIMEOUT_MS forwarded + used in stall calc (default 180s)
 */
import { appendFileSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const HOURS = Number(process.env.ENDURANCE_HOURS || 8);
const INTERVAL_MS = Number(process.env.ENDURANCE_INTERVAL_MS || 5 * 60 * 1000);
const CYCLE_TIMEOUT_MS = Number(process.env.ENDURANCE_CYCLE_TIMEOUT_MS || 180_000);
const LOCK_PATH = resolve(ROOT, process.env.ENDURANCE_LOCK_FILE || 'scripts/.soak-results/endurance.lock');
const WATCH_LOG = resolve(ROOT, process.env.ENDURANCE_WATCH_LOG || 'scripts/.soak-results/endurance-watchdog.log');
const LIVE_LOG = resolve(ROOT, 'scripts/.soak-results/endurance-live.log');
const POLL_MS = Number(process.env.ENDURANCE_WATCH_POLL_MS || 60_000);
const STALL_MS = Number(
  process.env.ENDURANCE_STALL_MS
  || (INTERVAL_MS + CYCLE_TIMEOUT_MS + 60_000),
);
const ENDURANCE_SCRIPT = resolve(ROOT, 'scripts/endurance-5h.mjs');
const WATCHDOG_PID_FILE = resolve(ROOT, 'scripts/.soak-results/endurance-watchdog.pid');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function wlog(msg) {
  mkdirSync(dirname(WATCH_LOG), { recursive: true });
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  appendFileSync(WATCH_LOG, line);
  console.log(line.trim());
}

function isPidAlive(pid) {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killPid(pid) {
  if (!pid || !isPidAlive(pid)) return;
  try {
    process.kill(pid, 'SIGTERM');
  } catch { /* ignore */ }
  // Windows often ignores SIGTERM for node — force after brief wait via taskkill
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } else {
      process.kill(pid, 'SIGKILL');
    }
  } catch { /* ignore */ }
}

function readLock() {
  if (!existsSync(LOCK_PATH)) return null;
  try {
    return JSON.parse(readFileSync(LOCK_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function clearLockIfPid(pid) {
  try {
    if (!existsSync(LOCK_PATH)) return;
    const cur = JSON.parse(readFileSync(LOCK_PATH, 'utf8'));
    if (!pid || cur.pid === pid) unlinkSync(LOCK_PATH);
  } catch { /* ignore */ }
}

function tailJsonl(path) {
  if (!path || !existsSync(path)) return null;
  try {
    const lines = readFileSync(path, 'utf8').trim().split('\n');
    return lines.length ? JSON.parse(lines[lines.length - 1]) : null;
  } catch {
    return null;
  }
}

function heartbeatAgeMs(lock) {
  const ts = Number(lock?.heartbeatAt || lock?.startedAt || 0);
  if (!ts) return Infinity;
  return Date.now() - ts;
}

/** Detached child — survives watchdog/Cursor exit; logs append to endurance-live.log */
function spawnEndurance(deadlineAt) {
  const remainingH = Math.max((deadlineAt - Date.now()) / (60 * 60 * 1000), 0.05);
  const env = {
    ...process.env,
    ENDURANCE_HOURS: String(Math.ceil(remainingH * 100) / 100),
    ENDURANCE_INTERVAL_MS: String(INTERVAL_MS),
    ENDURANCE_CYCLE_TIMEOUT_MS: String(CYCLE_TIMEOUT_MS),
    ENDURANCE_DEADLINE_AT: String(deadlineAt),
  };
  mkdirSync(dirname(LIVE_LOG), { recursive: true });
  const outFd = openSync(LIVE_LOG, 'a');
  wlog(`spawn endurance (detached) deadline=${new Date(deadlineAt).toISOString()} remainingH≈${remainingH.toFixed(2)}`);
  const child = spawn(process.execPath, [ENDURANCE_SCRIPT], {
    cwd: ROOT,
    env,
    stdio: ['ignore', outFd, outFd],
    detached: true,
    windowsHide: true,
  });
  child.unref();
  wlog(`endurance child pid=${child.pid} (detached)`);
  child.on('exit', (code) => {
    wlog(`endurance child pid=${child.pid} exit code=${code ?? 'null'}`);
  });
  return child;
}

async function main() {
  const sessionDeadline = process.env.ENDURANCE_SESSION_DEADLINE
    ? Number(process.env.ENDURANCE_SESSION_DEADLINE)
    : Date.now() + HOURS * 60 * 60 * 1000;

  mkdirSync(dirname(WATCHDOG_PID_FILE), { recursive: true });
  writeFileSync(WATCHDOG_PID_FILE, JSON.stringify({
    pid: process.pid,
    startedAt: Date.now(),
    sessionDeadline,
    hours: HOURS,
  }), 'utf8');

  wlog(`watchdog start pid=${process.pid} sessionDeadline=${new Date(sessionDeadline).toISOString()} poll=${POLL_MS}ms stall=${STALL_MS}ms`);

  let child = null;
  let spawnCooldownUntil = 0;

  const shutdown = () => {
    wlog('watchdog signal — leaving detached endurance running (lock/heartbeat still monitored only while alive)');
    try { unlinkSync(WATCHDOG_PID_FILE); } catch { /* ignore */ }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  while (Date.now() < sessionDeadline) {
    const lock = readLock();
    const alive = lock?.pid ? isPidAlive(lock.pid) : false;
    const last = lock?.metrics ? tailJsonl(lock.metrics) : null;
    const hbAge = lock ? heartbeatAgeMs(lock) : Infinity;

    if (last?.type === 'done' && last?.ok === true) {
      wlog('soak done — watchdog exit');
      break;
    }

    // Stalled but PID still alive → kill and restart
    if (alive && hbAge > STALL_MS) {
      wlog(`STALL detected — pid=${lock.pid} heartbeatAge=${Math.round(hbAge / 1000)}s > ${Math.round(STALL_MS / 1000)}s — killing`);
      killPid(lock.pid);
      clearLockIfPid(lock.pid);
      child = null;
      spawnCooldownUntil = Date.now() + 5_000;
      await sleep(5_000);
      continue;
    }

    if (!lock || !alive) {
      if (Date.now() >= sessionDeadline - 60_000) {
        wlog('session deadline reached — watchdog exit');
        break;
      }
      if (Date.now() < spawnCooldownUntil) {
        await sleep(1_000);
        continue;
      }
      // Orphan lock from dead pid
      if (lock && !alive) clearLockIfPid(lock.pid);
      child = spawnEndurance(sessionDeadline);
      spawnCooldownUntil = Date.now() + 20_000;
      await sleep(15_000);
      continue;
    }

    await sleep(POLL_MS);
  }

  try { unlinkSync(WATCHDOG_PID_FILE); } catch { /* ignore */ }
  wlog('watchdog finished');
}

main().catch((e) => {
  wlog(`fatal ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
