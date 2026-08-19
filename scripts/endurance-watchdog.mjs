#!/usr/bin/env node
/**
 * Monitors endurance soak — on crash/abort, restarts with remaining deadline.
 * Usage:
 *   ENDURANCE_HOURS=8 node scripts/endurance-watchdog.mjs
 *
 * Env:
 *   ENDURANCE_HOURS          total soak length (default 8)
 *   ENDURANCE_INTERVAL_MS      passed to endurance-5h.mjs
 *   ENDURANCE_LOCK_FILE        lock path (default scripts/.soak-results/endurance.lock)
 *   ENDURANCE_WATCH_LOG        watchdog log (default scripts/.soak-results/endurance-watchdog.log)
 *   ENDURANCE_WATCH_POLL_MS    poll interval (default 3 min)
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const HOURS = Number(process.env.ENDURANCE_HOURS || 8);
const INTERVAL_MS = Number(process.env.ENDURANCE_INTERVAL_MS || 5 * 60 * 1000);
const LOCK_PATH = resolve(ROOT, process.env.ENDURANCE_LOCK_FILE || 'scripts/.soak-results/endurance.lock');
const WATCH_LOG = resolve(ROOT, process.env.ENDURANCE_WATCH_LOG || 'scripts/.soak-results/endurance-watchdog.log');
const POLL_MS = Number(process.env.ENDURANCE_WATCH_POLL_MS || 3 * 60 * 1000);
const ENDURANCE_SCRIPT = resolve(ROOT, 'scripts/endurance-5h.mjs');

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

function readLock() {
  if (!existsSync(LOCK_PATH)) return null;
  try {
    return JSON.parse(readFileSync(LOCK_PATH, 'utf8'));
  } catch {
    return null;
  }
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

function spawnEndurance(deadlineAt) {
  const remainingH = Math.max((deadlineAt - Date.now()) / (60 * 60 * 1000), 0.05);
  const env = {
    ...process.env,
    ENDURANCE_HOURS: String(Math.ceil(remainingH * 100) / 100),
    ENDURANCE_INTERVAL_MS: String(INTERVAL_MS),
    ENDURANCE_DEADLINE_AT: String(deadlineAt),
  };
  wlog(`spawn endurance deadline=${new Date(deadlineAt).toISOString()} remainingH≈${remainingH.toFixed(2)}`);
  const child = spawn(process.execPath, [ENDURANCE_SCRIPT], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });
  const liveLog = resolve(ROOT, 'scripts/.soak-results/endurance-live.log');
  child.stdout?.on('data', (d) => appendFileSync(liveLog, d));
  child.stderr?.on('data', (d) => appendFileSync(liveLog, d));
  child.on('exit', (code) => wlog(`endurance child exit code=${code ?? 'null'}`));
  return child;
}

async function main() {
  const sessionDeadline = process.env.ENDURANCE_SESSION_DEADLINE
    ? Number(process.env.ENDURANCE_SESSION_DEADLINE)
    : Date.now() + HOURS * 60 * 60 * 1000;

  wlog(`watchdog start sessionDeadline=${new Date(sessionDeadline).toISOString()} poll=${POLL_MS}ms`);

  let child = null;

  while (Date.now() < sessionDeadline) {
    const lock = readLock();
    const alive = lock?.pid ? isPidAlive(lock.pid) : false;
    const last = lock?.metrics ? tailJsonl(lock.metrics) : null;

    if (!lock || !alive) {
      const done = last?.type === 'done' && last?.ok === true;
      if (done) {
        wlog('soak done — watchdog exit');
        break;
      }
      if (Date.now() >= sessionDeadline - 60_000) {
        wlog('session deadline reached — watchdog exit');
        break;
      }
      if (!child || child.exitCode !== null) {
        child = spawnEndurance(sessionDeadline);
        await sleep(15_000);
        continue;
      }
    }

    if (last?.type === 'done' && last?.ok === true) {
      wlog('soak done — watchdog exit');
      break;
    }

    await sleep(POLL_MS);
  }

  wlog('watchdog finished');
}

main().catch((e) => {
  wlog(`fatal ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
