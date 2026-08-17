import { describe, expect, it } from 'vitest';
import { mergeDbRowsIntoMemory, shouldBroadcastBulkResync } from '../lib/db-store-merge.js';

describe('mergeDbRowsIntoMemory', () => {
  it('keeps older likes when the DB snapshot is LIMIT-truncated to newer rows', () => {
    const mem = [
      { id: 'old', created_at: '2026-01-01T00:00:00.000Z' },
      { id: 'mid', created_at: '2026-01-02T00:00:00.000Z' },
    ];
    mergeDbRowsIntoMemory(mem, [
      { id: 'new', created_at: '2026-01-03T00:00:00.000Z' },
      { id: 'mid', created_at: '2026-01-02T00:00:00.000Z', note: 'updated' },
    ]);
    expect(mem.map(r => r.id).sort()).toEqual(['mid', 'new', 'old']);
    expect(mem.find(r => r.id === 'mid')).toMatchObject({ note: 'updated' });
  });

  it('does not overwrite a newer in-memory row with a stale DB copy', () => {
    const mem = [{ id: 'a', updated_at: '2026-01-02T00:00:00.000Z', v: 2 }];
    mergeDbRowsIntoMemory(mem, [{ id: 'a', updated_at: '2026-01-01T00:00:00.000Z', v: 1 }]);
    expect(mem[0]).toMatchObject({ v: 2 });
  });
});

describe('shouldBroadcastBulkResync', () => {
  it('periodic sync stays silent; forced admin/test sync may notify clients', () => {
    expect(shouldBroadcastBulkResync('periodic')).toBe(false);
    expect(shouldBroadcastBulkResync('forced')).toBe(true);
  });
});
