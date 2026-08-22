import { describe, it, expect } from 'vitest';
import {
  PRESET_AVATAR_IDS,
  resolveEntryAvatar,
} from './avatar-pool';

describe('resolveEntryAvatar', () => {
  it('catalog has hundreds of presets', () => {
    expect(PRESET_AVATAR_IDS.length).toBeGreaterThanOrEqual(300);
  });

  it('assigns unused preset for genAvatar / empty entry photo', () => {
    const used = new Set(['av1', 'av2']);
    const r = resolveEntryAvatar(used, 'data:image/svg+xml;charset=utf-8,abc', PRESET_AVATAR_IDS, 100, () => 0);
    expect(r.ok).toBe(true);
    if (r.ok && r.assigned) {
      expect(used.has(r.id)).toBe(false);
      expect(r.path).toMatch(/^\/avatars\/av\d+\.webp$/);
    }
  });

  it('keeps storage upload untouched', () => {
    const url = '/api/db/storage-image?p=profile-photos%2Fu1&t=1';
    const r = resolveEntryAvatar(new Set(PRESET_AVATAR_IDS), url);
    expect(r).toEqual({ ok: true, assigned: false, path: url });
  });

  it('avoids duplicate while pool has free slots', () => {
    const used = new Set(['av1']);
    const pool = ['av1', 'av2', 'av3'];
    const r1 = resolveEntryAvatar(used, null, pool, 100, () => 0);
    expect(r1.ok).toBe(true);
    if (r1.ok && r1.assigned) {
      used.add(r1.id);
      const r2 = resolveEntryAvatar(used, null, pool, 100, () => 0);
      expect(r2.ok).toBe(true);
      if (r2.ok && r2.assigned) {
        expect(r2.id).not.toBe(r1.id);
      }
    }
  });

  it('POOL_EXHAUSTED when every preset taken', () => {
    const pool = ['av1', 'av2'];
    const used = new Set(pool);
    expect(resolveEntryAvatar(used, null, pool)).toEqual({ ok: false, code: 'POOL_EXHAUSTED' });
  });
});
