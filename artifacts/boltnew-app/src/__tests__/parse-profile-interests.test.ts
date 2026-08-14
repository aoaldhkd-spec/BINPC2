import { describe, expect, it } from 'vitest';
import { parseProfileInterests } from '../lib/interests';

describe('parseProfileInterests', () => {
  it('reads comma-separated interests field', () => {
    expect(parseProfileInterests({ interests: '운동, 카페', bio: null })).toEqual(['운동', '카페']);
  });

  it('falls back to bio when interests is empty', () => {
    expect(parseProfileInterests({ interests: null, bio: '맛집탐방, OTT' })).toEqual(['맛집탐방', 'OTT']);
  });

  it('parses JSON array string in interests', () => {
    expect(parseProfileInterests({ interests: '["헬스","게임"]', bio: null })).toEqual(['헬스', '게임']);
  });

  it('accepts array interests from edit save', () => {
    expect(parseProfileInterests({ interests: ['여행', '독서'], bio: 'ignored' })).toEqual(['여행', '독서']);
  });

  it('deduplicates tags', () => {
    expect(parseProfileInterests({ interests: '운동, 운동, 카페' })).toEqual(['운동', '카페']);
  });
});
