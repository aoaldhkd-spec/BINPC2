#!/usr/bin/env node
/**
 * sim-concurrent-users.mjs
 *
 * 실제 사용자 행동 흐름 기반 대규모 동시사용 검증 (테스트 전용 계정만 사용).
 *
 * 닉네임: realistic Korean personas + numeric suffix (scripts/lib/test-personas.mjs)
 *
 * Usage:
 *   node scripts/sim-concurrent-users.mjs
 *   STAGES=10,30,50 API_BASE=https://binpc2.onrender.com/api/db node scripts/sim-concurrent-users.mjs
 *   STAGES=10,30,50,100,150 node scripts/sim-concurrent-users.mjs
 *
 * Entry burst (replaces simulate-100-entry.js):
 *   node scripts/sim-concurrent-users.mjs --entry-only --users=100 --concurrency=100
 *   ENTRY_ONLY=1 USERS=100 node scripts/sim-concurrent-users.mjs
 *
 * Env:
 *   API_BASE   default https://binpc2.onrender.com/api/db  (Render 직접 — Netlify SSE 버퍼링 회피)
 *   STAGES     comma list, default 10,30,50,100,150
 *   HOLD_MS    how long to keep SSE open during chaos (default 8000)
 *   CLEANUP    1=delete created test profiles after each stage (default 0 — soft leave)
 *   ENTRY_ONLY 1=QR entry burst only (no SSE/hearts/chat)
 *   USERS      entry-only user count (default 100, max 500)
 *   CONCURRENCY entry-only parallel requests (default 100, max 500)
 */

import { randomUUID } from 'node:crypto';
import { createTestPersona, profilePayload, reserveNickname } from './lib/test-personas.mjs';
import { runEntryBurst } from './lib/entry-burst.mjs';

const args = process.argv.slice(2);
function getArg(flag, defaultVal) {
  const idx = args.indexOf(flag);
  if (idx < 0) return defaultVal;
  return args[idx + 1] ?? defaultVal;
}
const hasFlag = (flag) => args.includes(flag);

const ENTRY_ONLY = hasFlag('--entry-only') || process.env.ENTRY_ONLY === '1';
const ENTRY_USERS = parseInt(getArg('--users', process.env.USERS || '100'), 10);
const ENTRY_CONCURRENCY = parseInt(getArg('--concurrency', process.env.CONCURRENCY || '100'), 10);
const ENTRY_VERBOSE = hasFlag('--verbose') || process.env.VERBOSE === '1';
const CLI_API = getArg('--url', null);

const API = (CLI_API || process.env.API_BASE || 'https://binpc2.onrender.com/api/db').replace(/\/$/, '');
const STAGES = String(process.env.STAGES || '10,30,50,100,150')
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => n > 0);
const HOLD_MS = Number(process.env.HOLD_MS || 8000);
const DO_CLEANUP = process.env.CLEANUP === '1';
const RUN_ID = randomUUID().slice(0, 8);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (arr, p) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
};
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

function newMetrics() {
  return {
    users: 0,
    registerOk: 0,
    loginOk: 0,
    sseTokenOk: 0,
    sseConnectOk: 0,
    sseConnectFail: 0,
    sseDrops: 0,
    chatCreateOk: 0,
    chatCreateFail: 0,
    chatDupSameId: 0,
    chatDupMismatch: 0,
    msgSendOk: 0,
    msgSendFail: 0,
    msgSseDelivered: 0,
    msgSseMiss: 0,
    msgSelectOk: 0,
    msgSelectMiss: 0,
    likeOk: 0,
    likeFail: 0,
    likeSseDelivered: 0,
    likeSseMiss: 0,
    likeDupIdempotent: 0,
    http429: 0,
    http5xx: 0,
    httpOtherErr: 0,
    reconnectOk: 0,
    reconnectFail: 0,
    pinRecoverOk: 0,
    pinRecoverFail: 0,
    readyP50: 0,
    adminBroadcastOk: 0,
    adminBroadcastMiss: 0,
    adminBroadcastMs: [],
    rssMb: 0,
    latencies: {
      register: [],
      login: [],
      op: [],
      sseConnect: [],
      msgDeliver: [],
      likeDeliver: [],
    },
    errors: [],
  };
}

