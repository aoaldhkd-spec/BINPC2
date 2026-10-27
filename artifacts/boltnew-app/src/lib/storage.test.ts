import { describe, it, expect } from 'vitest';
import { createResilientStorage } from './storage';
function store() {
  const values = new Map<string, string>();
  return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); } };
}
describe('mobile storage interruptions', () => {
  it('keeps identity, PIN and draft when storage starts throwing after initialization', () => {
    const primary = store(), backup = store();
    let blocked = false;
    const storage = createResilientStorage(() => { if (blocked) throw new Error('blocked'); return primary; }, () => backup);
    for (const key of ['identity', 'pin', 'draft']) storage.setItem(key, key + '-fixture');
    blocked = true;
    for (const key of ['identity', 'pin', 'draft']) expect(storage.getItem(key)).toBe(key + '-fixture');
    storage.setItem('draft', 'updated');
    blocked = false;
    expect(storage.getItem('draft')).toBe('updated');
  });
  it('restores the same tab from session fallback while primary storage remains blocked', () => {
    const primary = store(), backup = store();
    createResilientStorage(() => primary, () => backup).setItem('identity', 'same-owner');
    const resumed = createResilientStorage(() => { throw new Error('blocked'); }, () => backup);
    expect(resumed.getItem('identity')).toBe('same-owner');
  });
  it('explicit logout/reset removes the fallback and does not resurrect an identity', () => {
    const primary = store(), backup = store();
    const storage = createResilientStorage(() => primary, () => backup);
    storage.setItem('identity', 'same-owner');
    storage.removeItem('identity');
    expect(createResilientStorage(() => { throw new Error('blocked'); }, () => backup).getItem('identity')).toBeNull();
  });
  it('keeps removals in memory even if both stores fail without suppressing genuine reset', () => {
    const storage = createResilientStorage(() => { throw new Error('blocked'); }, () => { throw new Error('blocked'); });
    storage.setItem('identity', 'same-owner');
    expect(storage.getItem('identity')).toBe('same-owner');
    storage.removeItem('identity');
    expect(storage.getItem('identity')).toBeNull();
  });
});
