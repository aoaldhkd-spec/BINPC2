import { useState, useRef, useEffect, type SyntheticEvent } from 'react';
import { ArrowLeft, Heart, MessageCircle, MapPin } from 'lucide-react';
import { getPositionLabel, getPositionBg, getDomSubLabel, getDomSubBg, getKoreanAge, genAvatar } from '../lib/profile';
import { HEART_TYPES, HeartType } from '../lib/constants';
import ProfileScoreBar from './ProfileScoreBar';
import type { Profile } from '../types/app';

// heartMeta: HeartType → HEART_TYPES 메타데이터 조회 (unknown 타입 방어: 첫 번째 항목으로 폴백)
const heartMeta = (t: HeartType) => HEART_TYPES.find(h => h.type === t) ?? HEART_TYPES[0];

// DiceBear 투명 SVG나 null → genAvatar 폴백, 실제 사진은 그대로 반환
function profileAvatarSrc(url: string | null | undefined, nick: string): string {
  if (!url) return genAvatar(nick);
  if (url.includes('dicebear') && !url.includes('backgroundColor')) return genAvatar(nick);
  return url;
}
function onImgErr(nick: string) {
  return (e: SyntheticEvent<HTMLImageElement>) => { e.currentTarget.src = genAvatar(nick); };
}

