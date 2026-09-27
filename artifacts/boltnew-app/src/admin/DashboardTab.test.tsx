// @vitest-environment happy-dom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardTab } from './DashboardTab';
import type { AppSettings } from './shared';

afterEach(() => cleanup());

const noop = async () => {};

function renderDash(settings: AppSettings | null, onSulbunOpen = vi.fn()) {
  return {
    onSulbunOpen,
    ...render(
      <DashboardTab
        settings={settings}
        profiles={[]}
        onToggleSession={() => {}}
        onEventEndReset={() => {}}
        onToggleFunctionsLock={() => {}}
        onClearLikes={noop}
        onClearChats={noop}
        onClearProfiles={noop}
        onClearHistory={noop}
        restoreMap={new Map()}
        onSaveSchedule={noop}
        onSaveNotices={noop}
        onSulbunOpen={onSulbunOpen}
      />,
    ),
  };
}

const activeSettings = {
  session_active: true,
  sulbun_event: {
    cycle_id: 'c1',
    opened_at: '2026-09-20T13:00:00.000Z',
    auto_reset_at: '2026-09-21T08:00:00.000Z',
    auto_reset_enabled: true,
    reset_done: false,
  },
} as unknown as AppSettings;

describe('DashboardTab sulbun open card', () => {
  it('shows open CTA before a cycle exists', () => {
    const { onSulbunOpen } = renderDash({ session_active: false } as AppSettings);
    const btn = screen.getByTestId('sulbun-open-btn');
    expect(btn.textContent).toContain('🍻 술번개 오픈');
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(btn);
    expect(onSulbunOpen).toHaveBeenCalledTimes(1);
  });

  it('keeps the in-progress button clickable and calls open on bursts', () => {
    const { onSulbunOpen } = renderDash(activeSettings);
    const btn = screen.getByTestId('sulbun-open-btn');
    expect(btn.textContent).toContain('🍻 술번개 진행 중');
    expect(btn.textContent).toContain('자동 초기화: 9/21 17:00');
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    expect(btn.className).toContain('active:scale-[0.98]');
    expect(btn.className).not.toContain('cursor-default');
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onSulbunOpen).toHaveBeenCalledTimes(5);
  });

  it('keeps 회식 시작/종료 clickable regardless of session_active', () => {
    const onToggleSession = vi.fn();
    render(
      <DashboardTab
        settings={activeSettings}
        profiles={[]}
        onToggleSession={onToggleSession}
        onEventEndReset={() => {}}
        onToggleFunctionsLock={() => {}}
        onClearLikes={noop}
        onClearChats={noop}
        onClearProfiles={noop}
        onClearHistory={noop}
        restoreMap={new Map()}
        onSaveSchedule={noop}
        onSaveNotices={noop}
        onSulbunOpen={() => {}}
      />,
    );
    const start = screen.getByTestId('session-start-btn') as HTMLButtonElement;
    const end = screen.getByTestId('session-end-btn') as HTMLButtonElement;
    expect(start.disabled).toBe(false);
    expect(end.disabled).toBe(false);
    expect(start.className).not.toContain('cursor-not-allowed');
    expect(end.className).not.toContain('cursor-not-allowed');
    fireEvent.click(start);
    expect(screen.getByText('회식을 시작하시겠습니까?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    fireEvent.click(end);
    expect(screen.getByText('회식을 종료하시겠습니까?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(onToggleSession).toHaveBeenCalledTimes(1);
  });

  it('functions lock 해제 stays a real button', () => {
    renderDash({ session_active: true, functions_locked: true } as AppSettings);
    const lock = screen.getByTestId('functions-lock-btn') as HTMLButtonElement;
    expect(lock.disabled).toBe(false);
    expect(lock.textContent).toContain('탭하여 해제');
  });
});
