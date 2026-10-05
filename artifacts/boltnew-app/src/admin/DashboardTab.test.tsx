// @vitest-environment happy-dom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardTab } from './DashboardTab';
import type { AppSettings } from './shared';

afterEach(() => cleanup());
const noop = async () => {};

function renderDash(settings: AppSettings | null, opts?: { onToggleSession?: () => void; onSulbunOpen?: () => void | Promise<void> }) {
  const onToggleSession = opts?.onToggleSession ?? vi.fn<() => void>();
  const onSulbunOpen = opts?.onSulbunOpen ?? vi.fn<() => void>();
  return {
    onToggleSession,
    onSulbunOpen,
    ...render(
      <DashboardTab
        settings={settings}
        profiles={[]}
        onToggleSession={onToggleSession}
        onEventEndReset={() => {}}
        onToggleFunctionsLock={() => {}}
        onClearLikes={noop}
        onClearChats={noop}
        onClearProfiles={noop}
        onClearHistory={noop}
        restoreMap={new Map()}
        onSulbunOpen={onSulbunOpen}
      />,
    ),
  };
}

const activeSettings = {
  session_active: true,
  sulbun_event: {
    cycle_id: 'c1',
    opened_at: '2026-10-05T00:00:00.000Z',
    auto_reset_at: '2026-10-06T08:00:00.000Z',
    auto_reset_enabled: true,
    reset_done: false,
  },
} as unknown as AppSettings;

describe('DashboardTab automatic operations', () => {
  it('shows fixed 23/24/01/17 plan and keeps sulbun-open button', () => {
    const { onSulbunOpen } = renderDash({ session_active: false } as AppSettings);
    const card = screen.getByTestId('daily-cycle-card');
    expect(card.textContent).toContain('23:00');
    expect(card.textContent).toContain('24:00');
    expect(card.textContent).toContain('01:00');
    expect(card.textContent).toContain('17:00');
    const open = screen.getByTestId('sulbun-open-btn');
    expect(open.textContent).toContain('술번개 오픈');
    fireEvent.click(open);
    expect(onSulbunOpen).toHaveBeenCalledTimes(1);
  });

  it('inactive: start enabled, end disabled', () => {
    renderDash({ session_active: false } as AppSettings);
    expect((screen.getByTestId('session-start-btn') as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId('session-end-btn') as HTMLButtonElement).disabled).toBe(true);
  });

  it('active: start disabled, end enabled and confirms', () => {
    const onToggleSession = vi.fn();
    renderDash(activeSettings, { onToggleSession });
    expect((screen.getByTestId('session-start-btn') as HTMLButtonElement).disabled).toBe(true);
    const end = screen.getByTestId('session-end-btn') as HTMLButtonElement;
    expect(end.disabled).toBe(false);
    fireEvent.click(end);
    expect(screen.getByText('회식을 종료하시겠습니까?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(onToggleSession).toHaveBeenCalledTimes(1);
  });

  it('does not render manual heart-operation controls', () => {
    renderDash(activeSettings);
    expect(screen.queryByText('하트 운영')).toBeNull();
    expect(screen.queryByText('직접 공지')).toBeNull();
    expect(screen.queryByRole('button', { name: /스케줄 저장/ })).toBeNull();
  });
});
