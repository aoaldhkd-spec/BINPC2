export interface WriteReference {
  table: 'profiles' | 'chats' | 'group_chats';
  id: string;
}

const REFERENCE_FIELDS: Record<string, Array<{ table: WriteReference['table']; field: string }>> = {
  likes: [
    { table: 'profiles', field: 'liker_id' },
    { table: 'profiles', field: 'liked_id' },
  ],
  profile_views: [
    { table: 'profiles', field: 'viewer_id' },
    { table: 'profiles', field: 'viewed_id' },
  ],
  signal_sends: [
    { table: 'profiles', field: 'sender_id' },
    { table: 'profiles', field: 'receiver_id' },
  ],
  contact_shares: [
    { table: 'profiles', field: 'liker_id' },
    { table: 'profiles', field: 'liked_id' },
  ],
  contact_share_events: [
    { table: 'profiles', field: 'from_user_id' },
    { table: 'profiles', field: 'to_user_id' },
  ],
  messages: [{ table: 'chats', field: 'chat_id' }],
  chat_reads: [{ table: 'chats', field: 'chat_id' }],
  group_messages: [{ table: 'group_chats', field: 'group_id' }],
  group_participants: [{ table: 'group_chats', field: 'group_id' }],
};

/** Pure relationship description used by the write path and unit tests. */
export function writeReferencesFor(
  sourceTable: string,
  row: Record<string, unknown>,
): WriteReference[] {
  const seen = new Set<string>();
  const refs: WriteReference[] = [];
  for (const spec of REFERENCE_FIELDS[sourceTable] ?? []) {
    const id = String(row[spec.field] ?? '');
    const key = `${spec.table}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ table: spec.table, id });
  }
  return refs;
}

export interface IntegrityDiagnostics {
  orphans: {
    messages: number;
    likes: number;
    signals: number;
    groupMessages: number;
  };
  scanned: {
    messages: number;
    likes: number;
    signals: number;
    groupMessages: number;
  };
  truncated: {
    messages: boolean;
    likes: boolean;
    signals: boolean;
    groupMessages: boolean;
  };
}

type IntegrityStore = Record<string, Record<string, unknown>[] | undefined>;

function bounded(
  rows: Record<string, unknown>[] | undefined,
  maxRows: number,
): { rows: Record<string, unknown>[]; truncated: boolean } {
  const source = rows ?? [];
  return { rows: source.slice(0, maxRows), truncated: source.length > maxRows };
}

/**
 * Bounded, report-only integrity scan. Its result contains aggregate numbers
 * and booleans only, so callers cannot accidentally log row content or PII.
 */
export function collectIntegrityDiagnostics(
  store: IntegrityStore,
  maxRowsPerTable = 20_000,
): IntegrityDiagnostics {
  const limit = Math.max(1, Math.floor(maxRowsPerTable));
  const profiles = new Set((store.profiles ?? []).map(row => String(row.id ?? '')).filter(Boolean));
  const chats = new Set((store.chats ?? []).map(row => String(row.id ?? '')).filter(Boolean));
  const groups = new Set((store.group_chats ?? []).map(row => String(row.id ?? '')).filter(Boolean));

  const messages = bounded(store.messages, limit);
  const likes = bounded(store.likes, limit);
  const signals = bounded(store.signal_sends, limit);
  const groupMessages = bounded(store.group_messages, limit);

  return {
    orphans: {
      messages: messages.rows.filter(row => !chats.has(String(row.chat_id ?? ''))).length,
      likes: likes.rows.filter(row =>
        !profiles.has(String(row.liker_id ?? '')) || !profiles.has(String(row.liked_id ?? '')),
      ).length,
      signals: signals.rows.filter(row =>
        !profiles.has(String(row.sender_id ?? '')) || !profiles.has(String(row.receiver_id ?? '')),
      ).length,
      groupMessages: groupMessages.rows.filter(row => !groups.has(String(row.group_id ?? ''))).length,
    },
    scanned: {
      messages: messages.rows.length,
      likes: likes.rows.length,
      signals: signals.rows.length,
      groupMessages: groupMessages.rows.length,
    },
    truncated: {
      messages: messages.truncated,
      likes: likes.truncated,
      signals: signals.truncated,
      groupMessages: groupMessages.truncated,
    },
  };
}
