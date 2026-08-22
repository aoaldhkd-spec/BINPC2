import { describe, it, expect } from 'vitest';
import { buildAvatarPickerTabs } from './avatar-picker-tabs';
import { AVATAR_CATEGORIES } from './avatar-catalog';
import { AVATAR_COLOR_CATEGORIES } from './avatar-color-catalog';

describe('buildAvatarPickerTabs', () => {
  it('merges avatar and color categories into one tab list', () => {
    const tabs = buildAvatarPickerTabs(false);
    expect(tabs.length).toBe(AVATAR_CATEGORIES.length + AVATAR_COLOR_CATEGORIES.length);
    expect(tabs.some((t) => t.kind === 'avatars')).toBe(true);
    expect(tabs.some((t) => t.kind === 'colors')).toBe(true);
    expect(tabs.some((t) => t.kind === 'npc-text')).toBe(false);
  });

  it('appends 범일NPC tab only for admin picker', () => {
    const tabs = buildAvatarPickerTabs(true);
    const npc = tabs.filter((t) => t.kind === 'npc-text');
    expect(npc).toHaveLength(1);
    expect(npc[0]?.label).toContain('범일NPC');
  });
});
