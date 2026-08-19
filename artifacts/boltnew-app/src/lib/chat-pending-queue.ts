/** Offline chat send queue — persisted in localStorage for refresh/disconnect recovery. */

export const PENDING_QUEUE_KEY = 'chat_pending_queue_v1';

export interface PendingMsg {
  chatId: string;
  content: string;
  clientId: string;
  optimisticId: string;
  userId: string;
}

export function isValidPendingMsg(m: unknown): m is PendingMsg {
  if (!m || typeof m !== 'object') return false;
  const row = m as PendingMsg;
  return (
    typeof row.chatId === 'string'
    && typeof row.content === 'string'
    && typeof row.clientId === 'string'
    && typeof row.optimisticId === 'string'
    && typeof row.userId === 'string'
  );
}

export function savePendingQueue(queue: PendingMsg[], storage: Storage = localStorage): void {
  try { storage.setItem(PENDING_QUEUE_KEY, JSON.stringify(queue)); } catch { /* quota */ }
}

export function loadPendingQueue(storage: Storage = localStorage): PendingMsg[] {
  try {
    const raw = storage.getItem(PENDING_QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidPendingMsg).slice(-50);
  } catch {
    return [];
  }
}

/** Keep only rows for the active account (post-switch / refresh hygiene). */
export function filterPendingQueueForUser(queue: PendingMsg[], userId: string | null): PendingMsg[] {
  if (!userId) return queue;
  return queue.filter((q) => q.userId === userId);
}

export type PendingInsertResult =
  | { ok: true; clientId: string }
  | { ok: false; clientId: string; retry: boolean };

/**
 * Flush queue items sequentially. Caller supplies insert + dedupe lookup (mirrors useChat).
 */
export async function flushPendingQueueItems(
  queue: PendingMsg[],
  currentUserId: string | null,
  deps: {
    insert: (item: PendingMsg) => Promise<{ data: unknown; error: unknown }>;
    findByClientId: (item: PendingMsg) => Promise<{ data: unknown }>;
  },
): Promise<{ next: PendingMsg[]; flushed: string[]; dropped: string[] }> {
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
