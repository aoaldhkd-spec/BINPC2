import { describe, it, expect } from 'vitest';
import {
  ALLOWED_OP_TABLES,
  CRITICAL_PERSIST_TABLES,
  ACTIVE_KV_TABLES,
  isCriticalWriteLog,
  CRITICAL_WRITE_LOG_TABLES,
  buildKvUpsertSql,
  buildKvDeleteRowSql,
  buildKvDeleteRowsSql,
  buildKvDeleteTableSql,
  buildImageUpsertSql,
  buildErrorLogCounterUpsertSql,
  buildEnsureKvRowsTableSql,
  buildEnsureImageStoreTableSql,
  buildKvTableUpdatedIndexSql,
  buildPublicTableRlsSql,
  buildLoadImagesSql,
  buildKvSelectByRowIdsSql,
  buildKvSelectByTableRowIdSql,
  buildKvSelectLatestLimitedSql,
  buildAppSettingsLatestSql,
  buildGroupParticipantLookupSql,
  buildMessagesByChatIdsSql,
  buildErrorLogCounterDeleteSql,
  buildAuditLogUpsertSql,
  buildImageDeleteByPathsSql,
  buildImageSelectByPathSql,
} from './db-table-policy.js';

describe('db-table-policy', () => {
  it('keeps core chat/hearts tables on both lists', () => {
    for (const t of ['messages', 'likes', 'chats', 'group_messages']) {
      expect(ALLOWED_OP_TABLES.has(t)).toBe(true);
      expect(CRITICAL_PERSIST_TABLES.has(t)).toBe(true);
    }
  });

  it('allows profiles/settings but does not mark them critical-persist', () => {
    expect(ALLOWED_OP_TABLES.has('profiles')).toBe(true);
    expect(ALLOWED_OP_TABLES.has('app_settings')).toBe(true);
    expect(CRITICAL_PERSIST_TABLES.has('profiles')).toBe(false);
    expect(CRITICAL_PERSIST_TABLES.has('app_settings')).toBe(false);
  });

  it('ACTIVE_KV_TABLES covers allowlist + meta tables (72)', () => {
    expect(ACTIVE_KV_TABLES.has('profiles')).toBe(true);
    expect(ACTIVE_KV_TABLES.has('group_opt_outs')).toBe(true);
    expect(ACTIVE_KV_TABLES.has('rate_limits')).toBe(true);
    expect(ACTIVE_KV_TABLES.has('db_error_log')).toBe(true);
    expect(ACTIVE_KV_TABLES.size).toBeGreaterThanOrEqual(ALLOWED_OP_TABLES.size);
  });

  it('isCriticalWriteLog matches prior critical-write tables/ops', () => {
    expect(isCriticalWriteLog('insert', 'messages')).toBe(true);
    expect(isCriticalWriteLog('select', 'messages')).toBe(false);
    expect(isCriticalWriteLog('update', 'profiles')).toBe(false);
    expect(CRITICAL_WRITE_LOG_TABLES.has('signal_sends')).toBe(true);
  });

  it('KV/schema SQL builders match prior ddl/dml (75)', () => {
    expect(buildKvUpsertSql()).toContain('ON CONFLICT (table_name, row_id)');
    expect(buildKvDeleteRowSql()).toBe('DELETE FROM app_kv_rows WHERE table_name = $1 AND row_id = $2');
    expect(buildKvDeleteRowsSql()).toContain('ANY($2::text[])');
    expect(buildKvDeleteTableSql()).toBe('DELETE FROM app_kv_rows WHERE table_name = $1');
    expect(buildImageUpsertSql()).toContain('app_image_store');
    expect(buildErrorLogCounterUpsertSql()).toContain("'db_error_log'");
    expect(buildEnsureKvRowsTableSql()).toContain('CREATE TABLE IF NOT EXISTS app_kv_rows');
    expect(buildEnsureImageStoreTableSql()).toContain('CREATE TABLE IF NOT EXISTS app_image_store');
    expect(buildKvTableUpdatedIndexSql()).toContain('app_kv_rows_table_updated_idx');
    expect(buildPublicTableRlsSql()).toContain('ENABLE ROW LEVEL SECURITY');
    expect(buildPublicTableRlsSql()).toContain('REVOKE ALL ON public');
    expect(buildLoadImagesSql()).toBe('SELECT path, data_url FROM app_image_store');
  });

  it('KV select/load + image-path + error/audit SQL builders (76)', () => {
    expect(buildKvSelectByRowIdsSql()).toContain('row_id = ANY($2::text[])');
    expect(buildKvSelectByTableRowIdSql()).toContain('row_id = $2 LIMIT 1');
    expect(buildKvSelectLatestLimitedSql()).toContain('ORDER BY updated_at DESC LIMIT $2');
    expect(buildAppSettingsLatestSql()).toContain("table_name = 'app_settings'");
    expect(buildGroupParticipantLookupSql()).toContain("table_name = 'group_participants'");
    expect(buildGroupParticipantLookupSql()).toContain("data->>'user_id' = $2");
    expect(buildMessagesByChatIdsSql()).toContain("table_name = 'messages'");
    expect(buildMessagesByChatIdsSql()).toContain("data->>'chat_id' = ANY($1::text[])");
    expect(buildErrorLogCounterDeleteSql()).toContain("'db_error_log'");
    expect(buildAuditLogUpsertSql()).toContain("'audit_log'");
    expect(buildImageDeleteByPathsSql()).toBe('DELETE FROM app_image_store WHERE path = ANY($1::text[])');
    expect(buildImageSelectByPathSql()).toBe('SELECT data_url FROM app_image_store WHERE path = $1 LIMIT 1');
  });
});
