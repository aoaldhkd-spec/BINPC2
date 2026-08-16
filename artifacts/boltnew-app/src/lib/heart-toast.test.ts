import { describe, expect, it } from 'vitest';
import { isIncomingHeartToastTarget, MUTUAL_SIGNAL_TOAST } from './heart-toast';

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
});

describe('mutual signal toast copy', () => {
  it('says 서로 시그널, not 서로 하트', () => {
    expect(MUTUAL_SIGNAL_TOAST).toContain('서로 시그널');
    expect(MUTUAL_SIGNAL_TOAST).not.toContain('서로 하트');
  });
});
