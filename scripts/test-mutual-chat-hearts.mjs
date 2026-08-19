#!/usr/bin/env node
/**
 * Mutual (양방향) 채팅·하트 동시 검증
 * - A↔B 동시에 하트
 * - A↔B 동시에 메시지
 * - 양쪽 SSE 수신 + DB SELECT 일치
 *
 * SSE: Render 직접 (Netlify event-stream 버퍼링 회피) — test-realtime-two-user.mjs 와 동일
 */
import { randomUUID } from 'node:crypto';
import { isFunctionsLocked } from './lib/functions-lock.mjs';
import { createPersonaPair, profilePayload } from './lib/test-personas.mjs';

const SITE = (process.env.NETLIFY_URL || 'https://binpc2.netlify.app').replace(/\/$/, '');
const API = (process.env.API_BASE || `${SITE}/api/db`).replace(/\/$/, '');
const SSE_ORIGIN = (process.env.SSE_ORIGIN || process.env.VITE_SSE_ORIGIN || 'https://binpc2.onrender.com').replace(/\/$/, '');
const SSE_API = `${SSE_ORIGIN}/api/db`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, { body, sessionToken } = {}) {
  const started = Date.now();
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...(body || {}), ...(sessionToken ? { sessionToken } : {}) }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, ms: Date.now() - started };
}

