/**
 * QR / profile entry burst — register + loadProfiles spike (no SSE/hearts/chat).
 * Used by sim-concurrent-users.mjs --entry-only (replaces simulate-100-entry.js).
 */

import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { createTestPersona, profilePayload } from './test-personas.mjs';

export function percentile(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

export async function runWithConcurrency(tasks, concurrency) {
  const results = [];
  const queue = [...tasks];
  let inFlight = 0;

  return new Promise((resolve) => {
    function next() {
      while (inFlight < concurrency && queue.length > 0) {
        const task = queue.shift();
        inFlight++;
        task().then((result) => {
          results.push(result);
          inFlight--;
          if (queue.length === 0 && inFlight === 0) resolve(results);
          else next();
        }).catch((err) => {
          results.push({ error: String(err) });
          inFlight--;
          if (queue.length === 0 && inFlight === 0) resolve(results);
          else next();
        });
      }
    }
    next();
    if (queue.length === 0 && inFlight === 0) resolve(results);
  });
}

async function simulateOneUser({ userIndex, baseUrl, fetchImpl }) {
  const persona = createTestPersona({ index: userIndex });
  const userId = randomUUID();
  const deviceSecret = randomUUID();
  const startAt = performance.now();
  let retries503 = 0;

  let insertMs = 0;
  let insertOk = false;
  {
    const t0 = performance.now();
    let attempt = 0;
    const MAX_RETRIES = 3;
    while (attempt <= MAX_RETRIES) {
      try {
        const resp = await fetchImpl(`${baseUrl}/op`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            table: 'profiles',
            op: 'insert',
            filters: [], orders: [], payload: {
              ...profilePayload({
                id: userId,
                secret: deviceSecret,
                persona,
                overrides: {
                  photo_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(persona.nickname)}`,
                  pin_code: String(1000 + Math.floor(Math.random() * 9000)),
                  contact_private: false,
                  kakao_id: null,
                  instagram_id: null,
                  phone_number: null,
                },
              }),
            },
            conflictCols: [],
            selectAfterWrite: true,
            single: true,
          }),
        });
        if (resp.status === 503) {
          retries503++;
          attempt++;
          const retryAfter = parseInt(resp.headers.get('Retry-After') ?? '1', 10);
          await new Promise((r) => setTimeout(r, Math.min(retryAfter * 1000, 4000)));
          continue;
        }
        if (resp.ok) {
          const body = await resp.json();
          insertOk = !body.error;
        }
        break;
      } catch {
        attempt++;
        if (attempt > MAX_RETRIES) break;
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
      }
    }
    insertMs = performance.now() - t0;
  }

  let loadMs = 0;
  let loadOk = false;
  {
    const t0 = performance.now();
    let attempt = 0;
    const MAX_RETRIES = 3;
    while (attempt <= MAX_RETRIES) {
      try {
        const resp = await fetchImpl(`${baseUrl}/op`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            table: 'profiles',
            op: 'select',
            filters: [], orders: [{ col: 'created_at', asc: false }],
          }),
        });
        if (resp.status === 503) {
          retries503++;
          attempt++;
          const retryAfter = parseInt(resp.headers.get('Retry-After') ?? '1', 10);
          await new Promise((r) => setTimeout(r, Math.min(retryAfter * 1000, 4000)));
          continue;
        }
        if (resp.ok) {
          const body = await resp.json();
          loadOk = Array.isArray(body.data);
        }
        break;
      } catch {
        attempt++;
        if (attempt > MAX_RETRIES) break;
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
      }
    }
    loadMs = performance.now() - t0;
  }

  const totalMs = performance.now() - startAt;
  return { userIndex, insertOk, loadOk, insertMs, loadMs, totalMs, retries503 };
}

/** @param {{ baseUrl: string, totalUsers: number, concurrency: number, verbose?: boolean }} opts */
export async function runEntryBurst({ baseUrl, totalUsers, concurrency, verbose = false }) {
  const cappedUsers = Math.min(Math.max(1, totalUsers), 500);
  const cappedConcurrency = Math.min(Math.max(1, concurrency), 500);

  console.log('\n🚀 Entry burst (QR 입장 spike)');
  console.log(`   대상: ${baseUrl}`);
  console.log(`   사용자 수: ${cappedUsers}명`);
  console.log(`   동시 실행: ${cappedConcurrency}명`);
  console.log('─'.repeat(60));

  const globalStart = performance.now();
  const tasks = Array.from({ length: cappedUsers }, (_, i) => () =>
    simulateOneUser({ userIndex: i + 1, baseUrl, fetchImpl: fetch }),
  );
  const results = await runWithConcurrency(tasks, cappedConcurrency);
  const totalElapsed = performance.now() - globalStart;

  const validResults = results.filter((r) => !r.error);
  const errors = results.filter((r) => r.error);
  const insertSuccesses = validResults.filter((r) => r.insertOk).length;
  const loadSuccesses = validResults.filter((r) => r.loadOk).length;
  const total503Retries = validResults.reduce((s, r) => s + (r.retries503 || 0), 0);

  const totalMsSorted = validResults.map((r) => r.totalMs).sort((a, b) => a - b);
  const insertMsSorted = validResults.map((r) => r.insertMs).sort((a, b) => a - b);
  const loadMsSorted = validResults.map((r) => r.loadMs).sort((a, b) => a - b);

  if (verbose) {
    console.log('\n개별 결과:');
    validResults.forEach((r) => {
      const icon = r.insertOk && r.loadOk ? '✅' : '❌';
      console.log(`  ${icon} 유저#${r.userIndex}: insert=${r.insertMs.toFixed(0)}ms load=${r.loadMs.toFixed(0)}ms total=${r.totalMs.toFixed(0)}ms retries503=${r.retries503}`);
    });
  }

  console.log('\n📊 결과 요약');
  console.log(`성공 (INSERT): ${insertSuccesses}/${cappedUsers}`);
  console.log(`성공 (LOAD):   ${loadSuccesses}/${cappedUsers}`);
  console.log(`503 재시도:    ${total503Retries}회`);
  console.log(`p95 total:     ${percentile(totalMsSorted, 95).toFixed(0)}ms`);

  const p95 = percentile(totalMsSorted, 95);
  const successRate = insertSuccesses / cappedUsers;
  const verdict = successRate >= 0.99 && p95 < 3000 ? 'PASS' : successRate >= 0.95 && p95 < 5000 ? 'MARGINAL' : 'FAIL';
  console.log(`\n🎯 ${verdict}`);

  return { verdict, totalUsers: cappedUsers, insertSuccesses, successRate, p95 };
}
