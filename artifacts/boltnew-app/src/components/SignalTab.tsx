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

const SWIPE_COMMIT_PX = 72;

export function SignalTab({
  profiles,
  currentUserId,
  userSignals,
  sentHeartsPerPerson,
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
  const [missionCount, setMissionCount] = useState(0);
  const [imgFailed, setImgFailed] = useState(false);
  const [dragX, setDragX] = useState(0);
  const dragRef = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
  const didSwipeRef = useRef(false);

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

  const unlocked = isSignalDeckUnlocked(missionCount);
  const signaled = alreadySignaledIds ?? new Set<string>();

  const deck = useMemo(() => {
    if (!unlocked || !me || !currentUserId) return [] as Array<SignalMatch & { profile: Profile }>;
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
      .filter((x): x is SignalMatch & { profile: Profile } => x != null);
  }, [
    unlocked, me, currentUserId, mySignal, profiles,
    signalByUser, skippedIds, blockedUserIds, hiddenByIds, alreadyInterestedIds, signaled, likedAllTypeIds,
  ]);

  const current = deck[0] ?? null;

  const toastedRef = useRef(false);

  const refreshMission = useCallback(async () => {
    if (!currentUserId) return;
    try {
      const { data, error } = await supabase
        .from('likes')
        .select('liked_id, heart_type, created_at')
        .eq('liker_id', currentUserId);
      if (error || !data) return;
      const n = countTodayInterestMission(data as { liked_id: string; heart_type: string | null; created_at: string }[]);
      setMissionCount(n);
      if (n >= SIGNAL_MISSION_GOAL && !toastedRef.current) {
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
      }
    } catch { /* stale */ }
  }, [currentUserId, onMissionComplete]);

  useEffect(() => {
    void refreshMission();
  }, [refreshMission, sentHeartsPerPerson]);

  useEffect(() => {
    setImgFailed(false);
    setDragX(0);
    dragRef.current = null;
  }, [current?.profile.id]);

  const advanceLocal = useCallback((id: string) => {
    setSkippedIds((prev) => new Set([...prev, id]));
  }, []);

  const passCard = useCallback((id: string) => {
    if (functionsLocked) return;
    advanceLocal(id);
    onPassSignal(id);
  }, [functionsLocked, advanceLocal, onPassSignal]);

  const sendCard = useCallback((id: string) => {
    if (functionsLocked) return;
    advanceLocal(id);
    onSendSignal(id);
  }, [functionsLocked, advanceLocal, onSendSignal]);

  const card = current?.profile;
  const pastel = !card || !hasUploadedPhoto(card.photo_url) || imgFailed;
  const photoSrc = card ? getAvatarSrc(card.photo_url, card.nickname) : '';
  const progress = Math.min(SIGNAL_MISSION_GOAL, missionCount);
  const swipeHintOpacity = Math.min(1, Math.abs(dragX) / SWIPE_COMMIT_PX);
  const passing = dragX < -12;
  const sending = dragX > 12;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (functionsLocked || !card) return;
    didSwipeRef.current = false;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* */ }
    dragRef.current = { x: e.clientX, y: e.clientY, dragging: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.dragging && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.15) {
      d.dragging = true;
      didSwipeRef.current = true;
    }
    if (d.dragging) setDragX(dx);
  };
  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    const x = dragX;
    setDragX(0);
    if (!card || !d?.dragging) return;
    if (x >= SWIPE_COMMIT_PX) sendCard(card.id);
    else if (x <= -SWIPE_COMMIT_PX) passCard(card.id);
  };

  return (
    <div className="space-y-3 pb-24">
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
          <div className={`rounded-3xl overflow-hidden border shadow-lg ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-200'}`}>
            <div
              className="relative select-none touch-pan-y"
              style={{
                transform: `translateX(${dragX}px) rotate(${dragX / 28}deg)`,
                transition: dragRef.current?.dragging ? 'none' : 'transform 180ms ease-out',
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <button
                type="button"
                onClick={() => {
                  if (functionsLocked || didSwipeRef.current) return;
                  onSelect(card);
                }}
                className="block w-full text-left"
              >
                <div
                  className="relative w-full overflow-hidden"
                  style={{
                    aspectRatio: '5 / 6',
                    background: pastel ? getAvatarGradientCss(card.nickname) : '#111',
                  }}
                >
                  <img
                    src={photoSrc}
                    alt=""
                    onError={() => setImgFailed(true)}
                    className={`absolute inset-0 w-full h-full ${pastel ? 'object-contain' : 'object-cover object-center'}`}
                    draggable={false}
                  />
                  <div className="absolute inset-x-0 top-3 flex justify-between px-3 pointer-events-none">
                    <span
                      className="rounded-xl border-2 border-slate-200 bg-black/45 px-2.5 py-1 text-[11px] font-black text-white"
                      style={{ opacity: passing ? swipeHintOpacity : 0.92 }}
                    >
                      ← {SIGNAL_SWIPE_LEFT_LABEL}
                    </span>
                    <span
                      className="rounded-xl border-2 border-rose-300 bg-rose-500/80 px-2.5 py-1 text-[11px] font-black text-white"
                      style={{ opacity: sending ? swipeHintOpacity : 0.92 }}
                    >
                      {SIGNAL_SWIPE_RIGHT_LABEL} →
                    </span>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pt-10 pb-3">
                    <p className="text-white text-xl font-black leading-tight">
                      {card.nickname}
                      <span className="ml-2 text-sm font-semibold text-white/80">{getKoreanAge(card.birth_year)}</span>
                    </p>
                    {card.mbti && (
                      <p className="text-[11px] font-bold text-white/80 mt-0.5">{card.mbti}</p>
                    )}
                  </div>
                </div>
              </button>
            </div>
            <div className="px-4 py-3 space-y-2">
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
                  disabled={!!functionsLocked}
                  onClick={() => { if (!functionsLocked) passCard(card.id); }}
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
                  disabled={!!functionsLocked}
                  onClick={() => { if (!functionsLocked) onSelect(card); }}
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
                disabled={!!functionsLocked}
                onClick={() => { if (!functionsLocked) sendCard(card.id); }}
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
        </div>
      )}
    </div>
  );
}
