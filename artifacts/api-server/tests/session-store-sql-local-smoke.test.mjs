import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// No real DB, credentials, network, user IDs, or session data.
const require = createRequire(import.meta.url);
const session = require('express-session');
const connectPgSimple = require('connect-pg-simple');

test('real connect-pg-simple package reads table.sql then runs original prune query with fake pool', async () => {
  const queries = [];
  const pool = {
    async query(statement, params) {
      queries.push({ statement, params });
      if (statement.startsWith('SELECT to_regclass')) {
        return { rows: [{ to_regclass: null }] }; // A synthetic missing table only.
      }
      return { rows: [] };
    },
  };
  const SessionStore = connectPgSimple(session);
  const store = new SessionStore({
    pool,
    createTableIfMissing: true,
    tableName: 'app_sessions',
    pruneSessionInterval: false, // Do not create timers/background DB work.
  });
  await new Promise((resolve, reject) => {
    store.pruneSessions(error => error ? reject(error) : resolve());
  });
  assert.ok(queries.some(q => q.statement.startsWith('SELECT to_regclass')));
  assert.ok(queries.some(q => /CREATE TABLE/i.test(q.statement) && q.statement.includes('app_sessions')),
    'SQL asset must be loaded beside the installed package, using the existing session table name.');
  assert.ok(queries.some(q => q.statement.includes('DELETE FROM "app_sessions"')),
    'Normal expired-session pruning SQL must remain enabled.');
});
