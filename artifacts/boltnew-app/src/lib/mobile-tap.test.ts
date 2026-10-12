// @vitest-environment happy-dom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { bindMobileTap } from './mobile-tap';

afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });
function fixture() {
  const wrapper = document.createElement('div'); const button = document.createElement('button');
  wrapper.append(button); document.body.append(wrapper);
  const handler = vi.fn(); const tap = bindMobileTap(handler);
  const event = (more: Record<string, unknown> = {}) => ({ currentTarget: button, pointerType: 'touch',
    pointerId: 1, isPrimary: true, clientX: 20, clientY: 30, preventDefault: vi.fn(), ...more }) as never;
  return { tap, handler, event, button, wrapper };
}
describe('bindMobileTap: scroll never opens a profile', () => {
  it('routes actual touch via pointerup and suppresses its synthetic click', () => {
    const { tap, event, handler } = fixture();
    tap.onPointerDown(event()); tap.onPointerUp(event());
    tap.onClick(event({ detail: 1, nativeEvent: {} }));
    expect(handler).toHaveBeenCalledTimes(1);
    tap.onPointerDown(event({ pointerType: 'mouse' }));
    tap.onClick(event({ detail: 1, nativeEvent: { pointerType: 'mouse' } }));
    expect(handler).toHaveBeenCalledTimes(2);
  });
  it('never opens on a naked touch pointerup or native touch click', () => {
    const { tap, event, handler } = fixture();
    tap.onPointerUp(event()); tap.onClick(event({ nativeEvent: { pointerType: 'touch' } }));
    expect(handler).not.toHaveBeenCalled();
  });
  it('allows a small finger wobble but rejects scroll, even after return to start', () => {
    const { tap, event, handler } = fixture();
    tap.onPointerDown(event()); tap.onPointerMove(event({ clientY: 80 })); tap.onPointerUp(event());
    tap.onClick(event({ nativeEvent: {}, detail: 1 }));
    expect(handler).not.toHaveBeenCalled();
    tap.onPointerDown(event()); tap.onPointerUp(event({ clientX: 23, clientY: 34 }));
    expect(handler).toHaveBeenCalledOnce();
  });
  it('detects an ancestor scrolling even if the finger coordinates do not change', () => {
    const { tap, event, handler, wrapper } = fixture();
    tap.onPointerDown(event()); wrapper.scrollTop = 100; tap.onPointerUp(event());
    expect(handler).not.toHaveBeenCalled();
  });
  it('cancels on pointercancel, secondary pointer and wrong pointer id', () => {
    const { tap, event, handler } = fixture();
    tap.onPointerDown(event()); tap.onPointerCancel(event()); tap.onPointerUp(event());
    tap.onPointerDown(event({ isPrimary: false })); tap.onPointerUp(event());
    tap.onPointerDown(event()); tap.onPointerUp(event({ pointerId: 2 }));
    expect(handler).not.toHaveBeenCalled();
  });
  it('rejects long press; keeps keyboard click activation', () => {
    vi.useFakeTimers(); const { tap, event, handler } = fixture();
    tap.onPointerDown(event()); vi.advanceTimersByTime(700); tap.onPointerUp(event());
    expect(handler).not.toHaveBeenCalled();
    tap.onClick(event({ nativeEvent: {}, detail: 0 }));
    expect(handler).toHaveBeenCalledOnce();
  });
  it('remembers scroll across React render callbacks sharing the same element', () => {
    const { tap, event, handler } = fixture();
    tap.onPointerDown(event()); tap.onPointerMove(event({ clientX: 40 }));
    bindMobileTap(handler).onPointerUp(event());
    expect(handler).not.toHaveBeenCalled();
  });
});
