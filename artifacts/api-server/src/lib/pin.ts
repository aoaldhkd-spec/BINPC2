/**
 * Pure PIN-pool helpers — zero side-effects, fully unit-testable.
 *
 * The 4-digit pool covers PINs 1000–9999 (9 000 slots).
 * When the profile count exceeds 8 000, the server switches to
 * 5-digit PINs 10000–99999 (90 000 slots).
 */

export type PinResult =
  | { ok: true; pin: string }
  | { ok: false; code: 'PIN_EXHAUSTED' };

/**
 * Derive whether 5-digit mode is active and the pool size from the
 * number of already-registered profiles.
 */
export function pinPoolParams(profileCount: number): { use5Digit: boolean; poolSize: number } {
  const use5Digit = profileCount > 8000;
  return { use5Digit, poolSize: use5Digit ? 90_000 : 9_000 };
}

/**
 * Generate a random PIN (4- or 5-digit) using a caller-supplied PRNG so that
 * tests can control randomness deterministically.
 */
export function genPin(use5Digit: boolean, rand: () => number = Math.random): string {
  return use5Digit
    ? String(Math.floor(10_000 + rand() * 90_000))
    : String(Math.floor(1_000 + rand() * 9_000));
}

/**
 * Resolve the PIN to assign to a new profile.
 *
 * Returns `{ ok: true, pin }` if a free slot is found, or
 * `{ ok: false, code: 'PIN_EXHAUSTED' }` when no slot is available.
 *
 * @param usedPins   Set of all PINs already assigned to existing profiles.
 * @param poolSize   Total number of valid PIN values in the pool.
 * @param use5Digit  Whether to generate 5-digit PINs.
 * @param requested  The PIN the client requested (may be null/undefined).
 * @param maxTries   Maximum random-generation attempts before giving up (default 100).
 * @param rand       PRNG — injectable for deterministic tests.
 */
export function resolvePin(
  usedPins: Set<string>,
  poolSize: number,
  use5Digit: boolean,
  requested: string | null | undefined,
  maxTries = 100,
  rand: () => number = Math.random,
): PinResult {
  // Fast path: pool is fully exhausted
  if (usedPins.size >= poolSize) {
    return { ok: false, code: 'PIN_EXHAUSTED' };
  }

  // Requested PIN is free — honour it
  if (requested != null && !usedPins.has(requested)) {
    return { ok: true, pin: requested };
  }

  // Requested PIN is taken (or not provided) — find a free one
  let pin = genPin(use5Digit, rand);
  let tries = 0;
  while (usedPins.has(pin) && tries++ < maxTries) {
    pin = genPin(use5Digit, rand);
  }

  // If still colliding after maxTries the pool is effectively exhausted
  if (usedPins.has(pin)) {
    return { ok: false, code: 'PIN_EXHAUSTED' };
  }

  return { ok: true, pin };
}
