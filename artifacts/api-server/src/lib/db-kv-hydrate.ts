/**
 * KV row hydrate into in-memory store — extracted from routes/db.ts.
 * Store / error-counter / likes-map targets are injected by callers.
 */

/** app_kv_rows 에만 두고 인메모리 store에는 올리지 않는 시스템 행 */
export const SYSTEM_KV_TABLES = new Set(['rate_limits', 'db_error_log']);

export type PersistErrorLogEntry = { table: string; time: number; msg: string };

export type KvHydrateRow = { table_name: string; row_id: string; data: unknown };

export type MergeKvRowsOptions = {
  systemTables?: ReadonlySet<string>;
  legacyTables: ReadonlySet<string>;
  onErrorLogCounter?: (saved: { count?: number; log?: PersistErrorLogEntry[] }) => void;
  stripSessionHistory: (data: Record<string, unknown>) => Record<string, unknown>;
};

export function mergeKvRowsIntoStore(
  rows: KvHydrateRow[],
  store: Record<string, Record<string, unknown>[]>,
  options: MergeKvRowsOptions,
): void {
  const systemTables = options.systemTables ?? SYSTEM_KV_TABLES;
  for (const row of rows) {
    // Error-log counter row is meta — not application data
    if (row.table_name === 'db_error_log' && row.row_id === 'counter') {
      const saved = row.data as { count?: number; log?: PersistErrorLogEntry[] };
      options.onErrorLogCounter?.(saved);
      continue;
    }
    // 시스템·삭제된 기능 테이블은 앱 store에 올리지 않음 (rate_limits는 PG 전용)
    if (systemTables.has(row.table_name) || options.legacyTables.has(row.table_name)) continue;
    if (!store[row.table_name]) store[row.table_name] = [];
    let data = row.data as Record<string, unknown>;
    if (row.table_name === 'session_history') {
      data = options.stripSessionHistory(data);
    }
    store[row.table_name].push(data);
  }
}

/**
 * Seed recent likes into the per-combo insert map (startup hydrate).
 * Returns map size after seeding (same as prior db.ts log field).
 */
export function seedLikesLastInsertMap(
  likes: Record<string, unknown>[],
  likesLastInsert: Map<string, number>,
  nowMs: number,
  windowMs = 10_000,
): number {
  const cutoff = nowMs - windowMs;
  for (const like of likes) {
    const liker = like['liker_id'];
    const liked = like['liked_id'];
    const htype = like['heart_type'];
    if (!liker || !liked || !htype) continue;
    const createdMs = like['created_at'] ? new Date(like['created_at'] as string).getTime() : 0;
    if (createdMs < cutoff) continue;
    const key = `${liker}:${liked}:${htype}`;
    const prev = likesLastInsert.get(key) ?? 0;
    if (createdMs > prev) likesLastInsert.set(key, createdMs);
  }
  return likesLastInsert.size;
}

/** Count in-memory rows whose created_at >= sinceIso (string compare ISO). */
export function countRowsCreatedSince(
  rows: Record<string, unknown>[],
  sinceIso: string,
): number {
  return rows.filter(
    r => typeof r.created_at === 'string' && r.created_at >= sinceIso,
  ).length;
}
