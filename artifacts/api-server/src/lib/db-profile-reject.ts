/**
 * Profile write-path reject helpers — extracted from routes/db.ts.
 * Korean error copy stays here; Express Response I/O is injected by callers.
 */
import type { Response } from 'express';
import { isAdultBirthYear } from './korean-age.js';
import { isNpcTextAvatar } from './npc-text-avatar.js';
import { isAdminProfileRow } from './db-admin-identity.js';

export const ADULT_BIRTH_YEAR_ERROR = {
  message: '만 20세(한국식 나이) 이상만 가입할 수 있습니다.',
  code: 'ADULT_ONLY',
} as const;

export const AVATAR_COLOR_COUNT = 12;

export function profileBirthYearRejected(res: Response, birthYear: unknown): boolean {
  if (birthYear == null || birthYear === '') return false;
  if (isAdultBirthYear(birthYear)) return false;
  res.status(400).json({ data: null, error: ADULT_BIRTH_YEAR_ERROR });
  return true;
}

export function profileAvatarColorRejected(res: Response, avatarColor: unknown): boolean {
  if (avatarColor == null) return false;
  const n = Number(avatarColor);
  if (Number.isInteger(n) && n >= 0 && n < AVATAR_COLOR_COUNT) return false;
  res.status(400).json({
    data: null,
    error: { message: '카드 배경색 값이 올바르지 않습니다.', code: 'INVALID_AVATAR_COLOR' },
  });
  return true;
}

export function profileNpcAvatarRejected(
  res: Response,
  photoUrl: unknown,
  profileRow: Record<string, unknown>,
  adminPhoneDigits: string,
): boolean {
  if (!isNpcTextAvatar(photoUrl)) return false;
  if (isAdminProfileRow(profileRow, adminPhoneDigits)) return false;
  res.status(403).json({
    data: null,
    error: { message: '범일NPC 전용 아바타입니다.', code: 'NPC_AVATAR_FORBIDDEN' },
  });
  return true;
}
