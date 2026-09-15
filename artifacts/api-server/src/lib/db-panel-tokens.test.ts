import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  deriveAdminToken,
  deriveTestToken,
  verifyAdminPanelToken,
  verifyTestPanelToken,
} from './db-panel-tokens.js';

describe('db-panel-tokens', () => {
  it('deriveAdminToken is stable HMAC of admin-session', () => {
    const secret = (process.env.SESSION_SECRET ?? 'fallback-secret') + 'pw';
    const expected = createHmac('sha256', secret).update('admin-session').digest('hex');
    expect(deriveAdminToken('pw')).toBe(expected);
  });

  it('deriveTestToken differs from admin for same password', () => {
    expect(deriveTestToken('pw')).not.toBe(deriveAdminToken('pw'));
    const secret = (process.env.SESSION_SECRET ?? 'fallback-secret') + 'pw';
    const expected = createHmac('sha256', secret).update('test-session').digest('hex');
    expect(deriveTestToken('pw')).toBe(expected);
  });

  it('verifyAdminPanelToken accepts matching hex and rejects junk', () => {
    const token = deriveAdminToken('secret-a');
    expect(verifyAdminPanelToken(token, ['secret-a', 'other'])).toBe(true);
    expect(verifyAdminPanelToken(token, ['wrong'])).toBe(false);
    expect(verifyAdminPanelToken(null, ['secret-a'])).toBe(false);
    expect(verifyAdminPanelToken('not-hex', ['secret-a'])).toBe(false);
  });

  it('verifyTestPanelToken does not accept admin token for same password', () => {
    const adminTok = deriveAdminToken('pw');
    const testTok = deriveTestToken('pw');
    expect(verifyTestPanelToken(testTok, ['pw'])).toBe(true);
    expect(verifyTestPanelToken(adminTok, ['pw'])).toBe(false);
  });
});

import {
  planClearDbErrorsAuth,
  clearDbErrorsInvalidBodyReject,
} from './db-panel-tokens.js';

describe('clear-db-errors auth (70)', () => {
  it('token or password', () => {
    expect(planClearDbErrorsAuth({
      tokenOk: true, adminPassword: undefined, expectedPassword: 'x',
    }).ok).toBe(true);
    expect(planClearDbErrorsAuth({
      tokenOk: false, adminPassword: 'pw', expectedPassword: 'pw',
    }).ok).toBe(true);
    expect(planClearDbErrorsAuth({
      tokenOk: false, adminPassword: 'no', expectedPassword: 'pw',
    }).ok).toBe(false);
    expect(clearDbErrorsInvalidBodyReject().status).toBe(400);
  });
});

