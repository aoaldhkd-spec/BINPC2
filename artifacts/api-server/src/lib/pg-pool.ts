import pg from 'pg';
import { buildPgOptions } from './pg-options.js';

/**
 * Shared PG pool — sessions, KV store, LISTEN/NOTIFY.
 * Keep max well below Supabase session-pooler client caps (EMAXCONNSESSION).
 * One dedicated LISTEN client is outside this pool; leave headroom for it.
 */
export const pgPool = new pg.Pool({
  ...buildPgOptions(),
  max: Number(process.env.PG_POOL_MAX ?? 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  allowExitOnIdle: true,
});
