#!/usr/bin/env node
/**
 * 1:1 chat message types — emoji / quick / sticker / image
 * Send via /op (+ storage-upload for images) and verify peer SSE + SELECT + image display auth.
 *
 * Usage: node scripts/test-chat-message-types.mjs
 */
import { randomUUID } from 'node:crypto';
import { isFunctionsLocked } from './lib/functions-lock.mjs';
import { createPersonaPair, profilePayload } from './lib/test-personas.mjs';

const SITE = (process.env.NETLIFY_URL || 'https://binpc2.netlify.app').replace(/\/$/, '');
const API = (process.env.API_BASE || `${SITE}/api/db`).replace(/\/$/, '');
const SSE_ORIGIN = (process.env.SSE_ORIGIN || process.env.VITE_SSE_ORIGIN || 'https://binpc2.onrender.com').replace(/\/$/, '');
const SSE_API = `${SSE_ORIGIN}/api/db`;

const JPEG_DATA = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=';

const QUICK_MSG = '오늘 즐거웠어요 ☺️';
const EMOJI_MSG = '😍🎉👍';
const STICKER_MSG = '__sticker__0';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, { body, sessionToken } = {}) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...(body || {}), ...(sessionToken ? { sessionToken } : {}) }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
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
  if (reg.status !== 200 || !reg.json.data?.id) {
    throw new Error(`register ${persona.nickname} failed: ${reg.status} ${JSON.stringify(reg.json)}`);
  }
  const login = await api('/auth/login', { body: { userId: id, deviceSecret: secret } });
  if (login.status !== 200 || !login.json.sessionToken) throw new Error(`login ${persona.nickname}`);
  const tok = await api('/auth/sse-token', { body: { userId: id, sessionToken: login.json.sessionToken } });
  if (tok.status !== 200 || !tok.json.token) throw new Error(`sse-token ${persona.nickname}`);
  return { id, nick: persona.nickname, sessionToken: login.json.sessionToken, sseToken: tok.json.token };
}

async function main() {
  if (await isFunctionsLocked(API)) {
    console.log('SKIP — FUNCTIONS_LOCKED');
    return;
  }

  console.log('Chat message types smoke');
  console.log('API=', API, '| SSE=', SSE_API);
  const [personaA, personaB] = createPersonaPair();
  const a = await registerAndLogin(personaA);
  const b = await registerAndLogin(personaB);
  console.log('Personas:', a.nick, '↔', b.nick);

  const streamB = openSse(b.id, b.sseToken);
  await sleep(800);

  const [u1, u2] = [a.id, b.id].sort();
  const chat = await api('/op', {
    sessionToken: a.sessionToken,
    body: {
      op: 'insert', table: 'chats', requesterId: a.id, single: true, selectAfterWrite: true,
      payload: { user1_id: u1, user2_id: u2 },
    },
  });
  const chatId = chat.json.data?.id;
  if (!chatId) throw new Error('chat create failed');
  console.log('chatId=', chatId);

  const fails = [];

  async function sendText(label, content, match) {
    const clientId = randomUUID();
    const t0 = Date.now();
    const ins = await api('/op', {
      sessionToken: a.sessionToken,
      body: {
        op: 'insert', table: 'messages', requesterId: a.id, single: true, selectAfterWrite: true,
        payload: { chat_id: chatId, sender_id: a.id, content, client_id: clientId },
      },
    });
    const saved = ins.json.data;
    const sendOk = ins.status === 200 && saved && match(saved);
    const sse = await streamB.waitFor(
      (d) => d.type === 'change' && d.table === 'messages' && d.newRow?.client_id === clientId && match(d.newRow),
      12_000,
    );
    console.log(`${label}: send=${sendOk ? 'OK' : 'FAIL'} sse=${sse ? `OK ${sse.at - t0}ms` : 'FAIL'}`);
    if (!sendOk) fails.push(`${label} send`);
    if (!sse) fails.push(`${label} sse`);
  }

  await sendText('emoji', EMOJI_MSG, (row) => row.content === EMOJI_MSG);
  await sendText('quick', QUICK_MSG, (row) => row.content === QUICK_MSG);
  await sendText('sticker', STICKER_MSG, (row) => row.content === STICKER_MSG);

  const imgClientId = randomUUID();
  const imgPath = `${chatId}/${a.id}/${imgClientId}.jpg`;
  const upload = await fetch(`${SITE}/api/db/storage-upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: imgPath,
      dataUrl: JPEG_DATA,
      requesterId: a.id,
      sessionToken: a.sessionToken,
    }),
  });
  console.log('image upload (Netlify+sessionToken):', upload.status);
  if (!upload.ok) fails.push(`image upload ${upload.status}`);

  const publicUrl = `/api/db/storage-image?p=${encodeURIComponent(imgPath)}`;
  const tImg = Date.now();
  const imgIns = await api('/op', {
    sessionToken: a.sessionToken,
    body: {
      op: 'insert', table: 'messages', requesterId: a.id, single: true, selectAfterWrite: true,
      payload: {
        chat_id: chatId, sender_id: a.id, content: '', image_url: publicUrl, client_id: imgClientId,
      },
    },
  });
  const imgSaved = imgIns.json.data;
  const imgSendOk = imgIns.status === 200 && imgSaved?.image_url === publicUrl;
  const imgSse = await streamB.waitFor(
    (d) => d.type === 'change' && d.table === 'messages'
      && d.newRow?.client_id === imgClientId
      && d.newRow?.image_url === publicUrl,
    12_000,
  );
  console.log(`image msg: send=${imgSendOk ? 'OK' : 'FAIL'} sse=${imgSse ? `OK ${imgSse.at - tImg}ms` : 'FAIL'}`);
  if (!imgSendOk) fails.push('image send');
  if (!imgSse) fails.push('image sse');

  const bare = await fetch(`${SITE}${publicUrl}`);
  const withToken = await fetch(
    `${SITE}${publicUrl}&userId=${encodeURIComponent(b.id)}&sessionToken=${encodeURIComponent(b.sessionToken)}`,
  );
  console.log(`image read bare (img-tag sim): ${bare.status}`);
  console.log(`image read +sessionToken query: ${withToken.status}`);

  const sel = await api('/op', {
    sessionToken: b.sessionToken,
    body: {
      op: 'select', table: 'messages', requesterId: b.id,
      filters: [{ type: 'eq', col: 'chat_id', val: chatId }],
    },
  });
  const rows = Array.isArray(sel.json.data) ? sel.json.data : [];
  const hasEmoji = rows.some((r) => r.content === EMOJI_MSG);
  const hasQuick = rows.some((r) => r.content === QUICK_MSG);
  const hasSticker = rows.some((r) => r.content === STICKER_MSG);
  const hasImage = rows.some((r) => r.image_url === publicUrl);
  console.log('B SELECT:', { hasEmoji, hasQuick, hasSticker, hasImage, count: rows.length });
  if (!hasEmoji) fails.push('select emoji');
  if (!hasQuick) fails.push('select quick');
  if (!hasSticker) fails.push('select sticker');
  if (!hasImage) fails.push('select image');

  if (!withToken.ok) {
    fails.push(`image display sessionToken query ${withToken.status}`);
  } else if (!bare.ok) {
    console.log('image display: bare 401 expected; sessionToken query OK (client withChatImageAuth path)');
  }

  streamB.stop();

  if (fails.length) {
    console.error('\n❌ Chat message types FAILED:', fails);
    process.exit(2);
  }
  console.log('\n✅ Chat message types PASSED (emoji/quick/sticker/image send+SSE+SELECT+display)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
