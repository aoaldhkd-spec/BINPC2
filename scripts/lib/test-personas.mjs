/**
 * Realistic Korean test personas for prod-facing scripts.
 * Nicknames stay within app rules (2–6 graphemes); suffix digits keep registration unique.
 */
import { randomUUID } from 'node:crypto';

/** 2–3 syllable Korean nicknames (visible in prod demos) */
export const NICKNAMES = [
  '지민', '서연', '현우', '민재', '수아', '도윤', '예린', '준호', '하은', '시우',
  '유진', '태민', '소율', '건우', '나연', '지후', '다은', '승현', '채원', '민서',
  '준영', '수빈', '지아', '현서', '은우', '서준', '윤서', '지원', '민호', '서현',
  '도현', '예준', '시윤', '유나', '재민', '하린', '지훈', '소연', '민규', '수민',
  '태양', '가을', '보라', '성민', '나윤', '준서', '다현', '민아', '서윤', '현민',
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
 * Unique nickname within 6 graphemes: base (2–3) + 2–4 digit suffix.
 * @param {{ index?: number, base?: string, attempt?: number }} opts
 */
export function makeNickname(opts = {}) {
  const { index, base: baseOverride, attempt = 0 } = opts;
  const base = baseOverride ?? NICKNAMES[(index ?? Math.floor(Math.random() * NICKNAMES.length)) % NICKNAMES.length];
  const seed = index != null ? index + attempt * 997 : Math.floor(Math.random() * 9000) + attempt * 137;
  const suffix = String(seed % 10000).padStart(attempt > 0 ? 3 : 2, '0');
  const nick = `${base}${suffix}`;
  if (nick.length > 12) return `${base.slice(0, 2)}${suffix.slice(-4)}`;
  return nick;
}

/** Reset in-process nickname tracking (parallel test runs). */
export function resetNicknameRegistry() {
  usedNicknames.clear();
}

/** Reserve a nickname; bumps suffix on collision within the same process. */
export function reserveNickname(opts = {}) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const nickname = makeNickname({ ...opts, attempt });
    if (!usedNicknames.has(nickname)) {
      usedNicknames.add(nickname);
      return nickname;
    }
  }
  return makeNickname({ ...opts, attempt: Math.floor(Math.random() * 9999) });
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
    createTestPersona({ index: 0, nickname: reserveNickname({ base: bases[0], index: 0 }) }),
    createTestPersona({ index: 1, nickname: reserveNickname({ base: bases[1], index: 1 }) }),
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
