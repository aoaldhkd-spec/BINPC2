/**
 * /by-pin request validate + nickname mask — extracted from routes/db.ts.
 * Pure; rate buckets / store lookup stay in db.ts.
 */

export type PinLookupReject = {
  status: number;
  body: { data: null; error: { message: string; code?: string } };
};

export type PinLookupBodyOk = {
  ok: true;
  pin: string;
  nickname: string | null;
};

export type PinLookupBodyResult = PinLookupBodyOk | { ok: false; reject: PinLookupReject };

export function validateByPinBody(
  pin: unknown,
  nickname: unknown,
): PinLookupBodyResult {
  if (!pin || typeof pin !== 'string' || pin.length === 0 || pin.length > 8) {
    return {
      ok: false,
      reject: {
        status: 400,
        body: { data: null, error: { message: 'PIN required (max 8 chars)' } },
      },
    };
  }
  if (nickname != null && (typeof nickname !== 'string' || nickname.length > 30)) {
    return {
      ok: false,
      reject: {
        status: 400,
        body: { data: null, error: { message: 'Invalid nickname' } },
      },
    };
  }
  return {
    ok: true,
    pin,
    nickname: nickname == null ? null : String(nickname),
  };
}

/** 1단계: pin만 입력 → 마스킹된 닉네임. */
export function maskNicknameForPinConfirm(nick: string): string {
  return nick.length > 1
    ? nick[0] + '*'.repeat(nick.length - 1)
    : nick[0] ?? '*';
}

export function pinLookupNotFoundReject(): PinLookupReject {
  return {
    status: 200,
    body: { data: null, error: { message: '해당 번호로 등록된 프로필이 없어요' } },
  };
}

export function pinNicknameMismatchReject(): PinLookupReject {
  return {
    status: 200,
    body: {
      data: null,
      error: { message: '닉네임이 일치하지 않습니다. 본인 닉네임을 정확히 입력해주세요.' },
    },
  };
}

export function pinRateLimitedReject(): PinLookupReject {
  return {
    status: 429,
    body: {
      data: null,
      error: { message: '시도 횟수를 초과했습니다. 15분 후 다시 시도해주세요.' },
    },
  };
}
