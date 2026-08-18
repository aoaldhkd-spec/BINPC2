/**
 * Load-test client aligned with current /api/db (login sessionToken, requesterId, conflictCols).
 */
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

export function createLoadClient(baseUrl = process.env.LOADTEST_BASE || 'http://localhost:8080/api/db') {
  const BASE = baseUrl.replace(/\/$/, '');
  const ADMIN_PW = (process.env.PANEL_PASSWORD || '116606').trim();

  async function req(method, path, body) {
    const t0 = performance.now();
    try {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body != null ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(12_000),
      });
      const latMs = performance.now() - t0;
      const json = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, latMs, json, data: json };
    } catch (e) {
      return { ok: false, status: 0, latMs: performance.now() - t0, error: e.message, json: {}, data: {} };
    }
  }

  async function login(userId, deviceSecret) {
    const r = await req('POST', '/auth/login', { userId, deviceSecret });
    return r.json?.sessionToken ?? null;
  }

  async function sseToken(userId, sessionToken) {
    const r = await req('POST', '/auth/sse-token', { userId, sessionToken });
    return r.json?.token ?? null;
  }

  /** Register profile + login; returns VU handle for op(). */
  async function registerVu(nickname, idx = 0) {
    const id = randomUUID();
    const deviceSecret = randomUUID();
    const reg = await req('POST', '/op', {
      op: 'insert',
      table: 'profiles',
      single: true,
      selectAfterWrite: true,
      payload: {
        id,
        nickname,
        created_at: new Date().toISOString(),
        personality_score: 50,
        birth_year: 1995 + (idx % 10),
        birth_month: (idx % 12) + 1,
        birth_day: (idx % 28) + 1,
        _device_secret: deviceSecret,
      },
    });
    if (!reg.ok || !reg.json?.data?.id) return null;
    const sessionToken = await login(id, deviceSecret);
    if (!sessionToken) return null;
    const token = await sseToken(id, sessionToken);
    return { id, deviceSecret, sessionToken, sseToken: token, nickname, pin_code: reg.json.data.pin_code };
  }

  async function op(vu, body) {
    return req('POST', '/op', {
      ...body,
      requesterId: vu.id,
      sessionToken: vu.sessionToken,
    });
  }

  async function rpc(name, args) {
    return req('POST', `/rpc/${name}`, args);
  }

  async function unreadCounts(vu) {
    if (!vu.sseToken) return req('GET', `/unread-counts?userId=${encodeURIComponent(vu.id)}`);
    return req('GET', `/unread-counts?userId=${encodeURIComponent(vu.id)}&token=${encodeURIComponent(vu.sseToken)}`);
  }

  return { BASE, ADMIN_PW, req, registerVu, op, rpc, login, sseToken, unreadCounts };
}

export function pct(arr, p) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length * p / 100)] ?? 0;
}

export function stats(label, samples, indent = '  ') {
  const s = [...samples].sort((a, b) => a - b);
  if (!s.length) {
    console.log(`${indent}${String(label).padEnd(36)}  (no samples)`);
    return;
  }
  const avg = s.reduce((a, b) => a + b, 0) / s.length;
  console.log(
    `${indent}${String(label).padEnd(36)}` +
    `  min=${s[0].toFixed(0)}ms  p50=${pct(s, 50).toFixed(0)}ms  p95=${pct(s, 95).toFixed(0)}ms` +
    `  max=${s[s.length - 1].toFixed(0)}ms  avg=${avg.toFixed(0)}ms  n=${s.length}`,
  );
}
