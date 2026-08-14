import { describe, it, expect } from 'vitest';
import { genAvatar } from '../lib/profile';

describe('genAvatar', () => {
  it('같은 닉네임은 같은 SVG를 생성한다', () => {
    expect(genAvatar('민수')).toBe(genAvatar('민수'));
  });

  it('서로 다른 닉네임은 그라디언트가 분산된다', () => {
    const nicks = ['민수', '지훈', '서연', '하늘', '준호', '유진', '태양', '수빈', 'Alex', 'Jordan', 'Sam', 'Riley', 'Casey', 'Morgan', 'Taylor'];
    const unique = new Set(nicks.map(genAvatar));
    expect(unique.size).toBeGreaterThan(3);
  });

  it('data URL SVG 형식이다', () => {
    expect(genAvatar('test')).toMatch(/^data:image\/svg\+xml/);
  });

  it('닉네임 첫 글자 텍스트를 SVG에 포함하지 않는다', () => {
    const svg = decodeURIComponent(genAvatar('민수').replace(/^data:image\/svg\+xml;charset=utf-8,/, ''));
    expect(svg).not.toContain('<text');
    expect(svg).not.toContain('민');
  });
});
