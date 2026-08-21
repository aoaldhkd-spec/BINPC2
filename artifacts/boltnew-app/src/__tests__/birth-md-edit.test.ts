import { describe, expect, it } from 'vitest';
import {
  BIRTH_MD_EDIT_MAX,
  birthMdEditsRemaining,
  birthMdWouldChange,
  getBirthMdEditCount,
  isBirthMdEditLocked,
  nextBirthMdEditCount,
} from '../lib/birth-md-edit';

describe('birth-md-edit', () => {
  it('allows up to BIRTH_MD_EDIT_MAX changes', () => {
    expect(BIRTH_MD_EDIT_MAX).toBe(2);
    const profile = { birth_month: 3, birth_day: 15, birth_md_edit_count: 0 };
    expect(isBirthMdEditLocked(profile)).toBe(false);
    expect(birthMdEditsRemaining(profile)).toBe(2);
    expect(nextBirthMdEditCount(profile, 4, 20)).toBe(1);
    expect(isBirthMdEditLocked({ ...profile, birth_md_edit_count: 1 })).toBe(false);
    expect(birthMdEditsRemaining({ ...profile, birth_md_edit_count: 1 })).toBe(1);
    expect(isBirthMdEditLocked({ ...profile, birth_md_edit_count: 2 })).toBe(true);
    expect(birthMdEditsRemaining({ ...profile, birth_md_edit_count: 2 })).toBe(0);
  });

  it('does not count saves with unchanged month/day', () => {
    const profile = { birth_month: 5, birth_day: 10, birth_md_edit_count: 1 };
    expect(birthMdWouldChange(profile, 5, 10)).toBe(false);
    expect(nextBirthMdEditCount(profile, 5, 10)).toBe(1);
    expect(getBirthMdEditCount(profile)).toBe(1);
  });
});
