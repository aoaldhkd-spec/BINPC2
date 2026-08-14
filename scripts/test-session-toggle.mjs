#!/usr/bin/env node
/** Verify admin can toggle session_active on production. */
const API = (process.env.API_PUBLIC_URL || 'https://binpc2.onrender.com').replace(/\/$/, '');
const PW = (process.env.PANEL_PASSWORD || '116606').trim();

async function rpc(name, args) {
  const res = await fetch(`${API}/api/db/rpc/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function main() {
  const login = await rpc('admin_create_session', { p_phone: '010-3878-6740', p_admin_password: PW });
  if (!login.json.data) throw new Error(`login failed ${login.status}`);
  const token = login.json.data;

  const on = await rpc('admin_toggle_session', {
    adminToken: token,
    p_admin_password: PW,
    p_active: true,
  });
  if (on.status !== 200 || on.json.error) throw new Error(`session on failed: ${on.json.error?.message}`);

  const settings = await fetch(`${API}/api/db/op`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'select', table: 'app_settings' }),
  }).then(r => r.json());
  const active = settings?.data?.[0]?.session_active;
  console.log(`session_active after ON: ${active}`);

  const off = await rpc('admin_toggle_session', {
    adminToken: token,
    p_admin_password: PW,
    p_active: false,
  });
  if (off.status !== 200 || off.json.error) throw new Error(`session off failed`);

  console.log('meeting toggle: OK');
}

main().catch(e => { console.error(e.message); process.exit(1); });
