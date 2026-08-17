import assert from 'node:assert/strict';
import test from 'node:test';

import {
  confirmationValue,
  createOpsClient,
  fetchWithTimeout,
  parseArgs,
  parseTarget,
  redactObject,
  redactText,
  redactUrl,
  requireCleanupConfirmation,
  requireLoadTarget,
  requireProductionWrite,
} from '../lib/ops-client.mjs';

test('parseArgs accepts equals, separated values, and flags', () => {
  const args = parseArgs(['--target=production', '--confirm', 'svc,site', '--dry-run']);
  assert.equal(args.values.target, 'production');
  assert.equal(args.values.confirm, 'svc,site');
  assert.equal(args.values['dry-run'], true);
  assert.equal(args.provided.has('target'), true);
});

test('parseTarget identifies local URLs without treating arbitrary remotes as confirmed production', () => {
  assert.equal(parseTarget('http://127.0.0.1:8080').isLocal, true);
  assert.equal(parseTarget('production').isProduction, true);
  assert.deepEqual(
    { name: parseTarget('https://example.com/api').name, production: parseTarget('https://example.com/api').isProduction },
    { name: 'remote', production: false },
  );
});

test('production writes require explicit target and exact identity confirmation', () => {
  const identities = ['service-a', 'site-b'];
  assert.equal(confirmationValue(identities), 'service-a,site-b');
  assert.throws(
    () => requireProductionWrite({ args: parseArgs([]), identities, operation: 'rotate' }),
    /--target=production/,
  );
  assert.throws(
    () => requireProductionWrite({
      args: parseArgs(['--target=production', '--confirm=wrong']),
      identities,
      operation: 'rotate',
    }),
    /--confirm=service-a,site-b/,
  );
  assert.equal(
    requireProductionWrite({
      args: parseArgs(['--target=production', '--confirm=service-a,site-b']),
      identities,
      operation: 'rotate',
    }).dryRun,
    false,
  );
});

test('dry-run bypasses production confirmation and suppresses mutating fetches', async () => {
  const args = parseArgs(['--dry-run']);
  assert.equal(requireProductionWrite({ args, identities: ['service-a'], operation: 'rotate' }).dryRun, true);
  let calls = 0;
  const client = createOpsClient({
    baseUrl: 'https://api.example.com',
    dryRun: true,
    fetchImpl: async () => {
      calls += 1;
      throw new Error('network should not run');
    },
  });
  const result = await client.request('/resource', { method: 'PATCH', body: '{}' });
  assert.equal(result.dryRun, true);
  assert.equal(calls, 0);
});

test('fetchWithTimeout aborts a hanging request without network', async () => {
  const fakeFetch = (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
  });
  await assert.rejects(
    fetchWithTimeout('https://example.com', {}, { timeoutMs: 5, fetchImpl: fakeFetch }),
    /timed out/,
  );
});

test('HTTP errors do not include provider response bodies', async () => {
  const secret = `sbp_${'z'.repeat(24)}`;
  const client = createOpsClient({
    baseUrl: 'https://api.example.com',
    fetchImpl: async () => new Response(JSON.stringify({ access_token: secret }), { status: 500 }),
  });
  await assert.rejects(
    client.request('/failure'),
    (error) => !error.message.includes(secret) && !error.message.includes('access_token'),
  );
});

test('remote load requires production target and host confirmation', () => {
  assert.doesNotThrow(() => requireLoadTarget({
    args: parseArgs([]),
    url: 'http://localhost:8080/api/db',
  }));
  assert.throws(
    () => requireLoadTarget({ args: parseArgs([]), url: 'https://api.example.com/db' }),
    /--target=production/,
  );
  assert.doesNotThrow(() => requireLoadTarget({
    args: parseArgs(['--target=production', '--confirm=api.example.com']),
    url: 'https://api.example.com/db',
  }));
});

test('cleanup confirmation only accepts an exact unique run prefix', () => {
  const prefix = 'lt_20260817_ab12cd34_';
  assert.equal(requireCleanupConfirmation({ prefix, confirmation: prefix }), prefix);
  assert.throws(() => requireCleanupConfirmation({ prefix: 'test_', confirmation: 'test_' }), /unique run prefix/);
  assert.throws(() => requireCleanupConfirmation({ prefix, confirmation: 'lt_other_12345678_' }), /confirm-cleanup/);
});

test('redaction removes credentials from text, URLs, and objects', () => {
  const token = `rnd_${'a'.repeat(20)}`;
  assert.equal(redactText(`Authorization: Bearer ${token}`).includes(token), false);
  assert.equal(redactUrl(`https://user:pass@example.com/path?token=${token}`).includes('pass'), false);
  assert.equal(redactUrl(`https://user:pass@example.com/path?token=${token}`).includes(token), false);
  assert.deepEqual(redactObject({ password: 'open', nested: { token } }), {
    password: '[REDACTED]',
    nested: { token: '[REDACTED]' },
  });
});
