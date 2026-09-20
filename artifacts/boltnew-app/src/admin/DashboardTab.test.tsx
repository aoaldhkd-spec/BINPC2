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
});
