// @vitest-environment happy-dom
/**
 * ProfileCard lock-guard + flip UX regression tests
 *
 * Verifies:
 * 1. With seatingLocked=true, clicking heart shows toast, does NOT call onLike
 * 2. With functionsLocked=true, clicking chat shows toast, does NOT call onOpenChat
 * 3. With both locks false, both callbacks fire normally
 * 4. Flip: ticker + nick/age bars stay visible; only middle flips; frame does not grow
 * 5. Ideal header sits below ticker via paddingTop inset (compact / default)
 */

import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ProfileCard } from '../components/ProfileCard';
import type { Profile } from '../types/app';

// ── Minimal mocks ────────────────────────────────────────────────────────────

vi.mock('../lib/theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/theme')>();
  return {
    ...actual,
    useTheme: () => ({ theme: 'default' as const, setTheme: () => {} }),
  };
});
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
  birth_year: 2000,
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
  compact = false,
  statusMsg,
  idealMsg,
  withMenu = false,
}: {
  seatingLocked?: boolean;
  functionsLocked?: boolean;
  compact?: boolean;
  statusMsg?: string;
  idealMsg?: string;
  withMenu?: boolean;
} = {}) {
  const onLike = vi.fn();
  const onSelect = vi.fn();
  const onView = vi.fn();
  const onOpenChat = vi.fn();
  const onBlock = vi.fn();
  const onContactShare = vi.fn();
  const onViewFortune = vi.fn();
  render(
    <ProfileCard
      profile={PROFILE}
      compact={compact}
      isLiked={false}
      sentHeartType={undefined}
      heartCount={0}
      canLike={true}
      locked={seatingLocked || functionsLocked}
      statusMsg={statusMsg}
      idealMsg={idealMsg}
      onLike={onLike}
      onSelect={onSelect}
      onView={onView}
      onOpenChat={onOpenChat}
      onBlock={withMenu ? onBlock : undefined}
      onContactShare={withMenu ? onContactShare : undefined}
      onViewFortune={withMenu ? onViewFortune : undefined}
    />
  );
  return { onLike, onSelect, onView, onOpenChat, onBlock, onContactShare, onViewFortune };
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

  it('⋯ menu opens on touch via pointerup and runs block action', () => {
    const { onBlock } = renderCard({ withMenu: true });
    const menuBtn = screen.getByTestId('profile-card-menu-btn');
    fireEvent.pointerUp(menuBtn, { pointerType: 'touch' });
    const menu = screen.getByTestId('profile-card-menu');
    expect(menu).toBeTruthy();
    expect(menu.parentElement).toBe(document.body);
    fireEvent.pointerUp(screen.getByRole('menuitem', { name: /차단하기/i }), { pointerType: 'touch' });
    expect(onBlock).toHaveBeenCalledWith(PROFILE.id, 'block');
  });

  it('compact (3-col) grid: menu portals to body with fixed coords near trigger', () => {
    renderCard({ withMenu: true, compact: true, statusMsg: '상태' });
    const menuBtn = screen.getByTestId('profile-card-menu-btn');
    const btnRect = menuBtn.getBoundingClientRect();
    fireEvent.pointerUp(menuBtn, { pointerType: 'touch' });
    const menu = screen.getByTestId('profile-card-menu');
    expect(menu.parentElement).toBe(document.body);
    const top = Number.parseFloat(menu.style.top);
    expect(top).toBeGreaterThanOrEqual(btnRect.bottom);
    expect(top).toBeLessThan(btnRect.bottom + 40);
  });

  it('functionsLocked=true: contact share menu shows toast, does NOT call onContactShare', () => {
    const { onContactShare } = renderCard({ withMenu: true, functionsLocked: true });
    fireEvent.pointerUp(screen.getByTestId('profile-card-menu-btn'), { pointerType: 'touch' });
    fireEvent.pointerUp(screen.getByRole('menuitem', { name: /연락처 보내기/i }), { pointerType: 'touch' });
    expect(onContactShare).not.toHaveBeenCalled();
    expect(screen.getByText(/현재 잠금 중/i)).toBeTruthy();
  });

  it('functionsLocked=true: fortune menu shows toast, does NOT call onViewFortune', () => {
    const { onViewFortune } = renderCard({ withMenu: true, functionsLocked: true });
    fireEvent.pointerUp(screen.getByTestId('profile-card-menu-btn'), { pointerType: 'touch' });
    fireEvent.pointerUp(screen.getByRole('menuitem', { name: /궁합 보기/i }), { pointerType: 'touch' });
    expect(onViewFortune).not.toHaveBeenCalled();
    expect(screen.getByText(/현재 잠금 중/i)).toBeTruthy();
  });

  it('functionsLocked=true: block/hide menu still runs (privacy not locked)', () => {
    const { onBlock } = renderCard({ withMenu: true, functionsLocked: true });
    fireEvent.pointerUp(screen.getByTestId('profile-card-menu-btn'), { pointerType: 'touch' });
    fireEvent.pointerUp(screen.getByRole('menuitem', { name: /나를 못 보게 하기/i }), { pointerType: 'touch' });
    expect(onBlock).toHaveBeenCalledWith(PROFILE.id, 'hide');
  });
});

