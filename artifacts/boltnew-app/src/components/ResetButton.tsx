import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Users } from 'lucide-react';
import { HOST_AGE_EASTER_EGG_HINT } from '../lib/host-age-easter-egg';
import { navigateToAppPath, PANEL_PIN_INPUT_PROPS, verifyPanelPassword } from '../lib/panel-password';

const FIXED_TITLE = '범일NPC는 30살!';
const RANDOM_SUFFIX = [
  '놀랍죠? 충격적이죠? 저도 압니다. 😱',
  '이게 진짜 현실입니다 🫠',
  '30년을 살아왔습니다 💀',
  '30살에 술번개를 합니다 🍺',
  '서른. 실화입니다 😭',
  '믿기 어렵죠? 저도요 🤯',
];


/** TTS — 더 빠르고 높게 */
function speakLine(line: string) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(line);
  utter.lang = 'ko-KR';
  utter.rate = 0.8;
  utter.pitch = 1.8;
  utter.volume = 1;
  window.speechSynthesis.speak(utter);
  // 2번 반복
  utter.onend = () => {
    const u2 = new SpeechSynthesisUtterance(line);
    u2.lang = 'ko-KR'; u2.rate = 0.9; u2.pitch = 2.0; u2.volume = 1;
    window.speechSynthesis.speak(u2);
  };
}

/** Dim only — never opaque black. Inline rgba so Tailwind/theme cannot turn this into a black sheet. */
const PASSWORD_DIM: React.CSSProperties = {
  backgroundColor: 'rgba(0, 0, 0, 0.4)',
};

