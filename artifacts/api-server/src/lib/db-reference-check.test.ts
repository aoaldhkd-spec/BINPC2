import { describe, expect, it, vi } from 'vitest';
import type { WriteReference } from './db-integrity.js';
import {
  evaluateWriteReferences,
  mergeRefreshedRows,
  missingWriteRefsByTable,
  sendReferenceFailure,
} from './db-reference-check.js';

function mockRes() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { status, json, res: { status } as unknown as import('express').Response };
}

describe('db-reference-check', () => {
  it('sendReferenceFailure returns 503 Korean copy when unavailable', () => {
    const m = mockRes();
    sendReferenceFailure(m.res, { ok: false, unavailable: true });
    expect(m.status).toHaveBeenCalledWith(503);
    expect(m.json).toHaveBeenCalledWith({
      data: null,
      error: {
        message: '관계 데이터 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.',
        code: 'REFERENCE_REFRESH_FAILED',
      },
    });
  });

  it('sendReferenceFailure returns 400 Korean copy when reference missing', () => {
    const m = mockRes();
    sendReferenceFailure(m.res, { ok: false, unavailable: false });
    expect(m.status).toHaveBeenCalledWith(400);
    expect(m.json).toHaveBeenCalledWith({
      data: null,
      error: { message: '참조 대상이 존재하지 않습니다.', code: 'INVALID_REFERENCE' },
    });
  });

  it('mergeRefreshedRows upserts by id', () => {
    const target: Record<string, unknown>[] = [{ id: 'a', v: 1 }];
    mergeRefreshedRows(target, [
      { data: { id: 'a', v: 2 } },
      { data: { id: 'b', v: 3 } },
      { data: null },
      { data: { id: '', v: 9 } },
    ]);
    expect(target).toEqual([
      { id: 'a', v: 2 },
      { id: 'b', v: 3 },
    ]);
  });

  it('missingWriteRefsByTable groups absent ids and keeps empty id', () => {
    const refs: WriteReference[] = [
      { table: 'profiles', id: 'p1' },
      { table: 'profiles', id: 'p2' },
      { table: 'chats', id: 'c1' },
      { table: 'chats', id: '' },
    ];
    const present = new Set(['profiles:p1']);
    const missing = missingWriteRefsByTable(refs, (t, id) => present.has(`${t}:${id}`));
    expect([...missing.entries()]).toEqual([
      ['profiles', ['p2']],
      ['chats', ['c1', '']],
    ]);
  });

  it('evaluateWriteReferences ok only when all refs present', () => {
    const refs: WriteReference[] = [
      { table: 'profiles', id: 'p1' },
      { table: 'chats', id: 'c1' },
    ];
    expect(
      evaluateWriteReferences(refs, (t, id) => t === 'profiles' && id === 'p1'),
    ).toEqual({ ok: false, unavailable: false });
    expect(
      evaluateWriteReferences(refs, () => true),
    ).toEqual({ ok: true });
    expect(
      evaluateWriteReferences([{ table: 'profiles', id: '' }], () => true),
    ).toEqual({ ok: false, unavailable: false });
  });
});
