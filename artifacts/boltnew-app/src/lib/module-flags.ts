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

export const MODULE_LABELS: Record<DetachableModuleId, string> = {
  hearts: '하트',
  direct_chat: '1:1 채팅',
  group_chat: '단체 채팅',
  contact_qr: '연락처 QR',
  stats: '통계',
  ranking: '랭킹',
  push: '모바일 알림',
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
      // all-on fallback keeps current product behavior
    }
  }
  return Object.fromEntries(
    DETACHABLE_MODULE_IDS.map((id) => [id, parseBool(obj[id], DEFAULT_MODULE_FLAGS[id])]),
  ) as ModuleFlags;
}

export function serializeModuleFlags(raw: unknown): string {
  return JSON.stringify(parseModuleFlags(raw));
}

export const CORE_MODULES = [
  { id: 'profiles', label: '프로필', detail: '참여자 기본 정보·카드' },
  { id: 'entry_qr', label: '접속 QR', detail: '행사 접속용 관리자 QR' },
  { id: 'realtime', label: '실시간 엔진', detail: 'SSE·재연결·정본 복구' },
  { id: 'admin', label: '관리자', detail: '운영·복구·현황판' },
  { id: 'daily_cycle', label: '자동운영', detail: '23/24/01/17 고정 주기' },
] as const;

export function moduleEnabled(flags: ModuleFlags, id: DetachableModuleId): boolean {
  return flags[id] !== false;
}
