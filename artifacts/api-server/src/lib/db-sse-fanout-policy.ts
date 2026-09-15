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

/** Tables whose persist/emit paths log compact realtime trace meta. */
export const REALTIME_TRACE_TABLES = new Set([
  'messages',
  'chats',
  'likes',
  'contact_shares',
  'contact_share_events',
]);

export function realtimeTraceMeta(table: string, row: Record<string, unknown>) {
  return {
    table,
    rowId: typeof row.id === 'string' ? row.id : null,
    roomId: typeof row.chat_id === 'string' ? row.chat_id : null,
    createdAt: typeof row.created_at === 'string' ? row.created_at : null,
  };
}

export type SseAdmitReject = {
  status: number;
  retryAfter?: string;
  body: { error: string; code: string };
};

export function sseTokenExpiredReject(): SseAdmitReject {
  return {
    status: 401,
    body: { error: 'Invalid or missing SSE token', code: 'SSE_TOKEN_EXPIRED' },
  };
}

export function sseTokenInvalidReject(): SseAdmitReject {
  return {
    status: 401,
    body: { error: 'Invalid or missing SSE token', code: 'SSE_TOKEN_INVALID' },
  };
}

export function sseCapacityReject(): SseAdmitReject {
  return {
    status: 429,
    retryAfter: '3',
    body: { error: 'Server at SSE capacity', code: 'SSE_CAPACITY' },
  };
}

export function sseIpLimitReject(): SseAdmitReject {
  return {
    status: 429,
    retryAfter: '5',
    body: { error: 'Too many SSE connections from this IP', code: 'RATE_LIMIT' },
  };
}

export function sseAnonLimitReject(): SseAdmitReject {
  return {
    status: 429,
    retryAfter: '5',
    body: { error: 'Too many anonymous SSE connections', code: 'RATE_LIMIT' },
  };
}

/** Whether IP bucket should count this connection (anonymous IP-capped vs auth bypass). */
export function planSseIpCount(input: {
  currentConns: number;
  maxPerIp: number;
  hasUserId: boolean;
}): { allow: boolean; countIp: boolean; reject?: SseAdmitReject } {
  if (input.currentConns >= input.maxPerIp) {
    if (!input.hasUserId) {
      return { allow: false, countIp: false, reject: sseIpLimitReject() };
    }
    return { allow: true, countIp: false };
  }
  return { allow: true, countIp: true };
}

export function shouldRejectAnonSse(input: {
  isAdminSse: boolean;
  hasUserId: boolean;
  anonCount: number;
  anonMax?: number;
}): boolean {
  const max = input.anonMax ?? 100;
  return !input.isAdminSse && !input.hasUserId && input.anonCount >= max;
}

export const SSE_RING_REPLAY_MAX_DEFAULT = 200;
export const SSE_ADMIN_MAX_CONN_DEFAULT = 10;

/** Catchup when missed ring entries exceed soft max (HTTP merge-by-id instead). */
export function planSseRingReplay(
  missedCount: number,
  max: number = SSE_RING_REPLAY_MAX_DEFAULT,
): 'catchup' | 'replay' {
  return missedCount > max ? 'catchup' : 'replay';
}

/** Whether to evict oldest connection before adding (admin/user caps). */
export function shouldEvictOldestSseConn(currentSize: number, max: number): boolean {
  return currentSize >= max;
}

export type SseUserTokenGate =
  | { action: 'pass' }
  | {
      action: 'reject';
      state: 'expired' | 'missing' | 'invalid';
      reject: SseAdmitReject;
      metric: 'expired' | 'missing' | 'invalid';
    };

/**
 * /events userId+token gate — classify injected; metrics/logging stay in db.ts.
 * tokenState is classify result when token present; ignored when token missing.
 */
export function planSseUserTokenGate(input: {
  userId: string | null;
  token: string | null;
  tokenState: 'valid' | 'expired' | 'invalid' | null;
}): SseUserTokenGate {
  if (!input.userId) return { action: 'pass' };
  if (input.token && input.tokenState === 'valid') return { action: 'pass' };
  const state: 'expired' | 'missing' | 'invalid' = !input.token
    ? 'missing'
    : input.tokenState === 'expired'
      ? 'expired'
      : 'invalid';
  if (state === 'expired') {
    return { action: 'reject', state, reject: sseTokenExpiredReject(), metric: 'expired' };
  }
  if (state === 'missing') {
    return { action: 'reject', state, reject: sseTokenInvalidReject(), metric: 'missing' };
  }
  return { action: 'reject', state, reject: sseTokenInvalidReject(), metric: 'invalid' };
}


