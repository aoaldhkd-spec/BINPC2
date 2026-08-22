import { describe, it, expect } from 'vitest';
import {
  genAvatar,
  hasUploadedPhoto,
  getAvatarSrc,
  isPresetAvatar,
  resolveAvatarColorIndex,
  getAvatarGradientCssForProfile,
  getAvatarGradient,
} from '../lib/profile';

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

  it('hasUploadedPhoto: webp 프리셋·업로드는 true, null·svg·dicebear는 false', () => {
    expect(hasUploadedPhoto(null)).toBe(false);
    expect(hasUploadedPhoto('')).toBe(false);
    expect(hasUploadedPhoto('https://cdn.example/avatars/av1.webp')).toBe(true);
    expect(hasUploadedPhoto(genAvatar('test'))).toBe(false);
    expect(hasUploadedPhoto('https://api.dicebear.com/7.x/thumbs/svg?seed=x')).toBe(false);
  });

  it('getAvatarSrc: 사진 없으면 genAvatar, webp는 유지', () => {
    const webp = 'https://cdn.example/avatars/av1.webp';
    expect(getAvatarSrc(null, '민수')).toBe(genAvatar('민수'));
    expect(getAvatarSrc(webp, '민수')).toBe(webp);
  });

  it('storage 사진은 요청한 버전으로 캐시를 무효화한다', () => {
    const stored = '/api/db/storage-image?p=profile-photos%2Fuser-1';
    expect(getAvatarSrc(stored, '민수', 1234)).toBe(`${stored}&v=1234`);
    expect(getAvatarSrc(genAvatar('민수'), '민수', 1234)).toBe(genAvatar('민수'));
  });

  it('bundled WebP presets are distinguished from uploaded photos', () => {
    expect(isPresetAvatar('/avatars/av360.webp')).toBe(true);
    expect(isPresetAvatar('/app/avatars/av1.webp?v=2')).toBe(true);
    expect(isPresetAvatar('/api/db/storage-image?p=profile-photos%2Fuser-1')).toBe(false);
  });

  it('avatar_color overrides nickname hash for card gradient', () => {
    expect(resolveAvatarColorIndex({ nickname: '민수', avatar_color: 5 })).toBe(5);
    expect(getAvatarGradientCssForProfile({ nickname: '민수', avatar_color: 5 }))
      .toBe(getAvatarGradientCssForProfile({ nickname: '다른닉', avatar_color: 5 }));
    expect(getAvatarGradient('민수', 5)).toEqual(getAvatarGradient('다른닉', 5));
  });

  it('null avatar_color keeps nickname-based auto color', () => {
    const auto = resolveAvatarColorIndex({ nickname: '민수', avatar_color: null });
    expect(auto).toBe(resolveAvatarColorIndex({ nickname: '민수' }));
    expect(genAvatar('민수')).toBe(genAvatar('민수', null));
  });
});
