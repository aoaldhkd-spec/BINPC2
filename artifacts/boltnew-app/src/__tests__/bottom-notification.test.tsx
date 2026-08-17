// @vitest-environment happy-dom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BottomNotification } from '../components/BottomNotification';
import { MUTUAL_HEART_TOAST } from '../lib/heart-toast';

describe('BottomNotification', () => {
  it('sits above ChatScreen (z-[9999]) so recipient toasts stay visible', () => {
    const { container } = render(
      <BottomNotification
        notification={{ type: 'heart', nickname: '상대', heartType: 'red' }}
        onClose={vi.fn()}
        onGoToStatus={vi.fn()}
        onGoToChats={vi.fn()}
      />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('z-[10050]');
  });

  it('shows 서로 하트 mutual CTA, not 서로 시그널', () => {
    render(
      <BottomNotification
        notification={{ type: 'signal', signalKind: 'mutual', nickname: '상대' }}
        onClose={vi.fn()}
        onGoToStatus={vi.fn()}
        onGoToChats={vi.fn()}
      />,
    );
    expect(screen.getByText(MUTUAL_HEART_TOAST)).toBeTruthy();
    expect(screen.queryByText(/서로 시그널/)).toBeNull();
  });

  it('renders group-chat failure copy through the supported system notification', () => {
    const message = '단톡 전송 실패 — 잠시 후 다시 시도해 주세요';
    render(
      <BottomNotification
        notification={{ type: 'system', message }}
        onClose={vi.fn()}
        onGoToStatus={vi.fn()}
        onGoToChats={vi.fn()}
      />,
    );
    expect(screen.getByText(message)).toBeTruthy();
  });
});
