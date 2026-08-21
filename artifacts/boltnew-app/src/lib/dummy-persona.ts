/**
 * Test dashboard dummy profiles — Korean-only, mirrors scripts/lib/test-personas.mjs.
 * Visible nicknames: Hangul only (no A1/B2 letter+digit tails).
 */
import { MBTI_LIST } from './constants';
import { seoulCalendarYear } from './korean-age';

export const DUMMY_NICKNAMES = [
  '지민', '서연', '현우', '민재', '수아', '도윤', '예린', '준호', '하은', '시우',
  '유진', '태민', '소율', '건우', '나연', '지후', '다은', '승현', '채원', '민서',
  '준영', '수빈', '지아', '현서', '은우', '서준', '윤서', '지원', '민호', '서현',
  '도현', '예준', '시윤', '유나', '재민', '하린', '지훈', '소연', '민규', '수민',
  '태양', '가을', '보라', '성민', '나윤', '준서', '다현', '민아', '서윤', '현민',
  '하늘', '다온', '라온', '이안', '주원', '시현', '예나', '하율', '지율', '은서',
] as const;

const NICK_MODIFIERS = [
  '초', '봄', '별', '달', '솔', '흰', '단', '맑', '늘', '참',
  '한', '새', '온', '담', '빛', '결', '숨', '꽃', '풀', '돌',
] as const;

export const DUMMY_LOCATIONS = [
  '서울', '경기 수원', '경기 성남', '인천', '부산', '대구', '대전', '광주', '울산', '세종',
  '전남 여수', '강원 춘천', '충남 천안', '제주',
] as const;

const DUMMY_BIOS = [
  '주말엔 등산이나 카페 투어 좋아해요',
  '영화 보고 맛집 찾는 게 취미예요',
  '운동하고 헬스장 자주 가요',
  '여행·캠핑 좋아하는 편이에요',
  '조용히 독서하거나 OTT 보는 타입',
  '사람 만나는 것도, 집콕도 좋아요',
] as const;

const DUMMY_INTERESTS = [
  '등산', '카페', '영화/드라마', '헬스', '여행', '독서', '운동', '맛집탐방',
  '게임', '캠핑', '음악감상', '요리', '러닝', '보드게임',
] as const;

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: readonly T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function graphemeCount(s: string): number {
  try {
    return [...new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(s)].length;
  } catch {
    return [...s].length;
  }
}

function sliceGraphemes(s: string, max: number): string {
  try {
    return [...new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(s)]
      .slice(0, max)
      .map((x) => x.segment)
      .join('');
  } catch {
    return [...s].slice(0, max).join('');
  }
}

export function makeDummyNickname(opts: { index?: number; attempt?: number } = {}): string {
  const { index = Math.floor(Math.random() * DUMMY_NICKNAMES.length), attempt = 0 } = opts;
  const base = DUMMY_NICKNAMES[Math.abs(index + attempt * 37) % DUMMY_NICKNAMES.length];
  if (attempt === 0) return sliceGraphemes(base, 6);
  const mod = NICK_MODIFIERS[(index + attempt) % NICK_MODIFIERS.length];
  const room = Math.max(1, 6 - graphemeCount(mod));
  return sliceGraphemes(`${mod}${base}`, room + graphemeCount(mod) > 6 ? room : 6);
}

export function reserveDummyNickname(existing: ReadonlySet<string>, seed = 0): string {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const nick = makeDummyNickname({ index: seed + attempt, attempt });
    if (!existing.has(nick) && !/\d$/u.test(nick)) return nick;
  }
  return makeDummyNickname({ index: seed, attempt: 99 });
}

/** 통계 연령대(10·20·30대)에 걸치도록 출생연도 랜덤 */
export function randomDummyBirthYear(now: Date = new Date()): number {
  const koreanAges = [19, 22, 25, 28, 31, 34, 37];
  const age = pick(koreanAges);
  return seoulCalendarYear(now) - age + 1;
}

export function buildDummyProfileInsert(opts: {
  id: string;
  deviceSecret: string;
  index?: number;
  existingNicknames?: ReadonlySet<string>;
}) {
  const idx = opts.index ?? Math.floor(Math.random() * 1000);
  const taken = opts.existingNicknames ?? new Set<string>();
  const nickname = reserveDummyNickname(taken, idx);
  const interestList = shuffle(DUMMY_INTERESTS).slice(0, 2 + (idx % 2));
  const personalityBands = [15, 35, 50, 65, 85, 95];
  const domBands = [8, 25, 45, 55, 75, 92];
  return {
    id: opts.id,
    _device_secret: opts.deviceSecret,
    nickname,
    bio: pick(DUMMY_BIOS),
    interests: interestList.join(', '),
    mbti: MBTI_LIST[idx % MBTI_LIST.length],
    personality_score: pick(personalityBands),
    dom_sub_score: pick(domBands),
    birth_year: randomDummyBirthYear(),
    birth_month: (idx % 12) + 1,
    birth_day: (idx % 28) + 1,
    location: DUMMY_LOCATIONS[idx % DUMMY_LOCATIONS.length],
    photo_url: null as string | null,
  };
}
