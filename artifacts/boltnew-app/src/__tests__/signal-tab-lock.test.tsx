// @vitest-environment happy-dom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SignalTab } from '../components/SignalTab';

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
  },
}));

describe('SignalTab — functions lock', () => {
  it('functionsLocked=true: 시그널 덱 대신 잠금 안내를 보여 준다', () => {
    const onLike = vi.fn();
    const onSelect = vi.fn();
    render(
      <SignalTab
        profiles={[]}
        currentUserId="me"
        userSignals={[]}
        sentHeartsPerPerson={new Map()}
        blockedUserIds={new Set()}
        hiddenByIds={new Set()}
        functionsLocked
        darkMode={false}
        onLike={onLike}
        onSelect={onSelect}
      />,
    );
    expect(screen.getByText(/시그널을 사용할 수 없어요/)).toBeTruthy();
    expect(onLike).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
