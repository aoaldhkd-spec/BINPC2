import { buildKvDeleteTableSql, buildKvInsertIfAbsentSql, buildKvUpsertSql } from './db-table-policy.js';
import { summarizeAnonymousEvent, type AnonymousEventHistory } from './db-event-anonymous-history.js';
import { normaliseEventActions } from './db-event-admin-audit.js';

/** Isolated PostgreSQL unit of work. No process cache or SSE is changed before COMMIT. */
export type ResetPgClient = {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  release(): void;
};
export type ResetPgPool = {
  connect(): Promise<ResetPgClient>;
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
};
export type EventResetCommit = {
  status: 'committed' | 'already';
  archive: AnonymousEventHistory | null;
  previous: Record<string, Record<string, unknown>[]>;
  restoredAdmin: Record<string, unknown> | null;
  nextSettings: Record<string, unknown>;
};
export type EventResetOptions = {
  clearTables: readonly string[];
  now: Date;
  planAdmin: (oldProfiles: Record<string, unknown>[], settings: Record<string, unknown>) => Record<string, unknown>;
  buildNextSettings: (settings: Record<string, unknown>, resetSignal: string) => Record<string, unknown>;
  adminIsProfile: (profile: Record<string, unknown>, settings: Record<string, unknown>) => boolean;
  onStage?: (stage: 'begin' | 'archive' | 'delete' | 'restore-admin' | 'settings' | 'commit') => void;
};

const LOCK_KEY = 'binpc2:event-anonymous-archive-reset:v1';
const SELECT_SETTINGS = "SELECT row_id, data FROM app_kv_rows WHERE table_name = 'app_settings' ORDER BY updated_at DESC LIMIT 1 FOR UPDATE";
const SELECT_ARCHIVE = "SELECT row_id FROM app_kv_rows WHERE table_name = 'event_anonymous_archives' AND row_id = $1 LIMIT 1";

/**
 * All-or-nothing reset across multiple API instances:
 * - PostgreSQL advisory lock serialises resets, short exclusive table lock serialises concurrent KV writes.
 * - Authoritative rows are read FROM DB inside the lock (never RAM only).
 * - Archive, deletion, NPC restoration, and completion/settings marker commit together.
 * - On error, ROLLBACK retains source rows; no caller SSE may run on failure.
 * - If the COMMIT acknowledgement is lost, DB reconciliation detects completion.
 */
