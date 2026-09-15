import { useEffect, useState } from 'react';

type CoachTab = 'profiles' | 'my' | 'stats' | 'ranking' | 'settings';
type CoachStep = { title: string; detail: string; target: string };
type Rect = { top: number; left: number; width: number; height: number };

const HOME_STEPS: readonly CoachStep[] = [
  { title: '참여자 카드', detail: '여기는 오늘 함께하는 사람들의 카드예요. 이름·나이·관심사를 한눈에 확인할 수 있어요.', target: 'participant-card' },
  { title: '하트 보내기', detail: '카드 아래 하트 버튼을 누르면 상대에게 마음을 보낼 수 있어요. 하트 종류와 남은 개수는 위에서 확인해요.', target: 'profile-card-heart-btn' },
  { title: '채팅 시작하기', detail: '카드 아래 채팅 버튼을 누르면 상대와 1:1 대화를 시작해요. 받은 대화는 하트·채팅 탭에서도 확인할 수 있어요.', target: 'profile-card-chat-btn' },
  { title: '카드 뒤집기', detail: '사진을 누르면 카드가 뒤집혀요. 상대가 고른 이상형 태그와 프로필 전체 보기를 확인할 수 있어요.', target: 'participant-card' },
  { title: '잠금 표시', detail: '회색 자물쇠나 흐린 버튼은 현재 잠긴 기능이에요. 행사 조건이 열리면 같은 자리에서 사용할 수 있어요.', target: 'locked-control' },
  { title: '하트 종류와 개수', detail: '오른쪽 위에서 호감·친구·뜨밤·칭찬 하트를 확인해요. 종류마다 오늘 사용할 수 있는 개수가 표시됩니다.', target: 'home-heart-types' },
  { title: '검색과 카드 보기', detail: '검색으로 닉네임·나이·출생년도를 찾고, 새로고침과 작게·2개·3개 보기로 화면을 편하게 정리해요.', target: 'home-controls' },
  { title: '하트·채팅', detail: '하트와 채팅 탭에서 받은 하트, 내 상태, 1:1 채팅과 단체 채팅을 확인할 수 있어요.', target: 'nav-my' },
  { title: '통계·랭킹', detail: '통계에서는 참여 흐름과 하트 지표를, 랭킹에서는 순위와 인기 흐름을 확인해요.', target: 'nav-stats' },
  { title: '내 프로필·설정', detail: '설정에서 고유번호, 아바타, 오늘의 한마디, 관심사와 이상형·내 특징을 관리해요.', target: 'nav-settings' },
];

const SCREEN_STEPS: Record<Exclude<CoachTab, 'profiles'>, readonly CoachStep[]> = {
  my: [
    { title: '내 상태', detail: '받은 하트와 방문자, 내 프로필 상태를 확인하는 화면이에요.', target: 'my-subtabs' },
    { title: '내 채팅', detail: '내 채팅을 누르면 1:1 대화와 단체 채팅방을 오가며 메시지를 이어갈 수 있어요.', target: 'my-subtabs' },
  ],
  stats: [{ title: '통계', detail: '오늘 참여자와 하트 흐름을 숫자와 분포로 확인하는 화면이에요.', target: 'nav-stats' }],
  ranking: [{ title: '랭킹', detail: '참여와 하트 흐름의 순위를 확인하는 화면이에요. 수치는 행사 중 계속 갱신됩니다.', target: 'nav-ranking' }],
  settings: [
    { title: '고유번호', detail: '고유번호는 휴대폰을 바꾸거나 다시 입장할 때 필요한 내 복구 번호예요. 복사해 두세요.', target: 'settings-pin' },
    { title: '도움말·화면 설정', detail: '튜토리얼 보기에서 전체 사용법을 다시 보고, 다크 모드로 화면 색상을 바꿀 수 있어요.', target: 'settings-tools' },
    { title: '아바타·사진', detail: '사진을 올리거나 기본 아바타와 카드 배경을 고를 수 있어요.', target: 'settings-avatar' },
    { title: '오늘의 한마디', detail: '오늘의 한마디는 참여자 카드의 전광판에 보여요. 빠른 문구나 직접 입력으로 남길 수 있어요.', target: 'settings-status' },
    { title: '이상형·내 특징', detail: '대분류를 고른 뒤 소분류와 태그를 선택해요. 기타 직접 작성은 설정에서만 가능합니다.', target: 'settings-signals' },
  ]
};

