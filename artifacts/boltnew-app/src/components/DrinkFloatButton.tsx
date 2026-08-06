import { useState, useRef } from 'react';

const DRUNK_SHOUTS = [
  '술! 술! 술 주세요! 🍺🍻🍶',
  '아저씨!! 여기요!! 🙋',
  '우리 테이블 소주 추가요!! 🍶',
  '목이 타요!! 빨리요!! 😭',
  '저 여기 있어요!! 🍺',
  '한 잔만 더요!! 제발!! 🙏',
];


export function DrinkFloatButton({ onRequest }: { onRequest?: () => void }) {
  const [show, setShow] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [shout, setShout] = useState(DRUNK_SHOUTS[0]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = () => {
    const s = DRUNK_SHOUTS[Math.floor(Math.random() * DRUNK_SHOUTS.length)];
    setShout(s);
    setShow(true);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(s.replace(/[🍺🍻🍶🙋😭🙏]/g, ''));
      u.lang = 'ko-KR'; u.rate = 0.85; u.pitch = 1.7; u.volume = 1;
      window.speechSynthesis.speak(u);
    }
    onRequest?.();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(false), 4000);
  };

  return (
    <>
      <style>{`
        @keyframes drinkWobble {
          0%,100%{transform:rotate(0deg) scale(1)}
          25%{transform:rotate(-8deg) scale(1.08)}
          75%{transform:rotate(8deg) scale(1.08)}
        }
        @keyframes drinkPulse {
          0%,100%{box-shadow:0 0 0 0 rgba(245,158,11,0.7)}
          50%{box-shadow:0 0 0 10px rgba(245,158,11,0)}
        }
        @keyframes drinkPopup {
          0%{transform:scale(0.5) translateY(20px);opacity:0}
          70%{transform:scale(1.06) translateY(-4px);opacity:1}
          100%{transform:scale(1) translateY(0);opacity:1}
        }
        @keyframes drinkShake {
          0%,100%{transform:translateX(0) rotate(0)}
          20%{transform:translateX(-6px) rotate(-2deg)}
          40%{transform:translateX(6px) rotate(2deg)}
          60%{transform:translateX(-4px)}
          80%{transform:translateX(4px)}
        }
      `}</style>

      {/* 숨김 상태 — 작은 복원 버튼 */}
      {hidden && (
        <button
          onClick={() => setHidden(false)}
          className="fixed bottom-24 right-4 z-[250] w-8 h-8 rounded-full flex items-center justify-center text-base shadow-lg border border-amber-400/40 opacity-40 hover:opacity-80 transition-opacity select-none"
          style={{ background: 'rgba(245,158,11,0.3)' }}
          title="술 버튼 다시 보기"
        >🍺</button>
      )}

      {/* 플로팅 버튼 */}
      {!hidden && (
        <div className="fixed bottom-24 right-4 z-[250] flex flex-col items-center gap-1">
          {/* 숨기기 × */}
          <button
            onClick={() => setHidden(true)}
            className="w-5 h-5 rounded-full bg-black/30 flex items-center justify-center text-white text-[10px] font-black hover:bg-black/50 transition-colors self-end select-none"
            title="숨기기"
          >×</button>
          <button
            onClick={handleClick}
            className="w-14 h-14 rounded-full flex items-center justify-center text-2xl shadow-2xl border-2 border-amber-400/60 select-none active:scale-90 transition-transform"
            style={{
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              animation: 'drinkWobble 2.5s ease-in-out infinite, drinkPulse 2s ease-in-out infinite',
            }}
            title="눌러봐~"
          >🍺</button>
        </div>
      )}

      {/* 팝업 오버레이 */}
      {show && (
        <div
          className="fixed inset-0 z-[290] flex flex-col items-center justify-center overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #92400e 0%, #b45309 40%, #d97706 100%)' }}
          onClick={() => { setShow(false); window.speechSynthesis?.cancel(); }}
        >
          <div className="text-[90px] leading-none select-none"
            style={{ animation: 'drinkWobble 0.6s ease-in-out infinite' }}>
            🍺
          </div>

          <div className="mt-5 text-center px-8"
            style={{ animation: 'drinkShake 0.5s ease-in-out infinite' }}>
            <p className="text-white font-black leading-tight"
              style={{ fontSize: 'clamp(1.8rem, 9vw, 3.5rem)', textShadow: '0 3px 12px rgba(0,0,0,0.4)', animation: 'drinkPopup 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards' }}>
              {shout}
            </p>
          </div>

          <div className="flex gap-3 mt-6 text-4xl select-none">
            {'🍺🍶🍻🍾🥂'.split('').map((e, i) => (
              <span key={i} style={{ animation: `drinkWobble ${0.8 + i * 0.2}s ease-in-out infinite`, display: 'inline-block' }}>{e}</span>
            ))}
          </div>

          <p className="mt-8 text-amber-200/70 text-sm font-bold select-none">탭하면 닫혀요</p>
        </div>
      )}
    </>
  );
}