export async function atomicEventReset(pool: ResetPgPool, opts: EventResetOptions): Promise<EventResetCommit> {
  const client = await pool.connect();
  let stage: 'begin' | 'archive' | 'delete' | 'restore-admin' | 'settings' | 'commit' = 'begin';
  let inTx = false;
  let intended: EventResetCommit | null = null;
  let expectedArchiveId = '';
  try {
    await client.query('BEGIN');
    inTx = true;
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [LOCK_KEY]);
    // Block new KV writes while taking the complete archive snapshot and
    // clearing the event; prevents phantom participant/message inserts that
    // would otherwise fall between the snapshot and the DELETE.
    // On lock contention fail closed, retain all data, retry via the 60s guard.
    await client.query("SET LOCAL lock_timeout = '5000ms'");
    await client.query('LOCK TABLE app_kv_rows IN EXCLUSIVE MODE');
    const currentResult = await client.query(SELECT_SETTINGS);
    const saved = currentResult.rows[0];
    if (!saved || !saved.data || typeof saved.data !== 'object') {
      throw new Error('Missing durable app_settings; refuse destructive reset');
    }
    const settings = saved.data as Record<string, unknown>;
    const settingsKey = String(saved.row_id ?? settings.id ?? '');
    if (!settingsKey) throw new Error('Missing settings row id; refuse destructive reset');
    if (settings.event_cycle_reset_complete === true) {
      await client.query('COMMIT');
      inTx = false;
      return { status: 'already', archive: null, previous: {}, restoredAdmin: null, nextSettings: settings };
    }
    const start = Date.parse(String(settings.event_cycle_started_at ?? ''));
    expectedArchiveId = String(settings.event_cycle_archive_id ?? '');
    if (!Number.isFinite(start) || start > opts.now.getTime()) {
      throw new Error('No valid administrator-started event; refuse destructive reset');
    }
    const key = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(start));
    if (!new RegExp('^binpc2:event-anon:v1:' + key + ':[a-f0-9-]{36}$').test(expectedArchiveId)) {
      throw new Error('Archive identity missing or mismatched; refuse destructive reset');
    }

    const tableNames = [...new Set([...opts.clearTables, 'chat_reads', 'user_signals'])];
    const rows = await client.query(
      'SELECT table_name, data FROM app_kv_rows WHERE table_name = ANY($1::text[]) FOR UPDATE', [tableNames],
    );
    const previous: Record<string, Record<string, unknown>[]> = {};
    for (const t of tableNames) previous[t] = [];
    for (const row of rows.rows) {
      const name = String(row.table_name);
      if (previous[name] && row.data && typeof row.data === 'object' && !Array.isArray(row.data)) {
        previous[name].push(row.data as Record<string, unknown>);
      }
    }
    const profiles = previous.profiles ?? [];
    const admin = opts.planAdmin(profiles, settings);
    if (!admin?.id || !admin.pin_code) throw new Error('Cannot restore the administrator; refuse destructive reset');

    const errorMeta = await client.query(
      "SELECT data FROM app_kv_rows WHERE table_name = 'db_error_log' AND row_id = 'counter' LIMIT 1",
    );
    const persistedErrorCount = (errorMeta.rows[0]?.data as Record<string, unknown> | undefined)?.count;
    const errorBaseline = settings.event_cycle_db_error_baseline;
    const eventErrorCount = Number.isSafeInteger(persistedErrorCount)
      && Number.isSafeInteger(errorBaseline)
      && Number(persistedErrorCount) >= Number(errorBaseline)
      ? Number(persistedErrorCount) - Number(errorBaseline)
      : null; // counter was cleared/restarted: history is unknown, not zero
    const archive = summarizeAnonymousEvent({
      eventKey: key, eventArchiveId: expectedArchiveId,
      profiles, likes: previous.likes ?? [],
      messages: previous.messages ?? [], groupMessages: previous.group_messages ?? [],
      signals: previous.signal_sends ?? [], contactShares: previous.contact_share_events ?? [],
      adminProfileId: String(profiles.find(p => opts.adminIsProfile(p, settings))?.id ?? ''),
      chats: previous.chats ?? [], groupChats: previous.group_chats ?? [],
      groupParticipants: previous.group_participants ?? [],
      adminActions: normaliseEventActions(settings.event_cycle_admin_actions),
      dbPersistErrorCount: eventErrorCount,
      startedAt: String(settings.event_cycle_started_at),
      archivedAt: opts.now.toISOString(),
    });
    if (archive.archiveId !== expectedArchiveId) throw new Error('Archive identity changed');
    const resetSignal = opts.now.toISOString();
    const nextSettings = opts.buildNextSettings(settings, resetSignal);
    if (nextSettings.event_cycle_reset_complete !== true || nextSettings.session_active !== false) {
      throw new Error('Reset settings lack durable completion/stop marker');
    }
    nextSettings.id = String(settings.id ?? settingsKey);
    intended = { status: 'committed', archive, previous, restoredAdmin: admin, nextSettings };

    stage = 'archive'; opts.onStage?.(stage);
    await client.query(buildKvInsertIfAbsentSql(), [
      'event_anonymous_archives', expectedArchiveId,
      JSON.stringify({ ...archive, id: expectedArchiveId, createdAt: resetSignal }),
    ]);
    stage = 'delete'; opts.onStage?.(stage);
    for (const t of opts.clearTables) {
      await client.query(buildKvDeleteTableSql(), [t]);
    }
    stage = 'restore-admin'; opts.onStage?.(stage);
    await client.query(buildKvUpsertSql(), ['profiles', String(admin.id), JSON.stringify(admin)]);
    stage = 'settings'; opts.onStage?.(stage);
    await client.query(buildKvUpsertSql(), ['app_settings', settingsKey, JSON.stringify(nextSettings)]);
    stage = 'commit'; opts.onStage?.(stage);
    await client.query('COMMIT');
    inTx = false;
    return intended;
  } catch (error) {
    if (inTx) {
      try { await client.query('ROLLBACK'); } catch { /* connection may have ended after COMMIT */ }
    }
    // Distinguish an acknowledged failure from a lost COMMIT reply.
    // Reconciliation reads only metadata; do not retry a destructive transaction blindly.
    if (stage === 'commit' && intended && expectedArchiveId) {
      try {
        const settings = (await pool.query(
          "SELECT data FROM app_kv_rows WHERE table_name = 'app_settings' ORDER BY updated_at DESC LIMIT 1",
        )).rows[0]?.data as Record<string, unknown> | undefined;
        const archive = await pool.query(SELECT_ARCHIVE, [expectedArchiveId]);
        if (settings?.event_cycle_reset_complete === true
          && settings.event_cycle_archive_id === expectedArchiveId && archive.rows.length > 0) {
          return intended;
        }
      } catch { /* still uncertain; fail closed and let a later read reconcile */ }
    }
    throw error;
  } finally {
    client.release();
  }
}
