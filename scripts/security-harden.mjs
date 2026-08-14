#!/usr/bin/env node
/**
 * Production security hardening:
 * - Rotate Render SESSION_SECRET
 * - Change admin/test passwords on live API (if default still works)
 * - Redeploy Render (API-only build)
 *
 * Usage:
 *   $env:RENDER_API_KEY="rnd_..."
 *   node scripts/security-harden.mjs
 */
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ENV_PATH = resolve(ROOT, 'artifacts/api-server/.env');
const OUT_PATH = resolve(ROOT, 'artifacts/api-server/.security-credentials.txt');

const RENDER_API_KEY = process.env.RENDER_API_KEY?.trim();
const RENDER_SERVICE_NAME = process.env.RENDER_SERVICE_NAME?.trim() || 'BINPC2';
const API_URL = (process.env.API_PUBLIC_URL || 'https://binpc2.onrender.com').replace(/\/$/, '');
const OLD_ADMIN_PW = (process.env.OLD_ADMIN_PASSWORD || '116606').trim();

function genPassword(bytes = 18) {
  return randomBytes(bytes).toString('base64url');
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

async function rpc(name, args) {
  const res = await fetch(`${API_URL}/api/db/rpc/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  if (!RENDER_API_KEY) throw new Error('Set RENDER_API_KEY');

  const sessionSecret = genPassword(48);
  const adminPassword = genPassword(16);
  const testPassword = genPassword(12);

  const list = await renderFetch('/services?limit=100');
  const svc = (Array.isArray(list) ? list.map((x) => x.service ?? x) : [])
    .find((s) => s.name === RENDER_SERVICE_NAME);
  if (!svc) throw new Error(`Render service ${RENDER_SERVICE_NAME} not found`);

  await renderFetch(`/services/${svc.id}/env-vars/${encodeURIComponent('SESSION_SECRET')}`, {
    method: 'PUT',
    body: JSON.stringify({ value: sessionSecret }),
  });

  const build = 'corepack pnpm install && corepack pnpm --filter @workspace/api-server build';
  await renderFetch(`/services/${svc.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      serviceDetails: {
        env: 'node',
        buildCommand: build,
        startCommand: 'corepack pnpm --filter @workspace/api-server start',
      },
    }),
  });

  const pwUpdate = await rpc('admin_update_settings', {
    p_admin_password: OLD_ADMIN_PW,
    p_payload: {
      admin_password: adminPassword,
      test_password: testPassword,
      qr_base_url: 'https://binpc2.netlify.app',
    },
  });

  await renderFetch(`/services/${svc.id}/deploys`, {
    method: 'POST',
    body: JSON.stringify({ clearCache: 'do_not_clear' }),
  });

  if (existsSync(ENV_PATH)) {
    const text = readFileSync(ENV_PATH, 'utf8');
    const next = text.match(/^SESSION_SECRET=/m)
      ? text.replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET=${sessionSecret}`)
      : `${text.trimEnd()}\nSESSION_SECRET=${sessionSecret}\n`;
    writeFileSync(ENV_PATH, next, 'utf8');
  }

  const lines = [
    'BINPC2 security rotation — store safely, then delete this file.',
    `Generated: ${new Date().toISOString()}`,
    '',
    `Admin login (/admin): ${adminPassword}`,
    `Test dashboard password: ${testPassword}`,
    `Participant URL (QR): https://binpc2.netlify.app`,
    '',
    'Still required manually:',
    '- Supabase → Database → Reset password → update Render DATABASE_URL',
    '- Render → Account Settings → delete old API keys from chat',
    '- Netlify → User settings → revoke old access tokens from chat',
    '',
    `admin_update_settings: HTTP ${pwUpdate.status}`,
  ];
  writeFileSync(OUT_PATH, lines.join('\n') + '\n', 'utf8');

  console.log('[security] SESSION_SECRET rotated on Render');
  console.log('[security] Render redeploy triggered (API-only build)');
  console.log(`[security] New credentials saved to ${OUT_PATH}`);
  if (pwUpdate.status !== 200) {
    console.log('[security] WARN: admin password RPC failed — change /admin password manually');
  } else {
    console.log('[security] Admin + test passwords rotated on production DB');
  }
}

main().catch((err) => {
  console.error('[security] failed:', err.message);
  process.exit(1);
});
