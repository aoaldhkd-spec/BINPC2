// @vitest-environment happy-dom
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ConfirmDialog } from '../admin/ConfirmDialog';

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
});
