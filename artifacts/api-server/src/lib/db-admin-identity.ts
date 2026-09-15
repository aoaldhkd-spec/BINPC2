/**
 * Admin/NPC profile identity helpers — extracted from routes/db.ts.
 * Pure phone/nickname matching; store lookups stay in db.ts wrappers.
 */

/** Admin participant nickname is always fixed after reset / bootstrap. */
export const ADMIN_FIXED_NICKNAME = '범일NPC';

/** 생월·생일 변경 최대 횟수 — FE `lib/birth-md-edit.ts` BIRTH_MD_EDIT_MAX 와 동기화 */
export const BIRTH_MD_EDIT_MAX = 2;

export function birthMdWouldChangeRow(
  row: Record<string, unknown>,
  patch: Record<string, unknown>,
): boolean {
  const nextMonth = 'birth_month' in patch ? patch.birth_month : row.birth_month;
  const nextDay = 'birth_day' in patch ? patch.birth_day : row.birth_day;
  return Number(nextMonth ?? 0) !== Number(row.birth_month ?? 0)
    || Number(nextDay ?? 0) !== Number(row.birth_day ?? 0);
}

export function normalizePhoneDigits(value: unknown): string {
  return String(value ?? '').replace(/[^0-9]/g, '');
}

/** Digits from an app_settings row (or null). Caller supplies the row. */
export function adminPhoneDigitsFromSettings(
  settings?: Record<string, unknown> | null,
): string {
  return normalizePhoneDigits(settings?.['admin_phone']);
}

export function isAdminProfilePhone(
  phone: unknown,
  adminPhoneDigits: string,
): boolean {
  const phoneDigits = normalizePhoneDigits(phone);
  return Boolean(adminPhoneDigits && phoneDigits && adminPhoneDigits === phoneDigits);
}

export function isAdminProfileRow(
  row: Record<string, unknown>,
  adminPhoneDigits: string,
): boolean {
  return isAdminProfilePhone(row['phone_number'], adminPhoneDigits)
    || String(row['nickname'] ?? '') === ADMIN_FIXED_NICKNAME;
}

/** Force admin phone profiles to the fixed nickname; preserve other fields. */
export function withFixedAdminNickname(
  row: Record<string, unknown>,
  adminPhoneDigits: string,
): Record<string, unknown> {
  if (!isAdminProfilePhone(row['phone_number'], adminPhoneDigits)) return row;
  if (String(row['nickname'] ?? '') === ADMIN_FIXED_NICKNAME) return row;
  return { ...row, nickname: ADMIN_FIXED_NICKNAME };
}

/** Find 범일NPC row in a profiles snapshot (phone match, then nickname). */
export function findAdminProfileInRows(
  profiles: Record<string, unknown>[],
  adminPhoneDigits: string,
): Record<string, unknown> | undefined {
  return profiles.find(p => isAdminProfilePhone(p['phone_number'], adminPhoneDigits))
    ?? profiles.find(p => String(p['nickname'] ?? '') === ADMIN_FIXED_NICKNAME);
}
