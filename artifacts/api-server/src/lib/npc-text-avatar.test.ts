import { describe, it, expect } from 'vitest';
import { isNpcTextAvatar, NPC_TEXT_AVATAR_SENTINEL } from '../lib/npc-text-avatar';

describe('npc-text-avatar sentinel', () => {
  it('matches only the v1 sentinel', () => {
    expect(isNpcTextAvatar(NPC_TEXT_AVATAR_SENTINEL)).toBe(true);
    expect(isNpcTextAvatar('npc:text-v2')).toBe(false);
    expect(isNpcTextAvatar(null)).toBe(false);
  });
});
