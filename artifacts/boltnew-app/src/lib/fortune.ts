// ─── 사주 · 타로 · 궁합 유틸리티 ───────────────────────────────────────────

// ── 12지 (띠) ───────────────────────────────────────────────────────────────
export interface ZodiacInfo {
  name: string; emoji: string; element: string; yinyang: '양' | '음'; mod: number;
}

export const ZODIAC_LIST: ZodiacInfo[] = [
  { name: '원숭이', emoji: '🐒', element: '금', yinyang: '양', mod: 0 },
  { name: '닭',     emoji: '🐓', element: '금', yinyang: '음', mod: 1 },
  { name: '개',     emoji: '🐕', element: '토', yinyang: '양', mod: 2 },
  { name: '돼지',   emoji: '🐷', element: '수', yinyang: '음', mod: 3 },
  { name: '쥐',     emoji: '🐭', element: '수', yinyang: '양', mod: 4 },
  { name: '소',     emoji: '🐮', element: '토', yinyang: '음', mod: 5 },
  { name: '호랑이', emoji: '🐯', element: '목', yinyang: '양', mod: 6 },
  { name: '토끼',   emoji: '🐰', element: '목', yinyang: '음', mod: 7 },
  { name: '용',     emoji: '🐲', element: '토', yinyang: '양', mod: 8 },
  { name: '뱀',     emoji: '🐍', element: '화', yinyang: '음', mod: 9 },
  { name: '말',     emoji: '🐴', element: '화', yinyang: '양', mod: 10 },
  { name: '양',     emoji: '🐑', element: '토', yinyang: '음', mod: 11 },
];

export function getZodiac(year: number): ZodiacInfo {
  const mod = ((year % 12) + 12) % 12;
  return ZODIAC_LIST.find(z => z.mod === mod) ?? ZODIAC_LIST[0];
}

// ── 오행 (10천간 기반) ───────────────────────────────────────────────────────
const CHEONGAN = ['경', '신', '임', '계', '갑', '을', '병', '정', '무', '기'];
const OHAENG_MAP: Record<string, string> = {
  갑: '목', 을: '목', 병: '화', 정: '화', 무: '토',
  기: '토', 경: '금', 신: '금', 임: '수', 계: '수',
};
const OHAENG_COLOR: Record<string, string> = {
  목: '#4ade80', 화: '#f87171', 토: '#fbbf24', 금: '#e2e8f0', 수: '#60a5fa',
};
const OHAENG_EMOJI: Record<string, string> = {
  목: '🌳', 화: '🔥', 토: '🌍', 금: '⚡', 수: '💧',
};

export function getCheongan(year: number): string {
  return CHEONGAN[((year % 10) + 10) % 10];
}
export function getOhaeng(year: number): string {
  return OHAENG_MAP[getCheongan(year)] ?? '토';
}
export function getOhaengColor(ohaeng: string): string { return OHAENG_COLOR[ohaeng] ?? '#94a3b8'; }
export function getOhaengEmoji(ohaeng: string): string { return OHAENG_EMOJI[ohaeng] ?? '🌀'; }

// ── 타로 카드 (메이저 아르카나 22장) ──────────────────────────────────────────
export interface TarotCard {
  id: number; nameKo: string; nameEn: string; emoji: string;
  upright: string; reversed: string; uprightKey: string; reversedKey: string;
}

