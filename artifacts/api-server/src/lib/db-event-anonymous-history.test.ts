import { describe, expect, it } from 'vitest';
import { newAnonymousEventArchiveIdentity, summarizeAnonymousEvent } from './db-event-anonymous-history.js';

describe('privacy-minimised event history', () => {
  it('reuses the same archive ID for repeated snapshots of the same event', () => {
    const identity = newAnonymousEventArchiveIdentity('2026-10-13');
    const input = {
      eventKey: '2026-10-13', eventArchiveId: identity.archiveId,
      profiles: [], likes: [], messages: [], groupMessages: [],
      signals: [], contactShares: [],
    };
    const first = summarizeAnonymousEvent(input);
    const second = summarizeAnonymousEvent(input);
    expect(first.archiveId).toBe(identity.archiveId);
    expect(second.archiveId).toBe(identity.archiveId);
    expect(second.archiveLabel).toBe(first.archiveLabel);
  });

  it('generates unique namespaced IDs even for the same event date', () => {
    const first = newAnonymousEventArchiveIdentity('2026-10-13');
    const second = newAnonymousEventArchiveIdentity('2026-10-13');
    expect(first.archiveId).not.toBe(second.archiveId);
    expect(first.archiveId).toMatch(/^binpc2:event-anon:v1:2026-10-13:/);
    expect(first.archiveLabel).toContain('BINPC2 익명행사');
    expect(() => newAnonymousEventArchiveIdentity('private-name')).toThrow();
  });
  it('does not retain participants identifiers or private message contents', () => {
    const result = summarizeAnonymousEvent({
      eventKey: '2026-10-13', adminProfileId: 'owner',
      profiles: [{ id: 'owner', nickname: '범일NPC' }, { id: 'private-id', nickname: '민감한이름', phone_number: 'private-number' }],
      likes: [{ liker_id: 'private-id', liked_id: 'owner', heart_type: 'red', like_source: 'grant' }],
      messages: [{ content: 'secret message', sender_id: 'private-id' }],
      groupMessages: [], signals: [], contactShares: [],
    });
    expect(result.participantCount).toBe(1);
    expect(result.heartCounts.red).toBe(1);
    expect(result.directMessageCount).toBe(1);
    const text = JSON.stringify(result);
    for (const secret of ['private-id', '민감한이름', 'private-number', 'secret message']) expect(text).not.toContain(secret);
  });
});
