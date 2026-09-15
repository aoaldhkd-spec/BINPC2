/**
 * /op query filter helpers — extracted from routes/db.ts (behavior unchanged).
 */
export type FilterSpec =
  | { type: 'eq'; col: string; val: unknown }
  | { type: 'neq'; col: string; val: unknown }
  | { type: 'in'; col: string; vals: unknown[] }
  | { type: 'or'; expr: string }
  | { type: 'lt'; col: string; val: unknown }
  | { type: 'gt'; col: string; val: unknown };

export function compareFilterValues(rowVal: unknown, filterVal: unknown): number | null {
  if (rowVal == null || filterVal == null) return null;
  const aNum = typeof rowVal === 'number' ? rowVal : Number(rowVal);
  const bNum = typeof filterVal === 'number' ? filterVal : Number(filterVal);
  // Avoid treating ISO timestamps as numbers (Number('2026-...') === NaN — fine).
  if (Number.isFinite(aNum) && Number.isFinite(bNum) && String(rowVal).trim() !== '' && !String(rowVal).includes('-') && !String(rowVal).includes('T')) {
    return aNum < bNum ? -1 : aNum > bNum ? 1 : 0;
  }
  const as = String(rowVal);
  const bs = String(filterVal);
  return as < bs ? -1 : as > bs ? 1 : 0;
}

export function matchFilter(row: Record<string, unknown>, f: FilterSpec): boolean {
  if (f.type === 'eq') {
    return row[f.col] === f.val || String(row[f.col]) === String(f.val);
  }
  if (f.type === 'neq') {
    return row[f.col] !== f.val && String(row[f.col]) !== String(f.val);
  }
  if (f.type === 'in') {
    return f.vals.some(v => row[f.col] === v || String(row[f.col]) === String(v));
  }
  if (f.type === 'lt' || f.type === 'gt') {
    const cmp = compareFilterValues(row[f.col], f.val);
    if (cmp == null) return false;
    return f.type === 'lt' ? cmp < 0 : cmp > 0;
  }
  if (f.type === 'or') {
    const parts = f.expr.split(',').map(s => s.trim());
    return parts.some(part => {
      const m = part.match(/^(\w+)\.(\w+)\.(.+)$/);
      if (!m) return false;
      const [, col, op, val] = m;
      if (op === 'eq') return row[col] === val || String(row[col]) === val;
      if (op === 'neq') return row[col] !== val && String(row[col]) !== val;
      return false;
    });
  }
  return false;
}

export function applyFilters(
  rows: Record<string, unknown>[],
  filters: FilterSpec[],
): Record<string, unknown>[] {
  if (!filters.length) return rows;
  return rows.filter(r => filters.every(f => matchFilter(r, f)));
}
