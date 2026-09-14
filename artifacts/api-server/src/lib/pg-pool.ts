import pg from 'pg';
import { buildPgOptions } from './pg-options.js';
import { logger } from './logger.js';

/**
 * Shared PG pool — sessions, KV store, NOTIFY (via pool.query).
 * Keep max well below Supabase session-pooler client caps (EMAXCONNSESSION).
 * One dedicated LISTEN client lives outside this pool; leave headroom for it.
 *
 * Render dashboard MUST set PG_POOL_MAX=10 (or lower). Code also hard-caps
 * so a stale high env value cannot reopen EMAXCONNSESSION after deploy.
 */
export const PG_POOL_HARD_CAP = 10;
export const PG_POOL_DEFAULT_MAX = 10;

/** Resolve pool max: finite int, at least 1, never above hard cap. */
export function resolvePgPoolMax(envValue: string | undefined = process.env.PG_POOL_MAX): number {
  const raw = envValue === undefined || envValue === '' ? PG_POOL_DEFAULT_MAX : Number(envValue);
  const n = Number.isFinite(raw) ? Math.floor(raw) : PG_POOL_DEFAULT_MAX;
  return Math.max(1, Math.min(n, PG_POOL_HARD_CAP));
}

export const pgPool = new pg.Pool({
  ...buildPgOptions(),
  max: resolvePgPoolMax(),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  allowExitOnIdle: true,
});

// Idle clients can emit errors; without a listener the process may crash or
// leave unusable sockets that still count against Supabase max_clients.
pgPool.on('error', (err) => {
  logger.error({ err }, '[pg] idle pool client error — connection discarded');
});
