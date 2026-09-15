import { describe, expect, it } from 'vitest';
import {
  orderLimitShape,
  sanitizeBroadcastValue,
  shapeSelectData,
  sortRowsByOrders,
} from './db-op-result-shape.js';

describe('db-op-result-shape', () => {
  it('sortRowsByOrders sorts asc/desc and puts nulls first when asc', () => {
    const rows = [
      { id: 'b', n: 2 },
      { id: 'a', n: 1 },
      { id: 'z', n: null },
    ];
    sortRowsByOrders(rows, [{ col: 'n', asc: true }]);
    expect(rows.map(r => r.id)).toEqual(['z', 'a', 'b']);
    sortRowsByOrders(rows, [{ col: 'n', asc: false }]);
    expect(rows.map(r => r.id)).toEqual(['b', 'a', 'z']);
  });

  it('shapeSelectData applies limit and single/maybeSingle', () => {
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(shapeSelectData(rows, { limit: 2 })).toEqual([{ id: 1 }, { id: 2 }]);
    expect(shapeSelectData(rows, { single: true })).toEqual({ id: 1 });
    expect(shapeSelectData([], { maybeSingle: true })).toBeNull();
  });

  it('orderLimitShape combines sort + limit + single', () => {
    const rows = [
      { id: 'b', n: 2 },
      { id: 'a', n: 1 },
    ];
    expect(orderLimitShape(rows, [{ col: 'n', asc: true }], { single: true })).toEqual({
      id: 'a',
      n: 1,
    });
  });

  it('sanitizeBroadcastValue strips HTML and caps depth', () => {
    expect(sanitizeBroadcastValue('<script>x</script>hi')).toBe('xhi');
    expect(sanitizeBroadcastValue({ a: '<b>1</b>', b: [2, '<i>3</i>'] })).toEqual({
      a: '1',
      b: [2, '3'],
    });
    const deep = { a: { b: { c: { d: { e: { f: { g: '<x>' } } } } } } };
    const out = sanitizeBroadcastValue(deep) as Record<string, unknown>;
    // depth>5 leaves innermost as-is
    expect(JSON.stringify(out)).toContain('<x>');
  });
});
