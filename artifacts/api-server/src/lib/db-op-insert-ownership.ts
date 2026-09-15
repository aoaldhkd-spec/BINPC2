/**
 * /op INSERT IDOR ownership + field-forcing planners — extracted from routes/db.ts.
 * Pure; Express res / logger / persist / store lookups stay in db.ts.
 */

import type { OpOwnershipReject } from './db-op-update-ownership.js';
import { deterministicChatId } from './db-chat-ids.js';

const FORBIDDEN_AUTH = {
  message: 'Forbidden: authentication required',
  code: 'FORBIDDEN',
} as const;

export type InsertOwnershipPlan =
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; reject: OpOwnershipReject; earlyEmpty?: undefined }
  | { ok: false; earlyEmpty: true; reject?: undefined };

function authReject(logMsg: string): OpOwnershipReject {
  return {
    status: 403,
    body: { data: null, error: { ...FORBIDDEN_AUTH } },
    logMsg,
  };
}

/**
 * messages INSERT: auth + sender_id force/mismatch + chat_id required.
 * Caller still resolves merged chat id, references, participant, block.
 */
export function planMessagesInsertOwnership(
  row: Record<string, unknown>,
  requesterId: string | null | undefined,
): InsertOwnershipPlan {
  if (!requesterId) {
    return { ok: false, reject: authReject('[SECURITY] IDOR: messages INSERT without requesterId blocked') };
  }
  if (row.sender_id != null && String(row.sender_id) !== String(requesterId)) {
    return {
      ok: false,
      reject: {
        status: 403,
        body: { data: null, error: { message: 'Forbidden: sender_id mismatch', code: 'FORBIDDEN' } },
        logMsg: '[SECURITY] IDOR: sender_id mismatch blocked',
      },
    };
  }
  const next: Record<string, unknown> = { ...row, sender_id: requesterId };
  if (next.chat_id == null) {
    return {
      ok: false,
      reject: {
        status: 400,
        body: { data: null, error: { message: 'chat_id is required for messages', code: 'INVALID_INPUT' } },
        logMsg: '[SECURITY] IDOR: messages INSERT without chat_id blocked',
      },
    };
  }
  return { ok: true, row: next };
}

/** chats INSERT: auth + both users required + no self-chat + must be participant. */
export function planChatsInsertOwnership(
  row: Record<string, unknown>,
  requesterId: string | null | undefined,
): InsertOwnershipPlan {
  if (!requesterId) {
    return { ok: false, reject: authReject('') };
  }
  const u1 = String(row.user1_id ?? '');
  const u2 = String(row.user2_id ?? '');
  if (!u1 || !u2) {
    return {
      ok: false,
      reject: {
        status: 400,
        body: { data: null, error: { message: 'user1_id and user2_id are both required', code: 'INVALID_INPUT' } },
        logMsg: '',
      },
    };
  }
  if (u1 === u2) {
    return {
      ok: false,
      reject: {
        status: 400,
        body: { data: null, error: { message: 'self-chat not allowed', code: 'INVALID_INPUT' } },
        logMsg: '',
      },
    };
  }
  if (requesterId !== u1 && requesterId !== u2) {
    return {
      ok: false,
      reject: {
        status: 403,
        body: { data: null, error: { message: 'Forbidden: must be a participant', code: 'FORBIDDEN' } },
        logMsg: '[SECURITY] IDOR: chats INSERT by non-participant blocked',
      },
    };
  }
  return { ok: true, row };
}

/**
 * group_messages INSERT: auth + force sender_id + group_id required.
 * Caller resolves merged group id + participant.
 */
