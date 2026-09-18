import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_QR_BASE,
  SECRET_SETTING_KEYS,
  explicitSecretKeys,
  isLocalQrUrl,
  filterTestSettingsPayload,
  mergeAppSettings,
  sanitizeAdminSettingsPayload,
  overlaySecretsFromDbRow,
} from './db-app-settings-merge.js';

describe('db-app-settings-merge', () => {
  const defaults = {
    id: 1,
    session_active: false,
    admin_password: 'def',
    qr_base_url: PRODUCTION_QR_BASE,
  };

  it('exports secret keys and production QR base', () => {
    expect(SECRET_SETTING_KEYS).toContain('admin_password');
    expect(PRODUCTION_QR_BASE).toBe('https://binpc2.netlify.app');
  });

  it('isLocalQrUrl detects empty and loopback', () => {
    expect(isLocalQrUrl('')).toBe(true);
    expect(isLocalQrUrl('http://localhost:5173')).toBe(true);
    expect(isLocalQrUrl('https://binpc2.netlify.app')).toBe(false);
  });

  it('explicitSecretKeys ignores empty', () => {
    expect([...explicitSecretKeys({ admin_password: 'x', test_password: '  ' })]).toEqual(['admin_password']);
  });

  it('mergeAppSettings drops empty secret patches and strips legacy keys', () => {
    const merged = mergeAppSettings(
      { admin_password: 'keep', heart_drain_enabled: true },
      { admin_password: '', session_active: true },
      defaults,
      '2026-01-01T00:00:00.000Z',
    );
    expect(merged.admin_password).toBe('keep');
    expect(merged.session_active).toBe(true);
    expect(merged.updated_at).toBe('2026-01-01T00:00:00.000Z');
    expect('heart_drain_enabled' in merged).toBe(false);
  });

  it('mergeAppSettings rewrites local qr_base_url and coerces functions_locked', () => {
    const merged = mergeAppSettings(
      {},
      { qr_base_url: 'http://127.0.0.1:3000', functions_locked: '1' },
      defaults,
      't',
    );
    expect(merged.qr_base_url).toBe(PRODUCTION_QR_BASE);
    expect(merged.functions_locked).toBe(true);
  });


  it('sanitizeAdminSettingsPayload strips tags + filterTestSettingsPayload allowlist', () => {
    expect(sanitizeAdminSettingsPayload({ a: '<b>x</b>', n: 1 })).toEqual({ a: 'x', n: 1 });
    expect(filterTestSettingsPayload({ session_active: true, admin_password: 'x' })).toEqual({
      session_active: true,
    });
    const long = 'x'.repeat(3000);
    expect((sanitizeAdminSettingsPayload({ direct_notice_presets: long }) as { direct_notice_presets: string }).direct_notice_presets).toHaveLength(3000);
    expect((sanitizeAdminSettingsPayload({ other: long }) as { other: string }).other).toHaveLength(2000);
  });

  it('mergeAppSettings presets patch keeps event_schedule slots', () => {
    const schedule = JSON.stringify({
      timezone: 'Asia/Seoul',
      version: 2,
      slots: [
        { id: 'slot-1', at: '23:00', unlock: ['red'] },
        { id: 'slot-2', at: '24:30', unlock: ['rainbow'] },
      ],
    });
    const merged = mergeAppSettings(
      { event_schedule: schedule, admin_password: 'keep' },
      { direct_notice_presets: JSON.stringify([{ id: 'n1', text: '자리 이동해주세요.' }]) },
      defaults,
      't',
    );
    const parsed = JSON.parse(String(merged.event_schedule)) as { slots: Array<{ id: string; at: string }> };
    expect(parsed.slots.map(s => s.id)).toEqual(['slot-1', 'slot-2']);
    expect(parsed.slots.map(s => s.at)).toEqual(['23:00', '24:30']);
    expect(merged.direct_notice_presets).toBe(JSON.stringify([{ id: 'n1', text: '자리 이동해주세요.' }]));
  });
  it('overlaySecretsFromDbRow copies non-empty secrets unless explicit', () => {
    const row = { id: 1, admin_password: 'mem', entry_password: 'old' };
    const db = { admin_password: 'dbAdmin', test_password: 'dbTest', entry_password: '  ' };
    const out = overlaySecretsFromDbRow(row, db, new Set(['admin_password']));
    expect(out.admin_password).toBe('mem');
    expect(out.test_password).toBe('dbTest');
    expect(out.entry_password).toBe('old');
    expect(row.test_password).toBeUndefined();
  });
});
