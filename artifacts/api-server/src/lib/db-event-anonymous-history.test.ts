import { describe, expect, it } from 'vitest';
import { summarizeAnonymousEvent } from './db-event-anonymous-history.js';

describe('privacy-minimised event history', () => {
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
