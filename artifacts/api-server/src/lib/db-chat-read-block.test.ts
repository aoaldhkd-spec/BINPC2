import { describe, expect, it } from 'vitest';
import { isChatPairBlocked, stampChatReadAt } from './db-chat-read-block.js';

describe('db-chat-read-block', () => {
  it('stampChatReadAt uses server clock unless client read_at is newer', () => {
    const now = '2026-09-15T04:00:00.000Z';
    const older = { read_at: '2026-09-15T03:00:00.000Z' };
    stampChatReadAt(older, now);
    expect(older.read_at).toBe(now);

    const newer = { read_at: '2026-09-15T05:00:00.000Z' };
    stampChatReadAt(newer, now);
    expect(newer.read_at).toBe('2026-09-15T05:00:00.000Z');

    const missing = {} as Record<string, unknown>;
    stampChatReadAt(missing, now);
    expect(missing.read_at).toBe(now);
  });

  it('isChatPairBlocked is mutual for block_type=block only', () => {
    const rows = [
      { user_id: 'a', target_id: 'b', block_type: 'block' },
      { user_id: 'c', target_id: 'd', block_type: 'hide' },
    ];
    expect(isChatPairBlocked(rows, 'a', 'b')).toBe(true);
    expect(isChatPairBlocked(rows, 'b', 'a')).toBe(true);
    expect(isChatPairBlocked(rows, 'c', 'd')).toBe(false);
    expect(isChatPairBlocked(rows, 'a', 'c')).toBe(false);
  });
});
