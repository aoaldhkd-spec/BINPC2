// @vitest-environment happy-dom
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InterestPicker } from './InterestPicker';

describe('InterestPicker', () => {
  afterEach(() => cleanup());

  it('shows all three categories and their tags in each group at once', () => {
    render(<InterestPicker selected={[]} onToggle={vi.fn()} />);

    for (const category of ['스포츠/활동', '음식/음주', '취미/라이프', '뜨밤 & 기타', '엔터/미디어', '여가/사교']) {
      expect(screen.getByText(new RegExp(category.replace('/', '\\/')))).toBeTruthy();
    }
    for (const tag of ['운동', '기타 운동', '카페', '여행', '음악감상', '보드게임']) {
      expect(screen.getByRole('button', { name: tag })).toBeTruthy();
    }
  });
});
