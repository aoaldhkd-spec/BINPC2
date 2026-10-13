// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { DisplayScaleControls } from '../components/DisplayScaleControls';
import { DISPLAY_SCALE_KEY, readDisplayScale } from '../lib/display-scale';
import { RegistrationConsentRows } from '../components/RegistrationConsentRows';
import { hasRequiredConsent, REGISTRATION_CONSENT_VERSION, type RegistrationConsent } from '../lib/registration-consent';
import { RainbowUnlockGuide } from '../components/RainbowUnlockGuide';
import { rainbowGuideKey } from '../lib/rainbow-guide';
import { NicknameSetupScreen } from '../components/NicknameSetupScreen';

vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn(() => ({ select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [], error: null }) })) } }));
beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); document.documentElement.style.removeProperty('--binpc-user-scale'); });

describe('compact display controls', () => {
  it('persists bounded enlargement, shrinks, and resets without navigation', () => {
    render(<DisplayScaleControls />);
    expect(screen.getByText('100%')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '글자 크게' }));
    expect(screen.getByText('105%')).toBeTruthy();
    expect(readDisplayScale()).toBe(1.05);
    fireEvent.click(screen.getByRole('button', { name: '글자 크게' }));
    expect((screen.getByRole('button', { name: '글자 크게' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '글자 기본 크기로' }));
    fireEvent.click(screen.getByRole('button', { name: '글자 작게' }));
    expect(localStorage.getItem(DISPLAY_SCALE_KEY)).toBe('0.95');
    expect((screen.getByRole('button', { name: '글자 작게' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
function ConsentDemo() {
  const [value, setValue] = useState<RegistrationConsent>({ collection: false, sharing: false, version: REGISTRATION_CONSENT_VERSION });
  return <><RegistrationConsentRows value={value} onChange={setValue}><label><input type="checkbox" />알림 선택</label></RegistrationConsentRows>
    <button disabled={!hasRequiredConsent(value)}>계속</button></>;
}
describe('explicit consent rows', () => {
  it('requires both choices, not notifications; revoking either blocks continuation', () => {
    render(<ConsentDemo />);
    const next = screen.getByRole('button', { name: '계속' }) as HTMLButtonElement;
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes).toHaveLength(3); expect(boxes.every(b => !b.checked)).toBe(true); expect(next.disabled).toBe(true);
    fireEvent.click(boxes[0]); expect(next.disabled).toBe(true);
    fireEvent.click(boxes[1]); expect(next.disabled).toBe(false); expect(boxes[2].checked).toBe(false);
    fireEvent.click(boxes[0]); expect(next.disabled).toBe(true);
  });
  it('one explicit tap accepts only required privacy terms and never preselects OS notifications', () => {
    render(<ConsentDemo />);
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes.every(x => !x.checked)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '필수 약관 모두 동의' }));
    expect(boxes[0].checked).toBe(true);
    expect(boxes[1].checked).toBe(true);
    expect(boxes[2].checked).toBe(false);
    expect((screen.getByRole('button', { name: '계속' }) as HTMLButtonElement).disabled).toBe(false);
  });
  it('viewing details does not grant consent and closes with Escape', () => {
    render(<ConsentDemo />);
    fireEvent.click(screen.getByRole('button', { name: '[필수] 개인정보 수집 및 이용 동의 내용 보기' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((screen.getAllByRole('checkbox')[0] as HTMLInputElement).checked).toBe(false);
  });
  it('real profile step 4 blocks next and places notification below both choices', () => {
    render(<NicknameSetupScreen onSubmit={vi.fn()} loading={false} onReset={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'INTJ' }));
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    fireEvent.click(screen.getByRole('button', { name: /엔터·사교·기타/ }));
    fireEvent.click(screen.getByRole('button', { name: '집콕' })); fireEvent.click(screen.getByRole('button', { name: '기타' }));
    fireEvent.click(screen.getByRole('button', { name: /다음/ })); fireEvent.click(screen.getByRole('button', { name: '올' }));
    const next = screen.getByRole('button', { name: /다음/ }) as HTMLButtonElement;
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes).toHaveLength(3); expect(next.disabled).toBe(true);
    fireEvent.click(boxes[0]); fireEvent.click(boxes[1]); expect(next.disabled).toBe(false);
    fireEvent.click(boxes[1]); expect(next.disabled).toBe(true);
    expect(boxes[2].getAttribute('aria-label')).toBe('하트·1:1 채팅 알림 받기 (선택)');
  });
});
describe('rainbow guide once per event and participant', () => {
  const now = new Date('2026-10-12T15:01:00Z');
  it('uses the 17:00 KST event boundary, not midnight', () => {
    expect(rainbowGuideKey('a', new Date('2026-10-12T14:59:00Z'))).toBe(rainbowGuideKey('a', now));
    expect(rainbowGuideKey('a', new Date('2026-10-13T08:00:00Z'))).not.toBe(rainbowGuideKey('a', now));
  });
  it('opens on unlock, dismisses persistently, and appears for another participant', () => {
    const { rerender } = render(<RainbowUnlockGuide userId="a" available={false} now={now} remaining={4} dark={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(<RainbowUnlockGuide userId="a" available now={now} remaining={4} dark={false} />);
    expect(screen.getByRole('dialog').textContent).toContain('현재 남은 무지개하트 4회');
    expect(screen.getByRole('dialog').textContent).toContain('일반과 무지개는 서로 다른 전송');
    fireEvent.click(screen.getByRole('button', { name: '확인했어요' })); expect(screen.queryByRole('dialog')).toBeNull();
    rerender(<RainbowUnlockGuide userId="a" available now={now} remaining={3} dark={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(<RainbowUnlockGuide userId="b" available now={now} remaining={4} dark />);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});
