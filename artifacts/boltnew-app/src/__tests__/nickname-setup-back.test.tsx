// @vitest-environment happy-dom
/**
 * NicknameSetupScreen step 1 back button must call onReset
 * so App can return to the waiting landing.
 */

import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { NicknameSetupScreen } from '../components/NicknameSetupScreen';

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
  },
}));

describe('NicknameSetupScreen — step 1 back', () => {
  afterEach(() => cleanup());

  it('calls onReset when 이전하기 is pressed on the first step', () => {
    const onReset = vi.fn();
    render(
      <NicknameSetupScreen
        onSubmit={vi.fn()}
        loading={false}
        onReset={onReset}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /이전하기/ }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('places exactly 89년 and 88년 이하 under the 00년대 tab and shows the guidance note', () => {
    render(
      <NicknameSetupScreen
        onSubmit={vi.fn()}
        loading={false}
        onReset={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'INTJ' }));
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));

    expect(screen.queryByRole('button', { name: '80년대' })).toBeNull();
    expect(screen.getByText('80년대는 00년대에 있어요')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '00년대' }));
    expect(screen.getByRole('button', { name: '89년' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '88년 이하' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '89' })).toBeNull();
    expect(screen.queryByRole('button', { name: '88이하' })).toBeNull();
    expect(screen.queryByRole('button', { name: '87년' })).toBeNull();
    expect(screen.queryByRole('button', { name: '86년' })).toBeNull();
    expect(screen.queryByRole('button', { name: '85년' })).toBeNull();
    expect(screen.getByRole('button', { name: '00년' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '07년' })).toBeTruthy();
  });

  it('goes to the previous setup step instead of resetting after step 1', () => {
    const onReset = vi.fn();
    render(
      <NicknameSetupScreen
        onSubmit={vi.fn()}
        loading={false}
        onReset={onReset}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'INTJ' }));
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    expect(screen.getByText('출생년도')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^이전$/ }));
    expect(onReset).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /이전하기/ })).toBeTruthy();
  });
});