export const TAROT_DECK: TarotCard[] = [
  { id: 0,  nameKo: '바보',       nameEn: 'The Fool',        emoji: '🌈', upright: '새로운 시작, 자유로운 여정, 순수한 도전',     reversed: '무모함, 준비 없는 출발, 경솔한 결정',     uprightKey: '자유',     reversedKey: '무모함' },
  { id: 1,  nameKo: '마법사',     nameEn: 'The Magician',    emoji: '🪄', upright: '의지력, 숙련, 창의적 실행, 기회 활용',       reversed: '속임수, 재능 낭비, 집중력 부족',           uprightKey: '능력',     reversedKey: '낭비' },
  { id: 2,  nameKo: '여사제',     nameEn: 'High Priestess',  emoji: '🌙', upright: '직관, 내면의 지혜, 숨겨진 진실',            reversed: '비밀 억압, 표면적 판단, 직관 무시',         uprightKey: '직관',     reversedKey: '억압' },
  { id: 3,  nameKo: '여황제',     nameEn: 'The Empress',     emoji: '🌸', upright: '풍요, 창조력, 모성, 감각적 즐거움',          reversed: '과의존, 창의성 차단, 결핍감',              uprightKey: '풍요',     reversedKey: '결핍' },
  { id: 4,  nameKo: '황제',       nameEn: 'The Emperor',     emoji: '👑', upright: '안정, 권위, 구조, 리더십',                  reversed: '지배욕, 고집, 융통성 없음',                uprightKey: '안정',     reversedKey: '고집' },
  { id: 5,  nameKo: '교황',       nameEn: 'The Hierophant',  emoji: '⛪', upright: '전통, 신뢰, 정신적 안내, 배움',             reversed: '관습 탈피, 새로운 방식, 반항심',           uprightKey: '전통',     reversedKey: '반항' },
  { id: 6,  nameKo: '연인들',     nameEn: 'The Lovers',      emoji: '💕', upright: '선택, 사랑, 조화, 가치관 정렬',             reversed: '갈등, 불균형, 잘못된 선택',                uprightKey: '사랑',     reversedKey: '갈등' },
  { id: 7,  nameKo: '전차',       nameEn: 'The Chariot',     emoji: '🏆', upright: '승리, 의지, 자기통제, 전진',               reversed: '방향 상실, 공격성, 좌절',                  uprightKey: '승리',     reversedKey: '좌절' },
  { id: 8,  nameKo: '힘',         nameEn: 'Strength',        emoji: '🦁', upright: '용기, 인내, 내면의 힘, 온화한 통제',        reversed: '자기의심, 나약함, 충동',                   uprightKey: '용기',     reversedKey: '나약함' },
  { id: 9,  nameKo: '은둔자',     nameEn: 'The Hermit',      emoji: '🔦', upright: '성찰, 고독, 내면 탐구, 지혜 추구',          reversed: '고립, 고집, 내향성 과잉',                  uprightKey: '성찰',     reversedKey: '고립' },
  { id: 10, nameKo: '운명의 수레바퀴', nameEn: 'Wheel of Fortune', emoji: '🎡', upright: '행운, 전환점, 운명적 흐름',        reversed: '불운, 저항, 변화 거부',                    uprightKey: '행운',     reversedKey: '저항' },
  { id: 11, nameKo: '정의',       nameEn: 'Justice',         emoji: '⚖️', upright: '균형, 진실, 공정한 결과, 책임',            reversed: '불공정, 책임회피, 편견',                   uprightKey: '공정',     reversedKey: '편견' },
  { id: 12, nameKo: '매달린 사람', nameEn: 'The Hanged Man',  emoji: '🙃', upright: '자발적 희생, 다른 관점, 기다림',           reversed: '순교, 지연, 고집',                         uprightKey: '희생',     reversedKey: '지연' },
  { id: 13, nameKo: '죽음',       nameEn: 'Death',           emoji: '🌑', upright: '끝과 새 시작, 변화, 놓아주기',              reversed: '변화 저항, 집착, 정체',                    uprightKey: '변화',     reversedKey: '집착' },
  { id: 14, nameKo: '절제',       nameEn: 'Temperance',      emoji: '🌊', upright: '균형, 인내, 조화, 중용',                   reversed: '극단, 과잉, 불균형',                       uprightKey: '균형',     reversedKey: '과잉' },
  { id: 15, nameKo: '악마',       nameEn: 'The Devil',       emoji: '😈', upright: '집착, 물질욕, 억압된 욕구, 현실적 유혹',    reversed: '해방, 속박에서 벗어남, 자유',              uprightKey: '욕구',     reversedKey: '해방' },
  { id: 16, nameKo: '탑',         nameEn: 'The Tower',       emoji: '⚡', upright: '급격한 변화, 붕괴, 충격적 깨달음',          reversed: '변화 두려움, 위기 모면, 재건',             uprightKey: '충격',     reversedKey: '재건' },
  { id: 17, nameKo: '별',         nameEn: 'The Star',        emoji: '⭐', upright: '희망, 영감, 치유, 긍정적 에너지',          reversed: '절망, 자신감 저하, 희망 상실',             uprightKey: '희망',     reversedKey: '절망' },
  { id: 18, nameKo: '달',         nameEn: 'The Moon',        emoji: '🌕', upright: '환상, 불안, 무의식, 직관의 필요',           reversed: '혼란 해소, 두려움 극복, 명확해짐',         uprightKey: '무의식',   reversedKey: '혼란' },
  { id: 19, nameKo: '태양',       nameEn: 'The Sun',         emoji: '☀️', upright: '성공, 기쁨, 활력, 긍정적 에너지 폭발',     reversed: '과신, 일시적 우울, 지연된 성공',           uprightKey: '성공',     reversedKey: '과신' },
  { id: 20, nameKo: '심판',       nameEn: 'Judgement',       emoji: '📯', upright: '재탄생, 내면의 부름, 자기평가, 용서',       reversed: '자기의심, 내면의 비판, 반성 부족',         uprightKey: '재탄생',   reversedKey: '의심' },
  { id: 21, nameKo: '세계',       nameEn: 'The World',       emoji: '🌍', upright: '완성, 성취, 통합, 새로운 사이클의 시작',   reversed: '미완성, 지름길, 목표 지연',                uprightKey: '완성',     reversedKey: '미완성' },
];

