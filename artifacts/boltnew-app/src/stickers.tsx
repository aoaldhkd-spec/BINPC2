// ─── 술번개 스티커 3팩 ────────────────────────────────────────────────────────
// Pack A (0-7)  : 술이 — 동글 라벤더 곰 캐릭터
// Pack B (8-15) : MZ밈  — 굵은 한글 텍스트 + 낙서 아트
// Pack C (16-23): 젤리  — 컬러풀 블롭 캐릭터

import React from 'react';

export const STICKER_COUNT = 24;

export const STICKER_LABELS = [
  // Pack A
  '건배!', '반했어요', '부끄러워', '취했어~', '설레요!', '좋아해요', '또 봐요!', '잘자요~',
  // Pack B
  'ㅋㅋ..', '헐!!!', '실화야?', '대박⚡', 'ㅠㅠ', '취향저격', '오늘뭐함', '짱이야🔥',
  // Pack C
  '민트젤리', '피치젤리', '레몬젤리', '포도젤리', '딸기젤리', '블루젤리', '라임젤리', '무지개',
];

export const STICKER_BG: string[] = [
  // Pack A — 라벤더 계열
  '#f5f3ff','#fce7f3','#fff0ef','#fefce8','#fdf2f8','#fff0f0','#f0fdf4','#eef2ff',
  // Pack B — 비비드 파스텔
  '#fff9db','#fff0f6','#f0f9ff','#fffbe6','#f0f4ff','#fff0ff','#f0fff4','#fff5f0',
  // Pack C — 젤리 배경
  '#e6fffb','#fff0eb','#fffde7','#f3e8ff','#ffe4e6','#e0f2fe','#dcfce7','#fdf2f8',
];

// ─────────────────────────────────────────────────────────────────────────────
// PACK A : 술이 (라벤더 곰)
// ─────────────────────────────────────────────────────────────────────────────

const SuriBase = () => (
  <>
    {/* 귀 outer */}
    <circle cx={74} cy={70} r={27} fill="#a78bfa"/>
    <circle cx={166} cy={70} r={27} fill="#a78bfa"/>
    {/* 귀 inner */}
    <circle cx={74} cy={70} r={16} fill="#fda4af"/>
    <circle cx={166} cy={70} r={16} fill="#fda4af"/>
    {/* 몸통 */}
    <ellipse cx={120} cy={192} rx={54} ry={46} fill="#c4b5fd"/>
    {/* 얼굴 */}
    <circle cx={120} cy={112} r={72} fill="#ddd6fe"/>
    {/* 볼터치 */}
    <ellipse cx={78} cy={132} rx={22} ry={14} fill="#fda4af" opacity={0.48}/>
    <ellipse cx={162} cy={132} rx={22} ry={14} fill="#fda4af" opacity={0.48}/>
  </>
);
const SuriNose = () => <ellipse cx={120} cy={126} rx={10} ry={6} fill="#9333ea"/>;

// ─────────────────────────────────────────────────────────────────────────────
// PACK B : MZ밈 — 공통 배경 & 미니멀 얼굴
// ─────────────────────────────────────────────────────────────────────────────

/** 단순한 MZ 캐릭터 얼굴: 큰 원 + 도트 눈 + 표정 */
const MzFaceBase = ({
  faceColor = '#ffe4fb', borderColor = '#f0abfc',
  eyeL = 95, eyeR = 145, eyeY = 100, eyeR2 = 11,
}: {
  faceColor?: string; borderColor?: string;
  eyeL?: number; eyeR?: number; eyeY?: number; eyeR2?: number;
}) => (
  <>
    <circle cx={120} cy={108} r={66} fill={faceColor} stroke={borderColor} strokeWidth={4}/>
    {/* 눈 */}
    <circle cx={eyeL} cy={eyeY} r={eyeR2} fill="#1e293b"/>
    <circle cx={eyeR} cy={eyeY} r={eyeR2} fill="#1e293b"/>
    <circle cx={eyeL + 4} cy={eyeY - 4} r={4} fill="white"/>
    <circle cx={eyeR + 4} cy={eyeY - 4} r={4} fill="white"/>
  </>
);

// ─────────────────────────────────────────────────────────────────────────────
// PACK C : 젤리 블롭
// ─────────────────────────────────────────────────────────────────────────────

