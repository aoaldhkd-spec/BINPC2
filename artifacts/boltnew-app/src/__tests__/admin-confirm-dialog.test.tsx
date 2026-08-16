// @vitest-environment happy-dom
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ConfirmDialog } from '../admin/ConfirmDialog';
import { ChatsTab } from '../admin/ChatsTab';

afterEach(() => cleanup());

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
        profileMap={new Map()}
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
});
