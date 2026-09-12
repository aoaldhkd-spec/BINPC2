import { describe, expect, it } from 'vitest';
import { isProfileCardDark, profileCardChipStyle, profileCardShellIsWhite, profileCardSurfaces } from './profile-card-theme';

describe('profile-card-theme (dark vs light)', () => {
  it('follows App darkMode only', () => {
    expect(isProfileCardDark(false)).toBe(false);
    expect(isProfileCardDark(true)).toBe(true);
  });
  it('light mode keeps white card shell', () => {
    expect(profileCardShellIsWhite(false)).toBe(true);
    expect(profileCardSurfaces(false).shellClass).toContain('bg-white');
  });
  it('darkMode dims card shell', () => {
    expect(profileCardShellIsWhite(true)).toBe(false);
    expect(profileCardSurfaces(true).shellClass).toContain('bg-slate-900');
  });
  it('dark chip style drops solid pastel fill for translucent accent', () => {
    expect(profileCardChipStyle({ bg: '#f0fdf4', text: '#15803d', border: '#86efac' }, true).backgroundColor).toMatch(/^rgba\(/);
  });
});
