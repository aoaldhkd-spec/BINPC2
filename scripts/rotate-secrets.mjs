#!/usr/bin/env node
/**
 * Rotate SESSION_SECRET on Render + local .env, then redeploy.
 * Requires: RENDER_API_KEY, optional RENDER_SERVICE_NAME (default BINPC2)
 */
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ENV_PATH = resolve(ROOT, 'artifacts/api-server/.env');
const RENDER_API_KEY = process.env.RENDER_API_KEY?.trim();
const RENDER_SERVICE_NAME = process.env.RENDER_SERVICE_NAME?.trim() || 'BINPC2';

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

async function main() {
  if (!RENDER_API_KEY) throw new Error('Set RENDER_API_KEY');

  const secret = randomBytes(48).toString('base64url');
  const list = await renderFetch('/services?limit=100');
  const svc = (Array.isArray(list) ? list.map((x) => x.service ?? x) : [])
    .find((s) => s.name === RENDER_SERVICE_NAME);
  if (!svc) throw new Error(`Render service ${RENDER_SERVICE_NAME} not found`);

  await renderFetch(`/services/${svc.id}/env-vars/${encodeURIComponent('SESSION_SECRET')}`, {
    method: 'PUT',
    body: JSON.stringify({ value: secret }),
  });
  await renderFetch(`/services/${svc.id}/deploys`, {
    method: 'POST',
    body: JSON.stringify({ clearCache: 'do_not_clear' }),
  });

  if (existsSync(ENV_PATH)) {
    const text = readFileSync(ENV_PATH, 'utf8');
    const next = text.match(/^SESSION_SECRET=/m)
      ? text.replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET=${secret}`)
      : `${text.trimEnd()}\nSESSION_SECRET=${secret}\n`;
    writeFileSync(ENV_PATH, next, 'utf8');
  }

  console.log('[security] SESSION_SECRET rotated on Render + local .env');
  console.log('[security] Revoke exposed Render/Netlify API tokens in each dashboard');
  console.log('[security] Reset Supabase DB password, then update Render DATABASE_URL');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
