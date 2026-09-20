import { describe, expect, it } from 'vitest';
import {
  formatSulbunResetLabel,
  isSulbunEventActive,
  parseSulbunEvent,
  SULBUN_RESET_NOTICE,
  sulbunResetNoticeText,
} from './sulbun-event';

describe('sulbun-event client view', () => {
  const active = {
    cycle_id: 'c1',
    opened_at: '2026-09-20T13:00:00.000Z',
    auto_reset_at: '2026-09-21T08:00:00.000Z',
    auto_reset_enabled: true,
    reset_done: false,
    reset_done_at: null,
  };

  it('shows notice only while the cycle is active', () => {
    expect(sulbunResetNoticeText(active)).toBe(SULBUN_RESET_NOTICE);
    expect(sulbunResetNoticeText({ ...active, reset_done: true, auto_reset_enabled: false })).toBeNull();
    expect(sulbunResetNoticeText(null)).toBeNull();
    expect(isSulbunEventActive(parseSulbunEvent(JSON.stringify(active)))).toBe(true);
  });

  it('formats Seoul auto-reset as M/D 17:00', () => {
    expect(formatSulbunResetLabel('2026-09-21T08:00:00.000Z')).toBe('9/21 17:00');
  });
});
