import { buildKvUpsertSql } from './db-table-policy.js';
import { newParticipantAdmissionReject } from './db-event-admission.js';
import { EVENT_RESET_LOCK_KEY, type ResetPgPool } from './db-event-reset-transaction.js';
import type { PoolClient } from 'pg';
import { eventHubEncryptionKey, HubTx } from './event-hub-store.js';
import { assertTestModeAllowsPublicMutation } from './event-test-mode.js';

/** A new participant must not be written after the event was safely reset. */
export class EventAdmissionClosedDuringWrite extends Error {
  constructor() {
    super('New participant admission closed while saving the profile');
    this.name = 'EventAdmissionClosedDuringWrite';
  }
}

/**
 * The participant and optional hashed device binding are committed together.
 * The same PostgreSQL advisory lock is used by atomicEventReset.
 * A profile arriving before reset is archived by that reset; one arriving
 * after reset is rejected. Neither may be resurrected by a delayed UPSERT.
 */
export async function persistNewParticipantForCycle(
  pool: ResetPgPool,
  profile: Record<string, unknown>,
  expectedArchiveId: string,
  deviceSecretRow?: Record<string, unknown> | null,
  now: () => Date = () => new Date(),
): Promise<void> {
  const id = String(profile.id ?? '');
  if (!id || !expectedArchiveId) throw new EventAdmissionClosedDuringWrite();
  const client = await pool.connect();
  let inTx = false;
  let committing = false;
  try {
    await client.query('BEGIN');
    inTx = true;
    await client.query("SET LOCAL lock_timeout = '5000ms'");
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [EVENT_RESET_LOCK_KEY]);
    // Mode switches use this same lock. Recheck durable encrypted metadata
    // before either the profile or its device binding can become visible.
    await assertTestModeAllowsPublicMutation(new HubTx(client as PoolClient, eventHubEncryptionKey()));
    const settings = (await client.query(
      "SELECT data FROM app_kv_rows WHERE table_name = 'app_settings' ORDER BY updated_at DESC LIMIT 1 FOR UPDATE",
    )).rows[0]?.data as Record<string, unknown> | undefined;
    if (!settings || settings.event_cycle_archive_id !== expectedArchiveId
      || newParticipantAdmissionReject(settings, { isAdmin: false, isTestRuntime: false }, now())) {
      throw new EventAdmissionClosedDuringWrite();
    }
    const inserted = await client.query(
      "INSERT INTO app_kv_rows (table_name, row_id, data, updated_at) VALUES ('profiles', $1, $2, NOW()) ON CONFLICT (table_name, row_id) DO NOTHING RETURNING row_id",
      [id, JSON.stringify(profile)],
    );
    if (inserted.rows.length !== 1) throw new Error('Participant profile ID already exists');
    if (deviceSecretRow) {
      if (!deviceSecretRow.id || String(deviceSecretRow.user_id) !== id) {
        throw new Error('Invalid device binding for new participant');
      }
      await client.query(buildKvUpsertSql(), ['device_secrets', String(deviceSecretRow.id), JSON.stringify(deviceSecretRow)]);
    }
    committing = true;
    await client.query('COMMIT');
    inTx = false;
  } catch (error) {
    if (inTx) {
      try { await client.query('ROLLBACK'); } catch { /* COMMIT may have completed remotely */ }
    }
    // If the COMMIT reply was lost, check the durable profile ID exactly once.
    // Do not retry an INSERT blindly: a reset may already have run.
    if (committing) {
      try {
        const got = await pool.query(
          "SELECT data FROM app_kv_rows WHERE table_name = 'profiles' AND row_id = $1 LIMIT 1", [id],
        );
        if (got.rows[0]?.data && (got.rows[0].data as Record<string, unknown>).id === id) return;
      } catch { /* uncertain: fail closed */ }
    }
    throw error;
  } finally {
    client.release();
  }
}
