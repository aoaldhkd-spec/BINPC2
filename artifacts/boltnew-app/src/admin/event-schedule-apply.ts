import type { HeartType } from '../lib/constants';
import { type EventScheduleSlot } from '../lib/event-schedule';

export type ScheduleSaveExtras = { functions_locked?: boolean };

export const EMPTY_EVENT_SLOT: EventScheduleSlot = {
  id: 'slot-1', at: '23:00', notice: '하트가 열렸어요!', functions_locked: false, heart_grants: {},
};

export type QuickNoticePreset = { id: string; label: string; text: string };

export const DEFAULT_QUICK_NOTICES: QuickNoticePreset[] = [
  { id: 'profile-only', label: '프로필·설정만', text: '지금은 프로필·설정만 이용할 수 있어요. 하트·채팅은 잠시 후 열립니다.' },
  { id: 'locked', label: '잠금 안내', text: '잠금 유지 중이에요. 안내된 시각에 하트·채팅이 열립니다.' },
  { id: 'soon', label: '5분 후 오픈', text: '5분 후 하트와 채팅을 이용할 수 있어요.' },
  { id: 'open', label: '하트·채팅 오픈', text: '하트·채팅이 열렸어요! 마음에 드는 상대에게 보내 보세요.' },
];

export const QUICK_NOTICE_STORAGE_KEY = 'admin_quick_notices_v1';
/** Legacy single-draft key — migrated into DIRECT_NOTICES_KEY, never broadcast. */
export const QUICK_NOTICE_DRAFT_KEY = 'admin_quick_notice_draft_v1';
/** Saved notice list only — never written into event_schedule / never broadcast. */
export const DIRECT_NOTICES_KEY = 'admin_direct_notices_v1';
export const DIRECT_NOTICE_TEXT_MAX = 240;
export const DIRECT_NOTICES_MAX = 30;
export const QUICK_NOTICE_EMPTY_HINT = '공지 내용을 입력해주세요.';

export type DirectNoticeItem = { id: string; text: string };

export function loadQuickNoticeDraft(raw: string | null): string {
  if (raw == null || raw === '') return '';
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'string') return parsed.slice(0, DIRECT_NOTICE_TEXT_MAX);
    return '';
  } catch {
    return raw.slice(0, DIRECT_NOTICE_TEXT_MAX);
  }
}

export function serializeQuickNoticeDraft(text: string): string {
  return JSON.stringify(text.slice(0, DIRECT_NOTICE_TEXT_MAX));
}

