// @vitest-environment happy-dom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventScheduleBanner } from './EventScheduleBanner';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('EventScheduleBanner automatic daily notices', () => {
  it('shows 23:00 heart countdown without manual notice settings', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T22:50:00+09:00'));
    render(<EventScheduleBanner raw={null} />);
    expect(screen.getByTestId('daily-cycle-notice').textContent).toContain('23시');
    expect(screen.getByTestId('daily-cycle-countdown').textContent).toContain('남은시간 10:00');
  });

  it('shows rainbow -> 01:00 closing phase', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-06T00:30:00+09:00'));
    render(<EventScheduleBanner raw={null} showStatus={false} />);
    expect(screen.getByTestId('daily-cycle-notice').textContent).toContain('무지개하트가 풀렸습니다');
    expect(screen.getByTestId('daily-cycle-notice').textContent).toContain('01시');
    expect(screen.queryByTestId('banner-chat-lock')).toBeNull();
  });

  it('shows 17:00 reset countdown after closing', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-06T10:00:00+09:00'));
    render(<EventScheduleBanner raw={null} showStatus={false} />);
    expect(screen.getByTestId('daily-cycle-notice').textContent).toContain('17시');
    expect(screen.getByTestId('daily-cycle-countdown').textContent).toContain('남은시간 7:00:00');
  });
});
