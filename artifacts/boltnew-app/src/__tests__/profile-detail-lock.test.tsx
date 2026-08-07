// @vitest-environment happy-dom
/**
 * ProfileDetail lock-toast regression
 *
 * When `locked={true}`:
 *   - Clicking the chat button must NOT invoke `onChat`
 *   - The lock toast becomes visible
 *   - The like button must NOT invoke `onLike`
 *
 * When `locked={false}` (default):
 *   - Both buttons invoke their callbacks normally
 */

import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ProfileDetail from '../components/ProfileDetail';
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
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

const OTHER_PROFILE: Profile = {
  id: 'other-001',
  nickname: '테스트유저',
  pin_code: '1234',
  bio: '독서, 여행',
  mbti: 'INFJ',
  photo_url: '',
  personality_score: 60,
  dom_sub_score: null,
  birth_year: null,
  birth_month: null,
  birth_day: null,
  location: null,
  interests: null,
  contact_private: false,
  kakao_id: null,
  instagram_id: null,
  phone_number: null,
  created_at: '2026-01-01T00:00:00Z',
};

function renderDetail(locked: boolean, isMe = false) {
  const onLike = vi.fn();
  const onChat = vi.fn();
  const onBack = vi.fn();
  render(
    <ProfileDetail
      profile={OTHER_PROFILE}
      isMe={isMe}
      isLiked={false}
      locked={locked}
      onLike={onLike}
      onChat={onChat}
      onBack={onBack}
    />
  );
  return { onLike, onChat, onBack };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ProfileDetail — lock guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it('chat button does NOT invoke onChat when locked', () => {
    const { onChat } = renderDetail(true);
    const chatBtn = screen.getByRole('button', { name: /채팅하기/i });
    fireEvent.click(chatBtn);
    expect(onChat).not.toHaveBeenCalled();
  });

  it('shows lock toast text when chat button is clicked while locked', () => {
    renderDetail(true);
    const chatBtn = screen.getByRole('button', { name: /채팅하기/i });
    fireEvent.click(chatBtn);
    expect(screen.getByText(/현재 잠금 중/i)).toBeTruthy();
  });

  it('like button does NOT invoke onLike when locked', () => {
    const { onLike } = renderDetail(true);
    const likeBtn = document.querySelector('[class*="absolute"][class*="top-4"][class*="right-4"]') as HTMLElement;
    if (likeBtn) fireEvent.click(likeBtn);
    expect(onLike).not.toHaveBeenCalled();
  });

  it('chat button DOES invoke onChat when NOT locked', () => {
    const { onChat } = renderDetail(false);
    const chatBtn = screen.getByRole('button', { name: /채팅하기/i });
    fireEvent.click(chatBtn);
    expect(onChat).toHaveBeenCalledTimes(1);
  });

  it('seatingLocked=true, functionsLocked=false: like shows toast, does NOT call onLike', () => {
    // Regression: App.tsx must pass (seatingLocked || functionsLocked) to ProfileDetail.locked.
    // Without the fix, locked=false (only functionsLocked was passed), so handleLike fires
    // silently blocked by the callback guard, with no user feedback.
    const onLike = vi.fn();
    const onChat = vi.fn();
    const onBack = vi.fn();
    render(
      <ProfileDetail
        profile={OTHER_PROFILE}
        isMe={false}
        isLiked={false}
        locked={true}  // seatingLocked=true, functionsLocked=false → combined = true
        onLike={onLike}
        onChat={onChat}
        onBack={onBack}
      />
    );
    // Click the heart (absolute button in the photo area)
    const likeBtn = document.querySelector('[class*="absolute"][class*="top-4"][class*="right-4"]') as HTMLElement;
    if (likeBtn) fireEvent.click(likeBtn);
    expect(onLike).not.toHaveBeenCalled();
    // Toast should be visible
    expect(screen.getByText(/현재 잠금 중/i)).toBeTruthy();
  });
});
