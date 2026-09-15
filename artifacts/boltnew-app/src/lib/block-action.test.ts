import { describe, expect, it } from 'vitest';
import {
  BLOCK_SESSION_EXPIRED_MESSAGE,
  blockFailureMessage,
  buildBlockedUserRow,
  shouldSkipBlock,
  unblockFailureMessage,
} from './block-action';

describe('block-action', () => {
  it('shouldSkipBlock guards self, null user, and duplicates', () => {
    expect(shouldSkipBlock({
      currentUserId: null,
      targetId: 't',
      type: 'block',
      blockedUsers: [],
    })).toBe(true);
    expect(shouldSkipBlock({
      currentUserId: 'me',
      targetId: 'me',
      type: 'block',
      blockedUsers: [],
    })).toBe(true);
    expect(shouldSkipBlock({
      currentUserId: 'me',
      targetId: 't',
      type: 'block',
      blockedUsers: [{ user_id: 'me', target_id: 't', block_type: 'block' }],
    })).toBe(true);
    expect(shouldSkipBlock({
      currentUserId: 'me',
      targetId: 't',
      type: 'hide',
      blockedUsers: [{ user_id: 'me', target_id: 't', block_type: 'block' }],
    })).toBe(false);
  });

  it('buildBlockedUserRow shapes the optimistic row', () => {
    expect(buildBlockedUserRow({
      id: 'id1',
      currentUserId: 'me',
      targetId: 't',
      type: 'hide',
      createdAt: '2026-01-01T00:00:00.000Z',
    })).toEqual({
      id: 'id1',
      user_id: 'me',
      target_id: 't',
      block_type: 'hide',
      created_at: '2026-01-01T00:00:00.000Z',
    });
  });

  it('failure messages stay Korean', () => {
    expect(blockFailureMessage('block')).toContain('차단');
    expect(blockFailureMessage('hide')).toContain('숨기기');
    expect(unblockFailureMessage()).toContain('차단 해제');
    expect(BLOCK_SESSION_EXPIRED_MESSAGE).toContain('세션');
  });
});
