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
