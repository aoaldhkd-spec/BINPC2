import { describe, expect, it } from 'vitest';
import {
  isPublicProfilePhotoPath,
  isValidStoragePath,
  isValidStoragePathList,
} from './db-storage-path.js';

describe('db-storage-path', () => {
  it('isValidStoragePath', () => {
    expect(isValidStoragePath('a/b/c.webp')).toBe(true);
    expect(isValidStoragePath('../x')).toBe(false);
    expect(isValidStoragePath('/abs')).toBe(false);
    expect(isValidStoragePath('')).toBe(false);
    expect(isValidStoragePath('a'.repeat(513))).toBe(false);
  });

  it('isValidStoragePathList + public profile', () => {
    expect(isValidStoragePathList(['a/b', 'c/d'])).toBe(true);
    expect(isValidStoragePathList([])).toBe(false);
    expect(isValidStoragePathList(['../x'])).toBe(false);
    expect(isPublicProfilePhotoPath('profile-photos/u1')).toBe(true);
    expect(isPublicProfilePhotoPath('chat/u1/x')).toBe(false);
  });
});
