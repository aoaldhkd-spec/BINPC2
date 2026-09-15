import { describe, expect, it } from 'vitest';
import {
  maskNicknameForPinConfirm,
  pinLookupNotFoundReject,
  pinNicknameMismatchReject,
  pinRateLimitedReject,
  validateByPinBody,
} from './db-pin-lookup.js';

describe('db-pin-lookup', () => {
  it('validateByPinBody', () => {
    expect(validateByPinBody(null, null).ok).toBe(false);
    expect(validateByPinBody('1234', null)).toEqual({ ok: true, pin: '1234', nickname: null });
    expect(validateByPinBody('1234', 'nick').ok).toBe(true);
    expect(validateByPinBody('1234', 1).ok).toBe(false);
    expect(validateByPinBody('x'.repeat(9), null).ok).toBe(false);
  });

  it('mask + Korean rejects', () => {
    expect(maskNicknameForPinConfirm('홍길동')).toBe('홍**');
    expect(maskNicknameForPinConfirm('A')).toBe('A');
    expect(pinLookupNotFoundReject().body.error.message).toContain('없어요');
    expect(pinNicknameMismatchReject().body.error.message).toContain('닉네임');
    expect(pinRateLimitedReject().status).toBe(429);
  });
});

import {
  pinLookupInvalidBodyReject,
  pinLookupInternalReject,
} from './db-pin-lookup.js';

describe('pin lookup body/internal (70)', () => {
  it('rejects', () => {
    expect(pinLookupInvalidBodyReject().body.error.code).toBe('INVALID_BODY');
    expect(pinLookupInternalReject().body.error.message).toContain('서버');
  });
});

