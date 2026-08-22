import { describe, it, expect } from 'vitest';
import {
  genNpcTextAvatar,
  isNpcTextAvatar,
  NPC_TEXT_AVATAR_MESSAGE,
  NPC_TEXT_AVATAR_SENTINEL,
} from './npc-text-avatar';

describe('npc text avatar', () => {
  it('recognizes sentinel', () => {
    expect(isNpcTextAvatar(NPC_TEXT_AVATAR_SENTINEL)).toBe(true);
    expect(isNpcTextAvatar('npc:text-v2')).toBe(false);
    expect(isNpcTextAvatar('/avatars/av1.webp')).toBe(false);
  });

  it('renders greeting message in SVG', () => {
    const svg = decodeURIComponent(
      genNpcTextAvatar().replace(/^data:image\/svg\+xml;charset=utf-8,/, ''),
    );
    expect(svg).toContain('안녕하세요');
    expect(svg).toContain('범일NPC입니다');
    expect(NPC_TEXT_AVATAR_MESSAGE).toContain('문의사항');
    expect(svg).toContain('직접 알려주세요');
  });
});
