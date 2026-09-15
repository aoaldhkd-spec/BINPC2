import { describe, expect, it } from 'vitest';
import {
  ALLOWED_OPS,
  normalizeOpFilters,
  sanitizeConflictCols,
  sanitizeOpOrders,
  validateOpScalars,
} from './db-op-request.js';

describe('db-op-request', () => {
  it('allows only CRUD ops', () => {
    expect(ALLOWED_OPS.has('select')).toBe(true);
    expect(ALLOWED_OPS.has('drop')).toBe(false);
  });

  it('normalizes op→type filters and drops unknown types', () => {
    const filters = normalizeOpFilters([
      { op: 'eq', col: 'id', val: '1' },
      { type: 'in', col: 'id', vals: ['a'] },
      { type: 'weird', col: 'x' },
      null,
      'bad',
    ]);
    expect(filters).toHaveLength(2);
    expect(filters[0]).toMatchObject({ type: 'eq', col: 'id', val: '1' });
    expect(filters[1]).toMatchObject({ type: 'in', col: 'id' });
  });

  it('sanitizes orders and conflict cols', () => {
    expect(sanitizeOpOrders([{ col: 'created_at', asc: false }, { col: '' }, null])).toEqual([
      { col: 'created_at', asc: false },
    ]);
    expect(sanitizeConflictCols(['user_id', '', 1])).toEqual(['user_id']);
  });

  it('validateOpScalars rejects bad limit / unknown op', () => {
    expect(validateOpScalars({ table: 'profiles', op: 'nope' })?.body.error.code).toBe('INVALID_OP');
    expect(validateOpScalars({ table: 'profiles', op: 'select', limit: -1 })?.body.error.code).toBe('INVALID_INPUT');
    expect(validateOpScalars({ table: 'profiles', op: 'select', limit: 10 })).toBeNull();
  });
});
