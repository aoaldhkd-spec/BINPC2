import { useEffect, useState } from 'react';

const COACH_MARKS_KEY = 'binpc2_first_entry_coach_marks_v1';

type CoachStep = {
  title: string;
  detail: string;
  spotlight: string;
  tip: string;
};

const STEPS: readonly CoachStep[] = [
  {
    title: '참여자 카드',
    detail: '카드를 눌러 뒤집으면 상대의 이상형을 볼 수 있어요.',
    spotlight: 'top-[18%] left-[3%] right-[3%] h-[46%]',
    tip: 'bottom-[calc(8.5rem+var(--tabbar-safe-bottom))]',
  },
  {
    title: '하트·채팅',
    detail: '카드 아래 하트로 마음을 보내고, 채팅으로 대화해요.',
    spotlight: 'bottom-[var(--tabbar-safe-bottom)] left-[20%] w-[20%] h-[4.75rem]',
    tip: 'bottom-[calc(8.5rem+var(--tabbar-safe-bottom))]',
  },
  {
    title: '통계·랭킹',
    detail: '오늘의 하트와 참여자 흐름을 한눈에 확인해요.',
    spotlight: 'bottom-[var(--tabbar-safe-bottom)] left-[40%] w-[40%] h-[4.75rem]',
    tip: 'bottom-[calc(8.5rem+var(--tabbar-safe-bottom))]',
  },
  {
    title: '내 프로필·설정',
    detail: '내 상태와 프로필은 여기서 바꿀 수 있어요.',
    spotlight: 'bottom-[var(--tabbar-safe-bottom)] right-0 w-[20%] h-[4.75rem]',
    tip: 'bottom-[calc(8.5rem+var(--tabbar-safe-bottom))]',
  },
];

function markSeen() {
  try { localStorage.setItem(COACH_MARKS_KEY, '1'); } catch { /* private mode */ }
}

export function FirstEntryCoachMarks({ isSubScreen, suspended = false }: { isSubScreen: boolean; suspended?: boolean }) {
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isSubScreen || suspended) {
      setOpen(false);
      return;
    }
    try {
      if (!localStorage.getItem(COACH_MARKS_KEY)) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, [isSubScreen, suspended]);

  if (!open || isSubScreen || suspended) return null;
  const current = STEPS[step];
  const last = step === STEPS.length - 1;
  const dismiss = () => { markSeen(); setOpen(false); };
  const next = () => {
    if (last) dismiss();
    else setStep((value) => value + 1);
  };

  return (
    <div className="fixed inset-0 z-[190] pointer-events-auto" role="dialog" aria-modal="true" aria-label="첫 입장 안내">
      <div className="absolute inset-0 bg-slate-950/65" aria-hidden="true" />
      <div className={`absolute ${current.spotlight} rounded-2xl border-2 border-cyan-300 shadow-[0_0_0_9999px_rgba(2,6,23,0.58),0_0_24px_rgba(103,232,249,0.75)] pointer-events-none transition-all duration-300`} aria-hidden="true" />
      <div className={`absolute left-4 right-4 ${current.tip} rounded-2xl border border-cyan-200/70 bg-white px-4 py-3.5 text-slate-800 shadow-2xl shadow-slate-950/40 animate-[scaleIn_0.2s_ease-out]`}>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-2xl" aria-hidden="true">✨</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-cyan-700">여기는 {current.title}예요</p>
            <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">{current.detail}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button type="button" onClick={dismiss} className="min-h-10 rounded-xl px-3 text-xs font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-600">건너뛰기</button>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400" aria-label={`${step + 1}단계 중 ${STEPS.length}단계`}>{step + 1} / {STEPS.length}</span>
            <button type="button" onClick={next} className="min-h-10 rounded-xl bg-cyan-500 px-4 text-xs font-black text-white shadow-sm hover:bg-cyan-600 active:scale-95">{last ? '알겠어요' : '다음'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
