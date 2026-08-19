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
 *   ENDURANCE_LOCK_FILE       default scripts/.soak-results/endurance.lock
 *   ENDURANCE_LOCK_STALE_MS   stale lock override (default 6h)
 *   ENDURANCE_FORCE_LOCK=1    run even if another lock is active (not recommended)
 *
 * Ops / recurrence:
 *   - SSE 401 @ 1h: proactive 80% token refresh + ensureConnected each cycle (mirrors localdb.ts).
 *   - admin_event_end_reset: wipes participant rows — auto re-provision soak users + chat (recoverContext).
 *   - Rate limit 429: run ONE endurance at a time (Render numInstances:1). Parallel soaks share NAT IP.
 *   - functions_locked: exit 2 at start; mid-run admin lock skips cycle (not fail streak).
 *   - Watchdog: scripts/endurance-watchdog.mjs restarts on crash/abort with remaining hours.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isOpFunctionsLocked } from './lib/functions-lock.mjs';
import { createPersonaPair, profilePayload } from './lib/test-personas.mjs';

const API = (process.env.API_BASE || 'https://binpc2.onrender.com/api/db').replace(/\/$/, '');
const HOURS = Number(process.env.ENDURANCE_HOURS || 5);
const INTERVAL_MS = Number(process.env.ENDURANCE_INTERVAL_MS || 5 * 60 * 1000);
const RUN_ID = `end_${Date.now()}`;
const METRICS = resolve(process.env.ENDURANCE_METRICS_FILE
  || `scripts/.soak-results/${RUN_ID}.jsonl`);
const LOCK_PATH = resolve(process.env.ENDURANCE_LOCK_FILE
  || 'scripts/.soak-results/endurance.lock');
const LOCK_STALE_MS = Number(process.env.ENDURANCE_LOCK_STALE_MS || 6 * 60 * 60 * 1000);
const FORCE_LOCK = process.env.ENDURANCE_FORCE_LOCK === '1';
const DEADLINE_AT = process.env.ENDURANCE_DEADLINE_AT
  ? Number(process.env.ENDURANCE_DEADLINE_AT)
  : null;
const DURATION_MS = HOURS * 60 * 60 * 1000;

// 앱 localdb.ts 와 동일 — 1h TTL, 80% 지점(720s 남을 때) 선제 갱신
const SSE_TOKEN_TTL_SEC = 3600;
const SSE_TOKEN_REFRESH_LEAD_SEC = Math.floor(SSE_TOKEN_TTL_SEC * 0.2);

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

async function fetchSseToken(jar, sessionToken, userId) {
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
  const token = json.token ?? json.sseToken ?? null;
  const expiresAt = json.expiresAt
    ?? (token && token.includes(':') ? parseInt(token.split(':')[0], 10) : 0)
    ?? (Math.floor(Date.now() / 1000) + SSE_TOKEN_TTL_SEC);
  return { status: res.status, token, expiresAt, json };
}

