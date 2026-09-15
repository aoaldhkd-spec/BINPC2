import { describe, expect, it } from 'vitest';
import { validateBroadcastBody } from './db-broadcast-validate.js';

describe('db-broadcast-validate', () => {
  it('rejects bad body/channel/event', () => {
    expect(validateBroadcastBody(null).ok).toBe(false);
    expect(validateBroadcastBody({ channel: '', event: 'e', payload: 1 }).ok).toBe(false);
    expect(validateBroadcastBody({ channel: 'c', event: '', payload: 1 }).ok).toBe(false);
  });

  it('accepts valid', () => {
    const ok = validateBroadcastBody({ channel: 'ch', event: 'ev', payload: { a: 1 } });
    expect(ok).toEqual({ ok: true, channel: 'ch', event: 'ev', payload: { a: 1 } });
  });
});
