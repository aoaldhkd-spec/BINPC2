import { createLegacyModeOffQuery } from './legacy-mode-off.js';

/** In-memory transactional app_kv_rows test double (never used by production). */
export function createMockPg(options: { legacyTestMode?: 'off' } = {}) {
  const modeFixture = options.legacyTestMode === 'off'
    ? createLegacyModeOffQuery('in-memory-pg-mock') : undefined;
  type Table = Map<string, Record<string, unknown>>;
  type State = Map<string, Table>;
  const state: { db: State; snapshot: State | null } = { db: new Map(), snapshot: null };
  const clone = (s: State): State => new Map([...s].map(([t, v]) =>
    [t, new Map([...v].map(([k, row]) => [k, structuredClone(row)]))]));
  const query = async (sql: string, values: unknown[] = []): Promise<{ rows: Record<string, unknown>[] }> => {
    const mode = modeFixture?.(sql, values);
    if (mode) return mode;
    const q = sql.replace(/\s+/g, ' ').trim();
    if (q === 'BEGIN') { state.snapshot = clone(state.db); return { rows: [] }; }
    if (q === 'ROLLBACK') { if (state.snapshot) state.db = state.snapshot; state.snapshot = null; return { rows: [] }; }
    if (q === 'COMMIT') { state.snapshot = null; return { rows: [] }; }
    if (q.includes('pg_advisory_xact_lock')) return { rows: [] };
    if (q.startsWith('INSERT INTO app_kv_rows') && typeof values[0] === 'string') {
      const name = String(values[0]), id = String(values[1]);
      const row = JSON.parse(String(values[2])) as Record<string, unknown>;
      if (!state.db.has(name)) state.db.set(name, new Map());
      if (!q.includes('DO NOTHING') || !state.db.get(name)!.has(id)) state.db.get(name)!.set(id, row);
      return { rows: [] };
    }
    if (q.startsWith('DELETE FROM app_kv_rows') && typeof values[0] === 'string') {
      state.db.delete(String(values[0])); return { rows: [] };
    }
    if (q.startsWith('SELECT row_id FROM app_kv_rows') && q.includes('event_anonymous_archives')) {
      return { rows: state.db.get('event_anonymous_archives')?.has(String(values[0]))
        ? [{ row_id: values[0] }] : [] };
    }
    if (q.startsWith('SELECT row_id, data FROM app_kv_rows') && q.includes('app_settings')) {
      return { rows: [...(state.db.get('app_settings') ?? new Map()).entries()]
        .map(([row_id, data]) => ({ row_id, data })).slice(0, 1) };
    }
    if (q.startsWith('SELECT data FROM app_kv_rows') && q.includes('app_settings')) {
      return { rows: [...(state.db.get('app_settings') ?? new Map()).values()]
        .map(data => ({ data })).slice(0, 1) };
    }
    if (q.startsWith('SELECT data FROM app_kv_rows') && q.includes("'profiles'")) {
      return { rows: [...(state.db.get('profiles') ?? new Map()).values()].map(data => ({ data })) };
    }
    if (q.startsWith('SELECT table_name, data FROM app_kv_rows') && Array.isArray(values[0])) {
      return { rows: (values[0] as string[]).flatMap(t =>
        [...(state.db.get(t) ?? new Map()).values()].map(data => ({ table_name: t, data }))) };
    }
    return { rows: [] };
  };
  class MockPool {
    query = query;
    connect = async () => ({ query, release() {}, on() {} });
    on() {}
    end = async () => {};
  }
  class MockClient {
    query = query;
    connect = async () => {};
    on() {}
    end = async () => {};
  }
  return { MockPool, MockClient, state };
}
