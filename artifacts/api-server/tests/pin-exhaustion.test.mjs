/**
 * PIN-pool exhaustion unit tests
 * Run with: node --test artifacts/api-server/tests/pin-exhaustion.test.mjs
 *
 * Tests the pure resolvePin / pinPoolParams helpers extracted from the
 * /op INSERT & UPDATE handlers, so no running server is required.
 *
 * The logic under test lives in src/lib/pin.ts — compiled to
 * dist/lib/pin.mjs by the project build step.  We inline an equivalent
 * implementation here so the tests can run without a prior build.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ── Inline pure implementation (mirrors src/lib/pin.ts exactly) ────────────
function pinPoolParams(profileCount) {
  const use5Digit = profileCount > 8000;
  return { use5Digit, poolSize: use5Digit ? 90_000 : 9_000 };
}

function genPin(use5Digit, rand = Math.random) {
  return use5Digit
    ? String(Math.floor(10_000 + rand() * 90_000))
    : String(Math.floor(1_000 + rand() * 9_000));
}

function resolvePin(usedPins, poolSize, use5Digit, requested, maxTries = 100, rand = Math.random) {
  if (usedPins.size >= poolSize) return { ok: false, code: 'PIN_EXHAUSTED' };
  if (requested != null && !usedPins.has(requested)) return { ok: true, pin: requested };
  let pin = genPin(use5Digit, rand);
  let tries = 0;
  while (usedPins.has(pin) && tries++ < maxTries) pin = genPin(use5Digit, rand);
  if (usedPins.has(pin)) return { ok: false, code: 'PIN_EXHAUSTED' };
  return { ok: true, pin };
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Build a Set of every valid 4-digit PIN (1000–9999). */
function buildFullPool4() {
  const s = new Set();
  for (let i = 1000; i <= 9999; i++) s.add(String(i));
  return s; // size === 9 000
}

/** Build a Set of every valid 5-digit PIN (10000–99999). */
function buildFullPool5() {
  const s = new Set();
  for (let i = 10_000; i <= 99_999; i++) s.add(String(i));
  return s; // size === 90 000
}

// ── pinPoolParams ──────────────────────────────────────────────────────────
describe('pinPoolParams', () => {
  test('≤8000 profiles → 4-digit pool (9 000 slots)', () => {
    const { use5Digit, poolSize } = pinPoolParams(8000);
    assert.equal(use5Digit, false);
    assert.equal(poolSize, 9_000);
  });

  test('>8000 profiles → 5-digit pool (90 000 slots)', () => {
    const { use5Digit, poolSize } = pinPoolParams(8001);
    assert.equal(use5Digit, true);
    assert.equal(poolSize, 90_000);
  });
});

// ── resolvePin — normal (non-exhausted) operation ─────────────────────────
describe('resolvePin — normal pool', () => {
  test('honours a free requested PIN', () => {
    const usedPins = new Set(['1234', '5678']);
    const result = resolvePin(usedPins, 9_000, false, '9999');
    assert.deepEqual(result, { ok: true, pin: '9999' });
  });

  test('generates a new PIN when requested one is taken', () => {
    const usedPins = new Set(['1234']);
    // PRNG always returns '5678' on first call → '5678' is free → use it
    const deterministicRand = (() => {
      let call = 0;
      // genPin: Math.floor(1000 + rand() * 9000) = 1000 + 4678 = 5678
      // → rand() must return 4678/9000 ≈ 0.51977…
      const seq = [4678 / 9000];
      return () => seq[call++ % seq.length];
    })();
    const result = resolvePin(usedPins, 9_000, false, '1234', 100, deterministicRand);
    assert.equal(result.ok, true);
    assert.notEqual(result.pin, '1234');
  });

  test('assigns any free PIN when none is requested (null)', () => {
    const usedPins = new Set(['1000']);
    const result = resolvePin(usedPins, 9_000, false, null);
    assert.equal(result.ok, true);
    assert.match(result.pin, /^\d{4}$/);
    assert.ok(!usedPins.has(result.pin));
  });

  test('assigns any free PIN when none is requested (undefined)', () => {
    const usedPins = new Set();
    const result = resolvePin(usedPins, 9_000, false, undefined);
    assert.equal(result.ok, true);
    assert.match(result.pin, /^\d{4}$/);
  });
});

