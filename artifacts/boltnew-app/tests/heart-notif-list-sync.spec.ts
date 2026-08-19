import { describe, expect, test } from '@playwright/test';

const LOCAL_ONLY = !process.env.PLAYWRIGHT_LOCAL && !!process.env.CI;

/**
 * P5 — heart notification vs received-list merge (browser sanity).
 *
 * Exercises the same merge algorithm useHearts relies on inside a real browser
 * context. Full 2-user toast+tab E2E needs auth fixtures — covered by vitest
 * (useHearts-stale-merge.test.ts) and fetch E2E (test-realtime-two-user.mjs).
 *
 * Local-only. Not wired to CI verify.yml.
 */

test.describe('heart notif vs list merge (local)', () => {
  test.skip(LOCAL_ONLY, 'local-only — run via test:playwright-local');
  test('mergeRowsAfterSnapshot keeps SSE row over stale empty fetch', async ({ page }) => {
    await page.goto('about:blank');

    const merged = await page.evaluate(() => {
      type Row = { id: string; liker_id: string; heart_type: string };

      function mergeMapAfterSnapshot<K, V>(
        authoritative: Map<K, V>,
        atRequestStart: Map<K, V>,
        current: Map<K, V>,
      ): Map<K, V> {
        const next = new Map(authoritative);
        const keys = new Set([...atRequestStart.keys(), ...current.keys()]);
        for (const key of keys) {
          const hadAtStart = atRequestStart.has(key);
          const hasNow = current.has(key);
          if (hadAtStart !== hasNow) {
            if (hasNow) next.set(key, current.get(key)!);
            else next.delete(key);
            continue;
          }
          if (hasNow && !Object.is(atRequestStart.get(key), current.get(key))) {
            next.set(key, current.get(key)!);
          }
        }
        return next;
      }

      function mergeRowsAfterSnapshot<T, K>(
        authoritative: readonly T[],
        atRequestStart: readonly T[],
        current: readonly T[],
        keyOf: (row: T) => K,
      ): T[] {
        const toMap = (rows: readonly T[]) => new Map(rows.map(row => [keyOf(row), row]));
        return [...mergeMapAfterSnapshot(toMap(authoritative), toMap(atRequestStart), toMap(current)).values()];
      }

      type LikeRow = { id: string; liker_id: string; heart_type: string };
      const atStart: LikeRow[] = [];
      const current: LikeRow[] = [{ id: 'like-live', liker_id: 'a', heart_type: 'red' }];
      const fetched: LikeRow[] = [];

      return mergeRowsAfterSnapshot(fetched, atStart, current, r => r.id);
    });

    expect(merged).toEqual([{ id: 'like-live', liker_id: 'a', heart_type: 'red' }]);
  });
});
