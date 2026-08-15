/**
 * Tests for retry-dedup reconciliation in useChat.
 *
 * Two levels of coverage:
 *  1. Unit tests for the pure reducer functions (applySseInsert, applyLoadMessages)
 *  2. End-to-end flow tests that sequence through the full state machine
 *     exactly as useChat does: sendMessage → SSE INSERT → loadMessages
 */
import { describe, it, expect } from 'vitest';
import { applySseInsert, applyLoadMessages, messageBelongsToChat, applyPartnerReadReceipt } from './chat-reducers';
import type { Message } from '../types/app';

// ─── helpers ────────────────────────────────────────────────────────────────

const NOW = '2026-07-31T10:00:00.000Z';

function makeMsg(overrides: Partial<Message> & { id: string }): Message {
  return {
    chat_id: 'chat-1',
    sender_id: 'user-a',
    content: 'hello',
    created_at: NOW,
    image_url: null,
    client_id: null,
    ...overrides,
  } as Message;
}

function makeOptimistic(clientUUID: string, overrides: Partial<Message> = {}): Message {
  return makeMsg({
    id: `__opt_${clientUUID}`,
    client_id: null, // optimistic messages don't store client_id in the row itself
    ...overrides,
  });
}

// ─── applySseInsert ──────────────────────────────────────────────────────────

