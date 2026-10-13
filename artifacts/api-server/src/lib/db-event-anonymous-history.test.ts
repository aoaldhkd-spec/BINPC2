import { describe, expect, it } from 'vitest';
import { newAnonymousEventArchiveIdentity, summarizeAnonymousEvent } from './db-event-anonymous-history.js';

describe('privacy-minimised event history', () => {
  it('counts rainbow colours, unique senders, chat rooms and operations without raw personal data', () => {
    const result = summarizeAnonymousEvent({
      eventKey: '2026-10-13', adminProfileId: 'npc',
      profiles: [{ id: 'npc', nickname: 'operator' }, { id: 'private-account', nickname: 'secret-person' }],
      likes: [
        { liker_id: 'private-account', liked_id: 'npc', heart_type: 'red', like_source: 'rainbow' },
        { liker_id: 'private-account', liked_id: 'npc', heart_type: 'blue', like_source: 'grant' },
      ],
      messages: [{ content: 'secret dm' }],
      groupMessages: [{ content: 'secret group' }], signals: [{ sender_id: 'private-account' }],
      contactShares: [],
      chats: [{ id: 'secret-chat-room' }],
      groupChats: [{ id: 'secret-group-room' }],
      groupParticipants: [{ profile_id: 'private-account' }],
      adminActions: { start: 1, end: 1, autoEnd: 0, lock: 2, settings: 3 },
      dbPersistErrorCount: null,
      startedAt: '2026-10-13T18:00:00+09:00',
      archivedAt: '2026-10-14T17:00:00+09:00',
    });
    expect(result.rainbowByColor.red).toBe(1);
    expect(result.heartCounts.rainbow).toBe(1);
    expect(result.heartCounts.blue).toBe(1);
    expect(result.uniqueHeartSenderCount).toBe(1);
    expect(result.uniqueHeartRecipientCount).toBe(1);
    expect(result.directChatRoomCount).toBe(1);
    expect(result.groupRoomCount).toBe(1);
    expect(result.groupParticipantCount).toBe(1);
    expect(result.adminActions.lock).toBe(2);
    expect(result.adminActions.reset).toBe(1);
    expect(result.dbPersistErrorCount).toBeNull(); // unknown, never pretend 0
    const encoded = JSON.stringify(result);
    for (const privateValue of ['private-account','secret-person','secret-chat-room','secret-group-room','secret dm','secret group']) {
      expect(encoded).not.toContain(privateValue);
    }
  });

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

  it('never accepts an archive ID belonging to another event day', () => {
    const otherEvent = newAnonymousEventArchiveIdentity('2026-10-12');
    const result = summarizeAnonymousEvent({
      eventKey: '2026-10-13', eventArchiveId: otherEvent.archiveId,
      profiles: [], likes: [], messages: [], groupMessages: [],
      signals: [], contactShares: [],
    });
    expect(result.archiveId).not.toBe(otherEvent.archiveId);
    expect(result.archiveId).toMatch(/^binpc2:event-anon:v1:2026-10-13:/);
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
