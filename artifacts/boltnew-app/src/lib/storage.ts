// Re-check each operation: mobile storage can become unavailable after startup.
// This fallback preserves a running tab; it never authenticates a cached identity.
export function createResilientStorage(
  primary: () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = () => localStorage,
  backup: () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = () => sessionStorage,
) {
  const memory = new Map<string, string | null>();
  const dirty = new Set<string>();
  let readUnavailable = false;
  const prefix = 'binpc2_storage_fallback:';
  const mirror = (key: string, value: string | null) => {
    try {
      if (value === null) backup().removeItem(prefix + key);
      else backup().setItem(prefix + key, value);
    } catch { /* Both stores may be blocked: keep this tab's memory only. */ }
  };
  return {
    isReadUnavailable: () => readUnavailable,
    hasPersistentValue(key: string): boolean {
      const value = memory.get(key);
      if (value == null) return false;
      try { if (primary().getItem(key) === value) return true; } catch {}
      try { return backup().getItem(prefix + key) === value; } catch { return false; }
    },
    getItem(key: string): string | null {
      if (dirty.has(key)) return memory.get(key) ?? null;
      try {
        const value = primary().getItem(key);
        readUnavailable = false;
        memory.set(key, value);
        mirror(key, value);
        return value;
      } catch {
        readUnavailable = true;
        if (memory.has(key)) return memory.get(key) ?? null;
        try { return backup().getItem(prefix + key); } catch { return null; }
      }
    },
    setItem(key: string, value: string): void {
      memory.set(key, value);
      try { primary().setItem(key, value); dirty.delete(key); }
      catch { dirty.add(key); }
      mirror(key, value);
    },
    removeItem(key: string): void {
      memory.set(key, null);
      try { primary().removeItem(key); dirty.delete(key); }
      catch { dirty.add(key); }
      mirror(key, null);
    },
  };
}
export const ls = createResilientStorage();
