// @vitest-environment happy-dom
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { HeartOpsCard } from './HeartOpsCard';
import { DEFAULT_HEART_OPS, parseHeartOps, serializeHeartOps } from '../lib/heart-ops';
import type { AppSettings } from './shared';

afterEach(() => {
  cleanup();
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
    expect((screen.getByLabelText('해금 시 3') as HTMLSelectElement).value).toBe('24');
    expect((screen.getByLabelText('해금 분 3') as HTMLSelectElement).value).toBe('0');
    expect((screen.getByLabelText('해금 시 4') as HTMLSelectElement).value).toBe('24');
    expect((screen.getByLabelText('해금 분 4') as HTMLSelectElement).value).toBe('30');

    fireEvent.click(screen.getByRole('button', { name: /스케줄 저장/ }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = parseHeartOps(payloads[0]);
    expect(saved.timezone).toBe('Asia/Seoul');
    expect(saved.version).toBe(2);
    expect(saved.slots).toHaveLength(4);
    expect(saved.slots.map(s => s.at)).toEqual(['23:15', '23:45', '24:00', '24:30']);
    expect(saved.slots.map(s => s.unlock)).toEqual(DEFAULT_HEART_OPS.slots.map(s => s.unlock));
  });
});
