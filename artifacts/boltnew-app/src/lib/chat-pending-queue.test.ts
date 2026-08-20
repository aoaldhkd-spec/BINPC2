import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PENDING_QUEUE_KEY,
  filterPendingQueueForUser,
  flushPendingQueueItems,
  loadPendingQueue,
  savePendingQueue,
  type PendingMsg,
} from './chat-pending-queue';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(key: string) { return this.map.get(key) ?? null; }
  key(index: number) { return [...this.map.keys()][index] ?? null; }
  removeItem(key: string) { this.map.delete(key); }
  setItem(key: string, value: string) { this.map.set(key, value); }
}

const sample = (overrides: Partial<PendingMsg> = {}): PendingMsg => ({
  chatId: 'chat-1',
  content: 'queued hello',
  clientId: 'client-1',
  optimisticId: '__opt_client-1',
  userId: 'user-a',
  ...overrides,
});

describe('chat pending queue (offline / refresh)', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('persists queue across refresh simulation (localStorage reload)', () => {
    savePendingQueue([sample()], storage);
    const reloaded = loadPendingQueue(storage);
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0].content).toBe('queued hello');
    expect(storage.getItem(PENDING_QUEUE_KEY)).toContain('queued hello');
  });

  it('drops invalid rows on load (corrupt refresh payload)', () => {
    storage.setItem(PENDING_QUEUE_KEY, JSON.stringify([{ chatId: 'x' }]));
    expect(loadPendingQueue(storage)).toHaveLength(0);
  });

  it('filters out other-user rows after account switch', () => {
    const queue = [sample({ userId: 'user-a' }), sample({ clientId: 'c2', userId: 'user-b' })];
    const kept = filterPendingQueueForUser(queue, 'user-a');
    expect(kept).toHaveLength(1);
    expect(kept[0].userId).toBe('user-a');
  });

  it('flushPendingQueueItems sends queued messages on reconnect and clears storage', async () => {
    const queue = [sample(), sample({ clientId: 'c2', optimisticId: '__opt_c2', content: 'second' })];
    const inserted: string[] = [];

    const { next, flushed } = await flushPendingQueueItems(queue, 'user-a', {
      insert: async (item) => {
        inserted.push(item.clientId);
        return { data: { id: `db-${item.clientId}` }, error: null };
      },
      findByClientId: async () => ({ data: null }),
    });

    expect(inserted).toEqual(['client-1', 'c2']);
    expect(flushed).toEqual(['client-1', 'c2']);
    expect(next).toHaveLength(0);
  });

  it('keeps failed items for next reconnect attempt (disconnect window)', async () => {
    const queue = [sample()];

    const { next, flushed } = await flushPendingQueueItems(queue, 'user-a', {
      insert: async () => { throw new Error('network down'); },
      findByClientId: async () => ({ data: null }),
    });

    expect(flushed).toHaveLength(0);
    expect(next).toHaveLength(1);
  });

  it('dedupes via client_id lookup when insert errors but row exists (stale fetch over retry)', async () => {
    const queue = [sample()];

    const { next, flushed } = await flushPendingQueueItems(queue, 'user-a', {
      insert: async () => ({ data: null, error: { message: 'timeout' } }),
      findByClientId: async () => ({ data: { id: 'db-existing' } }),
    });

    expect(flushed).toEqual(['client-1']);
    expect(next).toHaveLength(0);
  });

  it('accepts image-only pending rows (post-upload offline queue)', () => {
    const row: PendingMsg = {
      chatId: 'chat-1',
      content: '',
      imageUrl: 'https://cdn.example/img.jpg',
      clientId: 'img-1',
      optimisticId: '__opt_img-1',
      userId: 'user-a',
    };
    savePendingQueue([row], storage);
    expect(loadPendingQueue(storage)).toHaveLength(1);
  });

  it('flushPendingQueueItems sends image_url when content is empty', async () => {
    const queue = [sample({ content: '', imageUrl: 'https://cdn.example/x.jpg', clientId: 'img-c' })];
    let payload: Record<string, unknown> | null = null;

    const { flushed } = await flushPendingQueueItems(queue, 'user-a', {
      insert: async (item) => {
        payload = { chat_id: item.chatId, image_url: item.imageUrl, client_id: item.clientId };
        return { data: { id: 'db-img' }, error: null };
      },
      findByClientId: async () => ({ data: null }),
    });

    expect(flushed).toEqual(['img-c']);
    expect(payload).toMatchObject({ image_url: 'https://cdn.example/x.jpg' });
  });

  it('useChat wires flush on SSE reconnect, online, and functions unlock', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, '../hooks/useChat.ts'), 'utf8');
    expect(src).toMatch(/onSseReconnect[\s\S]*flushPendingQueue/);
    expect(src).toMatch(/addEventListener\('online'[\s\S]*flushPendingQueue/);
    expect(src).toMatch(/functionsLocked[\s\S]*flushPendingQueue/);
  });
});