// ── 시드 기반 난수 (재현 가능) ──────────────────────────────────────────────
function seededRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return () => {
    h ^= h << 13; h ^= h >> 17; h ^= h << 5;
    return ((h >>> 0) / 4294967296);
  };
}

function seededShuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface DrawnCard { card: TarotCard; isReversed: boolean; }

// 오늘 날짜 기반 타로 뽑기 (같은 날은 같은 결과)
export function drawTodayTarot(userId: string): DrawnCard[] {
  const today = new Date();
  const seed = `${userId}-${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  const rng = seededRandom(seed);
  const shuffled = seededShuffle(TAROT_DECK, rng);
  return shuffled.slice(0, 3).map(card => ({ card, isReversed: rng() > 0.6 }));
}

// ── 오늘의 사주 운세 ──────────────────────────────────────────────────────────
const LUCKY_COLORS: Record<string, string> = {
  목: '초록색', 화: '빨간색', 토: '노란색', 금: '하얀색', 수: '파란색',
};
const LUCKY_ITEMS: Record<string, string> = {
  목: '나무 소품', 화: '캔들', 토: '흙 화분', 금: '반지', 수: '물병',
};
const SAJU_MESSAGES: string[] = [
  '오늘은 새로운 인연을 만날 가능성이 높아요. 먼저 말을 걸어보세요!',
  '오늘의 에너지가 강합니다. 적극적으로 행동하면 좋은 결과가 따라와요.',
  '차분하게 주변을 살펴보는 날. 급하게 굴지 말고 천천히 가요.',
  '감정의 흐름을 따라가는 하루. 직관을 믿어보세요.',
  '대인관계가 활발해지는 날. 평소보다 말을 더 많이 하게 돼요.',
  '새로운 도전보다는 익숙한 것에서 행복을 찾는 날이에요.',
  '숨겨진 매력이 발산되는 하루. 자신감을 가지세요!',
  '예상치 못한 행운이 찾아오는 날. 작은 것도 놓치지 마세요.',
  '오늘은 마음을 열고 솔직하게 표현하는 것이 핵심이에요.',
  '에너지가 넘치는 날! 하고 싶었던 것을 오늘 시작해보세요.',
  '잠시 쉬어가는 것도 좋아요. 무리하지 말고 자신을 챙기세요.',
  '소소한 대화에서 특별한 연결고리가 생길 수 있어요.',
];

export interface TodayFortune {
  message: string; luckyColor: string; luckyItem: string;
  luckyNumber: number; energyLevel: number; ohaeng: string;
  zodiac: ZodiacInfo;
}

export function getTodayFortune(year: number, month: number, day: number): TodayFortune {
  const today = new Date();
  const seed = `${year}${month}${day}-${today.getFullYear()}${today.getMonth()}${today.getDate()}`;
  const rng = seededRandom(seed);
  const ohaeng = getOhaeng(year);
  const zodiac = getZodiac(year);
  const msgIdx = Math.floor(rng() * SAJU_MESSAGES.length);
  return {
    message: SAJU_MESSAGES[msgIdx],
    luckyColor: LUCKY_COLORS[ohaeng] ?? '보라색',
    luckyItem: LUCKY_ITEMS[ohaeng] ?? '크리스탈',
    luckyNumber: Math.floor(rng() * 9) + 1,
    energyLevel: Math.floor(rng() * 40) + 60, // 60-99
    ohaeng,
    zodiac,
  };
}

// ── 궁합 계산 ────────────────────────────────────────────────────────────────

// 삼합 그룹 (mod 값 기준)
const SAMHAP: number[][] = [
  [4, 8, 0],   // 쥐·용·원숭이 (수)
  [5, 9, 1],   // 소·뱀·닭 (금/화)
  [6, 10, 2],  // 호랑이·말·개 (화/토)
  [7, 11, 3],  // 토끼·양·돼지 (목)
];
// 육합 쌍
const YUKHAP: [number, number][] = [
  [4, 5], [6, 3], [7, 2], [8, 1], [9, 0], [10, 11],
];
// 상충 쌍
const SANGCHUNG: [number, number][] = [
  [4, 10], [5, 11], [6, 0], [7, 1], [8, 2], [9, 3],
];

function getZodiacMod(year: number): number {
  return ((year % 12) + 12) % 12;
}

function zodiacBaseScore(year1: number, year2: number): { score: number; rel: string } {
  const m1 = getZodiacMod(year1);
  const m2 = getZodiacMod(year2);
  if (m1 === m2) return { score: 72, rel: '동갑 (비견)' };
  if (SAMHAP.some(g => g.includes(m1) && g.includes(m2))) return { score: 92, rel: '삼합 (최고 궁합)' };
  if (YUKHAP.some(p => (p[0] === m1 && p[1] === m2) || (p[0] === m2 && p[1] === m1))) return { score: 80, rel: '육합 (좋은 궁합)' };
  if (SANGCHUNG.some(p => (p[0] === m1 && p[1] === m2) || (p[0] === m2 && p[1] === m1))) return { score: 32, rel: '상충 (어려운 궁합)' };
  return { score: 58, rel: '보통 (무난한 궁합)' };
}

export interface CompatResult {
  score: number;        // 0-100
  grade: string;        // S/A/B/C/D
  emoji: string;
  relation: string;
  summary: string;
  advice: string;
}

export interface IntimateResult {
  score: number;
  grade: string;
  emoji: string;
  summary: string;
  detail: string;
}

export function getCompatibility(
  year1: number, month1: number, day1: number,
  year2: number, month2: number, day2: number,
): CompatResult {
  const { score: base, rel } = zodiacBaseScore(year1, year2);
  // 월·일 조합으로 미세 조정 (±12점)
  const adjust = (((month1 + day1 + month2 + day2) * 7) % 25) - 12;
  const raw = Math.min(100, Math.max(10, base + adjust));
  const score = Math.round(raw);

  let grade = 'C'; let emoji = '🤝'; let summary = ''; let advice = '';
  if (score >= 88) { grade = 'S'; emoji = '💘'; summary = '천생연분 수준의 놀라운 궁합!'; advice = '서로가 운명임을 믿고 적극적으로 다가가 보세요.'; }
  else if (score >= 75) { grade = 'A'; emoji = '💕'; summary = '매우 좋은 궁합, 편안한 관계'; advice = '자연스럽게 어울릴수록 더 빛나는 사이예요.'; }
  else if (score >= 60) { grade = 'B'; emoji = '😊'; summary = '괜찮은 궁합, 노력하면 더 좋아져요'; advice = '서로의 차이를 이해하면 좋은 관계가 될 수 있어요.'; }
  else if (score >= 45) { grade = 'C'; emoji = '🤝'; summary = '보통 궁합, 맞춰가는 과정이 필요해요'; advice = '공통점을 찾아 대화를 많이 나눠보세요.'; }
  else { grade = 'D'; emoji = '⚡'; summary = '에너지가 충돌하는 궁합'; advice = '긴장감이 오히려 강한 끌림이 될 수도 있어요!'; }

  return { score, grade, emoji, relation: rel, summary, advice };
}

const INTIMATE_MSGS = [
  { summary: '완벽한 궁합! 서로를 완전히 이해해요', detail: '신체적, 감정적 리듬이 잘 맞아요. 함께하는 시간이 자연스럽고 편안해요.' },
  { summary: '뜨거운 케미! 강한 끌림이 있어요', detail: '서로에게 강한 자기장처럼 이끌려요. 긴장감과 설렘이 공존하는 사이예요.' },
  { summary: '안정적이고 따뜻한 편안함', detail: '자극적이진 않지만 함께 있으면 심리적으로 매우 편안해요.' },
  { summary: '서로의 다름이 매력이 되는 사이', detail: '정반대 에너지가 오히려 보완 관계를 만들어줘요.' },
  { summary: '천천히 알아가면 깊어지는 관계', detail: '처음엔 낯설지만 시간이 지날수록 자연스러워지는 타입이에요.' },
];

export function getIntimateCompatibility(
  year1: number, month1: number, day1: number,
  year2: number, month2: number, day2: number,
): IntimateResult {
  // 음양 오행 + 날짜 기반 속궁합 점수
  const o1 = getOhaeng(year1); const o2 = getOhaeng(year2);
  // 오행 상생/상극 관계
  const SANGSAENG: [string, string][] = [['목','화'],['화','토'],['토','금'],['금','수'],['수','목']];
  const SANGGEUK: [string, string][] = [['목','토'],['토','수'],['수','화'],['화','금'],['금','목']];
  let base = 60;
  if (o1 === o2) base = 70;
  else if (SANGSAENG.some(p => (p[0]===o1&&p[1]===o2)||(p[0]===o2&&p[1]===o1))) base = 85;
  else if (SANGGEUK.some(p => (p[0]===o1&&p[1]===o2)||(p[0]===o2&&p[1]===o1))) base = 42;

  const adjust = (((day1 * month2 + day2 * month1) * 3) % 20) - 10;
  const score = Math.min(99, Math.max(20, Math.round(base + adjust)));

  const msgIdx = Math.floor((score / 100) * INTIMATE_MSGS.length);
  const msg = INTIMATE_MSGS[Math.min(msgIdx, INTIMATE_MSGS.length - 1)];

  let grade = 'C'; let emoji = '🌡️';
  if (score >= 85) { grade = 'S'; emoji = '🔥'; }
  else if (score >= 72) { grade = 'A'; emoji = '💫'; }
  else if (score >= 58) { grade = 'B'; emoji = '✨'; }
  else if (score >= 42) { grade = 'C'; emoji = '🌡️'; }
  else { grade = 'D'; emoji = '❄️'; }

  return { score, grade, emoji, ...msg };
}