export type NotifyOtherPlan =
  | { action: 'skip' }
  | { action: 'enqueue'; msg: string; table: string; rowId: unknown };

/** Pure NOTIFY payload plan (skip images; tombstone oversized / app_settings). */
export function planNotifyOtherInstances(input: {
  table: string;
  ev: string;
  newRow: Record<string, unknown> | null;
  oldRow: Record<string, unknown> | null;
  instanceId: string;
  maxPayload?: number;
}): NotifyOtherPlan {
  if (input.table === 'app_image_store') return { action: 'skip' };
  const id = (input.newRow ?? input.oldRow)?.['id'];
  if (input.table === 'app_settings') {
    if (id == null) return { action: 'skip' };
    return {
      action: 'enqueue',
      msg: JSON.stringify({ src: input.instanceId, table: input.table, ev: input.ev, id, _tombstone: true }),
      table: input.table,
      rowId: id,
    };
  }
  const payload = JSON.stringify({
    src: input.instanceId,
    table: input.table,
    ev: input.ev,
    newRow: input.newRow,
    oldRow: input.oldRow,
  });
  const max = input.maxPayload ?? 7900;
  if (payload.length > max) {
    if (!id) return { action: 'skip' };
    return {
      action: 'enqueue',
      msg: JSON.stringify({ src: input.instanceId, table: input.table, ev: input.ev, id, _tombstone: true }),
      table: input.table,
      rowId: id,
    };
  }
  return { action: 'enqueue', msg: payload, table: input.table, rowId: id };
}

export type NotifyQueueEnqueuePlan =
  | { action: 'replace'; index: number; msg: string }
  | { action: 'push'; msg: string; dropOldest: boolean };

/**
 * Coalesce same table+rowId pending NOTIFY payloads; otherwise push (drop oldest if full).
 */
export function planNotifyQueueEnqueue(
  queue: readonly string[],
  msg: string,
  table: string,
  rowId: unknown,
  max: number,
): NotifyQueueEnqueuePlan {
  if (rowId != null) {
    for (let i = queue.length - 1; i >= 0; i--) {
      try {
        const queued = JSON.parse(queue[i]) as {
          table?: string;
          id?: unknown;
          newRow?: Record<string, unknown>;
          oldRow?: Record<string, unknown>;
        };
        const queuedId = queued.id ?? (queued.newRow ?? queued.oldRow)?.['id'];
        if (queued.table === table && String(queuedId) === String(rowId)) {
          return { action: 'replace', index: i, msg };
        }
      } catch {
        // corrupted entry — leave for drain failure; keep scanning
      }
    }
  }
  return { action: 'push', msg, dropOldest: queue.length >= max };
}

/** Live SSE connections: anon + admin + sum of per-user sets. */
export function countSseLiveConnections(
  userMapSizes: Iterable<number>,
  anonCount: number,
  adminCount: number,
): number {
  let n = anonCount + adminCount;
  for (const s of userMapSizes) n += s;
  return n;
}

/** /health sseConnections — user + anon only (admin SSE excluded, prior behavior). */
export function countSseHealthConnections(
  userMapSizes: Iterable<number>,
  anonCount: number,
): number {
  let n = anonCount;
  for (const s of userMapSizes) n += s;
  return n;
}


/** Parsed LISTEN/NOTIFY envelope (cross-instance sync). */
export type NotifyInboundEnvelope = {
  src: string;
  table: string;
  ev: string;
  id?: unknown;
  _tombstone?: boolean;
  newRow?: Record<string, unknown> | null;
  oldRow?: Record<string, unknown> | null;
};

export type NotifyInboundPlan =
  | { action: 'skip' }
  | { action: 'tombstone_delete'; table: string; id: string }
  | { action: 'refetch'; table: string; id: string; ev: string; reason: 'tombstone' | 'settings_secrets' }
  | {
      action: 'memory_upsert';
      table: string;
      ev: string;
      newRow: Record<string, unknown>;
      oldRow: Record<string, unknown> | null;
      mode: 'insert' | 'update';
    }
  | {
      action: 'memory_delete';
      table: string;
      oldRow: Record<string, unknown>;
    }
  | {
      action: 'broadcast_only';
      table: string;
      ev: string;
      newRow: Record<string, unknown> | null;
      oldRow: Record<string, unknown> | null;
    };

