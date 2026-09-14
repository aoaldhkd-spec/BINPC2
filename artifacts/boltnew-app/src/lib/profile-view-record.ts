/** Debounce duplicate profile_views INSERT from flip + detail open. */

export const PROFILE_VIEW_DEBOUNCE_MS = 60_000;

export function shouldRecordProfileView(input: {
  viewerId: string | null | undefined;
  viewedId: string;
  lastRecordedAt: number;
  now?: number;
  debounceMs?: number;
}): boolean {
  if (!input.viewerId || input.viewedId === input.viewerId) return false;
  const now = input.now ?? Date.now();
  const debounce = input.debounceMs ?? PROFILE_VIEW_DEBOUNCE_MS;
  return now - input.lastRecordedAt >= debounce;
}
