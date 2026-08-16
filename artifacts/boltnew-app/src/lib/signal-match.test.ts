import { describe, expect, it } from 'vitest';
import {
  buildReasonChips,
  countTodayInterestMission,
  hasInterestHeart,
  isInterestHeart,
  isNudgeEligible,
  matchSignalPair,
  parseIdealTags,
  rankByMatchWeighted,
  reasonsLeakIdealText,
  recommendSignals,
  seoulDateKey,
} from './signal-match';

const me = {
  id: 'me',
  personality_score: 80,
  mbti: 'ENFP',
  interests: '운동, 카페',
  bio: null,
};

const themFit = {
  id: 'them',
  personality_score: 20,
  mbti: 'INFJ',
  interests: '운동, 독서',
  bio: null,
};

describe('isInterestHeart', () => {
  it('treats red/blue/pink as 관심 and green as 칭찬 only', () => {
    expect(isInterestHeart('red')).toBe(true);
    expect(isInterestHeart('blue')).toBe(true);
    expect(isInterestHeart('pink')).toBe(true);
    expect(isInterestHeart('green')).toBe(false);
    expect(hasInterestHeart(new Set(['green']))).toBe(false);
    expect(hasInterestHeart(new Set(['green', 'red']))).toBe(true);
  });
});

describe('parseIdealTags', () => {
  it('reads first-line tags and ignores free-text line', () => {
    expect(parseIdealTags('다정한,키큰\n비밀 이상형 문장')).toEqual(['다정한', '키큰']);
  });
});

describe('OR matching', () => {
  it('recommends when only shared interests match', () => {
    const m = matchSignalPair({
      myProfile: me,
      theirProfile: themFit,
      myIdealMsg: '공룡상,여우상',
      theirIdealMsg: '곰상',
    });
    expect(m).not.toBeNull();
    expect(m!.sharedInterestCount).toBe(1);
    expect(m!.myIdealHits).toBe(0);
    expect(m!.theirIdealHits).toBe(0);
    expect(m!.reasons.some((r) => r.label.includes('공통 관심사 1개'))).toBe(true);
  });

  it('recommends when only my ideal hits their features', () => {
    const m = matchSignalPair({
      myProfile: { ...me, interests: '영화' },
      theirProfile: { ...themFit, interests: '독서', mbti: 'INFJ' },
      myIdealMsg: 'INFJ,바텀',
      theirIdealMsg: null,
    });
    expect(m).not.toBeNull();
    expect(m!.myIdealHits).toBeGreaterThan(0);
    expect(m!.sharedInterestCount).toBe(0);
  });

  it('recommends when only their ideal hits my features', () => {
    const m = matchSignalPair({
      myProfile: { ...me, interests: '영화' },
      theirProfile: { ...themFit, interests: '독서' },
      myIdealMsg: null,
      theirIdealMsg: 'ENFP,탑',
    });
    expect(m).not.toBeNull();
    expect(m!.theirIdealHits).toBeGreaterThan(0);
    expect(m!.sharedInterestCount).toBe(0);
  });

  it('does not require AND of all three axes', () => {
    const onlyInterests = matchSignalPair({
      myProfile: me,
      theirProfile: themFit,
      myIdealMsg: '공룡상',
      theirIdealMsg: '곰상',
    });
    expect(onlyInterests).not.toBeNull();
  });

  it('returns null when nothing matches', () => {
    const m = matchSignalPair({
      myProfile: { ...me, interests: '영화' },
      theirProfile: { ...themFit, interests: '독서', mbti: 'ISTJ', personality_score: 20 },
      myIdealMsg: '공룡상',
      theirIdealMsg: '곰상',
    });
    expect(m).toBeNull();
  });

  it('never puts their private ideal text into reason chips', () => {
    const secret = '나만아는비밀문장XYZ';
    const m = matchSignalPair({
      myProfile: me,
      theirProfile: themFit,
      myIdealMsg: '운동',
      theirIdealMsg: `다정한\n${secret}`,
    });
    expect(m).not.toBeNull();
    expect(reasonsLeakIdealText(m!.reasons, `다정한\n${secret}`)).toBe(false);
    expect(m!.reasons.every((r) => !r.label.includes(secret))).toBe(true);
  });
});

