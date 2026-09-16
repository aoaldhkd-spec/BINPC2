/**
 * App settings public view / functions-lock / resync planners — extracted from routes/db.ts.
 * PG hydrate/persist and store mutate stay in db.ts (thin wrappers + I/O).
 */
import { sanitizeSettings } from './db-sanitize.js';
import { activeEventScheduleSlot, serializeEventSchedule } from './db-event-schedule.js';
import {
  panelAdminSecrets,
  panelSecretsForRuntime,
  panelTestSecrets,
} from './db-panel-secrets.js';
import { SECRET_SETTING_KEYS } from './db-app-settings-merge.js';

/** 행사 중 매칭/소셜 쓰기 — 하트·1:1 방/메시지·연락처 공유·단톡 */
export const FUNCTIONS_LOCKED_INSERT_TABLES = new Set([
  'likes',
  'messages',
  'chats',
  'contact_shares',
  'group_messages',
  'group_participants',
  'signal_sends',
]);

export const FUNCTIONS_LOCKED_UPDATE_TABLES = new Set([
  'likes',
  'contact_shares',
]);

export const FUNCTIONS_LOCKED_ERROR = {
  message: '행사 중에는 하트·채팅·시그널·단톡을 사용할 수 없습니다.',
  code: 'FUNCTIONS_LOCKED',
} as const;

export function settingsFunctionsLocked(row: Record<string, unknown> | null | undefined): boolean {
  const v = row?.functions_locked;
  const base = v === true || v === 1 || v === 'true' || v === '1';
  const slot = activeEventScheduleSlot(row?.event_schedule);
  return slot?.functions_locked ?? base;
}

/** Strip secrets; forAdmin adds *_password_set booleans only. */
export function publicAppSettingsView(
  row: Record<string, unknown>,
  forAdmin: boolean,
): Record<string, unknown> {
  const s = sanitizeSettings(row);
  if (forAdmin) {
    s.admin_password_set = panelAdminSecrets(row.admin_password as string | undefined).length > 0;
    s.test_password_set = panelTestSecrets(row.test_password as string | undefined).length > 0;
    s.reset_password_set = panelSecretsForRuntime(row.reset_password as string | undefined).length > 0;
  }
  return s;
}

export function tableFingerprint(rows: Record<string, unknown>[]): string {
  let maxTs = '';
  for (const r of rows) {
    const ts = String(r.updated_at ?? r.created_at ?? '');
    if (ts > maxTs) maxTs = ts;
  }
  return `${rows.length}:${maxTs}`;
}

export function pickLatestAppSettingsRow(
  rows: Record<string, unknown>[],
): Record<string, unknown> | null {
  if (!rows.length) return null;
  let best = rows[0];
  let bestTs = String(best.updated_at ?? '');
  for (let i = 1; i < rows.length; i++) {
    const ts = String(rows[i].updated_at ?? '');
    if (ts >= bestTs) {
      best = rows[i];
      bestTs = ts;
    }
  }
  return best;
}

export type AppSettingsApplyPlan =
  | { action: 'empty' }
  | {
      action: 'replace';
      row: Record<string, unknown>;
      changed: boolean;
      persistLegacy: boolean;
    }
  | {
      action: 'secrets_overlay';
      row: Record<string, unknown>;
      changed: boolean;
    };

/**
 * DB resync plan for app_settings: prefer newer updated_at; when memory is newer,
 * still overlay panel secrets from DB (never heal-persist old passwords).
 */
export function planAppSettingsFromDbRows(
  memRow: Record<string, unknown> | null,
  dbRows: Record<string, unknown>[],
  opts: {
    stripLegacy: (row: Record<string, unknown>) => Record<string, unknown>;
    hasLegacy: (row: Record<string, unknown>) => boolean;
    secretKeys?: readonly string[];
  },
): AppSettingsApplyPlan {
  const secretKeys = opts.secretKeys ?? SECRET_SETTING_KEYS;
  const dbRow = pickLatestAppSettingsRow(dbRows);
  if (!dbRow) return { action: 'empty' };
  const hadLegacy = opts.hasLegacy(dbRow);
  const cleaned = opts.stripLegacy(dbRow);
  if (!memRow) {
    return { action: 'replace', row: cleaned, changed: true, persistLegacy: hadLegacy };
  }
  const memTs = String(memRow.updated_at ?? '');
  const dbTs = String(dbRow.updated_at ?? '');
  if (dbTs >= memTs) {
    const changed = memTs !== dbTs
      || memRow.session_active !== dbRow.session_active
      || settingsFunctionsLocked(memRow) !== settingsFunctionsLocked(cleaned);
    return { action: 'replace', row: cleaned, changed, persistLegacy: hadLegacy };
  }
  const merged = { ...memRow };
  for (const key of secretKeys) {
    if (cleaned[key] != null && String(cleaned[key]).trim() !== '') merged[key] = cleaned[key];
  }
  const row = opts.stripLegacy(merged);
  const changed = secretKeys.some(k => String(memRow[k] ?? '') !== String(merged[k] ?? ''));
  return { action: 'secrets_overlay', row, changed };
}

/** Public /ready JSON body (no PII beyond entry_password which is already public gate). */
export function buildReadyPayload(input: {
  settings: Record<string, unknown>;
  adminConfigured: boolean;
  testConfigured: boolean;
  resetConfigured: boolean;
  legacyLeftovers: { kv_tables: number; settings_rows: number; history_rows: number };
  checkedAt: string;
}): Record<string, unknown> {
  const settings = input.settings;
  return {
    ready: true,
    settings: {
      session_active: settings.session_active === true,
      entry_password: String(settings.entry_password ?? ''),
      timer_end_at: (settings.timer_end_at as string | null | undefined) ?? null,
      timer_label: (settings.timer_label as string | null | undefined) ?? null,
      // Always serialize — object schedules from jsonb must not collapse to empty slots
      // (that wiped rainbow_pool on /ready and re-locked participant hearts).
      event_schedule: serializeEventSchedule(settings.event_schedule),
      reset_signal: (settings.reset_signal as string | null | undefined) ?? null,
      functions_locked: settingsFunctionsLocked(settings),
    },
    login: {
      adminConfigured: input.adminConfigured,
      testConfigured: input.testConfigured,
      resetConfigured: input.resetConfigured,
    },
    functions_locked: settingsFunctionsLocked(settings),
    qr_base_url: settings.qr_base_url ?? null,
    legacy_leftovers: {
      kv_tables: input.legacyLeftovers.kv_tables,
      settings_rows: input.legacyLeftovers.settings_rows,
      history_rows: input.legacyLeftovers.history_rows,
    },
    checkedAt: input.checkedAt,
  };
}