/**
 * Pure inbound NOTIFY decision (no PG/SSE).
 * Same-instance echo / empty tombstone id → skip.
 * Tombstones / sanitized app_settings → refetch; else memory upsert/delete or broadcast-only.
 */
export function planNotifyInboundApply(
  env: NotifyInboundEnvelope,
  instanceId: string,
  secretKeys: readonly string[],
): NotifyInboundPlan {
  if (env.src === instanceId) return { action: 'skip' };
  const tbl = env.table;

  if (env._tombstone) {
    if (!tbl || tbl === 'db_error_log') return { action: 'skip' };
    const id = String(env.id ?? '');
    if (!id) return { action: 'skip' };
    if (env.ev === 'DELETE') return { action: 'tombstone_delete', table: tbl, id };
    return { action: 'refetch', table: tbl, id, ev: env.ev, reason: 'tombstone' };
  }

  const newRow = env.newRow ?? null;
  const oldRow = env.oldRow ?? null;

  if (tbl && tbl !== 'db_error_log') {
    if (env.ev === 'INSERT' && newRow) {
      return {
        action: 'memory_upsert',
        table: tbl,
        ev: env.ev,
        newRow,
        oldRow,
        mode: 'insert',
      };
    }
    if (env.ev === 'UPDATE' && newRow) {
      if (tbl === 'app_settings' && secretKeys.some((k) => !(k in newRow))) {
        const sid = String(newRow['id'] ?? 1);
        return { action: 'refetch', table: tbl, id: sid, ev: env.ev, reason: 'settings_secrets' };
      }
      return {
        action: 'memory_upsert',
        table: tbl,
        ev: env.ev,
        newRow,
        oldRow,
        mode: 'update',
      };
    }
    if (env.ev === 'DELETE' && oldRow) {
      return { action: 'memory_delete', table: tbl, oldRow };
    }
  }

  // Prior behavior: still relay SSE even when store mutation is skipped (missing row / db_error_log).
  return {
    action: 'broadcast_only',
    table: tbl,
    ev: env.ev,
    newRow,
    oldRow,
  };
}

/** In-memory INSERT/UPDATE from a NOTIFY row (no PG). */
export function applyNotifyMemoryUpsert(
  rows: Record<string, unknown>[],
  mode: 'insert' | 'update',
  newRow: Record<string, unknown>,
): void {
  if (mode === 'insert') {
    const id = newRow['id'];
    if (!rows.some((r) => r['id'] === id)) rows.push(newRow);
    return;
  }
  const id = newRow['id'];
  const idx = rows.findIndex((r) => r['id'] === id);
  if (idx >= 0) rows[idx] = newRow;
  else rows.push(newRow);
}

/** In-memory DELETE from a NOTIFY oldRow (no PG). */
export function applyNotifyMemoryDelete(
  rows: Record<string, unknown>[],
  oldRow: Record<string, unknown>,
): void {
  const id = oldRow['id'];
  const idx = rows.findIndex((r) => r['id'] === id);
  if (idx >= 0) rows.splice(idx, 1);
}

/** Tombstone DELETE by id (broadcast still done by caller). */
export function applyNotifyTombstoneDelete(
  rows: Record<string, unknown>[],
  id: string,
): void {
  const idx = rows.findIndex((r) => r['id'] === id);
  if (idx >= 0) rows.splice(idx, 1);
}

/** Apply a refetched row into memory (tombstone or settings secrets). */
export function applyNotifyRefetchedRow(
  rows: Record<string, unknown>[],
  row: Record<string, unknown>,
  opts: { reason: 'tombstone' | 'settings_secrets'; tombstoneId?: string },
): void {
  if (opts.reason === 'settings_secrets') {
    const sidx = rows.findIndex((r) => r['id'] === row['id'] || r['id'] === 1);
    if (sidx >= 0) rows[sidx] = row;
    else rows.push(row);
    return;
  }
  const id = opts.tombstoneId ?? String(row['id'] ?? '');
  const idx = rows.findIndex((r) => r['id'] === id);
  if (idx >= 0) rows[idx] = row;
  else rows.push(row);
}