export function planGroupMessagesInsertOwnership(
  row: Record<string, unknown>,
  requesterId: string | null | undefined,
): InsertOwnershipPlan {
  if (!requesterId) {
    return { ok: false, reject: authReject('') };
  }
  const next: Record<string, unknown> = { ...row, sender_id: requesterId };
  if (next.group_id == null) {
    return {
      ok: false,
      reject: {
        status: 400,
        body: { data: null, error: { message: 'group_id is required for group_messages', code: 'INVALID_INPUT' } },
        logMsg: '',
      },
    };
  }
  return { ok: true, row: next };
}

/**
 * group_participants INSERT early ownership: auth + user_id match + group_id required.
 * Forces user_id to requester; group_id left for caller to resolve/merge.
 */
export function planGroupParticipantsInsertOwnership(
  row: Record<string, unknown>,
  requesterId: string | null | undefined,
): InsertOwnershipPlan {
  if (!requesterId) {
    return {
      ok: false,
      reject: authReject('[SECURITY] IDOR: group_participants INSERT without requesterId blocked'),
    };
  }
  if (row.user_id != null && String(row.user_id) !== String(requesterId)) {
    return {
      ok: false,
      reject: {
        status: 403,
        body: {
          data: null,
          error: { message: 'Forbidden: 자신의 참여만 추가할 수 있습니다.', code: 'FORBIDDEN' },
        },
        logMsg: '[SECURITY] IDOR: group_participants user_id mismatch blocked',
      },
    };
  }
  if (row.group_id == null || String(row.group_id) === '') {
    return {
      ok: false,
      reject: {
        status: 400,
        body: { data: null, error: { message: 'group_id is required for group_participants', code: 'INVALID_INPUT' } },
        logMsg: '',
      },
    };
  }
  return { ok: true, row: { ...row, user_id: requesterId } };
}

/** group_chats INSERT: non-admin non-test blocked. */
export function groupChatsInsertReject(
  isAdmin: boolean,
  isTestEnv: boolean,
): OpOwnershipReject | null {
  if (isAdmin || isTestEnv) return null;
  return {
    status: 403,
    body: {
      data: null,
      error: { message: 'Forbidden: 단톡방 생성은 관리자만 가능합니다.', code: 'FORBIDDEN' },
    },
    logMsg: '[SECURITY] IDOR: group_chats INSERT blocked',
  };
}

/** chat_reads INSERT: auth + force reader_id. Caller merges chat_id / id / participant. */
export function planChatReadsInsertOwnership(
  row: Record<string, unknown>,
  requesterId: string | null | undefined,
): InsertOwnershipPlan {
  if (!requesterId) {
    return { ok: false, reject: authReject('') };
  }
  return { ok: true, row: { ...row, reader_id: requesterId } };
}

/** likes INSERT: auth + force liker_id. */
export function planLikesInsertOwnership(
  row: Record<string, unknown>,
  requesterId: string | null | undefined,
): InsertOwnershipPlan {
  if (!requesterId) {
    return { ok: false, reject: authReject('[SECURITY] IDOR: likes INSERT without requesterId blocked') };
  }
  return { ok: true, row: { ...row, liker_id: requesterId } };
}

/**
 * signal_sends INSERT field plan (auth + validate + force ids).
 * Caller checks block, existing row upgrade, and references.
 */
export function planSignalSendsInsertOwnership(
  row: Record<string, unknown>,
  requesterId: string | null | undefined,
): InsertOwnershipPlan {
  if (!requesterId) {
    return {
      ok: false,
      reject: authReject('[SECURITY] IDOR: signal_sends INSERT without requesterId blocked'),
    };
  }
  const receiverId = row.receiver_id != null ? String(row.receiver_id) : '';
  const action = row.action === 'pass' ? 'pass' : row.action === 'send' ? 'send' : '';
  if (!receiverId) {
    return {
      ok: false,
      reject: {
        status: 400,
        body: { data: null, error: { message: 'receiver_id is required', code: 'INVALID_INPUT' } },
        logMsg: '',
      },
    };
  }
  if (!action) {
    return {
      ok: false,
      reject: {
        status: 400,
        body: { data: null, error: { message: 'action must be send or pass', code: 'INVALID_INPUT' } },
        logMsg: '',
      },
    };
  }
  if (receiverId === String(requesterId)) {
    return {
      ok: false,
      reject: {
        status: 400,
        body: { data: null, error: { message: 'cannot signal yourself', code: 'INVALID_INPUT' } },
        logMsg: '',
      },
    };
  }
  return {
    ok: true,
    row: { ...row, sender_id: requesterId, receiver_id: receiverId, action },
  };
}

