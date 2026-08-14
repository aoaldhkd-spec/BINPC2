#!/usr/bin/env node
/**
 * Revoke automation tokens exposed in chat and mint replacements stored locally only.
 *
 * Usage (reads current tokens from env or .security-credentials.txt):
 *   $env:SUPABASE_ACCESS_TOKEN="sbp_..."   # current, used to attempt Supabase revoke if API allows
 *   $env:NETLIFY_AUTH_TOKEN="nfp_..."      # current Netlify PAT
 *   $env:RENDER_API_KEY="rnd_..."          # current Render key (verify only; revoke is dashboard-only)
 *   node scripts/revoke-exposed-tokens.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_PATH = resolve(ROOT, 'artifacts/api-server/.security-credentials.txt');

// Never commit real token strings — pass exposed prefixes via env if needed.
const EXPOSED_NETLIFY_PREFIXES = (process.env.EXPOSED_NETLIFY_PREFIXES || '').split(',').filter(Boolean);
const EXPOSED_RENDER_PREFIXES = (process.env.EXPOSED_RENDER_PREFIXES || '').split(',').filter(Boolean);
const EXPOSED_SBP_PREFIXES = (process.env.EXPOSED_SBP_PREFIXES || '').split(',').filter(Boolean);

function readCred(key) {
  if (process.env[key]?.trim()) return process.env[key].trim();
  if (!existsSync(OUT_PATH)) return '';
  const text = readFileSync(OUT_PATH, 'utf8');
  const map = {
    NETLIFY_AUTH_TOKEN: /Netlify PAT \(NEW\):\s*(\S+)/,
    RENDER_API_KEY: /Render API key[^:]*:\s*(\S+)/,
    SUPABASE_ACCESS_TOKEN: /Supabase access token[^:]*:\s*(\S+)/,
  };
  return text.match(map[key])?.[1]?.trim() ?? '';
}

async function netlifyFetch(token, path, init = {}) {
  const res = await fetch(`https://api.netlify.com/api/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Netlify ${path} → ${res.status}: ${body}`);
  return body ? JSON.parse(body) : null;
}

async function netlifyInternalFetch(token, path, init = {}) {
  const res = await fetch(`https://app.netlify.com/access-control/bb-api/api/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Netlify internal ${path} → ${res.status}: ${body}`);
  return body ? JSON.parse(body) : null;
}

async function rotateNetlify(oldToken) {
  console.log('[Netlify] mint replacement PAT...');
  const created = await netlifyInternalFetch(oldToken, '/oauth/applications/create_token', {
    method: 'POST',
    body: JSON.stringify({ name: `binpc2-${new Date().toISOString().slice(0, 10)}`, administrator_id: null }),
  });
  const newToken = created?.token?.id || created?.token?.access_token;
  if (!newToken) throw new Error('Netlify create_token returned no token');

  console.log('[Netlify] list PAT apps...');
  const apps = await netlifyInternalFetch(newToken, '/oauth/applications');
  for (const app of apps) {
    const isBinpc = /^binpc2/i.test(app.name || '');
    const isOldExposed = EXPOSED_NETLIFY_PREFIXES.some((p) => (app.client_id || '').includes(p.slice(4, 12)));
    if (isBinpc || isOldExposed) {
      if (app.id === created.application?.id) continue;
      await netlifyInternalFetch(newToken, `/oauth/applications/${app.id}`, { method: 'DELETE' });
      console.log(`  [Netlify] revoked app: ${app.name}`);
    }
  }

  await netlifyFetch(newToken, '/user').then((u) => console.log(`  [Netlify] new token ok (${u.email || u.slug})`));
  return newToken;
}

async function verifyRender(key) {
  const res = await fetch('https://api.render.com/v1/owners?limit=1', {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Render key invalid: ${res.status}`);
  console.log('[Render] current key valid — public API has no revoke endpoint; revoke exposed keys in dashboard manually');
  if (EXPOSED_RENDER_PREFIXES.some((p) => key.startsWith(p.slice(0, 8)))) {
    console.warn('[Render] WARNING: current RENDER_API_KEY still matches an exposed prefix — create a fresh key in dashboard');
  }
}

async function verifySupabase(sbp) {
  const res = await fetch('https://api.supabase.com/v1/projects', {
    headers: { Authorization: `Bearer ${sbp}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Supabase token invalid: ${res.status}`);
  console.log('[Supabase] current sbp token valid — PAT revoke/list is dashboard-only via Account → Access Tokens');
  if (EXPOSED_SBP_PREFIXES.some((p) => sbp.startsWith(p.slice(0, 12)))) {
    console.warn('[Supabase] WARNING: current SUPABASE_ACCESS_TOKEN was pasted in chat — revoke at https://supabase.com/dashboard/account/tokens and create a new one');
  }
}

function updateCredentials(patch) {
  let text = existsSync(OUT_PATH) ? readFileSync(OUT_PATH, 'utf8') : '';
  const stamp = new Date().toISOString();
  const block = [
    '',
    `--- Token rotation ${stamp} ---`,
    ...Object.entries(patch).map(([k, v]) => `${k}: ${v}`),
    'Revoke exposed chat tokens in Render dashboard + Supabase Access Tokens if still active.',
  ].join('\n');

  if (!text.trim()) {
    text = `BINPC2 security credentials — store safely, then delete this file.\nLast updated: ${stamp}\n${block}\n`;
  } else {
    text = text.replace(/\n--- Token rotation[\s\S]*?(?=\n--- |\nAdmin login|$)/, `\n${block}\n`);
    if (!text.includes('--- Token rotation')) text += block + '\n';
    for (const [k, v] of Object.entries(patch)) {
      const re = new RegExp(`^${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:.*$`, 'm');
      if (re.test(text)) text = text.replace(re, `${k}: ${v}`);
      else text = text.replace(/(--- Automation tokens[^\n]*\n)/, `$1${k}: ${v}\n`);
    }
    if (/^Last updated:/m.test(text)) {
      text = text.replace(/^Last updated:.*$/m, `Last updated: ${stamp}`);
    }
  }
  writeFileSync(OUT_PATH, text, 'utf8');
  console.log(`\nUpdated ${OUT_PATH}`);
}

async function main() {
  const netlifyOld = readCred('NETLIFY_AUTH_TOKEN') || process.env.NETLIFY_AUTH_TOKEN?.trim();
  const renderKey = readCred('RENDER_API_KEY') || process.env.RENDER_API_KEY?.trim();
  const sbp = readCred('SUPABASE_ACCESS_TOKEN') || process.env.SUPABASE_ACCESS_TOKEN?.trim();

  const patch = {};

  if (netlifyOld) {
    const newNetlify = await rotateNetlify(netlifyOld);
    patch['Netlify PAT (NEW)'] = newNetlify;
    patch['Netlify PAT (OLD from chat)'] = 'REVOKED';
  } else {
    console.log('[Netlify] skipped — no NETLIFY_AUTH_TOKEN');
  }

  if (renderKey) await verifyRender(renderKey);
  else console.log('[Render] skipped — no RENDER_API_KEY');

  if (sbp) await verifySupabase(sbp);
  else console.log('[Supabase] skipped — no SUPABASE_ACCESS_TOKEN');

  if (Object.keys(patch).length) updateCredentials(patch);

  console.log('\nManual (no public API):');
  console.log('  Render → https://dashboard.render.com/u/settings#api-keys → revoke rnd_0M4X... and rnd_FNcD... if listed');
  console.log('  Supabase → https://supabase.com/dashboard/account/tokens → revoke sbp_14097... → Generate new → save to .security-credentials.txt only');
}

main().catch((err) => {
  console.error('\nFailed:', err.message);
  process.exit(1);
});
