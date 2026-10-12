// @vitest-environment happy-dom
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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

  it('opens received hearts by tapping the visible web notification', () => {
    const showHearts = vi.fn();
    render(
      <BottomNotification
        notification={{ type: 'heart', nickname: '상대', heartType: 'red' }}
        onClose={vi.fn()}
        onGoToStatus={showHearts}
        onGoToChats={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '받은 하트 바로 보기' }));
    expect(showHearts).toHaveBeenCalledTimes(1);
  });

  it('opens the exact chat from an in-app message alert', () => {
    const openChat = vi.fn();
    render(
      <BottomNotification
        notification={{ type: 'message', nickname: '상대', profileId: 'peer-123' }}
        onClose={vi.fn()}
        onGoToStatus={vi.fn()}
        onGoToChats={openChat}
      />,
    );
    expect(screen.getByText('상대님에게 새 채팅이 왔습니다.')).toBeTruthy();
    fireEvent.click(screen.getByText('해당 채팅 바로 보기'));
    expect(openChat).toHaveBeenCalledTimes(1);
  });

  it('shows 서로 하트 mutual CTA, not 서로 시그널', () => {
    render(
      <BottomNotification
        notification={{ type: 'heart', nickname: '상대', heartMutual: true, message: MUTUAL_HEART_TOAST }}
        onClose={vi.fn()}
        onGoToStatus={vi.fn()}
        onGoToChats={vi.fn()}
        onStartChat={vi.fn()}
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
