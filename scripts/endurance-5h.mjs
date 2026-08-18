#!/usr/bin/env node
/**
 * 5-hour endurance: 2 users keep SSE open, send heart+chat every interval, verify DB persist.
 * Uses Render API directly (Netlify buffers SSE).
 *
 * Usage:
 *   node scripts/endurance-5h.mjs
 *   ENDURANCE_HOURS=5 ENDURANCE_INTERVAL_MS=300000 node scripts/endurance-5h.mjs
 *
 * Env:
 *   API_BASE          default https://binpc2.onrender.com/api/db
 *   ENDURANCE_HOURS   default 5
 *   ENDURANCE_INTERVAL_MS  cycle interval (default 5 min)
 *   ENDURANCE_METRICS_FILE  jsonl log path
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = (process.env.API_BASE || 'https://binpc2.onrender.com/api/db').replace(/\/$/, '');
const HOURS = Number(process.env.ENDURANCE_HOURS || 5);
const INTERVAL_MS = Number(process.env.ENDURANCE_INTERVAL_MS || 5 * 60 * 1000);
const RUN_ID = `end_${Date.now()}`;
const METRICS = resolve(process.env.ENDURANCE_METRICS_FILE
  || `scripts/.soak-results/${RUN_ID}.jsonl`);
const DURATION_MS = HOURS * 60 * 60 * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(event) {
  mkdirSync(dirname(METRICS), { recursive: true });
  appendFileSync(METRICS, `${JSON.stringify({ ts: new Date().toISOString(), runId: RUN_ID, ...event })}\n`);
  const tag = event.ok === false ? 'FAIL' : event.type ?? 'info';
  console.log(`[${tag}]`, event.msg ?? JSON.stringify(event));
}

function parseCookies(setCookieHeaders) {
  const jar = new Map();
  for (const h of setCookieHeaders) {
    const part = h.split(';')[0];
    const i = part.indexOf('=');
    if (i > 0) jar.set(part.slice(0, i).trim(), part.slice(i + 1));
  }
  return jar;
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function op(jar, sessionToken, body) {
  const res = await fetch(`${API}/op`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(jar.size ? { Cookie: cookieHeader(jar) } : {}),
    },
    body: JSON.stringify({ ...body, ...(sessionToken ? { sessionToken } : {}) }),
    signal: AbortSignal.timeout(45_000),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function login(jar, userId, deviceSecret) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(jar.size ? { Cookie: cookieHeader(jar) } : {}) },
    body: JSON.stringify({ userId, deviceSecret }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = res.headers.getSetCookie?.() ?? [];
  const single = res.headers.get('set-cookie');
  for (const [k, v] of parseCookies(raw.length ? raw : (single ? [single] : []))) jar.set(k, v);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function sseToken(jar, sessionToken, userId) {
  const res = await fetch(`${API}/auth/sse-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(jar.size ? { Cookie: cookieHeader(jar) } : {}),
    },
    body: JSON.stringify({ userId, ...(sessionToken ? { sessionToken } : {}) }),
    signal: AbortSignal.timeout(30_000),
  });
  const json = await res.json().catch(() => ({}));
  return json.token ?? json.sseToken ?? null;
}

function openSse(userId, token) {
  const url = `${API}/events?userId=${encodeURIComponent(userId)}&token=${encodeURIComponent(token)}`;
  const events = [];
  let buffer = '';
  const ac = new AbortController();
  const done = (async () => {
    const res = await fetch(url, { headers: { Accept: 'text/event-stream' }, signal: ac.signal });
    if (!res.ok || !res.body) throw new Error(`SSE HTTP ${res.status}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    while (true) {
      const { value, done: d } = await reader.read();
      if (d) break;
      buffer += dec.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';
      for (const block of parts) {
        const dataLine = block.split('\n').find((l) => l.startsWith('data:'));
        if (!dataLine) continue;
        try { events.push(JSON.parse(dataLine.slice(5).trim())); } catch { /* ping */ }
      }
    }
  })();
  return {
    events,
    stop: () => ac.abort(),
    waitFor: async (pred, ms = 20_000) => {
      const start = Date.now();
      while (Date.now() - start < ms) {
        const hit = events.find(pred);
        if (hit) return hit;
        await sleep(120);
      }
      return null;
    },
    done,
  };
}

async function checkFunctionsUnlocked() {
  const r = await op(new Map(), null, {
    op: 'select', table: 'app_settings', limit: 1,
  });
  const row = Array.isArray(r.json.data) ? r.json.data[0] : r.json.data;
  if (row?.functions_locked) {
    log({ type: 'skip', ok: false, msg: 'FUNCTIONS_LOCKED — unlock in admin before endurance run' });
    process.exit(2);
  }
}

