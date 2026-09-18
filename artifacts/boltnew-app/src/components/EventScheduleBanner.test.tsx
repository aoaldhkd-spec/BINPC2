// @vitest-environment happy-dom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventScheduleBanner } from './EventScheduleBanner';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function rawWith(flags: {
  show_notice_time?: boolean;
  show_unlock_time?: boolean;
  show_countdown?: boolean;
}): string {
  return JSON.stringify({
    version: 2,
    timezone: 'Asia/Seoul',
    slots: [{ id: 'slot-1', at: '23:00', notice_at: '22:40', unlock: ['red'] }],
    ...flags,
  });
}

describe('EventScheduleBanner auto-notice checks', () => {
  it('renders only checked items on the existing one-line banner', () => {
    vi.setSystemTime(new Date('2026-09-17T22:50:00+09:00'));

    const { rerender } = render(
      <EventScheduleBanner raw={rawWith({ show_notice_time: true, show_unlock_time: false, show_countdown: false })} />,
    );
    expect(screen.getByTestId('heart-ops-auto-notice').textContent).toBe('호감 하트 22:40 공지');

    rerender(
      <EventScheduleBanner raw={rawWith({ show_notice_time: true, show_unlock_time: true, show_countdown: false })} />,
    );
    expect(screen.getByTestId('heart-ops-auto-notice').textContent).toBe('호감 하트 22:40 공지 · 23:00 해금');

    rerender(
      <EventScheduleBanner raw={rawWith({ show_notice_time: true, show_unlock_time: true, show_countdown: true })} />,
    );
    expect(screen.getByTestId('heart-ops-auto-notice').textContent).toContain('22:40 공지');
    expect(screen.getByTestId('heart-ops-auto-notice').textContent).toContain('23:00 해금');
    expect(screen.getByTestId('heart-ops-auto-notice').textContent).toContain('해금까지');
  });
});
