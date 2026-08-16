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
export const SIGNAL_EMPTY_INCOMING_TITLE = '아직 받은 하트가 없어요';
export const SIGNAL_EMPTY_INCOMING_HINT = '하트를 받은 사람만 시그널에 나와요';

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

export type FeatureProfile = {
  personality_score?: number | null;
  mbti?: string | null;
  interests?: string | string[] | null;
  bio?: string | null;
};

/** 나의 특징: 포지션·MBTI·관심사·상태 메시지. 상대 이상형 원문은 넣지 않음. */
export function collectFeatureTokens(
  profile: FeatureProfile,
  statusMsg?: string | null,
): string[] {
  const tokens: string[] = [];
  const score = profile.personality_score ?? 50;
  tokens.push(getPositionLabel(score));
  if (score < 0) tokens.push('비선호');
  else if (score <= 49) tokens.push('바텀계열', '바텀');
  else if (score <= 55) tokens.push('올계열', '올');
  else tokens.push('탑계열', '탑');
  if (profile.mbti) tokens.push(profile.mbti);
  tokens.push(...parseProfileInterests(profile));
  if (statusMsg) {
    for (const part of statusMsg.split(/[,，、\n/|]+/)) {
      const t = part.trim();
      if (t) tokens.push(t);
    }
  }
  const out: string[] = [];
  for (const t of tokens) {
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

export function countTagHits(tags: string[], features: string[]): number {
  if (tags.length === 0 || features.length === 0) return 0;
  const featNorm = features.map(normalizeTag);
  const haystack = featNorm.join(' ');
  let hits = 0;
  for (const tag of tags) {
    const n = normalizeTag(tag);
    if (!n) continue;
    const exact = featNorm.some((f) => f === n || f.includes(n) || n.includes(f));
    if (exact || haystack.includes(n)) hits += 1;
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
  const myFeatures = collectFeatureTokens(args.myProfile, args.myStatusMsg);
  const theirFeatures = collectFeatureTokens(args.theirProfile, args.theirStatusMsg);
  const myIdeal = parseIdealTags(args.myIdealMsg);
  const theirIdeal = parseIdealTags(args.theirIdealMsg);
  const myInterests = parseProfileInterests(args.myProfile);
  const theirInterests = parseProfileInterests(args.theirProfile);

  const myIdealHits = countTagHits(myIdeal, theirFeatures);
  const theirIdealHits = countTagHits(theirIdeal, myFeatures);
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

/** 내게 하트를 보낸 사람만. 비어 있으면 전원 추천으로 폴백하지 않는다. */
export function incomingSignalPoolIds(args: {
  myId: string;
  incomingLikerIds: Iterable<string>;
  blockedIds?: Set<string>;
  hiddenIds?: Set<string>;
}): Set<string> {
  const blocked = args.blockedIds ?? new Set<string>();
  const hidden = args.hiddenIds ?? new Set<string>();
  const out = new Set<string>();
  for (const id of args.incomingLikerIds) {
    if (!id || id === args.myId) continue;
    if (blocked.has(id) || hidden.has(id)) continue;
    out.add(id);
  }
  return out;
}

export function recommendSignals(args: {
  myId: string;
  myProfile: FeatureProfile;
  myIdealMsg?: string | null;
  myStatusMsg?: string | null;
  candidates: RecommendCandidate[];
  /** 받은 하트(liker_id) — 이 집합만 추천. 비우면 아무도 추천하지 않음 */
  incomingLikerIds: Set<string>;
  blockedIds?: Set<string>;
  hiddenIds?: Set<string>;
  /** 이미 비-그린 하트를 보낸 사람(맞관심 완료) — 덱에서 제외 */
  alreadyInterestedIds?: Set<string>;
  /** 하트 4종을 모두 보낸 사람 */
  likedAllTypeIds?: Set<string>;
  rng?: () => number;
}): Array<SignalMatch & { profileId: string }> {
  const pool = incomingSignalPoolIds({
    myId: args.myId,
    incomingLikerIds: args.incomingLikerIds,
    blockedIds: args.blockedIds,
    hiddenIds: args.hiddenIds,
  });
  if (pool.size === 0) return [];

  const already = args.alreadyInterestedIds ?? new Set<string>();
  const likedAll = args.likedAllTypeIds ?? new Set<string>();
  const matches: SignalMatch[] = [];

  for (const c of args.candidates) {
    if (!pool.has(c.profile.id)) continue;
    if (already.has(c.profile.id) || likedAll.has(c.profile.id)) continue;
    const m = matchSignalPair({
      myProfile: args.myProfile,
      theirProfile: c.profile,
      myIdealMsg: args.myIdealMsg,
      theirIdealMsg: c.idealMsg,
      myStatusMsg: args.myStatusMsg,
      theirStatusMsg: c.statusMsg,
    });
    // 받은 하트 보낸 사람은 OR 불일치여도 덱에 남긴다 (매칭 0으로 하위 랭크)
    matches.push(m ?? {
      profileId: c.profile.id,
      matchCount: 0,
      myIdealHits: 0,
      theirIdealHits: 0,
      sharedInterestCount: 0,
      reasons: [{ key: 'fit', label: '💕 하트를 보냈어요' }],
    });
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
