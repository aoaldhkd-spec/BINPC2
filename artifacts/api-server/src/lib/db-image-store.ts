/**
 * In-memory image dataURL LRU — extracted from routes/db.ts (behavior unchanged).
 * Used by storage-upload / storage-remove / storage-image + boot preload.
 */

export type ImageStoreOptions = {
  maxEntries?: number;
  maxChars?: number;
};

export type ImageStore = {
  get: (path: string) => string | undefined;
  set: (path: string, dataUrl: string) => void;
  delete: (path: string) => boolean;
  size: () => number;
};

export const IMAGE_STORE_MAX_ENTRIES_DEFAULT = 80;
export const IMAGE_STORE_MAX_CHARS_DEFAULT = 32 * 1024 * 1024;

export function createImageStore(opts: ImageStoreOptions = {}): ImageStore {
  const maxEntries = opts.maxEntries ?? IMAGE_STORE_MAX_ENTRIES_DEFAULT;
  const maxChars = opts.maxChars ?? IMAGE_STORE_MAX_CHARS_DEFAULT;
  const map = new Map<string, string>();

  function prune(): void {
    let chars = 0;
    for (const v of map.values()) chars += v.length;
    while (map.size > maxEntries || chars > maxChars) {
      const first = map.keys().next().value as string | undefined;
      if (!first) break;
      chars -= map.get(first)?.length ?? 0;
      map.delete(first);
    }
  }

  return {
    get(path: string): string | undefined {
      return map.get(path);
    },
    set(path: string, dataUrl: string): void {
      map.delete(path);
      map.set(path, dataUrl);
      prune();
    },
    delete(path: string): boolean {
      return map.delete(path);
    },
    size(): number {
      return map.size;
    },
  };
}
