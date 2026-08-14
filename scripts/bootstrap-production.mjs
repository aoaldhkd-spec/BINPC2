#!/usr/bin/env node
/**
 * Bootstrap production: set Render bootstrap env vars, redeploy, verify admin/test login.
 * Reads secrets from artifacts/api-server/.security-credentials.txt
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CRED_PATH = resolve(ROOT, 'artifacts/api-server/.security-credentials.txt');
const RENDER_SERVICE_ID = process.env.RENDER_SERVICE_ID?.trim() || 'srv-d9v9gme417fc73cf6gq0';
const API_URL = (process.env.API_PUBLIC_URL || 'https://binpc2.onrender.com').replace(/\/$/, '');

function readCred(labelPrefix) {
  if (!existsSync(CRED_PATH)) throw new Error(`Missing ${CRED_PATH}`);
  const text = readFileSync(CRED_PATH, 'utf8');
  for (const line of text.split('\n')) {
    if (line.startsWith(labelPrefix)) {
      return line.split(':').slice(1).join(':').trim();
    }
  }
  return '';
}

async function renderFetch(key, path, init = {}) {
  const res = await fetch(`https://api.render.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Render ${path} → ${res.status}: ${body}`);
  return body ? JSON.parse(body) : null;
}

async function rpc(name, args) {
  const res = await fetch(`${API_URL}/api/db/rpc/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function waitLive(key) {
  for (let i = 0; i < 30; i++) {
    const list = await renderFetch(key, `/services/${RENDER_SERVICE_ID}/deploys?limit=1`);
    const st = list?.[0]?.deploy?.status;
    process.stdout.write(`\r  deploy: ${st ?? 'unknown'}   `);
    if (st === 'live') { console.log(''); return; }
    if (['build_failed', 'update_failed', 'canceled'].includes(st)) throw new Error(st);
    await new Promise((r) => setTimeout(r, 10000));
  }
  throw new Error('deploy timeout');
}

async function main() {
  const renderKey = process.env.RENDER_API_KEY?.trim() || readCred('Render API key');
  const adminPw = readCred('Admin login (/admin)');
  const testPw = readCred('Test dashboard password');
  if (!renderKey || !adminPw || !testPw) throw new Error('Missing credentials in .security-credentials.txt');

  console.log('[1/3] Render bootstrap env...');
  for (const [key, value] of [
    ['BOOTSTRAP_ADMIN_PASSWORD', adminPw],
    ['BOOTSTRAP_TEST_PASSWORD', testPw],
  ]) {
    await renderFetch(renderKey, `/services/${RENDER_SERVICE_ID}/env-vars/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    });
    console.log(`  set ${key}`);
  }

  console.log('[2/3] Render redeploy...');
  await renderFetch(renderKey, `/services/${RENDER_SERVICE_ID}/deploys`, { method: 'POST', body: '{}' });
  await waitLive(renderKey);

  console.log('[3/3] Verify admin/test login...');
  for (let i = 0; i < 12; i++) {
    const admin = await rpc('admin_create_session', { p_phone: '010-3878-6740', p_admin_password: adminPw });
    const test = await rpc('test_verify_password', { p_test_password: testPw });
    if (admin.status === 200 && admin.json.data && test.status === 200 && test.json.data) {
      console.log('  admin login OK');
      console.log('  test login OK');
      return;
    }
    console.log(`  wait ${i + 1}/12 admin=${admin.error?.message || admin.status} test=${test.error?.message || test.status}`);
    await new Promise((r) => setTimeout(r, 8000));
  }
  throw new Error('login verification failed after deploy');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
