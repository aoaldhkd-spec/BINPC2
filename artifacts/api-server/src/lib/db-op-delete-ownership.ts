/**
 * /op DELETE IDOR ownership planners — extracted from routes/db.ts.
 * Pure; Express res / logger / persist stay in db.ts.
 */

import type { OpOwnershipReject } from './db-op-update-ownership.js';

const FORBIDDEN_AUTH = {
  message: 'Forbidden: authentication required',
  code: 'FORBIDDEN',
} as const;

/** Sensitive tables that require requesterId for non-admin DELETE. */
export const DELETE_AUTH_REQUIRED_TABLES = new Set([
  'messages',
  'likes',
  'chat_reads',
  'chats',
  'contact_shares',
  'contact_share_events',
  'group_messages',
  'group_participants',
  'group_chats',
  'signal_sends',
  'blocked_users',
]);

/** Non-admin DELETE without requesterId on sensitive tables. */
export function deleteMissingRequesterReject(
  table: string,
  isAdmin: boolean,
  requesterId: string | null | undefined,
): OpOwnershipReject | null {
  if (isAdmin || requesterId) return null;
  if (!DELETE_AUTH_REQUIRED_TABLES.has(table)) return null;
  return {
    status: 403,
    body: { data: null, error: { ...FORBIDDEN_AUTH } },
    logMsg: '[SECURITY] IDOR: DELETE without requesterId blocked',
  };
}

/**
 * Per-row DELETE ownership for non-admin requester.
 * Caller only invokes when requesterId is set and !isAdmin.
 */
export function checkDeleteRowOwnership(
  table: string,
  existingRow: Record<string, unknown>,
  requesterId: string,
): OpOwnershipReject | null {
  if (table === 'likes' && existingRow.liker_id != null
      && String(existingRow.liker_id) !== String(requesterId)) {
    return {
      status: 403,
      body: {
        data: null,
        error: { message: 'Forbidden: 자신이 보낸 하트만 취소할 수 있습니다.', code: 'FORBIDDEN' },
      },
      logMsg: '[SECURITY] IDOR: DELETE likes blocked',
    };
  }
  if (table === 'signal_sends' && existingRow.sender_id != null
      && String(existingRow.sender_id) !== String(requesterId)) {
    return {
      status: 403,
      body: {
        data: null,
        error: { message: 'Forbidden: 자신이 보낸 시그널만 취소할 수 있습니다.', code: 'FORBIDDEN' },
      },
      logMsg: '[SECURITY] IDOR: DELETE signal_sends blocked',
    };
  }
  if (table === 'messages' && existingRow.sender_id != null
      && String(existingRow.sender_id) !== String(requesterId)) {
    return {
      status: 403,
      body: {
        data: null,
        error: { message: 'Forbidden: 자신의 메시지만 삭제할 수 있습니다.', code: 'FORBIDDEN' },
      },
      logMsg: '[SECURITY] IDOR: DELETE messages blocked',
    };
  }
  if (table === 'chats') {
    const u1 = String(existingRow.user1_id ?? '');
    const u2 = String(existingRow.user2_id ?? '');
    if (u1 !== String(requesterId) && u2 !== String(requesterId)) {
      return {
        status: 403,
        body: {
          data: null,
          error: { message: 'Forbidden: 참여한 채팅방만 삭제할 수 있습니다.', code: 'FORBIDDEN' },
        },
        logMsg: '[SECURITY] IDOR: DELETE chats blocked',
      };
    }
  }
  if (table === 'group_participants' && existingRow.user_id != null
      && String(existingRow.user_id) !== String(requesterId)) {
    return {
      status: 403,
      body: {
        data: null,
        error: { message: 'Forbidden: 자신의 참여만 나갈 수 있습니다.', code: 'FORBIDDEN' },
      },
      logMsg: '[SECURITY] IDOR: DELETE group_participants blocked',
    };
  }
  if (table === 'group_messages' && existingRow.sender_id != null
      && String(existingRow.sender_id) !== String(requesterId)) {
    return {
      status: 403,
      body: {
        data: null,
        error: { message: 'Forbidden: 자신의 단톡 메시지만 삭제할 수 있습니다.', code: 'FORBIDDEN' },
      },
      logMsg: '[SECURITY] IDOR: DELETE group_messages blocked',
    };
  }
  if (table === 'group_chats') {
    return {
      status: 403,
      body: {
        data: null,
        error: { message: 'Forbidden: 단톡방 삭제는 관리자만 가능합니다.', code: 'FORBIDDEN' },
      },
      logMsg: '[SECURITY] IDOR: DELETE group_chats blocked',
    };
  }
  if (table === 'blocked_users'
      && String(existingRow.user_id ?? '') !== String(requesterId)) {
    return {
      status: 403,
      body: {
        data: null,
        error: { message: 'Forbidden: 자신이 만든 차단만 삭제할 수 있습니다.', code: 'FORBIDDEN' },
      },
      logMsg: '[SECURITY] IDOR: DELETE blocked_users blocked',
    };
  }
  if (table === 'contact_shares'
      && String(existingRow.liked_id ?? '') !== String(requesterId)) {
    return {
      status: 403,
      body: {
        data: null,
        error: { message: 'Forbidden: 자신이 공유한 연락처만 삭제할 수 있습니다.', code: 'FORBIDDEN' },
      },
      logMsg: '[SECURITY] IDOR: DELETE contact_shares blocked',
    };
  }
  if (table === 'contact_share_events'
      && String(existingRow.from_user_id ?? '') !== String(requesterId)) {
    return {
      status: 403,
      body: {
        data: null,
        error: { message: 'Forbidden: 자신이 보낸 이벤트만 삭제할 수 있습니다.', code: 'FORBIDDEN' },
      },
      logMsg: '[SECURITY] IDOR: DELETE contact_share_events blocked',
    };
  }
  return null;
}
