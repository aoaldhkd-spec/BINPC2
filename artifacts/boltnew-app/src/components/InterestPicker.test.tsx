// @vitest-environment happy-dom
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InterestPicker } from './InterestPicker';

describe('InterestPicker', () => {
  afterEach(() => cleanup());

  it('shows one merged major at a time with its three subcategories', () => {
    const onFilter = vi.fn();
    const { rerender } = render(<InterestPicker selected={[]} onToggle={vi.fn()} filter="활동·라이프" onFilter={onFilter} />);

    expect(screen.getByRole('button', { name: /활동·라이프/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/스포츠\/활동/)).toBeTruthy();
    expect(screen.getByText(/음식\/음주/)).toBeTruthy();
    expect(screen.getByText(/취미\/라이프/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '운동' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '음악감상' })).toBeNull();

    rerender(<InterestPicker selected={[]} onToggle={vi.fn()} filter="엔터·사교·기타" onFilter={onFilter} />);
    expect(screen.getByRole('button', { name: /엔터·사교·기타/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '음악감상' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '운동' })).toBeNull();
  });
});
