import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  SIGNAL_CARD_SIGNAL_CTA,
  SIGNAL_CARD_PROFILE_CTA,
  SIGNAL_GUIDE_LEAD,
  SIGNAL_GUIDE_POINTS,
  SIGNAL_MISSION_COPY,
  SIGNAL_MISSION_GOAL,
  SIGNAL_SENT_TITLE,
  SIGNAL_SWIPE_LEFT_EXPLAIN,
  SIGNAL_SWIPE_RIGHT_EXPLAIN,
  hasInterestHeart,
  isSignalDeckUnlocked,
  matchSignalPair,
  reasonsLeakPrivateText,
  recommendSignals,
} from './signal-match';

const signalTabSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../components/SignalTab.tsx'),
  'utf8',
);

describe('signal copy + unlock invariants', () => {
  it('locks the deck before 3 unique hearts and unlocks after', () => {
    expect(isSignalDeckUnlocked(2)).toBe(false);
    expect(isSignalDeckUnlocked(SIGNAL_MISSION_GOAL)).toBe(true);
  });

  it('treats signal send as a swipe action and keeps chat on mutual hearts', () => {
    const guide = [SIGNAL_GUIDE_LEAD, ...SIGNAL_GUIDE_POINTS, SIGNAL_MISSION_COPY].join(' ');
    expect(guide).toContain('추천');
    expect(guide).toContain('하트');
    expect(guide).toContain('채팅은 서로 하트를 보내야 열려요');
    expect(guide).toContain('시그널 보내기');
    expect(guide).toMatch(/왼쪽.*패스/);
    expect(guide).toMatch(/오른쪽.*시그널/);
    expect(SIGNAL_CARD_SIGNAL_CTA).toBe('시그널 보내기');
    expect(SIGNAL_CARD_PROFILE_CTA).toBe('프로필 보기');
    expect(SIGNAL_SWIPE_LEFT_EXPLAIN).toBe('왼쪽 = 패스(별로)');
    expect(SIGNAL_SWIPE_RIGHT_EXPLAIN).toBe('오른쪽 = 시그널 보내기');
    expect(signalTabSrc).toContain('SIGNAL_CARD_SIGNAL_CTA');
    expect(signalTabSrc).toContain('onSendSignal');
    expect(signalTabSrc).not.toContain('onLike');
    expect(signalTabSrc).toContain('persistedMissionCount');
    expect(signalTabSrc).toContain('swipeLockRef');
    expect(signalTabSrc).toContain('shouldCommitSwipe');
    expect(signalTabSrc).toContain('signal-swipe-next');
    expect(signalTabSrc).not.toMatch(/sessionStreak|consecutiveStreak/);
  });

  it('App loadSignalActions merges by id and does not wipe inbox on SELECT error', () => {
    const appSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../App.tsx'),
      'utf8',
    );
    const mainSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../components/MainScreen.tsx'),
      'utf8',
    );
    expect(appSrc).toContain('mergeSetAfterSnapshot');
    expect(appSrc).toContain('resolveSignalInboxProfiles');
    expect(appSrc).toContain('outgoingRes.error');
    expect(appSrc).toContain('incomingRes.error');
    expect(appSrc).toContain('loadSignalActionsRef');
    expect(appSrc).toContain('sentSignalReceivers');
    expect(appSrc).not.toContain('SignalNudgeBanner');
    expect(mainSrc).toContain(SIGNAL_SENT_TITLE);
    expect(appSrc).not.toMatch(/if \(senderIds\.length === 0\) \{\s*setReceivedSignalSenders\(\[\]\)/);
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

  it('excludes already sent or passed signal targets from the deck', () => {
    const ranked = recommendSignals({
      myId: 'me',
      myProfile: { personality_score: 80, mbti: 'ENFP', interests: '운동' },
      myIdealMsg: '다정한',
      candidates: [
        { profile: { id: 'fresh', personality_score: 15, mbti: 'INFJ', interests: '독서' }, featureMsg: '다정한' },
        { profile: { id: 'passed', personality_score: 15, mbti: 'INFJ', interests: '독서' }, featureMsg: '다정한' },
      ],
      alreadySignaledIds: new Set(['passed']),
      rng: () => 0,
    });
    expect(ranked.map((r) => r.profileId)).toEqual(['fresh']);
  });
});