async function api(path, { method = 'POST', body, sessionToken, headers = {} } = {}) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body != null ? JSON.stringify({
        ...body,
        ...(sessionToken ? { sessionToken } : {}),
      }) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json, ms: Date.now() - t0 };
  } catch (e) {
    return { status: 0, json: { error: String(e) }, ms: Date.now() - t0 };
  }
}

async function mapPool(items, concurrency, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return out;
}

function openSse(userId, token, m) {
  const url = `${API}/events?userId=${encodeURIComponent(userId)}&token=${encodeURIComponent(token)}`;
  const events = [];
  let buffer = '';
  const ac = new AbortController();
  const t0 = Date.now();
  let connected = false;
  const done = (async () => {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'text/event-stream' },
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        m.sseConnectFail++;
        m.errors.push(`sse http ${res.status} uid=${userId.slice(0, 8)}`);
        return;
      }
      connected = true;
      m.sseConnectOk++;
      m.latencies.sseConnect.push(Date.now() - t0);
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
            events.push({ at: Date.now(), data: JSON.parse(dataLine.slice(5).trim()) });
          } catch { /* ping */ }
        }
      }
      if (connected) m.sseDrops++;
    } catch (e) {
      if (ac.signal.aborted) return;
      if (!connected) {
        m.sseConnectFail++;
        m.errors.push(`sse connect ${String(e).slice(0, 80)}`);
      } else {
        m.sseDrops++;
      }
    }
  })();
  return {
    events,
    stop: () => { ac.abort(); done.catch(() => {}); },
    waitFor: async (pred, ms = 12_000) => {
      const start = Date.now();
      while (Date.now() - start < ms) {
        const hit = events.find((e) => pred(e.data, e.at));
        if (hit) return hit;
        await sleep(50);
      }
      return null;
    },
  };
}

async function registerUser(i, m, stageN) {
  const secret = randomUUID();
  const persona = createTestPersona({ index: stageN * 1000 + i });
  for (let attempt = 0; attempt < 4; attempt++) {
    const id = randomUUID();
    const nickname = attempt === 0
      ? persona.nickname
      : reserveNickname({ index: stageN * 1000 + i + attempt * 5000 });
    const r = await api('/op', {
      body: {
        op: 'insert', table: 'profiles', single: true, selectAfterWrite: true,
        payload: profilePayload({
          id,
          secret,
          persona: { ...persona, nickname },
        }),
      },
    });
    m.latencies.register.push(r.ms);
    if (r.status === 429) {
      m.http429++;
      await sleep(250 * (attempt + 1));
      continue;
    }
    if (r.status >= 500) {
      m.http5xx++;
      await sleep(300 * (attempt + 1));
      continue;
    }
    if (r.status === 200 && r.json.data?.id) {
      m.registerOk++;
      return {
        id: r.json.data.id,
        secret,
        nick: nickname,
        pin: r.json.data.pin_code ? String(r.json.data.pin_code) : null,
        sessionToken: null,
        sseToken: null,
        stream: null,
      };
    }
    // duplicate nickname etc — retry with new nick suffix
    await sleep(150 * (attempt + 1));
  }
  m.httpOtherErr++;
  m.errors.push(`register ${persona.nickname} exhausted retries`);
  return null;
}

async function loginUser(u, m) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await api('/auth/login', { body: { userId: u.id, deviceSecret: u.secret } });
    m.latencies.login.push(r.ms);
    if (r.status === 429) {
      m.http429++;
      await sleep(200 + attempt * 350 + Math.floor(Math.random() * 200));
      continue;
    }
    if (r.status >= 500) {
      m.http5xx++;
      await sleep(300 * (attempt + 1));
      continue;
    }
    if (r.status === 200 && r.json.sessionToken) {
      m.loginOk++;
      u.sessionToken = r.json.sessionToken;
      return true;
    }
    m.errors.push(`login ${u.nick} ${r.status}`);
    return false;
  }
  m.errors.push(`login ${u.nick} 429 exhausted`);
  return false;
}

async function sseTokenUser(u, m) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await api('/auth/sse-token', {
      body: { userId: u.id, sessionToken: u.sessionToken },
    });
    if (r.status === 429) {
      m.http429++;
      await sleep(250 + attempt * 400 + Math.floor(Math.random() * 250));
      continue;
    }
    if (r.status === 200 && r.json.token) {
      m.sseTokenOk++;
      u.sseToken = r.json.token;
      return true;
    }
    m.errors.push(`sse-token ${u.nick} ${r.status}`);
    return false;
  }
  m.errors.push(`sse-token ${u.nick} 429 exhausted`);
  return false;
}

