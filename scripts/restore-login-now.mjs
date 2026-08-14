#!/usr/bin/env node
/** Immediately restore admin/test passwords on live API via RPC (no redeploy). */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CRED_PATH = resolve(__dirname, '../artifacts/api-server/.security-credentials.txt');
const API_URL = (process.env.API_PUBLIC_URL || 'https://binpc2.onrender.com').replace(/\/$/, '');
const PANEL_PASSWORD = (process.env.PANEL_PASSWORD || '166606').trim();

function readCred(prefix) {
  if (!existsSync(CRED_PATH)) return '';
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
  const credAdmin = readCred('Admin login (/admin)');
  const credTest = readCred('Test dashboard password');
  const targetAdmin = PANEL_PASSWORD;
  const targetTest = PANEL_PASSWORD;

  const bootstrapCandidates = [
    credAdmin,
    credTest,
    targetAdmin,
    '166606',
    '116606',
    'Rg9JSp6MsIkrDN94KlulaQ',
    'aC-n37p7gPiFwTId',
  ].filter((v, i, a) => v && a.indexOf(v) === i);

  console.log(`[restore] setting admin/test → ${targetAdmin}`);
  let restored = false;
  for (const bootstrapPw of bootstrapCandidates) {
    const login = await rpc('admin_create_session', {
      p_phone: '010-3878-6740',
      p_admin_password: bootstrapPw,
    });
    if (login.status !== 200 || !login.json.data) {
      console.log(`  try ${bootstrapPw.slice(0, 4)}... failed (${login.status})`);
      continue;
    }
    const upd = await rpc('admin_update_settings', {
      p_admin_password: bootstrapPw,
      adminToken: login.json.data,
      p_payload: {
        admin_password: targetAdmin,
        test_password: targetTest,
        qr_base_url: 'https://binpc2.netlify.app',
      },
    });
    if (upd.status !== 200 || upd.json.error) {
      console.log(`  admin_update failed: ${upd.json.error?.message || upd.status}`);
      continue;
    }
    restored = true;
    break;
  }
  if (!restored) {
    console.error('[restore] could not update passwords — all bootstrap attempts failed');
    process.exit(1);
  }

  const admin = await rpc('admin_create_session', {
    p_phone: '010-3878-6740',
    p_admin_password: targetAdmin,
  });
  const test = await rpc('test_verify_password', { p_test_password: targetTest });
  console.log(`  admin login (${targetAdmin}): ${admin.status === 200 && admin.json.data ? 'OK' : 'FAIL'}`);
  console.log(`  test login (${targetTest}): ${test.status === 200 && test.json.data ? 'OK' : 'FAIL'}`);
  if (admin.status !== 200 || !admin.json.data || test.status !== 200 || !test.json.data) {
    process.exit(1);
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
