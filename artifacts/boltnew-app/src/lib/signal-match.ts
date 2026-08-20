/**
 * 📡 시그널 — 순수 매칭·미션 헬퍼.
 * UX: 하트(💕/💌/색 하트)는 1:1 관심·채팅解錠. 시그널(📡)은 추천 덱·가벼운 관심 표시.
 * 채팅은 여전히 상호 하트만. 시그널은 받은/보낸 시그널 목록에서 확인.
 * 이상형·특징 원문(ideal_msg / feature_msg 자유 텍스트)은 이유 칩에 절대 넣지 않는다.
 */
export const SIGNAL_EMOJI = '📡';
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
  '❤️ 마음에 드는 사람에게 하트를 직접 보내보세요.',
  '👀 나와 잘 맞는 사람을 시그널 탭에서 추천받을 수 있어요.',
  '💕 서로 다른 3명에게 하트를 보내면 시그널 추천이 열려요.',
] as const;

export const SIGNAL_MISSION_GOAL = 3;
export const SIGNAL_MISSION_TITLE = '오늘의 미션';
export const SIGNAL_MISSION_COPY = '서로 다른 3명에게 하트 보내기';
export const SIGNAL_GUIDE_TITLE = '시그널 설명서';
export const SIGNAL_GUIDE_LEAD = '시그널은 앱이 사람을 추천하는 기능이에요. 서로 다른 3명에게 하트를 보내면 추천이 열려요.';
export const SIGNAL_GUIDE_POINTS = [
  '카드를 왼쪽으로 밀면 패스(별로), 오른쪽으로 밀면 시그널 보내기예요.',
  '시그널은 관심 표시예요. 채팅은 서로 하트를 보내야 열려요.',
  '내 이상형 ↔ 상대 특징, 상대 이상형 ↔ 내 특징, 공통 관심사 — 하나만 같아도 추천돼요.',
  '상대가 적어 둔 이상형·특징 문장은 안 보여요. 몇 개가 맞았는지만 알려줘요.',
] as const;
export const SIGNAL_GUIDE_CTA = '참여자에게 하트 보내기';
export const SIGNAL_CARD_SKIP_CTA = '패스';
export const SIGNAL_CARD_PROFILE_CTA = '프로필 보기';
export const SIGNAL_CARD_HEART_CTA = '하트 보내기';
export const SIGNAL_CARD_SIGNAL_CTA = '시그널 보내기';
export const SIGNAL_SWIPE_LEFT_LABEL = '패스';
export const SIGNAL_SWIPE_RIGHT_LABEL = '시그널';
export const SIGNAL_SWIPE_LEFT_EXPLAIN = '왼쪽 = 패스(별로)';
export const SIGNAL_SWIPE_RIGHT_EXPLAIN = '오른쪽 = 시그널 보내기';
export const SIGNAL_SWIPE_HINT = '← 패스(별로) · 시그널 보내기 →';
export const SIGNAL_EMPTY_DECK_TITLE = '지금 추천할 사람이 없어요';
export const SIGNAL_EMPTY_DECK_HINT = '이상형·특징·관심사가 맞는 사람이 아직 없거나, 이미 다 봤어요';
export const SIGNAL_INBOX_TITLE = '받은 시그널';
export const SIGNAL_INBOX_EMPTY = '아직 받은 시그널이 없습니다.';
export const SIGNAL_INBOX_LINE = '시그널을 보냈습니다';
export const SIGNAL_SENT_TITLE = '보낸 시그널';
export const SIGNAL_SENT_EMPTY = '아직 보낸 시그널이 없습니다.';
export const SIGNAL_SENT_LINE = '시그널을 보냈어요';

export function incomingSignalToast(nickname: string): string {
  return `${SIGNAL_EMOJI} ${nickname}님이 시그널을 보냈어요.`;
}

export function isSignalDeckUnlocked(missionCount: number): boolean {
  return missionCount >= SIGNAL_MISSION_GOAL;
}

