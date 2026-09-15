import { describe, it, expect } from 'vitest';
import { applyFilters, compareFilterValues, matchFilter, type FilterSpec } from './db-op-filters.js';

describe('db-op-filters', () => {
  const rows = [
    { id: '1', n: 10, name: 'a', ts: '2026-01-01T00:00:00Z' },
    { id: '2', n: 20, name: 'b', ts: '2026-02-01T00:00:00Z' },
    { id: '3', n: 30, name: 'c', ts: '2026-03-01T00:00:00Z' },
  ];

  it('eq / neq / in', () => {
    expect(applyFilters(rows, [{ type: 'eq', col: 'id', val: '2' }])).toEqual([rows[1]]);
    expect(applyFilters(rows, [{ type: 'neq', col: 'name', val: 'a' }]).map(r => r.id)).toEqual(['2', '3']);
    expect(applyFilters(rows, [{ type: 'in', col: 'id', vals: ['1', '3'] }]).map(r => r.id)).toEqual(['1', '3']);
  });

  it('lt / gt numeric without treating ISO as number', () => {
    expect(applyFilters(rows, [{ type: 'lt', col: 'n', val: 25 }]).map(r => r.id)).toEqual(['1', '2']);
    expect(applyFilters(rows, [{ type: 'gt', col: 'n', val: 15 }]).map(r => r.id)).toEqual(['2', '3']);
    expect(compareFilterValues('2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z')).toBe(-1);
    expect(matchFilter(rows[0], { type: 'lt', col: 'ts', val: '2026-02-01T00:00:00Z' })).toBe(true);
  });

  it('or expr eq/neq', () => {
    const f: FilterSpec = { type: 'or', expr: 'name.eq.a,name.eq.c' };
    expect(applyFilters(rows, [f]).map(r => r.id)).toEqual(['1', '3']);
  });

  it('empty filters returns same rows', () => {
    expect(applyFilters(rows, [])).toBe(rows);
  });
});
