// @vitest-environment happy-dom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventScheduleBanner } from './EventScheduleBanner';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function rawWith(slot: {
  show_notice?: boolean;
  unlock?: string[];
  show_countdown?: boolean;
  notice_at?: string;
}): string {
  return JSON.stringify({
    version: 2,
    timezone: 'Asia/Seoul',
    slots: [{
      id: 'slot-red',
      at: '23:00',
      notice_at: slot.notice_at ?? '22:40',
      unlock: slot.unlock ?? ['red'],
      ...(slot.show_notice ? { show_notice: true } : {}),
    }],
    ...(slot.show_countdown === false ? { show_countdown: false } : {}),
  });
}

describe('EventScheduleBanner auto-notice checks', () => {
  it('renders only checked items on the existing one-line banner', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-17T22:50:00+09:00'));

    const { rerender } = render(
      <EventScheduleBanner raw={rawWith({ show_notice: true, unlock: [], show_countdown: false, notice_at: '22:55' })} />,
    );
    expect(screen.getByTestId('heart-ops-auto-notice').textContent).toBe('호감 하트 22:55 공지');

    rerender(
      <EventScheduleBanner raw={rawWith({ show_notice: true, show_countdown: false })} />,
    );
    expect(screen.getByTestId('heart-ops-auto-notice').textContent).toBe('호감 하트 22:40 공지 · 23:00 해금');

    rerender(
      <EventScheduleBanner raw={rawWith({ show_notice: true })} />,
    );
    expect(screen.getByTestId('heart-ops-auto-notice').textContent).toContain('22:40 공지');
    expect(screen.getByTestId('heart-ops-auto-notice').textContent).toContain('23:00 해금');
    expect(screen.getByTestId('heart-ops-auto-notice').textContent).toContain('해금까지');
  });

  it('shows scheduled direct notice only after 공지시간', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-17T22:50:00+09:00'));
    const raw = JSON.stringify({
      version: 2,
      timezone: 'Asia/Seoul',
      slots: [{ id: 'slot-red', at: '23:00', unlock: ['red'] }],
      direct_notices: [{ id: 'n1', text: '자리 이동해주세요.', at: '23:00', enabled: true }],
    });
    const { unmount } = render(<EventScheduleBanner raw={raw} />);
    expect(screen.queryByText('자리 이동해주세요.')).toBeNull();
    unmount();

    vi.setSystemTime(new Date('2026-09-17T23:00:00+09:00'));
    render(<EventScheduleBanner raw={raw} />);
    expect(screen.getByText('자리 이동해주세요.')).toBeTruthy();
  });
});
