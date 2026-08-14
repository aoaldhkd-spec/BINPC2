#!/usr/bin/env node
/**
 * Rotate secrets that were exposed in chat:
 * - Supabase DB password (via SUPABASE_ACCESS_TOKEN or NEW_DATABASE_PASSWORD)
 * - Render DATABASE_URL env + redeploy
 * - Local artifacts/api-server/.env
 *
 * Render/Netlify API tokens must be created in each dashboard first, then:
 *   $env:RENDER_API_KEY="rnd_NEW..."
 *   $env:NETLIFY_AUTH_TOKEN="nfp_NEW..."   # optional, for Netlify redeploy only
 *   $env:SUPABASE_ACCESS_TOKEN="sbp_..."   # OR $env:NEW_DATABASE_PASSWORD="..."
 *   node scripts/rotate-exposed-secrets.mjs
 */
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ENV_PATH = resolve(ROOT, 'artifacts/api-server/.env');
const OUT_PATH = resolve(ROOT, 'artifacts/api-server/.security-credentials.txt');

const RENDER_API_KEY = process.env.RENDER_API_KEY?.trim();
const NETLIFY_AUTH_TOKEN = process.env.NETLIFY_AUTH_TOKEN?.trim();
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const NEW_DATABASE_PASSWORD = process.env.NEW_DATABASE_PASSWORD?.trim();
const RENDER_SERVICE_NAME = process.env.RENDER_SERVICE_NAME?.trim() || 'BINPC2';
const NETLIFY_SITE_NAME = process.env.NETLIFY_SITE_NAME?.trim() || 'binpc2';
const API_PUBLIC_URL = (process.env.API_PUBLIC_URL || 'https://binpc2.onrender.com').replace(/\/$/, '');
const SUPABASE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF?.trim() || 'dlliqqlqdtdkfakdtwyw';

function genDbPassword(bytes = 24) {
  return randomBytes(bytes).toString('base64url');
}

function loadEnvText() {
  if (!existsSync(ENV_PATH)) throw new Error(`Missing ${ENV_PATH}`);
  return readFileSync(ENV_PATH, 'utf8');
}

function getEnvValue(text, key) {
  return text.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim() ?? '';
}

function setEnvValue(text, key, value) {
  const line = `${key}=${value}`;
  return text.match(new RegExp(`^${key}=`, 'm'))
    ? text.replace(new RegExp(`^${key}=.*$`, 'm'), line)
    : `${text.trimEnd()}\n${line}\n`;
}

function buildPoolerUrl(password) {
  const user = `postgres.${SUPABASE_PROJECT_REF}`;
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres`;
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

async function supabaseResetPassword(password) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/password`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Supabase password reset → ${res.status}: ${body}`);
  return body ? JSON.parse(body) : {};
}

async function rotateDbPasswordLocal() {
  const { spawnSync } = await import('node:child_process');
  const script = resolve(ROOT, 'artifacts/api-server/scripts/rotate-db-password.mjs');
  const r = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'rotate-db-password failed');
  const envText = loadEnvText();
  return getEnvValue(envText, 'DATABASE_URL');
}

async function waitForRenderLive(serviceId, timeoutMs = 600_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const list = await renderFetch(`/services/${serviceId}/deploys?limit=1`);
    const deploy = list?.[0]?.deploy ?? list?.[0];
    const status = deploy?.status;
    process.stdout.write(`\r  [Render] deploy: ${status ?? 'unknown'}   `);
    if (status === 'live') {
      console.log('\n  [Render] deploy live');
      return;
    }
    if (['build_failed', 'update_failed', 'canceled'].includes(status)) {
      throw new Error(`Render deploy failed: ${status}`);
    }
    await new Promise((r) => setTimeout(r, 12_000));
  }
  throw new Error('Render deploy timed out');
}

async function verifyDb() {
  for (let i = 0; i < 12; i++) {
    const res = await fetch(`${API_PUBLIC_URL}/api/healthz`);
    if (res.ok) {
      console.log(`  [OK] ${API_PUBLIC_URL}/api/healthz`);
      return;
    }
    console.log(`  [wait] healthz ${res.status}, retry ${i + 1}/12`);
    await new Promise((r) => setTimeout(r, 10_000));
  }
  throw new Error('API health check failed after DATABASE_URL update');
}

async function main() {
  if (!RENDER_API_KEY) throw new Error('Set RENDER_API_KEY (use the NEW key after dashboard rotation)');

  let dbPassword = NEW_DATABASE_PASSWORD || genDbPassword();
  if (SUPABASE_ACCESS_TOKEN) {
    console.log('[1/4] Supabase DB password reset via Management API...');
    await supabaseResetPassword(dbPassword);
    console.log('  [OK] Supabase password updated (may take ~1 min to propagate)');
  } else if (!NEW_DATABASE_PASSWORD) {
    throw new Error('Set SUPABASE_ACCESS_TOKEN or NEW_DATABASE_PASSWORD');
  } else {
    console.log('[1/4] Using provided NEW_DATABASE_PASSWORD');
  }

  const databaseUrl = buildPoolerUrl(dbPassword);
  let envText = loadEnvText();
  envText = setEnvValue(envText, 'DATABASE_URL', databaseUrl);
  writeFileSync(ENV_PATH, envText, 'utf8');
  console.log('[2/4] Local .env DATABASE_URL updated');

  console.log('[3/4] Render DATABASE_URL + redeploy...');
  const list = await renderFetch('/services?limit=100');
  const svc = (Array.isArray(list) ? list.map((x) => x.service ?? x) : [])
    .find((s) => s.name === RENDER_SERVICE_NAME);
  if (!svc) throw new Error(`Render service ${RENDER_SERVICE_NAME} not found`);

  await renderFetch(`/services/${svc.id}/env-vars/${encodeURIComponent('DATABASE_URL')}`, {
    method: 'PUT',
    body: JSON.stringify({ value: databaseUrl }),
  });
  await renderFetch(`/services/${svc.id}/deploys`, {
    method: 'POST',
    body: JSON.stringify({ clearCache: 'do_not_clear' }),
  });
  await waitForRenderLive(svc.id);
  await verifyDb();

  if (NETLIFY_AUTH_TOKEN) {
    console.log('[4/4] Netlify redeploy (optional)...');
    const sites = await netlifyFetch('/sites?filter=all');
    const site = sites.find((s) => s.name === NETLIFY_SITE_NAME || s.subdomain === NETLIFY_SITE_NAME);
    if (site) {
      await netlifyFetch(`/sites/${site.id}/builds`, { method: 'POST', body: '{}' });
      console.log(`  [Netlify] build triggered for ${site.ssl_url}`);
    }
  } else {
    console.log('[4/4] Skipped Netlify (no NETLIFY_AUTH_TOKEN)');
  }

  const stamp = new Date().toISOString();
  const note = [
    '',
    `--- DB password rotation ${stamp} ---`,
    `Supabase project: ${SUPABASE_PROJECT_REF}`,
    `DATABASE_URL updated on Render + local .env`,
    `DB password (store in password manager, not git): ${dbPassword}`,
    'Revoke OLD Render rnd_... and Netlify nfp_... tokens from chat in each dashboard.',
  ].join('\n');
  appendFileSync(OUT_PATH, `${note}\n`, 'utf8');

  console.log('\nDone. New DB password saved to artifacts/api-server/.security-credentials.txt');
  console.log('Revoke the OLD Render/Netlify tokens that were pasted in chat.');
}

main().catch((err) => {
  console.error('\nRotation failed:', err.message);
  process.exit(1);
});
