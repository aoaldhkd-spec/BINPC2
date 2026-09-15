import { describe, expect, it } from 'vitest';
import {
  ALLOWED_IMAGE_MIMES,
  dataUrlMimeAndMagic,
  MAX_IMAGE_DATAURL_BYTES,
} from './db-image-magic.js';

function dataUrl(mime: string, bytes: number[]): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}

describe('db-image-magic', () => {
  it('accepts jpeg/png magic and rejects mismatch', () => {
    const jpeg = dataUrl('image/jpeg', [0xFF, 0xD8, 0xFF, 0x00]);
    expect(dataUrlMimeAndMagic(jpeg)).toEqual({ mime: 'image/jpeg', magicOk: true });

    const png = dataUrl('image/png', [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    expect(dataUrlMimeAndMagic(png)).toEqual({ mime: 'image/png', magicOk: true });

    const lying = dataUrl('image/jpeg', [0x00, 0x01, 0x02, 0x03]);
    expect(dataUrlMimeAndMagic(lying)).toEqual({ mime: 'image/jpeg', magicOk: false });
  });

  it('rejects unknown mime / bad structure', () => {
    expect(dataUrlMimeAndMagic('not-a-data-url')).toBeNull();
    expect(dataUrlMimeAndMagic('data:image/svg+xml;base64,aaa')).toBeNull();
    expect(ALLOWED_IMAGE_MIMES.has('image/webp')).toBe(true);
    expect(MAX_IMAGE_DATAURL_BYTES).toBe(9_000_000);
  });

  it('webp requires RIFF + WEBP signatures', () => {
    const bytes = Buffer.alloc(16, 0);
    bytes.write('RIFF', 0);
    bytes.write('WEBP', 8);
    const ok = dataUrl('image/webp', [...bytes]);
    expect(dataUrlMimeAndMagic(ok)?.magicOk).toBe(true);
    bytes.write('XXXX', 8);
    const bad = dataUrl('image/webp', [...bytes]);
    expect(dataUrlMimeAndMagic(bad)?.magicOk).toBe(false);
  });
});
