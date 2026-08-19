#!/usr/bin/env node
/**
 * E2E: heart SSE payload matches DB state; disconnect does not duplicate likes.
 * Usage: node scripts/e2e-heart-sse-consistency.mjs
 */
import { isFunctionsLocked } from './lib/functions-lock.mjs';
import {
  API, SSE_API, op, openSse, setupTwoUsers,
} from './lib/e2e-realtime.mjs';

async function selectIncomingLikes(jar, token, userId) {
  const r = await op(jar, token, {
    op: 'select', table: 'likes', requesterId: userId,
    filters: [{ type: 'eq', col: 'liked_id', val: userId }],
  });
  return Array.isArray(r.json.data) ? r.json.data : [];
}

function likeRowMatches(evt, likerId, likedId) {
  const row = evt?.newRow;
  return row
    && row.liker_id === likerId
    && row.liked_id === likedId
    && typeof row.heart_type === 'string'
    && typeof row.id === 'string';
}

async function main() {
  if (await isFunctionsLocked(API)) {
    console.log('SKIP — FUNCTIONS_LOCKED');
    return;
  }

  const fails = [];
  console.log('API:', API, '| SSE:', SSE_API);

  const ctx = await setupTwoUsers();
  if (ctx.fails.length) {
    console.error('SETUP FAIL', ctx.fails);
    process.exit(1);
  }

  const { idA, idB, jarA, jarB, tokenA, tokenB, sseTokenB } = ctx;

  const streamB = openSse(idB, sseTokenB);
  await new Promise((res) => setTimeout(res, 800));

  const r = await op(jarA, tokenA, {
    op: 'insert', table: 'likes', requesterId: idA, single: true, selectAfterWrite: true,
    payload: { liker_id: idA, liked_id: idB, heart_type: 'red' },
  });
  if (r.status !== 200 || !r.json.data?.id) fails.push('like insert');
  const likeId = r.json.data?.id;
  console.log('like insert', likeId);

  const evt = await streamB.waitFor(
    (e) => e.type === 'change' && e.table === 'likes' && e.event === 'INSERT' && e.newRow?.id === likeId,
    12_000,
  );
  console.log('SSE like', evt ? 'OK' : 'MISS');
  if (!evt || !likeRowMatches(evt.data, idA, idB)) fails.push('SSE like payload mismatch');

  const dbLikes1 = await selectIncomingLikes(jarB, tokenB, idB);
  const dbRow = dbLikes1.find((l) => l.id === likeId);
  console.log('DB select after SSE', dbRow ? 'OK' : 'MISS', 'count', dbLikes1.length);
  if (!dbRow) fails.push('DB missing like after SSE');
  if (dbRow && evt?.data?.newRow) {
    if (dbRow.heart_type !== evt.data.newRow.heart_type) fails.push('heart_type SSE vs DB mismatch');
    if (dbRow.liker_id !== evt.data.newRow.liker_id) fails.push('liker_id SSE vs DB mismatch');
  }

  const lastId = streamB.lastEventId;
  streamB.stop();
  streamB.done.catch(() => {});

  // Idempotent re-insert while B disconnected (spam guard)
  const dup = await op(jarA, tokenA, {
    op: 'insert', table: 'likes', requesterId: idA, single: true, selectAfterWrite: true,
    payload: { liker_id: idA, liked_id: idB, heart_type: 'red' },
  });
  console.log('duplicate like attempt', dup.status, dup.json.error?.code ?? 'ok');

  const dbLikes2 = await selectIncomingLikes(jarB, tokenB, idB);
  const redFromA = dbLikes2.filter((l) => l.liker_id === idA && l.heart_type === 'red');
  console.log('DB red likes from A', redFromA.length);
  if (redFromA.length !== 1) fails.push(`expected 1 red like from A, got ${redFromA.length}`);

  // Reconnect — notification list (HTTP) still consistent
  const streamB2 = openSse(idB, sseTokenB, { lastEventId: lastId });
  await new Promise((res) => setTimeout(res, 600));
  const dbLikes3 = await selectIncomingLikes(jarB, tokenB, idB);
  if (dbLikes3.filter((l) => l.liker_id === idA).length !== redFromA.length) {
    fails.push('like count changed after SSE reconnect');
  }
  console.log('post-reconnect DB count stable', dbLikes3.length);

  streamB2.stop();
  streamB2.done.catch(() => {});

  if (fails.length) {
    console.error('\n❌ FAIL', fails);
    process.exit(1);
  }
  console.log('\n✅ heart SSE consistency E2E passed');
}

main().catch((e) => { console.error(e); process.exit(1); });
