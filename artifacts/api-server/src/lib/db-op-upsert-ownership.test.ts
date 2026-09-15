import { describe, expect, it } from 'vitest';
import {
  checkUpsertChatReadsReader,
  checkUpsertConflictOwner,
  planChatReadsUpsertOwnership,
  planUpsertRelationshipRow,
  signalSendsUpsertReject,
  upsertRelationshipMissingRequesterReject,
} from './db-op-upsert-ownership.js';

describe('db-op-upsert-ownership', () => {
  it('signalSendsUpsertReject blocks non-admin', () => {
    expect(signalSendsUpsertReject('signal_sends', false)?.body.error.message).toContain('use insert');
    expect(signalSendsUpsertReject('signal_sends', true)).toBeNull();
  });

  it('upsertRelationshipMissingRequesterReject', () => {
    expect(upsertRelationshipMissingRequesterReject('blocked_users', false, null)?.status).toBe(403);
    expect(upsertRelationshipMissingRequesterReject('blocked_users', true, null)).toBeNull();
    expect(upsertRelationshipMissingRequesterReject('likes', false, null)).toBeNull();
  });

  it('planUpsertRelationshipRow forces owner + validates peer', () => {
    const blocked = planUpsertRelationshipRow('blocked_users', { target_id: 't' }, 'me', undefined);
    expect(blocked).toEqual({ ok: true, row: { target_id: 't', user_id: 'me' } });
    expect(planUpsertRelationshipRow('blocked_users', { target_id: 'me' }, 'me', undefined).ok).toBe(false);
    expect(
      planUpsertRelationshipRow('blocked_users', { target_id: 't' }, 'me', { user_id: 'other' }).ok,
    ).toBe(false);
    expect(
      planUpsertRelationshipRow('contact_shares', { liker_id: 'a' }, 'me', undefined),
    ).toEqual({ ok: true, row: { liker_id: 'a', liked_id: 'me' } });
    expect(
      planUpsertRelationshipRow('contact_share_events', { to_user_id: 'a' }, 'me', undefined),
    ).toEqual({ ok: true, row: { to_user_id: 'a', from_user_id: 'me' } });
  });

  it('checkUpsertConflictOwner + chat_reads plans', () => {
    expect(checkUpsertConflictOwner('blocked_users', 'other', 'me')?.body.error.message).toContain('mismatch');
    expect(checkUpsertConflictOwner('blocked_users', 'me', 'me')).toBeNull();
    expect(planChatReadsUpsertOwnership({ chat_id: 'c' }, null).ok).toBe(false);
    expect(planChatReadsUpsertOwnership({ chat_id: 'c' }, 'me')).toEqual({
      ok: true,
      row: { chat_id: 'c', reader_id: 'me' },
    });
    expect(
      checkUpsertChatReadsReader('chat_reads', { reader_id: 'x' }, 'me')?.logMsg,
    ).toContain('UPSERT chat_reads blocked');
    expect(checkUpsertChatReadsReader('chat_reads', { reader_id: 'me' }, 'me')).toBeNull();
  });
});
