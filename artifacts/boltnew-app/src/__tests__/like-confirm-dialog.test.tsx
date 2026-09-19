// @vitest-environment happy-dom
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { LikeConfirmDialog, likeDialogHeartOps } from '../components/LikeConfirmDialog';
import type { Profile } from '../types/app';
import type { HeartType } from '../lib/constants';
import { emptyHeartUsage, heartUsageFromLikeRows, parseHeartOps } from '../lib/heart-ops';

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

function renderDialog(
  unlock: { grants?: HeartType[]; rainbow?: boolean },
  usageRows: Record<string, unknown>[] = [],
  onConfirm = vi.fn(),
  sentTypes: HeartType[] = [],
) {
  const keys: ('red' | 'blue' | 'pink' | 'green' | 'rainbow')[] = [
    ...(unlock.grants ?? []),
    ...(unlock.rainbow ? (['rainbow'] as const) : []),
  ];
  const heartOps = parseHeartOps(JSON.stringify({
    version: 2,
    timezone: 'Asia/Seoul',
    // Empty slots fall back to DEFAULT (23:00 red). After midnight Seoul
    // nowEventMinute treats 00:00–06:59 as past 23:00, so keep a dummy slot.
    slots: keys.length ? [{ id: 't', at: '00:00', unlock: keys }] : [{ id: 'locked', at: '24:59', unlock: [] }],
    instant_unlock: keys,
  }));
  const heartUsage = usageRows.length
    ? heartUsageFromLikeRows(usageRows, 'me')
    : emptyHeartUsage();

  render(
    <LikeConfirmDialog
      target={PROFILE}
      sentTypesForTarget={new Set(sentTypes)}
      heartOps={heartOps}
      heartUsage={heartUsage}
      onConfirm={onConfirm}
      onCancel={() => {}}
    />,
  );
  return onConfirm;
}

describe('LikeConfirmDialog lock/unlock hearts', () => {
  it('keeps original 4 heart labels and descriptions', () => {
    renderDialog({ grants: ['red', 'blue', 'pink', 'green'], rainbow: true });
    expect(screen.getByText('호감')).toBeTruthy();
    expect(screen.getByText('친구')).toBeTruthy();
    expect(screen.getByText('뜨밤')).toBeTruthy();
    expect(screen.getByText('칭찬')).toBeTruthy();
    expect(screen.getByText('로맨틱한 호감을 표현해요')).toBeTruthy();
    expect(screen.queryByText('빨강하트')).toBeNull();
    expect(screen.getByTestId('like-rainbow-btn')).toBeTruthy();
  });

  it('locks grant heart until unlocked', () => {
    renderDialog({});
    expect(screen.getByTestId('like-heart-red')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('like-heart-red-remaining').textContent).toBe('🔒');
  });

  it('shows unlocked grant as available once', () => {
    renderDialog({ grants: ['red'] });
    expect(screen.getByTestId('like-heart-red-remaining').textContent).toBe('🔓');
    expect(screen.getByTestId('like-heart-red')).toHaveProperty('disabled', false);
  });

  it('opens compact rainbow picker and sends with rainbow source', () => {
    const onConfirm = renderDialog({ rainbow: true });
    fireEvent.click(screen.getByTestId('like-rainbow-btn'));
    expect(screen.getByTestId('rainbow-color-dialog')).toBeTruthy();
    fireEvent.click(screen.getByTestId('rainbow-pick-blue'));
    fireEvent.click(screen.getAllByRole('button', { name: '보내기' })[1]);
    expect(onConfirm).toHaveBeenCalledWith('blue', 'rainbow');
  });

  it('sends grant heart without opening rainbow modal', () => {
    const onConfirm = renderDialog({ grants: ['red'] });
    fireEvent.click(screen.getByTestId('like-heart-red'));
    fireEvent.click(screen.getAllByRole('button', { name: '보내기' })[0]);
    expect(onConfirm).toHaveBeenCalledWith('red', undefined);
  });

  it('likeDialogHeartOps helper unlocks from legacy quotas', () => {
    const cfg = likeDialogHeartOps({ red: 1, blue: 0, pink: 0, green: 0 }, 4);
    expect(cfg.instant_unlock).toContain('red');
    expect(cfg.instant_unlock).toContain('rainbow');
  });

  it('rainbow picker keeps all 4 colors after a grant heart was already sent', () => {
    const onConfirm = renderDialog(
      { grants: ['red', 'blue', 'pink', 'green'], rainbow: true },
      [{ liker_id: 'me', heart_type: 'red', like_source: 'grant' }],
      vi.fn(),
      ['red'],
    );
    expect(screen.getByTestId('like-heart-red')).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByTestId('like-rainbow-btn'));
    expect(screen.getByTestId('rainbow-pick-red')).toHaveProperty('disabled', false);
    expect(screen.getByTestId('rainbow-pick-blue')).toHaveProperty('disabled', false);
    expect(screen.getByTestId('rainbow-pick-pink')).toHaveProperty('disabled', false);
    expect(screen.getByTestId('rainbow-pick-green')).toHaveProperty('disabled', false);
    fireEvent.click(screen.getByTestId('rainbow-pick-red'));
    fireEvent.click(screen.getAllByRole('button', { name: '보내기' })[1]);
    expect(onConfirm).toHaveBeenCalledWith('red', 'rainbow');
  });
});
