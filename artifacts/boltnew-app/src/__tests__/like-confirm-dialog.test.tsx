// @vitest-environment happy-dom
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { LikeConfirmDialog } from '../components/LikeConfirmDialog';
import type { Profile } from '../types/app';
import type { HeartType } from '../lib/constants';

afterEach(() => {
  cleanup();
});

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
  avatar_color: null,
  created_at: '2026-01-01T00:00:00Z',
};

const ZERO: Record<HeartType, number> = { red: 0, blue: 0, pink: 0, green: 0 };

function renderDialog(
  rainbowPool: number,
  onConfirm = vi.fn(),
  quotas: Record<HeartType, number> = ZERO,
) {
  render(
    <LikeConfirmDialog
      target={PROFILE}
      likedByType={ZERO}
      sentTypesForTarget={new Set()}
      quotas={quotas}
      rainbowPool={rainbowPool}
      onConfirm={onConfirm}
      onCancel={() => {}}
    />,
  );
  return onConfirm;
}

describe('LikeConfirmDialog original 4 + rainbow slot', () => {
  it('keeps the original 4 heart labels and appends a rainbow slot', () => {
    renderDialog(4, vi.fn(), { red: 1, blue: 1, pink: 1, green: 1 });
    expect(screen.getByText('호감')).toBeTruthy();
    expect(screen.getByText('친구')).toBeTruthy();
    expect(screen.getByText('뜨밤')).toBeTruthy();
    expect(screen.getByText('칭찬')).toBeTruthy();
    expect(screen.getByText('로맨틱한 호감을 표현해요')).toBeTruthy();
    expect(screen.getByText('친구가 되고 싶을 때 보내요')).toBeTruthy();
    expect(screen.getByText('함께 밤을 보내고 싶어요')).toBeTruthy();
    expect(screen.getByText('칭찬만 전달 (연락처 공유 불가)')).toBeTruthy();
    expect(screen.queryByText('빨강하트')).toBeNull();
    expect(screen.queryByText('주황하트')).toBeNull();
    expect(screen.queryByTestId('like-heart-row')).toBeNull();
    expect(screen.getByTestId('like-rainbow-btn')).toBeTruthy();
    expect(screen.getByTestId('like-rainbow-btn').getAttribute('aria-disabled')).toBe('false');
  });

  it('shows per-color grant remaining, not a shared fake 4', () => {
    renderDialog(8, vi.fn(), { red: 2, blue: 0, pink: 1, green: 0 });
    expect(screen.getByTestId('like-rainbow-remaining').textContent).toBe('8개');
    expect(screen.getByTestId('like-rainbow-btn').textContent).toContain('위 하트 중에서 1개 선택');
    expect(screen.getByTestId('like-heart-red-remaining').textContent).toBe('2개');
    expect(screen.getByTestId('like-heart-blue-remaining').textContent).toBe('0개');
    expect(screen.getByTestId('like-heart-pink-remaining').textContent).toBe('1개');
    expect(screen.getByTestId('like-heart-green-remaining').textContent).toBe('0개');
  });

  it('grays regular hearts when that grant remaining is 0', () => {
    renderDialog(2);
    expect(screen.getByTestId('like-heart-red-remaining').textContent).toBe('0개');
    expect(screen.getByTestId('like-rainbow-remaining').textContent).toBe('2개');
    expect(screen.getByTestId('like-heart-red')).toHaveProperty('disabled', true);
  });

  it('keeps a locked gray rainbow until pool is granted', () => {
    renderDialog(0);
    const rainbow = screen.getByTestId('like-rainbow-btn');
    expect(rainbow.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(rainbow);
    expect(screen.queryByTestId('rainbow-color-dialog')).toBeNull();
    expect(rainbow.textContent).toContain('잠금');
  });

  it('opens rainbow modal to pick 1 of the hearts above', () => {
    const onConfirm = renderDialog(4);
    fireEvent.click(screen.getByTestId('like-rainbow-btn'));
    expect(screen.getByTestId('rainbow-color-dialog').textContent).toContain('위 하트 중에서 1개 선택하세요');
    expect(screen.getByTestId('rainbow-color-dialog').textContent).not.toContain('4개 중 4개');
    fireEvent.click(screen.getAllByText('친구')[1]);
    fireEvent.click(screen.getAllByRole('button', { name: '보내기' })[1]);
    expect(onConfirm).toHaveBeenCalledWith('blue', 'rainbow');
  });

  it('sends a normal unlocked heart from the original list without opening rainbow modal', () => {
    const onConfirm = renderDialog(4, vi.fn(), { red: 2, blue: 0, pink: 0, green: 0 });
    fireEvent.click(screen.getByText('호감'));
    expect(screen.queryByTestId('rainbow-color-dialog')).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: '보내기' })[0]);
    expect(onConfirm).toHaveBeenCalledWith('red', undefined);
  });
});
