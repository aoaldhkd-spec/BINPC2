/**
 * /op request normalize + scalar validation + entry-gate/write rejects —
 * extracted from routes/db.ts.
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

export type OpGateReject = {
  status: number;
  body: { data: null; error: { message: string; code?: string } };
  /** Optional Retry-After seconds for 503/429 busy paths. */
  retryAfter?: string;
  logMsg?: string;
};

export const OP_BUSY_MESSAGE = 'Server busy — retry in 1s';
export const OP_INVALID_BODY_MESSAGE = 'Request body must be a JSON object';
export const OP_REQUESTER_SPOOF_MESSAGE =
  'Forbidden: requesterId must match authenticated session';
export const OP_UNAUTH_REQUESTER_MESSAGE = 'Authentication required';
export const OP_INVALID_TABLE_MESSAGE = 'Invalid table';
export const OP_PAYLOAD_REQUIRED_MESSAGE = 'payload is required for insert';
export const OP_UNKNOWN_OPERATION_MESSAGE = 'Unknown operation';
export const OP_INTERNAL_ERROR_MESSAGE =
  '서버 내부 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
export const OP_PERSIST_FAILED_MESSAGE =
  '저장에 실패했습니다. 잠시 후 다시 시도해 주세요.';
export const OP_DELETE_PERSIST_FAILED_MESSAGE =
  '일시적 저장 오류입니다. 잠시 후 다시 시도해주세요.';
export const OP_PIN_EXHAUSTED_MESSAGE =
  'PIN pool exhausted — no available PIN slots. Please contact the administrator.';
export const OP_NICKNAME_DUPLICATE_MESSAGE =
  'duplicate key value violates unique constraint "profiles_nickname_key"';

export function opBusyReject(): OpGateReject {
  return {
    status: 503,
    retryAfter: '1',
    body: { data: null, error: { message: OP_BUSY_MESSAGE, code: 'BUSY' } },
  };
}

export function opInvalidBodyReject(): OpGateReject {
  return {
    status: 400,
    body: { data: null, error: { message: OP_INVALID_BODY_MESSAGE, code: 'INVALID_BODY' } },
  };
}

export function opRequesterIdSpoofReject(): OpGateReject {
  return {
    status: 403,
    body: { data: null, error: { message: OP_REQUESTER_SPOOF_MESSAGE, code: 'FORBIDDEN' } },
    logMsg: '[SECURITY] requesterId body-spoof attempt blocked',
  };
}

export function opUnauthenticatedRequesterReject(): OpGateReject {
  return {
    status: 401,
    body: { data: null, error: { message: OP_UNAUTH_REQUESTER_MESSAGE, code: 'UNAUTHORIZED' } },
    logMsg: '[SECURITY] unauthenticated requesterId blocked',
  };
}

export function opInvalidTableReject(): OpGateReject {
  return {
    status: 400,
    body: { data: null, error: { message: OP_INVALID_TABLE_MESSAGE, code: 'INVALID_TABLE' } },
  };
}

export function opPayloadRequiredReject(): OpGateReject {
  return {
    status: 400,
    body: { data: null, error: { message: OP_PAYLOAD_REQUIRED_MESSAGE, code: '22023' } },
  };
}

export function opUnknownOperationReject(): OpGateReject {
  return {
    status: 200,
    body: { data: null, error: { message: OP_UNKNOWN_OPERATION_MESSAGE } },
  };
}

export function opInternalErrorReject(): OpGateReject {
  return {
    status: 200,
    body: { data: null, error: { message: OP_INTERNAL_ERROR_MESSAGE } },
  };
}

export function opPersistFailedReject(): OpGateReject {
  return {
    status: 503,
    body: { data: null, error: { message: OP_PERSIST_FAILED_MESSAGE, code: 'PERSIST_FAILED' } },
  };
}

export function opDeletePersistFailedReject(): OpGateReject {
  return {
    status: 503,
    body: {
      data: null,
      error: { message: OP_DELETE_PERSIST_FAILED_MESSAGE, code: 'PERSIST_FAILED' },
    },
  };
}

export function opPinExhaustedReject(): OpGateReject {
  return {
    status: 503,
    body: { data: null, error: { message: OP_PIN_EXHAUSTED_MESSAGE, code: 'PIN_EXHAUSTED' } },
  };
}

/** PG-shaped nickname unique violation (client treats code 23505). */
export function opNicknameDuplicateReject(): OpGateReject {
  return {
    status: 200,
    body: {
      data: null,
      error: { message: OP_NICKNAME_DUPLICATE_MESSAGE, code: '23505' },
    },
  };
}

export type BindRequesterIdResult =
  | { ok: true; setRequesterId?: string }
  | { ok: false; reject: OpGateReject };

/**
 * Session-bind requesterId before body destructure.
 * Spoof when auth session exists and body claims a different id.
 */
export function planBindRequesterId(
  authId: string | null,
  bodyRequesterId: unknown,
): BindRequesterIdResult {
  if (authId && bodyRequesterId != null && String(bodyRequesterId) !== authId) {
    return { ok: false, reject: opRequesterIdSpoofReject() };
  }
  if (authId) return { ok: true, setRequesterId: authId };
  return { ok: true };
}

/** True when production-like env must require a session for claimed requesterId. */
export function shouldBlockUnauthenticatedRequester(input: {
  nodeEnv: string | undefined;
  requesterId: unknown;
  sessionUserId: string | null;
  isAdmin: boolean;
  isTestSession: boolean;
}): boolean {
  return (
    input.nodeEnv !== 'test'
    && Boolean(input.requesterId)
    && !input.sessionUserId
    && !input.isAdmin
    && !input.isTestSession
  );
}


export const OP_ADMIN_ONLY_MESSAGE = 'Forbidden: admin only';

export function opAdminOnlyReject(): OpGateReject {
  return {
    status: 403,
    body: { data: null, error: { message: OP_ADMIN_ONLY_MESSAGE, code: 'FORBIDDEN' } },
  };
}

/** Spread FUNCTIONS_LOCKED_ERROR from caller (keeps message ownership in app-settings-view). */
export function opFunctionsLockedReject(
  lockedError: { message: string; code: string },
): OpGateReject {
  return {
    status: 403,
    body: { data: null, error: { ...lockedError } },
  };
}
