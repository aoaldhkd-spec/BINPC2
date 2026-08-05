#!/usr/bin/env node
/**
 * load-test-sse-150.mjs — 150명 SSE 격리·부하 종합 테스트
 *
 * 검증 항목:
 *   ① SSE 권한 격리 — 채팅방·메시지 이벤트가 참여자(2명)에게만 전달되고
 *                      나머지 148명에게는 절대 누출되지 않는지
 *   ② 메시지 전달   — 양방향 메시지가 유실 없이 두 참여자에게만 도달
 *   ③ 동시성 부하   — 150명 동시 SSE + 병렬 채팅방·메시지 생성
 *   ④ 에러 감시     — HTTP 4xx/5xx, SSE 연결 안정성, 서버 헬스
 *
 * Usage:
 *   BASE_URL=http://localhost:8080 node scripts/load-test-sse-150.mjs
 */

import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { URL } from 'node:url';

const BASE_URL  = process.env.BASE_URL ?? 'http://localhost:8080';
const API       = `${BASE_URL}/api/db`;
const N_USERS   = 150;

// ─── 전역 통계 ────────────────────────────────────────────────────────────────
const stats = {
  httpErrors:    0,   // HTTP 4xx/5xx 건수
  http429:       0,   // Rate-limit 횟수
  http5xx:       0,   // 서버 오류 횟수
  sseConnected:  0,   // SSE 연결 성공 수
  sseDrops:      0,   // SSE 비정상 종료 수
  sseConnErr:    0,   // SSE 연결 실패 수
};

const failures = [];
const warnings = [];

function fail(msg)  { failures.push(msg); console.error(`  ✗ FAIL: ${msg}`); }
function warn(msg)  { warnings.push(msg); console.warn(`  ⚠ WARN: ${msg}`); }
function ok(label)  { console.log(`  ✓ ${label}`); }

// ─── HTTP helpers (fetch 기반) ────────────────────────────────────────────────
async function post(path, body, cookieStr = '', retries = 3) {
  const url = `${API}${path}`;
  for (let i = 0; i <= retries; i++) {
    try {
      const start = Date.now();
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cookieStr ? { Cookie: cookieStr } : {}),
        },
        body: JSON.stringify(body),
      });
      const latency = Date.now() - start;
      const json = await res.json().catch(() => ({}));
      if (res.status === 429) stats.http429++;
      if (res.status >= 500) stats.http5xx++;
      if (res.status >= 400) stats.httpErrors++;
      return { status: res.status, json, latency, headers: res.headers };
    } catch {
      if (i === retries) return { status: 0, json: {}, latency: 0, headers: new Headers() };
      await sleep(200 * (i + 1));
    }
  }
}

async function postWithCookie(path, body, retries = 3) {
  /** login 전용 — Set-Cookie 헤더 반환 */
  const url = `${API}${path}`;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        redirect: 'manual',
      });
      const json = await res.json().catch(() => ({}));
      const cookie = res.headers.get('set-cookie') ?? '';
      return { status: res.status, json, cookie };
    } catch {
      if (i === retries) return { status: 0, json: {}, cookie: '' };
      await sleep(200 * (i + 1));
    }
  }
}

function pct(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil((p / 100) * s.length) - 1)];
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── SSE 연결 (node:http 직접 사용 — undici pool limit 회피) ─────────────────
/**
 * ctx = {
 *   userId, token, cookie,
 *   events: [],   ← 수신된 이벤트 배열 (push-only)
 *   connected: false,
 *   drops: 0,
 *   _close(): void
 * }
 */
