import { describe, expect, it } from 'vitest';
import {
  DELETE_AUTH_REQUIRED_TABLES,
  checkDeleteRowOwnership,
  deleteMissingRequesterReject,
} from './db-op-delete-ownership.js';

describe('db-op-delete-ownership', () => {
  it('DELETE_AUTH_REQUIRED_TABLES covers sensitive tables', () => {
    expect(DELETE_AUTH_REQUIRED_TABLES.has('messages')).toBe(true);
    expect(DELETE_AUTH_REQUIRED_TABLES.has('group_chats')).toBe(true);
    expect(DELETE_AUTH_REQUIRED_TABLES.has('profiles')).toBe(false);
  });

  it('deleteMissingRequesterReject only for non-admin sensitive', () => {
    expect(deleteMissingRequesterReject('messages', false, null)?.logMsg).toContain('DELETE without requesterId');
    expect(deleteMissingRequesterReject('messages', true, null)).toBeNull();
    expect(deleteMissingRequesterReject('messages', false, 'me')).toBeNull();
    expect(deleteMissingRequesterReject('profiles', false, null)).toBeNull();
  });

  it('checkDeleteRowOwnership enforces Korean owner messages', () => {
    expect(
      checkDeleteRowOwnership('likes', { liker_id: 'x' }, 'me')?.body.error.message,
    ).toContain('자신이 보낸 하트만');
    expect(checkDeleteRowOwnership('likes', { liker_id: 'me' }, 'me')).toBeNull();
    expect(
      checkDeleteRowOwnership('chats', { user1_id: 'a', user2_id: 'b' }, 'me')?.body.error.message,
    ).toContain('참여한 채팅방만');
    expect(checkDeleteRowOwnership('chats', { user1_id: 'me', user2_id: 'b' }, 'me')).toBeNull();
    expect(
      checkDeleteRowOwnership('group_chats', { id: 'g1' }, 'me')?.body.error.message,
    ).toContain('단톡방 삭제는 관리자만');
    expect(
      checkDeleteRowOwnership('contact_shares', { liked_id: 'x' }, 'me')?.logMsg,
    ).toContain('DELETE contact_shares');
  });
});