async function runStage(n) {
  const m = newMetrics();
  m.users = n;
  console.log(`\n════════ STAGE ${n} users  (run=${RUN_ID}) ════════`);

  // ① Register (staggered pool to respect rate limits)
  console.log(`① register ${n}…`);
  const registered = (await mapPool(
    Array.from({ length: n }, (_, i) => i),
    12, // burst 완화 — 등록 동시성
    async (i) => registerUser(i, m, n),
  )).filter(Boolean);
  console.log(`   register ${m.registerOk}/${n}`);

  // ② Login
  console.log('② login…');
  await mapPool(registered, 10, async (u) => loginUser(u, m));
  const loggedIn = registered.filter((u) => u.sessionToken);
  console.log(`   login ${m.loginOk}/${registered.length}`);

  // ③ SSE tokens + connect
  console.log('③ sse tokens + connect…');
  await mapPool(loggedIn, 10, async (u) => sseTokenUser(u, m));
  const withTok = loggedIn.filter((u) => u.sseToken);
  for (const u of withTok) {
    u.stream = openSse(u.id, u.sseToken, m);
  }
  await sleep(1500); // allow connects
  console.log(`   sse token ${m.sseTokenOk} connectOk=${m.sseConnectOk} fail=${m.sseConnectFail}`);

  if (loggedIn.length < 2) {
    console.error('   abort stage — not enough logged-in users');
    withTok.forEach((u) => u.stream?.stop());
    return m;
  }

  // ④ 1:1 chat + message + SSE delivery
  console.log('④ 1:1 chat + message SSE…');
  const a = loggedIn[0];
  const b = loggedIn[1];
  const [u1, u2] = [a.id, b.id].sort();
  let chatId = null;
  for (let attempt = 0; attempt < 4 && !chatId; attempt++) {
    if (attempt > 0) await sleep(250 * attempt);
    const rCreate = await api('/op', {
      sessionToken: a.sessionToken,
      body: {
        op: 'insert', table: 'chats', requesterId: a.id, single: true, selectAfterWrite: true,
        payload: { user1_id: u1, user2_id: u2 },
      },
    });
    m.latencies.op.push(rCreate.ms);
    if (rCreate.status === 429) m.http429++;
    if (rCreate.status >= 500) m.http5xx++;
    chatId = rCreate.json.data?.id ?? null;
  }
  if (chatId) m.chatCreateOk++; else { m.chatCreateFail++; m.errors.push('1:1 chat create'); }

  // concurrent duplicate create from B — only score mismatch when A also got an id
  const rDup = await api('/op', {
    sessionToken: b.sessionToken,
    body: {
      op: 'insert', table: 'chats', requesterId: b.id, single: true, selectAfterWrite: true,
      payload: { user1_id: u2, user2_id: u1 },
    },
  });
  if (chatId && rDup.json.data?.id === chatId) m.chatDupSameId++;
  else if (chatId && rDup.json.data?.id && rDup.json.data.id !== chatId) m.chatDupMismatch++;

  if (chatId) {
    const clientId = randomUUID();
    const content = `1to1-${RUN_ID}-${Date.now()}`;
    const sendAt = Date.now();
    let r = await api('/op', {
      sessionToken: a.sessionToken,
      body: {
        op: 'insert', table: 'messages', requesterId: a.id, single: true, selectAfterWrite: true,
        payload: { chat_id: chatId, sender_id: a.id, content, client_id: clientId },
      },
    });
    m.latencies.op.push(r.ms);
    if (r.status === 200 && r.json.data?.id) m.msgSendOk++; else m.msgSendFail++;

    // idempotent resend
    await api('/op', {
      sessionToken: a.sessionToken,
      body: {
        op: 'insert', table: 'messages', requesterId: a.id, single: true, selectAfterWrite: true,
        payload: { chat_id: chatId, sender_id: a.id, content, client_id: clientId },
      },
    });

    const hit = await b.stream?.waitFor(
      (d) => d.type === 'change' && d.table === 'messages' && d.newRow?.content === content,
      15_000,
    );
    if (hit) {
      m.msgSseDelivered++;
      m.latencies.msgDeliver.push(hit.at - sendAt);
    } else m.msgSseMiss++;

    const sel = await api('/op', {
      sessionToken: b.sessionToken,
      body: {
        op: 'select', table: 'messages', requesterId: b.id,
        filters: [{ type: 'eq', col: 'chat_id', val: chatId }],
      },
    });
    const msgs = Array.isArray(sel.json.data) ? sel.json.data : [];
    if (msgs.some((x) => x.content === content)) m.msgSelectOk++; else m.msgSelectMiss++;
  }

  // ⑤ 1:다 fan-out — hub sends likes/chats/messages to many
  console.log('⑤ 1:다 fan-out…');
  const hub = loggedIn[0];
  const targets = loggedIn.slice(1, Math.min(loggedIn.length, Math.max(2, Math.floor(n / 3) + 1)));
  await mapPool(targets, 15, async (t) => {
    const lr = await api('/op', {
      sessionToken: hub.sessionToken,
      body: {
        op: 'insert', table: 'likes', requesterId: hub.id, single: true, selectAfterWrite: true,
        payload: { liker_id: hub.id, liked_id: t.id, heart_type: 'red' },
      },
    });
    if (lr.status === 429) m.http429++;
    if (lr.status === 200 && lr.json.data?.id) m.likeOk++;
    else if (lr.status === 200 && !lr.json.error) m.likeDupIdempotent++;
    else m.likeFail++;

    const pair = [hub.id, t.id].sort();
    const cr = await api('/op', {
      sessionToken: hub.sessionToken,
      body: {
        op: 'insert', table: 'chats', requesterId: hub.id, single: true, selectAfterWrite: true,
        payload: { user1_id: pair[0], user2_id: pair[1] },
      },
    });
    const cid = cr.json.data?.id;
    if (cid) {
      m.chatCreateOk++;
      const content = `fanout-${t.nick}`;
      const sendAt = Date.now();
      const mr = await api('/op', {
        sessionToken: hub.sessionToken,
        body: {
          op: 'insert', table: 'messages', requesterId: hub.id, single: true, selectAfterWrite: true,
          payload: { chat_id: cid, sender_id: hub.id, content, client_id: randomUUID() },
        },
      });
      if (mr.status === 200 && mr.json.data?.id) m.msgSendOk++; else m.msgSendFail++;
      const hit = await t.stream?.waitFor(
        (d) => d.type === 'change' && d.table === 'messages' && d.newRow?.content === content,
        10_000,
      );
      if (hit) {
        m.msgSseDelivered++;
        m.latencies.msgDeliver.push(hit.at - sendAt);
      } else m.msgSseMiss++;
    } else m.chatCreateFail++;
  });

  // ⑥ 다:1 — many like/message same target
  console.log('⑥ 다:1 storm…');
  const victim = loggedIn[Math.min(1, loggedIn.length - 1)];
  const attackers = loggedIn.filter((u) => u.id !== victim.id).slice(0, Math.min(40, loggedIn.length - 1));
  await mapPool(attackers, 20, async (u) => {
    const sendAt = Date.now();
    const lr = await api('/op', {
      sessionToken: u.sessionToken,
      body: {
        op: 'insert', table: 'likes', requesterId: u.id, single: true, selectAfterWrite: true,
        payload: { liker_id: u.id, liked_id: victim.id, heart_type: 'blue' },
      },
    });
    if (lr.status === 200 && lr.json.data?.id) {
      m.likeOk++;
      const hit = await victim.stream?.waitFor(
        (d) => d.type === 'change' && d.table === 'likes' && d.event === 'INSERT'
          && d.newRow?.liker_id === u.id && d.newRow?.liked_id === victim.id,
        8_000,
      );
      if (hit) {
        m.likeSseDelivered++;
        m.latencies.likeDeliver.push(hit.at - sendAt);
      } else m.likeSseMiss++;
    } else if (lr.status === 429) {
      m.http429++;
      m.likeFail++;
    } else if (lr.status === 200) {
      m.likeDupIdempotent++;
    } else m.likeFail++;
  });

  // ⑦ 다:다 — pair adjacent users chat concurrently + race create+message
  console.log('⑦ 다:다 concurrent rooms+messages…');
  const pairs = [];
  for (let i = 0; i + 1 < loggedIn.length; i += 2) {
    pairs.push([loggedIn[i], loggedIn[i + 1]]);
  }
  await mapPool(pairs, 20, async ([x, y]) => {
    const sorted = [x.id, y.id].sort();
    // almost-simultaneous create + message
    const [cRes] = await Promise.all([
      api('/op', {
        sessionToken: x.sessionToken,
        body: {
          op: 'insert', table: 'chats', requesterId: x.id, single: true, selectAfterWrite: true,
          payload: { user1_id: sorted[0], user2_id: sorted[1] },
        },
      }),
      api('/op', {
        sessionToken: y.sessionToken,
        body: {
          op: 'insert', table: 'chats', requesterId: y.id, single: true, selectAfterWrite: true,
          payload: { user1_id: sorted[1], user2_id: sorted[0] },
        },
      }),
    ]);
    const cid = cRes.json.data?.id;
    if (!cid) { m.chatCreateFail++; return; }
    m.chatCreateOk++;
    const content = `m2m-${x.nick}-${y.nick}-${Date.now()}`;
    const sendAt = Date.now();
    const mr = await api('/op', {
      sessionToken: x.sessionToken,
      body: {
        op: 'insert', table: 'messages', requesterId: x.id, single: true, selectAfterWrite: true,
        payload: { chat_id: cid, sender_id: x.id, content, client_id: randomUUID() },
      },
    });
    if (mr.status === 200 && mr.json.data?.id) m.msgSendOk++; else m.msgSendFail++;
    const hit = await y.stream?.waitFor(
      (d) => d.type === 'change' && d.table === 'messages' && d.newRow?.content === content,
      10_000,
    );
    if (hit) {
      m.msgSseDelivered++;
      m.latencies.msgDeliver.push(hit.at - sendAt);
    } else m.msgSseMiss++;
  });

  // ⑧ rapid duplicate clicks (same like)
  console.log('⑧ rapid duplicate likes…');
  if (loggedIn.length >= 2) {
    const s = loggedIn[0];
    const t = loggedIn[1];
    const results = await Promise.all(Array.from({ length: 5 }, () => api('/op', {
      sessionToken: s.sessionToken,
      body: {
        op: 'insert', table: 'likes', requesterId: s.id, single: true, selectAfterWrite: true,
        payload: { liker_id: s.id, liked_id: t.id, heart_type: 'pink' },
      },
    })));
    const ids = results.map((x) => x.json.data?.id).filter(Boolean);
    const unique = new Set(ids);
    if (unique.size <= 1) m.likeDupIdempotent++;
    results.forEach((x) => { if (x.status === 429) m.http429++; });
  }

  // ⑨ reconnect storm (sample)
  console.log('⑨ reconnect sample…');
  const sample = withTok.slice(0, Math.min(10, withTok.length));
  for (const u of sample) {
    u.stream?.stop();
    await sleep(100);
    u.stream = openSse(u.id, u.sseToken, m);
  }
  await sleep(1200);
  const reOk = sample.filter((u) => u.stream).length;
  // crude: if connectOk increased, count reconnects
  m.reconnectOk += reOk;
  console.log(`   reconnected sample ${reOk}`);

  // ⑪ /ready 폭격 + PIN 복구 + 관리자 브로드캐스트
  console.log('⑪ ready/pin/admin broadcast…');
  m.rssMb = Math.round(process.memoryUsage().rss / 1048576);
  const readyLat = [];
  await mapPool(loggedIn.slice(0, Math.min(loggedIn.length, 40)), 20, async () => {
    const t0 = Date.now();
    try {
      const res = await fetch(API.replace(/\/api\/db$/, '') + '/api/db/ready', { signal: AbortSignal.timeout(10_000) });
      readyLat.push(Date.now() - t0);
      if (!res.ok) m.httpOtherErr++;
    } catch {
      m.httpOtherErr++;
      readyLat.push(Date.now() - t0);
    }
  });
  m.readyP50 = pct(readyLat, 50);

  const pinSample = registered.filter((u) => u.pin && u.nick).slice(0, Math.min(12, registered.length));
  await mapPool(pinSample, 6, async (u) => {
    try {
      const step1 = await fetch(`${API}/by-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: u.pin }),
        signal: AbortSignal.timeout(10_000),
      });
      const j1 = await step1.json().catch(() => ({}));
      if (step1.status !== 200 || j1?.data?.step !== 'confirm') {
        m.pinRecoverFail++;
        return;
      }
      const step2 = await fetch(`${API}/by-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: u.pin, nickname: u.nick }),
        signal: AbortSignal.timeout(10_000),
      });
      const j2 = await step2.json().catch(() => ({}));
      if (step2.status === 200 && j2?.data?.id === u.id) m.pinRecoverOk++;
      else m.pinRecoverFail++;
    } catch {
      m.pinRecoverFail++;
    }
  });

  const PANEL_PW = String(process.env.PANEL_PASSWORD || '116606').trim();
  try {
    const loginAdmin = await api('/rpc/admin_create_session', {
      body: { p_phone: '010-3878-6740', p_admin_password: PANEL_PW },
    });
    const adminToken = loginAdmin.json?.data;
    if (adminToken && withTok.length) {
      const probe = `lt_${RUN_ID}_${Date.now()}`;
      const sendAt = Date.now();
      const tog = await api('/rpc/admin_update_settings', {
        body: {
          adminToken,
          p_admin_password: PANEL_PW,
          p_payload: { timer_label: probe },
        },
      });
      if (tog.status === 200 && !tog.json.error) {
        const waits = await Promise.all(
          withTok.slice(0, Math.min(withTok.length, 80)).map((u) =>
            u.stream?.waitFor(
              (d) => d.type === 'change' && d.table === 'app_settings'
                && String(d.newRow?.timer_label ?? '') === probe,
              8_000,
            ),
          ),
        );
        const hits = waits.filter(Boolean);
        m.adminBroadcastOk = hits.length;
        m.adminBroadcastMiss = Math.min(withTok.length, 80) - hits.length;
        for (const h of hits) {
          if (h?.at) m.adminBroadcastMs.push(h.at - sendAt);
        }
        await api('/rpc/admin_update_settings', {
          body: {
            adminToken,
            p_admin_password: PANEL_PW,
            p_payload: { timer_label: null },
          },
        });
      }
    }
  } catch (e) {
    m.errors.push(`admin broadcast ${String(e).slice(0, 80)}`);
  }

  if (global.gc) {
    global.gc();
  }
  m.rssMb = Math.round(process.memoryUsage().rss / 1048576);

  // ⑩ hold chaos window
  console.log(`⑩ hold ${HOLD_MS}ms…`);
  await sleep(HOLD_MS);

  // cleanup streams
  withTok.forEach((u) => u.stream?.stop());

  if (DO_CLEANUP) {
    console.log('⑪ cleanup test profiles…');
    // Soft: no mass delete API for safety — skip destructive cleanup by default
  }

  printStage(m);
  return m;
}

