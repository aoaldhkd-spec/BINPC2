import { useEffect, useRef, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import QRCode from 'qrcode';

export function ContactDisplayModal({ profile, onClose }: {
  profile: { id: string; nickname?: string | null };
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const largeCanvasRef = useRef<HTMLCanvasElement>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, `PROFID:${profile.id}`, {
      width: 180, margin: 2, color: { dark: '#5b21b6', light: '#ffffff' },
    });
  }, [profile.id]);

  useEffect(() => {
    if (!expanded || !largeCanvasRef.current) return;
    QRCode.toCanvas(largeCanvasRef.current, `PROFID:${profile.id}`, {
      width: Math.min(window.innerWidth - 80, 280), margin: 2, color: { dark: '#5b21b6', light: '#ffffff' },
    });
  }, [expanded, profile.id]);

  return (
    <>
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xs overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="p-5 text-center">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mx-auto mb-3 shadow-lg">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
            </div>
            <p className="text-xs text-gray-500 mb-3 leading-relaxed">연락처를 주고 싶은 사람에게<br />이 화면을 보여주세요 💜</p>
            <button
              className="w-full relative flex justify-center mb-1.5 p-3 bg-violet-50 rounded-2xl border-2 border-dashed border-violet-300 hover:border-violet-500 active:scale-95 transition-all group"
              onClick={() => setExpanded(true)}
            >
              <canvas ref={canvasRef} className="rounded-lg" />
              <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/0 group-hover:bg-black/10 transition-all">
                <div className="opacity-0 group-hover:opacity-100 bg-white rounded-full px-2 py-1 shadow text-[10px] font-bold text-gray-700 flex items-center gap-1 transition-all">
                  <Maximize2 className="w-3 h-3" /> 확대
                </div>
              </div>
            </button>
            <p className="text-[10px] text-gray-400 mb-4">QR 탭하면 확대됩니다</p>
            <button onClick={onClose} className="w-full py-3 text-white font-bold rounded-xl transition-all bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700">확인</button>
          </div>
        </div>
      </div>
      {expanded && (
        <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm" onClick={() => setExpanded(false)}>
          <p className="text-white text-sm font-bold mb-4 opacity-70">탭하면 닫힙니다</p>
          <div className="rounded-3xl p-4 shadow-2xl bg-white" onClick={e => e.stopPropagation()}>
            <canvas ref={largeCanvasRef} className="rounded-xl block" />
          </div>
          <button onClick={() => setExpanded(false)} className="mt-4 px-6 py-2.5 bg-white/20 rounded-full text-white font-bold text-sm">닫기</button>
        </div>
      )}
    </>
  );
}
