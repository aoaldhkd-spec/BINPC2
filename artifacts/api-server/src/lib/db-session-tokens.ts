/**
 * User session + SSE bearer HMAC tokens — extracted from routes/db.ts.
 * Pure given secret + clock; Express resolveAuthUserId / finishLogin stay in db.ts.
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
