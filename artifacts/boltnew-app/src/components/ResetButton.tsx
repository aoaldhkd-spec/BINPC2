import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Users } from 'lucide-react';
import { navigateToAppPath, PANEL_PIN_INPUT_PROPS, verifyPanelPassword } from '../lib/panel-password';


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

export function ResetButton({ onReset, darkMode, onUiLockChange, onOpenResetPassword }: {
  onReset: () => void; variant?: string; darkMode?: boolean; resetPassword?: string | null;
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
          <span data-gate="sulbun-none" className={`inline text-lg font-black leading-tight ${darkMode ? 'text-white' : 'text-gray-900'}`}>술번개</span>
          <span className={`text-lg font-black leading-tight ${darkMode ? 'text-white' : 'text-gray-900'}`} aria-hidden> 🍻</span>
        </div>
      </div>


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
