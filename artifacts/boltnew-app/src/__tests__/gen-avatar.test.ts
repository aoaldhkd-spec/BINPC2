import { describe, it, expect } from 'vitest';
import { genAvatar } from '../lib/profile';

describe('genAvatar', () => {
  it('같은 닉네임은 같은 SVG를 생성한다', () => {
    expect(genAvatar('민수')).toBe(genAvatar('민수'));
  });

  it('다른 닉네임은 다른 색상을 사용한다', () => {
    const a = genAvatar('민수');
    const b = genAvatar('지훈');
    expect(a).not.toBe(b);
  });

  it('한글 닉네임 다수가 동일 단색(주황)으로 몰리지 않는다', () => {
    const nicks = ['민수', '지훈', '서연', '하늘', '준호', '유진', '태양', '수빈'];
    const unique = new Set(nicks.map(genAvatar));
    expect(unique.size).toBeGreaterThan(3);
  });

  it('data URL SVG 형식이다', () => {
    expect(genAvatar('test')).toMatch(/^data:image\/svg\+xml/);
  });
});
