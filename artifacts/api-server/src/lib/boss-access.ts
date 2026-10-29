/** Temporary full-site access restriction, separate from laboratory and admission state. */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Request, Response, RequestHandler } from 'express';
import session, { type SessionData } from 'express-session';
import { deriveAdminToken } from './db-panel-tokens.js';
import { isDefaultPanelPassword } from './db-panel-secrets.js';
import { withVerifiedBossParticipation } from './boss-participation.js';

type Grant = { fingerprint: string; expires: number; nonce: string };
declare module 'express-session' { interface SessionData { bossAccessId?: string; bossGrant?: Grant } }
let ownerSettings: () => Record<string, unknown> = () => ({});
export function configureBossAccess(read: typeof ownerSettings) { ownerSettings = read; }
export function bossOnlyLocked() {
  // No relationship to test mode, theme, schedules or the 17:00 reset.
  return process.env.BOSS_ONLY_LOCK === '1' ||
    (process.env.NODE_ENV === 'production' && process.env.BOSS_PUBLIC_RELEASE !== 'explicit-owner-approved');
}
function credentials() {
  const s = ownerSettings();
  return { phone: String(s.admin_phone ?? '').replace(/\D/g, ''), password: String(s.admin_password ?? '').trim() };
}
function sign(value: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw Error('Session secret is required');
  return createHmac('sha256', secret).update('boss-access-v1\0').update(value).digest('hex');
}
function equal(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function fingerprint() { const c = credentials(); return sign(JSON.stringify(c)); }
function valid(grant?: Grant) {
  return !!grant && typeof grant.fingerprint === 'string' && typeof grant.nonce === 'string' && Number.isFinite(grant.expires) && grant.expires > Date.now() && equal(grant.fingerprint, fingerprint());
}
const streams = new Map<Response, { nonce: string; check: () => Promise<boolean>; queue: Promise<void>; pending: number }>();
function closeStream(res: Response) { streams.delete(res); res.end(); }
export function bossProtectedSseWrite(res: Response, chunk: string) {
  if (!bossOnlyLocked()) return res.write(chunk);
  const stream = streams.get(res);
  if (!stream) { res.end(); return false; }
  if (++stream.pending > 128) { closeStream(res); return false; }
  stream.queue = stream.queue.then(async () => {
    stream.pending--;
    if (res.writableEnded) return;
    if (!await stream.check() || res.writableEnded || !streams.has(res)) { closeStream(res); return; }
    if (!res.write(chunk)) closeStream(res);
  }).catch(() => closeStream(res));
  return true;
}
function ticket(req: Request) {
  const data = Buffer.from(JSON.stringify({ id: req.session.bossAccessId, expires: Date.now() + 120_000 })).toString('base64url');
  return data + '.' + sign('sse\0' + data);
}
async function authorizeStream(req: Request, res: Response) {
  const value = typeof req.query.bossTicket === 'string' ? req.query.bossTicket : '';
  const [data, mac, extra] = value.split('.');
  if (!data || !mac || extra || value.length > 1600 || !equal(mac, sign('sse\0' + data))) return false;
  let parsed: { id: string; expires: number };
  try { parsed = JSON.parse(Buffer.from(data, 'base64url').toString()); } catch { return false; }
  if (typeof parsed.id !== 'string' || !parsed.id.startsWith('boss-grant:') || !Number.isFinite(parsed.expires) || parsed.expires <= Date.now() || parsed.expires > Date.now() + 120_000) return false;
  // Re-read the existing session store before each data send: logout/revocation survives restart.
  const check = () => grantValid(req, parsed.id);
  if (!await check()) return false;
  streams.set(res, { nonce: parsed.id, check, queue: Promise.resolve(), pending: 0 });
  res.on('close', () => streams.delete(res));
  return true;
}
function grantValid(req: Request, id?: string) {
  if (!id?.startsWith('boss-grant:')) return Promise.resolve(false);
  return new Promise<boolean>(resolve => req.sessionStore.get(id, (err, data) => { try { resolve(!err && valid(data?.bossGrant)); } catch { resolve(false); } }));
}
function destroyGrant(req: Request, id?: string) {
  if (!id?.startsWith('boss-grant:')) return Promise.resolve();
  return new Promise<void>((resolve, reject) => req.sessionStore.destroy(id, err => err ? reject(err) : resolve()));
}
function save(req: Request) { return new Promise<void>((resolve, reject) => req.session.save(err => err ? reject(err) : resolve())); }
const message = '현재 테스트 중입니다';
export const bossAccessGate: RequestHandler = async (req, res, next) => {
  const path = req.path.toLowerCase().replace(/\/+$/, '');
  if (!/^\/api(?:\/|$)/.test(path)) return next();
  if (path === '/api/healthz' && ['GET', 'HEAD'].includes(req.method)) return next();
  res.setHeader('Cache-Control', 'private, no-store');
  res.vary('Cookie');
  try {
    if (path === '/api/boss-access' && req.method === 'GET') {
      const authorized = await grantValid(req, req.session?.bossAccessId);
      return void res.json({ locked: bossOnlyLocked(), authorized, message,
        ...(authorized ? { sseTicket: ticket(req), ticketExpiresAt: Date.now() + 120_000 } : {}) });
    }
    if (path === '/api/boss-access/login' && req.method === 'POST') {
      if (!req.is('application/json') || req.get('sec-fetch-site') === 'cross-site') return void res.status(403).json({ error: { code: 'ORIGIN', message: '같은 사이트에서 로그인해 주세요.' } });
      const c = credentials(), phone = String(req.body?.phone ?? '').replace(/\D/g, ''), password = String(req.body?.password ?? '').trim();
      if (!c.phone || !phone || !equal(phone, c.phone) || isDefaultPanelPassword(c.password) || !equal(password, c.password))
        return void res.status(403).json({ error: { code: 'BOSS_AUTH', message: '운영자 전화번호와 비밀번호를 확인해 주세요.' } });
      // Existing owner credentials only. Old admin/test tokens never create a grant.
      const previous = { userId: req.session.userId, hubOwner: req.session.hubOwner };
      await destroyGrant(req, req.session.bossAccessId);
      await new Promise<void>((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
      Object.assign(req.session, previous); // Retain the boss's own participant context, never touch other records.
      const id = 'boss-grant:' + randomUUID(), expires = Date.now() + 8 * 3600_000;
      const cookie = new session.Cookie(); cookie.expires = new Date(expires);
      const grant: SessionData = { cookie, bossGrant: { fingerprint: fingerprint(), expires, nonce: randomUUID() } };
      await new Promise<void>((resolve, reject) => req.sessionStore.set(id, grant, err => err ? reject(err) : resolve()));
      req.session.bossAccessId = id;
      await save(req);
      return void res.json({ adminToken: deriveAdminToken(c.password) });
    }
    if (path === '/api/boss-access/logout' && req.method === 'POST') {
      if (!req.is('application/json') || req.get('sec-fetch-site') === 'cross-site') return void res.sendStatus(403);
      const nonce = req.session?.bossAccessId;
      await destroyGrant(req, nonce); // A late save of an old ordinary session cannot resurrect this separate grant.
      delete req.session.bossAccessId;
      await save(req);
      for (const [client, stream] of streams) if (stream.nonce === nonce) closeStream(client);
      return void res.json({ ok: true });
    }
    if (!bossOnlyLocked()) return next();
    if (path === '/api/db/events' && req.method === 'GET') {
      if (await authorizeStream(req, res)) return next();
    } else if (await grantValid(req, req.session?.bossAccessId)) {
      if (path === '/api/db/push/self-test' || path === '/api/db/push/notify')
        return void res.status(423).json({ error: { code: 'BOSS_PUSH_PAUSED', message: '테스트 기간에는 외부 푸시 발송을 중지합니다.' } });
      return withVerifiedBossParticipation(next);
    }
    res.status(423).json({ data: null, error: { code: 'BOSS_ONLY', message } });
  } catch { res.status(503).json({ data: null, error: { code: 'ACCESS_CHECK_UNAVAILABLE', message: '접근 권한 확인 중입니다. 잠시 후 다시 시도해 주세요.' } }); }
};
