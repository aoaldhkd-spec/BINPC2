/**
 * User session + SSE bearer HMAC tokens — extracted from routes/db.ts.
 * Pure given secret + clock; Express resolveAuthUserId / finishLogin stay in db.ts.
 * Also hosts /auth/login body validate + device-secret decision planners.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SSE_TOKEN_EXPIRY_SEC = 3600; // 1 hour
export const SESSION_TOKEN_EXPIRY_SEC = 7 * 24 * 60 * 60; // 7 days — cookie 대체·Netlify 프록시 대응

export type SseTokenState = 'valid' | 'expired' | 'invalid';

export function issueSessionToken(
  userId: string,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): { token: string; expiresAt: number } {
  const exp = nowSec + SESSION_TOKEN_EXPIRY_SEC;
  const mac = createHmac('sha256', secret)
    .update(`session:${userId}:${exp}`)
    .digest('hex');
  return { token: `${exp}:${mac}`, expiresAt: exp };
}

export function verifySessionToken(
  userId: string,
  token: string,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): boolean {
  const colonIdx = token.indexOf(':');
  if (colonIdx < 1) return false;
  const expStr = token.slice(0, colonIdx);
  const mac = token.slice(colonIdx + 1);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || nowSec > exp) return false;
  const expected = createHmac('sha256', secret)
    .update(`session:${userId}:${expStr}`)
    .digest('hex');
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(mac, 'hex'));
  } catch {
    return false;
  }
}

export function issueSseToken(
  userId: string,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): { token: string; expiresAt: number } {
  const exp = nowSec + SSE_TOKEN_EXPIRY_SEC;
  const mac = createHmac('sha256', secret)
    .update(`${userId}:${exp}`)
    .digest('hex');
  return { token: `${exp}:${mac}`, expiresAt: exp };
}

/**
 * SSE 토큰 상태 구분.
 *
 * `expired` = 서명은 이 서버 비밀키로 정상 검증되지만 exp 가 지난 것 → 정상 사용자의
 * 토큰 갱신 실패다. `invalid` = 서명 불일치·형식 오류 → 위조 시도일 수 있다.
 * 둘을 섞어 warn 으로 남기면 만료 스팸에 묻혀 진짜 침입 신호를 놓친다.
 */
export function classifySseToken(
  userId: string,
  token: string,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): SseTokenState {
  const colonIdx = token.indexOf(':');
  if (colonIdx < 1) return 'invalid';
  const expStr = token.slice(0, colonIdx);
  const mac = token.slice(colonIdx + 1);
  const exp = Number(expStr);
  if (!Number.isFinite(exp)) return 'invalid';
  const expected = createHmac('sha256', secret)
    .update(`${userId}:${exp}`)
    .digest('hex');
  let signatureOk = false;
  try {
    signatureOk = timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(mac, 'hex'));
  } catch {
    return 'invalid';
  }
  if (!signatureOk) return 'invalid';
  return nowSec > exp ? 'expired' : 'valid';
}

export function verifySseToken(
  userId: string,
  token: string,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): boolean {
  return classifySseToken(userId, token, secret, nowSec) === 'valid';
}

export type AuthLoginReject = {
  status: number;
  body: Record<string, unknown>;
};

export type AuthLoginBodyOk = {
  ok: true;
  userId: string;
  deviceSecret: string;
  pinCode: string | undefined;
  testToken: string | undefined;
};

export type AuthLoginBodyResult = AuthLoginBodyOk | { ok: false; reject: AuthLoginReject };

export const AUTH_DEVICE_MISMATCH_MESSAGE =
  '이미 다른 기기에서 등록된 계정입니다. 고유번호(PIN)로 프로필 복구를 이용해 주세요.';

export const AUTH_LOGIN_RATE_LIMIT_MESSAGE =
  '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.';

export const AUTH_LOGIN_BUSY_MESSAGE = '요청이 너무 많습니다.';

export const AUTH_LOGIN_INTERNAL_MESSAGE = '로그인 처리 중 오류가 발생했습니다.';

export function authLoginInvalidBodyReject(): AuthLoginReject {
  return { status: 400, body: { error: 'Request body must be a JSON object' } };
}

export function authLoginMissingUserIdReject(): AuthLoginReject {
  return { status: 400, body: { error: 'Missing userId' } };
}

export function authLoginMissingDeviceSecretReject(): AuthLoginReject {
  return { status: 400, body: { error: 'Missing deviceSecret' } };
}

export function authLoginUnknownUserReject(): AuthLoginReject {
  return { status: 401, body: { error: 'Unknown userId' } };
}

export function authLoginDeviceMismatchReject(): AuthLoginReject {
  return {
    status: 401,
    body: {
      error: AUTH_DEVICE_MISMATCH_MESSAGE,
      code: 'DEVICE_MISMATCH',
    },
  };
}

export function authLoginRateLimitedReject(): AuthLoginReject {
  return { status: 429, body: { error: AUTH_LOGIN_RATE_LIMIT_MESSAGE } };
}

export function authLoginMapFullReject(): AuthLoginReject {
  return { status: 429, body: { error: AUTH_LOGIN_BUSY_MESSAGE } };
}

export function authLoginInternalReject(): AuthLoginReject {
  return { status: 500, body: { error: AUTH_LOGIN_INTERNAL_MESSAGE } };
}

