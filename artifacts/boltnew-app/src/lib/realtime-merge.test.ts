import { describe, expect, it } from 'vitest';
import {
  mergeMapAfterSnapshot,
  mergeRowsAfterSnapshot,
  mergeSetAfterSnapshot,
} from './realtime-merge';

describe('mutation-aware realtime merges', () => {
  it('preserves concurrent set additions and removals over a stale fetch', () => {
    const atStart = new Set(['kept', 'removed-live']);
    const current = new Set(['kept', 'added-live']);
    const fetched = new Set(['kept', 'removed-live', 'server-only']);

    expect([...mergeSetAfterSnapshot(fetched, atStart, current)].sort()).toEqual([
      'added-live',
      'kept',
      'server-only',
    ]);
  });

  it('preserves concurrent map updates while accepting server changes elsewhere', () => {
    const atStart = new Map([['a', 'pending'], ['b', 'old']]);
    const current = new Map([['a', 'accepted'], ['b', 'old']]);
    const fetched = new Map([['a', 'pending'], ['b', 'server-new']]);

    expect([...mergeMapAfterSnapshot(fetched, atStart, current)]).toEqual([
      ['a', 'accepted'],
      ['b', 'server-new'],
    ]);
  });

  it('keeps realtime contact rows and honors realtime deletion', () => {
    const atStart = [
      { id: 'keep', value: 1 },
      { id: 'delete-live', value: 1 },
    ];
    const current = [
      { id: 'keep', value: 1 },
      { id: 'insert-live', value: 2 },
    ];
    const fetched = [
      { id: 'keep', value: 1 },
      { id: 'delete-live', value: 1 },
      { id: 'server-only', value: 3 },
    ];

    expect(mergeRowsAfterSnapshot(fetched, atStart, current, row => row.id)).toEqual([
      { id: 'keep', value: 1 },
      { id: 'server-only', value: 3 },
      { id: 'insert-live', value: 2 },
    ]);
  });

  it('preserves SSE heart rows over stale likes fetch (notification vs list)', () => {
    type LikeRow = { id: string; liker_id: string; liked_id: string; heart_type: string };
    const atStart: LikeRow[] = [];
    const current: LikeRow[] = [
      { id: 'like-live', liker_id: 'a', liked_id: 'b', heart_type: 'red' },
    ];
    const fetched: LikeRow[] = []; // stale HTTP before SSE merge

    expect(mergeRowsAfterSnapshot(fetched, atStart, current, (r) => r.id)).toEqual([
      { id: 'like-live', liker_id: 'a', liked_id: 'b', heart_type: 'red' },
    ]);
  });
});
