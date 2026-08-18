/**
 * 150-VU load test — current API (login + sessionToken + requesterId).
 * Run: node loadtest/stress.mjs  (api-server on localhost:8080)
 */
import { createLoadClient, stats } from './lib/client.mjs';

const VU_COUNT = Number(process.env.LOADTEST_VU ?? 150);
const { registerVu, op, rpc, unreadCounts, req, ADMIN_PW } = createLoadClient();

async function phase0() {
  console.log('\n━━━ Phase 0: Health + session ━━━━━━━━━━━━━━━━━━━━━━━');
  const h = await req('GET', '/health');
  console.log(`  health: ${h.status}  sse=${h.json?.sseConnections ?? '?'}  persistErr=${h.json?.persistErrors ?? 0}`);
  const admin = await rpc('admin_create_session', { p_admin_password: ADMIN_PW });
  if (admin.ok && admin.json?.data) {
    await rpc('admin_update_settings', {
      p_admin_password: ADMIN_PW,
      adminToken: admin.json.data,
      p_payload: { session_active: true },
    });
    console.log('  session_active: true');
  } else {
    console.log('  session toggle skipped (admin login failed)');
  }
}

async function phase1() {
  console.log(`\n━━━ Phase 1: ${VU_COUNT} VU register + login ━━━━━━━━━━━━━━━`);
  const t0 = performance.now();
  const results = await Promise.all(
    Array.from({ length: VU_COUNT }, (_, i) => registerVu(null, i)),
  );
  const vus = results.filter(Boolean);
  const lats = results.map(r => r ? 50 : 500);
  console.log(`  ok=${vus.length}/${VU_COUNT}  wall=${((performance.now() - t0) / 1000).toFixed(2)}s`);
  stats('register+login', lats);
  return vus;
}

async function phase2(vus) {
  console.log('\n━━━ Phase 2: chats + messages + likes ━━━━━━━━━━━━━━━');
  const pairs = [];
  for (let i = 0; i < vus.length - 1; i += 2) pairs.push([vus[i], vus[i + 1]]);

  const chatResults = await Promise.all(pairs.map(([a, b]) => {
    const u1 = a.id < b.id ? a.id : b.id;
    const u2 = a.id < b.id ? b.id : a.id;
    return op(a, {
      op: 'insert', table: 'chats', single: true, selectAfterWrite: true,
      payload: { user1_id: u1, user2_id: u2 },
    });
  }));
  stats('chat create', chatResults.map(r => r.latMs));
  const chatIds = chatResults.map(r => r.json?.data?.id).filter(Boolean);

  const msgOps = [];
  chatResults.forEach((cr, ci) => {
    const chatId = cr.json?.data?.id;
    if (!chatId) return;
    const [a, b] = pairs[ci];
    for (let m = 0; m < 3; m++) {
      const sender = m % 2 === 0 ? a : b;
      msgOps.push(op(sender, {
        op: 'insert', table: 'messages', single: true,
        payload: {
          chat_id: chatId,
          sender_id: sender.id,
          content: `load-${m}`,
          client_id: crypto.randomUUID(),
        },
      }));
    }
  });
  const msgResults = await Promise.all(msgOps);
  stats(`messages (${msgResults.length})`, msgResults.map(r => r.latMs));

  const likeResults = await Promise.all(vus.map((vu, i) => {
    const target = vus[(i + 1) % vus.length];
    return op(vu, {
      op: 'insert', table: 'likes',
      payload: { liker_id: vu.id, liked_id: target.id, heart_type: 'red', status: 'pending' },
    });
  }));
  stats('likes insert', likeResults.map(r => r.latMs));
  return chatIds;
}

async function phase3(vus) {
  console.log('\n━━━ Phase 3: unread-counts + admin RPC ━━━━━━━━━━━━━━━');
  const badgeResults = await Promise.all(vus.map(vu => unreadCounts(vu)));
  stats('unread-counts', badgeResults.map(r => r.latMs));
  const rpcR = await rpc('admin_create_session', { p_admin_password: ADMIN_PW });
  console.log(`  admin_create_session: ${rpcR.status} ${rpcR.ok ? 'OK' : 'FAIL'}`);
}

async function phase4(vus) {
  console.log('\n━━━ Phase 4: cleanup profiles ━━━━━━━━━━━━━━━━━━━━━━━');
  const results = await Promise.all(vus.map(vu =>
    op(vu, {
      op: 'delete', table: 'profiles',
      filters: [{ type: 'eq', col: 'id', val: vu.id }],
    }),
  ));
  console.log(`  deleted ${results.filter(r => r.ok).length}/${vus.length}`);
}

console.log('═══════════════════════════════════════════════════════');
console.log('  Load test —', new Date().toLocaleString('ko-KR'));
const totalT = performance.now();
await phase0();
const vus = await phase1();
if (vus.length >= 2) await phase2(vus);
await phase3(vus);
await phase4(vus);
console.log(`\n  Total: ${((performance.now() - totalT) / 1000).toFixed(1)}s`);
console.log('═══════════════════════════════════════════════════════');
