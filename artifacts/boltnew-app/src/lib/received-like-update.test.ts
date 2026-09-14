import { describe, it, expect } from 'vitest';
import { planReceivedLikeUpdate, preferReceivedHeartType } from './received-like-update';

describe('planReceivedLikeUpdate', () => {
  it('requests full refetch when liker_id missing', () => {
    expect(planReceivedLikeUpdate({ status: 'accepted' }).needsFullRefetch).toBe(true);
    expect(planReceivedLikeUpdate(null).needsFullRefetch).toBe(true);
  });

  it('removes liker on rejected', () => {
    const p = planReceivedLikeUpdate({ liker_id: 'u1', status: 'rejected', heart_type: 'red' });
    expect(p.needsFullRefetch).toBe(false);
    expect(p.removeLikerId).toBe('u1');
    expect(p.ackGreenLikerId).toBeNull();
  });

  it('acks green compliment on accepted green', () => {
    const p = planReceivedLikeUpdate({ liker_id: 'u2', status: 'accepted', heart_type: 'green' });
    expect(p.ackGreenLikerId).toBe('u2');
    expect(p.removeLikerId).toBeNull();
    expect(p.setHeartType).toEqual({ likerId: 'u2', heartType: 'green' });
  });

  it('keeps liker on accepted interest heart (contact-share path)', () => {
    const p = planReceivedLikeUpdate({ liker_id: 'u3', status: 'accepted', heart_type: 'red' });
    expect(p.removeLikerId).toBeNull();
    expect(p.ackGreenLikerId).toBeNull();
    expect(p.setHeartType).toEqual({ likerId: 'u3', heartType: 'red' });
  });
});

describe('preferReceivedHeartType', () => {
  it('keeps interest over incoming green', () => {
    expect(preferReceivedHeartType('red', 'green')).toBe('red');
  });
  it('prefers incoming interest over existing green', () => {
    expect(preferReceivedHeartType('green', 'blue')).toBe('blue');
  });
});
