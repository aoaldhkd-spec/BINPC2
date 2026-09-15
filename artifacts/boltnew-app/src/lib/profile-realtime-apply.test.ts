import { describe, expect, it } from 'vitest';
import {
  planProfilesAfterDelete,
  planProfilesAfterInsert,
  planProfilesAfterUpdate,
} from './profile-realtime-apply';
import { SWIPE_GESTURE_VERIFY_MARKER } from './profile';
import type { Profile } from '../types/app';

const p = (
  id: string,
  nickname: string,
  extra: Partial<Profile> = {},
): Profile => ({ id, nickname, created_at: '2026-01-01T00:00:00.000Z', ...extra } as Profile);

describe('profile-realtime-apply', () => {
  it('planProfilesAfterInsert appends new rows and skips dupes', () => {
    const a = p('a', 'A');
    const b = p('b', 'B');
    const prev = [a];
    expect(planProfilesAfterInsert(prev, b, 'me')).toEqual([a, b]);
    expect(planProfilesAfterInsert(prev, a, 'me')).toBe(prev);
  });

  it('planProfilesAfterInsert skips verify decoy unless self', () => {
    const decoy = p('v', SWIPE_GESTURE_VERIFY_MARKER, { bio: SWIPE_GESTURE_VERIFY_MARKER });
    const prev: Profile[] = [];
    expect(planProfilesAfterInsert(prev, decoy, 'me')).toEqual([]);
    expect(planProfilesAfterInsert(prev, decoy, 'v')).toEqual([decoy]);
  });

  it('planProfilesAfterUpdate patches fields without reorder', () => {
    const a = p('a', 'A');
    const b = p('b', 'B');
    const next = planProfilesAfterUpdate([a, b], { ...a, nickname: 'A2' }, 'me');
    expect(next.map((x) => x.id)).toEqual(['a', 'b']);
    expect(next[0].nickname).toBe('A2');
  });

  it('planProfilesAfterDelete removes by id', () => {
    const a = p('a', 'A');
    const b = p('b', 'B');
    expect(planProfilesAfterDelete([a, b], 'a').map((x) => x.id)).toEqual(['b']);
  });
});
