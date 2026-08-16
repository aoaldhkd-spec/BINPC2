import { describe, expect, it } from 'vitest';
import { incomingInterestToast, isIncomingHeartToastTarget, MUTUAL_HEART_TOAST } from './heart-toast';

describe('isIncomingHeartToastTarget', () => {
  it('shows the toast only to the liked recipient', () => {
    const row = { liker_id: 'A', liked_id: 'B' };
    expect(isIncomingHeartToastTarget('B', row)).toBe(true);
    expect(isIncomingHeartToastTarget('A', row)).toBe(false);
    expect(isIncomingHeartToastTarget('C', row)).toBe(false);
    expect(isIncomingHeartToastTarget(null, row)).toBe(false);
  });

  it('never toasts the sender even if the liked_id filter is missing', () => {
    expect(isIncomingHeartToastTarget('A', { liker_id: 'A', liked_id: 'A' })).toBe(false);
  });

  it('A→B heart toasts B only; B→A heart toasts A only', () => {
    expect(isIncomingHeartToastTarget('B', { liker_id: 'A', liked_id: 'B' })).toBe(true);
    expect(isIncomingHeartToastTarget('A', { liker_id: 'A', liked_id: 'B' })).toBe(false);
    expect(isIncomingHeartToastTarget('A', { liker_id: 'B', liked_id: 'A' })).toBe(true);
    expect(isIncomingHeartToastTarget('B', { liker_id: 'B', liked_id: 'A' })).toBe(false);
  });
});

describe('mutual heart toast copy', () => {
  it('says 서로 하트, not 서로 시그널', () => {
    expect(MUTUAL_HEART_TOAST).toContain('서로 하트');
    expect(MUTUAL_HEART_TOAST).not.toContain('서로 시그널');
    expect(incomingInterestToast('상대')).toContain('하트를 보냈어요');
    expect(incomingInterestToast('상대')).not.toContain('시그널');
  });
});
