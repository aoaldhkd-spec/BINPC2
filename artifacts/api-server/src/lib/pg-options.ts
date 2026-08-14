import type pg from 'pg';

/** pg v8.22+ treats sslmode=require as verify-full unless libpq compat is enabled. */
export function withPgSslParams(connectionString: string): string {
  if (!connectionString || connectionString.includes('sslmode=')) return connectionString;
  const sep = connectionString.includes('?') ? '&' : '?';
  return `${connectionString}${sep}uselibpqcompat=true&sslmode=require`;
}

export function buildPgOptions(): pg.ClientConfig {
  const raw = process.env.DATABASE_URL ?? '';
  return {
    connectionString: withPgSslParams(raw),
    ssl: raw ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 5_000,
  };
}
