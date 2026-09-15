import { describe, it, expect } from 'vitest';
import { ALLOWED_OP_TABLES, CRITICAL_PERSIST_TABLES, ACTIVE_KV_TABLES } from './db-table-policy.js';

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

  it('ACTIVE_KV_TABLES covers allowlist + meta tables (72)', () => {
    expect(ACTIVE_KV_TABLES.has('profiles')).toBe(true);
    expect(ACTIVE_KV_TABLES.has('group_opt_outs')).toBe(true);
    expect(ACTIVE_KV_TABLES.has('rate_limits')).toBe(true);
    expect(ACTIVE_KV_TABLES.has('db_error_log')).toBe(true);
    expect(ACTIVE_KV_TABLES.size).toBeGreaterThanOrEqual(ALLOWED_OP_TABLES.size);
  });
});
