import { useCallback, useEffect, useState } from 'react';
import { adminApiJson } from './shared';
type Archive = { id: string; archiveId: string; archiveLabel: string; participantCount: number; heartCounts: Record<string, number>; directMessageCount: number; groupMessageCount: number; signalCount: number; contactExchangeCount: number };
export function AnonymousEventHistoryTab() {
  const [rows, setRows] = useState<Archive[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setRows(await adminApiJson<Archive[]>('/event-anonymous-archives') ?? []); }
    catch (e) { setError(e instanceof Error ? e.message : '익명 행사 이력 조회 실패'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <section className="space-y-3 p-4" aria-label="익명 행사 이력">
    <div className="flex items-center justify-between gap-3">
      <h3 className="font-bold">익명 행사 이력</h3>
      <button type="button" onClick={() => void load()} disabled={loading} className="rounded-xl border px-3 py-2 text-sm">{loading ? '조회 중' : '새로고침'}</button>
    </div>
    <p className="text-xs text-gray-500">행사별 합계만 저장합니다. 참가자 이름, 연락처, 메시지 원문은 보관하지 않습니다.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {rows.length === 0 && !loading && !error && <p className="text-sm">저장된 익명 행사 기록이 없습니다.</p>}
    <div className="space-y-2">{rows.map(row => <article key={row.archiveId ?? row.id} className="rounded-xl border p-3 text-sm">
      <h4 className="font-semibold break-all">{row.archiveLabel}</h4>
      <p>참가자 {row.participantCount}명 · 하트 {Object.values(row.heartCounts ?? {}).reduce((a,b)=>a+b,0)}건</p>
      <p>1:1 메시지 {row.directMessageCount}건 · 단체 메시지 {row.groupMessageCount}건</p>
      <p>시그널 {row.signalCount}건 · 연락처 교환 {row.contactExchangeCount}건</p>
    </article>)}</div>
  </section>;
}
