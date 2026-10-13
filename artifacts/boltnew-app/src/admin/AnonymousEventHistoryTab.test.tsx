// @vitest-environment happy-dom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminApiJson } from './shared';
import { AnonymousEventHistoryTab } from './AnonymousEventHistoryTab';

vi.mock('./shared', () => ({ adminApiJson: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('anonymous event history administrator search', () => {
  it('shows privacy-safe per-event totals and filters by event start date', async () => {
    vi.mocked(adminApiJson).mockResolvedValue([
      { id: 'a', eventKey: '2026-10-12', archiveId: 'a', archiveLabel: 'BINPC2 익명행사 2026-10-12', participantCount: 2,
        heartCounts: { red: 1 }, directMessageCount: 1, groupMessageCount: 0, signalCount: 0, contactExchangeCount: 0 },
      { id: 'b', eventKey: '2026-10-13', archiveId: 'b', archiveLabel: 'BINPC2 익명행사 2026-10-13', participantCount: 3,
        heartCounts: { red: 2, rainbow: 1 }, directMessageCount: 4, groupMessageCount: 1, signalCount: 2, contactExchangeCount: 1,
        adminActions: {start:1,end:1,autoEnd:0,settings:2,lock:1,reset:1}, dbPersistErrorCount: null,
        rainbowByColor: {red:1,blue:0,pink:0,green:0}, uniqueHeartSenderCount: 2,uniqueHeartRecipientCount: 2,
        directChatRoomCount: 3,groupRoomCount: 1,groupParticipantCount: 10 },
    ]);
    render(<AnonymousEventHistoryTab />);
    expect(await screen.findByText('BINPC2 익명행사 2026-10-13')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox', { name: '행사 날짜 검색' }), { target: { value: '2026-10-13' } });
    expect(screen.queryByText('BINPC2 익명행사 2026-10-12')).toBeNull();
    expect(screen.getByText('BINPC2 익명행사 2026-10-13')).toBeTruthy();
    expect(screen.getByText(/참가자 3명/)).toBeTruthy();
    expect(screen.getByText(/DB 저장 오류 · 미확인/)).toBeTruthy();
    expect(screen.getByText(/관리자 작업 · 시작 1/)).toBeTruthy();
    expect(screen.getByText(/1:1 대화방 3개/)).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox', { name: '행사 날짜 검색' }), { target: { value: '2026-10-15' } });
    expect(screen.getByRole('status').textContent).toContain('일치하는 행사');
  });
});
