import { describe, expect, it } from 'vitest';
import {
  ALLOWED_OPS,
  normalizeOpFilters,
  sanitizeConflictCols,
  sanitizeOpOrders,
  validateOpScalars,
  opBusyReject,
  opPersistFailedReject,
  opPinExhaustedReject,
  opInternalErrorReject,
  opNicknameDuplicateReject,
  planBindRequesterId,
  shouldBlockUnauthenticatedRequester,
  OP_BUSY_MESSAGE,
  OP_PERSIST_FAILED_MESSAGE,
  OP_PIN_EXHAUSTED_MESSAGE,
  OP_INTERNAL_ERROR_MESSAGE,
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

describe('db-op-gate (via op-request)', () => {
  it('busy / persist / pin / internal rejects preserve messages', () => {
    expect(opBusyReject().body.error.message).toBe(OP_BUSY_MESSAGE);
    expect(opBusyReject().retryAfter).toBe('1');
    expect(opPersistFailedReject().body.error.message).toBe(OP_PERSIST_FAILED_MESSAGE);
    expect(opPinExhaustedReject().body.error.message).toBe(OP_PIN_EXHAUSTED_MESSAGE);
    expect(opInternalErrorReject().body.error.message).toBe(OP_INTERNAL_ERROR_MESSAGE);
    expect(opNicknameDuplicateReject().body.error.code).toBe('23505');
  });

  it('planBindRequesterId spoof vs bind', () => {
    expect(planBindRequesterId('a', 'b').ok).toBe(false);
    expect(planBindRequesterId('a', 'a')).toEqual({ ok: true, setRequesterId: 'a' });
    expect(planBindRequesterId('a', null)).toEqual({ ok: true, setRequesterId: 'a' });
    expect(planBindRequesterId(null, 'x')).toEqual({ ok: true });
  });

  it('shouldBlockUnauthenticatedRequester', () => {
    expect(shouldBlockUnauthenticatedRequester({
      nodeEnv: 'production', requesterId: 'u1', sessionUserId: null, isAdmin: false, isTestSession: false,
    })).toBe(true);
    expect(shouldBlockUnauthenticatedRequester({
      nodeEnv: 'test', requesterId: 'u1', sessionUserId: null, isAdmin: false, isTestSession: false,
    })).toBe(false);
  });
});
