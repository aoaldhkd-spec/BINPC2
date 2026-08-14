#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CRED = resolve(dirname(fileURLToPath(import.meta.url)), '../artifacts/api-server/.security-credentials.txt');
const SITE = process.env.NETLIFY_SITE_NAME?.trim() || 'binpc2';

function readCred(prefix) {
  if (!existsSync(CRED)) throw new Error(`Missing ${CRED}`);
  for (const line of readFileSync(CRED, 'utf8').split('\n')) {
    if (line.startsWith(prefix)) return line.split(':').slice(1).join(':').trim();
  }
  return '';
}

async function main() {
  const token = process.env.NETLIFY_AUTH_TOKEN?.trim() || readCred('Netlify PAT (NEW)');
  if (!token) throw new Error('Netlify PAT missing');
  const sites = await fetch('https://api.netlify.com/api/v1/sites?filter=all', {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  const site = sites.find((s) => s.name === SITE || s.subdomain === SITE);
  if (!site) throw new Error(`Site ${SITE} not found`);
  const build = await fetch(`https://api.netlify.com/api/v1/sites/${site.id}/builds`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!build.ok) throw new Error(`Netlify build → ${build.status}`);
  console.log(`Netlify build triggered: ${site.ssl_url}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