/** 이상형·나의 특징 공통 그룹. 포지션/MBTI는 닉네임 설정 필드라 칩에서 제외. */
const CORE_TAG_GROUPS = [
  {
    label: '얼굴상 👀',
    tags: [
      '감자상 🥔',
      '댕댕이상 🐶',
      '여우상 🦊',
      '공룡상 🦖',
      '양아치상 😎',
      '웃상 😄',
      '이목구비 뚜렷 ✨',
      '남자다운 🧔',
      '텀상탑 🔄',
      '탑상텀 🔃',
    ],
  },
  { label: '체형 💪', tags: ['키큰 📏', '슬림', '근육있는 💪', '통통귀여운', '보통체형', '잡식 🍽'] },
  { label: '매력 ✨', tags: ['섹끼있는', '귀여운', '반전매력', '눈웃음', '웃을때예쁜', '보조개', '쇄골이쁜', '🍑이쁨', '🍑좁음', '🍆이쁨', '🍆큼', '스타일좋은', '테토', '에겐'] },
  { label: '재능 ⭐', tags: ['노래잘함', '운동잘함', '요리잘함', '밤일 잘함', '키스잘함', '달아오르게 잘함', '🍌 바나나 잘먹음', '🥛 우유 잘먹음'] },
  { label: '라이프 🏠', tags: ['자가있음', '숙소있음', '자차있음', '돈잘범'] },
  { label: '성격 💫', tags: ['다정한', '시크한', '장난끼있는', '차분한', '유머있는', '솔직한', '리드하는', '챙겨주는', '배려심많은', '긍정적인', '활발한', '수줍은'] },
] as const;

/** MainScreen 이상형 피커. 태그 → 프로필 휴리스틱은 IDEAL_TAG_SPECS. */
export const IDEAL_TAG_GROUPS = [...CORE_TAG_GROUPS] as const;

