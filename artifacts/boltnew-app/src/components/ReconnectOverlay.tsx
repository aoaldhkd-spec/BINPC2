import { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

// ─── ReconnectOverlay ─────────────────────────────────────────────────────────
// 서버 연결이 끊겼을 때 표시하는 오버레이

function ReconnectOverlay({ status, onRetry }: { status: 'reconnecting' | 'error'; onRetry: () => void }) {
  const [dots, setDots] = useState('');
  useEffect(() => {
    if (status !== 'reconnecting') return;
    const t = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 500);
    return () => clearInterval(t);
  }, [status]);

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xs p-7 text-center space-y-4">
        {status === 'reconnecting' ? (
          <>
            <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto">
              <WifiOff className="w-8 h-8 text-amber-500" />
            </div>
            <h3 className="font-black text-gray-900 text-lg">연결이 끊겼습니다</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              서버와 재연결을 시도하고 있습니다{dots}<br />
              <span className="text-xs text-gray-400">잠시만 기다려 주세요</span>
            </p>
            <div className="flex justify-center gap-1.5">
              {[0,1,2].map(i => (
                <span key={i} className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: `${i * 0.2}s` }} />
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto">
              <WifiOff className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="font-black text-gray-900 text-lg">연결 실패</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              서버 연결에 실패했습니다.<br />
              데이터는 안전하게 저장되어 있으니<br />
              새로고침 후 다시 시도해 주세요.
            </p>
            <button onClick={onRetry}
              className="w-full py-3.5 bg-gradient-to-r from-slate-800 to-slate-900 text-white font-black rounded-2xl hover:from-slate-700 hover:to-slate-800 transition-all">
              새로고침
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default ReconnectOverlay;