function PasswordDimLayer({
  z, onClick, children,
}: {
  z: number;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return createPortal(
    <div
      data-password-overlay="dim"
      className="safe-overlay fixed inset-0 flex items-center justify-center"
      style={{ ...PASSWORD_DIM, zIndex: z }}
      onClick={onClick}
    >
      {children}
    </div>,
    document.body,
  );
}

/** Centered password popup over the live MainScreen — dim backdrop, not a black takeover. */
export function ResetPasswordSheet({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setErr('');
    const result = await verifyPanelPassword('reset', pw);
    setBusy(false);
    if (result === 'ok') onConfirm();
    else {
      setErr(result === 'limited' ? '시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.' : '비밀번호가 틀렸습니다');
      setPw('');
    }
  };

  return (
    <PasswordDimLayer z={500}>
      <div className="bg-white rounded-2xl p-6 w-72 shadow-2xl">
        <p className="text-sm font-bold text-gray-800 mb-1">처음으로 돌아가기</p>
        <p className="text-xs text-gray-500 mb-4">비밀번호를 입력하세요</p>
        <input type="password" {...PANEL_PIN_INPUT_PROPS} value={pw} onChange={(e) => { setPw(e.target.value); setErr(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') void confirm(); }} placeholder="비밀번호" autoFocus disabled={busy}
          className={`w-full px-3 py-2.5 rounded-xl border-2 text-sm text-center font-bold outline-none mb-3 ${err ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-200 focus:border-cyan-400'}`} />
        {err && <p className="text-xs text-red-500 text-center mb-3">{err}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onCancel}
            className="flex-1 py-2 rounded-xl border-2 border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-all">취소</button>
          <button type="button" onClick={() => void confirm()} disabled={busy}
            className="flex-1 py-2 rounded-xl bg-cyan-500 text-white text-sm font-semibold hover:bg-cyan-600 transition-all disabled:opacity-60">{busy ? '확인 중…' : '확인'}</button>
        </div>
      </div>
    </PasswordDimLayer>
  );
}

export function ResetButton({ onReset, darkMode, onEasterEgg, onUiLockChange, onOpenResetPassword }: {
  onReset: () => void; variant?: string; darkMode?: boolean; resetPassword?: string | null; onEasterEgg?: () => void;
  onUiLockChange?: (locked: boolean) => void;
  onOpenResetPassword?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminPw, setAdminPw] = useState('');
  const [adminErr, setAdminErr] = useState('');
  const [adminBusy, setAdminBusy] = useState(false);
  const [showEgg, setShowEgg] = useState(false);
  const [eggLine, setEggLine] = useState<[string,string]>([FIXED_TITLE, RANDOM_SUFFIX[0]]);
  const logoClickCount = useRef(0);
  const logoClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eggTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onUiLockChange?.(open || adminOpen);
    return () => onUiLockChange?.(false);
  }, [open, adminOpen, onUiLockChange]);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setErr('');
    const result = await verifyPanelPassword('reset', pw);
    setBusy(false);
    if (result === 'ok') { setOpen(false); setPw(''); setErr(''); onReset(); }
    else {
      setErr(result === 'limited' ? '시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.' : '비밀번호가 틀렸습니다');
      setPw('');
    }
  };

  const confirmAdmin = async () => {
    if (adminBusy) return;
    setAdminBusy(true);
    setAdminErr('');
    const result = await verifyPanelPassword('admin', adminPw);
    setAdminBusy(false);
    if (result === 'ok') {
      setAdminOpen(false);
      setAdminPw('');
      navigateToAppPath('admin');
    } else {
      setAdminErr(result === 'limited' ? '시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.' : '❌ 비밀번호가 틀렸습니다');
      setAdminPw('');
    }
  };

  const openResetGate = () => {
    if (onOpenResetPassword) onOpenResetPassword();
    else {
      setPw('');
      setErr('');
      setOpen(true);
    }
  };

  const openAdminGate = () => {
    setAdminPw('');
    setAdminErr('');
    setAdminOpen(true);
  };

  const handleSulbunClick = () => {
    logoClickCount.current += 1;
    if (logoClickTimer.current) clearTimeout(logoClickTimer.current);
    if (logoClickCount.current >= 3) {
      logoClickCount.current = 0;
      const suffix = RANDOM_SUFFIX[Math.floor(Math.random() * RANDOM_SUFFIX.length)];
      const line: [string, string] = [FIXED_TITLE, suffix];
      setEggLine(line);
      setShowEgg(true);
      speakLine(FIXED_TITLE + ' ' + suffix.replace(/[😱🫠💀🍺😭🤯✅🎂]/g, ''));
      onEasterEgg?.();
      if (eggTimer.current) clearTimeout(eggTimer.current);
      eggTimer.current = setTimeout(() => setShowEgg(false), 5000);
    } else {
      logoClickTimer.current = setTimeout(() => { logoClickCount.current = 0; }, 3000);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <button type="button" data-gate="logo-reset" onClick={openResetGate} title="처음으로 돌아가기" aria-label="처음으로 돌아가기"
          className={`p-1 rounded-xl transition-all active:scale-95 hover:scale-110 ${darkMode ? 'text-cyan-400 hover:text-cyan-300' : 'text-cyan-500 hover:text-cyan-600'}`}>
          <Users className="w-7 h-7" />
        </button>
        <div className="text-left select-none">
          <button type="button" data-gate="npc-admin" onClick={openAdminGate} className="block group cursor-pointer" title="관리자">
            <p className={`text-[10px] font-black tracking-widest uppercase leading-none transition-colors ${darkMode ? 'text-cyan-400 group-hover:text-cyan-300' : 'text-cyan-600 group-hover:text-cyan-700'}`}>범일NPC</p>
          </button>
          <button type="button" data-gate="sulbun-none" onClick={handleSulbunClick} className="inline cursor-pointer active:scale-95 transition-transform align-baseline" title="술번개" aria-label={HOST_AGE_EASTER_EGG_HINT}>
            <span className={`text-lg font-black leading-tight transition-colors ${darkMode ? 'text-white hover:text-amber-300' : 'text-gray-900 hover:text-amber-500'}`}>술번개</span>
          </button>
          <span className={`text-lg font-black leading-tight ${darkMode ? 'text-white' : 'text-gray-900'}`} aria-hidden> 🍻</span>
        </div>
      </div>

      {/* 💀 이스터에그 — 범일NPC 30살 충격 폭로 */}
      {showEgg && (
        <div
          className="safe-fullscreen fixed inset-0 z-[300] flex flex-col items-center justify-center overflow-y-auto overflow-x-hidden"
          style={{ background: 'linear-gradient(160deg, #0f0f1a 0%, #1a0a2e 40%, #0d1a2e 100%)' }}
          onClick={() => { setShowEgg(false); window.speechSynthesis?.cancel(); }}
        >
          <style>{`
            @keyframes revealShake {
              0%,100%{transform:translateX(0)}
              15%{transform:translateX(-8px) rotate(-1deg)}
              30%{transform:translateX(8px) rotate(1deg)}
              45%{transform:translateX(-5px)}
              60%{transform:translateX(5px)}
              75%{transform:translateX(-3px)}
            }
            @keyframes bigNumPop {
              0%{transform:scale(0.5);opacity:0}
              60%{transform:scale(1.15);opacity:1}
              80%{transform:scale(0.95)}
              100%{transform:scale(1)}
            }
            @keyframes glitch {
              0%,100%{text-shadow:0 0 0 #f00,0 0 0 #0ff}
              20%{text-shadow:-3px 0 #f00,3px 0 #0ff}
              40%{text-shadow:3px 0 #f00,-3px 0 #0ff}
              60%{text-shadow:-2px 0 #f00,2px 0 #0ff}
            }
            @keyframes floatBg {
              0%,100%{transform:translateY(0) scale(1);opacity:0.12}
              50%{transform:translateY(-18px) scale(1.08);opacity:0.2}
            }
            @keyframes blinkHint {
              0%,100%{opacity:0.5} 50%{opacity:0.9}
            }
            @keyframes scanline {
              0%{transform:translateY(-100%)} 100%{transform:translateY(100vh)}
            }
          `}</style>

          {/* 스캔라인 효과 */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div style={{ animation: 'scanline 2.5s linear infinite', background: 'linear-gradient(transparent, rgba(255,255,255,0.04) 50%, transparent)', height: '8px', width: '100%', position: 'absolute' }} />
          </div>

          {/* 배경 떠다니는 숫자들 */}
          {['top-[6%] left-[8%]','top-[12%] right-[10%]','top-[45%] left-[5%]','top-[65%] right-[8%]','bottom-[18%] left-[18%]','bottom-[25%] right-[12%]'].map((pos, i) => (
            <div key={i} className={`absolute ${pos} font-black select-none pointer-events-none text-purple-400`}
              style={{ fontSize: `${2 + i * 0.4}rem`, animation: `floatBg ${2 + i * 0.4}s ease-in-out infinite` }}>
              30
            </div>
          ))}

          {/* 상단 경고 라벨 */}
          <div className="mb-3 px-4 py-1 rounded-full border border-red-500/60 bg-red-500/15">
            <p className="text-red-400 text-[11px] font-black tracking-[0.3em] uppercase">⚠ 충격 주의 ⚠</p>
          </div>

          {/* 메인 숫자 "30" */}
          <div style={{ animation: 'bigNumPop 0.6s cubic-bezier(0.34,1.56,0.64,1) forwards' }}>
            <p className="font-black leading-none select-none text-center"
              style={{
                fontSize: 'clamp(6rem, 30vw, 11rem)',
                background: 'linear-gradient(135deg, #e879f9 0%, #818cf8 50%, #38bdf8 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                animation: 'glitch 3s ease-in-out infinite',
                filter: 'drop-shadow(0 0 24px rgba(168,85,247,0.6))',
              }}>
              30
            </p>
          </div>

          {/* 설명 텍스트 */}
          <div className="text-center mt-1 px-6" style={{ animation: 'revealShake 0.5s ease-in-out infinite' }}>
            <p className="text-white font-black"
              style={{ fontSize: 'clamp(1.6rem, 7.5vw, 2.8rem)', textShadow: '0 0 20px rgba(139,92,246,0.8)' }}>
              {eggLine[0]}
            </p>
            <p className="text-purple-200 font-black mt-0.5"
              style={{ fontSize: 'clamp(1.2rem, 5.5vw, 2rem)' }}>
              {eggLine[1]}
            </p>
          </div>

          {/* 하단 반응 이모지 행 */}
          <div className="flex gap-3 mt-5 text-3xl select-none">
            {'😱🫠💀😭🤯'.split('').map((e, i) => (
              <span key={i} style={{ animation: `floatBg ${1.0 + i * 0.25}s ease-in-out infinite`, display: 'inline-block' }}>{e}</span>
            ))}
          </div>

          <p className="mt-6 text-purple-400/70 text-xs font-bold select-none"
            style={{ animation: 'blinkHint 1.4s ease-in-out infinite' }}>
            탭하면 닫혀요
          </p>
        </div>
      )}

      {open && (
        <PasswordDimLayer z={400} onClick={() => { setOpen(false); setPw(''); setErr(''); }}>
          <div className="bg-white rounded-2xl p-6 w-72 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-bold text-gray-800 mb-1">처음으로 돌아가기</p>
            <p className="text-xs text-gray-500 mb-4">비밀번호를 입력하세요</p>
            <input type="password" {...PANEL_PIN_INPUT_PROPS} value={pw} onChange={(e) => { setPw(e.target.value); setErr(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') void confirm(); }} placeholder="비밀번호" autoFocus disabled={busy}
              className={`w-full px-3 py-2.5 rounded-xl border-2 text-sm text-center font-bold outline-none mb-3 ${err ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-200 focus:border-cyan-400'}`} />
            {err && <p className="text-xs text-red-500 text-center mb-3">{err}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => { setOpen(false); setPw(''); setErr(''); }}
                className="flex-1 py-2 rounded-xl border-2 border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-all">취소</button>
              <button type="button" onClick={() => void confirm()} disabled={busy}
                className="flex-1 py-2 rounded-xl bg-cyan-500 text-white text-sm font-semibold hover:bg-cyan-600 transition-all disabled:opacity-60">{busy ? '확인 중…' : '확인'}</button>
            </div>
          </div>
        </PasswordDimLayer>
      )}
      {adminOpen && (
        <PasswordDimLayer z={400} onClick={() => { setAdminOpen(false); setAdminPw(''); setAdminErr(''); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="text-center"><span className="text-3xl">🔐</span><h3 className="text-gray-900 font-black text-lg mt-2">관리자 확인</h3><p className="text-gray-400 text-xs mt-1">비밀번호를 입력하세요</p></div>
            <input type="password" {...PANEL_PIN_INPUT_PROPS} value={adminPw} onChange={e => { setAdminPw(e.target.value); setAdminErr(''); }}
              onKeyDown={e => { if (e.key === 'Enter') void confirmAdmin(); }}
              placeholder="비밀번호" autoFocus disabled={adminBusy}
              className={`w-full border-2 text-center text-lg font-bold rounded-xl px-4 py-3 focus:outline-none placeholder-gray-300 ${adminErr ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-200 focus:border-cyan-500'}`} />
            {adminErr && <p className="text-red-500 text-xs text-center font-bold">{adminErr}</p>}
            <div className="flex gap-2">
              <button onClick={() => { setAdminOpen(false); setAdminPw(''); setAdminErr(''); }}
                className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 text-gray-500 text-sm font-semibold hover:bg-gray-50 transition-all">취소</button>
              <button onClick={() => void confirmAdmin()} disabled={adminBusy}
                className="flex-1 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-bold transition-all disabled:opacity-60">{adminBusy ? '확인 중…' : '확인'}</button>
            </div>
          </div>
        </PasswordDimLayer>
      )}
    </>
  );
}
