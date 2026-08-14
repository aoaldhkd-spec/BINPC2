#!/usr/bin/env node
/** Immediately restore admin/test passwords on live API via RPC (no redeploy). */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CRED_PATH = resolve(__dirname, '../artifacts/api-server/.security-credentials.txt');
const API_URL = (process.env.API_PUBLIC_URL || 'https://binpc2.onrender.com').replace(/\/$/, '');

function readCred(prefix) {
  if (!existsSync(CRED_PATH)) throw new Error(`Missing ${CRED_PATH}`);
  for (const line of readFileSync(CRED_PATH, 'utf8').split('\n')) {
    if (line.startsWith(prefix)) return line.split(':').slice(1).join(':').trim();
  }
  return '';
}

async function rpc(name, args) {
  const res = await fetch(`${API_URL}/api/db/rpc/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function main() {
  const adminPassword = readCred('Admin login (/admin)');
  const testPassword = readCred('Test dashboard password');
  if (!adminPassword) throw new Error('Admin password missing in credentials file');

  console.log('[restore] trying login + admin_update_settings...');
  for (const bootstrapPw of [adminPassword, '116606']) {
    const login = await rpc('admin_create_session', {
      p_phone: '010-3878-6740',
      p_admin_password: bootstrapPw,
    });
    if (login.status !== 200 || !login.json.data) {
      console.log(`  bootstrap ${bootstrapPw.slice(0, 3)}... failed (${login.status})`);
      continue;
    }
    const upd = await rpc('admin_update_settings', {
      p_admin_password: bootstrapPw,
      adminToken: login.json.data,
      p_payload: {
        admin_password: adminPassword,
        test_password: testPassword,
        qr_base_url: 'https://binpc2.netlify.app',
      },
    });
    if (upd.status !== 200 || upd.json.error) {
      console.log(`  admin_update failed: ${upd.json.error?.message || upd.status}`);
      continue;
    }
    break;
  }

  const admin = await rpc('admin_create_session', {
    p_phone: '010-3878-6740',
    p_admin_password: adminPassword,
  });
  const test = await rpc('test_verify_password', { p_test_password: testPassword });
  console.log(`  admin login: ${admin.status === 200 && admin.json.data ? 'OK' : 'FAIL'}`);
  console.log(`  test login: ${test.status === 200 && test.json.data ? 'OK' : 'FAIL'}`);
  if (admin.status !== 200 || !admin.json.data || test.status !== 200 || !test.json.data) {
    process.exit(1);
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
