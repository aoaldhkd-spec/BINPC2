import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Users } from 'lucide-react';
import { HOST_AGE_EASTER_EGG_HINT } from '../lib/host-age-easter-egg';
import { playEasterEggSting } from '../lib/easter-egg-sound';
import { koreanAgeFromBirthYear } from '../lib/korean-age';
import { navigateToAppPath, PANEL_PIN_INPUT_PROPS, verifyPanelPassword } from '../lib/panel-password';

export const EGG_HEADLINES = [
  '범일NPC: 오늘 회식비가 조금… 이월됐어요 🧾',
  '범일NPC: 계산서가 도착했어요 💸',
  '술번개 3번 — 영수증이 나왔네요',
  'NPC: 오늘도 정산은 다음에요 🍻',
  '범일NPC: 빚 장부에 한 줄 추가됐어요',
  '회식비 정산… NPC한테 이월됐습니다',
  '영수증 출력 완료 🧾',
  '범일NPC: 또 누르셨네요 (기록됨)',
] as const;

export const EGG_DEBT_LINES = [
  '당신은 NPC에게 빚이 생겼어요 (술값 편)',
  '오늘 술값은 NPC 카드로 정산됐어요',
  '회식비 1/n — NPC 몫으로 이월',
  '치킨값·안주비도 NPC에게 넘겼어요',
  '택시비까지 NPC 크레딧 사용',
  '소주·맥주값 미정산 상태예요 🍺',
  '2차 비용도 NPC 장부에 적혀 있어요',
  '편의점 간식까지 NPC 몫이에요',
  '분명 나눠내기 했는데 NPC만 이득…',
  '카드값 정산 — NPC에게 위임했어요 💳',
  '오늘 회식비, NPC에게 이월 완료',
  '술값+안주 = NPC 정산 예정',
] as const;

const EGG_AGE_UNKNOWN = [
  'NPC 나이? 아직 비밀이에요 🤫',
  '나이는 모르지만 빚은 확실해요',
  '몇 살인지는… 다음에 알려드릴게요',
] as const;

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function buildEggAgeGag(birthYear: number | null | undefined): string {
  const age = koreanAgeFromBirthYear(birthYear ?? null);
  if (age == null) return pickRandom(EGG_AGE_UNKNOWN);
  return pickRandom([
    `몇 살이세요? ${age}세 — NPC와의 인연이 시작됐네요`,
    `${age}세시군요. 오늘부터 NPC 빚 장부에 등록돼요`,
    `NPC는 ${age}세예요. 정산은 천천히 하셔도 돼요`,
    `${age}세 — 회식 첫 만남, 빚부터 생겼네요 🍻`,
    `나이 ${age}세, 빚은… 아직 무한대예요`,
    `${age}세이신데 술값은 NPC가 먼저 냈어요`,
  ]);
}

export function buildEggReveal(birthYear: number | null | undefined) {
  return {
    headline: pickRandom(EGG_HEADLINES),
    ageGag: buildEggAgeGag(birthYear),
    debtLine: pickRandom(EGG_DEBT_LINES),
  };
}

function eggHapticPulse() {
  try {
    navigator.vibrate?.(35);
  } catch { /* unsupported */ }
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

export function ResetButton({ onReset, darkMode, birthYear, onEasterEgg, onUiLockChange, onOpenResetPassword }: {
  onReset: () => void; variant?: string; darkMode?: boolean; birthYear?: number | null; resetPassword?: string | null; onEasterEgg?: () => void;
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
  const [eggCopy, setEggCopy] = useState(() => buildEggReveal(null));
  const logoClickCount = useRef(0);
  const logoClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eggTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eggSound = useRef<ReturnType<typeof playEasterEggSting> | null>(null);

  const dismissEgg = () => {
    setShowEgg(false);
    eggSound.current?.stop();
    eggSound.current = null;
  };

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
      eggSound.current?.stop();
      eggSound.current = playEasterEggSting();
      setEggCopy(buildEggReveal(birthYear));
      setShowEgg(true);
      eggHapticPulse();
      onEasterEgg?.();
      if (eggTimer.current) clearTimeout(eggTimer.current);
      eggTimer.current = setTimeout(() => dismissEgg(), 6000);
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

      {/* 🍻 술번개 3연타 — NPC 빚 개그 영수증 */}
      {showEgg && (
        <div
          className="safe-fullscreen fixed inset-0 z-[300] flex items-center justify-center px-4 overflow-y-auto"
          style={{ background: 'rgba(254, 240, 138, 0.88)' }}
          onClick={dismissEgg}
        >
          <style>{`
            @keyframes eggShakeIn {
              0% { transform: scale(0.5) rotate(-4deg); opacity: 0; }
              40% { transform: scale(1.04) rotate(2deg); opacity: 1; }
              70% { transform: scale(0.98) rotate(-1deg); }
              100% { transform: scale(1) rotate(-1deg); opacity: 1; }
            }
            @keyframes eggWobble {
              0%, 100% { transform: rotate(-1deg) translateY(0); }
              50% { transform: rotate(1deg) translateY(-1px); }
            }
            @keyframes eggEmojiPop {
              0% { transform: scale(0) rotate(-20deg); opacity: 0; }
              70% { transform: scale(1.25) rotate(8deg); opacity: 1; }
              100% { transform: scale(1) rotate(0deg); opacity: 1; }
            }
          `}</style>

          <div
            className="relative max-w-[19rem] w-full px-5 py-6 select-none"
            style={{
              background: 'linear-gradient(180deg, #fef08a 0%, #fde047 100%)',
              border: '3px dashed #ca8a04',
              borderRadius: '2px',
              boxShadow: '6px 8px 0 rgba(120, 53, 15, 0.35), inset 0 0 0 1px rgba(255,255,255,0.5)',
              animation: 'eggShakeIn 0.42s ease-out forwards, eggWobble 3s ease-in-out 0.42s infinite',
            }}
          >
            <p
              className="text-center leading-none mb-4"
              style={{ fontSize: 'clamp(2.5rem, 12vw, 3.25rem)', animation: 'eggEmojiPop 0.35s ease-out 0.08s both' }}
            >
              🍻💸🎈
            </p>

            <p
              className="text-center font-black text-gray-900 leading-tight"
              style={{ fontSize: 'clamp(1.15rem, 5vw, 1.45rem)' }}
            >
              {eggCopy.headline}
            </p>

            <p
              className="mt-3 text-center font-bold text-amber-900 leading-snug"
              style={{ fontSize: 'clamp(1rem, 4.5vw, 1.2rem)' }}
            >
              {eggCopy.ageGag}
            </p>

            <p
              className="mt-2 text-center font-semibold text-orange-800 leading-snug"
              style={{ fontSize: 'clamp(0.9rem, 4vw, 1.05rem)' }}
            >
              {eggCopy.debtLine}
            </p>

            <p className="mt-4 text-center text-amber-800/55 text-[10px] font-bold tracking-wide">
              화면을 탭하면 닫혀요
            </p>
          </div>
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
