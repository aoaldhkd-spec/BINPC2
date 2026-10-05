// @vitest-environment happy-dom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardTab } from './DashboardTab';
import type { AppSettings, DbHealthData } from './shared';

afterEach(() => cleanup());
const noop = async () => {};

function renderDash(settings: AppSettings | null, opts?: {
  onToggleSession?: () => void;
  onSulbunOpen?: () => void | Promise<void>;
  dbHealth?: DbHealthData | null;
}) {
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
        dbHealth={opts?.dbHealth ?? null}
        dbHealthLoading={false}
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

  it('shows one-glance live development and operations status', () => {
    renderDash(activeSettings, {
      dbHealth: {
        persistErrors: 0,
        recentErrors: [],
        inMemory: { messages: 1, likes: 2 },
        db: { messages: 1, likes: 2 },
        sseConnections: 7,
        pinPool: { remaining: 8990, total: 9000 },
        alarms: [],
        ok: true,
        checkedAt: '2026-10-05T11:00:00.000Z',
        runtime: {
          commit: '5808dcada0228d96',
          service: 'BINPC2',
          uptimeSec: 3600,
          processStartedAt: '2026-10-05T10:00:00.000Z',
          node: 'v24.0.0',
          pushConfigured: true,
          pushSubscriptions: 3,
          dailyCycle: '23:00 hearts / 24:00 rainbow / 01:00 close / 17:00 reset',
        },
        httpMetrics: {
          since: '2026-10-05T10:00:00.000Z',
          unauthorized: {},
          forbidden: {},
          rateLimited: {},
          expiredSseTokens: 0,
          missingSseTokens: 0,
          sseConnectionsAccepted: 8,
          sseConnectionsClosed: 1,
          uploadRejections: {},
          uploadsAccepted: 0,
          pushAttempts: 5,
          pushSucceeded: 4,
          pushExpired: 1,
          pushRetries: 2,
          pushErrors: 0,
        },
      },
    });
    const card = screen.getByTestId('ops-overview-card');
    expect(card.textContent).toContain('개발·운영 현황');
    expect(card.textContent).toContain('5808dcad');
    expect(card.textContent).toContain('7 연결');
    expect(card.textContent).toContain('ON · 3구독');
    expect(card.textContent).toContain('Push 성공 4');
    expect(card.textContent).toContain('재시도 2');
  });
});
