import { describe, expect, it } from 'vitest';
import { PRODUCTION_QR_BASE } from './db-app-settings-merge.js';
import { PANEL_DEFAULT_PASSWORD } from './db-panel-secrets.js';
import {
  appSettingsCoreFieldsBroken,
  buildDefaultAppSettings,
  planAppSettingsSecretsPatch,
} from './db-app-settings-boot.js';

describe('db-app-settings-boot', () => {
  it('buildDefaultAppSettings fills factory defaults and bootstrap overrides', () => {
    const row = buildDefaultAppSettings({
      now: 'n0',
      entryPassword: 'venue-code',
      bootstrapAdmin: 'admin-secret',
      bootstrapTest: 'test-secret',
    });
    expect(row).toMatchObject({
      id: 1,
      session_active: false,
      admin_phone: '010-3878-6740',
      admin_password: 'admin-secret',
      test_password: 'test-secret',
      reset_password: PANEL_DEFAULT_PASSWORD,
      entry_password: 'venue-code',
      qr_base_url: PRODUCTION_QR_BASE,
      functions_locked: false,
      updated_at: 'n0',
    });
  });

  it('does not invent a date as the default entry code', () => {
    const row = buildDefaultAppSettings({ now: 'n0' });
    expect(row.entry_password).toBe('');
  });

  it('appSettingsCoreFieldsBroken detects missing core fields', () => {
    expect(appSettingsCoreFieldsBroken({
      id: 1,
      session_active: false,
      admin_password: 'x',
      entry_password: 'venue-code',
      test_password: 'y',
    })).toBe(false);
    expect(appSettingsCoreFieldsBroken({
      session_active: false,
      admin_password: 'x',
      entry_password: 'venue-code',
      test_password: 'y',
    })).toBe(true);
    expect(appSettingsCoreFieldsBroken({
      id: 1,
      session_active: false,
      admin_password: '',
      entry_password: 'venue-code',
      test_password: 'y',
    })).toBe(true);
  });

  it('planAppSettingsSecretsPatch syncs defaults and local QR', () => {
    const noop = planAppSettingsSecretsPatch({
      admin_password: 'custom-admin',
      test_password: 'custom-test',
      reset_password: 'custom-reset',
      qr_base_url: PRODUCTION_QR_BASE,
    });
    expect(noop.shouldApply).toBe(false);
    expect(noop.patch).toEqual({});

    const plan = planAppSettingsSecretsPatch({
      admin_password: PANEL_DEFAULT_PASSWORD,
      test_password: PANEL_DEFAULT_PASSWORD,
      reset_password: '',
      qr_base_url: 'http://localhost:5173',
    }, {
      bootstrapAdmin: 'boot-admin',
      bootstrapTest: 'boot-test',
    });
    expect(plan.shouldApply).toBe(true);
    expect(plan.patch.admin_password).toBe('boot-admin');
    expect(plan.patch.test_password).toBe('boot-test');
    expect(plan.patch.reset_password).toBe(PANEL_DEFAULT_PASSWORD);
    expect(plan.patch.qr_base_url).toBe(PRODUCTION_QR_BASE);
  });
});
