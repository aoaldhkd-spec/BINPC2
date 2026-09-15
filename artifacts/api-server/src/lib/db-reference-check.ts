/**
 * Write-path reference check helpers — extracted from routes/db.ts.
 * Korean error copy stays here; PG refresh / getTable stay in db.ts (thin wrappers).
 */
import type { Response } from 'express';
import type { WriteReference } from './db-integrity.js';

export type ReferenceCheck = { ok: true } | { ok: false; unavailable: boolean };

export function sendReferenceFailure(
  res: Response,
  check: Exclude<ReferenceCheck, { ok: true }>,
) {
  if (check.unavailable) {
    return res.status(503).json({
      data: null,
      error: {
        message: '관계 데이터 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.',
        code: 'REFERENCE_REFRESH_FAILED',
      },
    });
  }
  return res.status(400).json({
    data: null,
    error: { message: '참조 대상이 존재하지 않습니다.', code: 'INVALID_REFERENCE' },
  });
}

/** Merge PG SELECT `data` rows into an in-memory table by id. */
export function mergeRefreshedRows(
  target: Record<string, unknown>[],
  rows: Array<{ data?: unknown }>,
): void {
  for (const result of rows) {
    const row = result.data as Record<string, unknown> | null | undefined;
    const id = String(row?.id ?? '');
    if (!row || !id) continue;
    const idx = target.findIndex(existing => String(existing.id) === id);
    if (idx >= 0) target[idx] = row;
    else target.push(row);
  }
}

/** Refs whose id is empty or absent via hasRow — grouped by table for refresh. */
export function missingWriteRefsByTable(
  refs: WriteReference[],
  hasRow: (table: string, id: string) => boolean,
): Map<string, string[]> {
  const missingByTable = new Map<string, string[]>();
  for (const ref of refs) {
    if (ref.id && hasRow(ref.table, ref.id)) continue;
    const ids = missingByTable.get(ref.table) ?? [];
    ids.push(ref.id);
    missingByTable.set(ref.table, ids);
  }
  return missingByTable;
}

/** After refresh attempts: ok only when every ref id exists in store. */
export function evaluateWriteReferences(
  refs: WriteReference[],
  hasRow: (table: string, id: string) => boolean,
): ReferenceCheck {
  for (const ref of refs) {
    if (!ref.id || !hasRow(ref.table, ref.id)) {
      return { ok: false, unavailable: false };
    }
  }
  return { ok: true };
}