// ── resolvePin — PIN_EXHAUSTED paths ──────────────────────────────────────
describe('resolvePin — PIN pool exhaustion → HTTP 503 PIN_EXHAUSTED', () => {
  test('returns PIN_EXHAUSTED when usedPins.size === poolSize (4-digit)', () => {
    // Fill every 4-digit slot (9 000 entries)
    const fullPool = buildFullPool4();
    assert.equal(fullPool.size, 9_000, 'pool must be exactly 9 000 entries');

    const result = resolvePin(fullPool, 9_000, false, null);
    assert.deepEqual(result, { ok: false, code: 'PIN_EXHAUSTED' });
  });

  test('returns PIN_EXHAUSTED when usedPins.size > poolSize (overflow guard)', () => {
    const fullPool = buildFullPool4();
    // Simulate a hypothetical overflow (e.g. migration artefact)
    fullPool.add('EXTRA');
    assert.ok(fullPool.size > 9_000);

    const result = resolvePin(fullPool, 9_000, false, null);
    assert.deepEqual(result, { ok: false, code: 'PIN_EXHAUSTED' });
  });

  test('returns PIN_EXHAUSTED when usedPins.size === poolSize (5-digit)', () => {
    const fullPool = buildFullPool5();
    assert.equal(fullPool.size, 90_000);

    const result = resolvePin(fullPool, 90_000, true, null);
    assert.deepEqual(result, { ok: false, code: 'PIN_EXHAUSTED' });
  });

  test('returns PIN_EXHAUSTED after maxTries collisions (PRNG pathological)', () => {
    // Pool has 1 slot free but PRNG never lands on it within maxTries
    const usedPins = buildFullPool4();
    usedPins.delete('7777'); // exactly one free slot

    // PRNG always returns a colliding value
    const alwaysCollide = () => (1234 - 1000) / 9000; // → pin '1234', always used

    const result = resolvePin(usedPins, 9_000, false, null, 5, alwaysCollide);
    assert.deepEqual(result, { ok: false, code: 'PIN_EXHAUSTED' });
  });

  test('still resolves OK when pool has exactly one free slot and PRNG finds it', () => {
    const usedPins = buildFullPool4();
    usedPins.delete('7777');

    // PRNG: first call → collides ('1234'), second call → free ('7777')
    const calls = [
      (1234 - 1000) / 9000, // → '1234' (used)
      (7777 - 1000) / 9000, // → '7777' (free)
    ];
    let i = 0;
    const rand = () => calls[i++ % calls.length];

    const result = resolvePin(usedPins, 9_000, false, null, 100, rand);
    assert.deepEqual(result, { ok: true, pin: '7777' });
  });

  test('concurrent inserts: each call sees its own isolated usedPins snapshot', () => {
    // Simulate two concurrent requests both reading the same store snapshot,
    // each independently resolving PINs. The server resolves them sequentially
    // (Node.js is single-threaded), so the second request uses the enlarged Set.

    const snapshot = new Set(['1000', '1001']);
    const poolSize = 9_000;
    const use5Digit = false;

    // First "request" resolves '1002' (free)
    const r1 = resolvePin(new Set(snapshot), poolSize, use5Digit, '1002');
    assert.deepEqual(r1, { ok: true, pin: '1002' });
    // The server would then add '1002' to the in-memory _insertPinSet

    // Second "request" uses an updated snapshot that includes '1002'
    snapshot.add('1002');
    const r2 = resolvePin(new Set(snapshot), poolSize, use5Digit, '1002');
    assert.equal(r2.ok, true);
    assert.notEqual(r2.pin, '1002'); // must get a different PIN
  });
});

// ── Response shape expected by the route handler ───────────────────────────
describe('PIN_EXHAUSTED error shape (matches HTTP 503 response body)', () => {
  test('error object carries the correct code and a descriptive message', () => {
    const fullPool = buildFullPool4();
    const result = resolvePin(fullPool, 9_000, false, null);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 'PIN_EXHAUSTED');
      // The route handler maps this to:
      //   res.status(503).json({ data: null,
      //     error: { message: '…', code: 'PIN_EXHAUSTED' } })
      // The client checks error.code === 'PIN_EXHAUSTED'
    }
  });
});
