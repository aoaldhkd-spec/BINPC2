// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  readProfileCardGridMode,
  writeProfileCardGridMode,
  profileGridClassName,
  profileGridColSpan,
  PROFILE_CARD_GRID_KEY,
} from './profile-card-grid';

describe('profile-card-grid', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to 3 columns', () => {
    expect(readProfileCardGridMode()).toBe('3');
    expect(profileGridColSpan('3')).toBe(3);
    expect(profileGridClassName('3')).toContain('grid-cols-3');
    expect(profileGridClassName('3')).toContain('overflow-visible');
  });

  it('persists valid mode in localStorage', () => {
    writeProfileCardGridMode('2');
    expect(localStorage.getItem(PROFILE_CARD_GRID_KEY)).toBe('2');
    expect(readProfileCardGridMode()).toBe('2');
    expect(profileGridClassName('2')).toContain('grid-cols-2');
  });

  it('ignores invalid stored values', () => {
    localStorage.setItem(PROFILE_CARD_GRID_KEY, '9');
    expect(readProfileCardGridMode()).toBe('3');
  });

  it('compact mode uses 3 columns with square cards', () => {
    expect(profileGridColSpan('compact')).toBe(3);
    expect(profileGridClassName('compact')).toContain('grid-cols-3');
    expect(profileGridClassName('compact')).toContain('gap-1');
  });
});
