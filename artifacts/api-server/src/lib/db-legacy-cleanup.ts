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
