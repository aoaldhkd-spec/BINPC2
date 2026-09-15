import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_QR_BASE,
  SECRET_SETTING_KEYS,
  explicitSecretKeys,
  isLocalQrUrl,
  koreanDateMMDD,
  mergeAppSettings,
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

  it('koreanDateMMDD uses KST with 03:00 rollover', () => {
    // 2026-09-15 01:30 KST = 2026-09-14 16:30 UTC → still previous day after -3h shift
    const early = new Date('2026-09-14T16:30:00.000Z');
    expect(koreanDateMMDD(early)).toBe('0914');
    // 2026-09-15 04:00 KST = 2026-09-14 19:00 UTC → same calendar day
    const late = new Date('2026-09-14T19:00:00.000Z');
    expect(koreanDateMMDD(late)).toBe('0915');
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
});
