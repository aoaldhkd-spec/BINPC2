/**
 * Input / SSE sanitization — extracted from routes/db.ts (behavior unchanged).
 * Keep FIELD_LIMITS in sync when adding free-text columns.
 */

export function sanitizeStr(val: unknown, maxLen: number): unknown {
  if (typeof val !== 'string') return val;
  return val
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '') // strip C0 control chars
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2064\u206a-\u206f\ufeff]/g, '') // strip Unicode direction/zero-width overrides
    .replace(/<[^>]*>/g, '') // strip HTML/XML tags → no stored XSS
    .slice(0, maxLen);
}

export const FIELD_LIMITS: Record<string, Record<string, number>> = {
  profiles: { nickname: 30, bio: 500, status_message: 100, kakao_id: 100, instagram_id: 100, phone_number: 30 },
  messages: { content: 2000 },
  notifications: { content: 300, title: 100 },
  anonymous_reports: { content: 500, reason: 200 },
  group_chats: { name: 60, interest_tag: 30, age_group: 10, room_kind: 30 },
  group_messages: { content: 2000 },
  user_signals: { status_msg: 80, ideal_msg: 500, feature_msg: 500 },
};

export function sanitizeRow(tbl: string, row: Record<string, unknown>): Record<string, unknown> {
  const limits = FIELD_LIMITS[tbl];
  if (!limits) return row;
  const r: Record<string, unknown> = { ...row };
  for (const [field, maxLen] of Object.entries(limits)) {
    if (field in r) r[field] = sanitizeStr(r[field], maxLen);
  }
  return r;
}

/** 프로필 row에서 민감 연락처 필드를 제거하여 전체 브로드캐스트 안전하게 만들기 */
export function sanitizeProfile(row: Record<string, unknown>): Record<string, unknown> {
  const s = { ...row };
  delete s['phone_number'];
  delete s['kakao_id'];
  delete s['instagram_id'];
  return s;
}

export function sanitizeProfileForViewer(
  row: Record<string, unknown>,
  viewerId: string | null | undefined,
): Record<string, unknown> {
  if (viewerId && String(row.id) === String(viewerId)) return row;
  return row.contact_private === true ? sanitizeProfile(row) : row;
}

/** app_settings row에서 관리자·리셋·테스트 비밀번호를 제거하여 유저 SSE에 노출되지 않도록 */
export function sanitizeSettings(row: Record<string, unknown>): Record<string, unknown> {
  const s = { ...row };
  delete s['admin_password'];
  delete s['reset_password'];
  delete s['test_password'];
  return s;
}
