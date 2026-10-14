import test from 'node:test';
import assert from 'node:assert/strict';
import { checkHealthTargets, pingEndpoint } from './keep-api-warm.mjs';

function capture() {
  const logs = { ok: [], retry: [], error: [] };
  return {
    logs,
    logger: {
      log: (...args) => logs.ok.push(args.join(' ')),
      warn: (...args) => logs.retry.push(args.join(' ')),
      error: (...args) => logs.error.push(args.join(' ')),
    },
  };
}
const accepted = (status) => ({ ok: status >= 200 && status < 300, status });
const instant = async () => {};

test('all three health checks pass without unnecessary retries', async () => {
  const { logs, logger } = capture();
  const urls = ['/healthz', '/ready', '/site-health'];
  const requests = [];
  const result = await checkHealthTargets(urls, {
    fetcher: async (url, opts) => {
      requests.push(url);
      assert.equal(opts.cache, 'no-store');
      assert.ok(opts.signal instanceof AbortSignal);
      return accepted(200);
    },
    logger,
    wait: instant,
  });
  assert.equal(result, true);
  assert.deepEqual(requests, urls);
  assert.equal(logs.ok.length, 3);
  assert.equal(logs.retry.length, 0);
  assert.equal(logs.error.length, 0);
});

test('a temporary 503 recovers and does not mark a successful run as failed', async () => {
  const { logs, logger } = capture();
  let calls = 0;
  assert.equal(await pingEndpoint('/ready', {
    fetcher: async () => accepted(++calls === 1 ? 503 : 200),
    wait: instant, logger,
  }), true);
  assert.equal(calls, 2);
  assert.equal(logs.retry.length, 1);
  assert.equal(logs.ok.length, 1);
  assert.equal(logs.error.length, 0);
});

test('persistent 503 still fails strictly after the bounded three requests', async () => {
  const { logs, logger } = capture();
  let calls = 0;
  assert.equal(await pingEndpoint('/healthz', {
    fetcher: async () => { calls++; return accepted(503); },
    wait: instant, logger,
  }), false);
  assert.equal(calls, 3);
  assert.equal(logs.retry.length, 2);
  assert.equal(logs.error.length, 1);
});

test('401 and 404 do not trigger retries or hide permission and routing failures', async () => {
  for (const code of [401, 404]) {
    const { logs, logger } = capture();
    let calls = 0;
    assert.equal(await pingEndpoint('/healthz', {
      fetcher: async () => { calls++; return accepted(code); },
      wait: instant, logger,
    }), false);
    assert.equal(calls, 1);
    assert.equal(logs.retry.length, 0);
    assert.equal(logs.error.length, 1);
  }
});

test('temporary network failures recover; persistent errors remain failures', async () => {
  const { logger } = capture();
  let calls = 0;
  assert.equal(await pingEndpoint('/healthz', {
    fetcher: async () => {
      if (++calls < 3) throw new TypeError('fetch failed');
      return accepted(200);
    },
    wait: instant, logger,
  }), true);
  assert.equal(calls, 3);

  calls = 0;
  assert.equal(await pingEndpoint('/ready', {
    fetcher: async () => { calls++; throw new TypeError('offline'); },
    wait: instant, logger,
  }), false);
  assert.equal(calls, 3);
});

test('timeout aborts a stalled request and the job still fails after its retry cap', async () => {
  const { logger } = capture();
  let calls = 0;
  const result = await pingEndpoint('/stalled', {
    fetcher: async (_url, { signal }) => new Promise((_resolve, reject) => {
      calls++;
      // AbortSignal.timeout uses an unref'ed timer in Node. A real network
      // socket keeps the event loop alive; this offline fixture needs an
      // explicit referenced timer so the abort event can actually fire.
      const watchdog = setTimeout(() => reject(new Error('mock fetch never aborted')), 300);
      const onAbort = () => {
        clearTimeout(watchdog);
        reject(signal.reason);
      };
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
    }),
    timeoutMs: 12,
    retryDelaysMs: [0],
    wait: instant,
    logger,
  });
  assert.equal(result, false);
  assert.equal(calls, 2);
});

test('one failed endpoint does not prevent the others from being checked', async () => {
  const { logger } = capture();
  const called = [];
  const result = await checkHealthTargets(['/bad', '/good'], {
    fetcher: async (url) => {
      called.push(url);
      return accepted(url === '/bad' ? 404 : 200);
    },
    wait: instant,
    logger,
  });
  assert.equal(result, false);
  assert.deepEqual(called, ['/bad', '/good']);
});

test('empty target list must fail instead of reporting a fake green workflow', async () => {
  const { logger, logs } = capture();
  assert.equal(await checkHealthTargets([], { logger }), false);
  assert.equal(logs.error.length, 1);
});
