// @vitest-environment happy-dom
/**
 * 4테마 전환 시 자식 폼/로컬 상태가 리마운트되지 않는지 고정.
 * ThemeProvider는 context만 바꾸고 children을 교체하지 않아야 한다.
 */
import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, useTheme, type ThemeMode } from '../lib/theme';

const MODES: ThemeMode[] = ['default', 'y2k', 'dark-neon', 'minimal'];

function Probe() {
  const { theme, setTheme } = useTheme();
  const [draft, setDraft] = useState('keep-me');
  return (
    <div>
      <input aria-label="draft" value={draft} onChange={(e) => setDraft(e.target.value)} />
      <span data-testid="theme">{theme}</span>
      {MODES.map((m) => (
        <button key={m} type="button" onClick={() => setTheme(m)}>{m}</button>
      ))}
    </div>
  );
}

describe('theme switch preserves local form state', () => {
  it('cycles all 4 themes without wiping an in-progress input', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    const input = screen.getByLabelText('draft') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'typing-under-load' } });
    for (const mode of MODES) {
      fireEvent.click(screen.getByRole('button', { name: mode }));
      expect(screen.getByTestId('theme').textContent).toBe(mode);
      expect((screen.getByLabelText('draft') as HTMLInputElement).value).toBe('typing-under-load');
    }
    expect(localStorage.getItem('app_theme_mode_v1')).toBe('minimal');
  });
});
