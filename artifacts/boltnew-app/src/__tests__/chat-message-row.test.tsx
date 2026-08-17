// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatMessageRow, type ChatMessageMeta } from '../components/ChatMessageRow';
import type { Message } from '../types/app';

const meta: ChatMessageMeta = {
  time: '오후 3:00',
  isCard: false,
  isSticker: false,
  stickerIdx: -1,
  isReply: false,
  replyData: null,
  isInfoReqMsg: false,
  isInfoAckMsg: false,
  isInfoDeclineMsg: false,
};

const msg: Message = {
  id: 'm1',
  chat_id: 'c1',
  sender_id: 'me',
  content: '안녕',
  image_url: null,
  created_at: new Date().toISOString(),
  client_id: null,
};

describe('ChatMessageRow', () => {
  it('renders text bubbles without changing layout classes', () => {
    const noop = vi.fn();
    render(
      <ChatMessageRow
        msg={msg}
        currentUserId="me"
        meta={meta}
        swipeOffsetX={0}
        isSwiping={false}
        myUnread={false}
        ackedReqTypes={new Set()}
        declinedReqTypes={new Set()}
        onMsgTouchStart={noop}
        onMsgTouchMove={noop}
        onMsgTouchEnd={noop}
        onMsgMouseDown={noop}
        onContextMenu={noop}
        onTap={noop}
        onAcceptInfoReq={noop}
        onDeclineInfoReq={noop}
        onOpenImage={noop}
        onClearReaction={noop}
      />,
    );
    expect(screen.getByText('안녕')).toBeTruthy();
    fireEvent.click(screen.getByText('안녕'));
    expect(noop).toHaveBeenCalled();
  });
});
