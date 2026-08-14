import pg from 'pg';
import { buildPgOptions } from './pg-options.js';

/** Shared PG pool — sessions, KV store, LISTEN/NOTIFY */
export const pgPool = new pg.Pool({
  ...buildPgOptions(),
  max: Number(process.env.PG_POOL_MAX ?? 12),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});