describe('applySseInsert', () => {
  it('replaces the matching optimistic message when client_id matches', () => {
    const clientUUID = 'aaaaaaaa-0000-0000-0000-000000000001';
    const optimistic = makeOptimistic(clientUUID, { content: 'hi' });
    const prev: Message[] = [optimistic];

    const incoming = makeMsg({
      id: 'db-row-1',
      client_id: clientUUID,
      content: 'hi',
    });

    const next = applySseInsert(prev, incoming);

    expect(next).toHaveLength(1);
    expect(next[0].id).toBe('db-row-1');
    expect(next[0].client_id).toBe(clientUUID);
  });

  it('does NOT append a duplicate when the db id is already present', () => {
    const existing = makeMsg({ id: 'db-row-2', client_id: null });
    const prev: Message[] = [existing];

    const duplicate = makeMsg({ id: 'db-row-2', client_id: null });
    const next = applySseInsert(prev, duplicate);

    expect(next).toHaveLength(1);
  });

  it('appends when there is no matching optimistic message (other sender)', () => {
    const prev: Message[] = [makeMsg({ id: 'existing-1' })];
    const incoming = makeMsg({ id: 'db-row-3', sender_id: 'user-b', client_id: null });

    const next = applySseInsert(prev, incoming);

    expect(next).toHaveLength(2);
    expect(next[1].id).toBe('db-row-3');
  });

  // ── fuzzy fallback: 2-second window (regression: was 5s, now 2s) ────────────
  // IMPORTANT: This window is 2 000 ms. Any future change MUST update these tests.

  it('replaces via fuzzy fallback when sender+content match within 2 s (same timestamp)', () => {
    const clientUUID = 'aaaaaaaa-0000-0000-0000-000000000002';
    const optimistic = makeOptimistic(clientUUID, {
      sender_id: 'user-a',
      content: 'legacy',
      created_at: NOW,
    });
    const prev: Message[] = [optimistic];

    const incoming = makeMsg({
      id: 'db-row-legacy',
      client_id: null, // legacy — no client_id
      sender_id: 'user-a',
      content: 'legacy',
      created_at: NOW, // 0 ms difference → within 2 s
    });

    const next = applySseInsert(prev, incoming);

    expect(next).toHaveLength(1);
    expect(next[0].id).toBe('db-row-legacy');
  });

  it('replaces via fuzzy fallback at 1 999 ms (just inside the 2 s window)', () => {
    const clientUUID = 'aaaaaaaa-0000-0000-0000-000000000002b';
    const optTime = new Date(new Date(NOW).getTime() - 1_999).toISOString();
    const optimistic = makeOptimistic(clientUUID, {
      sender_id: 'user-a',
      content: 'boundary-in',
      created_at: optTime,
    });

    const incoming = makeMsg({
      id: 'db-row-1999',
      client_id: null,
      sender_id: 'user-a',
      content: 'boundary-in',
      created_at: NOW, // 1 999 ms after optimistic → inside window
    });

    const next = applySseInsert([optimistic], incoming);
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe('db-row-1999');
  });

  it('does NOT replace via fuzzy fallback at 2 001 ms (just outside the 2 s window)', () => {
    const clientUUID = 'aaaaaaaa-0000-0000-0000-000000000002c';
    const optTime = new Date(new Date(NOW).getTime() - 2_001).toISOString();
    const optimistic = makeOptimistic(clientUUID, {
      sender_id: 'user-a',
      content: 'boundary-out',
      created_at: optTime,
    });

    const incoming = makeMsg({
      id: 'db-row-2001',
      client_id: null,
      sender_id: 'user-a',
      content: 'boundary-out',
      created_at: NOW, // 2 001 ms after optimistic → outside window
    });

    const next = applySseInsert([optimistic], incoming);
    // Outside window → appended, not replaced
    expect(next).toHaveLength(2);
  });

  it('does NOT replace via legacy fallback when time difference exceeds 10 s', () => {
    const clientUUID = 'aaaaaaaa-0000-0000-0000-000000000003';
    const oldTime = new Date(new Date(NOW).getTime() - 10_000).toISOString();
    const optimistic = makeOptimistic(clientUUID, {
      sender_id: 'user-a',
      content: 'stale',
      created_at: oldTime,
    });
    const prev: Message[] = [optimistic];

    const incoming = makeMsg({
      id: 'db-row-fresh',
      client_id: null,
      sender_id: 'user-a',
      content: 'stale',
      created_at: NOW, // 10 s after the optimistic message
    });

    const next = applySseInsert(prev, incoming);

    // Fallback didn't match → appended as new
    expect(next).toHaveLength(2);
  });

  it('image messages are NEVER fuzzy-matched (even at 0 ms, same sender)', () => {
    // Regression guard: image messages must never be fuzzy-matched because
    // their content is always '' and a false match would merge two different images.
    const clientUUID = 'aaaaaaaa-0000-0000-0000-000000000003b';
    const imageOptimistic = makeOptimistic(clientUUID, {
      sender_id: 'user-a',
      content: '',
      image_url: 'blob:fake-local-blob-url',
      created_at: NOW,
    });

    const incomingImage = makeMsg({
      id: 'db-image-row',
      client_id: null, // no client_id → would normally attempt fuzzy
      sender_id: 'user-a',
      content: '',
      image_url: 'https://cdn.example.com/real-image.jpg',
      created_at: NOW, // same timestamp
    });

    const next = applySseInsert([imageOptimistic], incomingImage);
    // Must NOT fuzzy-match — both should exist
    expect(next).toHaveLength(2);
  });

  it('preserves list order: replaced message stays in the same position', () => {
    const clientUUID = 'aaaaaaaa-0000-0000-0000-000000000004';
    const opt1 = makeMsg({ id: 'db-real-1' });
    const opt2 = makeOptimistic(clientUUID, { content: 'middle' });
    const opt3 = makeMsg({ id: 'db-real-3' });
    const prev: Message[] = [opt1, opt2, opt3];

    const incoming = makeMsg({ id: 'db-row-mid', client_id: clientUUID, content: 'middle' });
    const next = applySseInsert(prev, incoming);

    expect(next).toHaveLength(3);
    expect(next[0].id).toBe('db-real-1');
    expect(next[1].id).toBe('db-row-mid');
    expect(next[2].id).toBe('db-real-3');
  });
});

// ─── applyLoadMessages ───────────────────────────────────────────────────────

