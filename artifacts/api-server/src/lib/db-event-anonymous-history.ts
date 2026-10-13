import { randomUUID } from 'node:crypto';
/** Privacy-minimised event history. Never retain source profile IDs, names or message bodies. */
export type AnonymousEventHistory = {
  eventKey: string;
  archiveId: string;
  archiveLabel: string;
  participantCount: number;
  heartCounts: Record<string, number>;
  directMessageCount: number;
  groupMessageCount: number;
  signalCount: number;
  contactExchangeCount: number;
};

/** Namespace + unique UUID: never use a nickname or date alone as an archive key. */
export function newAnonymousEventArchiveIdentity(eventKey: string): { archiveId: string; archiveLabel: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventKey)) throw new Error('Invalid event date');
  const archiveId = `binpc2:event-anon:v1:${eventKey}:${randomUUID()}`;
  return { archiveId, archiveLabel: `BINPC2 익명행사 ${eventKey} · ${archiveId.slice(-8)}` };
}

/** Aggregates are intentionally non-reversible: no mapping or original IDs persist. */
export function summarizeAnonymousEvent(input: {
  eventKey: string;
  eventArchiveId?: string;
  profiles: Record<string, unknown>[];
  likes: Record<string, unknown>[];
  messages: Record<string, unknown>[];
  groupMessages: Record<string, unknown>[];
  signals: Record<string, unknown>[];
  contactShares: Record<string, unknown>[];
  adminProfileId?: string;
}): AnonymousEventHistory {
  const heartCounts: Record<string, number> = { red: 0, blue: 0, pink: 0, green: 0, rainbow: 0 };
  for (const row of input.likes) {
    const kind = row.like_source === 'rainbow' ? 'rainbow' : String(row.heart_type ?? '');
    if (Object.prototype.hasOwnProperty.call(heartCounts, kind)) heartCounts[kind]++;
  }
  return {
    eventKey: input.eventKey,
    ...(input.eventArchiveId && input.eventArchiveId.startsWith(`binpc2:event-anon:v1:${input.eventKey}:`)
      && /^binpc2:event-anon:v1:\d{4}-\d{2}-\d{2}:[a-f0-9-]{36}$/.test(input.eventArchiveId)
      ? { archiveId: input.eventArchiveId, archiveLabel: `BINPC2 익명행사 ${input.eventKey} · ${input.eventArchiveId.slice(-8)}` }
      : newAnonymousEventArchiveIdentity(input.eventKey)),
    participantCount: input.profiles.filter(p => String(p.id ?? '') !== String(input.adminProfileId ?? '')).length,
    heartCounts,
    directMessageCount: input.messages.length,
    groupMessageCount: input.groupMessages.length,
    signalCount: input.signals.length,
    contactExchangeCount: input.contactShares.length,
  };
}
