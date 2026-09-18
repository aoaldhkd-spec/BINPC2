// @vitest-environment happy-dom
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { HeartOpsCard } from './HeartOpsCard';
import { DEFAULT_HEART_OPS, parseHeartOps, serializeHeartOps, unlockedHeartKeys } from '../lib/heart-ops';
import {
  DIRECT_NOTICES_KEY,
  loadDirectNotices,
  serializeDirectNotices,
} from './event-schedule-apply';
import type { AppSettings } from './shared';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.localStorage.clear();
});

beforeEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

function settingsWith(slots = DEFAULT_HEART_OPS.slots): AppSettings {
  return {
    event_schedule: serializeHeartOps({ ...DEFAULT_HEART_OPS, slots: slots.map(s => ({ ...s, unlock: [...s.unlock] })) }),
  } as AppSettings;
}

describe('HeartOpsCard schedule clock', () => {
  it('edits hour and minute separately, including 24:xx, without dropping other hearts', async () => {
    const payloads: string[] = [];
    const onSave = vi.fn(async (raw: string) => { payloads.push(raw); });
    render(<HeartOpsCard settings={settingsWith()} onSave={onSave} onSaveNotices={vi.fn(async () => {})} />);

    fireEvent.change(screen.getByLabelText('호감 해금 분'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('친구 해금 분'), { target: { value: '45' } });
    expect((screen.getByLabelText('뜨밤 해금 시') as HTMLInputElement).value).toBe('24');
    expect((screen.getByLabelText('뜨밤 해금 분') as HTMLInputElement).value).toBe('00');
    expect((screen.getByLabelText('칭찬 해금 시') as HTMLInputElement).value).toBe('24');
    expect((screen.getByLabelText('무지개 해금 시') as HTMLInputElement).value).toBe('24');
    expect((screen.getByLabelText('무지개 해금 분') as HTMLInputElement).value).toBe('30');

    fireEvent.click(screen.getByRole('button', { name: /스케줄 저장/ }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = parseHeartOps(payloads[0]);
    expect(saved.timezone).toBe('Asia/Seoul');
    expect(saved.version).toBe(2);
    expect(saved.slots).toHaveLength(5);
    expect(saved.slots.find(s => s.unlock.includes('red'))?.at).toBe('23:15');
    expect(saved.slots.find(s => s.unlock.includes('blue'))?.at).toBe('23:45');
    expect(saved.slots.find(s => s.unlock.includes('pink'))?.at).toBe('24:00');
    expect(saved.slots.find(s => s.unlock.includes('green'))?.at).toBe('24:00');
    expect(saved.slots.find(s => s.unlock.includes('rainbow'))?.at).toBe('24:30');
  });

  it('saves independent notice clocks and per-heart 공지/해금 checks', async () => {
    const payloads: string[] = [];
    const onSave = vi.fn(async (raw: string) => { payloads.push(raw); });
    render(<HeartOpsCard settings={settingsWith()} onSave={onSave} onSaveNotices={vi.fn(async () => {})} />);

    expect((screen.getByLabelText('호감 공지') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText('호감 해금') as HTMLInputElement).checked).toBe(true);

    fireEvent.change(screen.getByLabelText('호감 공지 분'), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText('호감 해금 분'), { target: { value: '15' } });
    expect((screen.getByLabelText('호감 공지 분') as HTMLInputElement).value).toBe('40');
    expect((screen.getByLabelText('호감 해금 분') as HTMLInputElement).value).toBe('15');
    expect((screen.getByLabelText('친구 해금 분') as HTMLInputElement).value).toBe('30');

    fireEvent.click(screen.getByLabelText('호감 공지'));
    fireEvent.click(screen.getByRole('button', { name: /스케줄 저장/ }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = parseHeartOps(payloads[0]);
    const red = saved.slots.find(s => s.unlock.includes('red'));
    expect(red?.notice_at).toBe('23:40');
    expect(red?.at).toBe('23:15');
    expect(red?.show_notice).toBe(true);
    expect(saved.slots.find(s => s.unlock.includes('blue'))?.unlock).toEqual(['blue']);
  });

  it('해금 체크 off keeps the heart locked after its unlock time', async () => {
    const payloads: string[] = [];
    const onSave = vi.fn(async (raw: string) => { payloads.push(raw); });
    render(<HeartOpsCard settings={settingsWith()} onSave={onSave} onSaveNotices={vi.fn(async () => {})} />);
    fireEvent.click(screen.getByLabelText('호감 해금'));
    fireEvent.click(screen.getByRole('button', { name: /스케줄 저장/ }));
    const saved = parseHeartOps(payloads[0]);
    expect(saved.slots.find(s => s.id === 'slot-red')?.unlock ?? []).toEqual([]);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-17T23:05:00+09:00'));
    expect(unlockedHeartKeys(saved).has('red')).toBe(false);
    expect(unlockedHeartKeys(saved).has('blue')).toBe(false);
    vi.useRealTimers();
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
    render(<HeartOpsCard settings={settings} onSave={onSave} onSaveNotices={vi.fn(async () => {})} />);
    fireEvent.click(screen.getByRole('button', { name: '해금 초기화' }));
    expect(screen.getByText('5종 하트를 다시 미해금 상태로 돌립니다.', { exact: false })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = parseHeartOps(payloads[0]);
    expect(saved.slots).toHaveLength(5);
    expect(saved.slots.map(s => s.unlock).flat().sort()).toEqual(['blue', 'green', 'pink', 'rainbow', 'red']);
    expect(saved.instant_unlock ?? []).toEqual([]);
    expect(saved.auto_unlock_from).toEqual(expect.any(Number));
  });

  it('manages multiple direct notices with isolated save, put, and delete', async () => {
    const payloads: string[] = [];
    const noticePayloads: string[] = [];
    const onSave = vi.fn(async (raw: string) => { payloads.push(raw); });
    const onSaveNotices = vi.fn(async (raw: string) => { noticePayloads.push(raw); });
    render(<HeartOpsCard settings={settingsWith()} onSave={onSave} onSaveNotices={onSaveNotices} />);

    fireEvent.click(screen.getByRole('button', { name: '+ 공지 추가' }));
    fireEvent.click(screen.getByRole('button', { name: '+ 공지 추가' }));
    fireEvent.click(screen.getByRole('button', { name: '+ 공지 추가' }));
    const first = screen.getByLabelText('직접 공지 1') as HTMLTextAreaElement;
    const second = screen.getByLabelText('직접 공지 2') as HTMLTextAreaElement;
    const third = screen.getByLabelText('직접 공지 3') as HTMLTextAreaElement;
    expect(first.value).toBe('');
    expect(Number(first.rows)).toBe(2);
    expect(first.className).toContain('resize-y');
    expect(first.className).toContain('min-h-[2.25rem]');

    fireEvent.click(screen.getByRole('button', { name: '공지 1 넣기' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('공지 내용을 입력해주세요.')).toBeTruthy();
    fireEvent.change(first, { target: { value: '  \n  ' } });
    fireEvent.click(screen.getByRole('button', { name: '공지 1 넣기' }));
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.change(first, { target: { value: '잠시 후 하트 이벤트가 시작됩니다.' } });
    fireEvent.change(second, { target: { value: '자리 이동해주세요.' } });
    fireEvent.change(third, { target: { value: '잠시 후 무지개하트가 열립니다.' } });
    fireEvent.click(screen.getByRole('button', { name: '공지 1 저장' }));
    fireEvent.click(screen.getByRole('button', { name: '공지 2 저장' }));
    fireEvent.click(screen.getByRole('button', { name: '공지 3 저장' }));
    expect(onSave).not.toHaveBeenCalled();
    await waitFor(() => expect(onSaveNotices).toHaveBeenCalled());
    expect(loadDirectNotices(noticePayloads.at(-1) ?? null).map(n => n.text)).toEqual([
      '잠시 후 하트 이벤트가 시작됩니다.',
      '자리 이동해주세요.',
      '잠시 후 무지개하트가 열립니다.',
    ]);
    expect(window.localStorage.getItem(DIRECT_NOTICES_KEY)).toBeNull();

    fireEvent.change(first, { target: { value: '10분 뒤 무지개하트가 열립니다.' } });
    fireEvent.click(screen.getByRole('button', { name: '공지 1 넣기' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(parseHeartOps(payloads[0]).direct_notice).toBe('10분 뒤 무지개하트가 열립니다.');
    expect(parseHeartOps(payloads[0]).slots).toHaveLength(5);
    expect(loadDirectNotices(noticePayloads.at(-1) ?? null).map(n => n.text)).toEqual([
      '잠시 후 하트 이벤트가 시작됩니다.',
      '자리 이동해주세요.',
      '잠시 후 무지개하트가 열립니다.',
    ]);

    fireEvent.click(screen.getByRole('button', { name: '공지 2 삭제' }));
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(screen.queryByLabelText('직접 공지 3')).toBeNull();
    await waitFor(() => expect(loadDirectNotices(noticePayloads.at(-1) ?? null).map(n => n.text)).toEqual([
      '잠시 후 하트 이벤트가 시작됩니다.',
      '잠시 후 무지개하트가 열립니다.',
    ]));
    expect(onSave).toHaveBeenCalledTimes(1);
  }, 15_000);

  it('migrates localStorage drafts once then uses server presets', async () => {
    window.localStorage.setItem(DIRECT_NOTICES_KEY, serializeDirectNotices([
      { id: 'a', text: '자리 이동해주세요.' },
    ]));
    const noticePayloads: string[] = [];
    const onSaveNotices = vi.fn(async (raw: string) => { noticePayloads.push(raw); });
    const { rerender } = render(
      <HeartOpsCard settings={settingsWith()} onSave={vi.fn(async () => {})} onSaveNotices={onSaveNotices} />,
    );
    await waitFor(() => expect(onSaveNotices).toHaveBeenCalledTimes(1));
    expect(loadDirectNotices(noticePayloads[0]).map(n => n.text)).toEqual(['자리 이동해주세요.']);
    await waitFor(() => expect(window.localStorage.getItem(DIRECT_NOTICES_KEY)).toBeNull());

    rerender(
      <HeartOpsCard
        settings={{ ...settingsWith(), direct_notice_presets: noticePayloads[0] }}
        onSave={vi.fn(async () => {})}
        onSaveNotices={onSaveNotices}
      />,
    );
    expect((screen.getByLabelText('직접 공지 1') as HTMLTextAreaElement).value).toBe('자리 이동해주세요.');
    expect(onSaveNotices).toHaveBeenCalledTimes(1);
  });
});
