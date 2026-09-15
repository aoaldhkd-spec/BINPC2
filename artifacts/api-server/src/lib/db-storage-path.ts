/**
 * Storage upload/remove/get path validation — extracted from routes/db.ts.
 * Pure path shape checks; access policy / persist stay in db.ts.
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
