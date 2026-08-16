/**
 * 💕 시그널 — 순수 매칭·미션·넛지 헬퍼.
 * 이상형 원문(ideal_msg 자유 텍스트)은 이유 칩에 절대 넣지 않는다.
 */
import { parseProfileInterests } from './interests';
import { getPositionLabel } from './profile';

export const INTEREST_HEARTS = ['red', 'blue', 'pink'] as const;
export type InterestHeart = (typeof INTEREST_HEARTS)[number];

export const SIGNAL_FIRST_CHIPS = [
  '👋 반가워요! 어디 테이블이에요?',
  '🍻 지금 뭐 드시고 있어요?',
  '😆 관심사가 비슷하네요!',
] as const;

export const NUDGE_MESSAGES = [
  '💕 아직 하트를 보내지 않았어요. 마음에 드는 사람에게 하트를 보내보세요!',
  '👀 나와 잘 맞는 사람이 있어요. 시그널을 확인해보세요.',
  '💕 오늘의 시그널 미션을 확인해보세요. 서로 다른 3명에게 하트를 보내보세요!',
] as const;

export const NUDGE_MAX = 3;
export const SIGNAL_MISSION_GOAL = 3;
export const SIGNAL_MISSION_COPY = '서로 다른 3명에게 하트 보내기';
export const SIGNAL_GUIDE_TITLE = '시그널 설명서';
export const SIGNAL_GUIDE_LEAD = '서로 다른 3명에게 하트를 보내면, 나와 잘 맞는 사람을 한 명씩 추천해 줘요.';
export const SIGNAL_GUIDE_POINTS = [
  '내 이상형 ↔ 상대 특징, 상대 이상형 ↔ 내 특징, 공통 관심사 — 하나만 같아도 추천돼요.',
  '관심/하트 보내기는 참여자 카드에서 쓰던 하트 그대로예요.',
  '서로 시그널을 보내면 채팅을 시작할 수 있어요.',
  '상대가 적어 둔 이상형 문장은 안 보여요. 몇 개가 맞았는지만 알려줘요.',
] as const;
export const SIGNAL_GUIDE_CTA = '참여자에게 하트 보내기';
export const SIGNAL_EMPTY_DECK_TITLE = '지금 추천할 시그널이 없어요';
export const SIGNAL_EMPTY_DECK_HINT = '이상형·특징·관심사가 맞는 사람이 아직 없거나, 이미 다 봤어요';

export function isSignalDeckUnlocked(missionCount: number): boolean {
  return missionCount >= SIGNAL_MISSION_GOAL;
}

/** MainScreen 이상형 피커와 동일. 태그 → 나의 특징 필드 매핑은 IDEAL_TAG_SPECS. */
export const IDEAL_TAG_GROUPS = [
  { label: '얼굴상 👀', tags: ['감자상', '댕댕이상', '고양이상', '곰상', '여우상', '공룡상', '토끼상', '눈웃음'] },
  { label: '체형 💪', tags: ['키큰', '슬림', '근육있는', '통통귀여운', '보통체형'] },
  { label: '매력 ✨', tags: ['섹끼있는', '다정한', '귀여운', '반전매력', '차분한', '웃음많은', '텐션높은', '술잘마시는'] },
  { label: '포지션 🎯', tags: ['바텀', '올', '탑', '비선호'] },
  { label: 'MBTI 🧠', tags: ['MBTI E', 'MBTI I', 'MBTI N', 'MBTI S', 'MBTI T', 'MBTI F', 'MBTI J', 'MBTI P'] },
  { label: '라이프 🍻', tags: ['술좋아', '운동', '카페', '집콕', '여행'] },
] as const;

export type IdealFeatureField =
  | 'status_msg+bio'
  | 'personality_score'
  | 'mbti'
  | 'interests'
  | 'interests+status_msg+bio'
  | 'location';

export type IdealTagSpec = {
  tag: string;
  group: string;
  field: IdealFeatureField;
  aliases: readonly string[];
};

const DRINK_INTERESTS = ['술자리', '와인', '위스키', '클럽/바', '맥주축제'] as const;
const MUSCLE_INTERESTS = ['헬스', '운동', '클라이밍'] as const;

function specsFor(
  group: string,
  field: IdealFeatureField,
  tags: readonly string[],
  extraAliases: Record<string, readonly string[]> = {},
): IdealTagSpec[] {
  return tags.map((tag) => ({
    tag,
    group,
    field,
    aliases: extraAliases[tag] ?? [tag],
  }));
}

