// @vitest-environment happy-dom
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BottomNotification } from '../components/BottomNotification';

afterEach(cleanup);

describe('BINPC2 in-app heart / 1:1 chat notification targets', () => {
  it('tapping the full received-heart toast opens the received heart screen once', () => {
    const goToStatus = vi.fn();
    const goToChats = vi.fn();
    render(<BottomNotification
      notification={{ type: 'heart', nickname: '상대', heartType: 'red', profileId: 'peer' }}
      onClose={vi.fn()} onGoToStatus={goToStatus} onGoToChats={goToChats}
    />);
    fireEvent.click(screen.getByRole('button', { name: '받은 하트 바로 보기' }));
    expect(goToStatus).toHaveBeenCalledOnce();
    expect(goToChats).not.toHaveBeenCalled();
  });

  it('tapping the full direct message toast opens only that conversation callback', () => {
    const openChat = vi.fn();
    render(<BottomNotification
      notification={{ type: 'message', nickname: '상대', profileId: 'peer-msg' }}
      onClose={vi.fn()} onGoToStatus={vi.fn()} onGoToChats={openChat}
    />);
    fireEvent.click(screen.getByRole('button', { name: '알림 열기' }));
    expect(openChat).toHaveBeenCalledOnce();
  });


  it('a received heart opens MY/received heart status, not a chat list', () => {
    const onGoToStatus = vi.fn();
    const onGoToChats = vi.fn();
    render(<BottomNotification
      notification={{ type: 'heart', nickname: '친구', heartType: 'blue', profileId: 'peer' }}
      onClose={vi.fn()} onGoToStatus={onGoToStatus} onGoToChats={onGoToChats}
    />);
    fireEvent.click(screen.getByText('하트, 채팅으로 이동'));
    expect(onGoToStatus).toHaveBeenCalledOnce();
    expect(onGoToChats).not.toHaveBeenCalled();
  });

  it('incoming direct message shows peer nickname and opens its chat via target callback', () => {
    const onGoToChats = vi.fn();
    render(<BottomNotification
      notification={{ type: 'message', nickname: '상대방', profileId: 'sender-u1' }}
      onClose={vi.fn()} onGoToStatus={vi.fn()} onGoToChats={onGoToChats}
    />);
    expect(screen.getByText('상대방님에게 새 채팅이 왔습니다.')).toBeTruthy();
    fireEvent.click(screen.getByText('해당 채팅 바로 보기'));
    expect(onGoToChats).toHaveBeenCalledOnce();
  });
});
