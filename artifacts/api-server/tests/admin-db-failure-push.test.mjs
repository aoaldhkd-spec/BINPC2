/**
 * Admin DB failure push-notification unit tests
 * Run with: node --test artifacts/api-server/tests/admin-db-failure-push.test.mjs
 *
 * Tests the notifyAdminDbFailure helper that lives in src/routes/db.ts.
 * The function is not exported, so we inline an equivalent implementation
 * here (mirrors the production code exactly) with injectable dependencies so
 * no running server, database, or prior build is required.
 *
 * Covered behaviours
 * ──────────────────
 * 1. First failure → sendPush called with correct payload
 *    • title contains "DB 저장 오류"
 *    • body contains the table name and (truncated) error message
 * 2. Throttle → a second call within 5 minutes produces NO additional push
 * 3. After the throttle window expires the next call fires again
 * 4. Long error messages are truncated to ≤80 chars in the body
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ── Constants (mirrored from src/routes/db.ts) ────────────────────────────
const ADMIN_DB_PUSH_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

// ── Inline testable implementation ────────────────────────────────────────
/**
 * Factory that returns a fresh, isolated instance of notifyAdminDbFailure
 * together with the state it closes over.  Each test gets its own instance
 * so state does not bleed between runs.
 *
 * @param {function} sendAdminPushFn  – replaces the real _sendAdminPush
 * @param {function} nowFn            – replaces Date.now() for time control
 */
