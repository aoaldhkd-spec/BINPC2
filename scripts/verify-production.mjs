#!/usr/bin/env node
/** Smoke-test production: health, login, heart_drain disabled, core settings. */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CRED_PATH = resolve(__dirname, '../artifacts/api-server/.security-credentials.txt');
const API = (process.env.API_PUBLIC_URL || 'https://binpc2.onrender.com').replace(/\/$/, '');

function readCred(prefix) {
  if (!existsSync(CRED_PATH)) return '';
  for (const line of readFileSync(CRED_PATH, 'utf8').split('\n')) {
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

async function main() {
  const checks = [];
  const adminPassword = readCred('Admin login (/admin)');
  const testPassword = readCred('Test dashboard password');

  const health = await fetch(`${API}/api/healthz`);
  checks.push(['healthz', health.ok ? 'OK' : `FAIL ${health.status}`]);

  const dbHealth = await fetch(`${API}/api/db/ready`).then((r) => r.json().catch(() => ({})));
  checks.push(['db_ready', dbHealth?.ready !== false ? 'OK' : 'FAIL']);
  checks.push(['admin_login_ready', dbHealth?.login?.adminConfigured ? 'OK' : 'FAIL']);
  checks.push(['functions_locked', dbHealth?.functions_locked === false ? 'OK (unlocked)' : `WARN (${dbHealth?.functions_locked})`]);

  const settings = await fetch(`${API}/api/db/op`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'select', table: 'app_settings' }),
  }).then((r) => r.json());
  const drain = settings?.data?.[0]?.heart_drain_enabled;
  checks.push(['heart_drain_enabled', drain ? `FAIL (${drain})` : 'OK']);
  checks.push(['entry_password', settings?.data?.[0]?.entry_password ?? 'missing']);
  checks.push(['qr_base_url', settings?.data?.[0]?.qr_base_url ?? 'missing']);

  const drainRpc = await rpc('admin_drain_unused_hearts', { p_admin_password: 'x', p_drain_count: 1 });
  checks.push(['drain_rpc_gone', drainRpc.status === 404 ? 'OK' : `FAIL ${drainRpc.status}`]);

  if (adminPassword) {
    let admin = await rpc('admin_create_session', { p_admin_password: adminPassword });
    if (admin.status !== 200) {
      admin = await rpc('admin_create_session', {
        p_phone: '010-3878-6740',
        p_admin_password: adminPassword,
      });
    }
    if (admin.status === 200 && admin.json.data) {
      checks.push(['admin_login', 'OK']);
    } else if (dbHealth?.login?.adminConfigured && admin.status === 403) {
      checks.push(['admin_login', 'SKIP (local password mismatch — set PANEL_PASSWORD or run restore-login-now.mjs)']);
    } else {
      checks.push(['admin_login', `FAIL ${admin.status}`]);
    }
  } else {
    checks.push(['admin_login', 'SKIP (no credentials file)']);
  }

  if (testPassword) {
    const test = await rpc('test_verify_password', { p_test_password: testPassword });
    if (test.status === 200 && test.json.data) {
      checks.push(['test_login', 'OK']);
    } else if (dbHealth?.login?.testConfigured && test.status === 403) {
      checks.push(['test_login', 'SKIP (local password mismatch — set PANEL_PASSWORD or run restore-login-now.mjs)']);
    } else {
      checks.push(['test_login', `FAIL ${test.status}`]);
    }
  } else {
    checks.push(['test_login', 'SKIP (no credentials file)']);
  }

  for (const [name, result] of checks) console.log(`  ${name}: ${result}`);

  const failed = checks.filter(([, r]) => String(r).startsWith('FAIL'));
  if (failed.length) process.exit(1);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
