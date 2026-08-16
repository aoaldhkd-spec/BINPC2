/**
 * 150-VU full load test — covers all 5 areas from the brief
 * Runs against http://localhost:8080/api/db
 */
import { performance } from 'perf_hooks';
import { createHash, createHmac } from 'crypto';

const BASE = 'http://localhost:8080/api/db';
const ADMIN_PW = '116606'; // seed default: app_settings.admin_password
const VU_COUNT = 150;

// ─── helpers ──────────────────────────────────────────────────────────────────
const uid  = () => createHash('sha256').update(Math.random().toString()).digest('hex').slice(0, 8);
const ts   = () => new Date().toISOString();
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function req(method, path, body, label) {
  const t0 = performance.now();
  try {
    const r = await fetch(`${BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
    });
    const latMs = performance.now() - t0;
    const json = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, latMs, data: json };
  } catch (e) {
    return { ok: false, status: 0, latMs: performance.now() - t0, error: e.message };
  }
}

function stats(label, samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const p = pct => sorted[Math.floor(sorted.length * pct / 100)] ?? 0;
  const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  console.log(`  ${label.padEnd(28)} p50=${p(50).toFixed(0)}ms  p95=${p(95).toFixed(0)}ms  p99=${p(99).toFixed(0)}ms  avg=${avg.toFixed(0)}ms  n=${sorted.length}`);
}

// ─── Phase 0: health + reset to clean state ───────────────────────────────────
async function phase0() {
  console.log('\n━━━ Phase 0: Health check ━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const h = await req('GET', '/health', null, 'health');
  console.log(`  Status: ${h.status}  SSE connections: ${h.data?.sseConnections ?? '?'}  latency: ${h.latMs.toFixed(0)}ms`);
  console.log(`  Persist errors: ${h.data?.persistErrors ?? '?'}`);

  // ensure session is active
  await req('POST', '/rpc', { rpc: 'admin_update_settings', payload: { session_active: true }, password: ADMIN_PW }, 'enable-session');
  console.log('  Session activated.');
}

// ─── Phase 1: 150 concurrent profile registrations ───────────────────────────
async function phase1() {
  console.log('\n━━━ Phase 1: 150 VU concurrent profile registration ━━━━━━━━━━━━');
  const vus = Array.from({ length: VU_COUNT }, (_, i) => ({
    id: `loadtest-${uid()}`,
    nickname: `부하테스트${i + 1}`,
    pin_code: String(1000 + i).padStart(4, '0'), // ensure unique
  }));

  const t0 = performance.now();
  const results = await Promise.all(vus.map(vu =>
    req('POST', '/op', {
      table: 'profiles',
      op: 'insert',
      payload: {
        id: vu.id,
        nickname: vu.nickname,
        created_at: ts(),
        personality_score: 50,
        birth_year: 1995,
        birth_month: Math.ceil(Math.random() * 12),
        birth_day: Math.ceil(Math.random() * 28),
      },
    })
  ));
  const elapsed = performance.now() - t0;

  const ok   = results.filter(r => r.ok).length;
  const fail = results.filter(r => !r.ok);
  const lats = results.map(r => r.latMs);
  console.log(`  Registered: ${ok}/${VU_COUNT}  failed: ${fail.length}  wall: ${elapsed.toFixed(0)}ms`);
  if (fail.length) console.log(`  First failure: ${JSON.stringify(fail[0])}`);
  stats('profile insert', lats);
  return vus.filter((_, i) => results[i].ok);
}

// ─── Phase 2b: concurrent chat & message sending ─────────────────────────────
async function phase2b(vus) {
  console.log('\n━━━ Phase 2b: concurrent chat open + message send ━━━━━━━━━━━━━━');
  // pair up users into 75 chats
  const pairs = [];
  for (let i = 0; i < VU_COUNT - 1; i += 2) pairs.push([vus[i], vus[i + 1]]);

  // open chats
  const chatResults = await Promise.all(pairs.map(([a, b]) => {
    const [u1, u2] = a.id < b.id ? [a, b] : [b, a];
    return req('POST', '/op', {
      table: 'chats',
      op: 'upsert',
      payload: { id: `${u1.id}:${u2.id}`, user1_id: u1.id, user2_id: u2.id, created_at: ts() },
      onConflict: 'id',
    });
  }));
  stats('chat upsert (75 pairs)', chatResults.map(r => r.latMs));

  // each pair sends 3 messages each = 450 total
  const msgOps = [];
  pairs.forEach(([a, b]) => {
    const [u1, u2] = a.id < b.id ? [a, b] : [b, a];
    const chatId = `${u1.id}:${u2.id}`;
    for (let m = 0; m < 3; m++) {
      msgOps.push(req('POST', '/op', {
        table: 'messages',
        op: 'insert',
        payload: {
          id: uid(),
          chat_id: chatId,
          sender_id: m % 2 === 0 ? a.id : b.id,
          content: `부하테스트 메시지 ${m + 1}`,
          created_at: ts(),
          client_id: uid(),
        },
      }));
    }
  });
  const msgResults = await Promise.all(msgOps);
  const msgOk = msgResults.filter(r => r.ok).length;
  stats(`message insert (${msgResults.length})`, msgResults.map(r => r.latMs));
  console.log(`  messages ok=${msgOk}/${msgResults.length}`);
}

// ─── Phase 2c: concurrent heart/like burst ────────────────────────────────────
async function phase2c(vus) {
  console.log('\n━━━ Phase 2c: 150 VU concurrent like burst ━━━━━━━━━━━━━━━━━━━━');
  // each VU likes the next user (ring topology)
  const results = await Promise.all(vus.map((vu, i) => {
    const target = vus[(i + 1) % VU_COUNT];
    return req('POST', '/op', {
      table: 'likes',
      op: 'upsert',
      payload: {
        id: `${vu.id}:${target.id}:special`,
        liker_id: vu.id,
        liked_id: target.id,
        heart_type: 'special',
        status: 'pending',
        created_at: ts(),
      },
      onConflict: 'id',
    });
  }));
  const ok = results.filter(r => r.ok).length;
  stats('like upsert (150)', results.map(r => r.latMs));
  console.log(`  ok=${ok}/${VU_COUNT}`);
}

// ─── Phase 3: admin broadcast under load ─────────────────────────────────────
async function phase3(vus) {
  console.log('\n━━━ Phase 3: Admin broadcast under 150-VU concurrent load ━━━━━━━');

  // Background: 150 users hammering /op concurrently
  const bgPromise = Promise.all(vus.map((vu, i) => {
    const target = vus[(i + 1) % vus.length];
    const [u1, u2] = vu.id < target.id ? [vu, target] : [target, vu];
    return req('POST', '/op', {
      table: 'messages',
      op: 'insert',
      payload: {
        id: uid(),
        chat_id: `${u1.id}:${u2.id}`,
        sender_id: vu.id,
        content: '부하테스트 백그라운드',
        created_at: ts(),
        client_id: uid(),
      },
    });
  }));

  // Foreground: admin lock via /op (설정 업데이트는 table=app_settings)
  const settingsRow = (await req('GET', '/health')).data;
  const lockT = performance.now();
  const lockR = await req('POST', '/op', {
    table: 'app_settings',
    op: 'update',
    filters: [{ column: 'id', op: 'eq', value: 1 }],
    payload: { timer_label: true },
  });
  const lockMs = performance.now() - lockT;

  await bgPromise;
  console.log(`  admin lock (timer_label=true): ${lockMs.toFixed(0)}ms  ok=${lockR.ok}  status=${lockR.status}`);

  // Unlock
  const unlockT = performance.now();
  const unlockR = await req('POST', '/op', {
    table: 'app_settings',
    op: 'update',
    filters: [{ column: 'id', op: 'eq', value: 1 }],
    payload: { timer_label: false },
  });
  console.log(`  admin unlock: ${(performance.now() - unlockT).toFixed(0)}ms  ok=${unlockR.ok}`);

  // Also test RPC endpoint with correct field names
  const rpcT = performance.now();
  const rpcR = await req('POST', '/rpc/admin_create_session', { p_admin_password: ADMIN_PW });
  console.log(`  RPC admin_create_session: ${(performance.now() - rpcT).toFixed(0)}ms  ok=${rpcR.ok}  status=${rpcR.status}`);

  const health = await req('GET', '/health');
  console.log(`  SSE clients: ${health.data?.sseConnections ?? 0}  persist errors: ${health.data?.persistErrors ?? 0}`);
}

// ─── Phase 4: /unread-counts cache + 150 concurrent ─────────────────────────
async function phase4(vus) {
  console.log('\n━━━ Phase 4: /unread-counts 150 concurrent (cache stress) ━━━━━━━');
  const results = await Promise.all(vus.map(vu =>
    req('GET', `/unread-counts?userId=${vu.id}`)
  ));
  const ok = results.filter(r => r.ok).length;
  stats('unread-counts (150)', results.map(r => r.latMs));
  console.log(`  ok=${ok}/${VU_COUNT}`);
}

// ─── Phase 5: SSE token auth endpoint ─────────────────────────────────────────
async function phase5(vus) {
  console.log('\n━━━ Phase 5: SSE token issuance (50 concurrent) ━━━━━━━━━━━━━━━');
  const sample = vus.slice(0, 50);
  const results = await Promise.all(sample.map(vu =>
    req('POST', '/auth/sse-token', { userId: vu.id })
  ));
  const ok = results.filter(r => r.ok || r.status === 401).length; // 401=expected for no device secret
  stats('sse-token (50)', results.map(r => r.latMs));
  console.log(`  responded=${ok}/50  (401=expected for test users without device secrets)`);
}

// ─── Phase 6: Memory + GC snapshot ───────────────────────────────────────────
async function phase6() {
  console.log('\n━━━ Phase 6: Server memory & persist errors ━━━━━━━━━━━━━━━━━━');
  const h = await req('GET', '/health');
  const mu = process.memoryUsage();
  console.log(`  Server-side — sseConns: ${h.data?.sseConnections ?? 0}  persistErrors: ${h.data?.persistErrors ?? 0}`);
  console.log(`  Test-process heap: ${(mu.heapUsed / 1024 / 1024).toFixed(1)}MB / ${(mu.heapTotal / 1024 / 1024).toFixed(1)}MB`);
  console.log(`  rss: ${(mu.rss / 1024 / 1024).toFixed(1)}MB`);
  if ((h.data?.persistErrors ?? 0) > 0) {
    console.log(`  ⚠️  Persist errors found: ${JSON.stringify(h.data.recentErrors?.slice(-3))}`);
  }
}

// ─── Phase 7: cleanup ─────────────────────────────────────────────────────────
async function phase7(vus) {
  console.log('\n━━━ Phase 7: Cleanup test data ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  // Delete all loadtest profiles (cascades in-memory store)
  const results = await Promise.all(vus.map(vu =>
    req('POST', '/op', {
      table: 'profiles',
      op: 'delete',
      filters: [{ column: 'id', op: 'eq', value: vu.id }],
    })
  ));
  const ok = results.filter(r => r.ok).length;
  console.log(`  Deleted ${ok}/${vus.length} test profiles`);
}

// ─── main ─────────────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════════════');
console.log('  150-VU Full Load Test  —  ' + new Date().toLocaleString('ko-KR'));
console.log('═══════════════════════════════════════════════════════════════');

const totalT = performance.now();
await phase0();
const vus = await phase1();
await phase2b(vus);
await phase2c(vus);
await phase3(vus);
await phase4(vus);
await phase5(vus);
await phase6();
await phase7(vus);

console.log(`\n═══════════════════════════════════════════════════════════════`);
console.log(`  Total test wall time: ${((performance.now() - totalT) / 1000).toFixed(1)}s`);
console.log(`═══════════════════════════════════════════════════════════════`);
