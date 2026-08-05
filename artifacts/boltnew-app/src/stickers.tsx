// ─── 술번개 스티커 100개 (13팩) ──────────────────────────────────────────────
// Pack A (0-7)   : 술이     — 라벤더 곰
// Pack B (8-15)  : MZ밈     — 굵은 텍스트 + 아트
// Pack C (16-23) : 젤리     — 컬러풀 블롭
// Pack D (24-31) : 술이2    — 술이 시즌2
// Pack E (32-39) : MZ밈2   — MZ 시즌2
// Pack F (40-47) : 젤리2    — 젤리 시즌2
// Pack G (48-55) : 댕댕이   — 강아지 캐릭터
// Pack H (56-63) : 냥이     — 고양이 캐릭터
// Pack I (64-71) : 회식꼬마 — 회식 전용
// Pack J (72-79) : 버블     — 말풍선 텍스트
// Pack K (80-87) : 로맨스   — 사랑/연애
// Pack L (88-95) : 응원단   — 격려/응원
// Pack M (96-99) : 스페셜   — 4종 스페셜

import React from 'react';

export const STICKER_COUNT = 100;

export const STICKER_PACKS = [
  { label: '🐻‍❄️ 술이',   color: 'violet', start: 0,  count: 8 },
  { label: '🔥 MZ밈',    color: 'yellow', start: 8,  count: 8 },
  { label: '🟢 젤리',    color: 'teal',   start: 16, count: 8 },
  { label: '🐻 술이2',   color: 'purple', start: 24, count: 8 },
  { label: '⚡ MZ2',    color: 'orange', start: 32, count: 8 },
  { label: '🍬 젤리2',   color: 'pink',   start: 40, count: 8 },
  { label: '🐶 댕댕이',  color: 'amber',  start: 48, count: 8 },
  { label: '🐱 냥이',   color: 'blue',   start: 56, count: 8 },
  { label: '🍺 회식꼬마', color: 'green',  start: 64, count: 8 },
  { label: '💬 버블',    color: 'cyan',   start: 72, count: 8 },
  { label: '💝 로맨스',  color: 'rose',   start: 80, count: 8 },
  { label: '🎉 응원단',  color: 'sky',    start: 88, count: 8 },
  { label: '✨ 스페셜',  color: 'indigo', start: 96, count: 4 },
];

export const STICKER_LABELS = [
  // Pack A 술이
  '건배!','반했어요','부끄러워','취했어~','설레요!','좋아해요','또 봐요!','잘자요~',
  // Pack B MZ밈
  'ㅋㅋ..','헐!!!','실화야?','대박⚡','ㅠㅠ','취향저격','오늘뭐함','짱이야🔥',
  // Pack C 젤리
  '민트젤리','피치젤리','레몬젤리','포도젤리','딸기젤리','블루젤리','라임젤리','무지개🌈',
  // Pack D 술이2
  '화이팅!','맛있어!','나야나~','행복해🌸','무서워!','화났어😤','수고했어','보고싶어',
  // Pack E MZ2
  '아ㅋ','뭐?!','쩐다!','개울어','허탈','감사합니다','레전드👑','어떡해🆘',
  // Pack F 젤리2
  '오렌지','하늘빛','핑크핑크','다크초코','블랙쿨','샛노랑','빨강빨강','별별젤리',
  // Pack G 댕댕이
  '멍멍!','사랑해요','신나냥','졸려요','먹고싶어','화났어','또 봐요','최고야!',
  // Pack H 냥이
  '냥~','좋아해','모르겠다냥','야옹','놀라냥','부탁해냥','자야겠다','최고냥',
  // Pack I 회식꼬마
  '건배~','배불러','노래해','춤춰','화이팅','졸려요','맥주!','집가고싶어',
  // Pack J 버블
  '오케이👍','ㄱㄱ🏃','알겠어!','잠깐만~','기다려!','나중에!','맞아맞아','아니야ㅠ',
  // Pack K 로맨스
  '좋아해♥','사귈래?','보고싶어','예뻐요','멋있어','설레♡','연락해','대화하자',
  // Pack L 응원단
  '할수있어','화이팅!!','잘했어👏','대단해!','최고야⭐','힘내!','완벽해','믿어💪',
  // Pack M 스페셜
  '감사합니다','죄송해요','축하해🎉','행운을🍀',
];

export const STICKER_BG: string[] = [
  // Pack A 라벤더
  '#f5f3ff','#fce7f3','#fff0ef','#fefce8','#fdf2f8','#fff0f0','#f0fdf4','#eef2ff',
  // Pack B 비비드
  '#fff9db','#fff0f6','#f0f9ff','#fffbe6','#f0f4ff','#fff0ff','#f0fff4','#fff5f0',
  // Pack C 젤리
  '#e6fffb','#fff0eb','#fffde7','#f3e8ff','#ffe4e6','#e0f2fe','#dcfce7','#fdf2f8',
  // Pack D 술이2 파스텔
  '#fef9c3','#fdf4ff','#ecfdf5','#fff1f2','#eff6ff','#fef3c7','#f0fdfa','#fdf2f8',
  // Pack E MZ2
  '#fff7ed','#fdf4ff','#f0f9ff','#fff1f2','#f8fafc','#ecfdf5','#fffbeb','#fee2e2',
  // Pack F 젤리2
  '#fff7ed','#e0f2fe','#fdf2f8','#1c1917','#0f172a','#fef08a','#fee2e2','#fdf4ff',
  // Pack G 댕댕이
  '#fef9c3','#fce7f3','#fff7ed','#f0f9ff','#fff5f0','#fef3c7','#f0fdf4','#fffbeb',
  // Pack H 냥이
  '#f1f5f9','#fce7f3','#f0f9ff','#fff0eb','#fffde7','#ecfdf5','#f3e8ff','#fdf2f8',
  // Pack I 회식꼬마
  '#fffbeb','#fff0eb','#eff6ff','#fdf4ff','#fef9c3','#f0f9ff','#fff7ed','#fff1f2',
  // Pack J 버블
  '#ecfdf5','#f0f9ff','#fff7ed','#fdf4ff','#fef9c3','#fff1f2','#eff6ff','#fdf2f8',
  // Pack K 로맨스
  '#fff0f0','#fce7f3','#fdf2f8','#fff0ef','#fff0f6','#ffe4e6','#fce7f3','#fff0f0',
  // Pack L 응원
  '#fffbeb','#ecfdf5','#eff6ff','#fdf4ff','#fff7ed','#f0f9ff','#fef9c3','#f0fdf4',
  // Pack M 스페셜
  '#ecfdf5','#fff1f2','#fffbeb','#f0fdf4',
];

// ── 공통 베이스 컴포넌트 ───────────────────────────────────────────────────────

const SuriBase = () => (
  <>
    <circle cx={74} cy={70} r={27} fill="#a78bfa"/>
    <circle cx={166} cy={70} r={27} fill="#a78bfa"/>
    <circle cx={74} cy={70} r={16} fill="#fda4af"/>
    <circle cx={166} cy={70} r={16} fill="#fda4af"/>
    <ellipse cx={120} cy={192} rx={54} ry={46} fill="#c4b5fd"/>
    <circle cx={120} cy={112} r={72} fill="#ddd6fe"/>
    <ellipse cx={78} cy={132} rx={22} ry={14} fill="#fda4af" opacity={0.48}/>
    <ellipse cx={162} cy={132} rx={22} ry={14} fill="#fda4af" opacity={0.48}/>
  </>
);
const SuriNose = () => <ellipse cx={120} cy={126} rx={10} ry={6} fill="#9333ea"/>;

const MzFaceBase = ({
  faceColor = '#ffe4fb', borderColor = '#f0abfc',
  eyeL = 95, eyeR = 145, eyeY = 100, eyeR2 = 11,
}: {
  faceColor?: string; borderColor?: string;
  eyeL?: number; eyeR?: number; eyeY?: number; eyeR2?: number;
}) => (
  <>
    <circle cx={120} cy={108} r={66} fill={faceColor} stroke={borderColor} strokeWidth={4}/>
    <circle cx={eyeL} cy={eyeY} r={eyeR2} fill="#1e293b"/>
    <circle cx={eyeR} cy={eyeY} r={eyeR2} fill="#1e293b"/>
    <circle cx={eyeL + 4} cy={eyeY - 4} r={4} fill="white"/>
    <circle cx={eyeR + 4} cy={eyeY - 4} r={4} fill="white"/>
  </>
);

const Jelly = ({ fill, stroke, cx=120, cy=118, rx=76, ry=72 }: {
  fill: string; stroke: string; cx?: number; cy?: number; rx?: number; ry?: number;
}) => (
  <>
    <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={stroke} opacity={0.25}/>
    <ellipse cx={cx} cy={cy} rx={rx - 6} ry={ry - 6} fill={fill}/>
    <ellipse cx={cx - 20} cy={cy - 24} rx={18} ry={11} fill="white" opacity={0.45} transform={`rotate(-20 ${cx - 20} ${cy - 24})`}/>
  </>
);
const JellyEye = ({ cx, cy }: { cx: number; cy: number }) => (
  <>
    <circle cx={cx} cy={cy} r={9} fill="#1e293b"/>
    <circle cx={cx + 3} cy={cy - 3} r={3.5} fill="white"/>
  </>
);

// 강아지 베이스
const DogBase = ({ fur = '#fbbf24', ear = '#f59e0b', inner = '#fde68a' }: { fur?: string; ear?: string; inner?: string }) => (
  <>
    <ellipse cx={76} cy={76} rx={28} ry={34} fill={ear} transform="rotate(-14 76 76)"/>
    <ellipse cx={164} cy={76} rx={28} ry={34} fill={ear} transform="rotate(14 164 76)"/>
    <ellipse cx={76} cy={82} rx={17} ry={22} fill={inner} transform="rotate(-14 76 82)"/>
    <ellipse cx={164} cy={82} rx={17} ry={22} fill={inner} transform="rotate(14 164 82)"/>
    <circle cx={120} cy={116} r={72} fill={fur}/>
    <ellipse cx={120} cy={140} rx={32} ry={20} fill={inner}/>
    <ellipse cx={82} cy={130} rx={18} ry={12} fill="#f87171" opacity={0.38}/>
    <ellipse cx={158} cy={130} rx={18} ry={12} fill="#f87171" opacity={0.38}/>
  </>
);
const DogEye = ({ cx, cy }: { cx: number; cy: number }) => (
  <>
    <circle cx={cx} cy={cy} r={11} fill="#1e293b"/>
    <circle cx={cx + 4} cy={cy - 4} r={4} fill="white"/>
  </>
);
const DogNose = () => <ellipse cx={120} cy={128} rx={12} ry={8} fill="#1e293b"/>;

// 고양이 베이스
const CatBase = ({ fur = '#e2e8f0', inner = '#fda4af' }: { fur?: string; inner?: string }) => (
  <>
    <polygon points="60,88 80,34 102,88" fill={fur}/>
    <polygon points="138,88 160,34 180,88" fill={fur}/>
    <polygon points="67,86 80,46 93,86" fill={inner}/>
    <polygon points="147,86 160,46 173,86" fill={inner}/>
    <circle cx={120} cy={122} r={70} fill={fur}/>
    <ellipse cx={82} cy={136} rx={18} ry={12} fill="#fda4af" opacity={0.38}/>
    <ellipse cx={158} cy={136} rx={18} ry={12} fill="#fda4af" opacity={0.38}/>
    <polygon points="120,118 114,126 126,126" fill={inner}/>
    <line x1={72} y1={130} x2={108} y2={126} stroke="#94a3b8" strokeWidth={2} strokeLinecap="round"/>
    <line x1={72} y1={138} x2={108} y2={132} stroke="#94a3b8" strokeWidth={2} strokeLinecap="round"/>
    <line x1={132} y1={126} x2={168} y2={130} stroke="#94a3b8" strokeWidth={2} strokeLinecap="round"/>
    <line x1={132} y1={132} x2={168} y2={138} stroke="#94a3b8" strokeWidth={2} strokeLinecap="round"/>
  </>
);
const CatEye = ({ cx, cy }: { cx: number; cy: number }) => (
  <>
    <ellipse cx={cx} cy={cy} rx={10} ry={12} fill="#1e293b"/>
    <circle cx={cx + 3} cy={cy - 4} r={4} fill="white"/>
  </>
);

// 회식꼬마 (동그란 작은 사람)
const HoesikBase = ({ bodyColor = '#6ee7b7', headColor = '#fde68a' }: { bodyColor?: string; headColor?: string }) => (
  <>
    <ellipse cx={120} cy={185} rx={52} ry={44} fill={bodyColor}/>
    <circle cx={120} cy={108} r={62} fill={headColor}/>
    <ellipse cx={88} cy={122} rx={16} ry={11} fill="#f87171" opacity={0.4}/>
    <ellipse cx={152} cy={122} rx={16} ry={11} fill="#f87171" opacity={0.4}/>
  </>
);
const HoesikEye = ({ cx, cy }: { cx: number; cy: number }) => (
  <>
    <circle cx={cx} cy={cy} r={9} fill="#1e293b"/>
    <circle cx={cx + 3} cy={cy - 3} r={3.5} fill="white"/>
  </>
);