describe('ProfileCard — flip keeps bars + fixed frame (compact/2·3열)', () => {
  it('compact: ticker + nick stay visible on ideal back; second tap returns', () => {
    const { onView, onSelect } = renderCard({
      compact: true,
      statusMsg: '오늘도 화이팅',
      idealMsg: '유머,다정\n기타',
    });

    fireEvent.click(screen.getByTestId('profile-card-photo'));
    expect(onView).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('profile-card-photo-frame')).toBeTruthy();
    expect(screen.getByTestId('profile-card-ticker-bar')).toBeTruthy();
    expect(screen.getByTestId('profile-card-nick-bar')).toBeTruthy();
    expect(screen.getByText('홍길동')).toBeTruthy();
    expect(screen.getByText(/나의 이상형/)).toBeTruthy();

    fireEvent.click(screen.getByTestId('profile-card-ideal-back'));
    expect(screen.getByText('홍길동')).toBeTruthy();
    fireEvent.click(screen.getByText('홍길동'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('default grid: bars stay on flip; photo frame remains mounted', () => {
    const { onView } = renderCard({
      statusMsg: '상태 메시지',
      idealMsg: '유머',
    });

    fireEvent.click(screen.getByTestId('profile-card-photo'));
    expect(onView).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('profile-card-photo-frame')).toBeTruthy();
    expect(screen.getByTestId('profile-card-ticker-bar')).toBeTruthy();
    expect(screen.getByTestId('profile-card-nick-bar')).toBeTruthy();
    expect(screen.getByText('홍길동')).toBeTruthy();

    fireEvent.click(screen.getByTestId('profile-card-ideal-back'));
    fireEvent.click(screen.getByTestId('profile-card-photo'));
    expect(onView).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('profile-card-photo-frame')).toBeTruthy();
  });

  it('ideal back paddingTop clears ticker; paddingBottom clears nick bar', () => {
    renderCard({
      compact: true,
      statusMsg: '전광판',
      idealMsg: '유머',
    });
    fireEvent.click(screen.getByTestId('profile-card-photo'));
    const back = screen.getByTestId('profile-card-ideal-back');
    expect(back.style.paddingTop).toBe('26px');
    expect(back.style.paddingBottom).toBe('24px');
    expect(screen.getByTestId('profile-card-ideal-header')).toBeTruthy();
  });

  it('without ticker: smaller top inset but nick bar still visible on flip', () => {
    renderCard({ compact: true, idealMsg: '유머' });
    fireEvent.click(screen.getByTestId('profile-card-photo'));
    expect(screen.queryByTestId('profile-card-ticker-bar')).toBeNull();
    expect(screen.getByTestId('profile-card-nick-bar')).toBeTruthy();
    const back = screen.getByTestId('profile-card-ideal-back');
    expect(back.style.paddingTop).toBe('10px');
    expect(back.style.paddingBottom).toBe('24px');
  });

  it('ticker exposes active flag for on-screen animation gate', () => {
    renderCard({ compact: true, statusMsg: '안녕하세요 상태메시지' });
    const text = screen.getByTestId('profile-card-ticker-text');
    expect(text.getAttribute('data-ticker-active')).toBe('1');
  });
});
