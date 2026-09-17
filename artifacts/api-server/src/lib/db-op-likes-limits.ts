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

export function countAllLikes(rows: Record<string, unknown>[], likerId: string): number {
  return rows.filter(r => String(r.liker_id) === likerId).length;
}

/** 400 HEART_LIMIT — do not use 429 (client NAT retry storm). */
export function likesHeartLimitReject(max = LIKES_SAME_TYPE_TARGET_MAX): LikesLimitReject {
  return {
    status: 400,
    body: {
      data: null,
      error: { message: `같은 종류의 하트는 최대 ${max}명에게만 보낼 수 있습니다.`, code: 'HEART_LIMIT' },
    },
  };
}

/** legacy compatibility only — do not use for current heart consumption. */
export function likesColorOverflow(
  rows: Record<string, unknown>[],
  likerId: string,
  quotas: Record<string, number>,
  extraType?: string,
): number {
  const used: Record<string, number> = { red: 0, blue: 0, pink: 0, green: 0 };
  for (const row of rows) {
    if (String(row.liker_id) !== likerId) continue;
    const type = String(row.heart_type);
    if (type in used) used[type] += 1;
  }
  if (extraType && extraType in used) used[extraType] += 1;
  return (['red', 'blue', 'pink', 'green'] as const)
    .reduce((sum, type) => sum + Math.max(0, used[type] - (Number(quotas[type]) || 0)), 0);
}

export const RAINBOW_MAX_USES = 4;

export function normalizeLikeSource(raw: unknown): 'grant' | 'rainbow' {
  return raw === 'rainbow' ? 'rainbow' : 'grant';
}

/** Lock/unlock heart ops — grant (1 each) vs rainbow (4 total), never mixed. */
export function likesHeartOpsReject(input: {
  source: 'grant' | 'rainbow';
  heartType: string;
  unlockedKeys: Set<string>;
  grantUsed: Record<string, boolean>;
  rainbowUsed: number;
}): LikesLimitReject | null {
  if (input.source === 'rainbow') {
    if (!input.unlockedKeys.has('rainbow')) return likesRainbowPoolLimitReject(0);
    if (input.rainbowUsed >= RAINBOW_MAX_USES) return likesRainbowPoolLimitReject(RAINBOW_MAX_USES);
    return null;
  }
  if (!input.unlockedKeys.has(input.heartType)) {
    return likesTypeLockedReject();
  }
  if (input.grantUsed[input.heartType]) return likesTypeUsedReject();
  return null;
}

/**
 * legacy compatibility only — do not use for current heart consumption.
 * Live path is `likesHeartOpsReject` (lock/unlock + like_source).
 */
export function likesSendCapReject(input: {
  typeGrant: number;
  typeCount: number;
  rainbowQuota: number;
  overflowAfter: number;
  totalLikes: number;
  totalCap: number;
}): LikesLimitReject | null {
  if (input.typeGrant <= 0 && input.rainbowQuota <= 0) {
    return likesRainbowPoolLimitReject(0);
  }
  if (input.totalLikes >= input.totalCap) {
    return input.rainbowQuota > 0
      ? likesRainbowPoolLimitReject(input.rainbowQuota)
      : likesTypeGrantReject();
  }
  if (input.typeCount < input.typeGrant) return null;
  if (input.rainbowQuota <= 0) {
    return input.typeGrant <= 0 ? likesRainbowPoolLimitReject(0) : likesTypeGrantReject();
  }
  if (input.overflowAfter > input.rainbowQuota) return likesRainbowPoolLimitReject(input.rainbowQuota);
  return null;
}

/** Grant heart still locked by the schedule — never merged with "already used". */
export function likesTypeLockedReject(): LikesLimitReject {
  return {
    status: 400,
    body: { data: null, error: { message: '이 하트는 아직 해금되지 않았습니다.', code: 'HEART_LIMIT' } },
  };
}

/** Grant heart unlocked but already spent (1 per type). */
export function likesTypeUsedReject(): LikesLimitReject {
  return {
    status: 400,
    body: { data: null, error: { message: '이미 사용한 하트입니다.', code: 'HEART_LIMIT' } },
  };
}

/** legacy compatibility only — live grant path uses locked/used rejects above. */
export function likesTypeGrantReject(): LikesLimitReject {
  return {
    status: 400,
    body: { data: null, error: { message: '이 하트는 남은 개수가 없어요.', code: 'HEART_LIMIT' } },
  };
}

export function likesRainbowPoolLimitReject(max: number): LikesLimitReject {
  const message = max <= 0
    ? '무지개하트가 아직 해금되지 않았습니다.'
    : '무지개하트를 모두 사용했습니다.';
  return {
    status: 400,
    body: { data: null, error: { message, code: 'HEART_LIMIT' } },
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
  maxTargets = LIKES_SAME_TYPE_TARGET_MAX,
): boolean {
  return countSameTypeLikes(rows, likerId, heartType) >= maxTargets;
}

/** True when local pair interval has not elapsed. */
export function likesPairIntervalBlocked(
  lastMs: number,
  nowMs: number,
  minIntervalMs: number,
): boolean {
  return nowMs - lastMs < minIntervalMs;
}

export type LikesMinuteBucket = { count: number; resetAt: number };

/**
 * Local per-liker minute window: increment and report whether over max.
 * Does not mutate caller state — returns the next bucket snapshot.
 */
export function planLikesMinuteBucketConsume(
  prev: LikesMinuteBucket | undefined,
  nowMs: number,
  maxPerMin: number,
): { allowed: boolean; bucket: LikesMinuteBucket } {
  let bucket = prev;
  if (!bucket || nowMs > bucket.resetAt) {
    bucket = { count: 0, resetAt: nowMs + 60_000 };
  }
  const next = { count: bucket.count + 1, resetAt: bucket.resetAt };
  return { allowed: next.count <= maxPerMin, bucket: next };
}
