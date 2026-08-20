/** Offline group message send queue — persisted in localStorage for refresh/disconnect recovery. */

export const GROUP_PENDING_QUEUE_KEY = 'group_pending_queue_v1';

export interface PendingGroupMsg {
  groupId: string;
  content: string;
  clientId: string;
  optimisticId: string;
  userId: string;
}

export function isValidPendingGroupMsg(m: unknown): m is PendingGroupMsg {
  if (!m || typeof m !== 'object') return false;
  const row = m as PendingGroupMsg;
  return (
    typeof row.groupId === 'string'
    && typeof row.content === 'string'
    && row.content.length > 0
    && typeof row.clientId === 'string'
    && typeof row.optimisticId === 'string'
    && typeof row.userId === 'string'
  );
}

export function saveGroupPendingQueue(queue: PendingGroupMsg[], storage: Storage = localStorage): void {
  try { storage.setItem(GROUP_PENDING_QUEUE_KEY, JSON.stringify(queue)); } catch { /* quota */ }
}

export function loadGroupPendingQueue(storage: Storage = localStorage): PendingGroupMsg[] {
  try {
    const raw = storage.getItem(GROUP_PENDING_QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidPendingGroupMsg).slice(-50);
  } catch {
    return [];
  }
}

/** Keep only rows for the active account (post-switch / refresh hygiene). */
export function filterGroupPendingQueueForUser(queue: PendingGroupMsg[], userId: string | null): PendingGroupMsg[] {
  if (!userId) return queue;
  return queue.filter((q) => q.userId === userId);
}

/**
 * Flush queue items sequentially. Caller supplies insert + dedupe lookup (mirrors useGroupChat).
 */
export async function flushGroupPendingQueueItems(
  queue: PendingGroupMsg[],
  currentUserId: string | null,
  deps: {
    insert: (item: PendingGroupMsg) => Promise<{ data: unknown; error: unknown }>;
    findByClientId: (item: PendingGroupMsg) => Promise<{ data: unknown }>;
  },
): Promise<{ next: PendingGroupMsg[]; flushed: string[]; dropped: string[] }> {
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
      const { data, error } = await deps.insert(item);
      if (!error && data) {
        next = next.filter((q) => q.clientId !== item.clientId);
        flushed.push(item.clientId);
        continue;
      }
      if (error) {
        const { data: existing } = await deps.findByClientId(item);
        if (existing) {
          next = next.filter((q) => q.clientId !== item.clientId);
          flushed.push(item.clientId);
        }
      }
    } catch {
      // keep for next reconnect / online flush
    }
  }

  return { next, flushed, dropped };
}
