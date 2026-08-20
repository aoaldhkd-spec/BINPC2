import { describe, expect, it } from 'vitest';
import { isDarkTheme } from './theme';
import { isProfileCardDark, profileCardChipStyle, profileCardShellIsWhite, profileCardSurfaces } from './profile-card-theme';

describe('profile-card-theme (dark vs light)', () => {
  it('marks dark-neon as dark chrome; default/y2k/minimal as light', () => {
    expect(isDarkTheme('default')).toBe(false);
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
    expect(profileCardSurfaces('default', true).shellClass).toContain('bg-white');
  });
  it('App darkMode dims light theme cards', () => {
    expect(isProfileCardDark('y2k', true)).toBe(true);
    expect(profileCardShellIsWhite('y2k', true)).toBe(false);
    expect(profileCardSurfaces('dark-neon', false).shellClass).not.toContain('bg-white');
  });
  it('light themes keep white card shell / nick bar', () => {
    for (const theme of ['y2k', 'minimal'] as const) expect(profileCardShellIsWhite(theme)).toBe(true);
  });
  it('dark chip style drops solid pastel fill for translucent accent', () => {
    expect(profileCardChipStyle({ bg: '#f0fdf4', text: '#15803d', border: '#86efac' }, true).backgroundColor).toMatch(/^rgba\(/);
  });
});
