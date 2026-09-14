/**
 * Active admin broadcast notification apply helpers (participant App).
 */

export type ActiveNotif = {
  id: string;
  message: string;
  type: string;
  target: string;
  is_active?: boolean;
};

export function shouldShowBroadcastNotif(n: {
  is_active?: boolean;
  target?: string;
}): boolean {
  return Boolean(n.is_active) && n.target === 'all';
}

export function dismissActiveNotifIfMatch<T extends { id: string }>(
  prev: T | null,
  id: string,
): T | null {
  if (!prev) return null;
  return prev.id === id ? null : prev;
}
