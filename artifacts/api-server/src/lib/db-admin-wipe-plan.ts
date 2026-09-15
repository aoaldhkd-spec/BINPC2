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
