#!/usr/bin/env node
/**
 * Stress test: 150 VU concurrent chat-message + heart sends
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 node scripts/stress-test.mjs
 *
 * What it does:
 *   1. Creates 2 test profiles + 1 chat room as fixtures
 *   2. Fires 150 concurrent message INSERTs (each with a unique client_id)
 *   3. Fires 150 concurrent like INSERTs across 4 heart types × 38 unique likers
 *   4. After a 1-second settle window, queries in-memory counts via /api/db/op
 *   5. Checks the /api/db/health lag/alarm fields
 *   6. Prints a pass/fail report with p50/p95/p99 latencies
 *
 * Exit code 0 = all assertions passed, 1 = failure detected.
 */

import { randomUUID } from 'node:crypto';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const API = `${BASE_URL}/api/db`;
const VU_COUNT = 150;

// ─── HTTP helper ──────────────────────────────────────────────────────────────
async function post(path, body) {
  const start = Date.now();
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const latency = Date.now() - start;
  const json = await res.json();
  return { status: res.status, json, latency };
}

async function get(path) {
  const res = await fetch(`${API}${path}`);
  return res.json();
}

// ─── Percentile helper ────────────────────────────────────────────────────────
function percentile(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🚀  Stress test — BASE_URL: ${BASE_URL}`);
  console.log(`    VUs: ${VU_COUNT}  |  messages: ${VU_COUNT}  |  likes: ${VU_COUNT}\n`);

  // ── 1. Create fixtures ──────────────────────────────────────────────────────
  console.log('① Creating test fixtures…');
  const runId = randomUUID().slice(0, 8);
  const user1Id = randomUUID();
  const user2Id = randomUUID();

  await post('/op', {
    table: 'profiles', op: 'insert',
    payload: { id: user1Id, nickname: `stress_u1_${runId}`, pin_code: `ST${runId.slice(0,2)}` },
  });
  await post('/op', {
    table: 'profiles', op: 'insert',
    payload: { id: user2Id, nickname: `stress_u2_${runId}`, pin_code: `ST${runId.slice(2,4)}` },
  });

  // Create chat room
  const { json: chatJson } = await post('/op', {
    table: 'chats', op: 'insert',
    payload: {
      user1_id: user1Id < user2Id ? user1Id : user2Id,
      user2_id: user1Id < user2Id ? user2Id : user1Id,
    },
    selectAfterWrite: true,
    single: true,
  });
  const chatId = chatJson?.data?.id;
  if (!chatId) {
    console.error('✗ Could not create test chat room:', chatJson);
    process.exit(1);
  }
  console.log(`  ✓ chat room: ${chatId}\n`);

  // ── 2. 150 concurrent message INSERTs ─────────────────────────────────────
  console.log(`② Firing ${VU_COUNT} concurrent message INSERTs…`);
  const msgClientIds = Array.from({ length: VU_COUNT }, () => randomUUID());
  const msgStart = Date.now();
  const msgResults = await Promise.allSettled(
    msgClientIds.map((cid, i) =>
      post('/op', {
        table: 'messages', op: 'insert',
        payload: {
          chat_id: chatId,
          sender_id: i % 2 === 0 ? user1Id : user2Id,
          content: `stress-msg-${i}-${cid.slice(0, 8)}`,
          client_id: cid,
        },
        selectAfterWrite: false,
      })
    )
  );
  const msgElapsed = Date.now() - msgStart;

  const msgLatencies = msgResults
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value.latency)
    .sort((a, b) => a - b);

  const msgErrors = msgResults.filter(
    r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.status >= 500)
  ).length;

  console.log(`  ✓ completed in ${msgElapsed}ms`);
  console.log(`  latency — p50:${percentile(msgLatencies,50)}ms  p95:${percentile(msgLatencies,95)}ms  p99:${percentile(msgLatencies,99)}ms`);
  console.log(`  HTTP errors: ${msgErrors}/${VU_COUNT}\n`);

  // ── 3. 150 concurrent like INSERTs (38 unique likers × 4 heart types) ─────
  // 38 likers × 4 types = 152 unique combos; we only send 150 → all unique.
  console.log(`③ Firing ${VU_COUNT} concurrent like INSERTs (4 heart types × 38 unique likers)…`);
  const heartTypes = ['red', 'blue', 'pink', 'green'];
  const likerCount = Math.ceil(VU_COUNT / heartTypes.length); // 38

  // Create likerCount unique sender profiles
  console.log(`  Creating ${likerCount} unique liker profiles for heart VUs…`);
  const likerIds = await Promise.all(
    Array.from({ length: likerCount }, async (_, i) => {
      const uid = randomUUID();
      await post('/op', {
        table: 'profiles', op: 'insert',
        payload: { id: uid, nickname: `stress_lk${i}_${runId}`, pin_code: `LK${runId.slice(0,2)}${i.toString().padStart(2,'0')}`.slice(0,6) },
      });
      return uid;
    })
  );

  const likeStart = Date.now();
  const likeResults = await Promise.allSettled(
    Array.from({ length: VU_COUNT }, (_, i) => {
      const likerIdx = i % likerCount;           // 0-37, cycling through likers
      const likerId  = likerIds[likerIdx];
      const heartType = heartTypes[Math.floor(i / likerCount)]; // group by type
      return post('/op', {
        table: 'likes', op: 'insert',
        payload: {
          liker_id: likerId,
          liked_id: user2Id,
          heart_type: heartType,
          status: 'pending',
        },
        selectAfterWrite: false,
      });
    })
  );
  const likeElapsed = Date.now() - likeStart;

  const likeLatencies = likeResults
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value.latency)
    .sort((a, b) => a - b);

  const likeErrors = likeResults.filter(
    r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.status >= 500)
  ).length;

  console.log(`  ✓ completed in ${likeElapsed}ms`);
  console.log(`  latency — p50:${percentile(likeLatencies,50)}ms  p95:${percentile(likeLatencies,95)}ms  p99:${percentile(likeLatencies,99)}ms`);
  console.log(`  HTTP errors: ${likeErrors}/${VU_COUNT}\n`);

  // ── 4. Verify in-memory counts ─────────────────────────────────────────────
  console.log('④ Verifying in-memory counts (1 s settle)…');
  await new Promise(r => setTimeout(r, 1000));

  const msgCountRes = await post('/op', {
    table: 'messages', op: 'select',
    filters: [{ type: 'eq', col: 'chat_id', val: chatId }],
  });
  const storedMsgCount = Array.isArray(msgCountRes.json?.data) ? msgCountRes.json.data.length : 0;

  const likeCountRes = await post('/op', {
    table: 'likes', op: 'select',
    filters: [{ type: 'eq', col: 'liked_id', val: user2Id }],
  });
  // VU_COUNT unique (liker, type) combos → all should persist (no dedups expected)
  const storedLikeCount = Array.isArray(likeCountRes.json?.data) ? likeCountRes.json.data.length : 0;

  console.log(`  messages — sent: ${VU_COUNT}, stored: ${storedMsgCount}`);
  console.log(`  likes    — sent: ${VU_COUNT}, stored: ${storedLikeCount} (expected ${VU_COUNT} = ${likerCount} likers × 4 types)\n`);

  // ── 5. Health endpoint check ────────────────────────────────────────────────
  console.log('⑤ Checking /health alarms…');
  const health = await get('/health');
  console.log(`  persistErrors total: ${health.persistErrors}`);
  console.log(`  alarms: ${health.alarms?.length ? health.alarms.join('; ') : 'none'}`);
  console.log(`  ok: ${health.ok}\n`);

  // ── 6. Pass/fail ───────────────────────────────────────────────────────────
  const failures = [];

  if (msgErrors > 0)
    failures.push(`${msgErrors} message HTTP 5xx errors`);
  if (likeErrors > 0)
    failures.push(`${likeErrors} like HTTP 5xx errors`);
  if (storedMsgCount < VU_COUNT)
    failures.push(`message loss: expected ${VU_COUNT}, got ${storedMsgCount}`);
  if (storedLikeCount < VU_COUNT)
    failures.push(`like loss: expected ${VU_COUNT} unique likes, got ${storedLikeCount}`);

  // P99 < 3000ms target
  const msgP99  = percentile(msgLatencies,  99);
  const likeP99 = percentile(likeLatencies, 99);
  if (msgP99  > 3000) failures.push(`message p99 ${msgP99}ms > 3000ms target`);
  if (likeP99 > 3000) failures.push(`like p99 ${likeP99}ms > 3000ms target`);

  if (failures.length === 0) {
    console.log('✅  PASS — 0% message/heart loss, all latencies within 3 s target');
    console.log(`    msg  p50:${percentile(msgLatencies,50)}ms p95:${percentile(msgLatencies,95)}ms p99:${msgP99}ms`);
    console.log(`    like p50:${percentile(likeLatencies,50)}ms p95:${percentile(likeLatencies,95)}ms p99:${likeP99}ms\n`);
  } else {
    console.error('❌  FAIL:');
    failures.forEach(f => console.error(`    • ${f}`));
    console.log();
    process.exit(1);
  }

  // ── 7. Clean up test fixtures ──────────────────────────────────────────────
  console.log('⑥ Cleaning up fixtures…');
  await post('/op', { table: 'messages', op: 'delete', filters: [{ type: 'eq', col: 'chat_id', val: chatId }] });
  await post('/op', { table: 'likes',    op: 'delete', filters: [{ type: 'eq', col: 'liked_id', val: user2Id }] });
  await post('/op', { table: 'chats',    op: 'delete', filters: [{ type: 'eq', col: 'id', val: chatId }] });
  for (const uid of [user1Id, user2Id, ...likerIds]) {
    await post('/op', { table: 'profiles', op: 'delete', filters: [{ type: 'eq', col: 'id', val: uid }] });
  }
  console.log('  ✓ done\n');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
