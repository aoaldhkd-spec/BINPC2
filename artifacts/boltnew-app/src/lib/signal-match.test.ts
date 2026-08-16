import { describe, expect, it } from 'vitest';
import {
  IDEAL_TAG_GROUPS,
  SIGNAL_GUIDE_TITLE,
  SIGNAL_MISSION_COPY,
  SIGNAL_MISSION_GOAL,
  buildReasonChips,
  countTodayInterestMission,
  getIdealTagSpec,
  hasInterestHeart,
  isAnyHeart,
  isInterestHeart,
  isNudgeEligible,
  isSignalDeckUnlocked,
  matchSignalPair,
  parseIdealTags,
  rankByMatchWeighted,
  reasonsLeakIdealText,
  recommendSignals,
  seoulDateKey,
  type FeatureProfile,
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

  it('counts every heart type as a real send for the mission', () => {
    expect(isAnyHeart('red')).toBe(true);
    expect(isAnyHeart('blue')).toBe(true);
    expect(isAnyHeart('pink')).toBe(true);
    expect(isAnyHeart('green')).toBe(true);
    expect(isAnyHeart('unknown')).toBe(false);
    expect(SIGNAL_MISSION_COPY).toBe('서로 다른 3명에게 하트 보내기');
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

  it('recommends OR matches who did not send a heart', () => {
    const ranked = recommendSignals({
      myId: 'me',
      myProfile: me,
      myIdealMsg: '운동',
      candidates: [
        { profile: { ...themFit, id: 'stranger' }, idealMsg: null },
      ],
      rng: () => 0,
    });
    expect(ranked.map((r) => r.profileId)).toEqual(['stranger']);
  });

  it('does not include unmatched people just because they sent a heart', () => {
    const noMatch = {
      id: 'incoming-nomatch',
      personality_score: 20,
      mbti: 'ISTJ',
      interests: '독서',
      bio: null,
    };
    const ranked = recommendSignals({
      myId: 'me',
      myProfile: { ...me, interests: '영화' },
      myIdealMsg: '공룡상',
      candidates: [{ profile: noMatch, idealMsg: '곰상' }],
      rng: () => 0,
    });
    expect(ranked).toEqual([]);
  });

  it('skips already-hearted people, keeps OR match otherwise', () => {
    const mutual = recommendSignals({
      myId: 'me',
      myProfile: me,
      myIdealMsg: '운동',
      candidates: [{ profile: { ...themFit, id: 'them' }, idealMsg: null }],
      alreadyInterestedIds: new Set(['them']),
      rng: () => 0,
    });
    expect(mutual).toEqual([]);

    const stillNeedReply = recommendSignals({
      myId: 'me',
      myProfile: me,
      myIdealMsg: '운동',
      candidates: [{ profile: { ...themFit, id: 'them' }, idealMsg: null }],
      alreadyInterestedIds: new Set(),
      rng: () => 0,
    });
    expect(stillNeedReply.map((r) => r.profileId)).toEqual(['them']);
  });
});

describe('mission unlock vs guide', () => {
  it('locks the swipe deck until 3 unique heart sends', () => {
    expect(isSignalDeckUnlocked(0)).toBe(false);
    expect(isSignalDeckUnlocked(2)).toBe(false);
    expect(isSignalDeckUnlocked(SIGNAL_MISSION_GOAL)).toBe(true);
    expect(isSignalDeckUnlocked(4)).toBe(true);
    expect(SIGNAL_GUIDE_TITLE).toBe('시그널 설명서');
  });
});

const MBTI_BY_LETTER: Record<string, string> = {
  E: 'ENFP', I: 'INFJ', N: 'ENFP', S: 'ISTJ', T: 'ISTJ', F: 'ENFP', J: 'INFJ', P: 'ENFP',
};

function syntheticForTag(tag: string): { profile: FeatureProfile & { id: string }; statusMsg?: string } {
  const spec = getIdealTagSpec(tag);
  const base = { id: 'them', personality_score: 50, mbti: 'ISTJ', interests: '독서', bio: null as string | null };
  if (!spec) return { profile: { ...base, bio: tag }, statusMsg: tag };
  if (spec.field === 'personality_score') {
    const score = tag === '비선호' ? -1 : tag === '바텀' ? 20 : tag === '탑' ? 80 : 50;
    return { profile: { ...base, personality_score: score } };
  }
  if (spec.field === 'mbti') {
    const letter = tag.replace(/MBTI\s*/i, '').trim();
    return { profile: { ...base, mbti: MBTI_BY_LETTER[letter] ?? 'ENFP' } };
  }
  if (spec.field === 'interests' || spec.field === 'interests+status_msg+bio') {
    return { profile: { ...base, interests: spec.aliases[0] } };
  }
  return { profile: { ...base, bio: spec.aliases[0] }, statusMsg: spec.aliases[0] };
}

describe('ideal tag → 나의 특징 map', () => {
  it('maps every picker tag to a feature field', () => {
    for (const group of IDEAL_TAG_GROUPS) {
      for (const tag of group.tags) {
        const spec = getIdealTagSpec(tag);
        expect(spec, tag).toBeTruthy();
        expect(spec!.field).toBeTruthy();
      }
    }
  });

  it('hits a synthetic profile for every major group tag', () => {
    for (const group of IDEAL_TAG_GROUPS) {
      for (const tag of group.tags) {
        const { profile, statusMsg } = syntheticForTag(tag);
        const m = matchSignalPair({
          myProfile: { personality_score: 50, mbti: 'ISTJ', interests: '영화' },
          theirProfile: profile,
          myIdealMsg: tag,
          theirIdealMsg: null,
          theirStatusMsg: statusMsg,
        });
        expect(m, `${group.label} ${tag}`).not.toBeNull();
        expect(m!.myIdealHits, `${group.label} ${tag}`).toBeGreaterThan(0);
      }
    }
  });

  it('얼굴상 곰상 matches status/bio, not unrelated interests', () => {
    const hit = matchSignalPair({
      myProfile: { personality_score: 50, mbti: 'ISTJ', interests: '영화' },
      theirProfile: { id: 't', personality_score: 50, mbti: 'ISTJ', interests: '독서', bio: '곰상' },
      myIdealMsg: '곰상',
    });
    const miss = matchSignalPair({
      myProfile: { personality_score: 50, mbti: 'ISTJ', interests: '영화' },
      theirProfile: { id: 't', personality_score: 50, mbti: 'ISTJ', interests: '독서' },
      myIdealMsg: '곰상',
    });
    expect(hit?.myIdealHits).toBeGreaterThan(0);
    expect(miss).toBeNull();
  });

  it('키큰 matches bio/status, not interests-only', () => {
    const hit = matchSignalPair({
      myProfile: { personality_score: 50, mbti: 'ISTJ', interests: '영화' },
      theirProfile: { id: 't', personality_score: 50, mbti: 'ISTJ', interests: '독서', bio: '키 큰 편' },
      myIdealMsg: '키큰',
    });
    const miss = matchSignalPair({
      myProfile: { personality_score: 50, mbti: 'ISTJ', interests: '영화' },
      theirProfile: { id: 't', personality_score: 50, mbti: 'ISTJ', interests: '독서' },
      myIdealMsg: '키큰',
    });
    expect(hit?.myIdealHits).toBeGreaterThan(0);
    expect(miss).toBeNull();
  });

  it('술잘마시는 / 술좋아 hit drinking interests', () => {
    const drinker = { id: 't', personality_score: 50, mbti: 'ISTJ', interests: '술자리, 와인' };
    const dry = { id: 't', personality_score: 50, mbti: 'ISTJ', interests: '독서' };
    expect(matchSignalPair({
      myProfile: { personality_score: 50, mbti: 'ISTJ', interests: '영화' },
      theirProfile: drinker,
      myIdealMsg: '술잘마시는',
    })?.myIdealHits).toBeGreaterThan(0);
    expect(matchSignalPair({
      myProfile: { personality_score: 50, mbti: 'ISTJ', interests: '영화' },
      theirProfile: drinker,
      myIdealMsg: '술좋아',
    })?.myIdealHits).toBeGreaterThan(0);
    expect(matchSignalPair({
      myProfile: { personality_score: 50, mbti: 'ISTJ', interests: '영화' },
      theirProfile: dry,
      myIdealMsg: '술좋아',
    })).toBeNull();
  });

  it('MBTI E hits ENFP and does not hit INFJ or 운동', () => {
    const e = matchSignalPair({
      myProfile: { personality_score: 50, mbti: 'ISTJ', interests: '영화' },
      theirProfile: { id: 't', personality_score: 50, mbti: 'ENFP', interests: '독서' },
      myIdealMsg: 'MBTI E',
    });
    const i = matchSignalPair({
      myProfile: { personality_score: 50, mbti: 'ISTJ', interests: '영화' },
      theirProfile: { id: 't', personality_score: 50, mbti: 'INFJ', interests: '독서' },
      myIdealMsg: 'MBTI E',
    });
    const sport = matchSignalPair({
      myProfile: { personality_score: 50, mbti: 'ISTJ', interests: '영화' },
      theirProfile: { id: 't', personality_score: 50, mbti: 'ISTJ', interests: '운동' },
      myIdealMsg: 'MBTI E',
    });
    expect(e?.myIdealHits).toBeGreaterThan(0);
    expect(i).toBeNull();
    expect(sport).toBeNull();
  });

  it('포지션 바텀 hits score 20 and not score 80', () => {
    const bottom = matchSignalPair({
      myProfile: { personality_score: 80, mbti: 'ENFP', interests: '영화' },
      theirProfile: { id: 't', personality_score: 20, mbti: 'ISTJ', interests: '독서' },
      myIdealMsg: '바텀',
    });
    const top = matchSignalPair({
      myProfile: { personality_score: 80, mbti: 'ENFP', interests: '영화' },
      theirProfile: { id: 't', personality_score: 80, mbti: 'ISTJ', interests: '독서' },
      myIdealMsg: '바텀',
    });
    expect(bottom?.myIdealHits).toBeGreaterThan(0);
    expect(top).toBeNull();
  });

  it('근육있는 hits 헬스 interest', () => {
    const m = matchSignalPair({
      myProfile: { personality_score: 50, mbti: 'ISTJ', interests: '영화' },
      theirProfile: { id: 't', personality_score: 50, mbti: 'ISTJ', interests: '헬스' },
      myIdealMsg: '근육있는',
    });
    expect(m?.myIdealHits).toBeGreaterThan(0);
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

  it('counts unique people with any successful heart today including green', () => {
    const n = countTodayInterestMission([
      { liked_id: 'a', heart_type: 'red', created_at: todayIso },
      { liked_id: 'a', heart_type: 'blue', created_at: todayIso },
      { liked_id: 'b', heart_type: 'pink', created_at: todayIso },
      { liked_id: 'c', heart_type: 'green', created_at: todayIso },
      { liked_id: 'd', heart_type: 'red', created_at: yesterdayIso },
    ], new Date('2026-08-16T12:00:00+09:00'));
    expect(n).toBe(3);
  });

  it('does not increment for repeat hearts to the same person', () => {
    const n = countTodayInterestMission([
      { liked_id: 'a', heart_type: 'red', created_at: todayIso },
      { liked_id: 'a', heart_type: 'pink', created_at: todayIso },
      { liked_id: 'a', heart_type: 'blue', created_at: todayIso },
      { liked_id: 'a', heart_type: 'green', created_at: todayIso },
    ], new Date('2026-08-16T20:00:00+09:00'));
    expect(n).toBe(1);
  });

  it('counts green-only rows as a heart send', () => {
    const n = countTodayInterestMission([
      { liked_id: 'a', heart_type: 'green', created_at: todayIso },
    ], new Date('2026-08-16T12:00:00+09:00'));
    expect(n).toBe(1);
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
