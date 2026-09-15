// @vitest-environment happy-dom
/**
 * NicknameSetupScreen step 6 — optional 이상형·나는 어떤 사람인가요?, skip vs save.
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

function advanceToStep6() {
  fireEvent.click(screen.getByRole('button', { name: 'INTJ' }));
  fireEvent.click(screen.getByRole('button', { name: /다음/ }));
  fireEvent.click(screen.getByRole('button', { name: /다음/ }));
  fireEvent.click(screen.getByRole('button', { name: /엔터·사교·기타/ }));
  fireEvent.click(screen.getByRole('button', { name: '집콕' }));
  fireEvent.click(screen.getByRole('button', { name: '기타' }));
  fireEvent.click(screen.getByRole('button', { name: /다음/ }));
  fireEvent.click(screen.getByRole('button', { name: '올' }));
  fireEvent.click(screen.getByRole('button', { name: /다음/ }));
  const nickInput = screen.getByPlaceholderText('예: 서울고수');
  fireEvent.change(nickInput, { target: { value: '테스트닉' } });
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      fireEvent.click(screen.getByRole('button', { name: /다음/ }));
      resolve();
    }, 600);
  });
}

describe('NicknameSetupScreen — step 6 optional signal fields', () => {
  afterEach(() => cleanup());

  it('shows step 6 with skip and enter buttons after nickname', async () => {
    render(
      <NicknameSetupScreen
        onSubmit={vi.fn()}
        loading={false}
        onReset={vi.fn()}
      />,
    );
    await advanceToStep6();
    expect(screen.getByRole('heading', { level: 2, name: '이상형 · 나는 어떤 사람인가요?' })).toBeTruthy();
    expect(screen.getByText('나는 어떤 사람인가요?')).toBeTruthy();
    expect(screen.getByRole('button', { name: '건너뛰기' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /입장하기/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /이상형/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /나는 어떤 사람인가요/ }).getAttribute('aria-pressed')).toBe('false');
  });

  it('skip submits null idealMsg and featureMsg', async () => {
    const onSubmit = vi.fn();
    render(
      <NicknameSetupScreen
        onSubmit={onSubmit}
        loading={false}
        onReset={vi.fn()}
      />,
    );
    await advanceToStep6();
    fireEvent.click(screen.getByRole('button', { name: '건너뛰기' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].idealMsg).toBeNull();
    expect(onSubmit.mock.calls[0][0].featureMsg).toBeNull();
  });

  it('enter with tags encodes ideal_msg and feature_msg like 내 설정', async () => {
    const onSubmit = vi.fn();
    render(
      <NicknameSetupScreen
        onSubmit={onSubmit}
        loading={false}
        onReset={vi.fn()}
      />,
    );
    await advanceToStep6();
    fireEvent.click(screen.getByRole('button', { name: '감자상 🥔' }));
    fireEvent.click(screen.getByRole('button', { name: /나는 어떤 사람인가요/ }));
    fireEvent.click(screen.getByRole('button', { name: /성격/ }));
    fireEvent.click(screen.getByRole('button', { name: '다정한 💕' }));
    fireEvent.click(screen.getByRole('button', { name: /입장하기/ }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].idealMsg).toBe('감자상 🥔');
    expect(onSubmit.mock.calls[0][0].featureMsg).toBe('다정한 💕');
  });
});
