// @vitest-environment happy-dom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginScreen } from './LoginScreen';
import { TEST_ADMIN_HINT } from './admin-login';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

const from = vi.mocked(supabase.from);
const rpc = vi.mocked(supabase.rpc);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

beforeEach(() => {
  from.mockReturnValue({
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: { admin_phone: '010-3878-6740' }, error: null }),
      }),
    }),
  } as never);
  rpc.mockResolvedValue({ data: null, error: { message: '비밀번호가 일치하지 않습니다.' } });
});

describe('LoginScreen 테스트 관리자', () => {
  it('fills phone only, does not submit, and does not use a retired public password', async () => {
    render(<LoginScreen onLogin={() => {}} />);
    await screen.findByDisplayValue('010-3878-6740');

    fireEvent.click(screen.getByRole('button', { name: '테스트 관리자' }));

    expect(screen.getByText(TEST_ADMIN_HINT)).toBeTruthy();
    expect((screen.getByPlaceholderText('비밀번호 입력') as HTMLInputElement).value).toBe('');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reads autofilled DOM password instead of empty React state', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: '비밀번호가 일치하지 않습니다.' } });
    render(<LoginScreen onLogin={() => {}} />);
    await screen.findByDisplayValue('010-3878-6740');

    const field = screen.getByPlaceholderText('비밀번호 입력') as HTMLInputElement;
    field.value = 'from-autofill';
    fireEvent.submit(field.closest('form')!);

    await waitFor(() => {
      expect(rpc).toHaveBeenCalledWith('admin_create_session', {
        p_phone: '010-3878-6740',
        p_admin_password: 'from-autofill',
      });
    });
  });

  it('explains retired public defaults and 429 separately', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: '비밀번호가 일치하지 않습니다.' } });
    render(<LoginScreen onLogin={() => {}} />);
    await screen.findByDisplayValue('010-3878-6740');

    fireEvent.change(screen.getByPlaceholderText('비밀번호 입력'), { target: { value: '116606' } });
    fireEvent.submit(screen.getByPlaceholderText('비밀번호 입력').closest('form')!);

    expect(await screen.findByText(/예전 공개 기본 비밀번호는 더 이상 사용할 수 없습니다/)).toBeTruthy();

    cleanup();
    rpc.mockResolvedValue({ data: null, error: { message: 'HTTP 429' } });
    render(<LoginScreen onLogin={() => {}} />);
    await screen.findByDisplayValue('010-3878-6740');
    fireEvent.change(screen.getByPlaceholderText('비밀번호 입력'), { target: { value: 'not-the-default' } });
    fireEvent.submit(screen.getByPlaceholderText('비밀번호 입력').closest('form')!);
    expect(await screen.findByText('시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.')).toBeTruthy();
  });
});
