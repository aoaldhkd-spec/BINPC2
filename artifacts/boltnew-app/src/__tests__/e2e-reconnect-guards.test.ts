import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

describe('E2E reconnect scripts (static guards)', () => {
  const scripts = [
    'scripts/test-chat-disconnect-recovery.mjs',
    'scripts/e2e-heart-sse-consistency.mjs',
    'scripts/test-mutual-chat-hearts.mjs',
    'scripts/lib/e2e-realtime.mjs',
  ];

  for (const rel of scripts) {
    it(`${rel} exists`, () => {
      expect(existsSync(join(root, rel))).toBe(true);
    });
  }

  it('chat disconnect script covers disconnect + HTTP resync', () => {
    const src = read('scripts/test-chat-disconnect-recovery.mjs');
    expect(src).toContain('streamB.stop()');
    expect(src).toContain('lastEventId');
    expect(src).toContain('selectMessages');
    expect(src).toContain('dupClient');
  });

  it('heart consistency script compares SSE row to DB select', () => {
    const src = read('scripts/e2e-heart-sse-consistency.mjs');
    expect(src).toContain('likeRowMatches');
    expect(src).toContain('heart_type SSE vs DB');
    expect(src).toContain('duplicate like attempt');
  });

  it('shared E2E lib uses Render-direct SSE like app', () => {
    const src = read('scripts/lib/e2e-realtime.mjs');
    expect(src).toContain('SSE_ORIGIN');
    expect(src).toContain('binpc2.onrender.com');
    expect(src).toMatch(/`\$\{SSE_API\}\/events/);
  });

  it('mutual hearts script uses Render-direct SSE', () => {
    const src = read('scripts/test-mutual-chat-hearts.mjs');
    expect(src).toContain('SSE_API');
    expect(src).toContain('binpc2.onrender.com');
    expect(src).not.toMatch(/\$\{API\}\/events/);
  });
});

describe('chat dedupe guards (unit fallback when E2E flaky)', () => {
  it('applySseInsert is idempotent on replayed SSE rows', async () => {
    const { applySseInsert } = await import('../lib/chat-reducers');
    const msg = {
      id: 'm1',
      content: 'hi',
      created_at: '2026-01-01T00:00:00Z',
      sender_id: 'a',
      chat_id: 'c1',
      client_id: null,
      image_url: null,
      read_at: null,
    };
    const once = applySseInsert([], msg, 'c1');
    const twice = applySseInsert(once, msg, 'c1');
    expect(twice).toHaveLength(1);
    expect(twice[0].id).toBe('m1');
  });
});
