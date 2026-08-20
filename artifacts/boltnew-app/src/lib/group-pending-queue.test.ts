import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GROUP_PENDING_QUEUE_KEY,
  filterGroupPendingQueueForUser,
  flushGroupPendingQueueItems,
  loadGroupPendingQueue,
  saveGroupPendingQueue,
  type PendingGroupMsg,
} from './group-pending-queue';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(key: string) { return this.map.get(key) ?? null; }
  key(index: number) { return [...this.map.keys()][index] ?? null; }
  removeItem(key: string) { this.map.delete(key); }
  setItem(key: string, value: string) { this.map.set(key, value); }
}

const sample = (overrides: Partial<PendingGroupMsg> = {}): PendingGroupMsg => ({
  groupId: 'group-1',
  content: 'queued hello',
  clientId: 'client-1',
  optimisticId: '__opt_client-1',
  userId: 'user-a',
  ...overrides,
});

describe('group pending queue (offline / refresh)', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('persists queue across refresh simulation (localStorage reload)', () => {
    saveGroupPendingQueue([sample()], storage);
    const reloaded = loadGroupPendingQueue(storage);
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0].content).toBe('queued hello');
    expect(storage.getItem(GROUP_PENDING_QUEUE_KEY)).toContain('queued hello');
  });

  it('drops invalid rows on load (corrupt refresh payload)', () => {
    storage.setItem(GROUP_PENDING_QUEUE_KEY, JSON.stringify([{ groupId: 'x' }]));
    expect(loadGroupPendingQueue(storage)).toHaveLength(0);
  });

  it('filters out other-user rows after account switch', () => {
    const queue = [sample({ userId: 'user-a' }), sample({ clientId: 'c2', userId: 'user-b' })];
    const kept = filterGroupPendingQueueForUser(queue, 'user-a');
    expect(kept).toHaveLength(1);
    expect(kept[0].userId).toBe('user-a');
  });

  it('flushGroupPendingQueueItems sends queued messages on reconnect and clears storage', async () => {
    const queue = [sample(), sample({ clientId: 'c2', optimisticId: '__opt_c2', content: 'second' })];
    const inserted: string[] = [];

    const { next, flushed } = await flushGroupPendingQueueItems(queue, 'user-a', {
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

    const { next, flushed } = await flushGroupPendingQueueItems(queue, 'user-a', {
      insert: async () => { throw new Error('network down'); },
      findByClientId: async () => ({ data: null }),
    });

    expect(flushed).toHaveLength(0);
    expect(next).toHaveLength(1);
  });

  it('useGroupChat wires flush on SSE reconnect, online, and visibility', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, '../hooks/useGroupChat.ts'), 'utf8');
    expect(src).toMatch(/onSseReconnect[\s\S]*flushPendingGroupQueue/);
    expect(src).toMatch(/addEventListener\('online'[\s\S]*flushPendingGroupQueue/);
    expect(src).toMatch(/visibilitychange[\s\S]*flushPendingGroupQueue/);
  });
});
