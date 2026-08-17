/**
 * In-memory KV merge — LIMIT 스냅샷이 오래된 행을 지우지 않게 merge-by-id.
 * wholesale replace 는 행사 중 likes/chats 가 LIMIT 를 넘으면 메모리에서 증발한다.
 */

export function mergeDbRowsIntoMemory(
  memRows: Record<string, unknown>[],
  dbRows: Record<string, unknown>[],
): void {
  const byId = new Map(memRows.map(r => [String(r['id']), r]));
  for (const data of dbRows) {
    const id = String(data['id'] ?? '');
    if (!id) continue;
    const existing = byId.get(id);
    const dbTs = String(data.updated_at ?? data.created_at ?? '');
    const memTs = existing ? String(existing.updated_at ?? existing.created_at ?? '') : '';
    if (!existing) {
      memRows.push(data);
      byId.set(id, data);
    } else if (dbTs >= memTs) {
      const idx = memRows.findIndex(r => String(r['id']) === id);
      if (idx >= 0) memRows[idx] = data;
      byId.set(id, data);
    }
  }
}

/** 주기 타이머는 클라이언트 전체 리로드를 쏘지 않는다. 관리자/테스트 강제만 알린다. */
export function shouldBroadcastBulkResync(reason: 'periodic' | 'forced'): boolean {
  return reason === 'forced';
}
