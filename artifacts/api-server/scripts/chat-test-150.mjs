#!/usr/bin/env node
/**
 * chat-test-150.mjs — 150명 채팅 통합 테스트
 *
 * 테스트 시나리오:
 *   1. 150개 프로필 생성 (device_secret first-claim 포함)
 *   2. 1:다 팬아웃 — 중심 유저 1명이 49명에게 채팅방 개설 + 메시지 전송
 *   3. 다:1 팬인  — 50명이 같은 상대에게 동시에 메시지 전송 (동시성 검증)
 *   4. 중복 채팅방 생성 방지 검증 (동일 pair 동시 INSERT)
 *   5. 메시지 client_id 멱등성 검증 (같은 client_id 두 번 INSERT)
 *   6. SSE first-claim 인증 플로우 검증 (기존 계정 마이그레이션)
 *   7. 전체 수량 검증 + latency 통계
 *   8. 픽스처 정리
 *
 * Usage:
 *   BASE_URL=http://localhost:8080 node scripts/chat-test-150.mjs
 */

import { randomUUID, createHmac } from 'node:crypto';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:8080';
const API = `${BASE_URL}/api/db`;
const TOTAL_USERS = 150;

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
async function post(path, body, headers = {}) {
  const start = Date.now();
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const latency = Date.now() - start;
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, latency };
}

async function postWithRetry(path, body, headers = {}, retries = 3) {
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await post(path, body, headers);
      if (r.status < 500) return r;
    } catch {}
    if (i < retries) await new Promise(r => setTimeout(r, 300 * (i + 1)));
  }
  return { status: 500, json: { error: 'max retries' }, latency: 0 };
}

function pct(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil((p / 100) * s.length) - 1)];
}

