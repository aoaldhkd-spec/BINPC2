// @vitest-environment happy-dom
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ConfirmDialog } from '../admin/ConfirmDialog';
import { ChatsTab } from '../admin/ChatsTab';
import { ADMIN_TOKEN_KEY, adminApiSelect } from '../admin/shared';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.removeItem(ADMIN_TOKEN_KEY);
});

describe('admin ConfirmDialog', () => {
  it('calls onConfirm when no typed phrase is required', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog title="삭제" message="삭제할까요?" onConfirm={onConfirm} onCancel={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('disables confirm until the typed phrase matches', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        title="초기화"
        message="정말 초기화할까요?"
        danger
        confirmText="RESET"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    const confirmBtn = screen.getByRole('button', { name: '확인' });
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('RESET'), { target: { value: 'RESET' } });
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('채팅 전체 이력 삭제는 문구 입력 없이 확인 버튼만으로 진행한다', async () => {
    const onClearAll = vi.fn().mockResolvedValue(undefined);
    render(
      <ChatsTab
        chats={[{ id: 'c1', user1_id: 'a', user2_id: 'b', created_at: '2026-01-01T00:00:00.000Z' }]}
        messages={[]}
        groupChats={[]}
        groupMessages={[]}
        groupParticipants={[]}
        signalSends={[]}
        profileMap={new Map()}
        historyLoading={false}
        historyError={null}
        onDeleteChat={async () => {}}
        onClearAll={onClearAll}
        onRefresh={async () => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /전체 이력 삭제/ }));
    expect(screen.queryByPlaceholderText('전체삭제')).toBeNull();
    expect(screen.queryByText(/를 입력하세요/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it('단체채팅 이력을 방·발신자와 이미지 표시로 매핑한다', () => {
    render(
      <ChatsTab
        chats={[]}
        messages={[]}
        groupChats={[{
          id: 'group-room-1',
          name: '게임 모임',
          interest_tag: '게임',
          age_group: null,
          max_members: 1000,
          created_at: '2026-08-17T01:00:00.000Z',
          memberCount: 3,
        }]}
        groupMessages={[{
          id: 'group-message-1',
          group_id: 'group-room-1',
          sender_id: 'sender-1',
          content: '',
          image_url: '/api/db/storage-image/group-image',
          created_at: '2026-08-17T02:00:00.000Z',
        }]}
        groupParticipants={[]}
        signalSends={[]}
        profileMap={new Map([['sender-1', { nickname: '민지' } as never]])}
        historyLoading={false}
        historyError={null}
        onDeleteChat={async () => {}}
        onClearAll={async () => {}}
        onRefresh={async () => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /단체채팅/ }));
    expect(screen.getAllByText('게임 모임').length).toBeGreaterThan(0);
    expect(screen.getByText(/전체 1개 방 · 목록 방 0 · 년생 방 0 · 기타 1/)).toBeTruthy();
    expect(screen.getByText('방 ID: group-room-1')).toBeTruthy();
    expect(screen.getByText('민지')).toBeTruthy();
    expect(screen.getByText('[이미지]')).toBeTruthy();
    expect(screen.getByText('3명')).toBeTruthy();
  });

  it('시그널 이력은 닉네임과 send/pass만 표시한다', () => {
    render(
      <ChatsTab
        chats={[]}
        messages={[]}
        groupChats={[]}
        groupMessages={[]}
        groupParticipants={[]}
        signalSends={[
          { id: 's1', sender_id: 'a', receiver_id: 'b', action: 'send', created_at: '2026-08-17T02:00:00.000Z' },
          { id: 's2', sender_id: 'b', receiver_id: 'a', action: 'pass', created_at: '2026-08-17T01:00:00.000Z' },
        ]}
        profileMap={new Map([
          ['a', { nickname: '민지' } as never],
          ['b', { nickname: '준호' } as never],
        ])}
        historyLoading={false}
        historyError={null}
        onDeleteChat={async () => {}}
        onClearAll={async () => {}}
        onRefresh={async () => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /시그널/ }));
    expect(screen.getAllByText('민지')).toHaveLength(2);
    expect(screen.getAllByText('준호')).toHaveLength(2);
    expect(screen.getByText('시그널 전송')).toBeTruthy();
    expect(screen.getByText('패스')).toBeTruthy();
    expect(screen.queryByText(/ideal_msg|feature_msg|status_msg/)).toBeNull();
  });

  it('관리자 단체방 수는 목록 방과 년생 방을 나눠 보여 준다', () => {
    render(
      <ChatsTab
        chats={[]}
        messages={[]}
        groupChats={[
          { id: 'group_afterparty_club', name: '2차 클럽 갈 분', interest_tag: '2차클럽', age_group: null, max_members: 1000, created_at: '2026-08-17T01:00:00.000Z', room_kind: 'afterparty_club' },
          { id: 'group_afterparty_drink', name: '2차 술 갈 분', interest_tag: '2차술', age_group: null, max_members: 1000, created_at: '2026-08-17T01:00:00.000Z', room_kind: 'afterparty_drink' },
          { id: 'group_age_20', name: '20대 모임', interest_tag: '20대', age_group: '20대', max_members: 1000, created_at: '2026-08-17T01:00:00.000Z', room_kind: 'age_decade' },
          { id: 'group_age_30', name: '30대 모임', interest_tag: '30대', age_group: '30대', max_members: 1000, created_at: '2026-08-17T01:00:00.000Z', room_kind: 'age_decade' },
          { id: 'group_birth_1995', name: '1995년생 모임', interest_tag: '1995년생', age_group: null, max_members: 1000, created_at: '2026-08-17T01:00:00.000Z', room_kind: 'birth_year' },
          { id: 'group_birth_1998', name: '1998년생 모임', interest_tag: '1998년생', age_group: null, max_members: 1000, created_at: '2026-08-17T01:00:00.000Z', room_kind: 'birth_year' },
        ]}
        groupMessages={[]}
        groupParticipants={[]}
        signalSends={[]}
        profileMap={new Map()}
        historyLoading={false}
        historyError={null}
        onDeleteChat={async () => {}}
        onClearAll={async () => {}}
        onRefresh={async () => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /단체채팅/ }));
    expect(screen.getByText(/전체 6개 방 · 목록 방 4 · 년생 방 2/)).toBeTruthy();
    expect(screen.queryByText(/^[0-9]+개 방 ·/)).toBeNull();
    expect(screen.getByText(/1995년생 모임/)).toBeTruthy();
    expect(screen.getByText(/1998년생 모임/)).toBeTruthy();
  });

  it('관리자 이력 조회에 관리자 토큰·정렬·상한을 전달한다', async () => {
    localStorage.setItem(ADMIN_TOKEN_KEY, 'admin-token');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: [],
      error: null,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await adminApiSelect('signal_sends', [{ column: 'created_at', ascending: false }], 1000);

    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(request.adminToken).toBe('admin-token');
    expect(request.limit).toBe(1000);
    expect(request.orders).toEqual([{ col: 'created_at', asc: false }]);
  });
});
