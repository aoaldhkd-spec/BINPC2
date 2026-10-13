import { useCallback, useEffect, useState } from 'react';
import { adminApiJson } from './shared';
type Archive = { id: string; eventKey: string; archiveId: string; archiveLabel: string; participantCount: number; heartCounts: Record<string, number>; directMessageCount: number; groupMessageCount: number; signalCount: number; contactExchangeCount: number;
  rainbowByColor?: Record<string, number>; uniqueHeartSenderCount?: number; uniqueHeartRecipientCount?: number;
  directChatRoomCount?: number; groupRoomCount?: number; groupParticipantCount?: number;
  adminActions?: Record<string, number>; dbPersistErrorCount?: number | null;
  startedAt?: string | null; archivedAt?: string;
};
export function AnonymousEventHistoryTab() {
  const [rows, setRows] = useState<Archive[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setRows(await adminApiJson<Archive[]>('/event-anonymous-archives') ?? []); }
    catch (e) { setError(e instanceof Error ? e.message : '익명 행사 이력 조회 실패'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const query = search.trim().toLowerCase();
  const visibleRows = query
    ? rows.filter(row => `${row.eventKey ?? ''} ${row.archiveLabel ?? ''}`.toLowerCase().includes(query))
    : rows;
  return <section className="space-y-3 p-4" aria-label="익명 행사 이력">
    <div className="flex items-center justify-between gap-3">
      <h3 className="font-bold">익명 행사 이력</h3>
      <button type="button" onClick={() => void load()} disabled={loading} className="rounded-xl border px-3 py-2 text-sm">{loading ? '조회 중' : '새로고침'}</button>
    </div>
    <p className="text-xs text-gray-500">행사별 합계만 저장합니다. 참가자 이름, 연락처, 메시지 원문은 보관하지 않습니다.</p>
    <input aria-label="행사 날짜 검색" type="search" value={search} onChange={e => setSearch(e.target.value)}
      placeholder="날짜 검색 (예: 2026-10-13)" className="w-full rounded-xl border px-3 py-2 text-sm" />
    {rows.length > 0 && visibleRows.length === 0 && !loading && !error &&
      <p className="text-sm" role="status">일치하는 행사 기록이 없습니다.</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {rows.length === 0 && !loading && !error && <p className="text-sm">저장된 익명 행사 기록이 없습니다.</p>}
    <div className="space-y-2">{visibleRows.map(row => <article key={row.archiveId ?? row.id} className="rounded-xl border p-3 text-sm">
      <h4 className="font-semibold break-all">{row.archiveLabel}</h4>
      <p>참가자 {row.participantCount}명 · 하트 {Object.values(row.heartCounts ?? {}).reduce((a,b)=>a+b,0)}건</p>
      <p>1:1 메시지 {row.directMessageCount}건 · 단체 메시지 {row.groupMessageCount}건</p>
      <p>시그널 {row.signalCount}건 · 연락처 교환 {row.contactExchangeCount}건</p>
      {row.rainbowByColor && <p>무지개 하트 · ❤️ {row.rainbowByColor.red ?? 0} · 💙 {row.rainbowByColor.blue ?? 0} · 💗 {row.rainbowByColor.pink ?? 0} · 💚 {row.rainbowByColor.green ?? 0}</p>}
      {row.uniqueHeartSenderCount !== undefined && <p>하트 발신 계정 {row.uniqueHeartSenderCount}개 · 수신 계정 {row.uniqueHeartRecipientCount ?? 0}명</p>}
      {row.directChatRoomCount !== undefined && <p>1:1 대화방 {row.directChatRoomCount}개 · 단체방 {row.groupRoomCount ?? 0}개 · 단체방 참여기록 {row.groupParticipantCount ?? 0}건</p>}
      {row.adminActions && <p>관리자 작업 · 시작 {row.adminActions.start ?? 0} · 종료 {row.adminActions.end ?? 0} · 자동마감 {row.adminActions.autoEnd ?? 0} · 설정 {row.adminActions.settings ?? 0} · 잠금 {row.adminActions.lock ?? 0} · 초기화 {row.adminActions.reset ?? 0}</p>}
      {row.dbPersistErrorCount !== undefined && <p>행사 중 DB 저장 오류 · {row.dbPersistErrorCount === null ? '미확인' : `${row.dbPersistErrorCount}건`}</p>}
    </article>)}</div>
  </section>;
}
