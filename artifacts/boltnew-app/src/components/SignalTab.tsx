import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Profile, UserSignal } from '../types/app';
import type { HeartType } from '../lib/constants';
import { getKoreanAge, getAvatarSrc, hasUploadedPhoto, getAvatarGradientCss, isSwipeGestureVerifyProfile } from '../lib/profile';
import {
  SIGNAL_CARD_PROFILE_CTA,
  SIGNAL_CARD_SIGNAL_CTA,
  SIGNAL_CARD_SKIP_CTA,
  SIGNAL_EMPTY_DECK_HINT,
  SIGNAL_EMPTY_DECK_TITLE,
  SIGNAL_GUIDE_CTA,
  SIGNAL_GUIDE_LEAD,
  SIGNAL_GUIDE_POINTS,
  SIGNAL_GUIDE_TITLE,
  SIGNAL_MISSION_COPY,
  SIGNAL_MISSION_GOAL,
  SIGNAL_MISSION_TITLE,
  SIGNAL_SWIPE_HINT,
  SIGNAL_SWIPE_LEFT_EXPLAIN,
  SIGNAL_SWIPE_LEFT_LABEL,
  SIGNAL_SWIPE_RIGHT_EXPLAIN,
  SIGNAL_SWIPE_RIGHT_LABEL,
  countTodayInterestMission,
  hasInterestHeart,
  isSignalDeckUnlocked,
  missionToastKey,
  recommendSignals,
  seoulDateKey,
  type SignalMatch,
} from '../lib/signal-match';
import {
  SWIPE_ACTIVATE_PX,
  SWIPE_EXIT_MS,
  SWIPE_SPRING_MS,
  SWIPE_STACK_LIFT,
  cardTransform,
  nextCardScale,
  shouldCommitSwipe,
  stampOpacity,
  swipeExitX,
  updateSwipeVelocity,
} from '../lib/signal-swipe';

type DeckCard = SignalMatch & { profile: Profile };
type SwipePhase = 'idle' | 'drag' | 'spring' | 'exit';