/** MainScreen 나의 특징 피커. */
export const FEATURE_TAG_GROUPS = [...CORE_TAG_GROUPS] as const;

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
const SING_INTERESTS = ['노래방'] as const;
const COOK_INTERESTS = ['요리'] as const;

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
  ...specsFor('얼굴상 👀', 'status_msg+bio', IDEAL_TAG_GROUPS[0].tags, {
    '감자상 🥔': ['감자상 🥔', '감자상'],
    '댕댕이상 🐶': ['댕댕이상 🐶', '댕댕이상'],
    '여우상 🦊': ['여우상 🦊', '여우상'],
    '공룡상 🦖': ['공룡상 🦖', '공룡상'],
    '양아치상 😎': ['양아치상 😎', '양아치상', '양아치'],
    '웃상 😄': ['웃상 😄', '웃상', '웃는상'],
    '이목구비 뚜렷 ✨': ['이목구비 뚜렷 ✨', '이목구비 뚜렷', '이목구비뚜렷', '이목구비또렷', '이목구비 또렷'],
    '남자다운 🧔': ['남자다운 🧔', '남자다운', '남자다운한', '남자다운사람'],
    '텀상탑 🔄': ['텀상탑 🔄', '텀상탑'],
    '탑상텀 🔃': ['탑상텀 🔃', '탑상텀'],
  }),
  ...specsFor('체형 💪', 'status_msg+bio', ['키큰 📏', '슬림', '통통귀여운', '보통체형', '잡식 🍽'], {
    '키큰 📏': ['키큰 📏', '키큰', '키 큰', '큰키'],
    슬림: ['슬림', '날씬'],
    통통귀여운: ['통통귀여운', '통통'],
    '잡식 🍽': ['잡식 🍽', '잡식'],
  }),
  {
    tag: '근육있는 💪',
    group: '체형 💪',
    field: 'interests+status_msg+bio',
    aliases: [...MUSCLE_INTERESTS, '근육있는 💪', '근육있는', '근육'],
  },
  // 레거시 저장 태그(이모지 없는 얼굴·체형) — 피커는 이모지 표기
  ...specsFor('얼굴상 👀', 'status_msg+bio', [
    '고양이상',
    '감자상',
    '댕댕이상',
    '여우상',
    '공룡상',
    '양아치상',
    '웃상',
    '이목구비 뚜렷',
    '남자다운',
    '텀상탑',
    '탑상텀',
  ]),
  ...specsFor('체형 💪', 'status_msg+bio', ['키큰', '잡식']),
  {
    tag: '근육있는',
    group: '체형 💪',
    field: 'interests+status_msg+bio',
    aliases: [...MUSCLE_INTERESTS, '근육있는', '근육', '근육있는 💪'],
  },
  ...specsFor('매력 ✨', 'status_msg+bio', IDEAL_TAG_GROUPS[2].tags, {
    눈웃음: ['눈웃음', '눈웃는', '눈웃음예쁜'],
    보조개: ['보조개', '보조개있는', '보조개예쁜'],
    쇄골이쁜: ['쇄골이쁜', '쇄골 예쁜', '쇄골'],
    '🍑이쁨': ['🍑이쁨', '엉덩이', '엉덩이이쁨', '엉덩이 예쁨'],
    '🍑좁음': ['🍑좁음', '복숭아좁음', '복숭아 좁음'],
    '🍆이쁨': ['🍆이쁨', '엉덩이', '엉덩이이쁨', '엉덩이 예쁨'],
    '🍆큼': ['🍆큼', '가지큼', '가지 큼'],
    웃을때예쁜: ['웃을때예쁜', '웃을때 예쁜', '웃을때이쁜'],
    테토: ['테토', 'Teto'],
    에겐: ['에겐', 'Egen', 'ENFP vibe'],
  }),
  ...specsFor('재능 ⭐', 'interests+status_msg+bio', ['노래잘함', '운동잘함', '요리잘함'], {
    노래잘함: ['노래잘함', '노래 잘함', '노래잘하는', ...SING_INTERESTS],
    운동잘함: ['운동잘함', '운동 잘함', '운동잘하는', ...MUSCLE_INTERESTS],
    요리잘함: ['요리잘함', '요리 잘함', '요리잘하는', ...COOK_INTERESTS],
  }),
  ...specsFor('재능 ⭐', 'status_msg+bio', ['밤일 잘함', '키스잘함', '달아오르게 잘함', '🍌 바나나 잘먹음', '🥛 우유 잘먹음'], {
    '밤일 잘함': ['밤일 잘함', '밤일잘함', '밤일'],
    키스잘함: ['키스잘함', '키스 잘함', '키스잘하는'],
    '달아오르게 잘함': ['달아오르게 잘함', '달아오르게잘함', '달아오르게'],
    '🍌 바나나 잘먹음': ['🍌 바나나 잘먹음', '🍌바나나 잘먹음', '바나나 잘먹음', '바나나잘먹음', '바나나'],
    '🥛 우유 잘먹음': ['🥛 우유 잘먹음', '🥛우유 잘먹음', '우유 잘먹음', '우유잘먹음', '우유'],
  }),
  // 레거시 저장 태그(이모지 없는 바나나) — 피커는 🍌 표기
  ...specsFor('재능 ⭐', 'status_msg+bio', ['바나나 잘먹음'], {
    '바나나 잘먹음': ['바나나 잘먹음', '바나나잘먹음', '바나나', '🍌 바나나 잘먹음'],
  }),
  ...specsFor('라이프 🏠', 'status_msg+bio', ['자가있음', '숙소있음', '자차있음', '돈잘범'], {
    자가있음: ['자가있음', '자가', '내집', '집있음'],
    숙소있음: ['숙소있음', '숙소', '방있음'],
    자차있음: ['자차있음', '자차', '차있음', '차량있음'],
    돈잘범: ['돈잘범', '돈 잘범', '수입좋음', '잘벎'],
  }),
  ...specsFor('성격 💫', 'status_msg+bio', ['다정한', '시크한', '장난끼있는', '차분한', '유머있는', '솔직한', '리드하는', '챙겨주는', '배려심많은', '긍정적인', '활발한', '수줍은']),
  // 레거시 저장 태그용. 칩 UI에는 포지션/MBTI/라이프 없음(라이프는 관심사).
  ...specsFor('포지션 🎯', 'personality_score', ['바텀', '올', '탑', '비선호']),
  ...specsFor('MBTI 🧠', 'mbti', ['MBTI E', 'MBTI I', 'MBTI N', 'MBTI S', 'MBTI T', 'MBTI F', 'MBTI J', 'MBTI P']),
  { tag: '술좋아', group: '라이프 🍻', field: 'interests+status_msg+bio', aliases: [...DRINK_INTERESTS, '술좋아', '술잘마시는'] },
  ...specsFor('라이프 🍻', 'interests', ['운동', '카페', '집콕', '여행']),
  ...specsFor('술 🍺', 'status_msg+bio', ['안마심', '한두잔', '분위기술', '취하면귀여운', '술조금', '술잘마심', '취하면수다']),
  { tag: '술잘마시는', group: '술 🍺', field: 'interests+status_msg+bio', aliases: [...DRINK_INTERESTS, '술잘마시는', '술좋아', '술잘마심'] },
  // 레거시 칩(피커 제거) — 기존 저장값 매칭용
  ...specsFor('흡연 🚭', 'status_msg+bio', ['비흡연', '흡연OK', '전자담배만', '밖에서만', '흡연', '전자담배']),
  ...specsFor('얼굴상 👀', 'status_msg+bio', ['곰상', '토끼상', '사슴상']),
  ...specsFor('매력 ✨', 'status_msg+bio', ['웃음많은', '분위기있는', '눈매예쁜', '미소가예쁜']),
  ...specsFor('술 🍺', 'status_msg+bio', ['세게마심']),
  ...specsFor('텐션 🎢', 'status_msg+bio', ['텐션맞춤', '텐션낮음', '텐션폭발', '관찰형', '텐션중', '텐션높음', '낯가림', '금방친해짐', '텐션높은']),
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

