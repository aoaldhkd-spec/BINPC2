import { useEffect, useState } from 'react';
import { getNetEpisodeCorr } from '../lib/net-health';
import { getDiagSummary } from '../lib/diag';

// ─── ReconnectOverlay ─────────────────────────────────────────────────────────
// 서버 연결이 끊겼을 때 표시하는 오버레이
// - reconnecting: 가벼운 배너 (전체 차단 최소화)
// - error: 실제 사용 불가가 지속될 때만 강한 모달

function ReconnectOverlay({
  status,
  onRetry,
}: {
  status: 'reconnecting' | 'error';
  onRetry: () => void;
}) {
  const [dots, setDots] = useState('.');
  const corr = getNetEpisodeCorr();
  const summary = getDiagSummary();

  useEffect(() => {
    if (status !== 'reconnecting') return;
    const id = setInterval(() => {
      setDots((d) => (d.length >= 3 ? '.' : `${d}.`));
    }, 500);
    return () => clearInterval(id);
  }, [status]);

  if (status === 'reconnecting') {
    return (
      <div className="fixed top-0 left-0 right-0 z-[200] flex justify-center pointer-events-none px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="pointer-events-none bg-amber-50/95 border border-amber-200 text-amber-950 shadow-md rounded-2xl px-4 py-2.5 max-w-md w-full flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold leading-tight">연결 복구 중{dots}</p>
            <p className="text-xs text-amber-800/80 leading-snug">잠시만 기다려 주세요. 자동으로 이어집니다.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-6">
      <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-sm w-full text-center">
        <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-red-50 flex items-center justify-center">
          <span className="text-2xl" aria-hidden>!</span>
        </div>
        <h3 className="font-black text-gray-900 text-lg">연결 실패</h3>
        <p className="text-sm text-gray-600 mt-2 leading-relaxed">
          서버 연결에 실패했습니다.<br />
          네트워크를 확인한 뒤 다시 시도해 주세요.
        </p>
        {corr && (
          <p className="mt-3 text-[10px] text-gray-400 break-all select-all">
            추적 ID: {corr}
            {summary.lastError?.id ? ` · ${summary.lastError.id}` : ''}
          </p>
        )}
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 w-full py-3 rounded-2xl bg-gray-900 text-white font-bold text-sm active:scale-[0.98] transition"
        >
          다시 시도
        </button>
      </div>
    </div>
  );
}

export default ReconnectOverlay;
