import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// No real PostgreSQL connection, credentials, or live user sessions in this test.
const folder = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

test('bundled server must load connect-pg-simple from its installed package', () => {
  const output = readFileSync(join(folder, '..', 'dist', 'index.mjs'), 'utf8');
  assert.match(output, /from ["']connect-pg-simple["']/,
    'Do not bundle connect-pg-simple: its sibling table.sql is lost in dist/');
});

test('the external session package includes its SQL schema alongside its own index.js', () => {
  const packageFile = require.resolve('connect-pg-simple');
  const schema = join(dirname(packageFile), 'table.sql');
  assert.ok(existsSync(schema), 'Installed session package lacks its table.sql asset');
  assert.match(readFileSync(schema, 'utf8'), /CREATE TABLE/i);
});
