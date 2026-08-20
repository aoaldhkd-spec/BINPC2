import { describe, expect, it } from 'vitest';
import { isDarkTheme } from './theme';
import {
  isProfileCardDark,
  profileCardChipStyle,
  profileCardShellIsWhite,
  profileCardSurfaces,
} from './profile-card-theme';

describe('profile-card-theme (dark vs light)', () => {
  it('marks default + dark-neon as dark chrome; y2k + minimal as light', () => {
    expect(isDarkTheme('default')).toBe(true);
    expect(isDarkTheme('dark-neon')).toBe(true);
    expect(isDarkTheme('y2k')).toBe(false);
    expect(isDarkTheme('minimal')).toBe(false);
  });

  it('isProfileCardDark keeps default white', () => {
    expect(isProfileCardDark('default', false)).toBe(false);
    expect(isProfileCardDark('default', true)).toBe(false);
    expect(isProfileCardDark('dark-neon', false)).toBe(true);
  });

  it('default theme keeps white card shell even when darkMode is on', () => {
    expect(profileCardShellIsWhite('default', true)).toBe(true);
    const s = profileCardSurfaces('default', true);
    expect(s.shellClass).toContain('bg-white');
  });

  it('App darkMode dims light theme cards', () => {
    expect(isProfileCardDark('y2k', false)).toBe(false);
    expect(isProfileCardDark('y2k', true)).toBe(true);
    expect(isProfileCardDark('minimal', false)).toBe(false);
    expect(isProfileCardDark('minimal', true)).toBe(true);
    expect(profileCardShellIsWhite('y2k', true)).toBe(false);
    const neon = profileCardSurfaces('dark-neon', false);
    expect(neon.shellClass).not.toContain('bg-white');
    expect(String(neon.nickBarStyle.background)).toMatch(/15,\s*23,\s*42/);
  });

  it('dark chip style drops solid pastel fill for translucent accent', () => {
    const light = profileCardChipStyle(
      { bg: '#f0fdf4', text: '#15803d', border: '#86efac' },
      false,
    );
    const dark = profileCardChipStyle(
      { bg: '#f0fdf4', text: '#15803d', border: '#86efac' },
      true,
    );
    expect(light.backgroundColor).toBe('#f0fdf4');
    expect(dark.backgroundColor).toMatch(/^rgba\(/);
    expect(dark.backgroundColor).not.toBe('#f0fdf4');
    expect(dark.color).toBe('#86efac');
  });
});
