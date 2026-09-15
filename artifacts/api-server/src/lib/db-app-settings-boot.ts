/**
 * App settings default / repair / bootstrap-secret planners — extracted from routes/db.ts.
 * Pure given env-derived inputs; PG overlay + persist stay in db.ts.
 */
import {
  PRODUCTION_QR_BASE,
  isLocalQrUrl,
} from './db-app-settings-merge.js';
import { settingsHaveLegacyKeys } from './db-legacy-cleanup.js';
import {
  PANEL_DEFAULT_PASSWORD,
  isDefaultPanelPassword,
} from './db-panel-secrets.js';

/** Build the canonical empty-DB app_settings row (caller supplies now + bootstrap env). */
export function buildDefaultAppSettings(input: {
  now: string;
  bootstrapAdmin?: string;
  bootstrapTest?: string;
  panelDefault?: string;
  productionQrBase?: string;
  entryPassword?: string;
}): Record<string, unknown> {
  const panelDefault = input.panelDefault ?? PANEL_DEFAULT_PASSWORD;
  const productionQrBase = input.productionQrBase ?? PRODUCTION_QR_BASE;
  const bootstrapAdmin = input.bootstrapAdmin?.trim();
  const bootstrapTest = input.bootstrapTest?.trim();
  return {
    id: 1,
    session_active: false,
    admin_phone: '010-3878-6740',
    admin_password: bootstrapAdmin || panelDefault,
    updated_at: input.now,
    timer_end_at: null,
    timer_label: null,
    functions_locked: false,
    reset_signal: null,
    entry_password: input.entryPassword ?? '',
    reset_password: panelDefault,
    test_password: bootstrapTest || panelDefault,
    qr_base_url: productionQrBase,
    active_tables: null,
  };
}

/** True when id/session_active/passwords core fields are missing or empty. */
export function appSettingsCoreFieldsBroken(row: Record<string, unknown>): boolean {
  return row.id == null
    || row.session_active === undefined
    || row.admin_password === undefined
    || row.admin_password === null
    || row.admin_password === ''
    || row.entry_password === undefined
    || row.test_password === undefined;
}

export type AppSettingsSecretsPatchPlan = {
  patch: Record<string, unknown>;
  /** True when patch is non-empty or legacy keys must be stripped. */
  shouldApply: boolean;
};

/**
 * BOOTSTRAP_* / factory-default secret sync + local QR rewrite plan.
 * Does not mutate row; caller merges + overlayDbSecrets + persist.
 */
export function planAppSettingsSecretsPatch(
  row: Record<string, unknown>,
  input: {
    bootstrapAdmin?: string;
    bootstrapTest?: string;
    panelDefault?: string;
  } = {},
): AppSettingsSecretsPatchPlan {
  const panelDefault = input.panelDefault ?? PANEL_DEFAULT_PASSWORD;
  const bootstrapAdmin = input.bootstrapAdmin?.trim();
  const bootstrapTest = input.bootstrapTest?.trim();

  const patch: Record<string, unknown> = {};
  const currentAdmin = String(row.admin_password ?? '').trim();
  const currentTest = row.test_password == null ? '' : String(row.test_password);
  const currentReset = row.reset_password == null ? '' : String(row.reset_password);
  const targetAdmin = bootstrapAdmin || panelDefault;
  const targetTest = bootstrapTest || panelDefault;
  if ((!currentAdmin || isDefaultPanelPassword(currentAdmin)) && currentAdmin !== targetAdmin) {
    patch.admin_password = targetAdmin;
  }
  if ((!currentTest || isDefaultPanelPassword(currentTest)) && currentTest !== targetTest) {
    patch.test_password = targetTest;
  }
  if ((!currentReset || isDefaultPanelPassword(currentReset)) && currentReset !== panelDefault) {
    patch.reset_password = panelDefault;
  }
  if (isLocalQrUrl(row.qr_base_url)) patch.qr_base_url = PRODUCTION_QR_BASE;
  const needsStrip = settingsHaveLegacyKeys(row);
  const shouldApply = Object.keys(patch).length > 0 || needsStrip;
  return { patch, shouldApply };
}
