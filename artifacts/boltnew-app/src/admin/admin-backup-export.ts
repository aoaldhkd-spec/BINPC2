import { adminApiSelect } from './shared';

const BACKUP_TABLES = [
  'profiles',
  'likes',
  'chats',
  'messages',
  'chat_reads',
  'app_settings',
  'session_history',
  'contact_shares',
  'contact_share_events',
  'anonymous_reports',
  'notifications',
  'group_chats',
  'group_participants',
  'group_messages',
  'blocked_users',
  'profile_views',
  'user_signals',
  'signal_sends',
] as const;

const REDACT_SETTINGS_KEYS = new Set([
  'admin_password',
  'test_password',
  'entry_password',
  'reset_password',
]);

const TABLE_LIMITS: Partial<Record<(typeof BACKUP_TABLES)[number], number>> = {
  messages: 5_000,
  group_messages: 1_000,
  likes: 10_000,
  signal_sends: 1_000,
  profile_views: 5_000,
};

function kstFileStamp(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}${get('month')}${get('day')}-${get('hour')}${get('minute')}${get('second')}`;
}

function redactSettingsRows(rows: unknown[]): unknown[] {
  return rows.map((row) => {
    if (!row || typeof row !== 'object') return row;
    const copy = { ...(row as Record<string, unknown>) };
    for (const key of REDACT_SETTINGS_KEYS) {
      if (key in copy) copy[key] = '[REDACTED]';
    }
    return copy;
  });
}

/** Admin DB snapshot → JSON file download (passwords redacted). */
export async function downloadAdminDataBackup(): Promise<{ ok: true; tables: number } | { ok: false; error: string }> {
  const tables: Record<string, unknown[]> = {};

  for (const table of BACKUP_TABLES) {
    const limit = TABLE_LIMITS[table];
    const orderBy = limit != null ? [{ column: 'created_at', ascending: false }] : undefined;
    const { data } = await adminApiSelect<Record<string, unknown>>(table, orderBy, limit);
    if (data == null) {
      return { ok: false, error: `${table} 테이블을 불러오지 못했습니다.` };
    }
    tables[table] = table === 'app_settings' ? redactSettingsRows(data) : data;
  }

  const bundle = {
    kind: 'binpc2-admin-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    tables,
  };

  const json = JSON.stringify(bundle, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `binpc2-data-backup-${kstFileStamp()}.json`;
  a.click();
  URL.revokeObjectURL(url);

  return { ok: true, tables: BACKUP_TABLES.length };
}