/** SSE 연결 — 401 시 on401Refresh 한 번 호출 후 재시도 */
function openSse(userId, token, on401Refresh) {
  const events = [];
  let buffer = '';
  const ac = new AbortController();

  const readLoop = async (tok, canRetry) => {
    const url = `${API}/events?userId=${encodeURIComponent(userId)}&token=${encodeURIComponent(tok)}`;
    const res = await fetch(url, { headers: { Accept: 'text/event-stream' }, signal: ac.signal });
    if (res.status === 401 && canRetry && on401Refresh) {
      const fresh = await on401Refresh();
      if (fresh?.token) return readLoop(fresh.token, false);
      throw new Error('SSE HTTP 401 after token refresh');
    }
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
  };

  const done = readLoop(token, true);

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

/** 장시간 SSE — expiresAt 추적, 80% TTL 선제 갱신, 갱신 시 스트림 재연결 */
function createSseSession(ctx, userKey) {
  let stream = null;
  let refreshTimer = null;
  let token = null;
  let expiresAt = 0;

  const jar = () => (userKey === 'A' ? ctx.jarA : ctx.jarB);
  const id = () => (userKey === 'A' ? ctx.idA : ctx.idB);
  const secret = () => (userKey === 'A' ? ctx.secA : ctx.secB);
  const getSession = () => (userKey === 'A' ? ctx.tokenA : ctx.tokenB);
  const setSession = (t) => { if (userKey === 'A') ctx.tokenA = t; else ctx.tokenB = t; };
  const setSse = (t, exp) => {
    token = t;
    expiresAt = exp;
    if (userKey === 'A') { ctx.sseTokA = t; ctx.sseExpA = exp; }
    else { ctx.sseTokB = t; ctx.sseExpB = exp; }
  };

  function clearRefreshTimer() {
    if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
  }

  function scheduleProactiveRefresh() {
    clearRefreshTimer();
    if (!expiresAt) return;
    const refreshInMs = (expiresAt - Math.floor(Date.now() / 1000) - SSE_TOKEN_REFRESH_LEAD_SEC) * 1000;
    const delay = Math.max(refreshInMs, 1_000);
    refreshTimer = setTimeout(() => { void refreshAndReconnect('proactive-80pct'); }, delay);
    log({
      type: 'sse-schedule',
      user: userKey,
      refreshInSec: Math.round(delay / 1000),
      expiresAt,
    });
  }

  async function fetchFreshToken() {
    let sessionToken = getSession();
    let r = await fetchSseToken(jar(), sessionToken, id());
    if (!r.token) {
      const lg = await login(jar(), id(), secret());
      sessionToken = lg.json.sessionToken;
      if (!sessionToken) throw new Error(`session refresh ${userKey}`);
      setSession(sessionToken);
      r = await fetchSseToken(jar(), sessionToken, id());
    }
    if (!r.token || !r.expiresAt) throw new Error(`sse token refresh ${userKey}`);
    setSse(r.token, r.expiresAt);
    return r;
  }

  async function refreshAndReconnect(reason) {
    clearRefreshTimer();
    if (stream) {
      stream.stop();
      stream.done.catch(() => {});
      stream = null;
    }
    const r = await fetchFreshToken();
    log({ type: 'sse-refresh', user: userKey, reason, expiresAt: r.expiresAt });
    stream = openSse(id(), r.token, () => fetchFreshToken());
    stream.done.catch(() => {}).finally(() => {
      if (!stopped && stream) {
        stream = null;
        log({ type: 'sse-drop', user: userKey, msg: 'connection closed — will reconnect next cycle' });
      }
    });
    scheduleProactiveRefresh();
    return stream;
  }

  let stopped = false;

  return {
    async start() {
      stopped = false;
      await refreshAndReconnect('initial');
      await sleep(600);
      return stream;
    },
    async ensureConnected() {
      if (stopped) return stream;
      const nowSec = Math.floor(Date.now() / 1000);
      const tokenStale = expiresAt && nowSec >= expiresAt - SSE_TOKEN_REFRESH_LEAD_SEC;
      if (!stream || tokenStale) {
        await refreshAndReconnect(tokenStale ? 'token-stale' : 'reconnect');
        await sleep(600);
      }
      return stream;
    },
    getStream: () => stream,
    getToken: () => token,
    stop() {
      stopped = true;
      clearRefreshTimer();
      if (stream) {
        stream.stop();
        stream.done.catch(() => {});
        stream = null;
      }
    },
  };
}

function acquireEnduranceLock() {
  mkdirSync(dirname(LOCK_PATH), { recursive: true });
  if (existsSync(LOCK_PATH) && !FORCE_LOCK) {
    try {
      const prev = JSON.parse(readFileSync(LOCK_PATH, 'utf8'));
      const age = Date.now() - Number(prev.startedAt || 0);
      if (age >= 0 && age < LOCK_STALE_MS && prev.pid !== process.pid) {
        log({
          type: 'abort',
          ok: false,
          msg: `Parallel endurance blocked — active runId=${prev.runId} pid=${prev.pid} (${Math.round(age / 60000)}m ago). Set ENDURANCE_FORCE_LOCK=1 to override.`,
        });
        process.exit(3);
      }
    } catch {
      /* corrupt lock — overwrite */
    }
  }
  writeFileSync(LOCK_PATH, JSON.stringify({
    runId: RUN_ID,
    pid: process.pid,
    startedAt: Date.now(),
    deadlineAt: DEADLINE_AT ?? (Date.now() + DURATION_MS),
    api: API,
    hours: HOURS,
    metrics: METRICS,
  }), 'utf8');
  log({ type: 'lock', msg: `RUN_ID=${RUN_ID} lock=${LOCK_PATH}` });
}

function releaseEnduranceLock() {
  try {
    if (!existsSync(LOCK_PATH)) return;
    const cur = JSON.parse(readFileSync(LOCK_PATH, 'utf8'));
    if (cur.runId === RUN_ID && cur.pid === process.pid) unlinkSync(LOCK_PATH);
  } catch { /* ignore */ }
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

function isRecoverableOpFailure({ status, json } = {}) {
  if (isOpFunctionsLocked({ status, json })) return false;
  if (status === 401) return true;
  if (status === 403 && json?.error?.code === 'FORBIDDEN') return true;
  if (status === 403) return true; // stale session / wiped chat after admin reset
  return false;
}

async function recoverContext(ctx, sseB) {
  log({ type: 'recover', phase: 'start', msg: 're-provisioning soak users (admin reset or stale session)' });
  sseB.stop();
  const fresh = await setupUsers();
  Object.assign(ctx, fresh);
  await sseB.start();
  log({
    type: 'recover',
    phase: 'done',
    ok: true,
    idA: ctx.idA,
    chatId: ctx.chatId,
    msg: 'soak users restored — retrying cycle',
  });
}

async function setupUsers() {
  const idA = crypto.randomUUID();
  const idB = crypto.randomUUID();
  const secA = crypto.randomUUID();
  const secB = crypto.randomUUID();
  const [personaA, personaB] = createPersonaPair();
  const jarA = new Map();
  const jarB = new Map();

  for (const [jar, id, persona, sec] of [[jarA, idA, personaA, secA], [jarB, idB, personaB, secB]]) {
    const r = await op(jar, null, {
      op: 'insert', table: 'profiles', single: true, selectAfterWrite: true,
      payload: profilePayload({ id, secret: sec, persona }),
    });
    if (r.status !== 200 || !r.json.data?.id) throw new Error(`register ${persona.nickname} ${r.status}`);
  }

  const loginA = await login(jarA, idA, secA);
  const loginB = await login(jarB, idB, secB);
  const tokenA = loginA.json.sessionToken;
  const tokenB = loginB.json.sessionToken;
  if (!tokenA || !tokenB) throw new Error('sessionToken missing');

  const tokA = await fetchSseToken(jarA, tokenA, idA);
  const tokB = await fetchSseToken(jarB, tokenB, idB);
  if (!tokA.token || !tokB.token) throw new Error('sse token missing');

  const u1 = idA < idB ? idA : idB;
  const u2 = idA < idB ? idB : idA;
  const chatR = await op(jarA, tokenA, {
    op: 'insert', table: 'chats', requesterId: idA, single: true, selectAfterWrite: true,
    payload: { user1_id: u1, user2_id: u2 },
  });
  const chatId = chatR.json.data?.id;
  if (!chatId) throw new Error('chat create failed');

  return {
    idA, idB, secA, secB, jarA, jarB, tokenA, tokenB,
    sseTokA: tokA.token, sseTokB: tokB.token,
    sseExpA: tokA.expiresAt, sseExpB: tokB.expiresAt,
    chatId,
  };
}

async function runCycle(ctx, cycle, sseB) {
  const { idA, idB, jarA, jarB, tokenA, tokenB, chatId } = ctx;
  const msgBody = `end-${RUN_ID}-c${cycle}-${Date.now()}`;
  const fails = [];

  await sseB.ensureConnected();
  const streamB = sseB.getStream();

  const msgR = await op(jarA, tokenA, {
    op: 'insert', table: 'messages', requesterId: idA, single: true, selectAfterWrite: true,
    payload: { chat_id: chatId, sender_id: idA, content: msgBody, client_id: crypto.randomUUID() },
  });
  if (isOpFunctionsLocked(msgR)) {
    log({ type: 'skip', ok: true, msg: 'FUNCTIONS_LOCKED mid-run — skipping cycle (not fail streak)' });
    return { ok: false, locked: true, recoverable: false, fails: ['FUNCTIONS_LOCKED'] };
  }
  if (msgR.status !== 200 || !msgR.json.data?.id) {
    fails.push(`msg insert ${msgR.status}`);
    if (isRecoverableOpFailure(msgR)) {
      return { ok: false, locked: false, recoverable: true, fails };
    }
  }

  const msgEvt = streamB
    ? await streamB.waitFor(
      (e) => e.type === 'change' && e.table === 'messages' && e.event === 'INSERT' && e.newRow?.content === msgBody,
    )
    : null;
  if (!msgEvt) fails.push('msg SSE miss');

  const selR = await op(jarB, tokenB, {
    op: 'select', table: 'messages', requesterId: idB,
    filters: [{ type: 'eq', col: 'chat_id', val: chatId }],
  });
  const msgs = Array.isArray(selR.json.data) ? selR.json.data : [];
  if (!msgs.some((m) => m.content === msgBody)) fails.push('msg DB miss');

  const ok = fails.length === 0;
  const recoverable = !ok && (
    isRecoverableOpFailure(msgR)
    || fails.some((f) => /403|401/.test(f))
    || (selR.status !== 200 && isRecoverableOpFailure(selR))
  );
  log({
    type: 'cycle',
    cycle,
    ok,
    fails,
    recoverable,
    msgCount: msgs.length,
    sseExpB: ctx.sseExpB,
    elapsedMs: Date.now() - ctx.startedAt,
  });
  return { ok, locked: false, recoverable, fails };
}

async function main() {
  console.log(`Endurance: ${HOURS}h, interval ${INTERVAL_MS}ms, API ${API}`);
  console.log(`Metrics: ${METRICS}`);
  console.log(`RUN_ID=${RUN_ID} — do not run parallel endurance (429 / shared NAT)`);
  console.log(`SSE proactive refresh at 80% TTL (${SSE_TOKEN_REFRESH_LEAD_SEC}s lead)`);
  acquireEnduranceLock();
  await checkFunctionsUnlocked();

  const ctx = await setupUsers();
  ctx.startedAt = Date.now();
  const deadline = DEADLINE_AT ?? (Date.now() + DURATION_MS);
  log({ type: 'start', hours: HOURS, intervalMs: INTERVAL_MS, sseExpB: ctx.sseExpB, deadlineAt: deadline });

  const sseB = createSseSession(ctx, 'B');
  await sseB.start();

  let cycle = 0;
  let failStreak = 0;

  try {
    while (Date.now() < deadline) {
      cycle += 1;
      let result = await runCycle(ctx, cycle, sseB);
      if (result.locked) {
        // Admin locked mid-run — skip cycle, do not abort soak or increment fail streak
      } else if (!result.ok) {
        if (result.recoverable) {
          try {
            await recoverContext(ctx, sseB);
            cycle -= 1;
            failStreak = 0;
            continue;
          } catch (e) {
            log({
              type: 'recover',
              ok: false,
              msg: e instanceof Error ? e.message : String(e),
            });
          }
        }
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
  } finally {
    sseB.stop();
    releaseEnduranceLock();
  }
}

main().catch((e) => {
  console.error(e);
  log({ type: 'fatal', ok: false, msg: e instanceof Error ? e.message : String(e) });
  process.exit(1);
});
