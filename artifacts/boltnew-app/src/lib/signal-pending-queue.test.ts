import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SIGNAL_PENDING_QUEUE_KEY,
  filterSignalPendingQueueForUser,
  flushSignalPendingQueueItems,
  loadSignalPendingQueue,
  saveSignalPendingQueue,
  type PendingSignalAction,
} from './signal-pending-queue';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(key: string) { return this.map.get(key) ?? null; }
  key(index: number) { return [...this.map.keys()][index] ?? null; }
  removeItem(key: string) { this.map.delete(key); }
  setItem(key: string, value: string) { this.map.set(key, value); }
}

const sample = (overrides: Partial<PendingSignalAction> = {}): PendingSignalAction => ({
  receiverId: 'receiver-1',
  action: 'send',
  userId: 'user-a',
  clientId: 'client-1',
  ...overrides,
});

describe('signal pending queue (offline / refresh)', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('persists queue across refresh simulation (localStorage reload)', () => {
    saveSignalPendingQueue([sample()], storage);
    const reloaded = loadSignalPendingQueue(storage);
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0].action).toBe('send');
    expect(storage.getItem(SIGNAL_PENDING_QUEUE_KEY)).toContain('receiver-1');
  });

  it('drops invalid rows on load (corrupt refresh payload)', () => {
    storage.setItem(SIGNAL_PENDING_QUEUE_KEY, JSON.stringify([{ receiverId: 'x' }]));
    expect(loadSignalPendingQueue(storage)).toHaveLength(0);
  });

  it('filters out other-user rows after account switch', () => {
    const queue = [sample({ userId: 'user-a' }), sample({ clientId: 'c2', userId: 'user-b' })];
    const kept = filterSignalPendingQueueForUser(queue, 'user-a');
    expect(kept).toHaveLength(1);
    expect(kept[0].userId).toBe('user-a');
  });

  it('flushSignalPendingQueueItems sends queued actions on reconnect and clears storage', async () => {
    const queue = [sample(), sample({ clientId: 'c2', action: 'pass' })];
    const inserted: string[] = [];

    const { next, flushed } = await flushSignalPendingQueueItems(queue, 'user-a', {
      insert: async (item) => {
        inserted.push(item.clientId);
        return { error: null };
      },
      shouldDrop: () => false,
    });

    expect(inserted).toEqual(['client-1', 'c2']);
    expect(flushed).toEqual(['client-1', 'c2']);
    expect(next).toHaveLength(0);
  });

  it('keeps failed items for next reconnect attempt (disconnect window)', async () => {
    const queue = [sample()];

    const { next, flushed } = await flushSignalPendingQueueItems(queue, 'user-a', {
      insert: async () => { throw new Error('network down'); },
      shouldDrop: () => false,
    });

    expect(flushed).toHaveLength(0);
    expect(next).toHaveLength(1);
  });

  it('drops BLOCKED items via shouldDrop', async () => {
    const queue = [sample()];

    const { next, dropped } = await flushSignalPendingQueueItems(queue, 'user-a', {
      insert: async () => ({ error: { code: 'BLOCKED' } }),
      shouldDrop: (error) => (error as { code?: string }).code === 'BLOCKED',
    });

    expect(dropped).toEqual(['client-1']);
    expect(next).toHaveLength(0);
  });

  it('App wires flush on SSE reconnect, online, and functions unlock', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, '../App.tsx'), 'utf8');
    expect(src).toMatch(/onSseReconnect[\s\S]*flushSignalPendingQueue/);
    expect(src).toMatch(/addEventListener\('online'[\s\S]*flushSignalPendingQueue/);
    expect(src).toMatch(/functionsLocked[\s\S]*flushSignalPendingQueue/);
  });
});
