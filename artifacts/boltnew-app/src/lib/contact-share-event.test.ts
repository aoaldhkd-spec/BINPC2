import { describe, it, expect } from 'vitest';
import {
  contactShareEventKey,
  isContactShareEventStaleReplay,
  planContactShareEvent,
  pruneSeenIdSet,
  CONTACT_SHARE_EVENT_STALE_MS,
} from './contact-share-event';

describe('contactShareEventKey', () => {
  it('prefers id', () => {
    expect(contactShareEventKey({ id: 'e1', from_user_id: 'a', event_type: 'accepted' })).toBe('e1');
  });
  it('falls back to composite', () => {
    expect(contactShareEventKey({
      from_user_id: 'a',
      event_type: 'rejected',
      created_at: 't',
    })).toBe('a:rejected:t');
  });
});

describe('isContactShareEventStaleReplay', () => {
  it('treats missing created_at as live', () => {
    expect(isContactShareEventStaleReplay(undefined, 1_000_000)).toBe(false);
  });
  it('flags ages above threshold', () => {
    const now = 1_000_000;
    const old = new Date(now - CONTACT_SHARE_EVENT_STALE_MS - 1).toISOString();
    expect(isContactShareEventStaleReplay(old, now)).toBe(true);
  });
  it('keeps negative age (phone slow) live', () => {
    const now = 1_000_000;
    const future = new Date(now + 60_000).toISOString();
    expect(isContactShareEventStaleReplay(future, now)).toBe(false);
  });
});

describe('pruneSeenIdSet', () => {
  it('keeps set under max', () => {
    const s = new Set(['a', 'b']);
    expect(pruneSeenIdSet(s, 500, 300)).toBe(s);
  });
  it('trims to newest keep when over max', () => {
    const s = new Set(Array.from({ length: 6 }, (_, i) => `k${i}`));
    const next = pruneSeenIdSet(s, 5, 3);
    expect(next.size).toBe(3);
    expect([...next]).toEqual(['k3', 'k4', 'k5']);
  });
});

describe('planContactShareEvent', () => {
  const base = {
    id: 'e1',
    from_user_id: 'u2',
    to_user_id: 'me',
    event_type: 'accepted' as const,
    created_at: new Date().toISOString(),
  };

  it('ignores events not for me', () => {
    const p = planContactShareEvent(base, 'other', { seenIds: new Set() });
    expect(p.ignore).toBe(true);
    expect(p.reason).toBe('not-for-me');
  });

  it('ignores duplicates', () => {
    const p = planContactShareEvent(base, 'me', { seenIds: new Set(['e1']) });
    expect(p.reason).toBe('duplicate');
  });

  it('accepted always loads contact shares; toast when live', () => {
    const p = planContactShareEvent(base, 'me', { seenIds: new Set() });
    expect(p.ignore).toBe(false);
    expect(p.loadContactShares).toBe(true);
    expect(p.notif).toEqual({ type: 'accepted', fromUserId: 'u2' });
  });

  it('accepted stale still loads shares but skips toast', () => {
    const staleAt = new Date(Date.now() - CONTACT_SHARE_EVENT_STALE_MS - 5_000).toISOString();
    const p = planContactShareEvent(
      { ...base, created_at: staleAt },
      'me',
      { seenIds: new Set(), nowMs: Date.now() },
    );
    expect(p.loadContactShares).toBe(true);
    expect(p.notif).toBeNull();
  });

  it('rejected live shows toast only', () => {
    const p = planContactShareEvent(
      { ...base, event_type: 'rejected' },
      'me',
      { seenIds: new Set() },
    );
    expect(p.loadContactShares).toBe(false);
    expect(p.notif).toEqual({ type: 'rejected', fromUserId: 'u2' });
  });
});
