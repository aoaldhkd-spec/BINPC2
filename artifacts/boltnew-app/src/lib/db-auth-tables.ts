/** 서버 /op 에서 requesterId·세션 쿠키가 필요한 테이블 (SELECT 포함) */
export const SESSION_SCOPED_TABLES = new Set([
  'chats',
  'messages',
  'likes',
  'chat_reads',
  'contact_shares',
  'contact_share_events',
  'suggestions',
  'heart_balances',
  'group_chats',
  'group_participants',
  'group_messages',
  'profile_views',
  'blocked_users',
  'user_signals',
]);

export function tableNeedsSession(table: string, op: string, hasUserId: boolean): boolean {
  if (!hasUserId) return false;
  if (op !== 'select') return true;
  return SESSION_SCOPED_TABLES.has(table);
}
