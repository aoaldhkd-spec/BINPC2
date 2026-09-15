/**
 * Process-local id merge redirect map — extracted from routes/db.ts.
 * Chat/group duplicate collapse remembers old → canonical for SELECT redirect.
 */

export type MergedIdMap = {
  remember: (fromId: string, toId: string) => void;
  resolve: (id: string, maxHops?: number) => string;
  size: () => number;
  clear: () => void;
};

export function createMergedIdMap(maxSize = 2000): MergedIdMap {
  const map = new Map<string, string>();

  function remember(fromId: string, toId: string): void {
    if (!fromId || fromId === toId) return;
    map.set(fromId, toId);
    if (map.size > maxSize) {
      const first = map.keys().next().value;
      if (first) map.delete(first);
    }
  }

  function resolve(id: string, maxHops = 8): string {
    let cur = id;
    for (let i = 0; i < maxHops; i++) {
      const next = map.get(cur);
      if (!next || next === cur) break;
      cur = next;
    }
    return cur;
  }

  function size(): number {
    return map.size;
  }

  function clear(): void {
    map.clear();
  }

  return { remember, resolve, size, clear };
}

/**
 * Follow in-memory redirects, then row.merged_into (DB-backed), remembering hops.
 * findMergedInto returns next id or ''/null when none.
 */
export function resolveMergedIdViaRows(
  id: string,
  mapResolve: (id: string) => string,
  remember: (fromId: string, toId: string) => void,
  findMergedInto: (cur: string) => string,
  maxHops = 8,
): string {
  let cur = mapResolve(id);
  for (let i = 0; i < maxHops; i++) {
    const into = findMergedInto(cur);
    if (into && into !== cur) {
      remember(cur, into);
      cur = mapResolve(into);
      continue;
    }
    break;
  }
  return cur;
}

