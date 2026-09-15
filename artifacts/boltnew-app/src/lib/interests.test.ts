import { describe, expect, it } from 'vitest';
import { ALL_BIO_TAGS, BIO_CATEGORIES, BIO_CATEGORY_GROUPS, parseProfileInterests } from './interests';

describe('interest catalog', () => {
  it('removes retired tags without removing neighboring interests', () => {
    const retired = [
      '필라테스/요가', '테니스', '낚시', '서핑', '복싱', '볼링', '자전거',
      '골프', '크로스핏', '등산', '스키/보드', '러닝',
      '디저트', '와인', '위스키', '브런치',
      '캠핑', '인테리어', '독서', '원예/식물', '명상/요가',
      '영화/드라마', '라이브방송', '팝/힙합', '재즈/클래식',
      '독서모임', '소모임', '봉사활동', '맥주축제', '페스티벌',
    ];
    expect(retired.every((tag) => !ALL_BIO_TAGS.includes(tag))).toBe(true);
    expect(ALL_BIO_TAGS).toContain('운동');
    expect(ALL_BIO_TAGS).toContain('기타 운동');
    expect(ALL_BIO_TAGS).toContain('카페');
    expect(ALL_BIO_TAGS).toContain('여행');
    expect(ALL_BIO_TAGS).toContain('음악감상');
    expect(ALL_BIO_TAGS).toContain('보드게임');
  });

  it('groups the six categories into top three and bottom three picker panels', () => {
    expect(BIO_CATEGORY_GROUPS).toEqual([
      { label: '활동·라이프', categories: ['스포츠/활동', '음식/음주', '취미/라이프'] },
      { label: '엔터·사교·기타', categories: ['뜨밤 & 기타', '엔터/미디어', '여가/사교'] },
    ]);
    expect(BIO_CATEGORY_GROUPS.flatMap((group) => group.categories)).toHaveLength(BIO_CATEGORIES.length);
  });

  it('keeps legacy saved tags readable even though pickers no longer offer them', () => {
    expect(parseProfileInterests({ interests: '독서, 와인, 운동' })).toEqual(['독서', '와인', '운동']);
  });
});
