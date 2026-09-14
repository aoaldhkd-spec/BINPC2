import { describe, it, expect } from 'vitest';
import {
  MESSAGE_PAGE_SIZE,
  MESSAGE_OLDER_HARD_CAP,
  normalizeDescMessagePage,
  olderMessagesCursor,
  mergeOlderMessagePage,
  pageHasMoreOlder,
} from './chat-message-page';

function row(id: string, created_at: string) {
  return { id, created_at };
}

describe('normalizeDescMessagePage', () => {
  it('reverses newest-first rows to chronological and flags hasMoreOlder', () => {
    const rows = [
      row('c', '2026-01-03T00:00:00.000Z'),
      row('b', '2026-01-02T00:00:00.000Z'),
      row('a', '2026-01-01T00:00:00.000Z'),
    ];
    const page = normalizeDescMessagePage(rows, 3);
    expect(page.messages.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(page.hasMoreOlder).toBe(true);
    expect(page.oldestCreatedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('hasMoreOlder false when under page size', () => {
    const page = normalizeDescMessagePage([row('a', '2026-01-01T00:00:00.000Z')], MESSAGE_PAGE_SIZE);
    expect(page.hasMoreOlder).toBe(false);
    expect(page.oldestCreatedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('empty page', () => {
    const page = normalizeDescMessagePage([]);
    expect(page.messages).toEqual([]);
    expect(page.hasMoreOlder).toBe(false);
    expect(page.oldestCreatedAt).toBeNull();
  });
});

describe('olderMessagesCursor', () => {
  it('skips optimistic placeholders', () => {
    expect(
      olderMessagesCursor([
        row('__opt_x', '2026-01-01T00:00:00.000Z'),
        row('real', '2026-01-02T00:00:00.000Z'),
      ]),
    ).toBe('2026-01-02T00:00:00.000Z');
  });

  it('returns null when only optimistic', () => {
    expect(olderMessagesCursor([row('__opt_x', '2026-01-01T00:00:00.000Z')])).toBeNull();
  });
});

describe('mergeOlderMessagePage', () => {
  it('prepends unique older rows and keeps chronological order', () => {
    const current = [row('b', '2026-01-02T00:00:00.000Z'), row('c', '2026-01-03T00:00:00.000Z')];
    const older = [row('a', '2026-01-01T00:00:00.000Z'), row('b', '2026-01-02T00:00:00.000Z')];
    expect(mergeOlderMessagePage(current, older).map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('caps at hard ceiling keeping newest', () => {
    const current = Array.from({ length: 3 }, (_, i) =>
      row(`n${i}`, `2026-02-0${i + 1}T00:00:00.000Z`),
    );
    const older = Array.from({ length: 3 }, (_, i) =>
      row(`o${i}`, `2026-01-0${i + 1}T00:00:00.000Z`),
    );
    const merged = mergeOlderMessagePage(current, older, 4);
    expect(merged).toHaveLength(4);
    expect(merged.map((m) => m.id)).toEqual(['o2', 'n0', 'n1', 'n2']);
  });
});

describe('pageHasMoreOlder', () => {
  it('true when full page', () => {
    expect(pageHasMoreOlder(MESSAGE_PAGE_SIZE)).toBe(true);
    expect(pageHasMoreOlder(MESSAGE_PAGE_SIZE - 1)).toBe(false);
  });
});

describe('constants', () => {
  it('aligns with useChat MAX_MESSAGES (=500)', () => {
    expect(MESSAGE_PAGE_SIZE).toBe(500);
    expect(MESSAGE_OLDER_HARD_CAP).toBe(1000);
  });
});
