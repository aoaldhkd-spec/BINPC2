/**
 * Explicit profile column lists — prefer over select('*') for contract clarity.
 * (localdb currently ignores column args; lists still document / guard the shape.)
 */

/** Full profiles.Row — list + single-profile loads that need the complete card. */
export const PROFILE_ROW_SELECT =
  'id, nickname, bio, photo_url, personality_score, dom_sub_score, mbti, birth_year, birth_month, birth_day, location, interests, contact_private, hide_personality, kakao_id, instagram_id, phone_number, pin_code, avatar_color, created_at';

/** Blocked/hide rows used by privacy loaders. */
export const BLOCKED_USER_ROW_SELECT = 'id, user_id, target_id, block_type, created_at';

/** Profile visitor rows. */
export const PROFILE_VIEW_ROW_SELECT = 'id, viewer_id, viewed_id, viewed_at';

/** user_signals board/card fields. */
export const USER_SIGNAL_ROW_SELECT = 'id, user_id, status_msg, ideal_msg, feature_msg, created_at';

/** likes.Row — admin / TestDashboard loads. */
export const LIKE_ROW_SELECT = 'id, liker_id, liked_id, status, heart_type, created_at';

/** chats.Row — admin / TestDashboard loads. */
export const CHAT_ROW_SELECT = 'id, user1_id, user2_id, created_at';

/** session_history.Row — admin core load + wipe backup. */
export const SESSION_HISTORY_ROW_SELECT = 'id, ended_at, created_at';

/** notifications.Row — admin notify tab + wipe backup. */
export const NOTIFICATION_ROW_SELECT = 'id, message, type, target, is_active, created_at';

/**
 * Admin app_settings load — includes secret columns + overlay `_set` flags + qr_base_url.
 * (Participant clients must not use this list.)
 */
export const APP_SETTINGS_ADMIN_SELECT =
  'id, session_active, admin_phone, admin_password, entry_password, reset_password, test_password, updated_at, timer_end_at, timer_label, functions_locked, active_tables, reset_signal, table_labels, qr_base_url, admin_password_set, test_password_set, reset_password_set';
