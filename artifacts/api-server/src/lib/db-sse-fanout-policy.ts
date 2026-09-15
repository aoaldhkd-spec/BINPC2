/**
 * SSE fanout policy — private/admin table sets + strip + smart-broadcast plan.
 * Extracted from routes/db.ts (behavior unchanged). Execution (broadcastAll/…)
 * stays in db.ts; this module only decides who gets what.
 */

/** 1:1 프라이빗 데이터 테이블 — 절대 전체 브로드캐스트 금지 */
export const PRIVATE_TABLES = new Set([
  'messages', 'likes', 'chats',
  'contact_shares', 'contact_share_events', 'chat_reads',
  'group_messages', 'group_participants',
  'blocked_users', 'profile_views',
  'signal_sends',
  // user_signals는 공개 — 전광판/카드에서 모두가 볼 수 있음 (연락처 등 민감정보 없음)
]);

/** 관리자 SSE 전용 — 일반 유저에게 브로드캐스트 금지 */
export const ADMIN_ONLY_PRIVATE_TABLES = new Set(['anonymous_reports']);

export function stripInternalBroadcastFields(
  table: string,
  event: Record<string, unknown>,
): Record<string, unknown> {
  if (table !== 'messages') return event;
  const strip = (row: unknown) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
    const r = { ...(row as Record<string, unknown>) };
    delete r.chat_user1_id;
    delete r.chat_user2_id;
    return r;
  };
  return { ...event, newRow: strip(event['newRow']), oldRow: strip(event['oldRow']) };
}

export type SmartBroadcastPlan =
  | { kind: 'admin'; event: Record<string, unknown> }
  | { kind: 'all'; event: Record<string, unknown> }
  | { kind: 'users'; targets: string[]; event: Record<string, unknown> }
  | { kind: 'drop'; table: string; rowId: unknown; chatId: unknown };

export type SmartBroadcastSanitize = {
  sanitizeProfile: (row: Record<string, unknown>) => Record<string, unknown>;
  sanitizeSettings: (row: Record<string, unknown>) => Record<string, unknown>;
  collectTargets: (table: string, row: Record<string, unknown>) => string[];
};

/**
 * Pure planner for _smartBroadcastLocal — returns who should receive the event.
 */
export function planSmartBroadcastLocal(
  table: string,
  row: Record<string, unknown> | null,
  event: Record<string, unknown>,
  sanitize: SmartBroadcastSanitize,
): SmartBroadcastPlan {
  if (ADMIN_ONLY_PRIVATE_TABLES.has(table)) {
    return { kind: 'admin', event: stripInternalBroadcastFields(table, event) };
  }
  // row가 없는 경우(DELETE payload 없음): 프라이빗 테이블이면 드롭, 공개 테이블만 전체 전송
  if (!row) {
    if (!PRIVATE_TABLES.has(table)) return { kind: 'all', event };
    return { kind: 'drop', table, rowId: null, chatId: null };
  }
  const targets = sanitize.collectTargets(table, row);
  const safeEvent = stripInternalBroadcastFields(table, event);

  if (targets.length > 0) {
    return { kind: 'users', targets, event: safeEvent };
  }
  if (!PRIVATE_TABLES.has(table)) {
    if (table === 'profiles') {
      return {
        kind: 'all',
        event: {
          ...event,
          newRow: event['newRow'] ? sanitize.sanitizeProfile(event['newRow'] as Record<string, unknown>) : null,
          oldRow: event['oldRow'] ? sanitize.sanitizeProfile(event['oldRow'] as Record<string, unknown>) : null,
        },
      };
    }
    if (table === 'app_settings') {
      return {
        kind: 'all',
        event: {
          ...event,
          newRow: event['newRow'] ? sanitize.sanitizeSettings(event['newRow'] as Record<string, unknown>) : null,
          oldRow: event['oldRow'] ? sanitize.sanitizeSettings(event['oldRow'] as Record<string, unknown>) : null,
        },
      };
    }
    return { kind: 'all', event };
  }
  return { kind: 'drop', table, rowId: row['id'], chatId: row['chat_id'] };
}
