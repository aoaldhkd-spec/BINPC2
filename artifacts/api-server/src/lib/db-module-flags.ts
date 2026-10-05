/**
 * Soft-detach feature flags for BINPC2.
 * Core engine (profiles/realtime/admin/daily cycle) always stays on.
 */
export const DETACHABLE_MODULE_IDS = [
  'hearts',
  'direct_chat',
  'group_chat',
  'contact_qr',
  'stats',
  'ranking',
  'push',
] as const;

export type DetachableModuleId = (typeof DETACHABLE_MODULE_IDS)[number];
export type ModuleFlags = Record<DetachableModuleId, boolean>;

export const DEFAULT_MODULE_FLAGS: ModuleFlags = {
  hearts: true,
  direct_chat: true,
  group_chat: true,
  contact_qr: true,
  stats: true,
  ranking: true,
  push: true,
};

function parseBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v;
  if (v === 1 || v === '1' || v === 'true') return true;
  if (v === 0 || v === '0' || v === 'false') return false;
  return fallback;
}

export function parseModuleFlags(raw: unknown): ModuleFlags {
  let obj: Record<string, unknown> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    obj = raw as Record<string, unknown>;
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) obj = parsed;
    } catch {
      // malformed legacy/user payload falls back to all-on for non-regression
    }
  }
  return Object.fromEntries(
    DETACHABLE_MODULE_IDS.map((id) => [id, parseBool(obj[id], DEFAULT_MODULE_FLAGS[id])]),
  ) as ModuleFlags;
}

export function serializeModuleFlags(raw: unknown): string {
  return JSON.stringify(parseModuleFlags(raw));
}

export function moduleEnabled(raw: unknown, id: DetachableModuleId): boolean {
  return parseModuleFlags(raw)[id];
}

export type ModuleWriteGate =
  | { allowed: true }
  | { allowed: false; module: DetachableModuleId; code: 'MODULE_DISABLED'; message: string };

const TABLE_MODULE: Readonly<Record<string, DetachableModuleId>> = {
  likes: 'hearts',
  contact_shares: 'hearts',
  chats: 'direct_chat',
  messages: 'direct_chat',
  chat_reads: 'direct_chat',
  group_chats: 'group_chat',
  group_messages: 'group_chat',
  group_participants: 'group_chat',
};

const MODULE_LABELS: Record<DetachableModuleId, string> = {
  hearts: '하트',
  direct_chat: '1:1 채팅',
  group_chat: '단체 채팅',
  contact_qr: '연락처 QR',
  stats: '통계',
  ranking: '랭킹',
  push: '모바일 알림',
};

export function moduleWriteGate(table: string, rawFlags: unknown): ModuleWriteGate {
  const id = TABLE_MODULE[table];
  if (!id || moduleEnabled(rawFlags, id)) return { allowed: true };
  return {
    allowed: false,
    module: id,
    code: 'MODULE_DISABLED',
    message: `${MODULE_LABELS[id]} 기능이 현재 꺼져 있습니다.`,
  };
}
