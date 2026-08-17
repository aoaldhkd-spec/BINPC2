import { describe, expect, it } from 'vitest';
import {
  fitProfilePhotoSize,
  PROFILE_PHOTO_MAX_INPUT_BYTES,
  PROFILE_PHOTO_MAX_OUTPUT_PX,
  PROFILE_PHOTO_OUTPUT_QUALITY,
  validateProfilePhotoFile,
} from '../lib/profile-photo';

const file = (name: string, type: string, size = 1024) => ({ name, type, size });

describe('profile photo validation', () => {
  it('uses a 2048px quality cap without upscaling smaller photos', () => {
    expect(PROFILE_PHOTO_MAX_OUTPUT_PX).toBe(2048);
    expect(PROFILE_PHOTO_OUTPUT_QUALITY).toBe(0.92);
    expect(fitProfilePhotoSize(4032, 3024)).toEqual({ width: 2048, height: 1536 });
    expect(fitProfilePhotoSize(1200, 900)).toEqual({ width: 1200, height: 900 });
  });

  it.each([
    ['photo.jpg', 'image/jpeg'],
    ['photo.jpeg', 'image/jpeg'],
    ['photo.png', 'image/png'],
    ['photo.webp', 'image/webp'],
    ['photo.gif', 'image/gif'],
  ])('accepts browser-decodable %s files', (name, type) => {
    expect(validateProfilePhotoFile(file(name, type))).toEqual({ ok: true, mime: type });
  });

  it('uses a safe extension when the browser omits MIME metadata', () => {
    expect(validateProfilePhotoFile(file('camera.JPG', ''))).toEqual({ ok: true, mime: 'image/jpeg' });
    expect(validateProfilePhotoFile(file('camera.jpg', 'image/jpg'))).toEqual({ ok: true, mime: 'image/jpeg' });
  });

  it.each([
    ['photo.heic', 'image/heic'],
    ['photo.heif', 'image/heif'],
    ['photo.HEIC', ''],
  ])('explicitly rejects undecodable %s files', (name, type) => {
    const result = validateProfilePhotoFile(file(name, type));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('HEIC/HEIF');
  });

  it('rejects unsupported, empty, and oversized input', () => {
    expect(validateProfilePhotoFile(file('photo.bmp', 'image/bmp')).ok).toBe(false);
    expect(validateProfilePhotoFile(file('fake.jpg', 'image/bmp')).ok).toBe(false);
    expect(validateProfilePhotoFile(file('photo.jpg', 'image/jpeg', 0)).ok).toBe(false);
    expect(validateProfilePhotoFile(file(
      'photo.jpg',
      'image/jpeg',
      PROFILE_PHOTO_MAX_INPUT_BYTES + 1,
    )).ok).toBe(false);
  });
});
