/**
 * App settings merge / QR helpers — extracted from routes/db.ts.
 * Pure; defaultAppSettings builder + PG fetch for overlayDbSecrets stay in db.ts.
 */
import { LEGACY_APP_SETTINGS_KEYS } from './db-legacy-cleanup.js';
import { serializeEventSchedule } from './db-event-schedule.js';

export const PRODUCTION_QR_BASE = 'https://binpc2.netlify.app';

export const SECRET_SETTING_KEYS = [
  'admin_password',
  'test_password',
  'entry_password',
  'reset_password',
] as const;

export type SecretSettingKey = (typeof SECRET_SETTING_KEYS)[number];

export function isLocalQrUrl(url: unknown): boolean {
  const s = String(url ?? '');
  return !s || /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(s);
}

export function explicitSecretKeys(payload: Record<string, unknown>): Set<string> {
  const keys = new Set<string>();
  for (const key of SECRET_SETTING_KEYS) {
    if (key in payload && payload[key] != null && String(payload[key]).trim() !== '') {
      keys.add(key);
    }
  }
  return keys;
}

/**
 * Merge settings patch onto current; empty secret patches do not wipe passwords.
 * Caller supplies defaults (from defaultAppSettings) and now ISO timestamp.
 */
export function mergeAppSettings(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
  defaults: Record<string, unknown>,
  now: string,
): Record<string, unknown> {
  // 빈/null 패치값으로 DB 비밀번호가 지워지는 것을 방지 (관리자 패널·resync 안전망)
  const safePatch = { ...patch };
  for (const key of SECRET_SETTING_KEYS) {
    if (key in safePatch && (safePatch[key] == null || String(safePatch[key]).trim() === '')) {
      delete safePatch[key];
    }
  }
  const merged: Record<string, unknown> = {
    ...defaults,
    ...current,
    ...safePatch,
    id: 1,
    updated_at: now,
  };
  for (const k of LEGACY_APP_SETTINGS_KEYS) delete merged[k];
  if ('functions_locked' in merged) {
    const v = merged.functions_locked;
    merged.functions_locked = v === true || v === 1 || v === 'true' || v === '1';
  }
  if (isLocalQrUrl(merged.qr_base_url)) merged.qr_base_url = PRODUCTION_QR_BASE;
  if ('event_schedule' in merged) merged.event_schedule = serializeEventSchedule(merged.event_schedule);
  if (Array.isArray(merged.direct_notice_presets)) {
    merged.direct_notice_presets = JSON.stringify(merged.direct_notice_presets);
  }
  return merged;
}


/** Strip HTML tags + cap string length for admin_update_settings XSS defense. */
export function sanitizeAdminSettingsPayload(
  raw: Record<string, unknown>,
  maxLen = 2000,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [
      k,
      typeof v === 'string' ? v.replace(/<[^>]*>/g, '').slice(0, k === 'event_schedule' || k === 'direct_notice_presets' ? 12000 : maxLen) : v,
    ]),
  );
}

/** test_update_settings allowlist filter. */
export const ALLOWED_TEST_SETTINGS_FIELDS = new Set(['session_active', 'active_tables']);

export function filterTestSettingsPayload(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(raw).filter(([k]) => ALLOWED_TEST_SETTINGS_FIELDS.has(k)),
  );
}

/**
 * Copy non-empty secret keys from a Postgres settings row onto `row`,
 * skipping keys the caller is explicitly writing.
 * Does not mutate inputs; returns a shallow copy of `row` with overlays.
 */
export function overlaySecretsFromDbRow(
  row: Record<string, unknown>,
  db: Record<string, unknown>,
  explicit: Set<string>,
  secretKeys: readonly string[] = SECRET_SETTING_KEYS,
): Record<string, unknown> {
  const next = { ...row };
  for (const key of secretKeys) {
    if (explicit.has(key)) continue;
    if (db[key] != null && String(db[key]).trim() !== '') next[key] = db[key];
  }
  return next;
}
