// ─── 술번개 전용 이모티콘 캐릭터 "술이" SVG 스티커 팩 ──────────────────────────
// 캐릭터: 동글동글 라벤더 곰, 뽀짝한 눈, 분홍 볼터치, 무지개 컬러 포인트

import React from 'react';

export const STICKER_COUNT = 24;

export const STICKER_LABELS = [
  '건배!', '반했어요', '부끄러워', '취했어~', '설레요!', '좋아해요',
  '우리의 밤', '같이 마셔요', '번호 주세요', '신나요!', '안아줘요', '감동이에요',
  '오늘 인연', '보고싶어', '너무 좋아', '또 봐요!', '헤헤헤', '꼬옥 안아',
  '고마워요', '잘자요~', '프라이드!', '뽀뽀!', '울컥..', '최고야!',
];

// 피커 배경 (hex)
export const STICKER_BG: string[] = [
  '#fef9ec', '#fce7f3', '#fff0ef', '#fefce8', '#fdf2f8', '#fff0f0',
  '#f5f3ff', '#fffbeb', '#ecfdf5', '#ecfeff', '#fff7ed', '#eff6ff',
  '#f5f3ff', '#fdf4ff', '#fff0f0', '#f0fdf4', '#fffbeb', '#fce7f3',
  '#ecfdf5', '#eef2ff', '#fdf4ff', '#fff0f0', '#eff6ff', '#fffbeb',
];

// ─── 공통 캐릭터 부품 ────────────────────────────────────────────────────────

/* 귀 + 얼굴 + 몸통 베이스 (cx=120, cy=108 기준) */
const Base = () => (
  <>
    {/* 귀 */}
    <circle cx={72} cy={66} r={26} fill="#a78bfa" />
    <circle cx={168} cy={66} r={26} fill="#a78bfa" />
    <circle cx={72} cy={66} r={15} fill="#fda4af" />
    <circle cx={168} cy={66} r={15} fill="#fda4af" />
    {/* 몸통 */}
    <ellipse cx={120} cy={188} rx={52} ry={44} fill="#c4b5fd" />
    {/* 얼굴 */}
    <circle cx={120} cy={110} r={70} fill="#ddd6fe" />
    {/* 볼터치 */}
    <ellipse cx={78} cy={128} rx={20} ry={13} fill="#fda4af" opacity={0.5} />
    <ellipse cx={162} cy={128} rx={20} ry={13} fill="#fda4af" opacity={0.5} />
  </>
);

const Nose = () => <ellipse cx={120} cy={122} rx={9} ry={6} fill="#9333ea" />;

