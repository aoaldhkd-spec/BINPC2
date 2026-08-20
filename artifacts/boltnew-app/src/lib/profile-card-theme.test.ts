import { describe, expect, it } from 'vitest';
import { isDarkTheme } from './theme';
import {
  isProfileCardDark,
  profileCardChipStyle,
  profileCardShellIsWhite,
  profileCardSurfaces,
} from './profile-card-theme';

describe('profile-card-theme (dark vs light)', () => {
  it('marks default + dark-neon as dark; y2k + minimal as light', () => {
    expect(isDarkTheme('default')).toBe(true);
    expect(isDarkTheme('dark-neon')).toBe(true);
    expect(isDarkTheme('y2k')).toBe(false);
    expect(isDarkTheme('minimal')).toBe(false);
  });

  it('dark themes use non-white card shell / nick bar', () => {
    for (const theme of ['default', 'dark-neon'] as const) {
      expect(isProfileCardDark(theme)).toBe(true);
      expect(profileCardShellIsWhite(theme)).toBe(false);
      const s = profileCardSurfaces(theme);
      expect(s.shellClass).not.toContain('bg-white');
      expect(String(s.nickBarStyle.background)).not.toMatch(/255,\s*255,\s*255/);
      expect(s.metaClass).not.toBe('bg-white');
    }
  });

  it('App darkMode dims light theme cards without changing ThemeMode', () => {
    expect(profileCardShellIsWhite('y2k', true)).toBe(false);
    expect(profileCardShellIsWhite('minimal', true)).toBe(false);
    expect(profileCardSurfaces('y2k', true).shellClass).toContain('bg-slate-900');
    expect(profileCardShellIsWhite('y2k', false)).toBe(true);
    expect(isProfileCardDark('default', false)).toBe(true);
  });

  it('light themes keep white card shell / nick bar', () => {
    for (const theme of ['y2k', 'minimal'] as const) {
      expect(profileCardShellIsWhite(theme)).toBe(true);
      const s = profileCardSurfaces(theme);
      expect(s.shellClass).toContain('bg-white');
      expect(String(s.nickBarStyle.background)).toMatch(/255,\s*255,\s*255/);
      expect(s.metaClass).toBe('bg-white');
    }
  });

  it('dark chip style drops solid pastel fill for translucent accent', () => {
    const light = profileCardChipStyle({ bg: '#f0fdf4', text: '#15803d', border: '#86efac' }, false);
    const dark = profileCardChipStyle({ bg: '#f0fdf4', text: '#15803d', border: '#86efac' }, true);
    expect(light.backgroundColor).toBe('#f0fdf4');
    expect(dark.backgroundColor).toMatch(/^rgba\(/);
    expect(dark.backgroundColor).not.toBe('#f0fdf4');
    expect(dark.color).toBe('#86efac');
  });
});