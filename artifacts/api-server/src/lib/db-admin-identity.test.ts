import { describe, expect, it } from 'vitest';
import {
  ADMIN_FIXED_NICKNAME,
  BIRTH_MD_EDIT_MAX,
  adminPhoneDigitsFromSettings,
  birthMdWouldChangeRow,
  findAdminProfileInRows,
  isAdminProfilePhone,
  isAdminProfileRow,
  normalizePhoneDigits,
  withFixedAdminNickname,
} from './db-admin-identity.js';

describe('db-admin-identity', () => {
  it('exports fixed nickname and birth-md max synced with FE', () => {
    expect(ADMIN_FIXED_NICKNAME).toBe('범일NPC');
    expect(BIRTH_MD_EDIT_MAX).toBe(2);
  });

  it('normalizes phone digits and reads admin phone from settings', () => {
    expect(normalizePhoneDigits('010-1234-5678')).toBe('01012345678');
    expect(adminPhoneDigitsFromSettings({ admin_phone: '010-9999-0000' })).toBe('01099990000');
    expect(adminPhoneDigitsFromSettings(null)).toBe('');
  });

  it('matches admin by phone or fixed nickname', () => {
    const digits = '01099990000';
    expect(isAdminProfilePhone('010-9999-0000', digits)).toBe(true);
    expect(isAdminProfilePhone('01011112222', digits)).toBe(false);
    expect(isAdminProfileRow({ nickname: ADMIN_FIXED_NICKNAME, phone_number: 'x' }, digits)).toBe(true);
    expect(isAdminProfileRow({ nickname: 'other', phone_number: '01099990000' }, digits)).toBe(true);
  });

  it('withFixedAdminNickname only rewrites admin-phone rows', () => {
    const digits = '01099990000';
    expect(withFixedAdminNickname({ phone_number: '01099990000', nickname: 'tmp' }, digits)).toEqual({
      phone_number: '01099990000',
      nickname: ADMIN_FIXED_NICKNAME,
    });
    expect(withFixedAdminNickname({ phone_number: '01011112222', nickname: 'tmp' }, digits).nickname).toBe('tmp');
  });

  it('findAdminProfileInRows prefers phone then nickname', () => {
    const digits = '01099990000';
    const byPhone = { id: 'a', phone_number: '01099990000', nickname: 'x' };
    const byNick = { id: 'b', phone_number: '0', nickname: ADMIN_FIXED_NICKNAME };
    expect(findAdminProfileInRows([byNick, byPhone], digits)?.id).toBe('a');
    expect(findAdminProfileInRows([byNick], digits)?.id).toBe('b');
  });

  it('birthMdWouldChangeRow detects month/day patch', () => {
    const row = { birth_month: 3, birth_day: 15 };
    expect(birthMdWouldChangeRow(row, { birth_month: 3, birth_day: 15 })).toBe(false);
    expect(birthMdWouldChangeRow(row, { birth_month: 4 })).toBe(true);
    expect(birthMdWouldChangeRow(row, { nickname: 'x' })).toBe(false);
  });
});
