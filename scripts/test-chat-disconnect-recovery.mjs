#!/usr/bin/env node
/**
 * E2E: SSE disconnect mid-chat → reconnect → message delivery + HTTP refresh-resync.
 * Usage: node scripts/test-chat-disconnect-recovery.mjs
 */
import { isFunctionsLocked } from './lib/functions-lock.mjs';
import {
  API, SSE_API, op, openSse, chatPairIds, setupTwoUsers,
} from './lib/e2e-realtime.mjs';

async function selectMessages(jar, token, requesterId, chatId) {
  const r = await op(jar, token, {
    op: 'select', table: 'messages', requesterId,
    filters: [{ type: 'eq', col: 'chat_id', val: chatId }],
  });
  return Array.isArray(r.json.data) ? r.json.data : [];
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
  const { u1, u2 } = chatPairIds(idA, idB);

  let r = await op(jarA, tokenA, {
    op: 'insert', table: 'chats', requesterId: idA, single: true, selectAfterWrite: true,
    payload: { user1_id: u1, user2_id: u2 },
  });
  const chatId = r.json.data?.id;
  if (!chatId) fails.push('chat create');
  console.log('chat', chatId);

  const streamB = openSse(idB, sseTokenB);
  await new Promise((res) => setTimeout(res, 800));

  const msg1 = `reconnect-a-${Date.now()}`;
  r = await op(jarA, tokenA, {
    op: 'insert', table: 'messages', requesterId: idA, single: true, selectAfterWrite: true,
    payload: { chat_id: chatId, sender_id: idA, content: msg1, client_id: crypto.randomUUID() },
  });
  if (r.status !== 200) fails.push('msg1 insert');

  const evt1 = await streamB.waitFor(
    (e) => e.type === 'change' && e.table === 'messages' && e.newRow?.content === msg1,
    12_000,
  );
  console.log('SSE msg1', evt1 ? 'OK' : 'MISS');
  if (!evt1) fails.push('SSE msg1 not delivered');

  const lastId = streamB.lastEventId;
  streamB.stop();
  streamB.done.catch(() => {});

  const msg2 = `reconnect-b-${Date.now()}`;
  r = await op(jarA, tokenA, {
    op: 'insert', table: 'messages', requesterId: idA, single: true, selectAfterWrite: true,
    payload: { chat_id: chatId, sender_id: idA, content: msg2, client_id: crypto.randomUUID() },
  });
  if (r.status !== 200) fails.push('msg2 insert');
  console.log('msg2 while B disconnected');

  const streamB2 = openSse(idB, sseTokenB, { lastEventId: lastId });
  await new Promise((res) => setTimeout(res, 800));

  const evt2 = await streamB2.waitFor(
    (e) => e.type === 'change' && e.table === 'messages' && e.newRow?.content === msg2,
    15_000,
  );
  console.log('SSE msg2 after reconnect', evt2 ? 'OK' : 'MISS (will check HTTP resync)');

  const msgs = await selectMessages(jarB, tokenB, idB, chatId);
  const found1 = msgs.some((m) => m.content === msg1);
  const found2 = msgs.some((m) => m.content === msg2);
  const dupClient = new Set(msgs.map((m) => m.client_id).filter(Boolean)).size
    !== msgs.filter((m) => m.client_id).length;
  console.log('HTTP resync', { found1, found2, count: msgs.length, dupClient });
  if (!found1 || !found2) fails.push('HTTP resync missing messages');
  if (dupClient) fails.push('duplicate client_id rows after reconnect');

  if (!evt2 && !found2) fails.push('SSE reconnect + HTTP resync both failed');

  streamB2.stop();
  streamB2.done.catch(() => {});

  if (fails.length) {
    console.error('\n❌ FAIL', fails);
    process.exit(1);
  }
  console.log('\n✅ chat disconnect/recovery E2E passed');
}

main().catch((e) => { console.error(e); process.exit(1); });
