import { describe, expect, it, vi } from 'vitest';
import {
  SYSTEM_KV_TABLES,
  mergeKvRowsIntoStore,
  seedLikesLastInsertMap,
  countRowsCreatedSince,
} from './db-kv-hydrate.js';

describe('db-kv-hydrate', () => {
  it('SYSTEM_KV_TABLES skips rate_limits and db_error_log from app store', () => {
    expect(SYSTEM_KV_TABLES.has('rate_limits')).toBe(true);
    expect(SYSTEM_KV_TABLES.has('db_error_log')).toBe(true);
    expect(SYSTEM_KV_TABLES.has('likes')).toBe(false);
  });

  it('mergeKvRowsIntoStore pushes app rows, skips system/legacy, applies error counter', () => {
    const store: Record<string, Record<string, unknown>[]> = {};
    const onError = vi.fn();
    const strip = vi.fn((d: Record<string, unknown>) => ({ ...d, stripped: true }));
    mergeKvRowsIntoStore(
      [
        { table_name: 'db_error_log', row_id: 'counter', data: { count: 3, log: [{ table: 'x', time: 1, msg: 'e' }] } },
        { table_name: 'rate_limits', row_id: 'r1', data: { id: 'r1' } },
        { table_name: 'suggestions', row_id: 's1', data: { id: 's1' } },
        { table_name: 'likes', row_id: 'l1', data: { id: 'l1', liker_id: 'a' } },
        { table_name: 'session_history', row_id: 'h1', data: { id: 'h1', seats_snapshot: 1 } },
      ],
      store,
      {
        legacyTables: new Set(['suggestions']),
        onErrorLogCounter: onError,
        stripSessionHistory: strip,
      },
    );
    expect(onError).toHaveBeenCalledWith({ count: 3, log: [{ table: 'x', time: 1, msg: 'e' }] });
    expect(store['rate_limits']).toBeUndefined();
    expect(store['suggestions']).toBeUndefined();
    expect(store['likes']).toEqual([{ id: 'l1', liker_id: 'a' }]);
    expect(store['session_history']).toEqual([{ id: 'h1', seats_snapshot: 1, stripped: true }]);
    expect(strip).toHaveBeenCalledTimes(1);
  });

  it('seedLikesLastInsertMap seeds only recent complete combos', () => {
    const now = Date.parse('2026-09-15T04:00:00.000Z');
    const map = new Map<string, number>();
    const recent = new Date(now - 5_000).toISOString();
    const old = new Date(now - 60_000).toISOString();
    const size = seedLikesLastInsertMap(
      [
        { liker_id: 'a', liked_id: 'b', heart_type: 'pink', created_at: recent },
        { liker_id: 'a', liked_id: 'b', heart_type: 'pink', created_at: new Date(now - 1_000).toISOString() },
        { liker_id: 'c', liked_id: 'd', heart_type: 'gold', created_at: old },
        { liker_id: 'e', liked_id: 'f', created_at: recent },
      ],
      map,
      now,
    );
    expect(map.get('a:b:pink')).toBe(Date.parse(new Date(now - 1_000).toISOString()));
    expect(map.has('c:d:gold')).toBe(false);
    expect(map.has('e:f:undefined')).toBe(false);
    expect(size).toBe(1);
  });

  it('countRowsCreatedSince', () => {
    expect(countRowsCreatedSince([
      { created_at: '2020-01-01' },
      { created_at: '2030-01-01' },
      { created_at: 1 },
    ], '2025-01-01')).toBe(1);
  });

});