/**
 * profile_views INSERT: auth + viewed_id + self→earlyEmpty + force viewer_id.
 */
export function planProfileViewsInsertOwnership(
  row: Record<string, unknown>,
  requesterId: string | null | undefined,
): InsertOwnershipPlan {
  if (!requesterId) {
    return {
      ok: false,
      reject: authReject('[SECURITY] IDOR: profile_views INSERT without requesterId blocked'),
    };
  }
  if (row.viewed_id == null || String(row.viewed_id) === '') {
    return {
      ok: false,
      reject: {
        status: 400,
        body: { data: null, error: { message: 'viewed_id is required', code: 'INVALID_INPUT' } },
        logMsg: '',
      },
    };
  }
  if (String(row.viewed_id) === String(requesterId)) {
    return { ok: false, earlyEmpty: true };
  }
  return { ok: true, row: { ...row, viewer_id: requesterId } };
}

/** blocked_users INSERT (non-admin): auth + existing owner + target validate + force. */
export function planBlockedUsersInsertOwnership(
  row: Record<string, unknown>,
  requesterId: string | null | undefined,
  existingById: Record<string, unknown> | undefined,
): InsertOwnershipPlan {
  if (!requesterId) {
    return { ok: false, reject: authReject('') };
  }
  if (existingById && String(existingById.user_id ?? '') !== String(requesterId)) {
    return {
      ok: false,
      reject: {
        status: 403,
        body: { data: null, error: { message: 'Forbidden: row owner mismatch', code: 'FORBIDDEN' } },
        logMsg: '',
      },
    };
  }
  const targetId = String(row.target_id ?? '');
  if (!targetId) {
    return {
      ok: false,
      reject: {
        status: 400,
        body: { data: null, error: { message: 'target_id is required', code: 'INVALID_INPUT' } },
        logMsg: '',
      },
    };
  }
  if (targetId === String(requesterId)) {
    return {
      ok: false,
      reject: {
        status: 400,
        body: { data: null, error: { message: 'cannot block yourself', code: 'INVALID_INPUT' } },
        logMsg: '',
      },
    };
  }
  return { ok: true, row: { ...row, user_id: requesterId, target_id: targetId } };
}

/** contact_shares INSERT (non-admin): auth + existing owner + liker validate + force liked_id. */
export function planContactSharesInsertOwnership(
  row: Record<string, unknown>,
  requesterId: string | null | undefined,
  existingById: Record<string, unknown> | undefined,
): InsertOwnershipPlan {
  if (!requesterId) {
    return { ok: false, reject: authReject('') };
  }
  if (existingById && String(existingById.liked_id ?? '') !== String(requesterId)) {
    return {
      ok: false,
      reject: {
        status: 403,
        body: { data: null, error: { message: 'Forbidden: row owner mismatch', code: 'FORBIDDEN' } },
        logMsg: '',
      },
    };
  }
  const recipientId = String(row.liker_id ?? '');
  if (!recipientId) {
    return {
      ok: false,
      reject: {
        status: 400,
        body: { data: null, error: { message: 'liker_id is required', code: 'INVALID_INPUT' } },
        logMsg: '',
      },
    };
  }
  if (recipientId === String(requesterId)) {
    return {
      ok: false,
      reject: {
        status: 400,
        body: { data: null, error: { message: 'cannot share contact with yourself', code: 'INVALID_INPUT' } },
        logMsg: '',
      },
    };
  }
  return { ok: true, row: { ...row, liked_id: requesterId, liker_id: recipientId } };
}

