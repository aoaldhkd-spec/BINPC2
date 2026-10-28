import { EVENT_TEST_MODE_BANNER, type EventTestModeState } from '@workspace/api-zod';

/** Explicit opt-out for legacy suites backed entirely by a mocked pg driver. */
export function createLegacyModeOffQuery(storage: 'in-memory-pg-mock') {
  if (process.env.NODE_ENV !== 'test' || storage !== 'in-memory-pg-mock') {
    throw new Error('Legacy mode opt-out requires an isolated in-memory pg test fixture');
  }
  // This fixture has no laboratory snapshots. Model the state after reset + OFF.
  const mode: EventTestModeState = {
    enabled: false,
    banner: EVENT_TEST_MODE_BANNER,
    generation: 1,
    revision: 2,
    dirty: false,
    resetGeneration: 1,
    resetAt: '2026-10-28T00:00:00.000Z',
    changedAt: '2026-10-28T00:00:00.000Z',
  };
  return (sql: string, values: unknown[] = []) => {
    if (sql.replace(/\s+/g, ' ').trim() === 'SELECT data FROM event_hub_records WHERE kind=$1 AND id=$2'
      && values.length === 2 && values[0] === 'laboratory-mode' && values[1] === 'global') {
      return { rows: [{ data: structuredClone(mode) }] };
    }
    return undefined;
  };
}
