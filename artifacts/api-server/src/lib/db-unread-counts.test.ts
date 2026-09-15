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
