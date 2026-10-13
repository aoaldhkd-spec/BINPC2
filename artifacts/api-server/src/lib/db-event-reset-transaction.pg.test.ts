import { beforeEach, afterAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { atomicEventReset, type ResetPgPool, type ResetPgClient } from './db-event-reset-transaction.js';
import { EventAdmissionClosedDuringWrite, persistNewParticipantForCycle } from './db-event-profile-write.js';
import { persistNpcHeartAtomically } from './db-npc-heart-atomic.js';
import { planNpcHeartRefill } from './db-npc-heart-recharge.js';

const url = process.env.TEST_DATABASE_URL;
const test = url ? it : it.skip; // GitHub ephemeral PostgreSQL CI supplies this URL; no production credentials.
const pool = url ? new pg.Pool({ connectionString: url, max: 4 }) : null;
const id = 'binpc2:event-anon:v1:2026-10-13:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const now = new Date('2026-10-14T17:00:00+09:00');
const SQL = `CREATE TABLE IF NOT EXISTS app_kv_rows (
  table_name text NOT NULL, row_id text NOT NULL, data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (table_name, row_id)
)`;
const settings = { id: 'settings', event_cycle_started_at: '2026-10-13T18:00:00+09:00',
  event_cycle_archive_id: id, session_active: false, event_cycle_reset_complete: false,
  event_cycle_admin_actions: { start: 1, end: 1, autoEnd: 0, lock: 2, settings: 3 },
  event_cycle_db_error_baseline: 4 };
const npc = { id: 'npc', nickname: '범일NPC', pin_code: '1234' };
async function insert(table: string, rowId: string, data: object) {
  await pool!.query('INSERT INTO app_kv_rows (table_name,row_id,data) VALUES ($1,$2,$3)', [table,rowId,JSON.stringify(data)]);
}
async function rows(table: string) {
  return (await pool!.query('SELECT data FROM app_kv_rows WHERE table_name=$1', [table])).rows.map(r => r.data as Record<string, unknown>);
}
function adapter(fail?: (query: string) => boolean): ResetPgPool {
  return {
    connect: async (): Promise<ResetPgClient> => {
      const real = await pool!.connect();
      return {
        query: async (sql, values = []) => {
          if (fail?.(sql)) throw new Error('forced PostgreSQL failure');
          const result = await real.query(sql, values);
          return { rows: result.rows as Record<string, unknown>[] };
        },
        release: () => real.release(),
      };
    },
    query: async (sql, values = []) => {
      const result = await pool!.query(sql, values);
      return { rows: result.rows as Record<string, unknown>[] };
    },
  };
}
function options() {
  return {
    now, clearTables: ['profiles','likes','messages'],
    planAdmin: (profiles: Record<string,unknown>[]) => {
      const found = profiles.find(p => p.id === 'npc');
      if (!found) throw new Error('Missing test NPC');
      return found;
    },
    adminIsProfile: (profile: Record<string, unknown>) => profile.id === 'npc',
    buildNextSettings: (saved: Record<string,unknown>, signal: string) => ({
      ...saved, session_active:false,event_cycle_reset_complete:true,reset_signal:signal,
    }),
  };
}
describe('real ephemeral PostgreSQL reset and rollback (no production data)', () => {
  beforeEach(async () => {
    if (!pool) return;
    await pool.query(SQL);
    await pool.query('TRUNCATE app_kv_rows');
    await insert('app_settings','settings',settings);
    await insert('profiles','npc',npc);
    await insert('profiles','participant',{id:'participant',nickname:'PRIVATE_ALIAS'});
    await insert('likes','like',{id:'like',liker_id:'participant',liked_id:'npc',heart_type:'red'});
    await insert('messages','message',{id:'message',content:'DO_NOT_ARCHIVE'});
    await insert('db_error_log','counter',{count: 6});
  });
  afterAll(async () => { await pool?.end(); });
  for (const failSql of ['ON CONFLICT (table_name, row_id) DO NOTHING','DELETE FROM app_kv_rows','INSERT INTO app_kv_rows']) {
    test('rolls back ALL rows and archive if SQL fails at ' + failSql, async () => {
      let armed = failSql === 'INSERT INTO app_kv_rows';
      const fail = (sql: string) => {
        if (!armed) armed = true;
        return armed && sql.includes(failSql);
      };
      await expect(atomicEventReset(adapter(fail), options())).rejects.toThrow('forced');
      expect(await rows('profiles')).toHaveLength(2);
      expect(await rows('likes')).toHaveLength(1);
      expect(await rows('messages')).toHaveLength(1);
      expect(await rows('event_anonymous_archives')).toHaveLength(0);
      expect((await rows('app_settings'))[0]?.event_cycle_reset_complete).toBe(false);
    });
  }
  test('commits archive, NPC and completion marker in the same transaction', async () => {
    const outcome = await atomicEventReset(adapter(), options());
    expect(outcome.status).toBe('committed');
    expect((await rows('profiles')).map(r=>r.id)).toEqual(['npc']);
    expect(await rows('likes')).toHaveLength(0);
    expect(await rows('messages')).toHaveLength(0);
    const archive = await rows('event_anonymous_archives');
    expect(archive).toHaveLength(1);
    expect(archive[0]?.participantCount).toBe(1);
    expect(archive[0]?.adminActions).toMatchObject({ start: 1, end: 1, lock: 2, settings: 3, reset: 1 });
    expect(archive[0]?.dbPersistErrorCount).toBe(2);
    expect(archive[0]?.uniqueHeartSenderCount).toBe(1);
    expect(archive[0]?.directMessageCount).toBe(1);
    expect(JSON.stringify(archive)).not.toMatch(/DO_NOT_ARCHIVE|PRIVATE_ALIAS/);
    expect((await rows('app_settings'))[0]?.event_cycle_reset_complete).toBe(true);
  });
  test('includes an in-flight participant write in the archive before reset deletes it', async () => {
    const writer = await pool!.connect();
    try {
      await writer.query('BEGIN');
      await writer.query(
        'INSERT INTO app_kv_rows (table_name,row_id,data) VALUES ($1,$2,$3)',
        ['profiles','late-profile',JSON.stringify({id:'late-profile',nickname:'ONLY_TEST_PERSON'})],
      );
      // A writer holding ROW EXCLUSIVE must finish before our full-table
      // snapshot starts. A reset without this lock would miss the profile.
      const resetPromise = atomicEventReset(adapter(), options());
      await new Promise(resolve => setTimeout(resolve, 60));
      await writer.query('COMMIT');
      const reset = await resetPromise;
      expect(reset.status).toBe('committed');
      expect(reset.archive?.participantCount).toBe(2);
      expect((await rows('profiles')).map(row => row.id)).toEqual(['npc']);
      expect(JSON.stringify(await rows('event_anonymous_archives'))).not.toContain('ONLY_TEST_PERSON');
    } finally {
      await writer.query('ROLLBACK').catch(() => {});
      writer.release();
    }
  });

  test('serialises two competing API instances and writes one archive', async () => {
    const [a,b] = await Promise.all([atomicEventReset(adapter(),options()), atomicEventReset(adapter(),options())]);
    expect([a.status,b.status].sort()).toEqual(['already','committed']);
    expect(await rows('event_anonymous_archives')).toHaveLength(1);
    expect((await rows('profiles')).map(r=>r.id)).toEqual(['npc']);
  });
  test('reconciles a COMMIT that succeeded but whose acknowledgement was lost', async () => {
    const first = adapter();
    const lostReply: ResetPgPool = {
      ...first,
      connect: async () => {
        const real = await first.connect();
        return {
          ...real,
          query: async (sql, values) => {
            const result = await real.query(sql, values);
            if (sql === 'COMMIT') throw new Error('lost COMMIT acknowledgement');
            return result;
          },
        };
      },
    };
    const outcome = await atomicEventReset(lostReply, options());
    expect(outcome.status).toBe('committed');
    expect(await rows('event_anonymous_archives')).toHaveLength(1);
    expect((await rows('app_settings'))[0]?.event_cycle_reset_complete).toBe(true);
  });
  test('guarded new participant persists profile and hashed device binding together', async () => {
    await pool!.query("UPDATE app_kv_rows SET data = jsonb_set(data, '{session_active}', 'true'::jsonb) WHERE table_name = 'app_settings'");
    await persistNewParticipantForCycle(adapter(),
      { id: 'registered', nickname: 'synthetic-only' }, id,
      { id: 'registered-device', user_id: 'registered', secret_hash: 'synthetic-hash' },
      () => new Date('2026-10-13T20:00:00+09:00'));
    expect((await rows('profiles')).map(x => x.id)).toContain('registered');
    expect((await rows('device_secrets')).map(x => x.user_id)).toContain('registered');
  });

  test('a failed device binding rolls back the new profile as well', async () => {
    await pool!.query("UPDATE app_kv_rows SET data = jsonb_set(data, '{session_active}', 'true'::jsonb) WHERE table_name = 'app_settings'");
    const base = adapter();
    const fault: ResetPgPool = {
      ...base,
      connect: async () => {
        const real = await base.connect();
        return {
          ...real,
          query: async (sql, values) => {
            if (values?.[0] === 'device_secrets') throw new Error('synthetic device write failure');
            return real.query(sql, values);
          },
        };
      },
    };
    await expect(persistNewParticipantForCycle(fault,
      { id: 'rollback-person', nickname: 'do-not-save' }, id,
      { id: 'rollback-device', user_id: 'rollback-person', secret_hash: 'synthetic' },
      () => new Date('2026-10-13T20:00:00+09:00'))).rejects.toThrow('synthetic device');
    expect((await rows('profiles')).some(x => x.id === 'rollback-person')).toBe(false);
    expect((await rows('device_secrets'))).toHaveLength(0);
  });

  test('a stale active flag cannot resurrect a participant after 01:00 or after reset', async () => {
    await pool!.query("UPDATE app_kv_rows SET data = jsonb_set(data, '{session_active}', 'true'::jsonb) WHERE table_name = 'app_settings'");
    await expect(persistNewParticipantForCycle(adapter(), { id: 'too-late' }, id, null,
      () => new Date('2026-10-14T01:00:00+09:00'))).rejects.toBeInstanceOf(EventAdmissionClosedDuringWrite);
    expect((await rows('profiles')).some(x => x.id === 'too-late')).toBe(false);
    await atomicEventReset(adapter(), options());
    await expect(persistNewParticipantForCycle(adapter(), { id: 'after-reset' }, id, null,
      () => new Date('2026-10-13T23:00:00+09:00'))).rejects.toBeInstanceOf(EventAdmissionClosedDuringWrite);
    expect((await rows('profiles')).map(x => x.id)).toEqual(['npc']);
  });

  test('a new-profile write queued behind a reset cannot recreate old event data', async () => {
    let releaseReset!: () => void;
    let signalLocked!: () => void;
    const held = new Promise<void>(resolve => { releaseReset = resolve; });
    const locked = new Promise<void>(resolve => { signalLocked = resolve; });
    const base = adapter();
    const delaying: ResetPgPool = {
      ...base,
      connect: async () => {
        const real = await base.connect();
        return {
          ...real,
          query: async (sql, values) => {
            const result = await real.query(sql, values);
            if (sql === 'LOCK TABLE app_kv_rows IN EXCLUSIVE MODE') {
              signalLocked();
              await held;
            }
            return result;
          },
        };
      },
    };
    const resetPending = atomicEventReset(delaying, options());
    await locked; // reset owns the advisory lock and the app_kv_rows EXCLUSIVE lock
    const newProfile = persistNewParticipantForCycle(adapter(),
      { id: 'ghost-after-reset', nickname: 'synthetic' }, id, null,
      () => new Date('2026-10-13T23:00:00+09:00'));
    await new Promise(resolve => setTimeout(resolve, 40));
    releaseReset();
    expect((await resetPending).status).toBe('committed');
    await expect(newProfile).rejects.toBeInstanceOf(EventAdmissionClosedDuringWrite);
    expect((await rows('profiles')).map(x => x.id)).toEqual(['npc']);
    expect((await rows('event_anonymous_archives'))).toHaveLength(1);
  });

  test('a profile committed just before reset is included in its preserved aggregate', async () => {
    await pool!.query("UPDATE app_kv_rows SET data = jsonb_set(data, '{session_active}', 'true'::jsonb) WHERE table_name = 'app_settings'");
    await persistNewParticipantForCycle(adapter(), { id: 'arrived-before-reset', nickname: 'synthetic' },
      id, null, () => new Date('2026-10-13T20:00:00+09:00'));
    const completed = await atomicEventReset(adapter(), options());
    expect(completed.archive?.participantCount).toBe(2);
    expect((await rows('profiles')).map(x => x.id)).toEqual(['npc']);
    expect(JSON.stringify(await rows('event_anonymous_archives'))).not.toContain('arrived-before-reset');
  });

  test('two API instances cannot both consume the same NPC classic-heart quota', async () => {
    const marker = planNpcHeartRefill({
      previous: null, archiveId: id, npcId: 'npc', phase: 'start',
      likes: await rows('likes'), now: '2026-10-13T18:00:00+09:00',
    });
    await pool!.query("UPDATE app_kv_rows SET data = jsonb_set(data, '{npc_heart_refill}', $1::jsonb) WHERE table_name = 'app_settings'",
      [JSON.stringify(marker)]);
    const make = (suffix: string) => ({
      id: 'npc-grant-' + suffix, liker_id: 'npc', liked_id: 'synthetic-' + suffix,
      heart_type: 'red', like_source: 'grant',
    });
    const [a,b] = await Promise.all([
      persistNpcHeartAtomically(adapter(), make('a'), id),
      persistNpcHeartAtomically(adapter(), make('b'), id),
    ]);
    expect([a.kind,b.kind].sort()).toEqual(['exhausted','inserted']);
    expect((await rows('likes')).filter(r => r.liker_id === 'npc' && r.like_source === 'grant')).toHaveLength(1);
  });

  test('six parallel NPC rainbow requests cannot exceed four durable uses', async () => {
    const marker = planNpcHeartRefill({
      previous: null, archiveId: id, npcId: 'npc', phase: 'start',
      likes: await rows('likes'), now: '2026-10-13T18:00:00+09:00',
    });
    await pool!.query("UPDATE app_kv_rows SET data = jsonb_set(data, '{npc_heart_refill}', $1::jsonb) WHERE table_name = 'app_settings'",
      [JSON.stringify(marker)]);
    const jobs = Array.from({ length: 6 }, (_, i) => persistNpcHeartAtomically(adapter(), {
      id: 'npc-rainbow-' + i, liker_id: 'npc', liked_id: 'synthetic-' + i,
      heart_type: 'red', like_source: 'rainbow',
    }, id));
    const outcomes = await Promise.all(jobs);
    expect(outcomes.filter(x => x.kind === 'inserted')).toHaveLength(4);
    expect(outcomes.filter(x => x.kind === 'exhausted')).toHaveLength(2);
    expect((await rows('likes')).filter(r => r.liker_id === 'npc' && r.like_source === 'rainbow')).toHaveLength(4);
  });

  test('duplicate NPC sends across instances remain idempotent, reset blocks late sends', async () => {
    const marker = planNpcHeartRefill({
      previous: null, archiveId: id, npcId: 'npc', phase: 'start',
      likes: await rows('likes'), now: '2026-10-13T18:00:00+09:00',
    });
    await pool!.query("UPDATE app_kv_rows SET data = jsonb_set(data, '{npc_heart_refill}', $1::jsonb) WHERE table_name = 'app_settings'",
      [JSON.stringify(marker)]);
    const make = (suffix: string) => ({
      id: 'npc-duplicate-' + suffix, liker_id: 'npc', liked_id: 'one-target',
      heart_type: 'blue', like_source: 'grant',
    });
    const [a,b] = await Promise.all([
      persistNpcHeartAtomically(adapter(), make('first'), id),
      persistNpcHeartAtomically(adapter(), make('second'), id),
    ]);
    expect([a.kind,b.kind].sort()).toEqual(['duplicate','inserted']);
    expect((await rows('likes')).filter(r => r.liker_id === 'npc' && r.heart_type === 'blue')).toHaveLength(1);
    await atomicEventReset(adapter(), options());
    expect((await persistNpcHeartAtomically(adapter(), make('after-reset'), id)).kind).toBe('inactive');
    expect(await rows('likes')).toHaveLength(0);
  });

  test('forced NPC insert failure rolls back without consuming allowance', async () => {
    const marker = planNpcHeartRefill({
      previous: null, archiveId: id, npcId: 'npc', phase: 'start',
      likes: await rows('likes'), now: '2026-10-13T18:00:00+09:00',
    });
    await pool!.query("UPDATE app_kv_rows SET data = jsonb_set(data, '{npc_heart_refill}', $1::jsonb) WHERE table_name = 'app_settings'",
      [JSON.stringify(marker)]);
    const row = { id: 'npc-fault', liker_id: 'npc', liked_id: 'isolated-recipient', heart_type: 'green', like_source: 'grant' };
    const fault = adapter(sql => sql.startsWith('INSERT INTO app_kv_rows') && sql.includes("VALUES ('likes'"));
    await expect(persistNpcHeartAtomically(fault, row, id)).rejects.toThrow('forced');
    expect((await rows('likes')).filter(r => r.liker_id === 'npc')).toHaveLength(0);
    expect((await persistNpcHeartAtomically(adapter(), row, id)).kind).toBe('inserted');
  });

});
