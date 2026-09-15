import { describe, expect, it } from 'vitest';
import {
  mergeDbRowsIntoMemory,
  shouldBroadcastBulkResync,
  HOT_TABLES,
  REALTIME_MERGE_TABLES,
  FULL_RESYNC_TABLES,
  RESYNC_TABLE_LIMIT,
  HOT_RESYNC_TABLES,
  resyncLimitFor,
  shouldThrottleDbMerge,
  groupKvDataRowsByTable,
  buildFullResyncUnionSql,
  buildLoadHotKvTablesSql,
  buildLoadRemainingKvTablesSql,
  DB_MERGE_THROTTLE_MS,
  RESYNC_DEFAULT_LIMIT,
} from './db-store-merge.js';

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

describe('db-store-merge resync policy (72)', () => {
  it('exports hot/realtime/full-resync catalogs', () => {
    expect(HOT_TABLES).toEqual(['app_settings', 'profiles']);
    expect(REALTIME_MERGE_TABLES.has('messages')).toBe(true);
    expect(FULL_RESYNC_TABLES.map(t => t.tbl)).toContain('likes');
    expect(HOT_RESYNC_TABLES).toContain('chats');
    expect(RESYNC_TABLE_LIMIT.notifications).toBe(200);
  });

  it('resyncLimitFor + throttle + group + union sql', () => {
    expect(resyncLimitFor('likes')).toBe(5000);
    expect(resyncLimitFor('profiles', 999)).toBe(999);
    expect(shouldThrottleDbMerge(1000, 1000 + DB_MERGE_THROTTLE_MS - 1)).toBe(true);
    expect(shouldThrottleDbMerge(1000, 1000 + DB_MERGE_THROTTLE_MS)).toBe(false);
    const grouped = groupKvDataRowsByTable([
      { table_name: 'likes', data: { id: '1' } },
      { table_name: 'likes', data: { id: '2' } },
      { table_name: 'chats', data: { id: 'c' } },
    ]);
    expect(grouped.likes).toHaveLength(2);
    expect(grouped.chats).toHaveLength(1);
    const sql = buildFullResyncUnionSql(FULL_RESYNC_TABLES, RESYNC_TABLE_LIMIT, RESYNC_DEFAULT_LIMIT);
    expect(sql).toContain("table_name = 'profiles'");
    expect(sql).toContain('UNION ALL');
    expect(sql).toContain(`LIMIT ${RESYNC_TABLE_LIMIT.likes}`);
  });
});

describe('db-store-merge boot load SQL (76)', () => {
  it('hot/remaining load SQL stay exact', () => {
    expect(buildLoadHotKvTablesSql()).toContain('table_name = ANY($1::text[])');
    expect(buildLoadHotKvTablesSql()).toContain('ORDER BY updated_at ASC');
    expect(buildLoadRemainingKvTablesSql()).toContain('table_name <> ALL($1::text[])');
    expect(buildLoadRemainingKvTablesSql()).toContain('ORDER BY updated_at ASC');
  });
});
