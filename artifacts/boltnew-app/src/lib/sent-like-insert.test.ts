import { describe, it, expect } from 'vitest';
import { planSentLikeInsert, shouldKeepExistingSentHeartType, planSentLikeStatusNotif, heartAcceptedToastMessage } from './sent-like-insert';

describe('planSentLikeInsert', () => {
  it('returns null without liked_id', () => {
    expect(planSentLikeInsert({ heart_type: 'red' })).toBeNull();
    expect(planSentLikeInsert(null)).toBeNull();
  });

  it('defaults heart_type to red', () => {
    expect(planSentLikeInsert({ liked_id: 'u2' })).toEqual({
      likedId: 'u2',
      heartType: 'red',
      showMutualToast: false,
    });
  });

  it('flags mutual when both sides have interest hearts', () => {
    const p = planSentLikeInsert(
      { liked_id: 'u2', heart_type: 'blue' },
      { counterpartReceivedHeartType: 'red' },
    );
    expect(p?.showMutualToast).toBe(true);
  });

  it('does not mutual on green compliment', () => {
    const p = planSentLikeInsert(
      { liked_id: 'u2', heart_type: 'green' },
      { counterpartReceivedHeartType: 'red' },
    );
    expect(p?.showMutualToast).toBe(false);
  });
});

describe('shouldKeepExistingSentHeartType', () => {
  it('keeps interest when incoming is green', () => {
    expect(shouldKeepExistingSentHeartType('red', 'green')).toBe(true);
  });
  it('allows overwrite when incoming is interest', () => {
    expect(shouldKeepExistingSentHeartType('green', 'blue')).toBe(false);
  });
});

describe('planSentLikeStatusNotif', () => {
  it('builds reject / accept toasts', () => {
    expect(planSentLikeStatusNotif('rejected', 'Neo')).toEqual({ kind: 'rejected', nickname: 'Neo' });
    expect(planSentLikeStatusNotif('accepted', 'Neo')).toEqual({
      kind: 'accepted',
      nickname: 'Neo',
      message: heartAcceptedToastMessage('Neo'),
    });
    expect(planSentLikeStatusNotif('pending', 'Neo')).toBeNull();
  });
});
