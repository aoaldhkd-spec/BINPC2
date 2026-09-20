// @vitest-environment happy-dom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardTab } from './DashboardTab';
import type { AppSettings } from './shared';

afterEach(() => cleanup());

const noop = async () => {};

function renderDash(settings: AppSettings | null) {
  return render(
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
      onSulbunOpen={vi.fn()}
    />,
  );
}

describe('DashboardTab sulbun open card', () => {
  it('shows open CTA before a cycle exists', () => {
    renderDash({ session_active: false } as AppSettings);
    expect(screen.getByTestId('sulbun-open-btn').textContent).toContain('🍻 술번개 오픈');
  });

  it('shows in-progress time after open', () => {
    renderDash({
      session_active: true,
      sulbun_event: {
        cycle_id: 'c1',
        opened_at: '2026-09-20T13:00:00.000Z',
        auto_reset_at: '2026-09-21T08:00:00.000Z',
        auto_reset_enabled: true,
        reset_done: false,
      },
    } as unknown as AppSettings);
    expect(screen.getByTestId('sulbun-open-btn').textContent).toContain('🍻 술번개 진행 중');
    expect(screen.getByTestId('sulbun-open-btn').textContent).toContain('자동 초기화: 9/21 17:00');
  });
});
