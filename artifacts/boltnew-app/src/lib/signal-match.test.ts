import { describe, expect, it } from 'vitest';
import {
  FEATURE_TAG_GROUPS,
  IDEAL_TAG_GROUPS,
  SIGNAL_GUIDE_TITLE,
  SIGNAL_MISSION_COPY,
  SIGNAL_MISSION_GOAL,
  buildReasonChips,
  countTodayInterestMission,
  encodeSignalMsg,
  getIdealTagSpec,
  hasInterestHeart,
  isAnyHeart,
  isInterestHeart,
  isNudgeEligible,
  isOppositePosition,
  isSignalDeckUnlocked,
  matchSignalPair,
  nudgeDestinationTab,
  parseFeatureTags,
  parseIdealTags,
  positionSide,
  rankByMatchWeighted,
  reasonsLeakIdealText,
  reasonsLeakPrivateText,
  recommendSignals,
  resolveFeatureTags,
  resolveSignalInboxProfiles,
  seoulDateKey,
  tagsAreSynonyms,
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

describe('feature_msg matching', () => {
  it('encodes and parses the same chip + free-text format as ideal_msg', () => {
    expect(encodeSignalMsg(['다정한', '키큰'], '말 걸기 쉬운 편')).toBe('다정한,키큰\n말 걸기 쉬운 편');
    expect(parseFeatureTags('다정한,키큰\n비밀 특징 문장')).toEqual(['다정한', '키큰']);
  });

  it('matches my ideal tags against their feature_msg tags', () => {
    const m = matchSignalPair({
      myProfile: { ...me, interests: '영화' },
      theirProfile: { ...themFit, interests: '독서', mbti: 'ISTJ', personality_score: 80 },
      myIdealMsg: '다정한,키큰',
      theirFeatureMsg: '다정한,웃음많은\n남에게 안 보여줄 특징문장XYZ',
    });
    expect(m).not.toBeNull();
    expect(m!.myIdealHits).toBe(1);
    expect(m!.theirIdealHits).toBe(0);
    expect(m!.reasons.every((r) => !r.label.includes('남에게 안 보여줄 특징문장XYZ'))).toBe(true);
    expect(reasonsLeakPrivateText(m!.reasons, '다정한,키큰', '다정한,웃음많은\n남에게 안 보여줄 특징문장XYZ')).toBe(false);
  });

  it('matches their ideal tags against my feature_msg tags', () => {
    const m = matchSignalPair({
      myProfile: { ...me, personality_score: 20, interests: '영화' },
      theirProfile: { ...themFit, interests: '독서' },
      theirIdealMsg: '탑,MBTI E',
      myFeatureMsg: '탑,차분한',
    });
    expect(m).not.toBeNull();
    expect(m!.theirIdealHits).toBe(1);
    expect(m!.myIdealHits).toBe(0);
  });

  it('uses feature_msg tags instead of profile heuristic when set', () => {
    const withFeatures = matchSignalPair({
      myProfile: { personality_score: 50, mbti: 'ISTJ', interests: '영화' },
      theirProfile: { id: 't', personality_score: 20, mbti: 'ENFP', interests: '운동' },
      myIdealMsg: 'MBTI E',
      theirFeatureMsg: '곰상',
    });
    expect(withFeatures).toBeNull();

    const fallback = matchSignalPair({
      myProfile: { personality_score: 50, mbti: 'ISTJ', interests: '영화' },
      theirProfile: { id: 't', personality_score: 20, mbti: 'ENFP', interests: '독서' },
      myIdealMsg: 'MBTI E',
      theirFeatureMsg: null,
    });
    expect(fallback?.myIdealHits).toBeGreaterThan(0);
  });

  it('falls back to personality/MBTI/interests/status only when feature_msg is empty', () => {
    expect(resolveFeatureTags(null, { personality_score: 80, mbti: 'ENFP', interests: '카페' })).toEqual(
      expect.arrayContaining(['탑', 'ENFP', '카페']),
    );
    expect(resolveFeatureTags('곰상,다정한', { personality_score: 80, mbti: 'ENFP', interests: '카페' })).toEqual([
      '곰상',
      '다정한',
    ]);
  });

  it('still recommends on shared interests when feature tags miss', () => {
    const m = matchSignalPair({
      myProfile: me,
      theirProfile: themFit,
      myIdealMsg: '공룡상',
      theirIdealMsg: '곰상',
      myFeatureMsg: '여우상',
      theirFeatureMsg: '토끼상',
    });
    expect(m).not.toBeNull();
    expect(m!.sharedInterestCount).toBe(1);
    expect(m!.myIdealHits).toBe(0);
    expect(m!.theirIdealHits).toBe(0);
  });

  it('never puts feature_msg raw text on reason chips', () => {
    const secret = '나만아는특징문장XYZ';
    const m = matchSignalPair({
      myProfile: me,
      theirProfile: themFit,
      myIdealMsg: '운동',
      theirFeatureMsg: `다정한\n${secret}`,
    });
    expect(m).not.toBeNull();
    expect(reasonsLeakIdealText(m!.reasons, `다정한\n${secret}`)).toBe(false);
    expect(m!.reasons.every((r) => !r.label.includes(secret))).toBe(true);
  });

  it('recommendSignals uses featureMsg on candidates', () => {
    const ranked = recommendSignals({
      myId: 'me',
      myProfile: { ...me, interests: '영화' },
      myIdealMsg: '다정한',
      myFeatureMsg: '탑',
      candidates: [
        {
          profile: { ...themFit, id: 'ok', interests: '독서', mbti: 'ISTJ', personality_score: 20 },
          featureMsg: '다정한,키큰',
        },
        {
          profile: { ...themFit, id: 'miss', interests: '독서', mbti: 'ENFP' },
          featureMsg: '곰상',
        },
      ],
      rng: () => 0,
    });
    expect(ranked.map((r) => r.profileId)).toEqual(['ok']);
    expect(ranked[0].myIdealHits).toBe(1);
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

  it('unlocks at cumulative unique 3, not a consecutive session streak', () => {
    const now = new Date('2026-08-16T20:00:00+09:00');
    const afterLeave = countTodayInterestMission([
      { liked_id: 'a', heart_type: 'red', created_at: `${today}T01:00:00.000Z` },
      { liked_id: 'b', heart_type: 'blue', created_at: `${today}T04:00:00.000Z` },
      { liked_id: 'c', heart_type: 'pink', created_at: `${today}T10:00:00.000Z` },
    ], now);
    expect(isSignalDeckUnlocked(afterLeave)).toBe(true);
    expect(afterLeave).toBe(3);
  });

  it('still counts prior hearts after remount/re-enter (same likes recomputed)', () => {
    const likes = [
      { liked_id: 'a', heart_type: 'red', created_at: todayIso },
      { liked_id: 'b', heart_type: 'green', created_at: todayIso },
      { liked_id: 'c', heart_type: 'pink', created_at: todayIso },
    ];
    const now = new Date('2026-08-16T12:00:00+09:00');
    expect(countTodayInterestMission(likes, now)).toBe(3);
    expect(countTodayInterestMission(likes, now)).toBe(3);
  });

  it('counts rows missing created_at so leave/re-enter does not drop them', () => {
    const n = countTodayInterestMission([
      { liked_id: 'a', heart_type: 'red' },
      { liked_id: 'b', heart_type: 'blue', created_at: todayIso },
      { liked_id: 'c', heart_type: 'green' },
    ], new Date('2026-08-16T12:00:00+09:00'));
    expect(n).toBe(3);
  });
});

describe('nudge eligibility + reason chips', () => {
  it('is eligible when no hearts or fewer than 2 unique likes', () => {
    expect(isNudgeEligible(0, 0)).toBe(true);
    expect(isNudgeEligible(1, 1)).toBe(true);
    expect(isNudgeEligible(3, 2)).toBe(false);
  });

  it('opens profiles for heart copy and signal tab only for the signal-tab nudge', () => {
    expect(nudgeDestinationTab(0)).toBe('profiles');
    expect(nudgeDestinationTab(1)).toBe('signal');
    expect(nudgeDestinationTab(2)).toBe('profiles');
  });

  it('keeps inbox senders when profile fetch is partial', () => {
    const prev = [{ id: 'a', nickname: 'A' }, { id: 'b', nickname: 'B' }];
    const fetched = [{ id: 'a', nickname: 'A2' }];
    const out = resolveSignalInboxProfiles(['a', 'b', 'c'], fetched, prev, [{ id: 'c', nickname: 'C' }]);
    expect(out.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(out[0].nickname).toBe('A2');
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
      '✨ 서로 잘 맞는 조건이 있어요',
    ]);
  });
});

describe('이상형 / 나의 특징 chip groups', () => {
  const pickerLabels = [...IDEAL_TAG_GROUPS, ...FEATURE_TAG_GROUPS].map((g) => g.label);
  const pickerTags = [...IDEAL_TAG_GROUPS, ...FEATURE_TAG_GROUPS].flatMap((g) => [...g.tags]);

  it('keeps core groups only (no 텐션·술·흡연 picker)', () => {
    for (const label of ['얼굴상 👀', '체형 💪', '매력 ✨', '특기 ⭐', '성격 💫']) {
      expect(IDEAL_TAG_GROUPS.some((g) => g.label === label), label).toBe(true);
      expect(FEATURE_TAG_GROUPS.some((g) => g.label === label), label).toBe(true);
    }
    expect(pickerLabels).not.toContain('텐션 🎢');
    expect(pickerLabels).not.toContain('술 🍺');
    expect(pickerLabels).not.toContain('흡연 🚭');
    for (const tag of ['안마심', '한두잔', '술조금', '술잘마심', '분위기술', '취하면수다']) {
      expect(pickerTags).not.toContain(tag);
    }
    for (const tag of ['비흡연', '흡연OK', '전자담배만', '밖에서만', '흡연', '전자담배']) {
      expect(pickerTags).not.toContain(tag);
    }
    expect(getIdealTagSpec('비흡연')?.group).toBe('흡연 🚭');
  });

  it('does not duplicate tags within each picker', () => {
    for (const groups of [IDEAL_TAG_GROUPS, FEATURE_TAG_GROUPS]) {
      const seen = new Set<string>();
      for (const tag of groups.flatMap((g) => [...g.tags])) {
        expect(seen.has(tag), `duplicate chip: ${tag}`).toBe(false);
        seen.add(tag);
      }
    }
  });

  it('does not offer 라이프 chips (those belong in 관심사)', () => {
    expect(pickerLabels).not.toContain('라이프 🍻');
    for (const tag of ['술좋아', '운동', '카페', '집콕', '여행']) {
      expect(pickerTags).not.toContain(tag);
    }
    expect(getIdealTagSpec('술좋아')?.group).toBe('라이프 🍻');
    expect(getIdealTagSpec('여행')?.group).toBe('라이프 🍻');
  });

  it('removes 포지션 and MBTI chips from both pickers', () => {
    expect(pickerLabels.some((l) => l.includes('포지션'))).toBe(false);
    expect(pickerLabels.some((l) => l.includes('MBTI'))).toBe(false);
    expect(pickerTags).not.toContain('바텀');
    expect(pickerTags).not.toContain('올');
    expect(pickerTags).not.toContain('탑');
    expect(pickerTags).not.toContain('비선호');
    expect(pickerTags).not.toContain('MBTI E');
  });

  it('does not add 말투 / 테이블 / 페이스', () => {
    expect(pickerLabels.some((l) => /말투|테이블|페이스/.test(l))).toBe(false);
    expect(pickerTags).not.toContain('말투');
    expect(pickerTags).not.toContain('테이블');
    expect(pickerTags).not.toContain('페이스');
  });

  it('uses the same 성격 chips on both pickers', () => {
    const ideal = IDEAL_TAG_GROUPS.find((g) => g.label === '성격 💫')!.tags;
    const feature = FEATURE_TAG_GROUPS.find((g) => g.label === '성격 💫')!.tags;
    expect([...ideal]).toEqual(['다정한', '시크한', '장난끼있는', '차분한', '유머있는', '솔직한', '리드하는', '챙겨주는', '배려심많은', '긍정적인', '활발한', '수줍은']);
    expect([...feature]).toEqual([...ideal]);
  });
});

describe('drink/smoke synonyms', () => {
  it('matches 성격 chips by exact string both ways', () => {
    const m = matchSignalPair({
      myProfile: { ...me, interests: '영화' },
      theirProfile: { ...themFit, interests: '독서' },
      myIdealMsg: '시크한,솔직한',
      theirFeatureMsg: '시크한,리드하는',
      theirIdealMsg: '챙겨주는',
      myFeatureMsg: '챙겨주는,유머있는',
    });
    expect(m).not.toBeNull();
    expect(m!.myIdealHits).toBe(1);
    expect(m!.theirIdealHits).toBe(1);
    expect(reasonsLeakPrivateText(m!.reasons, '시크한,솔직한', '시크한,리드하는')).toBe(false);
  });

  it('does not match unrelated 성격 chips', () => {
    const m = matchSignalPair({
      myProfile: { ...me, interests: '영화' },
      theirProfile: { ...themFit, interests: '독서' },
      myIdealMsg: '시크한',
      theirFeatureMsg: '장난끼있는',
    });
    expect(m).toBeNull();
  });

  it('matches conservative synonym pairs and rejects over-matches', () => {
    const pairs: Array<[string, string]> = [
      ['안마심', '안마심'],
      ['한두잔', '술조금'],
      ['술잘마시는', '술잘마심'],
      ['분위기술', '취하면수다'],
      ['취하면귀여운', '취하면수다'],
      ['비흡연', '비흡연'],
      ['흡연OK', '흡연'],
      ['전자담배만', '전자담배'],
      ['밖에서만', '흡연'],
    ];
    for (const [ideal, feature] of pairs) {
      expect(tagsAreSynonyms(ideal, feature), `${ideal}↔${feature}`).toBe(true);
      const m = matchSignalPair({
        myProfile: { ...me, interests: '영화' },
        theirProfile: { ...themFit, interests: '독서' },
        myIdealMsg: ideal,
        theirFeatureMsg: feature,
      });
      expect(m?.myIdealHits, `${ideal}→${feature}`).toBe(1);
    }

    const misses: Array<[string, string]> = [
      ['술잘마시는', '술조금'],
      ['안마심', '술잘마심'],
      ['흡연OK', '비흡연'],
      ['비흡연', '흡연'],
      ['전자담배만', '흡연'],
    ];
    for (const [ideal, feature] of misses) {
      expect(tagsAreSynonyms(ideal, feature), `${ideal}≁${feature}`).toBe(false);
      const m = matchSignalPair({
        myProfile: { ...me, interests: '영화' },
        theirProfile: { ...themFit, interests: '독서' },
        myIdealMsg: ideal,
        theirFeatureMsg: feature,
      });
      expect(m, `${ideal} should not hit ${feature}`).toBeNull();
    }
  });
});

describe('opposite position filter', () => {
  it('classifies nickname-setup scores', () => {
    expect(positionSide(-1)).toBe('none');
    expect(positionSide(15)).toBe('bottom');
    expect(positionSide(35)).toBe('bottom');
    expect(positionSide(50)).toBe('vers');
    expect(positionSide(70)).toBe('top');
    expect(positionSide(100)).toBe('top');
    expect(positionSide(null)).toBe('unknown');
    expect(positionSide(undefined)).toBe('unknown');
  });

  it('treats 바텀/올텀 ↔ 올탑/퓨어탑 as opposite, same side as not', () => {
    expect(isOppositePosition(15, 100)).toBe(true);
    expect(isOppositePosition(35, 70)).toBe(true);
    expect(isOppositePosition(100, 15)).toBe(true);
    expect(isOppositePosition(15, 35)).toBe(false);
    expect(isOppositePosition(70, 100)).toBe(false);
    expect(isOppositePosition(80, 80)).toBe(false);
  });

  it('lets 올 match only the poles, not another 올', () => {
    expect(isOppositePosition(50, 15)).toBe(true);
    expect(isOppositePosition(50, 100)).toBe(true);
    expect(isOppositePosition(50, 50)).toBe(false);
  });

  it('excludes 비선호 and missing scores', () => {
    expect(isOppositePosition(-1, 15)).toBe(false);
    expect(isOppositePosition(15, -1)).toBe(false);
    expect(isOppositePosition(null, 15)).toBe(false);
    expect(isOppositePosition(80, undefined)).toBe(false);
  });

  it('recommendSignals includes opposite and drops same / missing', () => {
    const ranked = recommendSignals({
      myId: 'me',
      myProfile: { ...me, personality_score: 80, interests: '영화' },
      myIdealMsg: '다정한',
      candidates: [
        { profile: { ...themFit, id: 'opp', personality_score: 15, interests: '독서' }, featureMsg: '다정한' },
        { profile: { ...themFit, id: 'same', personality_score: 100, interests: '독서' }, featureMsg: '다정한' },
        { profile: { ...themFit, id: 'vers-ok', personality_score: 50, interests: '독서' }, featureMsg: '다정한' },
        { profile: { ...themFit, id: 'none', personality_score: -1, interests: '독서' }, featureMsg: '다정한' },
        { profile: { ...themFit, id: 'missing', personality_score: null, interests: '독서' }, featureMsg: '다정한' },
      ],
      rng: () => 0,
    });
    expect(new Set(ranked.map((r) => r.profileId))).toEqual(new Set(['opp', 'vers-ok']));
  });
});
