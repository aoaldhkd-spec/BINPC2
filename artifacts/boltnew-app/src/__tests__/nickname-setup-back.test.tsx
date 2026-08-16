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
