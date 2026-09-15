import { describe, expect, it } from 'vitest';
import {
  isPublicProfilePhotoPath,
  isValidStoragePath,
  isValidStoragePathList,
  planStorageUploadAuthPath,
  planStorageUploadContent,
  planStorageRemove,
  planStorageImageAuth,
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

  it('planStorageUploadAuthPath then Content preserves order semantics', () => {
    const auth = planStorageUploadAuthPath({
      body: { path: 'profile-photos/u1', dataUrl: 'data:image/png;base64,xx' },
      userId: 'u1',
      canUpload: () => true,
    });
    expect(auth.ok).toBe(true);
    if (!auth.ok) return;
    const limited = planStorageUploadContent({
      path: auth.path,
      dataUrl: 'data:image/png;base64,xx',
      uploadUserRate: 'limited',
      uploadIpBurst: 'ok',
      dataUrlMimeAndMagic: () => ({ mime: 'image/png', magicOk: true }),
      maxDataUrlBytes: 1000,
    });
    expect(limited.ok).toBe(false);
    if (limited.ok) return;
    expect(limited.reject.rejectReason).toBe('rate_limited');
    expect(String((limited.reject.body as { error: string }).error)).toContain('이미지를 너무 자주');
  });

  it('planStorageRemove + image auth', () => {
    const bad = planStorageRemove({ userId: null, paths: ['a'], canRemove: () => true });
    expect(bad.ok).toBe(false);
    const ok = planStorageRemove({
      userId: 'u1',
      paths: ['chat/u1/x'],
      canRemove: () => true,
    });
    expect(ok.ok).toBe(true);
    const img = planStorageImageAuth({
      path: 'profile-photos/u1',
      userId: null,
      adminOk: false,
      canRead: () => false,
    });
    expect(img.ok).toBe(true); // public
  });
});
