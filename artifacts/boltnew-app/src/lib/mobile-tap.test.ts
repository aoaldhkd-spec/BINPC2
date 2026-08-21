// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { bindMobileTap } from '../lib/mobile-tap';

describe('bindMobileTap', () => {
  it('routes touch via pointerup and mouse via click', () => {
    const handler = vi.fn();
    const { onClick, onPointerUp } = bindMobileTap(handler);

    onClick({ nativeEvent: { pointerType: 'touch' } } as never);
    expect(handler).not.toHaveBeenCalled();

    onPointerUp({ pointerType: 'touch', preventDefault: vi.fn() } as never);
    expect(handler).toHaveBeenCalledTimes(1);

    onClick({ nativeEvent: { pointerType: 'mouse' } } as never);
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
