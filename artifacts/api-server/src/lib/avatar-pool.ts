/**
 * Entry avatar pool — mirrors settings catalog presets (avatar-catalog.ts).
 * Pure helpers; unit-tested without a running server.
 */
import presetIds from './avatar-preset-ids.json' with { type: 'json' };

export const PRESET_AVATAR_IDS: readonly string[] = presetIds;

export type EntryAvatarResult =
  | { ok: true; assigned: true; path: string; id: string }
  | { ok: true; assigned: false; path: string }
  | { ok: false; code: 'POOL_EXHAUSTED' };

/** Canonical path served from Netlify/static (matches client catalog when BASE_PATH=/). */
export function presetAvatarPath(id: string): string {
  return `/avatars/${id}.webp`;
}

export function extractPresetAvatarId(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const m = url.match(/\/avatars\/(av\d+)\.webp/i);
  return m ? m[1]! : null;
}

/** User-uploaded storage photos must not be replaced by entry assignment. */
export function isUserUploadedPhoto(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  return url.includes('/api/db/storage-image') || url.includes('profile-photos/');
}

export function collectUsedPresetAvatarIds(
  profiles: ReadonlyArray<Record<string, unknown>>,
): Set<string> {
  const used = new Set<string>();
  for (const row of profiles) {
    const id = extractPresetAvatarId(row.photo_url as string | null | undefined);
    if (id) used.add(id);
  }
  return used;
}

/**
 * Assign a random unused preset avatar on entry.
 * Keeps real uploads; honours an unused client-requested preset if provided.
 */
export function resolveEntryAvatar(
  usedIds: Set<string>,
  requestedUrl: string | null | undefined,
  pool: readonly string[] = PRESET_AVATAR_IDS,
  maxTries = 100,
  rand: () => number = Math.random,
): EntryAvatarResult {
  if (isUserUploadedPhoto(requestedUrl)) {
    return { ok: true, assigned: false, path: String(requestedUrl) };
  }

  const requestedId = extractPresetAvatarId(requestedUrl);
  if (requestedId && !usedIds.has(requestedId)) {
    return { ok: true, assigned: true, path: presetAvatarPath(requestedId), id: requestedId };
  }

  const available = pool.filter((id) => !usedIds.has(id));
  if (available.length === 0) {
    return { ok: false, code: 'POOL_EXHAUSTED' };
  }

  let idx = Math.floor(rand() * available.length);
  let tries = 0;
  while (tries++ < maxTries) {
    const id = available[idx % available.length]!;
    if (!usedIds.has(id)) {
      return { ok: true, assigned: true, path: presetAvatarPath(id), id };
    }
    idx = Math.floor(rand() * available.length);
  }

  return { ok: false, code: 'POOL_EXHAUSTED' };
}
