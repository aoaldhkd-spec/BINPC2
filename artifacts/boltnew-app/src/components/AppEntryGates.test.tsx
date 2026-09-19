// @vitest-environment happy-dom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderAppEntryGates, type AppEntryGatesProps } from './AppEntryGates';

afterEach(() => {
  cleanup();
});

function baseProps(patch: Partial<AppEntryGatesProps> = {}): AppEntryGatesProps {
  return {
    appLoading: false,
    sessionActive: true,
    showWaiting: false,
    showRecovery: false,
    showNicknameSetup: false,
    currentUserId: null,
    hasValidProfile: false,
    profileBoot: 'register',
    view: 'entry-1',
    loading: false,
    registrationError: null,
    onWaitingEnter: vi.fn(),
    onRecover: vi.fn(),
    onRecoveryBackToRegister: vi.fn(),
    onRecoveryBackToEntry: vi.fn(),
    onNicknameSubmit: vi.fn(),
    onReset: vi.fn(),
    onShowRecovery: vi.fn(),
    ...patch,
  };
}

describe('renderAppEntryGates without entry code', () => {
  it('does not lock on leftover entry_password / null entry state', () => {
    const ui = renderAppEntryGates(baseProps({
      appLoading: false,
      sessionActive: true,
      showNicknameSetup: true,
    }));
    render(<>{ui}</>);
    expect(screen.queryByText('서버랑 X스 중입니다...')).toBeNull();
    expect(screen.queryByText('입장 코드')).toBeNull();
    expect(screen.queryByText('참여하려면 입장 코드를 입력하세요')).toBeNull();
  });

  it('keeps /ready failure as a session spinner, not an entry-code wait', () => {
    const ui = renderAppEntryGates(baseProps({
      appLoading: true,
      sessionActive: null,
    }));
    render(<>{ui}</>);
    expect(screen.getByText('서버랑 X스 중입니다...')).toBeTruthy();
    expect(screen.queryByText('참여하려면 입장 코드를 입력하세요')).toBeNull();
  });

  it('still shows recovery PIN for stored-account recover', () => {
    const ui = renderAppEntryGates(baseProps({
      currentUserId: 'user-1',
      hasValidProfile: false,
      profileBoot: 'recover',
      showRecovery: true,
    }));
    render(<>{ui}</>);
    expect(screen.getByText('프로필 복구')).toBeTruthy();
    expect(screen.getByText('고유번호 4자리로 내 프로필을 되찾아요')).toBeTruthy();
  });

  it('shows nickname setup for a first visit after waiting', () => {
    const ui = renderAppEntryGates(baseProps({
      showNicknameSetup: true,
    }));
    render(<>{ui}</>);
    expect(screen.queryByText('참여하려면 입장 코드를 입력하세요')).toBeNull();
    expect(document.body.textContent).not.toContain('입장 코드');
  });
});
