/** Model node-postgres simple-query results for the legacy suites' empty hub
 * ledger. These fixtures store app_kv_rows only; no encrypted hub rows exist. */
export function emptyHubOpeningResult(sql: string, values: unknown[] = []) {
  const statements = sql.split(';').map(part => part.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (statements[0] !== 'BEGIN' || !sql.includes('event_hub_records')) return undefined;
  const expected = [
    'BEGIN', "SET LOCAL lock_timeout='10000ms'",
    "SELECT pg_advisory_xact_lock(hashtext('binpc2:event-anonymous-archive-reset:v1'))",
    "SELECT pg_advisory_xact_lock(hashtext('binpc2:event-hub:v6'))",
    "SELECT kind,id,data FROM event_hub_records WHERE data ? 'crypto_box' ORDER BY kind,id LIMIT 1",
  ];
  if (values.length || JSON.stringify(statements) !== JSON.stringify(expected))
    throw new Error('Unexpected event-hub transaction SQL in isolated legacy pg fixture');
  return ['BEGIN', 'SET', 'SELECT', 'SELECT', 'SELECT'].map((command, index) => ({
    command,
    rows: index === 2 || index === 3 ? [{ pg_advisory_xact_lock: '' }] : [],
    rowCount: index === 2 || index === 3 ? 1 : index === 4 ? 0 : null,
    oid: 0,
    fields: [],
  }));
}
