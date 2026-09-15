import { describe, expect, it } from 'vitest';
import { computeUnreadCountsForUser } from './db-unread-counts.js';

describe('db-unread-counts', () => {
  const id = (x: string) => x;
  const count = () => 1;

  it('counts messages after read_at and skips own sends', () => {
    const chats = [
      { id: 'c1', user1_id: 'u1', user2_id: 'u2', created_at: '2020-01-01' },
    ];
    const messages = [
      { id: 'm1', chat_id: 'c1', sender_id: 'u2', created_at: '2020-01-02T00:00:00.000Z' },
      { id: 'm2', chat_id: 'c1', sender_id: 'u1', created_at: '2020-01-03T00:00:00.000Z' },
      { id: 'm3', chat_id: 'c1', sender_id: 'u2', created_at: '2020-01-04T00:00:00.000Z' },
    ];
    const reads = [
      { reader_id: 'u1', chat_id: 'c1', read_at: '2020-01-02T12:00:00.000Z' },
    ];
    const counts = computeUnreadCountsForUser('u1', chats, messages, reads, id, count);
    expect(counts).toEqual({ c1: 1 });
  });

  it('merges sibling rooms onto canonical and dedupes message ids', () => {
    const chats = [
      { id: 'old', user1_id: 'a', user2_id: 'b', created_at: '2020-01-01' },
      { id: 'new', user1_id: 'a', user2_id: 'b', created_at: '2020-01-02' },
    ];
    const messages = [
      { id: 'm1', chat_id: 'old', sender_id: 'b', created_at: '2020-02-01T00:00:00.000Z' },
      { id: 'm1', chat_id: 'new', sender_id: 'b', created_at: '2020-02-01T00:00:00.000Z' },
    ];
    const countMsgs = (cid: string) => (cid === 'new' ? 2 : 0);
    const counts = computeUnreadCountsForUser('a', chats, messages, [], id, countMsgs);
    expect(counts).toEqual({ new: 1 });
  });

  it('follows resolveMergedChatId for reads and messages', () => {
    const resolve = (cid: string) => (cid === 'dup' ? 'canon' : cid);
    const chats = [
      { id: 'canon', user1_id: 'x', user2_id: 'y', created_at: '2020-01-01' },
    ];
    const messages = [
      { id: 'm1', chat_id: 'dup', sender_id: 'y', created_at: '2020-03-01T00:00:00.000Z' },
    ];
    const reads = [
      { reader_id: 'x', chat_id: 'dup', read_at: '2020-01-01T00:00:00.000Z' },
    ];
    const counts = computeUnreadCountsForUser('x', chats, messages, reads, resolve, () => 1);
    expect(counts).toEqual({ canon: 1 });
  });
});

import {
  unreadCountsUserIdRequiredReject,
  unreadCountsUnauthorizedReject,
  unreadCountsInternalReject,
  readUnreadCountsCache,
  writeUnreadCountsCache,
  pruneUnreadCountsCache,
} from './db-unread-counts.js';

describe('unread rejects + cache (70)', () => {
  it('Korean/English rejects', () => {
    expect(unreadCountsUserIdRequiredReject().status).toBe(400);
    expect(unreadCountsUnauthorizedReject().body.error.code).toBe('UNAUTHORIZED');
    expect(unreadCountsInternalReject().body.error.message).toContain('안읽은');
  });

  it('cache read/write/prune LRU', () => {
    const cache = new Map();
    expect(readUnreadCountsCache(cache, 'u', 100, 50)).toBe(null);
    writeUnreadCountsCache(cache, 'u', { c1: 1 }, 100, 2);
    expect(readUnreadCountsCache(cache, 'u', 120, 50)).toEqual({ c1: 1 });
    writeUnreadCountsCache(cache, 'a', { c: 1 }, 1, 2);
    writeUnreadCountsCache(cache, 'b', { c: 1 }, 2, 2);
    writeUnreadCountsCache(cache, 'c', { c: 1 }, 3, 2);
    expect(cache.has('a')).toBe(false);
    pruneUnreadCountsCache(cache, 3);
    expect(cache.has('b')).toBe(false);
  });
});

