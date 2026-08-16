// @vitest-environment happy-dom
/**
 * Signal mission: cumulative unique outgoing hearts today, not a consecutive session streak.
 * Leave/re-enter (SignalTab remount) must still count hearts sent earlier today.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SignalTab } from '../components/SignalTab';
import {
  countTodayInterestMission,
  isSignalDeckUnlocked,
  seoulDateKey,
  SIGNAL_GUIDE_TITLE,
  SIGNAL_MISSION_GOAL,
} from '../lib/signal-match';

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
  },
}));

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const readSrc = (rel: string) => readFileSync(join(srcRoot, rel), 'utf8');

const now = new Date('2026-08-16T12:00:00+09:00');
const today = seoulDateKey(now);
const todayIso = `${today}T03:00:00.000Z`;

const tabProps = {
  profiles: [],
  currentUserId: 'me',
  userSignals: [],
  sentHeartsPerPerson: new Map(),
  blockedUserIds: new Set<string>(),
  hiddenByIds: new Set<string>(),
  darkMode: false,
  onSendSignal: vi.fn(),
  onPassSignal: vi.fn(),
  onSelect: vi.fn(),
};

describe('signal mission is cumulative unique hearts', () => {
  it('unlocks after 3 unique outgoing hearts today (all types, including green)', () => {
    const n = countTodayInterestMission([
      { liked_id: 'a', heart_type: 'red', created_at: todayIso },
      { liked_id: 'b', heart_type: 'blue', created_at: todayIso },
      { liked_id: 'c', heart_type: 'green', created_at: todayIso },
    ], now);
    expect(n).toBe(SIGNAL_MISSION_GOAL);
    expect(isSignalDeckUnlocked(n)).toBe(true);
  });

  it('still counts prior hearts after remount/re-enter', () => {
    const likes = [
      { liked_id: 'a', heart_type: 'red', created_at: todayIso },
      { liked_id: 'b', heart_type: 'pink', created_at: todayIso },
      { liked_id: 'c', heart_type: 'green', created_at: todayIso },
    ];
    expect(countTodayInterestMission(likes, now)).toBe(3);
    expect(countTodayInterestMission(likes, now)).toBe(3);

    const { unmount } = render(
      React.createElement(SignalTab, { ...tabProps, persistedMissionCount: 2 }),
    );
    expect(screen.getByText('2/3')).toBeTruthy();
    expect(screen.getByText(SIGNAL_GUIDE_TITLE)).toBeTruthy();
    unmount();

    render(React.createElement(SignalTab, { ...tabProps, persistedMissionCount: 3 }));
    expect(screen.getByText('3/3')).toBeTruthy();
    expect(screen.queryByText(SIGNAL_GUIDE_TITLE)).toBeNull();
  });

  it('has no consecutive-only / session-streak mission logic', () => {
    const gapped = countTodayInterestMission([
      { liked_id: 'a', heart_type: 'red', created_at: `${today}T01:00:00.000Z` },
      { liked_id: 'b', heart_type: 'blue', created_at: `${today}T08:00:00.000Z` },
      { liked_id: 'c', heart_type: 'pink', created_at: `${today}T14:00:00.000Z` },
    ], new Date('2026-08-16T23:00:00+09:00'));
    expect(gapped).toBe(3);

    const signalTab = readSrc('components/SignalTab.tsx');
    const hearts = readSrc('hooks/useHearts.ts');
    const match = readSrc('lib/signal-match.ts');
    expect(signalTab).toContain('persistedMissionCount');
    expect(hearts).toContain('outgoingLikeRows');
    expect(hearts).toContain('countTodayInterestMission');
    expect(match).toContain('누적');
    expect(signalTab).not.toMatch(/sessionStreak|consecutiveStreak|streakCount/);
    expect(hearts).not.toMatch(/sessionStreak|consecutiveStreak|streakCount/);
    expect(match).not.toMatch(/sessionStreak|consecutiveStreak|streakCount/);
  });
});
