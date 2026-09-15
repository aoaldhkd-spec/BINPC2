/**
 * Removed-feature remnants (seating, heart_drain, suggestions KV).
 * Used by db.ts cleanupLegacyTables + mergeAppSettings — do not delete callers.
 */

/** Postgres app_kv_rows table_name values purged on startup. */
export const LEGACY_KV_TABLE_NAMES = [
  'suggestions',
  'seats',
  'seating',
  'seating_map',
  'seat_assignments',
  'seats_snapshot',
] as const;

export const LEGACY_KV_TABLES = new Set<string>(LEGACY_KV_TABLE_NAMES);

/** Keys stripped from app_settings JSON (memory + Postgres). */
export const LEGACY_APP_SETTINGS_KEYS = [
  'heart_drain_enabled',
  'heart_drain_minutes',
  'seating_locked',
  'seats_snapshot',
  'seating_map',
  'seats',
  'seat_layout',
] as const;

/** Keys stripped from session_history rows (row kept). */
export const LEGACY_SESSION_HISTORY_KEYS = [
  'seats_snapshot',
  'seating_locked',
  'seating_map',
] as const;

/** Tables that must never re-enter /op allowlist. */
export const LEGACY_OP_BLOCKLIST = [
  ...LEGACY_KV_TABLE_NAMES,
  'heart_balances',
] as const;

export function settingsHaveLegacyKeys(row: Record<string, unknown>): boolean {
  return LEGACY_APP_SETTINGS_KEYS.some((k) => k in row);
}

export function stripLegacySettingsKeys(row: Record<string, unknown>): Record<string, unknown> {
  const next = { ...row };
  for (const k of LEGACY_APP_SETTINGS_KEYS) delete next[k];
  return next;
}

export function stripLegacySessionHistoryKeys(row: Record<string, unknown>): Record<string, unknown> {
  if (!LEGACY_SESSION_HISTORY_KEYS.some((k) => k in row)) return row;
  const next = { ...row };
  for (const k of LEGACY_SESSION_HISTORY_KEYS) delete next[k];
  return next;
}

/** Leftover counts for /ready — -1 means cleanup has not run yet. */
export type LegacyLeftoverCounts = {
  kv_tables: number;
  settings_rows: number;
  history_rows: number;
};

export const UNKNOWN_LEGACY_LEFTOVERS: LegacyLeftoverCounts = {
  kv_tables: -1,
  settings_rows: -1,
  history_rows: -1,
};

export function parseLegacyLeftoverCounts(input: {
  kv?: number | null;
  settings?: number | null;
  history?: number | null;
}): LegacyLeftoverCounts {
  return {
    kv_tables: input.kv ?? 0,
    settings_rows: input.settings ?? 0,
    history_rows: input.history ?? 0,
  };
}

/** Trusted catalog only — keys/tables come from LEGACY_* constants, never user input. */
function jsonbHasAnyKeySql(column: string, keys: readonly string[]): string {
  return keys.map((k) => `${column} ? '${k}'`).join(' OR ');
}

function jsonbStripKeysSql(column: string, keys: readonly string[]): string {
  return keys.reduce((expr, k) => `${expr} - '${k}'`, column);
}

/** COUNT DISTINCT leftover KV table_name values still present in app_kv_rows. */
export function buildLegacyKvLeftoverCountSql(
  tables: readonly string[] = LEGACY_KV_TABLE_NAMES,
): string {
  const list = tables.map((t) => `'${t}'`).join(',');
  return `SELECT COUNT(DISTINCT table_name)::int AS n FROM app_kv_rows
       WHERE table_name IN (${list})`;
}

/** COUNT app_settings rows that still carry removed-feature JSON keys. */
export function buildLegacySettingsLeftoverCountSql(
  keys: readonly string[] = LEGACY_APP_SETTINGS_KEYS,
): string {
  return `SELECT COUNT(*)::int AS n FROM app_kv_rows
       WHERE table_name = 'app_settings'
         AND (${jsonbHasAnyKeySql('data', keys)})`;
}

/** COUNT session_history rows that still carry seating JSON keys. */
export function buildLegacyHistoryLeftoverCountSql(
  keys: readonly string[] = LEGACY_SESSION_HISTORY_KEYS,
): string {
  return `SELECT COUNT(*)::int AS n FROM app_kv_rows
       WHERE table_name = 'session_history'
         AND (${jsonbHasAnyKeySql('data', keys)})`;
}

/** UPDATE that strips removed-feature keys from app_settings JSON in Postgres. */
export function buildLegacySettingsStripSql(
  keys: readonly string[] = LEGACY_APP_SETTINGS_KEYS,
): string {
  return `UPDATE app_kv_rows
       SET data = ${jsonbStripKeysSql('data', keys)},
           updated_at = NOW()
       WHERE table_name = 'app_settings'
         AND (${jsonbHasAnyKeySql('data', keys)})`;
}

/** UPDATE that strips seating keys from session_history JSON in Postgres. */
export function buildLegacyHistoryStripSql(
  keys: readonly string[] = LEGACY_SESSION_HISTORY_KEYS,
): string {
  return `UPDATE app_kv_rows
       SET data = ${jsonbStripKeysSql('data', keys)},
           updated_at = NOW()
       WHERE table_name = 'session_history'
         AND (${jsonbHasAnyKeySql('data', keys)})`;
}
