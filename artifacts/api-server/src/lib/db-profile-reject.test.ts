import { describe, expect, it, vi } from 'vitest';
import { ADMIN_FIXED_NICKNAME } from './db-admin-identity.js';
import { NPC_TEXT_AVATAR_SENTINEL } from './npc-text-avatar.js';
import {
  ADULT_BIRTH_YEAR_ERROR,
  AVATAR_COLOR_COUNT,
  profileAvatarColorRejected,
  profileBirthYearRejected,
  profileNpcAvatarRejected,
} from './db-profile-reject.js';

function mockRes() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { status, json, res: { status } as unknown as import('express').Response };
}

describe('db-profile-reject', () => {
  it('profileBirthYearRejected allows empty/adult and rejects underage with Korean copy', () => {
    const empty = mockRes();
    expect(profileBirthYearRejected(empty.res, null)).toBe(false);
    expect(profileBirthYearRejected(empty.res, '')).toBe(false);
    expect(empty.status).not.toHaveBeenCalled();

    const adult = mockRes();
    expect(profileBirthYearRejected(adult.res, 1990)).toBe(false);
    expect(adult.status).not.toHaveBeenCalled();

    const under = mockRes();
    expect(profileBirthYearRejected(under.res, 2015)).toBe(true);
    expect(under.status).toHaveBeenCalledWith(400);
    expect(under.json).toHaveBeenCalledWith({ data: null, error: ADULT_BIRTH_YEAR_ERROR });
    expect(ADULT_BIRTH_YEAR_ERROR.message).toContain('만 20세');
    expect(ADULT_BIRTH_YEAR_ERROR.code).toBe('ADULT_ONLY');
  });

  it('profileAvatarColorRejected allows null/0..11 and rejects out of range', () => {
    const okNull = mockRes();
    expect(profileAvatarColorRejected(okNull.res, null)).toBe(false);

    const ok0 = mockRes();
    expect(profileAvatarColorRejected(ok0.res, 0)).toBe(false);
    const okLast = mockRes();
    expect(profileAvatarColorRejected(okLast.res, AVATAR_COLOR_COUNT - 1)).toBe(false);

    const bad = mockRes();
    expect(profileAvatarColorRejected(bad.res, AVATAR_COLOR_COUNT)).toBe(true);
    expect(bad.status).toHaveBeenCalledWith(400);
    expect(bad.json).toHaveBeenCalledWith({
      data: null,
      error: { message: '카드 배경색 값이 올바르지 않습니다.', code: 'INVALID_AVATAR_COLOR' },
    });

    const badFloat = mockRes();
    expect(profileAvatarColorRejected(badFloat.res, 1.5)).toBe(true);
  });

  it('profileNpcAvatarRejected blocks NPC sentinel for non-admin only', () => {
    const digits = '01038786740';
    const nonNpc = mockRes();
    expect(profileNpcAvatarRejected(nonNpc.res, 'https://x/y.webp', { nickname: '유저' }, digits)).toBe(false);

    const adminByNick = mockRes();
    expect(profileNpcAvatarRejected(
      adminByNick.res,
      NPC_TEXT_AVATAR_SENTINEL,
      { nickname: ADMIN_FIXED_NICKNAME },
      digits,
    )).toBe(false);

    const forbidden = mockRes();
    expect(profileNpcAvatarRejected(
      forbidden.res,
      NPC_TEXT_AVATAR_SENTINEL,
      { nickname: '유저', phone_number: '01011112222' },
      digits,
    )).toBe(true);
    expect(forbidden.status).toHaveBeenCalledWith(403);
    expect(forbidden.json).toHaveBeenCalledWith({
      data: null,
      error: { message: '범일NPC 전용 아바타입니다.', code: 'NPC_AVATAR_FORBIDDEN' },
    });
  });
});
