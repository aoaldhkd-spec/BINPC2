import React, { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { navigateToAppPath } from '../lib/panel-password';

export function EntryGateScreen({ entryPassword, onVerified }: { entryPassword: string; onVerified: () => void }) {
  const [input, setInput] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const [visible, setVisible] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // 타이머 ref — 언마운트 시 취소해 stale 콜백 방지
  const verifyTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const shakeTimerRef  = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { const t = setTimeout(() => setVisible(true), 60); return () => clearTimeout(t); }, []);

  // 언마운트 시 두 타이머 모두 취소
  useEffect(() => () => {
    if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current);
    if (shakeTimerRef.current)  clearTimeout(shakeTimerRef.current);
  }, []);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (verifying) return;
    if (input === entryPassword) {
      setVerifying(true);
      // 짧은 딜레이로 로딩 피드백 후 입장 — 네트워크 느린 기기에서 버튼이 멈춘 것처럼 보이지 않도록
      verifyTimerRef.current = setTimeout(() => onVerified(), 120);
    } else {
      setError(true); setShake(true); setInput('');
      if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
      shakeTimerRef.current = setTimeout(() => setShake(false), 500);
    }
  };

  const todayHint = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' })
    .format(new Date())
    .replace(/[^\d]/g, '');

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-6"
    >
      <div className={`w-full max-w-sm space-y-7 transition-all duration-500 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <div className="text-center space-y-2">
          {/* 입장 화면 로고 → 테스터(/test). 참여자 메인 로고(ResetButton)는 처음으로 유지 */}
          <button
            type="button"
            data-gate="entry-logo-tester"
            onClick={() => navigateToAppPath('test')}
            title="테스터"
            aria-label="테스터"
            className="text-5xl mb-2 drop-shadow-lg inline-block active:scale-95 transition-transform cursor-pointer"
          >
            🍻
          </button>
          <h1 className="text-2xl font-black text-white tracking-tight">범일NPC 술번개</h1>
          <p className="text-slate-400 text-sm">참여하려면 입장 코드를 입력하세요</p>
        </div>
        <form onSubmit={handleSubmit}
          className={`bg-slate-800/70 backdrop-blur-sm rounded-3xl p-6 border border-slate-700/60 shadow-2xl space-y-4 ${shake ? 'animate-[shake_0.45s_ease-in-out]' : ''}`}>
          <div>
            <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">입장 코드</label>
            <div className="mb-3 rounded-2xl border-2 border-cyan-400/60 bg-cyan-400/10 px-4 py-3 text-center">
              <p className="text-base font-black text-cyan-200">
                입장 코드는 <span className="text-lg text-white underline decoration-cyan-400 decoration-2 underline-offset-4">오늘 날짜</span>입니다
              </p>
              <p className="mt-1 text-sm font-bold text-cyan-300">
                월·일 4자리로 입력해 주세요 (예: {todayHint || 'MMDD'})
              </p>
            </div>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} value={input}
                onChange={e => { setInput(e.target.value); setError(false); }}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                placeholder="코드를 입력하세요" autoFocus autoComplete="off"
                className={`w-full rounded-2xl px-4 py-4 pr-12 text-white text-center text-xl font-black tracking-[0.25em] focus:outline-none transition-all border-2 ${error ? 'bg-red-950/60 border-red-500 placeholder-red-400/50' : 'bg-slate-700/60 border-slate-600 focus:border-cyan-500 placeholder-slate-500'}`} />
              <button type="button" onClick={() => setShowPw(p => !p)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className={`overflow-hidden transition-all duration-200 ${error ? 'max-h-8 mt-2' : 'max-h-0'}`}>
              <p className="text-red-400 text-xs text-center font-bold">❌ 입장 코드가 올바르지 않습니다</p>
            </div>
          </div>
          <button type="submit" disabled={verifying}
            className={`w-full text-white font-black py-4 rounded-2xl transition-all text-base shadow-lg shadow-cyan-900/30 ${verifying ? 'bg-cyan-700/60 cursor-not-allowed' : 'bg-cyan-600 hover:bg-cyan-500 active:scale-[0.97]'}`}>
            {verifying ? '입장 중...' : '입장하기 →'}
          </button>
        </form>
        <p className="text-center text-slate-600 text-xs">운영진에게 입장 코드를 받아 입력하세요</p>
      </div>
      <style>{`
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          18%     { transform: translateX(-8px); }
          36%     { transform: translateX(8px); }
          54%     { transform: translateX(-5px); }
          72%     { transform: translateX(5px); }
        }
      `}</style>
    </div>
  );
}
