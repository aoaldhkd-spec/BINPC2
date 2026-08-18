#!/usr/bin/env node
/**
 * 2-user realtime E2E: like + chat room + message delivery via SSE
 * Usage: node scripts/test-realtime-two-user.mjs
 * Env: NETLIFY_URL (default https://binpc2.netlify.app) or API_BASE
 */
import { isFunctionsLocked } from './lib/functions-lock.mjs';

const SITE = (process.env.NETLIFY_URL || process.env.API_BASE || 'https://binpc2.netlify.app').replace(/\/$/, '');
const API = SITE.includes('/api') ? SITE.replace(/\/$/, '') : `${SITE}/api/db`;

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
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function login(jar, userId, deviceSecret) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(jar.size ? { Cookie: cookieHeader(jar) } : {}) },
    body: JSON.stringify({ userId, deviceSecret }),
  });
  const raw = res.headers.getSetCookie?.() ?? [];
  const single = res.headers.get('set-cookie');
  const setCookies = raw.length ? raw : (single ? [single] : []);
  for (const [k, v] of parseCookies(setCookies)) jar.set(k, v);
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
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, token: json.token ?? json.sseToken ?? null, json };
}

function openSse(userId, token) {
  const url = `${API}/events?userId=${encodeURIComponent(userId)}&token=${encodeURIComponent(token)}`;
  const events = [];
  let buffer = '';
  const ac = new AbortController();
  const done = (async () => {
    const res = await fetch(url, {
      headers: { Accept: 'text/event-stream' },
      signal: ac.signal,
    });
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
        try {
          const data = JSON.parse(dataLine.slice(5).trim());
          events.push(data);
        } catch { /* ping or partial */ }
      }
    }
  })();
  return {
    events,
    stop: () => ac.abort(),
    waitFor: async (pred, ms = 15000) => {
      const start = Date.now();
      while (Date.now() - start < ms) {
        const hit = events.find(pred);
        if (hit) return hit;
        await new Promise((r) => setTimeout(r, 100));
      }
      return null;
    },
    done,
  };
}

async function main() {
  if (await isFunctionsLocked(API)) {
    console.log('SKIP — FUNCTIONS_LOCKED (행사 중 하트·채팅 잠금, 버그 아님)');
    return;
  }
  const idA = crypto.randomUUID();
  const idB = crypto.randomUUID();
  const secA = crypto.randomUUID();
  const secB = crypto.randomUUID();
  const nickA = `rtA${Date.now() % 100000}`;
  const nickB = `rtB${Date.now() % 100000}`;
  const jarA = new Map();
  const jarB = new Map();
  const fails = [];

  console.log('API:', API);

  let r = await op(jarA, null, {
    op: 'insert', table: 'profiles', single: true, selectAfterWrite: true,
    payload: { id: idA, nickname: nickA, bio: 'rt', photo_url: null, personality_score: 50, _device_secret: secA },
  });
  if (r.status !== 200 || !r.json.data?.id) fails.push(`register A ${r.status}`);
  r = await op(jarB, null, {
    op: 'insert', table: 'profiles', single: true, selectAfterWrite: true,
    payload: { id: idB, nickname: nickB, bio: 'rt', photo_url: null, personality_score: 50, _device_secret: secB },
  });
  if (r.status !== 200 || !r.json.data?.id) fails.push(`register B ${r.status}`);

  const loginA = await login(jarA, idA, secA);
  const loginB = await login(jarB, idB, secB);
  const tokenA = loginA.json.sessionToken;
  const tokenB = loginB.json.sessionToken;
  if (!tokenA || !tokenB) fails.push('sessionToken missing');

  const sseA = await sseToken(jarA, tokenA, idA);
  const sseB = await sseToken(jarB, tokenB, idB);
  if (!sseA.token || !sseB.token) fails.push(`sse token A=${!!sseA.token} B=${!!sseB.token} ${JSON.stringify(sseB.json)}`);

  if (fails.length) {
    console.error('SETUP FAIL', fails);
    process.exit(1);
  }

  const streamB = openSse(idB, sseB.token);
  // allow SSE to connect
  await new Promise((r) => setTimeout(r, 800));

  // Like A → B
  r = await op(jarA, tokenA, {
    op: 'insert', table: 'likes', requesterId: idA, single: true, selectAfterWrite: true,
    payload: { liker_id: idA, liked_id: idB, heart_type: 'red' },
  });
  console.log('like', r.status, r.json.data?.id ? 'id=' + r.json.data.id : r.json.error);
  if (r.status !== 200 || !r.json.data?.id) fails.push('like insert');

  const likeEvt = await streamB.waitFor(
    (e) => e.type === 'change' && e.table === 'likes' && e.event === 'INSERT' && e.newRow?.liked_id === idB,
    12000,
  );
  console.log('SSE like to B', likeEvt ? 'OK' : 'MISS');
  if (!likeEvt) fails.push('SSE like not delivered to B');

  const u1 = idA < idB ? idA : idB;
  const u2 = idA < idB ? idB : idA;
  r = await op(jarA, tokenA, {
    op: 'insert', table: 'chats', requesterId: idA, single: true, selectAfterWrite: true,
    payload: { user1_id: u1, user2_id: u2 },
  });
  const chatId = r.json.data?.id;
  console.log('chat create', r.status, chatId);
  if (!chatId) fails.push('chat create');

  // Concurrent create from B should return same room
  const r2 = await op(jarB, tokenB, {
    op: 'insert', table: 'chats', requesterId: idB, single: true, selectAfterWrite: true,
    payload: { user1_id: u2, user2_id: u1 },
  });
  console.log('chat create B', r2.status, r2.json.data?.id, 'same=', r2.json.data?.id === chatId);
  if (r2.json.data?.id && r2.json.data.id !== chatId) fails.push('duplicate chat room');

  const clientId = crypto.randomUUID();
  const msgBody = `hello-${Date.now()}`;
  r = await op(jarA, tokenA, {
    op: 'insert', table: 'messages', requesterId: idA, single: true, selectAfterWrite: true,
    payload: { chat_id: chatId, sender_id: idA, content: msgBody, client_id: clientId },
  });
  console.log('message', r.status, r.json.data?.id ? 'ok' : r.json.error);
  if (r.status !== 200 || !r.json.data?.id) fails.push('message insert');

  const msgEvt = await streamB.waitFor(
    (e) => e.type === 'change' && e.table === 'messages' && e.event === 'INSERT' && e.newRow?.content === msgBody,
    12000,
  );
  console.log('SSE message to B', msgEvt ? 'OK' : 'MISS');
  if (!msgEvt) fails.push('SSE message not delivered to B');

  // Persist check: B select
  r = await op(jarB, tokenB, {
    op: 'select', table: 'messages', requesterId: idB,
    filters: [{ type: 'eq', col: 'chat_id', val: chatId }],
  });
  const msgs = Array.isArray(r.json.data) ? r.json.data : [];
  const found = msgs.some((m) => m.content === msgBody);
  console.log('B select message', found ? 'OK' : 'MISS', 'count', msgs.length);
  if (!found) fails.push('message not in DB for B');

  streamB.stop();
  // abort 정리 중 unhandled rejection 방지
  streamB.done.catch(() => {});

  if (fails.length) {
    console.error('\n❌ FAIL', fails);
    process.exit(1);
  }
  console.log('\n✅ 2-user realtime E2E passed');
}

main().catch((e) => { console.error(e); process.exit(1); });
