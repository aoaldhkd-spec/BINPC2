import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { deriveAdminToken, deriveTestToken } from './db-panel-tokens.js';

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
});