// v4 replays the complete guide so every user receives the concrete examples.
const KEY_PREFIX = 'binpc2_coach_marks_v4_';

function hasSeen(tab: CoachTab): boolean {
  try { return localStorage.getItem(`${KEY_PREFIX}${tab}`) === '1'; } catch { return false; }
}
function markSeen(tab: CoachTab) {
  try { localStorage.setItem(`${KEY_PREFIX}${tab}`, '1'); } catch { /* private mode */ }
}

export function FirstEntryCoachMarks({ isSubScreen, suspended = false, mainTab }: { isSubScreen: boolean; suspended?: boolean; mainTab: CoachTab }) {
  const [step, setStep] = useState(0);
  const [openTab, setOpenTab] = useState<CoachTab | null>(null);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const steps = mainTab === 'profiles' ? HOME_STEPS : SCREEN_STEPS[mainTab];
  const current = steps[step] ?? steps[0];

  useEffect(() => {
    if (isSubScreen || suspended || hasSeen(mainTab)) {
      setOpenTab(null);
      return;
    }
    setStep(0);
    setOpenTab(mainTab);
  }, [isSubScreen, suspended, mainTab]);

  // Measure one stable anchor per step. Missing anchors intentionally fall back to a centered tip.
  useEffect(() => {
    if (!openTab || openTab !== mainTab || isSubScreen || suspended || !current) {
      setTargetRect(null);
      return;
    }
    let raf = 0;
    const measure = () => {
      const element = document.querySelector<HTMLElement>(`[data-coach="${current.target}"]`);
      const box = element?.getBoundingClientRect();
      if (!box || box.width < 2 || box.height < 2) {
        setTargetRect(null);
        return;
      }
      setTargetRect({ top: box.top, left: box.left, width: box.width, height: box.height });
    };
    raf = window.requestAnimationFrame(measure);
    window.addEventListener('resize', measure, { passive: true });
    return () => { window.cancelAnimationFrame(raf); window.removeEventListener('resize', measure); };
  }, [openTab, mainTab, step, current, isSubScreen, suspended]);

  useEffect(() => {
    if (!openTab) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { markSeen(mainTab); setOpenTab(null); } };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openTab, mainTab]);

  if (!openTab || openTab !== mainTab || isSubScreen || suspended || !current) return null;
  const last = step === steps.length - 1;
  const dismiss = () => { markSeen(mainTab); setOpenTab(null); };
  const next = () => { if (last) dismiss(); else { setTargetRect(null); setStep((value) => value + 1); } };
  const spotlightStyle = targetRect ? {
    top: Math.max(6, targetRect.top - 6),
    left: Math.max(6, targetRect.left - 6),
    width: Math.min(window.innerWidth - Math.max(6, targetRect.left - 6) - 6, targetRect.width + 12),
    height: Math.min(window.innerHeight - Math.max(6, targetRect.top - 6) - 6, targetRect.height + 12),
  } : undefined;
  const tipStyle = targetRect
    ? { top: Math.min(Math.max(12, targetRect.top > window.innerHeight * 0.55 ? targetRect.top - 170 : targetRect.top + targetRect.height + 14), window.innerHeight - 190) }
    : { top: '50%', transform: 'translateY(-50%)' };

  return (
    <div className="fixed inset-0 z-[190] pointer-events-auto" role="dialog" aria-modal="true" aria-label={`${current.title} 첫 이용 안내`}>
      <div className="absolute inset-0 bg-slate-950/65" aria-hidden="true" />
      {spotlightStyle && <div className="absolute rounded-2xl border-2 border-cyan-300 shadow-[0_0_0_9999px_rgba(2,6,23,0.58),0_0_24px_rgba(103,232,249,0.75)] pointer-events-none transition-all duration-200" style={spotlightStyle} aria-hidden="true" />}
      <div className="absolute left-4 right-4 mx-auto max-w-md rounded-2xl border border-cyan-200/70 bg-white px-4 py-3.5 text-slate-800 shadow-2xl shadow-slate-950/40" style={tipStyle}>
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
