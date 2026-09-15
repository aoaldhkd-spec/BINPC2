/**
 * /op allowlist + critical persist table sets + KV/schema/select/image SQL builders — extracted from routes/db.ts.
 */

/** Allowlist prevents access to internal or non-existent tables via /op. */
export const ALLOWED_OP_TABLES = new Set([
  'profiles', 'chats', 'messages', 'likes', 'chat_reads',
  'app_settings',
  'session_history',
  'contact_shares', 'contact_share_events', 'anonymous_reports',
  'notifications',
  'app_image_store',
  'group_chats', 'group_participants', 'group_messages',
  'blocked_users', 'profile_views',
  'user_signals',
  'signal_sends',
]);

/** Durability-required tables — persist must succeed before SSE/response. */
export const CRITICAL_PERSIST_TABLES = new Set([
  'messages', 'likes', 'chats', 'chat_reads',
  'contact_shares', 'contact_share_events',
  'group_messages', 'group_chats', 'group_participants',
  'signal_sends',
]);

/**
 * Active app_kv_rows table_name set (logging / inventory).
 * Legacy leftover cleanup uses LEGACY_KV_TABLES (explicit list), not the inverse of this set.
 */
export const ACTIVE_KV_TABLES = new Set([
  'profiles', 'app_settings', 'notifications', 'likes', 'chats',
  'messages', 'chat_reads', 'device_secrets', 'session_history', 'push_subscriptions',
  'contact_shares', 'contact_share_events', 'anonymous_reports',
  'app_image_store',
  // 옵트인 단체 채팅
  'group_chats', 'group_participants', 'group_messages',
  // 명시적 단톡 나가기 — 자동 재입장 방지 (서버 전용)
  'group_opt_outs',
  // 차단·숨기기 / 프로필 방문자
  'blocked_users', 'profile_views',
  // 상태·이상형 신호
  'user_signals',
  'signal_sends',
  // PG 전용 메타 — 앱 데이터가 아님. inversion cleanup에서 지우면 안 됨
  'rate_limits', 'db_error_log',
  // Wipe-surviving aggregate sales snapshots (custom admin API only).
  'event_sales_reports',
]);

/** Tables whose /op writes are logged as critical-write (requestId only). */
export const CRITICAL_WRITE_LOG_TABLES = new Set([
  'messages', 'chats', 'likes', 'contact_shares', 'signal_sends',
]);

const CRITICAL_WRITE_OPS = new Set(['insert', 'update', 'upsert', 'delete']);

/** Whether /op should emit the critical-write info log line. */
export function isCriticalWriteLog(op: string, table: string): boolean {
  return CRITICAL_WRITE_OPS.has(op) && CRITICAL_WRITE_LOG_TABLES.has(table);
}


/** Trusted SQL builders for app_kv_rows / app_image_store / schema — execution stays in db.ts. */

/** Upsert one KV row. Params: $1=table_name, $2=row_id, $3=json data. */
export function buildKvUpsertSql(): string {
  return `INSERT INTO app_kv_rows (table_name, row_id, data, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (table_name, row_id)
       DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`;
}

/** Delete one KV row. Params: $1=table_name, $2=row_id. */
export function buildKvDeleteRowSql(): string {
  return 'DELETE FROM app_kv_rows WHERE table_name = $1 AND row_id = $2';
}

/** Batch delete KV rows. Params: $1=table_name, $2=row_id[]. */
export function buildKvDeleteRowsSql(): string {
  return 'DELETE FROM app_kv_rows WHERE table_name = $1 AND row_id = ANY($2::text[])';
}

/** Delete all rows for a table_name. Params: $1=table_name. */
export function buildKvDeleteTableSql(): string {
  return 'DELETE FROM app_kv_rows WHERE table_name = $1';
}

/** Upsert image blob. Params: $1=path, $2=data_url. */
export function buildImageUpsertSql(): string {
  return `INSERT INTO app_image_store (path, data_url, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (path)
       DO UPDATE SET data_url = EXCLUDED.data_url, updated_at = NOW()`;
}

/** Persist db_error_log counter row. Params: $1=json payload. */
export function buildErrorLogCounterUpsertSql(): string {
  return `INSERT INTO app_kv_rows (table_name, row_id, data, updated_at)
       VALUES ('db_error_log', 'counter', $1, NOW())
       ON CONFLICT (table_name, row_id)
       DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`;
}

