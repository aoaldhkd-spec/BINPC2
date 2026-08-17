#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  logDryRun,
  parseArgs,
  redactUrl,
  requireLoadTarget,
} from './lib/ops-client.mjs';

const args = parseArgs();
const API = String(args.values.url || process.env.API_BASE || 'http://localhost:8080/api/db').replace(/\/$/, '');
const DURATION_MS = Number(args.values['duration-ms'] || process.env.SOAK_DURATION_MS || 5 * 60 * 1000);
const MAX_STAGE = Number(args.values['max-stage'] || process.env.SOAK_MAX_STAGE || 25);
const STAGES = String(args.values.stages || process.env.SOAK_STAGES || '5,10')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => value > 0);
const RUN_ID = String(args.values['run-id'] || `soak_${Date.now()}_${randomUUID().slice(0, 8)}`);
const METRICS_FILE = resolve(String(
  args.values['metrics-file']
  || process.env.SOAK_METRICS_FILE
  || `scripts/.soak-results/${RUN_ID}.jsonl`,
));
const CLEANUP = args.values['no-cleanup'] !== true;
const loadGuard = requireLoadTarget({ args, url: API, operation: 'Soak test' });

if (!Number.isFinite(DURATION_MS) || DURATION_MS < 1_000 || DURATION_MS > 24 * 60 * 60 * 1000) {
  throw new Error('--duration-ms must be between 1000 and 86400000');
}
if (!Number.isInteger(MAX_STAGE) || MAX_STAGE < 1 || MAX_STAGE > 200) {
  throw new Error('--max-stage must be an integer between 1 and 200');
}
if (!STAGES.length || STAGES.some((stage) => !Number.isInteger(stage) || stage > MAX_STAGE)) {
  throw new Error(`Every soak stage must be an integer between 1 and ${MAX_STAGE}`);
}

function appendMetric(event) {
  mkdirSync(dirname(METRICS_FILE), { recursive: true });
  appendFileSync(METRICS_FILE, `${JSON.stringify({
    timestamp: new Date().toISOString(),
    runId: RUN_ID,
    target: loadGuard.identity,
    ...event,
  })}\n`, 'utf8');
}

function runCycle(cycle, remainingMs) {
  const prefix = `lt_${Date.now()}_${cycle}_${randomUUID().slice(0, 8)}_`;
  const script = resolve(dirname(fileURLToPath(import.meta.url)), 'sim-concurrent-users.mjs');
  const childArgs = [
    script,
    `--url=${API}`,
    `--stages=${STAGES.join(',')}`,
    `--max-stage=${MAX_STAGE}`,
    `--max-duration-ms=${Math.max(1_000, remainingMs)}`,
    '--hold-ms=1000',
    `--run-prefix=${prefix}`,
    `--metrics-file=${METRICS_FILE}`,
  ];
  if (CLEANUP) childArgs.push('--cleanup', `--confirm-cleanup=${prefix}`);
  if (!loadGuard.target.isLocal) {
    childArgs.push('--target=production', `--confirm=${loadGuard.identity}`);
  }
  return new Promise((resolveCycle) => {
    const child = spawn(process.execPath, childArgs, { stdio: 'inherit', windowsHide: true });
    const timer = setTimeout(() => child.kill(), Math.max(2_000, remainingMs));
    timer.unref?.();
    child.once('error', (error) => {
      clearTimeout(timer);
      resolveCycle({ code: 1, error: error.message });
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolveCycle({ code: code ?? 1, signal });
    });
  });
}

async function main() {
  if (loadGuard.dryRun) {
    logDryRun('Soak test', {
      api: API,
      durationMs: DURATION_MS,
      stages: STAGES,
      maxStage: MAX_STAGE,
      cleanup: CLEANUP,
      metricsFile: METRICS_FILE,
    });
    return;
  }

  console.log(`Soak target: ${redactUrl(API)}`);
  console.log(`Duration: ${DURATION_MS}ms; stages: ${STAGES.join(',')}; metrics: ${METRICS_FILE}`);
  const startedAt = Date.now();
  const deadline = startedAt + DURATION_MS;
  appendMetric({ type: 'soak-start', durationMs: DURATION_MS, stages: STAGES, maxStage: MAX_STAGE });

  let cycle = 0;
  let failed = false;
  while (Date.now() < deadline) {
    cycle += 1;
    const result = await runCycle(cycle, deadline - Date.now());
    appendMetric({ type: 'soak-cycle', cycle, ...result, elapsedMs: Date.now() - startedAt });
    if (result.code !== 0) {
      failed = true;
      break;
    }
  }

  appendMetric({ type: 'soak-end', cycles: cycle, passed: !failed, elapsedMs: Date.now() - startedAt });
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
