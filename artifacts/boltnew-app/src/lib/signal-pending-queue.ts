/** Offline signal send/pass queue — persisted in localStorage for refresh/disconnect recovery. */

export const SIGNAL_PENDING_QUEUE_KEY = 'signal_pending_queue_v1';

export interface PendingSignalAction {
  receiverId: string;
  action: 'send' | 'pass';
  userId: string;
  clientId: string;
}

export function isValidPendingSignalAction(m: unknown): m is PendingSignalAction {
  if (!m || typeof m !== 'object') return false;
  const row = m as PendingSignalAction;
  return (
    typeof row.receiverId === 'string'
    && (row.action === 'send' || row.action === 'pass')
    && typeof row.userId === 'string'
    && typeof row.clientId === 'string'
  );
}

export function saveSignalPendingQueue(queue: PendingSignalAction[], storage: Storage = localStorage): void {
  try { storage.setItem(SIGNAL_PENDING_QUEUE_KEY, JSON.stringify(queue)); } catch { /* quota */ }
}

export function loadSignalPendingQueue(storage: Storage = localStorage): PendingSignalAction[] {
  try {
    const raw = storage.getItem(SIGNAL_PENDING_QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidPendingSignalAction).slice(-50);
  } catch {
    return [];
  }
}

export function filterSignalPendingQueueForUser(
  queue: PendingSignalAction[],
  userId: string | null,
): PendingSignalAction[] {
  if (!userId) return queue;
  return queue.filter((q) => q.userId === userId);
}

/**
 * Flush queue items sequentially. Caller supplies insert handler.
 */
export async function flushSignalPendingQueueItems(
  queue: PendingSignalAction[],
  currentUserId: string | null,
  deps: {
    insert: (item: PendingSignalAction) => Promise<{ error: unknown }>;
    shouldDrop: (error: unknown) => boolean;
  },
): Promise<{ next: PendingSignalAction[]; flushed: string[]; dropped: string[] }> {
  const flushed: string[] = [];
  const dropped: string[] = [];
  let next = [...queue];

  for (const item of queue) {
    if (item.userId !== currentUserId) {
      next = next.filter((q) => q.clientId !== item.clientId);
      dropped.push(item.clientId);
      continue;
    }
    try {
      const { error } = await deps.insert(item);
      if (!error) {
        next = next.filter((q) => q.clientId !== item.clientId);
        flushed.push(item.clientId);
        continue;
      }
      if (deps.shouldDrop(error)) {
        next = next.filter((q) => q.clientId !== item.clientId);
        dropped.push(item.clientId);
      }
    } catch {
      // keep for next reconnect / online flush
    }
  }

  return { next, flushed, dropped };
}
