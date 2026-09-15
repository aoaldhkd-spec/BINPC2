/**
 * Image dataURL magic-byte checks — extracted from routes/db.ts.
 * MIME 헤더 조작으로 악성 파일을 이미지로 위장하는 공격 차단 (순수).
 */

export type ImageMagicSignature = { offset: number; bytes: number[] };

/** MIME → required byte signatures (all must match). */
export const IMAGE_MAGIC: Record<string, ImageMagicSignature[]> = {
  'image/jpeg': [{ offset: 0, bytes: [0xFF, 0xD8, 0xFF] }],
  'image/png':  [{ offset: 0, bytes: [0x89, 0x50, 0x4E, 0x47] }],
  'image/gif':  [{ offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] }],
  'image/webp': [
    { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF
    { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }, // WEBP
  ],
};

export const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/** Server dataURL length cap (~5MB original; client compress upper is 8M chars). */
export const MAX_IMAGE_DATAURL_BYTES = 9_000_000;

/**
 * Parse `data:<mime>;base64,...` and verify magic bytes match declared MIME.
 * Returns null when structure/MIME is invalid; otherwise whether content matches.
 */
export function dataUrlMimeAndMagic(
  dataUrl: string,
  allowedMimes: ReadonlySet<string> = ALLOWED_IMAGE_MIMES,
  magicMap: Record<string, ImageMagicSignature[]> = IMAGE_MAGIC,
): { mime: string; magicOk: boolean } | null {
  const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/);
  if (!mimeMatch || !allowedMimes.has(mimeMatch[1])) return null;
  const mime = mimeMatch[1];
  const expectedMagic = magicMap[mime];
  if (!expectedMagic) return { mime, magicOk: true };
  const base64Body = dataUrl.split(',')[1] ?? '';
  const rawBytes = Buffer.from(base64Body.slice(0, 24), 'base64');
  const matched = expectedMagic.every(signature =>
    signature.bytes.every((byte, index) => rawBytes[signature.offset + index] === byte),
  );
  return { mime, magicOk: matched };
}
