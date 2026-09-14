import { describe, it, expect } from 'vitest';
import {
  upsertById,
  upsertReceivedContactShare,
  upsertReceivedLikerFront,
  filterBlockedUsersForMe,
  isBlockedRowForMe,
} from './realtime-row-upsert';

describe('realtime-row-upsert', () => {
  it('upsertById skips duplicates', () => {
    const a = [{ id: '1' }];
    expect(upsertById(a, { id: '1' })).toBe(a);
    expect(upsertById(a, { id: '2' })).toEqual([{ id: '1' }, { id: '2' }]);
  });

  it('upsertReceivedContactShare replaces by liked_id', () => {
    const prev = [{ liked_id: 'a', v: 1 }];
    expect(upsertReceivedContactShare(prev, { liked_id: 'a', v: 2 })).toEqual([{ liked_id: 'a', v: 2 }]);
    expect(upsertReceivedContactShare(prev, { liked_id: 'b', v: 3 })).toEqual([
      { liked_id: 'b', v: 3 },
      { liked_id: 'a', v: 1 },
    ]);
  });

  it('upsertReceivedLikerFront prepends once', () => {
    const prev = [{ id: 'a' }];
    expect(upsertReceivedLikerFront(prev, { id: 'a' })).toBe(prev);
    expect(upsertReceivedLikerFront(prev, { id: 'b' })[0].id).toBe('b');
  });

  it('filters blocked rows for me', () => {
    const rows = [
      { user_id: 'me', target_id: 'x' },
      { user_id: 'y', target_id: 'z' },
      { user_id: 'q', target_id: 'me' },
    ];
    expect(filterBlockedUsersForMe(rows, 'me')).toHaveLength(2);
    expect(isBlockedRowForMe(rows[0], 'me')).toBe(true);
  });
});
