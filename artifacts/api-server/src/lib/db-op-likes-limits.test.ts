import { describe, expect, it } from 'vitest';
import {
  countSameTypeLikes,
  likesHeartLimitReject,
  likesPairIntervalBlocked,
  likesRateLimitReject,
  likesSameTypeLimitReached,
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