describe('applyLoadMessages', () => {
  it('removes an optimistic message when its client_id appears in DB data', () => {
    const clientUUID = 'bbbbbbbb-0000-0000-0000-000000000001';
    const optimistic = makeOptimistic(clientUUID);
    const dbRow = makeMsg({ id: 'db-row-A', client_id: clientUUID });

    const prev: Message[] = [optimistic];
    const data: Message[] = [dbRow];

    const next = applyLoadMessages(prev, data);

    expect(next).toHaveLength(1);
    expect(next[0].id).toBe('db-row-A');
    // The optimistic placeholder must be gone
    expect(next.some((m) => m.id.startsWith('__opt_'))).toBe(false);
  });

  it('keeps an optimistic message whose client_id is NOT yet in DB (still in-flight)', () => {
    const clientUUID = 'bbbbbbbb-0000-0000-0000-000000000002';
    const optimistic = makeOptimistic(clientUUID, { content: 'pending' });
    const dbRow = makeMsg({ id: 'db-row-B', client_id: null });

    const prev: Message[] = [optimistic];
    const data: Message[] = [dbRow];

    const next = applyLoadMessages(prev, data);

    // DB row + optimistic that hasn't landed yet
    expect(next).toHaveLength(2);
    expect(next.some((m) => m.id === `__opt_${clientUUID}`)).toBe(true);
  });

  it('handles multiple optimistic messages: removes only those reconciled by DB', () => {
    const landed = 'cccccccc-0000-0000-0000-000000000001';
    const pending = 'cccccccc-0000-0000-0000-000000000002';

    const optLanded = makeOptimistic(landed);
    const optPending = makeOptimistic(pending, { content: 'still pending' });

    const dbRow = makeMsg({ id: 'db-row-C', client_id: landed });
    const prev: Message[] = [optLanded, optPending];
    const data: Message[] = [dbRow];

    const next = applyLoadMessages(prev, data);

    // dbRow (landed) + optPending (still in-flight)
    expect(next).toHaveLength(2);
    expect(next.some((m) => m.id === 'db-row-C')).toBe(true);
    expect(next.some((m) => m.id === `__opt_${pending}`)).toBe(true);
    expect(next.some((m) => m.id === `__opt_${landed}`)).toBe(false);
  });

  it('returns only DB rows when there are no optimistic messages', () => {
    const prev: Message[] = [makeMsg({ id: 'old-1' }), makeMsg({ id: 'old-2' })];
    const data: Message[] = [makeMsg({ id: 'fresh-1' }), makeMsg({ id: 'fresh-2' })];

    const next = applyLoadMessages(prev, data);

    expect(next.map((m) => m.id)).toEqual(['fresh-1', 'fresh-2']);
  });

  it('returns empty list when data is empty and no pending optimistic messages exist', () => {
    const prev: Message[] = [];
    const next = applyLoadMessages(prev, []);
    expect(next).toHaveLength(0);
  });
});

// ─── End-to-end flow tests ───────────────────────────────────────────────────
//
// These tests sequence through the *exact same state transitions* that useChat
// executes at runtime:
//
//   sendMessage()  →  adds __opt_<uuid> to state
//   SSE INSERT     →  applySseInsert replaces the optimistic placeholder
//   loadMessages() →  applyLoadMessages deduplicates against DB rows
//
// They confirm that no ghost / duplicate message survives any point in the
// chain, matching the two key scenarios in the task specification.

describe('end-to-end: SSE arrives before HTTP response (optimistic → SSE replace)', () => {
  it('SSE INSERT with matching client_id replaces the optimistic entry, not appended', () => {
    // ── Step 1: sendMessage creates an optimistic placeholder ────────────────
    const clientUUID = 'dddddddd-0000-0000-0000-000000000001';
    const optimisticId = `__opt_${clientUUID}`;
    const optimisticMsg = makeMsg({
      id: optimisticId,
      sender_id: 'user-a',
      content: 'hello world',
      created_at: NOW,
      client_id: null, // optimistic rows don't carry client_id in the Message shape
    });

    let state: Message[] = [optimisticMsg];

    // Sanity: one optimistic message in state
    expect(state).toHaveLength(1);
    expect(state[0].id).toBe(optimisticId);

    // ── Step 2: SSE INSERT event arrives (before the HTTP response) ──────────
    // The DB row carries the client_id that sendMessage embedded on insert.
    const sseRow = makeMsg({
      id: 'db-sse-row-1',
      sender_id: 'user-a',
      content: 'hello world',
      client_id: clientUUID, // server echoes back what was sent
    });

    state = applySseInsert(state, sseRow);

    // The optimistic placeholder must be replaced in-place — no duplicates.
    expect(state).toHaveLength(1);
    expect(state[0].id).toBe('db-sse-row-1');
    expect(state[0].client_id).toBe(clientUUID);
    expect(state.some((m) => m.id === optimisticId)).toBe(false);

    // ── Step 3: HTTP response arrives; loadMessages is called ────────────────
    // The DB row is now the authoritative source.  applyLoadMessages must not
    // re-add the ghost optimistic placeholder that has already been replaced.
    const dbData: Message[] = [sseRow];
    state = applyLoadMessages(state, dbData);

    expect(state).toHaveLength(1);
    expect(state[0].id).toBe('db-sse-row-1');
    expect(state.some((m) => m.id.startsWith('__opt_'))).toBe(false);
  });

  it('no duplicate when SSE fires twice for the same db id (idempotent)', () => {
    const clientUUID = 'dddddddd-0000-0000-0000-000000000002';
    const sseRow = makeMsg({ id: 'db-sse-row-2', client_id: clientUUID });

    // SSE fires once — appended
    let state: Message[] = [];
    state = applySseInsert(state, sseRow);
    expect(state).toHaveLength(1);

    // SSE fires again (network glitch re-delivery) — must be ignored
    state = applySseInsert(state, sseRow);
    expect(state).toHaveLength(1);
    expect(state[0].id).toBe('db-sse-row-2');
  });
});

