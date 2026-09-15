/**
 * /op request normalize + scalar validation — extracted from routes/db.ts.
 */
import type { FilterSpec } from './db-op-filters';

export const ALLOWED_OPS = new Set(['select', 'insert', 'update', 'upsert', 'delete']);

export type OpOrder = { col: string; asc: boolean };

export type OpScalarIssue = {
  status: number;
  body: { data: null; error: { message: string; code: string } };
};

export function sanitizeOpOrders(orders: unknown): OpOrder[] {
  return Array.isArray(orders)
    ? orders.filter((o): o is OpOrder =>
        o != null
        && typeof o === 'object'
        && typeof (o as Record<string, unknown>).col === 'string'
        && ((o as Record<string, unknown>).col as string).length > 0)
    : [];
}

export function sanitizeConflictCols(conflictCols: unknown): string[] {
  return Array.isArray(conflictCols)
    ? conflictCols.filter((c): c is string => typeof c === 'string' && c.length > 0)
    : [];
}

/** Normalize client filters; reject unknown types that would become no-op pass-alls. */
export function normalizeOpFilters(filters: unknown): FilterSpec[] {
  return (Array.isArray(filters) ? filters : []).map((f: unknown) => {
    if (f == null || typeof f !== 'object' || Array.isArray(f)) return null;
    const fr = f as Record<string, unknown>;
    if (fr.type != null) return fr as unknown as FilterSpec;
    if (fr.op != null) return { ...fr, type: fr.op, op: undefined } as unknown as FilterSpec;
    return fr as unknown as FilterSpec;
  }).filter((f): f is FilterSpec => {
    if (f == null) return false;
    const fr = f as unknown as Record<string, unknown>;
    if (typeof fr.type !== 'string') return false;
    if (fr.type === 'or') return typeof fr.expr === 'string' && fr.expr.length > 0;
    if (fr.type === 'eq' || fr.type === 'neq' || fr.type === 'lt' || fr.type === 'gt') {
      return typeof fr.col === 'string' && fr.col.length > 0 && 'val' in fr;
    }
    if (fr.type === 'in') {
      return typeof fr.col === 'string' && fr.col.length > 0 && Array.isArray(fr.vals);
    }
    return false;
  });
}

export function validateOpScalars(input: {
  table: unknown;
  op: unknown;
  single?: unknown;
  maybeSingle?: unknown;
  selectAfterWrite?: unknown;
  limit?: unknown;
}): OpScalarIssue | null {
  const { table, op, single, maybeSingle, selectAfterWrite, limit } = input;
  if (typeof table !== 'string' || typeof op !== 'string') {
    return { status: 400, body: { data: null, error: { message: 'table and op must be strings', code: 'INVALID_INPUT' } } };
  }
  if (!ALLOWED_OPS.has(op)) {
    return { status: 400, body: { data: null, error: { message: `Invalid op: ${op}`, code: 'INVALID_OP' } } };
  }
  if (table.length > 100 || op.length > 50) {
    return { status: 400, body: { data: null, error: { message: 'Invalid input length', code: 'INVALID_INPUT' } } };
  }
  if (single != null && typeof single !== 'boolean') {
    return { status: 400, body: { data: null, error: { message: 'single must be a boolean', code: 'INVALID_INPUT' } } };
  }
  if (maybeSingle != null && typeof maybeSingle !== 'boolean') {
    return { status: 400, body: { data: null, error: { message: 'maybeSingle must be a boolean', code: 'INVALID_INPUT' } } };
  }
  if (selectAfterWrite != null && typeof selectAfterWrite !== 'boolean') {
    return { status: 400, body: { data: null, error: { message: 'selectAfterWrite must be a boolean', code: 'INVALID_INPUT' } } };
  }
  if (limit != null && (typeof limit !== 'number' || !Number.isFinite(limit) || limit < 0)) {
    return { status: 400, body: { data: null, error: { message: 'limit must be a non-negative number', code: 'INVALID_INPUT' } } };
  }
  return null;
}
