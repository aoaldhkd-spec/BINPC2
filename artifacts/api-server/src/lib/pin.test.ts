import { describe, expect, it } from 'vitest';
import { collectUsedPinCodes, pinPoolParams, resolvePin } from './pin.js';

describe('pin helpers', () => {
  it('collectUsedPinCodes skips empty and keeps unique', () => {
    const set = collectUsedPinCodes([
      { pin_code: '1234' },
      { pin_code: '' },
      { pin_code: '1234' },
      { pin_code: '5678' },
      {},
    ]);
    expect([...set].sort()).toEqual(['1234', '5678']);
  });

  it('pinPoolParams switches at >8000', () => {
    expect(pinPoolParams(8000).use5Digit).toBe(false);
    expect(pinPoolParams(8001).use5Digit).toBe(true);
  });

  it('resolvePin honours free requested pin', () => {
    const used = collectUsedPinCodes([{ pin_code: '1111' }]);
    const r = resolvePin(used, 9000, false, '2222');
    expect(r).toEqual({ ok: true, pin: '2222' });
  });
});
