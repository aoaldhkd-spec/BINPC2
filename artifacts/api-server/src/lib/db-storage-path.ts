/**
 * Storage upload/remove/get path validation — extracted from routes/db.ts.
 * Pure path shape checks + upload/remove/image gate planners; persist stays in db.ts.
 */

const PATH_RE = /^[\w\-./]+$/;

export function isValidStoragePath(path: unknown): path is string {
  return (
    typeof path === 'string'
    && path.length > 0
    && path.length <= 512
    && !path.includes('..')
    && !path.startsWith('/')
    && PATH_RE.test(path)
  );
}

/** paths array for /storage-remove: 1..10 valid storage paths. */
export function isValidStoragePathList(paths: unknown): paths is string[] {
  return (
    Array.isArray(paths)
    && paths.length > 0
    && paths.length <= 10
    && paths.every(p => isValidStoragePath(p))
  );
}

/** profile-photos/<userId> — publicly readable avatar path. */
export function isPublicProfilePhotoPath(path: string): boolean {
  return /^profile-photos\/[\w-]+$/.test(path);
}

export type StorageReject = {
  status: number;
  body: unknown;
  rejectReason?: 'unauthenticated' | 'path' | 'forbidden' | 'rate_limited' | 'mime' | 'size_cap' | 'magic';
};

export type StorageUploadOk = {
  ok: true;
  path: string;
  dataUrl: string;
};

export type StorageUploadPlan = StorageUploadOk | { ok: false; reject: StorageReject };

/** Stage 1: body / auth / path / canUpload (before rate limit). */
export function planStorageUploadAuthPath(input: {
  body: unknown;
  userId: string | null;
  canUpload: (path: string, userId: string) => boolean;
}): StorageUploadPlan {
  if (input.body == null || typeof input.body !== 'object' || Array.isArray(input.body)) {
    return { ok: false, reject: { status: 400, body: { data: null, error: 'Invalid request body' } } };
  }
  if (!input.userId) {
    return {
      ok: false,
      reject: {
        status: 401,
        body: { data: null, error: { message: 'Authentication required' } },
        rejectReason: 'unauthenticated',
      },
    };
  }
  const body = input.body as Record<string, unknown>;
  const imgPath = body.path;
  if (!isValidStoragePath(imgPath)) {
    return {
      ok: false,
      reject: { status: 400, body: { data: null, error: 'Invalid path' }, rejectReason: 'path' },
    };
  }
  if (!input.canUpload(imgPath, input.userId)) {
    return {
      ok: false,
      reject: {
        status: 403,
        body: { data: null, error: { message: 'Forbidden image path' } },
        rejectReason: 'forbidden',
      },
    };
  }
  const dataUrl = body.dataUrl;
  // dataUrl checked after rate in prior code — pass through placeholder; stage2 validates
  return { ok: true, path: imgPath, dataUrl: typeof dataUrl === 'string' ? dataUrl : '' };
}

/** Stage 2: rate + dataUrl MIME/magic/size (after auth+path). */
export function planStorageUploadContent(input: {
  path: string;
  dataUrl: unknown;
  uploadUserRate: 'ok' | 'limited' | 'map_full';
  uploadIpBurst: 'ok' | 'limited' | 'map_full';
  dataUrlMimeAndMagic: (dataUrl: string) => { mime: string; magicOk: boolean } | null;
  maxDataUrlBytes: number;
}): StorageUploadPlan {
  if (input.uploadUserRate === 'map_full' || input.uploadIpBurst === 'map_full') {
    return {
      ok: false,
      reject: {
        status: 429,
        body: { data: null, error: '요청이 너무 많습니다.' },
        rejectReason: 'rate_limited',
      },
    };
  }
  if (input.uploadUserRate === 'limited' || input.uploadIpBurst === 'limited') {
    return {
      ok: false,
      reject: {
        status: 429,
        body: {
          data: null,
          error: '이미지를 너무 자주 업로드하고 있습니다. 잠시 후 다시 시도해 주세요.',
        },
        rejectReason: 'rate_limited',
      },
    };
  }
  if (!input.dataUrl || typeof input.dataUrl !== 'string') {
    return { ok: false, reject: { status: 400, body: { data: null, error: 'Missing dataUrl' } } };
  }
  const mimeMagic = input.dataUrlMimeAndMagic(input.dataUrl);
  if (!mimeMagic) {
    return {
      ok: false,
      reject: { status: 400, body: { data: null, error: 'Invalid image type' }, rejectReason: 'mime' },
    };
  }
  if (input.dataUrl.length > input.maxDataUrlBytes) {
    return {
      ok: false,
      reject: {
        status: 413,
        body: { data: null, error: 'Image too large (max 5MB)' },
        rejectReason: 'size_cap',
      },
    };
  }
  if (!mimeMagic.magicOk) {
    return {
      ok: false,
      reject: {
        status: 400,
        body: { data: null, error: 'Image content does not match declared type' },
        rejectReason: 'magic',
      },
    };
  }
  return { ok: true, path: input.path, dataUrl: input.dataUrl };
}

export type StorageRemovePlan =
  | { ok: true; paths: string[] }
  | { ok: false; reject: StorageReject };

export function planStorageRemove(input: {
  userId: string | null;
  paths: unknown;
  canRemove: (path: string, userId: string) => boolean;
}): StorageRemovePlan {
  if (!input.userId) {
    return {
      ok: false,
      reject: { status: 401, body: { data: null, error: { message: 'Authentication required' } } },
    };
  }
  if (!isValidStoragePathList(input.paths)) {
    return {
      ok: false,
      reject: { status: 400, body: { data: null, error: { message: 'Invalid paths' } } },
    };
  }
  if (!input.paths.every(p => input.canRemove(p, input.userId!))) {
    return {
      ok: false,
      reject: { status: 403, body: { data: null, error: { message: 'Forbidden' } } },
    };
  }
  return { ok: true, paths: input.paths };
}

export type StorageImageAuthPlan =
  | { ok: true }
  | { ok: false; reject: StorageReject };

/** Auth gate for /storage-image after path string is validated. */
export function planStorageImageAuth(input: {
  path: string;
  userId: string | null;
  adminOk: boolean;
  canRead: (path: string, userId: string) => boolean;
}): StorageImageAuthPlan {
  const isPublic = isPublicProfilePhotoPath(input.path);
  if (input.adminOk || isPublic) return { ok: true };
  if (!input.userId || !input.canRead(input.path, input.userId)) {
    return {
      ok: false,
      reject: {
        status: input.userId ? 403 : 401,
        body: { error: 'Authentication required' },
      },
    };
  }
  return { ok: true };
}

export function storageUploadInternalReject(): StorageReject {
  return { status: 500, body: { data: null, error: 'Internal server error' } };
}

export function storageRemoveInternalReject(): StorageReject {
  return { status: 500, body: { data: null, error: { message: 'Internal server error' } } };
}
