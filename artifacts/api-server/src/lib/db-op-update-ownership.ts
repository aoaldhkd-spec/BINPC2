/**
 * /op UPDATE IDOR ownership + patch forcing — extracted from routes/db.ts.
 * Pure planners; Express res / logger / persist stay in db.ts.
 */

export type OpOwnershipReject = {
  status: number;
  body: { data: null; error: { message: string; code: string } };
  /** SECURITY log message (fields still attached by db.ts). */
  logMsg: string;
};

const FORBIDDEN_AUTH = {
  message: 'Forbidden: authentication required',
  code: 'FORBIDDEN',
} as const;

/**
 * Early UPDATE auth: messages always need requesterId; likes/relationship
 * tables need it when not admin. Returns null when allowed to proceed.
 */
export function updateMissingRequesterReject(
  table: string,
  isAdmin: boolean,
  requesterId: string | null | undefined,
): OpOwnershipReject | null {
  if (table === 'messages' && !requesterId) {
    return {
      status: 403,
      body: { data: null, error: { ...FORBIDDEN_AUTH } },
      logMsg: '[SECURITY] IDOR: messages UPDATE without requesterId blocked',
    };
  }
  if (table === 'likes' && !isAdmin && !requesterId) {
    return {
      status: 403,
      body: { data: null, error: { ...FORBIDDEN_AUTH } },
      logMsg: '[SECURITY] IDOR: likes UPDATE without requesterId blocked',
    };
  }
  if (
    !isAdmin
    && (table === 'blocked_users' || table === 'contact_shares' || table === 'contact_share_events')
    && !requesterId
  ) {
    return {
      status: 403,
      body: { data: null, error: { ...FORBIDDEN_AUTH } },
      logMsg: '[SECURITY] IDOR: relationship UPDATE without requesterId blocked',
    };
  }
  return null;
}

/** signal_sends UPDATE is forbidden for non-admin clients. */
export function signalSendsUpdateReject(
  table: string,
  isAdmin: boolean,
): OpOwnershipReject | null {
  if (table === 'signal_sends' && !isAdmin) {
    return {
      status: 403,
      body: {
        data: null,
        error: { message: 'Forbidden: signal actions cannot be updated', code: 'FORBIDDEN' },
      },
      logMsg: '',
    };
  }
  return null;
}

/**
 * Force ownership fields on UPDATE patch for relationship tables.
 * Matches prior delete-id / lock-owner behavior.
 */
export function forceUpdateOwnershipPatch(
  table: string,
  patch: Record<string, unknown>,
  requesterId: string,
): Record<string, unknown> {
  if (table === 'blocked_users') {
    const next = { ...patch, user_id: requesterId };
    delete next.id;
    return next;
  }
  if (table === 'contact_shares') {
    const next = { ...patch, liked_id: requesterId };
    delete next.id;
    delete next.liker_id;
    return next;
  }
  if (table === 'contact_share_events') {
    const next = { ...patch, from_user_id: requesterId };
    delete next.id;
    delete next.to_user_id;
    return next;
  }
  return patch;
}

export type GroupParticipantsUpdatePlan =
  | { ok: true; patch: Record<string, unknown> }
  | { ok: false; reject: OpOwnershipReject };

/** group_participants UPDATE: auth + last_read_at-only patch. */
export function planGroupParticipantsUpdate(
  patch: Record<string, unknown>,
  requesterId: string | null | undefined,
): GroupParticipantsUpdatePlan {
  if (!requesterId) {
    return {
      ok: false,
      reject: {
        status: 403,
        body: { data: null, error: { ...FORBIDDEN_AUTH } },
        logMsg: '[SECURITY] IDOR: group_participants UPDATE without requesterId blocked',
      },
    };
  }
  const readAt = patch.last_read_at;
  if (typeof readAt !== 'string' || !readAt.trim()) {
    return {
      ok: false,
      reject: {
        status: 400,
        body: {
          data: null,
          error: { message: 'last_read_at is required', code: 'INVALID_INPUT' },
        },
        logMsg: '',
      },
    };
  }
  return { ok: true, patch: { last_read_at: readAt } };
}