// ── 스티커 내용 ───────────────────────────────────────────────────────────────
const contents: React.ReactNode[] = [

  /* ══════════ PACK A: 술이 (0-7) ══════════ */

  /* 0 건배! */
  <>
    <circle cx={120} cy={120} r={112} fill="#fffbeb"/>
    <text x={34} y={56} fontSize={18} opacity={0.8}>🎊</text>
    <text x={174} y={50} fontSize={18} opacity={0.8}>🎉</text>
    <text x={176} y={88} fontSize={14} opacity={0.6}>✨</text>
    <text x={34} y={92} fontSize={14} opacity={0.6}>✨</text>
    <SuriBase/>
    <path d="M84 106 Q97 92 110 106" stroke="#1e293b" strokeWidth={4.5} fill="none" strokeLinecap="round"/>
    <path d="M130 106 Q143 92 156 106" stroke="#1e293b" strokeWidth={4.5} fill="none" strokeLinecap="round"/>
    <SuriNose/>
    <path d="M94 136 Q120 162 146 136" stroke="#7c3aed" strokeWidth={4} fill="#f9a8d4" strokeLinecap="round"/>
    <rect x={106} y={136} width={28} height={11} rx={4} fill="white"/>
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
    <text x={97} y={120} fontSize={26} textAnchor="middle" dominantBaseline="middle">❤️</text>
    <text x={143} y={120} fontSize={26} textAnchor="middle" dominantBaseline="middle">❤️</text>
    <SuriNose/>
    <path d="M100 140 Q120 158 140 140" stroke="#7c3aed" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <ellipse cx={76} cy={132} rx={26} ry={17} fill="#f87171" opacity={0.38}/>
    <ellipse cx={164} cy={132} rx={26} ry={17} fill="#f87171" opacity={0.38}/>
    <text x={120} y={232} fontSize={17} textAnchor="middle" fill="#db2777" fontWeight="900" fontFamily="sans-serif">반했어요</text>
  </>,

  /* 2 부끄러워 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fff0ef"/>
    <SuriBase/>
    <ellipse cx={74} cy={130} rx={30} ry={20} fill="#f87171" opacity={0.55}/>
    <ellipse cx={166} cy={130} rx={30} ry={20} fill="#f87171" opacity={0.55}/>
    <ellipse cx={88} cy={154} rx={30} ry={26} fill="#c4b5fd"/>
    <ellipse cx={152} cy={154} rx={30} ry={26} fill="#c4b5fd"/>
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
    <ellipse cx={76} cy={132} rx={28} ry={18} fill="#f87171" opacity={0.52}/>
    <ellipse cx={164} cy={132} rx={28} ry={18} fill="#f87171" opacity={0.52}/>
    <circle cx={97} cy={106} r={16} fill="#e2e8f0"/>
    <circle cx={143} cy={106} r={16} fill="#e2e8f0"/>
    <path d="M89 106 Q94 98 101 106 Q106 114 97 114" stroke="#7c3aed" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <path d="M135 106 Q140 98 147 106 Q152 114 143 114" stroke="#7c3aed" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <SuriNose/>
    <path d="M102 140 Q120 148 138 140" stroke="#7c3aed" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <text x={38} y={148} fontSize={20} fill="#a78bfa" fontWeight="900" fontFamily="sans-serif">z</text>
    <text x={52} y={133} fontSize={15} fill="#a78bfa" fontWeight="900" fontFamily="sans-serif">z</text>
    <text x={63} y={122} fontSize={11} fill="#a78bfa" fontWeight="900" fontFamily="sans-serif">z</text>
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
    <path d="M84 106 Q97 116 110 106" stroke="#1e293b" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <path d="M130 106 Q143 116 156 106" stroke="#1e293b" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <SuriNose/>
    <path d="M104 136 Q120 142 136 136" stroke="#7c3aed" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <text x={148} y={98} fontSize={20} fill="#818cf8" fontWeight="900" fontFamily="sans-serif">z</text>
    <text x={164} y={82} fontSize={15} fill="#818cf8" fontWeight="900" fontFamily="sans-serif">z</text>
    <text x={176} y={70} fontSize={11} fill="#818cf8" fontWeight="900" fontFamily="sans-serif">z</text>
    <ellipse cx={120} cy={210} rx={66} ry={28} fill="#c7d2fe"/>
    <ellipse cx={120} cy={202} rx={66} ry={20} fill="#ddd6fe"/>
    <text x={120} y={232} fontSize={17} textAnchor="middle" fill="#4f46e5" fontWeight="900" fontFamily="sans-serif">잘자요~</text>
  </>,

  /* ══════════ PACK B: MZ밈 (8-15) ══════════ */

  /* 8 ㅋㅋ.. */
  <>
    <circle cx={120} cy={120} r={112} fill="#fff9db"/>
    <text x={120} y={148} fontSize={110} textAnchor="middle" dominantBaseline="middle" fill="#fde68a" fontWeight="900" fontFamily="sans-serif">ㅋ</text>
    <MzFaceBase faceColor="#fff" borderColor="#fbbf24"/>
    <path d="M82 98 Q95 108 108 98" stroke="#1e293b" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <path d="M132 98 Q145 108 158 98" stroke="#1e293b" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <ellipse cx={86} cy={116} rx={7} ry={12} fill="#93c5fd" opacity={0.85}/>
    <ellipse cx={154} cy={116} rx={7} ry={12} fill="#93c5fd" opacity={0.85}/>
    <path d="M100 128 Q120 146 140 128" stroke="#1e293b" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <text x={120} y={210} fontSize={36} textAnchor="middle" fill="#d97706" fontWeight="900" fontFamily="sans-serif">ㅋㅋ..</text>
  </>,

  /* 9 헐!!! */
  <>
    <circle cx={120} cy={120} r={112} fill="#fff0f6"/>
    <text x={42} y={80} fontSize={44} fill="#fda4af" opacity={0.4} fontWeight="900" fontFamily="sans-serif">!</text>
    <text x={170} y={80} fontSize={44} fill="#fda4af" opacity={0.4} fontWeight="900" fontFamily="sans-serif">!</text>
    <MzFaceBase faceColor="#ffe4f0" borderColor="#f472b6"/>
    <circle cx={95} cy={100} r={16} fill="#1e293b"/>
    <circle cx={145} cy={100} r={16} fill="#1e293b"/>
    <circle cx={102} cy={93} r={6} fill="white"/>
    <circle cx={152} cy={93} r={6} fill="white"/>
    <ellipse cx={120} cy={130} rx={20} ry={17} fill="#1e293b"/>
    <ellipse cx={120} cy={130} rx={13} ry={10} fill="#f87171"/>
    <text x={120} y={210} fontSize={38} textAnchor="middle" fill="#e11d48" fontWeight="900" fontFamily="sans-serif">헐!!!</text>
  </>,

  /* 10 실화야? */
  <>
    <circle cx={120} cy={120} r={112} fill="#f0f9ff"/>
    <MzFaceBase faceColor="#e0f2fe" borderColor="#38bdf8"/>
    <path d="M80 82 Q94 78 104 84" stroke="#1e293b" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <path d="M136 84 Q146 78 160 82" stroke="#1e293b" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <circle cx={95} cy={102} r={12} fill="#1e293b"/>
    <circle cx={145} cy={102} r={12} fill="#1e293b"/>
    <circle cx={101} cy={96} r={5} fill="white"/>
    <circle cx={151} cy={96} r={5} fill="white"/>
    <path d="M102 126 Q120 120 138 126" stroke="#1e293b" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <text x={180} y={68} fontSize={36} fill="#0ea5e9" fontWeight="900" fontFamily="sans-serif" opacity={0.7}>?</text>
    <text x={120} y={210} fontSize={30} textAnchor="middle" fill="#0369a1" fontWeight="900" fontFamily="sans-serif">실화야?</text>
  </>,

  /* 11 대박⚡ */
  <>
    <circle cx={120} cy={120} r={112} fill="#fffbe6"/>
    <text x={28} y={86} fontSize={38} opacity={0.3}>⚡</text>
    <text x={168} y={82} fontSize={30} opacity={0.3}>⚡</text>
    <MzFaceBase faceColor="#fef9c3" borderColor="#facc15"/>
    <text x={95} y={112} fontSize={26} textAnchor="middle" dominantBaseline="middle">⭐</text>
    <text x={145} y={112} fontSize={26} textAnchor="middle" dominantBaseline="middle">⭐</text>
    <ellipse cx={120} cy={132} rx={18} ry={14} fill="#1e293b"/>
    <ellipse cx={120} cy={132} rx={11} ry={8} fill="#fbbf24"/>
    <text x={120} y={205} fontSize={35} textAnchor="middle" fill="#d97706" fontWeight="900" fontFamily="sans-serif">대박⚡</text>
  </>,

  /* 12 ㅠㅠ */
  <>
    <circle cx={120} cy={120} r={112} fill="#f0f4ff"/>
    <text x={120} y={136} fontSize={86} textAnchor="middle" dominantBaseline="middle" fill="#c7d2fe" fontWeight="900" fontFamily="sans-serif">ㅠ</text>
    <MzFaceBase faceColor="#e0e7ff" borderColor="#818cf8" eyeY={96}/>
    <rect x={84} y={108} width={10} height={34} rx={5} fill="#93c5fd" opacity={0.8}/>
    <rect x={146} y={108} width={10} height={34} rx={5} fill="#93c5fd" opacity={0.8}/>
    <path d="M98 126 Q109 120 120 126 Q131 132 142 126" stroke="#6366f1" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <text x={120} y={212} fontSize={40} textAnchor="middle" fill="#4f46e5" fontWeight="900" fontFamily="sans-serif">ㅠㅠ</text>
  </>,

  /* 13 취향저격 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fff0ff"/>
    <path d="M32 120 Q60 60 120 52" stroke="#e879f9" strokeWidth={5} fill="none" strokeLinecap="round"/>
    <line x1={32} y1={120} x2={175} y2={108} stroke="#e879f9" strokeWidth={4} strokeLinecap="round"/>
    <polygon points="175,108 155,96 162,116" fill="#e879f9"/>
    <MzFaceBase faceColor="#fae8ff" borderColor="#e879f9"/>
    <text x={95} y={112} fontSize={24} textAnchor="middle" dominantBaseline="middle">💜</text>
    <text x={145} y={112} fontSize={24} textAnchor="middle" dominantBaseline="middle">💜</text>
    <path d="M100 130 Q120 148 140 130" stroke="#a21caf" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <text x={120} y={208} fontSize={23} textAnchor="middle" fill="#a21caf" fontWeight="900" fontFamily="sans-serif">취향저격💜</text>
  </>,

  /* 14 오늘뭐함 */
  <>
    <circle cx={120} cy={120} r={112} fill="#f0fff4"/>
    <MzFaceBase faceColor="#dcfce7" borderColor="#4ade80" eyeY={98}/>
    <path d="M80 82 Q95 88 108 84" stroke="#1e293b" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <path d="M132 84 Q145 88 160 82" stroke="#1e293b" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <path d="M83 98 Q95 104 108 98" stroke="#1e293b" strokeWidth={4} fill="#c4b5fd" strokeLinecap="round"/>
    <path d="M132 98 Q145 104 158 98" stroke="#1e293b" strokeWidth={4} fill="#c4b5fd" strokeLinecap="round"/>
    <circle cx={95} cy={101} r={6} fill="#1e293b"/>
    <circle cx={145} cy={101} r={6} fill="#1e293b"/>
    <rect x={90} y={128} width={60} height={44} rx={8} fill="#1e293b"/>
    <rect x={94} y={132} width={52} height={32} rx={5} fill="#4ade80"/>
    <circle cx={120} cy={166} r={4} fill="#64748b"/>
    <text x={120} y={214} fontSize={21} textAnchor="middle" fill="#15803d" fontWeight="900" fontFamily="sans-serif">오늘뭐함</text>
  </>,

  /* 15 짱이야🔥 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fff5f0"/>
    <text x={32} y={80} fontSize={34} opacity={0.25}>🔥</text>
    <text x={170} y={76} fontSize={28} opacity={0.25}>🔥</text>
    <MzFaceBase faceColor="#ffedd5" borderColor="#f97316"/>
    <circle cx={95} cy={100} r={13} fill="#1e293b"/>
    <circle cx={101} cy={94} r={5} fill="white"/>
    <path d="M132 100 Q145 90 158 100" stroke="#1e293b" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <path d="M148 130 Q166 122 172 112" stroke="#fdba74" strokeWidth={12} fill="none" strokeLinecap="round"/>
    <ellipse cx={173} cy={108} rx={12} ry={16} fill="#fdba74" transform="rotate(-20 173 108)"/>
    <ellipse cx={182} cy={98} rx={7} ry={10} fill="#fed7aa" transform="rotate(-38 182 98)"/>
    <text x={100} y={210} fontSize={28} textAnchor="middle" fill="#ea580c" fontWeight="900" fontFamily="sans-serif">짱이야🔥</text>
  </>,

  /* ══════════ PACK C: 젤리 (16-23) ══════════ */

  /* 16 민트젤리 */
  <>
    <circle cx={120} cy={120} r={112} fill="#e6fffb"/>
    <Jelly fill="#5eead4" stroke="#0d9488"/>
    <JellyEye cx={100} cy={108}/><JellyEye cx={140} cy={108}/>
    <path d="M104 130 Q120 145 136 130" stroke="#0d9488" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <ellipse cx={84} cy={124} rx={14} ry={9} fill="#99f6e4" opacity={0.7}/>
    <ellipse cx={156} cy={124} rx={14} ry={9} fill="#99f6e4" opacity={0.7}/>
    <path d="M60 136 Q44 116 40 96" stroke="#5eead4" strokeWidth={13} fill="none" strokeLinecap="round"/>
    <circle cx={38} cy={92} r={14} fill="#5eead4"/>
    <text x={120} y={218} fontSize={17} textAnchor="middle" fill="#0d9488" fontWeight="900" fontFamily="sans-serif">민트젤리</text>
  </>,

  /* 17 피치젤리 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fff0eb"/>
    <Jelly fill="#fb923c" stroke="#ea580c"/>
    <JellyEye cx={100} cy={106}/><JellyEye cx={140} cy={106}/>
    <path d="M104 128 Q120 143 136 128" stroke="#9a3412" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <ellipse cx={83} cy={122} rx={14} ry={9} fill="#fed7aa" opacity={0.7}/>
    <ellipse cx={157} cy={122} rx={14} ry={9} fill="#fed7aa" opacity={0.7}/>
    <text x={120} y={194} fontSize={38} textAnchor="middle" dominantBaseline="middle">🧡</text>
    <text x={120} y={218} fontSize={17} textAnchor="middle" fill="#ea580c" fontWeight="900" fontFamily="sans-serif">피치젤리</text>
  </>,

  /* 18 레몬젤리 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fffde7"/>
    <Jelly fill="#fde047" stroke="#ca8a04"/>
    <text x={100} y={116} fontSize={24} textAnchor="middle" dominantBaseline="middle">⭐</text>
    <text x={140} y={116} fontSize={24} textAnchor="middle" dominantBaseline="middle">⭐</text>
    <path d="M104 132 Q120 147 136 132" stroke="#92400e" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <ellipse cx={84} cy={126} rx={14} ry={9} fill="#fef08a" opacity={0.75}/>
    <ellipse cx={156} cy={126} rx={14} ry={9} fill="#fef08a" opacity={0.75}/>
    <text x={120} y={218} fontSize={17} textAnchor="middle" fill="#92400e" fontWeight="900" fontFamily="sans-serif">레몬젤리</text>
  </>,

  /* 19 포도젤리 */
  <>
    <circle cx={120} cy={120} r={112} fill="#f3e8ff"/>
    <Jelly fill="#a855f7" stroke="#7e22ce"/>
    <path d="M87 108 Q100 114 113 108" stroke="#1e293b" strokeWidth={4} fill="#7e22ce" strokeLinecap="round"/>
    <path d="M127 108 Q140 114 153 108" stroke="#1e293b" strokeWidth={4} fill="#7e22ce" strokeLinecap="round"/>
    <circle cx={100} cy={111} r={6} fill="#1e293b"/>
    <circle cx={140} cy={111} r={6} fill="#1e293b"/>
    <path d="M106 130 Q120 136 134 130" stroke="#7e22ce" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <text x={156} y={88} fontSize={16} fill="#c4b5fd" fontWeight="900" fontFamily="sans-serif">z</text>
    <text x={168} y={74} fontSize={12} fill="#c4b5fd" fontWeight="900" fontFamily="sans-serif">z</text>
    <text x={120} y={218} fontSize={17} textAnchor="middle" fill="#7e22ce" fontWeight="900" fontFamily="sans-serif">포도젤리</text>
  </>,

  /* 20 딸기젤리 */
  <>
    <circle cx={120} cy={120} r={112} fill="#ffe4e6"/>
    <Jelly fill="#f43f5e" stroke="#be123c"/>
    <JellyEye cx={100} cy={104}/><JellyEye cx={140} cy={104}/>
    <path d="M96 126 Q120 150 144 126" stroke="#be123c" strokeWidth={4} fill="#fda4af" strokeLinecap="round"/>
    <rect x={108} y={126} width={24} height={10} rx={4} fill="white"/>
    <path d="M64 118 Q52 98 48 78" stroke="#f43f5e" strokeWidth={12} fill="none" strokeLinecap="round"/>
    <path d="M176 118 Q188 98 192 78" stroke="#f43f5e" strokeWidth={12} fill="none" strokeLinecap="round"/>
    <text x={120} y={218} fontSize={17} textAnchor="middle" fill="#be123c" fontWeight="900" fontFamily="sans-serif">딸기젤리</text>
  </>,

  /* 21 블루젤리 */
  <>
    <circle cx={120} cy={120} r={112} fill="#e0f2fe"/>
    <Jelly fill="#38bdf8" stroke="#0284c7"/>
    <JellyEye cx={100} cy={108}/><JellyEye cx={140} cy={108}/>
    <path d="M104 130 Q120 145 136 130" stroke="#0284c7" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <path d="M168 128 Q180 118 184 106" stroke="#38bdf8" strokeWidth={12} fill="none" strokeLinecap="round"/>
    <ellipse cx={185} cy={101} rx={12} ry={15} fill="#38bdf8" transform="rotate(-22 185 101)"/>
    <ellipse cx={193} cy={91} rx={7} ry={9} fill="#bae6fd" transform="rotate(-36 193 91)"/>
    <text x={108} y={218} fontSize={17} textAnchor="middle" fill="#0284c7" fontWeight="900" fontFamily="sans-serif">블루젤리</text>
  </>,

  /* 22 라임젤리 */
  <>
    <circle cx={120} cy={120} r={112} fill="#dcfce7"/>
    <Jelly fill="#4ade80" stroke="#16a34a"/>
    <JellyEye cx={100} cy={108}/><JellyEye cx={140} cy={108}/>
    <path d="M104 130 Q120 145 136 130" stroke="#15803d" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <text x={150} y={80} fontSize={24} fill="#16a34a" opacity={0.8}>♪</text>
    <text x={54} y={76} fontSize={20} fill="#16a34a" opacity={0.8}>♫</text>
    <text x={172} y={104} fontSize={16} fill="#16a34a" opacity={0.6}>♩</text>
    <text x={108} y={218} fontSize={17} textAnchor="middle" fill="#15803d" fontWeight="900" fontFamily="sans-serif">라임젤리</text>
  </>,

  /* 23 무지개 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fdf2f8"/>
    <ellipse cx={120} cy={118} rx={82} ry={78} fill="#ff6b9d" opacity={0.2}/>
    <ellipse cx={120} cy={118} rx={76} ry={72} fill="#a855f7" opacity={0.2}/>
    <ellipse cx={120} cy={118} rx={70} ry={66} fill="#38bdf8" opacity={0.2}/>
    <ellipse cx={120} cy={118} rx={64} ry={60} fill="#4ade80" opacity={0.2}/>
    <ellipse cx={120} cy={118} rx={60} ry={56} fill="white" opacity={0.85}/>
    <ellipse cx={100} cy={94} rx={18} ry={10} fill="white" opacity={0.4} transform="rotate(-20 100 94)"/>
    <text x={100} y={114} fontSize={22} textAnchor="middle" dominantBaseline="middle">🌈</text>
    <text x={140} y={114} fontSize={22} textAnchor="middle" dominantBaseline="middle">🌈</text>
    <path d="M100 136 Q120 152 140 136" stroke="#a855f7" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <path d="M68 120 Q52 100 46 78" stroke="#fb923c" strokeWidth={12} fill="none" strokeLinecap="round"/>
    <path d="M172 120 Q188 100 194 78" stroke="#38bdf8" strokeWidth={12} fill="none" strokeLinecap="round"/>
    <text x={64} y={58} fontSize={16} opacity={0.8}>🎊</text>
    <text x={160} y={56} fontSize={16} opacity={0.8}>🎉</text>
    <text x={120} y={218} fontSize={17} textAnchor="middle" fill="#9333ea" fontWeight="900" fontFamily="sans-serif">무지개🌈</text>
  </>,

  /* ══════════ PACK D: 술이2 (24-31) ══════════ */

  /* 24 화이팅! */
  <>
    <circle cx={120} cy={120} r={112} fill="#fef9c3"/>
    <text x={30} y={60} fontSize={16}>⭐</text><text x={178} y={56} fontSize={16}>⭐</text>
    <text x={170} y={94} fontSize={13}>✨</text><text x={40} y={96} fontSize={13}>✨</text>
    <SuriBase/>
    <path d="M84 104 Q97 90 110 104" stroke="#1e293b" strokeWidth={4.5} fill="none" strokeLinecap="round"/>
    <path d="M130 104 Q143 90 156 104" stroke="#1e293b" strokeWidth={4.5} fill="none" strokeLinecap="round"/>
    <SuriNose/>
    <path d="M100 136 Q120 152 140 136" stroke="#7c3aed" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <path d="M56 172 Q46 144 48 118" stroke="#c4b5fd" strokeWidth={14} fill="none" strokeLinecap="round"/>
    <circle cx={48} cy={112} r={18} fill="#c4b5fd"/>
    <path d="M184 172 Q194 144 192 118" stroke="#c4b5fd" strokeWidth={14} fill="none" strokeLinecap="round"/>
    <circle cx={192} cy={112} r={18} fill="#c4b5fd"/>
    <text x={120} y={232} fontSize={19} textAnchor="middle" fill="#d97706" fontWeight="900" fontFamily="sans-serif">화이팅!</text>
  </>,

  /* 25 맛있어! */
  <>
    <circle cx={120} cy={120} r={112} fill="#fdf4ff"/>
    <text x={32} y={68} fontSize={18}>🍜</text><text x={172} y={62} fontSize={16}>✨</text>
    <SuriBase/>
    <path d="M84 104 Q97 90 110 104" stroke="#1e293b" strokeWidth={4.5} fill="none" strokeLinecap="round"/>
    <path d="M130 104 Q143 90 156 104" stroke="#1e293b" strokeWidth={4.5} fill="none" strokeLinecap="round"/>
    <SuriNose/>
    <path d="M96 136 Q120 162 144 136" stroke="#7c3aed" strokeWidth={4} fill="#f9a8d4" strokeLinecap="round"/>
    <path d="M104 174 Q116 192 120 196" stroke="#c4b5fd" strokeWidth={10} fill="none" strokeLinecap="round"/>
    <ellipse cx={120} cy={199} rx={12} ry={7} fill="#fda4af"/>
    <text x={120} y={232} fontSize={17} textAnchor="middle" fill="#a21caf" fontWeight="900" fontFamily="sans-serif">맛있어!</text>
  </>,

  /* 26 나야나~ */
  <>
    <circle cx={120} cy={120} r={112} fill="#ecfdf5"/>
    <text x={36} y={56} fontSize={16}>💫</text><text x={172} y={52} fontSize={16}>⭐</text>
    <SuriBase/>
    <path d="M84 104 Q97 90 110 104" stroke="#1e293b" strokeWidth={4.5} fill="none" strokeLinecap="round"/>
    <path d="M130 104 Q143 90 156 104" stroke="#1e293b" strokeWidth={4.5} fill="none" strokeLinecap="round"/>
    <SuriNose/>
    <path d="M100 140 Q120 158 140 140" stroke="#7c3aed" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <ellipse cx={120} cy={192} rx={58} ry={28} fill="#a78bfa"/>
    <path d="M68 180 Q56 160 58 140" stroke="#c4b5fd" strokeWidth={12} fill="none" strokeLinecap="round"/>
    <path d="M172 180 Q184 160 182 140" stroke="#c4b5fd" strokeWidth={12} fill="none" strokeLinecap="round"/>
    <text x={120} y={232} fontSize={17} textAnchor="middle" fill="#7c3aed" fontWeight="900" fontFamily="sans-serif">나야나~</text>
  </>,

  /* 27 행복해🌸 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fff1f2"/>
    <text x={38} y={56} fontSize={18}>🌸</text><text x={168} y={50} fontSize={18}>🌸</text>
    <text x={170} y={90} fontSize={14}>🌺</text><text x={38} y={92} fontSize={14}>🌺</text>
    <SuriBase/>
    <path d="M84 106 Q97 92 110 106" stroke="#1e293b" strokeWidth={4.5} fill="none" strokeLinecap="round"/>
    <path d="M130 106 Q143 92 156 106" stroke="#1e293b" strokeWidth={4.5} fill="none" strokeLinecap="round"/>
    <SuriNose/>
    <path d="M96 138 Q120 162 144 138" stroke="#7c3aed" strokeWidth={4} fill="#f9a8d4" strokeLinecap="round"/>
    <rect x={108} y={138} width={24} height={11} rx={4} fill="white"/>
    <text x={120} y={232} fontSize={17} textAnchor="middle" fill="#e11d48" fontWeight="900" fontFamily="sans-serif">행복해🌸</text>
  </>,

  /* 28 무서워! */
  <>
    <circle cx={120} cy={120} r={112} fill="#eff6ff"/>
    <text x={36} y={66} fontSize={22} opacity={0.5}>👻</text>
    <SuriBase/>
    <ellipse cx={76} cy={132} rx={28} ry={18} fill="#f87171" opacity={0.52}/>
    <ellipse cx={164} cy={132} rx={28} ry={18} fill="#f87171" opacity={0.52}/>
    <circle cx={94} cy={102} r={16} fill="#1e293b"/>
    <circle cx={146} cy={102} r={16} fill="#1e293b"/>
    <circle cx={102} cy={94} r={7} fill="white"/>
    <circle cx={154} cy={94} r={7} fill="white"/>
    <SuriNose/>
    <path d="M100 142 Q110 134 120 142 Q130 150 140 142" stroke="#7c3aed" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <ellipse cx={88} cy={156} rx={28} ry={22} fill="#c4b5fd"/>
    <ellipse cx={152} cy={156} rx={28} ry={22} fill="#c4b5fd"/>
    <text x={120} y={232} fontSize={17} textAnchor="middle" fill="#1d4ed8" fontWeight="900" fontFamily="sans-serif">무서워!</text>
  </>,

  /* 29 화났어😤 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fef3c7"/>
    <text x={36} y={60} fontSize={18} opacity={0.5}>💢</text>
    <text x={172} y={58} fontSize={16} opacity={0.5}>💢</text>
    <SuriBase/>
    <path d="M78 90 Q92 82 106 88" stroke="#1e293b" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <path d="M134 88 Q148 82 162 90" stroke="#1e293b" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <circle cx={94} cy={106} r={12} fill="#1e293b"/>
    <circle cx={146} cy={106} r={12} fill="#1e293b"/>
    <circle cx={100} cy={100} r={5} fill="white"/>
    <circle cx={152} cy={100} r={5} fill="white"/>
    <SuriNose/>
    <path d="M100 140 Q110 134 120 140 Q130 146 140 140" stroke="#7c3aed" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <text x={120} y={232} fontSize={17} textAnchor="middle" fill="#b45309" fontWeight="900" fontFamily="sans-serif">화났어😤</text>
  </>,

  /* 30 수고했어 */
  <>
    <circle cx={120} cy={120} r={112} fill="#f0fdfa"/>
    <text x={170} y={62} fontSize={18}>🌙</text>
    <SuriBase/>
    <ellipse cx={76} cy={132} rx={24} ry={16} fill="#f87171" opacity={0.48}/>
    <ellipse cx={164} cy={132} rx={24} ry={16} fill="#f87171" opacity={0.48}/>
    <path d="M86 106 Q97 114 108 106" stroke="#1e293b" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <path d="M132 106 Q143 114 154 106" stroke="#1e293b" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <SuriNose/>
    <path d="M106 136 Q120 142 134 136" stroke="#7c3aed" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <text x={44} y={132} fontSize={15} fill="#a78bfa" fontWeight="900" fontFamily="sans-serif">z</text>
    <text x={54} y={116} fontSize={11} fill="#a78bfa" fontWeight="900" fontFamily="sans-serif">z</text>
    <text x={120} y={232} fontSize={17} textAnchor="middle" fill="#0d9488" fontWeight="900" fontFamily="sans-serif">수고했어</text>
  </>,

  /* 31 보고싶어 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fdf2f8"/>
    <text x={38} y={62} fontSize={16}>💭</text><text x={172} y={58} fontSize={16}>💭</text>
    <SuriBase/>
    <circle cx={94} cy={104} r={14} fill="#1e293b"/>
    <circle cx={146} cy={104} r={14} fill="#1e293b"/>
    <circle cx={100} cy={98} r={5} fill="white"/>
    <circle cx={152} cy={98} r={5} fill="white"/>
    <SuriNose/>
    <path d="M100 138 Q120 148 140 138" stroke="#7c3aed" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <text x={58} y={182} fontSize={16}>💕</text>
    <text x={154} y={180} fontSize={16}>💕</text>
    <text x={120} y={232} fontSize={17} textAnchor="middle" fill="#db2777" fontWeight="900" fontFamily="sans-serif">보고싶어</text>
  </>,

  /* ══════════ PACK E: MZ2 (32-39) ══════════ */

  /* 32 아ㅋ */
  <>
    <circle cx={120} cy={120} r={112} fill="#fff7ed"/>
    <text x={120} y={148} fontSize={80} textAnchor="middle" dominantBaseline="middle" fill="#fed7aa" fontWeight="900" fontFamily="sans-serif">ㅋ</text>
    <MzFaceBase faceColor="#fff7ed" borderColor="#f97316"/>
    <path d="M84 100 Q96 108 108 100" stroke="#1e293b" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <circle cx={145} cy={100} r={10} fill="#1e293b"/>
    <circle cx={150} cy={95} r={4} fill="white"/>
    <path d="M102 122 Q120 138 138 122" stroke="#1e293b" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <text x={120} y={210} fontSize={34} textAnchor="middle" fill="#ea580c" fontWeight="900" fontFamily="sans-serif">아ㅋ</text>
  </>,

  /* 33 뭐?! */
  <>
    <circle cx={120} cy={120} r={112} fill="#fdf4ff"/>
    <text x={38} y={78} fontSize={36} fill="#e9d5ff" opacity={0.5} fontWeight="900" fontFamily="sans-serif">?</text>
    <text x={168} y={74} fontSize={36} fill="#e9d5ff" opacity={0.5} fontWeight="900" fontFamily="sans-serif">!</text>
    <MzFaceBase faceColor="#faf5ff" borderColor="#c084fc"/>
    <path d="M80 84 Q93 76 106 82" stroke="#1e293b" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <path d="M134 82 Q147 76 160 84" stroke="#1e293b" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <circle cx={93} cy={104} r={14} fill="#1e293b"/>
    <circle cx={147} cy={104} r={14} fill="#1e293b"/>
    <circle cx={100} cy={97} r={5} fill="white"/>
    <circle cx={154} cy={97} r={5} fill="white"/>
    <ellipse cx={120} cy={128} rx={16} ry={12} fill="#1e293b"/>
    <ellipse cx={120} cy={128} rx={10} ry={7} fill="#a855f7"/>
    <text x={120} y={208} fontSize={36} textAnchor="middle" fill="#7c3aed" fontWeight="900" fontFamily="sans-serif">뭐?!</text>
  </>,

  /* 34 쩐다! */
  <>
    <circle cx={120} cy={120} r={112} fill="#f0f9ff"/>
    <text x={30} y={76} fontSize={26} opacity={0.35}>⚡</text>
    <text x={174} y={72} fontSize={22} opacity={0.35}>⚡</text>
    <MzFaceBase faceColor="#e0f2fe" borderColor="#0ea5e9"/>
    <text x={95} y={110} fontSize={24} textAnchor="middle" dominantBaseline="middle">💎</text>
    <text x={145} y={110} fontSize={24} textAnchor="middle" dominantBaseline="middle">💎</text>
    <ellipse cx={120} cy={130} rx={18} ry={13} fill="#1e293b"/>
    <ellipse cx={120} cy={130} rx={11} ry={7} fill="#38bdf8"/>
    <text x={120} y={206} fontSize={32} textAnchor="middle" fill="#0284c7" fontWeight="900" fontFamily="sans-serif">쩐다!</text>
  </>,

  /* 35 개울어 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fff1f2"/>
    <MzFaceBase faceColor="#ffe4e6" borderColor="#fb7185"/>
    <path d="M84 96 Q96 108 108 96" stroke="#1e293b" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <path d="M132 96 Q144 108 156 96" stroke="#1e293b" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <ellipse cx={88} cy={116} rx={9} ry={16} fill="#93c5fd" opacity={0.9}/>
    <ellipse cx={152} cy={116} rx={9} ry={16} fill="#93c5fd" opacity={0.9}/>
    <path d="M98 130 Q120 150 142 130" stroke="#1e293b" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <text x={120} y={207} fontSize={26} textAnchor="middle" fill="#e11d48" fontWeight="900" fontFamily="sans-serif">개울어😂</text>
  </>,

  /* 36 허탈 */
  <>
    <circle cx={120} cy={120} r={112} fill="#f8fafc"/>
    <MzFaceBase faceColor="#f1f5f9" borderColor="#94a3b8"/>
    <path d="M84 96 Q96 104 108 96" stroke="#1e293b" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <path d="M132 96 Q144 104 156 96" stroke="#1e293b" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <circle cx={95} cy={99} r={7} fill="#1e293b"/>
    <circle cx={145} cy={99} r={7} fill="#1e293b"/>
    <path d="M100 130 Q110 124 120 130 Q130 136 140 130" stroke="#64748b" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <text x={40} y={86} fontSize={18} opacity={0.4}>...</text>
    <text x={120} y={208} fontSize={28} textAnchor="middle" fill="#64748b" fontWeight="900" fontFamily="sans-serif">허탈..</text>
  </>,

  /* 37 감사합니다 */
  <>
    <circle cx={120} cy={120} r={112} fill="#ecfdf5"/>
    <text x={36} y={60} fontSize={18}>🙏</text><text x={172} y={56} fontSize={18}>✨</text>
    <MzFaceBase faceColor="#d1fae5" borderColor="#34d399"/>
    <path d="M84 104 Q97 92 110 104" stroke="#1e293b" strokeWidth={4.5} fill="none" strokeLinecap="round"/>
    <path d="M130 104 Q143 92 156 104" stroke="#1e293b" strokeWidth={4.5} fill="none" strokeLinecap="round"/>
    <ellipse cx={78} cy={118} rx={16} ry={10} fill="#6ee7b7" opacity={0.5}/>
    <ellipse cx={162} cy={118} rx={16} ry={10} fill="#6ee7b7" opacity={0.5}/>
    <path d="M100 128 Q120 146 140 128" stroke="#059669" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <text x={120} y={208} fontSize={21} textAnchor="middle" fill="#047857" fontWeight="900" fontFamily="sans-serif">감사합니다🙏</text>
  </>,

  /* 38 레전드👑 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fffbeb"/>
    <text x={88} y={64} fontSize={40} textAnchor="middle" dominantBaseline="middle">👑</text>
    <MzFaceBase faceColor="#fef9c3" borderColor="#fbbf24"/>
    <text x={95} y={110} fontSize={22} textAnchor="middle" dominantBaseline="middle">⭐</text>
    <text x={145} y={110} fontSize={22} textAnchor="middle" dominantBaseline="middle">⭐</text>
    <path d="M100 130 Q120 148 140 130" stroke="#d97706" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <text x={120} y={207} fontSize={26} textAnchor="middle" fill="#b45309" fontWeight="900" fontFamily="sans-serif">레전드👑</text>
  </>,

  /* 39 어떡해🆘 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fee2e2"/>
    <text x={36} y={68} fontSize={20} opacity={0.5}>🆘</text>
    <text x={172} y={64} fontSize={18} opacity={0.5}>❗</text>
    <MzFaceBase faceColor="#fecaca" borderColor="#f87171"/>
    <path d="M80 82 Q93 76 106 80" stroke="#1e293b" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <path d="M134 80 Q147 76 160 82" stroke="#1e293b" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <circle cx={93} cy={102} r={14} fill="#1e293b"/>
    <circle cx={147} cy={102} r={14} fill="#1e293b"/>
    <circle cx={100} cy={95} r={6} fill="white"/>
    <circle cx={154} cy={95} r={6} fill="white"/>
    <ellipse cx={120} cy={128} rx={18} ry={14} fill="#1e293b"/>
    <ellipse cx={120} cy={128} rx={11} ry={8} fill="#ef4444"/>
    <text x={120} y={207} fontSize={24} textAnchor="middle" fill="#b91c1c" fontWeight="900" fontFamily="sans-serif">어떡해🆘</text>
  </>,

  /* ══════════ PACK F: 젤리2 (40-47) ══════════ */

  /* 40 오렌지 — 파이팅 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fff7ed"/>
    <Jelly fill="#fb923c" stroke="#ea580c" cy={110}/>
    <JellyEye cx={100} cy={100}/><JellyEye cx={140} cy={100}/>
    <path d="M100 120 Q120 136 140 120" stroke="#9a3412" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <path d="M60 110 Q46 86 44 64" stroke="#fb923c" strokeWidth={12} fill="none" strokeLinecap="round"/>
    <path d="M180 110 Q194 86 196 64" stroke="#fb923c" strokeWidth={12} fill="none" strokeLinecap="round"/>
    <text x={120} y={218} fontSize={17} textAnchor="middle" fill="#ea580c" fontWeight="900" fontFamily="sans-serif">오렌지🔥</text>
  </>,

  /* 41 하늘빛 — 시원 */
  <>
    <circle cx={120} cy={120} r={112} fill="#e0f2fe"/>
    <Jelly fill="#7dd3fc" stroke="#0284c7" cy={112}/>
    <JellyEye cx={100} cy={102}/><JellyEye cx={140} cy={102}/>
    <path d="M104 124 Q120 138 136 124" stroke="#0369a1" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <text x={150} y={82} fontSize={20} fill="#0ea5e9">❄️</text>
    <text x={50} y={80} fontSize={18} fill="#0ea5e9">💧</text>
    <text x={120} y={218} fontSize={17} textAnchor="middle" fill="#0284c7" fontWeight="900" fontFamily="sans-serif">하늘빛❄️</text>
  </>,

  /* 42 핑크핑크 — 사랑 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fdf2f8"/>
    <Jelly fill="#f9a8d4" stroke="#db2777" cy={112}/>
    <text x={100} y={108} fontSize={22} textAnchor="middle" dominantBaseline="middle">💗</text>
    <text x={140} y={108} fontSize={22} textAnchor="middle" dominantBaseline="middle">💗</text>
    <path d="M104 126 Q120 142 136 126" stroke="#be185d" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <text x={56} y={78} fontSize={16}>💕</text><text x={154} y={74} fontSize={16}>💕</text>
    <text x={120} y={218} fontSize={17} textAnchor="middle" fill="#be185d" fontWeight="900" fontFamily="sans-serif">핑크핑크💗</text>
  </>,

  /* 43 다크초코 — 피곤 */
  <>
    <circle cx={120} cy={120} r={112} fill="#1c1917"/>
    <Jelly fill="#92400e" stroke="#78350f" cy={112}/>
    <path d="M86 104 Q99 110 112 104" stroke="#fde68a" strokeWidth={4} fill="#78350f" strokeLinecap="round"/>
    <path d="M128 104 Q141 110 154 104" stroke="#fde68a" strokeWidth={4} fill="#78350f" strokeLinecap="round"/>
    <circle cx={99} cy={107} r={6} fill="#fde68a"/>
    <circle cx={141} cy={107} r={6} fill="#fde68a"/>
    <path d="M106 126 Q120 130 134 126" stroke="#fde68a" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <text x={156} y={88} fontSize={16} fill="#fde68a" fontWeight="900" fontFamily="sans-serif">z</text>
    <text x={168} y={74} fontSize={12} fill="#fde68a" fontWeight="900" fontFamily="sans-serif">z</text>
    <text x={120} y={218} fontSize={17} textAnchor="middle" fill="#fde68a" fontWeight="900" fontFamily="sans-serif">다크초코</text>
  </>,

  /* 44 블랙쿨 — 쿨함 */
  <>
    <circle cx={120} cy={120} r={112} fill="#0f172a"/>
    <Jelly fill="#1e293b" stroke="#334155" cy={114}/>
    <ellipse cx={120} cy={96} rx={50} ry={18} fill="#1e293b"/>
    <ellipse cx={120} cy={96} rx={46} ry={14} fill="#0f172a"/>
    <JellyEye cx={100} cy={108}/><JellyEye cx={140} cy={108}/>
    <ellipse cx={100} cy={92} rx={18} ry={10} fill="#334155"/>
    <ellipse cx={140} cy={92} rx={18} ry={10} fill="#334155"/>
    <path d="M104 128 Q120 134 136 128" stroke="#94a3b8" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <text x={120} y={218} fontSize={17} textAnchor="middle" fill="#94a3b8" fontWeight="900" fontFamily="sans-serif">블랙쿨😎</text>
  </>,

  /* 45 샛노랑 — 신남 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fef9c3"/>
    <Jelly fill="#facc15" stroke="#ca8a04" cy={112}/>
    <JellyEye cx={100} cy={102}/><JellyEye cx={140} cy={102}/>
    <path d="M96 122 Q120 148 144 122" stroke="#92400e" strokeWidth={4} fill="#fde68a" strokeLinecap="round"/>
    <rect x={108} y={122} width={24} height={11} rx={4} fill="white"/>
    <path d="M60 116 Q48 92 46 70" stroke="#facc15" strokeWidth={12} fill="none" strokeLinecap="round"/>
    <path d="M180 116 Q192 92 194 70" stroke="#facc15" strokeWidth={12} fill="none" strokeLinecap="round"/>
    <text x={120} y={218} fontSize={17} textAnchor="middle" fill="#92400e" fontWeight="900" fontFamily="sans-serif">샛노랑🌟</text>
  </>,

  /* 46 빨강빨강 — 화남 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fee2e2"/>
    <Jelly fill="#f87171" stroke="#dc2626" cy={112}/>
    <text x={40} y={78} fontSize={18} opacity={0.5}>💢</text>
    <text x={172} y={72} fontSize={16} opacity={0.5}>💢</text>
    <path d="M84 96 Q96 86 108 92" stroke="#991b1b" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <path d="M132 92 Q144 86 156 96" stroke="#991b1b" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <circle cx={95} cy={106} r={11} fill="#991b1b"/>
    <circle cx={145} cy={106} r={11} fill="#991b1b"/>
    <circle cx={101} cy={100} r={4} fill="white"/>
    <circle cx={151} cy={100} r={4} fill="white"/>
    <path d="M104 128 Q112 120 120 128 Q128 136 136 128" stroke="#991b1b" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <text x={120} y={218} fontSize={17} textAnchor="middle" fill="#991b1b" fontWeight="900" fontFamily="sans-serif">빨강빨강😡</text>
  </>,

  /* 47 별별젤리 — 특별 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fdf4ff"/>
    <ellipse cx={120} cy={116} rx={80} ry={76} fill="#f0abfc" opacity={0.3}/>
    <ellipse cx={120} cy={116} rx={70} ry={66} fill="#e879f9" opacity={0.2}/>
    <ellipse cx={120} cy={116} rx={60} ry={56} fill="#d946ef" opacity={0.15}/>
    <ellipse cx={120} cy={116} rx={52} ry={48} fill="white" opacity={0.85}/>
    <ellipse cx={100} cy={90} rx={16} ry={9} fill="white" opacity={0.4} transform="rotate(-20 100 90)"/>
    <text x={100} y={112} fontSize={22} textAnchor="middle" dominantBaseline="middle">⭐</text>
    <text x={140} y={112} fontSize={22} textAnchor="middle" dominantBaseline="middle">⭐</text>
    <path d="M104 130 Q120 146 136 130" stroke="#c026d3" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <text x={44} y={62} fontSize={14}>✨</text><text x={168} y={60} fontSize={14}>✨</text>
    <text x={120} y={218} fontSize={17} textAnchor="middle" fill="#a21caf" fontWeight="900" fontFamily="sans-serif">별별젤리✨</text>
  </>,

  /* ══════════ PACK G: 댕댕이 (48-55) ══════════ */

  /* 48 멍멍! */
  <>
    <circle cx={120} cy={120} r={112} fill="#fef9c3"/>
    <DogBase/>
    <DogEye cx={96} cy={106}/><DogEye cx={144} cy={106}/>
    <DogNose/>
    <path d="M104 148 Q120 162 136 148" stroke="#1e293b" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <ellipse cx={120} cy={156} rx={18} ry={10} fill="#fde68a"/>
    <path d="M78 185 Q60 172 54 156" stroke="#fbbf24" strokeWidth={14} fill="none" strokeLinecap="round"/>
    <circle cx={52} cy={152} r={16} fill="#fbbf24"/>
    <text x={120} y={232} fontSize={19} textAnchor="middle" fill="#d97706" fontWeight="900" fontFamily="sans-serif">멍멍!</text>
  </>,

  /* 49 사랑해요 — 하트눈 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fce7f3"/>
    <text x={36} y={60} fontSize={18}>💕</text><text x={172} y={56} fontSize={16}>💖</text>
    <DogBase/>
    <text x={96} y={114} fontSize={26} textAnchor="middle" dominantBaseline="middle">❤️</text>
    <text x={144} y={114} fontSize={26} textAnchor="middle" dominantBaseline="middle">❤️</text>
    <DogNose/>
    <path d="M104 148 Q120 164 136 148" stroke="#1e293b" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <ellipse cx={120} cy={156} rx={18} ry={10} fill="#fde68a"/>
    <ellipse cx={80} cy={130} rx={20} ry={14} fill="#f87171" opacity={0.42}/>
    <ellipse cx={160} cy={130} rx={20} ry={14} fill="#f87171" opacity={0.42}/>
    <text x={120} y={232} fontSize={17} textAnchor="middle" fill="#be185d" fontWeight="900" fontFamily="sans-serif">사랑해요🐶</text>
  </>,

  /* 50 신나 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fff7ed"/>
    <text x={34} y={62} fontSize={16}>⭐</text><text x={174} y={58} fontSize={16}>✨</text>
    <DogBase/>
    <DogEye cx={94} cy={104}/><DogEye cx={146} cy={104}/>
    <DogNose/>
    <path d="M96 144 Q120 168 144 144" stroke="#1e293b" strokeWidth={4} fill="#fde68a" strokeLinecap="round"/>
    <rect x={108} y={144} width={24} height={12} rx={4} fill="white"/>
    <path d="M58 172 Q46 148 46 122" stroke="#fbbf24" strokeWidth={12} fill="none" strokeLinecap="round"/>
    <path d="M182 172 Q194 148 194 122" stroke="#fbbf24" strokeWidth={12} fill="none" strokeLinecap="round"/>
    <text x={120} y={232} fontSize={17} textAnchor="middle" fill="#d97706" fontWeight="900" fontFamily="sans-serif">신나신나🎉</text>
  </>,

  /* 51 졸려요 */
  <>
    <circle cx={120} cy={120} r={112} fill="#f0f9ff"/>
    <DogBase fur="#93c5fd" ear="#60a5fa" inner="#bfdbfe"/>
    <path d="M84 104 Q96 112 108 104" stroke="#1e293b" strokeWidth={4} fill="#60a5fa" strokeLinecap="round"/>
    <path d="M132 104 Q144 112 156 104" stroke="#1e293b" strokeWidth={4} fill="#60a5fa" strokeLinecap="round"/>
    <circle cx={96} cy={107} r={7} fill="#1e293b"/>
    <circle cx={144} cy={107} r={7} fill="#1e293b"/>
    <ellipse cx={120} cy={128} rx={12} ry={8} fill="#1e293b"/>
    <text x={156} y={88} fontSize={18} fill="#93c5fd" fontWeight="900" fontFamily="sans-serif">z</text>
    <text x={170} y={72} fontSize={13} fill="#93c5fd" fontWeight="900" fontFamily="sans-serif">z</text>
    <text x={182} y={60} fontSize={9} fill="#93c5fd" fontWeight="900" fontFamily="sans-serif">z</text>
    <text x={120} y={232} fontSize={17} textAnchor="middle" fill="#3b82f6" fontWeight="900" fontFamily="sans-serif">졸려요~🌙</text>
  </>,

  /* 52 먹고싶어 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fff5f0"/>
    <text x={32} y={66} fontSize={22}>🍖</text>
    <DogBase/>
    <DogEye cx={94} cy={102}/><DogEye cx={146} cy={102}/>
    <DogNose/>
    <path d="M104 148 Q120 162 136 148" stroke="#1e293b" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <ellipse cx={120} cy={155} rx={20} ry={10} fill="#fde68a"/>
    <ellipse cx={120} cy={162} rx={16} ry={8} fill="#fbbf24"/>
    <text x={120} y={232} fontSize={17} textAnchor="middle" fill="#b45309" fontWeight="900" fontFamily="sans-serif">먹고싶어🍖</text>
  </>,

  /* 53 화났어 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fef3c7"/>
    <text x={40} y={66} fontSize={16} opacity={0.5}>💢</text>
    <DogBase fur="#fca5a5" ear="#f87171" inner="#fecaca"/>
    <path d="M80 90 Q92 82 104 88" stroke="#1e293b" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <path d="M136 88 Q148 82 160 90" stroke="#1e293b" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <circle cx={93} cy={106} r={12} fill="#1e293b"/>
    <circle cx={147} cy={106} r={12} fill="#1e293b"/>
    <circle cx={99} cy={100} r={5} fill="white"/>
    <circle cx={153} cy={100} r={5} fill="white"/>
    <ellipse cx={120} cy={128} rx={12} ry={8} fill="#1e293b"/>
    <text x={120} y={232} fontSize={17} textAnchor="middle" fill="#b91c1c" fontWeight="900" fontFamily="sans-serif">으르렁😤</text>
  </>,

  /* 54 또봐요 */
  <>
    <circle cx={120} cy={120} r={112} fill="#f0fdf4"/>
    <text x={50} y={60} fontSize={16}>✨</text><text x={170} y={56} fontSize={16}>✨</text>
    <DogBase/>
    <DogEye cx={94} cy={104}/><DogEye cx={146} cy={104}/>
    <DogNose/>
    <path d="M104 148 Q120 162 136 148" stroke="#1e293b" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <ellipse cx={120} cy={156} rx={18} ry={10} fill="#fde68a"/>
    <path d="M74 184 Q56 170 50 152" stroke="#fbbf24" strokeWidth={14} fill="none" strokeLinecap="round"/>
    <circle cx={48} cy={148} r={16} fill="#fbbf24"/>
    <text x={120} y={232} fontSize={17} textAnchor="middle" fill="#16a34a" fontWeight="900" fontFamily="sans-serif">또 봐요🐶</text>
  </>,

  /* 55 최고야! */
  <>
    <circle cx={120} cy={120} r={112} fill="#fffbeb"/>
    <text x={30} y={60} fontSize={16}>⭐</text><text x={176} y={58} fontSize={16}>⭐</text>
    <DogBase/>
    <DogEye cx={94} cy={104}/><DogEye cx={146} cy={104}/>
    <DogNose/>
    <path d="M104 148 Q120 164 136 148" stroke="#1e293b" strokeWidth={4} fill="#fde68a" strokeLinecap="round"/>
    <rect x={108} y={148} width={24} height={12} rx={4} fill="white"/>
    <path d="M168 136 Q182 124 188 112" stroke="#fbbf24" strokeWidth={12} fill="none" strokeLinecap="round"/>
    <ellipse cx={190} cy={107} rx={14} ry={18} fill="#fbbf24" transform="rotate(-24 190 107)"/>
    <text x={120} y={232} fontSize={17} textAnchor="middle" fill="#d97706" fontWeight="900" fontFamily="sans-serif">최고야👍</text>
  </>,

  /* ══════════ PACK H: 냥이 (56-63) ══════════ */

  /* 56 냥~ */
  <>
    <circle cx={120} cy={120} r={112} fill="#f1f5f9"/>
    <CatBase/>
    <CatEye cx={96} cy={110}/><CatEye cx={144} cy={110}/>
    <path d="M104 138 Q120 148 136 138" stroke="#64748b" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <path d="M74 190 Q60 178 58 162" stroke="#e2e8f0" strokeWidth={14} fill="none" strokeLinecap="round"/>
    <circle cx={56} cy={158} r={15} fill="#e2e8f0"/>
    <text x={120} y={232} fontSize={19} textAnchor="middle" fill="#475569" fontWeight="900" fontFamily="sans-serif">냥~</text>
  </>,

  /* 57 좋아해 — 하트 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fce7f3"/>
    <text x={38} y={62} fontSize={18}>💕</text><text x={172} y={56} fontSize={16}>💖</text>
    <CatBase fur="#f9a8d4" inner="#fce7f3"/>
    <text x={96} y={116} fontSize={26} textAnchor="middle" dominantBaseline="middle">❤️</text>
    <text x={144} y={116} fontSize={26} textAnchor="middle" dominantBaseline="middle">❤️</text>
    <path d="M104 140 Q120 156 136 140" stroke="#be185d" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <text x={120} y={232} fontSize={17} textAnchor="middle" fill="#be185d" fontWeight="900" fontFamily="sans-serif">좋아해💗</text>
  </>,

  /* 58 모르겠다냥 */
  <>
    <circle cx={120} cy={120} r={112} fill="#f0f9ff"/>
    <text x={162} y={64} fontSize={22}>?</text>
    <CatBase fur="#bae6fd" inner="#e0f2fe"/>
    <path d="M84 108 Q96 116 108 108" stroke="#0369a1" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <path d="M132 108 Q144 116 156 108" stroke="#0369a1" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <circle cx={96} cy={111} r={7} fill="#0369a1"/>
    <circle cx={144} cy={111} r={7} fill="#0369a1"/>
    <path d="M106 132 Q113 126 120 132 Q127 138 134 132" stroke="#0369a1" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <text x={120} y={232} fontSize={17} textAnchor="middle" fill="#0284c7" fontWeight="900" fontFamily="sans-serif">모르겠다냥</text>
  </>,

  /* 59 야옹 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fff0eb"/>
    <CatBase fur="#fdba74" inner="#fed7aa"/>
    <CatEye cx={96} cy={108}/><CatEye cx={144} cy={108}/>
    <ellipse cx={120} cy={136} rx={14} ry={18} fill="#1e293b"/>
    <ellipse cx={120} cy={136} rx={8} ry={12} fill="#f97316"/>
    <ellipse cx={80} cy={126} rx={18} ry={12} fill="#f87171" opacity={0.4}/>
    <ellipse cx={160} cy={126} rx={18} ry={12} fill="#f87171" opacity={0.4}/>
    <text x={120} y={232} fontSize={19} textAnchor="middle" fill="#ea580c" fontWeight="900" fontFamily="sans-serif">야옹~😿</text>
  </>,

  /* 60 놀라냥 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fffde7"/>
    <text x={40} y={70} fontSize={20} opacity={0.4}>❗</text>
    <CatBase fur="#fde68a" inner="#fef08a"/>
    <circle cx={93} cy={106} r={16} fill="#1e293b"/>
    <circle cx={147} cy={106} r={16} fill="#1e293b"/>
    <circle cx={102} cy={98} r={7} fill="white"/>
    <circle cx={156} cy={98} r={7} fill="white"/>
    <ellipse cx={120} cy={132} rx={18} ry={14} fill="#1e293b"/>
    <ellipse cx={120} cy={132} rx={11} ry={8} fill="#facc15"/>
    <text x={120} y={232} fontSize={17} textAnchor="middle" fill="#b45309" fontWeight="900" fontFamily="sans-serif">놀라냥!!</text>
  </>,

  /* 61 부탁해냥 */
  <>
    <circle cx={120} cy={120} r={112} fill="#ecfdf5"/>
    <CatBase fur="#6ee7b7" inner="#a7f3d0"/>
    <circle cx={93} cy={106} r={14} fill="#1e293b"/>
    <circle cx={147} cy={106} r={14} fill="#1e293b"/>
    <circle cx={100} cy={99} r={6} fill="white"/>
    <circle cx={154} cy={99} r={6} fill="white"/>
    <ellipse cx={82} cy={118} rx={16} ry={10} fill="#6ee7b7" opacity={0.5}/>
    <ellipse cx={158} cy={118} rx={16} ry={10} fill="#6ee7b7" opacity={0.5}/>
    <path d="M104 130 Q120 146 136 130" stroke="#059669" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <ellipse cx={88} cy={158} rx={28} ry={22} fill="#a7f3d0"/>
    <ellipse cx={152} cy={158} rx={28} ry={22} fill="#a7f3d0"/>
    <text x={120} y={232} fontSize={17} textAnchor="middle" fill="#047857" fontWeight="900" fontFamily="sans-serif">부탁해냥🙏</text>
  </>,

  /* 62 자야겠다 */
  <>
    <circle cx={120} cy={120} r={112} fill="#f3e8ff"/>
    <CatBase fur="#c4b5fd" inner="#ddd6fe"/>
    <path d="M84 108 Q96 116 108 108" stroke="#1e293b" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <path d="M132 108 Q144 116 156 108" stroke="#1e293b" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <circle cx={96} cy={111} r={7} fill="#1e293b"/>
    <circle cx={144} cy={111} r={7} fill="#1e293b"/>
    <path d="M106 132 Q120 138 134 132" stroke="#7c3aed" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <text x={154} y={94} fontSize={18} fill="#a78bfa" fontWeight="900" fontFamily="sans-serif">z</text>
    <text x={168} y={78} fontSize={13} fill="#a78bfa" fontWeight="900" fontFamily="sans-serif">z</text>
    <text x={120} y={232} fontSize={17} textAnchor="middle" fill="#7c3aed" fontWeight="900" fontFamily="sans-serif">자야겠다🌙</text>
  </>,

  /* 63 최고냥 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fdf2f8"/>
    <text x={32} y={62} fontSize={16}>⭐</text><text x={174} y={58} fontSize={16}>⭐</text>
    <CatBase fur="#f0abfc" inner="#fae8ff"/>
    <CatEye cx={93} cy={108}/><CatEye cx={147} cy={108}/>
    <path d="M104 134 Q120 150 136 134" stroke="#a21caf" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <path d="M166 138 Q180 126 186 114" stroke="#f0abfc" strokeWidth={12} fill="none" strokeLinecap="round"/>
    <ellipse cx={188} cy={110} rx={13} ry={17} fill="#f0abfc" transform="rotate(-22 188 110)"/>
    <text x={120} y={232} fontSize={17} textAnchor="middle" fill="#a21caf" fontWeight="900" fontFamily="sans-serif">최고냥👍</text>
  </>,

  /* ══════════ PACK I: 회식꼬마 (64-71) ══════════ */

  /* 64 건배~ */
  <>
    <circle cx={120} cy={120} r={112} fill="#fffbeb"/>
    <text x={34} y={58} fontSize={18}>🎊</text><text x={172} y={54} fontSize={18}>🎉</text>
    <HoesikBase bodyColor="#fcd34d" headColor="#fde68a"/>
    <HoesikEye cx={96} cy={102}/><HoesikEye cx={144} cy={102}/>
    <path d="M100 126 Q120 144 140 126" stroke="#d97706" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <rect x={68} y={158} width={20} height={30} rx={5} fill="#fcd34d" stroke="#d97706" strokeWidth={2}/>
    <rect x={72} y={164} width={12} height={8} rx={3} fill="white" opacity={0.5}/>
    <rect x={152} y={158} width={20} height={30} rx={5} fill="#fcd34d" stroke="#d97706" strokeWidth={2}/>
    <rect x={156} y={164} width={12} height={8} rx={3} fill="white" opacity={0.5}/>
    <path d="M78 168 Q72 158 70 152" stroke="#6ee7b7" strokeWidth={10} fill="none" strokeLinecap="round"/>
    <path d="M162 168 Q168 158 170 152" stroke="#6ee7b7" strokeWidth={10} fill="none" strokeLinecap="round"/>
    <text x={120} y={232} fontSize={17} textAnchor="middle" fill="#d97706" fontWeight="900" fontFamily="sans-serif">건배~🥂</text>
  </>,

  /* 65 배불러 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fff0eb"/>
    <HoesikBase bodyColor="#fdba74" headColor="#fde68a"/>
    <HoesikEye cx={96} cy={102}/><HoesikEye cx={144} cy={102}/>
    <path d="M104 128 Q120 136 136 128" stroke="#d97706" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <ellipse cx={120} cy={186} rx={60} ry={50} fill="#fb923c"/>
    <ellipse cx={120} cy={186} rx={44} ry={34} fill="#fdba74"/>
    <ellipse cx={88} cy={110} rx={16} ry={11} fill="#fde68a" opacity={0.5}/>
    <ellipse cx={152} cy={110} rx={16} ry={11} fill="#fde68a" opacity={0.5}/>
    <text x={120} y={232} fontSize={17} textAnchor="middle" fill="#ea580c" fontWeight="900" fontFamily="sans-serif">배불러~🍖</text>
  </>,

  /* 66 노래해 */
  <>
    <circle cx={120} cy={120} r={112} fill="#eff6ff"/>
    <text x={150} y={70} fontSize={20}>🎤</text>
    <text x={40} y={76} fontSize={16}>♪</text><text x={176} y={96} fontSize={14}>♫</text>
    <HoesikBase bodyColor="#93c5fd" headColor="#bfdbfe"/>
    <HoesikEye cx={96} cy={102}/><HoesikEye cx={144} cy={102}/>
    <ellipse cx={120} cy={128} rx={18} ry={14} fill="#1e293b"/>
    <ellipse cx={120} cy={128} rx={11} ry={8} fill="#60a5fa"/>
    <path d="M78 168 Q68 148 68 136" stroke="#93c5fd" strokeWidth={12} fill="none" strokeLinecap="round"/>
    <rect x={58} y={126} width={16} height={22} rx={8} fill="#1e293b"/>
    <rect x={61} y={134} width={10} height={6} rx={3} fill="#60a5fa"/>
    <text x={120} y={232} fontSize={17} textAnchor="middle" fill="#1d4ed8" fontWeight="900" fontFamily="sans-serif">노래해🎤</text>
  </>,

  /* 67 춤춰 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fdf4ff"/>
    <text x={36} y={64} fontSize={16}>🎵</text><text x={174} y={60} fontSize={16}>💃</text>
    <HoesikBase bodyColor="#d8b4fe" headColor="#ede9fe"/>
    <HoesikEye cx={96} cy={102}/><HoesikEye cx={144} cy={102}/>
    <path d="M100 126 Q120 144 140 126" stroke="#7c3aed" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <path d="M76 176 Q60 156 56 136" stroke="#d8b4fe" strokeWidth={12} fill="none" strokeLinecap="round" transform="rotate(-18 66 156)"/>
    <path d="M164 176 Q180 156 184 136" stroke="#d8b4fe" strokeWidth={12} fill="none" strokeLinecap="round" transform="rotate(18 174 156)"/>
    <text x={120} y={232} fontSize={17} textAnchor="middle" fill="#7c3aed" fontWeight="900" fontFamily="sans-serif">춤춰~💃</text>
  </>,

  /* 68 화이팅 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fef9c3"/>
    <text x={32} y={62} fontSize={18}>🔥</text><text x={172} y={58} fontSize={18}>⭐</text>
    <HoesikBase bodyColor="#fbbf24" headColor="#fde68a"/>
    <HoesikEye cx={96} cy={100}/><HoesikEye cx={144} cy={100}/>
    <path d="M100 124 Q120 142 140 124" stroke="#d97706" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <path d="M58 168 Q46 140 48 114" stroke="#fbbf24" strokeWidth={12} fill="none" strokeLinecap="round"/>
    <circle cx={46} cy={108} r={16} fill="#fbbf24"/>
    <path d="M182 168 Q194 140 192 114" stroke="#fbbf24" strokeWidth={12} fill="none" strokeLinecap="round"/>
    <circle cx={194} cy={108} r={16} fill="#fbbf24"/>
    <text x={120} y={232} fontSize={17} textAnchor="middle" fill="#b45309" fontWeight="900" fontFamily="sans-serif">화이팅!!🔥</text>
  </>,

  /* 69 졸려요 */
  <>
    <circle cx={120} cy={120} r={112} fill="#f0f9ff"/>
    <HoesikBase bodyColor="#7dd3fc" headColor="#bae6fd"/>
    <path d="M84 100 Q96 108 108 100" stroke="#1e293b" strokeWidth={4} fill="#7dd3fc" strokeLinecap="round"/>
    <path d="M132 100 Q144 108 156 100" stroke="#1e293b" strokeWidth={4} fill="#7dd3fc" strokeLinecap="round"/>
    <circle cx={96} cy={103} r={7} fill="#1e293b"/>
    <circle cx={144} cy={103} r={7} fill="#1e293b"/>
    <path d="M106 124 Q120 128 134 124" stroke="#0369a1" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <text x={152} y={92} fontSize={18} fill="#7dd3fc" fontWeight="900" fontFamily="sans-serif">z</text>
    <text x={166} y={76} fontSize={14} fill="#7dd3fc" fontWeight="900" fontFamily="sans-serif">z</text>
    <text x={120} y={232} fontSize={17} textAnchor="middle" fill="#0284c7" fontWeight="900" fontFamily="sans-serif">졸려요💤</text>
  </>,

  /* 70 맥주! */
  <>
    <circle cx={120} cy={120} r={112} fill="#fef9c3"/>
    <HoesikBase bodyColor="#fde68a" headColor="#fef9c3"/>
    <HoesikEye cx={96} cy={100}/><HoesikEye cx={144} cy={100}/>
    <path d="M100 124 Q120 142 140 124" stroke="#d97706" strokeWidth={4} fill="none" strokeLinecap="round"/>
    <rect x={92} y={150} width={56} height={52} rx={8} fill="#fcd34d" stroke="#d97706" strokeWidth={3}/>
    <rect x={98} y={158} width={44} height={26} rx={4} fill="white" opacity={0.4}/>
    <ellipse cx={120} cy={150} rx={28} ry={10} fill="white"/>
    <text x={120} y={232} fontSize={17} textAnchor="middle" fill="#b45309" fontWeight="900" fontFamily="sans-serif">맥주!🍺</text>
  </>,

  /* 71 집가고싶어 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fff1f2"/>
    <text x={168} y={68} fontSize={20}>🏠</text>
    <HoesikBase bodyColor="#fca5a5" headColor="#fecaca"/>
    <path d="M84 100 Q96 108 108 100" stroke="#1e293b" strokeWidth={4} fill="#fca5a5" strokeLinecap="round"/>
    <path d="M132 100 Q144 108 156 100" stroke="#1e293b" strokeWidth={4} fill="#fca5a5" strokeLinecap="round"/>
    <circle cx={96} cy={103} r={7} fill="#1e293b"/>
    <circle cx={144} cy={103} r={7} fill="#1e293b"/>
    <rect x={84} y={112} width={10} height={16} rx={5} fill="#93c5fd" opacity={0.9}/>
    <rect x={146} y={112} width={10} height={16} rx={5} fill="#93c5fd" opacity={0.9}/>
    <path d="M100 128 Q110 122 120 128 Q130 134 140 128" stroke="#e11d48" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
    <text x={120} y={232} fontSize={15} textAnchor="middle" fill="#be123c" fontWeight="900" fontFamily="sans-serif">집가고싶어🏠</text>
  </>,

  /* ══════════ PACK J: 버블 (72-79) ══════════ */

  /* 72 오케이👍 */
  <>
    <circle cx={120} cy={120} r={112} fill="#ecfdf5"/>
    <ellipse cx={120} cy={100} rx={88} ry={62} fill="#34d399"/>
    <ellipse cx={120} cy={100} rx={82} ry={56} fill="#6ee7b7"/>
    <ellipse cx={120} cy={100} rx={76} ry={50} fill="white"/>
    <text x={120} y={88} fontSize={32} textAnchor="middle" fill="#059669" fontWeight="900" fontFamily="sans-serif">오케이</text>
    <text x={120} cy={88} y={116} fontSize={30} textAnchor="middle">👍</text>
    <polygon points="100,152 120,175 140,152" fill="white"/>
    <polygon points="104,150 120,170 136,150" fill="#6ee7b7"/>
    <polygon points="106,150 120,167 134,150" fill="white"/>
  </>,

  /* 73 ㄱㄱ🏃 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fff7ed"/>
    <ellipse cx={120} cy={100} rx={86} ry={62} fill="#f97316"/>
    <ellipse cx={120} cy={100} rx={80} ry={56} fill="#fb923c"/>
    <ellipse cx={120} cy={100} rx={74} ry={50} fill="white"/>
    <text x={120} y={92} fontSize={40} textAnchor="middle" fill="#ea580c" fontWeight="900" fontFamily="sans-serif">ㄱㄱ</text>
    <text x={120} y={120} fontSize={24} textAnchor="middle">🏃</text>
    <polygon points="100,152 120,175 140,152" fill="white"/>
    <polygon points="104,150 120,170 136,150" fill="#fb923c"/>
    <polygon points="106,150 120,167 134,150" fill="white"/>
  </>,

  /* 74 알겠어! */
  <>
    <circle cx={120} cy={120} r={112} fill="#eff6ff"/>
    <ellipse cx={120} cy={100} rx={86} ry={62} fill="#60a5fa"/>
    <ellipse cx={120} cy={100} rx={80} ry={56} fill="#93c5fd"/>
    <ellipse cx={120} cy={100} rx={74} ry={50} fill="white"/>
    <text x={120} y={88} fontSize={28} textAnchor="middle" fill="#1d4ed8" fontWeight="900" fontFamily="sans-serif">알겠어!</text>
    <text x={120} y={118} fontSize={28} textAnchor="middle">✅</text>
    <polygon points="100,152 120,175 140,152" fill="white"/>
    <polygon points="104,150 120,170 136,150" fill="#93c5fd"/>
    <polygon points="106,150 120,167 134,150" fill="white"/>
  </>,

  /* 75 잠깐만~ */
  <>
    <circle cx={120} cy={120} r={112} fill="#fdf4ff"/>
    <ellipse cx={120} cy={100} rx={88} ry={64} fill="#c084fc"/>
    <ellipse cx={120} cy={100} rx={82} ry={58} fill="#d8b4fe"/>
    <ellipse cx={120} cy={100} rx={76} ry={52} fill="white"/>
    <text x={120} y={86} fontSize={24} textAnchor="middle" fill="#7c3aed" fontWeight="900" fontFamily="sans-serif">잠깐만~</text>
    <text x={120} y={116} fontSize={28} textAnchor="middle">✋</text>
    <polygon points="80,152 100,178 120,152" fill="white"/>
    <polygon points="82,150 100,174 118,150" fill="#d8b4fe"/>
    <polygon points="84,150 100,171 116,150" fill="white"/>
  </>,

  /* 76 기다려! */
  <>
    <circle cx={120} cy={120} r={112} fill="#fff7ed"/>
    <ellipse cx={120} cy={100} rx={86} ry={62} fill="#fb923c"/>
    <ellipse cx={120} cy={100} rx={80} ry={56} fill="#fdba74"/>
    <ellipse cx={120} cy={100} rx={74} ry={50} fill="white"/>
    <text x={120} y={86} fontSize={26} textAnchor="middle" fill="#c2410c" fontWeight="900" fontFamily="sans-serif">기다려!</text>
    <text x={120} y={116} fontSize={28} textAnchor="middle">⏳</text>
    <polygon points="100,152 120,175 140,152" fill="white"/>
    <polygon points="104,150 120,170 136,150" fill="#fdba74"/>
    <polygon points="106,150 120,167 134,150" fill="white"/>
  </>,

  /* 77 나중에! */
  <>
    <circle cx={120} cy={120} r={112} fill="#f1f5f9"/>
    <ellipse cx={120} cy={100} rx={86} ry={62} fill="#64748b"/>
    <ellipse cx={120} cy={100} rx={80} ry={56} fill="#94a3b8"/>
    <ellipse cx={120} cy={100} rx={74} ry={50} fill="white"/>
    <text x={120} y={86} fontSize={26} textAnchor="middle" fill="#334155" fontWeight="900" fontFamily="sans-serif">나중에!</text>
    <text x={120} y={116} fontSize={28} textAnchor="middle">💤</text>
    <polygon points="140,152 160,175 180,152" fill="white"/>
    <polygon points="142,150 160,171 178,150" fill="#94a3b8"/>
    <polygon points="144,150 160,168 176,150" fill="white"/>
  </>,

  /* 78 맞아맞아 */
  <>
    <circle cx={120} cy={120} r={112} fill="#ecfdf5"/>
    <ellipse cx={120} cy={98} rx={88} ry={64} fill="#4ade80"/>
    <ellipse cx={120} cy={98} rx={82} ry={58} fill="#86efac"/>
    <ellipse cx={120} cy={98} rx={76} ry={52} fill="white"/>
    <text x={120} y={84} fontSize={24} textAnchor="middle" fill="#15803d" fontWeight="900" fontFamily="sans-serif">맞아맞아</text>
    <text x={120} y={114} fontSize={28} textAnchor="middle">☑️</text>
    <polygon points="100,150 120,173 140,150" fill="white"/>
    <polygon points="104,148 120,169 136,148" fill="#86efac"/>
    <polygon points="106,148 120,166 134,148" fill="white"/>
  </>,

  /* 79 아니야ㅠ */
  <>
    <circle cx={120} cy={120} r={112} fill="#fff1f2"/>
    <ellipse cx={120} cy={98} rx={86} ry={62} fill="#f87171"/>
    <ellipse cx={120} cy={98} rx={80} ry={56} fill="#fca5a5"/>
    <ellipse cx={120} cy={98} rx={74} ry={50} fill="white"/>
    <text x={120} y={84} fontSize={26} textAnchor="middle" fill="#b91c1c" fontWeight="900" fontFamily="sans-serif">아니야ㅠ</text>
    <text x={120} y={114} fontSize={28} textAnchor="middle">🙅</text>
    <polygon points="100,150 120,173 140,150" fill="white"/>
    <polygon points="104,148 120,169 136,148" fill="#fca5a5"/>
    <polygon points="106,148 120,166 134,148" fill="white"/>
  </>,

  /* ══════════ PACK K: 로맨스 (80-87) ══════════ */

  /* 80 좋아해♥ */
  <>
    <circle cx={120} cy={120} r={112} fill="#fff0f0"/>
    <text x={44} y={62} fontSize={44} opacity={0.18} fontFamily="sans-serif" fontWeight="900">♥</text>
    <text x={148} y={58} fontSize={36} opacity={0.18} fontFamily="sans-serif" fontWeight="900">♥</text>
    <circle cx={120} cy={108} r={62} fill="white" stroke="#fda4af" strokeWidth={4}/>
    <text x={120} y={116} fontSize={60} textAnchor="middle" dominantBaseline="middle">❤️</text>
    <text x={120} y={198} fontSize={22} textAnchor="middle" fill="#e11d48" fontWeight="900" fontFamily="sans-serif">좋아해♥</text>
  </>,

  /* 81 사귈래? */
  <>
    <circle cx={120} cy={120} r={112} fill="#fce7f3"/>
    <text x={38} y={62} fontSize={18}>💝</text><text x={172} y={58} fontSize={16}>💘</text>
    <circle cx={120} cy={108} r={64} fill="white" stroke="#f472b6" strokeWidth={4}/>
    <text x={120} y={90} fontSize={22} textAnchor="middle" dominantBaseline="middle">💕💕</text>
    <text x={120} y={124} fontSize={24} textAnchor="middle" fill="#be185d" fontWeight="900" fontFamily="sans-serif">사귈래?</text>
    <text x={120} y={198} fontSize={36} textAnchor="middle">🥺</text>
  </>,

  /* 82 보고싶어 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fdf2f8"/>
    <text x={38} y={64} fontSize={18}>💭</text><text x={170} y={60} fontSize={16}>💭</text>
    <circle cx={120} cy={108} r={62} fill="white" stroke="#f9a8d4" strokeWidth={4}/>
    <text x={120} y={100} fontSize={20} textAnchor="middle">😭💕</text>
    <text x={120} y={124} fontSize={20} textAnchor="middle" fill="#db2777" fontWeight="900" fontFamily="sans-serif">보고싶어</text>
    <text x={120} y={198} fontSize={28} textAnchor="middle">💌</text>
  </>,

  /* 83 예뻐요 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fff0f6"/>
    <text x={40} y={66} fontSize={16}>🌸</text><text x={172} y={60} fontSize={16}>✨</text>
    <circle cx={120} cy={108} r={62} fill="white" stroke="#f472b6" strokeWidth={4}/>
    <text x={120} y={96} fontSize={30} textAnchor="middle">🌸✨</text>
    <text x={120} y={124} fontSize={22} textAnchor="middle" fill="#db2777" fontWeight="900" fontFamily="sans-serif">예뻐요!</text>
    <text x={120} y={198} fontSize={30} textAnchor="middle">😍</text>
  </>,

  /* 84 멋있어 */
  <>
    <circle cx={120} cy={120} r={112} fill="#f0f9ff"/>
    <text x={38} y={64} fontSize={16}>⭐</text><text x={174} y={60} fontSize={16}>✨</text>
    <circle cx={120} cy={108} r={62} fill="white" stroke="#38bdf8" strokeWidth={4}/>
    <text x={120} y={96} fontSize={30} textAnchor="middle">🔥💎</text>
    <text x={120} y={124} fontSize={22} textAnchor="middle" fill="#0284c7" fontWeight="900" fontFamily="sans-serif">멋있어!</text>
    <text x={120} y={198} fontSize={30} textAnchor="middle">😎</text>
  </>,

  /* 85 설레♡ */
  <>
    <circle cx={120} cy={120} r={112} fill="#fdf2f8"/>
    <text x={34} y={60} fontSize={16}>💫</text><text x={174} y={58} fontSize={16}>💕</text>
    <text x={178} y={92} fontSize={13}>✨</text><text x={36} y={94} fontSize={13}>✨</text>
    <circle cx={120} cy={106} r={62} fill="white" stroke="#f9a8d4" strokeWidth={4}/>
    <text x={120} y={92} fontSize={30} textAnchor="middle">💓💓</text>
    <text x={120} y={122} fontSize={22} textAnchor="middle" fill="#e11d48" fontWeight="900" fontFamily="sans-serif">설레♡</text>
    <text x={120} y={196} fontSize={30} textAnchor="middle">🥰</text>
  </>,

  /* 86 연락해 */
  <>
    <circle cx={120} cy={120} r={112} fill="#ecfdf5"/>
    <text x={42} y={64} fontSize={16}>📱</text><text x={172} y={60} fontSize={16}>💚</text>
    <circle cx={120} cy={108} r={62} fill="white" stroke="#4ade80" strokeWidth={4}/>
    <text x={120} y={94} fontSize={30} textAnchor="middle">📲</text>
    <text x={120} y={124} fontSize={22} textAnchor="middle" fill="#15803d" fontWeight="900" fontFamily="sans-serif">연락해!</text>
    <text x={120} y={198} fontSize={28} textAnchor="middle">😊</text>
  </>,

  /* 87 대화하자 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fdf4ff"/>
    <text x={38} y={64} fontSize={16}>💬</text><text x={174} y={60} fontSize={16}>💜</text>
    <circle cx={120} cy={108} r={62} fill="white" stroke="#c084fc" strokeWidth={4}/>
    <text x={120} y={94} fontSize={30} textAnchor="middle">💬💬</text>
    <text x={120} y={124} fontSize={20} textAnchor="middle" fill="#7c3aed" fontWeight="900" fontFamily="sans-serif">대화하자!</text>
    <text x={120} y={198} fontSize={28} textAnchor="middle">🗣️</text>
  </>,

  /* ══════════ PACK L: 응원단 (88-95) ══════════ */

  /* 88 할수있어 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fffbeb"/>
    <text x={30} y={62} fontSize={18}>⭐</text><text x={172} y={58} fontSize={18}>⭐</text>
    <text x={176} y={94} fontSize={14}>✨</text><text x={34} y={96} fontSize={14}>✨</text>
    <rect x={32} y={100} width={176} height={72} rx={20} fill="#fbbf24"/>
    <rect x={36} y={104} width={168} height={64} rx={16} fill="#fef9c3"/>
    <text x={120} y={138} fontSize={24} textAnchor="middle" fill="#92400e" fontWeight="900" fontFamily="sans-serif">할 수 있어!</text>
    <text x={120} y={160} fontSize={16} textAnchor="middle" fill="#b45309" fontWeight="900" fontFamily="sans-serif">💪🔥💪</text>
    <text x={120} y={214} fontSize={36} textAnchor="middle">🏆</text>
  </>,

  /* 89 화이팅!! */
  <>
    <circle cx={120} cy={120} r={112} fill="#fee2e2"/>
    <text x={34} y={60} fontSize={18} opacity={0.5}>🔥</text>
    <text x={170} y={56} fontSize={18} opacity={0.5}>🔥</text>
    <rect x={30} y={98} width={180} height={76} rx={22} fill="#ef4444"/>
    <rect x={34} y={102} width={172} height={68} rx={18} fill="white"/>
    <text x={120} y={136} fontSize={26} textAnchor="middle" fill="#b91c1c" fontWeight="900" fontFamily="sans-serif">화이팅!!</text>
    <text x={120} y={158} fontSize={18} textAnchor="middle" fill="#ef4444" fontWeight="900" fontFamily="sans-serif">YOU CAN DO IT</text>
    <text x={120} y={214} fontSize={36} textAnchor="middle">💪</text>
  </>,

  /* 90 잘했어👏 */
  <>
    <circle cx={120} cy={120} r={112} fill="#ecfdf5"/>
    <text x={36} y={62} fontSize={18}>🎊</text><text x={170} y={58} fontSize={18}>🎉</text>
    <rect x={28} y={98} width={184} height={76} rx={22} fill="#22c55e"/>
    <rect x={32} y={102} width={176} height={68} rx={18} fill="white"/>
    <text x={120} y={136} fontSize={26} textAnchor="middle" fill="#15803d" fontWeight="900" fontFamily="sans-serif">잘했어!!</text>
    <text x={120} y={158} fontSize={14} textAnchor="middle" fill="#16a34a" fontWeight="900" fontFamily="sans-serif">Great job! 👏</text>
    <text x={120} y={214} fontSize={36} textAnchor="middle">🏅</text>
  </>,

  /* 91 대단해! */
  <>
    <circle cx={120} cy={120} r={112} fill="#eff6ff"/>
    <text x={36} y={62} fontSize={16}>⭐</text><text x={174} y={58} fontSize={16}>💙</text>
    <rect x={30} y={98} width={180} height={76} rx={22} fill="#3b82f6"/>
    <rect x={34} y={102} width={172} height={68} rx={18} fill="white"/>
    <text x={120} y={136} fontSize={26} textAnchor="middle" fill="#1d4ed8" fontWeight="900" fontFamily="sans-serif">대단해!</text>
    <text x={120} y={158} fontSize={16} textAnchor="middle" fill="#3b82f6" fontWeight="900" fontFamily="sans-serif">Amazing! ⭐</text>
    <text x={120} y={214} fontSize={36} textAnchor="middle">🌟</text>
  </>,

  /* 92 최고야⭐ */
  <>
    <circle cx={120} cy={120} r={112} fill="#fffbeb"/>
    <text x={36} y={60} fontSize={18}>👑</text><text x={172} y={56} fontSize={16}>⭐</text>
    <rect x={26} y={96} width={188} height={80} rx={24} fill="#f59e0b"/>
    <rect x={30} y={100} width={180} height={72} rx={20} fill="white"/>
    <text x={120} y={136} fontSize={28} textAnchor="middle" fill="#92400e" fontWeight="900" fontFamily="sans-serif">최고야!</text>
    <text x={120} y={158} fontSize={18} textAnchor="middle" fill="#d97706" fontWeight="900" fontFamily="sans-serif">⭐⭐⭐⭐⭐</text>
    <text x={120} y={214} fontSize={36} textAnchor="middle">👑</text>
  </>,

  /* 93 힘내! */
  <>
    <circle cx={120} cy={120} r={112} fill="#fdf4ff"/>
    <text x={38} y={62} fontSize={16}>💜</text><text x={172} y={58} fontSize={16}>✨</text>
    <rect x={28} y={96} width={184} height={78} rx={22} fill="#a855f7"/>
    <rect x={32} y={100} width={176} height={70} rx={18} fill="white"/>
    <text x={120} y={136} fontSize={28} textAnchor="middle" fill="#7c3aed" fontWeight="900" fontFamily="sans-serif">힘내!</text>
    <text x={120} y={158} fontSize={14} textAnchor="middle" fill="#a855f7" fontWeight="900" fontFamily="sans-serif">You got this! 💪</text>
    <text x={120} y={214} fontSize={36} textAnchor="middle">🦋</text>
  </>,

  /* 94 완벽해 */
  <>
    <circle cx={120} cy={120} r={112} fill="#ecfdf5"/>
    <text x={36} y={62} fontSize={18}>✅</text><text x={172} y={58} fontSize={16}>💚</text>
    <rect x={26} y={96} width={188} height={78} rx={24} fill="#10b981"/>
    <rect x={30} y={100} width={180} height={70} rx={20} fill="white"/>
    <text x={120} y={134} fontSize={26} textAnchor="middle" fill="#047857" fontWeight="900" fontFamily="sans-serif">완벽해!</text>
    <text x={120} y={156} fontSize={14} textAnchor="middle" fill="#10b981" fontWeight="900" fontFamily="sans-serif">Perfect! ✨</text>
    <text x={120} y={214} fontSize={36} textAnchor="middle">🎯</text>
  </>,

  /* 95 믿어💪 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fff7ed"/>
    <text x={36} y={62} fontSize={16}>🌟</text><text x={174} y={58} fontSize={16}>🔥</text>
    <rect x={26} y={96} width={188} height={78} rx={24} fill="#f97316"/>
    <rect x={30} y={100} width={180} height={70} rx={20} fill="white"/>
    <text x={120} y={134} fontSize={28} textAnchor="middle" fill="#c2410c" fontWeight="900" fontFamily="sans-serif">믿어!</text>
    <text x={120} y={156} fontSize={14} textAnchor="middle" fill="#f97316" fontWeight="900" fontFamily="sans-serif">I believe in you💪</text>
    <text x={120} y={214} fontSize={36} textAnchor="middle">🤝</text>
  </>,

  /* ══════════ PACK M: 스페셜 (96-99) ══════════ */

  /* 96 감사합니다 */
  <>
    <circle cx={120} cy={120} r={112} fill="#ecfdf5"/>
    <text x={36} y={58} fontSize={20}>🙏</text><text x={170} y={56} fontSize={18}>✨</text>
    <text x={174} y={90} fontSize={14}>🌸</text><text x={36} y={92} fontSize={14}>🌸</text>
    <rect x={24} y={90} width={192} height={88} rx={28} fill="#34d399"/>
    <rect x={28} y={94} width={184} height={80} rx={24} fill="white"/>
    <text x={120} y={130} fontSize={24} textAnchor="middle" fill="#047857" fontWeight="900" fontFamily="sans-serif">감사합니다</text>
    <text x={120} y={152} fontSize={18} textAnchor="middle" fill="#10b981" fontWeight="900" fontFamily="sans-serif">Thank you! 🙏</text>
    <text x={120} y={214} fontSize={34} textAnchor="middle">🎁</text>
  </>,

  /* 97 죄송해요 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fff1f2"/>
    <text x={40} y={62} fontSize={18}>🥺</text><text x={170} y={58} fontSize={16}>💔</text>
    <rect x={24} y={90} width={192} height={88} rx={28} fill="#f87171"/>
    <rect x={28} y={94} width={184} height={80} rx={24} fill="white"/>
    <text x={120} y={130} fontSize={24} textAnchor="middle" fill="#b91c1c" fontWeight="900" fontFamily="sans-serif">죄송해요</text>
    <text x={120} y={152} fontSize={16} textAnchor="middle" fill="#f87171" fontWeight="900" fontFamily="sans-serif">I'm sorry 🙏</text>
    <text x={120} y={214} fontSize={34} textAnchor="middle">😢</text>
  </>,

  /* 98 축하해🎉 */
  <>
    <circle cx={120} cy={120} r={112} fill="#fffbeb"/>
    <text x={32} y={58} fontSize={20}>🎉</text><text x={170} y={54} fontSize={20}>🎊</text>
    <text x={172} y={88} fontSize={14}>🎈</text><text x={36} y={90} fontSize={14}>🎈</text>
    <rect x={22} y={90} width={196} height={88} rx={30} fill="#f59e0b"/>
    <rect x={26} y={94} width={188} height={80} rx={26} fill="white"/>
    <text x={120} y={130} fontSize={24} textAnchor="middle" fill="#92400e" fontWeight="900" fontFamily="sans-serif">축하해!🎉</text>
    <text x={120} y={152} fontSize={14} textAnchor="middle" fill="#d97706" fontWeight="900" fontFamily="sans-serif">Congratulations!</text>
    <text x={120} y={214} fontSize={34} textAnchor="middle">🥳</text>
  </>,

  /* 99 행운을🍀 */
  <>
    <circle cx={120} cy={120} r={112} fill="#ecfdf5"/>
    <text x={36} y={60} fontSize={20}>🍀</text><text x={170} y={56} fontSize={18}>⭐</text>
    <text x={174} y={92} fontSize={14}>✨</text><text x={36} y={94} fontSize={14}>💫</text>
    <rect x={22} y={90} width={196} height={88} rx={30} fill="#22c55e"/>
    <rect x={26} y={94} width={188} height={80} rx={26} fill="white"/>
    <text x={120} y={130} fontSize={24} textAnchor="middle" fill="#15803d" fontWeight="900" fontFamily="sans-serif">행운을!🍀</text>
    <text x={120} y={152} fontSize={15} textAnchor="middle" fill="#16a34a" fontWeight="900" fontFamily="sans-serif">Good luck! ✨</text>
    <text x={120} y={214} fontSize={34} textAnchor="middle">🌈</text>
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