/** 피커 태그 전수 → 실제 나의 특징 필드. 얼굴/체형 일부는 키·얼굴 컬럼이 없어 status/bio만. */
export const IDEAL_TAG_SPECS: readonly IdealTagSpec[] = [
  ...specsFor('얼굴상 👀', 'status_msg+bio', IDEAL_TAG_GROUPS[0].tags),
  ...specsFor('체형 💪', 'status_msg+bio', ['키큰', '슬림', '통통귀여운', '보통체형'], {
    키큰: ['키큰', '키 큰', '큰키'],
    슬림: ['슬림', '날씬'],
    통통귀여운: ['통통귀여운', '통통'],
  }),
  { tag: '근육있는', group: '체형 💪', field: 'interests+status_msg+bio', aliases: [...MUSCLE_INTERESTS, '근육있는', '근육'] },
  ...specsFor('매력 ✨', 'status_msg+bio', ['섹끼있는', '다정한', '귀여운', '반전매력', '차분한', '웃음많은', '텐션높은']),
  { tag: '술잘마시는', group: '매력 ✨', field: 'interests+status_msg+bio', aliases: [...DRINK_INTERESTS, '술잘마시는', '술좋아'] },
  ...specsFor('포지션 🎯', 'personality_score', IDEAL_TAG_GROUPS[3].tags),
  ...specsFor('MBTI 🧠', 'mbti', IDEAL_TAG_GROUPS[4].tags),
  { tag: '술좋아', group: '라이프 🍻', field: 'interests+status_msg+bio', aliases: [...DRINK_INTERESTS, '술좋아', '술잘마시는'] },
  ...specsFor('라이프 🍻', 'interests', ['운동', '카페', '집콕', '여행']),
];

const IDEAL_TAG_SPEC_BY_NORM = new Map<string, IdealTagSpec>();
for (const spec of IDEAL_TAG_SPECS) {
  IDEAL_TAG_SPEC_BY_NORM.set(normalizeTag(spec.tag), spec);
}

export function getIdealTagSpec(tag: string): IdealTagSpec | undefined {
  return IDEAL_TAG_SPEC_BY_NORM.get(normalizeTag(tag));
}

export function isInterestHeart(type: string | null | undefined): boolean {
  return type === 'red' || type === 'blue' || type === 'pink';
}

/** 성공한 하트 전송(빨강/파랑/분홍/초록). 시그널 미션·받은 하트 풀에 사용. */
export function isAnyHeart(type: string | null | undefined): boolean {
  return type === 'red' || type === 'blue' || type === 'pink' || type === 'green';
}

export function hasInterestHeart(types: Iterable<string> | undefined | null): boolean {
  if (!types) return false;
  for (const t of types) {
    if (isInterestHeart(t)) return true;
  }
  return false;
}

export function nudgeStorageKey(userId: string): string {
  return `signal_nudge_${userId}`;
}

export function missionToastKey(userId: string, dateKey: string): string {
  return `signal_mission_done_${userId}_${dateKey}`;
}