/** feature_msg 형식은 ideal_msg와 동일: "태그1,태그2\n자유텍스트" */
export const parseFeatureTags = parseIdealTags;

export function encodeSignalMsg(tags: string[], freeText: string): string | null {
  return [tags.join(','), freeText.trim()].filter(Boolean).join('\n') || null;
}

/** feature_msg 태그가 있으면 그걸 쓰고, 비어 있을 때만 프로필 휴리스틱. */
export function resolveFeatureTags(
  featureMsg: string | null | undefined,
  profile: FeatureProfile,
  statusMsg?: string | null,
): string[] {
  const explicit = parseFeatureTags(featureMsg);
  if (explicit.length > 0) return explicit;
  return collectFeatureTokens(profile, statusMsg);
}

function normalizeTag(tag: string): string {
  return tag.replace(/\s+/g, '').toLowerCase();
}

/**
 * 이상형 칩 ↔ 나의 특징 칩 동의어 (양방향).
 * 같은 글자(안마심·비흡연)는 정확 일치로 처리하므로 쌍에 넣지 않음.
 */
export const TAG_SYNONYM_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['한두잔', '술조금'],
  ['술잘마시는', '술잘마심'],
  ['분위기술', '취하면수다'],
  ['취하면귀여운', '취하면수다'],
  ['흡연OK', '흡연'],
  ['전자담배만', '전자담배'],
  ['밖에서만', '흡연'],
  ['🍌 바나나 잘먹음', '바나나 잘먹음'],
  ['감자상 🥔', '감자상'],
  ['댕댕이상 🐶', '댕댕이상'],
  ['여우상 🦊', '여우상'],
  ['공룡상 🦖', '공룡상'],
  ['양아치상 😎', '양아치상'],
  ['웃상 😄', '웃상'],
  ['이목구비 뚜렷 ✨', '이목구비 뚜렷'],
  ['남자다운 🧔', '남자다운'],
  ['텀상탑 🔄', '텀상탑'],
  ['탑상텀 🔃', '탑상텀'],
  ['키큰 📏', '키큰'],
  ['근육있는 💪', '근육있는'],
  ['잡식 🍽', '잡식'],
];

function buildSynonymLookup(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    const na = normalizeTag(a);
    const nb = normalizeTag(b);
    if (!map.has(na)) map.set(na, new Set());
    if (!map.has(nb)) map.set(nb, new Set());
    map.get(na)!.add(nb);
    map.get(nb)!.add(na);
  };
  for (const [a, b] of TAG_SYNONYM_PAIRS) add(a, b);
  return map;
}

const TAG_SYNONYM_LOOKUP = buildSynonymLookup();

