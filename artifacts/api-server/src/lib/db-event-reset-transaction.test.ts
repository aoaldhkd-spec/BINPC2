import { describe, expect, it } from 'vitest';
import { atomicEventReset, type ResetPgPool, type ResetPgClient } from './db-event-reset-transaction.js';

const archiveId = 'binpc2:event-anon:v1:2026-10-13:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
type DbState = Map<string, Map<string, Record<string, unknown>>>;
function sourceDb(): DbState {
  return new Map([
    ['app_settings', new Map([['settings', {
      id: 'settings', event_cycle_started_at: '2026-10-13T18:00:00+09:00',
      event_cycle_archive_id: archiveId, session_active: false, event_cycle_reset_complete: false,
      admin_phone: 'REDACTED_TEST',
    }]])],
    ['profiles', new Map([
      ['npc', { id: 'npc', nickname: '범일NPC', pin_code: '1111', role: 'admin' }],
      ['visitor', { id: 'visitor', nickname: 'DELETE_ME' }],
    ])],
    ['likes', new Map([['heart', { id: 'heart', liker_id: 'visitor', liked_id: 'npc', heart_type: 'red' }]])],
    ['messages', new Map([['message', { id: 'message', content: 'private body' }]])],
  ]);
}
function deepCopy(db: DbState): DbState {
  return new Map([...db].map(([name, rows]) => [name, new Map([...rows].map(([id,data]) => [id, structuredClone(data)]))]));
}
function fakePool(fail?: string) {
  let db = sourceDb();
  let snapshot: DbState | null = null;
  const events: string[] = [];
  const query = async (sql: string, values: unknown[] = []) => {
    const q = sql.replace(/\s+/g, ' ').trim();
    events.push(q);
    if (fail && q.includes(fail)) throw new Error('injected: ' + fail);
    if (q === 'BEGIN') { snapshot = deepCopy(db); return { rows: [] }; }
    if (q === 'ROLLBACK') { if (snapshot) db = snapshot; snapshot = null; return { rows: [] }; }
    if (q === 'COMMIT') { snapshot = null; return { rows: [] }; }
    if (q.includes('pg_advisory_xact_lock')) return { rows: [] };
    if (q.startsWith('SELECT row_id, data') || q.startsWith('SELECT data FROM app_kv_rows')) {
      const entry = [...(db.get('app_settings') ?? new Map()).entries()][0];
      return { rows: entry ? [{ row_id: entry[0], data: entry[1] }] : [] };
    }
    if (q.startsWith('SELECT row_id FROM app_kv_rows')) {
      return { rows: db.get('event_anonymous_archives')?.has(String(values[0])) ? [{row_id: values[0]}] : [] };
    }
    if (q.startsWith('SELECT table_name, data')) {
      return { rows: (values[0] as string[]).flatMap(name => [...(db.get(name) ?? new Map()).values()].map(data => ({ table_name: name, data }))) };
    }
    if (q.startsWith('INSERT INTO app_kv_rows')) {
      const name = String(values[0]), id = String(values[1]), data = JSON.parse(String(values[2])) as Record<string, unknown>;
      if (!db.has(name)) db.set(name, new Map());
      if (q.includes('DO NOTHING') && db.get(name)!.has(id)) return { rows: [] };
      db.get(name)!.set(id, data); return { rows: [] };
    }
    if (q.startsWith('DELETE FROM app_kv_rows')) { db.delete(String(values[0])); return { rows: [] }; }
    throw new Error('Unrecognised test SQL: ' + q);
  };
  const client = { query, release() {} } as ResetPgClient;
  return {
    pool: { connect: async () => client, query } as ResetPgPool,
    read: () => db,
    events,
  };
}
function opts() {
  return {
    clearTables: ['profiles', 'likes', 'messages'],
    now: new Date('2026-10-14T17:00:00+09:00'),
    planAdmin: (rows: Record<string, unknown>[]) => {
      const npc = rows.find(row => row.id === 'npc');
      if (!npc) throw new Error('no NPC');
      return npc;
    },
    adminIsProfile: (p: Record<string, unknown>) => p.id === 'npc',
    buildNextSettings: (s: Record<string, unknown>, signal: string) => ({
      ...s, reset_signal: signal, session_active: false, event_cycle_reset_complete: true,
    }),
  };
}
describe('atomic event reset safety', () => {
  for (const point of [
    'INSERT INTO app_kv_rows', "DELETE FROM app_kv_rows",
    'COMMIT',
  ]) {
    it('ROLLBACK retains people, hearts, messages and settings on ' + point + ' failure', async () => {
      const db = fakePool(point);
      await expect(atomicEventReset(db.pool, opts())).rejects.toThrow('injected');
      expect(db.read().get('profiles')?.has('visitor')).toBe(true);
      expect(db.read().get('likes')?.has('heart')).toBe(true);
      expect(db.read().get('messages')?.has('message')).toBe(true);
      expect(db.read().get('event_anonymous_archives')?.size ?? 0).toBe(0);
      expect(db.read().get('app_settings')?.get('settings')?.event_cycle_reset_complete).toBe(false);
    });
  }
  it('atomically archives sanitized counts, retains NPC and seals the event', async () => {
    const db = fakePool();
    const result = await atomicEventReset(db.pool, opts());
    expect(result.status).toBe('committed');
    expect(db.read().get('profiles')?.has('npc')).toBe(true);
    expect(db.read().get('profiles')?.has('visitor')).toBe(false);
    expect(db.read().get('likes')).toBeUndefined();
    expect(db.read().get('app_settings')?.get('settings')?.event_cycle_reset_complete).toBe(true);
    const encoded = JSON.stringify(db.read().get('event_anonymous_archives')?.get(archiveId));
    expect(encoded).not.toContain('DELETE_ME');
    expect(encoded).not.toContain('private body');
    expect(result.archive?.participantCount).toBe(1);
    const again = await atomicEventReset(db.pool, opts());
    expect(again.status).toBe('already');
    expect(db.read().get('event_anonymous_archives')?.size).toBe(1);
  });
});
