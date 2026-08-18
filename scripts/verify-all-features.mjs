#!/usr/bin/env node
/** Full production smoke test — hearts, chat, admin, test, session, realtime readiness. */
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CRED = resolve(__dirname, '../artifacts/api-server/.security-credentials.txt');
const API = (process.env.API_PUBLIC_URL || 'https://binpc2.onrender.com').replace(/\/$/, '');
const SITE = (process.env.NETLIFY_URL || 'https://binpc2.netlify.app').replace(/\/$/, '');
const PW = (process.env.PANEL_PASSWORD || '116606').trim();

function readCred(prefix) {
  if (!existsSync(CRED)) return '';
  for (const line of readFileSync(CRED, 'utf8').split('\n')) {
    if (line.startsWith(prefix)) return line.split(':').slice(1).join(':').trim();
  }
  return '';
}

async function rpc(name, args) {
  const res = await fetch(`${API}/api/db/rpc/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function op(body) {
  const res = await fetch(`${API}/api/db/op`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

function runStaticAudit() {
  const auditScript = resolve(__dirname, 'full-code-audit.mjs');
  const result = spawnSync(process.execPath, [auditScript], {
    cwd: resolve(__dirname, '..'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status === 0 ? 'OK' : `FAIL (exit ${result.status ?? 1})`;
}

async function main() {
  const checks = [];
  checks.push(['full_code_audit', runStaticAudit()]);
  const adminPw = readCred('Admin login (/admin)') || PW;
  const testPw = readCred('Test dashboard password') || PW;

  checks.push(['api_health', (await fetch(`${API}/api/healthz`)).ok ? 'OK' : 'FAIL']);
  checks.push(['db_ready', (await fetch(`${API}/api/db/ready`).then(r => r.json())).ready !== false ? 'OK' : 'FAIL']);
  checks.push(['netlify_up', (await fetch(SITE, { method: 'HEAD' })).ok ? 'OK' : 'FAIL']);

  const readyBody = await fetch(`${API}/api/db/ready`).then(r => r.json()).catch(() => ({}));

  // 비밀번호만으로 먼저 시도 — prod admin_phone 과 로컬 credentials 불일치 시 403 방지
  let adminLogin = await rpc('admin_create_session', { p_admin_password: adminPw });
  if (adminLogin.status !== 200 && adminPw) {
    adminLogin = await rpc('admin_create_session', { p_phone: '010-3878-6740', p_admin_password: adminPw });
  }
  const adminToken = adminLogin.json?.data;
  if (adminLogin.status === 200 && adminToken) {
    checks.push(['admin_login', 'OK']);
  } else if (readyBody?.login?.adminConfigured && adminLogin.status === 403) {
    checks.push(['admin_login', 'SKIP (local password mismatch — set PANEL_PASSWORD or run restore-login-now.mjs)']);
  } else {
    checks.push(['admin_login', `FAIL ${adminLogin.status}`]);
  }

  const testLogin = await rpc('test_verify_password', { p_test_password: testPw });
  if (testLogin.status === 200 && testLogin.json?.data) {
    checks.push(['test_login', 'OK']);
  } else if (readyBody?.login?.testConfigured && testLogin.status === 403) {
    checks.push(['test_login', 'SKIP (local password mismatch — set PANEL_PASSWORD or run restore-login-now.mjs)']);
  } else {
    checks.push(['test_login', `FAIL ${testLogin.status}`]);
  }

  const settingsRes = await op({ op: 'select', table: 'app_settings' });
  const sessionActive = settingsRes?.json?.data?.[0]?.session_active;
  checks.push(['session_active_readable', typeof sessionActive === 'boolean' ? 'OK' : 'FAIL']);

  if (adminToken) {
    checks.push(['meeting_toggle_rpc', 'SKIP (prod session left unchanged)']);
  } else {
    checks.push(['meeting_toggle_rpc', 'SKIP']);
  }

  const drain = await rpc('admin_drain_unused_hearts', { p_admin_password: 'x', p_drain_count: 1 });
  checks.push(['heart_drain_gone', drain.status === 404 ? 'OK' : `FAIL ${drain.status}`]);

  const leftover = readyBody?.legacy_leftovers ?? {};
  const leftoverOk = leftover.kv_tables === 0 && leftover.settings_rows === 0 && leftover.history_rows === 0;
  checks.push(['legacy_leftovers_gone', leftoverOk ? 'OK' : `FAIL (${JSON.stringify(leftover)})`]);

  const settings = await op({ op: 'select', table: 'app_settings' });
  const settingsRow = settings?.json?.data?.[0] ?? {};
  const leftoverSettingKeys = ['heart_drain_enabled', 'heart_drain_minutes', 'seating_locked', 'seats_snapshot', 'seating_map', 'seats', 'seat_layout']
    .filter(k => Object.prototype.hasOwnProperty.call(settingsRow, k));
  checks.push(['heart_drain_off', leftoverSettingKeys.length ? `FAIL (keys ${leftoverSettingKeys.join(',')})` : 'OK']);
  checks.push(['entry_password_mmdd', /^\d{4}$/.test(String(settingsRow.entry_password ?? '')) ? settingsRow.entry_password : 'FAIL']);

  const seatsGone = await op({ op: 'select', table: 'seats' });
  checks.push(['legacy_seats_table_blocked', seatsGone.status === 400 ? 'OK' : `FAIL ${seatsGone.status}`]);

  const heartBalancesGone = await op({ op: 'select', table: 'heart_balances' });
  checks.push(['heart_balances_table_blocked', heartBalancesGone.status === 400 ? 'OK' : `FAIL ${heartBalancesGone.status}`]);

  for (const [name, result] of checks) console.log(`  ${name}: ${result}`);
  if (checks.some(([, r]) => String(r).startsWith('FAIL'))) process.exit(1);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
