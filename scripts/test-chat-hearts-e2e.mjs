#!/usr/bin/env node
/** E2E: register → login sessionToken → like + chat through Netlify proxy */
import { isFunctionsLocked } from './lib/functions-lock.mjs';
import { createPersonaPair, profilePayload } from './lib/test-personas.mjs';

const SITE = (process.env.NETLIFY_URL || 'https://binpc2.netlify.app').replace(/\/$/, '');
const API = `${SITE}/api/db`;

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
  return { status: res.status, json, headers: res.headers };
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
  return { status: res.status, json, setCookies };
}

async function main() {
  if (await isFunctionsLocked(`${SITE}/api/db`)) {
    console.log('SKIP — FUNCTIONS_LOCKED (행사 중 하트·채팅 잠금, 버그 아님)');
    return;
  }
  const idA = crypto.randomUUID();
  const idB = crypto.randomUUID();
  const secA = crypto.randomUUID();
  const secB = crypto.randomUUID();
  const [personaA, personaB] = createPersonaPair();
  const jarA = new Map();
  const jarB = new Map();

  console.log('Site:', SITE);
  console.log('Personas:', personaA.nickname, '↔', personaB.nickname);

  // Register A (no session)
  let r = await op(jarA, null, {
    op: 'insert', table: 'profiles', single: true, selectAfterWrite: true,
    payload: profilePayload({ id: idA, secret: secA, persona: personaA }),
  });
  if (r.status !== 200 || !r.json.data?.id) {
    console.error('register A FAIL', r.status, r.json);
    process.exit(1);
  }
  console.log('register A OK', r.json.data.pin_code);

  r = await op(jarB, null, {
    op: 'insert', table: 'profiles', single: true, selectAfterWrite: true,
    payload: profilePayload({ id: idB, secret: secB, persona: personaB }),
  });
  if (r.status !== 200 || !r.json.data?.id) {
    console.error('register B FAIL', r.status, r.json);
    process.exit(1);
  }
  console.log('register B OK');

  const loginA = await login(jarA, idA, secA);
  const tokenA = loginA.json.sessionToken ?? null;
  console.log('login A', loginA.status, 'cookies', loginA.setCookies.length, 'sessionToken', tokenA ? 'OK' : 'MISSING');
  if (loginA.status !== 200 || !tokenA) {
    console.error('login A failed — sessionToken not returned');
    process.exit(1);
  }

  const loginB = await login(jarB, idB, secB);
  const tokenB = loginB.json.sessionToken ?? null;
  console.log('login B', loginB.status, 'sessionToken', tokenB ? 'OK' : 'MISSING');

  // Like A → B (bearer sessionToken — cookie may not survive proxy)
  r = await op(jarA, tokenA, {
    op: 'insert', table: 'likes', requesterId: idA,
    payload: { liker_id: idA, liked_id: idB, heart_type: 'red' },
  });
  console.log('like insert', r.status, r.json.error?.code ?? 'ok');
  if (r.status === 401 || r.status === 403) {
    console.error('like FAIL — auth broken', r.json);
    process.exit(1);
  }

  const u1 = idA < idB ? idA : idB;
  const u2 = idA < idB ? idB : idA;

  r = await op(jarA, tokenA, {
    op: 'insert', table: 'chats', requesterId: idA, single: true, selectAfterWrite: true,
    payload: { user1_id: u1, user2_id: u2 },
  });
  console.log('chat create A', r.status, r.json.data?.id ?? r.json.error?.message);

  r = await op(jarB, tokenB, {
    op: 'select', table: 'chats', requesterId: idB,
    filters: [{ type: 'or', expr: `user1_id.eq.${idB},user2_id.eq.${idB}` }],
  });
  const chatsB = Array.isArray(r.json.data) ? r.json.data : [];
  console.log('chat list B', r.status, 'count', chatsB.length);
  if (!chatsB.length) {
    console.error('chat FAIL — B cannot see chat', r.json);
    process.exit(1);
  }

  console.log('\n✅ chat + hearts E2E passed through', SITE);
}

main().catch(e => { console.error(e); process.exit(1); });