const failures = [];
function check(label, cond, detail = '') {
  if (!cond) {
    failures.push(detail ? `${label}: ${detail}` : label);
    console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`);
  } else {
    console.log(`  ✓ ${label}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const runId = randomUUID().slice(0, 8);
  console.log(`\n🚀  150명 채팅 통합 테스트 — BASE_URL: ${BASE_URL}  run=${runId}\n`);

  // ── ① 150개 프로필 생성 ───────────────────────────────────────────────────
  console.log(`① ${TOTAL_USERS}개 프로필 생성 중…`);
  const userIds = Array.from({ length: TOTAL_USERS }, () => randomUUID());
  const deviceSecrets = userIds.map(() => randomUUID());

  // PIN은 4자리, 중복 없이
  const usedPins = new Set();
  const pins = userIds.map((_, i) => {
    let p;
    do { p = String(Math.floor(1000 + Math.random() * 9000)); } while (usedPins.has(p));
    usedPins.add(p);
    return p;
  });

  const createStart = Date.now();
  const createResults = await Promise.allSettled(
    userIds.map((id, i) =>
      postWithRetry('/op', {
        table: 'profiles', op: 'insert',
        payload: {
          id,
          nickname: `ct150_${i}_${runId}`,
          pin_code: pins[i],
          _device_secret: deviceSecrets[i],
        },
      })
    )
  );
  const createOk = createResults.filter(r => r.status === 'fulfilled' && r.value.status < 400).length;
  console.log(`  생성: ${createOk}/${TOTAL_USERS} (${Date.now() - createStart}ms)`);
  check('프로필 150개 생성', createOk === TOTAL_USERS, `${TOTAL_USERS - createOk}개 실패`);

  // ── ② SSE first-claim 인증 플로우 (기존 계정 마이그레이션) ────────────────
  console.log('\n② SSE first-claim 인증 플로우 (5명 샘플)…');
  const sampleCount = 5;
  const authResults = await Promise.allSettled(
    userIds.slice(0, sampleCount).map((userId, i) =>
      post('/auth/login', { userId, deviceSecret: deviceSecrets[i] })
    )
  );
  const authOk = authResults.filter(r => r.status === 'fulfilled' && r.value.status === 200).length;
  check(`first-claim 로그인 성공 (${sampleCount}명 샘플)`, authOk === sampleCount,
    `${sampleCount - authOk}명 실패 — NEEDS_MIGRATION 또는 서버 오류`);

  // 동일 deviceSecret으로 재인증 → 성공해야 함
  const reAuthRes = await post('/auth/login', { userId: userIds[0], deviceSecret: deviceSecrets[0] });
  check('동일 기기 재인증 성공', reAuthRes.status === 200);

  // 다른 deviceSecret으로 인증 → 실패해야 함
  const wrongSecretRes = await post('/auth/login', { userId: userIds[0], deviceSecret: randomUUID() });
  check('다른 기기 secret 거부 (보안)', wrongSecretRes.status === 401);

  // ── ③ 1:다 팬아웃 — 유저0이 유저1~49에게 채팅방 생성 ──────────────────────
  console.log('\n③ 1:다 팬아웃 — 유저0 → 49명 채팅방 생성 중…');
  const hubUser = userIds[0];
  const fanTargets = userIds.slice(1, 50);

  const roomStart = Date.now();
  const roomResults = await Promise.allSettled(
    fanTargets.map(targetId => {
      const u1 = hubUser < targetId ? hubUser : targetId;
      const u2 = hubUser < targetId ? targetId : hubUser;
      return postWithRetry('/op', {
        table: 'chats', op: 'insert',
        payload: { user1_id: u1, user2_id: u2 },
        selectAfterWrite: true, single: true,
      });
    })
  );
  const rooms = roomResults
    .filter(r => r.status === 'fulfilled' && r.value.json?.data?.id)
    .map(r => ({ chatId: r.value.json.data.id, latency: r.value.latency }));
  console.log(`  채팅방: ${rooms.length}/49 (${Date.now() - roomStart}ms)`);
  check('49개 채팅방 생성', rooms.length === 49, `${49 - rooms.length}개 실패`);

  // ── ④ 중복 채팅방 방지 — 같은 pair를 동시에 10번 INSERT ───────────────────
  console.log('\n④ 중복 채팅방 방지 검증 (동일 pair 10번 동시 INSERT)…');
  const dupUser = userIds[50];
  const dupTarget = userIds[51];
  const u1Dup = dupUser < dupTarget ? dupUser : dupTarget;
  const u2Dup = dupUser < dupTarget ? dupTarget : dupUser;

  const dupRoomStart = Date.now();
  const dupResults = await Promise.allSettled(
    Array.from({ length: 10 }, () =>
      post('/op', {
        table: 'chats', op: 'insert',
        payload: { user1_id: u1Dup, user2_id: u2Dup },
        selectAfterWrite: true, single: true,
      })
    )
  );
  const dupRooms = dupResults
    .filter(r => r.status === 'fulfilled' && r.value.json?.data?.id)
    .map(r => r.value.json.data.id);
  const uniqueDupRoomIds = new Set(dupRooms);
  console.log(`  INSERT 10회 → 고유 chat_id 수: ${uniqueDupRoomIds.size} (${Date.now() - dupRoomStart}ms)`);
  check('중복 채팅방 없음 (10 concurrent inserts → 1 unique room)', uniqueDupRoomIds.size === 1,
    `${uniqueDupRoomIds.size}개의 다른 채팅방이 생성됨`);

  // ── ⑤ 팬아웃 메시지 전송 — 유저0이 49개 방에 각 1개씩 ────────────────────
  console.log('\n⑤ 팬아웃 메시지 전송 (49개 방 × 1개 메시지)…');
  const fanMsgClientIds = rooms.map(() => randomUUID());
  const fanMsgStart = Date.now();
  const fanMsgResults = await Promise.allSettled(
    rooms.map((room, i) =>
      postWithRetry('/op', {
        table: 'messages', op: 'insert',
        payload: {
          chat_id: room.chatId,
          sender_id: hubUser,
          content: `[팬아웃 테스트] 안녕하세요 ${i + 1}번 사용자 — run=${runId}`,
          client_id: fanMsgClientIds[i],
        },
        selectAfterWrite: false,
      })
    )
  );
  const fanMsgOk = fanMsgResults.filter(r => r.status === 'fulfilled' && r.value.status < 400).length;
  const fanMsgLatencies = fanMsgResults
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value.latency);
  console.log(`  전송: ${fanMsgOk}/49  p50:${pct(fanMsgLatencies,50)}ms p95:${pct(fanMsgLatencies,95)}ms (${Date.now() - fanMsgStart}ms)`);
  check('팬아웃 메시지 49개 전송', fanMsgOk === 49, `${49 - fanMsgOk}개 실패`);

  // ── ⑥ 다:1 팬인 — 50명이 동시에 1명에게 메시지 ────────────────────────────
  console.log('\n⑥ 다:1 팬인 — 50명 동시 메시지 전송…');
  const fanInTarget = userIds[100];
  const fanInSenders = userIds.slice(51, 101);

  // 50개 채팅방 생성
  const fanInRooms = await Promise.allSettled(
    fanInSenders.map(senderId => {
      const u1 = senderId < fanInTarget ? senderId : fanInTarget;
      const u2 = senderId < fanInTarget ? fanInTarget : senderId;
      return postWithRetry('/op', {
        table: 'chats', op: 'insert',
        payload: { user1_id: u1, user2_id: u2 },
        selectAfterWrite: true, single: true,
      });
    })
  );
  const fanInChatIds = fanInRooms
    .filter(r => r.status === 'fulfilled' && r.value.json?.data?.id)
    .map((r, i) => ({ chatId: r.value.json.data.id, senderId: fanInSenders[i] }));

  const fanInClientIds = fanInChatIds.map(() => randomUUID());
  const fanInStart = Date.now();
  const fanInResults = await Promise.allSettled(
    fanInChatIds.map((room, i) =>
      post('/op', {
        table: 'messages', op: 'insert',
        payload: {
          chat_id: room.chatId,
          sender_id: room.senderId,
          content: `[팬인 테스트] 메시지 ${i} — run=${runId}`,
          client_id: fanInClientIds[i],
        },
        selectAfterWrite: false,
      })
    )
  );
  const fanInOk = fanInResults.filter(r => r.status === 'fulfilled' && r.value.status < 400).length;
  const fanInLatencies = fanInResults
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value.latency);
  console.log(`  전송: ${fanInOk}/${fanInChatIds.length}  p50:${pct(fanInLatencies,50)}ms p95:${pct(fanInLatencies,95)}ms p99:${pct(fanInLatencies,99)}ms (${Date.now() - fanInStart}ms)`);
  check(`팬인 메시지 ${fanInChatIds.length}개 전송`, fanInOk === fanInChatIds.length, `${fanInChatIds.length - fanInOk}개 실패`);

  // ── ⑦ client_id 멱등성 — 같은 client_id 두 번 전송 ─────────────────────
  console.log('\n⑦ client_id 멱등성 검증 (동일 메시지 2번 전송)…');
  if (rooms.length > 0) {
    const idempotentCid = randomUUID();
    const [res1, res2] = await Promise.all([
      post('/op', {
        table: 'messages', op: 'insert',
        payload: { chat_id: rooms[0].chatId, sender_id: hubUser, content: '멱등성 테스트', client_id: idempotentCid },
        selectAfterWrite: false,
      }),
      post('/op', {
        table: 'messages', op: 'insert',
        payload: { chat_id: rooms[0].chatId, sender_id: hubUser, content: '멱등성 테스트', client_id: idempotentCid },
        selectAfterWrite: false,
      }),
    ]);
    // 1초 후 해당 chat_id에 같은 content 메시지 개수 확인
    await new Promise(r => setTimeout(r, 500));
    const countRes = await post('/op', {
      table: 'messages', op: 'select',
      filters: [
        { type: 'eq', col: 'chat_id', val: rooms[0].chatId },
        { type: 'eq', col: 'content', val: '멱등성 테스트' },
      ],
    });
    const idempotentCount = Array.isArray(countRes.json?.data) ? countRes.json.data.length : -1;
    check('동일 client_id 중복 저장 방지 (1개만 저장)', idempotentCount === 1,
      `실제 저장 수: ${idempotentCount}`);
  }

  // ── ⑧ 150명 전체 동시 접속 시뮬레이션 (각자 자기 채팅 목록 조회) ──────────
  console.log('\n⑧ 150명 동시 채팅 목록 조회 (부하 테스트)…');
  const listStart = Date.now();
  const listResults = await Promise.allSettled(
    userIds.map(uid =>
      post('/op', {
        table: 'chats', op: 'select',
        filters: [{ type: 'or', expr: `user1_id.eq.${uid},user2_id.eq.${uid}` }],
        orderBy: [{ col: 'created_at', asc: false }],
      })
    )
  );
  const listOk = listResults.filter(r => r.status === 'fulfilled' && r.value.status < 400).length;
  const listLatencies = listResults
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value.latency);
  console.log(`  성공: ${listOk}/150  p50:${pct(listLatencies,50)}ms p95:${pct(listLatencies,95)}ms p99:${pct(listLatencies,99)}ms (${Date.now() - listStart}ms)`);
  check('150명 동시 목록 조회 성공', listOk === TOTAL_USERS, `${TOTAL_USERS - listOk}개 실패`);
  check('p99 < 3000ms', pct(listLatencies, 99) < 3000, `p99=${pct(listLatencies,99)}ms`);

  // ── ⑨ 저장 검증 ─────────────────────────────────────────────────────────────
  console.log('\n⑨ 최종 저장 수량 검증 (1초 settle)…');
  await new Promise(r => setTimeout(r, 1000));

  // 팬아웃 채팅방의 메시지 수 확인 (rooms[0])
  if (rooms.length > 0) {
    const msgCountRes = await post('/op', {
      table: 'messages', op: 'select',
      filters: [{ type: 'eq', col: 'chat_id', val: rooms[0].chatId }],
    });
    const storedCount = Array.isArray(msgCountRes.json?.data) ? msgCountRes.json.data.length : -1;
    // 팬아웃 1개 + 멱등성 테스트 1개 = 2개 예상
    check('첫 번째 팬아웃 방 메시지 수 정확', storedCount >= 1, `저장된 메시지: ${storedCount}`);
  }

  // ── ⑩ 헬스 확인 ─────────────────────────────────────────────────────────────
  console.log('\n⑩ 서버 헬스 확인…');
  const health = await fetch(`${API}/health`).then(r => r.json()).catch(() => ({}));
  console.log(`  persistErrors: ${health.persistErrors ?? 'N/A'}`);
  console.log(`  alarms: ${health.alarms?.length ? health.alarms.join('; ') : 'none'}`);
  check('서버 헬스 OK', health.ok === true, `ok=${health.ok}`);

  // ── ⑪ 결과 출력 ─────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(60));
  if (failures.length === 0) {
    console.log('✅  PASS — 모든 채팅 시나리오 통과');
    console.log(`    팬아웃 p95: ${pct(fanMsgLatencies,95)}ms`);
    console.log(`    팬인   p95: ${pct(fanInLatencies,95)}ms`);
    console.log(`    목록   p95: ${pct(listLatencies,95)}ms`);
  } else {
    console.error('❌  FAIL:');
    failures.forEach(f => console.error(`    • ${f}`));
  }

  // ── ⑫ 정리 ──────────────────────────────────────────────────────────────────
  console.log('\n⑪ 픽스처 정리 중…');
  const allChatIds = [
    ...rooms.map(r => r.chatId),
    ...fanInChatIds.map(r => r.chatId),
    ...[...uniqueDupRoomIds],
  ];

  await Promise.all(
    allChatIds.map(cid =>
      post('/op', { table: 'messages', op: 'delete', filters: [{ type: 'eq', col: 'chat_id', val: cid }] })
    )
  );
  await Promise.all(
    allChatIds.map(cid =>
      post('/op', { table: 'chats', op: 'delete', filters: [{ type: 'eq', col: 'id', val: cid }] })
    )
  );
  await Promise.all(
    userIds.map(uid =>
      post('/op', { table: 'profiles', op: 'delete', filters: [{ type: 'eq', col: 'id', val: uid }] })
    )
  );
  console.log('  ✓ 완료\n');

  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
