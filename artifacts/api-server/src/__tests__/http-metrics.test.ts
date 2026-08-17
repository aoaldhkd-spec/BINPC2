import { describe, expect, it, beforeEach } from 'vitest';
import {
  classifyRoute,
  recordExpiredSseToken,
  recordMissingSseToken,
  recordRateLimited,
  recordSseAccepted,
  recordSseClosed,
  recordUnauthorized,
  recordUploadAccepted,
  recordUploadRejected,
  resetHttpMetrics,
  snapshotHttpMetrics,
} from '../lib/http-metrics.js';

describe('http-metrics', () => {
  beforeEach(() => resetHttpMetrics(1_700_000_000_000));

  it('classifies auth and realtime routes without storing the raw URL', () => {
    expect(classifyRoute('/api/db/op')).toBe('op');
    expect(classifyRoute('/api/db/events?userId=abc')).toBe('events');
    expect(classifyRoute('/api/db/auth/sse-token')).toBe('sse-token');
    expect(classifyRoute('/api/db/auth/login')).toBe('auth-login');
    expect(classifyRoute('/api/db/storage-upload')).toBe('storage');
    expect(classifyRoute('/unknown/path')).toBe('other');
  });

  it('counts 401/429 and SSE expiry separately from missing tokens', () => {
    recordUnauthorized('events');
    recordUnauthorized('events');
    recordRateLimited('op');
    recordExpiredSseToken();
    recordMissingSseToken();
    recordSseAccepted();
    recordSseClosed();
    recordUploadRejected('size_cap');
    recordUploadRejected('magic');
    recordUploadAccepted();

    const snap = snapshotHttpMetrics();
    expect(snap.unauthorized.events).toBe(2);
    expect(snap.rateLimited.op).toBe(1);
    expect(snap.expiredSseTokens).toBe(1);
    expect(snap.missingSseTokens).toBe(1);
    expect(snap.sseConnectionsAccepted).toBe(1);
    expect(snap.sseConnectionsClosed).toBe(1);
    expect(snap.uploadRejections.size_cap).toBe(1);
    expect(snap.uploadRejections.magic).toBe(1);
    expect(snap.uploadsAccepted).toBe(1);
    expect(JSON.stringify(snap)).not.toMatch(/010-|kakao|userId=|eyJ/i);
  });
});