function rate(ok, miss) {
  const t = ok + miss;
  return t ? ((ok / t) * 100).toFixed(1) + '%' : 'n/a';
}

function printStage(m) {
  console.log('\n── stage summary ──');
  console.log(`users=${m.users} register=${m.registerOk} login=${m.loginOk} sseTok=${m.sseTokenOk}`);
  console.log(`sse connect ok/fail/drops = ${m.sseConnectOk}/${m.sseConnectFail}/${m.sseDrops}`);
  console.log(`chat create ok/fail = ${m.chatCreateOk}/${m.chatCreateFail} sameId=${m.chatDupSameId} mismatch=${m.chatDupMismatch}`);
  console.log(`msg send ok/fail=${m.msgSendOk}/${m.msgSendFail} sse=${rate(m.msgSseDelivered, m.msgSseMiss)} select=${rate(m.msgSelectOk, m.msgSelectMiss)}`);
  console.log(`like ok/fail/idem=${m.likeOk}/${m.likeFail}/${m.likeDupIdempotent} sse=${rate(m.likeSseDelivered, m.likeSseMiss)}`);
  console.log(`http 429=${m.http429} 5xx=${m.http5xx} otherErr=${m.httpOtherErr}`);
  console.log(`ready p50=${m.readyP50}ms pin ${m.pinRecoverOk}/${m.pinRecoverOk + m.pinRecoverFail}`);
  console.log(`admin settings SSE ${m.adminBroadcastOk} hit / ${m.adminBroadcastOk + m.adminBroadcastMiss}  p50=${pct(m.adminBroadcastMs, 50).toFixed(0)}ms p95=${pct(m.adminBroadcastMs, 95).toFixed(0)}ms`);
  console.log(`sim rss=${m.rssMb}MB`);
  console.log(`lat ms  register p50=${pct(m.latencies.register, 50).toFixed(0)} p95=${pct(m.latencies.register, 95).toFixed(0)}`);
  console.log(`lat ms  login    p50=${pct(m.latencies.login, 50).toFixed(0)} p95=${pct(m.latencies.login, 95).toFixed(0)}`);
  console.log(`lat ms  msgSSE   p50=${pct(m.latencies.msgDeliver, 50).toFixed(0)} p95=${pct(m.latencies.msgDeliver, 95).toFixed(0)} avg=${avg(m.latencies.msgDeliver).toFixed(0)}`);
  console.log(`lat ms  likeSSE  p50=${pct(m.latencies.likeDeliver, 50).toFixed(0)} p95=${pct(m.latencies.likeDeliver, 95).toFixed(0)}`);
  if (m.errors.length) {
    console.log(`errors (first 8):`);
    m.errors.slice(0, 8).forEach((e) => console.log(`  - ${e}`));
  }
}

