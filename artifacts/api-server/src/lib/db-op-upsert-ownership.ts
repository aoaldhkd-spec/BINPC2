/**
 * /op UPSERT IDOR ownership + field-forcing planners — extracted from routes/db.ts.
 * Pure; Express res / logger / persist / store lookups stay in db.ts.
 */

import type { OpOwnershipReject } from './db-op-update-ownership.js';

const FORBIDDEN_AUTH = {
  message: 'Forbidden: authentication required',
  code: 'FORBIDDEN',
} as const;

export type UpsertOwnershipPlan =
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; reject: OpOwnershipReject };

/** signal_sends UPSERT is forbidden for non-admin (use insert). */
export function signalSendsUpsertReject(
  table: string,
  isAdmin: boolean,
): OpOwnershipReject | null {
  if (table === 'signal_sends' && !isAdmin) {
    return {
      status: 403,
      body: {
        data: null,
        error: { message: 'Forbidden: use insert for signal actions', code: 'FORBIDDEN' },
      },
      logMsg: '',
    };
  }
  return null;
}

export const UPSERT_RELATIONSHIP_TABLES = new Set([
  'blocked_users',
  'contact_shares',
  'contact_share_events',
]);

/**
 * Per-input UPSERT ownership for blocked_users / contact_shares / contact_share_events.
 * Mutates identity fields onto a copy; caller replaces the input.
 */
export function planUpsertRelationshipRow(
  table: string,
  row: Record<string, unknown>,
  requesterId: string,
  existingById: Record<string, unknown> | undefined,
): UpsertOwnershipPlan {
  if (existingById) {
    const owner = table === 'blocked_users'
      ? existingById.user_id
      : table === 'contact_shares'
        ? existingById.liked_id
        : existingById.from_user_id;
    if (String(owner ?? '') !== String(requesterId)) {
      return {
        ok: false,
        reject: {
          status: 403,
          body: { data: null, error: { message: 'Forbidden: row owner mismatch', code: 'FORBIDDEN' } },
          logMsg: '',
        },
      };
    }
  }
  if (table === 'blocked_users') {
    const targetId = String(row.target_id ?? '');
    if (!targetId || targetId === String(requesterId)) {
      return {
        ok: false,
        reject: {
          status: 400,
          body: { data: null, error: { message: 'invalid target_id', code: 'INVALID_INPUT' } },
          logMsg: '',
        },
      };
    }
    return { ok: true, row: { ...row, user_id: requesterId } };
  }
  if (table === 'contact_shares') {
    const recipientId = String(row.liker_id ?? '');
    if (!recipientId || recipientId === String(requesterId)) {
      return {
        ok: false,
        reject: {
          status: 400,
          body: { data: null, error: { message: 'invalid liker_id', code: 'INVALID_INPUT' } },
          logMsg: '',
        },
      };
    }
    return { ok: true, row: { ...row, liked_id: requesterId } };
  }
  // contact_share_events
  const toUserId = String(row.to_user_id ?? '');
  if (!toUserId || toUserId === String(requesterId)) {
    return {
      ok: false,
      reject: {
        status: 400,
        body: { data: null, error: { message: 'invalid to_user_id', code: 'INVALID_INPUT' } },
        logMsg: '',
      },
    };
  }
  return { ok: true, row: { ...row, from_user_id: requesterId } };
}

/** Missing requester for relationship UPSERT tables. */
export function upsertRelationshipMissingRequesterReject(
  table: string,
  isAdmin: boolean,
  requesterId: string | null | undefined,
): OpOwnershipReject | null {
  if (isAdmin) return null;
  if (!UPSERT_RELATIONSHIP_TABLES.has(table)) return null;
  if (requesterId) return null;
  return {
    status: 403,
    body: { data: null, error: { ...FORBIDDEN_AUTH } },
    logMsg: '',
  };
}

/**
 * Conflict-path owner check when updating an existing relationship row by id/cols.
 */
export function checkUpsertConflictOwner(
  table: string,
  existingOwner: unknown,
  requesterId: string,
): OpOwnershipReject | null {
  if (String(existingOwner ?? '') !== String(requesterId)) {
    return {
      status: 403,
      body: { data: null, error: { message: 'Forbidden: row owner mismatch', code: 'FORBIDDEN' } },
      logMsg: '',
    };
  }
  return null;
}

/** chat_reads UPSERT: require auth + force reader_id. */
export function planChatReadsUpsertOwnership(
  row: Record<string, unknown>,
  requesterId: string | null | undefined,
): UpsertOwnershipPlan {
  if (!requesterId) {
    return {
      ok: false,
      reject: {
        status: 403,
        body: { data: null, error: { ...FORBIDDEN_AUTH } },
        logMsg: '',
      },
    };
  }
  return { ok: true, row: { ...row, reader_id: requesterId } };
}

export function chatReadsUpsertNonParticipantReject(): OpOwnershipReject {
  return {
    status: 403,
    body: { data: null, error: { message: 'Forbidden: not a chat participant', code: 'FORBIDDEN' } },
    logMsg: '[SECURITY] IDOR: UPSERT chat_reads by non-participant blocked',
  };
}

/** Secondary check: reader_id must still match requester after merges. */
export function checkUpsertChatReadsReader(
  table: string,
  row: Record<string, unknown>,
  requesterId: string,
): OpOwnershipReject | null {
  if (table === 'chat_reads' && row.reader_id != null
      && String(row.reader_id) !== String(requesterId)) {
    return {
      status: 403,
      body: {
        data: null,
        error: { message: 'Forbidden: 자신의 읽음 기록만 생성할 수 있습니다.', code: 'FORBIDDEN' },
      },
      logMsg: '[SECURITY] IDOR: UPSERT chat_reads blocked',
    };
  }
  return null;
}

export function relationshipOwnerField(table: string): 'user_id' | 'liked_id' | 'from_user_id' | null {
  if (table === 'blocked_users') return 'user_id';
  if (table === 'contact_shares') return 'liked_id';
  if (table === 'contact_share_events') return 'from_user_id';
  return null;
}
