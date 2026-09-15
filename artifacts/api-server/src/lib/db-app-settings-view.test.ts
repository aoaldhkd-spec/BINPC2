import { describe, expect, it } from 'vitest';
import {
  FUNCTIONS_LOCKED_ERROR,
  FUNCTIONS_LOCKED_INSERT_TABLES,
  FUNCTIONS_LOCKED_UPDATE_TABLES,
  pickLatestAppSettingsRow,
  planAppSettingsFromDbRows,
  publicAppSettingsView,
  settingsFunctionsLocked,
  tableFingerprint,
  buildReadyPayload,
} from './db-app-settings-view.js';

describe('db-app-settings-view', () => {
  it('functions-lock sets and error payload stay stable', () => {
    expect(FUNCTIONS_LOCKED_INSERT_TABLES.has('likes')).toBe(true);
    expect(FUNCTIONS_LOCKED_INSERT_TABLES.has('messages')).toBe(true);
    expect(FUNCTIONS_LOCKED_INSERT_TABLES.has('profiles')).toBe(false);
    expect(FUNCTIONS_LOCKED_UPDATE_TABLES.has('likes')).toBe(true);
    expect(FUNCTIONS_LOCKED_UPDATE_TABLES.has('messages')).toBe(false);
    expect(FUNCTIONS_LOCKED_ERROR.code).toBe('FUNCTIONS_LOCKED');
    expect(FUNCTIONS_LOCKED_ERROR.message).toContain('행사 중에는');
  });

  it('settingsFunctionsLocked accepts bool/1/string forms', () => {
    expect(settingsFunctionsLocked({ functions_locked: true })).toBe(true);
    expect(settingsFunctionsLocked({ functions_locked: 1 })).toBe(true);
    expect(settingsFunctionsLocked({ functions_locked: 'true' })).toBe(true);
    expect(settingsFunctionsLocked({ functions_locked: '1' })).toBe(true);
    expect(settingsFunctionsLocked({ functions_locked: false })).toBe(false);
    expect(settingsFunctionsLocked({ functions_locked: 0 })).toBe(false);
    expect(settingsFunctionsLocked(null)).toBe(false);
    expect(settingsFunctionsLocked(undefined)).toBe(false);
  });

  it('publicAppSettingsView strips secrets; forAdmin adds *_set flags', () => {
    const row = {
      id: 1,
      session_active: true,
      admin_password: 'secret-admin',
      test_password: 'secret-test',
      reset_password: 'secret-reset',
      entry_password: 'venue-code',
    };
    const userView = publicAppSettingsView(row, false);
    expect(userView.admin_password).toBeUndefined();
    expect(userView.test_password).toBeUndefined();
    expect(userView.reset_password).toBeUndefined();
    expect(userView.admin_password_set).toBeUndefined();
    expect(userView.session_active).toBe(true);

    const adminView = publicAppSettingsView(row, true);
    expect(adminView.admin_password).toBeUndefined();
    expect(adminView.admin_password_set).toBe(true);
    expect(adminView.test_password_set).toBe(true);
    expect(adminView.reset_password_set).toBe(true);
  });

  it('tableFingerprint uses length + max updated_at/created_at', () => {
    expect(tableFingerprint([])).toBe('0:');
    expect(tableFingerprint([
      { id: 'a', updated_at: '2024-01-01' },
      { id: 'b', created_at: '2024-02-01' },
      { id: 'c', updated_at: '2024-01-15' },
    ])).toBe('3:2024-02-01');
  });

  it('pickLatestAppSettingsRow prefers latest updated_at', () => {
    expect(pickLatestAppSettingsRow([])).toBeNull();
    const rows = [
      { id: 1, updated_at: '2024-01-01' },
      { id: 1, updated_at: '2024-03-01' },
      { id: 1, updated_at: '2024-02-01' },
    ];
    expect(pickLatestAppSettingsRow(rows)?.updated_at).toBe('2024-03-01');
  });

  it('planAppSettingsFromDbRows replace / secrets_overlay / empty', () => {
    const strip = (r: Record<string, unknown>) => {
      const n = { ...r };
      delete n.legacy_key;
      return n;
    };
    const hasLegacy = (r: Record<string, unknown>) => 'legacy_key' in r;

    expect(planAppSettingsFromDbRows(null, [], { stripLegacy: strip, hasLegacy })).toEqual({
      action: 'empty',
    });

    const dbNewer = planAppSettingsFromDbRows(
      { id: 1, updated_at: '2024-01-01', session_active: false, functions_locked: false },
      [{ id: 1, updated_at: '2024-02-01', session_active: true, functions_locked: true, legacy_key: 1 }],
      { stripLegacy: strip, hasLegacy },
    );
    expect(dbNewer.action).toBe('replace');
    if (dbNewer.action === 'replace') {
      expect(dbNewer.changed).toBe(true);
      expect(dbNewer.persistLegacy).toBe(true);
      expect(dbNewer.row.session_active).toBe(true);
      expect(dbNewer.row.legacy_key).toBeUndefined();
    }

    const memNewer = planAppSettingsFromDbRows(
      {
        id: 1,
        updated_at: '2024-03-01',
        session_active: true,
        admin_password: 'old',
        test_password: 't-old',
      },
      [{
        id: 1,
        updated_at: '2024-01-01',
        session_active: false,
        admin_password: 'new-admin',
        test_password: '  ',
      }],
      { stripLegacy: strip, hasLegacy },
    );
    expect(memNewer.action).toBe('secrets_overlay');
    if (memNewer.action === 'secrets_overlay') {
      expect(memNewer.changed).toBe(true);
      expect(memNewer.row.admin_password).toBe('new-admin');
      expect(memNewer.row.test_password).toBe('t-old');
      expect(memNewer.row.session_active).toBe(true);
    }

    const noMem = planAppSettingsFromDbRows(
      null,
      [{ id: 1, updated_at: '2024-01-01', session_active: true }],
      { stripLegacy: strip, hasLegacy },
    );
    expect(noMem).toEqual({
      action: 'replace',
      row: { id: 1, updated_at: '2024-01-01', session_active: true },
      changed: true,
      persistLegacy: false,
    });
  });

  it('buildReadyPayload keeps gate fields', () => {
    const body = buildReadyPayload({
      settings: { session_active: true, entry_password: '1234', reset_signal: 'r' },
      adminConfigured: true,
      testConfigured: false,
      resetConfigured: true,
      legacyLeftovers: { kv_tables: 0, settings_rows: 0, history_rows: 0 },
      checkedAt: 't',
    });
    expect(body.ready).toBe(true);
    expect((body.settings as any).entry_password).toBe('1234');
    expect((body.login as any).adminConfigured).toBe(true);
  });

});