async function setupUsers() {
  const idA = crypto.randomUUID();
  const idB = crypto.randomUUID();
  const secA = crypto.randomUUID();
  const secB = crypto.randomUUID();
  const nickA = `enA_${RUN_ID.slice(-6)}`;
  const nickB = `enB_${RUN_ID.slice(-6)}`;
  const jarA = new Map();
  const jarB = new Map();

  for (const [jar, id, nick, sec] of [[jarA, idA, nickA, secA], [jarB, idB, nickB, secB]]) {
    const r = await op(jar, null, {
      op: 'insert', table: 'profiles', single: true, selectAfterWrite: true,
      payload: { id, nickname: nick, bio: 'endurance', photo_url: null, personality_score: 50, _device_secret: sec },
    });
    if (r.status !== 200 || !r.json.data?.id) throw new Error(`register ${nick} ${r.status}`);
  }

  const loginA = await login(jarA, idA, secA);
  const loginB = await login(jarB, idB, secB);
  const tokenA = loginA.json.sessionToken;
  const tokenB = loginB.json.sessionToken;
  if (!tokenA || !tokenB) throw new Error('sessionToken missing');

  const sseTokA = await sseToken(jarA, tokenA, idA);
  const sseTokB = await sseToken(jarB, tokenB, idB);
  if (!sseTokA || !sseTokB) throw new Error('sse token missing');

  const u1 = idA < idB ? idA : idB;
  const u2 = idA < idB ? idB : idA;
  const chatR = await op(jarA, tokenA, {
    op: 'insert', table: 'chats', requesterId: idA, single: true, selectAfterWrite: true,
    payload: { user1_id: u1, user2_id: u2 },
  });
  const chatId = chatR.json.data?.id;
  if (!chatId) throw new Error('chat create failed');

  return { idA, idB, jarA, jarB, tokenA, tokenB, sseTokA, sseTokB, chatId };
}

async function runCycle(ctx, cycle) {
  const { idA, idB, jarA, jarB, tokenA, tokenB, sseTokB, chatId } = ctx;
  const msgBody = `end-${RUN_ID}-c${cycle}-${Date.now()}`;
  const fails = [];

  const streamB = openSse(idB, sseTokB);
  await sleep(600);

  const msgR = await op(jarA, tokenA, {
    op: 'insert', table: 'messages', requesterId: idA, single: true, selectAfterWrite: true,
    payload: { chat_id: chatId, sender_id: idA, content: msgBody, client_id: crypto.randomUUID() },
  });
  if (msgR.status !== 200 || !msgR.json.data?.id) fails.push(`msg insert ${msgR.status}`);

  const msgEvt = await streamB.waitFor(
    (e) => e.type === 'change' && e.table === 'messages' && e.event === 'INSERT' && e.newRow?.content === msgBody,
  );
  if (!msgEvt) fails.push('msg SSE miss');

  const selR = await op(jarB, tokenB, {
    op: 'select', table: 'messages', requesterId: idB,
    filters: [{ type: 'eq', col: 'chat_id', val: chatId }],
  });
  const msgs = Array.isArray(selR.json.data) ? selR.json.data : [];
  if (!msgs.some((m) => m.content === msgBody)) fails.push('msg DB miss');

  streamB.stop();
  streamB.done.catch(() => {});

  const ok = fails.length === 0;
  log({ type: 'cycle', cycle, ok, fails, msgCount: msgs.length, elapsedMs: Date.now() - ctx.startedAt });
  return ok;
}

async function main() {
  console.log(`Endurance: ${HOURS}h, interval ${INTERVAL_MS}ms, API ${API}`);
  console.log(`Metrics: ${METRICS}`);
  await checkFunctionsUnlocked();

  const ctx = await setupUsers();
  ctx.startedAt = Date.now();
  log({ type: 'start', hours: HOURS, intervalMs: INTERVAL_MS });

  const deadline = Date.now() + DURATION_MS;
  let cycle = 0;
  let failStreak = 0;

  while (Date.now() < deadline) {
    cycle += 1;
    const ok = await runCycle(ctx, cycle);
    if (!ok) {
      failStreak += 1;
      if (failStreak >= 3) {
        log({ type: 'abort', ok: false, msg: '3 consecutive cycle failures' });
        process.exit(1);
      }
    } else {
      failStreak = 0;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await sleep(Math.min(INTERVAL_MS, remaining));
  }

  log({ type: 'done', ok: true, cycles: cycle, elapsedMs: Date.now() - ctx.startedAt, msg: `${HOURS}h endurance passed` });
}

main().catch((e) => {
  log({ type: 'fatal', ok: false, msg: e instanceof Error ? e.message : String(e) });
  process.exit(1);
});
