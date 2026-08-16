// @vitest-environment happy-dom
/**
 * ChatScreen swipe-to-reply + long-press/right-click delete menu
 */
import React from 'react';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import ChatScreen from '../components/ChatScreen';
import { ThemeProvider } from '../lib/theme';
import type { Message, Profile } from '../types/app';

vi.mock('../lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    removeChannel: vi.fn(),
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

const ME: Profile = {
  id: 'me-001',
  nickname: '나',
  pin_code: '1111',
  bio: null,
  mbti: 'INFJ',
  photo_url: '',
  personality_score: 50,
  dom_sub_score: null,
  birth_year: null,
  birth_month: null,
  birth_day: null,
  location: null,
  interests: null,
  contact_private: false,
  hide_personality: false,
  kakao_id: null,
  instagram_id: null,
  phone_number: null,
  created_at: '2026-01-01T00:00:00Z',
};

const OTHER: Profile = { ...ME, id: 'other-001', nickname: '상대', pin_code: '2222' };

function msg(id: string, sender: string, content: string): Message {
  return {
    id,
    chat_id: 'chat-1',
    sender_id: sender,
    content,
    image_url: null,
    created_at: '2026-08-16T00:00:00.000Z',
    client_id: null,
  };
}

function renderChat() {
  const onDeleteMessage = vi.fn();
  render(
    <ThemeProvider>
      <ChatScreen
        chatId="chat-1"
        messages={[
          msg('partner-msg', OTHER.id, '오늘 반가웠어요'),
          msg('mine-msg', ME.id, '저도요 내일 또 봐요'),
        ]}
        currentUserId={ME.id}
        otherProfile={OTHER}
        onSend={vi.fn()}
        onSendImage={vi.fn()}
        onBack={vi.fn()}
        onDeleteMessage={onDeleteMessage}
        currentUserProfile={ME}
      />
    </ThemeProvider>,
  );
  return { onDeleteMessage };
}

function swipe(el: HTMLElement, dx: number) {
  fireEvent.touchStart(el, {
    touches: [{ identifier: 0, clientX: 120, clientY: 200 }],
    changedTouches: [{ identifier: 0, clientX: 120, clientY: 200 }],
  });
  fireEvent.touchMove(el, {
    touches: [{ identifier: 0, clientX: 120 + dx, clientY: 202 }],
    changedTouches: [{ identifier: 0, clientX: 120 + dx, clientY: 202 }],
  });
  fireEvent.touchEnd(el, {
    touches: [],
    changedTouches: [{ identifier: 0, clientX: 120 + dx, clientY: 202 }],
  });
}

describe('ChatScreen gestures', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('swipe ≥ 55px attaches a reply composer', () => {
    renderChat();
    const row = screen.getByText('오늘 반가웠어요').closest('[data-msg-id]') as HTMLElement;
    swipe(row, 70);
    expect(screen.getByText(/에 답장/)).toBeTruthy();
    expect(screen.getByPlaceholderText('답장 입력...')).toBeTruthy();
  });

  it('right-click own message shows 삭제 (모두에게)', () => {
    renderChat();
    const row = screen.getByText('저도요 내일 또 봐요').closest('[data-msg-id]') as HTMLElement;
    fireEvent.contextMenu(row);
    expect(screen.getByText('🗑️ 삭제 (모두에게)')).toBeTruthy();
    expect(screen.getByText('↩️ 답장')).toBeTruthy();
  });

  it('right-click partner message has reply/copy but no delete', () => {
    renderChat();
    const row = screen.getByText('오늘 반가웠어요').closest('[data-msg-id]') as HTMLElement;
    fireEvent.contextMenu(row);
    expect(screen.getByText('↩️ 답장')).toBeTruthy();
    expect(screen.queryByText('🗑️ 삭제 (모두에게)')).toBeNull();
  });

  it('touch long-press ~500ms opens the same menu', () => {
    renderChat();
    const row = screen.getByText('저도요 내일 또 봐요').closest('[data-msg-id]') as HTMLElement;
    fireEvent.touchStart(row, {
      touches: [{ identifier: 0, clientX: 200, clientY: 240 }],
    });
    act(() => { vi.advanceTimersByTime(520); });
    expect(screen.getByText('🗑️ 삭제 (모두에게)')).toBeTruthy();
  });
});
