import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { hasCompletedFirstEntryCoach, markFirstEntryCoachSeen } from '../lib/coach-marks';

type CoachTab = 'profiles' | 'my' | 'stats' | 'ranking' | 'settings';
type CoachStep = { title: string; detail: string; target: string };
type Rect = { top: number; left: number; width: number; height: number };

const HOME_STEPS: readonly CoachStep[] = [
  { title: '참여자 카드', detail: '여기는 오늘 함께하는 사람들의 카드예요. 이름·나이·관심사를 한눈에 확인할 수 있어요.', target: 'participant-card' },
  { title: '하트 보내기', detail: '카드 아래 하트 버튼을 누르면 상대에게 마음을 보낼 수 있어요. 하트 종류와 남은 개수는 위에서 확인해요.', target: 'profile-card-heart-btn' },
  { title: '채팅 시작하기', detail: '카드 아래 채팅 버튼을 누르면 상대와 1:1 대화를 시작해요. 받은 대화는 하트·채팅 탭에서도 확인할 수 있어요.', target: 'profile-card-chat-btn' },
  { title: '카드 뒤집기', detail: '사진 가운데를 누르면 카드가 뒤집혀요. 상대가 고른 이상형 태그와 프로필 전체 보기를 확인할 수 있어요.', target: 'profile-card-flip' },
  { title: '잠금 표시', detail: '회색 자물쇠나 흐린 버튼은 아직 잠긴 기능이에요. 잠금 표시가 없으면 이 단계는 안내 위치에서 설명해요.', target: 'locked-control' },
  { title: '참여자 더보기', detail: '카드의 ⋯ 버튼을 누르면 연락처 보내기·궁합 보기·차단 같은 메뉴를 열 수 있어요. 작은 화면에서도 메뉴가 화면 안에 열려요.', target: 'participant-more' },
  { title: '하트 종류와 개수', detail: '오른쪽 위에서 호감·친구·뜨밤·칭찬 하트를 확인해요. 종류마다 오늘 사용할 수 있는 개수가 표시됩니다.', target: 'home-heart-types' },
  { title: '검색과 카드 보기', detail: '검색으로 닉네임·나이·출생년도를 찾고, 새로고침과 작게·2개·3개 보기로 화면을 편하게 정리해요.', target: 'home-controls' },
  { title: '하트·채팅', detail: '하트와 채팅 탭에서 받은 하트, 내 상태, 1:1 채팅과 단체 채팅을 확인할 수 있어요.', target: 'nav-my' },
  { title: '통계·랭킹', detail: '통계에서는 참여 흐름과 하트 지표를, 랭킹에서는 순위와 인기 흐름을 확인해요.', target: 'nav-stats' },
  { title: '내 프로필·설정', detail: '설정에서 고유번호, 아바타, 오늘의 한마디, 관심사와 이상형·내 특징을 관리해요. 설정의 ‘설명 다시보기’에서 이 안내를 언제든 다시 볼 수 있어요.', target: 'nav-settings' },
];

function initialOpenTab(replayToken: number): CoachTab | null {
  // First paint must not wait on useEffect — otherwise tip 1 never appears if a later
  // tab race / overlay suspends the effect before openTab is seeded.
  if (replayToken > 0) return 'profiles';
  try {
    return hasCompletedFirstEntryCoach() ? null : 'profiles';
  } catch {
    return 'profiles';
  }
}

