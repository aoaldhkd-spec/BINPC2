import { describe, expect, it } from 'vitest';
import {
  countSameTypeLikes,
  likesColorOverflow,
  likesHeartLimitReject,
  likesRainbowPoolLimitReject,
  likesPairIntervalBlocked,
  likesRateLimitReject,
  likesSameTypeLimitReached,
  likesSendCapReject,
  LIKES_HEART_LIMIT_MESSAGE,
  LIKES_RATE_LIMIT_MESSAGE,
  LIKES_SAME_TYPE_TARGET_MAX,
  matchesLikeTriple,
  planLikesMinuteBucketConsume,
} from './db-op-likes-limits.js';

describe('db-op-likes-limits', () => {
  it('matchesLikeTriple + same-type count/cap', () => {
    const rows = [
      { liker_id: 'me', liked_id: 'a', heart_type: 'red' },
      { liker_id: 'me', liked_id: 'b', heart_type: 'red' },
      { liker_id: 'me', liked_id: 'c', heart_type: 'blue' },
      { liker_id: 'x', liked_id: 'a', heart_type: 'red' },
    ];
    expect(matchesLikeTriple(rows[0], 'me', 'a', 'red')).toBe(true);
    expect(matchesLikeTriple(rows[0], 'me', 'a', 'blue')).toBe(false);
    expect(countSameTypeLikes(rows, 'me', 'red')).toBe(2);
    expect(LIKES_SAME_TYPE_TARGET_MAX).toBe(2);
    expect(likesSameTypeLimitReached(rows, 'me', 'red')).toBe(true);
    expect(likesSameTypeLimitReached(rows, 'me', 'blue')).toBe(false);
  });

  it('Korean reject payloads preserved', () => {
    expect(likesHeartLimitReject()).toEqual({
      status: 400,
      body: {
        data: null,
        error: { message: LIKES_HEART_LIMIT_MESSAGE, code: 'HEART_LIMIT' },
      },
    });
    expect(likesRateLimitReject().body.error.message).toBe(LIKES_RATE_LIMIT_MESSAGE);
    expect(likesRateLimitReject().status).toBe(429);
  });

  it('likesPairIntervalBlocked', () => {
    expect(likesPairIntervalBlocked(1000, 1200, 500)).toBe(true);
    expect(likesPairIntervalBlocked(1000, 1600, 500)).toBe(false);
  });

  it('rainbow pool reject distinguishes locked vs exhausted', () => {
    expect(likesRainbowPoolLimitReject(0).body.error.message).toContain('해금');
    expect(likesRainbowPoolLimitReject(4).body.error.message).toContain('4개');
  });

  it('likesSendCapReject allows color grants without rainbow_pool', () => {
    expect(likesSendCapReject({
      typeGrant: 2, typeCount: 0, rainbowQuota: 0, overflowAfter: 0, totalLikes: 0, totalCap: 2,
    })).toBeNull();
    expect(likesSendCapReject({
      typeGrant: 0, typeCount: 0, rainbowQuota: 0, overflowAfter: 1, totalLikes: 0, totalCap: 0,
    })?.body.error.message).toContain('해금');
    expect(likesSendCapReject({
      typeGrant: 2, typeCount: 2, rainbowQuota: 8, overflowAfter: 1, totalLikes: 2, totalCap: 10,
    })).toBeNull();
    expect(likesColorOverflow(
      [{ liker_id: 'me', heart_type: 'red' }, { liker_id: 'me', heart_type: 'red' }],
      'me',
      { red: 1, blue: 0, pink: 0, green: 0 },
      'red',
    )).toBe(2);
  });

  it('planLikesMinuteBucketConsume windows + cap', () => {
    const a = planLikesMinuteBucketConsume(undefined, 1000, 2);
    expect(a.allowed).toBe(true);
    expect(a.bucket.count).toBe(1);
    const b = planLikesMinuteBucketConsume(a.bucket, 1500, 2);
    expect(b.allowed).toBe(true);
    expect(b.bucket.count).toBe(2);
    const c = planLikesMinuteBucketConsume(b.bucket, 1600, 2);
    expect(c.allowed).toBe(false);
    expect(c.bucket.count).toBe(3);
    const d = planLikesMinuteBucketConsume(c.bucket, c.bucket.resetAt + 1, 2);
    expect(d.allowed).toBe(true);
    expect(d.bucket.count).toBe(1);
  });
});
