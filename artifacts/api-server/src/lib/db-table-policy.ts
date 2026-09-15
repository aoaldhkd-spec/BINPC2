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

/**
 * Active app_kv_rows table_name set (logging / inventory).
 * Legacy leftover cleanup uses LEGACY_KV_TABLES (explicit list), not the inverse of this set.
 */
export const ACTIVE_KV_TABLES = new Set([
  'profiles', 'app_settings', 'notifications', 'likes', 'chats',
  'messages', 'chat_reads', 'device_secrets', 'session_history', 'push_subscriptions',
  'contact_shares', 'contact_share_events', 'anonymous_reports',
  'app_image_store',
  // 옵트인 단체 채팅
  'group_chats', 'group_participants', 'group_messages',
  // 명시적 단톡 나가기 — 자동 재입장 방지 (서버 전용)
  'group_opt_outs',
  // 차단·숨기기 / 프로필 방문자
  'blocked_users', 'profile_views',
  // 상태·이상형 신호
  'user_signals',
  'signal_sends',
  // PG 전용 메타 — 앱 데이터가 아님. inversion cleanup에서 지우면 안 됨
  'rate_limits', 'db_error_log',
]);