export function FirstEntryCoachMarks({ isSubScreen, suspended = false, mainTab, replayToken = 0, onForceParticipants }: { isSubScreen: boolean; suspended?: boolean; mainTab: CoachTab; replayToken?: number; onForceParticipants?: () => void }) {
  const [step, setStep] = useState(0);
  const [openTab, setOpenTab] = useState<CoachTab | null>(() => initialOpenTab(replayToken));
  const handledReplayRef = useRef(0);
  const replayModeRef = useRef(replayToken > 0);
  // Keep force callback out of effect deps — inline App lambdas would reset step 0 every render.
  const forceParticipantsRef = useRef(onForceParticipants);
  forceParticipantsRef.current = onForceParticipants;
  // Once the home tour has opened, never re-seed step 0 on incidental effect re-runs.
  const homeTourStartedRef = useRef(initialOpenTab(replayToken) === 'profiles');
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  // Defer one frame so MainScreen commits; avoid double-rAF races that never painted tip 1.
  const [shellPainted, setShellPainted] = useState(() => replayToken > 0);
  // Visible coach during first-entry/replay is always the participant home tour.
  // Home-only tour (per-tab SCREEN_STEPS retired after tip-1 / replay fixes).
  const steps = HOME_STEPS;
  const current = steps[Math.min(step, steps.length - 1)] ?? steps[0];

  useLayoutEffect(() => {
    if (replayToken > 0) {
      setShellPainted(true);
      return;
    }
    let cancelled = false;
    const id = window.requestAnimationFrame(() => {
      if (!cancelled) setShellPainted(true);
    });
    // Safety: if rAF is stalled (background tab), still open tip 1 promptly.
    const fallback = window.setTimeout(() => {
      if (!cancelled) setShellPainted(true);
    }, 120);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(id);
      window.clearTimeout(fallback);
    };
  }, [replayToken]);

  // Layout: force participants before paint so openTab===mainTab on the first visible frame.
  useLayoutEffect(() => {
    const replaying = replayToken > 0 && replayToken !== handledReplayRef.current;
    const tourPending = replaying || replayModeRef.current || !hasCompletedFirstEntryCoach();
    if (!tourPending || isSubScreen || suspended) return;
    if (mainTab !== 'profiles') forceParticipantsRef.current?.();
  }, [isSubScreen, suspended, mainTab, replayToken]);

  useEffect(() => {
    const replaying = replayToken > 0 && replayToken !== handledReplayRef.current;
    if (replaying) {
      // Replay is always a fresh, deterministic tour beginning at participants.
      handledReplayRef.current = replayToken;
      replayModeRef.current = true;
      homeTourStartedRef.current = true;
      setStep(0);
      setOpenTab('profiles');
      if (mainTab !== 'profiles') forceParticipantsRef.current?.();
      return;
    }
    if (isSubScreen || suspended) {
      // Pause overlay while covered; do not clear openTab/step (avoids skipping tip 1 on return).
      return;
    }
    const tourPending = replayModeRef.current || !hasCompletedFirstEntryCoach();
    if (!tourPending) {
      homeTourStartedRef.current = false;
      setOpenTab(null);
      return;
    }
    // Until the participant home tour finishes, stay on profiles — never open hearts/chat tips first.
    if (mainTab !== 'profiles') {
      forceParticipantsRef.current?.();
      // Keep openTab='profiles' (not null) so tip 1 mounts as soon as the tab arrives.
      if (!homeTourStartedRef.current) {
        homeTourStartedRef.current = true;
        setStep(0);
      }
      setOpenTab('profiles');
      return;
    }
    if (!homeTourStartedRef.current) {
      homeTourStartedRef.current = true;
      setStep(0);
    }
    setOpenTab('profiles');
  }, [isSubScreen, suspended, mainTab, replayToken]);

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
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { replayModeRef.current = false; homeTourStartedRef.current = false; markFirstEntryCoachSeen('profiles'); setOpenTab(null); } };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openTab, mainTab]);

  if (!shellPainted || !openTab || openTab !== mainTab || isSubScreen || suspended || !current) return null;
  const last = step === steps.length - 1;
  const dismiss = () => { replayModeRef.current = false; homeTourStartedRef.current = false; markFirstEntryCoachSeen('profiles'); setOpenTab(null); };
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
    <div className="fixed inset-0 z-[210] pointer-events-auto" role="dialog" aria-modal="true" aria-label={`${current.title} 첫 이용 안내`} data-testid="first-entry-coach">
      <div className="absolute inset-0 bg-slate-950/65" aria-hidden="true" />
      {spotlightStyle && <div className="absolute rounded-2xl border-2 border-cyan-300 shadow-[0_0_0_9999px_rgba(2,6,23,0.58),0_0_24px_rgba(103,232,249,0.75)] pointer-events-none transition-all duration-200" style={spotlightStyle} aria-hidden="true" />}
      <div className="absolute left-4 right-4 mx-auto max-w-md rounded-2xl border border-cyan-200/70 bg-white px-4 py-3.5 text-slate-800 shadow-2xl shadow-slate-950/40" style={tipStyle} data-testid="first-entry-coach-tip">
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