/** contact_share_events INSERT (non-admin): auth + existing owner + to_user validate + force. */
export function planContactShareEventsInsertOwnership(
  row: Record<string, unknown>,
  requesterId: string | null | undefined,
  existingById: Record<string, unknown> | undefined,
): InsertOwnershipPlan {
  if (!requesterId) {
    return { ok: false, reject: authReject('') };
  }
  if (existingById && String(existingById.from_user_id ?? '') !== String(requesterId)) {
    return {
      ok: false,
      reject: {
        status: 403,
        body: { data: null, error: { message: 'Forbidden: row owner mismatch', code: 'FORBIDDEN' } },
        logMsg: '',
      },
    };
  }
  const toUserId = String(row.to_user_id ?? '');
  if (!toUserId) {
    return {
      ok: false,
      reject: {
        status: 400,
        body: { data: null, error: { message: 'to_user_id is required', code: 'INVALID_INPUT' } },
        logMsg: '',
      },
    };
  }
  if (toUserId === String(requesterId)) {
    return {
      ok: false,
      reject: {
        status: 400,
        body: { data: null, error: { message: 'cannot send contact event to yourself', code: 'INVALID_INPUT' } },
        logMsg: '',
      },
    };
  }
  return { ok: true, row: { ...row, from_user_id: requesterId, to_user_id: toUserId } };
}

/**
 * Normalize chats INSERT pair order + deterministic id.
 * Does not look up existing rows (caller does).
 */
export function planNormalizeChatPairRow(
  row: Record<string, unknown>,
): { row: Record<string, unknown>; detId: string; uid1: string; uid2: string } {
  const [uid1, uid2] = [String(row.user1_id), String(row.user2_id)].sort();
  const detId = deterministicChatId(uid1, uid2);
  return {
    uid1,
    uid2,
    detId,
    row: { ...row, user1_id: uid1, user2_id: uid2, id: detId },
  };
}

/** Participant / block rejects used after store lookups (message INSERT). */
export function messagesInsertNonParticipantReject(): OpOwnershipReject {
  return {
    status: 403,
    body: { data: null, error: { message: 'Forbidden: not a chat participant', code: 'FORBIDDEN' } },
    logMsg: '[SECURITY] IDOR: message INSERT by non-participant blocked',
  };
}

export function messagesInsertBlockedReject(): OpOwnershipReject {
  return {
    status: 403,
    body: { data: null, error: { message: 'Forbidden: blocked user', code: 'BLOCKED' } },
    logMsg: '[SECURITY] message INSERT blocked by user block',
  };
}

export function groupMessagesInsertNonParticipantReject(): OpOwnershipReject {
  return {
    status: 403,
    body: { data: null, error: { message: 'Forbidden: not a group participant', code: 'FORBIDDEN' } },
    logMsg: '[SECURITY] IDOR: group_messages INSERT by non-participant blocked',
  };
}

export function chatReadsInsertNonParticipantReject(): OpOwnershipReject {
  return {
    status: 403,
    body: { data: null, error: { message: 'Forbidden: not a chat participant', code: 'FORBIDDEN' } },
    logMsg: '[SECURITY] IDOR: chat_reads INSERT by non-participant blocked',
  };
}

export function signalSendsInsertBlockedReject(): OpOwnershipReject {
  return {
    status: 403,
    body: { data: null, error: { message: 'Forbidden: blocked user', code: 'BLOCKED' } },
    logMsg: '[SECURITY] signal_sends INSERT blocked by user block',
  };
}

export function groupParticipantsMissingGroupReject(): OpOwnershipReject {
  return {
    status: 400,
    body: { data: null, error: { message: '존재하지 않는 단톡방입니다.', code: 'INVALID_INPUT' } },
    logMsg: '',
  };
}