describe('recommendSignals filters', () => {
  it('excludes self, blocked, hidden, already-interested', () => {
    const ranked = recommendSignals({
      myId: 'me',
      myProfile: me,
      myIdealMsg: '운동',
      candidates: [
        { profile: { ...me, id: 'me' }, idealMsg: '운동' },
        { profile: { ...themFit, id: 'blocked' }, idealMsg: null },
        { profile: { ...themFit, id: 'hidden' }, idealMsg: null },
        { profile: { ...themFit, id: 'liked' }, idealMsg: null },
        { profile: { ...themFit, id: 'ok' }, idealMsg: null },
      ],
      blockedIds: new Set(['blocked']),
      hiddenIds: new Set(['hidden']),
      alreadyInterestedIds: new Set(['liked']),
      rng: () => 0,
    });
    expect(ranked.map((r) => r.profileId)).toEqual(['ok']);
  });
});

describe('rankByMatchWeighted', () => {
  it('prefers higher matchCount but can swap adjacent ranks with rng', () => {
    const items = [
      { id: 'a', matchCount: 3 },
      { id: 'b', matchCount: 3 },
      { id: 'c', matchCount: 1 },
    ];
    const seq = [0.9, 0.1, 0.5];
    let i = 0;
    const ranked = rankByMatchWeighted(items, () => seq[i++ % seq.length]);
    expect(ranked[ranked.length - 1].id).toBe('c');
    expect(new Set(ranked.map((x) => x.id))).toEqual(new Set(['a', 'b', 'c']));
  });
});

describe('countTodayInterestMission', () => {
  const today = seoulDateKey(new Date('2026-08-16T12:00:00+09:00'));
  const todayIso = `${today}T03:00:00.000Z`;
  const yesterdayIso = '2026-08-15T03:00:00.000Z';

  it('counts unique people with a successful non-green like today', () => {
    const n = countTodayInterestMission([
      { liked_id: 'a', heart_type: 'red', created_at: todayIso },
      { liked_id: 'a', heart_type: 'blue', created_at: todayIso },
      { liked_id: 'b', heart_type: 'pink', created_at: todayIso },
      { liked_id: 'c', heart_type: 'green', created_at: todayIso },
      { liked_id: 'd', heart_type: 'red', created_at: yesterdayIso },
    ], new Date('2026-08-16T12:00:00+09:00'));
    expect(n).toBe(2);
  });

  it('does not increment for repeat hearts to the same person', () => {
    const n = countTodayInterestMission([
      { liked_id: 'a', heart_type: 'red', created_at: todayIso },
      { liked_id: 'a', heart_type: 'pink', created_at: todayIso },
      { liked_id: 'a', heart_type: 'blue', created_at: todayIso },
    ], new Date('2026-08-16T20:00:00+09:00'));
    expect(n).toBe(1);
  });

  it('ignores green-only rows', () => {
    const n = countTodayInterestMission([
      { liked_id: 'a', heart_type: 'green', created_at: todayIso },
    ], new Date('2026-08-16T12:00:00+09:00'));
    expect(n).toBe(0);
  });
});

describe('nudge eligibility + reason chips', () => {
  it('is eligible when no hearts or fewer than 2 unique likes', () => {
    expect(isNudgeEligible(0, 0)).toBe(true);
    expect(isNudgeEligible(1, 1)).toBe(true);
    expect(isNudgeEligible(3, 2)).toBe(false);
  });

  it('builds safe reason labels', () => {
    const chips = buildReasonChips({
      matchCount: 4,
      myIdealHits: 2,
      theirIdealHits: 0,
      sharedInterestCount: 3,
    });
    expect(chips.map((c) => c.label)).toEqual([
      '🎯 이상형 조건 2개 일치',
      '✨ 공통 관심사 3개',
      '💕 서로 잘 맞는 조건이 있어요',
    ]);
  });
});
