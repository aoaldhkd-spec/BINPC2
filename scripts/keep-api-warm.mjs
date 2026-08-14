#!/usr/bin/env node
/** Ping Render API so free/starter instances stay warm (use with cron or GitHub Actions). */
const API = (process.env.API_PUBLIC_URL || 'https://binpc2.onrender.com').replace(/\/$/, '');
const SITE = (process.env.NETLIFY_URL || 'https://binpc2.netlify.app').replace(/\/$/, '');

const TARGETS = [
  `${API}/api/healthz`,
  `${API}/api/db/ready`,
  `${SITE}/api/healthz`,
];

let failed = false;
for (const url of TARGETS) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const ms = Date.now() - t0;
    const ok = res.ok ? 'ok' : 'warn';
    console.log(`[${ok}] ${res.status} ${url} (${ms}ms)`);
    if (!res.ok) failed = true;
  } catch (e) {
    failed = true;
    console.error(`[fail] ${url}:`, e instanceof Error ? e.message : e);
  }
}
process.exit(failed ? 1 : 0);
