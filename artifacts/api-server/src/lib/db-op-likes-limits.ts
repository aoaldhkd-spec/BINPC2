/**
 * /op likes INSERT same-type + rate-limit reject planners —
 * extracted from routes/db.ts. Pure; bucket maps / distributed claims stay in db.ts.
 */

export type LikesLimitReject = {
  status: number;
  body: { data: null; error: { message: string; code: string } };
};

/** Max distinct targets for one heart_type per liker (client bypass guard). */
export const LIKES_SAME_TYPE_TARGET_MAX = 2;

export const LIKES_HEART_LIMIT_MESSAGE =
  '같은 종류의 하트는 최대 2명에게만 보낼 수 있습니다.';

export const LIKES_RATE_LIMIT_MESSAGE =
  '하트를 너무 빠르게 보내고 있습니다. 잠시 후 다시 시도해 주세요.';

export function matchesLikeTriple(
  row: Record<string, unknown>,
  likerId: string,
  likedId: string,
  heartType: string,
): boolean {
  return (
    String(row.liker_id) === likerId
    && String(row.liked_id) === likedId
    && String(row.heart_type) === heartType
  );
}

export function countSameTypeLikes(
  rows: Record<string, unknown>[],
  likerId: string,
  heartType: string,
): number {
  return rows.filter(
    r => String(r.liker_id) === likerId && String(r.heart_type) === heartType,
  ).length;
}

/** 400 HEART_LIMIT — do not use 429 (client NAT retry storm). */
export function likesHeartLimitReject(): LikesLimitReject {
  return {
    status: 400,
    body: {
      data: null,
      error: { message: LIKES_HEART_LIMIT_MESSAGE, code: 'HEART_LIMIT' },
    },
  };
}

export function likesRateLimitReject(): LikesLimitReject {
  return {
    status: 429,
    body: {
      data: null,
      error: { message: LIKES_RATE_LIMIT_MESSAGE, code: 'RATE_LIMIT' },
    },
  };
}

/**
 * True when same-type target cap is already reached (before inserting another).
 * Cap is LIKES_SAME_TYPE_TARGET_MAX distinct liked targets for that type.
 */
export function likesSameTypeLimitReached(
  rows: Record<string, unknown>[],
  likerId: string,
  heartType: string,
): boolean {
  return countSameTypeLikes(rows, likerId, heartType) >= LIKES_SAME_TYPE_TARGET_MAX;
}

/** True when local pair interval has not elapsed. */
export function likesPairIntervalBlocked(
  lastMs: number,
  nowMs: number,
  minIntervalMs: number,
): boolean {
  return nowMs - lastMs < minIntervalMs;
}
