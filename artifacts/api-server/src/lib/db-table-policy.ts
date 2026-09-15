/**
 * /op allowlist + critical persist table sets — extracted from routes/db.ts.
 */

/** Allowlist prevents access to internal or non-existent tables via /op. */
export const ALLOWED_OP_TABLES = new Set([
  'profiles', 'chats', 'messages', 'likes', 'chat_reads',
  'app_settings',
  'session_history',
  'contact_shares', 'contact_share_events', 'anonymous_reports',
  'notifications',
  'app_image_store',
  'group_chats', 'group_participants', 'group_messages',
  'blocked_users', 'profile_views',
  'user_signals',
  'signal_sends',
]);

/** Durability-required tables — persist must succeed before SSE/response. */
export const CRITICAL_PERSIST_TABLES = new Set([
  'messages', 'likes', 'chats', 'chat_reads',
  'contact_shares', 'contact_share_events',
  'group_messages', 'group_chats', 'group_participants',
  'signal_sends',
]);