export function tagsAreSynonyms(a: string, b: string): boolean {
  const na = normalizeTag(a);
  const nb = normalizeTag(b);
  if (na === nb) return true;
  return TAG_SYNONYM_LOOKUP.get(na)?.has(nb) ?? false;
}

/** 칩↔칩 비교. substring 금지(흡연이 비흡연에 먹히지 않게). */
export function countSynonymTagHits(idealTags: string[], featureTags: string[]): number {
  if (idealTags.length === 0 || featureTags.length === 0) return 0;
  let hits = 0;
  for (const tag of idealTags) {
    if (featureTags.some((f) => tagsAreSynonyms(tag, f))) hits += 1;
  }
  return hits;
}

export function countIdealVsFeatures(
  idealTags: string[],
  args: {
    featureMsg?: string | null;
    profile: FeatureProfile;
    statusMsg?: string | null;
  },
): number {
  if (idealTags.length === 0) return 0;
  const explicit = parseFeatureTags(args.featureMsg);
  if (explicit.length > 0) return countSynonymTagHits(idealTags, explicit);
  return countIdealTagHits(idealTags, args.profile, args.statusMsg);
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

/**
 * 닉네임 설정 포지션(`profiles.personality_score`).
 * 선택값: 비선호(-1), 바텀(15), 올텀(35), 올(50), 올탑(70), 퓨어탑(100).
 * null/undefined는 unknown — 기본 50으로 채우지 않음.
 */
export type PositionSide = 'bottom' | 'top' | 'vers' | 'none' | 'unknown';

export function positionSide(score: number | null | undefined): PositionSide {
  if (score === null || score === undefined || Number.isNaN(Number(score))) return 'unknown';
  if (score < 0) return 'none';
  if (score === 50) return 'vers';
  if (score <= 49) return 'bottom';
  return 'top';
}

/**
 * 시그널 덱 하드 필터: 반대 포지션만.
 * bottom(0–49: 바텀·올텀) ↔ top(51+: 올탑·퓨어탑·탑).
 * 올(50)은 양극(top/bottom)과만 — 올↔올은 같은 쪽이라 제외.
 * 비선호·미설정은 보수적으로 제외.
 */
export function isOppositePosition(
  myScore: number | null | undefined,
  theirScore: number | null | undefined,
): boolean {
  const mine = positionSide(myScore);
  const theirs = positionSide(theirScore);
  if (mine === 'unknown' || theirs === 'unknown') return false;
  if (mine === 'none' || theirs === 'none') return false;
  if (mine === 'vers') return theirs === 'top' || theirs === 'bottom';
  if (theirs === 'vers') return mine === 'top' || mine === 'bottom';
  return (mine === 'top' && theirs === 'bottom') || (mine === 'bottom' && theirs === 'top');
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
    reasons.push({ key: 'fit', label: '✨ 서로 잘 맞는 조건이 있어요' });
  }
  return reasons;
}

export function matchSignalPair(args: {
  myProfile: FeatureProfile;
  theirProfile: FeatureProfile & { id: string };
  myIdealMsg?: string | null;
  theirIdealMsg?: string | null;
  myFeatureMsg?: string | null;
  theirFeatureMsg?: string | null;
  myStatusMsg?: string | null;
  theirStatusMsg?: string | null;
}): SignalMatch | null {
  const myIdeal = parseIdealTags(args.myIdealMsg);
  const theirIdeal = parseIdealTags(args.theirIdealMsg);
  const myInterests = parseProfileInterests(args.myProfile);
  const theirInterests = parseProfileInterests(args.theirProfile);

  const myIdealHits = countIdealVsFeatures(myIdeal, {
    featureMsg: args.theirFeatureMsg,
    profile: args.theirProfile,
    statusMsg: args.theirStatusMsg,
  });
  const theirIdealHits = countIdealVsFeatures(theirIdeal, {
    featureMsg: args.myFeatureMsg,
    profile: args.myProfile,
    statusMsg: args.myStatusMsg,
  });
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
  featureMsg?: string | null;
  statusMsg?: string | null;
};

