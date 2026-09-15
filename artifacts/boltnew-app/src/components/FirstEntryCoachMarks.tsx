import { useEffect, useState } from 'react';

type CoachTab = 'profiles' | 'my' | 'stats' | 'ranking' | 'settings';

type CoachStep = {
  title: string;
  detail: string;
  spotlight: string;
  tip: string;
};

const HOME_STEPS: readonly CoachStep[] = [
  {
    title: '참여자 카드',
    detail: '카드 아래 버튼으로 하트를 보내거나 채팅을 시작해요.',
    spotlight: 'top-[18%] left-[3%] right-[3%] h-[46%]',
    tip: 'bottom-[calc(8.5rem+var(--tabbar-safe-bottom))]',
  },
  {
    title: '카드 뒤집기',
    detail: '사진을 누르면 뒤집혀서 상대의 이상형 태그를 볼 수 있어요.',
    spotlight: 'top-[22%] left-[8%] right-[8%] h-[34%]',
    tip: 'bottom-[calc(8.5rem+var(--tabbar-safe-bottom))]',
  },
  {
    title: '하트 종류와 개수',
    detail: '오른쪽 위에서 오늘 쓸 수 있는 하트 종류별 개수를 확인해요.',
    spotlight: 'top-[1%] right-[2%] w-[48%] h-[9%]',
    tip: 'top-[12%]',
  },
  {
    title: '검색·카드 보기',
    detail: '검색창과 새로고침, 작게·2개·3개 보기로 카드를 정리해요.',
    spotlight: 'top-[11%] left-[3%] right-[3%] h-[10%]',
    tip: 'top-[22%]',
  },
  {
    title: '잠금 표시',
    detail: '회색 자물쇠나 흐린 버튼은 아직 잠긴 기능이에요.',
    spotlight: 'top-[18%] left-[3%] right-[3%] h-[46%]',
    tip: 'bottom-[calc(8.5rem+var(--tabbar-safe-bottom))]',
  },
  {
    title: '하트·채팅',
    detail: '여기서 받은 하트와 내 채팅을 한곳에서 확인해요.',
    spotlight: 'bottom-[var(--tabbar-safe-bottom)] left-[20%] w-[20%] h-[4.75rem]',
    tip: 'bottom-[calc(8.5rem+var(--tabbar-safe-bottom))]',
  },
  {
    title: '통계·랭킹',
    detail: '참여 흐름과 하트 순위를 확인할 수 있어요.',
    spotlight: 'bottom-[var(--tabbar-safe-bottom)] left-[40%] w-[40%] h-[4.75rem]',
    tip: 'bottom-[calc(8.5rem+var(--tabbar-safe-bottom))]',
  },
  {
    title: '내 프로필·설정',
    detail: '내 상태, 프로필, 아바타는 설정에서 바꿀 수 있어요.',
    spotlight: 'bottom-[var(--tabbar-safe-bottom)] right-0 w-[20%] h-[4.75rem]',
    tip: 'bottom-[calc(8.5rem+var(--tabbar-safe-bottom))]',
  },
];

const SCREEN_STEPS: Record<Exclude<CoachTab, 'profiles'>, readonly CoachStep[]> = {
  my: [
    { title: '내 상태', detail: '받은 하트와 방문자, 내 프로필 상태를 확인해요.', spotlight: 'top-[15%] left-[4%] right-[4%] h-[23%]', tip: 'top-[40%]' },
    { title: '내 채팅', detail: '1:1 채팅과 단체 채팅을 이 탭에서 오가요.', spotlight: 'top-[15%] left-[4%] right-[4%] h-[23%]', tip: 'top-[40%]' },
  ],
  stats: [
    { title: '통계 화면', detail: '오늘의 참여자·하트·관심사 흐름을 한눈에 봐요.', spotlight: 'top-[13%] left-[4%] right-[4%] h-[65%]', tip: 'bottom-[calc(8.5rem+var(--tabbar-safe-bottom))]' },
  ],
  ranking: [
    { title: '랭킹 화면', detail: '하트와 참여 지표의 순위를 확인해요.', spotlight: 'top-[13%] left-[4%] right-[4%] h-[65%]', tip: 'bottom-[calc(8.5rem+var(--tabbar-safe-bottom))]' },
  ],
  settings: [
    { title: '프로필 설정', detail: '사진·닉네임·출생년도와 관심사를 관리해요.', spotlight: 'top-[13%] left-[4%] right-[4%] h-[35%]', tip: 'bottom-[calc(8.5rem+var(--tabbar-safe-bottom))]' },
    { title: '내 성향 상세', detail: '이상형과 나의 특징은 소분류를 골라 채워요.', spotlight: 'top-[35%] left-[4%] right-[4%] h-[38%]', tip: 'top-[15%]' },
  ],
};

const KEY_PREFIX = 'binpc2_coach_marks_v2_';

function hasSeen(tab: CoachTab): boolean {
  try { return localStorage.getItem(`${KEY_PREFIX}${tab}`) === '1'; } catch { return false; }
}

function markSeen(tab: CoachTab) {
  try { localStorage.setItem(`${KEY_PREFIX}${tab}`, '1'); } catch { /* private mode */ }
}

export function FirstEntryCoachMarks({
  isSubScreen,
  suspended = false,
  mainTab,
}: {
  isSubScreen: boolean;
  suspended?: boolean;
  mainTab: CoachTab;
}) {
  const [step, setStep] = useState(0);
  const [openTab, setOpenTab] = useState<CoachTab | null>(null);

  const steps = mainTab === 'profiles' ? HOME_STEPS : SCREEN_STEPS[mainTab];

  useEffect(() => {
    if (isSubScreen || suspended || hasSeen(mainTab)) {
      setOpenTab(null);
      return;
    }
    setStep(0);
    setOpenTab(mainTab);
  }, [isSubScreen, suspended, mainTab]);

  if (!openTab || openTab !== mainTab || isSubScreen || suspended) return null;
  const current = steps[step] ?? steps[0];
  const last = step === steps.length - 1;
  const dismiss = () => { markSeen(mainTab); setOpenTab(null); };
  const next = () => {
    if (last) dismiss();
    else setStep((value) => value + 1);
  };

  return (
    <div className="fixed inset-0 z-[190] pointer-events-auto" role="dialog" aria-modal="true" aria-label={`${current.title} 첫 이용 안내`}>
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
            <span className="text-[10px] font-bold text-slate-400" aria-label={`${step + 1}단계 중 ${steps.length}단계`}>{step + 1} / {steps.length}</span>
            <button type="button" onClick={next} className="min-h-10 rounded-xl bg-cyan-500 px-4 text-xs font-black text-white shadow-sm hover:bg-cyan-600 active:scale-95">{last ? '알겠어요' : '다음'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