function openSse(userId, token) {
  const events = [];
  const ac = new AbortController();
  const url = `${SSE_API}/events?userId=${encodeURIComponent(userId)}&token=${encodeURIComponent(token)}`;
  const done = (async () => {
    const res = await fetch(url, { headers: { Accept: 'text/event-stream' }, signal: ac.signal });
    if (!res.ok || !res.body) throw new Error(`sse ${res.status}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { value, done: d } = await reader.read();
      if (d) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop() || '';
      for (const block of parts) {
        const dataLine = block.split('\n').find((l) => l.startsWith('data:'));
        if (!dataLine) continue;
        try {
          events.push({ at: Date.now(), data: JSON.parse(dataLine.slice(5).trim()) });
        } catch { /* ignore */ }
      }
    }
  })().catch(() => {});
  return {
    events,
    stop: () => { ac.abort(); done.catch(() => {}); },
    waitFor: async (pred, ms = 12_000) => {
      const start = Date.now();
      while (Date.now() - start < ms) {
        const hit = events.find((e) => pred(e.data, e.at));
        if (hit) return hit;
        await sleep(40);
      }
      return null;
    },
  };
}

async function registerAndLogin(persona) {
  const id = randomUUID();
  const secret = randomUUID();
  const reg = await api('/op', {
    body: {
      op: 'insert', table: 'profiles', single: true, selectAfterWrite: true,
      payload: profilePayload({ id, secret, persona }),
    },
  });
  if (reg.status !== 200 || !reg.json.data?.id) throw new Error(`register ${persona.nickname} failed`);
  const login = await api('/auth/login', { body: { userId: id, deviceSecret: secret } });
  if (login.status !== 200 || !login.json.sessionToken) throw new Error(`login ${persona.nickname} ${login.status}`);
  const tok = await api('/auth/sse-token', { body: { userId: id, sessionToken: login.json.sessionToken } });
  if (tok.status !== 200 || !tok.json.token) throw new Error(`sse-token ${persona.nickname}`);
  return { id, nick: persona.nickname, persona, sessionToken: login.json.sessionToken, sseToken: tok.json.token };
}

async function main() {
  if (await isFunctionsLocked(API)) {
    console.log('SKIP — FUNCTIONS_LOCKED');
    return;
  }

  console.log('Mutual chat+hearts test');
  console.log('API=', API, '| SSE=', SSE_API);
  const [personaA, personaB] = createPersonaPair();
  const a = await registerAndLogin(personaA);
  const b = await registerAndLogin(personaB);
  console.log('Personas:', a.persona.nickname, '↔', b.persona.nickname);
  const streamA = openSse(a.id, a.sseToken);
  const streamB = openSse(b.id, b.sseToken);
  await sleep(1200);

  // ── 동시 하트 A→B 와 B→A ──
  const tHeart = Date.now();
  const [likeAB, likeBA] = await Promise.all([
    api('/op', {
      sessionToken: a.sessionToken,
      body: {
        op: 'insert', table: 'likes', requesterId: a.id, single: true, selectAfterWrite: true,
        payload: { liker_id: a.id, liked_id: b.id, heart_type: 'red' },
      },
    }),
    api('/op', {
      sessionToken: b.sessionToken,
      body: {
        op: 'insert', table: 'likes', requesterId: b.id, single: true, selectAfterWrite: true,
        payload: { liker_id: b.id, liked_id: a.id, heart_type: 'blue' },
      },
    }),
  ]);
  console.log('likes insert', likeAB.status, likeBA.status, 'ms', likeAB.ms, likeBA.ms);

  const hitB = await streamB.waitFor(
    (d) => d.type === 'change' && d.table === 'likes' && d.newRow?.liker_id === a.id && d.newRow?.liked_id === b.id,
    10_000,
  );
  const hitA = await streamA.waitFor(
    (d) => d.type === 'change' && d.table === 'likes' && d.newRow?.liker_id === b.id && d.newRow?.liked_id === a.id,
    10_000,
  );
  console.log('SSE heart A→B to B:', !!hitB, hitB ? `${hitB.at - tHeart}ms` : '');
  console.log('SSE heart B→A to A:', !!hitA, hitA ? `${hitA.at - tHeart}ms` : '');

  // ── 동시 채팅방 생성(결정적 ID) + 동시 메시지 ──
  const [u1, u2] = [a.id, b.id].sort();
  const [cA, cB] = await Promise.all([
    api('/op', {
      sessionToken: a.sessionToken,
      body: {
        op: 'insert', table: 'chats', requesterId: a.id, single: true, selectAfterWrite: true,
        payload: { user1_id: u1, user2_id: u2 },
      },
    }),
    api('/op', {
      sessionToken: b.sessionToken,
      body: {
        op: 'insert', table: 'chats', requesterId: b.id, single: true, selectAfterWrite: true,
        payload: { user1_id: u2, user2_id: u1 },
      },
    }),
  ]);
  const chatId = cA.json.data?.id;
  const same = chatId && chatId === cB.json.data?.id;
  console.log('chat ids', cA.json.data?.id, cB.json.data?.id, 'same=', same);
  if (!chatId) throw new Error('chat create failed');

  const markerA = `mut-a-${Date.now()}`;
  const markerB = `mut-b-${Date.now()}`;
  const tMsg = Date.now();
  const [mA, mB] = await Promise.all([
    api('/op', {
      sessionToken: a.sessionToken,
      body: {
        op: 'insert', table: 'messages', requesterId: a.id, single: true, selectAfterWrite: true,
        payload: { chat_id: chatId, sender_id: a.id, content: markerA, client_id: randomUUID() },
      },
    }),
    api('/op', {
      sessionToken: b.sessionToken,
      body: {
        op: 'insert', table: 'messages', requesterId: b.id, single: true, selectAfterWrite: true,
        payload: { chat_id: chatId, sender_id: b.id, content: markerB, client_id: randomUUID() },
      },
    }),
  ]);
  console.log('msg insert', mA.status, mB.status);

  const msgToB = await streamB.waitFor(
    (d) => d.type === 'change' && d.table === 'messages' && d.newRow?.content === markerA,
    12_000,
  );
  const msgToA = await streamA.waitFor(
    (d) => d.type === 'change' && d.table === 'messages' && d.newRow?.content === markerB,
    12_000,
  );
  console.log('SSE msg A→B:', !!msgToB, msgToB ? `${msgToB.at - tMsg}ms` : '');
  console.log('SSE msg B→A:', !!msgToA, msgToA ? `${msgToA.at - tMsg}ms` : '');

  const selA = await api('/op', {
    sessionToken: a.sessionToken,
    body: {
      op: 'select', table: 'messages', requesterId: a.id,
      filters: [{ type: 'eq', col: 'chat_id', val: chatId }],
    },
  });
  const rows = Array.isArray(selA.json.data) ? selA.json.data : [];
  const hasBoth = rows.some((r) => r.content === markerA) && rows.some((r) => r.content === markerB);
  console.log('DB both messages visible to A:', hasBoth, 'count', rows.length);

  streamA.stop();
  streamB.stop();

  const ok = !!hitA && !!hitB && same && !!msgToA && !!msgToB && hasBoth
    && likeAB.status === 200 && likeBA.status === 200
    && mA.status === 200 && mB.status === 200;
  if (!ok) {
    console.error('\n❌ Mutual test FAILED');
    process.exit(2);
  }
  console.log('\n✅ Mutual bidirectional chat+hearts PASSED');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
