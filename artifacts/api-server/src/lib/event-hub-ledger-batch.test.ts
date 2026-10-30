import { expect, it, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { HubStore, HubTx } from './event-hub-store.js';

const commands = ['BEGIN', 'SET', 'SELECT', 'SELECT', 'SELECT'];
const opening = (rows: unknown[] = []) => commands.map((command, index) => ({
  command, rows: index === 4 ? rows : [], rowCount: index === 4 ? rows.length : null,
}));
function fixture(result: unknown = opening()) {
  const query = vi.fn(async (sql: string) => {
    if (sql.startsWith('BEGIN')) return result;
    return { rows: [] };
  });
  const release = vi.fn();
  const client = { query, release } as unknown as PoolClient;
  const store = new HubStore({ connect: async () => client } as unknown as Pool, 'isolated-batch-test-key');
  return { store, query, release };
}
async function encryptedRow(key: Buffer) {
  let row: { kind: string; id: string; data: Record<string, unknown> } | undefined;
  const writer = { query: async (_sql: string, values: string[]) => {
    row = { kind: values[0], id: values[1], data: JSON.parse(values[2]) };
    return { rows: [] };
  }} as unknown as PoolClient;
  await new HubTx(writer, key).put('application', 'saved-application', { id: 'saved-application', owner: 'synthetic-owner', payment: 'approved' });
  return row!;
}

it('runs callbacks for an explicit empty ledger only after the five-result opening batch', async () => {
  const { store, query, release } = fixture();
  const work = vi.fn(async () => 'ok');
  expect(await store.transaction(work)).toBe('ok');
  expect(work).toHaveBeenCalledOnce();
  expect(query).toHaveBeenCalledTimes(2);
  expect(query.mock.calls[0][0]).toContain("SELECT kind,id,data FROM event_hub_records WHERE data ? 'crypto_box' ORDER BY kind,id LIMIT 1;");
  expect(query.mock.calls[1][0]).toBe('COMMIT');
  expect(release).toHaveBeenCalledOnce();
});

it.each([
  ['missing batch', undefined],
  ['old single result', { rows: [] }],
  ['sparse batch', Array(5)],
  ['missing fifth result', opening().slice(0, 4)],
  ['null sentinel', [...opening().slice(0, 4), null]],
  ['wrong command', [...opening().slice(0, 4), { command: 'UPDATE', rows: [], rowCount: 0 }]],
  ['missing rows', [...opening().slice(0, 4), { command: 'SELECT', rowCount: 0 }]],
  ['null rows', [...opening().slice(0, 4), { command: 'SELECT', rows: null, rowCount: 0 }]],
  ['inconsistent count', [...opening().slice(0, 4), { command: 'SELECT', rows: [], rowCount: 1 }]],
  ['null ledger row', opening([null])],
  ['too many sentinel rows', opening([{}, {}])],
  ['missing ciphertext', opening([{ kind: 'application', id: 'saved-application', data: {} }])],
  ['missing identity', opening([{ data: { crypto_box: {} } }])],
])('fails closed before callback and rolls back for %s', async (_label, result) => {
  const { store, query, release } = fixture(null);
  query.mockImplementation(async (sql: string) => sql.startsWith('BEGIN') ? result : { rows: [] });
  const work = vi.fn(async () => 'must not execute');
  await expect(store.transaction(work)).rejects.toMatchObject({ code: 'LEDGER_KEY_UNAVAILABLE', status: 503 });
  expect(work).not.toHaveBeenCalled();
  expect(query.mock.calls.map(([sql]) => sql.startsWith('BEGIN') ? 'OPEN' : sql)).toEqual(['OPEN', 'ROLLBACK']);
  expect(release).toHaveBeenCalledOnce();
});

it('authenticates the batched encrypted row before callback and never issues a second sentinel query', async () => {
  const { store, query } = fixture();
  const row = await encryptedRow(store.key);
  query.mockImplementation(async (sql: string) => sql.startsWith('BEGIN') ? opening([row]) : { rows: [] });
  const work = vi.fn(async () => 'approved record remains readable');
  expect(await store.transaction(work)).toBe('approved record remains readable');
  expect(work).toHaveBeenCalledOnce();
  expect(query).toHaveBeenCalledTimes(2);
});

it('rejects a changed AAD identity before callback even when the ciphertext and key are unchanged', async () => {
  const { store, query } = fixture();
  const row = await encryptedRow(store.key);
  row.id = 'different-application';
  query.mockImplementation(async (sql: string) => sql.startsWith('BEGIN') ? opening([row]) : { rows: [] });
  const work = vi.fn(async () => undefined);
  await expect(store.transaction(work)).rejects.toMatchObject({ code: 'LEDGER_KEY_UNAVAILABLE', status: 503 });
  expect(work).not.toHaveBeenCalled();
  expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
});

it('rolls back and releases the client if the opening SQL itself fails', async () => {
  const { store, query, release } = fixture();
  query.mockImplementation(async (sql: string) => {
    if (sql.startsWith('BEGIN')) throw new Error('synthetic opening SQL failure');
    return { rows: [] };
  });
  const work = vi.fn(async () => undefined);
  await expect(store.transaction(work)).rejects.toThrow('synthetic opening SQL failure');
  expect(work).not.toHaveBeenCalled();
  expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
  expect(release).toHaveBeenCalledOnce();
});

it('retains the standalone query path and rejects null rows rather than assuming an empty ledger', async () => {
  const { store } = fixture();
  const row = await encryptedRow(store.key);
  const query = vi.fn(async () => ({ rows: [row] }));
  const transaction = new HubTx({ query } as unknown as PoolClient, store.key);
  await expect(transaction.assertLedgerReadable()).resolves.toBeUndefined();
  expect(query).toHaveBeenCalledOnce();
  await expect(transaction.assertLedgerReadable(null)).rejects.toMatchObject({ code: 'LEDGER_KEY_UNAVAILABLE' });
  expect(query).toHaveBeenCalledOnce();
});
