/**
 * Realistic Korean test personas for prod-facing scripts.
 * Nicknames: Korean names only (2–6 graphemes). NO numeric suffixes — uniqueness via
 * name pool + Hangul modifiers (digits stay in profile id / device secret only).
 */
import { randomUUID } from 'node:crypto';

/** 2–3 syllable Korean nicknames (visible in prod demos). Large pool for uniqueness. */
export const NICKNAMES = [
  '지민', '서연', '현우', '민재', '수아', '도윤', '예린', '준호', '하은', '시우',
  '유진', '태민', '소율', '건우', '나연', '지후', '다은', '승현', '채원', '민서',
  '준영', '수빈', '지아', '현서', '은우', '서준', '윤서', '지원', '민호', '서현',
  '도현', '예준', '시윤', '유나', '재민', '하린', '지훈', '소연', '민규', '수민',
  '태양', '가을', '보라', '성민', '나윤', '준서', '다현', '민아', '서윤', '현민',
  '하늘', '다온', '라온', '이안', '주원', '시현', '예나', '하율', '지율', '은서',
  '윤아', '채은', '서우', '건희', '연우', '지우', '하진', '세린', '유림', '도겸',
  '시온', '가은', '예성', '한결', '나래', '바다', '별하', '구름', '이슬', '새벽',
  '미소', '다솜', '한빛', '초롱', '단비', '보름', '노을', '달빛', '햇살', '풀잎',
  '은채', '시호', '재윤', '민결', '서율', '하람', '유성', '도하', '진우', '예솔',
  '가온', '이현', '수현', '정우', '태윤', '소희', '예림', '채린', '하영', '지안',
  '선우', '우진', '다인', '세준', '연서', '주하', '로아', '시엘', '루나', '아린',
];

/** 1-syllable Hangul modifiers for collision retries — never digits. */
export const NICK_MODIFIERS = [
  '초', '봄', '별', '달', '솔', '흰', '단', '맑', '늘', '참',
  '한', '새', '온', '담', '빛', '결', '숨', '꽃', '풀', '돌',
  '산', '강', '숲', '눈', '비', '바람', '별빛', '한울',
];

/** App MBTI enum (constants.ts) */
export const MBTI_TYPES = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP',
  'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
  'ISTP', 'ISFP', 'ESTP', 'ESFP',
];

/** Canonical interest tags (interests.ts subset) */
export const INTEREST_TAGS = [
  '등산', '카페', '영화/드라마', '헬스', '여행', '독서', '운동', '맛집탐방',
  '게임', '캠핑', '음악감상', '요리', '러닝', '보드게임', '사진찍기', 'OTT',
  '필라테스/요가', '드라이브', '클럽/바', '반려동물',
];

export const BIOS = [
  '주말엔 등산이나 카페 투어 좋아해요',
  '영화 보고 맛집 찾는 게 취미예요',
  '운동하고 헬스장 자주 가요',
  '여행·캠핑 좋아하는 편이에요',
  '조용히 독서하거나 OTT 보는 타입',
  '사람 만나는 것도, 집콕도 좋아요',
  '음악 들으며 드라이브 자주 해요',
  '새로운 카페·맛집 탐방 중',
];

export const LOCATIONS = [
  '서울', '경기 수원', '경기 성남', '인천', '부산', '대구', '대전', '광주', '울산', '세종',
];

const usedNicknames = new Set();

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickInterests(count = 2) {
  const tags = shuffle(INTEREST_TAGS);
  return tags.slice(0, Math.min(count, tags.length));
}

function graphemeSegments(s) {
  try {
    return [...new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(s)].map((x) => x.segment);
  } catch {
    return [...s];
  }
}

function sliceGraphemes(s, max) {
  return graphemeSegments(s).slice(0, max).join('');
}

function graphemeCount(s) {
  return graphemeSegments(s).length;
}

/** Recurrence / sanity: nicknames must not end with ASCII digits. */
export function nicknameEndsWithDigit(nickname) {
  return /\d$/u.test(String(nickname ?? ''));
}

/** personality_score → 탑/바텀 labels in profile.ts */
export function pickPersonalityScore() {
  const bands = [15, 35, 50, 65, 85, 95];
  return bands[Math.floor(Math.random() * bands.length)];
}

/** dom_sub_score → 돔/섭 labels in profile.ts */
export function pickDomSubScore() {
  const bands = [8, 25, 45, 55, 75, 92];
  return bands[Math.floor(Math.random() * bands.length)];
}