/** Parse /auth/login JSON body; no crypto / store. */
export function validateAuthLoginBody(body: unknown): AuthLoginBodyResult {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, reject: authLoginInvalidBodyReject() };
  }
  const rec = body as Record<string, unknown>;
  const { userId, deviceSecret, pinCode, testToken } = rec as {
    userId?: unknown;
    deviceSecret?: unknown;
    pinCode?: unknown;
    testToken?: unknown;
  };
  if (!userId || typeof userId !== 'string') {
    return { ok: false, reject: authLoginMissingUserIdReject() };
  }
  if (!deviceSecret || typeof deviceSecret !== 'string') {
    return { ok: false, reject: authLoginMissingDeviceSecretReject() };
  }
  return {
    ok: true,
    userId,
    deviceSecret,
    pinCode: typeof pinCode === 'string' ? pinCode : undefined,
    testToken: typeof testToken === 'string' ? testToken : undefined,
  };
}

export type AuthLoginDecision =
  | { action: 'finish' }
  | { action: 'first-claim' }
  | { action: 'rebind'; via: 'test-token' | 'pin' }
  | { action: 'deny' };

/**
 * Decide login outcome after HMAC compare.
 * `secretMatched` is computed in db.ts (timingSafeEqual); this planner stays pure.
 */
export function planAuthLoginDecision(input: {
  hasExistingSecret: boolean;
  secretMatched: boolean;
  profilePin: string;
  providedPin: string;
  testOk: boolean;
}): AuthLoginDecision {
  if (!input.hasExistingSecret) return { action: 'first-claim' };
  if (input.secretMatched) return { action: 'finish' };
  if (input.testOk) return { action: 'rebind', via: 'test-token' };
  if (input.profilePin && input.providedPin && input.profilePin === input.providedPin) {
    return { action: 'rebind', via: 'pin' };
  }
  return { action: 'deny' };
}


export function authSseTokenUnauthReject(): AuthLoginReject {
  return { status: 401, body: { error: 'Not authenticated — call /auth/login first' } };
}

export function authSseTokenInternalReject(): AuthLoginReject {
  return { status: 500, body: { error: 'Internal server error' } };
}

/**
 * Resolve session user for /auth/sse-token (cookie session or body sessionToken).
 * Crypto verify is injected so this stays pure given booleans.
 */
export function planAuthSseTokenUser(input: {
  sessionUserId: string | null | undefined;
  bodyUserId: string | undefined;
  bodySessionToken: string | undefined;
  sessionTokenValid: boolean;
}): { ok: true; userId: string } | { ok: false } {
  let sessionUserId = input.sessionUserId ?? null;
  if (!sessionUserId && input.bodyUserId && input.bodySessionToken && input.sessionTokenValid) {
    sessionUserId = input.bodyUserId;
  }
  if (!sessionUserId) return { ok: false };
  return { ok: true, userId: sessionUserId };
}

export type ProfileDeviceSecretBind =
  | { action: 'none' }
  | { action: 'bind'; profileId: string; secretHash: string; strip: true };

/**
 * Profiles INSERT may include _device_secret (TOFU). Caller HMAC-hashes via injected fn.
 */
export function planProfileDeviceSecretBind(
  table: string,
  row: Record<string, unknown>,
  hashSecret: (secret: string) => string,
): ProfileDeviceSecretBind {
  if (table !== 'profiles' || typeof row._device_secret !== 'string') {
    return { action: 'none' };
  }
  const profileId = String(row.id ?? '');
  return {
    action: 'bind',
    profileId,
    secretHash: hashSecret(row._device_secret as string),
    strip: true,
  };
}

export function buildDeviceSecretRow(input: {
  id: string;
  userId: string;
  secretHash: string;
  createdAt: string;
}): Record<string, unknown> {
  return {
    id: input.id,
    user_id: input.userId,
    secret_hash: input.secretHash,
    created_at: input.createdAt,
  };
}

/**
 * Cookie session vs bearer sessionToken (PIN recovery / Netlify stale cookie).
 * Verified bearer wins over connect.sid — crypto verify injected.
 */
export function resolveAuthUserIdFromParts(input: {
  cookieUserId: string | null | undefined;
  bodySessionToken: unknown;
  bodyRequesterId: unknown;
  /** Precomputed: token && claimed && verifySessionToken(claimed, token) */
  sessionTokenValid: boolean;
}): string | null {
  const token = typeof input.bodySessionToken === 'string' ? input.bodySessionToken : null;
  const claimed = typeof input.bodyRequesterId === 'string' ? input.bodyRequesterId : null;
  if (token && claimed && input.sessionTokenValid) return claimed;
  if (input.cookieUserId) return String(input.cookieUserId);
  return null;
}

/** JSON body for successful /auth/login (session mutate stays in db.ts). */
export function buildLoginSuccessBody(
  userId: string,
  issueSessionToken: (userId: string) => { token: string; expiresAt: number },
): { ok: true; sessionToken: string; sessionExpiresAt: number } {
  const { token, expiresAt } = issueSessionToken(userId);
  return { ok: true, sessionToken: token, sessionExpiresAt: expiresAt };
}


/** HMAC-SHA256 hex of a client deviceSecret (TOFU /auth/login + profiles INSERT). */
export function hashDeviceSecret(secret: string, sessionSecret: string): string {
  return createHmac('sha256', sessionSecret).update(secret).digest('hex');
}

/** timingSafeEqual on hex hashes; length mismatch → false (never throws). */
export function deviceSecretHashesEqual(a: string, b: string): boolean {
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}