describe('end-to-end: loadMessages after retry removes ghost optimistic entry', () => {
  it('loadMessages strips the optimistic message when its client_id is in the DB result', () => {
    // ── Step 1: sendMessage adds an optimistic placeholder ───────────────────
    const clientUUID = 'eeeeeeee-0000-0000-0000-000000000001';
    const optimisticId = `__opt_${clientUUID}`;
    const optimisticMsg = makeMsg({
      id: optimisticId,
      sender_id: 'user-a',
      content: 'retry me',
      created_at: NOW,
      client_id: null,
    });

    let state: Message[] = [optimisticMsg];

    // ── Step 2: Network hiccup — HTTP response never arrives, SSE not fired.
    //    The user triggers a chat room re-open (or reconnect), causing
    //    loadMessages to be called.  The DB already has the row (ON CONFLICT DO
    //    NOTHING idempotency means the retry succeeded silently).
    const dbRow = makeMsg({
      id: 'db-retry-row-1',
      sender_id: 'user-a',
      content: 'retry me',
      client_id: clientUUID, // server stored the client_id
    });

    state = applyLoadMessages(state, [dbRow]);

    // Ghost optimistic entry must be gone; only the real DB row remains.
    expect(state).toHaveLength(1);
    expect(state[0].id).toBe('db-retry-row-1');
    expect(state.some((m) => m.id === optimisticId)).toBe(false);
  });

  it('still-pending optimistic message is preserved when not yet in DB', () => {
    // Two concurrent sends: one landed, one still in-flight
    const landedUUID = 'eeeeeeee-0000-0000-0000-000000000002';
    const pendingUUID = 'eeeeeeee-0000-0000-0000-000000000003';

    const optLanded = makeMsg({ id: `__opt_${landedUUID}`, content: 'landed', client_id: null });
    const optPending = makeMsg({ id: `__opt_${pendingUUID}`, content: 'pending', client_id: null });

    let state: Message[] = [optLanded, optPending];

    // DB only has the landed row
    const dbRow = makeMsg({ id: 'db-landed-row', client_id: landedUUID, content: 'landed' });

    state = applyLoadMessages(state, [dbRow]);

    // Landed ghost gone, pending ghost still visible to the user
    expect(state).toHaveLength(2);
    expect(state.some((m) => m.id === 'db-landed-row')).toBe(true);
    expect(state.some((m) => m.id === `__opt_${pendingUUID}`)).toBe(true);
    expect(state.some((m) => m.id === `__opt_${landedUUID}`)).toBe(false);
  });

  it('full chain: send → SSE → load produces exactly one message with the db id', () => {
    const clientUUID = 'eeeeeeee-0000-0000-0000-000000000004';
    const optimisticId = `__opt_${clientUUID}`;

    // Step 1 — optimistic send
    let state: Message[] = [
      makeMsg({ id: optimisticId, content: 'full chain', client_id: null }),
    ];

    // Step 2 — SSE replaces optimistic
    const dbRow = makeMsg({ id: 'db-full-chain', client_id: clientUUID, content: 'full chain' });
    state = applySseInsert(state, dbRow);

    expect(state).toHaveLength(1);
    expect(state[0].id).toBe('db-full-chain');

    // Step 3 — loadMessages called (e.g. reconnect) — still exactly one message
    state = applyLoadMessages(state, [dbRow]);

    expect(state).toHaveLength(1);
    expect(state[0].id).toBe('db-full-chain');
    expect(state.some((m) => m.id.startsWith('__opt_'))).toBe(false);
  });
});