export function shortId(len = 4) {
  return randomUUID().replace(/-/g, '').slice(0, len);
}

/**
 * Unique nickname within 6 graphemes: Korean name only (no digit tails).
 * Collision retries use Hangul modifiers (초지민, 봄서연, …).
 * @param {{ index?: number, base?: string, attempt?: number }} opts
 */
export function makeNickname(opts = {}) {
  const { index, base: baseOverride, attempt = 0 } = opts;
  const poolIdx = index != null
    ? Math.abs(index) % NICKNAMES.length
    : Math.floor(Math.random() * NICKNAMES.length);
  const base = baseOverride ?? NICKNAMES[(poolIdx + attempt * 37) % NICKNAMES.length];
  let nick;
  if (attempt === 0) {
    nick = sliceGraphemes(base, 6);
  } else {
    const mod = NICK_MODIFIERS[(poolIdx + attempt) % NICK_MODIFIERS.length];
    const room = Math.max(1, 6 - graphemeCount(mod));
    nick = `${mod}${sliceGraphemes(base, room)}`;
    if (graphemeCount(nick) < 2) {
      nick = sliceGraphemes(`${mod}${NICKNAMES[(poolIdx + attempt * 13) % NICKNAMES.length]}`, 6);
    }
  }
  if (nicknameEndsWithDigit(nick)) {
    // Defensive: never emit digit-suffixed nicks even if a bad base sneaks in
    nick = sliceGraphemes(nick.replace(/\d+$/u, '') || '하늘', 6);
  }
  return nick;
}

/** Reset in-process nickname tracking (parallel test runs). */
export function resetNicknameRegistry() {
  usedNicknames.clear();
}

/** Reserve a nickname; bumps Hangul modifier on collision within the same process. */
export function reserveNickname(opts = {}) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const nickname = makeNickname({ ...opts, attempt });
    if (!usedNicknames.has(nickname) && !nicknameEndsWithDigit(nickname)) {
      usedNicknames.add(nickname);
      return nickname;
    }
  }
  // Last resort: two modifiers + short base (still no digits)
  const a = NICK_MODIFIERS[Math.floor(Math.random() * NICK_MODIFIERS.length)];
  const b = NICKNAMES[Math.floor(Math.random() * NICKNAMES.length)];
  const fallback = sliceGraphemes(`${a}${b}`, 6);
  usedNicknames.add(fallback);
  return fallback;
}

/**
 * @param {{ index?: number, nickname?: string }} opts
 */
export function createTestPersona(opts = {}) {
  const nickname = opts.nickname ?? reserveNickname({ index: opts.index });
  const interestList = pickInterests(2 + (opts.index ?? 0) % 2);
  return {
    nickname,
    bio: pick(BIOS),
    interests: interestList.join(', '),
    mbti: MBTI_TYPES[(opts.index ?? Math.floor(Math.random() * MBTI_TYPES.length)) % MBTI_TYPES.length],
    personality_score: pickPersonalityScore(),
    dom_sub_score: pickDomSubScore(),
    birth_year: 1992 + ((opts.index ?? 0) % 10),
    birth_month: ((opts.index ?? 0) % 12) + 1,
    birth_day: ((opts.index ?? 0) % 28) + 1,
    location: LOCATIONS[(opts.index ?? 0) % LOCATIONS.length],
  };
}

/** Two distinct personas for pair tests (hearts, realtime, endurance). */
export function createPersonaPair() {
  resetNicknameRegistry();
  const bases = shuffle(NICKNAMES);
  return [
    createTestPersona({ nickname: reserveNickname({ base: bases[0] }) }),
    createTestPersona({ nickname: reserveNickname({ base: bases[1] }) }),
  ];
}

/**
 * Profile insert payload for /api/db/op.
 * @param {{ id: string, secret: string, persona?: object, overrides?: object }} args
 */
export function profilePayload({ id, secret, persona, overrides = {} }) {
  const p = persona ?? createTestPersona();
  return {
    id,
    nickname: p.nickname,
    bio: p.bio,
    interests: p.interests,
    mbti: p.mbti,
    personality_score: p.personality_score,
    dom_sub_score: p.dom_sub_score,
    birth_year: p.birth_year,
    birth_month: p.birth_month,
    birth_day: p.birth_day,
    location: p.location,
    photo_url: null,
    _device_secret: secret,
    ...overrides,
  };
}
