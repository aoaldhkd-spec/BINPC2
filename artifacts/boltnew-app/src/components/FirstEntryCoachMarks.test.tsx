// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FirstEntryCoachMarks } from './FirstEntryCoachMarks';

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  const memory = {
    get length() { return store.size; },
    clear() { store.clear(); },
    getItem(key: string) { return store.has(key) ? store.get(key)! : null; },
    setItem(key: string, value: string) { store.set(key, String(value)); },
    removeItem(key: string) { store.delete(key); },
    key(index: number) { return [...store.keys()][index] ?? null; },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: memory, configurable: true });
}

describe('FirstEntryCoachMarks tip 1', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
  });

  it('shows participant tip 1 after main shell paint frames for brand-new users', async () => {
    render(
      <FirstEntryCoachMarks
        isSubScreen={false}
        mainTab="profiles"
        suspended={false}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('first-entry-coach')).toBeTruthy();
    });
    expect(screen.getByText('여기는 참여자 카드예요')).toBeTruthy();
    expect(screen.getByLabelText('1단계 중 11단계')).toBeTruthy();
  });

  it('stays hidden when coach was completed', () => {
    localStorage.setItem('binpc2_coach_marks_completed', '1');
    render(
      <FirstEntryCoachMarks
        isSubScreen={false}
        mainTab="profiles"
        suspended={false}
      />,
    );
    expect(screen.queryByTestId('first-entry-coach')).toBeNull();
  });

  it('forces participants when mounted off-tab while pending', () => {
    const force = vi.fn();
    render(
      <FirstEntryCoachMarks
        isSubScreen={false}
        mainTab="my"
        suspended={false}
        onForceParticipants={force}
      />,
    );
    expect(force).toHaveBeenCalled();
    // Tip is gated on openTab===mainTab; stays pending until profiles arrives.
    expect(screen.queryByTestId('first-entry-coach')).toBeNull();
  });

  it('after home tips finish, navigates to my and shows hearts/chat tip', async () => {
    const navigate = vi.fn();
    const { rerender } = render(
      <FirstEntryCoachMarks
        isSubScreen={false}
        mainTab="profiles"
        suspended={false}
        onNavigateTab={navigate}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('first-entry-coach')).toBeTruthy());

    // Advance through all 11 home steps.
    for (let i = 0; i < 11; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: '다음' }));
    }

    expect(navigate).toHaveBeenCalledWith('my');
    expect(localStorage.getItem('binpc2_coach_marks_v5_home_done')).toBe('1');
    expect(localStorage.getItem('binpc2_coach_marks_completed')).toBeNull();

    rerender(
      <FirstEntryCoachMarks
        isSubScreen={false}
        mainTab="my"
        suspended={false}
        onNavigateTab={navigate}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('여기는 내 상태예요')).toBeTruthy();
    });
    expect(screen.getByLabelText('1단계 중 2단계')).toBeTruthy();
  });
});
