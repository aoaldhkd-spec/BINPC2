import { describe, expect, it } from 'vitest';
import {
  groupChatsInsertReject,
  planBlockedUsersInsertOwnership,
  planChatsInsertOwnership,
  planContactShareEventsInsertOwnership,
  planContactSharesInsertOwnership,
  planGroupMessagesInsertOwnership,
  planGroupParticipantsInsertOwnership,
  planLikesInsertOwnership,
  planMessagesInsertOwnership,
  planNormalizeChatPairRow,
  planProfileViewsInsertOwnership,
  planSignalSendsInsertOwnership,
  findRowByClientId,
  findExistingChatPairRow,
  buildInsertedRow,
  messageReceiverIdFromChat,
  shouldForceServerCreatedAt,
  planSignalSendsExistingRow,
  withMessageChatPairFields,
  peerIdFromChat,
  isChatRowParticipantOf,
  buildGroupParticipantInsertRow,
  groupParticipantsLimitReject,
} from './db-op-insert-ownership.js';

describe('db-op-insert-ownership', () => {
  it('planMessagesInsertOwnership forces sender and requires chat_id', () => {
    expect(planMessagesInsertOwnership({}, null).ok).toBe(false);
    expect(planMessagesInsertOwnership({ sender_id: 'x' }, 'me').ok).toBe(false);
    expect(planMessagesInsertOwnership({ sender_id: 'me' }, 'me').ok).toBe(false);
    const ok = planMessagesInsertOwnership({ chat_id: 'c1', body: 'hi' }, 'me');
    expect(ok).toEqual({ ok: true, row: { chat_id: 'c1', body: 'hi', sender_id: 'me' } });
  });

  it('planChatsInsertOwnership validates participants', () => {
    expect(planChatsInsertOwnership({ user1_id: 'a', user2_id: 'b' }, null).ok).toBe(false);
    expect(planChatsInsertOwnership({ user1_id: 'a' }, 'a').ok).toBe(false);
    expect(planChatsInsertOwnership({ user1_id: 'a', user2_id: 'a' }, 'a').ok).toBe(false);
    expect(planChatsInsertOwnership({ user1_id: 'a', user2_id: 'b' }, 'c').ok).toBe(false);
    expect(planChatsInsertOwnership({ user1_id: 'a', user2_id: 'b' }, 'a').ok).toBe(true);
  });

  it('planGroupMessagesInsertOwnership forces sender', () => {
    expect(planGroupMessagesInsertOwnership({}, 'me').ok).toBe(false);
    const ok = planGroupMessagesInsertOwnership({ group_id: 'g' }, 'me');
    expect(ok).toEqual({ ok: true, row: { group_id: 'g', sender_id: 'me' } });
  });

  it('planGroupParticipantsInsertOwnership Korean mismatch + force user_id', () => {
    const bad = planGroupParticipantsInsertOwnership({ user_id: 'x', group_id: 'g' }, 'me');
    expect(bad.ok).toBe(false);
    if (!bad.ok && 'reject' in bad) {
      expect(bad.reject.body.error.message).toContain('자신의 참여만');
    }
    const ok = planGroupParticipantsInsertOwnership({ group_id: 'g' }, 'me');
    expect(ok).toEqual({ ok: true, row: { group_id: 'g', user_id: 'me' } });
  });

  it('groupChatsInsertReject blocks non-admin non-test', () => {
    expect(groupChatsInsertReject(false, false)?.body.error.message).toContain('관리자만');
    expect(groupChatsInsertReject(true, false)).toBeNull();
    expect(groupChatsInsertReject(false, true)).toBeNull();
  });

  it('planLikesInsertOwnership forces liker_id', () => {
    expect(planLikesInsertOwnership({}, null).ok).toBe(false);
    expect(planLikesInsertOwnership({ liked_id: 'x' }, 'me')).toEqual({
      ok: true,
      row: { liked_id: 'x', liker_id: 'me' },
    });
  });

  it('planSignalSendsInsertOwnership validates action/receiver', () => {
    expect(planSignalSendsInsertOwnership({}, 'me').ok).toBe(false);
    expect(planSignalSendsInsertOwnership({ receiver_id: 'me', action: 'send' }, 'me').ok).toBe(false);
    expect(planSignalSendsInsertOwnership({ receiver_id: 'x', action: 'noop' }, 'me').ok).toBe(false);
    const ok = planSignalSendsInsertOwnership({ receiver_id: 'x', action: 'send' }, 'me');
    expect(ok).toEqual({
      ok: true,
      row: { receiver_id: 'x', action: 'send', sender_id: 'me' },
    });
  });

  it('planProfileViewsInsertOwnership earlyEmpty on self', () => {
    expect(planProfileViewsInsertOwnership({ viewed_id: 'me' }, 'me')).toEqual({
      ok: false,
      earlyEmpty: true,
    });
    expect(planProfileViewsInsertOwnership({ viewed_id: 'other' }, 'me')).toEqual({
      ok: true,
      row: { viewed_id: 'other', viewer_id: 'me' },
    });
  });

  it('relationship insert planners force owner fields', () => {
    expect(
      planBlockedUsersInsertOwnership({ target_id: 't' }, 'me', undefined),
    ).toEqual({ ok: true, row: { target_id: 't', user_id: 'me' } });
    expect(
      planContactSharesInsertOwnership({ liker_id: 'a' }, 'me', undefined),
    ).toEqual({ ok: true, row: { liker_id: 'a', liked_id: 'me' } });
    expect(
      planContactShareEventsInsertOwnership({ to_user_id: 'a' }, 'me', undefined),
    ).toEqual({ ok: true, row: { to_user_id: 'a', from_user_id: 'me' } });
  });

  it('planNormalizeChatPairRow sorts and sets detId', () => {
    const { uid1, uid2, detId, row } = planNormalizeChatPairRow({
      user1_id: 'b',
      user2_id: 'a',
      topic: 'x',
    });
    expect(uid1).toBe('a');
    expect(uid2).toBe('b');
    expect(row.user1_id).toBe('a');
    expect(row.user2_id).toBe('b');
    expect(row.id).toBe(detId);
    expect(detId.length).toBeGreaterThan(8);
  });
});

