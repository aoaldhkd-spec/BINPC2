import { describe, it, expect } from 'vitest';
import {
  isIncomingHeartToastTarget,
  incomingInterestToast,
  planIncomingHeartBottomNotif,
  MUTUAL_HEART_TOAST,
} from './heart-toast';

describe('isIncomingHeartToastTarget', () => {
  it('requires liked_id === me and liker !== me', () => {
    expect(isIncomingHeartToastTarget('me', { liker_id: 'u2', liked_id: 'me' })).toBe(true);
    expect(isIncomingHeartToastTarget('me', { liker_id: 'me', liked_id: 'me' })).toBe(false);
    expect(isIncomingHeartToastTarget('me', { liker_id: 'u2', liked_id: 'u2' })).toBe(false);
    expect(isIncomingHeartToastTarget(null, { liker_id: 'u2', liked_id: 'me' })).toBe(false);
  });
});

describe('planIncomingHeartBottomNotif', () => {
  it('anon when no liker', () => {
    expect(planIncomingHeartBottomNotif({ heartType: 'green' })).toEqual({
      type: 'heart',
      nickname: '누군가',
      heartType: 'green',
    });
  });

  it('mutual when interest both ways', () => {
    expect(planIncomingHeartBottomNotif({
      likerId: 'u2',
      heartType: 'red',
      nickname: 'Neo',
      sentHeartsToLiker: new Set(['blue']),
    })).toEqual({
      type: 'heart',
      nickname: 'Neo',
      profileId: 'u2',
      message: MUTUAL_HEART_TOAST,
      heartMutual: true,
    });
  });

  it('interest toast when one-way', () => {
    const n = planIncomingHeartBottomNotif({
      likerId: 'u2',
      heartType: 'red',
      nickname: 'Neo',
      sentHeartsToLiker: new Set(['green']),
    });
    expect(n.message).toBe(incomingInterestToast('Neo'));
    expect(n.heartMutual).toBeUndefined();
  });

  it('green compliment without mutual message', () => {
    expect(planIncomingHeartBottomNotif({
      likerId: 'u2',
      heartType: 'green',
      nickname: 'Neo',
    })).toEqual({ type: 'heart', nickname: 'Neo', heartType: 'green' });
  });
});
