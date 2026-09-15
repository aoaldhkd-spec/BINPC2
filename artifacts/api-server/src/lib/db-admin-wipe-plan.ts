/**
 * Pure plan for clearing 범일NPC relationship rows — extracted from routes/db.ts.
 * Execution (store mutate / persist / SSE) stays in clearAdminNpcRelationships.
 */

export type AdminNpcRelTables = {
  chats: Record<string, unknown>[];
  messages: Record<string, unknown>[];
  chat_reads: Record<string, unknown>[];
  likes: Record<string, unknown>[];
  contact_shares: Record<string, unknown>[];
  contact_share_events: Record<string, unknown>[];
};

export type AdminNpcRelClearPlan = {
  adminId: string;
  chatIds: Set<string>;
  chatRows: Record<string, unknown>[];
  msgRows: Record<string, unknown>[];
  readRows: Record<string, unknown>[];
  likeRows: Record<string, unknown>[];
  shareRows: Record<string, unknown>[];
  shareEventRows: Record<string, unknown>[];
};

/**
 * Which relationship rows belong to adminId and should be wiped
 * (hearts · 1:1 chats · contact shares only — other users untouched).
 */
export function planClearAdminNpcRelationships(
  adminId: string,
  tables: AdminNpcRelTables,
): AdminNpcRelClearPlan | null {
  const aid = String(adminId);
  if (!aid) return null;

  const chatRows = (tables.chats ?? []).filter(
    c => String(c.user1_id) === aid || String(c.user2_id) === aid,
  );
  const chatIds = new Set(chatRows.map(c => String(c.id)));

  const msgRows = (tables.messages ?? []).filter(m => chatIds.has(String(m.chat_id)));
  const readRows = (tables.chat_reads ?? []).filter(r => chatIds.has(String(r.chat_id)));
  const likeRows = (tables.likes ?? []).filter(
    l => String(l.liker_id) === aid || String(l.liked_id) === aid,
  );
  const shareRows = (tables.contact_shares ?? []).filter(
    s => String(s.liker_id) === aid || String(s.liked_id) === aid,
  );
  const shareEventRows = (tables.contact_share_events ?? []).filter(
    e => String(e.from_user_id) === aid || String(e.to_user_id) === aid,
  );

  return {
    adminId: aid,
    chatIds,
    chatRows,
    msgRows,
    readRows,
    likeRows,
    shareRows,
    shareEventRows,
  };
}

/** Whether a likes-rate-limit map key touches this admin id. */
export function likeRateKeyTouchesAdmin(key: string, adminId: string): boolean {
  const aid = String(adminId);
  return key.startsWith(`${aid}:`) || key.includes(`:${aid}:`);
}

/** Tables cleared by admin_event_end_reset (order preserved). */
export const ADMIN_EVENT_END_CLEAR_TABLES = [
  'profiles', 'likes', 'anonymous_reports', 'chats', 'messages',
  'contact_shares', 'contact_share_events',
  'notifications',
  'signal_sends',
  'group_chats', 'group_participants', 'group_messages', 'group_opt_outs',
] as const;

/**
 * Private tables: emit RESET without row payloads (민감 데이터 유출 방지).
 * profiles uses sanitized DELETE; others row DELETE.
 */
export const ADMIN_EVENT_END_PRIVATE_RESET = new Set([
  'likes', 'chats', 'messages', 'contact_shares', 'contact_share_events',
  'chat_reads', 'anonymous_reports', 'signal_sends',
  'group_chats', 'group_participants', 'group_messages', 'group_opt_outs',
]);

export type WipeBroadcastPlan =
  | { mode: 'reset' }
  | { mode: 'profile_delete'; rows: Record<string, unknown>[] }
  | { mode: 'row_delete'; rows: Record<string, unknown>[] };

/** How to announce a wiped table on SSE (payload choice only — emit stays in db.ts). */
export function planWipeTableBroadcast(
  table: string,
  oldRows: Record<string, unknown>[],
): WipeBroadcastPlan {
  if (ADMIN_EVENT_END_PRIVATE_RESET.has(table)) return { mode: 'reset' };
  if (table === 'profiles') return { mode: 'profile_delete', rows: oldRows };
  return { mode: 'row_delete', rows: oldRows };
}

/** Tables cleared by test_wipe_all. */
export const TEST_WIPE_ALL_TABLES = ['likes', 'messages', 'chats', 'profiles'] as const;
