/**
 * /push/subscribe SSE-token authentication tests
 *
 * Invariants:
 * 1. No x-sse-token header                    → 401
 * 2. Tampered (invalid MAC) token             → 401
 * 3. Valid token but mismatched userId        → 401
 * 4. Valid token + matching userId            → 200
 */

import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createHmac } from 'node:crypto';

// ── Mocks must be declared before the app import ──────────────────────────────
vi.mock('pg', () => {
  const mockClient = {
    query: () => Promise.resolve({ rows: [] }),
    release: () => {},
    on: () => {},
  };
  class MockPool {
    connect = () => Promise.resolve(mockClient);
    query   = () => Promise.resolve({ rows: [] });
    on      = () => {};
    end     = () => Promise.resolve();
  }
  class MockClient {
    connect = () => Promise.resolve();
    query   = () => Promise.resolve({ rows: [] });
    on      = () => {};
    end     = () => Promise.resolve();
  }
  return { default: { Pool: MockPool, Client: MockClient } };
});

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn().mockResolvedValue(undefined),
  },
}));

// ── App import (after mocks) ──────────────────────────────────────────────────
import app from '../app.js';

// ─── Token helpers ────────────────────────────────────────────────────────────
// Must replicate the server-side logic exactly:
//   SSE_TOKEN_SECRET = process.env.SESSION_SECRET
//   token            = `${exp}:${HMAC-SHA256(secret, "${userId}:${exp}")}`
const SSE_TOKEN_SECRET = process.env.SESSION_SECRET!; // injected by vitest.config.ts
const SSE_TOKEN_EXPIRY_SEC = 3600;

function makeValidToken(userId: string): string {
  const exp = Math.floor(Date.now() / 1000) + SSE_TOKEN_EXPIRY_SEC;
  const mac = createHmac('sha256', SSE_TOKEN_SECRET)
    .update(`${userId}:${exp}`)
    .digest('hex');
  return `${exp}:${mac}`;
}

// ─── Shared valid subscription payload ────────────────────────────────────────
const VALID_SUB_BODY = (userId: string) => ({
  userId,
  subscription: {
    endpoint: 'https://push.example.com/sub/test-endpoint-123',
    keys: {
      auth:   'dGVzdC1hdXRoLWtleQ==',
      p256dh: 'dGVzdC1wMjU2ZGgta2V5LXdoaWNoLWlzLWxvbmctZW5vdWdoLXRvLXBhc3M=',
    },
  },
});

const USER_ID = 'test-user-push-auth';

// ════════════════════════════════════════════════════════════════════════════════
// POST /push/subscribe — SSE token authentication
// ════════════════════════════════════════════════════════════════════════════════

describe('[Security] POST /push/subscribe — SSE token auth', () => {
  it('no x-sse-token header → 401', async () => {
    const res = await request(app)
      .post('/api/db/push/subscribe')
      .set('Content-Type', 'application/json')
      .send(VALID_SUB_BODY(USER_ID));

    expect(res.status).toBe(401);
    expect(res.body.error).toBeTruthy();
  });

  it('tampered MAC in token → 401', async () => {
    const validToken = makeValidToken(USER_ID);
    const [expPart] = validToken.split(':');
    // Replace the real MAC with garbage
    const tamperedToken = `${expPart}:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`;

    const res = await request(app)
      .post('/api/db/push/subscribe')
      .set('Content-Type', 'application/json')
      .set('x-sse-token', tamperedToken)
      .send(VALID_SUB_BODY(USER_ID));

    expect(res.status).toBe(401);
    expect(res.body.error).toBeTruthy();
  });

  it('valid token issued for a different userId → 401', async () => {
    // Token is valid but was issued for 'other-user', not USER_ID
    const tokenForOtherUser = makeValidToken('other-user');

    const res = await request(app)
      .post('/api/db/push/subscribe')
      .set('Content-Type', 'application/json')
      .set('x-sse-token', tokenForOtherUser)
      .send(VALID_SUB_BODY(USER_ID));

    expect(res.status).toBe(401);
    expect(res.body.error).toBeTruthy();
  });

  it('valid token + matching userId → 200', async () => {
    const token = makeValidToken(USER_ID);

    const res = await request(app)
      .post('/api/db/push/subscribe')
      .set('Content-Type', 'application/json')
      .set('x-sse-token', token)
      .send(VALID_SUB_BODY(USER_ID));

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