/* 표정 모음 */
const EyeNormal = () => (
  <>
    <circle cx={97} cy={105} r={13} fill="#1e293b" />
    <circle cx={143} cy={105} r={13} fill="#1e293b" />
    <circle cx={103} cy={99} r={5} fill="white" />
    <circle cx={149} cy={99} r={5} fill="white" />
  </>
);
const EyeHappy = () => (
  <>
    <path d="M84 105 Q97 91 110 105" stroke="#1e293b" strokeWidth={4} fill="none" strokeLinecap="round" />
    <path d="M130 105 Q143 91 156 105" stroke="#1e293b" strokeWidth={4} fill="none" strokeLinecap="round" />
  </>
);
const EyeHeart = () => (
  <>
    <text x={97} y={116} fontSize={24} textAnchor="middle" dominantBaseline="middle">❤️</text>
    <text x={143} y={116} fontSize={24} textAnchor="middle" dominantBaseline="middle">❤️</text>
  </>
);
const EyeDizzy = () => (
  <>
    <circle cx={97} cy={105} r={14} fill="#e2e8f0" />
    <circle cx={143} cy={105} r={14} fill="#e2e8f0" />
    <path d="M90 105 Q94 99 100 105 Q104 111 97 112" stroke="#7c3aed" strokeWidth={3.5} fill="none" strokeLinecap="round" />
    <path d="M136 105 Q140 99 146 105 Q150 111 143 112" stroke="#7c3aed" strokeWidth={3.5} fill="none" strokeLinecap="round" />
    {/* rosy */}
    <ellipse cx={78} cy={128} rx={22} ry={15} fill="#f87171" opacity={0.45} />
    <ellipse cx={162} cy={128} rx={22} ry={15} fill="#f87171" opacity={0.45} />
  </>
);
const EyeStar = () => (
  <>
    <text x={97} y={116} fontSize={22} textAnchor="middle" dominantBaseline="middle">⭐</text>
    <text x={143} y={116} fontSize={22} textAnchor="middle" dominantBaseline="middle">⭐</text>
  </>
);
const EyePuppy = () => (
  <>
    <circle cx={97} cy={103} r={18} fill="#1e293b" />
    <circle cx={143} cy={103} r={18} fill="#1e293b" />
    <circle cx={105} cy={96} r={7} fill="white" />
    <circle cx={151} cy={96} r={7} fill="white" />
    {/* 눈물 방울 */}
    <ellipse cx={82} cy={127} rx={6} ry={10} fill="#93c5fd" opacity={0.85} />
    <ellipse cx={158} cy={127} rx={6} ry={10} fill="#93c5fd" opacity={0.85} />
  </>
);
const EyeWink = () => (
  <>
    <circle cx={97} cy={105} r={13} fill="#1e293b" />
    <circle cx={103} cy={99} r={5} fill="white" />
    <path d="M130 105 Q143 91 156 105" stroke="#1e293b" strokeWidth={4} fill="none" strokeLinecap="round" />
  </>
);
const EyeSleep = () => (
  <>
    <path d="M84 105 Q97 115 110 105" stroke="#1e293b" strokeWidth={4} fill="none" strokeLinecap="round" />
    <path d="M130 105 Q143 115 156 105" stroke="#1e293b" strokeWidth={4} fill="none" strokeLinecap="round" />
  </>
);
const EyeSparkle = () => (
  <>
    <circle cx={97} cy={105} r={14} fill="#1e293b" />
    <circle cx={143} cy={105} r={14} fill="#1e293b" />
    <circle cx={104} cy={98} r={5} fill="white" />
    <circle cx={150} cy={98} r={5} fill="white" />
    <circle cx={92} cy={109} r={2.5} fill="white" opacity={0.6} />
    <circle cx={138} cy={109} r={2.5} fill="white" opacity={0.6} />
  </>
);

const MouthSmile = () => (
  <path d="M100 134 Q120 152 140 134" stroke="#7c3aed" strokeWidth={4} fill="none" strokeLinecap="round" />
);
const MouthGrin = () => (
  <>
    <path d="M96 132 Q120 156 144 132" stroke="#7c3aed" strokeWidth={4} fill="#f9a8d4" strokeLinecap="round" />
    <rect x={107} y={132} width={26} height={10} rx={4} fill="white" />
  </>
);
const MouthOpen = () => (
  <ellipse cx={120} cy={138} rx={18} ry={15} fill="#7c3aed" />
);
const MouthPucker = () => (
  <>
    <circle cx={120} cy={136} r={14} fill="#f9a8d4" />
    <circle cx={120} cy={136} r={9} fill="#e879a8" />
  </>
);
const MouthWow = () => (
  <ellipse cx={120} cy={138} rx={22} ry={18} fill="#7c3aed" />
);

// ─── 스티커 SVG 정의 (24개) ─────────────────────────────────────────────────

export function StickerSVG({ idx, size = 120 }: { idx: number; size?: number }) {
  const content = STICKER_CONTENTS[idx] ?? STICKER_CONTENTS[0];
  return (
    <svg viewBox="0 0 240 240" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      {content}
    </svg>
  );
}

