import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  SESSION_TOKEN_EXPIRY_SEC,
  SSE_TOKEN_EXPIRY_SEC,
  classifySseToken,
  issueSessionToken,
  issueSseToken,
  verifySessionToken,
  verifySseToken,
  validateAuthLoginBody,
  planAuthLoginDecision,
  authLoginDeviceMismatchReject,
  authLoginRateLimitedReject,
  AUTH_DEVICE_MISMATCH_MESSAGE,
  AUTH_LOGIN_RATE_LIMIT_MESSAGE,
} from './db-session-tokens.js';

const SECRET = 'unit-test-session-secret';

describe('db-session-tokens', () => {
  it('issueSessionToken verifies and rejects wrong user / tamper / expiry', () => {
    const now = 1_700_000_000;
    const { token, expiresAt } = issueSessionToken('u1', SECRET, now);
    expect(expiresAt).toBe(now + SESSION_TOKEN_EXPIRY_SEC);
    expect(verifySessionToken('u1', token, SECRET, now)).toBe(true);
    expect(verifySessionToken('u2', token, SECRET, now)).toBe(false);
    const [expPart, macPart] = token.split(':');
    const flipped = macPart[0] === '0' ? '1' : '0';
    const tampered = `${expPart}:${flipped}${macPart.slice(1)}`;
    expect(tampered).not.toBe(token);
    expect(verifySessionToken('u1', tampered, SECRET, now)).toBe(false);
    expect(verifySessionToken('u1', token, SECRET, expiresAt + 1)).toBe(false);
  });

  it('issueSseToken + classifySseToken distinguish valid / expired / invalid', () => {
    const now = 1_700_000_000;
    const { token, expiresAt } = issueSseToken('u1', SECRET, now);
    expect(expiresAt).toBe(now + SSE_TOKEN_EXPIRY_SEC);
    expect(classifySseToken('u1', token, SECRET, now)).toBe('valid');
    expect(verifySseToken('u1', token, SECRET, now)).toBe(true);
    expect(classifySseToken('u1', token, SECRET, expiresAt + 1)).toBe('expired');
    expect(verifySseToken('u1', token, SECRET, expiresAt + 1)).toBe(false);
    expect(classifySseToken('u1', 'not-a-token', SECRET, now)).toBe('invalid');
    expect(classifySseToken('u2', token, SECRET, now)).toBe('invalid');
  });

  it('HMAC payloads match prior db.ts wire format', () => {
    const now = 42;
    const session = issueSessionToken('abc', SECRET, now);
    const exp = now + SESSION_TOKEN_EXPIRY_SEC;
    const sessionMac = createHmac('sha256', SECRET).update(`session:abc:${exp}`).digest('hex');
    expect(session.token).toBe(`${exp}:${sessionMac}`);

    const sse = issueSseToken('abc', SECRET, now);
    const sseExp = now + SSE_TOKEN_EXPIRY_SEC;
    const sseMac = createHmac('sha256', SECRET).update(`abc:${sseExp}`).digest('hex');
    expect(sse.token).toBe(`${sseExp}:${sseMac}`);
  });
});

describe('db-auth-login (via session-tokens)', () => {
  it('validateAuthLoginBody accepts valid payload', () => {
    const r = validateAuthLoginBody({
      userId: 'u1',
      deviceSecret: 'sec',
      pinCode: '1234',
      testToken: 't',
    });
    expect(r).toEqual({
      ok: true,
      userId: 'u1',
      deviceSecret: 'sec',
      pinCode: '1234',
      testToken: 't',
    });
  });

  it('validateAuthLoginBody rejects bad shapes', () => {
    expect(validateAuthLoginBody(null).ok).toBe(false);
    expect(validateAuthLoginBody([]).ok).toBe(false);
    expect(validateAuthLoginBody({}).ok).toBe(false);
    expect(validateAuthLoginBody({ userId: 'u1' }).ok).toBe(false);
  });

  it('Korean DEVICE_MISMATCH + rate-limit messages preserved', () => {
    expect(authLoginDeviceMismatchReject()).toEqual({
      status: 401,
      body: {
        error: AUTH_DEVICE_MISMATCH_MESSAGE,
        code: 'DEVICE_MISMATCH',
      },
    });
    expect(authLoginRateLimitedReject().body.error).toBe(AUTH_LOGIN_RATE_LIMIT_MESSAGE);
  });

  it('planAuthLoginDecision covers first-claim / finish / rebind / deny', () => {
    expect(planAuthLoginDecision({
      hasExistingSecret: false, secretMatched: false, profilePin: '', providedPin: '', testOk: false,
    })).toEqual({ action: 'first-claim' });
    expect(planAuthLoginDecision({
      hasExistingSecret: true, secretMatched: true, profilePin: '1', providedPin: '2', testOk: false,
    })).toEqual({ action: 'finish' });
    expect(planAuthLoginDecision({
      hasExistingSecret: true, secretMatched: false, profilePin: '', providedPin: '', testOk: true,
    })).toEqual({ action: 'rebind', via: 'test-token' });
    expect(planAuthLoginDecision({
      hasExistingSecret: true, secretMatched: false, profilePin: '1234', providedPin: '1234', testOk: false,
    })).toEqual({ action: 'rebind', via: 'pin' });
    expect(planAuthLoginDecision({
      hasExistingSecret: true, secretMatched: false, profilePin: '1234', providedPin: '9999', testOk: false,
    })).toEqual({ action: 'deny' });
  });
});
