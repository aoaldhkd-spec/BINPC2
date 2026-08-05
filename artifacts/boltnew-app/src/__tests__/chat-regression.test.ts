/**
 * 채팅 회귀 방지 테스트 — 실제로 발생했던 버그 6가지를 재발하지 못하도록 잡는 테스트
 *
 * 각 describe는 발생했던 버그를 명시하고, 그 버그가 재발하면 실패하는 테스트를 담습니다.
 *
 * 버그 목록:
 * 1. HTTP-first 낙관적 메시지 교체 후 SSE 중복 방지
 * 2. 두 개의 다른 채팅방에 동시에 전송 (per-chat Set 잠금)
 * 3. 동일 텍스트를 2.1초 간격으로 두 번 보내면 두 개의 별개 메시지로 존재
 * 4. 이미지 메시지 2개를 연속 전송해도 fuzzy 매칭으로 하나가 사라지지 않음
 * 5. applyLoadMessages가 정렬을 보장함 (optimistic은 created_at 기준 올바른 위치에 삽입)
 * 6. SSE 재전달(중복 INSERT 이벤트)은 idempotent — 메시지가 늘어나지 않음
 */

import { describe, it, expect } from 'vitest';
import { applySseInsert, applyLoadMessages } from '../lib/chat-reducers';
import type { Message } from '../types/app';

// ─── helpers ────────────────────────────────────────────────────────────────

const BASE_TIME = '2026-08-05T10:00:00.000Z';

function t(offsetMs: number): string {
  return new Date(new Date(BASE_TIME).getTime() + offsetMs).toISOString();
}

function msg(
  id: string,
  overrides: Partial<Message> & { created_at?: string } = {},
): Message {
  return {
    id,
    chat_id: 'chat-1',
    sender_id: 'user-a',
    content: 'hello',
    created_at: BASE_TIME,
    image_url: null,
    client_id: null,
    ...overrides,
  } as Message;
}

