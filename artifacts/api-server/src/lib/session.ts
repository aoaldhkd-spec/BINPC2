import '../lib/dns-ipv4-first.js';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { buildPgOptions } from './pg-options.js';

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function createSessionMiddleware() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET environment variable is required');
  }
  if (process.env.NODE_ENV !== 'test' && !process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const PgSessionStore = connectPgSimple(session);
  const store = process.env.NODE_ENV === 'test'
    ? undefined
    : new PgSessionStore({
        conObject: buildPgOptions(),
        createTableIfMissing: true,
        tableName: 'app_sessions',
        pruneSessionInterval: 15 * 60,
      });

  return session({
    store,
    secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_MAX_AGE_MS,
    },
  });
}
