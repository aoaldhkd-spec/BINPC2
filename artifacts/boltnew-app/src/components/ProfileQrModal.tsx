import React, { useState, useEffect, useRef } from 'react';
import { Maximize2 } from 'lucide-react';
import QRCode from 'qrcode';
import { supabase } from '../lib/supabase';

export function ProfileQrModal({ profileId, pinCode: pinCodeProp, onClose, onPinGenerated }: {
  profileId: string; pinCode: string | null; onClose: () => void; onPinGenerated?: (pin: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contactCanvasRef = useRef<HTMLCanvasElement>(null);
  const largeCanvasRef = useRef<HTMLCanvasElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [expandedTab, setExpandedTab] = useState<'profile' | 'contact'>('profile');
  const [tab, setTab] = useState<'profile' | 'contact'>('profile');
  const [pinCode, setPinCode] = useState<string | null>(pinCodeProp);
  const shareUrl = `${window.location.origin}${window.location.pathname}?share=${profileId}`;

  useEffect(() => {
    if (pinCodeProp !== null) { setPinCode(pinCodeProp); return; }
    const generate = async () => {
      const { data: existingPins } = await supabase.from('profiles').select('pin_code');
      const usedPins = new Set((existingPins ?? []).map((p: { pin_code: string | null }) => p.pin_code).filter(Boolean));
      let pin = String(Math.floor(1000 + Math.random() * 9000));
      while (usedPins.has(pin)) pin = String(Math.floor(1000 + Math.random() * 9000));
      await supabase.from('profiles').update({ pin_code: pin }).eq('id', profileId);
      setPinCode(pin); onPinGenerated?.(pin);
    };
    generate();
  }, [profileId, pinCodeProp]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab !== 'profile' || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, `PROFID:${profileId}`, { width: 180, margin: 2, color: { dark: '#0f172a', light: '#ffffff' } });
  }, [profileId, tab]);

  useEffect(() => {
    if (tab !== 'contact' || !contactCanvasRef.current) return;
    QRCode.toCanvas(contactCanvasRef.current, shareUrl, { width: 180, margin: 2, color: { dark: '#7c3aed', light: '#faf5ff' } });
  }, [tab, shareUrl]);

  useEffect(() => {
    if (!expanded || !largeCanvasRef.current) return;
    const content = expandedTab === 'contact' ? shareUrl : `PROFID:${profileId}`;
    const color = expandedTab === 'contact' ? { dark: '#7c3aed', light: '#faf5ff' } : { dark: '#0f172a', light: '#ffffff' };
    QRCode.toCanvas(largeCanvasRef.current, content, { width: Math.min(window.innerWidth - 80, 280), margin: 2, color });
  }, [expanded, expandedTab, profileId, shareUrl]);

  return (
    <>
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xs overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="flex border-b border-gray-100">
            <button onClick={() => setTab('profile')} className={`flex-1 py-3.5 text-xs font-black transition-all ${tab === 'profile' ? 'text-cyan-600 border-b-2 border-cyan-500 bg-cyan-50/60' : 'text-gray-400 hover:text-gray-600'}`}>🪪 프로필 QR</button>
            <button onClick={() => setTab('contact')} className={`flex-1 py-3.5 text-xs font-black transition-all ${tab === 'contact' ? 'text-violet-600 border-b-2 border-violet-500 bg-violet-50/60' : 'text-gray-400 hover:text-gray-600'}`}>📱 연락처 QR</button>
          </div>
          <div className="p-5 text-center">
            {tab === 'profile' ? (
              <>
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center mx-auto mb-3 shadow-lg">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
                </div>
                <p className="text-xs text-gray-500 mb-3 leading-relaxed">관리자에게 이 QR을 보여주세요.<br />자리 배정 시 즉시 인식됩니다.</p>
                {pinCode && (
                  <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-2.5 mb-3 flex items-center justify-center gap-3">
                    <span className="text-xs font-bold text-slate-500">고유번호</span>
                    <span className="text-3xl font-black tracking-[0.3em] text-slate-900">{pinCode}</span>
                  </div>
                )}
                <button className="w-full relative flex justify-center mb-1.5 p-3 bg-gray-50 rounded-2xl border-2 border-dashed border-cyan-300 hover:border-cyan-500 active:scale-95 transition-all group" onClick={() => { setExpandedTab('profile'); setExpanded(true); }}>
                  <canvas ref={canvasRef} className="rounded-lg" />
                  <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/0 group-hover:bg-black/10 transition-all"><div className="opacity-0 group-hover:opacity-100 bg-white rounded-full px-2 py-1 shadow text-[10px] font-bold text-gray-700 flex items-center gap-1 transition-all"><Maximize2 className="w-3 h-3" /> 확대</div></div>
                </button>
                <p className="text-[10px] text-gray-400 mb-4">QR 탭하면 확대됩니다</p>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mx-auto mb-3 shadow-lg"><span className="text-2xl">📱</span></div>
                <p className="text-xs text-gray-500 mb-3 leading-relaxed">상대방이 이 QR을 스캔하면<br /><strong className="text-violet-600">내 연락처가 채팅으로 자동 전달</strong>됩니다</p>
                <button className="w-full relative flex justify-center mb-1.5 p-3 bg-violet-50 rounded-2xl border-2 border-dashed border-violet-300 hover:border-violet-500 active:scale-95 transition-all group" onClick={() => { setExpandedTab('contact'); setExpanded(true); }}>
                  <canvas ref={contactCanvasRef} className="rounded-lg" />
                  <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/0 group-hover:bg-black/10 transition-all"><div className="opacity-0 group-hover:opacity-100 bg-white rounded-full px-2 py-1 shadow text-[10px] font-bold text-gray-700 flex items-center gap-1 transition-all"><Maximize2 className="w-3 h-3" /> 확대</div></div>
                </button>
                <p className="text-[10px] text-gray-400 mb-1">QR 탭하면 확대됩니다</p>
                <div className="mt-2 mb-3 bg-violet-50 rounded-xl px-3 py-2 text-left">
                  <p className="text-[10px] text-violet-600 font-bold mb-0.5">📋 사용 방법</p>
                  <p className="text-[10px] text-gray-500 leading-relaxed">① 이 QR을 상대방에게 보여주세요<br />② 상대방이 카메라 앱으로 스캔하면<br />③ 채팅방에 내 연락처가 자동으로 전송돼요</p>
                </div>
              </>
            )}
            <button onClick={onClose} className={`w-full py-3 text-white font-bold rounded-xl transition-all ${tab === 'contact' ? 'bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700' : 'bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-600 hover:to-teal-600'}`}>확인</button>
          </div>
        </div>
      </div>
      {expanded && (
        <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm" onClick={() => setExpanded(false)}>
          <p className="text-white text-sm font-bold mb-4 opacity-70">탭하면 닫힙니다</p>
          <div className={`rounded-3xl p-4 shadow-2xl ${expandedTab === 'contact' ? 'bg-violet-50' : 'bg-white'}`} onClick={e => e.stopPropagation()}>
            <canvas ref={largeCanvasRef} className="rounded-xl block" />
          </div>
          {expandedTab === 'profile' && pinCode && (
            <div className="mt-4 bg-white/10 border border-white/20 rounded-2xl px-6 py-3 flex items-center gap-3">
              <span className="text-white/60 text-sm font-bold">고유번호</span>
              <span className="text-white text-3xl font-black tracking-[0.4em]">{pinCode}</span>
            </div>
          )}
          {expandedTab === 'contact' && <p className="mt-4 text-white/60 text-xs text-center">스캔 시 내 연락처가 채팅으로 자동 전달</p>}
          <button onClick={() => setExpanded(false)} className="mt-4 px-6 py-2.5 bg-white/20 rounded-full text-white font-bold text-sm">닫기</button>
        </div>
      )}
    </>
  );
}
