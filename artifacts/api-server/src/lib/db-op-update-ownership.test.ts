import { describe, expect, it } from 'vitest';
import {
  checkUpdateRowOwnership,
  forceUpdateOwnershipPatch,
  planGroupParticipantsUpdate,
  signalSendsUpdateReject,
  updateMissingRequesterReject,
} from './db-op-update-ownership.js';

describe('db-op-update-ownership', () => {
  it('updateMissingRequesterReject covers messages/likes/relationship', () => {
    expect(updateMissingRequesterReject('messages', true, null)?.logMsg).toContain('messages UPDATE');
    expect(updateMissingRequesterReject('likes', false, null)?.logMsg).toContain('likes UPDATE');
    expect(updateMissingRequesterReject('likes', true, null)).toBeNull();
    expect(updateMissingRequesterReject('blocked_users', false, null)?.logMsg).toContain('relationship UPDATE');
    expect(updateMissingRequesterReject('profiles', false, null)).toBeNull();
  });

  it('signalSendsUpdateReject blocks non-admin', () => {
    expect(signalSendsUpdateReject('signal_sends', false)?.body.error.code).toBe('FORBIDDEN');
    expect(signalSendsUpdateReject('signal_sends', true)).toBeNull();
    expect(signalSendsUpdateReject('likes', false)).toBeNull();
  });

  it('forceUpdateOwnershipPatch locks owner fields', () => {
    expect(forceUpdateOwnershipPatch('blocked_users', { id: 'x', target_id: 't' }, 'me')).toEqual({
      target_id: 't',
      user_id: 'me',
    });
    expect(forceUpdateOwnershipPatch('contact_shares', { id: 'x', liker_id: 'a', note: 'n' }, 'me')).toEqual({
      note: 'n',
      liked_id: 'me',
    });
    expect(forceUpdateOwnershipPatch('contact_share_events', { id: 'x', to_user_id: 'a' }, 'me')).toEqual({
      from_user_id: 'me',
    });
    expect(forceUpdateOwnershipPatch('likes', { status: 'ok' }, 'me')).toEqual({ status: 'ok' });
  });

  it('planGroupParticipantsUpdate requires auth + last_read_at', () => {
    expect(planGroupParticipantsUpdate({}, null).ok).toBe(false);
    expect(planGroupParticipantsUpdate({ last_read_at: '  ' }, 'me').ok).toBe(false);
    const ok = planGroupParticipantsUpdate({ last_read_at: '2020-01-01', extra: 1 }, 'me');
    expect(ok).toEqual({ ok: true, patch: { last_read_at: '2020-01-01' } });
  });

  it('checkUpdateRowOwnership enforces Korean owner messages', () => {
    expect(
      checkUpdateRowOwnership('profiles', { id: 'other' }, 'me', false)?.body.error.message,
    ).toContain('자신의 프로필만');
    expect(checkUpdateRowOwnership('profiles', { id: 'me' }, 'me', false)).toBeNull();
    expect(
      checkUpdateRowOwnership('likes', { liked_id: 'other' }, 'me', false)?.body.error.message,
    ).toContain('받은 하트만');
    expect(checkUpdateRowOwnership('likes', { liked_id: 'other' }, 'me', true)).toBeNull();
    expect(
      checkUpdateRowOwnership('messages', { sender_id: 'x' }, 'me', true)?.logMsg,
    ).toContain('UPDATE messages');
  });
});
