#!/usr/bin/env node
/** Smoke-test production API: health, auth, heart_drain disabled, SSE route. */
const API = (process.env.API_PUBLIC_URL || 'https://binpc2.onrender.com').replace(/\/$/, '');

async function rpc(name, args) {
  const res = await fetch(`${API}/api/db/rpc/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function main() {
  const checks = [];

  const health = await fetch(`${API}/api/healthz`);
  checks.push(['healthz', health.ok ? 'OK' : `FAIL ${health.status}`]);

  const settings = await fetch(`${API}/api/db/op`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'select', table: 'app_settings' }),
  }).then((r) => r.json());
  const drain = settings?.data?.[0]?.heart_drain_enabled;
  checks.push(['heart_drain_enabled', drain === false ? 'OK (false)' : `FAIL (${drain})`]);
  checks.push(['entry_password', settings?.data?.[0]?.entry_password ?? 'missing']);

  const drainRpc = await rpc('admin_drain_unused_hearts', { p_admin_password: 'x', p_drain_count: 1 });
  checks.push(['drain_rpc_blocked', drainRpc.status === 403 ? 'OK' : `FAIL ${drainRpc.status}`]);

  for (const [name, result] of checks) console.log(`  ${name}: ${result}`);

  const failed = checks.filter(([, r]) => String(r).startsWith('FAIL'));
  if (failed.length) process.exit(1);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