const Jelly = ({ fill, stroke, cx=120, cy=118, rx=76, ry=72 }: {
  fill: string; stroke: string; cx?: number; cy?: number; rx?: number; ry?: number;
}) => (
  <>
    <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={stroke} opacity={0.25}/>
    <ellipse cx={cx} cy={cy} rx={rx - 6} ry={ry - 6} fill={fill}/>
    {/* 하이라이트 */}
    <ellipse cx={cx - 20} cy={cy - 24} rx={18} ry={11} fill="white" opacity={0.45} transform={`rotate(-20 ${cx - 20} ${cy - 24})`}/>
  </>
);
const JellyEye = ({ cx, cy }: { cx: number; cy: number }) => (
  <>
    <circle cx={cx} cy={cy} r={9} fill="#1e293b"/>
    <circle cx={cx + 3} cy={cy - 3} r={3.5} fill="white"/>
  </>
);

// ─────────────────────────────────────────────────────────────────────────────
// 스티커 내용 (24개)
// ─────────────────────────────────────────────────────────────────────────────

const contents: React.ReactNode[] = [

  /* ── PACK A 술이 ─────────────────────────── */

  /* 0 건배! */
  <>
    <circle cx={120} cy={120} r={112} fill="#fffbeb"/>
    <text x={34} y={56} fontSize={18} opacity={0.8}>🎊</text>
    <text x={174} y={50} fontSize={18} opacity={0.8}>🎉</text>
    <text x={176} y={88} fontSize={14} opacity={0.6}>✨</text>
    <text x={34} y={92} fontSize={14} opacity={0.6}>✨</text>
    <SuriBase/>
    {/* 활짝 웃는 눈 */}
    <path d="M84 106 Q97 92 110 106" stroke="#1e293b" strokeWidth={4.5} fill="none" strokeLinecap="round"/>
    <path d="M130 106 Q143 92 156 106" stroke="#1e293b" strokeWidth={4.5} fill="none" strokeLinecap="round"/>
    <SuriNose/>
    {/* 활짝 입 + 이 */}
    <path d="M94 136 Q120 162 146 136" stroke="#7c3aed" strokeWidth={4} fill="#f9a8d4" strokeLinecap="round"/>
    <rect x={106} y={136} width={28} height={11} rx={4} fill="white"/>
    {/* 맥주잔 양손 */}
    <path d="M78 185 Q58 170 48 158" stroke="#c4b5fd" strokeWidth={14} fill="none" strokeLinecap="round"/>
    <rect x={32} y={140} width={26} height={36} rx={6} fill="#fcd34d" stroke="#d97706" strokeWidth={2}/>
    <rect x={36} y={148} width={18} height={8} rx={3} fill="white" opacity={0.5}/>
    <path d="M162 185 Q182 170 192 158" stroke="#c4b5fd" strokeWidth={14} fill="none" strokeLinecap="round"/>
    <rect x={182} y={140} width={26} height={36} rx={6} fill="#fcd34d" stroke="#d97706" strokeWidth={2}/>
    <rect x={186} y={148} width={18} height={8} rx={3} fill="white" opacity={0.5}/>
    <text x={120} y={232} fontSize={19} textAnchor="middle" fill="#d97706" fontWeight="900" fontFamily="sans-serif">건배!</text>
  </>,

  /* 1 반했어요 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fce7f3"/>
    <text x={36} y={56} fontSize={20}>💕</text>
    <text x={172} y={52} fontSize={18}>💗</text>
    <text x={174} y={90} fontSize={14}>💖</text>
    <text x={36} y={94} fontSize={14}>💓</text>
    <SuriBase/>
    {/* 하트 눈 */}
    <text x={97} y={120} fontSize={26} textAnchor="middle" dominantBaseline="middle">❤️</text>
    <text x={143} y={120} fontSize={26} textAnchor="middle" dominantBaseline="middle">❤️</text>
    <SuriNose/>
    <path d="M100 140 Q120 158 140 140" stroke="#7c3aed" strokeWidth={4} fill="none" strokeLinecap="round"/>
    {/* 강화 볼터치 */}
    <ellipse cx={76} cy={132} rx={26} ry={17} fill="#f87171" opacity={0.38}/>
    <ellipse cx={164} cy={132} rx={26} ry={17} fill="#f87171" opacity={0.38}/>
    <text x={120} y={232} fontSize={17} textAnchor="middle" fill="#db2777" fontWeight="900" fontFamily="sans-serif">반했어요</text>
  </>,

  /* 2 부끄러워 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fff0ef"/>
    <SuriBase/>
    {/* 강한 볼터치 먼저 */}
    <ellipse cx={74} cy={130} rx={30} ry={20} fill="#f87171" opacity={0.55}/>
    <ellipse cx={166} cy={130} rx={30} ry={20} fill="#f87171" opacity={0.55}/>
    {/* 앞발로 얼굴 반쯤 가리기 */}
    <ellipse cx={88} cy={154} rx={30} ry={26} fill="#c4b5fd"/>
    <ellipse cx={152} cy={154} rx={30} ry={26} fill="#c4b5fd"/>
    {/* 눈만 보임 */}
    <circle cx={97} cy={104} r={13} fill="#1e293b"/>
    <circle cx={143} cy={104} r={13} fill="#1e293b"/>
    <circle cx={104} cy={98} r={5} fill="white"/>
    <circle cx={150} cy={98} r={5} fill="white"/>
    <SuriNose/>
    <text x={120} y={232} fontSize={17} textAnchor="middle" fill="#e11d48" fontWeight="900" fontFamily="sans-serif">부끄러워</text>
  </>,

  /* 3 취했어~ */
  <>
    <circle cx={120} cy={120} r={112} fill="#fefce8"/>
    <text x={36} y={64} fontSize={16} opacity={0.7}>🍺</text>
    <SuriBase/>
    {/* 강한 볼터치 */}
    <ellipse cx={76} cy={132} rx={28} ry={18} fill="#f87171" opacity={0.52}/>
    <ellipse cx={164} cy={132} rx={28} ry={18} fill="#f87171" opacity={0.52}/>
    {/* 빙글빙글 눈 */}
    <circle cx={97} cy={106} r={16} fill="#e2e8f0"/>
    <circle cx={143} cy={106} r={16} fill="#e2e8f0"/>
    <path d="M89 106 Q94 98 101 106 Q106 114 97 114" stroke="#7c3aed" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <path d="M135 106 Q140 98 147 106 Q152 114 143 114" stroke="#7c3aed" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <SuriNose/>
    <path d="M102 140 Q120 148 138 140" stroke="#7c3aed" strokeWidth={4} fill="none" strokeLinecap="round"/>
    {/* zzz */}
    <text x={38} y={148} fontSize={20} fill="#a78bfa" fontWeight="900" fontFamily="sans-serif">z</text>
    <text x={52} y={133} fontSize={15} fill="#a78bfa" fontWeight="900" fontFamily="sans-serif">z</text>
    <text x={63} y={122} fontSize={11} fill="#a78bfa" fontWeight="900" fontFamily="sans-serif">z</text>
    {/* 기울어진 맥주잔 */}
    <rect x={158} y={162} width={24} height={32} rx={5} fill="#fcd34d" stroke="#d97706" strokeWidth={2} transform="rotate(15 170 178)"/>
    <text x={120} y={232} fontSize={17} textAnchor="middle" fill="#ca8a04" fontWeight="900" fontFamily="sans-serif">취했어~</text>
  </>,

  /* 4 설레요! */
  <>
    <circle cx={120} cy={120} r={112} fill="#fdf2f8"/>
    <text x={30} y={64} fontSize={16}>💫</text>
    <text x={180} y={60} fontSize={16}>💫</text>
    <text x={180} y={100} fontSize={13}>✨</text>
    <text x={30} y={106} fontSize={13}>✨</text>
    <SuriBase/>
    {/* 반짝이는 눈 */}
    <circle cx={97} cy={106} r={15} fill="#1e293b"/>
    <circle cx={143} cy={106} r={15} fill="#1e293b"/>
    <circle cx={105} cy={99} r={6} fill="white"/>
    <circle cx={151} cy={99} r={6} fill="white"/>
    <circle cx={92} cy={112} r={3} fill="white" opacity={0.6}/>
    <circle cx={138} cy={112} r={3} fill="white" opacity={0.6}/>
    <SuriNose/>
    <path d="M100 138 Q120 154 140 138" stroke="#7c3aed" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <text x={58} y={182} fontSize={16}>💕</text>
    <text x={156} y={180} fontSize={16}>💕</text>
    <text x={120} y={232} fontSize={17} textAnchor="middle" fill="#db2777" fontWeight="900" fontFamily="sans-serif">설레요!</text>
  </>,

  /* 5 좋아해요 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fff0f0"/>
    <SuriBase/>
    <path d="M84 104 Q97 90 110 104" stroke="#1e293b" strokeWidth={4.5} fill="none" strokeLinecap="round"/>
    <path d="M130 104 Q143 90 156 104" stroke="#1e293b" strokeWidth={4.5} fill="none" strokeLinecap="round"/>
    <SuriNose/>
    <path d="M100 138 Q120 154 140 138" stroke="#7c3aed" strokeWidth={4} fill="none" strokeLinecap="round"/>
    {/* 큰 하트 들기 */}
    <text x={120} y={214} fontSize={58} textAnchor="middle" dominantBaseline="middle">❤️</text>
    <path d="M78 182 Q88 204 108 208" stroke="#c4b5fd" strokeWidth={14} fill="none" strokeLinecap="round"/>
    <path d="M162 182 Q152 204 132 208" stroke="#c4b5fd" strokeWidth={14} fill="none" strokeLinecap="round"/>
    <text x={120} y={236} fontSize={17} textAnchor="middle" fill="#e11d48" fontWeight="900" fontFamily="sans-serif">좋아해요</text>
  </>,

  /* 6 또 봐요! */
  <>
    <circle cx={120} cy={120} r={112} fill="#f0fdf4"/>
    <text x={50} y={54} fontSize={16}>✨</text>
    <text x={172} y={52} fontSize={16}>✨</text>
    <SuriBase/>
    <path d="M84 104 Q97 90 110 104" stroke="#1e293b" strokeWidth={4.5} fill="none" strokeLinecap="round"/>
    <path d="M130 104 Q143 90 156 104" stroke="#1e293b" strokeWidth={4.5} fill="none" strokeLinecap="round"/>
    <SuriNose/>
    <path d="M100 138 Q120 154 140 138" stroke="#7c3aed" strokeWidth={4} fill="none" strokeLinecap="round"/>
    {/* 흔드는 손 */}
    <path d="M76 182 Q60 170 52 156" stroke="#c4b5fd" strokeWidth={14} fill="none" strokeLinecap="round"/>
    <circle cx={50} cy={152} r={18} fill="#c4b5fd"/>
    <ellipse cx={42} cy={140} rx={8} ry={11} fill="#ddd6fe" transform="rotate(-22 42 140)"/>
    <ellipse cx={52} cy={136} rx={8} ry={11} fill="#ddd6fe" transform="rotate(-6 52 136)"/>
    <ellipse cx={62} cy={138} rx={7} ry={10} fill="#ddd6fe" transform="rotate(12 62 138)"/>
    <text x={120} y={232} fontSize={17} textAnchor="middle" fill="#16a34a" fontWeight="900" fontFamily="sans-serif">또 봐요!</text>
  </>,

  /* 7 잘자요~ */
  <>
    <circle cx={120} cy={120} r={112} fill="#eef2ff"/>
    <text x={164} y={60} fontSize={28}>🌙</text>
    <text x={36} y={66} fontSize={16}>⭐</text>
    <text x={52} y={96} fontSize={12}>✨</text>
    <text x={180} y={98} fontSize={11}>✨</text>
    <SuriBase/>
    {/* 감은 눈 */}
    <path d="M84 106 Q97 116 110 106" stroke="#1e293b" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <path d="M130 106 Q143 116 156 106" stroke="#1e293b" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <SuriNose/>
    <path d="M104 136 Q120 142 136 136" stroke="#7c3aed" strokeWidth={4} fill="none" strokeLinecap="round"/>
    {/* zzz */}
    <text x={148} y={98} fontSize={20} fill="#818cf8" fontWeight="900" fontFamily="sans-serif">z</text>
    <text x={164} y={82} fontSize={15} fill="#818cf8" fontWeight="900" fontFamily="sans-serif">z</text>
    <text x={176} y={70} fontSize={11} fill="#818cf8" fontWeight="900" fontFamily="sans-serif">z</text>
    {/* 이불 */}
    <ellipse cx={120} cy={210} rx={66} ry={28} fill="#c7d2fe"/>
    <ellipse cx={120} cy={202} rx={66} ry={20} fill="#ddd6fe"/>
    <text x={120} y={232} fontSize={17} textAnchor="middle" fill="#4f46e5" fontWeight="900" fontFamily="sans-serif">잘자요~</text>
  </>,

  /* ── PACK B MZ밈 ─────────────────────────── */

  /* 8 ㅋㅋ.. */
  <>
    <circle cx={120} cy={120} r={112} fill="#fff9db"/>
    {/* 빅 ㅋ 배경 텍스트 */}
    <text x={120} y={148} fontSize={110} textAnchor="middle" dominantBaseline="middle" fill="#fde68a" fontWeight="900" fontFamily="sans-serif">ㅋ</text>
    {/* 얼굴 */}
    <MzFaceBase faceColor="#fff" borderColor="#fbbf24"/>
    {/* 실눈 */}
    <path d="M82 98 Q95 108 108 98" stroke="#1e293b" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <path d="M132 98 Q145 108 158 98" stroke="#1e293b" strokeWidth={4} fill="none" strokeLinecap="round"/>
    {/* 눈물 */}
    <ellipse cx={86} cy={116} rx={7} ry={12} fill="#93c5fd" opacity={0.85}/>
    <ellipse cx={154} cy={116} rx={7} ry={12} fill="#93c5fd" opacity={0.85}/>
    {/* 입 */}
    <path d="M100 128 Q120 146 140 128" stroke="#1e293b" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <text x={120} y={210} fontSize={36} textAnchor="middle" fill="#d97706" fontWeight="900" fontFamily="sans-serif">ㅋㅋ..</text>
  </>,

  /* 9 헐!!! */
  <>
    <circle cx={120} cy={120} r={112} fill="#fff0f6"/>
    {/* 배경 느낌표 */}
    <text x={42} y={80} fontSize={44} fill="#fda4af" opacity={0.4} fontWeight="900" fontFamily="sans-serif">!</text>
    <text x={170} y={80} fontSize={44} fill="#fda4af" opacity={0.4} fontWeight="900" fontFamily="sans-serif">!</text>
    {/* 동그란 얼굴 */}
    <MzFaceBase faceColor="#ffe4f0" borderColor="#f472b6"/>
    {/* 놀란 O자 눈 */}
    <circle cx={95} cy={100} r={16} fill="#1e293b"/>
    <circle cx={145} cy={100} r={16} fill="#1e293b"/>
    <circle cx={102} cy={93} r={6} fill="white"/>
    <circle cx={152} cy={93} r={6} fill="white"/>
    {/* O자 입 */}
    <ellipse cx={120} cy={130} rx={20} ry={17} fill="#1e293b"/>
    <ellipse cx={120} cy={130} rx={13} ry={10} fill="#f87171"/>
    <text x={120} y={210} fontSize={38} textAnchor="middle" fill="#e11d48" fontWeight="900" fontFamily="sans-serif">헐!!!</text>
  </>,

  /* 10 실화야? */
  <>
    <circle cx={120} cy={120} r={112} fill="#f0f9ff"/>
    <MzFaceBase faceColor="#e0f2fe" borderColor="#38bdf8"/>
    {/* 기울어진 눈썹 */}
    <path d="M80 82 Q94 78 104 84" stroke="#1e293b" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <path d="M136 84 Q146 78 160 82" stroke="#1e293b" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    {/* 눈 */}
    <circle cx={95} cy={102} r={12} fill="#1e293b"/>
    <circle cx={145} cy={102} r={12} fill="#1e293b"/>
    <circle cx={101} cy={96} r={5} fill="white"/>
    <circle cx={151} cy={96} r={5} fill="white"/>
    {/* 삐죽 입 */}
    <path d="M102 126 Q120 120 138 126" stroke="#1e293b" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    {/* ? 기호 */}
    <text x={180} y={68} fontSize={36} fill="#0ea5e9" fontWeight="900" fontFamily="sans-serif" opacity={0.7}>?</text>
    <text x={120} y={210} fontSize={30} textAnchor="middle" fill="#0369a1" fontWeight="900" fontFamily="sans-serif">실화야?</text>
  </>,

  /* 11 대박⚡ */
  <>
    <circle cx={120} cy={120} r={112} fill="#fffbe6"/>
    {/* 번개 배경 */}
    <text x={28} y={86} fontSize={38} opacity={0.3}>⚡</text>
    <text x={168} y={82} fontSize={30} opacity={0.3}>⚡</text>
    <MzFaceBase faceColor="#fef9c3" borderColor="#facc15"/>
    {/* 별 눈 */}
    <text x={95} y={112} fontSize={26} textAnchor="middle" dominantBaseline="middle">⭐</text>
    <text x={145} y={112} fontSize={26} textAnchor="middle" dominantBaseline="middle">⭐</text>
    {/* 벌린 입 */}
    <ellipse cx={120} cy={132} rx={18} ry={14} fill="#1e293b"/>
    <ellipse cx={120} cy={132} rx={11} ry={8} fill="#fbbf24"/>
    <text x={120} y={205} fontSize={35} textAnchor="middle" fill="#d97706" fontWeight="900" fontFamily="sans-serif">대박⚡</text>
  </>,

  /* 12 ㅠㅠ */
  <>
    <circle cx={120} cy={120} r={112} fill="#f0f4ff"/>
    {/* 큰 ㅠ */}
    <text x={120} y={136} fontSize={86} textAnchor="middle" dominantBaseline="middle" fill="#c7d2fe" fontWeight="900" fontFamily="sans-serif">ㅠ</text>
    <MzFaceBase faceColor="#e0e7ff" borderColor="#818cf8" eyeY={96}/>
    {/* 눈물 폭포 */}
    <rect x={84} y={108} width={10} height={34} rx={5} fill="#93c5fd" opacity={0.8}/>
    <rect x={146} y={108} width={10} height={34} rx={5} fill="#93c5fd" opacity={0.8}/>
    {/* 물결 입 */}
    <path d="M98 126 Q109 120 120 126 Q131 132 142 126" stroke="#6366f1" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <text x={120} y={212} fontSize={40} textAnchor="middle" fill="#4f46e5" fontWeight="900" fontFamily="sans-serif">ㅠㅠ</text>
  </>,

  /* 13 취향저격 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fff0ff"/>
    {/* 활 */}
    <path d="M32 120 Q60 60 120 52" stroke="#e879f9" strokeWidth={5} fill="none" strokeLinecap="round"/>
    <line x1={32} y1={120} x2={175} y2={108} stroke="#e879f9" strokeWidth={4} strokeLinecap="round"/>
    {/* 화살 */}
    <polygon points="175,108 155,96 162,116" fill="#e879f9"/>
    <MzFaceBase faceColor="#fae8ff" borderColor="#e879f9"/>
    {/* 하트 눈 */}
    <text x={95} y={112} fontSize={24} textAnchor="middle" dominantBaseline="middle">💜</text>
    <text x={145} y={112} fontSize={24} textAnchor="middle" dominantBaseline="middle">💜</text>
    {/* 얼얼한 입 */}
    <path d="M100 130 Q120 148 140 130" stroke="#a21caf" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <text x={120} y={208} fontSize={23} textAnchor="middle" fill="#a21caf" fontWeight="900" fontFamily="sans-serif">취향저격💜</text>
  </>,

  /* 14 오늘뭐함 */
  <>
    <circle cx={120} cy={120} r={112} fill="#f0fff4"/>
    <MzFaceBase faceColor="#dcfce7" borderColor="#4ade80" eyeY={98}/>
    {/* 축 처진 눈썹 */}
    <path d="M80 82 Q95 88 108 84" stroke="#1e293b" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <path d="M132 84 Q145 88 160 82" stroke="#1e293b" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    {/* 반쯤 감긴 눈 */}
    <path d="M83 98 Q95 104 108 98" stroke="#1e293b" strokeWidth={4} fill="#c4b5fd" strokeLinecap="round"/>
    <path d="M132 98 Q145 104 158 98" stroke="#1e293b" strokeWidth={4} fill="#c4b5fd" strokeLinecap="round"/>
    <circle cx={95} cy={101} r={6} fill="#1e293b"/>
    <circle cx={145} cy={101} r={6} fill="#1e293b"/>
    {/* 폰 들고 있기 */}
    <rect x={90} y={128} width={60} height={44} rx={8} fill="#1e293b"/>
    <rect x={94} y={132} width={52} height={32} rx={5} fill="#4ade80"/>
    <circle cx={120} cy={166} r={4} fill="#64748b"/>
    <text x={120} y={214} fontSize={21} textAnchor="middle" fill="#15803d" fontWeight="900" fontFamily="sans-serif">오늘뭐함</text>
  </>,

  /* 15 짱이야🔥 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fff5f0"/>
    {/* 불꽃 배경 */}
    <text x={32} y={80} fontSize={34} opacity={0.25}>🔥</text>
    <text x={170} y={76} fontSize={28} opacity={0.25}>🔥</text>
    <MzFaceBase faceColor="#ffedd5" borderColor="#f97316"/>
    {/* 윙크 */}
    <circle cx={95} cy={100} r={13} fill="#1e293b"/>
    <circle cx={101} cy={94} r={5} fill="white"/>
    <path d="M132 100 Q145 90 158 100" stroke="#1e293b" strokeWidth={4} fill="none" strokeLinecap="round"/>
    {/* 엄지 */}
    <path d="M148 130 Q166 122 172 112" stroke="#fdba74" strokeWidth={12} fill="none" strokeLinecap="round"/>
    <ellipse cx={173} cy={108} rx={12} ry={16} fill="#fdba74" transform="rotate(-20 173 108)"/>
    <ellipse cx={182} cy={98} rx={7} ry={10} fill="#fed7aa" transform="rotate(-38 182 98)"/>
    <text x={100} y={210} fontSize={28} textAnchor="middle" fill="#ea580c" fontWeight="900" fontFamily="sans-serif">짱이야🔥</text>
  </>,

  /* ── PACK C 젤리 ─────────────────────────── */

  /* 16 민트젤리 — 인사 */
  <>
    <circle cx={120} cy={120} r={112} fill="#e6fffb"/>
    <Jelly fill="#5eead4" stroke="#0d9488"/>
    {/* 눈 */}
    <JellyEye cx={100} cy={108}/>
    <JellyEye cx={140} cy={108}/>
    {/* 웃는 입 */}
    <path d="M104 130 Q120 145 136 130" stroke="#0d9488" strokeWidth={4} fill="none" strokeLinecap="round"/>
    {/* 볼 */}
    <ellipse cx={84} cy={124} rx={14} ry={9} fill="#99f6e4" opacity={0.7}/>
    <ellipse cx={156} cy={124} rx={14} ry={9} fill="#99f6e4" opacity={0.7}/>
    {/* 흔드는 손 */}
    <path d="M60 136 Q44 116 40 96" stroke="#5eead4" strokeWidth={13} fill="none" strokeLinecap="round"/>
    <circle cx={38} cy={92} r={14} fill="#5eead4"/>
    <text x={120} y={218} fontSize={17} textAnchor="middle" fill="#0d9488" fontWeight="900" fontFamily="sans-serif">민트젤리</text>
  </>,

  /* 17 피치젤리 — 하트 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fff0eb"/>
    <Jelly fill="#fb923c" stroke="#ea580c"/>
    <JellyEye cx={100} cy={106}/>
    <JellyEye cx={140} cy={106}/>
    <path d="M104 128 Q120 143 136 128" stroke="#9a3412" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <ellipse cx={83} cy={122} rx={14} ry={9} fill="#fed7aa" opacity={0.7}/>
    <ellipse cx={157} cy={122} rx={14} ry={9} fill="#fed7aa" opacity={0.7}/>
    {/* 하트 */}
    <text x={120} y={194} fontSize={38} textAnchor="middle" dominantBaseline="middle">🧡</text>
    <text x={120} y={218} fontSize={17} textAnchor="middle" fill="#ea580c" fontWeight="900" fontFamily="sans-serif">피치젤리</text>
  </>,

  /* 18 레몬젤리 — 별 눈 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fffde7"/>
    <Jelly fill="#fde047" stroke="#ca8a04"/>
    {/* 별 눈 */}
    <text x={100} y={116} fontSize={24} textAnchor="middle" dominantBaseline="middle">⭐</text>
    <text x={140} y={116} fontSize={24} textAnchor="middle" dominantBaseline="middle">⭐</text>
    <path d="M104 132 Q120 147 136 132" stroke="#92400e" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <ellipse cx={84} cy={126} rx={14} ry={9} fill="#fef08a" opacity={0.75}/>
    <ellipse cx={156} cy={126} rx={14} ry={9} fill="#fef08a" opacity={0.75}/>
    <text x={120} y={218} fontSize={17} textAnchor="middle" fill="#92400e" fontWeight="900" fontFamily="sans-serif">레몬젤리</text>
  </>,

  /* 19 포도젤리 — 졸려 */
  <>
    <circle cx={120} cy={120} r={112} fill="#f3e8ff"/>
    <Jelly fill="#a855f7" stroke="#7e22ce"/>
    {/* 반쯤 감긴 눈 */}
    <path d="M87 108 Q100 114 113 108" stroke="#1e293b" strokeWidth={4} fill="#7e22ce" strokeLinecap="round"/>
    <path d="M127 108 Q140 114 153 108" stroke="#1e293b" strokeWidth={4} fill="#7e22ce" strokeLinecap="round"/>
    <circle cx={100} cy={111} r={6} fill="#1e293b"/>
    <circle cx={140} cy={111} r={6} fill="#1e293b"/>
    <path d="M106 130 Q120 136 134 130" stroke="#7e22ce" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    {/* zzz */}
    <text x={156} y={88} fontSize={16} fill="#c4b5fd" fontWeight="900" fontFamily="sans-serif">z</text>
    <text x={168} y={74} fontSize={12} fill="#c4b5fd" fontWeight="900" fontFamily="sans-serif">z</text>
    <text x={120} y={218} fontSize={17} textAnchor="middle" fill="#7e22ce" fontWeight="900" fontFamily="sans-serif">포도젤리</text>
  </>,

  /* 20 딸기젤리 — 신남 */
  <>
    <circle cx={120} cy={120} r={112} fill="#ffe4e6"/>
    <Jelly fill="#f43f5e" stroke="#be123c"/>
    <JellyEye cx={100} cy={104}/>
    <JellyEye cx={140} cy={104}/>
    {/* 크게 웃음 */}
    <path d="M96 126 Q120 150 144 126" stroke="#be123c" strokeWidth={4} fill="#fda4af" strokeLinecap="round"/>
    <rect x={108} y={126} width={24} height={10} rx={4} fill="white"/>
    {/* 양팔 번쩍 */}
    <path d="M64 118 Q52 98 48 78" stroke="#f43f5e" strokeWidth={12} fill="none" strokeLinecap="round"/>
    <path d="M176 118 Q188 98 192 78" stroke="#f43f5e" strokeWidth={12} fill="none" strokeLinecap="round"/>
    <text x={120} y={218} fontSize={17} textAnchor="middle" fill="#be123c" fontWeight="900" fontFamily="sans-serif">딸기젤리</text>
  </>,

  /* 21 블루젤리 — 엄지척 */
  <>
    <circle cx={120} cy={120} r={112} fill="#e0f2fe"/>
    <Jelly fill="#38bdf8" stroke="#0284c7"/>
    <JellyEye cx={100} cy={108}/>
    <JellyEye cx={140} cy={108}/>
    <path d="M104 130 Q120 145 136 130" stroke="#0284c7" strokeWidth={4} fill="none" strokeLinecap="round"/>
    {/* 엄지 */}
    <path d="M168 128 Q180 118 184 106" stroke="#38bdf8" strokeWidth={12} fill="none" strokeLinecap="round"/>
    <ellipse cx={185} cy={101} rx={12} ry={15} fill="#38bdf8" transform="rotate(-22 185 101)"/>
    <ellipse cx={193} cy={91} rx={7} ry={9} fill="#bae6fd" transform="rotate(-36 193 91)"/>
    <text x={108} y={218} fontSize={17} textAnchor="middle" fill="#0284c7" fontWeight="900" fontFamily="sans-serif">블루젤리</text>
  </>,

  /* 22 라임젤리 — 음악 */
  <>
    <circle cx={120} cy={120} r={112} fill="#dcfce7"/>
    <Jelly fill="#4ade80" stroke="#16a34a"/>
    <JellyEye cx={100} cy={108}/>
    <JellyEye cx={140} cy={108}/>
    <path d="M104 130 Q120 145 136 130" stroke="#15803d" strokeWidth={4} fill="none" strokeLinecap="round"/>
    {/* 음표 */}
    <text x={150} y={80} fontSize={24} fill="#16a34a" opacity={0.8}>♪</text>
    <text x={54} y={76} fontSize={20} fill="#16a34a" opacity={0.8}>♫</text>
    <text x={172} y={104} fontSize={16} fill="#16a34a" opacity={0.6}>♩</text>
    <text x={108} y={218} fontSize={17} textAnchor="middle" fill="#15803d" fontWeight="900" fontFamily="sans-serif">라임젤리</text>
  </>,

  /* 23 무지개젤리 — 셀럽레이션 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fdf2f8"/>
    {/* 그라데이션 블롭: 여러 겹 */}
    <ellipse cx={120} cy={118} rx={82} ry={78} fill="#ff6b9d" opacity={0.2}/>
    <ellipse cx={120} cy={118} rx={76} ry={72} fill="#a855f7" opacity={0.2}/>
    <ellipse cx={120} cy={118} rx={70} ry={66} fill="#38bdf8" opacity={0.2}/>
    <ellipse cx={120} cy={118} rx={64} ry={60} fill="#4ade80" opacity={0.2}/>
    {/* 메인 블롭 */}
    <ellipse cx={120} cy={118} rx={60} ry={56} fill="white" opacity={0.85}/>
    <ellipse cx={100} cy={94} rx={18} ry={10} fill="white" opacity={0.4} transform="rotate(-20 100 94)"/>
    {/* 눈 */}
    <text x={100} y={114} fontSize={22} textAnchor="middle" dominantBaseline="middle">🌈</text>
    <text x={140} y={114} fontSize={22} textAnchor="middle" dominantBaseline="middle">🌈</text>
    <path d="M100 136 Q120 152 140 136" stroke="#a855f7" strokeWidth={4} fill="none" strokeLinecap="round"/>
    {/* 양팔 번쩍 */}
    <path d="M68 120 Q52 100 46 78" stroke="#fb923c" strokeWidth={12} fill="none" strokeLinecap="round"/>
    <path d="M172 120 Q188 100 194 78" stroke="#38bdf8" strokeWidth={12} fill="none" strokeLinecap="round"/>
    <text x={64} y={58} fontSize={16} opacity={0.8}>🎊</text>
    <text x={160} y={56} fontSize={16} opacity={0.8}>🎉</text>
    <text x={120} y={218} fontSize={17} textAnchor="middle" fill="#9333ea" fontWeight="900" fontFamily="sans-serif">무지개🌈</text>
  </>,
];

export function StickerSVG({ idx, size = 120 }: { idx: number; size?: number }) {
  const content = contents[idx] ?? contents[0];
  return (
    <svg viewBox="0 0 240 240" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      {content}
    </svg>
  );
}