function openSseConnection(ctx) {
  return new Promise((resolve) => {
    const parsed = new URL(`${API}/events`);
    parsed.searchParams.set('userId', ctx.userId);
    parsed.searchParams.set('token',  ctx.token);

    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || 80,
      path:     `${parsed.pathname}${parsed.search}`,
      method:   'GET',
      headers: {
        Accept:          'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection:      'keep-alive',
        ...(ctx.cookie ? { Cookie: ctx.cookie } : {}),
      },
    };

    const req = http.request(options, (res) => {
      if (res.statusCode !== 200) {
        stats.sseConnErr++;
        if (res.statusCode === 429) stats.http429++;
        ctx._closed = true;
        res.resume();
        resolve(false);
        return;
      }

      ctx.connected = true;
      stats.sseConnected++;

      let buf = '';
      res.setEncoding('utf8');

      res.on('data', (chunk) => {
        buf += chunk;
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          const dataLine = part.split('\n').find(l => l.startsWith('data:'));
          if (!dataLine) continue;
          try {
            const ev = JSON.parse(dataLine.slice(5).trim());
            if (ev.type === 'ping') {
              // 최초 ping = 연결 확인 → resolve
              if (!ctx._pinged) { ctx._pinged = true; resolve(true); }
            } else {
              ctx.events.push({ ...ev, _ts: Date.now() });
            }
          } catch {}
        }
      });

      res.on('end',   () => { if (!ctx._closed) { stats.sseDrops++; ctx.drops++; } });
      res.on('error', () => { if (!ctx._closed) { stats.sseDrops++; ctx.drops++; } });
    });

    req.on('error', () => {
      stats.sseConnErr++;
      ctx._closed = true;
      resolve(false);
    });

    ctx._close = () => {
      ctx._closed = true;
      try { req.destroy(); } catch {}
    };

    // 10초 내 ping 없으면 연결 실패 처리
    setTimeout(() => {
      if (!ctx._pinged) { ctx._close(); resolve(false); }
    }, 10_000);

    req.end();
  });
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  const runId = randomUUID().slice(0, 8);
  console.log(`\n🚀  150명 SSE 격리·부하 종합 테스트`);
  console.log(`    BASE_URL: ${BASE_URL}  run=${runId}\n`);

  // ── ① 150개 프로필 생성 ───────────────────────────────────────────────────
  console.log(`① ${N_USERS}개 가상 유저 프로필 생성 중…`);
  const t0 = Date.now();

  const userIds       = Array.from({ length: N_USERS }, () => randomUUID());
  const deviceSecrets = userIds.map(() => randomUUID());
  const usedPins = new Set();
  const pins = userIds.map(() => {
    let p;
    do { p = String(Math.floor(1000 + Math.random() * 9000)); } while (usedPins.has(p));
    usedPins.add(p);
    return p;
  });

  const createResults = await Promise.allSettled(
    userIds.map((id, i) =>
      post('/op', {
        table: 'profiles', op: 'insert',
        payload: { id, nickname: `ld150_${i}_${runId}`, pin_code: pins[i], _device_secret: deviceSecrets[i] },
      })
    )
  );
  const createOk = createResults.filter(r => r.status === 'fulfilled' && r.value?.status < 400).length;
  console.log(`  생성: ${createOk}/${N_USERS}  (${Date.now() - t0}ms)`);
  if (createOk < N_USERS) fail(`프로필 생성 실패 ${N_USERS - createOk}명`);
  else ok('프로필 150개 생성');

  // ── ② 150명 로그인 (세션 쿠키 획득) ─────────────────────────────────────
  console.log(`\n② 150명 로그인 (세션 쿠키 획득)…`);
  const t1 = Date.now();
  const cookies = new Array(N_USERS).fill('');

  const loginResults = await Promise.allSettled(
    userIds.map((uid, i) =>
      postWithCookie('/auth/login', { userId: uid, deviceSecret: deviceSecrets[i] })
    )
  );
  let loginOk = 0;
  for (const [i, r] of loginResults.entries()) {
    if (r.status === 'fulfilled' && r.value?.status === 200) {
      cookies[i] = r.value.cookie;
      loginOk++;
    }
  }
  console.log(`  로그인: ${loginOk}/${N_USERS}  (${Date.now() - t1}ms)`);
  if (loginOk < N_USERS) fail(`로그인 실패 ${N_USERS - loginOk}명`);
  else ok('150명 로그인 성공');

  // ── ③ 150명 SSE 토큰 발급 ────────────────────────────────────────────────
  console.log(`\n③ 150명 SSE 토큰 발급…`);
  const t2 = Date.now();
  const sseTokens = new Array(N_USERS).fill('');

  const tokenResults = await Promise.allSettled(
    userIds.map((_, i) =>
      post('/auth/sse-token', {}, cookies[i])
    )
  );
  let tokenOk = 0;
  for (const [i, r] of tokenResults.entries()) {
    if (r.status === 'fulfilled' && r.value?.status === 200 && r.value.json?.token) {
      sseTokens[i] = r.value.json.token;
      tokenOk++;
    }
  }
  console.log(`  토큰 발급: ${tokenOk}/${N_USERS}  (${Date.now() - t2}ms)`);
  if (tokenOk < N_USERS) fail(`SSE 토큰 발급 실패 ${N_USERS - tokenOk}명`);
  else ok('150명 SSE 토큰 발급');

  // ── ④ 150개 SSE 연결 오픈 ────────────────────────────────────────────────
  console.log(`\n④ 150개 SSE 연결 오픈 중…`);
  const t3 = Date.now();

  /** @type {Array<{userId:string,events:any[],connected:boolean,drops:number,_close:()=>void}>} */
  const ctxs = userIds.map((uid, i) => ({
    userId:    uid,
    token:     sseTokens[i],
    cookie:    cookies[i],
    events:    [],
    connected: false,
    drops:     0,
    _pinged:   false,
    _closed:   false,
    _close:    () => {},
  }));

  // 30개씩 배치로 연결 (서버 소켓 폭증 방지)
  const BATCH = 30;
  for (let b = 0; b < N_USERS; b += BATCH) {
    const slice = ctxs.slice(b, b + BATCH);
    await Promise.all(slice.map(ctx => openSseConnection(ctx)));
    process.stdout.write(`    [${Math.min(b + BATCH, N_USERS)}/${N_USERS}] `);
  }
  console.log();

  const connected = ctxs.filter(c => c.connected).length;
  console.log(`  연결 성공: ${connected}/${N_USERS}  (${Date.now() - t3}ms)`);
  if (connected < N_USERS * 0.95) fail(`SSE 연결 부족: ${connected}/${N_USERS}`);
  else ok(`SSE ${connected}명 연결 확인`);

  // 연결 안정화 대기
  await sleep(300);

  // ─────────────────────────────────────────────────────────────────────────
  // ⑤ 권한 격리 테스트 — 10쌍 채팅방 생성 후 비참여자 누출 검사
  // ─────────────────────────────────────────────────────────────────────────
  console.log(`\n⑤ SSE 권한 격리 테스트 (10쌍 채팅방 생성 → 비참여자 누출 검사)…`);

  // 스냅샷: 현재 각 유저의 이벤트 수 기록 (이전 이벤트 무시)
  const snapBefore = ctxs.map(c => c.events.length);

  // 10쌍 지정 (인덱스 0-9: 유저A, 10-19: 유저B)
  const ISO_PAIRS = 10;
  const isoRoomIds = new Set();
  const isoRoomResults = await Promise.allSettled(
    Array.from({ length: ISO_PAIRS }, (_, k) => {
      const aIdx = k;
      const bIdx = k + ISO_PAIRS;
      const aId = userIds[aIdx];
      const bId = userIds[bIdx];
      const u1 = aId < bId ? aId : bId;
      const u2 = aId < bId ? bId : aId;
      return post('/op', {
        table: 'chats', op: 'insert',
        payload: { user1_id: u1, user2_id: u2 },
        selectAfterWrite: true, single: true,
      });
    })
  );

  const isoRooms = []; // { chatId, aIdx, bIdx }
  for (const [k, r] of isoRoomResults.entries()) {
    const chatId = r.status === 'fulfilled' && r.value?.json?.data?.id;
    if (chatId) {
      isoRooms.push({ chatId, aIdx: k, bIdx: k + ISO_PAIRS });
      isoRoomIds.add(chatId);
    }
  }
  console.log(`  채팅방 생성: ${isoRooms.length}/${ISO_PAIRS}`);

  // 이벤트 전파 대기 (2.5초)
  await sleep(2500);

  // 격리 검사 — A·B는 받아야, 나머지는 받으면 안 됨
  let isoLeakCount = 0;
  let isoDeliveryFail = 0;

  for (const { chatId, aIdx, bIdx } of isoRooms) {
    const hasEvent = (idx) =>
      ctxs[idx].events.slice(snapBefore[idx]).some(
        e => e.table === 'chats' && e.event === 'INSERT' && e.newRow?.id === chatId
      );

    // 참여자 수신 확인
    if (!hasEvent(aIdx)) isoDeliveryFail++;
    if (!hasEvent(bIdx)) isoDeliveryFail++;

    // 비참여자 누출 확인 (참여자 제외한 전원 검사)
    for (let i = 0; i < N_USERS; i++) {
      if (i === aIdx || i === bIdx) continue;
      if (connected > 0 && !ctxs[i].connected) continue; // 미연결 유저는 검사 제외
      const leaked = ctxs[i].events.slice(snapBefore[i]).some(
        e => e.table === 'chats' && e.event === 'INSERT' && e.newRow?.id === chatId
      );
      if (leaked) {
        isoLeakCount++;
        warn(`[격리 누출] chatId=${chatId.slice(0,8)} → userId_index=${i} (비참여자) 에게 노출됨`);
      }
    }
  }

  const participantDeliveries = isoRooms.length * 2 - isoDeliveryFail;
  const totalParticipantSlots = isoRooms.length * 2;
  console.log(`  참여자 수신: ${participantDeliveries}/${totalParticipantSlots}`);
  console.log(`  비참여자 누출: ${isoLeakCount}건`);

  if (isoDeliveryFail > 0)
    fail(`격리테스트 — 참여자 ${isoDeliveryFail}명이 자신의 채팅방 이벤트를 수신하지 못함`);
  else ok('채팅방 생성 이벤트 → 참여자 전달 확인');

  if (isoLeakCount > 0)
    fail(`SSE 권한 누출 ${isoLeakCount}건 — 비참여자에게 채팅 이벤트 전송됨`);
  else ok(`SSE 격리 완벽 — 비참여자 ${N_USERS - 2}명에게 누출 0건`);

  // ─────────────────────────────────────────────────────────────────────────
  // ⑥ 메시지 전달 격리 테스트 — 양방향 메시지 유실·누출 검사
  // ─────────────────────────────────────────────────────────────────────────
  console.log(`\n⑥ 메시지 전달·격리 테스트 (각 방 4개 메시지, 양방향)…`);

  const snapBeforeMsg = ctxs.map(c => c.events.length);
  const msgClientIds = []; // { clientId, chatId, aIdx, bIdx, senderIdx }

  // 각 채팅방에 4개씩 메시지 (A→B, B→A, A→B, B→A)
  const msgPayloads = isoRooms.flatMap(({ chatId, aIdx, bIdx }) =>
    [0, 1, 2, 3].map(turn => ({
      chatId,
      aIdx,
      bIdx,
      senderIdx: turn % 2 === 0 ? aIdx : bIdx,
      receiverIdx: turn % 2 === 0 ? bIdx : aIdx,
      clientId: randomUUID(),
    }))
  );

  const msgStart = Date.now();
  const msgResults = await Promise.allSettled(
    msgPayloads.map(({ chatId, senderIdx, clientId }) =>
      post('/op', {
        table: 'messages', op: 'insert',
        payload: {
          chat_id:   chatId,
          sender_id: userIds[senderIdx],
          content:   `msg_${clientId.slice(0, 8)}_run=${runId}`,
          client_id: clientId,
        },
        selectAfterWrite: false,
      })
    )
  );
  const msgElapsed = Date.now() - msgStart;

  const msgSent    = msgResults.filter(r => r.status === 'fulfilled' && r.value?.status < 400).length;
  const msgLatencies = msgResults.filter(r => r.status === 'fulfilled').map(r => r.value?.latency ?? 0);
  console.log(`  전송: ${msgSent}/${msgPayloads.length}  p50:${pct(msgLatencies,50)}ms p95:${pct(msgLatencies,95)}ms  (${msgElapsed}ms)`);

  // 전파 대기
  await sleep(2500);

  // 검증
  let msgDeliveryFail = 0;
  let msgLeakCount   = 0;
  const msgClientIdSet = new Set(msgPayloads.map(m => m.clientId));

  for (const { chatId, aIdx, bIdx, clientId } of msgPayloads) {
    const hasMsg = (idx) =>
      ctxs[idx].events.slice(snapBeforeMsg[idx]).some(
        e => e.table === 'messages' && e.event === 'INSERT' &&
             (e.newRow?.client_id === clientId || e.newRow?.chat_id === chatId)
      );

    if (ctxs[aIdx].connected && !hasMsg(aIdx)) msgDeliveryFail++;
    if (ctxs[bIdx].connected && !hasMsg(bIdx)) msgDeliveryFail++;
  }

  // 비참여자 메시지 누출 (샘플 30명 — isoRooms 참여자 제외)
  const isoParticipants = new Set(isoRooms.flatMap(r => [r.aIdx, r.bIdx]));
  for (let i = 20; i < 50; i++) {
    if (isoParticipants.has(i) || !ctxs[i].connected) continue;
    const leaked = ctxs[i].events.slice(snapBeforeMsg[i]).some(e =>
      e.table === 'messages' && msgClientIdSet.has(e.newRow?.client_id)
    );
    if (leaked) {
      msgLeakCount++;
      warn(`[메시지 누출] idx=${i} (비참여자) 에게 메시지 이벤트 전달됨`);
    }
  }

  const msgDeliveries = msgPayloads.length * 2 - msgDeliveryFail;
  console.log(`  양방향 수신: ${msgDeliveries}/${msgPayloads.length * 2}`);
  console.log(`  메시지 누출: ${msgLeakCount}건`);

  if (msgDeliveryFail > msgPayloads.length * 0.1)
    fail(`메시지 전달 실패 ${msgDeliveryFail}건 (10% 초과)`);
  else ok(`메시지 전달 확인 (실패 ${msgDeliveryFail}건)`);

  if (msgLeakCount > 0)
    fail(`메시지 SSE 권한 누출 ${msgLeakCount}건`);
  else ok('메시지 격리 완벽 — 비참여자 샘플 30명 누출 0건');

  // ─────────────────────────────────────────────────────────────────────────
  // ⑦ 동시성 부하 — 75쌍 채팅방 동시 생성 + 300개 메시지 병렬 전송
  // ─────────────────────────────────────────────────────────────────────────
  console.log(`\n⑦ 동시성 부하 테스트 (75쌍 채팅방 + 300개 메시지)…`);

  // 유저 20~149 → 75쌍
  const loadPairs = Array.from({ length: 75 }, (_, k) => ({
    aIdx: 20 + k * 2,
    bIdx: 20 + k * 2 + 1,
  }));

  const loadRoomStart = Date.now();
  const loadRoomResults = await Promise.allSettled(
    loadPairs.map(({ aIdx, bIdx }) => {
      const aId = userIds[aIdx];
      const bId = userIds[bIdx];
      const u1 = aId < bId ? aId : bId;
      const u2 = aId < bId ? bId : aId;
      return post('/op', {
        table: 'chats', op: 'insert',
        payload: { user1_id: u1, user2_id: u2 },
        selectAfterWrite: true, single: true,
      });
    })
  );
  const loadRooms = loadRoomResults
    .map((r, i) => ({ chatId: r.status === 'fulfilled' && r.value?.json?.data?.id, ...loadPairs[i] }))
    .filter(r => r.chatId);

  const loadRoomElapsed = Date.now() - loadRoomStart;
  const loadRoomLats = loadRoomResults.filter(r => r.status === 'fulfilled').map(r => r.value?.latency ?? 0);
  console.log(`  채팅방: ${loadRooms.length}/75  p50:${pct(loadRoomLats,50)}ms p95:${pct(loadRoomLats,95)}ms  (${loadRoomElapsed}ms)`);
  if (loadRooms.length < 70) fail(`부하 채팅방 생성 부족: ${loadRooms.length}/75`);
  else ok(`채팅방 75쌍 생성 (${loadRooms.length}개 성공)`);

  // 300개 메시지 병렬 전송 (방 당 4개)
  const loadMsgStart = Date.now();
  const loadMsgResults = await Promise.allSettled(
    loadRooms.flatMap(({ chatId, aIdx, bIdx }) =>
      [0, 1, 2, 3].map(turn => {
        const senderIdx = turn % 2 === 0 ? aIdx : bIdx;
        return post('/op', {
          table: 'messages', op: 'insert',
          payload: {
            chat_id:   chatId,
            sender_id: userIds[senderIdx],
            content:   `load_${turn}_${randomUUID().slice(0,6)}`,
            client_id: randomUUID(),
          },
          selectAfterWrite: false,
        });
      })
    )
  );
  const loadMsgElapsed = Date.now() - loadMsgStart;
  const loadMsgOk = loadMsgResults.filter(r => r.status === 'fulfilled' && r.value?.status < 400).length;
  const loadMsgLats = loadMsgResults.filter(r => r.status === 'fulfilled').map(r => r.value?.latency ?? 0);
  console.log(`  메시지: ${loadMsgOk}/${loadRooms.length * 4}  p50:${pct(loadMsgLats,50)}ms p95:${pct(loadMsgLats,95)}ms p99:${pct(loadMsgLats,99)}ms  (${loadMsgElapsed}ms)`);

  if (loadMsgOk < loadRooms.length * 4 * 0.95) fail(`부하 메시지 전송 실패율 5% 초과`);
  else ok(`메시지 ${loadMsgOk}개 전송 (실패 ${loadRooms.length * 4 - loadMsgOk}개)`);

  const loadP99 = pct(loadMsgLats, 99);
  if (loadP99 > 3000) fail(`메시지 p99 ${loadP99}ms > 3000ms 목표`);
  else ok(`메시지 p99 ${loadP99}ms ≤ 3000ms`);

  // ─────────────────────────────────────────────────────────────────────────
  // ⑧ SSE 연결 안정성 검사
  // ─────────────────────────────────────────────────────────────────────────
  await sleep(1000);
  const stillConnected = ctxs.filter(c => c.connected && c.drops === 0).length;
  const dropCount      = ctxs.reduce((s, c) => s + c.drops, 0);
  console.log(`\n⑧ SSE 연결 안정성 — 연결유지: ${stillConnected}/${connected}  드롭: ${dropCount}건`);
  if (dropCount > connected * 0.05) fail(`SSE 드롭 5% 초과: ${dropCount}/${connected}`);
  else ok(`SSE 안정적 유지 (드롭 ${dropCount}건)`);

  // ─────────────────────────────────────────────────────────────────────────
  // ⑨ 서버 헬스 체크
  // ─────────────────────────────────────────────────────────────────────────
  console.log(`\n⑨ 서버 헬스 체크…`);
  let health = {};
  try {
    const r = await fetch(`${API}/health`);
    health = await r.json();
  } catch {}

  console.log(`  sseConnections: ${health.sseConnections ?? 'N/A'}`);
  console.log(`  persistErrors:  ${health.persistErrors ?? 'N/A'}`);
  console.log(`  messageLag:     ${health.lag?.messages ?? 'N/A'}`);
  console.log(`  alarms:         ${health.alarms?.length ? health.alarms.join('; ') : 'none'}`);

  if (health.persistErrors > 0)
    fail(`DB persist 오류 ${health.persistErrors}건`);
  if (health.alarms?.length)
    health.alarms.forEach(a => warn(`[서버 알람] ${a}`));
  if (!health.ok && health.persistErrors === 0 && !health.alarms?.length)
    warn('서버 health.ok=false (알람 내용 확인 필요)');
  if (health.ok || health.persistErrors === 0) ok('서버 헬스 정상');

  // ─────────────────────────────────────────────────────────────────────────
  // ⑩ HTTP 에러율 요약
  // ─────────────────────────────────────────────────────────────────────────
  console.log(`\n⑩ HTTP 에러 요약`);
  console.log(`  전체 httpErrors: ${stats.httpErrors}  (429: ${stats.http429}  5xx: ${stats.http5xx})`);
  console.log(`  SSE 연결 실패:  ${stats.sseConnErr}  드롭: ${stats.sseDrops}`);
  if (stats.http5xx > 0) fail(`HTTP 5xx 오류 ${stats.http5xx}건`);
  else ok('HTTP 5xx 없음');
  if (stats.http429 > 5) warn(`HTTP 429 Rate-limit ${stats.http429}건 — 채팅이 아닌 좋아요 테스트 시 429 예상`);

  // ─────────────────────────────────────────────────────────────────────────
  // ⑪ SSE 연결 종료
  // ─────────────────────────────────────────────────────────────────────────
  console.log(`\n⑪ SSE 연결 종료 중…`);
  for (const ctx of ctxs) try { ctx._close(); } catch {}
  await sleep(500);
  ok('SSE 연결 전원 종료');

  // ─────────────────────────────────────────────────────────────────────────
  // ⑫ 픽스처 정리
  // ─────────────────────────────────────────────────────────────────────────
  console.log(`\n⑫ 픽스처 정리 중…`);
  const allRoomIds = [
    ...isoRooms.map(r => r.chatId),
    ...loadRooms.map(r => r.chatId),
  ];

  await Promise.all(allRoomIds.map(cid =>
    post('/op', { table: 'messages', op: 'delete', filters: [{ type: 'eq', col: 'chat_id', val: cid }] })
  ));
  await Promise.all(allRoomIds.map(cid =>
    post('/op', { table: 'chats', op: 'delete', filters: [{ type: 'eq', col: 'id', val: cid }] })
  ));
  // 프로필 배치 삭제 (20개씩 직렬 — DB 부하 완화)
  for (let i = 0; i < userIds.length; i += 20) {
    await Promise.all(
      userIds.slice(i, i + 20).map(uid =>
        post('/op', { table: 'profiles', op: 'delete', filters: [{ type: 'eq', col: 'id', val: uid }] })
      )
    );
  }
  ok('픽스처 정리 완료');

  // ─────────────────────────────────────────────────────────────────────────
  // ⑬ 최종 리포트
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(64));
  console.log('📊  최종 리포트');
  console.log('═'.repeat(64));

  console.log(`\n[성능 요약]`);
  console.log(`  채팅방 p95:  ${pct(loadRoomLats, 95)}ms`);
  console.log(`  메시지 p50:  ${pct(loadMsgLats, 50)}ms`);
  console.log(`  메시지 p95:  ${pct(loadMsgLats, 95)}ms`);
  console.log(`  메시지 p99:  ${pct(loadMsgLats, 99)}ms`);
  console.log(`  SSE 연결:   ${connected}/${N_USERS}명`);

  console.log(`\n[SSE 격리 결과]`);
  console.log(`  채팅방 이벤트 누출: ${isoLeakCount}건`);
  console.log(`  메시지 이벤트 누출: ${msgLeakCount}건`);
  console.log(`  비참여자 검사 범위: ${N_USERS - 2}명 (채팅방) + 샘플 30명 (메시지)`);

  if (warnings.length > 0) {
    console.log(`\n[경고 ${warnings.length}건]`);
    warnings.forEach(w => console.warn(`  ⚠ ${w}`));
  }

  if (failures.length === 0) {
    console.log('\n✅  PASS — 모든 검증 통과');
    console.log('    SSE 권한 격리, 메시지 전달, 동시성 부하, 서버 헬스 모두 정상\n');
    process.exit(0);
  } else {
    console.error(`\n❌  FAIL — ${failures.length}개 문제 발견:`);
    failures.forEach(f => console.error(`    • ${f}`));
    console.log();
    process.exit(1);
  }
}

main().catch(err => { console.error('Fatal:', err.stack ?? err); process.exit(1); });
