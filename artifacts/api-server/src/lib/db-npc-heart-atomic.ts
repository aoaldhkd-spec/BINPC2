import { EVENT_RESET_LOCK_KEY, type ResetPgPool } from './db-event-reset-transaction.js';
import { npcHeartAllowance } from './db-npc-heart-recharge.js';
import { likesHeartOpsReject, matchesLikeSend, normalizeLikeSource } from './db-op-likes-limits.js';
import { ADMIN_FIXED_NICKNAME } from './db-admin-identity.js';

export type NpcHeartAtomicResult =
  | { kind: 'inserted'; row: Record<string, unknown> }
  | { kind: 'duplicate'; row: Record<string, unknown> }
  | { kind: 'exhausted'; usage: ReturnType<typeof npcHeartAllowance> }
  | { kind: 'inactive' };

/**
 * Two server processes must never both spend the final NPC heart.
 * Transaction-lock with reset, fetch the authoritative likes ledger, and
 * insert only after checking the durable refill marker.
 */
export async function persistNpcHeartAtomically(
  pool: ResetPgPool, newRow: Record<string, unknown>, expectedArchiveId: string,
): Promise<NpcHeartAtomicResult> {
  const npcId = String(newRow.liker_id ?? '');
  const targetId = String(newRow.liked_id ?? '');
  const type = String(newRow.heart_type ?? '');
  const source = normalizeLikeSource(newRow.like_source);
  const rowId = String(newRow.id ?? '');
  if (!npcId || !targetId || !rowId
    || !['red', 'blue', 'pink', 'green'].includes(type)
    || !/^binpc2:event-anon:v1:\d{4}-\d{2}-\d{2}:[a-f0-9-]{36}$/.test(expectedArchiveId)) {
    return { kind: 'inactive' };
  }
  const client = await pool.connect();
  let inTransaction = false;
  let wasCommitting = false;
  try {
    await client.query('BEGIN');
    inTransaction = true;
    await client.query("SET LOCAL lock_timeout = '5000ms'");
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [EVENT_RESET_LOCK_KEY]);
    const settings = (await client.query(
      "SELECT data FROM app_kv_rows WHERE table_name = 'app_settings' ORDER BY updated_at DESC LIMIT 1 FOR UPDATE",
    )).rows[0]?.data as Record<string, unknown> | undefined;
    const npc = (await client.query(
      "SELECT data FROM app_kv_rows WHERE table_name = 'profiles' AND row_id = $1 LIMIT 1", [npcId],
    )).rows[0]?.data as Record<string, unknown> | undefined;
    if (!settings || settings.event_cycle_archive_id !== expectedArchiveId
      || settings.event_cycle_reset_complete === true
      || !Number.isFinite(Date.parse(String(settings.event_cycle_started_at ?? '')))
      || !npc || String(npc.nickname ?? '') !== ADMIN_FIXED_NICKNAME) {
      await client.query('ROLLBACK'); inTransaction = false;
      return { kind: 'inactive' };
    }
    const stored = await client.query(
      "SELECT data FROM app_kv_rows WHERE table_name = 'likes' AND data->>'liker_id' = $1", [npcId],
    );
    const ledger = stored.rows.map(r => r.data as Record<string, unknown>);
    const duplicate = ledger.find(row => matchesLikeSend(row, npcId, targetId, type, source));
    if (duplicate) {
      await client.query('ROLLBACK'); inTransaction = false;
      return { kind: 'duplicate', row: duplicate };
    }
    const usage = npcHeartAllowance({
      marker: settings.npc_heart_refill, archiveId: expectedArchiveId, npcId, likes: ledger,
    });
    const limited = !usage.active || likesHeartOpsReject({
      source, heartType: type,
      unlockedKeys: new Set(['red', 'blue', 'pink', 'green', 'rainbow']),
      grantUsed: usage.grantUsed, rainbowUsed: usage.rainbowUsed,
    });
    if (limited) {
      await client.query('ROLLBACK'); inTransaction = false;
      return usage.active ? { kind: 'exhausted', usage } : { kind: 'inactive' };
    }
    const inserted = await client.query(
      "INSERT INTO app_kv_rows (table_name, row_id, data, updated_at) VALUES ('likes', $1, $2, NOW()) ON CONFLICT (table_name, row_id) DO NOTHING RETURNING row_id",
      [rowId, JSON.stringify(newRow)],
    );
    if (inserted.rows.length !== 1) throw new Error('NPC heart row ID conflict');
    wasCommitting = true;
    await client.query('COMMIT'); inTransaction = false;
    return { kind: 'inserted', row: newRow };
  } catch (error) {
    if (inTransaction) {
      try { await client.query('ROLLBACK'); } catch { /* uncertain acknowledgement */ }
    }
    if (wasCommitting) {
      try {
        const confirm = await pool.query(
          "SELECT data FROM app_kv_rows WHERE table_name = 'likes' AND row_id = $1 LIMIT 1", [rowId],
        );
        if (confirm.rows[0]?.data && (confirm.rows[0].data as Record<string, unknown>).id === rowId) {
          return { kind: 'inserted', row: newRow };
        }
      } catch { /* fail closed */ }
    }
    throw error;
  } finally {
    client.release();
  }
}
