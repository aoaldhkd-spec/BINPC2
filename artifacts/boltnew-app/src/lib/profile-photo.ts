export const PROFILE_PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif';

export const PROFILE_PHOTO_MAX_INPUT_BYTES = 20 * 1024 * 1024;
export const PROFILE_PHOTO_MAX_PIXELS = 40_000_000;
export const PROFILE_PHOTO_MAX_DATA_URL_CHARS = 8_000_000;
export const PROFILE_PHOTO_MAX_OUTPUT_PX = 2048;
export const PROFILE_PHOTO_OUTPUT_QUALITY = 0.92;
const PROFILE_PHOTO_FALLBACK_QUALITIES = [0.86, 0.8];

const SUPPORTED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
};
const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

export type ProfilePhotoValidation =
  | { ok: true; mime: string }
  | { ok: false; message: string };

export function fitProfilePhotoSize(
  sourceWidth: number,
  sourceHeight: number,
  maxPx = PROFILE_PHOTO_MAX_OUTPUT_PX,
): { width: number; height: number } {
  const scale = Math.min(1, maxPx / Math.max(sourceWidth, sourceHeight));
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

function fileExtension(name: string): string {
  return name.toLowerCase().split('.').pop() ?? '';
}

export function validateProfilePhotoFile(file: Pick<File, 'name' | 'type' | 'size'>): ProfilePhotoValidation {
  const extension = fileExtension(file.name);
  const declaredMime = file.type.toLowerCase();

  if (
    declaredMime === 'image/heic' ||
    declaredMime === 'image/heif' ||
    extension === 'heic' ||
    extension === 'heif'
  ) {
    return {
      ok: false,
      message: 'HEIC/HEIF 사진은 브라우저에서 안정적으로 표시할 수 없습니다. JPG, PNG, WebP 또는 GIF로 변환해 주세요.',
    };
  }

  const normalizedMime = MIME_ALIASES[declaredMime] ?? declaredMime;
  const canUseExtension = normalizedMime === '' || normalizedMime === 'application/octet-stream';
  const mime = SUPPORTED_MIMES.has(normalizedMime)
    ? normalizedMime
    : canUseExtension
      ? MIME_BY_EXTENSION[extension]
      : undefined;
  if (!mime) {
    return { ok: false, message: 'JPG, PNG, WebP 또는 GIF 이미지만 업로드할 수 있습니다.' };
  }
  if (file.size <= 0) {
    return { ok: false, message: '비어 있는 이미지 파일은 업로드할 수 없습니다.' };
  }
  if (file.size > PROFILE_PHOTO_MAX_INPUT_BYTES) {
    return { ok: false, message: '사진 원본은 20MB 이하여야 합니다.' };
  }
  return { ok: true, mime };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result.startsWith('data:')) {
        resolve(reader.result);
      } else {
        reject(new Error('파일을 읽을 수 없습니다.'));
      }
    };
    reader.readAsDataURL(file);
  });
}

function decodeImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('이 브라우저에서 사진을 해석할 수 없습니다.'));
    image.src = dataUrl;
  });
}

/**
 * Browser decode applies the file's EXIF orientation before drawing in modern
 * browsers. GIF uploads intentionally become a static JPEG using the first
 * decoded frame so every stored profile photo has a stable preview.
 */
export async function compressProfilePhoto(
  file: File,
  maxPx = PROFILE_PHOTO_MAX_OUTPUT_PX,
  quality = PROFILE_PHOTO_OUTPUT_QUALITY,
): Promise<string> {
  const validation = validateProfilePhotoFile(file);
  if (!validation.ok) throw new Error(validation.message);

  const dataUrl = await readAsDataUrl(file);
  const image = await decodeImage(dataUrl);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    sourceWidth * sourceHeight > PROFILE_PHOTO_MAX_PIXELS
  ) {
    throw new Error('사진 해상도가 너무 크거나 올바르지 않습니다.');
  }

  const { width, height } = fitProfilePhotoSize(sourceWidth, sourceHeight, maxPx);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('사진을 압축할 수 없습니다.');

  // JPEG has no alpha channel; use a neutral background instead of black.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  let compressed = canvas.toDataURL('image/jpeg', quality);
  for (const fallbackQuality of PROFILE_PHOTO_FALLBACK_QUALITIES) {
    if (compressed.length <= PROFILE_PHOTO_MAX_DATA_URL_CHARS) break;
    if (fallbackQuality >= quality) continue;
    compressed = canvas.toDataURL('image/jpeg', fallbackQuality);
  }
  if (!compressed.startsWith('data:image/jpeg;base64,')) {
    throw new Error('사진을 압축할 수 없습니다.');
  }
  if (compressed.length > PROFILE_PHOTO_MAX_DATA_URL_CHARS) {
    throw new Error('압축된 사진이 너무 큽니다. 더 작은 사진을 선택해 주세요.');
  }
  return compressed;
}

/** Profile photo upload — must send session cookie (same as localdb apiFetch). */
export async function uploadProfilePhotoDataUrl(path: string, dataUrl: string): Promise<void> {
  const res = await fetch('/api/db/storage-upload', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, dataUrl }),
  });
  if (res.ok) return;
  const body = await res.json().catch(() => ({} as { error?: string | { message?: string } }));
  const err = body?.error;
  const msg = typeof err === 'string' ? err : err?.message;
  throw new Error(msg ?? `사진 업로드 실패 (${res.status})`);
}
