// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Profile } from '../types/app';
import { ProfileDeckGrid } from './ProfileDeckGrid';

vi.mock('./ProfileCard', () => ({
  ProfileCard: ({ profile, onLike }: {
    profile: Profile;
    onLike: (id: string) => void;
  }) => (
    <button
      type="button"
      data-testid={'card-' + profile.id}
      onClick={() => onLike(profile.id)}
    >
      {profile.nickname}
    </button>
  ),
}));

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    disconnect() {}
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function cards(n: number): Profile[] {
  return Array.from({ length: n }, (_, i) => ({
    id: 'fake-' + i, nickname: 'Synthetic Person ' + i,
  }) as unknown as Profile);
}

function mount(amount: number) {
  const onLike = vi.fn();
  const onSelect = vi.fn();
  const onOpenChat = vi.fn();
  const onContactShareOpen = vi.fn();
  render(
    <ProfileDeckGrid
      deckProfiles={cards(amount)}
      profileCardGrid="3"
      profileGridColSpanClass="col-span-3"
      profileSearch=""
      darkMode={false}
      likedIds={new Set()}
      sentHeartTypes={new Map()}
      sentHeartsPerPerson={new Map()}
      currentUserId="synthetic-self"
      functionsLocked={false}
      signalByUserId={new Map()}
      onLike={onLike}
      onSelect={onSelect}
      onOpenChat={onOpenChat}
      onContactShareOpen={onContactShareOpen}
    />,
  );
  return { onLike, onSelect, onOpenChat };
}

describe('original BINPC2 UI stays default; optional carousel is a presentation-only view', () => {
  it('keeps original 3-column grid until participant explicitly opts in', () => {
    const { onLike } = mount(4);
    const grid = screen.getByTestId('participant-grid');
    expect(screen.getByTestId('participant-carousel-switch').className).toContain('min-h-11');
    expect(grid.className).toContain('grid-cols-3');
    expect(grid.querySelectorAll('[data-profile-carousel-card]').length).toBe(0);
    fireEvent.click(screen.getByTestId('card-fake-1'));
    expect(onLike).toHaveBeenCalledWith('fake-1');

    fireEvent.click(screen.getByTestId('participant-carousel-switch'));
    const rail = screen.getByTestId('participant-carousel-track');
    expect(rail.getAttribute('aria-roledescription')).toBe('carousel');
    expect(rail.querySelectorAll('[data-profile-carousel-card]').length).toBe(4);
    expect(screen.getByTestId('participant-carousel-counter').textContent).toContain('1 / 4');
    fireEvent.click(screen.getByTestId('participant-carousel-next'));
    expect(screen.getByTestId('participant-carousel-counter').textContent).toContain('2 / 4');
    fireEvent.click(screen.getByRole('button', { name: '4번째 참가자 카드' }));
    expect(screen.getByTestId('participant-carousel-counter').textContent).toContain('4 / 4');

    fireEvent.click(screen.getByTestId('participant-carousel-switch'));
    expect(screen.getByTestId('participant-grid').className).toContain('grid-cols-3');
    expect(screen.queryByTestId('participant-carousel-track')).toBeNull();
    fireEvent.click(screen.getByTestId('card-fake-2'));
    expect(onLike).toHaveBeenCalledWith('fake-2');
  });

  it('honors keyboard arrows on the carousel container, without intercepting heart buttons', () => {
    mount(3);
    fireEvent.click(screen.getByTestId('participant-carousel-switch'));
    const rail = screen.getByTestId('participant-carousel-track');
    fireEvent.keyDown(rail, { key: 'ArrowRight' });
    expect(screen.getByTestId('participant-carousel-counter').textContent).toContain('2 / 3');
    fireEvent.keyDown(rail, { key: 'ArrowLeft' });
    expect(screen.getByTestId('participant-carousel-counter').textContent).toContain('1 / 3');
    fireEvent.keyDown(screen.getByTestId('card-fake-0'), { key: 'ArrowRight' });
    expect(screen.getByTestId('participant-carousel-counter').textContent).toContain('1 / 3');
  });

  it('does not show slides/dots when empty or when only one attendee exists', () => {
    mount(0);
    expect(screen.queryByTestId('participant-carousel-switch')).toBeNull();
    expect(screen.getByText('아직 다른 참가자가 없습니다.')).toBeTruthy();
    cleanup();
    mount(1);
    expect(screen.queryByTestId('participant-carousel-switch')).toBeNull();
    expect(screen.getByTestId('card-fake-0')).toBeTruthy();
  });

  it('does not render 150 cards at once; loads another batch while browsing', () => {
    mount(150);
    fireEvent.click(screen.getByTestId('participant-carousel-switch'));
    expect(screen.getByTestId('participant-carousel-track').querySelectorAll('[data-profile-carousel-card]').length).toBe(36);
    for (let i = 0; i < 34; i++) fireEvent.click(screen.getByTestId('participant-carousel-next'));
    expect(screen.getByTestId('participant-carousel-counter').textContent).toContain('35 / 150');
    expect(screen.getByTestId('participant-carousel-track').querySelectorAll('[data-profile-carousel-card]').length).toBe(72);
  });
});
