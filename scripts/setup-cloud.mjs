#!/usr/bin/env node
/**
 * BINPC2 cloud setup — Render (API) + Netlify (frontend)
 *
 * Usage (PowerShell):
 *   $env:RENDER_API_KEY="rnd_..."
 *   $env:NETLIFY_AUTH_TOKEN="nfp_..."
 *   node scripts/setup-cloud.mjs
 *
 * Optional:
 *   $env:RENDER_SERVICE_NAME="binpc2-api"
 *   $env:NETLIFY_SITE_NAME="incandescent-sherbet-1db1d5"
 *   $env:API_PUBLIC_URL="https://binpc2.onrender.com"
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ENV_PATH = resolve(ROOT, 'artifacts/api-server/.env');

const RENDER_API_KEY = process.env.RENDER_API_KEY?.trim();
const NETLIFY_AUTH_TOKEN = process.env.NETLIFY_AUTH_TOKEN?.trim();
const RENDER_SERVICE_NAME = process.env.RENDER_SERVICE_NAME?.trim() || 'BINPC2';
const NETLIFY_SITE_NAME = process.env.NETLIFY_SITE_NAME?.trim() || 'binpc2';
const API_PUBLIC_URL = (process.env.API_PUBLIC_URL || 'https://binpc2.onrender.com').replace(/\/$/, '');

function loadLocalEnv() {
  if (!existsSync(ENV_PATH)) {
    throw new Error(`Missing ${ENV_PATH} — run setup:env and set DATABASE_URL first.`);
  }
  const text = readFileSync(ENV_PATH, 'utf8');
  const get = (key) => text.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim() ?? '';
  return {
    DATABASE_URL: get('DATABASE_URL'),
    SESSION_SECRET: get('SESSION_SECRET'),
    NODE_OPTIONS: '--dns-result-order=ipv4first',
    NODE_ENV: 'production',
    PORT: '8080',
  };
}

async function renderFetch(path, init = {}) {
  const res = await fetch(`https://api.render.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${RENDER_API_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Render API ${path} → ${res.status}: ${body}`);
  return body ? JSON.parse(body) : null;
}

async function netlifyFetch(path, init = {}) {
  const res = await fetch(`https://api.netlify.com/api/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${NETLIFY_AUTH_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Netlify API ${path} → ${res.status}: ${body}`);
  return body ? JSON.parse(body) : null;
}

async function findRenderService() {
  const list = await renderFetch('/services?limit=100');
  const flat = Array.isArray(list) ? list.map((x) => x.service ?? x) : [];
  const svc = flat.find((s) => s.name === RENDER_SERVICE_NAME || s.slug === RENDER_SERVICE_NAME);
  if (!svc) {
    const names = flat.map((s) => s.name).join(', ') || '(none)';
    throw new Error(`Render service "${RENDER_SERVICE_NAME}" not found. Available: ${names}`);
  }
  return svc;
}

async function upsertRenderEnv(serviceId, key, value) {
  await renderFetch(`/services/${serviceId}/env-vars/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });
  console.log(`  [Render] set ${key}`);
}

async function triggerRenderDeploy(serviceId) {
  await renderFetch(`/services/${serviceId}/deploys`, {
    method: 'POST',
    body: JSON.stringify({ clearCache: 'do_not_clear' }),
  });
  console.log('  [Render] deploy triggered');
}

async function findNetlifySite() {
  const list = await netlifyFetch('/sites?filter=all');
  const site = list.find((s) => s.name === NETLIFY_SITE_NAME || s.subdomain === NETLIFY_SITE_NAME);
  if (!site) {
    const names = list.map((s) => s.name).join(', ') || '(none)';
    throw new Error(`Netlify site "${NETLIFY_SITE_NAME}" not found. Available: ${names}`);
  }
  return site;
}

async function upsertNetlifyEnv(accountId, siteId, key, value) {
  const existing = await netlifyFetch(`/accounts/${accountId}/env?site_id=${siteId}`);
  const row = existing.find((r) => r.key === key);
  const payload = [{
    key,
    scopes: ['builds', 'functions', 'runtime'],
    values: [{ value, context: 'all' }],
    is_secret: false,
  }];
  if (row) {
    await netlifyFetch(`/accounts/${accountId}/env/${encodeURIComponent(key)}?site_id=${siteId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  } else {
    await netlifyFetch(`/accounts/${accountId}/env?site_id=${siteId}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
  console.log(`  [Netlify] set ${key}=${value}`);
}

async function triggerNetlifyDeploy(siteId) {
  await netlifyFetch(`/sites/${siteId}/builds`, { method: 'POST', body: '{}' });
  console.log('  [Netlify] build triggered');
}

async function waitForRenderLive(serviceId, timeoutMs = 600_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const list = await renderFetch(`/services/${serviceId}/deploys?limit=1`);
    const deploy = list?.[0]?.deploy ?? list?.[0];
    const status = deploy?.status;
    process.stdout.write(`\r  [Render] deploy status: ${status ?? 'unknown'}   `);
    if (status === 'live') {
      console.log('\n  [Render] deploy live');
      return;
    }
    if (status === 'build_failed' || status === 'update_failed' || status === 'canceled') {
      throw new Error(`Render deploy failed: ${status}`);
    }
    await new Promise((r) => setTimeout(r, 15_000));
  }
  throw new Error('Render deploy timed out');
}

async function verifyApi() {
  const res = await fetch(`${API_PUBLIC_URL}/api/healthz`);
  if (!res.ok) throw new Error(`healthz ${res.status}`);
  console.log(`  [OK] ${API_PUBLIC_URL}/api/healthz`);
}

async function main() {
  if (!RENDER_API_KEY || !NETLIFY_AUTH_TOKEN) {
    console.error(`
BINPC2 cloud setup needs API tokens (one-time):

1) Render → Account Settings → API Keys → Create
   set: $env:RENDER_API_KEY="rnd_..."

2) Netlify → User settings → Applications → New access token
   set: $env:NETLIFY_AUTH_TOKEN="nfp_..."

Then run:
  node scripts/setup-cloud.mjs
`);
    process.exit(1);
  }

  const local = loadLocalEnv();
  if (!local.DATABASE_URL) throw new Error('DATABASE_URL empty in artifacts/api-server/.env');
  if (!local.SESSION_SECRET) throw new Error('SESSION_SECRET empty in artifacts/api-server/.env');

  console.log('=== Render: env + deploy ===');
  const svc = await findRenderService();
  console.log(`  service: ${svc.name} (${svc.id})`);

  for (const [key, value] of Object.entries(local)) {
    await upsertRenderEnv(svc.id, key, value);
  }
  await triggerRenderDeploy(svc.id);
  await waitForRenderLive(svc.id);
  await verifyApi();

  console.log('\n=== Netlify: API_URL + redeploy ===');
  const site = await findNetlifySite();
  console.log(`  site: ${site.name} (${site.ssl_url})`);
  await upsertNetlifyEnv(site.account_id, site.id, 'API_URL', API_PUBLIC_URL);
  await triggerNetlifyDeploy(site.id);

  console.log(`
Done.
  API:  ${API_PUBLIC_URL}
  App:  ${site.ssl_url}
  Admin: ${site.ssl_url}/admin

Next: open admin → QR tab → save ${site.ssl_url}
`);
}

main().catch((err) => {
  console.error('\nSetup failed:', err.message);
  process.exit(1);
});
