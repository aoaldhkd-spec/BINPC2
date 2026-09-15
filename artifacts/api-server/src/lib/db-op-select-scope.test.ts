import { describe, expect, it } from 'vitest';
import type { FilterSpec } from './db-op-filters.js';
import {
  attachGroupMemberCounts,
  collapseRowsById,
  contactSharesSelectSource,
  dedupeParticipantChatRows,
  likesSelectKeepsLikerId,
  profileViewsSelectKeepsViewerId,
  redactLikerId,
  redactViewerId,
  scopeBlockedUsersRows,
  scopeContactShareEventsRows,
  scopeProfileViewsRows,
  scopeSignalSendsRows,
} from './db-op-select-scope.js';

describe('db-op-select-scope', () => {
  it('scopes signal_sends to own sends + incoming send only', () => {
    const rows = [
      { id: 1, sender_id: 'me', receiver_id: 'a', action: 'pass' },
      { id: 2, sender_id: 'b', receiver_id: 'me', action: 'send' },
      { id: 3, sender_id: 'b', receiver_id: 'me', action: 'pass' },
      { id: 4, sender_id: 'x', receiver_id: 'y', action: 'send' },
    ];
    expect(scopeSignalSendsRows(rows, 'me').map(r => r.id)).toEqual([1, 2]);
  });

  it('scopes profile_views / blocked / share events to party', () => {
    expect(
      scopeProfileViewsRows(
        [
          { viewer_id: 'me', viewed_id: 'a' },
          { viewer_id: 'b', viewed_id: 'me' },
          { viewer_id: 'x', viewed_id: 'y' },
        ],
        'me',
      ),
    ).toHaveLength(2);
    expect(
      scopeBlockedUsersRows(
        [
          { user_id: 'me', target_id: 'a' },
          { user_id: 'b', target_id: 'c' },
        ],
        'me',
      ),
    ).toHaveLength(1);
    expect(
      scopeContactShareEventsRows(
        [
          { from_user_id: 'me', to_user_id: 'a' },
          { from_user_id: 'x', to_user_id: 'y' },
        ],
        'me',
      ),
    ).toHaveLength(1);
  });

  it('contactSharesSelectSource party vs anonymous stats', () => {
    const rows = [
      { liker_id: 'me', liked_id: 'a', created_at: 't1', phone: 'x' },
      { liker_id: 'b', liked_id: 'c', created_at: 't2', phone: 'y' },
    ];
    const partyFilters: FilterSpec[] = [{ type: 'eq', col: 'liker_id', val: 'me' }];
    expect(contactSharesSelectSource(rows, 'me', partyFilters)).toEqual([rows[0]]);
    expect(contactSharesSelectSource(rows, 'me', [])).toEqual([
      { created_at: 't1' },
      { created_at: 't2' },
    ]);
  });

  it('dedupeParticipantChatRows keeps one canonical per pair', () => {
    const rows = [
      { id: 'c1', user1_id: 'me', user2_id: 'a', created_at: '2' },
      { id: 'c2', user1_id: 'a', user2_id: 'me', created_at: '1' },
      { id: 'c3', user1_id: 'x', user2_id: 'y', created_at: '1' },
    ];
    const out = dedupeParticipantChatRows(rows, 'me', siblings =>
      [...siblings].sort((a, b) =>
        String(a.created_at).localeCompare(String(b.created_at)),
      )[0],
    );
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('c2');
  });

  it('likes / profile_views redaction gates', () => {
    const keepLiker: FilterSpec[] = [{ type: 'eq', col: 'liker_id', val: 'me' }];
    expect(likesSelectKeepsLikerId(keepLiker, 'me')).toBe(true);
    expect(likesSelectKeepsLikerId([], 'me')).toBe(false);
    expect(redactLikerId([{ liker_id: 'a', liked_id: 'b' }])[0]).not.toHaveProperty('liker_id');

    const keepViewer: FilterSpec[] = [{ type: 'eq', col: 'viewed_id', val: 'me' }];
    expect(profileViewsSelectKeepsViewerId(keepViewer, 'me')).toBe(true);
    expect(profileViewsSelectKeepsViewerId([], 'me')).toBe(false);
    expect(redactViewerId([{ viewer_id: 'a', viewed_id: 'b' }])[0]).not.toHaveProperty(
      'viewer_id',
    );
  });

  it('attachGroupMemberCounts and collapseRowsById', () => {
    const groups = [
      { id: 'g1', name: 'a' },
      { id: 'g2', name: 'b' },
    ];
    const parts = [
      { group_id: 'g1', user_id: 'u1' },
      { group_id: 'g1', user_id: 'u2' },
      { group_id: 'g2', user_id: 'u3' },
    ];
    expect(attachGroupMemberCounts(groups, parts).map(r => r.memberCount)).toEqual([2, 1]);

    const dup = [
      { id: 'g1', v: 1 },
      { id: 'g1', v: 2 },
      { id: 'g2', v: 3 },
    ];
    const collapsed = collapseRowsById(dup);
    expect(collapsed).toHaveLength(2);
    expect(collapsed.find(r => r.id === 'g1')?.v).toBe(2);
  });
});
