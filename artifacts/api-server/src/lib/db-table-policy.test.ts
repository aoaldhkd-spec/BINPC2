import { describe, it, expect } from 'vitest';
import { ALLOWED_OP_TABLES, CRITICAL_PERSIST_TABLES } from './db-table-policy.js';

describe('db-table-policy', () => {
  it('keeps core chat/hearts tables on both lists', () => {
    for (const t of ['messages', 'likes', 'chats', 'group_messages']) {
      expect(ALLOWED_OP_TABLES.has(t)).toBe(true);
      expect(CRITICAL_PERSIST_TABLES.has(t)).toBe(true);
    }
  });

  it('allows profiles/settings but does not mark them critical-persist', () => {
    expect(ALLOWED_OP_TABLES.has('profiles')).toBe(true);
    expect(ALLOWED_OP_TABLES.has('app_settings')).toBe(true);
    expect(CRITICAL_PERSIST_TABLES.has('profiles')).toBe(false);
    expect(CRITICAL_PERSIST_TABLES.has('app_settings')).toBe(false);
  });
});
