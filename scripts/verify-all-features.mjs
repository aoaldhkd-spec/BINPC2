#!/usr/bin/env node
/** Full production smoke test — hearts, chat, admin, test, session, realtime readiness. */
import { readFileSync, existsSync } from 'node:fs';
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

async function main() {
  const checks = [];
  const adminPw = readCred('Admin login (/admin)') || PW;
  const testPw = readCred('Test dashboard password') || PW;

  checks.push(['api_health', (await fetch(`${API}/api/healthz`)).ok ? 'OK' : 'FAIL']);
  checks.push(['db_ready', (await fetch(`${API}/api/db/ready`).then(r => r.json())).ready !== false ? 'OK' : 'FAIL']);
  checks.push(['netlify_up', (await fetch(SITE, { method: 'HEAD' })).ok ? 'OK' : 'FAIL']);

  const adminLogin = await rpc('admin_create_session', { p_phone: '010-3878-6740', p_admin_password: adminPw });
  const adminToken = adminLogin.json?.data;
  checks.push(['admin_login', adminLogin.status === 200 && adminToken ? 'OK' : `FAIL ${adminLogin.status}`]);

  const testLogin = await rpc('test_verify_password', { p_test_password: testPw });
  checks.push(['test_login', testLogin.status === 200 && testLogin.json?.data ? 'OK' : `FAIL ${testLogin.status}`]);

  if (adminToken) {
    const on = await rpc('admin_toggle_session', { adminToken, p_admin_password: adminPw, p_active: true });
    checks.push(['meeting_start', on.status === 200 && !on.json?.error ? 'OK' : `FAIL ${on.status}`]);
    const settings = await op({ op: 'select', table: 'app_settings' });
    checks.push(['session_active', settings?.json?.data?.[0]?.session_active === true ? 'OK' : 'FAIL']);
    await rpc('admin_toggle_session', { adminToken, p_admin_password: adminPw, p_active: false });
  } else {
    checks.push(['meeting_start', 'SKIP']);
    checks.push(['session_active', 'SKIP']);
  }

  const drain = await rpc('admin_drain_unused_hearts', { p_admin_password: 'x', p_drain_count: 1 });
  checks.push(['heart_drain_blocked', drain.status === 403 ? 'OK' : `FAIL ${drain.status}`]);

  const settings = await op({ op: 'select', table: 'app_settings' });
  checks.push(['heart_drain_off', settings?.json?.data?.[0]?.heart_drain_enabled === false ? 'OK' : 'FAIL']);
  checks.push(['entry_password_mmdd', /^\d{4}$/.test(String(settings?.json?.data?.[0]?.entry_password ?? '')) ? settings.json.data[0].entry_password : 'FAIL']);

  for (const [name, result] of checks) console.log(`  ${name}: ${result}`);
  if (checks.some(([, r]) => String(r).startsWith('FAIL'))) process.exit(1);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