export function seoulDateKey(d: Date = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

export function parseIdealTags(idealMsg: string | null | undefined): string[] {
  if (!idealMsg) return [];
  const firstLine = idealMsg.split('\n')[0] ?? '';
  const out: string[] = [];
  for (const part of firstLine.split(/[,，、]+/)) {
    const t = part.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

function normalizeTag(tag: string): string {
  return tag.replace(/\s+/g, '').toLowerCase();
}

const MBTI_LETTER_RE = /^mbti[einjstfp]$/;
const BARE_MBTI_LETTER_RE = /^[einjstfp]$/;
const FULL_MBTI_RE = /^[einjstfp]{4}$/;

export type FeatureProfile = {
  personality_score?: number | null;
  mbti?: string | null;
  interests?: string | string[] | null;
  bio?: string | null;
  location?: string | null;
};

export function positionFamilies(score: number | null | undefined): string[] {
  const s = score ?? 50;
  const out: string[] = [];
  if (s < 0) out.push('비선호');
  if (s >= 0 && s <= 49) out.push('바텀');
  if (s >= 25 && s <= 64) out.push('올');
  if (s >= 51) out.push('탑');
  return out;
}

function mbtiLetters(mbti: string | null | undefined): string[] {
  if (!mbti) return [];
  const compact = mbti.replace(/[^A-Za-z]/g, '').toUpperCase();
  if (compact.length !== 4) return [];
  return [...compact];
}

function splitFreeText(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(/[,，、\n/|]+/)) {
    const t = part.trim();
    if (t) out.push(t);
  }
  return out;
}

export type FeatureBag = {
  tokens: string[];
  positionFamilies: Set<string>;
  mbtiFull: string;
  mbtiLetters: Set<string>;
  interests: Set<string>;
  interestsNorm: Set<string>;
  textNorm: string;
};

/** 나의 특징 가방: 포지션·MBTI·관심사·상태·지역·bio. 상대 이상형 원문은 넣지 않음. */
export function buildFeatureBag(
  profile: FeatureProfile,
  statusMsg?: string | null,
): FeatureBag {
  const score = profile.personality_score ?? 50;
  const families = positionFamilies(score);
  const letters = mbtiLetters(profile.mbti);
  const interests = parseProfileInterests(profile);
  const textParts = [
    ...splitFreeText(statusMsg),
    ...splitFreeText(profile.bio),
    ...splitFreeText(profile.location),
  ];
  const tokens: string[] = [getPositionLabel(score), ...families];
  if (score < 0) tokens.push('비선호');
  else if (score <= 49) tokens.push('바텀계열', '바텀');
  else if (score <= 55) tokens.push('올계열', '올');
  else tokens.push('탑계열', '탑');
  if (profile.mbti) {
    tokens.push(profile.mbti);
    for (const letter of letters) {
      tokens.push(letter, `MBTI ${letter}`, `MBTI${letter}`);
    }
  }
  tokens.push(...interests);
  tokens.push(...textParts);
  const uniq: string[] = [];
  for (const t of tokens) {
    if (t && !uniq.includes(t)) uniq.push(t);
  }
  return {
    tokens: uniq,
    positionFamilies: new Set(families),
    mbtiFull: (profile.mbti ?? '').replace(/[^A-Za-z]/g, '').toUpperCase(),
    mbtiLetters: new Set(letters),
    interests: new Set(interests),
    interestsNorm: new Set(interests.map(normalizeTag)),
    textNorm: textParts.map(normalizeTag).join(' '),
  };
}

/** 나의 특징: 포지션·MBTI·관심사·상태 메시지·지역. 상대 이상형 원문은 넣지 않음. */
export function collectFeatureTokens(
  profile: FeatureProfile,
  statusMsg?: string | null,
): string[] {
  return buildFeatureBag(profile, statusMsg).tokens;
}

function aliasHitsInterest(alias: string, bag: FeatureBag): boolean {
  return bag.interests.has(alias) || bag.interestsNorm.has(normalizeTag(alias));
}

function aliasHitsText(alias: string, bag: FeatureBag): boolean {
  const n = normalizeTag(alias);
  return !!n && bag.textNorm.includes(n);
}

function mbtiTagLetter(tag: string): string | null {
  const n = normalizeTag(tag);
  if (MBTI_LETTER_RE.test(n)) return n.slice(-1).toUpperCase();
  if (BARE_MBTI_LETTER_RE.test(n)) return n.toUpperCase();
  return null;
}

export function idealTagMatchesBag(tag: string, bag: FeatureBag): boolean {
  const spec = getIdealTagSpec(tag);
  if (spec) {
    if (spec.field === 'personality_score') {
      return bag.positionFamilies.has(spec.tag);
    }
    if (spec.field === 'mbti') {
      const letter = mbtiTagLetter(spec.tag);
      return !!letter && bag.mbtiLetters.has(letter);
    }
    if (spec.field === 'interests') {
      return spec.aliases.some((a) => aliasHitsInterest(a, bag));
    }
    if (spec.field === 'interests+status_msg+bio') {
      return spec.aliases.some((a) => aliasHitsInterest(a, bag) || aliasHitsText(a, bag));
    }
    if (spec.field === 'location') {
      return spec.aliases.some((a) => aliasHitsText(a, bag));
    }
    return spec.aliases.some((a) => aliasHitsText(a, bag));
  }
  return fallbackTagHits(tag, bag);
}

function fallbackTagHits(tag: string, bag: FeatureBag): boolean {
  const n = normalizeTag(tag);
  if (!n || n.length < 2) return false;
  const letter = mbtiTagLetter(tag);
  if (letter) return bag.mbtiLetters.has(letter);
  if (FULL_MBTI_RE.test(n)) return bag.mbtiFull === n.toUpperCase();
  if (bag.positionFamilies.has(tag) || bag.positionFamilies.has(n)) return true;
  if (aliasHitsInterest(tag, bag)) return true;
  if (bag.textNorm.includes(n)) return true;
  const featNorm = bag.tokens.map(normalizeTag);
  return featNorm.some((f) => f === n || (n.length >= 2 && f.includes(n)) || (f.length >= 2 && n.includes(f)));
}

export function countIdealTagHits(
  tags: string[],
  profile: FeatureProfile,
  statusMsg?: string | null,
): number {
  if (tags.length === 0) return 0;
  const bag = buildFeatureBag(profile, statusMsg);
  let hits = 0;
  for (const tag of tags) {
    if (idealTagMatchesBag(tag, bag)) hits += 1;
  }
  return hits;
}

/** 레거시: 평탄 토큰 비교. 신규 매칭은 countIdealTagHits 사용. */
export function countTagHits(tags: string[], features: string[]): number {
  if (tags.length === 0 || features.length === 0) return 0;
  const bag: FeatureBag = {
    tokens: features,
    positionFamilies: new Set(features.filter((f) => ['비선호', '바텀', '올', '탑'].includes(f))),
    mbtiFull: features.find((f) => FULL_MBTI_RE.test(normalizeTag(f)))?.toUpperCase() ?? '',
    mbtiLetters: new Set(
      features.flatMap((f) => {
        const n = normalizeTag(f);
        if (MBTI_LETTER_RE.test(n) || BARE_MBTI_LETTER_RE.test(n)) return [n.slice(-1).toUpperCase()];
        if (FULL_MBTI_RE.test(n)) return [...n.toUpperCase()];
        return [];
      }),
    ),
    interests: new Set(features),
    interestsNorm: new Set(features.map(normalizeTag)),
    textNorm: features.map(normalizeTag).join(' '),
  };
  let hits = 0;
  for (const tag of tags) {
    if (idealTagMatchesBag(tag, bag)) hits += 1;
  }
  return hits;
}

export type SignalReasonChip = {
  key: 'ideal' | 'interests' | 'fit';
  label: string;
};

export type SignalMatch = {
  profileId: string;
  matchCount: number;
  myIdealHits: number;
  theirIdealHits: number;
  sharedInterestCount: number;
  reasons: SignalReasonChip[];
};

export function buildReasonChips(match: Omit<SignalMatch, 'reasons' | 'profileId'>): SignalReasonChip[] {
  const reasons: SignalReasonChip[] = [];
  const idealTotal = match.myIdealHits + match.theirIdealHits;
  if (idealTotal > 0) {
    reasons.push({ key: 'ideal', label: `🎯 이상형 조건 ${idealTotal}개 일치` });
  }
  if (match.sharedInterestCount > 0) {
    reasons.push({ key: 'interests', label: `✨ 공통 관심사 ${match.sharedInterestCount}개` });
  }
  if (
    (match.myIdealHits > 0 && match.theirIdealHits > 0)
    || (idealTotal > 0 && match.sharedInterestCount > 0)
  ) {
    reasons.push({ key: 'fit', label: '💕 서로 잘 맞는 조건이 있어요' });
  }
  return reasons;
}

export function matchSignalPair(args: {
  myProfile: FeatureProfile;
  theirProfile: FeatureProfile & { id: string };
  myIdealMsg?: string | null;
  theirIdealMsg?: string | null;
  myStatusMsg?: string | null;
  theirStatusMsg?: string | null;
}): SignalMatch | null {
  const myIdeal = parseIdealTags(args.myIdealMsg);
  const theirIdeal = parseIdealTags(args.theirIdealMsg);
  const myInterests = parseProfileInterests(args.myProfile);
  const theirInterests = parseProfileInterests(args.theirProfile);

  const myIdealHits = countIdealTagHits(myIdeal, args.theirProfile, args.theirStatusMsg);
  const theirIdealHits = countIdealTagHits(theirIdeal, args.myProfile, args.myStatusMsg);
  const sharedInterestCount = myInterests.filter((t) => theirInterests.includes(t)).length;

  // OR: 어느 한 축만 맞아도 추천
  if (myIdealHits === 0 && theirIdealHits === 0 && sharedInterestCount === 0) return null;

  const matchCount = myIdealHits + theirIdealHits + sharedInterestCount;
  const base = { matchCount, myIdealHits, theirIdealHits, sharedInterestCount };
  return {
    profileId: args.theirProfile.id,
    ...base,
    reasons: buildReasonChips(base),
  };
}

export type RecommendCandidate = {
  profile: FeatureProfile & { id: string };
  idealMsg?: string | null;
  statusMsg?: string | null;
};

/** 미션 3/3 이후 추천 풀: 전원 중 OR 매칭. 받은 하트로 제한하지 않음. */
export function recommendSignals(args: {
  myId: string;
  myProfile: FeatureProfile;
  myIdealMsg?: string | null;
  myStatusMsg?: string | null;
  candidates: RecommendCandidate[];
  blockedIds?: Set<string>;
  hiddenIds?: Set<string>;
  /** 이미 비-그린 하트를 보낸 사람 — 덱에서 제외 */
  alreadyInterestedIds?: Set<string>;
  /** 하트 4종을 모두 보낸 사람 */
  likedAllTypeIds?: Set<string>;
  rng?: () => number;
}): Array<SignalMatch & { profileId: string }> {
  const blocked = args.blockedIds ?? new Set<string>();
  const hidden = args.hiddenIds ?? new Set<string>();
  const already = args.alreadyInterestedIds ?? new Set<string>();
  const likedAll = args.likedAllTypeIds ?? new Set<string>();
  const matches: SignalMatch[] = [];

  for (const c of args.candidates) {
    const id = c.profile.id;
    if (!id || id === args.myId) continue;
    if (blocked.has(id) || hidden.has(id)) continue;
    if (already.has(id) || likedAll.has(id)) continue;
    const m = matchSignalPair({
      myProfile: args.myProfile,
      theirProfile: c.profile,
      myIdealMsg: args.myIdealMsg,
      theirIdealMsg: c.idealMsg,
      myStatusMsg: args.myStatusMsg,
      theirStatusMsg: c.statusMsg,
    });
    if (m) matches.push(m);
  }

  return rankByMatchWeighted(matches, args.rng ?? Math.random);
}

/** 매칭 수 우선 + 살짝 셔플해서 같은 사람이 항상 1등이 되지 않게 */
export function rankByMatchWeighted<T extends { matchCount: number }>(
  items: T[],
  rng: () => number = Math.random,
): T[] {
  return [...items].sort((a, b) => {
    const sa = a.matchCount + rng() * 0.75;
    const sb = b.matchCount + rng() * 0.75;
    return sb - sa;
  });
}

export type LikeRowForMission = {
  liked_id: string;
  heart_type?: string | null;
  created_at?: string | null;
};

/** 오늘(KST) 성공한 하트(전 종류) like의 고유 liked_id 수. 같은 사람 반복은 1. */
export function countTodayInterestMission(
  likes: LikeRowForMission[],
  now: Date = new Date(),
): number {
  const today = seoulDateKey(now);
  const unique = new Set<string>();
  for (const row of likes) {
    if (!isAnyHeart(row.heart_type ?? 'red')) continue;
    if (!row.liked_id) continue;
    if (!row.created_at) continue;
    const created = new Date(row.created_at);
    if (Number.isNaN(created.getTime())) continue;
    if (seoulDateKey(created) !== today) continue;
    unique.add(row.liked_id);
  }
  return unique.size;
}

export function isNudgeEligible(heartSendTotal: number, likedUniqueCount: number): boolean {
  return heartSendTotal < 1 || likedUniqueCount < 2;
}

export function readNudgeCount(userId: string, getItem: (k: string) => string | null = (k) => {
  try { return localStorage.getItem(k); } catch { return null; }
}): number {
  const raw = getItem(nudgeStorageKey(userId));
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function writeNudgeCount(
  userId: string,
  count: number,
  setItem: (k: string, v: string) => void = (k, v) => {
    try { localStorage.setItem(k, v); } catch { /* quota */ }
  },
): void {
  setItem(nudgeStorageKey(userId), String(Math.min(NUDGE_MAX, Math.max(0, count))));
}

export function reasonsLeakIdealText(reasons: SignalReasonChip[], idealMsg: string | null | undefined): boolean {
  if (!idealMsg) return false;
  const privateBits = idealMsg
    .split('\n')
    .flatMap((line) => line.split(/[,，、]+/))
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
  const blob = reasons.map((r) => r.label).join(' ');
  return privateBits.some((bit) => blob.includes(bit));
}
