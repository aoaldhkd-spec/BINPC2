// @vitest-environment happy-dom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignalTab } from '../components/SignalTab';
import type { Profile, UserSignal } from '../types/app';
import { SWIPE_COMMIT_PX, SWIPE_EXIT_MS } from '../lib/signal-swipe';

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
  },
}));

function profile(partial: Partial<Profile> & Pick<Profile, 'id' | 'nickname' | 'personality_score'>): Profile {
  return {
    pin_code: '1111',
    bio: null,
    mbti: 'ENFP',
    photo_url: '',
    dom_sub_score: null,
    birth_year: 1998,
    birth_month: 1,
    birth_day: 1,
    location: null,
    interests: '운동, 카페',
    contact_private: false,
    hide_personality: false,
    kakao_id: null,
    instagram_id: null,
    phone_number: null,
    created_at: '2026-01-01T00:00:00Z',
    ...partial,
  };
}

const ME = profile({ id: 'me', nickname: '나', personality_score: 80, mbti: 'ENFP' });
const A = profile({ id: 'them-a', nickname: '알파', personality_score: 20, mbti: 'INFJ' });
const B = profile({ id: 'them-b', nickname: '베타', personality_score: 15, mbti: 'ISTJ' });

function signal(userId: string): UserSignal {
  return {
    id: `sig-${userId}`,
    user_id: userId,
    status_msg: null,
    ideal_msg: '다정한',
    feature_msg: '다정한',
    created_at: '2026-01-01T00:00:00Z',
  };
}

function renderDeck() {
  const onSendSignal = vi.fn();
  const onPassSignal = vi.fn();
  const onSelect = vi.fn();
  render(
    <SignalTab
      profiles={[ME, A, B]}
      currentUserId={ME.id}
      userSignals={[signal(ME.id), signal(A.id), signal(B.id)]}
      sentHeartsPerPerson={new Map()}
      persistedMissionCount={3}
      alreadySignaledIds={new Set()}
      blockedUserIds={new Set()}
      hiddenByIds={new Set()}
      darkMode={false}
      onSendSignal={onSendSignal}
      onPassSignal={onPassSignal}
      onSelect={onSelect}
    />,
  );
  return { onSendSignal, onPassSignal, onSelect };
}

function swipe(el: HTMLElement, dx: number) {
  fireEvent.pointerDown(el, { pointerId: 1, clientX: 180, clientY: 200, buttons: 1 });
  fireEvent.pointerMove(el, { pointerId: 1, clientX: 180 + dx * 0.4, clientY: 202 });
  fireEvent.pointerMove(el, { pointerId: 1, clientX: 180 + dx, clientY: 202 });
  fireEvent.pointerUp(el, { pointerId: 1, clientX: 180 + dx, clientY: 202 });
}

describe('SignalTab Tinder-like swipe', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('stacks the next card and keeps direction stamps hidden at rest', () => {
    renderDeck();
    expect(screen.getByTestId('signal-swipe-next')).toBeTruthy();
    expect(screen.getByTestId('signal-stamp-pass').style.opacity).toBe('0');
    expect(screen.getByTestId('signal-stamp-signal').style.opacity).toBe('0');
  });

  it('follows the finger and fades the matching stamp before committing', () => {
    renderDeck();
    const front = screen.getByTestId('signal-swipe-front');
    fireEvent.pointerDown(front, { pointerId: 1, clientX: 180, clientY: 200, buttons: 1 });
    fireEvent.pointerMove(front, { pointerId: 1, clientX: 180 + 80, clientY: 202 });
    expect(front.style.transform).toContain('translate3d(80px');
    expect(Number(screen.getByTestId('signal-stamp-signal').style.opacity)).toBeGreaterThan(0.5);
    expect(screen.getByTestId('signal-stamp-pass').style.opacity).toBe('0');
    fireEvent.pointerUp(front, { pointerId: 1, clientX: 260, clientY: 202 });
  });

  it('springs back under the commit threshold without sending or passing', () => {
    const { onSendSignal, onPassSignal } = renderDeck();
    const front = screen.getByTestId('signal-swipe-front');
    swipe(front, 36);
    expect(onSendSignal).not.toHaveBeenCalled();
    expect(onPassSignal).not.toHaveBeenCalled();
    expect(screen.getByTestId('signal-swipe-front')).toBeTruthy();
  });

  it('locks input during the fly-out so a fast second swipe cannot skip two cards', () => {
    vi.useFakeTimers();
    const { onSendSignal, onPassSignal } = renderDeck();
    const front = screen.getByTestId('signal-swipe-front');
    swipe(front, -(SWIPE_COMMIT_PX + 40));
    swipe(front, -(SWIPE_COMMIT_PX + 40));
    expect(onPassSignal).not.toHaveBeenCalled();
    expect(onSendSignal).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(SWIPE_EXIT_MS + 80);
    });
    expect(onPassSignal).toHaveBeenCalledTimes(1);
    expect(onSendSignal).not.toHaveBeenCalled();
  });

  it('unlocks the next card after the fly-out finishes', () => {
    vi.useFakeTimers();
    const { onPassSignal, onSendSignal } = renderDeck();
    swipe(screen.getByTestId('signal-swipe-front'), -(SWIPE_COMMIT_PX + 40));
    act(() => {
      vi.advanceTimersByTime(SWIPE_EXIT_MS + 80);
    });
    expect(onPassSignal).toHaveBeenCalledTimes(1);
    swipe(screen.getByTestId('signal-swipe-front'), -(SWIPE_COMMIT_PX + 40));
    act(() => {
      vi.advanceTimersByTime(SWIPE_EXIT_MS + 80);
    });
    expect(onPassSignal).toHaveBeenCalledTimes(2);
    expect(onSendSignal).not.toHaveBeenCalled();
  });

  it('right swipe sends a signal once after the exit animation', () => {
    vi.useFakeTimers();
    const { onSendSignal, onPassSignal } = renderDeck();
    swipe(screen.getByTestId('signal-swipe-front'), SWIPE_COMMIT_PX + 40);
    expect(onSendSignal).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(SWIPE_EXIT_MS + 80);
    });
    expect(onSendSignal).toHaveBeenCalledTimes(1);
    expect(onPassSignal).not.toHaveBeenCalled();
  });

  it('restores the card when send persist returns false', async () => {
    vi.useFakeTimers();
    const onSendSignal = vi.fn().mockResolvedValue(false);
    const onPassSignal = vi.fn();
    render(
      <SignalTab
        profiles={[ME, A, B]}
        currentUserId={ME.id}
        userSignals={[signal(ME.id), signal(A.id), signal(B.id)]}
        sentHeartsPerPerson={new Map()}
        persistedMissionCount={3}
        alreadySignaledIds={new Set()}
        blockedUserIds={new Set()}
        hiddenByIds={new Set()}
        darkMode={false}
        onSendSignal={onSendSignal}
        onPassSignal={onPassSignal}
        onSelect={vi.fn()}
      />,
    );
    const firstName = screen.getByTestId('signal-swipe-front').textContent;
    swipe(screen.getByTestId('signal-swipe-front'), SWIPE_COMMIT_PX + 40);
    await act(async () => {
      vi.advanceTimersByTime(SWIPE_EXIT_MS + 80);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onSendSignal).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('signal-swipe-front').textContent).toBe(firstName);
  });
});