export function createDirectNoticeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `dn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createDirectNoticeItem(text = ''): DirectNoticeItem {
  return { id: createDirectNoticeId(), text: text.slice(0, DIRECT_NOTICE_TEXT_MAX) };
}

function parseDirectNoticeRow(row: unknown): DirectNoticeItem | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id.trim()) return null;
  if (typeof r.text !== 'string') return null;
  return { id: r.id, text: r.text.slice(0, DIRECT_NOTICE_TEXT_MAX) };
}

export function loadDirectNotices(raw: string | null, legacyDraft: string | null = null): DirectNoticeItem[] {
  if (raw != null && raw !== '') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const items: DirectNoticeItem[] = [];
        const seen = new Set<string>();
        for (const row of parsed) {
          const item = parseDirectNoticeRow(row);
          if (!item || seen.has(item.id)) continue;
          seen.add(item.id);
          items.push(item);
          if (items.length >= DIRECT_NOTICES_MAX) break;
        }
        return items;
      }
    } catch {
      /* fall through to legacy single draft */
    }
  }
  const draft = loadQuickNoticeDraft(legacyDraft);
  if (!draft) return [];
  return [{ id: 'migrated-draft', text: draft }];
}

export function serializeDirectNotices(items: DirectNoticeItem[]): string {
  return JSON.stringify(items.slice(0, DIRECT_NOTICES_MAX).map(n => ({
    id: n.id,
    text: n.text.slice(0, DIRECT_NOTICE_TEXT_MAX),
  })));
}

export function upsertDirectNotice(items: DirectNoticeItem[], id: string, text: string): DirectNoticeItem[] {
  return items.map(n => (n.id === id ? { ...n, text: text.slice(0, DIRECT_NOTICE_TEXT_MAX) } : { ...n }));
}

export function removeDirectNotice(items: DirectNoticeItem[], id: string): DirectNoticeItem[] {
  return items.filter(n => n.id !== id);
}

const HEART_TYPES_ORDER: HeartType[] = ['red', 'blue', 'pink', 'green'];
const AT_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function seoulNowHHMM(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
  const h = Number(parts.find(p => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find(p => p.type === 'minute')?.value ?? 0);
  return `${String(h === 24 ? 0 : h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Parse admin grant input. 0 if empty/invalid — never fall back to 4. */
export function parseHeartGrantAmount(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(100, n);
}

/** Immediate rainbow unlock patch: open functions, bump slot clock to now, grant shared pool. */
export function rainbowUnlockNowPatch(amount: number, now = new Date()): Partial<EventScheduleSlot> {
  const n = parseHeartGrantAmount(amount);
  return { at: seoulNowHHMM(now), functions_locked: false, ...(n > 0 ? { rainbow_pool: n } : {}) };
}

/** Add N more to a slot's existing rainbow_pool (admin "추가하는만큼"). */
export function nextRainbowPoolGrant(current: number | undefined, add: number): number {
  const cur = Math.max(0, Math.floor(Number(current) || 0));
  return Math.min(100, cur + parseHeartGrantAmount(add));
}

/** Apply slot now: bump clock + open functions (no pool change). */
export function applySlotNowPatch(now = new Date()): Partial<EventScheduleSlot> {
  return { at: seoulNowHHMM(now), functions_locked: false };
}

/** Time-only: never touches notice / pool. */
export function timeOnlyPatch(at: string): Partial<EventScheduleSlot> {
  return { at };
}

/** Notice-only: never touches at / pool / lock. */
export function noticeOnlyPatch(notice: string): Partial<EventScheduleSlot> {
  return { notice };
}

/** Hearts-only: add to pool and open functions; never touches notice / at. Secondary admin mode. */
export function heartsOnlyPatch(currentPool: number | undefined, add: number): Partial<EventScheduleSlot> {
  return { rainbow_pool: nextRainbowPoolGrant(currentPool, add), functions_locked: false };
}

/** Hearts-only overwrite: set pool to N (not add). Primary admin apply. */
export function heartsSetPatch(amount: number): Partial<EventScheduleSlot> {
  const n = parseHeartGrantAmount(amount);
  return { ...(n > 0 ? { rainbow_pool: n } : {}), functions_locked: false };
}

/** After SET, drop leftover rainbow_pool on sibling slots so quota is exactly N (not stuck at old 4). */
export function clearSiblingRainbowPools(slots: EventScheduleSlot[], keepId: string): EventScheduleSlot[] {
  return slots.map((slot) => {
    if (slot.id === keepId || slot.rainbow_pool == null) return slot;
    const { rainbow_pool: _drop, ...rest } = slot;
    return rest;
  });
}

/** SET rainbow_pool on the apply slot to N and clear other slots so remaining becomes N. */
export function applyRainbowPoolOverwrite(slots: EventScheduleSlot[], id: string, amount: number): EventScheduleSlot[] {
  const n = parseHeartGrantAmount(amount);
  const patched = applySlotPatch(slots, id, heartsSetPatch(n));
  return n > 0 ? clearSiblingRainbowPools(patched, id) : patched;
}

export function rainbowPoolApplyPreview(current: number | undefined, amount: unknown): {
  current: number;
  add: number;
  added: number;
  setTo: number;
} {
  const cur = Math.max(0, Math.floor(Number(current) || 0));
  const n = parseHeartGrantAmount(amount);
  return { current: cur, add: n, added: Math.min(100, cur + n), setTo: n };
}

export const TIME_ONLY_APPLY_HINT = '공지나 하트도 같이 넣는 게 좋아요';

export type SlotApplyPick = { time?: boolean; notice?: boolean; hearts?: boolean };

export type SlotApplyValues = {
  at: string;
  notice: string;
  currentPool?: number;
  addHearts: number;
  heartsMode?: 'add' | 'set';
  colorGrants?: Partial<Record<HeartType, number>>;
  currentColorGrants?: Partial<Record<HeartType, number>>;
};

/** Merge only the fields included in this apply. Omitted keys stay on the last-saved slot. */
export function selectedSlotApplyPatch(
  pick: SlotApplyPick,
  values: SlotApplyValues,
): Partial<EventScheduleSlot> {
  const patch: Partial<EventScheduleSlot> = {};
  if (pick.time) Object.assign(patch, timeOnlyPatch(values.at));
  if (pick.notice) Object.assign(patch, noticeOnlyPatch(values.notice));
  if (pick.hearts) {
    const addHearts = parseHeartGrantAmount(values.addHearts);
    if (addHearts > 0) {
      // Default SET (덮어쓰기). Additive +N is opt-in via heartsMode: 'add'.
      Object.assign(patch, values.heartsMode === 'add'
        ? heartsOnlyPatch(values.currentPool, addHearts)
        : heartsSetPatch(addHearts));
    }
    const colors = values.colorGrants ?? {};
    const colorKeys = (Object.keys(colors) as HeartType[]).filter(t => HEART_TYPES_ORDER.includes(t));
    if (colorKeys.length) {
      const merged: Partial<Record<HeartType, number>> = { ...(values.currentColorGrants ?? {}) };
      for (const t of colorKeys) {
        const n = Math.max(0, Math.min(20, Math.floor(Number(colors[t]) || 0)));
        if (n > 0) merged[t] = n;
        else delete merged[t];
      }
      patch.heart_grants = merged;
      patch.functions_locked = false;
    }
    if (addHearts > 0 || colorKeys.length) patch.functions_locked = false;
  }
  return patch;
}

export function selectedApplyCount(pick: SlotApplyPick): number {
  return Number(!!pick.time) + Number(!!pick.notice) + Number(!!pick.hearts);
}

/** Time-only is allowed; warn. Notice-only / hearts-only / 2–3 field applies do not warn. */
export function shouldWarnTimeOnlyApply(pick: SlotApplyPick): boolean {
  return selectedApplyCount(pick) === 1 && !!pick.time;
}

export function parseColorGrantsDraft(raw: Partial<Record<HeartType, string>>): Partial<Record<HeartType, number>> {
  const out: Partial<Record<HeartType, number>> = {};
  for (const t of HEART_TYPES_ORDER) {
    const text = String(raw[t] ?? '').trim();
    if (text === '') continue;
    const n = Math.floor(Number(text));
    if (!Number.isFinite(n) || n < 0) continue;
    out[t] = Math.min(20, n);
  }
  return out;
}

/** Derive which of 공지/시간/하트 were actually filled for this action. */
export function draftToApplyPick(draft: {
  at: string;
  notice: string;
  rainbowAmount: string;
  colorGrants: Partial<Record<HeartType, string>>;
}): SlotApplyPick {
  const colors = parseColorGrantsDraft(draft.colorGrants);
  return {
    time: AT_RE.test(draft.at.trim()),
    notice: draft.notice.trim().length > 0,
    hearts: parseHeartGrantAmount(draft.rainbowAmount) > 0 || Object.keys(colors).length > 0,
  };
}

export function applySlotPatch(slots: EventScheduleSlot[], id: string, patch: Partial<EventScheduleSlot>): EventScheduleSlot[] {
  return slots.map(s => s.id === id ? { ...s, ...patch } : s);
}

/** Persist only the chosen field onto last-saved slots so dirty sibling edits are not broadcast. */
export function applySavedFieldPatch(
  saved: EventScheduleSlot[],
  local: EventScheduleSlot[],
  id: string,
  patch: Partial<EventScheduleSlot>,
): EventScheduleSlot[] {
  const base = saved.some(s => s.id === id) ? saved : local;
  return applySlotPatch(base, id, patch);
}

export function loadQuickNotices(raw: string | null): QuickNoticePreset[] {
  if (!raw) return DEFAULT_QUICK_NOTICES.map(p => ({ ...p }));
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_QUICK_NOTICES.map(p => ({ ...p }));
    const byId = new Map<string, QuickNoticePreset>();
    for (const row of parsed) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      if (typeof r.id !== 'string' || typeof r.text !== 'string') continue;
      byId.set(r.id, {
        id: r.id,
        label: typeof r.label === 'string' && r.label.trim() ? r.label.trim().slice(0, 24) : r.id,
        text: r.text.slice(0, 240),
      });
    }
    return DEFAULT_QUICK_NOTICES.map(def => byId.get(def.id) ? { ...def, ...byId.get(def.id), id: def.id, label: byId.get(def.id)!.label || def.label } : { ...def });
  } catch {
    return DEFAULT_QUICK_NOTICES.map(p => ({ ...p }));
  }
}
