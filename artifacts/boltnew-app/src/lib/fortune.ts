// ─── 사주 · 타로 · 궁합 유틸리티 ───────────────────────────────────────────

// ── 12지 (띠) ───────────────────────────────────────────────────────────────
export interface ZodiacInfo {
  name: string; emoji: string; element: string; yinyang: '양' | '음'; mod: number;
  desc: string; // 쉬운 설명
}

export const ZODIAC_LIST: ZodiacInfo[] = [
  { name: '원숭이', emoji: '🐒', element: '금', yinyang: '양', mod: 0, desc: '재치 있고 눈치 빠른 타입. 분위기 메이커' },
  { name: '닭',     emoji: '🐓', element: '금', yinyang: '음', mod: 1, desc: '꼼꼼하고 완벽주의. 자기 관리 철저' },
  { name: '개',     emoji: '🐕', element: '토', yinyang: '양', mod: 2, desc: '의리 있고 믿음직함. 한번 정하면 끝까지' },
  { name: '돼지',   emoji: '🐷', element: '수', yinyang: '음', mod: 3, desc: '복이 넘치고 인간적. 먹고 마시는 걸 좋아함' },
  { name: '쥐',     emoji: '🐭', element: '수', yinyang: '양', mod: 4, desc: '영리하고 사교적. 첫인상이 좋음' },
  { name: '소',     emoji: '🐮', element: '토', yinyang: '음', mod: 5, desc: '끈기와 성실함. 믿을 수 있는 타입' },
  { name: '호랑이', emoji: '🐯', element: '목', yinyang: '양', mod: 6, desc: '카리스마 넘치고 열정적. 당당한 존재감' },
  { name: '토끼',   emoji: '🐰', element: '목', yinyang: '음', mod: 7, desc: '섬세하고 감수성 풍부. 사람을 편안하게 함' },
  { name: '용',     emoji: '🐲', element: '토', yinyang: '양', mod: 8, desc: '야망 크고 드라마틱. 스케일이 다름' },
  { name: '뱀',     emoji: '🐍', element: '화', yinyang: '음', mod: 9, desc: '신비롭고 직관적. 속 깊은 타입' },
  { name: '말',     emoji: '🐴', element: '화', yinyang: '양', mod: 10, desc: '자유롭고 활동적. 에너지가 넘침' },
  { name: '양',     emoji: '🐑', element: '토', yinyang: '음', mod: 11, desc: '온화하고 예술적. 분위기를 부드럽게 만듦' },
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
const OHAENG_DESC: Record<string, string> = {
  목: '성장·생명·창조의 기운. 봄처럼 새로운 시작을 만드는 에너지',
  화: '열정·활력·표현의 기운. 여름처럼 뜨겁고 강렬한 에너지',
  토: '안정·중심·신뢰의 기운. 땅처럼 묵직하고 든든한 에너지',
  금: '결단·순수·정밀의 기운. 칼날처럼 명확하고 예리한 에너지',
  수: '지혜·유연·감성의 기운. 물처럼 부드럽게 흐르는 에너지',
};

export function getCheongan(year: number): string {
  return CHEONGAN[((year % 10) + 10) % 10];
}
export function getOhaeng(year: number): string {
  return OHAENG_MAP[getCheongan(year)] ?? '토';
}
export function getOhaengColor(ohaeng: string): string { return OHAENG_COLOR[ohaeng] ?? '#94a3b8'; }
export function getOhaengEmoji(ohaeng: string): string { return OHAENG_EMOJI[ohaeng] ?? '🌀'; }
export function getOhaengDesc(ohaeng: string): string { return OHAENG_DESC[ohaeng] ?? ''; }

// ── 타로 카드 (메이저 아르카나 22장) ──────────────────────────────────────────
export interface TarotCard {
  id: number; nameKo: string; nameEn: string; emoji: string;
  upright: string; reversed: string; uprightKey: string; reversedKey: string;
  easyDesc: string; // 모르는 사람을 위한 쉬운 설명
}

export const TAROT_DECK: TarotCard[] = [
  { id: 0,  nameKo: '바보',       nameEn: 'The Fool',        emoji: '🌈', upright: '새로운 시작, 자유로운 여정, 순수한 도전',     reversed: '무모함, 준비 없는 출발, 경솔한 결정',     uprightKey: '자유',   reversedKey: '무모함', easyDesc: '가방 하나 들고 절벽 끝에서 뛰어내리려는 사람. 겁 없이 새 출발하는 에너지예요.' },
  { id: 1,  nameKo: '마법사',     nameEn: 'The Magician',    emoji: '🪄', upright: '의지력, 숙련, 창의적 실행, 기회 활용',       reversed: '속임수, 재능 낭비, 집중력 부족',           uprightKey: '능력',   reversedKey: '낭비',   easyDesc: '내 안에 있는 능력을 꺼내 쓸 때가 됐어요. 지금 가진 것으로 충분해요.' },
  { id: 2,  nameKo: '여사제',     nameEn: 'High Priestess',  emoji: '🌙', upright: '직관, 내면의 지혜, 숨겨진 진실',            reversed: '비밀 억압, 표면적 판단, 직관 무시',         uprightKey: '직관',   reversedKey: '억압',   easyDesc: '논리보다 느낌을 믿어보세요. 마음속 어딘가가 이미 답을 알고 있어요.' },
  { id: 3,  nameKo: '여황제',     nameEn: 'The Empress',     emoji: '🌸', upright: '풍요, 창조력, 모성, 감각적 즐거움',          reversed: '과의존, 창의성 차단, 결핍감',              uprightKey: '풍요',   reversedKey: '결핍',   easyDesc: '자연처럼 풍성한 에너지. 오늘은 맛있는 거 먹고 좋아하는 거 즐겨요.' },
  { id: 4,  nameKo: '황제',       nameEn: 'The Emperor',     emoji: '👑', upright: '안정, 권위, 구조, 리더십',                  reversed: '지배욕, 고집, 융통성 없음',                uprightKey: '안정',   reversedKey: '고집',   easyDesc: '든든한 리더의 카드. 내 영역을 지키고 원칙대로 행동할 때예요.' },
  { id: 5,  nameKo: '교황',       nameEn: 'The Hierophant',  emoji: '⛪', upright: '전통, 신뢰, 정신적 안내, 배움',             reversed: '관습 탈피, 새로운 방식, 반항심',           uprightKey: '전통',   reversedKey: '반항',   easyDesc: '믿을 수 있는 사람에게 조언을 구해보세요. 혼자 해결하려 하지 마요.' },
  { id: 6,  nameKo: '연인들',     nameEn: 'The Lovers',      emoji: '💕', upright: '선택, 사랑, 조화, 가치관 정렬',             reversed: '갈등, 불균형, 잘못된 선택',                uprightKey: '사랑',   reversedKey: '갈등',   easyDesc: '오늘 연애 운이 떠 있어요. 인연이 생길 수도, 중요한 선택을 해야 할 수도 있어요.' },
  { id: 7,  nameKo: '전차',       nameEn: 'The Chariot',     emoji: '🏆', upright: '승리, 의지, 자기통제, 전진',               reversed: '방향 상실, 공격성, 좌절',                  uprightKey: '승리',   reversedKey: '좌절',   easyDesc: '두 마리 말을 다스리며 달리는 카드. 강한 의지로 밀고 나가면 이겨요.' },
  { id: 8,  nameKo: '힘',         nameEn: 'Strength',        emoji: '🦁', upright: '용기, 인내, 내면의 힘, 온화한 통제',        reversed: '자기의심, 나약함, 충동',                   uprightKey: '용기',   reversedKey: '나약함', easyDesc: '사자를 맨손으로 다루는 여인. 완력이 아니라 사랑과 인내로 극복하는 카드예요.' },
  { id: 9,  nameKo: '은둔자',     nameEn: 'The Hermit',      emoji: '🔦', upright: '성찰, 고독, 내면 탐구, 지혜 추구',          reversed: '고립, 고집, 내향성 과잉',                  uprightKey: '성찰',   reversedKey: '고립',   easyDesc: '혼자 등불 들고 걷는 노인. 지금은 내면을 들여다볼 시간이에요.' },
  { id: 10, nameKo: '운명의 수레바퀴', nameEn: 'Wheel of Fortune', emoji: '🎡', upright: '행운, 전환점, 운명적 흐름',        reversed: '불운, 저항, 변화 거부',                    uprightKey: '행운',   reversedKey: '저항',   easyDesc: '인생의 사이클이 돌아가는 카드. 지금이 변화의 시점이에요.' },
  { id: 11, nameKo: '정의',       nameEn: 'Justice',         emoji: '⚖️', upright: '균형, 진실, 공정한 결과, 책임',            reversed: '불공정, 책임회피, 편견',                   uprightKey: '공정',   reversedKey: '편견',   easyDesc: '칼과 저울을 든 여신. 행동에는 반드시 결과가 따른다는 의미예요.' },
  { id: 12, nameKo: '매달린 사람', nameEn: 'The Hanged Man',  emoji: '🙃', upright: '자발적 희생, 다른 관점, 기다림',           reversed: '순교, 지연, 고집',                         uprightKey: '희생',   reversedKey: '지연',   easyDesc: '거꾸로 매달려도 표정이 평온한 카드. 시각을 바꾸면 새로운 답이 보여요.' },
  { id: 13, nameKo: '죽음',       nameEn: 'Death',           emoji: '🌑', upright: '끝과 새 시작, 변화, 놓아주기',              reversed: '변화 저항, 집착, 정체',                    uprightKey: '변화',   reversedKey: '집착',   easyDesc: '무서운 이름이지만 실제론 가장 긍정적인 카드 중 하나예요. 오래된 것과 작별하고 새로 시작하는 신호예요.' },
  { id: 14, nameKo: '절제',       nameEn: 'Temperance',      emoji: '🌊', upright: '균형, 인내, 조화, 중용',                   reversed: '극단, 과잉, 불균형',                       uprightKey: '균형',   reversedKey: '과잉',   easyDesc: '물을 두 컵에 완벽하게 따르는 카드. 극단으로 가지 말고 중간을 찾아요.' },
  { id: 15, nameKo: '악마',       nameEn: 'The Devil',       emoji: '😈', upright: '집착, 물질욕, 억압된 욕구, 현실적 유혹',    reversed: '해방, 속박에서 벗어남, 자유',              uprightKey: '욕구',   reversedKey: '해방',   easyDesc: '사슬에 묶여 있지만 사실 스스로 풀 수 있어요. 나를 붙잡고 있는 게 뭔지 직면할 때예요.' },
  { id: 16, nameKo: '탑',         nameEn: 'The Tower',       emoji: '⚡', upright: '급격한 변화, 붕괴, 충격적 깨달음',          reversed: '변화 두려움, 위기 모면, 재건',             uprightKey: '충격',   reversedKey: '재건',   easyDesc: '번개 맞아 무너지는 탑. 충격적이지만 필요한 변화가 찾아오는 카드예요.' },
  { id: 17, nameKo: '별',         nameEn: 'The Star',        emoji: '⭐', upright: '희망, 영감, 치유, 긍정적 에너지',          reversed: '절망, 자신감 저하, 희망 상실',             uprightKey: '희망',   reversedKey: '절망',   easyDesc: '밤하늘 별 아래서 물을 붓는 여인. 힘든 시간 후에 찾아오는 평화예요.' },
  { id: 18, nameKo: '달',         nameEn: 'The Moon',        emoji: '🌕', upright: '환상, 불안, 무의식, 직관의 필요',           reversed: '혼란 해소, 두려움 극복, 명확해짐',         uprightKey: '무의식', reversedKey: '혼란',   easyDesc: '달빛 아래 개와 늑대. 지금 상황이 불명확하고 감정이 요동치는 시기예요.' },
  { id: 19, nameKo: '태양',       nameEn: 'The Sun',         emoji: '☀️', upright: '성공, 기쁨, 활력, 긍정적 에너지 폭발',     reversed: '과신, 일시적 우울, 지연된 성공',           uprightKey: '성공',   reversedKey: '과신',   easyDesc: '가장 좋은 카드 중 하나! 환한 태양 아래 기쁨이 넘치는 날이에요.' },
  { id: 20, nameKo: '심판',       nameEn: 'Judgement',       emoji: '📯', upright: '재탄생, 내면의 부름, 자기평가, 용서',       reversed: '자기의심, 내면의 비판, 반성 부족',         uprightKey: '재탄생', reversedKey: '의심',   easyDesc: '나팔 소리에 무덤에서 일어나는 카드. 과거를 정리하고 새롭게 태어날 때예요.' },
  { id: 21, nameKo: '세계',       nameEn: 'The World',       emoji: '🌍', upright: '완성, 성취, 통합, 새로운 사이클의 시작',   reversed: '미완성, 지름길, 목표 지연',                uprightKey: '완성',   reversedKey: '미완성', easyDesc: '모든 게 완성된 카드. 한 단계가 마무리되고 다음 챕터가 시작돼요.' },
];

// ── 시드 기반 난수 ──────────────────────────────────────────────────────────
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

export function drawTodayTarot(userId: string): DrawnCard[] {
  const today = new Date();
  const seed = `${userId}-${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  const rng = seededRandom(seed);
  const shuffled = seededShuffle(TAROT_DECK, rng);
  return shuffled.slice(0, 3).map(card => ({ card, isReversed: rng() > 0.6 }));
}

// ── 오늘의 사주 운세 ──────────────────────────────────────────────────────────
const LUCKY_COLORS: Record<string, string> = {
  목: '초록색', 화: '빨간색', 토: '노란색', 금: '하얀색·은색', 수: '파란색·검정색',
};
const LUCKY_ITEMS: Record<string, string> = {
  목: '나무 소품', 화: '캔들·조명', 토: '흙 화분·돌', 금: '금속 액세서리', 수: '물병·수정',
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
  zodiac: ZodiacInfo; ohaengDesc: string;
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
    energyLevel: Math.floor(rng() * 40) + 60,
    ohaeng,
    zodiac,
    ohaengDesc: getOhaengDesc(ohaeng),
  };
}

// ── 궁합 계산 ────────────────────────────────────────────────────────────────

const SAMHAP: number[][] = [
  [4, 8, 0], [5, 9, 1], [6, 10, 2], [7, 11, 3],
];
const YUKHAP: [number, number][] = [
  [4, 5], [6, 3], [7, 2], [8, 1], [9, 0], [10, 11],
];
const SANGCHUNG: [number, number][] = [
  [4, 10], [5, 11], [6, 0], [7, 1], [8, 2], [9, 3],
];

function getZodiacMod(year: number): number {
  return ((year % 12) + 12) % 12;
}

export function zodiacBaseScore(year1: number, year2: number): { score: number; rel: string } {
  const m1 = getZodiacMod(year1);
  const m2 = getZodiacMod(year2);
  if (m1 === m2) return { score: 72, rel: '동갑 (비견) — 서로를 거울처럼 이해해요' };
  if (SAMHAP.some(g => g.includes(m1) && g.includes(m2))) return { score: 92, rel: '삼합 (최고 궁합) — 운명적으로 잘 맞는 조합!' };
  if (YUKHAP.some(p => (p[0] === m1 && p[1] === m2) || (p[0] === m2 && p[1] === m1))) return { score: 80, rel: '육합 (좋은 궁합) — 자연스럽게 어울리는 사이' };
  if (SANGCHUNG.some(p => (p[0] === m1 && p[1] === m2) || (p[0] === m2 && p[1] === m1))) return { score: 32, rel: '상충 (충돌 궁합) — 긴장감이 오히려 강한 끌림이 될 수도!' };
  return { score: 58, rel: '평궁합 (무난) — 노력하면 충분히 좋아질 수 있어요' };
}

export interface CompatResult {
  score: number; grade: string; emoji: string; relation: string;
  summary: string; advice: string;
}

// 방법 1: 전통 사주 궁합 (12지신 기반)
export function getCompatibility(
  year1: number, month1: number, day1: number,
  year2: number, month2: number, day2: number,
): CompatResult {
  const { score: base, rel } = zodiacBaseScore(year1, year2);
  const adjust = (((month1 + day1 + month2 + day2) * 7) % 25) - 12;
  const score = Math.min(100, Math.max(10, Math.round(base + adjust)));

  let grade = 'C'; let emoji = '🤝'; let summary = ''; let advice = '';
  if (score >= 88) { grade = 'S'; emoji = '💘'; summary = '천생연분 수준의 놀라운 궁합!'; advice = '서로가 운명임을 믿고 적극적으로 다가가 보세요.'; }
  else if (score >= 75) { grade = 'A'; emoji = '💕'; summary = '매우 좋은 궁합, 편안한 관계'; advice = '자연스럽게 어울릴수록 더 빛나는 사이예요.'; }
  else if (score >= 60) { grade = 'B'; emoji = '😊'; summary = '괜찮은 궁합, 노력하면 더 좋아져요'; advice = '서로의 차이를 이해하면 좋은 관계가 될 수 있어요.'; }
  else if (score >= 45) { grade = 'C'; emoji = '🤝'; summary = '보통 궁합, 맞춰가는 과정이 필요해요'; advice = '공통점을 찾아 대화를 많이 나눠보세요.'; }
  else { grade = 'D'; emoji = '⚡'; summary = '에너지가 충돌하는 궁합'; advice = '긴장감이 오히려 강한 끌림이 될 수도 있어요!'; }

  return { score, grade, emoji, relation: rel, summary, advice };
}

// 방법 2: 수비학 궁합 (생년월일 숫자 합산)
// 수비학 = 생년월일의 숫자를 모두 더해서 한 자리 수로 만든 '운명 수'로 궁합을 봐요
function getLifePathNumber(year: number, month: number, day: number): number {
  const sum = String(year + month + day).split('').reduce((a, b) => a + Number(b), 0);
  if (sum <= 9) return sum;
  const sum2 = String(sum).split('').reduce((a, b) => a + Number(b), 0);
  return sum2 <= 9 ? sum2 : String(sum2).split('').reduce((a, b) => a + Number(b), 0);
}

const NUMEROLOGY_COMPAT: Record<string, { score: number; desc: string }> = {
  '1-1': { score: 75, desc: '강한 자아끼리의 만남. 서로 독립적으로 존중해요' },
  '1-2': { score: 82, desc: '리더와 조력자의 환상적인 조화' },
  '1-3': { score: 88, desc: '창조적이고 신나는 조합. 매일 새로운 기분!' },
  '1-4': { score: 65, desc: '자유로운 1과 체계적인 4. 노력이 필요해요' },
  '1-5': { score: 80, desc: '모험을 좋아하는 두 사람. 같이 있으면 재밌어요' },
  '1-6': { score: 70, desc: '1의 독립심과 6의 돌봄이 만나요' },
  '1-7': { score: 72, desc: '서로 다른 세계에 살지만 끌리는 관계' },
  '1-8': { score: 85, desc: '성공지향적인 두 사람. 함께하면 최강 팀!' },
  '1-9': { score: 78, desc: '이상주의자 두 사람. 서로를 영감으로 삼아요' },
  '2-2': { score: 80, desc: '감수성 넘치는 두 사람. 서로를 잘 이해해요' },
  '2-3': { score: 86, desc: '감성과 창의성의 만남. 아기자기한 관계' },
  '2-4': { score: 78, desc: '안정을 원하는 두 사람. 편안한 일상을 만들어요' },
  '2-5': { score: 60, desc: '예민한 2와 자유로운 5. 배려가 필요해요' },
  '2-6': { score: 90, desc: '서로를 진심으로 배려하는 최고의 조합!' },
  '2-7': { score: 83, desc: '감성과 지성의 조화. 깊은 대화가 이어져요' },
  '2-8': { score: 68, desc: '현실과 감성의 줄다리기. 이해하려는 노력 필요' },
  '2-9': { score: 85, desc: '사랑스러운 두 사람. 서로를 위해 뭐든 해요' },
  '3-3': { score: 78, desc: '끊임없이 떠들고 웃는 두 사람. 활기넘쳐요!' },
  '3-4': { score: 64, desc: '자유로운 3과 계획적인 4. 다를수록 성장해요' },
  '3-5': { score: 88, desc: '인생을 즐기는 두 사람. 같이 있으면 파티!' },
  '3-6': { score: 84, desc: '창의적이고 따뜻한 조합. 주변이 행복해져요' },
  '3-7': { score: 70, desc: '외향적인 3과 내향적인 7. 서로 다름이 매력' },
  '3-8': { score: 75, desc: '창의성과 추진력의 만남. 프로젝트 같이 하면 최고' },
  '3-9': { score: 90, desc: '꿈과 창의성이 만나는 환상의 조합!' },
};

export function getNumerologyCompat(
  year1: number, month1: number, day1: number,
  year2: number, month2: number, day2: number,
): { score: number; desc: string; num1: number; num2: number } {
  const n1 = getLifePathNumber(year1, month1, day1);
  const n2 = getLifePathNumber(year2, month2, day2);
  const key1 = `${Math.min(n1, n2)}-${Math.max(n1, n2)}`;
  const fallback = { score: 70 + ((n1 + n2) % 20), desc: '독특한 조합이에요. 서로에게 새로운 세상을 보여줘요.' };
  const result = NUMEROLOGY_COMPAT[key1] ?? fallback;
  return { ...result, num1: n1, num2: n2 };
}

// 방법 3: 오행 상생/상극 궁합
const OHAENG_SANGSAENG: [string, string][] = [
  ['목', '화'], ['화', '토'], ['토', '금'], ['금', '수'], ['수', '목']
];
const OHAENG_SANGGEUK: [string, string][] = [
  ['목', '토'], ['토', '수'], ['수', '화'], ['화', '금'], ['금', '목']
];

export interface OhaengCompatResult {
  score: number; grade: string; emoji: string; relation: string;
  element1: string; element2: string; summary: string;
}

export function getOhaengCompat(year1: number, year2: number): OhaengCompatResult {
  const o1 = getOhaeng(year1); const o2 = getOhaeng(year2);
  // 상생: A가 B를 키워주는 관계
  const isSangsaeng = OHAENG_SANGSAENG.some(p => (p[0] === o1 && p[1] === o2) || (p[0] === o2 && p[1] === o1));
  const isSanggeuk = OHAENG_SANGGEUK.some(p => (p[0] === o1 && p[1] === o2) || (p[0] === o2 && p[1] === o1));
  const isSame = o1 === o2;

  let score = 62; let grade = 'C'; let emoji = '🤝'; let relation = ''; let summary = '';
  if (isSame) { score = 74; grade = 'B'; emoji = '🪞'; relation = '비화 (같은 오행)'; summary = `둘 다 ${o1}의 기운. 서로를 거울처럼 이해하지만 경쟁이 생길 수도 있어요.`; }
  else if (isSangsaeng) { score = 88; grade = 'A'; emoji = '🌱'; relation = '상생 (서로 키우는 관계)'; summary = `${o1}과 ${o2}는 상생 관계! 한 쪽이 다른 쪽을 자연스럽게 성장시켜줘요.`; }
  else if (isSanggeuk) { score = 40; grade = 'D'; emoji = '⚔️'; relation = '상극 (서로 억제하는 관계)'; summary = `${o1}과 ${o2}는 상극이지만, 강한 자극으로 성장할 수 있어요. 도전적인 관계!`; }
  else { score = 68; grade = 'B'; emoji = '🤝'; relation = '평관계'; summary = '무난하고 안정적인 오행 조합이에요.'; }

  return { score, grade, emoji, relation, element1: o1, element2: o2, summary };
}

// 방법 4: 침대 궁합 🔞 (19금 — 스킨십·매칭 특화)
export interface BedCompatResult {
  score: number; grade: string; emoji: string;
  chemistry: string; // 케미 설명
  style: string;     // 스타일 설명
  tip: string;       // 오늘의 팁 (조금 직접적)
}

const BED_CHEMISTRIES = [
  { score: 95, grade: 'S', emoji: '🔥', chemistry: '폭발적인 케미', style: '본능적으로 통하는 사이. 첫 터치에서부터 느낌이 달라요.', tip: '서로의 눈빛만으로도 다 알아요. 오늘 밤 용기 내보세요.' },
  { score: 88, grade: 'A+', emoji: '💥', chemistry: '뜨거운 당김', style: '가까이 있으면 긴장되는 사이. 스킨십이 점점 깊어지는 타입.', tip: '서로 원하는 게 뭔지 솔직하게 말해보세요. 더 좋아져요.' },
  { score: 82, grade: 'A', emoji: '💫', chemistry: '설레는 끌림', style: '함께하면 심장이 뛰는 사이. 분위기에 따라 달라져요.', tip: '천천히 시간을 가지면서 신뢰를 쌓아가 보세요.' },
  { score: 75, grade: 'B+', emoji: '✨', chemistry: '따뜻한 편안함', style: '자극적이진 않지만 함께 있으면 심리적으로 매우 편안해요.', tip: '안정감이 최고의 무기예요. 편안한 분위기를 만들어가세요.' },
  { score: 68, grade: 'B', emoji: '🌡️', chemistry: '점점 깊어지는 관계', style: '처음은 어색하지만 시간이 지날수록 자연스러워지는 타입.', tip: '익숙해질수록 빛나는 관계예요. 조급해하지 말아요.' },
  { score: 55, grade: 'C', emoji: '🤔', chemistry: '서로 다른 리듬', style: '템포가 달라서 맞춰가는 연습이 필요해요.', tip: '소통이 핵심이에요. 원하는 것을 말로 표현해보세요.' },
  { score: 40, grade: 'D', emoji: '❄️', chemistry: '냉온탕을 오가는 사이', style: '뜨겁다 차갑다 예측하기 어려운 관계예요.', tip: '서로에 대한 이해가 먼저예요. 마음부터 맞춰가 보세요.' },
];

export function getBedCompat(
  year1: number, month1: number, day1: number,
  year2: number, month2: number, day2: number,
  domScore1?: number | null, domScore2?: number | null,
): BedCompatResult {
  const o1 = getOhaeng(year1); const o2 = getOhaeng(year2);
  const sangsaeng = OHAENG_SANGSAENG.some(p => (p[0] === o1 && p[1] === o2) || (p[0] === o2 && p[1] === o1));
  const sanggeuk = OHAENG_SANGGEUK.some(p => (p[0] === o1 && p[1] === o2) || (p[0] === o2 && p[1] === o1));

  // 기본 점수: 오행 상성
  let base = 65;
  if (sangsaeng) base = 82;
  else if (sanggeuk) base = 55;
  else if (o1 === o2) base = 72;

  // 돔/섭 보정: 한 쪽이 돔 성향, 다른 쪽이 섭 성향이면 보너스
  const d1 = domScore1 ?? 50; const d2 = domScore2 ?? 50;
  const domDiff = Math.abs(d1 - d2);
  if (domDiff > 40) base = Math.min(99, base + 12); // 역할이 뚜렷하면 케미 UP
  else if (domDiff < 15) base = Math.max(30, base - 5); // 둘 다 비슷하면 갈등 가능

  // 날짜 기반 미세조정
  const adjust = (((day1 * month2 + day2 * month1) * 3) % 20) - 10;
  const score = Math.min(99, Math.max(20, Math.round(base + adjust)));

  const idx = Math.max(0, Math.min(BED_CHEMISTRIES.length - 1, Math.floor((99 - score) / 15)));
  return { ...BED_CHEMISTRIES[idx], score };
}

// MBTI 궁합
function mbtiOverlap(a: string, b: string): number {
  if (!a || !b || a.length !== 4 || b.length !== 4) return 2;
  let same = 0;
  for (let i = 0; i < 4; i++) { if (a[i] === b[i]) same++; }
  return same;
}

const MBTI_NOTES: Record<number, string> = {
  0: '정반대 MBTI! 서로가 신세계예요. 매우 자극적인 관계.',
  1: '거의 반대 타입. 배울 점이 많고 강한 끌림이 생겨요.',
  2: '절반씩 닮은 두 사람. 이해도 되고 새롭기도 해요.',
  3: '비슷한 점이 많아서 대화가 잘 통해요.',
  4: '완전히 같은 MBTI! 서로를 가장 잘 이해하지만 단점도 같아요.',
};

export function getMbtiCompat(mbti1: string, mbti2: string): { score: number; note: string; overlap: number } {
  const overlap = mbtiOverlap(mbti1, mbti2);
  const scores = [78, 72, 68, 80, 74]; // 0~4개 겹칠 때
  return { score: scores[overlap] ?? 70, note: MBTI_NOTES[overlap] ?? '', overlap };
}