describe('db-op-insert-followup (via insert-ownership)', () => {
  it('client_id + chat pair finders', () => {
    const rows = [
      { id: '1', client_id: 'c1', user1_id: 'a', user2_id: 'b' },
      { id: 'pair', user1_id: 'x', user2_id: 'y' },
    ];
    expect(findRowByClientId(rows, 'c1')?.id).toBe('1');
    expect(findExistingChatPairRow(rows, 'y', 'x', 'nope')?.id).toBe('pair');
    expect(findExistingChatPairRow(rows, 'p', 'q', '1')?.id).toBe('1');
  });

  it('buildInsertedRow stamps server created_at for likes', () => {
    expect(shouldForceServerCreatedAt('likes')).toBe(true);
    const row = buildInsertedRow({ created_at: 'client', foo: 1 }, 'id1', 'server', 'likes');
    expect(row.created_at).toBe('server');
    expect(row.id).toBe('id1');
  });

  it('messageReceiverIdFromChat', () => {
    expect(messageReceiverIdFromChat({ user1_id: 'a', user2_id: 'b' }, 'a')).toBe('b');
    expect(messageReceiverIdFromChat({ user1_id: 'a', user2_id: 'b' }, 'b')).toBe('a');
  });
});

describe('insert follow-up planners (69)', () => {
  it('planSignalSendsExistingRow', () => {
    expect(planSignalSendsExistingRow({ existing: undefined, action: 'send' }).kind).toBe('continue_insert');
    expect(planSignalSendsExistingRow({ existing: { action: 'send' }, action: 'pass' }).kind).toBe('return_existing');
    const up = planSignalSendsExistingRow({ existing: { action: 'pass', id: '1' }, action: 'send' });
    expect(up.kind).toBe('upgrade');
  });

  it('message chat pair helpers + group participant row', () => {
    const chat = { user1_id: 'a', user2_id: 'b' };
    expect(isChatRowParticipantOf(chat, 'a')).toBe(true);
    expect(peerIdFromChat(chat, 'a')).toBe('b');
    expect(withMessageChatPairFields({ x: 1 }, chat).chat_user1_id).toBe('a');
    const row = buildGroupParticipantInsertRow({ joined_at: undefined }, 'g1', 'u1', 'now');
    expect(row.id).toBe('g1__u1');
    expect(groupParticipantsLimitReject('한도').body.error.code).toBe('GROUP_LIMIT');
  });
});
