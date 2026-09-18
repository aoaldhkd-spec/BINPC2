// @vitest-environment happy-dom
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { HeartOpsCard } from './HeartOpsCard';
import { DEFAULT_HEART_OPS, parseHeartOps, serializeHeartOps } from '../lib/heart-ops';
import { loadQuickNoticeDraft, QUICK_NOTICE_DRAFT_KEY } from './event-schedule-apply';
import type { AppSettings } from './shared';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.localStorage.clear();
});

beforeEach(() => {
  window.localStorage.clear();
});

function settingsWith(slots = DEFAULT_HEART_OPS.slots): AppSettings {
  return {
    event_schedule: serializeHeartOps({ ...DEFAULT_HEART_OPS, slots: slots.map(s => ({ ...s, unlock: [...s.unlock] })) }),
  } as AppSettings;
}

describe('HeartOpsCard schedule clock', () => {
  it('edits hour and minute separately, including 24:xx, without dropping other slots', async () => {
    const payloads: string[] = [];
    const onSave = vi.fn(async (raw: string) => { payloads.push(raw); });
    render(<HeartOpsCard settings={settingsWith()} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText('해금 분 1'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('해금 분 2'), { target: { value: '45' } });
    expect((screen.getByLabelText('해금 시 3') as HTMLInputElement).value).toBe('24');
    expect((screen.getByLabelText('해금 분 3') as HTMLInputElement).value).toBe('00');
    expect((screen.getByLabelText('해금 시 4') as HTMLInputElement).value).toBe('24');
    expect((screen.getByLabelText('해금 분 4') as HTMLInputElement).value).toBe('30');

    fireEvent.click(screen.getByRole('button', { name: /스케줄 저장/ }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = parseHeartOps(payloads[0]);
    expect(saved.timezone).toBe('Asia/Seoul');
    expect(saved.version).toBe(2);
    expect(saved.slots).toHaveLength(4);
    expect(saved.slots.map(s => s.at)).toEqual(['23:15', '23:45', '24:00', '24:30']);
    expect(saved.slots.map(s => s.unlock)).toEqual(DEFAULT_HEART_OPS.slots.map(s => s.unlock));
  });

  it('해금 초기화 confirms then relocks five types without wiping slots', async () => {
    const payloads: string[] = [];
    const onSave = vi.fn(async (raw: string) => { payloads.push(raw); });
    const settings = {
      event_schedule: serializeHeartOps({
        ...DEFAULT_HEART_OPS,
        instant_unlock: ['rainbow'],
      }),
    } as AppSettings;
    render(<HeartOpsCard settings={settings} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: '해금 초기화' }));
    expect(screen.getByText('5종 하트를 다시 미해금 상태로 돌립니다.', { exact: false })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = parseHeartOps(payloads[0]);
    expect(saved.slots).toHaveLength(4);
    expect(saved.slots.map(s => s.at)).toEqual(DEFAULT_HEART_OPS.slots.map(s => s.at));
    expect(saved.slots.map(s => s.unlock)).toEqual(DEFAULT_HEART_OPS.slots.map(s => s.unlock));
    expect(saved.instant_unlock ?? []).toEqual([]);
    expect(saved.auto_unlock_from).toEqual(expect.any(Number));
  });

  it('quick notice save and put stay separate, and empty put is blocked', async () => {
    const payloads: string[] = [];
    const onSave = vi.fn(async (raw: string) => { payloads.push(raw); });
    render(<HeartOpsCard settings={settingsWith()} onSave={onSave} />);
    const box = screen.getByLabelText('빠른 공지') as HTMLTextAreaElement;
    expect(box.value).toBe('');
    expect(box.className).toContain('resize-y');

    fireEvent.click(screen.getByRole('button', { name: '넣기' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('공지 내용을 입력해주세요.')).toBeTruthy();

    fireEvent.change(box, { target: { value: '저장된 문구' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(loadQuickNoticeDraft(window.localStorage.getItem(QUICK_NOTICE_DRAFT_KEY))).toBe('저장된 문구');

    fireEvent.change(box, { target: { value: '10분 뒤 무지개하트가 열립니다.' } });
    fireEvent.click(screen.getByRole('button', { name: '넣기' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(parseHeartOps(payloads[0]).direct_notice).toBe('10분 뒤 무지개하트가 열립니다.');
    expect(loadQuickNoticeDraft(window.localStorage.getItem(QUICK_NOTICE_DRAFT_KEY))).toBe('저장된 문구');
  });
});