function SignalPhotoCard({
  profile,
  imgFailed,
  onImgError,
  dragX,
  showStamps,
}: {
  profile: Profile;
  imgFailed: boolean;
  onImgError: () => void;
  dragX: number;
  showStamps: boolean;
}) {
  const pastel = !hasUploadedPhoto(profile.photo_url) || imgFailed;
  const photoSrc = getAvatarSrc(profile.photo_url, profile.nickname);
  const leftOp = showStamps ? stampOpacity(dragX, 'left') : 0;
  const rightOp = showStamps ? stampOpacity(dragX, 'right') : 0;
  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-3xl shadow-xl"
      style={{
        aspectRatio: '5 / 6',
        background: pastel ? getAvatarGradientCss(profile.nickname) : '#111',
      }}
    >
      <img
        src={photoSrc}
        alt=""
        onError={onImgError}
        className={`absolute inset-0 h-full w-full ${pastel ? 'object-contain' : 'object-cover object-center'}`}
        draggable={false}
      />
      {showStamps && (
        <>
          <div
            className="pointer-events-none absolute top-6 left-4 rounded-xl border-[4px] border-slate-200 bg-black/25 px-3 py-1 text-[22px] font-black tracking-wide text-slate-100"
            style={{ opacity: leftOp, transform: `rotate(-18deg) scale(${0.86 + 0.14 * leftOp})` }}
            data-testid="signal-stamp-pass"
          >
            {SIGNAL_SWIPE_LEFT_LABEL}
          </div>
          <div
            className="pointer-events-none absolute top-6 right-4 rounded-xl border-[4px] border-rose-300 bg-rose-500/20 px-3 py-1 text-[22px] font-black tracking-wide text-rose-100"
            style={{ opacity: rightOp, transform: `rotate(18deg) scale(${0.86 + 0.14 * rightOp})` }}
            data-testid="signal-stamp-signal"
          >
            {SIGNAL_SWIPE_RIGHT_LABEL}
          </div>
        </>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-4 pt-10 pb-3">
        <p className="text-xl font-black leading-tight text-white">
          {profile.nickname}
          <span className="ml-2 text-sm font-semibold text-white/80">{getKoreanAge(profile.birth_year)}</span>
        </p>
        {profile.mbti && (
          <p className="mt-0.5 text-[11px] font-bold text-white/80">{profile.mbti}</p>
        )}
      </div>
    </div>
  );
}

export function SignalTab({
  profiles,
  currentUserId,
  userSignals,
  sentHeartsPerPerson,
  persistedMissionCount = 0,
  alreadySignaledIds,
  blockedUserIds,
  hiddenByIds,
  functionsLocked,
  darkMode,
  onSendSignal,
  onPassSignal,
  onSelect,
  onGoProfiles,
  onMissionComplete,
}: {
  profiles: Profile[];
  currentUserId: string | null;
  userSignals: UserSignal[];
  sentHeartsPerPerson: Map<string, Set<HeartType>>;
  persistedMissionCount?: number;
  alreadySignaledIds?: Set<string>;
  blockedUserIds: Set<string>;
  hiddenByIds: Set<string>;
  functionsLocked?: boolean;
  darkMode: boolean;
  onSendSignal: (id: string) => void;
  onPassSignal: (id: string) => void;
  onSelect: (p: Profile) => void;
  onGoProfiles?: () => void;
  onMissionComplete?: () => void;
}) {
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [fetchedMissionCount, setFetchedMissionCount] = useState<number | null>(null);
  const [imgFailedIds, setImgFailedIds] = useState<Set<string>>(new Set());
  const [dragX, setDragX] = useState(0);
  const [swipePhase, setSwipePhase] = useState<SwipePhase>('idle');
  const [swipeLocked, setSwipeLocked] = useState(false);

  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastT: number;
    vx: number;
    dragging: boolean;
  } | null>(null);
  const liveXRef = useRef(0);
  const didSwipeRef = useRef(false);
  const swipeLockRef = useRef(false);
  const pendingCommitRef = useRef<{ id: string; dir: 'left' | 'right' } | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const frontRef = useRef<HTMLDivElement>(null);

  const me = useMemo(
    () => profiles.find((p) => p.id === currentUserId) ?? null,
    [profiles, currentUserId],
  );
  const mySignal = useMemo(
    () => userSignals.find((s) => s.user_id === currentUserId),
    [userSignals, currentUserId],
  );
  const signalByUser = useMemo(() => {
    const m = new Map<string, UserSignal>();
    for (const s of userSignals) m.set(s.user_id, s);
    return m;
  }, [userSignals]);

  const alreadyInterestedIds = useMemo(() => {
    const s = new Set<string>();
    sentHeartsPerPerson.forEach((types, id) => {
      if (hasInterestHeart(types)) s.add(id);
    });
    return s;
  }, [sentHeartsPerPerson]);

  const likedAllTypeIds = useMemo(() => {
    const s = new Set<string>();
    sentHeartsPerPerson.forEach((types, id) => {
      if (types.size >= 4) s.add(id);
    });
    return s;
  }, [sentHeartsPerPerson]);

  const missionCount = Math.max(persistedMissionCount, fetchedMissionCount ?? 0);
  const unlocked = isSignalDeckUnlocked(missionCount);
  const signaled = alreadySignaledIds ?? new Set<string>();

  const deck = useMemo(() => {
    if (!unlocked || !me || !currentUserId) return [] as DeckCard[];
    const byId = new Map<string, Profile>();
    for (const p of profiles) byId.set(p.id, p);
    const ranked = recommendSignals({
      myId: currentUserId,
      myProfile: me,
      myIdealMsg: mySignal?.ideal_msg,
      myFeatureMsg: mySignal?.feature_msg,
      myStatusMsg: mySignal?.status_msg,
      candidates: profiles
        .filter((p) => !skippedIds.has(p.id) && !isSwipeGestureVerifyProfile(p))
        .map((p) => ({
          profile: p,
          idealMsg: signalByUser.get(p.id)?.ideal_msg,
          featureMsg: signalByUser.get(p.id)?.feature_msg,
          statusMsg: signalByUser.get(p.id)?.status_msg,
        })),
      blockedIds: blockedUserIds,
      hiddenIds: hiddenByIds,
      alreadyInterestedIds,
      alreadySignaledIds: signaled,
      likedAllTypeIds,
    });
    return ranked
      .map((m) => {
        const profile = byId.get(m.profileId);
        return profile ? { ...m, profile } : null;
      })
      .filter((x): x is DeckCard => x != null);
  }, [
    unlocked, me, currentUserId, mySignal, profiles,
    signalByUser, skippedIds, blockedUserIds, hiddenByIds, alreadyInterestedIds, signaled, likedAllTypeIds,
  ]);

  const current = deck[0] ?? null;
  const next = deck[1] ?? null;

  const toastedRef = useRef(false);

  useEffect(() => {
    setFetchedMissionCount(null);
    toastedRef.current = false;
  }, [currentUserId]);

  const refreshMission = useCallback(async () => {
    if (!currentUserId) return;
    try {
      const { data, error } = await supabase
        .from('likes')
        .select('liked_id, heart_type, created_at')
        .eq('liker_id', currentUserId);
      if (error || !data) return;
      const n = countTodayInterestMission(data as { liked_id: string; heart_type: string | null; created_at: string }[]);
      setFetchedMissionCount(n);
    } catch { /* stale */ }
  }, [currentUserId]);

  useEffect(() => {
    void refreshMission();
  }, [refreshMission, sentHeartsPerPerson]);

  useEffect(() => {
    if (!currentUserId || missionCount < SIGNAL_MISSION_GOAL || toastedRef.current) return;
    const key = missionToastKey(currentUserId, seoulDateKey());
    try {
      if (!localStorage.getItem(key)) {
        toastedRef.current = true;
        localStorage.setItem(key, '1');
        onMissionComplete?.();
      } else {
        toastedRef.current = true;
      }
    } catch {
      toastedRef.current = true;
      onMissionComplete?.();
    }
  }, [currentUserId, missionCount, onMissionComplete]);

  useEffect(() => {
    liveXRef.current = 0;
    setDragX(0);
    setSwipePhase('idle');
    dragRef.current = null;
    swipeLockRef.current = false;
    setSwipeLocked(false);
  }, [current?.profile.id]);

  useEffect(() => () => {
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
  }, []);

  const advanceLocal = useCallback((id: string) => {
    setSkippedIds((prev) => new Set([...prev, id]));
  }, []);

  const applySideEffect = useCallback((id: string, dir: 'left' | 'right') => {
    advanceLocal(id);
    if (dir === 'right') onSendSignal(id);
    else onPassSignal(id);
  }, [advanceLocal, onSendSignal, onPassSignal]);

  const finishExit = useCallback(() => {
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    const pending = pendingCommitRef.current;
    if (!pending) return;
    pendingCommitRef.current = null;
    liveXRef.current = 0;
    setDragX(0);
    setSwipePhase('idle');
    applySideEffect(pending.id, pending.dir);
  }, [applySideEffect]);

  const startExit = useCallback((id: string, dir: 'left' | 'right') => {
    if (swipeLockRef.current || functionsLocked) return;
    swipeLockRef.current = true;
    setSwipeLocked(true);
    didSwipeRef.current = true;
    pendingCommitRef.current = { id, dir };
    const width = stackRef.current?.offsetWidth ?? 320;
    const x = swipeExitX(dir, width);
    liveXRef.current = x;
    setDragX(x);
    setSwipePhase('exit');
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    exitTimerRef.current = setTimeout(finishExit, SWIPE_EXIT_MS + 60);
  }, [finishExit, functionsLocked]);

  const passCard = useCallback((id: string) => {
    if (functionsLocked) return;
    startExit(id, 'left');
  }, [functionsLocked, startExit]);

  const sendCard = useCallback((id: string) => {
    if (functionsLocked) return;
    startExit(id, 'right');
  }, [functionsLocked, startExit]);

  const card = current?.profile;
  const progress = Math.min(SIGNAL_MISSION_GOAL, missionCount);
  const inputLocked = !!functionsLocked || swipePhase === 'exit' || swipeLocked;
  const peekScale = nextCardScale(dragX);
  const frontTransition = swipePhase === 'drag' || swipePhase === 'idle'
    ? 'none'
    : swipePhase === 'exit'
      ? `transform ${SWIPE_EXIT_MS}ms ease-in`
      : `transform ${SWIPE_SPRING_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (functionsLocked || !card || swipeLockRef.current || swipePhase === 'exit') return;
    didSwipeRef.current = false;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* */ }
    const now = e.timeStamp || Date.now();
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastT: now,
      vx: 0,
      dragging: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId || swipeLockRef.current) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    const now = e.timeStamp || Date.now();
    d.vx = updateSwipeVelocity(d.vx, e.clientX - d.lastX, now - d.lastT);
    d.lastX = e.clientX;
    d.lastT = now;
    if (!d.dragging && Math.abs(dx) > SWIPE_ACTIVATE_PX && Math.abs(dx) > Math.abs(dy) * 1.15) {
      d.dragging = true;
      didSwipeRef.current = true;
      setSwipePhase('drag');
    }
    if (!d.dragging) return;
    liveXRef.current = dx;
    setDragX(dx);
  };

  const endPointer = (e?: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    if (e && d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (!card || swipeLockRef.current) return;
    if (!d.dragging) {
      setSwipePhase('idle');
      return;
    }
    const x = liveXRef.current;
    const commit = shouldCommitSwipe(x, d.vx);
    if (commit) {
      startExit(card.id, commit);
      return;
    }
    liveXRef.current = 0;
    setDragX(0);
    setSwipePhase('spring');
  };

  const onFrontTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.propertyName !== 'transform') return;
    if (swipePhase === 'exit') finishExit();
    else if (swipePhase === 'spring') setSwipePhase('idle');
  };

  return (
    <div className="space-y-3 overflow-x-clip pb-24">
      <div className={`rounded-2xl border px-4 py-3 ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-rose-50 border-rose-200'}`}>
        <p className={`text-sm font-black ${darkMode ? 'text-white' : 'text-rose-800'}`}>
          💕 {SIGNAL_MISSION_TITLE}
        </p>
        <p className={`text-xs mt-0.5 ${darkMode ? 'text-slate-300' : 'text-rose-600'}`}>
          {SIGNAL_MISSION_COPY}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <div className={`flex-1 h-2 rounded-full overflow-hidden ${darkMode ? 'bg-slate-700' : 'bg-rose-100'}`}>
            <div
              className="h-full bg-rose-500 transition-all"
              style={{ width: `${(progress / SIGNAL_MISSION_GOAL) * 100}%` }}
            />
          </div>
          <span className={`text-xs font-black tabular-nums ${darkMode ? 'text-rose-300' : 'text-rose-700'}`}>
            {progress}/{SIGNAL_MISSION_GOAL}
          </span>
        </div>
        {unlocked && (
          <p className="text-xs font-bold text-emerald-500 mt-2">🎉 미션 완료! 새로운 추천 상대를 확인해보세요.</p>
        )}
      </div>

      {functionsLocked ? (
        <div className={`rounded-2xl border px-5 py-12 text-center ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-200'}`}>
          <p className="text-3xl mb-2">🔒</p>
          <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
            행사 중에는 시그널을 사용할 수 없어요
          </p>
          <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>
            하트·채팅·시그널·단톡·운세가 잠시 멈춰 있어요
          </p>
        </div>
      ) : !unlocked ? (
        <div className={`rounded-2xl border px-5 py-6 ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-200'}`}>
          <p className="text-2xl mb-2">📖</p>
          <p className={`text-sm font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {SIGNAL_GUIDE_TITLE}
          </p>
          <p className={`text-xs mt-1.5 leading-relaxed ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>
            {SIGNAL_GUIDE_LEAD}
          </p>
          <div className={`mt-4 rounded-2xl px-3 py-3 ${darkMode ? 'bg-slate-700/80' : 'bg-rose-50 border border-rose-100'}`}>
            <p className={`text-[11px] font-black text-center ${darkMode ? 'text-rose-200' : 'text-rose-700'}`}>
              틴더처럼 밀어보세요
            </p>
            <p className={`text-xs font-bold text-center mt-1 ${darkMode ? 'text-slate-200' : 'text-gray-700'}`}>
              {SIGNAL_SWIPE_HINT}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-bold">
              <p className={darkMode ? 'text-slate-300' : 'text-gray-600'}>{SIGNAL_SWIPE_LEFT_EXPLAIN}</p>
              <p className={`text-right ${darkMode ? 'text-rose-200' : 'text-rose-600'}`}>{SIGNAL_SWIPE_RIGHT_EXPLAIN}</p>
            </div>
          </div>
          <ul className={`mt-3 space-y-2 text-xs leading-relaxed ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>
            {SIGNAL_GUIDE_POINTS.map((line) => (
              <li key={line} className="flex gap-2">
                <span className="text-rose-400 font-black">·</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => onGoProfiles?.()}
            className="mt-5 w-full py-3 rounded-2xl text-sm font-black text-white bg-rose-500 hover:bg-rose-600 active:scale-95 transition-all"
          >
            {SIGNAL_GUIDE_CTA}
          </button>
        </div>
      ) : !card ? (
        <div className={`rounded-2xl border px-5 py-12 text-center ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-200'}`}>
          <p className="text-3xl mb-2">💕</p>
          <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
            {SIGNAL_EMPTY_DECK_TITLE}
          </p>
          <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>
            {SIGNAL_EMPTY_DECK_HINT}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className={`rounded-2xl px-3 py-2 flex items-center justify-between text-[11px] font-black ${
            darkMode ? 'bg-slate-800 border border-slate-600 text-slate-200' : 'bg-white border border-rose-100 text-gray-700'
          }`}>
            <span>{SIGNAL_SWIPE_LEFT_EXPLAIN}</span>
            <span className={darkMode ? 'text-rose-200' : 'text-rose-600'}>{SIGNAL_SWIPE_RIGHT_EXPLAIN}</span>
          </div>
          <div
            ref={stackRef}
            className="relative w-full"
            style={{ aspectRatio: '5 / 6' }}
            data-testid="signal-swipe-stack"
          >
            {next && (
              <div
                className="pointer-events-none absolute inset-0 z-0"
                style={{
                  transform: `translateY(${(1 - peekScale) * SWIPE_STACK_LIFT}px) scale(${peekScale})`,
                  transformOrigin: 'center bottom',
                }}
                data-testid="signal-swipe-next"
              >
                <SignalPhotoCard
                  profile={next.profile}
                  imgFailed={imgFailedIds.has(next.profile.id)}
                  onImgError={() => setImgFailedIds((prev) => new Set([...prev, next.profile.id]))}
                  dragX={0}
                  showStamps={false}
                />
              </div>
            )}
            <div
              ref={frontRef}
              className="absolute inset-0 z-10 select-none"
              data-testid="signal-swipe-front"
              style={{
                transform: cardTransform(dragX),
                transition: frontTransition,
                willChange: swipePhase === 'drag' || swipePhase === 'exit' ? 'transform' : undefined,
                touchAction: 'none',
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endPointer}
              onPointerCancel={endPointer}
              onLostPointerCapture={() => endPointer()}
              onTransitionEnd={onFrontTransitionEnd}
            >
              <button
                type="button"
                onClick={() => {
                  if (inputLocked || didSwipeRef.current) return;
                  onSelect(card);
                }}
                className="block h-full w-full text-left"
              >
                <SignalPhotoCard
                  profile={card}
                  imgFailed={imgFailedIds.has(card.id)}
                  onImgError={() => setImgFailedIds((prev) => new Set([...prev, card.id]))}
                  dragX={dragX}
                  showStamps
                />
              </button>
            </div>
          </div>
          <div className={`rounded-3xl border px-4 py-3 space-y-2 ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-200'}`}>
            <p className={`text-[11px] font-bold text-center ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
              {SIGNAL_SWIPE_HINT}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {current.reasons.map((r) => (
                <span
                  key={r.key}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                    darkMode ? 'bg-rose-500/20 text-rose-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}
                >
                  {r.label}
                </span>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={inputLocked}
                onClick={() => { if (!inputLocked) passCard(card.id); }}
                className={`flex-1 py-3 rounded-2xl text-sm font-bold border active:scale-95 transition-all disabled:opacity-40 ${
                  darkMode
                    ? 'bg-slate-700 border-slate-500 text-slate-200'
                    : 'bg-gray-50 border-gray-200 text-gray-700'
                }`}
              >
                {SIGNAL_CARD_SKIP_CTA}
              </button>
              <button
                type="button"
                disabled={inputLocked}
                onClick={() => { if (!inputLocked) onSelect(card); }}
                className={`flex-1 py-3 rounded-2xl text-sm font-black border active:scale-95 transition-all disabled:opacity-40 ${
                  darkMode
                    ? 'bg-slate-600 border-slate-400 text-white'
                    : 'bg-white border-rose-200 text-rose-700'
                }`}
              >
                {SIGNAL_CARD_PROFILE_CTA}
              </button>
            </div>
            <button
              type="button"
              disabled={inputLocked}
              onClick={() => { if (!inputLocked) sendCard(card.id); }}
              className={`w-full py-2.5 rounded-2xl text-sm font-bold border active:scale-95 transition-all disabled:opacity-40 ${
                darkMode
                  ? 'bg-transparent border-rose-400/60 text-rose-200'
                  : 'bg-rose-50 border-rose-200 text-rose-600'
              }`}
            >
              💕 {SIGNAL_CARD_SIGNAL_CTA}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
