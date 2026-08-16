import { describe, expect, it } from 'vitest';
import {
  SIGNAL_GUIDE_POINTS,
  SIGNAL_MISSION_GOAL,
  hasInterestHeart,
  isSignalDeckUnlocked,
  matchSignalPair,
  reasonsLeakPrivateText,
  recommendSignals,
} from './signal-match';

describe('signal copy + unlock invariants', () => {
  it('locks the deck before 3 unique hearts and unlocks after', () => {
    expect(isSignalDeckUnlocked(2)).toBe(false);
    expect(isSignalDeckUnlocked(SIGNAL_MISSION_GOAL)).toBe(true);
  });

  it('uses 서로 시그널 CTA, not 서로 하트', () => {
    expect(SIGNAL_GUIDE_POINTS.some((p) => p.includes('서로 시그널을 보내면 채팅을 시작할 수 있어요'))).toBe(true);
    expect(SIGNAL_GUIDE_POINTS.some((p) => p.includes('서로 하트'))).toBe(false);
  });

  it('never puts raw ideal/feature free text on reason chips', () => {
    const secretIdeal = '나만아는비밀이상형XYZ';
    const secretFeat = '나만아는비밀특징XYZ';
    const m = matchSignalPair({
      myProfile: { personality_score: 80, mbti: 'ENFP', interests: '운동' },
      theirProfile: { id: 'them', personality_score: 20, mbti: 'INFJ', interests: '운동' },
      myIdealMsg: `다정한\n${secretIdeal}`,
      theirFeatureMsg: `다정한\n${secretFeat}`,
    });
    expect(m).not.toBeNull();
    expect(reasonsLeakPrivateText(m!.reasons, `다정한\n${secretIdeal}`, `다정한\n${secretFeat}`)).toBe(false);
    expect(m!.reasons.every((r) => !r.label.includes(secretIdeal) && !r.label.includes(secretFeat))).toBe(true);
  });
});

describe('signal pool filters', () => {
  it('includes opposite position and excludes same position', () => {
    const ranked = recommendSignals({
      myId: 'me',
      myProfile: { personality_score: 80, mbti: 'ENFP', interests: '영화' },
      myIdealMsg: '다정한',
      candidates: [
        { profile: { id: 'opp', personality_score: 15, mbti: 'INFJ', interests: '독서' }, featureMsg: '다정한' },
        { profile: { id: 'same', personality_score: 100, mbti: 'INFJ', interests: '독서' }, featureMsg: '다정한' },
      ],
      rng: () => 0,
    });
    expect(ranked.map((r) => r.profileId)).toEqual(['opp']);
  });

  it('does not exclude same-table / same location (rule is not in signal-match)', () => {
    const ranked = recommendSignals({
      myId: 'me',
      myProfile: { personality_score: 80, mbti: 'ENFP', interests: '운동', location: 'A테이블' },
      myIdealMsg: '다정한',
      candidates: [
        {
          profile: { id: 'same-table', personality_score: 15, mbti: 'INFJ', interests: '운동', location: 'A테이블' },
          featureMsg: '다정한',
        },
      ],
      rng: () => 0,
    });
    expect(ranked.map((r) => r.profileId)).toEqual(['same-table']);
  });

  it('green-only sends do not mark someone already-interested', () => {
    expect(hasInterestHeart(new Set(['green']))).toBe(false);
    const ranked = recommendSignals({
      myId: 'me',
      myProfile: { personality_score: 80, mbti: 'ENFP', interests: '운동' },
      myIdealMsg: '다정한',
      candidates: [
        { profile: { id: 'green-only', personality_score: 15, mbti: 'INFJ', interests: '독서' }, featureMsg: '다정한' },
      ],
      alreadyInterestedIds: new Set(),
      rng: () => 0,
    });
    expect(ranked.map((r) => r.profileId)).toEqual(['green-only']);
  });
});
