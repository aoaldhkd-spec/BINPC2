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
    fireEvent.change(screen.getByPlaceholderText('예: 다정하고 티키타카 잘 맞는 분'), {
      target: { value: '다정한 사람' },
    });
    fireEvent.change(screen.getByPlaceholderText('예: 말 걸기 쉬운 편, 유머있는'), {
      target: { value: '유머있는 편' },
    });
    fireEvent.click(screen.getByRole('button', { name: /입장하기/ }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].idealMsg).toBe('다정한 사람');
    expect(onSubmit.mock.calls[0][0].featureMsg).toBe('유머있는 편');
  });
});
