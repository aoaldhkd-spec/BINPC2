/**
 * In-memory KV merge — LIMIT 스냅샷이 오래된 행을 지우지 않게 merge-by-id.
 * wholesale replace 는 행사 중 likes/chats 가 LIMIT 를 넘으면 메모리에서 증발한다.
 */

export function mergeDbRowsIntoMemory(
  memRows: Record<string, unknown>[],
  dbRows: Record<string, unknown>[],
): void {
  const byId = new Map(memRows.map(r => [String(r['id']), r]));
  for (const data of dbRows) {
    const id = String(data['id'] ?? '');
    if (!id) continue;
    const existing = byId.get(id);
    const dbTs = String(data.updated_at ?? data.created_at ?? '');
    const memTs = existing ? String(existing.updated_at ?? existing.created_at ?? '') : '';
    if (!existing) {
      memRows.push(data);
      byId.set(id, data);
    } else if (dbTs >= memTs) {
      const idx = memRows.findIndex(r => String(r['id']) === id);
      if (idx >= 0) memRows[idx] = data;
      byId.set(id, data);
    }
  }
}

/** 주기 타이머는 클라이언트 전체 리로드를 쏘지 않는다. 관리자/테스트 강제만 알린다. */
export function shouldBroadcastBulkResync(reason: 'periodic' | 'forced'): boolean {
  return reason === 'forced';
}

/** Boot load: app_settings + profiles only (remaining tables load after). */
export const HOT_TABLES = ['app_settings', 'profiles'] as const;

/** SELECT-path merge-before-read tables (split-brain mitigation). */
export const REALTIME_MERGE_TABLES = new Set([
  'profiles', 'chats', 'likes', 'messages', 'contact_shares', 'signal_sends',
]);

/** Full periodic/forced resync catalog (order strings are historical comments only). */
export const FULL_RESYNC_TABLES: Array<{ tbl: string; order?: string }> = [
  { tbl: 'profiles' },
  { tbl: 'app_settings' },
  { tbl: 'notifications', order: 'ORDER BY created_at DESC' },
  { tbl: 'likes', order: 'ORDER BY created_at DESC LIMIT 5000' },
  { tbl: 'chats', order: 'ORDER BY created_at DESC LIMIT 5000' },
  { tbl: 'contact_shares', order: 'ORDER BY created_at DESC LIMIT 5000' },
  { tbl: 'signal_sends', order: 'ORDER BY created_at DESC LIMIT 5000' },
];

/** Per-table row caps for SELECT merge + full resync UNION queries. */
export const RESYNC_TABLE_LIMIT: Record<string, number> = {
  notifications: 200,
  likes: 5000,
  chats: 5000,
  contact_shares: 5000,
  signal_sends: 5000,
};

/** Hot-path resync limits (LISTEN gap recovery) — not wholesale replace. */
export const HOT_RESYNC_TABLES = ['profiles', 'chats', 'likes', 'messages', 'app_settings'] as const;
export const HOT_RESYNC_LIMITS: Record<string, number> = {
  profiles: 10000,
  chats: 8000,
  likes: 8000,
  messages: 15000,
  app_settings: 10,
};

export const DB_MERGE_THROTTLE_MS = 2_500;
export const RESYNC_DEFAULT_LIMIT = 10_000;
export const MERGE_STALE_DEFAULT_LIMIT = 5_000;

export function resyncLimitFor(table: string, fallback: number = MERGE_STALE_DEFAULT_LIMIT): number {
  return RESYNC_TABLE_LIMIT[table] ?? fallback;
}

export function shouldThrottleDbMerge(
  lastMs: number,
  nowMs: number,
  throttleMs: number = DB_MERGE_THROTTLE_MS,
): boolean {
  return nowMs - lastMs < throttleMs;
}

/** Group app_kv_rows query results by table_name for full resync. */
export function groupKvDataRowsByTable(
  rows: Array<{ table_name: string; data: unknown }>,
): Record<string, Record<string, unknown>[]> {
  const grouped: Record<string, Record<string, unknown>[]> = {};
  for (const r of rows) {
    const tbl = r.table_name as string;
    if (!grouped[tbl]) grouped[tbl] = [];
    grouped[tbl].push(r.data as Record<string, unknown>);
  }
  return grouped;
}

/**
 * Trusted catalog only — table names come from FULL_RESYNC_TABLES, never user input.
 * Builds UNION ALL of per-table LIMIT snapshots.
 */
export function buildFullResyncUnionSql(
  tables: readonly { tbl: string }[],
  limits: Record<string, number>,
  defaultLimit: number,
): string {
  return tables
    .map(
      (t) =>
        `(SELECT table_name, data FROM app_kv_rows WHERE table_name = '${t.tbl}' ORDER BY updated_at DESC LIMIT ${limits[t.tbl] ?? defaultLimit})`,
    )
    .join(' UNION ALL ');
}
