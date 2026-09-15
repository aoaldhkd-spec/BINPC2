import { useCallback, useEffect, useState } from 'react';
import { Clipboard, FileJson, FileText, RefreshCw, Save } from 'lucide-react';
import { adminApiDownload, adminApiJson, type SalesReport } from './shared';

function number(value: number): string {
  return value.toLocaleString('ko-KR');
}

function reportSummary(report: SalesReport): string {
  const m = report.metrics;
  return `[BINPC2 판매 성과] 참여자 ${number(m.participants)}명 · 하트 ${number(m.hearts)}개 · 채팅 ${number(m.chatMessages)}건 · 단체방 ${number(m.groupMessages)}건 · 실시간 연결 ${number(m.realtime.adminSseConnections)}개 · MBTI ${number(Object.values(m.mbtiDistribution).reduce((a, b) => a + b, 0))}명 · 궁합 ${number(m.compatibilityProfiles)}명 · 운세 ${number(m.fortuneProfiles)}명`;
}

function reportDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ko-KR');
}

export function SalesReportsTab() {
  const [reports, setReports] = useState<SalesReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminApiJson<SalesReport[]>('/sales-reports');
      setReports(data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '성과 리포트 조회에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadReports(); }, [loadReports]);

  const createSnapshot = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const report = await adminApiJson<SalesReport>('/sales-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      setReports(prev => [report, ...prev.filter(item => item.id !== report.id)]);
      setNotice('성과 스냅샷을 저장했습니다. 전체 초기화 후에도 유지됩니다.');
    } catch (e) {
      setError(e instanceof Error ? e.message : '성과 스냅샷 저장에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const download = async (report: SalesReport, format: 'md' | 'json') => {
    try {
      const blob = await adminApiDownload(`/sales-reports/${encodeURIComponent(report.id)}/download?format=${format}`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `binpc2-sales-report-${report.id}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : '다운로드에 실패했습니다.');
    }
  };

  const copySummary = async (report: SalesReport) => {
    try {
      await navigator.clipboard.writeText(reportSummary(report));
      setNotice('짧은 성과 요약을 클립보드에 복사했습니다.');
    } catch {
      setError('클립보드 복사에 실패했습니다. 브라우저 권한을 확인해 주세요.');
    }
  };

  return (
    <div className="p-4 min-[390px]:p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-gray-900">성과 리포트</h2>
          <p className="text-xs text-gray-500 mt-1">관리자 전체 초기화 후에도 남는 집계 스냅샷입니다.</p>
        </div>
        <button
          onClick={() => void createSnapshot()}
          disabled={busy}
          className="touch-target inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-2 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {busy ? '저장 중…' : '성과 스냅샷 저장'}
        </button>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900">
        판매용 기록에서는 탑·비선호·텀·올만 제외. MBTI·궁합·운세는 유지. 그 외(하트·채팅·단체방·실시간 등)도 유지.
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}
      {notice && <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs text-teal-800">{notice}</div>}

      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold tracking-wide text-gray-500">저장된 스냅샷 {reports.length}개</h3>
        <button onClick={() => void loadReports()} disabled={loading} className="touch-target inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-800">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> 새로고침
        </button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-xs text-gray-400">성과 리포트를 불러오는 중…</div>
      ) : reports.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-xs text-gray-500">아직 저장된 성과 스냅샷이 없습니다.</div>
      ) : (
        <div className="space-y-3">
          {reports.map(report => {
            const m = report.metrics;
            return (
              <article key={report.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-black text-gray-900">{reportDate(report.created_at)}</h4>
                    <p className="text-[10px] text-gray-400 mt-0.5">참여자 {number(m.participants)} · 하트 {number(m.hearts)} · 채팅 {number(m.chatMessages)} · 단체방 {number(m.groupMessages)}</p>
                  </div>
                  <span className="rounded-full bg-teal-50 px-2 py-1 text-[10px] font-bold text-teal-700">초기화 보존</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-gray-600 min-[390px]:grid-cols-4">
                  <div className="rounded-lg bg-gray-50 p-2">MBTI {number(Object.values(m.mbtiDistribution).reduce((a, b) => a + b, 0))}명</div>
                  <div className="rounded-lg bg-gray-50 p-2">궁합 {number(m.compatibilityProfiles)}명</div>
                  <div className="rounded-lg bg-gray-50 p-2">운세 {number(m.fortuneProfiles)}명</div>
                  <div className="rounded-lg bg-gray-50 p-2">실시간 {number(m.realtime.adminSseConnections)}개</div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => void download(report, 'md')} className="touch-target inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50"><FileText className="w-3.5 h-3.5" /> MD</button>
                  <button onClick={() => void download(report, 'json')} className="touch-target inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50"><FileJson className="w-3.5 h-3.5" /> JSON</button>
                  <button onClick={() => void copySummary(report)} className="touch-target inline-flex items-center gap-1 rounded-lg border border-teal-200 px-2.5 py-1.5 text-[11px] font-semibold text-teal-700 hover:bg-teal-50"><Clipboard className="w-3.5 h-3.5" /> 요약 복사</button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
