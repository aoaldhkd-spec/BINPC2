/**
 * /op SELECT order / limit / single shaping + broadcast XSS sanitize —
 * extracted from routes/db.ts. Pure; Express res / store stay in db.ts.
 */

export type OrderSpec = { col: string; asc: boolean };

/** In-place stable-enough sort matching prior db.ts comparator (nulls first when asc). */
export function sortRowsByOrders(
  rows: Record<string, unknown>[],
  orders: OrderSpec[],
): Record<string, unknown>[] {
  for (const { col, asc } of orders) {
    rows.sort((a, b) => {
      const av = a[col];
      const bv = b[col];
      if (av === bv) return 0;
      if (av == null) return asc ? -1 : 1;
      if (bv == null) return asc ? 1 : -1;
      return (av < bv ? -1 : 1) * (asc ? 1 : -1);
    });
  }
  return rows;
}

/**
 * Apply optional limit then single / maybeSingle shape.
 * Callers pass already Math.floor'd limit when that was the prior behavior.
 */
export function shapeSelectData(
  rows: Record<string, unknown>[],
  opts: { limit?: number; single?: boolean; maybeSingle?: boolean },
): unknown {
  const limited = opts.limit != null ? rows.slice(0, opts.limit) : rows;
  if (opts.single || opts.maybeSingle) return limited[0] ?? null;
  return limited;
}

/** Sort + shape in one step (mutates rows via sort). */
export function orderLimitShape(
  rows: Record<string, unknown>[],
  orders: OrderSpec[],
  opts: { limit?: number; single?: boolean; maybeSingle?: boolean },
): unknown {
  sortRowsByOrders(rows, orders);
  return shapeSelectData(rows, opts);
}

/**
 * XSS defense for /broadcast payload: strip HTML tags from strings,
 * recurse objects/arrays with depth cap (matches prior inline helper).
 */
export function sanitizeBroadcastValue(val: unknown, depth = 0): unknown {
  if (depth > 5) return val;
  if (typeof val === 'string') return val.replace(/<[^>]*>/g, '').slice(0, 5000);
  if (Array.isArray(val)) return val.map(v => sanitizeBroadcastValue(v, depth + 1));
  if (val !== null && typeof val === 'object') {
    return Object.fromEntries(
      Object.entries(val as Record<string, unknown>).map(([k, v]) => [
        k,
        sanitizeBroadcastValue(v, depth + 1),
      ]),
    );
  }
  return val;
}
