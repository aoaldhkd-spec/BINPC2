/** Participant/admin view of app_settings.sulbun_event. Server owns timestamps. */

export const SULBUN_RESET_NOTICE =
  '⚠️ 현재 하트·채팅·이용 기록은 모임 시작일 기준 다음날 17:00까지 유지되며 이후 자동 초기화됩니다. 필요한 내용은 초기화 전에 확인해주세요.';

export type SulbunEventState = {
  cycle_id: string;
  opened_at: string;
  auto_reset_at: string;
  auto_reset_enabled: boolean;
  reset_done: boolean;
  reset_done_at?: string | null;
};

export function parseSulbunEvent(raw: unknown): SulbunEventState | null {
  let value = raw;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try { value = JSON.parse(trimmed); } catch { return null; }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  const cycleId = typeof o.cycle_id === 'string' ? o.cycle_id.trim() : '';
  const openedAt = typeof o.opened_at === 'string' ? o.opened_at : '';
  const autoResetAt = typeof o.auto_reset_at === 'string' ? o.auto_reset_at : '';
  if (!cycleId || !openedAt || !autoResetAt) return null;
  if (Number.isNaN(Date.parse(openedAt)) || Number.isNaN(Date.parse(autoResetAt))) return null;
  return {
    cycle_id: cycleId,
    opened_at: openedAt,
    auto_reset_at: autoResetAt,
    auto_reset_enabled: o.auto_reset_enabled === true,
    reset_done: o.reset_done === true,
    reset_done_at: typeof o.reset_done_at === 'string' ? o.reset_done_at : null,
  };
}

export function isSulbunEventActive(state: SulbunEventState | null | undefined): boolean {
  return Boolean(state && state.auto_reset_enabled && !state.reset_done);
}

export function sulbunResetNoticeText(state: SulbunEventState | null | undefined): string | null {
  return isSulbunEventActive(state) ? SULBUN_RESET_NOTICE : null;
}

export function formatSulbunResetLabel(autoResetAt: string): string {
  const dt = new Date(autoResetAt);
  if (Number.isNaN(dt.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(dt);
  const m = parts.find(p => p.type === 'month')?.value ?? '';
  const d = parts.find(p => p.type === 'day')?.value ?? '';
  return m && d ? `${Number(m)}/${Number(d)} 17:00` : '';
}