describe('messageBelongsToChat / applySseInsert chat isolation', () => {
  it('rejects DB rows with empty chat_id', () => {
    expect(messageBelongsToChat(makeMsg({ id: 'x', chat_id: '' }), 'chat-1')).toBe(false);
    expect(messageBelongsToChat(makeMsg({ id: 'x', chat_id: 'chat-2' }), 'chat-1')).toBe(false);
    expect(messageBelongsToChat(makeMsg({ id: 'x', chat_id: 'chat-1' }), 'chat-1')).toBe(true);
  });

  it('allows optimistic placeholders only for the active chat', () => {
    expect(messageBelongsToChat(makeOptimistic('u1', { chat_id: 'chat-1' }), 'chat-1')).toBe(true);
    expect(messageBelongsToChat(makeOptimistic('u1', { chat_id: 'chat-2' }), 'chat-1')).toBe(false);
    expect(messageBelongsToChat(makeOptimistic('u1', { chat_id: '' }), 'chat-1')).toBe(true);
  });

  it('applySseInsert ignores a different chat_id even if payload looks valid', () => {
    const prev = [makeMsg({ id: 'keep', chat_id: 'chat-1' })];
    const leaked = makeMsg({ id: 'group-leak', chat_id: 'group-or-other', sender_id: 'user-b', content: '혼선' });
    const next = applySseInsert(prev, leaked, 'chat-1');
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe('keep');
  });

  it('applySseInsert ignores messages with missing chat_id when expectedChatId is set', () => {
    const prev = [makeMsg({ id: 'keep' })];
    const orphan = makeMsg({ id: 'orphan', chat_id: '' });
    expect(applySseInsert(prev, orphan, 'chat-1')).toEqual(prev);
  });
});

describe('applyPartnerReadReceipt', () => {
  const me = 'user-a';
  const partner = 'user-b';
  const older = makeMsg({
    id: 'm-old',
    sender_id: me,
    created_at: '2026-07-31T10:00:00.000Z',
  });
  const newer = makeMsg({
    id: 'm-new',
    sender_id: me,
    created_at: '2026-07-31T10:05:00.000Z',
  });

  it('does not clear unread when read_at is missing', () => {
    const unread = new Set(['m-old', 'm-new']);
    const next = applyPartnerReadReceipt(unread, [older, newer], me, partner, undefined, partner);
    expect([...next].sort()).toEqual(['m-new', 'm-old']);
  });

  it('does not clear unread for the current user\'s own read event', () => {
    const unread = new Set(['m-old']);
    const next = applyPartnerReadReceipt(unread, [older], me, me, '2026-07-31T11:00:00.000Z', partner);
    expect(next.has('m-old')).toBe(true);
  });

  it('does not clear unread for a third-party reader', () => {
    const unread = new Set(['m-old']);
    const next = applyPartnerReadReceipt(unread, [older], me, 'user-c', '2026-07-31T11:00:00.000Z', partner);
    expect(next.has('m-old')).toBe(true);
  });

  it('clears only messages created at or before partner read_at', () => {
    const unread = new Set(['m-old', 'm-new']);
    const next = applyPartnerReadReceipt(
      unread,
      [older, newer],
      me,
      partner,
      '2026-07-31T10:02:00.000Z',
      partner,
    );
    expect(next.has('m-old')).toBe(false);
    expect(next.has('m-new')).toBe(true);
  });

  it('does not clear newer messages using a stale partner read_at', () => {
    const unread = new Set(['m-new']);
    const next = applyPartnerReadReceipt(
      unread,
      [older, newer],
      me,
      partner,
      '2026-07-31T10:00:00.000Z',
      partner,
    );
    expect(next.has('m-new')).toBe(true);
  });
});