const STICKER_CONTENTS: React.ReactNode[] = [

  /* 0 건배! */
  <>
    {/* 폭죽 배경 */}
    <circle cx={120} cy={120} r={110} fill="#fffbeb" />
    <text x={50} y={50} fontSize={22} opacity={0.7}>🎊</text>
    <text x={165} y={48} fontSize={20} opacity={0.7}>🎉</text>
    <Base />
    <EyeHappy />
    <Nose />
    <MouthGrin />
    {/* 맥주잔 */}
    <rect x={42} y={152} width={28} height={38} rx={6} fill="#fcd34d" stroke="#d97706" strokeWidth={2} />
    <rect x={70} y={162} width={10} height={18} rx={4} fill="#fcd34d" stroke="#d97706" strokeWidth={2} />
    <rect x={46} y={160} width={20} height={8} rx={3} fill="white" opacity={0.55} />
    <rect x={152} y={152} width={28} height={38} rx={6} fill="#fcd34d" stroke="#d97706" strokeWidth={2} />
    <rect x={142} y={162} width={10} height={18} rx={4} fill="#fcd34d" stroke="#d97706" strokeWidth={2} />
    <rect x={156} y={160} width={20} height={8} rx={3} fill="white" opacity={0.55} />
    {/* 팔 */}
    <path d="M80 178 Q62 165 54 158" stroke="#c4b5fd" strokeWidth={14} fill="none" strokeLinecap="round" />
    <path d="M160 178 Q178 165 186 158" stroke="#c4b5fd" strokeWidth={14} fill="none" strokeLinecap="round" />
    <text x={95} y={228} fontSize={18} textAnchor="middle" fill="#d97706" fontWeight="900" fontFamily="sans-serif">건배!</text>
  </>,

  /* 1 반했어요 */
  <>
    <circle cx={120} cy={120} r={110} fill="#fce7f3" />
    {/* 하트 비 */}
    <text x={40} y={55} fontSize={18}>💕</text>
    <text x={172} y={60} fontSize={16}>💗</text>
    <text x={170} y={92} fontSize={14}>💖</text>
    <text x={38} y={88} fontSize={14}>💓</text>
    <Base />
    <EyeHeart />
    <Nose />
    <MouthSmile />
    <text x={120} y={228} fontSize={17} textAnchor="middle" fill="#db2777" fontWeight="900" fontFamily="sans-serif">반했어요</text>
  </>,

  /* 2 부끄러워 */
  <>
    <circle cx={120} cy={120} r={110} fill="#fff0ef" />
    <Base />
    {/* 얼굴 가리는 앞발 */}
    <ellipse cx={86} cy={148} rx={26} ry={22} fill="#c4b5fd" />
    <ellipse cx={154} cy={148} rx={26} ry={22} fill="#c4b5fd" />
    {/* 눈만 보임 */}
    <circle cx={97} cy={100} r={12} fill="#1e293b" />
    <circle cx={143} cy={100} r={12} fill="#1e293b" />
    <circle cx={103} cy={94} r={4.5} fill="white" />
    <circle cx={149} cy={94} r={4.5} fill="white" />
    <Nose />
    {/* 더 강한 볼터치 */}
    <ellipse cx={76} cy={126} rx={26} ry={17} fill="#f87171" opacity={0.5} />
    <ellipse cx={164} cy={126} rx={26} ry={17} fill="#f87171" opacity={0.5} />
    <text x={120} y={228} fontSize={17} textAnchor="middle" fill="#e11d48" fontWeight="900" fontFamily="sans-serif">부끄러워</text>
  </>,

  /* 3 취했어~ */
  <>
    <circle cx={120} cy={120} r={110} fill="#fefce8" />
    {/* 기울어진 별 */}
    <text x={155} y={52} fontSize={20} transform="rotate(15 155 52)">⭐</text>
    <text x={48} y={58} fontSize={16} transform="rotate(-10 48 58)">✨</text>
    <Base />
    <EyeDizzy />
    <Nose />
    <path d="M102 138 Q120 146 138 138" stroke="#7c3aed" strokeWidth={4} fill="none" strokeLinecap="round" />
    {/* 맥주잔 들고 있기 */}
    <rect x={150} y={162} width={24} height={32} rx={5} fill="#fcd34d" stroke="#d97706" strokeWidth={2} />
    <rect x={174} y={170} width={8} height={14} rx={3} fill="#fcd34d" stroke="#d97706" strokeWidth={2} />
    <path d="M158 180 Q172 170 178 168" stroke="#c4b5fd" strokeWidth={12} fill="none" strokeLinecap="round" />
    {/* zzz */}
    <text x={38} y={145} fontSize={18} fill="#a78bfa" fontWeight="900" fontFamily="sans-serif">z</text>
    <text x={52} y={132} fontSize={14} fill="#a78bfa" fontWeight="900" fontFamily="sans-serif">z</text>
    <text x={63} y={122} fontSize={10} fill="#a78bfa" fontWeight="900" fontFamily="sans-serif">z</text>
    <text x={120} y={228} fontSize={17} textAnchor="middle" fill="#ca8a04" fontWeight="900" fontFamily="sans-serif">취했어~</text>
  </>,

  /* 4 설레요! */
  <>
    <circle cx={120} cy={120} r={110} fill="#fdf2f8" />
    <text x={34} y={68} fontSize={16}>💫</text>
    <text x={178} y={64} fontSize={16}>💫</text>
    <text x={178} y={102} fontSize={14}>✨</text>
    <text x={34} y={108} fontSize={14}>✨</text>
    <Base />
    <EyeSparkle />
    <Nose />
    <MouthSmile />
    {/* 떠다니는 하트들 */}
    <text x={54} y={175} fontSize={16}>💕</text>
    <text x={164} y={175} fontSize={16}>💕</text>
    <text x={110} y={215} fontSize={14}>💗</text>
    <text x={120} y={228} fontSize={17} textAnchor="middle" fill="#db2777" fontWeight="900" fontFamily="sans-serif">설레요!</text>
  </>,

  /* 5 좋아해요 */
  <>
    <circle cx={120} cy={120} r={110} fill="#fff0f0" />
    <Base />
    <EyeNormal />
    <Nose />
    <MouthSmile />
    {/* 큰 하트 들고 있기 */}
    <text x={120} y={205} fontSize={52} textAnchor="middle" dominantBaseline="middle">❤️</text>
    {/* 팔 */}
    <path d="M80 180 Q88 196 104 196" stroke="#c4b5fd" strokeWidth={13} fill="none" strokeLinecap="round" />
    <path d="M160 180 Q152 196 136 196" stroke="#c4b5fd" strokeWidth={13} fill="none" strokeLinecap="round" />
    <text x={120} y={232} fontSize={17} textAnchor="middle" fill="#e11d48" fontWeight="900" fontFamily="sans-serif">좋아해요</text>
  </>,

  /* 6 우리의 밤 */
  <>
    <circle cx={120} cy={120} r={110} fill="#f5f3ff" />
    {/* 무지개 */}
    <path d="M20 145 Q120 30 220 145" stroke="#ef4444" strokeWidth={6} fill="none" opacity={0.7} />
    <path d="M28 148 Q120 44 212 148" stroke="#f97316" strokeWidth={6} fill="none" opacity={0.7} />
    <path d="M36 151 Q120 58 204 151" stroke="#eab308" strokeWidth={6} fill="none" opacity={0.7} />
    <path d="M44 154 Q120 72 196 154" stroke="#22c55e" strokeWidth={6} fill="none" opacity={0.7} />
    <path d="M52 157 Q120 86 188 157" stroke="#3b82f6" strokeWidth={6} fill="none" opacity={0.7} />
    <path d="M60 160 Q120 100 180 160" stroke="#8b5cf6" strokeWidth={6} fill="none" opacity={0.7} />
    {/* 별 */}
    <text x={168} y={56} fontSize={16}>⭐</text>
    <text x={46} y={60} fontSize={13}>🌟</text>
    <text x={186} y={88} fontSize={11}>✨</text>
    <Base />
    <EyeStar />
    <Nose />
    <MouthSmile />
    <text x={120} y={228} fontSize={16} textAnchor="middle" fill="#7c3aed" fontWeight="900" fontFamily="sans-serif">우리의 밤</text>
  </>,

  /* 7 같이 마셔요 */
  <>
    <circle cx={120} cy={120} r={110} fill="#fffbeb" />
    <Base />
    <EyeHappy />
    <Nose />
    <MouthGrin />
    {/* 왼팔 + 맥주 */}
    <path d="M76 182 Q56 172 48 164" stroke="#c4b5fd" strokeWidth={13} fill="none" strokeLinecap="round" />
    <rect x={34} y={145} width={24} height={32} rx={5} fill="#fcd34d" stroke="#d97706" strokeWidth={2} />
    <rect x={34} y={153} width={20} height={7} rx={3} fill="white" opacity={0.55} />
    {/* 오른팔 + 맥주 */}
    <path d="M164 182 Q184 172 192 164" stroke="#c4b5fd" strokeWidth={13} fill="none" strokeLinecap="round" />
    <rect x={182} y={145} width={24} height={32} rx={5} fill="#fcd34d" stroke="#d97706" strokeWidth={2} />
    <rect x={182} y={153} width={20} height={7} rx={3} fill="white" opacity={0.55} />
    <text x={120} y={228} fontSize={16} textAnchor="middle" fill="#d97706" fontWeight="900" fontFamily="sans-serif">같이 마셔요</text>
  </>,

  /* 8 번호 주세요 */
  <>
    <circle cx={120} cy={120} r={110} fill="#ecfdf5" />
    <Base />
    <EyeNormal />
    <Nose />
    <MouthSmile />
    {/* 핸드폰 */}
    <rect x={82} y={160} width={76} height={52} rx={10} fill="#1e293b" />
    <rect x={86} y={165} width={68} height={38} rx={6} fill="#22d3ee" />
    <text x={120} y={191} fontSize={18} textAnchor="middle" dominantBaseline="middle">📱</text>
    <circle cx={120} cy={206} r={4} fill="#64748b" />
    {/* 하트 팝업 */}
    <text x={162} y={165} fontSize={20}>💚</text>
    <text x={120} y={228} fontSize={16} textAnchor="middle" fill="#059669" fontWeight="900" fontFamily="sans-serif">번호 주세요</text>
  </>,

  /* 9 신나요! */
  <>
    <circle cx={120} cy={120} r={110} fill="#ecfeff" />
    {/* 컨페티 */}
    <rect x={40} y={48} width={10} height={14} rx={3} fill="#f97316" transform="rotate(-20 40 48)" />
    <rect x={178} y={42} width={10} height={14} rx={3} fill="#22c55e" transform="rotate(15 178 42)" />
    <rect x={60} y={68} width={8} height={12} rx={3} fill="#eab308" transform="rotate(10 60 68)" />
    <rect x={166} y={70} width={8} height={12} rx={3} fill="#ec4899" transform="rotate(-12 166 70)" />
    <circle cx={48} cy={86} r={6} fill="#a78bfa" />
    <circle cx={185} cy={82} r={6} fill="#fb923c" />
    <Base />
    <EyeHappy />
    <Nose />
    <MouthWow />
    {/* 양팔 번쩍 */}
    <path d="M78 176 Q58 152 52 132" stroke="#c4b5fd" strokeWidth={14} fill="none" strokeLinecap="round" />
    <path d="M162 176 Q182 152 188 132" stroke="#c4b5fd" strokeWidth={14} fill="none" strokeLinecap="round" />
    <text x={120} y={228} fontSize={17} textAnchor="middle" fill="#0891b2" fontWeight="900" fontFamily="sans-serif">신나요!</text>
  </>,

  /* 10 안아줘요 */
  <>
    <circle cx={120} cy={120} r={110} fill="#fff7ed" />
    <text x={44} y={78} fontSize={18}>🤍</text>
    <text x={170} y={74} fontSize={18}>🤍</text>
    <Base />
    <EyeNormal />
    <Nose />
    <MouthSmile />
    {/* 양팔 크게 벌리기 */}
    <path d="M76 178 Q42 162 30 148" stroke="#c4b5fd" strokeWidth={15} fill="none" strokeLinecap="round" />
    <path d="M164 178 Q198 162 210 148" stroke="#c4b5fd" strokeWidth={15} fill="none" strokeLinecap="round" />
    {/* 앞발 */}
    <circle cx={32} cy={145} r={16} fill="#c4b5fd" />
    <circle cx={208} cy={145} r={16} fill="#c4b5fd" />
    <text x={120} y={228} fontSize={17} textAnchor="middle" fill="#ea580c" fontWeight="900" fontFamily="sans-serif">안아줘요</text>
  </>,

  /* 11 감동이에요 */
  <>
    <circle cx={120} cy={120} r={110} fill="#eff6ff" />
    <Base />
    <EyeSparkle />
    <Nose />
    <MouthSmile />
    {/* 눈물 */}
    <ellipse cx={82} cy={132} rx={8} ry={14} fill="#93c5fd" opacity={0.8} />
    <ellipse cx={158} cy={132} rx={8} ry={14} fill="#93c5fd" opacity={0.8} />
    {/* 별 */}
    <text x={36} y={80} fontSize={18}>✨</text>
    <text x={177} y={78} fontSize={18}>✨</text>
    <text x={58} y={176} fontSize={14}>💙</text>
    <text x={162} y={176} fontSize={14}>💙</text>
    <text x={120} y={228} fontSize={16} textAnchor="middle" fill="#2563eb" fontWeight="900" fontFamily="sans-serif">감동이에요</text>
  </>,

  /* 12 오늘 인연 */
  <>
    <circle cx={120} cy={120} r={110} fill="#f5f3ff" />
    {/* 운명의 별 */}
    <text x={34} y={58} fontSize={20}>⭐</text>
    <text x={170} y={54} fontSize={20}>⭐</text>
    <text x={54} y={88} fontSize={14}>✨</text>
    <text x={166} y={88} fontSize={14}>✨</text>
    <Base />
    <EyeStar />
    <Nose />
    <MouthGrin />
    {/* 빛나는 후광 */}
    <circle cx={120} cy={110} r={78} fill="none" stroke="#fbbf24" strokeWidth={4} opacity={0.35} strokeDasharray="8 6" />
    <text x={120} y={228} fontSize={16} textAnchor="middle" fill="#7c3aed" fontWeight="900" fontFamily="sans-serif">오늘 인연</text>
  </>,

  /* 13 보고싶어 */
  <>
    <circle cx={120} cy={120} r={110} fill="#fdf4ff" />
    <Base />
    <EyePuppy />
    <Nose />
    {/* 울먹이는 입 */}
    <path d="M100 140 Q120 132 140 140" stroke="#7c3aed" strokeWidth={4} fill="none" strokeLinecap="round" />
    {/* 눈물 방울 더 크게 */}
    <ellipse cx={78} cy={140} rx={9} ry={14} fill="#93c5fd" opacity={0.8} />
    <ellipse cx={162} cy={140} rx={9} ry={14} fill="#93c5fd" opacity={0.8} />
    <text x={120} y={228} fontSize={17} textAnchor="middle" fill="#9333ea" fontWeight="900" fontFamily="sans-serif">보고싶어</text>
  </>,

  /* 14 너무 좋아 */
  <>
    <circle cx={120} cy={120} r={110} fill="#fff0f0" />
    <text x={38} y={62} fontSize={18}>💖</text>
    <text x={172} y={58} fontSize={18}>💖</text>
    <Base />
    {/* 활짝 웃는 눈 */}
    <path d="M82 102 Q97 88 112 102" stroke="#1e293b" strokeWidth={4.5} fill="none" strokeLinecap="round" />
    <path d="M128 102 Q143 88 158 102" stroke="#1e293b" strokeWidth={4.5} fill="none" strokeLinecap="round" />
    <Nose />
    <MouthGrin />
    {/* 더 강한 볼터치 */}
    <ellipse cx={75} cy={128} rx={24} ry={16} fill="#f87171" opacity={0.55} />
    <ellipse cx={165} cy={128} rx={24} ry={16} fill="#f87171" opacity={0.55} />
    <text x={120} y={228} fontSize={17} textAnchor="middle" fill="#e11d48" fontWeight="900" fontFamily="sans-serif">너무 좋아</text>
  </>,

  /* 15 또 봐요! */
  <>
    <circle cx={120} cy={120} r={110} fill="#f0fdf4" />
    <text x={50} y={52} fontSize={16}>✨</text>
    <text x={170} y={50} fontSize={16}>✨</text>
    <Base />
    <EyeHappy />
    <Nose />
    <MouthSmile />
    {/* 손 흔들기 */}
    <path d="M76 180 Q62 168 56 155" stroke="#c4b5fd" strokeWidth={14} fill="none" strokeLinecap="round" />
    <circle cx={54} cy={152} r={16} fill="#c4b5fd" />
    {/* 손가락처럼 */}
    <ellipse cx={46} cy={142} rx={7} ry={10} fill="#ddd6fe" transform="rotate(-20 46 142)" />
    <ellipse cx={56} cy={138} rx={7} ry={10} fill="#ddd6fe" transform="rotate(-5 56 138)" />
    <ellipse cx={64} cy={140} rx={6} ry={9} fill="#ddd6fe" transform="rotate(10 64 140)" />
    <text x={120} y={228} fontSize={17} textAnchor="middle" fill="#16a34a" fontWeight="900" fontFamily="sans-serif">또 봐요!</text>
  </>,

  /* 16 헤헤헤 */
  <>
    <circle cx={120} cy={120} r={110} fill="#fffbeb" />
    <Base />
    {/* 실눈 */}
    <path d="M84 102 Q97 112 110 102" stroke="#1e293b" strokeWidth={4} fill="none" strokeLinecap="round" />
    <path d="M130 102 Q143 112 156 102" stroke="#1e293b" strokeWidth={4} fill="none" strokeLinecap="round" />
    <Nose />
    <MouthGrin />
    {/* 과장된 볼 */}
    <ellipse cx={73} cy={128} rx={25} ry={18} fill="#fda4af" opacity={0.6} />
    <ellipse cx={167} cy={128} rx={25} ry={18} fill="#fda4af" opacity={0.6} />
    <text x={60} y={180} fontSize={16} fill="#d97706" fontWeight="900" fontFamily="sans-serif">ㅋㅋㅋ</text>
    <text x={120} y={228} fontSize={17} textAnchor="middle" fill="#d97706" fontWeight="900" fontFamily="sans-serif">헤헤헤</text>
  </>,

  /* 17 꼬옥 안아 */
  <>
    <circle cx={120} cy={120} r={110} fill="#fce7f3" />
    <Base />
    <EyeHappy />
    <Nose />
    <MouthSmile />
    {/* 작은 친구 꼭 안기 */}
    <circle cx={120} cy={188} r={30} fill="#a78bfa" opacity={0.7} />
    <circle cx={120} cy={183} r={18} fill="#ddd6fe" />
    {/* 팔로 감싸기 */}
    <path d="M80 178 Q90 200 120 208" stroke="#c4b5fd" strokeWidth={13} fill="none" strokeLinecap="round" />
    <path d="M160 178 Q150 200 120 208" stroke="#c4b5fd" strokeWidth={13} fill="none" strokeLinecap="round" />
    <text x={120} y={232} fontSize={16} textAnchor="middle" fill="#9333ea" fontWeight="900" fontFamily="sans-serif">꼬옥 안아</text>
  </>,

  /* 18 고마워요 */
  <>
    <circle cx={120} cy={120} r={110} fill="#ecfdf5" />
    <text x={160} y={56} fontSize={18}>✨</text>
    <text x={42} y={58} fontSize={16}>💚</text>
    <Base />
    <EyeHappy />
    <Nose />
    <MouthSmile />
    {/* 합장 / 감사 손 */}
    <path d="M78 180 Q88 196 106 200" stroke="#c4b5fd" strokeWidth={13} fill="none" strokeLinecap="round" />
    <path d="M162 180 Q152 196 134 200" stroke="#c4b5fd" strokeWidth={13} fill="none" strokeLinecap="round" />
    <ellipse cx={120} cy={204} rx={22} ry={14} fill="#c4b5fd" />
    <text x={120} y={228} fontSize={17} textAnchor="middle" fill="#059669" fontWeight="900" fontFamily="sans-serif">고마워요</text>
  </>,

  /* 19 잘자요~ */
  <>
    <circle cx={120} cy={120} r={110} fill="#eef2ff" />
    {/* 달 */}
    <text x={162} y={62} fontSize={26}>🌙</text>
    {/* 별 */}
    <text x={40} y={68} fontSize={16}>⭐</text>
    <text x={54} y={96} fontSize={12}>✨</text>
    <text x={180} y={96} fontSize={12}>✨</text>
    <Base />
    <EyeSleep />
    <Nose />
    <path d="M104 134 Q120 140 136 134" stroke="#7c3aed" strokeWidth={4} fill="none" strokeLinecap="round" />
    {/* zzz */}
    <text x={148} y={98} fontSize={18} fill="#818cf8" fontWeight="900" fontFamily="sans-serif">z</text>
    <text x={162} y={84} fontSize={14} fill="#818cf8" fontWeight="900" fontFamily="sans-serif">z</text>
    <text x={172} y={72} fontSize={10} fill="#818cf8" fontWeight="900" fontFamily="sans-serif">z</text>
    {/* 이불 */}
    <ellipse cx={120} cy={204} rx={62} ry={26} fill="#c7d2fe" />
    <ellipse cx={120} cy={196} rx={62} ry={18} fill="#ddd6fe" />
    <text x={120} y={228} fontSize={17} textAnchor="middle" fill="#4f46e5" fontWeight="900" fontFamily="sans-serif">잘자요~</text>
  </>,

  /* 20 프라이드! */
  <>
    <circle cx={120} cy={120} r={110} fill="#fdf4ff" />
    {/* 무지개 깃발 막대 */}
    <rect x={148} y={68} width={6} height={95} rx={3} fill="#6b7280" />
    {/* 무지개 깃발 */}
    <rect x={154} y={68} width={56} height={15} rx={2} fill="#ef4444" />
    <rect x={154} y={83} width={56} height={13} rx={2} fill="#f97316" />
    <rect x={154} y={96} width={56} height={13} rx={2} fill="#eab308" />
    <rect x={154} y={109} width={56} height={13} rx={2} fill="#22c55e" />
    <rect x={154} y={122} width={56} height={13} rx={2} fill="#3b82f6" />
    <rect x={154} y={135} width={56} height={13} rx={2} fill="#8b5cf6" />
    <Base />
    <EyeHappy />
    <Nose />
    <MouthGrin />
    {/* 팔로 깃발 들기 */}
    <path d="M152 180 Q158 145 153 72" stroke="#c4b5fd" strokeWidth={13} fill="none" strokeLinecap="round" />
    <text x={60} y={228} fontSize={15} textAnchor="middle" fill="#9333ea" fontWeight="900" fontFamily="sans-serif">프라이드!</text>
  </>,

  /* 21 뽀뽀! */
  <>
    <circle cx={120} cy={120} r={110} fill="#fff0f0" />
    <text x={40} y={68} fontSize={16}>💋</text>
    <text x={172} y={62} fontSize={16}>💋</text>
    <Base />
    {/* 찡긋 눈 */}
    <path d="M84 102 Q97 92 110 102" stroke="#1e293b" strokeWidth={4} fill="none" strokeLinecap="round" />
    <circle cx={143} cy={103} r={12} fill="#1e293b" />
    <circle cx={149} cy={97} r={4.5} fill="white" />
    <Nose />
    <MouthPucker />
    {/* 하트 뽀뽀 */}
    <text x={146} y={138} fontSize={22}>💗</text>
    <text x={120} y={228} fontSize={17} textAnchor="middle" fill="#e11d48" fontWeight="900" fontFamily="sans-serif">뽀뽀!</text>
  </>,

  /* 22 울컥.. */
  <>
    <circle cx={120} cy={120} r={110} fill="#eff6ff" />
    <Base />
    {/* 울컥 눈 - 눈물 가득 */}
    <circle cx={97} cy={104} r={14} fill="#1e293b" />
    <circle cx={143} cy={104} r={14} fill="#1e293b" />
    <circle cx={104} cy={97} r={5.5} fill="white" />
    <circle cx={150} cy={97} r={5.5} fill="white" />
    {/* 눈물 빛 가득 - 눈 아래 물기 */}
    <ellipse cx={97} cy={118} rx={13} ry={6} fill="#93c5fd" opacity={0.6} />
    <ellipse cx={143} cy={118} rx={13} ry={6} fill="#93c5fd" opacity={0.6} />
    {/* 눈물 줄기 */}
    <path d="M90 118 Q86 136 84 154" stroke="#93c5fd" strokeWidth={5} fill="none" strokeLinecap="round" opacity={0.8} />
    <path d="M150 118 Q154 136 156 154" stroke="#93c5fd" strokeWidth={5} fill="none" strokeLinecap="round" opacity={0.8} />
    <Nose />
    {/* 떨리는 입 */}
    <path d="M100 140 Q120 136 140 140" stroke="#7c3aed" strokeWidth={4} fill="none" strokeLinecap="round" />
    <text x={120} y={228} fontSize={17} textAnchor="middle" fill="#2563eb" fontWeight="900" fontFamily="sans-serif">울컥..</text>
  </>,

  /* 23 최고야! */
  <>
    <circle cx={120} cy={120} r={110} fill="#fffbeb" />
    <text x={38} y={62} fontSize={18}>⭐</text>
    <text x={174} y={58} fontSize={18}>⭐</text>
    <text x={54} y={86} fontSize={14}>✨</text>
    <text x={168} y={86} fontSize={14}>✨</text>
    <Base />
    <EyeHappy />
    <Nose />
    <MouthGrin />
    {/* 엄지 척 */}
    <path d="M160 176 Q178 166 186 150" stroke="#c4b5fd" strokeWidth={14} fill="none" strokeLinecap="round" />
    {/* 엄지 손 */}
    <ellipse cx={188} cy={144} rx={14} ry={18} fill="#c4b5fd" transform="rotate(-20 188 144)" />
    <ellipse cx={200} cy={136} rx={7} ry={10} fill="#ddd6fe" transform="rotate(-35 200 136)" />
    <text x={120} y={228} fontSize={17} textAnchor="middle" fill="#d97706" fontWeight="900" fontFamily="sans-serif">최고야!</text>
  </>,
];
