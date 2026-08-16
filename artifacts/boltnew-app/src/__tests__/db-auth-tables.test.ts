import { describe, it, expect } from 'vitest';
import { SESSION_SCOPED_TABLES, tableNeedsSession } from '../lib/db-auth-tables';

describe('db-auth-tables', () => {
  it('chats/messages/likes/signal_sends SELECT requires session when logged in', () => {
    for (const t of ['chats', 'messages', 'likes', 'signal_sends']) {
      expect(SESSION_SCOPED_TABLES.has(t)).toBe(true);
      expect(tableNeedsSession(t, 'select', true)).toBe(true);
      expect(tableNeedsSession(t, 'select', false)).toBe(false);
    }
  });

  it('profiles SELECT stays public without session', () => {
    expect(tableNeedsSession('profiles', 'select', true)).toBe(false);
    expect(tableNeedsSession('profiles', 'insert', true)).toBe(true);
  });
});
