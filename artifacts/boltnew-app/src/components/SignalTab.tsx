import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Profile, UserSignal } from '../types/app';
import type { HeartType } from '../lib/constants';
import { getKoreanAge, getAvatarSrc, hasUploadedPhoto, getAvatarGradientCss } from '../lib/profile';
import {
  SIGNAL_EMPTY_DECK_HINT,
  SIGNAL_EMPTY_DECK_TITLE,
  SIGNAL_GUIDE_CTA,
  SIGNAL_GUIDE_LEAD,
  SIGNAL_GUIDE_POINTS,
  SIGNAL_GUIDE_TITLE,
  SIGNAL_MISSION_COPY,
  SIGNAL_MISSION_GOAL,
  countTodayInterestMission,
  hasInterestHeart,
  isSignalDeckUnlocked,
  missionToastKey,
  recommendSignals,
  seoulDateKey,
  type SignalMatch,
} from '../lib/signal-match';

export function SignalTab({
  profiles,
  currentUserId,
  userSignals,
  sentHeartsPerPerson,
  blockedUserIds,
  hiddenByIds,
  functionsLocked,
  darkMode,
  onLike,
  onSelect,
  onGoProfiles,
  onMissionComplete,
}: {
  profiles: Profile[];
  currentUserId: string | null;
  userSignals: UserSignal[];
  sentHeartsPerPerson: Map<string, Set<HeartType>>;
  blockedUserIds: Set<string>;
  hiddenByIds: Set<string>;
  functionsLocked?: boolean;
  darkMode: boolean;
  onLike: (id: string) => void;
  onSelect: (p: Profile) => void;
  onGoProfiles?: () => void;
  onMissionComplete?: () => void;
}) {
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [missionCount, setMissionCount] = useState(0);
  const [imgFailed, setImgFailed] = useState(false);

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

  const deck = useMemo(() => {
    if (!unlocked || !me || !currentUserId) return [] as Array<SignalMatch & { profile: Profile }>;
    const byId = new Map<string, Profile>();
    for (const p of profiles) byId.set(p.id, p);
    const ranked = recommendSignals({
      myId: currentUserId,
      myProfile: me,
      myIdealMsg: mySignal?.ideal_msg,
      myStatusMsg: mySignal?.status_msg,
      candidates: profiles
        .filter((p) => !skippedIds.has(p.id))
        .map((p) => ({
          profile: p,
          idealMsg: signalByUser.get(p.id)?.ideal_msg,
          statusMsg: signalByUser.get(p.id)?.status_msg,
        })),
      blockedIds: blockedUserIds,
      hiddenIds: hiddenByIds,
      alreadyInterestedIds,
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
    signalByUser, skippedIds, blockedUserIds, hiddenByIds, alreadyInterestedIds, likedAllTypeIds,
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
  }, [current?.profile.id]);

  const card = current?.profile;
  const pastel = !card || !hasUploadedPhoto(card.photo_url) || imgFailed;
  const photoSrc = card ? getAvatarSrc(card.photo_url, card.nickname) : '';
  const progress = Math.min(SIGNAL_MISSION_GOAL, missionCount);

  return (
    <div className="space-y-3 pb-24">
      <div className={`rounded-2xl border px-4 py-3 ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-rose-50 border-rose-200'}`}>
        <p className={`text-sm font-black ${darkMode ? 'text-white' : 'text-rose-800'}`}>
          💕 오늘의 시그널 미션
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

      {!unlocked ? (
        <div className={`rounded-2xl border px-5 py-6 ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-200'}`}>
          <p className="text-2xl mb-2">📖</p>
          <p className={`text-sm font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {SIGNAL_GUIDE_TITLE}
          </p>
          <p className={`text-xs mt-1.5 leading-relaxed ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>
            {SIGNAL_GUIDE_LEAD}
          </p>
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
        <div className={`rounded-3xl overflow-hidden border shadow-lg ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-200'}`}>
          <button
            type="button"
            onClick={() => onSelect(card)}
            className="block w-full text-left"
          >
            <div
              className="relative w-full"
              style={{
                paddingBottom: '120%',
                background: pastel ? getAvatarGradientCss(card.nickname) : '#111',
              }}
            >
              <img
                src={photoSrc}
                alt=""
                onError={() => setImgFailed(true)}
                className={`absolute inset-0 w-full h-full ${pastel ? 'object-cover opacity-90' : 'object-cover'}`}
              />
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
          <div className="px-4 py-3 space-y-2">
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
                onClick={() => setSkippedIds((prev) => new Set([...prev, card.id]))}
                className={`flex-1 py-3 rounded-2xl text-sm font-bold border active:scale-95 transition-all ${
                  darkMode
                    ? 'bg-slate-700 border-slate-500 text-slate-200'
                    : 'bg-gray-50 border-gray-200 text-gray-700'
                }`}
              >
                다음
              </button>
              <button
                type="button"
                disabled={!!functionsLocked}
                onClick={() => { if (!functionsLocked) onLike(card.id); }}
                className="flex-[1.4] py-3 rounded-2xl text-sm font-black text-white bg-rose-500 hover:bg-rose-600 disabled:opacity-40 active:scale-95 transition-all"
              >
                💕 하트 보내기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
