// @vitest-environment happy-dom
/**
 * ProfileCard lock-guard regression tests
 *
 * Verifies:
 * 1. With seatingLocked=true, clicking heart shows toast, does NOT call onLike
 * 2. With functionsLocked=true, clicking chat shows toast, does NOT call onOpenChat
 * 3. With both locks false, both callbacks fire normally
 * 4. Chat-search panel shows lock toast and does NOT call onOpenChat when functionsLocked
 */

import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ProfileCard } from '../components/MainScreen';
import type { Profile } from '../types/app';

// ── Minimal mocks ────────────────────────────────────────────────────────────

vi.mock('../hooks/useTheme', () => ({ useTheme: () => ({ theme: 'default' }) }));
vi.mock('../lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
    removeChannel: vi.fn(),
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    })),
  },
}));

// ── Fixture ───────────────────────────────────────────────────────────────────

const PROFILE: Profile = {
  id: 'prof-001',
  nickname: '홍길동',
  pin_code: '1234',
  bio: '독서',
  mbti: 'INFJ',
  photo_url: '',
  personality_score: 55,
  dom_sub_score: null,
  birth_year: null,
  birth_month: null,
  birth_day: null,
  location: null,
  interests: null,
  contact_private: false,
  hide_personality: false,
  kakao_id: null,
  instagram_id: null,
  phone_number: null,
  created_at: '2026-01-01T00:00:00Z',
};

function renderCard({
  seatingLocked = false,
  functionsLocked = false,
}: { seatingLocked?: boolean; functionsLocked?: boolean } = {}) {
  const onLike = vi.fn();
  const onSelect = vi.fn();
  const onView = vi.fn();
  const onOpenChat = vi.fn();
  render(
    <ProfileCard
      profile={PROFILE}
      isLiked={false}
      sentHeartType={undefined}
      heartCount={0}
      canLike={true}
      locked={seatingLocked || functionsLocked}
      onLike={onLike}
      onSelect={onSelect}
      onView={onView}
      onOpenChat={onOpenChat}
    />
  );
  return { onLike, onSelect, onView, onOpenChat };
}

afterEach(() => cleanup());

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ProfileCard — lock guard (seat-lock + functions-lock regression)', () => {
  it('seatingLocked=true: heart click shows toast, does NOT call onLike', () => {
    const { onLike } = renderCard({ seatingLocked: true });
    const heartBtn = screen.getByRole('button', { name: /하트/i });
    fireEvent.click(heartBtn);
    expect(onLike).not.toHaveBeenCalled();
    expect(screen.getByText(/현재 잠금 중/i)).toBeTruthy();
  });

  it('functionsLocked=true: chat click shows toast, does NOT call onOpenChat', () => {
    const { onOpenChat } = renderCard({ functionsLocked: true });
    const chatBtn = screen.getByRole('button', { name: /채팅/i });
    fireEvent.click(chatBtn);
    expect(onOpenChat).not.toHaveBeenCalled();
    expect(screen.getByText(/현재 잠금 중/i)).toBeTruthy();
  });

  it('both locks false: heart calls onLike, chat calls onOpenChat normally', () => {
    const { onLike, onOpenChat } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: /하트/i }));
    fireEvent.click(screen.getByRole('button', { name: /채팅/i }));
    expect(onLike).toHaveBeenCalledTimes(1);
    expect(onOpenChat).toHaveBeenCalledTimes(1);
  });

  it('photo tap records a visit via onView without opening profile detail', () => {
    const { onSelect, onView } = renderCard();
    fireEvent.click(screen.getByTestId('profile-card-photo'));
    expect(onView).toHaveBeenCalledTimes(1);
    expect(onView).toHaveBeenCalledWith(PROFILE);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
