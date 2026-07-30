import React, { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useTheme } from '../lib/theme';

export function EntryGateScreen({ entryPassword, onVerified }: { entryPassword: string; onVerified: () => void }) {
  const { theme } = useTheme();
  const [input, setInput] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const [visible, setVisible] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // 테마별 배경·텍스트 색
  const isLight = theme === 'y2k' || theme === 'minimal';
  const bgColor = theme === 'y2k' ? '#FCFCFB' : theme === 'minimal' ? '#F9F8F6' : theme === 'dark-neon' ? '#000000' : undefined;
  const titleColor = isLight ? '#000000' : '#ffffff';
  const subtitleColor = isLight ? '#52525b' : undefined;
  const hintColor = isLight ? '#71717a' : undefined;

  useEffect(() => { const t = setTimeout(() => setVisible(true), 60); return () => clearTimeout(t); }, []);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (verifying) return;
    if (input === entryPassword) {
      setVerifying(true);
      // 짧은 딜레이로 로딩 피드백 후 입장 — 네트워크 느린 기기에서 버튼이 멈춘 것처럼 보이지 않도록
      setTimeout(() => onVerified(), 120);
    } else {
      setError(true); setShake(true); setInput('');
      setTimeout(() => setShake(false), 500);
    }
  };

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-6"
      style={bgColor ? { background: bgColor } : undefined}
    >
      <div className={`w-full max-w-sm space-y-7 transition-all duration-500 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <div className="text-center space-y-2">
          <div className="text-5xl mb-2 drop-shadow-lg">🍻</div>
          <h1 className="text-2xl font-black text-white tracking-tight" style={{ color: titleColor }}>범일NPC 술번개</h1>
          <p className="text-slate-400 text-sm" style={subtitleColor ? { color: subtitleColor } : undefined}>참여하려면 입장 코드를 입력하세요</p>
        </div>
        <form onSubmit={handleSubmit}
          className={`bg-slate-800/70 backdrop-blur-sm rounded-3xl p-6 border border-slate-700/60 shadow-2xl space-y-4 ${shake ? 'animate-[shake_0.45s_ease-in-out]' : ''}`}>
          <div>
            <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">입장 코드</label>
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