/** 미션 3/3 이후 추천 풀: 반대 포지션 + OR 매칭. 받은 하트로 제한하지 않음. */
export function recommendSignals(args: {
  myId: string;
  myProfile: FeatureProfile;
  myIdealMsg?: string | null;
  myFeatureMsg?: string | null;
  myStatusMsg?: string | null;
  candidates: RecommendCandidate[];
  blockedIds?: Set<string>;
  hiddenIds?: Set<string>;
  /** 이미 비-그린 하트를 보낸 사람 — 덱에서 제외 */
  alreadyInterestedIds?: Set<string>;
  /** 이미 시그널을 보내거나 패스한 사람 — 덱에서 제외 */
  alreadySignaledIds?: Set<string>;
  /** 하트 4종을 모두 보낸 사람 */
  likedAllTypeIds?: Set<string>;
  rng?: () => number;
}): Array<SignalMatch & { profileId: string }> {
  const blocked = args.blockedIds ?? new Set<string>();
  const hidden = args.hiddenIds ?? new Set<string>();
  const already = args.alreadyInterestedIds ?? new Set<string>();
  const signaled = args.alreadySignaledIds ?? new Set<string>();
  const likedAll = args.likedAllTypeIds ?? new Set<string>();
  const matches: SignalMatch[] = [];

  for (const c of args.candidates) {
    const id = c.profile.id;
    if (!id || id === args.myId) continue;
    if (blocked.has(id) || hidden.has(id)) continue;
    if (already.has(id) || signaled.has(id) || likedAll.has(id)) continue;
    if (!isOppositePosition(args.myProfile.personality_score, c.profile.personality_score)) continue;
    const m = matchSignalPair({
      myProfile: args.myProfile,
      theirProfile: c.profile,
      myIdealMsg: args.myIdealMsg,
      theirIdealMsg: c.idealMsg,
      myFeatureMsg: args.myFeatureMsg,
      theirFeatureMsg: c.featureMsg,
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

/**
 * 오늘(KST) 성공한 하트(전 종류) like의 고유 liked_id 수.
 * 누적(unique outgoing)이지 세션 연속 스트릭이 아니다. 같은 사람 반복은 1.
 * created_at 이 없으면 오늘 보낸 것으로 본다 — 나갔다 재진입 시 카운트 유실 방지.
 */
export function countTodayInterestMission(
  likes: LikeRowForMission[],
  now: Date = new Date(),
): number {
  const today = seoulDateKey(now);
  const unique = new Set<string>();
  for (const row of likes) {
    if (!isAnyHeart(row.heart_type ?? 'red')) continue;
    if (!row.liked_id) continue;
    if (row.created_at) {
      const created = new Date(row.created_at);
      if (Number.isNaN(created.getTime())) continue;
      if (seoulDateKey(created) !== today) continue;
    }
    unique.add(row.liked_id);
  }
  return unique.size;
}

export function isNudgeEligible(heartSendTotal: number, likedUniqueCount: number): boolean {
  return heartSendTotal < 1 || likedUniqueCount < 2;
}

/** 하트 유도 문구는 참여자 탭, 시그널 추천 문구만 시그널 탭. */
export function nudgeDestinationTab(index: number): 'profiles' | 'signal' {
  const len = NUDGE_MESSAGES.length;
  const i = ((index % len) + len) % len;
  return NUDGE_MESSAGES[i].includes('시그널 탭') ? 'signal' : 'profiles';
}

/** 받은 시그널 프로필: SELECT 결과 + 기존 inbox + 로컬 프로필 캐시. 빈 fetch로 지우지 않음. */
export function resolveSignalInboxProfiles<T extends { id: string }>(
  senderIds: string[],
  fetched: readonly T[],
  prev: readonly T[],
  fallback: readonly T[],
): T[] {
  const byId = new Map<string, T>();
  for (const p of fallback) byId.set(p.id, p);
  for (const p of prev) byId.set(p.id, p);
  for (const p of fetched) byId.set(p.id, p);
  const out: T[] = [];
  const seen = new Set<string>();
  for (const id of senderIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const p = byId.get(id);
    if (p) out.push(p);
  }
  return out;
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

export function reasonsLeakPrivateText(
  reasons: SignalReasonChip[],
  ...msgs: Array<string | null | undefined>
): boolean {
  return msgs.some((msg) => reasonsLeakIdealText(reasons, msg));
}
