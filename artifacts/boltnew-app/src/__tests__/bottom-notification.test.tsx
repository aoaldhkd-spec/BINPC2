// @vitest-environment happy-dom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BottomNotification } from '../components/BottomNotification';
import { MUTUAL_SIGNAL_TOAST } from '../lib/heart-toast';

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

  it('shows 서로 시그널 mutual CTA, not 서로 하트', () => {
    render(
      <BottomNotification
        notification={{ type: 'signal', signalKind: 'mutual', nickname: '상대' }}
        onClose={vi.fn()}
        onGoToStatus={vi.fn()}
        onGoToChats={vi.fn()}
      />,
    );
    expect(screen.getByText(MUTUAL_SIGNAL_TOAST)).toBeTruthy();
    expect(screen.queryByText(/서로 하트/)).toBeNull();
  });
});