/** CREATE TABLE app_kv_rows IF NOT EXISTS. */
export function buildEnsureKvRowsTableSql(): string {
  return `
    CREATE TABLE IF NOT EXISTS app_kv_rows (
      table_name text NOT NULL,
      row_id text NOT NULL,
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (table_name, row_id)
    )
  `;
}

/** CREATE TABLE app_image_store IF NOT EXISTS. */
export function buildEnsureImageStoreTableSql(): string {
  return `
    CREATE TABLE IF NOT EXISTS app_image_store (
      path text PRIMARY KEY,
      data_url text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
}

/** CREATE INDEX on app_kv_rows (table_name, updated_at DESC). */
export function buildKvTableUpdatedIndexSql(): string {
  return `
    CREATE INDEX IF NOT EXISTS app_kv_rows_table_updated_idx
      ON app_kv_rows (table_name, updated_at DESC)
  `;
}

/**
 * Enable RLS + revoke anon/authenticated on all public tables.
 * Exact prior DO block from ensurePublicTableRls.
 */
export function buildPublicTableRlsSql(): string {
  return `
      DO $$
      DECLARE r RECORD;
      BEGIN
        FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
        LOOP
          EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
          EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', r.tablename);
        END LOOP;
      END $$
    `;
}

/** Preload image store. */
export function buildLoadImagesSql(): string {
  return 'SELECT path, data_url FROM app_image_store';
}

/** Select KV rows by primary keys. Params: $1=table_name, $2=row_id[]. */
export function buildKvSelectByRowIdsSql(): string {
  return `SELECT data FROM app_kv_rows
       WHERE table_name = $1 AND row_id = ANY($2::text[])`;
}

/** Select one KV row by (table_name, row_id). Params: $1=table_name, $2=row_id. */
export function buildKvSelectByTableRowIdSql(): string {
  return `SELECT data FROM app_kv_rows WHERE table_name = $1 AND row_id = $2 LIMIT 1`;
}

/** Latest N rows for a table_name. Params: $1=table_name, $2=limit. */
export function buildKvSelectLatestLimitedSql(): string {
  return `SELECT data FROM app_kv_rows WHERE table_name = $1 ORDER BY updated_at DESC LIMIT $2`;
}

/** Latest app_settings row (overlay/hydrate). */
export function buildAppSettingsLatestSql(): string {
  return `SELECT data FROM app_kv_rows WHERE table_name = 'app_settings' ORDER BY updated_at DESC LIMIT 1`;
}

/** Targeted group_participants refresh. Params: $1=group_id, $2=user_id. */
export function buildGroupParticipantLookupSql(): string {
  return `SELECT data FROM app_kv_rows
       WHERE table_name = 'group_participants'
         AND data->>'group_id' = $1
         AND data->>'user_id' = $2
       LIMIT 1`;
}

/** Messages for chat id set (merge). Params: $1=chat_id[]. */
export function buildMessagesByChatIdsSql(): string {
  return `SELECT data FROM app_kv_rows
       WHERE table_name = 'messages'
         AND data->>'chat_id' = ANY($1::text[])`;
}

/** Clear persisted db_error_log counter. */
export function buildErrorLogCounterDeleteSql(): string {
  return `DELETE FROM app_kv_rows WHERE table_name = 'db_error_log' AND row_id = 'counter'`;
}

/** Admin audit_log upsert. Params: $1=row_id, $2=json payload. */
export function buildAuditLogUpsertSql(): string {
  return `INSERT INTO app_kv_rows (table_name, row_id, data)
       VALUES ('audit_log', $1, $2::jsonb)
       ON CONFLICT (table_name, row_id) DO UPDATE SET data = EXCLUDED.data`;
}

/** Batch delete images by path. Params: $1=path[]. */
export function buildImageDeleteByPathsSql(): string {
  return 'DELETE FROM app_image_store WHERE path = ANY($1::text[])';
}

/** Lazy-load one image. Params: $1=path. */
export function buildImageSelectByPathSql(): string {
  return 'SELECT data_url FROM app_image_store WHERE path = $1 LIMIT 1';
}
