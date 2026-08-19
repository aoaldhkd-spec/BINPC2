import { describe, expect, it } from 'vitest';
import {
  LEGACY_APP_SETTINGS_KEYS,
  LEGACY_KV_TABLE_NAMES,
  LEGACY_OP_BLOCKLIST,
  settingsHaveLegacyKeys,
  stripLegacySessionHistoryKeys,
  stripLegacySettingsKeys,
} from '../lib/db-legacy-cleanup.js';

describe('db-legacy-cleanup pure helpers', () => {
  it('stripLegacySettingsKeys removes heart_drain and seating keys', () => {
    const row = {
      id: 1,
      timer_label: 'ok',
      heart_drain_enabled: true,
      heart_drain_minutes: 15,
      seating_locked: true,
      seats_snapshot: { a: 1 },
      seating_map: {},
      seats: [],
      seat_layout: 'x',
    };
    const cleaned = stripLegacySettingsKeys(row);
    expect(cleaned.timer_label).toBe('ok');
    expect(cleaned.id).toBe(1);
    for (const k of LEGACY_APP_SETTINGS_KEYS) {
      expect(cleaned).not.toHaveProperty(k);
    }
  });

  it('stripLegacySettingsKeys is idempotent', () => {
    const row = { id: 1, heart_drain_enabled: true, seating_locked: false };
    const once = stripLegacySettingsKeys(row);
    const twice = stripLegacySettingsKeys(once);
    expect(twice).toEqual(once);
    expect(settingsHaveLegacyKeys(twice)).toBe(false);
  });

  it('stripLegacySessionHistoryKeys keeps row but removes seat map keys', () => {
    const row = { id: 'h1', event: 'end', seats_snapshot: {}, seating_locked: true };
    const cleaned = stripLegacySessionHistoryKeys(row);
    expect(cleaned.id).toBe('h1');
    expect(cleaned.event).toBe('end');
    expect(cleaned).not.toHaveProperty('seats_snapshot');
    expect(cleaned).not.toHaveProperty('seating_locked');
  });

  it('stripLegacySessionHistoryKeys is idempotent', () => {
    const row = { seating_map: { x: 1 } };
    expect(stripLegacySessionHistoryKeys(stripLegacySessionHistoryKeys(row))).toEqual({ });
  });

  it('LEGACY_OP_BLOCKLIST covers all KV purge tables plus heart_balances', () => {
    for (const t of LEGACY_KV_TABLE_NAMES) {
      expect(LEGACY_OP_BLOCKLIST).toContain(t);
    }
    expect(LEGACY_OP_BLOCKLIST).toContain('heart_balances');
  });
});
