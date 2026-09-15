import { describe, expect, it } from 'vitest';
import { validateBroadcastBody } from './db-broadcast-validate.js';

describe('db-broadcast-validate', () => {
  it('rejects bad body/channel/event', () => {
    expect(validateBroadcastBody(null).ok).toBe(false);
    expect(validateBroadcastBody({ channel: '', event: 'e', payload: 1 }).ok).toBe(false);
    expect(validateBroadcastBody({ channel: 'c', event: '', payload: 1 }).ok).toBe(false);
  });

  it('accepts valid', () => {
    const ok = validateBroadcastBody({ channel: 'ch', event: 'ev', payload: { a: 1 } });
    expect(ok).toEqual({ ok: true, channel: 'ch', event: 'ev', payload: { a: 1 } });
  });
});

import {
  broadcastForbiddenReject,
  broadcastRateLimitedReject,
  clientIpFromXForwardedFor,
} from './db-broadcast-validate.js';

describe('broadcast rejects + ip (70)', () => {
  it('rejects', () => {
    expect(broadcastForbiddenReject().status).toBe(403);
    expect(broadcastRateLimitedReject().status).toBe(429);
  });
  it('clientIpFromXForwardedFor', () => {
    expect(clientIpFromXForwardedFor('1.1.1.1, 2.2.2.2', undefined)).toBe('1.1.1.1');
    expect(clientIpFromXForwardedFor(['9.9.9.9'], 'fb')).toBe('9.9.9.9');
    expect(clientIpFromXForwardedFor(undefined, '10.0.0.1')).toBe('10.0.0.1');
  });
});

