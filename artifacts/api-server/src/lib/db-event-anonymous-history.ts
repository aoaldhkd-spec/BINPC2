/** Privacy-minimised event history. Never retain source profile IDs, names or message bodies. */
export type AnonymousEventHistory = {
  eventKey: string;
  participantCount: number;
  heartCounts: Record<string, number>;
  directMessageCount: number;
  groupMessageCount: number;
  signalCount: number;
  contactExchangeCount: number;
};

/** Aggregates are intentionally non-reversible: no mapping or original IDs persist. */
export function summarizeAnonymousEvent(input: {
  eventKey: string;
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
    participantCount: input.profiles.filter(p => String(p.id ?? '') !== String(input.adminProfileId ?? '')).length,
    heartCounts,
    directMessageCount: input.messages.length,
    groupMessageCount: input.groupMessages.length,
    signalCount: input.signals.length,
    contactExchangeCount: input.contactShares.length,
  };
}