/**
 * Per-row UPDATE ownership. Caller only invokes when requesterId is set.
 * likes / blocked / contact_* skip for admin (isAdmin=true → null for those).
 */
export function checkUpdateRowOwnership(
  table: string,
  existingRow: Record<string, unknown>,
  requesterId: string,
  isAdmin: boolean,
): OpOwnershipReject | null {
  if (table === 'profiles' && existingRow.id != null
      && String(existingRow.id) !== String(requesterId)) {
    return {
      status: 403,
      body: {
        data: null,
        error: { message: 'Forbidden: 자신의 프로필만 수정할 수 있습니다.', code: 'FORBIDDEN' },
      },
      logMsg: '[SECURITY] IDOR: UPDATE profiles blocked',
    };
  }
  if (table === 'messages' && existingRow.sender_id != null
      && String(existingRow.sender_id) !== String(requesterId)) {
    return {
      status: 403,
      body: {
        data: null,
        error: { message: 'Forbidden: 자신의 메시지만 수정할 수 있습니다.', code: 'FORBIDDEN' },
      },
      logMsg: '[SECURITY] IDOR: UPDATE messages blocked',
    };
  }
  if (!isAdmin && table === 'likes' && existingRow.liked_id != null
      && String(existingRow.liked_id) !== String(requesterId)) {
    return {
      status: 403,
      body: {
        data: null,
        error: { message: 'Forbidden: 받은 하트만 변경할 수 있습니다.', code: 'FORBIDDEN' },
      },
      logMsg: '[SECURITY] IDOR: UPDATE likes blocked',
    };
  }
  if (table === 'chat_reads' && existingRow.reader_id != null
      && String(existingRow.reader_id) !== String(requesterId)) {
    return {
      status: 403,
      body: {
        data: null,
        error: { message: 'Forbidden: 자신의 읽음 기록만 수정할 수 있습니다.', code: 'FORBIDDEN' },
      },
      logMsg: '[SECURITY] IDOR: UPDATE chat_reads blocked',
    };
  }
  if (table === 'group_participants' && existingRow.user_id != null
      && String(existingRow.user_id) !== String(requesterId)) {
    return {
      status: 403,
      body: {
        data: null,
        error: { message: 'Forbidden: 자신의 참여만 수정할 수 있습니다.', code: 'FORBIDDEN' },
      },
      logMsg: '[SECURITY] IDOR: UPDATE group_participants blocked',
    };
  }
  if (!isAdmin && table === 'blocked_users'
      && String(existingRow.user_id ?? '') !== String(requesterId)) {
    return {
      status: 403,
      body: {
        data: null,
        error: { message: 'Forbidden: 자신이 만든 차단만 수정할 수 있습니다.', code: 'FORBIDDEN' },
      },
      logMsg: '[SECURITY] IDOR: UPDATE blocked_users blocked',
    };
  }
  if (!isAdmin && table === 'contact_shares'
      && String(existingRow.liked_id ?? '') !== String(requesterId)) {
    return {
      status: 403,
      body: {
        data: null,
        error: { message: 'Forbidden: 자신이 공유한 연락처만 수정할 수 있습니다.', code: 'FORBIDDEN' },
      },
      logMsg: '[SECURITY] IDOR: UPDATE contact_shares blocked',
    };
  }
  if (!isAdmin && table === 'contact_share_events'
      && String(existingRow.from_user_id ?? '') !== String(requesterId)) {
    return {
      status: 403,
      body: {
        data: null,
        error: { message: 'Forbidden: 자신이 보낸 이벤트만 수정할 수 있습니다.', code: 'FORBIDDEN' },
      },
      logMsg: '[SECURITY] IDOR: UPDATE contact_share_events blocked',
    };
  }
  return null;
}
