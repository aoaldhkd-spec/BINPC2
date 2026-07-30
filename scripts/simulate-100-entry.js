#!/usr/bin/env node
/**
 * simulate-100-entry.js
 *
 * 100명 동시 QR 입장 시뮬레이션 스크립트
 *
 * 사용법:
 *   node scripts/simulate-100-entry.js [OPTIONS]
 *
 * 옵션:
 *   --url <base>        API 서버 기본 URL (기본: http://localhost:3001/api/db)
 *   --users <n>         동시 입장 사용자 수 (기본: 100)
 *   --concurrency <n>   동시 병렬 요청 수 (기본: 100, 즉 전원 동시)
 *   --verbose           각 요청 결과 출력
 *
 * 측정 항목:
 *   - 전체 성공/실패 수
 *   - p50 / p95 / p99 응답 시간
 *   - 재시도 횟수 (503 응답)
 *   - 최대 동시 연결 수
 */

const { performance } = require('perf_hooks');
const http = require('http');
const https = require('https');

// ─── CLI 파싱 ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(flag, defaultVal) {
  const idx = args.indexOf(flag);
  if (idx < 0) return defaultVal;
  return args[idx + 1] ?? defaultVal;
}
const BASE_URL = getArg('--url', 'http://localhost:3001/api/db');
const TOTAL_USERS = parseInt(getArg('--users', '100'), 10);
const CONCURRENCY = parseInt(getArg('--concurrency', '100'), 10);
const VERBOSE = args.includes('--verbose');

