/**
 * Shared fetch-based E2E helpers (Netlify /op + Render SSE).
 * Mirrors app localdb.ts: HTTP via proxy, SSE direct to Render.
 */
import { createPersonaPair, profilePayload } from './test-personas.mjs';

export const SITE = (process.env.NETLIFY_URL || 'https://binpc2.netlify.app').replace(/\/$/, '');
export const API = (process.env.API_BASE || `${SITE}/api/db`).replace(/\/$/, '');
export const SSE_ORIGIN = (process.env.SSE_ORIGIN || process.env.VITE_SSE_ORIGIN || 'https://binpc2.onrender.com').replace(/\/$/, '');
export const SSE_API = `${SSE_ORIGIN}/api/db`;

export function parseCookies(setCookieHeaders) {
  const jar = new Map();
  for (const h of setCookieHeaders) {
    const part = h.split(';')[0];
    const i = part.indexOf('=');
    if (i > 0) jar.set(part.slice(0, i).trim(), part.slice(i + 1));
  }
  return jar;
}

export function cookieHeader(jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

export async function op(jar, sessionToken, body) {
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

export async function login(jar, userId, deviceSecret) {
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

export async function sseToken(jar, sessionToken, userId) {
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

/** Fetch-based SSE reader (Node). Supports lastEventId for reconnect ring replay. */
export function openSse(userId, token, { lastEventId = '' } = {}) {
  const params = new URLSearchParams({
    userId,
    token,
  });
  if (lastEventId) params.set('lastEventId', lastEventId);
  const url = `${SSE_API}/events?${params.toString()}`;
  const events = [];
  let buffer = '';
  let lastId = lastEventId;
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
        const lines = block.split('\n');
        const idLine = lines.find((l) => l.startsWith('id:'));
        if (idLine) lastId = idLine.slice(3).trim();
        const dataLine = lines.find((l) => l.startsWith('data:'));
        if (!dataLine) continue;
        try {
          const data = JSON.parse(dataLine.slice(5).trim());
          events.push({ data, lastEventId: lastId });
        } catch { /* ping or partial */ }
      }
    }
  })();

  return {
    events,
    get lastEventId() { return lastId; },
    stop: () => ac.abort(),
    waitFor: async (pred, ms = 15_000) => {
      const start = Date.now();
      while (Date.now() - start < ms) {
        const hit = events.find((e) => pred(e.data, e));
        if (hit) return hit;
        await new Promise((r) => setTimeout(r, 100));
      }
      return null;
    },
    done,
  };
}

export function chatPairIds(idA, idB) {
  const u1 = idA < idB ? idA : idB;
  const u2 = idA < idB ? idB : idA;
  return { u1, u2 };
}

/** Register + login two personas; returns tokens and jars. */
export async function setupTwoUsers() {
  const idA = crypto.randomUUID();
  const idB = crypto.randomUUID();
  const secA = crypto.randomUUID();
  const secB = crypto.randomUUID();
  const [personaA, personaB] = createPersonaPair();
  const jarA = new Map();
  const jarB = new Map();
  const fails = [];

  let r = await op(jarA, null, {
    op: 'insert', table: 'profiles', single: true, selectAfterWrite: true,
    payload: profilePayload({ id: idA, secret: secA, persona: personaA }),
  });
  if (r.status !== 200 || !r.json.data?.id) fails.push(`register A ${r.status}`);

  r = await op(jarB, null, {
    op: 'insert', table: 'profiles', single: true, selectAfterWrite: true,
    payload: profilePayload({ id: idB, secret: secB, persona: personaB }),
  });
  if (r.status !== 200 || !r.json.data?.id) fails.push(`register B ${r.status}`);

  const loginA = await login(jarA, idA, secA);
  const loginB = await login(jarB, idB, secB);
  const tokenA = loginA.json.sessionToken;
  const tokenB = loginB.json.sessionToken;
  if (!tokenA || !tokenB) fails.push('sessionToken missing');

  const sseA = await sseToken(jarA, tokenA, idA);
  const sseB = await sseToken(jarB, tokenB, idB);
  if (!sseA.token || !sseB.token) fails.push(`sse token A=${!!sseA.token} B=${!!sseB.token}`);

  return {
    fails,
    idA, idB, secA, secB, personaA, personaB,
    jarA, jarB, tokenA, tokenB,
    sseTokenA: sseA.token, sseTokenB: sseB.token,
  };
}
