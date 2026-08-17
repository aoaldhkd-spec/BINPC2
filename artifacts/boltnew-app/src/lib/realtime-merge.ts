/**
 * Merge an authoritative fetch result without undoing state changes that
 * happened after that fetch started.
 */
export function mergeSetAfterSnapshot<T>(
  authoritative: ReadonlySet<T>,
  atRequestStart: ReadonlySet<T>,
  current: ReadonlySet<T>,
): Set<T> {
  const next = new Set(authoritative);
  const keys = new Set<T>([...atRequestStart, ...current]);
  for (const key of keys) {
    const hadAtStart = atRequestStart.has(key);
    const hasNow = current.has(key);
    if (hadAtStart === hasNow) continue;
    if (hasNow) next.add(key);
    else next.delete(key);
  }
  return next;
}

export function mergeMapAfterSnapshot<K, V>(
  authoritative: ReadonlyMap<K, V>,
  atRequestStart: ReadonlyMap<K, V>,
  current: ReadonlyMap<K, V>,
): Map<K, V> {
  const next = new Map(authoritative);
  const keys = new Set<K>([...atRequestStart.keys(), ...current.keys()]);
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

export function mergeRowsAfterSnapshot<T, K>(
  authoritative: readonly T[],
  atRequestStart: readonly T[],
  current: readonly T[],
  keyOf: (row: T) => K,
): T[] {
  const toMap = (rows: readonly T[]) => new Map(rows.map(row => [keyOf(row), row]));
  return [...mergeMapAfterSnapshot(
    toMap(authoritative),
    toMap(atRequestStart),
    toMap(current),
  ).values()];
}
