import type { MouseEvent, PointerEvent, SyntheticEvent } from 'react';

/**
 * iOS Safari: taps inside scroll containers often miss synthetic click events.
 * Route touch via pointerup; keep click for mouse/keyboard.
 */
export function bindMobileTap(handler: (e: SyntheticEvent) => void): {
  onClick: (e: MouseEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
} {
  return {
    onClick: (e) => {
      if ((e.nativeEvent as globalThis.PointerEvent).pointerType === 'touch') return;
      handler(e);
    },
    onPointerUp: (e) => {
      if (e.pointerType !== 'touch') return;
      e.preventDefault();
      handler(e);
    },
  };
}