function makeNotifier(sendAdminPushFn, nowFn = Date.now.bind(Date)) {
  let lastPushAt = 0;

  async function notifyAdminDbFailure(tableName, errMsg) {
    const now = nowFn();
    if (now - lastPushAt < ADMIN_DB_PUSH_THROTTLE_MS) return;
    lastPushAt = now;
    try {
      const shortErr = errMsg.length > 80 ? errMsg.slice(0, 80) + '…' : errMsg;
      await sendAdminPushFn({
        title: '⚠️ DB 저장 오류 발생',
        body: `[${tableName}] ${shortErr}`,
        tag: 'db-persist-error',
        url: '/',
      });
    } catch {
      // errors swallowed — must not recurse
    }
  }

  // Expose state for inspection in tests
  return { notifyAdminDbFailure, getLastPushAt: () => lastPushAt };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('notifyAdminDbFailure — payload correctness', () => {
  test('title contains "DB 저장 오류"', async () => {
    const calls = [];
    const { notifyAdminDbFailure } = makeNotifier(payload => { calls.push(payload); });

    await notifyAdminDbFailure('messages', 'connection timeout');

    assert.equal(calls.length, 1, 'sendPush should have been called once');
    assert.ok(
      calls[0].title.includes('DB 저장 오류'),
      `expected title to include "DB 저장 오류", got: ${calls[0].title}`,
    );
  });

  test('body contains the table name', async () => {
    const calls = [];
    const { notifyAdminDbFailure } = makeNotifier(payload => { calls.push(payload); });

    await notifyAdminDbFailure('profiles', 'duplicate key value');

    assert.equal(calls.length, 1);
    assert.ok(
      calls[0].body.includes('profiles'),
      `expected body to include "profiles", got: ${calls[0].body}`,
    );
  });

  test('body contains the error message', async () => {
    const calls = [];
    const { notifyAdminDbFailure } = makeNotifier(payload => { calls.push(payload); });

    await notifyAdminDbFailure('likes', 'connection refused');

    assert.equal(calls.length, 1);
    assert.ok(
      calls[0].body.includes('connection refused'),
      `expected body to include error text, got: ${calls[0].body}`,
    );
  });

  test('tag is "db-persist-error"', async () => {
    const calls = [];
    const { notifyAdminDbFailure } = makeNotifier(payload => { calls.push(payload); });

    await notifyAdminDbFailure('seats', 'ECONNRESET');

    assert.equal(calls[0].tag, 'db-persist-error');
  });
});

describe('notifyAdminDbFailure — long error truncation', () => {
  test('error message longer than 80 chars is truncated with ellipsis in body', async () => {
    const calls = [];
    const { notifyAdminDbFailure } = makeNotifier(payload => { calls.push(payload); });

    const longErr = 'A'.repeat(100); // 100 chars
    await notifyAdminDbFailure('messages', longErr);

    assert.equal(calls.length, 1);
    const body = calls[0].body;
    // The body is `[tableName] <shortErr>`.  shortErr must be exactly 80+1 chars (with …).
    assert.ok(body.includes('…'), 'expected truncation ellipsis in body');
    // shortErr = first 80 chars + '…' = 81 chars; full body also includes [messages]
    const shortErr = 'A'.repeat(80) + '…';
    assert.ok(body.includes(shortErr), `expected truncated error in body, got: ${body}`);
  });

  test('error message of exactly 80 chars is NOT truncated', async () => {
    const calls = [];
    const { notifyAdminDbFailure } = makeNotifier(payload => { calls.push(payload); });

    const exactErr = 'B'.repeat(80);
    await notifyAdminDbFailure('seats', exactErr);

    assert.equal(calls.length, 1);
    assert.ok(!calls[0].body.includes('…'), 'expected no truncation for 80-char message');
    assert.ok(calls[0].body.includes(exactErr));
  });
});

describe('notifyAdminDbFailure — throttle (5-minute window)', () => {
  test('second call within 5 minutes does NOT fire a second push', async () => {
    const calls = [];
    // Fixed clock — both calls happen at the same instant
    const fixedNow = 1_000_000;
    const { notifyAdminDbFailure } = makeNotifier(
      payload => { calls.push(payload); },
      () => fixedNow,
    );

    await notifyAdminDbFailure('messages', 'err1');
    await notifyAdminDbFailure('messages', 'err2'); // should be throttled

    assert.equal(calls.length, 1, 'throttled call must not produce a second push');
  });

  test('second call still within window (4m59s later) is throttled', async () => {
    const calls = [];
    let now = 1_000_000;
    const { notifyAdminDbFailure } = makeNotifier(
      payload => { calls.push(payload); },
      () => now,
    );

    await notifyAdminDbFailure('messages', 'err1');
    now += ADMIN_DB_PUSH_THROTTLE_MS - 1; // 1 ms before the window expires
    await notifyAdminDbFailure('messages', 'err2');

    assert.equal(calls.length, 1, 'call inside throttle window must be suppressed');
  });

  test('call exactly at window boundary (5 min later) fires again', async () => {
    const calls = [];
    let now = 1_000_000;
    const { notifyAdminDbFailure } = makeNotifier(
      payload => { calls.push(payload); },
      () => now,
    );

    await notifyAdminDbFailure('messages', 'err1');
    now += ADMIN_DB_PUSH_THROTTLE_MS; // exactly 5 minutes
    await notifyAdminDbFailure('messages', 'err2');

    assert.equal(calls.length, 2, 'call after throttle window must fire a new push');
  });

  test('call after window expires contains fresh table name and error', async () => {
    const calls = [];
    let now = 2_000_000;
    const { notifyAdminDbFailure } = makeNotifier(
      payload => { calls.push(payload); },
      () => now,
    );

    await notifyAdminDbFailure('profiles', 'first error');
    now += ADMIN_DB_PUSH_THROTTLE_MS + 1;
    await notifyAdminDbFailure('likes', 'second error');

    assert.equal(calls.length, 2);
    assert.ok(calls[1].body.includes('likes'), 'second push body must reference new table');
    assert.ok(calls[1].body.includes('second error'), 'second push body must contain new error message');
  });
});

describe('notifyAdminDbFailure — sendPush errors are swallowed', () => {
  test('throwing sendAdminPush does not propagate an exception', async () => {
    const { notifyAdminDbFailure } = makeNotifier(() => {
      throw new Error('push service unavailable');
    });

    // Must NOT throw
    await assert.doesNotReject(
      () => notifyAdminDbFailure('messages', 'db error'),
      'errors from sendAdminPush must be swallowed',
    );
  });
});
