import { describe, expect, it } from 'vitest';
import {
  likeRateKeyTouchesAdmin,
  planClearAdminNpcRelationships,
} from './db-admin-wipe-plan.js';

describe('db-admin-wipe-plan', () => {
  it('returns null for empty admin id', () => {
    expect(planClearAdminNpcRelationships('', {
      chats: [], messages: [], chat_reads: [], likes: [], contact_shares: [], contact_share_events: [],
    })).toBeNull();
  });

  it('selects only admin-related chats/likes/shares and dependent messages/reads', () => {
    const plan = planClearAdminNpcRelationships('admin1', {
      chats: [
        { id: 'c1', user1_id: 'admin1', user2_id: 'u2' },
        { id: 'c2', user1_id: 'u3', user2_id: 'u4' },
      ],
      messages: [
        { id: 'm1', chat_id: 'c1' },
        { id: 'm2', chat_id: 'c2' },
      ],
      chat_reads: [
        { id: 'r1', chat_id: 'c1' },
        { id: 'r2', chat_id: 'c2' },
      ],
      likes: [
        { id: 'l1', liker_id: 'admin1', liked_id: 'u2' },
        { id: 'l2', liker_id: 'u3', liked_id: 'u4' },
      ],
      contact_shares: [
        { id: 's1', liker_id: 'u2', liked_id: 'admin1' },
        { id: 's2', liker_id: 'u3', liked_id: 'u4' },
      ],
      contact_share_events: [
        { id: 'e1', from_user_id: 'admin1', to_user_id: 'u2' },
        { id: 'e2', from_user_id: 'u3', to_user_id: 'u4' },
      ],
    });
    expect(plan).not.toBeNull();
    if (!plan) return;
    expect([...plan.chatIds]).toEqual(['c1']);
    expect(plan.msgRows.map(r => r.id)).toEqual(['m1']);
    expect(plan.readRows.map(r => r.id)).toEqual(['r1']);
    expect(plan.likeRows.map(r => r.id)).toEqual(['l1']);
    expect(plan.shareRows.map(r => r.id)).toEqual(['s1']);
    expect(plan.shareEventRows.map(r => r.id)).toEqual(['e1']);
  });

  it('likeRateKeyTouchesAdmin matches prefix and middle', () => {
    expect(likeRateKeyTouchesAdmin('admin1:u2', 'admin1')).toBe(true);
    expect(likeRateKeyTouchesAdmin('u2:admin1:x', 'admin1')).toBe(true);
    expect(likeRateKeyTouchesAdmin('u2:u3', 'admin1')).toBe(false);
  });
});