// ── 프로필 사진 헤더 — 실제 사진 있으면 표시, 없으면 성향 색상 + 라벨 ──────────
function PhotoHeader({ profile }: { profile: Profile }) {
  const [imgError, setImgError] = useState(false);
  // DiceBear URL이 아닌 진짜 사진 URL인지 판별
  const hasRealPhoto = !!(profile.photo_url && !profile.photo_url.includes('dicebear'));
  const showPhoto = hasRealPhoto && !imgError;

  if (showPhoto) {
    return (
      <div className="aspect-[4/3]">
        <img
          src={profile.photo_url!}
          alt={profile.nickname}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  // 사진 없는 경우 — genAvatar(DiceBear colored) 또는 성향 그라디언트
  const avatarUrl = profileAvatarSrc(profile.photo_url, profile.nickname);
  const isDicebearColored = avatarUrl.includes('dicebear') && avatarUrl.includes('backgroundColor');

  return (
    <div
      className="aspect-[4/3] flex items-center justify-center"
      style={{ backgroundColor: getPositionBg(profile.personality_score ?? 50) }}
    >
      {isDicebearColored ? (
        // 컬러 아바타(DiceBear) → 중앙에 크게 표시
        <img
          src={avatarUrl}
          alt={profile.nickname}
          className="w-32 h-32 rounded-full shadow-2xl border-4 border-white/30"
          onError={onImgErr(profile.nickname)}
        />
      ) : (
        // 아바타 없는 경우 — 성향 라벨 텍스트
        <div className="flex flex-col items-center gap-2">
          <span className="text-4xl font-black text-white">{getPositionLabel(profile.personality_score ?? 50)}</span>
          {profile.mbti && <span className="text-2xl font-bold text-white/80">{profile.mbti}</span>}
        </div>
      )}
    </div>
  );
}

function ProfileDetail({ profile, isMe, isLiked, heartType, sentHeartsCount, locked, onLike, onChat, onBack, onViewFortune }: {
  profile: Profile; isMe: boolean; isLiked: boolean; heartType?: HeartType; sentHeartsCount?: number;
  locked?: boolean;
  onLike: () => void; onChat: () => void; onBack: () => void; onViewFortune?: () => void;
}) {
  const [lockToast, setLockToast] = useState(false);
  const lockToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (lockToastTimerRef.current) clearTimeout(lockToastTimerRef.current); }, []);
  const showLockToast = () => {
    if (lockToastTimerRef.current) clearTimeout(lockToastTimerRef.current);
    setLockToast(true);
    lockToastTimerRef.current = setTimeout(() => setLockToast(false), 1400);
  };

  const handleLike = () => {
    if (locked) { showLockToast(); return; }
    if (isLiked && (sentHeartsCount ?? 0) >= 4) return;
    onLike();
  };
  const handleChat = () => {
    if (locked) { showLockToast(); return; }
    onChat();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={onBack} className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-base font-semibold text-gray-900 flex-1">프로필</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        {/* Photo + name overlay */}
        <div className="relative rounded-2xl overflow-hidden shadow-md">
          <PhotoHeader profile={profile} />

          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 px-5 pb-5">
            <div className="flex items-end gap-2">
              <h2 className="text-2xl font-bold text-white leading-tight">{profile.nickname}</h2>
              {isMe && (
                <span className="mb-0.5 px-3 py-1 bg-amber-400 text-white text-sm font-black rounded-full shadow-md border-2 border-amber-200">나</span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-1.5">
              {profile.mbti && (
                <span className="px-2.5 py-0.5 bg-white/20 backdrop-blur-sm text-white text-xs font-bold rounded-full border border-white/30">
                  {profile.mbti}
                </span>
              )}
              {profile.birth_year && (
                <span className="px-2.5 py-0.5 bg-white/20 backdrop-blur-sm text-white text-xs font-bold rounded-full border border-white/30">
                  {getKoreanAge(profile.birth_year)}
                </span>
              )}
              {profile.location && (
                <span className="px-2.5 py-0.5 bg-white/20 backdrop-blur-sm text-white text-xs font-bold rounded-full border border-white/30 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />{profile.location}
                </span>
              )}
            </div>
          </div>
          {lockToast && (
            <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap text-[11px] font-bold px-3 py-1 rounded-full bg-gray-800/90 text-white shadow pointer-events-none">
              🔒 현재 잠금 중
            </div>
          )}
          {!isMe && (
          <button
            onClick={handleLike}
            disabled={!locked && isLiked && (sentHeartsCount ?? 0) >= 4}
            className={`absolute top-4 right-4 p-2.5 rounded-full backdrop-blur-sm transition-all ${locked ? 'opacity-60' : ''} ${
              isLiked
                ? `${heartType ? heartMeta(heartType).solidBg : 'bg-rose-500'} text-white shadow-lg`
                : 'bg-white/30 text-white hover:bg-rose-500 hover:scale-110'
            }`}
          >
            <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
          </button>
          )}
        </div>

        {/* Bio tags */}
        {profile.bio && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">소개</p>
            <div className="flex flex-wrap gap-2">
              {profile.bio.split(', ').map((tag) => (
                <span key={tag} className="px-3 py-1.5 bg-teal-50 text-teal-700 text-sm font-medium rounded-full border border-teal-200">
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* MBTI */}
        {profile.mbti && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">MBTI</p>
            <span className="inline-block px-4 py-1.5 bg-teal-50 text-teal-700 text-sm font-bold rounded-full border border-teal-200">
              {profile.mbti}
            </span>
          </div>
        )}

        {/* Score section */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">성향</p>
          <ProfileScoreBar label="포지션" score={profile.personality_score}
            getLabel={(v) => getPositionLabel(v ?? 50)} getBg={(v) => getPositionBg(v ?? 50)}
            leftText="바텀" rightText="탑" />
          <div className="h-px bg-gray-100" />
          <ProfileScoreBar label="돔/섭" score={profile.dom_sub_score}
            getLabel={getDomSubLabel} getBg={getDomSubBg} leftText="섭" rightText="돔" />
        </div>

        {/* Chat button — locked 시 토스트, 정상 시 채팅 진입 */}
        {!isMe && (
        <button onClick={handleChat}
          className={`w-full py-3.5 bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-semibold rounded-2xl hover:from-cyan-600 hover:to-teal-600 transition-all flex items-center justify-center gap-2 shadow-sm ${locked ? 'opacity-60' : ''}`}>
          <MessageCircle className="w-5 h-5" />
          {locked ? '🔒 채팅하기' : '채팅하기'}
        </button>
        )}
        {/* 궁합 버튼 */}
        {!isMe && profile.birth_year && profile.birth_month && profile.birth_day && onViewFortune && (
          <button onClick={onViewFortune}
            className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold rounded-2xl transition-all flex items-center justify-center gap-2 shadow-sm text-sm"
          >
            <span>💕</span> 이 사람과 궁합 보기
          </button>
        )}
      </main>
    </div>
  );
}

export default ProfileDetail;