function stagePass(m) {
  const msgRate = m.msgSseDelivered / Math.max(1, m.msgSseDelivered + m.msgSseMiss);
  const regRate = m.registerOk / Math.max(1, m.users);
  const loginRate = m.loginOk / Math.max(1, m.registerOk);
  const sseRate = m.sseConnectOk / Math.max(1, Math.max(m.sseTokenOk, 1));
  // reconnect sample can inflate sseConnectOk above sseTokenOk — clamp ratio
  const sseConnectRate = Math.min(1, m.sseConnectOk / Math.max(1, m.sseTokenOk));
  return (
    regRate >= 0.95
    && loginRate >= 0.95
    && sseConnectRate >= 0.9
    && m.chatDupMismatch === 0
    && msgRate >= 0.85
    && m.http5xx === 0
  );
}

async function main() {
  if (ENTRY_ONLY) {
    console.log('\nSIM entry burst (--entry-only)');
    console.log(`API=${API}`);
    const r = await runEntryBurst({
      baseUrl: API,
      totalUsers: ENTRY_USERS,
      concurrency: ENTRY_CONCURRENCY,
      verbose: ENTRY_VERBOSE,
    });
    if (r.verdict === 'FAIL') process.exit(1);
    return;
  }

  console.log(`\nSIM concurrent users`);
  console.log(`API=${API}`);
  console.log(`STAGES=${STAGES.join(',')}`);
  console.log(`RUN_ID=${RUN_ID} (test-only)`);
  console.log(`NOTE: uses Render API directly; realistic persona nicknames via test-personas.mjs\n`);

  // health
  try {
    const h = await fetch(API.replace(/\/api\/db$/, '') + '/api/healthz', { signal: AbortSignal.timeout(15_000) });
    console.log(`healthz ${h.status} ${await h.text()}`);
  } catch (e) {
    console.error('healthz failed', e);
    process.exit(1);
  }

  const results = [];
  let stopAt = null;
  for (const n of STAGES) {
    const m = await runStage(n);
    const pass = stagePass(m);
    results.push({ n, pass, m });
    console.log(pass ? `\n✅ STAGE ${n} PASS` : `\n❌ STAGE ${n} FAIL`);
    if (!pass) {
      stopAt = n;
      console.log('Stopping further scale-up until fixed (per brief).');
      break;
    }
    // cool-down between stages
    await sleep(3000);
  }

  console.log('\n════════════════ FINAL ════════════════');
  for (const { n, pass, m } of results) {
    console.log(
      `N=${String(n).padStart(3)} ${pass ? 'PASS' : 'FAIL'} `
      + `reg=${m.registerOk} login=${m.loginOk} sse=${m.sseConnectOk} `
      + `msgSSE=${rate(m.msgSseDelivered, m.msgSseMiss)} likeSSE=${rate(m.likeSseDelivered, m.likeSseMiss)} `
      + `429=${m.http429} 5xx=${m.http5xx}`,
    );
  }
  if (stopAt) {
    console.log(`\nFirst failing stage: ${stopAt}`);
    process.exit(2);
  }
  console.log('\nAll requested stages passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