// ─── 간단한 fetch 구현 (Node.js 18+ 내장 fetch 사용, 없으면 http/https) ──────
const nodeFetch = typeof fetch !== 'undefined' ? fetch : async (url, opts = {}) => {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const transport = u.protocol === 'https:' ? https : http;
    const body = opts.body || null;
    const req = transport.request({
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers: opts.headers || {},
    }, (r) => {
      let data = '';
      r.on('data', chunk => data += chunk);
      r.on('end', () => {
        const ok = r.statusCode >= 200 && r.statusCode < 300;
        resolve({
          status: r.statusCode,
          ok,
          headers: { get: (h) => r.headers[h.toLowerCase()] },
          json: () => Promise.resolve(JSON.parse(data)),
          text: () => Promise.resolve(data),
        });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
};

// ─── 단일 사용자 입장 시뮬레이션 ───────────────────────────────────────────────
async function simulateOneUser(userIndex) {
  const nickname = `테스트유저_${Date.now()}_${userIndex}`;
  const deviceSecret = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  const startAt = performance.now();
  let retries503 = 0;

  // Step 1: 프로필 INSERT (신규 가입)
  let insertMs = 0;
  let insertOk = false;
  {
    const t0 = performance.now();
    let attempt = 0;
    const MAX_RETRIES = 3;
    while (attempt <= MAX_RETRIES) {
      try {
        const resp = await nodeFetch(`${BASE_URL}/op`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            table: 'profiles',
            op: 'insert',
            filters: [], orders: [], payload: {
              nickname,
              bio: '스트레스 테스트',
              photo_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(nickname)}`,
              personality_score: 50,
              dom_sub_score: 50,
              mbti: 'ISTJ',
              birth_year: 1995,
              birth_month: 6,
              birth_day: 15,
              location: '서울',
              interests: '음악',
              contact_private: false,
              kakao_id: null,
              instagram_id: null,
              phone_number: null,
              pin_code: String(1000 + Math.floor(Math.random() * 9000)),
              _device_secret: deviceSecret,
            },
            conflictCols: [],
            selectAfterWrite: true,
            single: true,
          }),
        });
        if (resp.status === 503) {
          retries503++;
          attempt++;
          const retryAfter = parseInt(resp.headers.get('Retry-After') ?? '1', 10);
          await new Promise(r => setTimeout(r, Math.min(retryAfter * 1000, 4000)));
          continue;
        }
        if (resp.ok) {
          const body = await resp.json();
          insertOk = !body.error;
        }
        break;
      } catch (e) {
        attempt++;
        if (attempt > MAX_RETRIES) break;
        await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
      }
    }
    insertMs = performance.now() - t0;
  }

  // Step 2: 프로필 목록 SELECT (loadProfiles 시뮬레이션)
  let loadMs = 0;
  let loadOk = false;
  {
    const t0 = performance.now();
    let attempt = 0;
    const MAX_RETRIES = 3;
    while (attempt <= MAX_RETRIES) {
      try {
        const resp = await nodeFetch(`${BASE_URL}/op`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            table: 'profiles',
            op: 'select',
            filters: [], orders: [{ col: 'created_at', asc: false }],
          }),
        });
        if (resp.status === 503) {
          retries503++;
          attempt++;
          const retryAfter = parseInt(resp.headers.get('Retry-After') ?? '1', 10);
          await new Promise(r => setTimeout(r, Math.min(retryAfter * 1000, 4000)));
          continue;
        }
        if (resp.ok) {
          const body = await resp.json();
          loadOk = Array.isArray(body.data);
        }
        break;
      } catch (e) {
        attempt++;
        if (attempt > MAX_RETRIES) break;
        await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
      }
    }
    loadMs = performance.now() - t0;
  }

  const totalMs = performance.now() - startAt;
  return { userIndex, insertOk, loadOk, insertMs, loadMs, totalMs, retries503 };
}

// ─── 병렬 실행 헬퍼 ───────────────────────────────────────────────────────────
async function runWithConcurrency(tasks, concurrency) {
  const results = [];
  const queue = [...tasks];
  let inFlight = 0;

  return new Promise((resolve) => {
    function next() {
      while (inFlight < concurrency && queue.length > 0) {
        const task = queue.shift();
        inFlight++;
        task().then(result => {
          results.push(result);
          inFlight--;
          if (queue.length === 0 && inFlight === 0) resolve(results);
          else next();
        }).catch(err => {
          results.push({ error: String(err) });
          inFlight--;
          if (queue.length === 0 && inFlight === 0) resolve(results);
          else next();
        });
      }
    }
    next();
    if (queue.length === 0) resolve(results);
  });
}

// ─── 퍼센타일 계산 ───────────────────────────────────────────────────────────
function percentile(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

// ─── 메인 실행 ────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🚀 100명 동시 입장 시뮬레이션 시작`);
  console.log(`   대상: ${BASE_URL}`);
  console.log(`   사용자 수: ${TOTAL_USERS}명`);
  console.log(`   동시 실행: ${CONCURRENCY}명`);
  console.log('─'.repeat(60));

  const globalStart = performance.now();

  const tasks = Array.from({ length: TOTAL_USERS }, (_, i) => () => simulateOneUser(i + 1));
  const results = await runWithConcurrency(tasks, CONCURRENCY);

  const totalElapsed = performance.now() - globalStart;

  // ─── 집계 ───────────────────────────────────────────────────────────────────
  const validResults = results.filter(r => !r.error);
  const errors = results.filter(r => r.error);

  const insertSuccesses = validResults.filter(r => r.insertOk).length;
  const loadSuccesses   = validResults.filter(r => r.loadOk).length;
  const total503Retries = validResults.reduce((s, r) => s + (r.retries503 || 0), 0);

  const totalMsSorted   = validResults.map(r => r.totalMs).sort((a, b) => a - b);
  const insertMsSorted  = validResults.map(r => r.insertMs).sort((a, b) => a - b);
  const loadMsSorted    = validResults.map(r => r.loadMs).sort((a, b) => a - b);

  if (VERBOSE) {
    console.log('\n개별 결과:');
    validResults.forEach(r => {
      const icon = r.insertOk && r.loadOk ? '✅' : '❌';
      console.log(`  ${icon} 유저#${r.userIndex}: insert=${r.insertMs.toFixed(0)}ms load=${r.loadMs.toFixed(0)}ms total=${r.totalMs.toFixed(0)}ms retries503=${r.retries503}`);
    });
  }

  console.log('\n📊 결과 요약');
  console.log('─'.repeat(60));
  console.log(`총 사용자:        ${TOTAL_USERS}명`);
  console.log(`성공 (INSERT):    ${insertSuccesses}/${TOTAL_USERS} (${((insertSuccesses/TOTAL_USERS)*100).toFixed(1)}%)`);
  console.log(`성공 (LOAD):      ${loadSuccesses}/${TOTAL_USERS} (${((loadSuccesses/TOTAL_USERS)*100).toFixed(1)}%)`);
  console.log(`총 503 재시도:    ${total503Retries}회`);
  console.log(`에러:             ${errors.length}건`);
  console.log(`전체 소요 시간:   ${(totalElapsed / 1000).toFixed(2)}초`);
  console.log('\n응답 시간 분포 (전체 흐름):');
  console.log(`  p50:  ${percentile(totalMsSorted, 50).toFixed(0)}ms`);
  console.log(`  p95:  ${percentile(totalMsSorted, 95).toFixed(0)}ms`);
  console.log(`  p99:  ${percentile(totalMsSorted, 99).toFixed(0)}ms`);
  console.log(`  max:  ${Math.max(...totalMsSorted).toFixed(0)}ms`);
  console.log('\n응답 시간 분포 (INSERT):');
  console.log(`  p50:  ${percentile(insertMsSorted, 50).toFixed(0)}ms`);
  console.log(`  p95:  ${percentile(insertMsSorted, 95).toFixed(0)}ms`);
  console.log(`  max:  ${Math.max(...insertMsSorted).toFixed(0)}ms`);
  console.log('\n응답 시간 분포 (SELECT):');
  console.log(`  p50:  ${percentile(loadMsSorted, 50).toFixed(0)}ms`);
  console.log(`  p95:  ${percentile(loadMsSorted, 95).toFixed(0)}ms`);
  console.log(`  max:  ${Math.max(...loadMsSorted).toFixed(0)}ms`);

  // ─── 판정 ───────────────────────────────────────────────────────────────────
  const p95 = percentile(totalMsSorted, 95);
  const successRate = insertSuccesses / TOTAL_USERS;
  console.log('\n🎯 판정');
  console.log('─'.repeat(60));
  if (successRate >= 0.99 && p95 < 3000) {
    console.log('✅ PASS — 99% 이상 성공 + p95 < 3초');
  } else if (successRate >= 0.95 && p95 < 5000) {
    console.log('⚠️  MARGINAL — 95% 이상 성공이지만 p95 응답이 느림');
  } else {
    console.log('❌ FAIL — 성공률 미달 또는 p95 응답 초과');
    process.exit(1);
  }

  if (errors.length > 0) {
    console.log('\n오류 목록:');
    errors.forEach(e => console.log('  -', e.error));
  }
}

main().catch(err => {
  console.error('시뮬레이션 실행 오류:', err);
  process.exit(1);
});
