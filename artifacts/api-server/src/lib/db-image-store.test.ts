import { describe, expect, it } from 'vitest';
import { createImageStore } from './db-image-store.js';

describe('db-image-store', () => {
  it('get/set round-trip and LRU prune by maxEntries', () => {
    const store = createImageStore({ maxEntries: 2, maxChars: 1_000_000 });
    store.set('a', 'data:a');
    store.set('b', 'data:b');
    expect(store.get('a')).toBe('data:a');
    expect(store.size()).toBe(2);
    store.set('c', 'data:c');
    expect(store.get('a')).toBeUndefined();
    expect(store.get('b')).toBe('data:b');
    expect(store.get('c')).toBe('data:c');
  });

  it('set refreshes insertion order (delete+reinsert) so prune drops oldest', () => {
    const store = createImageStore({ maxEntries: 2, maxChars: 1_000_000 });
    store.set('a', '1');
    store.set('b', '2');
    store.set('a', '1b'); // refresh a
    store.set('c', '3');
    expect(store.get('b')).toBeUndefined();
    expect(store.get('a')).toBe('1b');
    expect(store.get('c')).toBe('3');
  });

  it('prune by maxChars', () => {
    const store = createImageStore({ maxEntries: 10, maxChars: 5 });
    store.set('a', '1234');
    store.set('b', '12');
    expect(store.get('a')).toBeUndefined();
    expect(store.get('b')).toBe('12');
  });

  it('delete removes path', () => {
    const store = createImageStore({ maxEntries: 5, maxChars: 1000 });
    store.set('x', 'data');
    expect(store.delete('x')).toBe(true);
    expect(store.get('x')).toBeUndefined();
    expect(store.delete('missing')).toBe(false);
  });
});
