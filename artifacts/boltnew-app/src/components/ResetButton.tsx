import React, { useState, useRef } from 'react';
import { Users } from 'lucide-react';

export function ResetButton({ onReset, darkMode, resetPassword, onEasterEgg }: { onReset: () => void; variant?: string; darkMode?: boolean; resetPassword?: string | null; onEasterEgg?: () => void }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [err, setErr] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminPw, setAdminPw] = useState('');
  const [adminErr, setAdminErr] = useState(false);
  const logoClickCount = useRef(0);
  const logoClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const confirm = () => {
    const correctPw = resetPassword ?? '116606';
    if (pw === correctPw) { setOpen(false); setPw(''); setErr(false); onReset(); }
    else { setErr(true); setPw(''); }
  };

  const handleLogoClick = () => {
    logoClickCount.current += 1;
    if (logoClickTimer.current) clearTimeout(logoClickTimer.current);
    if (logoClickCount.current >= 3) {
      logoClickCount.current = 0;
      const speakLoud = () => {
        if (!('speechSynthesis' in window)) return;
        window.speechSynthesis.cancel();
        let count = 0;
        const say = () => {
          const utter = new SpeechSynthesisUtterance('아저씨!! 술 주세요!!');
          utter.lang = 'ko-KR'; utter.rate = 0.65; utter.pitch = 1.5; utter.volume = 1;
          utter.onend = () => { count++; if (count < 3) say(); };
          window.speechSynthesis.speak(utter);
        };
        say();
      };
      try {
        const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) { const ctx = new AudioCtx(); ctx.resume().then(speakLoud); } else { speakLoud(); }
      } catch { speakLoud(); }
      onEasterEgg?.();
    } else {
      logoClickTimer.current = setTimeout(() => { logoClickCount.current = 0; }, 3000);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => { setAdminPw(''); setAdminErr(false); setAdminOpen(true); }} title="관리자"
          className={`p-1 rounded-xl transition-all active:scale-95 hover:scale-110 ${darkMode ? 'text-cyan-400 hover:text-cyan-300' : 'text-cyan-500 hover:text-cyan-600'}`}>
          <Users className="w-7 h-7" />
        </button>
        <div className="text-left select-none">
          <button type="button" onClick={() => setOpen(true)} className="block group cursor-pointer" title="처음으로 돌아가기">
            <p className={`text-[10px] font-black tracking-widest uppercase leading-none transition-colors ${darkMode ? 'text-cyan-400 group-hover:text-cyan-300' : 'text-cyan-500 group-hover:text-cyan-600'}`}>범일NPC</p>
          </button>
          <button type="button" onClick={handleLogoClick} className="block cursor-pointer active:scale-95 transition-transform" title="술번개">
            <h1 className={`text-lg font-black leading-tight transition-colors ${darkMode ? 'text-white hover:text-amber-300' : 'text-gray-900 hover:text-amber-500'}`}>술번개 🍻</h1>
          </button>
        </div>
      </div>
      {open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setOpen(false); setPw(''); setErr(false); }}>
          <div className="bg-white rounded-2xl p-6 w-72 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-bold text-gray-800 mb-1">처음으로 돌아가기</p>
            <p className="text-xs text-gray-500 mb-4">비밀번호를 입력하세요</p>
            <input type="password" value={pw} onChange={(e) => { setPw(e.target.value); setErr(false); }}
              onKeyDown={(e) => e.key === 'Enter' && confirm()} placeholder="비밀번호" autoFocus
              className={`w-full px-3 py-2.5 rounded-xl border-2 text-sm text-center font-bold outline-none mb-3 ${err ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-200 focus:border-cyan-400'}`} />
            {err && <p className="text-xs text-red-500 text-center mb-3">비밀번호가 틀렸습니다</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => { setOpen(false); setPw(''); setErr(false); }}
                className="flex-1 py-2 rounded-xl border-2 border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-all">취소</button>
              <button type="button" onClick={confirm}
                className="flex-1 py-2 rounded-xl bg-cyan-500 text-white text-sm font-semibold hover:bg-cyan-600 transition-all">확인</button>
            </div>
          </div>
        </div>
      )}
      {adminOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => { setAdminOpen(false); setAdminPw(''); setAdminErr(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="text-center"><span className="text-3xl">🔐</span><h3 className="text-gray-900 font-black text-lg mt-2">관리자 확인</h3><p className="text-gray-400 text-xs mt-1">비밀번호를 입력하세요</p></div>
            <input type="password" value={adminPw} onChange={e => { setAdminPw(e.target.value); setAdminErr(false); }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  if (adminPw === (resetPassword ?? '116606')) { setAdminOpen(false); const base = import.meta.env.BASE_URL; window.history.pushState({}, '', base + 'admin'); window.dispatchEvent(new PopStateEvent('popstate')); }
                  else { setAdminErr(true); setAdminPw(''); }
                }
              }}
              placeholder="비밀번호" autoFocus
              className={`w-full border-2 text-center text-lg font-bold rounded-xl px-4 py-3 focus:outline-none placeholder-gray-300 ${adminErr ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-200 focus:border-cyan-500'}`} />
            {adminErr && <p className="text-red-500 text-xs text-center font-bold">❌ 비밀번호가 틀렸습니다</p>}
            <div className="flex gap-2">
              <button onClick={() => { setAdminOpen(false); setAdminPw(''); setAdminErr(false); }}
                className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 text-gray-500 text-sm font-semibold hover:bg-gray-50 transition-all">취소</button>
              <button onClick={() => {
                  if (adminPw === (resetPassword ?? '116606')) { setAdminOpen(false); const base = import.meta.env.BASE_URL; window.history.pushState({}, '', base + 'admin'); window.dispatchEvent(new PopStateEvent('popstate')); }
                  else { setAdminErr(true); setAdminPw(''); }
                }}
                className="flex-1 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-bold transition-all">확인</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