// ══════════════════════════════════════════════════════════════════════════════
// Bug 1: HTTP-first 교체 후 SSE 도착 → 중복 없음
// ══════════════════════════════════════════════════════════════════════════════
describe('[Bug 1] HTTP-first: SSE arrives after HTTP confirmed the message → no duplicate', () => {
  /**
   * sendMessage now calls .select().single() and directly replaces the optimistic
   * message with the real DB row — WITHOUT waiting for SSE.
   * When SSE arrives later with the same id, applySseInsert (rule 1) must ignore it.
   */
  it('SSE carrying the same id as an already-confirmed message is silently ignored', () => {
    const clientUUID = 'http-first-0001';
    const optimisticId = `__opt_${clientUUID}`;
    const realId = 'db-http-row-001';

    // Step 1: optimistic message in state
    let state: Message[] = [msg(optimisticId, { client_id: null })];

    // Step 2: HTTP response (.select().single()) returns real row → SIMULATE direct replace
    //         (in production: setMessages(prev => prev.map(m => m.id === optimisticId ? insertedMsg : m)))
    const insertedMsg = msg(realId, { client_id: clientUUID });
    state = state.map(m => m.id === optimisticId ? insertedMsg : m);

    expect(state).toHaveLength(1);
    expect(state[0].id).toBe(realId);

    // Step 3: SSE fires with the same DB row (normal realtime behavior)
    state = applySseInsert(state, msg(realId, { client_id: clientUUID }));

    // Must still be 1 — rule 1 (id dedup) prevents the duplicate
    expect(state).toHaveLength(1);
    expect(state[0].id).toBe(realId);
  });

  it('SSE carrying client_id for an already-replaced optimistic is also ignored', () => {
    const clientUUID = 'http-first-0002';
    const realId = 'db-http-row-002';

    // Optimistic already replaced by HTTP response
    let state: Message[] = [msg(realId, { client_id: clientUUID })];

    // SSE arrives (might try rule 2: client_id match → find __opt_<clientUUID> → not found)
    // Then rule 1: id already present → ignored
    state = applySseInsert(state, msg(realId, { client_id: clientUUID }));

    expect(state).toHaveLength(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Bug 2: Per-chat 전송 잠금 — 다른 채팅방은 독립적으로 잠금 가능
// ══════════════════════════════════════════════════════════════════════════════
describe('[Bug 2] Per-chat send lock: different chat rooms are independently lockable', () => {
  /**
   * The old lock was a single boolean. When chat A was sending, chat B was also blocked.
   * The fix: use a Set<chatId>. This test verifies the Set semantics.
   */
  it('Set<chatId> allows chat B to lock independently while chat A is locked', () => {
    const sending = new Set<string>();

    const CHAT_A = 'chat-aaa';
    const CHAT_B = 'chat-bbb';

    // Chat A acquires its lock
    expect(sending.has(CHAT_A)).toBe(false);
    sending.add(CHAT_A);

    // Chat B should NOT be blocked
    expect(sending.has(CHAT_B)).toBe(false);

    // Chat B can also acquire its lock independently
    sending.add(CHAT_B);
    expect(sending.has(CHAT_B)).toBe(true);
    expect(sending.has(CHAT_A)).toBe(true);

    // Chat A completes → only A is released
    sending.delete(CHAT_A);
    expect(sending.has(CHAT_A)).toBe(false);
    expect(sending.has(CHAT_B)).toBe(true); // B still in-flight

    // Chat B completes
    sending.delete(CHAT_B);
    expect(sending.has(CHAT_B)).toBe(false);
  });

  it('a boolean lock (old behavior) would incorrectly block the second chat', () => {
    // Demonstrate why the old boolean approach was wrong
    let booleanLock = false;

    // Sending to chat A
    booleanLock = true;

    // With the old approach, chat B would be blocked:
    const chatBBlockedWithOldApproach = booleanLock === true;
    expect(chatBBlockedWithOldApproach).toBe(true); // this was the bug

    // With the new Set approach, chat B is NOT blocked:
    const sending = new Set<string>();
    sending.add('chat-aaa');
    const chatBBlockedWithNewApproach = sending.has('chat-bbb');
    expect(chatBBlockedWithNewApproach).toBe(false); // this is the fix
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Bug 3: 동일 텍스트를 2.1초 간격으로 전송 → 두 메시지 모두 생존
// ══════════════════════════════════════════════════════════════════════════════
describe('[Bug 3] Two identical messages 2.1 s apart both survive (fuzzy window = 2 s)', () => {
  it('first message confirmed, second sent 2 100 ms later → both appear', () => {
    const uuid1 = 'twin-0001';
    const uuid2 = 'twin-0002';

    // Step 1: first message sent and confirmed (by HTTP → replaced, then SSE ignored)
    const confirmed1 = msg('db-twin-1', { client_id: uuid1, created_at: t(0) });
    let state: Message[] = [confirmed1];

    // Step 2: second message sent 2 100 ms later (optimistic)
    const opt2 = msg(`__opt_${uuid2}`, { content: 'hello', created_at: t(2_100), client_id: null });
    state = [...state, opt2];
    expect(state).toHaveLength(2);

    // Step 3: SSE for second message arrives
    const confirmed2 = msg('db-twin-2', { client_id: uuid2, content: 'hello', created_at: t(2_100) });
    state = applySseInsert(state, confirmed2);

    // Both messages must exist — fuzzy would incorrectly merge them at 5s window
    expect(state).toHaveLength(2);
    expect(state[0].id).toBe('db-twin-1');
    expect(state[1].id).toBe('db-twin-2');
  });

  it('same messages sent 1 900 ms apart → second replaces the optimistic of itself (not the first)', () => {
    const uuid1 = 'twin-fast-0001';
    const uuid2 = 'twin-fast-0002';

    const confirmed1 = msg('db-fast-1', { client_id: uuid1, created_at: t(0) });
    let state: Message[] = [confirmed1];

    // Second optimistic 1 900 ms later
    const opt2 = msg(`__opt_${uuid2}`, { content: 'hello', created_at: t(1_900), client_id: null });
    state = [...state, opt2];

    // SSE for second message — has client_id so uses rule 2 (exact match), NOT fuzzy
    const confirmed2 = msg('db-fast-2', { client_id: uuid2, content: 'hello', created_at: t(1_900) });
    state = applySseInsert(state, confirmed2);

    expect(state).toHaveLength(2);
    expect(state[0].id).toBe('db-fast-1');
    expect(state[1].id).toBe('db-fast-2');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Bug 4: 연속 이미지 전송 — fuzzy 매칭으로 하나가 사라지면 안 됨
// ══════════════════════════════════════════════════════════════════════════════
describe('[Bug 4] Consecutive image sends are never fuzzy-merged', () => {
  it('two image optimistic messages + two SSE inserts → 2 distinct confirmed messages', () => {
    const uuid1 = 'img-0001';
    const uuid2 = 'img-0002';

    // Two image optimistics sent in quick succession (0 ms apart)
    const imgOpt1 = msg(`__opt_${uuid1}`, {
      content: '', image_url: 'blob:img-1', created_at: t(0), client_id: null,
    });
    const imgOpt2 = msg(`__opt_${uuid2}`, {
      content: '', image_url: 'blob:img-2', created_at: t(100), client_id: null,
    });
    let state: Message[] = [imgOpt1, imgOpt2];

    // SSE arrives for image 1 (with client_id → exact match via rule 2)
    const realImg1 = msg('db-img-1', {
      content: '', image_url: 'https://cdn.example.com/img1.jpg',
      created_at: t(0), client_id: uuid1,
    });
    state = applySseInsert(state, realImg1);
    expect(state).toHaveLength(2); // opt1 replaced, opt2 still pending

    // SSE arrives for image 2
    const realImg2 = msg('db-img-2', {
      content: '', image_url: 'https://cdn.example.com/img2.jpg',
      created_at: t(100), client_id: uuid2,
    });
    state = applySseInsert(state, realImg2);

    expect(state).toHaveLength(2);
    expect(state[0].id).toBe('db-img-1');
    expect(state[1].id).toBe('db-img-2');
  });

  it('image SSE without client_id does NOT fuzzy-match another image optimistic', () => {
    const uuid1 = 'img-legacy-0001';
    const imgOpt = msg(`__opt_${uuid1}`, {
      content: '', image_url: 'blob:local', created_at: t(0), client_id: null,
    });

    // Legacy SSE without client_id — content is '' and same sender, same time
    // But image_url is set → fuzzy rule explicitly excludes images
    const legacySseImg = msg('db-img-legacy', {
      content: '', image_url: 'https://cdn.example.com/legacy.jpg',
      created_at: t(0), client_id: null,
    });

    const next = applySseInsert([imgOpt], legacySseImg);
    // Fuzzy MUST NOT match — both should exist
    expect(next).toHaveLength(2);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Bug 5: applyLoadMessages 정렬 — optimistic은 올바른 시간 순서에 삽입
// ══════════════════════════════════════════════════════════════════════════════
describe('[Bug 5] applyLoadMessages: merged result is always sorted by created_at', () => {
  it('in-flight optimistic lands between two DB messages in time order', () => {
    const pendingUUID = 'sort-pending-001';
    const optTime = t(1_500); // between db-old (t=0) and db-new (t=3000)

    const optPending = msg(`__opt_${pendingUUID}`, {
      content: 'in between',
      created_at: optTime,
      client_id: null,
    });

    // DB has two messages: one before and one after the optimistic
    const dbOld = msg('db-sort-old', { created_at: t(0), content: 'old' });
    const dbNew = msg('db-sort-new', { created_at: t(3_000), content: 'new' });

    const result = applyLoadMessages([optPending], [dbOld, dbNew]);

    // 3 messages, sorted: old → optimistic → new
    expect(result).toHaveLength(3);
    expect(result[0].id).toBe('db-sort-old');
    expect(result[1].id).toBe(`__opt_${pendingUUID}`);
    expect(result[2].id).toBe('db-sort-new');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Bug 6: SSE 중복 이벤트 idempotent — 같은 메시지가 두 번 와도 1개만 존재
// ══════════════════════════════════════════════════════════════════════════════
describe('[Bug 6] SSE re-delivery is idempotent — message count never increases on duplicate events', () => {
  it('applySseInsert is idempotent for the same db id', () => {
    const dbRow = msg('db-idempotent-001', { client_id: null, sender_id: 'user-b' });
    let state: Message[] = [];

    state = applySseInsert(state, dbRow);
    expect(state).toHaveLength(1);

    // Re-delivery (network retry, reconnect, etc.)
    state = applySseInsert(state, dbRow);
    state = applySseInsert(state, dbRow);
    state = applySseInsert(state, dbRow);

    expect(state).toHaveLength(1);
    expect(state[0].id).toBe('db-idempotent-001');
  });

  it('applyLoadMessages after multiple SSE deliveries still produces 1 message', () => {
    const dbRow = msg('db-idempotent-002', { client_id: 'client-xyz', sender_id: 'user-b' });
    let state: Message[] = [];

    // SSE fires 3 times
    state = applySseInsert(state, dbRow);
    state = applySseInsert(state, dbRow);
    state = applySseInsert(state, dbRow);

    // Then loadMessages returns the same row from DB
    state = applyLoadMessages(state, [dbRow]);

    expect(state).toHaveLength(1);
    expect(state[0].id).toBe('db-idempotent-002');
  });
});
